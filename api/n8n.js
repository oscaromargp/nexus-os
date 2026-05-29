/**
 * Nexus OS — n8n Webhook Endpoint
 * Vercel Serverless Function: POST /api/n8n
 *
 * Recibe mensajes desde n8n (Telegram, WhatsApp, schedule, etc.) y
 * crea nodos en Supabase con el mismo parser semántico que usa la app.
 *
 * Auth: Bearer token → NEXUS_WEBHOOK_SECRET
 * Requiere: VITE_SUPABASE_URL, NEXUS_SUPABASE_SERVICE_KEY, NEXUS_WEBHOOK_SECRET
 */

// ── Parser semántico inline (sin dependencias de browser) ────────────────────
function parseNode(text) {
  const t = (text || '').trim()
  let type = 'note'
  let metadata = { tags: [], source: 'webhook' }
  let cleanContent = t

  // Fecha: detecta YYYY-MM-DD o patrones simples
  function extractSimpleDate(s) {
    const isoMatch = s.match(/\b(\d{4}-\d{2}-\d{2})\b/)
    if (isoMatch) return { date: isoMatch[1], cleanText: s.replace(isoMatch[0], '').trim() }
    const today = new Date()
    const pad = n => String(n).padStart(2, '0')
    const isoToday = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`
    if (/\bhoy\b/i.test(s))   return { date: isoToday, cleanText: s.replace(/\bhoy\b/i,'').trim() }
    const tmrw = new Date(today); tmrw.setDate(tmrw.getDate()+1)
    const isoTmrw = `${tmrw.getFullYear()}-${pad(tmrw.getMonth()+1)}-${pad(tmrw.getDate())}`
    if (/\bma[nñ]ana\b/i.test(s)) return { date: isoTmrw, cleanText: s.replace(/\bma[nñ]ana\b/i,'').trim() }
    return { date: null, cleanText: s }
  }

  // 1. Finanzas: +$100 descripción @cuenta #tag
  if (t.startsWith('+$') || t.startsWith('-$')) {
    const isIncome = t.startsWith('+$')
    type = isIncome ? 'income' : 'expense'
    const acMatch = t.match(/@(\w+)/)
    const match   = t.match(/^([+-]\$[\d.]+)\s*(.*)/)
    if (match) {
      metadata.amount   = parseFloat(match[1].replace(/[+$-]/g, ''))
      metadata.currency = 'MXN'
      const rawLabel    = match[2] || (isIncome ? 'Ingreso' : 'Gasto')
      metadata.label    = rawLabel.replace(/@\w+/g,'').replace(/#\w+/g,'').trim() || (isIncome ? 'Ingreso' : 'Gasto')
      cleanContent      = metadata.label
      if (acMatch) metadata.account_hint = acMatch[1].toLowerCase()
      const hashTags    = [...t.matchAll(/#(\w+)/g)].map(m => '#'+m[1].toLowerCase())
      if (hashTags.length) metadata.tags = hashTags
      const { date } = extractSimpleDate(metadata.label)
      if (date) { metadata.date = date }
    }
    return { type, metadata, content: cleanContent }
  }

  // 2. #tarea
  if (t.includes('#tarea')) {
    type = 'kanban'
    metadata.status = 'todo'
    metadata.tags.push('#tarea')
    cleanContent = t.replace(/#tarea/gi,'').trim()
    // Priority
    if (/\bp1\b/i.test(cleanContent)) { metadata.priority = 'alta'; cleanContent = cleanContent.replace(/\bp1\b/i,'').trim() }
    else if (/\bp2\b/i.test(cleanContent)) { metadata.priority = 'media'; cleanContent = cleanContent.replace(/\bp2\b/i,'').trim() }
    else if (/\bp3\b/i.test(cleanContent)) { metadata.priority = 'baja'; cleanContent = cleanContent.replace(/\bp3\b/i,'').trim() }
    const { date, cleanText } = extractSimpleDate(cleanContent)
    if (date) { metadata.due_date = date; metadata.date_deadline = date; cleanContent = cleanText }
    const projMatch = cleanContent.match(/#(\w+)/)
    if (projMatch && projMatch[1].toLowerCase() !== 'tarea') {
      metadata.project_tag = projMatch[1].toLowerCase()
      metadata.tags.push('#'+projMatch[1].toLowerCase())
      cleanContent = cleanContent.replace('#'+projMatch[1],'').trim()
    }
    metadata.label = cleanContent
    return { type, metadata, content: cleanContent }
  }

  // 3. #persona
  if (t.includes('#persona')) {
    type = 'contact'
    cleanContent = t.replace(/#persona/gi,'').trim()
    metadata.cType = 'persona'
    metadata.name  = cleanContent
    metadata.label = cleanContent
    metadata.tags  = ['#persona']
    return { type, metadata, content: cleanContent }
  }

  // 4. #proyecto
  if (t.includes('#proyecto')) {
    type = 'proyecto'
    cleanContent = t.replace(/#proyecto/gi,'').trim()
    metadata.label = cleanContent
    const slug = cleanContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'')
    metadata.tags = ['#proyecto', ...(slug ? ['#'+slug] : [])]
    metadata.project_slug = slug || undefined
    return { type, metadata, content: cleanContent }
  }

  // 5. Default note
  const { date: noteDate } = extractSimpleDate(cleanContent)
  if (noteDate) metadata.due_date = noteDate
  return { type, metadata, content: cleanContent }
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  // Auth: Bearer token
  const secret = process.env.NEXUS_WEBHOOK_SECRET
  if (secret) {
    const auth = req.headers['authorization'] || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token || token !== secret) {
      return res.status(401).json({ error: 'unauthorized' })
    }
  }

  const body = req.body || {}

  // Modo raw: body ya tiene { type, content, metadata, user_id }
  if (body.type && body.content && body.user_id) {
    const node = {
      type:     body.type,
      content:  body.content,
      metadata: body.metadata || {},
      owner_id: body.user_id,
    }
    return insertNode(res, node)
  }

  // Modo texto: { text, user_id, source? }
  const text = (body.text || body.message || '').trim()
  if (!text) {
    return res.status(400).json({ error: 'missing text or message field' })
  }
  if (!body.user_id) {
    return res.status(400).json({ error: 'missing user_id' })
  }

  const parsed = parseNode(text)
  if (body.source) parsed.metadata.source = body.source

  const node = {
    type:     parsed.type,
    content:  parsed.content,
    metadata: parsed.metadata,
    owner_id: body.user_id,
  }

  return insertNode(res, node)
}

// ── Insertar en Supabase con service role key (bypassa RLS) ──────────────────
async function insertNode(res, node) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const serviceKey  = process.env.NEXUS_SUPABASE_SERVICE_KEY || ''

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'supabase config missing' })
  }

  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(node),
    })

    if (!resp.ok) {
      const err = await resp.text()
      return res.status(502).json({ error: 'supabase insert failed', detail: err })
    }

    const data = await resp.json()
    res.setHeader('Cache-Control', 'no-store')
    return res.status(201).json({ ok: true, node: Array.isArray(data) ? data[0] : data })
  } catch (e) {
    return res.status(500).json({ error: 'internal error', detail: e.message })
  }
}
