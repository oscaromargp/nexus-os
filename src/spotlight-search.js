// Nexus OS — Spotlight Search global (⌘+K / Ctrl+K)
// Busca en TODOS los nodos + propiedades con Fuse.js (fuzzy match).
// Acción al seleccionar: navega al módulo + abre el item.

import Fuse from 'fuse.js'
import { supabase } from './supabase.js'

let _fuse = null
let _items = []
let _isOpen = false
let _overlay = null

const ICONS = {
  property:    '🏠',
  kanban:      '📋',
  note:        '📝',
  persona:     '👤',
  contact:     '👤',
  account:     '💰',
  expense:     '💸',
  income:      '💵',
  bill:        '🧾',
  proyecto:    '🏗',
  cotizacion:  '📄',
  event:       '📅',
  bitacora:    '📓',
  loan:        '🤝',
  card:        '💳',
  cot_catalogo:'📦',
}

const MODULE_MAP = {
  property:   'inmuebles',
  kanban:     'kanban',
  note:       'notes',
  persona:    'contacts',
  contact:    'contacts',
  account:    'finance',
  expense:    'movimientos',
  income:     'movimientos',
  bill:       'agenda',
  proyecto:   'proyectos',
  cotizacion: 'cotizaciones',
  event:      'calendar',
  bitacora:   'calendar',
  loan:       'finance',
  card:       'finance',
}

async function _loadIndex() {
  const items = []
  try {
    // Properties (no soft-deleted)
    const { data: props } = await supabase
      .from('properties')
      .select('id,titulo,folio_interno,calle,colonia,municipio,tipo,operacion,precio_venta,descripcion')
      .is('deleted_at', null)
      .limit(500)
    ;(props || []).forEach(p => items.push({
      type: 'property',
      id: p.id,
      title: p.titulo || `${p.tipo} en ${p.colonia || p.municipio || ''}`,
      subtitle: [p.folio_interno, p.colonia, p.municipio, p.precio_venta ? '$' + Number(p.precio_venta).toLocaleString('es-MX') : null].filter(Boolean).join(' · '),
      search: [p.titulo, p.folio_interno, p.calle, p.colonia, p.municipio, p.descripcion].filter(Boolean).join(' '),
      data: p,
    }))
  } catch (e) { console.warn('[spotlight] props', e.message) }

  try {
    // Nodes (todo lo demás)
    const { data: nodes } = await supabase
      .from('nodes')
      .select('id,type,content,metadata')
      .limit(2000)
    ;(nodes || []).forEach(n => {
      const m = n.metadata || {}
      const name = m.name || m.label || m.title || n.content?.slice(0, 80) || ''
      if (!name) return
      const subtitle = [
        n.type,
        m.phone, m.email,
        m.amount ? '$' + Number(m.amount).toLocaleString('es-MX') : null,
        m.status,
      ].filter(Boolean).join(' · ').slice(0, 100)
      items.push({
        type: n.type,
        id: n.id,
        title: name,
        subtitle,
        search: [name, n.content, m.notes, m.tags?.join(' '), JSON.stringify(m).slice(0, 200)].filter(Boolean).join(' '),
        data: n,
      })
    })
  } catch (e) { console.warn('[spotlight] nodes', e.message) }

  _items = items
  _fuse = new Fuse(items, {
    keys: ['title', 'subtitle', 'search'],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  })
}

function _renderResults(query) {
  if (!_fuse || !query) {
    return `<div style="padding:30px 20px;text-align:center;color:#64748b;font-size:13px;">
      Escribe para buscar en inmuebles, contactos, notas, finanzas, proyectos…
      <div style="margin-top:16px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;font-size:11px;">
        <kbd style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:3px 8px;border-radius:5px;font-family:monospace;">↑↓ navegar</kbd>
        <kbd style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:3px 8px;border-radius:5px;font-family:monospace;">↵ abrir</kbd>
        <kbd style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:3px 8px;border-radius:5px;font-family:monospace;">esc cerrar</kbd>
      </div>
    </div>`
  }
  const results = _fuse.search(query).slice(0, 12)
  if (!results.length) {
    return `<div style="padding:40px 20px;text-align:center;color:#94a3b8;font-size:13px;">
      Sin resultados para "<strong>${escHtml(query)}</strong>"
    </div>`
  }
  return results.map((r, i) => {
    const it = r.item
    const icon = ICONS[it.type] || '•'
    return `
      <button data-spotlight-i="${i}" onclick="window.__spotlightSelect?.(${i})"
        style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.04);color:#e8f0f9;text-align:left;cursor:pointer;font-size:13px;${i===0?'background:rgba(34,211,238,0.08);':''}">
        <span style="font-size:20px;flex-shrink:0;">${icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(it.title)}</div>
          <div style="font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${escHtml(it.subtitle || '')}</div>
        </div>
        <span style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0;">${it.type}</span>
      </button>
    `
  }).join('')
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}

let _currentResults = []

export async function openSpotlight() {
  if (_isOpen) return
  _isOpen = true

  // Lazy-load del index la primera vez
  if (!_fuse) {
    // Skeleton overlay mientras carga
    _overlay = _createOverlay()
    document.body.appendChild(_overlay)
    _overlay.querySelector('#sp-results').innerHTML = `<div style="padding:30px;text-align:center;color:#64748b;">⏳ Indexando…</div>`
    await _loadIndex()
  } else {
    _overlay = _createOverlay()
    document.body.appendChild(_overlay)
  }

  const input = _overlay.querySelector('#sp-input')
  const resultsEl = _overlay.querySelector('#sp-results')
  let selectedIdx = 0

  const rerender = () => {
    const q = input.value.trim()
    _currentResults = q ? (_fuse?.search(q).slice(0, 12).map(r => r.item) || []) : []
    resultsEl.innerHTML = _renderResults(q)
    selectedIdx = 0
  }
  rerender()
  input.focus()

  input.oninput = rerender

  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, _currentResults.length - 1); _highlight(selectedIdx); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); _highlight(selectedIdx); }
    else if (e.key === 'Enter') { e.preventDefault(); _select(selectedIdx) }
    else if (e.key === 'Escape') { closeSpotlight() }
  }

  function _highlight(i) {
    resultsEl.querySelectorAll('[data-spotlight-i]').forEach((btn, idx) => {
      btn.style.background = idx === i ? 'rgba(34,211,238,0.08)' : 'transparent'
      if (idx === i) btn.scrollIntoView({ block: 'nearest' })
    })
  }

  function _select(i) {
    const it = _currentResults[i]
    if (!it) return
    closeSpotlight()
    _navigateToItem(it)
    try { window.nexusTrack?.('action:spotlight_select', { type: it.type }) } catch {}
  }

  window.__spotlightSelect = _select
}

function _createOverlay() {
  const o = document.createElement('div')
  o.id = 'spotlight-overlay'
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(8px);z-index:10500;display:flex;align-items:flex-start;justify-content:center;padding:80px 16px 20px;'
  o.onclick = e => { if (e.target === o) closeSpotlight() }
  o.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(34,211,238,0.25);border-radius:14px;width:100%;max-width:600px;max-height:75vh;display:flex;flex-direction:column;box-shadow:0 28px 80px rgba(0,0,0,0.7);overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:18px;color:#22d3ee;">🔍</span>
        <input id="sp-input" type="search" autocomplete="off"
          placeholder="Buscar en Nexus OS…"
          style="flex:1;background:transparent;border:none;outline:none;color:#e8f0f9;font-size:15px;"/>
        <kbd style="font-size:10px;color:#475569;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;">ESC</kbd>
      </div>
      <div id="sp-results" style="overflow-y:auto;flex:1;"></div>
    </div>
  `
  return o
}

export function closeSpotlight() {
  if (!_isOpen) return
  _isOpen = false
  _overlay?.remove()
  _overlay = null
}

function _navigateToItem(it) {
  const mod = MODULE_MAP[it.type]
  if (mod) window.switchView?.(mod)
  // Para inmuebles, abre el detalle
  if (it.type === 'property') {
    setTimeout(() => window.openPropDetail?.(it.id), 300)
  }
  // Para nodos persona, abre la ficha del contacto
  else if ((it.type === 'persona' || it.type === 'contact') && window.openContactSheet) {
    setTimeout(() => window.openContactSheet(it.id), 300)
  }
}

// Refresh del índice (después de captar/borrar)
export function refreshSpotlightIndex() {
  _fuse = null
}

// Atajos de teclado globales
if (typeof window !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    // ⌘+K o Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      openSpotlight()
    }
    // Solo en cel: tap del icono lupa (lo agregamos abajo)
  })
  window.openSpotlight = openSpotlight
  window.closeSpotlight = closeSpotlight
  window.refreshSpotlightIndex = refreshSpotlightIndex
}
