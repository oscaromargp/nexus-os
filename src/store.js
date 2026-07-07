// Nexus OS — Store local-first ligero (sin framework).
//
// Objetivo: que la app se sienta INSTANTÁNEA (pinta desde cache al momento y
// revalida en 2º plano) y aguante mala señal (cola de escrituras offline).
// Es ADITIVO y OPT-IN: los módulos lo adoptan cuando quieren; si algo falla,
// siempre cae al fetch normal. No reemplaza a Supabase, lo acelera.
//
// Uso típico (lectura instantánea):
//   const data = await swr('crypto:all', () => _api('crypto_list'), {
//     ttl: 60000, onUpdate: (fresh) => repaint(fresh)
//   })
//   // 'data' es cache al instante (o el fetch si no hay cache); onUpdate
//   // se dispara cuando llega lo fresco → repintas sin spinner.

const PREFIX = 'nexus_store_'

// Almacenamiento: localStorage en el navegador; Map en memoria en Node/tests.
const _mem = new Map()
const _storage = (() => {
  try {
    if (typeof localStorage !== 'undefined') {
      const k = PREFIX + '__t'
      localStorage.setItem(k, '1'); localStorage.removeItem(k)
      return localStorage
    }
  } catch {}
  return {
    getItem: k => (_mem.has(k) ? _mem.get(k) : null),
    setItem: (k, v) => _mem.set(k, v),
    removeItem: k => _mem.delete(k),
  }
})()

function _read(key) {
  try { const r = _storage.getItem(PREFIX + key); return r ? JSON.parse(r) : null } catch { return null }
}
function _write(key, entry) {
  try { _storage.setItem(PREFIX + key, JSON.stringify(entry)) } catch {}
}

// ── Pub/sub mínimo ────────────────────────────────────────────────
const _listeners = new Map()   // key -> Set<cb>
export function subscribe(key, cb) {
  if (!_listeners.has(key)) _listeners.set(key, new Set())
  _listeners.get(key).add(cb)
  return () => _listeners.get(key)?.delete(cb)
}
function _emit(key, val) {
  _listeners.get(key)?.forEach(cb => { try { cb(val) } catch {} })
}

// ── Estado simple (get/set) — cache manual + reactivo ─────────────
export function get(key) { return _read(key)?.v ?? null }
export function set(key, v) { _write(key, { v, ts: Date.now() }); _emit(key, v); return v }
export function age(key) { const e = _read(key); return e ? Date.now() - e.ts : Infinity }
export function clear(key) { try { _storage.removeItem(PREFIX + key) } catch {} }

// ── Stale-While-Revalidate: entrega cache YA y revalida en 2º plano ──
// Devuelve la cache al instante (si existe); si está vieja o no hay, va a la
// red. onUpdate(fresh) se llama cuando llega el dato fresco (para repintar).
export async function swr(key, fetcher, { ttl = 300000, onUpdate } = {}) {
  const cached = _read(key)
  const fresh = cached && (Date.now() - cached.ts < ttl)

  const revalidate = async () => {
    try {
      const data = await fetcher()
      _write(key, { v: data, ts: Date.now() })
      _emit(key, data)
      if (onUpdate) { try { onUpdate(data) } catch {} }
      return data
    } catch (e) {
      // Sin red o error: nos quedamos con la cache (si hay)
      return cached ? cached.v : Promise.reject(e)
    }
  }

  if (cached) {
    if (!fresh) revalidate()   // refresca en 2º plano, sin bloquear
    return cached.v            // ← lectura INSTANTÁNEA
  }
  return revalidate()          // sin cache → espera la red (primera vez)
}

// ── Cola de escrituras offline ────────────────────────────────────
// Guarda una operación para reintentarla cuando vuelva la conexión.
const QKEY = '__queue'
export function queueWrite(op) {
  const q = get(QKEY) || []
  q.push({ ...op, _qid: Date.now() + '-' + Math.random().toString(36).slice(2, 7) })
  set(QKEY, q)
  return q.length
}
export function queueSize() { return (get(QKEY) || []).length }

// handler(op) => Promise. Si resuelve, la op se elimina; si rechaza, se conserva.
export async function flushQueue(handler) {
  const q = get(QKEY) || []
  if (!q.length) return { done: 0, left: 0 }
  const remaining = []
  let done = 0
  for (const op of q) {
    try { await handler(op); done++ } catch { remaining.push(op) }
  }
  set(QKEY, remaining)
  return { done, left: remaining.length }
}

// Registra un handler global que se dispara al recuperar conexión.
let _flushHandler = null
export function onReconnectFlush(handler) { _flushHandler = handler }
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (_flushHandler) flushQueue(_flushHandler) })
  window.nexusStore = { get, set, swr, queueWrite, queueSize, flushQueue, clear, subscribe }
}
