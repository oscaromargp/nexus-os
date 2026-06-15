// POST /api/financial { action, ... }
//
// Endpoint unificado de los módulos financieros:
//   - AFP (Arquitecto Financiero Personal)
//   - Cripto Portfolio + Journal
//
// Auth: JWT Bearer del usuario.

import { createClient } from '@supabase/supabase-js'
import { buildWeekPlan, formatWeekPlanTelegram } from './_lib/afp.js'

function getSupabase(authToken) {
  const url  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + authToken } },
  })
}

function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

// ════════════════════════════════════════════════════════════════════
// AFP — Arquitecto Financiero Personal
// ════════════════════════════════════════════════════════════════════

// Normaliza monto según frecuencia → mensual
// Multiplicadores enteros (más intuitivos para el usuario que el promedio anualizado):
//   semanal = 4 semanas/mes · quincenal = 2 quincenas/mes
function toMonthly(amount, frequency) {
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

async function afpDiagnose(admin, userId, userMetadata = {}) {
  const today = new Date()
  const monthStr = today.toISOString().substring(0, 7)  // 'YYYY-MM'
  const cfg = userMetadata.afp || {}
  const strategy = cfg.strategy || '50_30_20'
  const customDispersion = cfg.custom_dispersion || null

  // Pull data SOLO de tablas AFP
  const [incomesRes, fixedRes, debtsRes, planRes, goalsRes, adjRes, cushionRes] = await Promise.all([
    admin.from('afp_incomes').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_fixed_expenses').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_debts').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_monthly_plans').select('*').eq('owner_id', userId).eq('month', monthStr),
    admin.from('afp_goals').select('*').eq('owner_id', userId).eq('is_achieved', false),
    admin.from('afp_adjustments').select('*').eq('owner_id', userId).eq('month', monthStr).order('created_at'),
    admin.from('afp_cushion').select('*').eq('owner_id', userId).maybeSingle(),
  ])

  const incomes = incomesRes.data || []
  const fixedExpenses = fixedRes.data || []
  const debts = debtsRes.data || []
  const monthlyPlan = planRes.data || []
  const goals = goalsRes.data || []
  const adjustments = adjRes.data || []
  const cushion = cushionRes.data || { current_balance: 0, target_months: 3, account_label: null }

  // ── Ingresos: TODO viene de afp_incomes (declarado por usuario) ──
  const monthlyIncome = incomes.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0)
  const incomesNormalized = incomes.map(i => ({
    id: i.id, name: i.name, amount: Number(i.amount), frequency: i.frequency,
    monthly: toMonthly(i.amount, i.frequency), category: i.category, notes: i.notes,
  }))

  // ── Gastos fijos declarados (separa "sagrados" de los normales) ──
  const fixedNormalized = fixedExpenses.map(f => ({
    id: f.id, name: f.name, amount: Number(f.amount), frequency: f.frequency,
    monthly: toMonthly(f.amount, f.frequency), category: f.category,
    due_day: f.due_day, priority: f.priority, notes: f.notes,
    is_sacred: !!f.is_sacred,
  })).sort((a,b) => (a.due_day || 99) - (b.due_day || 99))
  const monthlyFixed = fixedNormalized.reduce((s, f) => s + f.monthly, 0)
  const monthlySacred = fixedNormalized.filter(f => f.is_sacred).reduce((s, f) => s + f.monthly, 0)

  // ── Plan mensual (gastos puntuales de este mes) ──────────────
  const planTotal = monthlyPlan.reduce((s, p) => s + Number(p.amount), 0)
  const planNormalized = monthlyPlan.map(p => ({
    id: p.id, name: p.name, amount: Number(p.amount), category: p.category,
    planned_date: p.planned_date, priority: p.priority, is_done: p.is_done, notes: p.notes,
  })).sort((a,b) => (a.planned_date || '9999') < (b.planned_date || '9999') ? -1 : 1)

  // ── Deudas — pagos mínimos + estrategia ──────────────────────
  const debtsNormalized = debts.map(d => ({
    id: d.id, name: d.name, kind: d.kind, balance: Number(d.balance),
    credit_limit: d.credit_limit ? Number(d.credit_limit) : null,
    min_payment: Number(d.min_payment || 0), interest_rate: Number(d.interest_rate || 0),
    cut_day: d.cut_day, due_day: d.due_day, notes: d.notes,
  }))
  const totalDebtBalance = debtsNormalized.reduce((s, d) => s + d.balance, 0)
  const monthlyMinDebt = debtsNormalized.reduce((s, d) => s + d.min_payment, 0)
  // Avalanche: ordena por tasa desc (paga primero el más caro)
  const debtsByAvalanche = [...debtsNormalized]
    .filter(d => d.balance > 0)
    .sort((a,b) => b.interest_rate - a.interest_rate)
  // Snowball: por balance asc (paga primero el más chico — para motivación)
  const debtsBySnowball = [...debtsNormalized]
    .filter(d => d.balance > 0)
    .sort((a,b) => a.balance - b.balance)

  // ── Ajustes del mes (imprevistos, transferencias, ahorros extra) ──
  const adjustmentsImpact = {
    extra_expense: 0,
    extra_income: 0,
    saved: 0,
    transferred: 0,
  }
  for (const a of adjustments) {
    const amt = Number(a.amount) || 0
    if (a.kind === 'expense') adjustmentsImpact.extra_expense += amt
    else if (a.kind === 'income') adjustmentsImpact.extra_income += amt
    else if (a.kind === 'save') adjustmentsImpact.saved += amt
    else if (a.kind === 'transfer') adjustmentsImpact.transferred += amt
  }
  const adjustmentsNormalized = adjustments.map(a => ({
    id: a.id, kind: a.kind, amount: Number(a.amount), reason: a.reason,
    category: a.category, account_from: a.account_from, account_to: a.account_to,
    notes: a.notes, created_at: a.created_at,
  }))

  const monthlyCommitted = monthlyFixed + planTotal + monthlyMinDebt + adjustmentsImpact.extra_expense
  const effectiveIncome = monthlyIncome + adjustmentsImpact.extra_income
  const totalLiquido = 0
  const monthlyExpense = monthlyCommitted

  // ── Métricas clave ───────────────────────────────────────────
  const disposable = effectiveIncome - monthlyCommitted - adjustmentsImpact.saved
  const savingsRate = effectiveIncome > 0 ? (disposable / effectiveIncome) * 100 : 0
  const commitmentRatio = effectiveIncome > 0 ? (monthlyCommitted / effectiveIncome) * 100 : 0
  const debtToIncomeRatio = effectiveIncome > 0 ? (monthlyMinDebt / effectiveIncome) * 100 : 0

  // ── Score 0-100 (determinístico, basado en declaraciones) ────
  // 40 pts margen ahorrable (>30% = full)
  // 30 pts ratio deuda (0% = full, ≥40% = 0)
  // 30 pts equilibrio compromisos (≤60% = full, ≥90% = 0)
  let scoreAhorro = Math.max(0, Math.min(40, savingsRate * 1.33))
  let scoreDeuda  = Math.max(0, 30 - debtToIncomeRatio * 0.75)
  let scoreEquilibrio = Math.max(0, Math.min(30, (100 - commitmentRatio)))
  const score = Math.max(0, Math.round(scoreAhorro + scoreDeuda + scoreEquilibrio))

  let healthLabel, healthColor
  if (incomes.length === 0) {
    healthLabel = 'Sin datos'; healthColor = '#94a3b8'
  } else if (score >= 75)      { healthLabel = 'Excelente'; healthColor = '#22c55e' }
  else if (score >= 55) { healthLabel = 'Saludable';  healthColor = '#84cc16' }
  else if (score >= 35) { healthLabel = 'En riesgo';  healthColor = '#fbbf24' }
  else                  { healthLabel = 'Crítico';    healthColor = '#ef4444' }

  // ── Estrategia seleccionable ─────────────────────────────────
  const strategies = {
    '50_30_20':    { name: '50/30/20 clásica',     pct: { necesidades: 50, ahorro: 20, lifestyle: 30 } },
    '70_20_10':    { name: '70/20/10 conservadora',pct: { necesidades: 70, ahorro: 20, lifestyle: 10 } },
    'profit_first':{ name: 'Profit First Personal',pct: { necesidades: 55, ahorro: 25, lifestyle: 15, profit: 5 } },
    'aggressive':  { name: 'Ahorro agresivo 60/30/10', pct: { necesidades: 60, ahorro: 30, lifestyle: 10 } },
    'custom':      { name: 'Personalizada', pct: customDispersion || { necesidades: 50, ahorro: 20, lifestyle: 30 } },
  }
  const selected = strategies[strategy] || strategies['50_30_20']
  let pcts = { ...selected.pct }

  // Si la estrategia no es custom y hay deuda alta o liquidez baja, sugerir ajuste
  let adjustmentNote = null
  if (strategy !== 'custom') {
    if (commitmentRatio > pcts.necesidades) {
      adjustmentNote = `⚠ Tus compromisos (${commitmentRatio.toFixed(0)}%) superan el ${pcts.necesidades}% sugerido por esta estrategia. Considera reducir gastos fijos o cambiar a una estrategia más conservadora.`
    }
  }

  // Dispersión sugerida del PRÓXIMO ingreso
  const nextIncome = Math.round(monthlyIncome) || 5000
  const dispersion = {}
  for (const k of Object.keys(pcts)) {
    dispersion[k] = Math.round(nextIncome * pcts[k] / 100)
  }
  // Asegura 3 keys mínimas para retro-compat
  if (!dispersion.necesidades) dispersion.necesidades = 0
  if (!dispersion.ahorro) dispersion.ahorro = 0
  if (!dispersion.lifestyle) dispersion.lifestyle = 0

  // ── METAS con plan ───────────────────────────────────────────
  const monthlyAhorroCapacity = disposable
  const goalsWithPlan = goals.map(g => {
    const target = Number(g.target_amount) || 0
    const current = Number(g.current_amount) || 0
    const remaining = Math.max(0, target - current)
    const deadline = g.deadline ? new Date(g.deadline) : null
    const monthsLeft = deadline ? Math.max(1, Math.ceil((deadline - today) / (30 * 86400000))) : 12
    const monthlyNeeded = Math.ceil(remaining / monthsLeft)
    const gap = Math.max(0, monthlyNeeded - Math.max(0, monthlyAhorroCapacity))
    const extraJob = gap > 0 ? {
      gap_monthly: Math.round(gap),
      options: [
        { hours_per_week: 4,  hourly_rate: Math.ceil(gap / (4 * 4.33)) },
        { hours_per_week: 8,  hourly_rate: Math.ceil(gap / (8 * 4.33)) },
        { hours_per_week: 16, hourly_rate: Math.ceil(gap / (16 * 4.33)) },
      ],
    } : null
    return {
      id: g.id, name: g.name,
      target_amount: target, current_amount: current, remaining,
      deadline: g.deadline,
      months_left: monthsLeft, monthly_needed: monthlyNeeded,
      monthly_capacity: Math.round(monthlyAhorroCapacity),
      gap_monthly: Math.round(gap),
      achievable: gap <= 0,
      progress_pct: target > 0 ? Math.round((current / target) * 100) : 0,
      extra_job: extraJob,
    }
  })

  // ── Recomendación principal ──────────────────────────────────
  const recommendations = []
  if (incomes.length === 0) {
    recommendations.push({
      priority: 'alta', title: 'Empieza declarando tus ingresos',
      detail: 'Antes de poder analizar tu salud financiera necesitas decirme cuánto ganas y cada cuándo. Ve a ⚙️ Mi configuración → Ingresos.',
    })
  } else if (disposable < 0) {
    recommendations.push({
      priority: 'alta', title: '⚠️ Gastas más de lo que ganas',
      detail: `Tus compromisos suman $${monthlyCommitted.toLocaleString('es-MX')}/mes pero solo ganas $${Math.round(monthlyIncome).toLocaleString('es-MX')}. Te faltan $${Math.abs(Math.round(disposable)).toLocaleString('es-MX')}/mes. Necesitas reducir gastos fijos o aumentar ingreso urgente.`,
    })
  }

  // Recomendación de deudas (avalanche por tasa de interés)
  if (debtsByAvalanche.length > 0 && disposable > 0) {
    const target = debtsByAvalanche[0]
    const extra = Math.min(disposable, target.balance * 0.1)
    recommendations.push({
      priority: 'alta',
      title: '💳 Prioriza pagar ' + target.name,
      detail: `Es la deuda más cara (${target.interest_rate}% anual, saldo $${target.balance.toLocaleString('es-MX')}). Si abonas $${Math.round(extra).toLocaleString('es-MX')} extra al mes (sobre el mínimo de $${target.min_payment}), saldarías en ~${Math.ceil(target.balance / (target.min_payment + extra))} meses.`,
    })
  }

  if (commitmentRatio > 80 && incomes.length > 0) {
    recommendations.push({
      priority: 'alta', title: 'Compromisos muy altos',
      detail: `${commitmentRatio.toFixed(0)}% de tu ingreso está comprometido. Solo te queda $${Math.max(0, Math.round(disposable)).toLocaleString('es-MX')}/mes libre. Considera renegociar gastos o aumentar ingresos.`,
    })
  } else if (commitmentRatio > 60 && incomes.length > 0) {
    recommendations.push({
      priority: 'media', title: 'Compromisos elevados',
      detail: `${commitmentRatio.toFixed(0)}% comprometido. Ideal: ≤60%. Margen libre actual: $${Math.round(disposable).toLocaleString('es-MX')}/mes.`,
    })
  }

  if (savingsRate < 10 && savingsRate >= 0 && incomes.length > 0) {
    recommendations.push({
      priority: 'media', title: 'Empieza a ahorrar',
      detail: `Estás ahorrando ${savingsRate.toFixed(1)}% de tu ingreso. Meta inicial: 15-20%. Aunque sea $${Math.round(monthlyIncome * 0.05).toLocaleString('es-MX')}/mes al fondo de emergencia hace diferencia.`,
    })
  }

  if (recommendations.length === 0 && incomes.length > 0) {
    recommendations.push({
      priority: 'baja', title: '✓ Vas por buen camino',
      detail: `Tu salud financiera es ${healthLabel.toLowerCase()}. Considera empezar a invertir el excedente mensual para hacer crecer tu patrimonio.`,
    })
  }

  return {
    score,
    health: { label: healthLabel, color: healthColor },
    month: monthStr,
    metrics: {
      monthly_income: Math.round(monthlyIncome),
      effective_income: Math.round(effectiveIncome),
      monthly_fixed: Math.round(monthlyFixed),
      monthly_sacred: Math.round(monthlySacred),
      monthly_plan: Math.round(planTotal),
      monthly_min_debt: Math.round(monthlyMinDebt),
      monthly_committed: Math.round(monthlyCommitted),
      monthly_disposable: Math.round(disposable),
      monthly_savings_capacity: Math.round(disposable),
      total_debt_balance: Math.round(totalDebtBalance),
      savings_rate_pct: Number(savingsRate.toFixed(1)),
      commitment_ratio_pct: Number(commitmentRatio.toFixed(1)),
      debt_to_income_pct: Number(debtToIncomeRatio.toFixed(1)),
      adjustments_impact: adjustmentsImpact,
    },
    cushion: {
      current_balance: Number(cushion.current_balance || 0),
      target_months: Number(cushion.target_months || 3),
      target_amount: Math.round(monthlyFixed * Number(cushion.target_months || 3)),
      progress_pct: monthlyFixed > 0
        ? Math.min(100, Math.round((Number(cushion.current_balance || 0) / (monthlyFixed * Number(cushion.target_months || 3))) * 100))
        : 0,
      months_covered: monthlyFixed > 0 ? Number((Number(cushion.current_balance || 0) / monthlyFixed).toFixed(1)) : 0,
      account_label: cushion.account_label,
    },
    score_breakdown: {
      ahorro: Math.round(scoreAhorro),
      deuda: Math.round(scoreDeuda),
      equilibrio: Math.round(scoreEquilibrio),
    },
    strategy: {
      id: strategy, name: selected.name,
      next_income: nextIncome, dispersion, percentages: pcts,
      adjustment_note: adjustmentNote,
    },
    incomes: incomesNormalized,
    fixed_expenses: fixedNormalized,
    monthly_plan: planNormalized,
    debts: debtsNormalized,
    adjustments: adjustmentsNormalized,
    debt_strategies: {
      avalanche: debtsByAvalanche,
      snowball:  debtsBySnowball,
    },
    goals: goalsWithPlan,
    recommendations,
    config: {
      strategy,
      custom_dispersion: customDispersion,
    },
    has_data: incomes.length > 0 || fixedExpenses.length > 0,
    last_updated: new Date().toISOString(),
  }
}

// ════════════════════════════════════════════════════════════════════
// CRIPTO — Portfolio + precios + journal
// ════════════════════════════════════════════════════════════════════

// Mapeo símbolo → CoinGecko ID (top ~40 + memecoins populares)
const COIN_MAP = {
  // Top blue chips
  BTC:   'bitcoin',
  ETH:   'ethereum',
  XRP:   'ripple',
  BNB:   'binancecoin',
  SOL:   'solana',
  ADA:   'cardano',
  DOGE:  'dogecoin',
  AVAX:  'avalanche-2',
  TRX:   'tron',
  DOT:   'polkadot',
  LINK:  'chainlink',
  LTC:   'litecoin',
  MATIC: 'matic-network',
  ATOM:  'cosmos',
  XLM:   'stellar',
  XMR:   'monero',
  BCH:   'bitcoin-cash',
  ETC:   'ethereum-classic',
  // Stablecoins
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI:  'dai',
  // L1/L2 / DeFi
  NEAR: 'near',
  APT:  'aptos',
  SUI:  'sui',
  ARB:  'arbitrum',
  OP:   'optimism',
  INJ:  'injective-protocol',
  TIA:  'celestia',
  HBAR: 'hedera-hashgraph',
  ICP:  'internet-computer',
  FIL:  'filecoin',
  AAVE: 'aave',
  UNI:  'uniswap',
  MKR:  'maker',
  LDO:  'lido-dao',
  RUNE: 'thorchain',
  // Memecoins populares
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  FLOKI:'floki',
  BONK: 'bonk',
  WIF:  'dogwifcoin',
  // Gaming/NFT
  IMX:  'immutable-x',
  RNDR: 'render-token',
  FET:  'fetch-ai',
  GRT:  'the-graph',
  // Otros
  XTZ:  'tezos',
  ALGO: 'algorand',
}

const CACHE_MAX_AGE_MIN = 10

async function getCryptoPrices(admin, symbols) {
  if (!symbols || symbols.length === 0) return {}
  const upper = symbols.map(s => s.toUpperCase())

  // Lee cache
  const { data: cached } = await admin
    .from('crypto_prices')
    .select('*')
    .in('symbol', upper)

  const now = Date.now()
  const fresh = {}
  const stale = []
  for (const s of upper) {
    const c = (cached || []).find(x => x.symbol === s)
    if (c && (now - new Date(c.updated_at).getTime()) < CACHE_MAX_AGE_MIN * 60_000) {
      fresh[s] = c
    } else if (COIN_MAP[s]) {
      stale.push(s)
    }
  }

  if (stale.length > 0) {
    // Fetch CoinGecko
    const ids = stale.map(s => COIN_MAP[s]).filter(Boolean).join(',')
    if (ids) {
      try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=mxn,usd&include_24hr_change=true&include_market_cap=true`
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (r.ok) {
          const data = await r.json()
          const rows = []
          for (const s of stale) {
            const id = COIN_MAP[s]
            const d = data[id]
            if (d) {
              const row = {
                symbol: s,
                coingecko_id: id,
                name: s,
                price_mxn: d.mxn,
                price_usd: d.usd,
                change_24h_pct: d.usd_24h_change || 0,
                market_cap_usd: d.usd_market_cap || 0,
                updated_at: new Date().toISOString(),
              }
              rows.push(row)
              fresh[s] = row
            }
          }
          if (rows.length > 0) {
            await admin.from('crypto_prices').upsert(rows, { onConflict: 'symbol' })
          }
        }
      } catch (e) {
        console.warn('[crypto prices]', e.message)
        // Si hay cache stale, úsalo
        for (const s of stale) {
          const c = (cached || []).find(x => x.symbol === s)
          if (c) fresh[s] = c
        }
      }
    }
  }

  return fresh
}

async function cryptoListHoldings(admin, userId) {
  const { data: txs, error } = await admin
    .from('crypto_transactions')
    .select('*')
    .eq('owner_id', userId)
    .order('date', { ascending: true })
  if (error) throw error

  // Aggregate by symbol
  const holdings = {}
  for (const tx of (txs || [])) {
    const sym = tx.symbol.toUpperCase()
    if (!holdings[sym]) {
      holdings[sym] = {
        symbol: sym,
        name: tx.name || sym,
        quantity: 0,
        total_cost_mxn: 0,
        total_cost_usd: 0,
        tx_count: 0,
      }
    }
    const h = holdings[sym]
    const q = Number(tx.quantity) || 0
    const tMxn = Number(tx.total_mxn) || (q * Number(tx.price_mxn || 0))
    const tUsd = q * Number(tx.price_usd || 0)
    if (tx.type === 'buy' || tx.type === 'transfer_in') {
      h.quantity += q
      h.total_cost_mxn += tMxn
      h.total_cost_usd += tUsd
    } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
      // FIFO simplificado: reduce qty y costo proporcional
      if (h.quantity > 0) {
        const ratio = q / h.quantity
        h.total_cost_mxn -= h.total_cost_mxn * ratio
        h.total_cost_usd -= h.total_cost_usd * ratio
      }
      h.quantity -= q
    }
    h.tx_count += 1
  }

  // Filtra los con qty > 0
  const active = Object.values(holdings).filter(h => h.quantity > 0.00000001)

  // Trae precios actuales
  const prices = await getCryptoPrices(admin, active.map(h => h.symbol))

  // Calcula valores actuales + ROI
  let totalValueMxn = 0, totalValueUsd = 0, totalCostMxn = 0, totalCostUsd = 0
  const items = active.map(h => {
    const p = prices[h.symbol] || {}
    const valueMxn = (h.quantity * Number(p.price_mxn || 0))
    const valueUsd = (h.quantity * Number(p.price_usd || 0))
    const avgCostMxn = h.quantity > 0 ? h.total_cost_mxn / h.quantity : 0
    const avgCostUsd = h.quantity > 0 ? h.total_cost_usd / h.quantity : 0
    const pnlMxn = valueMxn - h.total_cost_mxn
    const pnlUsd = valueUsd - h.total_cost_usd
    const roiPct = h.total_cost_mxn > 0 ? (pnlMxn / h.total_cost_mxn) * 100 : 0
    totalValueMxn += valueMxn
    totalValueUsd += valueUsd
    totalCostMxn += h.total_cost_mxn
    totalCostUsd += h.total_cost_usd
    return {
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      tx_count: h.tx_count,
      avg_cost_mxn: avgCostMxn,
      avg_cost_usd: avgCostUsd,
      current_price_mxn: Number(p.price_mxn || 0),
      current_price_usd: Number(p.price_usd || 0),
      change_24h_pct: Number(p.change_24h_pct || 0),
      value_mxn: valueMxn,
      value_usd: valueUsd,
      pnl_mxn: pnlMxn,
      pnl_usd: pnlUsd,
      roi_pct: roiPct,
      total_cost_mxn: h.total_cost_mxn,
      price_updated_at: p.updated_at,
    }
  })

  // Sort by value desc
  items.sort((a,b) => b.value_mxn - a.value_mxn)

  // Distribución %
  for (const it of items) {
    it.allocation_pct = totalValueMxn > 0 ? (it.value_mxn / totalValueMxn) * 100 : 0
  }

  const totalPnlMxn = totalValueMxn - totalCostMxn
  const totalPnlUsd = totalValueUsd - totalCostUsd
  const totalRoiPct = totalCostMxn > 0 ? (totalPnlMxn / totalCostMxn) * 100 : 0

  return {
    items,
    summary: {
      total_value_mxn: Math.round(totalValueMxn * 100) / 100,
      total_value_usd: Math.round(totalValueUsd * 100) / 100,
      total_cost_mxn: Math.round(totalCostMxn * 100) / 100,
      total_cost_usd: Math.round(totalCostUsd * 100) / 100,
      total_pnl_mxn: Math.round(totalPnlMxn * 100) / 100,
      total_pnl_usd: Math.round(totalPnlUsd * 100) / 100,
      total_roi_pct: Number(totalRoiPct.toFixed(2)),
      holdings_count: items.length,
      tx_count: (txs || []).length,
    },
  }
}

// ════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // ── BITSO PROXY (GET ?bitso=book) — sin auth ──────────────────
  // Reenvía al ticker público de Bitso evitando CORS.
  if (req.method === 'GET' && req.query.bitso) {
    const book = req.query.bitso
    if (!/^[a-z0-9_]{3,20}$/.test(book)) {
      return res.status(400).json({ error: 'invalid book' })
    }
    try {
      const upstream = await fetch(`https://api.bitso.com/v3/ticker/?book=${book}`, {
        headers: { 'User-Agent': 'nexus-os-proxy/1.0' },
      })
      const data = await upstream.json()
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20')
      return res.json(data)
    } catch (e) {
      return res.status(502).json({ success: false, error: 'upstream error' })
    }
  }

  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action } = req.body || {}

    // ── Auth: doble vía ───────────────────────────────────────────
    // (1) JWT del usuario en Authorization Bearer (cliente normal)
    // (2) Service secret + user_id en body — solo para acciones read-only
    //     listadas, usado por crons/n8n sin sesión del usuario.
    const SERVICE_ACTIONS_RO = new Set(['afp_weekplan_get'])
    const serviceSecret = req.headers['x-nexus-service-secret']
    const SERVICE_SECRET = process.env.NEXUS_WEBHOOK_SECRET

    let userId, user, admin = getAdminSupabase()
    if (serviceSecret && SERVICE_SECRET && serviceSecret === SERVICE_SECRET && SERVICE_ACTIONS_RO.has(action)) {
      const reqUserId = req.body?.user_id
      if (!reqUserId) return res.status(400).json({ error: 'user_id requerido con service secret' })
      const { data: u, error: uErr } = await admin.auth.admin.getUserById(reqUserId)
      if (uErr || !u?.user) return res.status(400).json({ error: 'user_id inválido' })
      userId = u.user.id
      user = u.user
    } else {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return res.status(401).json({ error: 'Sin token' })
      const sb = getSupabase(token)
      const { data: { user: u }, error: uErr } = await sb.auth.getUser()
      if (uErr || !u) return res.status(401).json({ error: 'Token inválido' })
      userId = u.id
      user = u
    }

    // ── AFP ─────────────────────────────────────────────────────
    if (action === 'afp_diagnose') {
      const result = await afpDiagnose(admin, userId, user.user_metadata || {})
      return res.status(200).json({ ok: true, ...result })
    }

    // AFP · plan semanal con instrucciones nombre+razón
    if (action === 'afp_weekplan_get') {
      const result = await buildWeekPlan(admin, userId, user.user_metadata || {})
      return res.status(200).json({
        ok: true,
        weekplan: result,
        formatted_telegram: formatWeekPlanTelegram(result),
      })
    }

    // AFP · histórico mensual
    if (action === 'afp_history_list') {
      const { data, error } = await admin.from('afp_month_snapshots')
        .select('*').eq('owner_id', userId)
        .order('month', { ascending: false }).limit(24)
      if (error) throw error
      return res.status(200).json({ ok: true, snapshots: data || [] })
    }

    // AFP · guarda snapshot del mes (default: mes anterior)
    if (action === 'afp_snapshot_save') {
      const { month: bodyMonth, notes } = req.body || {}
      const targetMonth = bodyMonth || (() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1)
        return d.toISOString().substring(0, 7)
      })()
      const _nextMonth = (m) => {
        const [y, mo] = m.split('-').map(Number)
        const d = new Date(y, mo, 1)
        return d.toISOString().substring(0, 7)
      }

      const [incRes, fixedRes, cushionRes, movsRes] = await Promise.all([
        admin.from('afp_incomes').select('*').eq('owner_id', userId).eq('is_active', true),
        admin.from('afp_fixed_expenses').select('*').eq('owner_id', userId).eq('is_active', true),
        admin.from('afp_cushion').select('*').eq('owner_id', userId).maybeSingle(),
        admin.from('movimientos').select('tipo,estado,monto_mxn,fecha,proyecto')
          .eq('owner_id', userId).gte('fecha', targetMonth + '-01').lt('fecha', _nextMonth(targetMonth) + '-01'),
      ])
      const incomes = incRes.data || []
      const fixed = fixedRes.data || []
      const cushion = cushionRes.data || { current_balance: 0, target_months: 3 }
      const movs = movsRes.data || []

      const monthlyIncome = incomes.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0)
      const monthlyFixed  = fixed.reduce((s, f) => s + toMonthly(f.amount, f.frequency), 0)
      const monthlySacred = fixed.filter(f => f.is_sacred)
        .reduce((s, f) => s + toMonthly(f.amount, f.frequency), 0)
      const cushionTarget = monthlyFixed * Number(cushion.target_months || 3)

      const afpMovs = movs.filter(m => (m.proyecto || '').startsWith('afp:'))
      const executed  = afpMovs.filter(m => m.estado === 'hecho')
      const committed = afpMovs.filter(m => m.estado === 'pendiente')
      const totalDispersed = executed.reduce((s, m) => s + Number(m.monto_mxn || 0), 0)
      const totalPlanned   = afpMovs.reduce((s, m) => s + Number(m.monto_mxn || 0), 0)
      const compliancePct  = totalPlanned > 0 ? Math.round((totalDispersed / totalPlanned) * 100) : 0

      const plan = await buildWeekPlan(admin, userId, user.user_metadata || {})

      const payload = {
        owner_id: userId, month: targetMonth,
        mode: plan.mode, mode_label: plan.modeLabel,
        monthly_income: Math.round(monthlyIncome),
        monthly_fixed:  Math.round(monthlyFixed),
        monthly_sacred: Math.round(monthlySacred),
        cushion_start:  Number(cushion.current_balance || 0),
        cushion_end:    Number(cushion.current_balance || 0),
        cushion_target: Math.round(cushionTarget),
        commits_planned:   afpMovs.length,
        commits_executed:  executed.length,
        commits_committed: committed.length,
        total_dispersed: Math.round(totalDispersed),
        total_planned:   Math.round(totalPlanned),
        compliance_pct:  compliancePct,
        goals_advanced:  [],
        notes: notes || null,
      }
      const { data, error } = await admin.from('afp_month_snapshots')
        .upsert(payload, { onConflict: 'owner_id,month' }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, snapshot: data })
    }

    if (action === 'afp_save_config') {
      const { config } = req.body
      if (!config || typeof config !== 'object') return res.status(400).json({ error: 'config requerida' })
      const currentMeta = user.user_metadata || {}
      const newAfp = { ...(currentMeta.afp || {}), ...config }
      const { error } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...currentMeta, afp: newAfp },
      })
      if (error) throw error
      return res.status(200).json({ ok: true, afp: newAfp })
    }

    // ── CRUD genérico para tablas AFP ─────────────────────────────
    // ── Colchón Fiat (un registro por usuario) ──────────────────
    if (action === 'afp_cushion_get') {
      const { data, error } = await admin.from('afp_cushion').select('*').eq('owner_id', userId).maybeSingle()
      if (error) throw error
      const cushion = data || { owner_id: userId, current_balance: 0, target_months: 3, account_label: null, notes: null }
      return res.status(200).json({ ok: true, cushion })
    }
    if (action === 'afp_cushion_set') {
      const { current_balance, target_months, account_label, notes } = req.body
      const payload = { owner_id: userId }
      if (current_balance != null) payload.current_balance = Number(current_balance)
      if (target_months != null)   payload.target_months = Number(target_months)
      if ('account_label' in req.body) payload.account_label = account_label || null
      if ('notes' in req.body) payload.notes = notes || null
      const { data, error } = await admin.from('afp_cushion').upsert(payload, { onConflict: 'owner_id' }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, cushion: data })
    }
    if (action === 'afp_cushion_move') {
      const { kind, amount, reason, month } = req.body
      if (!kind || !['deposit','withdraw'].includes(kind)) return res.status(400).json({ error: 'kind requerido' })
      const amt = Number(amount)
      if (!amt || amt <= 0) return res.status(400).json({ error: 'amount > 0 requerido' })
      // Trae saldo actual o crea registro
      const { data: existing } = await admin.from('afp_cushion').select('current_balance').eq('owner_id', userId).maybeSingle()
      const curr = Number(existing?.current_balance || 0)
      const newBalance = kind === 'deposit' ? curr + amt : Math.max(0, curr - amt)
      // Actualiza saldo
      await admin.from('afp_cushion').upsert({
        owner_id: userId, current_balance: newBalance,
        target_months: existing ? undefined : 3,
      }, { onConflict: 'owner_id' })
      // Registra movimiento
      const { data: mv, error } = await admin.from('afp_cushion_moves').insert({
        owner_id: userId, kind, amount: amt, reason: reason || null,
        month: month || new Date().toISOString().substring(0,7),
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, move: mv, new_balance: newBalance })
    }
    if (action === 'afp_cushion_moves_list') {
      const { data, error } = await admin.from('afp_cushion_moves')
        .select('*').eq('owner_id', userId)
        .order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return res.status(200).json({ ok: true, moves: data || [] })
    }

    const AFP_TABLES = {
      afp_income:  { table: 'afp_incomes',         fields: ['name','amount','frequency','category','notes','is_active'] },
      afp_fixed:   { table: 'afp_fixed_expenses',  fields: ['name','amount','frequency','category','due_day','priority','notes','is_active','is_sacred'] },
      afp_debt:    { table: 'afp_debts',           fields: ['name','kind','balance','credit_limit','min_payment','interest_rate','cut_day','due_day','notes','is_active'] },
      afp_plan:    { table: 'afp_monthly_plans',   fields: ['month','name','amount','category','planned_date','priority','is_done','notes'] },
      afp_goal:    { table: 'afp_goals',           fields: ['name','target_amount','current_amount','deadline','priority','notes','is_achieved'] },
      afp_adjustment: { table: 'afp_adjustments',  fields: ['month','kind','amount','reason','category','account_from','account_to','notes'] },
    }
    for (const [prefix, def] of Object.entries(AFP_TABLES)) {
      if (action === `${prefix}_list`) {
        let q = admin.from(def.table).select('*').eq('owner_id', userId)
        if (req.body.month) q = q.eq('month', req.body.month)
        if (req.body.active_only) q = q.eq('is_active', true)
        const { data, error } = await q.order('created_at', { ascending: true })
        if (error) throw error
        return res.status(200).json({ ok: true, items: data || [] })
      }
      if (action === `${prefix}_add`) {
        const row = { owner_id: userId }
        for (const f of def.fields) if (f in req.body) row[f] = req.body[f]
        const { data, error } = await admin.from(def.table).insert(row).select().single()
        if (error) throw error
        return res.status(200).json({ ok: true, item: data })
      }
      if (action === `${prefix}_update`) {
        const { id, ...patch } = req.body
        if (!id) return res.status(400).json({ error: 'id requerido' })
        const update = {}
        for (const f of def.fields) if (f in patch) update[f] = patch[f]
        const { data, error } = await admin.from(def.table).update(update).eq('id', id).eq('owner_id', userId).select().single()
        if (error) throw error
        return res.status(200).json({ ok: true, item: data })
      }
      if (action === `${prefix}_delete`) {
        const { id } = req.body
        if (!id) return res.status(400).json({ error: 'id requerido' })
        const { error } = await admin.from(def.table).delete().eq('id', id).eq('owner_id', userId)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }
    }

    // ── CRIPTO PORTFOLIO ────────────────────────────────────────
    if (action === 'crypto_list') {
      const result = await cryptoListHoldings(admin, userId)
      return res.status(200).json({ ok: true, ...result })
    }

    if (action === 'crypto_transactions') {
      const { data, error } = await admin
        .from('crypto_transactions')
        .select('*')
        .eq('owner_id', userId)
        .order('date', { ascending: false })
        .limit(100)
      if (error) throw error
      return res.status(200).json({ ok: true, transactions: data || [] })
    }

    if (action === 'crypto_add_tx') {
      const { symbol, name, type, quantity, price_mxn, price_usd, fee_mxn, fee_usd, exchange, network, notes, reasoning, date } = req.body
      if (!symbol || !type || !quantity) return res.status(400).json({ error: 'symbol + type + quantity requeridos' })
      const q = Number(quantity)
      const pMxn = price_mxn != null ? Number(price_mxn) : null
      const total = pMxn != null ? q * pMxn + Number(fee_mxn || 0) : null
      const { data, error } = await admin.from('crypto_transactions').insert({
        owner_id: userId,
        symbol: String(symbol).toUpperCase(),
        name: name || null,
        type, quantity: q,
        price_mxn: pMxn, price_usd: price_usd != null ? Number(price_usd) : null,
        total_mxn: total,
        fee_mxn: fee_mxn != null ? Number(fee_mxn) : 0,
        fee_usd: fee_usd != null ? Number(fee_usd) : 0,
        exchange: exchange || null, network: network || null,
        notes: notes || null, reasoning: reasoning || null,
        date: date || new Date().toISOString().split('T')[0],
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, transaction: data })
    }

    if (action === 'crypto_delete_tx') {
      const { tx_id } = req.body
      if (!tx_id) return res.status(400).json({ error: 'tx_id requerido' })
      const { error } = await admin.from('crypto_transactions').delete().eq('id', tx_id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    if (action === 'crypto_update_tx') {
      const { tx_id, ...patch } = req.body
      if (!tx_id) return res.status(400).json({ error: 'tx_id requerido' })
      const allowed = ['symbol','name','type','quantity','price_mxn','price_usd','total_mxn','fee_mxn','fee_usd','exchange','network','notes','reasoning','date']
      const update = {}
      for (const k of allowed) if (k in patch) update[k] = patch[k]
      if (update.symbol) update.symbol = String(update.symbol).toUpperCase()
      if (update.quantity != null) update.quantity = Number(update.quantity)
      if (update.price_mxn != null) update.price_mxn = Number(update.price_mxn)
      if (update.price_usd != null) update.price_usd = Number(update.price_usd)
      if (update.fee_mxn != null) update.fee_mxn = Number(update.fee_mxn)
      // Recalcula total_mxn
      if (update.quantity != null && update.price_mxn != null) {
        update.total_mxn = update.quantity * update.price_mxn + (update.fee_mxn || 0)
      }
      const { data, error } = await admin.from('crypto_transactions').update(update).eq('id', tx_id).eq('owner_id', userId).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, transaction: data })
    }

    // ── CRIPTO NEWS (filtradas por holdings) ────────────────────
    // Fuentes RSS hardcoded (no requieren config del user)
    if (action === 'crypto_news') {
      const { symbols, limit = 12 } = req.body
      const symbolsUpper = (symbols || []).map(s => String(s).toUpperCase())

      const SOURCES = [
        { name: 'CoinDesk',     url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
        { name: 'CoinTelegraph',url: 'https://cointelegraph.com/rss' },
        { name: 'Decrypt',      url: 'https://decrypt.co/feed' },
        { name: 'The Defiant',  url: 'https://thedefiant.io/feed' },
      ]

      // Mapping símbolo → nombre completo para filtrado
      const NAMES = {
        BTC: ['bitcoin','btc'], ETH: ['ethereum','eth','ether'],
        XRP: ['xrp','ripple'], TRX: ['tron','trx'],
        USDT: ['tether','usdt'], USDC: ['usdc','usd coin'], DAI: ['dai stablecoin'],
        SOL: ['solana','sol'], ADA: ['cardano','ada'],
        DOGE: ['dogecoin','doge'], BNB: ['bnb','binance coin'],
        AVAX: ['avalanche','avax'], MATIC: ['polygon','matic'],
        DOT: ['polkadot','dot'], LINK: ['chainlink','link'],
        LTC: ['litecoin','ltc'], XLM: ['stellar','xlm'], XMR: ['monero','xmr'],
        BCH: ['bitcoin cash','bch'], ETC: ['ethereum classic','etc'],
        ATOM: ['cosmos','atom'], NEAR: ['near protocol'], APT: ['aptos'], SUI: ['sui'],
        ARB: ['arbitrum'], OP: ['optimism'], INJ: ['injective'], TIA: ['celestia'],
        HBAR: ['hedera','hbar'], ICP: ['internet computer','icp'], FIL: ['filecoin'],
        AAVE: ['aave'], UNI: ['uniswap','uni'], MKR: ['maker','mkr'], LDO: ['lido'],
        RUNE: ['thorchain','rune'],
        SHIB: ['shiba inu','shib'], PEPE: ['pepe'], FLOKI: ['floki'],
        BONK: ['bonk'], WIF: ['dogwifhat','wif'],
        IMX: ['immutable','imx'], RNDR: ['render','rndr'],
        FET: ['fetch.ai','fetch ai','fet'], GRT: ['the graph','grt'],
        XTZ: ['tezos','xtz'], ALGO: ['algorand','algo'],
      }
      const keywords = []
      for (const s of symbolsUpper) {
        if (NAMES[s]) keywords.push(...NAMES[s])
      }
      const keywordsLower = keywords.map(k => k.toLowerCase())

      // Parser RSS minimalista
      const parseRss = (xml, sourceName) => {
        const items = []
        const tag = (text, name) => {
          const m = text.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'))
          return m ? m[1].replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'').trim() : null
        }
        const cleanText = s => s ? s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/\s{2,}/g,' ').trim() : null
        const matches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
        for (const m of matches) {
          const it = m[0]
          const title = cleanText(tag(it, 'title')) || ''
          const description = cleanText(tag(it, 'description')) || ''
          const url = tag(it, 'link')
          const pubDate = tag(it, 'pubDate')
          // Filtra por keywords si hay
          if (keywordsLower.length) {
            const blob = (title + ' ' + description).toLowerCase()
            if (!keywordsLower.some(k => blob.includes(k))) continue
          }
          items.push({ title, description: description.slice(0, 200), url, published_at: pubDate, source: sourceName })
        }
        return items
      }

      // Fetch en paralelo con timeout corto
      const fetchSource = async (src) => {
        try {
          const r = await fetch(src.url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'NexusOS/1.0' } })
          if (!r.ok) return []
          const xml = await r.text()
          return parseRss(xml, src.name)
        } catch { return [] }
      }
      const allResults = await Promise.all(SOURCES.map(fetchSource))
      const flat = allResults.flat()

      // Sort by date desc + limit
      flat.sort((a,b) => {
        const da = a.published_at ? new Date(a.published_at).getTime() : 0
        const db = b.published_at ? new Date(b.published_at).getTime() : 0
        return db - da
      })
      return res.status(200).json({ ok: true, items: flat.slice(0, Number(limit) || 12), sources_count: SOURCES.length })
    }

    if (action === 'crypto_prices') {
      const { symbols } = req.body
      const prices = await getCryptoPrices(admin, symbols || Object.keys(COIN_MAP))
      return res.status(200).json({ ok: true, prices, supported: COIN_MAP })
    }

    // ════════════════════════════════════════════════════════════
    // CRIPTO WALLETS + DIRECCIONES (cold/hot/exchange, redes)
    // ════════════════════════════════════════════════════════════
    if (action === 'crypto_wallets_list') {
      const [walletsRes, addrRes] = await Promise.all([
        admin.from('crypto_wallets').select('*').eq('owner_id', userId).eq('is_active', true).order('created_at'),
        admin.from('crypto_wallet_addresses').select('*').eq('owner_id', userId).eq('is_active', true),
      ])
      const wallets = walletsRes.data || []
      const addresses = addrRes.data || []
      const result = wallets.map(w => ({
        ...w,
        addresses: addresses.filter(a => a.wallet_id === w.id),
      }))
      return res.status(200).json({ ok: true, wallets: result })
    }
    if (action === 'crypto_wallet_add') {
      const { name, kind, provider, notes } = req.body
      if (!name) return res.status(400).json({ error: 'name requerido' })
      const { data, error } = await admin.from('crypto_wallets').insert({
        owner_id: userId, name, kind: kind || 'cold',
        provider: provider || null, notes: notes || null,
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, wallet: data })
    }
    if (action === 'crypto_wallet_delete') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const { error } = await admin.from('crypto_wallets').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }
    if (action === 'crypto_address_add') {
      const { wallet_id, symbol, network, address, label, notes } = req.body
      if (!wallet_id || !symbol || !network || !address) {
        return res.status(400).json({ error: 'wallet_id + symbol + network + address requeridos' })
      }
      const { data, error } = await admin.from('crypto_wallet_addresses').insert({
        owner_id: userId, wallet_id,
        symbol: String(symbol).toUpperCase(),
        network: String(network).toUpperCase(),
        address, label: label || null, notes: notes || null,
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, address: data })
    }
    if (action === 'crypto_address_delete') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const { error } = await admin.from('crypto_wallet_addresses').delete().eq('id', id).eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ════════════════════════════════════════════════════════════
    // CRIPTO NEWS TRADUCCIÓN (cacheada 24h por url_hash)
    // ════════════════════════════════════════════════════════════
    if (action === 'crypto_news_translate') {
      const { items } = req.body  // [{ url, title, description, source, published_at }]
      if (!Array.isArray(items) || !items.length) {
        return res.status(200).json({ ok: true, translated: [] })
      }
      const GROQ_KEY = process.env.GROQ_API_KEY
      const GEMINI_KEY = process.env.GEMINI_API_KEY

      // Hash de URL para cache
      const hashUrl = (u) => {
        let h = 0
        for (let i = 0; i < u.length; i++) { h = ((h << 5) - h) + u.charCodeAt(i); h |= 0 }
        return 'n' + Math.abs(h).toString(36)
      }

      const hashed = items.map(it => ({ ...it, url_hash: hashUrl(it.url || it.title) }))
      const allHashes = hashed.map(it => it.url_hash)

      // 1. Lee cache
      const { data: cached } = await admin
        .from('crypto_news_cache')
        .select('*')
        .in('url_hash', allHashes)
        .gt('expires_at', new Date().toISOString())

      const cachedMap = {}
      ;(cached || []).forEach(c => { cachedMap[c.url_hash] = c })

      // 2. Identifica los que faltan
      const toTranslate = hashed.filter(it => !cachedMap[it.url_hash])

      let newlyTranslated = {}
      if (toTranslate.length && (GROQ_KEY || GEMINI_KEY)) {
        const batch = toTranslate.map((it, idx) => ({
          idx, title: it.title || '', desc: (it.description || '').slice(0, 300),
        }))
        const sys = 'Eres traductor experto de noticias cripto al español. Devuelves SOLO JSON válido. Mantén nombres propios y términos técnicos cripto en inglés cuando se usen así habitualmente.'
        const user = `Traduce al español natural (es-MX) cada item. Para cada uno:
- "title_es": título atractivo en español (máx 100 caracteres)
- "summary_es": resumen breve y útil en español (máx 200 caracteres, oraciones completas)

Items:
${JSON.stringify(batch)}

Devuelve JSON con esta forma exacta: { "results": [ { "idx": 0, "title_es": "...", "summary_es": "..." }, ... ] }`

        async function callGroq() {
          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.3, max_tokens: 3000,
            }),
            signal: AbortSignal.timeout(25000),
          })
          if (!r.ok) throw new Error('Groq ' + r.status)
          const j = await r.json()
          return JSON.parse(j.choices[0].message.content)
        }

        try {
          let parsed
          if (GROQ_KEY) parsed = await callGroq()
          // (Si Groq falla por algún motivo, dejamos fallar y los items no se traducen — siguen en inglés)

          const rows = []
          for (const r of (parsed?.results || [])) {
            const original = toTranslate[r.idx]
            if (!original) continue
            const row = {
              url_hash: original.url_hash,
              source: original.source || null,
              title_en: original.title,
              desc_en: original.description,
              title_es: r.title_es,
              summary_es: r.summary_es,
              published_at: original.published_at || null,
              url: original.url || null,
              expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            }
            rows.push(row)
            newlyTranslated[original.url_hash] = row
          }
          if (rows.length) {
            await admin.from('crypto_news_cache').upsert(rows, { onConflict: 'url_hash' })
          }
        } catch (e) {
          console.warn('[news translate]', e.message)
        }
      }

      // 3. Devuelve todos
      const translated = hashed.map(it => {
        const c = cachedMap[it.url_hash] || newlyTranslated[it.url_hash]
        return {
          id: it.url_hash,
          url: it.url,
          source: it.source,
          published_at: it.published_at,
          title_en: it.title,
          desc_en: it.description,
          title_es: c?.title_es || it.title,
          summary_es: c?.summary_es || it.description,
          translated: !!c,
        }
      })

      return res.status(200).json({ ok: true, translated })
    }

    // ════════════════════════════════════════════════════════════
    // CRIPTO SUGERENCIA DE ESTRATEGIA (IA)
    // ════════════════════════════════════════════════════════════
    if (action === 'crypto_strategy_suggest') {
      const GROQ_KEY = process.env.GROQ_API_KEY
      if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY no configurada' })

      const { context } = req.body  // { holdings, prices_24h, preferences, recent_news }

      const sys = `Eres analista cripto conservador para inversor mexicano que invierte semanalmente cantidades pequeñas ($100-$200 MXN), guarda en cold wallet, compra principalmente XRP y TRX en Bitso (porque tienen comisiones bajas para retirar a cold wallet). No promete ganancias, da contexto y sugerencias de movimientos sensatos. Responde SIEMPRE en español natural. Devuelve SOLO JSON válido.`
      const user = `Analiza este portafolio cripto y sugiere 2-3 acciones concretas (con razón breve cada una). Considera momentum 24h, concentración del portfolio, costo de comisiones (XRP y TRX son baratos en Bitso → cold wallet, BTC/ETH son caros).

Contexto:
${JSON.stringify(context).slice(0, 4000)}

Devuelve JSON exacto:
{
  "summary": "Resumen del estado actual del portafolio (1-2 oraciones)",
  "actions": [
    {
      "type": "buy|sell|hold|rebalance|wait",
      "symbol": "TRX",
      "action": "Comprar más TRX",
      "reason": "Razón breve y útil",
      "urgency": "low|medium|high",
      "amount_suggestion": "$100 MXN" o null
    }
  ],
  "warning": "Alerta importante o null si no hay"
}`

      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4, max_tokens: 1200,
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (!r.ok) throw new Error('Groq ' + r.status)
        const j = await r.json()
        const parsed = JSON.parse(j.choices[0].message.content)
        return res.status(200).json({ ok: true, strategy: parsed, generated_at: new Date().toISOString() })
      } catch (e) {
        return res.status(502).json({ error: 'IA fallback: ' + e.message })
      }
    }

    // ════════════════════════════════════════════════════════════
    // CRIPTO DISPERSIÓN INTELIGENTE (IA)
    // "Tengo $200, ¿cómo los reparto?"
    // ════════════════════════════════════════════════════════════
    if (action === 'crypto_dispersion_suggest') {
      const GROQ_KEY = process.env.GROQ_API_KEY
      if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY no configurada' })

      const { amount_mxn, holdings_summary, prices_24h, preferences } = req.body
      if (!amount_mxn || amount_mxn <= 0) return res.status(400).json({ error: 'amount_mxn requerido' })

      const sys = `Eres asesor cripto para usuario mexicano que compra en Bitso y guarda en cold wallet (Ledger). Bitso solo permite ciertos pares MXN. Comisiones de retiro a cold wallet baratas: XRP, TRX, USDT-TRC20. Caras: BTC, ETH. El usuario quiere acumular DCA constante, sesgado a XRP/TRX. Responde SIEMPRE en español natural. Devuelve SOLO JSON.`
      const user = `Tengo $${amount_mxn} MXN para invertir hoy. Sugiere distribución entre 2-4 monedas considerando:
- Mi sesgo: XRP y TRX (baja comisión Bitso → Ledger)
- Estado actual del portafolio: ${JSON.stringify(holdings_summary || {}).slice(0, 800)}
- Movimientos 24h: ${JSON.stringify(prices_24h || {}).slice(0, 500)}
- Preferencias: ${JSON.stringify(preferences || {})}

Devuelve JSON exacto:
{
  "total_mxn": ${amount_mxn},
  "splits": [
    {
      "symbol": "TRX",
      "amount_mxn": 100,
      "pct": 50,
      "reason": "Razón breve",
      "low_fee_to_cold": true
    }
  ],
  "rationale": "Justificación general (1-2 oraciones)",
  "warnings": ["Cosas a vigilar"] o null
}

La suma de amount_mxn debe igualar el total.`

      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GROQ_KEY },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: user },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4, max_tokens: 1000,
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (!r.ok) throw new Error('Groq ' + r.status)
        const j = await r.json()
        const parsed = JSON.parse(j.choices[0].message.content)
        return res.status(200).json({ ok: true, dispersion: parsed })
      } catch (e) {
        return res.status(502).json({ error: 'IA fallback: ' + e.message })
      }
    }

    // ── CRIPTO JOURNAL ──────────────────────────────────────────
    if (action === 'journal_list') {
      const { data, error } = await admin
        .from('crypto_journal')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return res.status(200).json({ ok: true, entries: data || [] })
    }

    if (action === 'journal_add') {
      const { symbol, thesis, target_price_usd, target_date } = req.body
      if (!symbol || !thesis) return res.status(400).json({ error: 'symbol + thesis requeridos' })
      const { data, error } = await admin.from('crypto_journal').insert({
        owner_id: userId,
        symbol: String(symbol).toUpperCase(),
        thesis,
        target_price_usd: target_price_usd != null ? Number(target_price_usd) : null,
        target_date: target_date || null,
      }).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, entry: data })
    }

    if (action === 'journal_review') {
      const { entry_id, outcome, rating } = req.body
      if (!entry_id) return res.status(400).json({ error: 'entry_id requerido' })
      const { data, error } = await admin.from('crypto_journal').update({
        outcome: outcome || null,
        outcome_at: new Date().toISOString(),
        rating: rating != null ? Number(rating) : null,
      }).eq('id', entry_id).eq('owner_id', userId).select().single()
      if (error) throw error
      return res.status(200).json({ ok: true, entry: data })
    }

    return res.status(400).json({ error: 'action no reconocida: ' + action })
  } catch (e) {
    console.error('[financial]', e)
    return res.status(500).json({ error: e.message })
  }
}
