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
