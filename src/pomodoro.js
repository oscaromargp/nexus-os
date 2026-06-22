// Nexus OS · Pomodoro for Kanban (S7)
//
// - Botón "▶ Pomodoro" en cada tarjeta Kanban (al abrir el modal).
// - Timer 25 min de trabajo / 5 min de descanso (configurable).
// - Notificación web al terminar el bloque.
// - Tracking persistido en localStorage por tarjeta + en metadata del nodo.
// - Floating timer mini en la esquina inferior derecha mientras corre.
// - Badge "🍅 N · X min" en la tarjeta cuando tiene pomodoros completados.

const STORAGE_KEY = 'nexus_pomodoros_v1'
const SETTINGS_KEY = 'nexus_pomo_settings_v1'

const DEFAULT_SETTINGS = { workMin: 25, breakMin: 5 }

function _loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } }
  catch { return { ...DEFAULT_SETTINGS } }
}
function _saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

/** Map { cardId -> { sessions: [{at, minutes, kind}] } } */
function _loadAllSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function _saveAllSessions(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

export function getCardPomodoroStats(cardId) {
  const all = _loadAllSessions()
  const sessions = (all[cardId]?.sessions || []).filter(s => s.kind === 'work')
  const count = sessions.length
  const minutes = sessions.reduce((s, x) => s + (x.minutes || 0), 0)
  return { count, minutes }
}

export function getWeekPomodoros() {
  const all = _loadAllSessions()
  const weekAgo = Date.now() - 7 * 86400000
  let total = 0, mins = 0
  const byCard = {}
  for (const [cardId, data] of Object.entries(all)) {
    for (const s of (data.sessions || [])) {
      if (s.kind !== 'work') continue
      if (s.at < weekAgo) continue
      total++
      mins += s.minutes || 0
      byCard[cardId] = (byCard[cardId] || 0) + 1
    }
  }
  return { total, minutes: mins, by_card: byCard }
}

function _recordSession(cardId, kind, minutes) {
  const all = _loadAllSessions()
  if (!all[cardId]) all[cardId] = { sessions: [] }
  all[cardId].sessions.push({ at: Date.now(), kind, minutes })
  _saveAllSessions(all)

  // Also persist count + total mins on the node metadata if posible
  try {
    const nodes = window.allNodes || []
    const node = nodes.find(n => n.id === cardId)
    if (node) {
      const stats = getCardPomodoroStats(cardId)
      node.metadata = node.metadata || {}
      node.metadata.pomodoros = stats.count
      node.metadata.pomodoro_minutes = stats.minutes
      // Best-effort sync remoto
      if (window.supabase || window.__nexusSupabase) {
        const sb = window.__nexusSupabase || window.supabase
        sb.from('nodes').update({ metadata: node.metadata }).eq('id', cardId).then?.(() => {})
      }
    }
  } catch {}
}

// ─── Active timer state ───────────────────────────────────────────────────
let _state = null   // { cardId, label, kind, endsAt, intervalId, paused, remainingMs }

function _notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('🍅 ' + title, { body, icon: '/favicon.ico', tag: 'pomo-' + Date.now(), requireInteraction: true })
      n.onclick = () => { window.focus(); n.close() }
    } else if (window.showToast) {
      window.showToast('🍅 ' + title + ' · ' + body)
    }
  } catch {}
}

async function _ensurePermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try { return await Notification.requestPermission() }
  catch { return 'denied' }
}

function _formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60).toString().padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function _renderFloater() {
  let el = document.getElementById('nexus-pomo-floater')
  if (!_state) { el?.remove(); return }
  if (!el) {
    el = document.createElement('div')
    el.id = 'nexus-pomo-floater'
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9500;background:linear-gradient(135deg,#0f1419,#1a2332);border:2px solid #fb923c;border-radius:14px;padding:12px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:220px;color:#e5e7eb;font-family:system-ui,sans-serif;'
    document.body.appendChild(el)
  }
  const remainingMs = _state.paused ? _state.remainingMs : (_state.endsAt - Date.now())
  const isWork = _state.kind === 'work'
  const color = isWork ? '#fb923c' : '#34d399'
  el.style.borderColor = color
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="font-size:22px;">${isWork ? '🍅' : '☕'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${isWork ? 'Trabajo' : 'Descanso'} · ${(_state.label || 'tarjeta').slice(0, 24)}</div>
        <div style="font-size:24px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;line-height:1;">${_formatTime(remainingMs)}</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px;">
      <button id="pomo-pause" style="flex:1;padding:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:6px;cursor:pointer;font-size:11px;">${_state.paused ? '▶ Reanudar' : '⏸ Pausa'}</button>
      <button id="pomo-skip" style="flex:1;padding:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:6px;cursor:pointer;font-size:11px;">⏭ Saltar</button>
      <button id="pomo-stop" style="padding:6px 10px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);color:#f87171;border-radius:6px;cursor:pointer;font-size:11px;">✕</button>
    </div>`
  el.querySelector('#pomo-pause').onclick = () => {
    if (_state.paused) {
      _state.endsAt = Date.now() + _state.remainingMs
      _state.paused = false
    } else {
      _state.remainingMs = _state.endsAt - Date.now()
      _state.paused = true
    }
    _renderFloater()
  }
  el.querySelector('#pomo-skip').onclick = () => _completeBlock()
  el.querySelector('#pomo-stop').onclick = () => _stop()
}

function _tick() {
  if (!_state || _state.paused) return
  if (Date.now() >= _state.endsAt) {
    _completeBlock()
  } else {
    _renderFloater()
  }
}

function _completeBlock() {
  if (!_state) return
  const { cardId, label, kind } = _state
  const settings = _loadSettings()
  const minutes = kind === 'work' ? settings.workMin : settings.breakMin
  _recordSession(cardId, kind, minutes)
  _notify(
    kind === 'work' ? '¡Bloque de trabajo completo!' : '¡Descanso terminado!',
    kind === 'work' ? `Llevas ${minutes} min en "${label}"` : 'Listo para otro bloque',
  )

  if (kind === 'work') {
    // Auto-arrancar descanso
    _start(cardId, label, 'break')
  } else {
    _stop()
  }
}

function _stop() {
  if (_state?.intervalId) clearInterval(_state.intervalId)
  _state = null
  document.getElementById('nexus-pomo-floater')?.remove()
}

function _start(cardId, label, kind = 'work') {
  if (_state) _stop()
  const settings = _loadSettings()
  const minutes = kind === 'work' ? settings.workMin : settings.breakMin
  _state = {
    cardId, label, kind,
    endsAt: Date.now() + minutes * 60000,
    paused: false, remainingMs: 0,
  }
  _state.intervalId = setInterval(_tick, 500)
  _renderFloater()
}

// ─── Public API ────────────────────────────────────────────────────────────
window.startPomodoro = async function(cardId, label = '') {
  if (!cardId) return
  if (_state && _state.cardId === cardId && !_state.paused) {
    // Ya hay uno corriendo de esta tarjeta
    return
  }
  if (_state && _state.cardId !== cardId) {
    if (!confirm('Ya hay un pomodoro corriendo. ¿Detenerlo y empezar uno nuevo?')) return
  }
  await _ensurePermission()
  // Si no nos pasaron label, intentamos sacarlo del nodo
  if (!label) {
    const nodes = window.allNodes || []
    const node = nodes.find(n => n.id === cardId)
    label = node?.metadata?.label || node?.content || 'tarjeta'
  }
  _start(cardId, label, 'work')
}

window.openPomodoroSettings = function() {
  const settings = _loadSettings()
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
  overlay.innerHTML = `
    <div style="background:#0f1419;border:1px solid #1f2937;border-radius:14px;padding:20px;max-width:320px;width:100%;color:#e5e7eb;" onclick="event.stopPropagation()">
      <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">🍅 Configuración Pomodoro</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <label style="font-size:12px;color:#94a3b8;">
          Trabajo (min)
          <input id="pomo-work" type="number" min="1" max="60" value="${settings.workMin}" style="width:100%;padding:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e5e7eb;font-size:14px;margin-top:4px;" />
        </label>
        <label style="font-size:12px;color:#94a3b8;">
          Descanso (min)
          <input id="pomo-break" type="number" min="1" max="30" value="${settings.breakMin}" style="width:100%;padding:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e5e7eb;font-size:14px;margin-top:4px;" />
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button id="pomo-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
        <button id="pomo-save" style="flex:1;padding:9px;background:#fb923c;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Guardar</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  const close = () => document.body.removeChild(overlay)
  overlay.querySelector('#pomo-cancel').onclick = close
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  overlay.querySelector('#pomo-save').onclick = () => {
    const w = Math.max(1, Math.min(60, parseInt(overlay.querySelector('#pomo-work').value) || 25))
    const b = Math.max(1, Math.min(30, parseInt(overlay.querySelector('#pomo-break').value) || 5))
    _saveSettings({ workMin: w, breakMin: b })
    close()
    window.showToast?.('🍅 Configuración guardada')
  }
}

if (typeof window !== 'undefined') {
  window.nexusPomodoro = {
    start: window.startPomodoro,
    stop: _stop,
    stats: getCardPomodoroStats,
    week: getWeekPomodoros,
    settings: _loadSettings,
    saveSettings: _saveSettings,
    openSettings: window.openPomodoroSettings,
  }
}
