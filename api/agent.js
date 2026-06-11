// Nexus OS — Agente conversacional con tool use (multi-provider)
//
// POST /api/agent
//   { user_id, platform, external_chat_id, message, provider? }
//
// Providers soportados:
//   - 'groq'   → Llama 3.3 70B (default, free tier 30 req/min)
//   - 'gemini' → Gemini 2.0 Flash (free tier 1500 req/día, condicional)
//
// Selección: por header X-Nexus-Provider, o user_metadata.agent_provider,
// o env DEFAULT_LLM_PROVIDER, o 'groq' por defecto.
// Fallback automático: si el primario falla, intenta el siguiente.
//
// Memoria conversacional: chat_sessions + chat_messages.

import { createClient } from '@supabase/supabase-js'

const GEMINI_KEY = process.env.GEMINI_API_KEY
const GROQ_KEY   = process.env.GROQ_API_KEY
const SERVICE_SECRET = process.env.NEXUS_WEBHOOK_SECRET
const MAX_TOOL_ITERATIONS = 8
const HISTORY_WINDOW = 20

const PROVIDERS = ['groq', 'gemini']  // orden de preferencia + fallback chain
const DEFAULT_PROVIDER = process.env.DEFAULT_LLM_PROVIDER || 'groq'

const PROVIDER_CONFIG = {
  groq: {
    available: !!GROQ_KEY,
    model: 'llama-3.3-70b-versatile',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  },
  gemini: {
    available: !!GEMINI_KEY,
    model: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  },
}

function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

// ════════════════════════════════════════════════════════════════════
// TOOLS (Tier 2: lectura + escritura segura, sin delete)
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
      },
    },
    handler: async (admin, userId, args) => {
      const limit = 5
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
      if (args.precio_max) q = q.lte('precio_venta', Number(args.precio_max))
      if (args.precio_min) q = q.gte('precio_venta', Number(args.precio_min))
      const { data, error } = await q.limit(limit)
      if (error) return { error: error.message }
      return { count: data.length, items: data }
    },
  },
  {
    name: 'search_leads',
    description: 'Busca leads (solicitudes de información) capturados desde propiedad.html.',
    parameters: {
      type: 'object',
      properties: {
        text:        { type: 'string', description: 'Busca en nombre, teléfono, email, mensaje' },
        status:      { type: 'string', enum: ['nuevo','contactado','negociacion','cerrado','descartado'] },
        days_ago:    { type: 'number', description: 'Filtrar por antigüedad en días' },
      },
    },
    handler: async (admin, userId, args) => {
      const limit = 10
      let q = admin.from('property_leads')
        .select('id, nombre, telefono, email, mensaje, status, created_at, properties(titulo,folio_interno,id)')
        .order('created_at', { ascending: false })
      if (args.status) q = q.eq('status', args.status)
      if (args.text) {
        const t = '%' + args.text + '%'
        q = q.or(`nombre.ilike.${t},telefono.ilike.${t},email.ilike.${t},mensaje.ilike.${t}`)
      }
      if (args.days_ago) {
        const cutoff = new Date(Date.now() - Number(args.days_ago) * 86400000).toISOString()
        q = q.gte('created_at', cutoff)
      }
      const { data, error } = await q.limit(limit)
      if (error) return { error: error.message }
      return { count: data.length, items: data }
    },
  },
  {
    name: 'search_movements',
    description: 'Busca movimientos financieros recientes (gastos e ingresos capturados con parser o desde Movimientos).',
    parameters: {
      type: 'object',
      properties: {
        kind:        { type: 'string', enum: ['income','expense','both'], description: 'default both' },
        days_ago:    { type: 'number', description: 'default 30' },
        text:        { type: 'string' },
      },
    },
    handler: async (admin, userId, args) => {
      const limit = 15
      const days = Number(args.days_ago) || 30
      const cutoff = new Date(Date.now() - days * 86400000).toISOString()
      const typeFilter = args.kind === 'income' ? ['income'] : args.kind === 'expense' ? ['expense'] : ['income','expense']
      let q = admin.from('nodes').select('id, type, content, metadata, created_at')
        .eq('owner_id', userId).in('type', typeFilter)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
      if (args.text) q = q.ilike('content', '%' + args.text + '%')
      const { data, error } = await q.limit(limit)
      if (error) return { error: error.message }
      return { count: data.length, items: data.map(n => ({
        id: n.id, type: n.type,
        amount: n.metadata?.amount, currency: n.metadata?.currency || 'MXN',
        label: n.content || n.metadata?.label,
        account: n.metadata?.account_hint,
        tags: n.metadata?.tags,
        date: n.metadata?.date || n.created_at?.split('T')[0],
      })) }
    },
  },
  {
    name: 'search_tasks',
    description: 'Busca tareas/citas pendientes del Kanban. Útil para "qué tengo pendiente".',
    parameters: {
      type: 'object',
      properties: {
        status:     { type: 'string', enum: ['todo','doing','done'] },
        priority:   { type: 'string', enum: ['alta','media','baja'] },
        from_date:  { type: 'string', description: 'YYYY-MM-DD' },
        to_date:    { type: 'string', description: 'YYYY-MM-DD' },
        text:       { type: 'string' },
      },
    },
    handler: async (admin, userId, args) => {
      const limit = 20
      let q = admin.from('nodes').select('id, content, metadata, created_at')
        .eq('owner_id', userId).eq('type', 'kanban')
        .order('created_at', { ascending: false })
      if (args.text) q = q.ilike('content', '%' + args.text + '%')
      const { data, error } = await q.limit(limit * 2)
      if (error) return { error: error.message }
      const filtered = (data || []).filter(n => {
        if (args.status && n.metadata?.status !== args.status) return false
        if (args.priority && n.metadata?.priority !== args.priority) return false
        if (args.from_date && (n.metadata?.due_date || '') < args.from_date) return false
        if (args.to_date && (n.metadata?.due_date || '9999') > args.to_date) return false
        return true
      }).slice(0, limit)
      return { count: filtered.length, items: filtered.map(n => ({
        id: n.id, title: n.content || n.metadata?.label,
        status: n.metadata?.status, priority: n.metadata?.priority,
        due_date: n.metadata?.due_date, due_time: n.metadata?.due_time,
        tags: n.metadata?.tags, project_tag: n.metadata?.project_tag,
      })) }
    },
  },
  {
    name: 'get_today_briefing',
    description: 'Resumen del día: total inmuebles, leads hoy/semana/total, tareas pendientes hoy, movimientos del día, exclusivas próximas a vencer.',
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
        leads_hoy: leadsHoy.count || 0, leads_semana: leadsSem.count || 0,
        leads_frios_3d: (leadsCold.data || []).slice(0,3).map(l => ({ nombre: l.nombre, inmueble: l.properties?.titulo || l.properties?.folio_interno })),
        ingresos_hoy: ing, gastos_hoy: eg,
        tareas_pendientes_hoy: tasksToday.map(t => ({ titulo: t.content || t.metadata?.label, hora: t.metadata?.due_time, prioridad: t.metadata?.priority })),
        exclusivas_proximas: (excl.data || []).map(p => ({ titulo: p.titulo, folio: p.folio_interno, vence: p.exclusiva_fin })),
        fecha: todayIso.split('T')[0],
      }
    },
  },
  {
    name: 'create_task',
    description: 'Crea una nueva tarea/cita en Kanban. Útil para "recuérdame", "anota", "agenda".',
    parameters: {
      type: 'object', required: ['title'],
      properties: {
        title:     { type: 'string' },
        priority:  { type: 'string', enum: ['alta','media','baja'] },
        due_date:  { type: 'string', description: 'YYYY-MM-DD' },
        due_time:  { type: 'string', description: 'HH:MM' },
        project_tag: { type: 'string' },
        notes:     { type: 'string' },
      },
    },
    handler: async (admin, userId, args) => {
      const meta = {
        status: 'todo', tags: ['#tarea'],
        priority: args.priority || null, due_date: args.due_date || null,
        due_time: args.due_time || null, project_tag: args.project_tag || null,
        notes: args.notes || null, label: args.title,
      }
      const { data, error } = await admin.from('nodes').insert({
        owner_id: userId, type: 'kanban', content: args.title, metadata: meta,
      }).select().single()
      if (error) return { error: error.message }
      return { ok: true, id: data.id, message: 'Tarea creada: ' + args.title }
    },
  },
  {
    name: 'create_movement',
    description: 'Crea un movimiento financiero (gasto o ingreso). Útil para "registra gasto", "pagué", "cobré".',
    parameters: {
      type: 'object', required: ['kind','amount','label'],
      properties: {
        kind:    { type: 'string', enum: ['income','expense'] },
        amount:  { type: 'number' },
        label:   { type: 'string' },
        account: { type: 'string' },
        currency:{ type: 'string', description: 'default MXN' },
        date:    { type: 'string', description: 'YYYY-MM-DD' },
        project_tag: { type: 'string' },
        tags:    { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (admin, userId, args) => {
      const meta = {
        amount: args.amount, currency: args.currency || 'MXN',
        label: args.label, account_hint: args.account || null,
        date: args.date || new Date().toISOString().split('T')[0],
        project_tag: args.project_tag || null,
        tags: args.tags?.length ? args.tags.map(t => t.startsWith('#') ? t : '#' + t) : [],
      }
      const { data, error } = await admin.from('nodes').insert({
        owner_id: userId, type: args.kind, content: args.label, metadata: meta,
      }).select().single()
      if (error) return { error: error.message }
      return { ok: true, id: data.id, message: `${args.kind === 'income' ? 'Ingreso' : 'Gasto'} de $${args.amount} registrado: ${args.label}` }
    },
  },
  {
    name: 'create_note',
    description: 'Crea una nota libre. Para "anota", "guarda esto", "apunta".',
    parameters: {
      type: 'object', required: ['content'],
      properties: { content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
    },
    handler: async (admin, userId, args) => {
      const meta = { label: args.content.slice(0,60), tags: args.tags?.length ? args.tags.map(t => t.startsWith('#') ? t : '#' + t) : [] }
      const { data, error } = await admin.from('nodes').insert({
        owner_id: userId, type: 'note', content: args.content, metadata: meta,
      }).select().single()
      if (error) return { error: error.message }
      return { ok: true, id: data.id, message: 'Nota guardada' }
    },
  },
  {
    name: 'update_lead_status',
    description: 'Actualiza status de un lead. Útil para "marca como contactado el lead X".',
    parameters: {
      type: 'object', required: ['lead_id','status'],
      properties: { lead_id: { type: 'string' }, status: { type: 'string', enum: ['nuevo','contactado','negociacion','cerrado','descartado'] } },
    },
    handler: async (admin, userId, args) => {
      const { error } = await admin.from('property_leads').update({ status: args.status }).eq('id', args.lead_id)
      if (error) return { error: error.message }
      return { ok: true, message: 'Lead actualizado a: ' + args.status }
    },
  },
  {
    name: 'update_property_status',
    description: 'Cambia el status de un inmueble (borrador, disponible, vendido, rentado, pausado).',
    parameters: {
      type: 'object', required: ['property_id','status'],
      properties: { property_id: { type: 'string', description: 'UUID o folio_interno' }, status: { type: 'string' } },
    },
    handler: async (admin, userId, args) => {
      let query = admin.from('properties').update({ status: args.status })
      const isUuid = /^[0-9a-f]{8}-/i.test(args.property_id)
      query = isUuid ? query.eq('id', args.property_id) : query.eq('folio_interno', args.property_id)
      query = query.eq('user_id', userId)
      const { error } = await query
      if (error) return { error: error.message }
      return { ok: true, message: `Inmueble ${args.property_id} → ${args.status}` }
    },
  },
  {
    name: 'search_contacts',
    description: 'Busca contactos (personas, bancos, proveedores) del CRM. SIEMPRE usa este tool cuando el usuario pida "datos de contacto de X", "teléfono de X", "email de X", "cuenta CLABE de X". Devuelve TODOS los datos para copy-paste: nombre completo, teléfonos, emails, ciudad, notas, cumpleaños, y cuentas bancarias asociadas con CLABEs. Si hay varios matches, muéstralos TODOS y pídele al usuario que elija.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Nombre o parte del nombre, teléfono, email, o palabra clave. Ejemplos: "Alex", "Banamex", "Pedro 555".' },
        cType: { type: 'string', enum: ['persona','banco','proveedor','prospecto','agente'], description: 'Tipo de contacto (opcional)' },
      },
      required: ['text'],
    },
    handler: async (admin, userId, args) => {
      const text = (args.text || '').trim()
      if (!text) return { error: 'text requerido' }
      // Busca en content, metadata.name, metadata.phone, metadata.email
      const { data, error } = await admin.from('nodes')
        .select('id, content, metadata')
        .eq('owner_id', userId).eq('type', 'contact')
        .or(`content.ilike.%${text}%,metadata->>name.ilike.%${text}%,metadata->>phone.ilike.%${text}%,metadata->>email.ilike.%${text}%,metadata->>notes.ilike.%${text}%`)
        .limit(15)
      if (error) return { error: error.message }
      const filtered = args.cType ? data.filter(c => c.metadata?.cType === args.cType) : data
      return {
        count: filtered.length,
        contacts: filtered.map(c => {
          const m = c.metadata || {}
          return {
            id: c.id,
            name: m.name || c.content,
            cType: m.cType,
            roles: m.roles,
            phone: m.phone,
            email: m.email,
            phones: m.phones,  // array [{label, number}]
            emails: m.emails,  // array [{label, address}]
            city: m.city,
            birthday: m.birthday,
            notes: m.notes,
            contact_accounts: m.contact_accounts,  // bancos/CLABEs/wallets
          }
        }),
      }
    },
  },
  {
    name: 'search_accounts',
    description: 'Busca cuentas bancarias/efectivo del usuario y SUS SALDOS calculados (saldo inicial + ingresos - gastos asociados a esa cuenta). Úsalo cuando el usuario pregunte "cuánto tengo en X", "saldo de mi cuenta NU", "estado de Banamex". Si hay varias cuentas, muéstralas TODAS con sus saldos.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Nombre o parte del nombre de la cuenta (ej. "nom", "banamex", "nu"). Vacío = todas.' },
      },
    },
    handler: async (admin, userId, args) => {
      // 1) Trae cuentas que matchean
      let q = admin.from('nodes').select('id, content, metadata, created_at')
        .eq('owner_id', userId).eq('type', 'account')
      const { data: accounts, error } = await q.limit(50)
      if (error) return { error: error.message }
      const text = (args.text || '').trim().toLowerCase()
      const filteredAccounts = text
        ? accounts.filter(a => {
            const label = (a.metadata?.label || a.content || '').toLowerCase()
            return label.includes(text)
          })
        : accounts

      if (!filteredAccounts.length) {
        return { count: 0, accounts: [], hint: 'Sin matches. Cuentas disponibles: ' + accounts.map(a => a.content).join(', ') }
      }

      // 2) Trae todos los movimientos del usuario en últimos 365 días
      const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString()
      const { data: movs } = await admin.from('nodes')
        .select('type, metadata').eq('owner_id', userId)
        .in('type', ['income','expense'])
        .gte('created_at', yearAgo)
        .limit(2000)

      // 3) Por cada cuenta, suma movimientos cuyo metadata.account_hint matchea label
      const result = filteredAccounts.map(a => {
        const label = (a.metadata?.label || a.content || '').toLowerCase()
        const labelTokens = label.split(/\s+/).filter(Boolean)
        const initial = Number(a.metadata?.initial_balance) || 0
        let income = 0, expense = 0, countMovs = 0
        for (const m of (movs || [])) {
          const hint = (m.metadata?.account_hint || '').toLowerCase()
          if (!hint) continue
          // match si hint contiene el label o algún token
          const matches = hint === label || hint.includes(label) || labelTokens.some(t => t.length >= 3 && hint.includes(t))
          if (!matches) continue
          countMovs++
          const amt = Number(m.metadata?.amount) || 0
          if (m.type === 'income') income += amt
          else expense += amt
        }
        return {
          id: a.id,
          label: a.metadata?.label || a.content,
          tipo: a.metadata?.acType,
          color: a.metadata?.color,
          initial_balance: initial,
          ingresos_total: income,
          gastos_total: expense,
          balance_calculado: initial + income - expense,
          movimientos_registrados: countMovs,
          nota: countMovs === 0 ? 'Sin movimientos registrados con este account_hint. Saldo = inicial.' : null,
        }
      })

      return { count: result.length, accounts: result }
    },
  },
  {
    name: 'generate_property_link',
    description: 'Genera link público OG-friendly de un inmueble para compartir.',
    parameters: {
      type: 'object', required: ['property_id'],
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
// HISTORIA INTERNA → FORMATO PROVIDER
// ════════════════════════════════════════════════════════════════════

// Historia interna shape: { role, content?, tool_calls?, tool_results? }
// - role: 'user'|'assistant'|'tool'
// - content: string (para user, assistant text)
// - tool_calls: [{ id, name, args }] en assistant
// - tool_results: [{ tool_call_id, name, response }] en tool

function toOpenAiMessages(history, systemInstruction) {
  // Para Groq (OpenAI-compatible)
  const msgs = [{ role: 'system', content: systemInstruction }]
  for (const h of history) {
    if (h.role === 'user') {
      msgs.push({ role: 'user', content: h.content || '' })
    } else if (h.role === 'assistant') {
      const msg = { role: 'assistant', content: h.content || null }
      if (h.tool_calls?.length) {
        msg.tool_calls = h.tool_calls.map(tc => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
        }))
      }
      msgs.push(msg)
    } else if (h.role === 'tool') {
      if (h.tool_results?.length) {
        for (const tr of h.tool_results) {
          msgs.push({
            role: 'tool', tool_call_id: tr.tool_call_id || tr.name,
            content: JSON.stringify(tr.response),
          })
        }
      }
    }
  }
  return msgs
}

function toGeminiContents(history) {
  const contents = []
  for (const h of history) {
    if (h.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: h.content || '' }] })
    } else if (h.role === 'assistant') {
      const parts = []
      if (h.content) parts.push({ text: h.content })
      if (h.tool_calls?.length) {
        for (const tc of h.tool_calls) parts.push({ functionCall: { name: tc.name, args: tc.args || {} } })
      }
      if (parts.length) contents.push({ role: 'model', parts })
    } else if (h.role === 'tool') {
      if (h.tool_results?.length) {
        contents.push({
          role: 'user',
          parts: h.tool_results.map(tr => ({ functionResponse: { name: tr.name, response: tr.response } })),
        })
      }
    }
  }
  return contents
}

// ════════════════════════════════════════════════════════════════════
// CALL LLM (returna { text, tool_calls, tokens_in, tokens_out })
// ════════════════════════════════════════════════════════════════════

async function callGroq({ history, systemInstruction }) {
  const tools = TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
  const body = JSON.stringify({
    model: PROVIDER_CONFIG.groq.model,
    messages: toOpenAiMessages(history, systemInstruction),
    tools, tool_choice: 'auto',
    temperature: 0.4, max_tokens: 1000,
  })
  // Auto-retry en 429 con el wait que indica la API
  let r, retries = 0
  while (true) {
    r = await fetch(PROVIDER_CONFIG.groq.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
      body,
    })
    if (r.status !== 429 || retries >= 2) break
    const txt = await r.text()
    const m = txt.match(/try again in (\d+(?:\.\d+)?)(ms|s)/i)
    let waitMs = 1000
    if (m) waitMs = m[2].toLowerCase() === 's' ? Number(m[1]) * 1000 : Number(m[1])
    waitMs = Math.min(waitMs + 200, 4000)  // cap 4s
    await new Promise(res => setTimeout(res, waitMs))
    retries++
  }
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Groq ${r.status}: ${t.slice(0, 300)}`)
  }
  const j = await r.json()
  const choice = j.choices?.[0]?.message || {}
  const tool_calls = (choice.tool_calls || []).map(tc => ({
    id: tc.id, name: tc.function?.name,
    args: (() => { try { return JSON.parse(tc.function?.arguments || '{}') } catch { return {} } })(),
  }))
  return {
    text: choice.content || '',
    tool_calls,
    tokens_in: j.usage?.prompt_tokens || 0,
    tokens_out: j.usage?.completion_tokens || 0,
  }
}

async function callGemini({ history, systemInstruction }) {
  const tools = [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
  const url = PROVIDER_CONFIG.gemini.endpoint + '?key=' + GEMINI_KEY
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: toGeminiContents(history),
      tools,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`)
  }
  const j = await r.json()
  const cand = j.candidates?.[0]
  const parts = cand?.content?.parts || []
  const text = parts.filter(p => p.text).map(p => p.text).join('')
  const tool_calls = parts.filter(p => p.functionCall).map((p, i) => ({
    id: 'gem_' + Date.now() + '_' + i,
    name: p.functionCall.name,
    args: p.functionCall.args || {},
  }))
  return {
    text, tool_calls,
    tokens_in: j.usageMetadata?.promptTokenCount || 0,
    tokens_out: j.usageMetadata?.candidatesTokenCount || 0,
  }
}

async function callProvider(provider, params) {
  if (provider === 'groq')   return callGroq(params)
  if (provider === 'gemini') return callGemini(params)
  throw new Error('Provider desconocido: ' + provider)
}

// ════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    // Health check & status
    return res.status(200).json({
      ok: true,
      providers: PROVIDERS.map(p => ({
        id: p, ...PROVIDER_CONFIG[p],
        endpoint: '<hidden>',
      })),
      default: DEFAULT_PROVIDER,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = req.headers['x-nexus-service-secret']
  if (SERVICE_SECRET && secret !== SERVICE_SECRET) {
    return res.status(401).json({ error: 'Bad service secret' })
  }

  try {
    const { user_id, platform = 'telegram', external_chat_id, message, provider: requestedProvider } = req.body || {}
    if (!user_id || !external_chat_id || !message) {
      return res.status(400).json({ error: 'user_id + external_chat_id + message requeridos' })
    }

    // Determina cadena de providers: el solicitado primero, luego el resto como fallback
    const initialProvider = requestedProvider || DEFAULT_PROVIDER
    const tryOrder = [initialProvider, ...PROVIDERS.filter(p => p !== initialProvider)]
      .filter(p => PROVIDER_CONFIG[p]?.available)

    if (tryOrder.length === 0) {
      return res.status(500).json({ error: 'Ningún provider configurado. Define GROQ_API_KEY o GEMINI_API_KEY.' })
    }

    const startTime = Date.now()
    const admin = getAdminSupabase()

    // ── Sesión ───────────────────────────────────────────────────
    let { data: session } = await admin
      .from('chat_sessions')
      .select('id, context_summary, message_count')
      .eq('owner_id', user_id).eq('platform', platform).eq('external_chat_id', String(external_chat_id))
      .maybeSingle()
    if (!session) {
      const { data: newSession, error: sErr } = await admin
        .from('chat_sessions').insert({ owner_id: user_id, platform, external_chat_id: String(external_chat_id) })
        .select('id, context_summary, message_count').single()
      if (sErr) throw sErr
      session = newSession
    }

    // ── Historial ────────────────────────────────────────────────
    const { data: historyMsgs } = await admin
      .from('chat_messages')
      .select('role, content, tool_calls, tool_results')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(HISTORY_WINDOW)

    const history = []
    for (const m of (historyMsgs || [])) {
      const entry = { role: m.role }
      if (m.content) entry.content = m.content
      if (m.tool_calls?.length) entry.tool_calls = m.tool_calls
      if (m.tool_results?.length) entry.tool_results = m.tool_results
      history.push(entry)
    }
    history.push({ role: 'user', content: message })

    // ── Persiste msg user ────────────────────────────────────────
    await admin.from('chat_messages').insert({
      session_id: session.id, owner_id: user_id, role: 'user', content: message,
    })

    // ── System prompt ────────────────────────────────────────────
    const systemInstruction = `Eres "Nexus", asistente de Oscar Omar. Toda la data en los tools es del propio Oscar (su CRM personal Nexus OS). Está autorizado. NO hay privacidad de terceros — son SUS notas. NUNCA respondas "no tengo acceso" o "por privacidad" — usa el tool.

TOOLS:
- search_contacts → contactos (nombre, tel, email, CLABE)
- search_accounts → cuentas bancarias + saldos (NU, Banamex, Spin, NOM, etc.)
- search_movements → gastos/ingresos
- search_properties → inmuebles
- search_leads → solicitudes de info
- search_tasks → tareas pendientes
- get_today_briefing → resumen del día
- create_task, create_movement, create_note → agregar
- update_lead_status, update_property_status → modificar
- generate_property_link → URL pública

REGLAS:
1. SIEMPRE llama el tool ante preguntas de datos específicos. NO improvises.
2. Si hay varios matches, lista TODOS y pide aclarar cuál.
3. Contactos: formato copy-paste, cada dato en su línea con emoji.
4. Cuentas: muestra saldo calculado + inicial + ingresos/gastos.
5. Modificar: confirma con resumen antes.
6. NO borres. NO inventes IDs/folios/CLABEs.
7. Sociales (gracias, hola) → breve, sin tools.

Estilo: español MX, conciso, casual, Markdown Telegram (*negrita*, _italica_), 1-3 emojis.

Fecha: ${new Date().toISOString().split('T')[0]}.`

    // ── Loop ─────────────────────────────────────────────────────
    let assistantText = ''
    let usedToolCalls = []
    let usedToolResults = []
    let totalTokensIn = 0, totalTokensOut = 0
    let usedProvider = tryOrder[0]
    let lastError = null

    outer:
    for (const provider of tryOrder) {
      usedProvider = provider
      // Reset por provider — reintenta historia desde 0
      const localHistory = history.slice()
      let iterToolCalls = []
      let iterToolResults = []
      let iterText = ''
      let iterTokensIn = 0, iterTokensOut = 0

      try {
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const resp = await callProvider(provider, { history: localHistory, systemInstruction })
          iterTokensIn += resp.tokens_in
          iterTokensOut += resp.tokens_out
          if (resp.text) iterText = resp.text

          if (!resp.tool_calls?.length) break

          // Persiste mensaje del asistente con tool_calls
          localHistory.push({ role: 'assistant', content: resp.text || '', tool_calls: resp.tool_calls })
          iterToolCalls.push(...resp.tool_calls)

          // Ejecuta tools
          const toolResults = []
          for (const tc of resp.tool_calls) {
            const tool = toolByName(tc.name)
            let result
            if (!tool) result = { error: 'Tool no existe: ' + tc.name }
            else {
              try { result = await tool.handler(admin, user_id, tc.args || {}) }
              catch (e) { result = { error: e.message } }
            }
            toolResults.push({ tool_call_id: tc.id, name: tc.name, response: result })
          }
          iterToolResults.push(...toolResults)
          localHistory.push({ role: 'tool', tool_results: toolResults })
        }

        // Éxito
        assistantText = iterText
        usedToolCalls = iterToolCalls
        usedToolResults = iterToolResults
        totalTokensIn = iterTokensIn
        totalTokensOut = iterTokensOut
        break outer
      } catch (e) {
        lastError = e
        console.warn(`[agent] provider ${provider} failed:`, e.message)
        // siguiente provider en la cadena
      }
    }

    if (!assistantText && lastError) {
      assistantText = '⚠️ ' + (lastError.message || 'Error LLM').slice(0, 200)
    }
    if (!assistantText) assistantText = '🤖 (sin respuesta)'

    // ── Persiste respuesta ──────────────────────────────────────
    const toPersist = []
    if (usedToolCalls.length) {
      toPersist.push({
        session_id: session.id, owner_id: user_id,
        role: 'assistant', content: '', tool_calls: usedToolCalls,
      })
      toPersist.push({
        session_id: session.id, owner_id: user_id,
        role: 'tool', tool_results: usedToolResults,
      })
    }
    toPersist.push({
      session_id: session.id, owner_id: user_id,
      role: 'assistant', content: assistantText,
      tokens_in: totalTokensIn, tokens_out: totalTokensOut,
      llm_provider: usedProvider, llm_model: PROVIDER_CONFIG[usedProvider]?.model,
      latency_ms: Date.now() - startTime,
    })
    await admin.from('chat_messages').insert(toPersist)
    await admin.from('chat_sessions').update({
      message_count: (session.message_count || 0) + 1,
      last_message_at: new Date().toISOString(),
    }).eq('id', session.id)

    return res.status(200).json({
      ok: true, reply: assistantText,
      provider: usedProvider, model: PROVIDER_CONFIG[usedProvider]?.model,
      tools_used: usedToolCalls.length,
      tokens: { in: totalTokensIn, out: totalTokensOut },
      latency_ms: Date.now() - startTime,
    })
  } catch (e) {
    console.error('[agent]', e)
    return res.status(500).json({ error: e.message })
  }
}
