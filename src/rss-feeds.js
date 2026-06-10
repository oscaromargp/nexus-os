// Nexus OS — Módulo RSS Feeds (por proyecto)
//
// Renderiza el contenido de la pestaña 📡 RSS dentro del detalle de proyecto.
// - Lista fuentes con toggle on/off + eliminar
// - Form para agregar fuente (plataforma + handle)
// - Stream de items con filtros por status
// - Acciones rápidas: Aceptar, Rechazar, Editar (notas), Programar, Publicar

import { supabase } from './supabase.js'

// Plataformas soportadas (UI)
export const PLATFORMS = [
  { id: 'youtube',    label: 'YouTube',    icon: '🎬', placeholder: '@badbunnypr o UCxxxx', help: 'Handle o channel_id' },
  { id: 'instagram',  label: 'Instagram',  icon: '📷', placeholder: 'badbunnypr',           help: 'Usuario sin @' },
  { id: 'tiktok',     label: 'TikTok',     icon: '🎵', placeholder: 'badbunny',             help: 'Usuario sin @' },
  { id: 'spotify',    label: 'Spotify',    icon: '🟢', placeholder: '4q3ewBCX7sLwd24euuV69X', help: 'Artist ID (URL: /artist/<ID>)' },
  { id: 'twitter',    label: 'Twitter/X',  icon: '🐦', placeholder: 'sanbenito',            help: 'Usuario sin @' },
  { id: 'facebook',   label: 'Facebook',   icon: '📘', placeholder: 'BadBunnyPR',           help: 'Nombre de página' },
  { id: 'soundcloud', label: 'SoundCloud', icon: '🟠', placeholder: 'badbunny',             help: 'Nombre de usuario' },
  { id: 'bandcamp',   label: 'Bandcamp',   icon: '🎶', placeholder: 'artista',              help: 'Subdomain (artista.bandcamp.com)' },
  { id: 'twitch',     label: 'Twitch',     icon: '🟣', placeholder: 'canal',                help: 'Nombre de canal' },
  { id: 'wordpress',  label: 'Blog WP',    icon: '📰', placeholder: 'misitio.com',          help: 'Dominio del sitio' },
  { id: 'news',       label: 'Google News', icon: '📡', placeholder: '"Bad Bunny" música',   help: 'Búsqueda con comillas' },
  { id: 'rss',        label: 'RSS directo', icon: '📰', placeholder: 'https://sitio.com/feed.xml', help: 'URL completa' },
]

const STATUS_CFG = {
  pending:      { label: 'Pendiente',   color: '#fbbf24', emoji: '🟡' },
  accepted:     { label: 'Aceptado',    color: '#22c55e', emoji: '✓' },
  rejected:     { label: 'Rechazado',   color: '#94a3b8', emoji: '✗' },
  in_progress:  { label: 'En proceso',  color: '#60a5fa', emoji: '⏳' },
  edited:       { label: 'Editado',     color: '#a78bfa', emoji: '✏️' },
  scheduled:    { label: 'Programado',  color: '#fb923c', emoji: '📅' },
  published:    { label: 'Publicado',   color: '#34d399', emoji: '🚀' },
  archived:     { label: 'Archivado',   color: '#6b7280', emoji: '📦' },
}

const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map(p => [p.id, p]))

// Estado por proyecto (in-memory)
const _state = {}  // projectId → { sources, items, filterStatus, filterPlatform }

async function _api(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session) headers.Authorization = 'Bearer ' + session.access_token
  const r = await fetch('/api/rss', {
    method: 'POST', headers,
    body: JSON.stringify({ action, ...payload }),
  })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.error || 'API fail')
  return j
}

async function _refresh(projectId) {
  const [s, i] = await Promise.all([
    _api('list_sources', { project_id: projectId }),
    _api('list_items',   { project_id: projectId, limit: 100 }),
  ])
  _state[projectId] = {
    ..._state[projectId],
    sources: s.sources || [],
    items:   i.items || [],
  }
}

function _esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}

function _timeAgo(iso) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return 'hace un momento'
  if (ms < 3600000) return 'hace ' + Math.floor(ms / 60000) + 'm'
  if (ms < 86400000) return 'hace ' + Math.floor(ms / 3600000) + 'h'
  if (ms < 7 * 86400000) return 'hace ' + Math.floor(ms / 86400000) + 'd'
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

// ── Render principal ──────────────────────────────────────────────
export async function renderProjectRssTab(projectId) {
  if (!_state[projectId]) _state[projectId] = { sources: [], items: [], filterStatus: '', filterPlatform: '' }
  const state = _state[projectId]

  // Loading inicial
  let html = '<div style="padding:12px;color:#94a3b8;font-size:13px;">⏳ Cargando feeds…</div>'
  let mount = document.getElementById('rss-tab-content-' + projectId)
  if (!mount) {
    // El contenedor lo crea _renderProjRss() — placeholder
    return `<div id="rss-tab-content-${projectId}">${html}</div>`
  }
  mount.innerHTML = html

  try {
    await _refresh(projectId)
  } catch (e) {
    mount.innerHTML = `<div style="padding:20px;color:#f87171;">Error: ${_esc(e.message)}</div>`
    return ''
  }

  const { sources, items, filterStatus, filterPlatform } = state
  const filteredItems = items.filter(it => {
    if (filterStatus && it.status !== filterStatus) return false
    if (filterPlatform && it.source?.platform !== filterPlatform) return false
    return true
  })

  const statusCounts = {}
  items.forEach(it => { statusCounts[it.status] = (statusCounts[it.status] || 0) + 1 })

  html = `
    <div style="max-width:1100px;">

      <!-- ── HEADER ── -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <div>
          <h3 style="margin:0;font-size:18px;font-weight:800;color:#e5e7eb;">📡 RSS Feeds</h3>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">
            Rastrea contenido nuevo de artistas, canales y sitios. Se revisa cada 15 min.
          </p>
        </div>
        <button data-rss-act="add-source" data-pid="${projectId}"
          style="padding:8px 14px;background:linear-gradient(135deg,#34d399,#22c55e);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">
          + Agregar fuente
        </button>
      </div>

      <!-- ── FUENTES ── -->
      <div style="background:rgba(255,255,255,0.02);border:1px solid #1f2937;border-radius:12px;padding:12px;margin-bottom:20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#94a3b8;margin-bottom:8px;font-weight:700;">
          Fuentes registradas (${sources.length})
        </div>
        ${sources.length === 0 ? `
          <div style="padding:18px;text-align:center;color:#6b7280;font-size:13px;">
            Aún no hay fuentes. Pulsa <b style="color:#34d399;">+ Agregar fuente</b> para comenzar.
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${sources.map(s => {
              const pf = PLATFORM_BY_ID[s.platform] || { icon: '📡', label: s.platform }
              return `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid #1f2937;border-radius:8px;">
                  <div style="font-size:20px;">${pf.icon}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:600;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${_esc(s.label || s.handle || s.feed_url)}
                    </div>
                    <div style="font-size:11px;color:#6b7280;">
                      ${pf.label}${s.artist_name ? ' · ' + _esc(s.artist_name) : ''}
                      ${s.last_check_at ? ' · revisado ' + _timeAgo(s.last_check_at) : ' · sin revisar'}
                      ${s.fail_count > 2 ? ' · ⚠️ ' + s.fail_count + ' fallos' : ''}
                    </div>
                  </div>
                  <button data-rss-act="toggle-source" data-sid="${s.id}" data-pid="${projectId}"
                    title="${s.enabled ? 'Pausar' : 'Reactivar'}"
                    style="padding:5px 10px;background:${s.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)'};border:1px solid ${s.enabled ? 'rgba(34,197,94,0.25)' : 'rgba(148,163,184,0.25)'};color:${s.enabled ? '#22c55e' : '#94a3b8'};border-radius:6px;cursor:pointer;font-size:11px;">
                    ${s.enabled ? '🟢 Activo' : '⏸ Pausado'}
                  </button>
                  <button data-rss-act="delete-source" data-sid="${s.id}" data-pid="${projectId}"
                    title="Eliminar"
                    style="padding:5px 8px;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);color:#f87171;border-radius:6px;cursor:pointer;font-size:11px;">
                    🗑
                  </button>
                </div>
              `
            }).join('')}
          </div>
        `}
      </div>

      <!-- ── FILTROS ── -->
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:12px;color:#9ca3af;font-weight:600;">Filtrar:</span>
        <button data-rss-act="filter-status" data-val="" data-pid="${projectId}"
          style="padding:5px 10px;background:${filterStatus === '' ? 'rgba(96,165,250,0.15)' : 'transparent'};border:1px solid ${filterStatus === '' ? '#60a5fa' : '#374151'};color:${filterStatus === '' ? '#60a5fa' : '#9ca3af'};border-radius:6px;font-size:11px;cursor:pointer;">
          Todos (${items.length})
        </button>
        ${Object.entries(STATUS_CFG).map(([k, cfg]) => {
          const n = statusCounts[k] || 0
          if (n === 0 && filterStatus !== k) return ''
          const active = filterStatus === k
          return `
            <button data-rss-act="filter-status" data-val="${k}" data-pid="${projectId}"
              style="padding:5px 10px;background:${active ? cfg.color + '22' : 'transparent'};border:1px solid ${active ? cfg.color : '#374151'};color:${active ? cfg.color : '#9ca3af'};border-radius:6px;font-size:11px;cursor:pointer;">
              ${cfg.emoji} ${cfg.label} (${n})
            </button>
          `
        }).join('')}
      </div>

      <!-- ── ITEMS ── -->
      ${filteredItems.length === 0 ? `
        <div style="padding:36px;text-align:center;background:rgba(255,255,255,0.02);border:1px dashed #374151;border-radius:12px;color:#6b7280;">
          📭 ${items.length === 0 ? 'Aún sin contenido detectado — espera al próximo ciclo (15 min)' : 'Sin items con este filtro'}
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${filteredItems.map(it => _renderItemCard(it, projectId)).join('')}
        </div>
      `}
    </div>
  `

  mount.innerHTML = html
  _attachHandlers(mount, projectId)
  return ''
}

function _renderItemCard(it, projectId) {
  const cfg = STATUS_CFG[it.status] || STATUS_CFG.pending
  const pf = PLATFORM_BY_ID[it.source?.platform] || { icon: '📡', label: 'RSS' }
  return `
    <div style="display:flex;gap:12px;padding:12px;background:rgba(255,255,255,0.02);border:1px solid #1f2937;border-radius:10px;border-left:3px solid ${cfg.color};">
      ${it.thumbnail ? `
        <img src="${_esc(it.thumbnail)}" alt="" loading="lazy"
          style="width:80px;height:80px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#0a0e13;"/>
      ` : `
        <div style="width:80px;height:80px;border-radius:8px;background:#0a0e13;display:grid;place-items:center;font-size:28px;flex-shrink:0;">${pf.icon}</div>
      `}
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="font-size:10px;background:${cfg.color}22;color:${cfg.color};padding:2px 6px;border-radius:4px;font-weight:700;">${cfg.emoji} ${cfg.label}</span>
          <span style="font-size:11px;color:#9ca3af;">${pf.icon} ${pf.label}</span>
          ${it.source?.artist_name ? `<span style="font-size:11px;color:#a78bfa;">· ${_esc(it.source.artist_name)}</span>` : ''}
          <span style="font-size:11px;color:#6b7280;">· ${_timeAgo(it.published_at || it.created_at)}</span>
        </div>
        <a href="${_esc(it.url)}" target="_blank" rel="noopener"
          style="font-size:14px;font-weight:600;color:#e5e7eb;text-decoration:none;display:block;line-height:1.4;margin-bottom:4px;">
          ${_esc((it.title || '(sin título)').slice(0, 140))}
        </a>
        ${it.description ? `<div style="font-size:12px;color:#9ca3af;line-height:1.4;max-height:34px;overflow:hidden;">${_esc(it.description.slice(0, 200))}</div>` : ''}
        ${it.notes ? `<div style="margin-top:6px;font-size:11px;color:#fbbf24;padding:4px 8px;background:rgba(251,191,36,0.08);border-left:2px solid #fbbf24;border-radius:0 4px 4px 0;">📝 ${_esc(it.notes.slice(0, 200))}</div>` : ''}
        <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">
          ${it.status !== 'accepted' ? `<button data-rss-act="set-status" data-id="${it.id}" data-pid="${projectId}" data-val="accepted" style="padding:4px 8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#22c55e;border-radius:5px;font-size:11px;cursor:pointer;">✓ Aceptar</button>` : ''}
          ${it.status !== 'rejected' ? `<button data-rss-act="set-status" data-id="${it.id}" data-pid="${projectId}" data-val="rejected" style="padding:4px 8px;background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.2);color:#94a3b8;border-radius:5px;font-size:11px;cursor:pointer;">✗ Rechazar</button>` : ''}
          <button data-rss-act="edit-notes" data-id="${it.id}" data-pid="${projectId}" style="padding:4px 8px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);color:#a78bfa;border-radius:5px;font-size:11px;cursor:pointer;">📝 Nota</button>
          <button data-rss-act="schedule" data-id="${it.id}" data-pid="${projectId}" style="padding:4px 8px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.2);color:#fb923c;border-radius:5px;font-size:11px;cursor:pointer;">📅 Programar</button>
          <button data-rss-act="publish" data-id="${it.id}" data-pid="${projectId}" style="padding:4px 8px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);color:#34d399;border-radius:5px;font-size:11px;cursor:pointer;">🚀 Publicado</button>
          ${it.url ? `<a href="${_esc(it.url)}" target="_blank" style="padding:4px 8px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);color:#60a5fa;border-radius:5px;font-size:11px;text-decoration:none;">↗ Abrir</a>` : ''}
        </div>
      </div>
    </div>
  `
}

// ── Handlers de la UI ─────────────────────────────────────────────
function _attachHandlers(root, projectId) {
  root.querySelectorAll('[data-rss-act]').forEach(el => {
    const act = el.dataset.rssAct
    if (act === 'add-source') {
      el.addEventListener('click', () => _openAddSourceModal(projectId))
    } else if (act === 'toggle-source') {
      el.addEventListener('click', async () => {
        const sid = el.dataset.sid
        const src = _state[projectId].sources.find(s => s.id === sid)
        if (!src) return
        try { await _api('update_source', { source_id: sid, patch: { enabled: !src.enabled } }) }
        catch (e) { alert('Error: ' + e.message); return }
        renderProjectRssTab(projectId)
      })
    } else if (act === 'delete-source') {
      el.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta fuente? También se borrarán los items asociados.')) return
        try { await _api('delete_source', { source_id: el.dataset.sid }) }
        catch (e) { alert('Error: ' + e.message); return }
        renderProjectRssTab(projectId)
      })
    } else if (act === 'filter-status') {
      el.addEventListener('click', () => {
        _state[projectId].filterStatus = el.dataset.val
        renderProjectRssTab(projectId)
      })
    } else if (act === 'set-status') {
      el.addEventListener('click', async () => {
        try { await _api('update_item', { item_id: el.dataset.id, patch: { status: el.dataset.val } }) }
        catch (e) { alert('Error: ' + e.message); return }
        renderProjectRssTab(projectId)
      })
    } else if (act === 'edit-notes') {
      el.addEventListener('click', async () => {
        const item = _state[projectId].items.find(i => i.id === el.dataset.id)
        const notes = prompt('Notas para este item:', item?.notes || '')
        if (notes === null) return
        try { await _api('update_item', { item_id: el.dataset.id, patch: { notes, status: notes ? 'edited' : 'pending' } }) }
        catch (e) { alert('Error: ' + e.message); return }
        renderProjectRssTab(projectId)
      })
    } else if (act === 'schedule') {
      el.addEventListener('click', async () => {
        const d = prompt('¿Para cuándo programar publicación? (YYYY-MM-DD o YYYY-MM-DD HH:mm)', new Date().toISOString().split('T')[0])
        if (!d) return
        try {
          const iso = d.length === 10 ? d + 'T09:00:00' : d.replace(' ', 'T') + ':00'
          await _api('update_item', { item_id: el.dataset.id, patch: { scheduled_for: iso, status: 'scheduled' } })
        } catch (e) { alert('Error: ' + e.message); return }
        renderProjectRssTab(projectId)
      })
    } else if (act === 'publish') {
      el.addEventListener('click', async () => {
        const url = prompt('URL del post publicado (opcional):', '')
        try { await _api('update_item', { item_id: el.dataset.id, patch: { status: 'published', blog_post_url: url || null } }) }
        catch (e) { alert('Error: ' + e.message); return }
        renderProjectRssTab(projectId)
      })
    }
  })
}

// ── Modal: agregar fuente ─────────────────────────────────────────
function _openAddSourceModal(projectId) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:500px;width:100%;color:#e5e7eb;`
  modal.innerHTML = `
    <h3 style="margin:0 0 14px;font-size:17px;font-weight:800;">📡 Agregar fuente RSS</h3>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Plataforma</label>
        <select id="rss-platform" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;">
          ${PLATFORMS.map(p => `<option value="${p.id}">${p.icon} ${p.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Handle / URL</label>
        <input id="rss-handle" type="text" placeholder="" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
        <div id="rss-handle-help" style="font-size:11px;color:#6b7280;margin-top:4px;"></div>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Etiqueta (opcional)</label>
        <input id="rss-label" type="text" placeholder="Ej: YouTube oficial Bad Bunny" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Artista / Marca (opcional)</label>
        <input id="rss-artist" type="text" placeholder="Bad Bunny" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div id="rss-preview" style="font-size:11px;color:#6b7280;padding:8px;background:#0a0e13;border:1px solid #1f2937;border-radius:6px;font-family:monospace;word-break:break-all;"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button id="rss-cancel" style="flex:1;padding:11px;background:transparent;border:1px solid #374151;color:#9ca3af;border-radius:10px;cursor:pointer;font-size:14px;">Cancelar</button>
      <button id="rss-save" style="flex:2;padding:11px;background:linear-gradient(135deg,#34d399,#22c55e);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:14px;">+ Agregar fuente</button>
    </div>
  `
  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  const platSel = modal.querySelector('#rss-platform')
  const handleInput = modal.querySelector('#rss-handle')
  const helpEl = modal.querySelector('#rss-handle-help')
  const preview = modal.querySelector('#rss-preview')

  async function updatePreview() {
    const platform = platSel.value
    const handle = handleInput.value.trim()
    const pf = PLATFORM_BY_ID[platform]
    handleInput.placeholder = pf?.placeholder || ''
    helpEl.textContent = pf?.help || ''
    if (!handle) { preview.textContent = '(URL del feed se calculará al pegar el handle)'; return }
    try {
      const r = await _api('resolve_url', { platform, handle })
      preview.textContent = r.feed_url || '⚠️ No pude construir URL — usa plataforma RSS directo'
    } catch { preview.textContent = '(error)' }
  }
  platSel.addEventListener('change', updatePreview)
  handleInput.addEventListener('input', () => clearTimeout(handleInput._t) || (handleInput._t = setTimeout(updatePreview, 400)))
  updatePreview()

  const cleanup = () => document.body.removeChild(overlay)
  modal.querySelector('#rss-cancel').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })
  modal.querySelector('#rss-save').addEventListener('click', async () => {
    const platform = platSel.value
    const handle = handleInput.value.trim()
    const label = modal.querySelector('#rss-label').value.trim() || null
    const artist_name = modal.querySelector('#rss-artist').value.trim() || null
    if (!handle) { alert('Pon el handle o URL.'); return }
    try {
      await _api('add_source', { project_id: projectId, platform, handle, label, artist_name })
    } catch (e) { alert('Error: ' + e.message); return }
    cleanup()
    renderProjectRssTab(projectId)
  })
}

if (typeof window !== 'undefined') {
  window.nexusRss = { renderProjectTab: renderProjectRssTab }
}
