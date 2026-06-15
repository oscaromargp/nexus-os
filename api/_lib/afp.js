// Shared AFP logic used by /api/financial and /api/agent.
//
// Calcula el plan semanal accionable de un usuario con instrucciones
// nombre+razón, modo adaptativo y formateo opcional para Telegram.

export function toMonthly(amount, frequency) {
  const a = Number(amount) || 0
  switch (frequency) {
    case 'weekly':    return a * 4
    case 'biweekly':  return a * 2
    case 'monthly':   return a
    case 'bimonthly': return a / 2
    case 'quarterly': return a / 3
    case 'yearly':    return a / 12
    case 'one_time':  return a
    default:          return a
  }
}

export function isoWeekFor(d = new Date()) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7)
  return dt.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0')
}

/** Construye el plan semanal completo del usuario. Lee tablas afp_* y movimientos. */
export async function buildWeekPlan(admin, userId, userMetadata = {}) {
  const today = new Date()
  const monthStr = today.toISOString().substring(0, 7)
  const week = isoWeekFor(today)
  const dow = today.getDay() || 7
  const monday = new Date(today); monday.setDate(today.getDate() - dow + 1)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)

  const [incRes, fixedRes, debtRes, goalRes, cushionRes] = await Promise.all([
    admin.from('afp_incomes').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_fixed_expenses').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_debts').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_goals').select('*').eq('owner_id', userId).eq('is_achieved', false),
    admin.from('afp_cushion').select('*').eq('owner_id', userId).maybeSingle(),
  ])
  const incomes = incRes.data || []
  const fixed   = fixedRes.data || []
  const debts   = debtRes.data || []
  const goals   = goalRes.data || []
  const cushion = cushionRes.data || { current_balance: 0, target_months: 3 }

  // Saldo real cuenta primaria
  let realBalance = 0
  let primaryAccountLabel = null
  const primaryOrqId = userMetadata.afp_primary_orq_id || null
  if (primaryOrqId) {
    const { data: orq } = await admin.from('orquestadores').select('nombre').eq('id', primaryOrqId).maybeSingle()
    primaryAccountLabel = orq?.nombre || null
    const { data: movs } = await admin.from('movimientos')
      .select('tipo, estado, cantidad, tc, monto_mxn, comision')
      .eq('orquestador_id', primaryOrqId)
    for (const m of (movs || [])) {
      if (m.estado !== 'hecho') continue
      const bruto = m.monto_mxn ?? Math.round((m.cantidad * (m.tc || 1)) * 100) / 100
      const comMxn = (m.tipo === 'entrada' && m.comision != null)
        ? Math.round(bruto * (1 - m.comision) * 100) / 100 : 0
      const neto = bruto - comMxn
      realBalance += m.tipo === 'entrada' ? neto : -neto
    }
    realBalance = Math.round(realBalance * 100) / 100
  }

  const monthlyIncome = incomes.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0)
  const monthlyFixed  = fixed.reduce((s, f) => s + toMonthly(f.amount, f.frequency), 0)

  // INGRESOS
  const incomeItems = []
  incomes.forEach(i => {
    let amount = 0, reason = ''
    if (i.frequency === 'weekly') { amount = Number(i.amount); reason = 'ingreso semanal' }
    else if (i.frequency === 'biweekly') {
      const weeksFromStart = Math.floor((today.getDate() - 1) / 7)
      if (weeksFromStart % 2 === 0) { amount = Number(i.amount); reason = 'ingreso quincenal' }
    } else if (i.frequency === 'monthly') {
      const md1 = new Date(today.getFullYear(), today.getMonth(), 1)
      if (md1 >= monday && md1 <= sunday) { amount = Number(i.amount); reason = 'ingreso mensual' }
    }
    if (amount > 0) incomeItems.push({ kind: 'income', label: i.name, amount, reason, category: i.category || null })
  })
  const totalIncomeWeek = incomeItems.reduce((s, x) => s + x.amount, 0)

  // SAGRADO
  const sacredItems = []
  fixed.filter(f => f.is_sacred).forEach(f => {
    const weekAmount = toMonthly(f.amount, f.frequency) / 4
    sacredItems.push({ kind: 'sacred', label: f.name, amount: Math.round(weekAmount),
      reason: 'compromiso sagrado · no se reduce nunca', category: f.category || null })
  })

  // MODO
  let mode = 'balance', modeLabel = 'Equilibrio', modeReason = 'Todo cubierto.'
  const cushionTarget = monthlyFixed * Number(cushion.target_months || 3)
  const cushionProgress = cushionTarget > 0
    ? Math.min(100, (Number(cushion.current_balance) / cushionTarget) * 100)
    : 100
  const highInterestDebt = debts.find(d => Number(d.interest_rate || 0) >= 15)
  const realOrFallback = realBalance || monthlyIncome

  if (realOrFallback < monthlyFixed * 0.5) {
    mode = 'survival'; modeLabel = 'Supervivencia'
    modeReason = `Tu saldo real ($${Math.round(realOrFallback).toLocaleString()}) no alcanza ni la mitad de tus gastos fijos ($${Math.round(monthlyFixed).toLocaleString()}/mes). Solo dispersa sagrado + crítico.`
  } else if (highInterestDebt) {
    mode = 'debt'; modeLabel = 'Liquidación de deuda'
    modeReason = `Deuda al ${Number(highInterestDebt.interest_rate).toFixed(0)}% TAE ("${highInterestDebt.name}"). Cada peso es la mejor inversión.`
  } else if (cushionProgress < 100) {
    mode = 'build'; modeLabel = 'Construcción de colchón'
    modeReason = `Tu colchón cubre ${cushionProgress.toFixed(0)}% de la meta. Prioridad: terminar de armarlo.`
  } else if (goals.length > 0) {
    mode = 'accumulate'; modeLabel = 'Acumulación a metas'
    modeReason = `Colchón listo. Toca atacar tus metas con plazo.`
  }

  // COLCHÓN
  const cushionItems = []
  if (mode === 'build' || mode === 'survival') {
    const faltante = Math.max(0, cushionTarget - Number(cushion.current_balance))
    const weeklyContrib = Math.min(faltante, Math.round(monthlyFixed / 4 / 2))
    if (weeklyContrib > 0) cushionItems.push({
      kind: 'cushion', label: 'Colchón Fiat', amount: weeklyContrib,
      reason: `te faltan $${Math.round(faltante).toLocaleString()} para llegar a ${cushion.target_months} meses de seguridad`,
    })
  }

  // DEUDAS
  const debtItems = []
  debts.sort((a, b) => Number(b.interest_rate || 0) - Number(a.interest_rate || 0)).forEach(d => {
    const minWeekly = Number(d.min_payment || 0) / 4
    if (minWeekly > 0) debtItems.push({
      kind: 'debt', label: d.name, amount: Math.round(minWeekly),
      reason: d.interest_rate
        ? `pago mínimo · TAE ${Number(d.interest_rate).toFixed(0)}% · no caer en intereses`
        : 'pago mínimo de la deuda',
    })
  })

  // METAS
  const goalItems = []
  goals.forEach(g => {
    if (!g.deadline) return
    const dl = new Date(g.deadline)
    if (isNaN(dl) || dl <= today) return
    const weeksLeft = Math.max(1, Math.ceil((dl - today) / (7 * 86400000)))
    const remaining = Number(g.target_amount) - Number(g.current_amount || 0)
    if (remaining <= 0) return
    goalItems.push({
      kind: 'goal', label: g.name, amount: Math.round(remaining / weeksLeft),
      reason: `meta $${Math.round(g.target_amount).toLocaleString()} en ${weeksLeft} semanas · faltan $${Math.round(remaining).toLocaleString()}`,
      deadline: g.deadline,
    })
  })

  // FREE + ajuste mínimo de vivir
  const minLivingWeekly = Number(userMetadata.afp?.min_living_weekly || 1500)
  const totalCommitted = [...sacredItems, ...cushionItems, ...debtItems, ...goalItems]
    .reduce((s, x) => s + x.amount, 0)
  let freeAmount = totalIncomeWeek - totalCommitted
  const warnings = []
  if (freeAmount < minLivingWeekly && goalItems.length > 0) {
    const deficit = minLivingWeekly - freeAmount
    const goalTotal = goalItems.reduce((s, g) => s + g.amount, 0)
    if (goalTotal > 0) {
      const reduceFactor = Math.max(0, 1 - (deficit / goalTotal))
      goalItems.forEach(g => { g.amount = Math.round(g.amount * reduceFactor); g.reduced = true })
      freeAmount = totalIncomeWeek
        - sacredItems.reduce((s, x) => s + x.amount, 0)
        - cushionItems.reduce((s, x) => s + x.amount, 0)
        - debtItems.reduce((s, x) => s + x.amount, 0)
        - goalItems.reduce((s, x) => s + x.amount, 0)
      warnings.push(`Reducimos $${Math.round(deficit).toLocaleString()} de metas para respetar tu mínimo semanal ($${minLivingWeekly.toLocaleString()}).`)
    }
  }

  return {
    week,
    week_start: monday.toISOString().slice(0, 10),
    week_end:   sunday.toISOString().slice(0, 10),
    month: monthStr,
    mode, modeLabel, modeReason,
    income:   incomeItems,
    sacred:   sacredItems,
    cushion:  cushionItems,
    debts:    debtItems,
    goals:    goalItems,
    total_income:    Math.round(totalIncomeWeek),
    total_committed: Math.round(totalCommitted),
    free_amount:     Math.round(Math.max(0, freeAmount)),
    min_living_weekly: minLivingWeekly,
    real_balance:    Math.round(realBalance),
    primary_account_label: primaryAccountLabel,
    warnings,
  }
}

/** Formatea el plan para Telegram (Markdown). */
export function formatWeekPlanTelegram(plan) {
  const MODE = {
    survival:   { e: '🩹', n: 'Supervivencia' },
    debt:       { e: '🔥', n: 'Liquidación' },
    build:      { e: '🏗️', n: 'Construcción' },
    accumulate: { e: '🌱', n: 'Acumulación' },
    balance:    { e: '⚖️', n: 'Equilibrio' },
  }
  const m = MODE[plan.mode] || MODE.balance
  const $ = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX')

  const lines = []
  lines.push(`${m.e} *AFP · Plan semana ${plan.week_start.slice(5)} → ${plan.week_end.slice(5)}*`)
  lines.push(`Modo: *${m.n}*`)
  lines.push(`_${plan.modeReason}_`)
  if (plan.primary_account_label) {
    lines.push(`💵 Saldo real ${plan.primary_account_label}: *${$(plan.real_balance)}*`)
  }
  lines.push('')

  if (plan.income.length) {
    lines.push('📥 *Ingresos esperados:*')
    plan.income.forEach(i => lines.push(`  • +${i.label}: ${$(i.amount)}  _(${i.reason})_`))
    lines.push('')
  }

  const allCommit = [
    ...plan.sacred.map(x  => ({ ...x, e: '🔒' })),
    ...plan.cushion.map(x => ({ ...x, e: '🛡' })),
    ...plan.debts.map(x   => ({ ...x, e: '💳' })),
    ...plan.goals.map(x   => ({ ...x, e: '🎯' })),
  ].filter(x => x.amount > 0)

  if (allCommit.length) {
    lines.push('🎯 *Dispersiones (pase lo que pase):*')
    allCommit.forEach(c => lines.push(`  ${c.e} ${c.label}: *${$(c.amount)}*\n     _${c.reason}_`))
    lines.push('')
  }

  lines.push(`💸 *Libre para ti:* ${$(plan.free_amount)}  _(mínimo ${$(plan.min_living_weekly)})_`)

  if (plan.warnings.length) {
    lines.push('')
    plan.warnings.forEach(w => lines.push('⚠ ' + w))
  }

  lines.push('')
  lines.push('_Comprométete desde AFP · cada compromiso baja tu saldo real al instante._')

  return lines.join('\n')
}
