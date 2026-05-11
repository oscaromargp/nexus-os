/**
 * Nexus OS — Semantic Parser v2.0
 * Bilingual (ES/EN), chrono-node dates, priority detection
 *
 * Backward-compatible: every shape produced by the original parseNode()
 * is preserved. New metadata fields (priority/due_date) are additive.
 */
import * as chrono from 'chrono-node'

// ── Priority patterns ─────────────────────────────────────────────────────────
const PRIORITY_PATTERNS = [
  { re: /\bp1\b/i, val: 'alta' },
  { re: /\bp2\b/i, val: 'media' },
  { re: /\bp3\b/i, val: 'baja' },
  { re: /!alta\b/i, val: 'alta' },
  { re: /!media\b/i, val: 'media' },
  { re: /!baja\b/i, val: 'baja' },
  { re: /!high\b/i, val: 'alta' },
  { re: /!medium\b/i, val: 'media' },
  { re: /!low\b/i, val: 'baja' },
]

// ── Spanish casual date patterns ─────────────────────────────────────────────
const ES_PATTERNS = [
  { pattern: /\bhoy\b/i, fn: () => new Date() },
  { pattern: /\bma[nñ]ana\b/i, fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d } },
  { pattern: /\bpasado\s+ma[nñ]ana\b/i, fn: () => { const d = new Date(); d.setDate(d.getDate() + 2); return d } },
]

const ES_WEEKDAYS = {
  lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 0
}

function toISODate(d) {
  // YYYY-MM-DD in local time
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().split('T')[0]
}

/**
 * Extract a date from natural language text.
 * Returns { date: 'YYYY-MM-DD'|null, cleanText: string }
 */
export function extractDate(text) {
  if (!text || typeof text !== 'string') return { date: null, cleanText: text || '' }
  const now = new Date()
  let cleanText = text

  // 1. Spanish casual patterns first (hoy, mañana, pasado mañana)
  // "pasado mañana" must come before "mañana" — ordering matters
  const pmRe = /\bpasado\s+ma[nñ]ana\b/i
  if (pmRe.test(text)) {
    const d = new Date(); d.setDate(d.getDate() + 2)
    cleanText = text.replace(pmRe, '').replace(/\s{2,}/g, ' ').trim()
    return { date: toISODate(d), cleanText }
  }
  for (const p of ES_PATTERNS) {
    if (p.pattern === pmRe) continue
    if (p.pattern.test(text)) {
      const d = p.fn()
      cleanText = text.replace(p.pattern, '').replace(/\s{2,}/g, ' ').trim()
      return { date: toISODate(d), cleanText }
    }
  }

  // 2. Spanish weekday detection — forward-looking
  const weekdayRe = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i
  const wdMatch = text.match(weekdayRe)
  if (wdMatch) {
    const key = wdMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const target = ES_WEEKDAYS[key] ?? ES_WEEKDAYS[wdMatch[1].toLowerCase()]
    if (target !== undefined) {
      const today = now.getDay()
      let diff = target - today
      if (diff < 0) diff += 7
      const d = new Date(now); d.setDate(d.getDate() + diff)
      cleanText = text.replace(wdMatch[0], '').replace(/\s{2,}/g, ' ').trim()
      return { date: toISODate(d), cleanText }
    }
  }

  // 3. Explicit YYYY-MM-DD
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoMatch) {
    cleanText = text.replace(isoMatch[0], '').replace(/\s{2,}/g, ' ').trim()
    return { date: isoMatch[1], cleanText }
  }

  // 4. DD/MM or DD-MM-YYYY style (common in Mexico)
  const mxMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\b/)
  if (mxMatch) {
    const day = mxMatch[1].padStart(2, '0')
    const month = mxMatch[2].padStart(2, '0')
    const year = mxMatch[3] || String(now.getFullYear())
    cleanText = text.replace(mxMatch[0], '').replace(/\s{2,}/g, ' ').trim()
    return { date: `${year}-${month}-${day}`, cleanText }
  }

  // 5. chrono-node for English + remaining natural-language patterns
  try {
    const results = chrono.parse(text, now, { forwardDate: true })
    if (results.length > 0) {
      const r = results[0]
      const date = toISODate(r.start.date())
      cleanText = (text.slice(0, r.index) + text.slice(r.index + r.text.length))
        .replace(/\s{2,}/g, ' ').trim()
      return { date, cleanText }
    }
  } catch (e) {
    // chrono-node failed — continue without date
  }

  return { date: null, cleanText: text }
}

/**
 * Extract priority from text.
 * Returns { priority: 'alta'|'media'|'baja'|null, cleanText: string }
 */
export function extractPriority(text) {
  if (!text || typeof text !== 'string') return { priority: null, cleanText: text || '' }
  for (const p of PRIORITY_PATTERNS) {
    if (p.re.test(text)) {
      const cleanText = text.replace(p.re, '').replace(/\s{2,}/g, ' ').trim()
      return { priority: p.val, cleanText }
    }
  }
  return { priority: null, cleanText: text }
}

/**
 * Full semantic parse — enhanced version of the original parseNode().
 * Maintains 100% backward compatibility on output shape.
 * Additive fields when detected: metadata.priority, metadata.due_date
 */
export function parseNode(text) {
  const t = (text || '').trim()
  let type = 'note'
  let metadata = { tags: [] }
  let cleanContent = t

  // 1. Finanzas: +$ o -$
  if (t.startsWith('+$') || t.startsWith('-$')) {
    const isIncome = t.startsWith('+$')
    type = isIncome ? 'income' : 'expense'
    const acMatch = t.match(/@(\w+)/)
    const acHint = acMatch ? acMatch[1].toLowerCase() : null
    const match = t.match(/^([+-]\$\d+(?:\.\d+)?)\s*(.*)/)
    if (match) {
      metadata.amount = parseFloat(match[1].replace('+$', '').replace('-$', ''))
      metadata.currency = 'USD'
      const rawLabel = match[2] || (isIncome ? 'Ingreso' : 'Gasto')
      metadata.label = rawLabel.replace(/@\w+/g, '').replace(/#\w+/g, '').trim() || (isIncome ? 'Ingreso' : 'Gasto')
      cleanContent = metadata.label
      if (acHint) metadata.account_hint = acHint
      const hashTags = [...t.matchAll(/#(\w+)/g)].map(m => '#' + m[1].toLowerCase())
      if (hashTags.length) metadata.tags = hashTags
      // Extract date from the label portion (non-destructive of amount/account)
      const { date, cleanText } = extractDate(metadata.label)
      if (date) {
        metadata.date = date
        metadata.label = cleanText || metadata.label
        cleanContent = metadata.label
      }
    }
    return { type, metadata, content: cleanContent }
  }

  // 2. Supertag: #tarea
  if (t.includes('#tarea')) {
    type = 'kanban'
    metadata.status = 'todo'
    metadata.tags.push('#tarea')
    cleanContent = t.replace(/#tarea/gi, '').trim()

    // Priority: legacy ! at start/end → 'alta', then new p1/p2/p3/!alta…
    if (/^!|!$/.test(cleanContent)) {
      metadata.priority = 'alta'
      cleanContent = cleanContent.replace(/^!|!$/g, '').trim()
    } else {
      const { priority, cleanText } = extractPriority(cleanContent)
      if (priority) { metadata.priority = priority; cleanContent = cleanText }
      else metadata.priority = null
    }

    // Date: natural language first
    const { date, cleanText: afterDate } = extractDate(cleanContent)
    if (date) {
      metadata.due_date = date
      metadata.date_deadline = date  // legacy alias
      cleanContent = afterDate
    } else {
      // legacy explicit YYYY-MM-DD detection (already handled inside extractDate,
      // but keep defensive fallback)
      const dlMatch = cleanContent.match(/\b(\d{4}-\d{2}-\d{2})\b/)
      if (dlMatch) {
        metadata.date_deadline = dlMatch[1]
        metadata.due_date = dlMatch[1]
        cleanContent = cleanContent.replace(dlMatch[1], '').trim()
      }
    }

    // Project link via #slug (excluding #tarea itself)
    const taskProjMatch = cleanContent.match(/#(\w+)/)
    if (taskProjMatch) {
      const slug = taskProjMatch[1].toLowerCase()
      if (slug !== 'tarea') {
        metadata.project_tag = slug
        metadata.tags.push('#' + slug)
        cleanContent = cleanContent.replace('#' + taskProjMatch[1], '').trim()
      }
    }
    metadata.label = cleanContent
    return { type, metadata, content: cleanContent }
  }

  // 3. #persona
  if (t.includes('#persona')) {
    type = 'contact'
    metadata.cType = 'persona'
    metadata.tags.push('#persona')
    cleanContent = t.replace(/#persona/gi, '').trim()
    metadata.name = cleanContent
    metadata.label = cleanContent
    metadata.color = '#fdba74'
    return { type, metadata, content: cleanContent }
  }

  // 4. #proyecto
  if (t.includes('#proyecto')) {
    type = 'proyecto'
    cleanContent = t.replace(/#proyecto/gi, '').trim()
    metadata.label = cleanContent
    const slug = cleanContent.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
    metadata.tags = ['#proyecto', ...(slug ? ['#' + slug] : [])]
    metadata.project_slug = slug || undefined
    return { type, metadata, content: cleanContent }
  }

  // 5. #cotizacion
  if (t.includes('#cotizacion') || t.includes('#cotización')) {
    type = 'cotizacion'
    metadata.tags.push('#cotizacion')
    metadata.status = 'pendiente'
    const amtMatch = t.match(/\$(\d+(?:[\.,]\d+)?)/)
    if (amtMatch) metadata.amount = parseFloat(amtMatch[1].replace(',', ''))
    const projMatch = t.match(/@(\w+)/)
    if (projMatch) metadata.project_tag = projMatch[1].toLowerCase()
    cleanContent = t.replace(/#cotizaci[oó]n/gi, '').replace(/\$[\d.,]+/, '').replace(/@\w+/, '').trim()
    metadata.label = cleanContent
    return { type, metadata, content: cleanContent }
  }

  // 6. #habito — habit tracking
  if (t.includes('#habito') || t.includes('#hábito')) {
    type = 'note'
    cleanContent = t.replace(/#h[aá]bito/gi, '').trim()
    metadata.tags = ['#habito']
    metadata.is_habit = true
    const cbMatch = cleanContent.match(/^-\s*\[([ xX])\]\s*(.+)/)
    if (cbMatch) {
      metadata.habit_done = cbMatch[1].toLowerCase() === 'x'
      metadata.habit_name = cbMatch[2].trim()
      cleanContent = cbMatch[2].trim()
    } else {
      metadata.habit_name = cleanContent
    }
    metadata.habit_date = new Date().toISOString().split('T')[0]
    return { type, metadata, content: cleanContent }
  }

  // 7. Default note — apply priority and date detection (additive)
  type = 'note'
  metadata.supertags = []

  const { priority, cleanText: afterPriority } = extractPriority(cleanContent)
  if (priority) { metadata.priority = priority; cleanContent = afterPriority }

  const { date: noteDate, cleanText: afterNoteDate } = extractDate(cleanContent)
  if (noteDate) { metadata.due_date = noteDate; cleanContent = afterNoteDate }

  return { type, metadata, content: cleanContent }
}

export default { parseNode, extractDate, extractPriority }
