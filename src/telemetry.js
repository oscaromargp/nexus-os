// Nexus OS — Telemetría privada
// Cliente que registra eventos de uso en la tabla usage_events.
//
// Privacidad:
//   - Solo se registra user_id (no email, no nombre, no IP del cliente directo).
//   - El usuario puede DESHABILITAR todo desde Configuración (futuro).
//   - Los datos viven en TU Supabase. NO se envían a terceros.
//
// Uso:
//   import { track } from './telemetry.js'
//   track('view:open',         { module: 'inmuebles' })
//   track('action:property_capture', { folio: 'LP-2026-003' })
//   track('error:client',      { message: 'mvInit is not a function' })

import { supabase } from './supabase.js'

const SESSION_ID = (() => {
  const k = 'nexus_session_id'
  let s = sessionStorage.getItem(k)
  if (!s) {
    s = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    sessionStorage.setItem(k, s)
  }
  return s
})()

// Buffer en memoria para batch inserts cada 5s o 10 eventos
let _buffer = []
let _flushTimer = null

const DISABLED_KEY = 'nexus_telemetry_disabled'
const isDisabled = () => localStorage.getItem(DISABLED_KEY) === '1'

export function setTelemetryEnabled(enabled) {
  if (enabled) localStorage.removeItem(DISABLED_KEY)
  else localStorage.setItem(DISABLED_KEY, '1')
}
export const isTelemetryEnabled = () => !isDisabled()

async function _flush() {
  if (!_buffer.length) return
  const batch = _buffer.splice(0)
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // Sin sesión: descarta (no podemos saber el dueño). Demo mode no se trackea.
      return
    }
    const rows = batch.map(e => ({
      user_id:    user.id,
      event:      e.event,
      module:     e.module || null,
      props:      e.props || {},
      session_id: SESSION_ID,
      url:        e.url,
      user_agent: e.userAgent,
    }))
    await supabase.from('usage_events').insert(rows)
  } catch (err) {
    // Silencio. La telemetría NUNCA debe interferir con la app.
    console.warn('[telemetry] flush fail', err.message)
  }
}

function _scheduleFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(() => {
    _flushTimer = null
    _flush()
  }, 5000)
}

export function track(event, propsOrModule = {}) {
  if (isDisabled()) return
  // Modo demo / admin bypass: no trackeamos (no hay user real)
  if (localStorage.getItem('nexus_admin_bypass') === 'true') return

  const props = typeof propsOrModule === 'string' ? {} : (propsOrModule || {})
  const module = typeof propsOrModule === 'string' ? propsOrModule : (props.module || null)

  _buffer.push({
    event,
    module,
    props,
    url:       location.pathname + location.search,
    userAgent: navigator.userAgent.slice(0, 200),
  })

  // Flush inmediato si llega a 10 eventos
  if (_buffer.length >= 10) {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null }
    _flush()
  } else {
    _scheduleFlush()
  }
}

// Auto-flush antes de cerrar la pestaña
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (_buffer.length) {
      // sendBeacon mejor que fetch async aquí (no espera la respuesta)
      try { _flush() } catch {}
    }
  })
  // Visibility change: flush al pausar
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flush()
  })

  // Expone helpers globales para debug
  window.nexusTrack = track
  window.nexusTelemetry = { setTelemetryEnabled, isTelemetryEnabled, flush: _flush }
}

// ─── Tracker automático de tiempo en módulo ──────────────────────────────────
// Llamar trackViewChange(newModule) en cada switchView() para medir duración.
let _currentModule = null
let _moduleEnterTime = 0

export function trackViewChange(newModule) {
  // Cierra el módulo previo registrando duración
  if (_currentModule && _moduleEnterTime) {
    const duration_ms = Date.now() - _moduleEnterTime
    if (duration_ms > 500) {  // ignora cambios fugaces
      track('time:module_close', { module: _currentModule, props: { duration_ms } })
    }
  }
  // Abre el nuevo
  if (newModule) {
    track('view:open', { module: newModule })
    _currentModule = newModule
    _moduleEnterTime = Date.now()
  }
}

if (typeof window !== 'undefined') window.trackViewChange = trackViewChange
