// Nexus OS — Cálculos puros de Movimientos (rebanada 2 de la extracción).
//
// Matemática del dinero del orquestador: bruto MXN, comisión, neto, KPIs y
// saldo acumulado. Sin DOM ni estado global → testeable y reutilizable.

/** Bruto MXN: cantidad × TC — equivalente en MXN de lo recibido. */
export function mvNetAmount(m) {
  return m.monto_mxn ?? Math.round((m.cantidad * (m.tc || 1)) * 100) / 100
}

/** Comisión (ganancia) en MXN. Solo en entradas con comisión; uso interno. */
export function mvComisionMxn(m) {
  if (m.tipo !== 'entrada' || m.comision == null) return 0
  const bruto = mvNetAmount(m)
  // comision almacenado como factor (ej. 0.97) → ganancia = bruto × (1 − factor)
  return Math.round(bruto * (1 - m.comision) * 100) / 100
}

/** Neto MXN del cliente = bruto − comisión (lo que entra al estado de cuenta). */
export function mvNetoAmount(m) {
  return Math.round((mvNetAmount(m) - mvComisionMxn(m)) * 100) / 100
}

/** KPIs de una lista: entradas, salidas, neto, pendiente y comisiones. */
export function mvKpis(list) {
  let entradas = 0, salidas = 0, pendiente = 0, comisiones = 0
  for (const m of list) {
    if (m.estado === 'cancelado') continue
    const neto = mvNetoAmount(m)   // usa neto (bruto − comisión)
    if (m.estado === 'pendiente') { pendiente += (m.tipo === 'entrada' ? neto : -neto); continue }
    if (m.tipo === 'entrada') { entradas += neto; comisiones += mvComisionMxn(m) }
    else salidas += neto
  }
  return { entradas, salidas, net: entradas - salidas, pendiente, comisiones }
}

/** Cotización de compra de cripto (calculadora inversa).
 *  El cliente necesita `amount` de una cripto a `tc` MXN por unidad, y le
 *  cobramos el valor de mercado + nuestra comisión `feePct`.
 *  Devuelve: baseMXN (mercado), feeMXN (nuestra comisión), totalMXN (lo que
 *  paga el cliente), y sus equivalentes en cripto.
 */
export function otcQuote({ amount, tc, feePct = 0 }) {
  const a = Number(amount) || 0
  const rate = Number(tc) || 0
  const fee = Number(feePct) || 0
  const r2 = n => Math.round(n * 100) / 100
  const r6 = n => Math.round(n * 1e6) / 1e6
  const baseMXN = r2(a * rate)                 // valor de mercado
  const feeMXN = r2(baseMXN * (fee / 100))     // nuestra comisión (ganancia)
  const totalMXN = r2(baseMXN + feeMXN)        // lo que el cliente debe pagar
  return {
    amount: a, tc: rate, feePct: fee,
    baseMXN, feeMXN, totalMXN,
    feeCrypto: rate ? r6(feeMXN / rate) : 0,     // comisión expresada en cripto
    totalCrypto: rate ? r6(totalMXN / rate) : 0, // total expresado en cripto
  }
}

/** Añade saldo acumulado (_balance) a cada movimiento. Entra newest-first. */
export function mvWithBalance(sorted) {
  const asc = [...sorted].reverse()   // oldest→newest para acumular
  let bal = 0
  const withBal = asc.map(m => {
    // Solo "hecho" impacta saldo; pendiente y cancelado no.
    if (m.estado === 'hecho' || (!m.estado && m.estado !== 'cancelado' && m.estado !== 'pendiente')) {
      bal += m.tipo === 'entrada' ? mvNetoAmount(m) : -mvNetoAmount(m)
    }
    return { ...m, _balance: Math.round(bal * 100) / 100, _pending: m.estado === 'pendiente' }
  })
  return withBal.reverse()
}
