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
const _state = {}  // projectId → { sources, items, filterStatus, filterPlatform, lastError, loading }
let _lastRenderedPid = null   // ← último projectId que pintamos; sirve para invalidar al cambiar

/** Limpia cache de un proyecto (o de todos si pid=null). Útil al cambiar proyecto. */
export function invalidateRssCache(pid) {
  if (pid) delete _state[pid]
  else for (const k of Object.keys(_state)) delete _state[k]
}

async function _api(action, payload = {}, { retried = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session) headers.Authorization = 'Bearer ' + session.access_token
  let r
  try {
    r = await fetch('/api/rss', {
      method: 'POST', headers,
      body: JSON.stringify({ action, ...payload }),
      signal: AbortSignal.timeout(15000),
    })
  } catch (netErr) {
    throw new Error('Sin conexión a /api/rss · ' + netErr.message)
  }

  // 401/403 → refresca token UNA vez y reintenta. Evita el loop de fallos.
  if ((r.status === 401 || r.status === 403) && !retried) {
    try { await supabase.auth.refreshSession() } catch {}
    return _api(action, payload, { retried: true })
  }

  let j
  try { j = await r.json() }
  catch { throw new Error(`HTTP ${r.status} sin JSON`) }
  if (!r.ok || !j.ok) {
    const code = j?.error || `HTTP ${r.status}`
    const err = new Error(code)
    err.status = r.status
    throw err
  }
  return j
}

async function _refresh(projectId) {
  const [s, i] = await Promise.all([
    _api('list_sources', { project_id: projectId }),
    _api('list_items',   { project_id: projectId, limit: 100 }),
  ])
  _state[projectId] = {
    ..._state[projectId],
    sources:   s.sources || [],
    items:     i.items   || [],
    lastError: null,
    fetchedAt: Date.now(),
  }
}

/** Lectura ligera para widgets externos (sin pintar UI ni reintentar).
 *  Usa cache si está fresca (<60s); si no, refresca silenciosamente. */
export async function getRssSnapshot(projectId, { forceRefresh = false } = {}) {
  const cached = _state[projectId]
  const fresh  = cached && (Date.now() - (cached.fetchedAt || 0) < 60_000)
  if (!fresh || forceRefresh) {
    try { await _refresh(projectId) }
    catch (e) {
      return { ok: false, error: e.message, pending: 0, publishedToday: 0, sourceErrors: 0, total: 0 }
    }
  }
  const items   = _state[projectId]?.items   || []
  const sources = _state[projectId]?.sources || []
  const today   = new Date().toISOString().slice(0, 10)
  return {
    ok: true,
    total:           items.length,
    pending:         items.filter(i => i.status === 'pending').length,
    accepted:        items.filter(i => i.status === 'accepted').length,
    scheduled:       items.filter(i => i.status === 'scheduled').length,
    publishedToday:  items.filter(i => i.status === 'published' && (i.updated_at || i.created_at || '').slice(0, 10) === today).length,
    sourceErrors:    sources.filter(s => s.fail_count > 0 || s.last_error).length,
    sourcesTotal:    sources.length,
    fetchedAt:       _state[projectId]?.fetchedAt || null,
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
  // Si cambiamos de proyecto, invalida el cache del anterior para no mostrar
  // datos viejos ni quedar en estado vacío. Force-refresh del nuevo.
  if (_lastRenderedPid && _lastRenderedPid !== projectId) {
    invalidateRssCache(_lastRenderedPid)
  }
  _lastRenderedPid = projectId

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
    const is403 = e.status === 401 || e.status === 403 || /token|unauth/i.test(e.message || '')
    state.lastError = e.message
    mount.innerHTML = `
      <div style="padding:20px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.25);border-radius:12px;color:#fca5a5;display:flex;flex-direction:column;gap:10px;max-width:520px;margin:20px auto;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#f87171;font-size:14px;">
          ${is403 ? '🔒' : '⚠️'} ${is403 ? 'Sesión expirada' : 'No pudimos cargar los feeds'}
        </div>
        <div style="font-size:12px;color:#fcd5d5;line-height:1.5;">${_esc(e.message)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button data-rss-act="reload" data-pid="${projectId}" style="flex:1;min-width:120px;padding:8px 14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">🔄 Reintentar</button>
          ${is403 ? `<button data-rss-act="relogin" style="flex:1;min-width:120px;padding:8px 14px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);color:#60a5fa;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">🔑 Reconectar</button>` : ''}
        </div>
      </div>`
    _attachHandlers(mount, projectId)
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
        <div style="display:flex;gap:6px;">
          <button data-rss-act="reload" data-pid="${projectId}"
            title="Recargar"
            style="padding:8px 12px;background:rgba(255,255,255,0.05);border:1px solid #374151;color:#9ca3af;border-radius:8px;cursor:pointer;font-size:13px;">
            🔄
          </button>
          <button data-rss-act="add-source" data-pid="${projectId}"
            style="padding:8px 14px;background:linear-gradient(135deg,#34d399,#22c55e);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">
            + Agregar fuente
          </button>
        </div>
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
                      ${s.fail_count > 0 ? ' · ⚠️ ' + s.fail_count + ' fallos' : ''}
                    </div>
                    ${s.last_error ? `<div style="font-size:10px;color:#f87171;margin-top:3px;line-height:1.3;">⛔ ${_esc(s.last_error.slice(0,120))}</div>` : ''}
                    <div style="font-size:10px;color:#475569;margin-top:2px;line-height:1.3;font-family:monospace;word-break:break-all;">${_esc(s.feed_url || '').slice(0,100)}</div>
                  </div>
                  <button data-rss-act="edit-source" data-sid="${s.id}" data-pid="${projectId}"
                    title="Editar plataforma / handle / etiqueta"
                    style="padding:5px 8px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);color:#a78bfa;border-radius:6px;cursor:pointer;font-size:11px;">
                    ✏️
                  </button>
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
        <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;align-items:center;">
          ${it.status !== 'accepted' ? `<button data-rss-act="set-status" data-id="${it.id}" data-pid="${projectId}" data-val="accepted" style="padding:4px 8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#22c55e;border-radius:5px;font-size:11px;cursor:pointer;">✓ Aceptar</button>` : ''}
          <button data-rss-act="publish-and-log" data-id="${it.id}" data-pid="${projectId}" title="Marca publicado + crea entrada de Bitácora"
            style="padding:4px 8px;background:linear-gradient(135deg,rgba(52,211,153,0.2),rgba(34,197,94,0.2));border:1px solid rgba(52,211,153,0.4);color:#34d399;border-radius:5px;font-size:11px;cursor:pointer;font-weight:700;">🚀📝 Publicar + Bitácora</button>
          <button data-rss-act="gen-draft" data-id="${it.id}" data-pid="${projectId}" style="padding:4px 8px;background:linear-gradient(135deg,rgba(167,139,250,0.18),rgba(96,165,250,0.18));border:1px solid rgba(167,139,250,0.35);color:#c4b5fd;border-radius:5px;font-size:11px;cursor:pointer;font-weight:700;">🤖 ${it.draft_content ? 'Ver draft' : 'Draft IA'}</button>
          ${it.url ? `<a href="${_esc(it.url)}" target="_blank" style="padding:4px 8px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);color:#60a5fa;border-radius:5px;font-size:11px;text-decoration:none;">↗ Abrir</a>` : ''}
          <!-- Kebab: acciones secundarias (Programar / Nota / Solo a Bitácora / Solo publicado / Rechazar) -->
          <div style="position:relative;display:inline-block;">
            <button data-rss-act="kebab" data-id="${it.id}" data-pid="${projectId}" title="Más acciones"
              style="padding:4px 8px;background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.2);color:#94a3b8;border-radius:5px;font-size:14px;cursor:pointer;line-height:1;">⋯</button>
            <div data-rss-kebab-menu="${it.id}" style="display:none;position:absolute;top:100%;right:0;margin-top:4px;background:#0f172a;border:1px solid #1f2937;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5);z-index:50;min-width:200px;padding:4px;">
              <button data-rss-act="log-only" data-id="${it.id}" data-pid="${projectId}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:none;border:none;color:#34d399;font-size:12px;cursor:pointer;text-align:left;border-radius:6px;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">📝 Solo a Bitácora</button>
              <button data-rss-act="publish" data-id="${it.id}" data-pid="${projectId}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:none;border:none;color:#34d399;font-size:12px;cursor:pointer;text-align:left;border-radius:6px;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">🚀 Solo marcar publicado</button>
              <button data-rss-act="edit-notes" data-id="${it.id}" data-pid="${projectId}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:none;border:none;color:#a78bfa;font-size:12px;cursor:pointer;text-align:left;border-radius:6px;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">✏️ Editar nota</button>
              <button data-rss-act="schedule" data-id="${it.id}" data-pid="${projectId}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:none;border:none;color:#fb923c;font-size:12px;cursor:pointer;text-align:left;border-radius:6px;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">📅 Programar</button>
              ${it.status !== 'rejected' ? `<button data-rss-act="set-status" data-id="${it.id}" data-pid="${projectId}" data-val="rejected" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;background:none;border:none;color:#94a3b8;font-size:12px;cursor:pointer;text-align:left;border-radius:6px;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">✗ Rechazar</button>` : ''}
            </div>
          </div>
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
    } else if (act === 'reload') {
      el.addEventListener('click', () => renderProjectRssTab(projectId))
    } else if (act === 'edit-source') {
      el.addEventListener('click', () => {
        const src = _state[projectId].sources.find(s => s.id === el.dataset.sid)
        if (!src) return
        _openEditSourceModal(projectId, src)
      })
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
    } else if (act === 'publish-and-log') {
      el.addEventListener('click', async () => {
        const item = _state[projectId].items.find(i => i.id === el.dataset.id)
        if (!item) return
        const url = prompt('URL del post publicado (opcional):', item.blog_post_url || '')
        if (url === null) return  // cancel
        try {
          await _api('update_item', { item_id: item.id, patch: { status: 'published', blog_post_url: url || null } })
        } catch (e) { alert('Error al publicar: ' + e.message); return }
        // Crea entrada de bitácora con evidencia
        try {
          await _createBitacoraFromItem({ ...item, blog_post_url: url || item.blog_post_url }, projectId)
          if (window.showToast) window.showToast('✅ Publicado + Bitácora registrada')
        } catch (e) {
          alert('Marcado publicado, pero falló bitácora: ' + e.message)
        }
        renderProjectRssTab(projectId)
      })
    } else if (act === 'log-only') {
      el.addEventListener('click', async () => {
        const item = _state[projectId].items.find(i => i.id === el.dataset.id)
        if (!item) return
        try {
          await _createBitacoraFromItem(item, projectId)
          if (window.showToast) window.showToast('✅ Registrado en Bitácora')
        } catch (e) { alert('Error: ' + e.message); return }
        // Cierra el kebab
        document.querySelectorAll('[data-rss-kebab-menu]').forEach(m => m.style.display = 'none')
      })
    } else if (act === 'kebab') {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const id = el.dataset.id
        const menu = root.querySelector(`[data-rss-kebab-menu="${id}"]`)
        if (!menu) return
        // Cierra otros
        document.querySelectorAll('[data-rss-kebab-menu]').forEach(m => { if (m !== menu) m.style.display = 'none' })
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block'
      })
    } else if (act === 'relogin') {
      el.addEventListener('click', async () => {
        try {
          await supabase.auth.refreshSession()
          invalidateRssCache(projectId)
          renderProjectRssTab(projectId)
        } catch (e) { alert('No fue posible reconectar: ' + e.message) }
      })
    } else if (act === 'gen-draft') {
      el.addEventListener('click', async () => {
        const item = _state[projectId].items.find(i => i.id === el.dataset.id)
        // Si ya hay draft, abre directo el modal de vista
        if (item?.draft_content) {
          try { _openDraftModal(item, JSON.parse(item.draft_content), projectId) }
          catch { _openDraftModal(item, { body_markdown: item.draft_content }, projectId) }
          return
        }
        await _openGenerateDraftModal(item, projectId)
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

// ── Modal: parámetros del draft IA (tono, marca) ──────────────────
async function _openGenerateDraftModal(item, projectId) {
  // localStorage cache de últimas preferencias
  const prefsKey = 'nexus_rss_draft_prefs'
  let prefs = {}
  try { prefs = JSON.parse(localStorage.getItem(prefsKey) || '{}') } catch {}

  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:500px;width:100%;color:#e5e7eb;`
  modal.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="font-size:28px;">🤖</div>
      <div>
        <h3 style="margin:0;font-size:17px;font-weight:800;">Generar draft con IA</h3>
        <div style="font-size:12px;color:#9ca3af;">Gemini 2.0 reescribirá esto en formato blog SEO</div>
      </div>
    </div>
    <div style="padding:10px;background:rgba(255,255,255,0.02);border:1px solid #1f2937;border-radius:8px;margin-bottom:14px;font-size:12px;color:#9ca3af;">
      <strong style="color:#e5e7eb;">${_esc((item.title || '(sin título)').slice(0, 120))}</strong>
      ${item.source?.artist_name ? `<br><span style="color:#a78bfa;">${_esc(item.source.artist_name)}</span> · ${item.source?.platform || ''}` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Marca/Sitio (opcional)</label>
        <input id="d-brand" type="text" placeholder="Ej: BN Records" value="${_esc(prefs.brand || '')}" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Tono</label>
        <input id="d-tone" type="text" placeholder="profesional, cercano, conciso" value="${_esc(prefs.tone || 'profesional, cercano, conciso')}" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Audiencia</label>
        <input id="d-audience" type="text" placeholder="lectores generales del blog" value="${_esc(prefs.audience || 'fans de música latina urbana, lectores del blog')}" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button id="d-cancel" style="flex:1;padding:11px;background:transparent;border:1px solid #374151;color:#9ca3af;border-radius:10px;cursor:pointer;font-size:14px;">Cancelar</button>
      <button id="d-go" style="flex:2;padding:11px;background:linear-gradient(135deg,#a78bfa,#60a5fa);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:14px;">✨ Generar</button>
    </div>
    <div id="d-status" style="margin-top:10px;font-size:12px;color:#9ca3af;text-align:center;"></div>
  `
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => document.body.removeChild(overlay)
  modal.querySelector('#d-cancel').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })
  modal.querySelector('#d-go').addEventListener('click', async () => {
    const brand    = modal.querySelector('#d-brand').value.trim()
    const tone     = modal.querySelector('#d-tone').value.trim()
    const audience = modal.querySelector('#d-audience').value.trim()
    try { localStorage.setItem(prefsKey, JSON.stringify({ brand, tone, audience })) } catch {}
    const status = modal.querySelector('#d-status')
    const goBtn = modal.querySelector('#d-go')
    goBtn.disabled = true
    goBtn.textContent = '⏳ Generando…'
    status.textContent = 'Gemini 2.0 está redactando tu draft. Esto toma 10-30 segundos.'
    try {
      const r = await _api('generate_draft', { item_id: item.id, brand, tone, audience })
      cleanup()
      _openDraftModal(r.item, r.draft, projectId)
      renderProjectRssTab(projectId)
    } catch (e) {
      status.style.color = '#f87171'
      status.textContent = 'Error: ' + e.message
      goBtn.disabled = false
      goBtn.textContent = '✨ Reintentar'
    }
  })
}

// ── Modal: visualizar draft generado ──────────────────────────────
function _openDraftModal(item, draft, projectId) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:780px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;`

  const fieldHtml = (label, value, opts = {}) => {
    const id = 'df-' + label.replace(/[^a-z]/gi, '').toLowerCase()
    const isLong = opts.long
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
          <label style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">${label}</label>
          <button data-copy="${id}" style="padding:3px 9px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:5px;cursor:pointer;font-size:10px;">📋 Copiar</button>
        </div>
        ${isLong
          ? `<textarea id="${id}" style="width:100%;padding:10px;background:#0a0e13;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:13px;line-height:1.6;min-height:${opts.minHeight || '200px'};font-family:${opts.mono ? 'monospace' : 'inherit'};resize:vertical;">${_esc(value || '')}</textarea>`
          : `<input id="${id}" type="text" value="${_esc(value || '')}" style="width:100%;padding:9px 10px;background:#0a0e13;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>`
        }
        ${opts.hint ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;">${opts.hint}</div>` : ''}
      </div>
    `
  }

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-size:28px;">🤖</div>
        <div>
          <h3 style="margin:0;font-size:17px;font-weight:800;">Draft generado por IA</h3>
          <div style="font-size:11px;color:#9ca3af;">Edita y copia campos para tu WordPress</div>
        </div>
      </div>
      <button id="dr-close" style="background:transparent;border:none;color:#9ca3af;font-size:24px;cursor:pointer;line-height:1;">×</button>
    </div>

    ${fieldHtml('Título SEO (60 chars)', draft.title_seo, { hint: (draft.title_seo || '').length + ' caracteres' })}
    ${fieldHtml('H1', draft.h1)}
    ${fieldHtml('Slug URL', draft.slug)}
    ${fieldHtml('Meta description (160 chars)', draft.meta_description, { hint: (draft.meta_description || '').length + ' caracteres' })}
    ${fieldHtml('Excerpt', draft.excerpt, { long: true, minHeight: '60px' })}
    ${fieldHtml('Body Markdown', draft.body_markdown, { long: true, mono: true, minHeight: '300px' })}
    ${fieldHtml('Tags (separados por coma)', Array.isArray(draft.tags) ? draft.tags.join(', ') : (draft.tags || ''))}
    ${fieldHtml('Categoría sugerida', draft.category_suggestion)}
    ${fieldHtml('Keywords focus', Array.isArray(draft.keywords_focus) ? draft.keywords_focus.join(', ') : (draft.keywords_focus || ''))}
    ${fieldHtml('Prompt imagen OG (para DALL-E / Midjourney)', draft.og_image_prompt, { long: true, minHeight: '70px', hint: 'Pega esto en tu generador favorito para crear la imagen del post' })}

    <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap;">
      <button id="dr-copy-all" style="flex:1;min-width:160px;padding:11px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);color:#60a5fa;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">📋 Copiar todo</button>
      <button id="dr-save" style="flex:1;min-width:120px;padding:11px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">💾 Guardar</button>
      <button id="dr-regen" style="flex:1;min-width:140px;padding:11px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">🔄 Regenerar</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <button id="dr-wp-draft" style="flex:1;min-width:170px;padding:11px;background:rgba(33,117,155,0.15);border:1px solid rgba(33,117,155,0.4);color:#21759b;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">📰 Subir a WP (borrador)</button>
      <button id="dr-wp-publish" style="flex:1;min-width:180px;padding:11px;background:linear-gradient(135deg,#21759b,#3b82f6);border:none;color:#fff;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;">🚀 Publicar a WordPress</button>
      <button id="dr-mark-published" style="flex:1;min-width:160px;padding:11px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">✓ Marcar publicado</button>
    </div>
    <div id="dr-feedback" style="margin-top:10px;font-size:12px;color:#9ca3af;text-align:center;min-height:18px;"></div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => document.body.removeChild(overlay)
  const feedback = (msg, color = '#22c55e') => {
    const el = modal.querySelector('#dr-feedback')
    el.textContent = msg; el.style.color = color
    setTimeout(() => { el.textContent = '' }, 2400)
  }

  // copy buttons
  modal.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = modal.querySelector('#' + btn.dataset.copy)
      if (!target) return
      navigator.clipboard.writeText(target.value || target.textContent || '').then(
        () => { btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = '📋 Copiar' }, 1200) }
      )
    })
  })

  // close
  modal.querySelector('#dr-close').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  // helper para leer campos editados
  const readDraft = () => ({
    title_seo: modal.querySelector('#df-titleseochars').value,
    h1: modal.querySelector('#df-h').value,
    slug: modal.querySelector('#df-slugurl').value,
    meta_description: modal.querySelector('#df-metadescriptionchars').value,
    excerpt: modal.querySelector('#df-excerpt').value,
    body_markdown: modal.querySelector('#df-bodymarkdown').value,
    tags: modal.querySelector('#df-tagsseparadosporcoma').value.split(',').map(s => s.trim()).filter(Boolean),
    category_suggestion: modal.querySelector('#df-categorasugerida').value,
    keywords_focus: modal.querySelector('#df-keywordsfocus').value.split(',').map(s => s.trim()).filter(Boolean),
    og_image_prompt: modal.querySelector('#df-promptimagenogparadalleemidjourney').value,
  })

  // copy all
  modal.querySelector('#dr-copy-all').addEventListener('click', () => {
    const d = readDraft()
    const text = `TÍTULO: ${d.title_seo}
H1: ${d.h1}
SLUG: ${d.slug}
META: ${d.meta_description}
EXCERPT: ${d.excerpt}
CATEGORÍA: ${d.category_suggestion}
TAGS: ${d.tags.join(', ')}
KEYWORDS: ${d.keywords_focus.join(', ')}

═══ CUERPO ═══
${d.body_markdown}

═══ IMAGEN OG (PROMPT) ═══
${d.og_image_prompt}`
    navigator.clipboard.writeText(text).then(() => feedback('✓ Todo copiado al portapapeles'))
  })

  // save
  modal.querySelector('#dr-save').addEventListener('click', async () => {
    try {
      await _api('update_item', { item_id: item.id, patch: { draft_content: JSON.stringify(readDraft()), status: 'edited' } })
      feedback('✓ Cambios guardados')
      renderProjectRssTab(projectId)
    } catch (e) { feedback('Error: ' + e.message, '#f87171') }
  })

  // regen
  modal.querySelector('#dr-regen').addEventListener('click', async () => {
    if (!confirm('¿Regenerar? Se sobreescribirá el draft actual.')) return
    cleanup()
    await _openGenerateDraftModal(item, projectId)
  })

  // mark published manualmente (sin WP API)
  modal.querySelector('#dr-mark-published').addEventListener('click', async () => {
    const url = prompt('URL del post publicado (opcional):', '')
    try {
      await _api('update_item', { item_id: item.id, patch: { draft_content: JSON.stringify(readDraft()), status: 'published', blog_post_url: url || null } })
      cleanup()
      renderProjectRssTab(projectId)
    } catch (e) { feedback('Error: ' + e.message, '#f87171') }
  })

  // WordPress: subir como borrador
  const wpPublish = async (wpStatus) => {
    // Primero guardar cambios actuales
    try { await _api('update_item', { item_id: item.id, patch: { draft_content: JSON.stringify(readDraft()) } }) }
    catch (e) { feedback('Error guardando: ' + e.message, '#f87171'); return }
    feedback('⏳ Subiendo a WordPress…', '#9ca3af')
    try {
      const r = await _api('publish_to_wordpress', { item_id: item.id, status: wpStatus })
      feedback('✓ ' + (wpStatus === 'publish' ? 'Publicado' : 'Borrador creado') + ' en WP — ID ' + r.post.id)
      window.open(r.post.url, '_blank')
      setTimeout(() => { cleanup(); renderProjectRssTab(projectId) }, 1500)
    } catch (e) {
      feedback('Error WP: ' + e.message, '#f87171')
    }
  }
  modal.querySelector('#dr-wp-draft').addEventListener('click', () => wpPublish('draft'))
  modal.querySelector('#dr-wp-publish').addEventListener('click', () => {
    if (!confirm('¿Publicar AHORA en WordPress? (no será borrador, queda visible al instante)')) return
    wpPublish('publish')
  })
}

// ── Modal: editar fuente existente ────────────────────────────────
function _openEditSourceModal(projectId, source) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:520px;width:100%;color:#e5e7eb;`
  modal.innerHTML = `
    <h3 style="margin:0 0 14px;font-size:17px;font-weight:800;">✏️ Editar fuente RSS</h3>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;font-weight:700;">⚠️ Plataforma actual</label>
        <select id="rss-platform" style="width:100%;padding:11px 12px;background:#1f2937;border:2px solid ${source.platform === 'youtube' ? '#374151' : '#a78bfa'};border-radius:8px;color:#e5e7eb;font-size:14px;font-weight:700;">
          ${PLATFORMS.map(p => `<option value="${p.id}" ${p.id === source.platform ? 'selected' : ''}>${p.icon} ${p.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Handle / URL</label>
        <input id="rss-handle" type="text" value="${_esc(source.handle || '')}" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
        <div id="rss-handle-help" style="font-size:11px;color:#6b7280;margin-top:4px;"></div>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Etiqueta</label>
        <input id="rss-label" type="text" value="${_esc(source.label || '')}" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:12px;color:#9ca3af;margin-bottom:4px;">Artista / Marca</label>
        <input id="rss-artist" type="text" value="${_esc(source.artist_name || '')}" style="width:100%;padding:9px 10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div id="rss-preview" style="font-size:11px;color:#6b7280;padding:8px;background:#0a0e13;border:1px solid #1f2937;border-radius:6px;font-family:monospace;word-break:break-all;"></div>
      ${source.last_error ? `<div style="font-size:11px;color:#f87171;padding:8px;background:rgba(248,113,113,0.05);border:1px solid rgba(248,113,113,0.2);border-radius:6px;">⛔ Último error: ${_esc(source.last_error.slice(0,200))}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button id="rss-cancel" style="flex:1;padding:11px;background:transparent;border:1px solid #374151;color:#9ca3af;border-radius:10px;cursor:pointer;font-size:14px;">Cancelar</button>
      <button id="rss-save" style="flex:2;padding:11px;background:linear-gradient(135deg,#a78bfa,#60a5fa);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:14px;">💾 Guardar cambios</button>
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
    if (!handle) { preview.textContent = '(handle vacío)'; return }
    try {
      const r = await _api('resolve_url', { platform, handle })
      preview.textContent = '→ ' + (r.feed_url || '⚠️ no resuelto')
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
    // Necesitamos recomputar feed_url si cambia plataforma o handle
    let feed_url = source.feed_url
    if (platform !== source.platform || handle !== source.handle) {
      try {
        const r = await _api('resolve_url', { platform, handle })
        if (r.feed_url) feed_url = r.feed_url
      } catch {}
    }
    try {
      await _api('update_source', { source_id: source.id, patch: { platform, handle, label, artist_name, feed_url, last_error: null, fail_count: 0 } })
    } catch (e) { alert('Error: ' + e.message); return }
    cleanup()
    renderProjectRssTab(projectId)
  })
}

// ─────────────────────────────────────────────────────────────────────
// Helper: crea una entrada de Bitácora a partir de un item RSS y dispara webhook.
// Usa la misma forma que el form manual: type='bitacora', metadata con
// modulo_contexto='CONTENIDO_POST'. Auto-pobla detalles_clave con datos del feed.
// ─────────────────────────────────────────────────────────────────────
async function _createBitacoraFromItem(item, projectId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin sesión')

  const platform = item.source?.platform || 'rss'
  const platformLabel = (PLATFORM_BY_ID[platform] || {}).label || platform
  const artist = item.source?.artist_name || item.source?.label || ''
  const title  = (item.title || '(sin título)').slice(0, 200)
  const urlEvidencia = item.blog_post_url || item.url || null
  const today = new Date().toISOString().slice(0, 10)
  const hora  = new Date().toISOString().slice(11, 16)

  const node = {
    id:       (crypto.randomUUID ? crypto.randomUUID() : ('rss-' + Date.now())),
    type:     'bitacora',
    content:  `Publicación RSS: ${title}${artist ? ' · ' + artist : ''}`,
    owner_id: user.id,
    metadata: {
      proyecto_id: projectId,
      modulo_contexto: 'CONTENIDO_POST',
      fecha_ejecucion: today,
      detalles_clave: {
        plataforma:        platformLabel,
        tipo_contenido:    'RSS / Publicación',
        titulo_tema:       title,
        keywords:          [],
        hora_publicacion:  hora,
        url_publicado:     urlEvidencia || '',
      },
      enlace_evidencia:  urlEvidencia,
      impacto_metricas:  { vistas: 0, clics: 0, compartidos: 0 },
      origen_rss_item_id: item.id,   // ← trazabilidad reversa
    },
  }

  const { error } = await supabase.from('nodes').insert(node)
  if (error) throw new Error(error.message)

  // Inyecta al cache global de la app para que la pestaña Bitácora lo vea sin reload
  try { if (Array.isArray(window.allNodes)) window.allNodes.unshift(node) } catch {}

  // Dispara webhook n8n si está configurado (best-effort, no bloquea)
  try { window.nexusN8n?.dispatchBitacora?.('rss', node) } catch {}

  return node
}

// Click fuera de un kebab → cierra todos
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('[data-rss-act="kebab"]') && !e.target.closest?.('[data-rss-kebab-menu]')) {
      document.querySelectorAll('[data-rss-kebab-menu]').forEach(m => { m.style.display = 'none' })
    }
  })
}

if (typeof window !== 'undefined') {
  window.nexusRss = {
    renderProjectTab: renderProjectRssTab,
    invalidate:       invalidateRssCache,
    snapshot:         getRssSnapshot,
  }
}
