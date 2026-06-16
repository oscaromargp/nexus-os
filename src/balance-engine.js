// Nexus OS · Balance Engine v1
//
// Single source of truth para "saldo real" por cuenta (orquestador de
// Movimientos). El "saldo real" es el saldo disponible MENOS los pendientes
// de salida, MÁS los pendientes de entrada. Sirve como cerrojo psicológico
// para AFP: si un pago ya está prometido, el saldo lo refleja aunque no se
// haya ejecutado.
//
// Convenciones:
//   - Lee directo de Supabase (tabla `movimientos`) por owner_id.
//   - Cache in-memory por orqId con TTL 30s para no martillar la red.
//   - Emite eventos `balance:changed` en window para que AFP/widgets refresquen.
//   - Helpers para sumar global cuando el usuario haya mapeado sus cuentas.

import { supabase } from './supabase.js'

const _cache = new Map()    // orqId → { fetchedAt, payload }
const TTL_MS  = 30_000

// ── Helpers internos ─────────────────────────────────────────────────────────
function _movNetoMxn(m) {
  const bruto  = m.monto_mxn ?? Math.round((m.cantidad * (m.tc || 1)) * 100) / 100
  const comMxn = (m.tipo === 'entrada' && m.comision != null)
    ? Math.round(bruto * (1 - m.comision) * 100) / 100 : 0
  return Math.round((bruto - comMxn) * 100) / 100
}

function _round2(n) { return Math.round((n || 0) * 100) / 100 }

/**
 * Calcula saldo real de UNA cuenta (orquestador) leyendo de Supabase.
 *
 * @param {string} orqId
 * @param {object} opts  { forceRefresh: bool }
 * @returns {Promise<{ orqId, disponible, pendienteOut, pendienteIn, real, count, fetchedAt, error? }>}
 */
export async function getRealBalance(orqId, { forceRefresh = false } = {}) {
  if (!orqId) return { orqId: null, disponible: 0, pendienteOut: 0, pendienteIn: 0, real: 0, count: 0, fetchedAt: Date.now() }

  const cached = _cache.get(orqId)
  if (!forceRefresh && cached && (Date.now() - cached.fetchedAt < TTL_MS)) {
    return cached.payload
  }

  // Trae solo lo mínimo para calcular saldo + pendientes
  const { data, error } = await supabase
    .from('movimientos')
    .select('tipo, estado, cantidad, tc, monto_mxn, comision, fecha, created_at')
    .eq('orquestador_id', orqId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    const payload = { orqId, disponible: 0, pendienteOut: 0, pendienteIn: 0, real: 0, count: 0, fetchedAt: Date.now(), error: error.message }
    _cache.set(orqId, { fetchedAt: Date.now(), payload })
    return payload
  }

  // Saldo disponible = corriente sobre 'hecho' (oldest→newest acumulado)
  const asc = [...(data || [])].reverse()
  let bal = 0
  let pendOut = 0, pendIn = 0
  for (const m of asc) {
    if (m.estado === 'cancelado') continue
    const neto = _movNetoMxn(m)
    if (m.estado === 'pendiente') {
      if (m.tipo === 'entrada') pendIn  += neto
      else                       pendOut += neto
      continue
    }
    // hecho (o sin estado tratado como hecho)
    if (m.tipo === 'entrada') bal += neto
    else                       bal -= neto
  }

  const disponible = _round2(bal)
  pendOut = _round2(pendOut)
  pendIn  = _round2(pendIn)
  const real = _round2(disponible - pendOut + pendIn)

  const payload = {
    orqId,
    disponible,
    pendienteOut: pendOut,
    pendienteIn:  pendIn,
    real,
    count: data?.length || 0,
    fetchedAt: Date.now(),
  }
  _cache.set(orqId, { fetchedAt: Date.now(), payload })
  return payload
}

/**
 * Saldo real de TODAS las cuentas del usuario — cross-modular.
 *
 * Lee de 3 fuentes:
 *   - 'bio'    → Bio-Finanzas (nodes type=account + sus income/expense)
 *   - 'movs'   → Movimientos (orquestadores + tabla movimientos)
 *   - 'crypto' → Cripto Wallets (crypto_wallets + balance manual)
 *
 * Cada cuenta queda etiquetada con `source`. La UI puede filtrar las que
 * el usuario marca como "contar en AFP" vía user_metadata.afp.tracked_accounts.
 *
 * @returns {Promise<{ accounts: Array, totals: object }>}
 */
export async function getAllRealBalances({ forceRefresh = false, onlyTracked = false } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { accounts: [], totals: { disponible: 0, pendienteOut: 0, pendienteIn: 0, real: 0 } }

  const tracked = user.user_metadata?.afp?.tracked_accounts || null

  // ── Bio-Finanzas accounts ──────────────────────────────────────────────────
  const bioAccountsPromise = (async () => {
    const { data: accNodes } = await supabase.from('nodes')
      .select('id, content, metadata, created_at')
      .eq('owner_id', user.id).eq('type', 'account')
      .order('created_at', { ascending: true })
    if (!accNodes?.length) return []
    // Para cada cuenta, calcular saldo = initial + income - expense
    const { data: txNodes } = await supabase.from('nodes')
      .select('type, metadata').eq('owner_id', user.id).in('type', ['income', 'expense'])
    const allTx = txNodes || []
    return accNodes.map(a => {
      const initBal = Number(a.metadata?.balance || 0)
      const myTx = allTx.filter(t => t.metadata?.account_id === a.id)
      const income = myTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.metadata?.amount || 0), 0)
      const expense = myTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.metadata?.amount || 0), 0)
      const bal = _round2(initBal + income - expense)
      return {
        source: 'bio', id: a.id, name: a.content || a.metadata?.label || 'Cuenta',
        currency: a.metadata?.currency || 'MXN',
        disponible: bal, pendienteOut: 0, pendienteIn: 0, real: bal,
        count: myTx.length,
      }
    })
  })()

  // ── Movimientos orquestadores ──────────────────────────────────────────────
  const movsAccountsPromise = (async () => {
    const { data: orqs } = await supabase.from('orquestadores')
      .select('id, nombre, moneda_principal')
      .eq('owner_id', user.id).order('nombre', { ascending: true })
    if (!orqs?.length) return []
    return Promise.all(orqs.map(async o => {
      const b = await getRealBalance(o.id, { forceRefresh })
      return {
        source: 'movs', id: o.id, name: o.nombre,
        currency: o.moneda_principal || 'MXN',
        disponible: b.disponible, pendienteOut: b.pendienteOut,
        pendienteIn: b.pendienteIn, real: b.real, count: b.count,
      }
    }))
  })()

  // ── Cripto Wallets ─────────────────────────────────────────────────────────
  const cryptoAccountsPromise = (async () => {
    const { data: wallets } = await supabase.from('crypto_wallets')
      .select('id, name, kind, provider, manual_balance_mxn')
      .eq('owner_id', user.id).eq('is_active', true).order('created_at', { ascending: true })
    if (!wallets?.length) return []
    return wallets.map(w => {
      const bal = _round2(Number(w.manual_balance_mxn || 0))
      return {
        source: 'crypto', id: w.id, name: w.name,
        currency: 'MXN',  // balance equivalente
        kind: w.kind, provider: w.provider,
        disponible: bal, pendienteOut: 0, pendienteIn: 0, real: bal, count: 0,
      }
    })
  })()

  const [bio, movs, crypto] = await Promise.all([bioAccountsPromise, movsAccountsPromise, cryptoAccountsPromise])
  let accounts = [...bio, ...movs, ...crypto]

  if (onlyTracked && Array.isArray(tracked)) {
    const trackedSet = new Set(tracked.map(t => `${t.source}:${t.id}`))
    accounts = accounts.filter(a => trackedSet.has(`${a.source}:${a.id}`))
  }

  const totals = accounts.reduce((acc, a) => ({
    disponible:   _round2(acc.disponible   + a.disponible),
    pendienteOut: _round2(acc.pendienteOut + a.pendienteOut),
    pendienteIn:  _round2(acc.pendienteIn  + a.pendienteIn),
    real:         _round2(acc.real         + a.real),
  }), { disponible: 0, pendienteOut: 0, pendienteIn: 0, real: 0 })

  return { accounts, totals }
}

/** Marca / desmarca una cuenta como "tracked" en AFP. */
export async function toggleTrackedAccount(source, id) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sin sesión')
  const afp = { ...(user.user_metadata?.afp || {}) }
  const tracked = Array.isArray(afp.tracked_accounts) ? [...afp.tracked_accounts] : []
  const key = `${source}:${id}`
  const idx = tracked.findIndex(t => `${t.source}:${t.id}` === key)
  if (idx >= 0) tracked.splice(idx, 1)
  else tracked.push({ source, id })
  afp.tracked_accounts = tracked
  await supabase.auth.updateUser({ data: { afp } })
  return tracked
}

export async function getTrackedAccounts() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.user_metadata?.afp?.tracked_accounts || []
}

/**
 * Invalida cache de una cuenta o todas. Se llama desde puntos donde sabemos
 * que algo cambió (inserción/edición/borrado de movimiento, cancelar
 * pendiente, etc.).
 */
export function invalidateBalance(orqId = null) {
  if (orqId) _cache.delete(orqId)
  else _cache.clear()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('balance:changed', { detail: { orqId } }))
  }
}

/** Suscribirse a cambios de saldo. Devuelve función para desuscribirse. */
export function onBalanceChanged(handler) {
  if (typeof window === 'undefined') return () => {}
  const wrap = (e) => handler(e.detail || {})
  window.addEventListener('balance:changed', wrap)
  return () => window.removeEventListener('balance:changed', wrap)
}

// ── Selección de "cuenta primaria AFP" ───────────────────────────────────────
// El usuario marca una cuenta de Movimientos como su "cuenta principal" para
// que AFP la use como referencia de Saldo Real. Se persiste en user_metadata.
const META_KEY = 'afp_primary_orq_id'

export async function getPrimaryAfpAccount() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.user_metadata?.[META_KEY] || null
  } catch { return null }
}

export async function setPrimaryAfpAccount(orqId) {
  await supabase.auth.updateUser({ data: { [META_KEY]: orqId || null } })
}

// ── Exponer en window para uso ad-hoc desde la consola / módulos legacy ─────
if (typeof window !== 'undefined') {
  window.nexusBalance = {
    get:        getRealBalance,
    getAll:     getAllRealBalances,
    invalidate: invalidateBalance,
    onChange:   onBalanceChanged,
    primary:    getPrimaryAfpAccount,
    setPrimary: setPrimaryAfpAccount,
    toggleTracked: toggleTrackedAccount,
    trackedList:   getTrackedAccounts,
  }
}
