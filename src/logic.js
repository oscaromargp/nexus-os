/**
 * Nexus OS — Pure logic module (sin dependencias de DOM ni Supabase)
 * Expuesto como módulo para tests con Vitest.
 *
 * Las funciones aquí son copias exactas de app.js — si cambias la lógica
 * allá, actualiza aquí también (o refactoriza para importar desde aquí).
 */

// ─────────────────────────────────────────
// parseNode
// ─────────────────────────────────────────
export function parseNode(text) {
  const t = text.trim()
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
    }
  }
  // 2. Supertags: #tarea, #persona, #proyecto
  else if (t.includes('#tarea')) {
    type = 'kanban'
    metadata.status = 'todo'
    metadata.tags.push('#tarea')
    cleanContent = t.replace('#tarea', '').trim()
    metadata.label = cleanContent
  }
  else if (t.includes('#persona')) {
    type = 'contact'
    metadata.cType = 'persona'
    metadata.tags.push('#persona')
    cleanContent = t.replace('#persona', '').trim()
    metadata.name  = cleanContent
    metadata.label = cleanContent
    metadata.color = '#fdba74'
  }
  else if (t.includes('#proyecto')) {
    type = 'proyecto'
    cleanContent = t.replace('#proyecto', '').trim()
    metadata.label = cleanContent
    const slug = cleanContent.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
    metadata.tags = ['#proyecto', ...(slug ? ['#' + slug] : [])]
    metadata.project_slug = slug || undefined
  }
  else if (t.includes('#cotizacion') || t.includes('#cotización')) {
    type = 'cotizacion'
    metadata.tags.push('#cotizacion')
    metadata.status = 'pendiente'
    const amtMatch = t.match(/\$(\d+(?:[\.,]\d+)?)/)
    if (amtMatch) metadata.amount = parseFloat(amtMatch[1].replace(',', ''))
    const projMatch = t.match(/@(\w+)/)
    if (projMatch) metadata.project_tag = projMatch[1].toLowerCase()
    cleanContent = t.replace(/#cotizaci[oó]n/,'').replace(/\$[\d.,]+/,'').replace(/@\w+/,'').trim()
    metadata.label = cleanContent
  }
  else {
    type = 'note'
    metadata.supertags = []
  }

  return { type, metadata, content: cleanContent }
}

// ─────────────────────────────────────────
// _computeProjData
// Requiere el array `allNodes` como argumento explícito
// (en app.js usa el global; aquí lo recibe para ser testeable)
// ─────────────────────────────────────────
export function computeProjData(projectId, allNodes) {
  const p = allNodes.find(n => n.id === projectId)
  if (!p) return null
  const m = p.metadata || {}
  const budget = m.budget || 0

  const linkedIds = m.linkedTo || []
  const linked = linkedIds.map(id => allNodes.find(n => n.id === id)).filter(Boolean)
  const tagStr = (m.tags||[]).filter(t=>t.startsWith('#')).map(t=>t.slice(1).toLowerCase())
  const projSlug = m.project_slug || tagStr.find(t => t !== 'proyecto') || tagStr[0] || ''

  const byTag = projSlug ? allNodes.filter(n => {
    if (!(n.type==='cotizacion'||n.type==='expense'||n.type==='gasto'||n.type==='tarea')) return false
    const pt = (n.metadata?.project_tag||'').toLowerCase()
    const nt = (n.metadata?.tags||[]).map(t => t.toLowerCase())
    return pt === projSlug || tagStr.some(s => s !== 'proyecto' && pt === s) || nt.includes('#' + projSlug)
  }) : []

  const allLinked = [...new Map([...linked,...byTag].map(n=>[n.id,n])).values()]

  const cots        = allLinked.filter(n => n.type === 'cotizacion')
  const aceptadas   = cots.filter(n => n.metadata?.status === 'aceptada')
  const pendientes  = cots.filter(n => n.metadata?.status === 'pendiente')
  const comprometido= aceptadas.reduce((s,n) => s+(+n.metadata?.amount||0), 0)
  const pagos       = allLinked.filter(n => n.type==='expense'||n.type==='gasto')
  const pagado      = pagos.reduce((s,n) => s+(+n.metadata?.amount||0), 0)
  const pendientePago   = Math.max(0, comprometido - pagado)
  const sinComprometer  = Math.max(0, budget - comprometido)
  const overBudget  = comprometido > budget && budget > 0
  const pct         = budget > 0 ? Math.min(100, Math.round((comprometido/budget)*100)) : 0

  return {
    p, m, budget, tagStr, projSlug, allLinked,
    cots, aceptadas, pendientes, comprometido,
    pagos, pagado, pendientePago, sinComprometer, overBudget, pct,
  }
}
