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

async function afpDiagnose(admin, userId) {
  const today = new Date()
  const days30 = new Date(today.getTime() - 30 * 86400000).toISOString()
  const days60 = new Date(today.getTime() - 60 * 86400000).toISOString()
  const days90 = new Date(today.getTime() - 90 * 86400000).toISOString()

  // Pull data en paralelo
  const [movs30, movs90, accounts, bills, allTx] = await Promise.all([
    admin.from('nodes').select('type,metadata,created_at').eq('owner_id', userId).in('type', ['income','expense']).gte('created_at', days30),
    admin.from('nodes').select('type,metadata,created_at').eq('owner_id', userId).in('type', ['income','expense']).gte('created_at', days90),
    admin.from('nodes').select('content,metadata').eq('owner_id', userId).eq('type', 'account'),
    admin.from('nodes').select('content,metadata').eq('owner_id', userId).eq('type', 'bill'),
    admin.from('crypto_transactions').select('quantity,price_mxn,total_mxn,type,symbol').eq('owner_id', userId),
  ])

  // ── Ingresos / Egresos ───────────────────────────────────────
  const sumAmount = (rows, type) => (rows.data || [])
    .filter(r => r.type === type)
    .reduce((s, r) => s + (Number(r.metadata?.amount) || 0), 0)

  const income30  = sumAmount(movs30, 'income')
  const expense30 = sumAmount(movs30, 'expense')
  const income90  = sumAmount(movs90, 'income')
  const expense90 = sumAmount(movs90, 'expense')

  // Promedio mensual (usando 90d / 3)
  const monthlyIncome  = income90 / 3 || income30 || 0
  const monthlyExpense = expense90 / 3 || expense30 || 0

  // ── Saldos de cuentas (sin cripto, sin tarjetas crédito) ─────
  const cuentas = (accounts.data || []).map(a => ({
    name: a.content || a.metadata?.label || a.metadata?.account_name,
    balance: Number(a.metadata?.initial_balance || a.metadata?.balance || 0),
    kind: (a.metadata?.kind || a.metadata?.account_type || '').toLowerCase(),
  }))
  const totalLiquido = cuentas
    .filter(c => !c.kind.includes('credit') && !c.kind.includes('credito'))
    .reduce((s, c) => s + c.balance, 0)

  // ── Pagos comprometidos próximos 30 días ─────────────────────
  const todayDate = today.toISOString().split('T')[0]
  const limit30 = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0]
  const billsProximos = (bills.data || []).filter(b => {
    const due = b.metadata?.dueDate
    return due && due >= todayDate && due <= limit30 && !b.metadata?.paid
  })
  const monthlyCommitted = billsProximos.reduce((s, b) => s + Number(b.metadata?.amount || 0), 0)

  // ── Patrimonio cripto (valor estimado) ───────────────────────
  // Holdings = sum(buy quantity) - sum(sell quantity)
  const holdings = {}
  for (const tx of (allTx.data || [])) {
    const sym = tx.symbol
    if (!holdings[sym]) holdings[sym] = { quantity: 0, costMxn: 0 }
    const q = Number(tx.quantity) || 0
    const total = Number(tx.total_mxn) || (q * Number(tx.price_mxn || 0))
    if (tx.type === 'buy' || tx.type === 'transfer_in') {
      holdings[sym].quantity += q
      holdings[sym].costMxn += total
    } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
      holdings[sym].quantity -= q
      holdings[sym].costMxn -= total
    }
  }
  // Valor cripto al COSTO (no precio actual — eso lo veremos en el módulo cripto)
  const totalCriptoAtCost = Object.values(holdings).reduce((s, h) => s + Math.max(0, h.costMxn), 0)

  // ── Métricas clave ───────────────────────────────────────────
  const savingsRate = monthlyIncome > 0
    ? ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100
    : 0
  const liquidityMonths = monthlyExpense > 0
    ? totalLiquido / monthlyExpense
    : (totalLiquido > 0 ? 12 : 0)
  const commitmentRatio = monthlyIncome > 0
    ? (monthlyCommitted / monthlyIncome) * 100
    : 0
  const patrimonioTotal = totalLiquido + totalCriptoAtCost

  // ── Score 0-100 (determinístico) ─────────────────────────────
  // 40 pts liquidez (4+ meses = full), 30 pts ahorro (20%+ = full), 30 pts deuda (0% = full)
  let scoreLiquidez = Math.min(40, liquidityMonths * 10)
  let scoreAhorro   = Math.max(0, Math.min(30, savingsRate * 1.5))
  let scoreDeuda    = Math.max(0, 30 - commitmentRatio)
  const score = Math.round(scoreLiquidez + scoreAhorro + scoreDeuda)

  let healthLabel, healthColor
  if (score >= 75)      { healthLabel = 'Excelente'; healthColor = '#22c55e' }
  else if (score >= 55) { healthLabel = 'Saludable';  healthColor = '#84cc16' }
  else if (score >= 35) { healthLabel = 'En riesgo';  healthColor = '#fbbf24' }
  else                  { healthLabel = 'Crítico';    healthColor = '#ef4444' }

  // ── Estrategia: dispersión 50/30/20 adaptada ─────────────────
  // Si tienes deuda alta → ajustar
  let pctNecesidades = 50, pctAhorro = 20, pctLifestyle = 30
  if (commitmentRatio > 40) {
    pctNecesidades = Math.min(70, commitmentRatio + 10)
    pctLifestyle = 100 - pctNecesidades - pctAhorro
  }
  if (liquidityMonths < 3) {
    pctAhorro = 25
    pctLifestyle = 100 - pctNecesidades - pctAhorro
  }

  // Dispersión sugerida del PRÓXIMO ingreso (= ingreso mensual promedio)
  const nextIncome = Math.round(monthlyIncome) || 5000
  const dispersion = {
    necesidades: Math.round(nextIncome * pctNecesidades / 100),
    ahorro:      Math.round(nextIncome * pctAhorro / 100),
    lifestyle:   Math.round(nextIncome * pctLifestyle / 100),
  }

  // ── Recomendación principal ──────────────────────────────────
  const recommendations = []
  if (liquidityMonths < 3) {
    recommendations.push({
      priority: 'alta',
      title: 'Construir fondo de emergencia',
      detail: `Tienes ${liquidityMonths.toFixed(1)} meses de liquidez. Meta: 3-6 meses. Prioriza ahorro al ${pctAhorro}% sobre lifestyle.`,
    })
  }
  if (commitmentRatio > 50) {
    recommendations.push({
      priority: 'alta',
      title: 'Reducir compromisos fijos',
      detail: `${commitmentRatio.toFixed(0)}% de tu ingreso está comprometido en pagos fijos. Considera renegociar o consolidar.`,
    })
  }
  if (savingsRate < 10 && savingsRate >= 0) {
    recommendations.push({
      priority: 'media',
      title: 'Aumentar tasa de ahorro',
      detail: `Estás ahorrando ${savingsRate.toFixed(1)}%. Meta inicial: 15-20%.`,
    })
  }
  if (savingsRate < 0) {
    recommendations.push({
      priority: 'alta',
      title: 'Gastas más de lo que ganas',
      detail: `Tu ahorro mensual es negativo (${savingsRate.toFixed(1)}%). Revisa categorías de gasto.`,
    })
  }
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'baja',
      title: 'Optimización avanzada',
      detail: `Tu salud financiera es ${healthLabel.toLowerCase()}. Considera incrementar inversiones a largo plazo.`,
    })
  }

  return {
    score,
    health: { label: healthLabel, color: healthColor },
    metrics: {
      monthly_income: Math.round(monthlyIncome),
      monthly_expense: Math.round(monthlyExpense),
      monthly_committed: Math.round(monthlyCommitted),
      total_liquido: Math.round(totalLiquido),
      total_cripto_cost: Math.round(totalCriptoAtCost),
      patrimonio_total: Math.round(patrimonioTotal),
      savings_rate_pct: Number(savingsRate.toFixed(1)),
      liquidity_months: Number(liquidityMonths.toFixed(1)),
      commitment_ratio_pct: Number(commitmentRatio.toFixed(1)),
    },
    score_breakdown: {
      liquidez: Math.round(scoreLiquidez),
      ahorro: Math.round(scoreAhorro),
      deuda: Math.round(scoreDeuda),
    },
    strategy: {
      name: '50/30/20 adaptado',
      next_income: nextIncome,
      dispersion,
      percentages: { necesidades: pctNecesidades, ahorro: pctAhorro, lifestyle: pctLifestyle },
    },
    recommendations,
    upcoming_bills: billsProximos.map(b => ({
      name: b.content || b.metadata?.label,
      amount: Number(b.metadata?.amount || 0),
      due: b.metadata?.dueDate,
    })).sort((a,b) => a.due < b.due ? -1 : 1).slice(0, 5),
    accounts_summary: cuentas.map(c => ({ name: c.name, balance: c.balance })),
    last_updated: new Date().toISOString(),
  }
}

// ════════════════════════════════════════════════════════════════════
// CRIPTO — Portfolio + precios + journal
// ════════════════════════════════════════════════════════════════════

// Mapeo símbolo → CoinGecko ID
const COIN_MAP = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  XRP:  'ripple',
  TRX:  'tron',
  USDT: 'tether',
  USDC: 'usd-coin',
  SOL:  'solana',
  ADA:  'cardano',
  DOGE: 'dogecoin',
  BNB:  'binancecoin',
  AVAX: 'avalanche-2',
  MATIC:'matic-network',
  DOT:  'polkadot',
  LINK: 'chainlink',
  LTC:  'litecoin',
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
      const result = await afpDiagnose(admin, userId)
      return res.status(200).json({ ok: true, ...result })
    }

    if (action === 'afp_apply_dispersion') {
      // Crea movimientos sugeridos como nodes pendientes
      const { dispersion, source_account } = req.body
      if (!dispersion) return res.status(400).json({ error: 'dispersion requerida' })
      const date = new Date().toISOString().split('T')[0]
      const rows = []
      if (dispersion.ahorro > 0) {
        rows.push({ owner_id: userId, type: 'expense', content: 'AFP: transferencia a ahorro',
          metadata: { amount: dispersion.ahorro, currency: 'MXN', date, tags: ['#afp','#ahorro'],
            account_hint: source_account || null, afp_dispersion: true, category: 'Ahorro' } })
      }
      if (dispersion.necesidades > 0) {
        rows.push({ owner_id: userId, type: 'note', content: 'AFP: presupuesto necesidades $' + dispersion.necesidades,
          metadata: { amount: dispersion.necesidades, currency: 'MXN', date, tags: ['#afp','#necesidades'],
            afp_dispersion: true, is_budget: true } })
      }
      if (dispersion.lifestyle > 0) {
        rows.push({ owner_id: userId, type: 'note', content: 'AFP: presupuesto lifestyle $' + dispersion.lifestyle,
          metadata: { amount: dispersion.lifestyle, currency: 'MXN', date, tags: ['#afp','#lifestyle'],
            afp_dispersion: true, is_budget: true } })
      }
      const { error } = await admin.from('nodes').insert(rows)
      if (error) throw error
      return res.status(200).json({ ok: true, created: rows.length })
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
