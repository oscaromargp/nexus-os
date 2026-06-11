// Nexus OS — Agente conversacional con tool use
//
// POST /api/agent
//   { user_id, platform, external_chat_id, message }
//
// Implementa loop de tool use con Gemini 2.0 Flash (free tier 1500 req/día).
// Memoria conversacional persistente en chat_sessions + chat_messages.
//
// Tier 2: lectura + escritura segura. Sin acciones destructivas (no delete).
//
// Auth: header X-Nexus-Service-Secret (compartido con bot Telegram).

import { createClient } from '@supabase/supabase-js'

const GEMINI_KEY = process.env.GEMINI_API_KEY
const GROQ_KEY   = process.env.GROQ_API_KEY  // fallback (opcional)
const SERVICE_SECRET = process.env.NEXUS_WEBHOOK_SECRET
const MAX_TOOL_ITERATIONS = 8
const HISTORY_WINDOW = 20

function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

// ════════════════════════════════════════════════════════════════════
// TOOLS (Tier 2: lectura + escritura segura)
// ════════════════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: 'search_properties',
    description: 'Busca inmuebles del usuario en su CRM. Filtra por estado, municipio, tipo, operación (venta/renta), rango de precio, o texto libre que se busca en título y folio.',
    parameters: {
      type: 'object',
      properties: {
        text:          { type: 'string', description: 'Texto a buscar en título o folio' },
        municipio:     { type: 'string' },
        tipo:          { type: 'string', enum: ['casa','departamento','terreno','local','oficina','bodega','rancho'] },
        operacion:     { type: 'string', enum: ['venta','renta'] },
        status:        { type: 'string', description: 'borrador, disponible, vendido, etc.' },
        precio_max:    { type: 'number' },
        precio_min:    { type: 'number' },
        limit:         { type: 'number', description: 'máx 20, default 5' },
      },
    },
    handler: async (admin, userId, args) => {
      const limit = Math.min(args.limit || 5, 20)
      let q = admin.from('properties')
        .select('id, folio_interno, titulo, tipo, operacion, status, precio_venta, precio_renta, municipio, estado_rep, recamaras, banos, sup_construida')
        .eq('user_id', userId).is('deleted_at', null)
      if (args.text) {
        const t = '%' + args.text + '%'
        q = q.or(`titulo.ilike.${t},folio_interno.ilike.${t}`)
      }
      if (args.municipio) q = q.ilike('municipio', '%' + args.municipio + '%')
      if (args.tipo)      q = q.eq('tipo', args.tipo)
      if (args.operacion) q = q.eq('operacion', args.operacion)
      if (args.status)    q = q.eq('status', args.status)
      if (args.precio_max) q = q.lte('precio_venta', args.precio_max)
      if (args.precio_min) q = q.gte('precio_venta', args.precio_min)
      const { data, error } = await q.limit(limit)
      if (error) return { error: error.message }
      return { count: data.length, items: data }
    },
  },
  {
    name: 'search_leads',
    description: 'Busca leads (solicitudes de información de clientes) capturados desde propiedad.html.',
    parameters: {
      type: 'object',
      properties: {
        text:        { type: 'string', description: 'Busca en nombre, teléfono, email, mensaje' },
        status:      { type: 'string', enum: ['nuevo','contactado','negociacion','cerrado','descartado'] },
        days_ago:    { type: 'number', description: 'Filtrar por antigüedad en días (ej. 7 = última semana)' },
        limit:       { type: 'number', description: 'máx 20, default 10' },
      },
    },
    handler: async (admin, userId, args) => {
      const limit = Math.min(args.limit || 10, 20)
      let q = admin.from('property_leads')
        .select('id, nombre, telefono, email, mensaje, status, created_at, properties(titulo,folio_interno,id)')
        .order('created_at', { ascending: false })
      if (args.status) q = q.eq('status', args.status)
      if (args.text) {
        const t = '%' + args.text + '%'
        q = q.or(`nombre.ilike.${t},telefono.ilike.${t},email.ilike.${t},mensaje.ilike.${t}`)
      }
      if (args.days_ago) {
        const cutoff = new Date(Date.now() - args.days_ago * 86400000).toISOString()
        q = q.gte('created_at', cutoff)
      }
      const { data, error } = await q.limit(limit)
      if (error) return { error: error.message }
      return { count: data.length, items: data }
    },
  },
  {
    name: 'search_movements',
    description: 'Busca movimientos financieros (gastos e ingresos) recientes del usuario. Lee de nodes (capturados con parser) y movimientos (bancarios).',
    parameters: {
      type: 'object',
      properties: {
        kind:        { type: 'string', enum: ['income','expense','both'], description: 'default both' },
        days_ago:    { type: 'number', description: 'Filtrar por antigüedad en días (default 30)' },
        text:        { type: 'string', description: 'Busca en label/concepto' },
        limit:       { type: 'number', description: 'máx 30, default 15' },
      },
    },
    handler: async (admin, userId, args) => {
      const limit = Math.min(args.limit || 15, 30)
      const days = args.days_ago || 30
      const cutoff = new Date(Date.now() - days * 86400000).toISOString()
      let typeFilter
      if (args.kind === 'income') typeFilter = ['income']
      else if (args.kind === 'expense') typeFilter = ['expense']
      else typeFilter = ['income','expense']
      let q = admin.from('nodes')
        .select('id, type, content, metadata, created_at')
        .eq('owner_id', userId).in('type', typeFilter)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
      if (args.text) q = q.ilike('content', '%' + args.text + '%')
      const { data, error } = await q.limit(limit)
      if (error) return { error: error.message }
      return { count: data.length, items: data.map(n => ({
        id: n.id,
        type: n.type,
        amount: n.metadata?.amount,
        currency: n.metadata?.currency || 'MXN',
        label: n.content || n.metadata?.label,
        account: n.metadata?.account_hint,
        tags: n.metadata?.tags,
        date: n.metadata?.date || n.created_at?.split('T')[0],
      })) }
    },
  },
  {
    name: 'search_tasks',
    description: 'Busca tareas/citas (nodes type=kanban) del usuario. Útil para "qué tengo pendiente", "qué tareas tengo esta semana".',
    parameters: {
      type: 'object',
      properties: {
        status:     { type: 'string', enum: ['todo','doing','done'] },
        priority:   { type: 'string', enum: ['alta','media','baja'] },
        from_date:  { type: 'string', description: 'YYYY-MM-DD, fecha límite mínima' },
        to_date:    { type: 'string', description: 'YYYY-MM-DD, fecha límite máxima' },
        text:       { type: 'string' },
        limit:      { type: 'number', description: 'default 20' },
      },
    },
    handler: async (admin, userId, args) => {
      const limit = Math.min(args.limit || 20, 50)
      let q = admin.from('nodes')
        .select('id, content, metadata, created_at')
        .eq('owner_id', userId).eq('type', 'kanban')
        .order('created_at', { ascending: false })
      if (args.text) q = q.ilike('content', '%' + args.text + '%')
      const { data, error } = await q.limit(limit * 2)  // sobre-trae para filtrar metadata
      if (error) return { error: error.message }
      const filtered = (data || []).filter(n => {
        if (args.status && n.metadata?.status !== args.status) return false
        if (args.priority && n.metadata?.priority !== args.priority) return false
        if (args.from_date && (n.metadata?.due_date || '') < args.from_date) return false
        if (args.to_date && (n.metadata?.due_date || '9999') > args.to_date) return false
        return true
      }).slice(0, limit)
      return { count: filtered.length, items: filtered.map(n => ({
        id: n.id,
        title: n.content || n.metadata?.label,
        status: n.metadata?.status,
        priority: n.metadata?.priority,
        due_date: n.metadata?.due_date,
        due_time: n.metadata?.due_time,
        tags: n.metadata?.tags,
        project_tag: n.metadata?.project_tag,
      })) }
    },
  },
  {
    name: 'get_today_briefing',
    description: 'Resumen rápido del día: total inmuebles activos, leads hoy/semana/total, tareas pendientes con fecha hoy, movimientos del día, exclusivas próximas a vencer.',
    parameters: { type: 'object', properties: {} },
    handler: async (admin, userId) => {
      const today = new Date(); today.setHours(0,0,0,0)
      const todayIso = today.toISOString()
      const wkAgo = new Date(Date.now() - 7*86400000).toISOString()
      const wkAhead = new Date(Date.now() + 7*86400000).toISOString().split('T')[0]

      const [props, leadsHoy, leadsSem, leadsCold, movs, tareas, excl] = await Promise.all([
        admin.from('properties').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null),
        admin.from('property_leads').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
        admin.from('property_leads').select('id', { count: 'exact', head: true }).gte('created_at', wkAgo),
        admin.from('property_leads').select('nombre,properties(titulo,folio_interno)').lte('created_at', new Date(Date.now()-3*86400000).toISOString()).limit(3),
        admin.from('nodes').select('type, metadata').eq('owner_id', userId).in('type', ['income','expense']).gte('created_at', todayIso),
        admin.from('nodes').select('content,metadata').eq('owner_id', userId).eq('type', 'kanban').limit(50),
        admin.from('properties').select('titulo,folio_interno,exclusiva_fin').eq('user_id', userId).eq('exclusiva', true).gte('exclusiva_fin', todayIso.split('T')[0]).lte('exclusiva_fin', wkAhead).is('deleted_at', null),
      ])

      const tasksToday = (tareas.data || []).filter(t => {
        const dd = t.metadata?.due_date
        return dd && dd === todayIso.split('T')[0] && t.metadata?.status !== 'done'
      })
      const ing = (movs.data || []).filter(m => m.type === 'income').reduce((s,m) => s + (m.metadata?.amount||0), 0)
      const eg  = (movs.data || []).filter(m => m.type === 'expense').reduce((s,m) => s + (m.metadata?.amount||0), 0)

      return {
        inmuebles_activos: props.count || 0,
        leads_hoy: leadsHoy.count || 0,
        leads_semana: leadsSem.count || 0,
        leads_frios_3d: (leadsCold.data || []).slice(0,3).map(l => ({
          nombre: l.nombre,
          inmueble: l.properties?.titulo || l.properties?.folio_interno,
        })),
        ingresos_hoy: ing,
        gastos_hoy: eg,
        tareas_pendientes_hoy: tasksToday.map(t => ({
          titulo: t.content || t.metadata?.label,
          hora: t.metadata?.due_time,
          prioridad: t.metadata?.priority,
        })),
        exclusivas_proximas: (excl.data || []).map(p => ({ titulo: p.titulo, folio: p.folio_interno, vence: p.exclusiva_fin })),
        fecha: todayIso.split('T')[0],
      }
    },
  },
  {
    name: 'create_task',
    description: 'Crea una nueva tarea/cita en el Kanban del usuario. Útil cuando el usuario dice "recuérdame", "anota", "agenda", etc.',
    parameters: {
      type: 'object',
      required: ['title'],
      properties: {
        title:     { type: 'string', description: 'Texto de la tarea' },
        priority:  { type: 'string', enum: ['alta','media','baja'] },
        due_date:  { type: 'string', description: 'YYYY-MM-DD' },
        due_time:  { type: 'string', description: 'HH:MM (24h)' },
        project_tag: { type: 'string', description: 'Slug del proyecto, ej: casatulum' },
        notes:     { type: 'string' },
      },
    },
    handler: async (admin, userId, args) => {
      const meta = {
        status: 'todo',
        tags: ['#tarea'],
        priority: args.priority || null,
        due_date: args.due_date || null,
        due_time: args.due_time || null,
        project_tag: args.project_tag || null,
        notes: args.notes || null,
        label: args.title,
      }
      const { data, error } = await admin.from('nodes').insert({
        owner_id: userId, type: 'kanban',
        content: args.title, metadata: meta,
      }).select().single()
      if (error) return { error: error.message }
      return { ok: true, id: data.id, message: 'Tarea creada: ' + args.title }
    },
  },
  {
    name: 'create_movement',
    description: 'Crea un movimiento financiero (gasto o ingreso) en Bio-Finanzas. Útil cuando el usuario dice "registra gasto", "pagué", "cobré".',
    parameters: {
      type: 'object',
      required: ['kind','amount','label'],
      properties: {
        kind:    { type: 'string', enum: ['income','expense'] },
        amount:  { type: 'number' },
        label:   { type: 'string', description: 'Descripción del movimiento' },
        account: { type: 'string', description: 'Banco o cuenta (ej. bancomer, hsbc)' },
        currency:{ type: 'string', description: 'default MXN' },
        date:    { type: 'string', description: 'YYYY-MM-DD' },
        project_tag: { type: 'string' },
        tags:    { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (admin, userId, args) => {
      const meta = {
        amount: args.amount,
        currency: args.currency || 'MXN',
        label: args.label,
        account_hint: args.account || null,
        date: args.date || new Date().toISOString().split('T')[0],
        project_tag: args.project_tag || null,
        tags: args.tags?.length ? args.tags.map(t => t.startsWith('#') ? t : '#' + t) : [],
      }
      const { data, error } = await admin.from('nodes').insert({
        owner_id: userId, type: args.kind,
        content: args.label, metadata: meta,
      }).select().single()
      if (error) return { error: error.message }
      return { ok: true, id: data.id, message: `${args.kind === 'income' ? 'Ingreso' : 'Gasto'} de $${args.amount} registrado: ${args.label}` }
    },
  },
  {
    name: 'create_note',
    description: 'Crea una nota libre. Útil para "anota", "guarda esto", "apunta".',
    parameters: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string' },
        tags:    { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (admin, userId, args) => {
      const meta = {
        label: args.content.slice(0,60),
        tags: args.tags?.length ? args.tags.map(t => t.startsWith('#') ? t : '#' + t) : [],
      }
      const { data, error } = await admin.from('nodes').insert({
        owner_id: userId, type: 'note',
        content: args.content, metadata: meta,
      }).select().single()
      if (error) return { error: error.message }
      return { ok: true, id: data.id, message: 'Nota guardada' }
    },
  },
  {
    name: 'update_lead_status',
    description: 'Actualiza el status de un lead (nuevo, contactado, negociacion, cerrado, descartado). Útil cuando el usuario dice "marca como contactado el lead X".',
    parameters: {
      type: 'object',
      required: ['lead_id','status'],
      properties: {
        lead_id: { type: 'string' },
        status:  { type: 'string', enum: ['nuevo','contactado','negociacion','cerrado','descartado'] },
      },
    },
    handler: async (admin, userId, args) => {
      const { error } = await admin.from('property_leads').update({ status: args.status }).eq('id', args.lead_id)
      if (error) return { error: error.message }
      return { ok: true, message: 'Lead actualizado a: ' + args.status }
    },
  },
  {
    name: 'update_property_status',
    description: 'Cambia el status de un inmueble (borrador, disponible, vendido, rentado, pausado). Útil cuando el usuario dice "marca como vendido NX-001".',
    parameters: {
      type: 'object',
      required: ['property_id','status'],
      properties: {
        property_id: { type: 'string', description: 'UUID o folio_interno' },
        status:      { type: 'string', description: 'borrador, disponible, vendido, rentado, pausado' },
      },
    },
    handler: async (admin, userId, args) => {
      let query = admin.from('properties').update({ status: args.status })
      const isUuid = /^[0-9a-f]{8}-/i.test(args.property_id)
      query = isUuid ? query.eq('id', args.property_id) : query.eq('folio_interno', args.property_id)
      query = query.eq('user_id', userId)
      const { error } = await query
      if (error) return { error: error.message }
      return { ok: true, message: `Inmueble ${args.property_id} → status ${args.status}` }
    },
  },
  {
    name: 'generate_property_link',
    description: 'Genera el link público OG-friendly de un inmueble (para compartir en WhatsApp/Telegram).',
    parameters: {
      type: 'object',
      required: ['property_id'],
      properties: { property_id: { type: 'string', description: 'UUID o folio_interno' } },
    },
    handler: async (admin, userId, args) => {
      const isUuid = /^[0-9a-f]{8}-/i.test(args.property_id)
      const q = admin.from('properties').select('id, slug, titulo, folio_interno').eq('user_id', userId)
      const { data, error } = await (isUuid ? q.eq('id', args.property_id) : q.eq('folio_interno', args.property_id)).single()
      if (error || !data) return { error: 'No encontrado' }
      const ref = data.slug || data.id
      return { ok: true, url: `https://nexus-os-chi.vercel.app/propiedad/${ref}`, titulo: data.titulo, folio: data.folio_interno }
    },
  },
]

function toolByName(name) { return TOOLS.find(t => t.name === name) }

// ════════════════════════════════════════════════════════════════════
// GEMINI con tool use
// ════════════════════════════════════════════════════════════════════

function buildGeminiTools() {
  return [{
    function_declarations: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }]
}

async function callGemini({ history, systemInstruction, tools }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: history,
    tools,
    generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const errBody = await r.text()
    throw new Error(`Gemini ${r.status}: ${errBody.slice(0,200)}`)
  }
  return r.json()
}

// ════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth interno (bot → este endpoint)
  const secret = req.headers['x-nexus-service-secret']
  if (SERVICE_SECRET && secret !== SERVICE_SECRET) {
    return res.status(401).json({ error: 'Bad service secret' })
  }

  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' })

  try {
    const { user_id, platform = 'telegram', external_chat_id, message } = req.body || {}
    if (!user_id || !external_chat_id || !message) {
      return res.status(400).json({ error: 'user_id + external_chat_id + message requeridos' })
    }

    const startTime = Date.now()
    const admin = getAdminSupabase()

    // ── 1. Carga o crea sesión ───────────────────────────────────
    let { data: session } = await admin
      .from('chat_sessions')
      .select('id, context_summary, message_count')
      .eq('owner_id', user_id)
      .eq('platform', platform)
      .eq('external_chat_id', String(external_chat_id))
      .maybeSingle()
    if (!session) {
      const { data: newSession, error: sErr } = await admin
        .from('chat_sessions')
        .insert({ owner_id: user_id, platform, external_chat_id: String(external_chat_id) })
        .select('id, context_summary, message_count')
        .single()
      if (sErr) throw sErr
      session = newSession
    }

    // ── 2. Carga historial reciente ──────────────────────────────
    const { data: historyMsgs } = await admin
      .from('chat_messages')
      .select('role, content, tool_calls, tool_results')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(HISTORY_WINDOW)

    // Construye historia formato Gemini (parts arrays)
    const history = []
    for (const m of (historyMsgs || [])) {
      if (m.role === 'user') {
        history.push({ role: 'user', parts: [{ text: m.content || '' }] })
      } else if (m.role === 'assistant') {
        const parts = []
        if (m.content) parts.push({ text: m.content })
        if (m.tool_calls?.length) {
          for (const tc of m.tool_calls) {
            parts.push({ functionCall: { name: tc.name, args: tc.args || {} } })
          }
        }
        if (parts.length) history.push({ role: 'model', parts })
      } else if (m.role === 'tool') {
        if (m.tool_results?.length) {
          history.push({
            role: 'user',
            parts: m.tool_results.map(tr => ({
              functionResponse: { name: tr.name, response: tr.response },
            })),
          })
        }
      }
    }

    // Mensaje nuevo
    history.push({ role: 'user', parts: [{ text: message }] })

    // ── 3. Persiste mensaje del usuario ──────────────────────────
    await admin.from('chat_messages').insert({
      session_id: session.id, owner_id: user_id,
      role: 'user', content: message,
    })

    // ── 4. Loop de tool use ──────────────────────────────────────
    const systemInstruction = `Eres "Nexus", el asistente personal de Oscar Omar (oscaromargp@gmail.com).

Su Nexus OS es un sistema all-in-one que gestiona:
- 🏠 Inmuebles (CRM inmobiliario, leads, reportes, exclusivas)
- 💰 Finanzas (gastos, ingresos, movimientos bancarios, agenda de pagos)
- ✅ Tareas y citas (Kanban con prioridades y fechas)
- 📁 Proyectos (BN Records discográfica + inmobiliarias + Casa Tulum + otros)
- 📡 RSS Editorial (rastreador de artistas → drafts blog)

ESTILO DE RESPUESTA:
- Español neutro/mexicano, conciso, tono casual cercano
- Usa Markdown de Telegram (*negrita*, _italica_, código con backticks)
- Emojis con moderación (1-3 por mensaje)
- Si no encuentras datos, dilo claro, no inventes
- Para mensajes sociales (gracias, hola, qué tal), responde breve y natural sin llamar tools
- Si vas a modificar datos, confirma antes con un mini-resumen

CUÁNDO USAR TOOLS:
- "qué leads tengo" → search_leads
- "muéstrame casas en X" → search_properties
- "cuánto gasté" → search_movements
- "resumen del día" → get_today_briefing
- "marca como contactado" → update_lead_status
- "anota..." / "recuérdame..." → create_task
- "registré $X" → create_movement
- "link de NX-001" → generate_property_link

NUNCA inventes IDs o folios. Si el usuario menciona un folio (ej. NX-001), úsalo tal cual.
NUNCA borres datos.

Fecha actual: ${new Date().toISOString().split('T')[0]}.`

    const tools = buildGeminiTools()
    let assistantText = ''
    const usedToolCalls = []
    const usedToolResults = []
    let totalTokensIn = 0, totalTokensOut = 0
    let llmProvider = 'gemini'

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      let resp
      try {
        resp = await callGemini({ history, systemInstruction, tools })
      } catch (e) {
        // Fallback simple: si Gemini falla, intenta sin tools (mensaje corto)
        if (iter === 0 && message.length < 30) {
          assistantText = '👋 Hola! Estoy aquí. ¿En qué te ayudo?'
          break
        }
        throw e
      }

      const usage = resp.usageMetadata || {}
      totalTokensIn += usage.promptTokenCount || 0
      totalTokensOut += usage.candidatesTokenCount || 0

      const cand = resp.candidates?.[0]
      const parts = cand?.content?.parts || []

      const textParts = parts.filter(p => p.text).map(p => p.text)
      const functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall)

      if (textParts.length) assistantText = textParts.join('').trim()

      if (!functionCalls.length) break  // respuesta final

      // Ejecuta tools
      const toolResultsForGemini = []
      const modelParts = [...parts]
      history.push({ role: 'model', parts: modelParts })

      for (const fc of functionCalls) {
        const tool = toolByName(fc.name)
        usedToolCalls.push({ name: fc.name, args: fc.args || {} })
        let result
        if (!tool) {
          result = { error: 'Tool no existe: ' + fc.name }
        } else {
          try {
            result = await tool.handler(admin, user_id, fc.args || {})
          } catch (e) {
            result = { error: e.message }
          }
        }
        usedToolResults.push({ name: fc.name, response: result })
        toolResultsForGemini.push({
          functionResponse: { name: fc.name, response: result },
        })
      }

      history.push({ role: 'user', parts: toolResultsForGemini })
    }

    if (!assistantText) {
      assistantText = '🤖 (sin respuesta)'
    }

    // ── 5. Persiste respuesta del agente ─────────────────────────
    await admin.from('chat_messages').insert([
      ...(usedToolCalls.length ? [{
        session_id: session.id, owner_id: user_id,
        role: 'assistant', content: '', tool_calls: usedToolCalls,
      }, {
        session_id: session.id, owner_id: user_id,
        role: 'tool', tool_results: usedToolResults,
      }] : []),
      {
        session_id: session.id, owner_id: user_id,
        role: 'assistant', content: assistantText,
        tokens_in: totalTokensIn, tokens_out: totalTokensOut,
        llm_provider: llmProvider, llm_model: 'gemini-2.0-flash',
        latency_ms: Date.now() - startTime,
      },
    ])

    await admin.from('chat_sessions').update({
      message_count: (session.message_count || 0) + 1,
      last_message_at: new Date().toISOString(),
    }).eq('id', session.id)

    return res.status(200).json({
      ok: true,
      reply: assistantText,
      tools_used: usedToolCalls.length,
      tokens: { in: totalTokensIn, out: totalTokensOut },
      latency_ms: Date.now() - startTime,
    })
  } catch (e) {
    console.error('[agent]', e)
    return res.status(500).json({ error: e.message })
  }
}
