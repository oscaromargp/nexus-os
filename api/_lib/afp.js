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

// ═══════════════════════════════════════════════════════════════════════════════
// AFP v6 · Gamificación + situación de hoy
// ═══════════════════════════════════════════════════════════════════════════════

/** Niveles del jugador (ascendentes). */
export const XP_LEVELS = [
  { lvl: 1, xp: 0,      name: 'Recién empezando' },
  { lvl: 2, xp: 500,    name: 'Aprendiz' },
  { lvl: 3, xp: 1500,   name: 'Disciplinado' },
  { lvl: 4, xp: 4000,   name: 'Constante' },
  { lvl: 5, xp: 10000,  name: 'Maestro del flujo' },
  { lvl: 6, xp: 25000,  name: 'Arquitecto' },
  { lvl: 7, xp: 60000,  name: 'Inmovible' },
]

/** Catálogo de acciones que dan XP. xp_delta positivo siempre (no castigamos). */
export const XP_ACTIONS = {
  pay_on_time:          { xp: 15,  label: 'Pago a tiempo' },
  save_forced:          { xp: 50,  label: 'Ahorro forzado del cobro' },
  streak_4w_save:       { xp: 200, label: 'Racha 4 semanas ahorrando' },
  plan_100:             { xp: 500, label: 'Plan del mes completo' },
  no_touch_cold_30d:    { xp: 300, label: '30 días sin tocar Cold Wallet' },
  register_expense:     { xp: 5,   label: 'Gasto registrado el mismo día' },
  honest_no_money:      { xp: 10,  label: 'Honestidad: no me alcanzó' },
  pay_late:             { xp: 5,   label: 'Pago tardío (igual cuenta)' },
  unlock_wish:          { xp: 0,   label: 'Deseo desbloqueado' },
}

export function levelFor(totalXp) {
  let curr = XP_LEVELS[0]
  let next = XP_LEVELS[XP_LEVELS.length - 1]
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (totalXp >= XP_LEVELS[i].xp) curr = XP_LEVELS[i]
    if (XP_LEVELS[i].xp > totalXp)  { next = XP_LEVELS[i]; break }
  }
  const isMax = curr.lvl === XP_LEVELS[XP_LEVELS.length - 1].lvl
  const progress = isMax ? 100
    : Math.round(((totalXp - curr.xp) / (next.xp - curr.xp)) * 100)
  return { current: curr, next: isMax ? null : next, progress }
}

/** Suma XP idempotente. Si (action, ref_kind, ref_id) ya existe, no duplica. */
export async function awardXp(admin, userId, action, refKind = null, refId = null, notes = null) {
  const def = XP_ACTIONS[action]
  if (!def) return { ok: false, error: 'acción desconocida' }
  const payload = {
    owner_id: userId, action, xp_delta: def.xp,
    ref_kind: refKind, ref_id: refId ? String(refId) : null, notes,
  }
  // ON CONFLICT do nothing (gracias al unique index parcial)
  const { data, error } = await admin.from('afp_xp_log')
    .upsert(payload, { onConflict: 'owner_id,action,ref_kind,ref_id', ignoreDuplicates: true })
    .select()
  if (error && !/duplicate/i.test(error.message)) return { ok: false, error: error.message }
  return { ok: true, awarded: data?.length ? def.xp : 0 }
}

export async function getXpSummary(admin, userId) {
  const { data: all } = await admin.from('afp_xp_log')
    .select('xp_delta').eq('owner_id', userId)
  const total = (all || []).reduce((s, r) => s + Number(r.xp_delta || 0), 0)
  const lvl = levelFor(total)
  const { data: recent } = await admin.from('afp_xp_log')
    .select('*').eq('owner_id', userId)
    .order('created_at', { ascending: false }).limit(20)
  return { total, level: lvl, recent: recent || [] }
}

// ── Rachas ──────────────────────────────────────────────────────────────────
function _isoWeekKey(d) {
  const dt = new Date(d)
  dt.setUTCHours(0, 0, 0, 0)
  const day = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - day)
  const year = dt.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7)
  return year + '-W' + String(week).padStart(2, '0')
}

function _dayKey(d) { return new Date(d).toISOString().slice(0, 10) }

function _prevIsoWeek(weekKey) {
  // Dado 2026-W24 → devuelve 2026-W23 (con manejo de cambio de año aproximado)
  const [y, w] = weekKey.split('-W').map(Number)
  if (w === 1) return (y - 1) + '-W52'
  return y + '-W' + String(w - 1).padStart(2, '0')
}

export async function getStreaks(admin, userId, meta = {}) {
  // Streak 1: semanas ahorrando — XP logs action=save_forced agrupados por semana
  const { data: saves } = await admin.from('afp_xp_log')
    .select('created_at').eq('owner_id', userId).eq('action', 'save_forced')
    .order('created_at', { ascending: false })
  const saveWeeks = new Set((saves || []).map(r => _isoWeekKey(r.created_at)))
  let streakSave = 0
  let recordSave = 0
  if (saveWeeks.size) {
    // Racha actual desde la semana en curso
    let cursor = _isoWeekKey(new Date())
    while (saveWeeks.has(cursor)) { streakSave++; cursor = _prevIsoWeek(cursor) }
    // Récord: corrida más larga en histórico
    const sortedWeeks = [...saveWeeks].sort()
    let run = 1; recordSave = 1
    for (let i = 1; i < sortedWeeks.length; i++) {
      if (sortedWeeks[i] === _nextIsoWeek(sortedWeeks[i - 1])) { run++; recordSave = Math.max(recordSave, run) }
      else run = 1
    }
    recordSave = Math.max(recordSave, streakSave)
  }

  // Streak 2: días sin gasto FUERA DE PLAN en la cuenta primaria
  // Heurística: gasto fuera de plan = movimiento tipo='salida' que NO está taggeado proyecto LIKE 'afp:%'
  let streakNoOff = 0, recordNoOff = 0
  const primaryOrqId = meta.afp_primary_orq_id || null
  if (primaryOrqId) {
    const { data: lastOff } = await admin.from('movimientos')
      .select('fecha').eq('orquestador_id', primaryOrqId)
      .eq('tipo', 'salida').not('proyecto', 'like', 'afp:%')
      .order('fecha', { ascending: false }).limit(1)
    if (!lastOff?.length) {
      // Sin gastos fuera de plan registrados — racha = días desde creación de cuenta o 30 default
      streakNoOff = 30
    } else {
      const lastDate = new Date(lastOff[0].fecha)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      streakNoOff = Math.max(0, Math.floor((today - lastDate) / 86400000))
    }
    recordNoOff = streakNoOff  // primer pase: récord = actual
  }

  // Streak 3: días sin tocar Cold Wallet — best-effort, busca movs etiquetados con cold
  let streakCold = 0, recordCold = 0
  const coldLabel = meta.afp?.cold_wallet_label || null
  if (coldLabel) {
    const { data: lastCold } = await admin.from('movimientos')
      .select('fecha').eq('owner_id', userId).eq('tipo', 'salida')
      .or(`notas.ilike.%${coldLabel}%,beneficiario.ilike.%${coldLabel}%`)
      .order('fecha', { ascending: false }).limit(1)
    if (!lastCold?.length) {
      streakCold = 90  // placeholder optimista si no hay retiros
    } else {
      const lastDate = new Date(lastCold[0].fecha)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      streakCold = Math.max(0, Math.floor((today - lastDate) / 86400000))
    }
    recordCold = streakCold
  }

  return {
    save_weeks:    { current: streakSave,  record: recordSave,  unit: 'semanas', label: 'ahorrando' },
    no_off_plan:   { current: streakNoOff, record: recordNoOff, unit: 'días',    label: 'sin gasto fuera de plan' },
    no_cold_touch: { current: streakCold,  record: recordCold,  unit: 'días',    label: 'sin tocar Cold Wallet' },
  }
}

function _nextIsoWeek(weekKey) {
  const [y, w] = weekKey.split('-W').map(Number)
  if (w === 52 || w === 53) return (y + 1) + '-W01'
  return y + '-W' + String(w + 1).padStart(2, '0')
}

// ── Situación de hoy · datos secos sin score ────────────────────────────────
export async function buildSituationToday(admin, userId, meta = {}) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const monthStr = todayStr.slice(0, 7)

  const [incRes, fixedRes, debtRes, cushionRes, primMovsRes, xpThisWeekRes] = await Promise.all([
    admin.from('afp_incomes').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_fixed_expenses').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_debts').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_cushion').select('*').eq('owner_id', userId).maybeSingle(),
    meta.afp_primary_orq_id
      ? admin.from('movimientos').select('estado,fecha,tipo,monto_mxn,proyecto')
          .eq('orquestador_id', meta.afp_primary_orq_id)
          .gte('fecha', monthStr + '-01')
      : Promise.resolve({ data: [] }),
    admin.from('afp_xp_log').select('xp_delta,action,created_at')
      .eq('owner_id', userId)
      .gte('created_at', new Date(today.getTime() - 7 * 86400000).toISOString()),
  ])
  const incomes = incRes.data || []
  const fixed   = fixedRes.data || []
  const debts   = debtRes.data || []
  const cushion = cushionRes.data || { current_balance: 0 }
  const movs    = primMovsRes.data || []

  // Saldo disponible (cuentas primaria, estado=hecho)
  let disponible = 0
  for (const m of movs) {
    if (m.estado !== 'hecho') continue
    const monto = Number(m.monto_mxn || 0)
    disponible += m.tipo === 'entrada' ? monto : -monto
  }
  disponible = Math.round(disponible * 100) / 100

  // Pagos del mes: ítems del plan + sus checks
  const monthFixed = fixed.map(f => ({
    name: f.name, amount: toMonthly(f.amount, f.frequency),
    due_day: f.due_day || null, is_sacred: f.is_sacred,
  }))
  const totalFixedMonth = monthFixed.reduce((s, f) => s + f.amount, 0)

  // Cuántos movs AFP planeados en este mes están done
  const afpMovs = movs.filter(m => (m.proyecto || '').startsWith('afp:'))
  const doneAfp = afpMovs.filter(m => m.estado === 'hecho').length
  const pendAfp = afpMovs.filter(m => m.estado === 'pendiente').length

  // Total pendiente por pagar en lo que resta del mes
  const today_day = today.getDate()
  const upcomingFixed = monthFixed.filter(f => f.due_day && f.due_day >= today_day)
  const totalUpcomingFixed = upcomingFixed.reduce((s, f) => s + f.amount, 0)
  const totalUpcomingDebts = debts.reduce((s, d) => s + Number(d.min_payment || 0), 0)
  const totalUpcomingAll = totalUpcomingFixed + totalUpcomingDebts

  // Ahorro esta semana (xp action save_forced en los últimos 7 días)
  const xpEvents = xpThisWeekRes.data || []
  const savedThisWeek = xpEvents.filter(e => e.action === 'save_forced').length > 0
  // Monto exacto ahorrado lo podemos derivar del proyecto:afp pendiente o hecho con kind 'cushion'/'sacred'
  // por simplicidad estimamos: 10% del último cobro semanal
  const savingsPct = Number(meta.afp?.savings_pct || 10)
  const savingsFloor = Number(meta.afp?.savings_floor || 0)
  const lastWeeklyIncome = incomes.find(i => i.frequency === 'weekly')?.amount || 0
  const savedAmt = Math.max(Math.round(lastWeeklyIncome * savingsPct / 100), savingsFloor)

  // Frase corta y seca
  const lines = []
  const dayName = today.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  lines.push(`Hoy es ${dayName}.`)
  if (afpMovs.length) {
    lines.push(`Llevas ${doneAfp} de ${afpMovs.length} pagos del mes${pendAfp ? ` · ${pendAfp} pendientes` : ''}.`)
  }
  if (disponible) {
    if (totalUpcomingAll > 0) {
      const after = disponible - totalUpcomingAll
      lines.push(`Tienes $${disponible.toLocaleString('es-MX')} · te faltan ${upcomingFixed.length + debts.length} pagos por $${Math.round(totalUpcomingAll).toLocaleString('es-MX')}.`)
      if (after < 0) lines.push(`⚠ Cubrir lo que falta requiere $${Math.abs(Math.round(after)).toLocaleString('es-MX')} más. NO gastes fuera de plan esta semana.`)
      else lines.push(`Después de cubrirlos: $${Math.round(after).toLocaleString('es-MX')} libres.`)
    } else {
      lines.push(`Tienes $${disponible.toLocaleString('es-MX')} disponibles · ya cubriste todos los pagos fijos del mes.`)
    }
  }
  if (savedThisWeek) {
    lines.push(`Esta semana apartaste tu ahorro forzado ($${savedAmt.toLocaleString('es-MX')}). ✓`)
  } else if (lastWeeklyIncome) {
    lines.push(`Tu ahorro forzado de esta semana ($${savedAmt.toLocaleString('es-MX')}) aún no se aparta.`)
  }

  return {
    today: todayStr,
    disponible,
    pagos_done: doneAfp,
    pagos_pendientes: pendAfp,
    pagos_total: afpMovs.length,
    upcoming_total: Math.round(totalUpcomingAll),
    upcoming_count: upcomingFixed.length + debts.length,
    saved_this_week: savedThisWeek,
    save_amount_target: savedAmt,
    cushion_balance: Number(cushion.current_balance || 0),
    summary: lines,
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
