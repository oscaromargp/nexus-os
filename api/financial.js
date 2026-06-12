// POST /api/financial { action, ... }
//
// Endpoint unificado de los módulos financieros:
//   - AFP (Arquitecto Financiero Personal)
//   - Cripto Portfolio + Journal
//
// Auth: JWT Bearer del usuario.

import { createClient } from '@supabase/supabase-js'

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
function toMonthly(amount, frequency) {
  const a = Number(amount) || 0
  switch (frequency) {
    case 'weekly':    return a * 4.33
    case 'biweekly':  return a * 2.17
    case 'monthly':   return a
    case 'bimonthly': return a / 2
    case 'quarterly': return a / 3
    case 'yearly':    return a / 12
    case 'one_time':  return a / 12  // estima 1/12 del año
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
  const [incomesRes, fixedRes, debtsRes, planRes, goalsRes] = await Promise.all([
    admin.from('afp_incomes').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_fixed_expenses').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_debts').select('*').eq('owner_id', userId).eq('is_active', true),
    admin.from('afp_monthly_plans').select('*').eq('owner_id', userId).eq('month', monthStr),
    admin.from('afp_goals').select('*').eq('owner_id', userId).eq('is_achieved', false),
  ])

  const incomes = incomesRes.data || []
  const fixedExpenses = fixedRes.data || []
  const debts = debtsRes.data || []
  const monthlyPlan = planRes.data || []
  const goals = goalsRes.data || []

  // ── Ingresos: TODO viene de afp_incomes (declarado por usuario) ──
  const monthlyIncome = incomes.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0)
  const incomesNormalized = incomes.map(i => ({
    id: i.id, name: i.name, amount: Number(i.amount), frequency: i.frequency,
    monthly: toMonthly(i.amount, i.frequency), category: i.category, notes: i.notes,
  }))

  // ── Gastos fijos declarados ──────────────────────────────────
  const fixedNormalized = fixedExpenses.map(f => ({
    id: f.id, name: f.name, amount: Number(f.amount), frequency: f.frequency,
    monthly: toMonthly(f.amount, f.frequency), category: f.category,
    due_day: f.due_day, priority: f.priority, notes: f.notes,
  })).sort((a,b) => (a.due_day || 99) - (b.due_day || 99))
  const monthlyFixed = fixedNormalized.reduce((s, f) => s + f.monthly, 0)

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

  const monthlyCommitted = monthlyFixed + planTotal + monthlyMinDebt
  const totalLiquido = 0  // En AFP v3 no calculamos liquidez de cuentas externas — opcional para futuro
  const monthlyExpense = monthlyCommitted  // backwards compat

  // ── Métricas clave ───────────────────────────────────────────
  const disposable = monthlyIncome - monthlyCommitted
  const savingsRate = monthlyIncome > 0 ? (disposable / monthlyIncome) * 100 : 0
  const commitmentRatio = monthlyIncome > 0 ? (monthlyCommitted / monthlyIncome) * 100 : 0
  const debtToIncomeRatio = monthlyIncome > 0 ? (monthlyMinDebt / monthlyIncome) * 100 : 0

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
      monthly_fixed: Math.round(monthlyFixed),
      monthly_plan: Math.round(planTotal),
      monthly_min_debt: Math.round(monthlyMinDebt),
      monthly_committed: Math.round(monthlyCommitted),
      monthly_disposable: Math.round(disposable),
      monthly_savings_capacity: Math.round(disposable),
      total_debt_balance: Math.round(totalDebtBalance),
      savings_rate_pct: Number(savingsRate.toFixed(1)),
      commitment_ratio_pct: Number(commitmentRatio.toFixed(1)),
      debt_to_income_pct: Number(debtToIncomeRatio.toFixed(1)),
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

    // Auth
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Sin token' })
    const sb = getSupabase(token)
    const { data: { user }, error: uErr } = await sb.auth.getUser()
    if (uErr || !user) return res.status(401).json({ error: 'Token inválido' })
    const userId = user.id
    const admin = getAdminSupabase()

    // ── AFP ─────────────────────────────────────────────────────
    if (action === 'afp_diagnose') {
      const result = await afpDiagnose(admin, userId, user.user_metadata || {})
      return res.status(200).json({ ok: true, ...result })
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
    const AFP_TABLES = {
      afp_income:  { table: 'afp_incomes',         fields: ['name','amount','frequency','category','notes','is_active'] },
      afp_fixed:   { table: 'afp_fixed_expenses',  fields: ['name','amount','frequency','category','due_day','priority','notes','is_active'] },
      afp_debt:    { table: 'afp_debts',           fields: ['name','kind','balance','credit_limit','min_payment','interest_rate','cut_day','due_day','notes','is_active'] },
      afp_plan:    { table: 'afp_monthly_plans',   fields: ['month','name','amount','category','planned_date','priority','is_done','notes'] },
      afp_goal:    { table: 'afp_goals',           fields: ['name','target_amount','current_amount','deadline','priority','notes','is_achieved'] },
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
