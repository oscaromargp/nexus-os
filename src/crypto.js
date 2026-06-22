// Nexus OS — Módulo Cripto Portfolio
//
// Dashboard manual con valuación automática vía CoinGecko (free, cached 10 min).
// - Total MXN/USD + 24h change
// - Distribución pie chart
// - Tabla de holdings con precio actual + ROI
// - Modal agregar transacción (buy/sell/transfer)
// - Mini-journal (motivo de cada compra)

import { supabase } from './supabase.js'

async function _api(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sin sesión')
  const r = await fetch('/api/financial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ action, ...payload }),
  })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.error || 'API fail')
  return j
}

function _esc(s) { return String(s||'').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])) }
function _fmt(n, currency = 'MXN') {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const decimals = currency === 'USD' ? 2 : 2
  return sign + '$' + abs.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function _fmtPct(n) {
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(2) + '%'
}
function _fmtQty(n) {
  if (n >= 1) return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 4 })
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 8 })
}

const COIN_COLORS = {
  BTC: '#f7931a', ETH: '#627eea', XRP: '#23292f', USDT: '#26a17b', DAI: '#f5ac37',
  TRX: '#ff0027', USDC: '#2775ca', SOL: '#14f195', ADA: '#0033ad',
  DOGE: '#c2a633', BNB: '#f3ba2f', AVAX: '#e84142', MATIC: '#8247e5',
  DOT: '#e6007a', LINK: '#2a5ada', LTC: '#bfbbbb', XLM: '#7d00ff', XMR: '#ff6600',
  BCH: '#0ac18e', ETC: '#33ff33', ATOM: '#2e3148', NEAR: '#000000', APT: '#000000',
  SUI: '#6fbcf0', ARB: '#28a0f0', OP: '#ff0420', INJ: '#00d2ff', TIA: '#7b2bf9',
  HBAR: '#000000', ICP: '#3b00b9', FIL: '#0090ff', AAVE: '#b6509e', UNI: '#ff007a',
  MKR: '#1aab9b', LDO: '#f5a623', RUNE: '#33ff99',
  SHIB: '#ffa409', PEPE: '#3a9b3f', FLOKI: '#ffc14a', BONK: '#ff8c00', WIF: '#dbb37a',
  IMX: '#0b0e1f', RNDR: '#cf1f31', FET: '#3b41e1', GRT: '#6747ed', XTZ: '#2c7df7', ALGO: '#000000',
}
const COIN_NAMES = {
  BTC: 'Bitcoin', ETH: 'Ethereum', XRP: 'Ripple', BNB: 'BNB', SOL: 'Solana',
  ADA: 'Cardano', DOGE: 'Dogecoin', AVAX: 'Avalanche', TRX: 'Tron', DOT: 'Polkadot',
  LINK: 'Chainlink', LTC: 'Litecoin', MATIC: 'Polygon', ATOM: 'Cosmos', XLM: 'Stellar',
  XMR: 'Monero', BCH: 'Bitcoin Cash', ETC: 'Ethereum Classic',
  USDT: 'Tether', USDC: 'USD Coin', DAI: 'DAI',
  NEAR: 'NEAR Protocol', APT: 'Aptos', SUI: 'Sui', ARB: 'Arbitrum', OP: 'Optimism',
  INJ: 'Injective', TIA: 'Celestia', HBAR: 'Hedera', ICP: 'Internet Computer',
  FIL: 'Filecoin', AAVE: 'Aave', UNI: 'Uniswap', MKR: 'Maker', LDO: 'Lido',
  RUNE: 'THORChain',
  SHIB: 'Shiba Inu', PEPE: 'Pepe', FLOKI: 'Floki', BONK: 'Bonk', WIF: 'dogwifhat',
  IMX: 'Immutable', RNDR: 'Render', FET: 'Fetch.ai', GRT: 'The Graph',
  XTZ: 'Tezos', ALGO: 'Algorand',
}
function _coinColor(sym) { return COIN_COLORS[sym] || '#94a3b8' }
function _coinName(sym) { return COIN_NAMES[sym] || sym }
function _hexRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return '255,255,255'
  return parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16)
}

function _pieChart(items) {
  if (!items.length) return ''
  const cx = 90, cy = 90, r = 75, inner = 50
  let acc = 0
  const total = items.reduce((s, i) => s + i.allocation_pct, 0) || 100
  const slices = items.map(it => {
    const start = (acc / total) * 2 * Math.PI - Math.PI / 2
    acc += it.allocation_pct
    const end = (acc / total) * 2 * Math.PI - Math.PI / 2
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    const xi1 = cx + inner * Math.cos(start)
    const yi1 = cy + inner * Math.sin(start)
    const xi2 = cx + inner * Math.cos(end)
    const yi2 = cy + inner * Math.sin(end)
    const large = end - start > Math.PI ? 1 : 0
    const col = _coinColor(it.symbol)
    return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${col}" opacity="0.92"/>`
  }).join('')
  return `<svg viewBox="0 0 180 180" style="width:160px;height:160px;">${slices}</svg>`
}

let _allTxs = []
let _currentPrices = {}  // cache de precios actuales para auto-conv MXN/USD

// ── Feed lectura: persistencia local de IDs leídos ────────────
const READ_FEED_KEY = 'nexus_crypto_news_read'
function _getReadIds() { try { return new Set(JSON.parse(localStorage.getItem(READ_FEED_KEY) || '[]')) } catch { return new Set() } }
function _markRead(id) { const s = _getReadIds(); s.add(id); try { localStorage.setItem(READ_FEED_KEY, JSON.stringify([...s].slice(-300))) } catch {} }
function _markAllRead(ids) { const s = _getReadIds(); ids.forEach(id => s.add(id)); try { localStorage.setItem(READ_FEED_KEY, JSON.stringify([...s].slice(-300))) } catch {} }
function _hashUrl(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 } return 'n' + Math.abs(h) }

// ── Score determinístico del portafolio cripto ───────────────
function _cryptoScore(items, summary) {
  if (!items.length) return null
  // 4 factores, 25 pts cada uno
  // 1. ROI total
  let scoreRoi = 0
  if (summary.total_roi_pct >= 50) scoreRoi = 25
  else if (summary.total_roi_pct >= 20) scoreRoi = 22
  else if (summary.total_roi_pct >= 0) scoreRoi = 18
  else if (summary.total_roi_pct >= -20) scoreRoi = 8
  else scoreRoi = 2
  // 2. Diversificación (≥ 4 monedas = full; menos = parcial)
  const scoreDivers = Math.min(25, items.length * 6)
  // 3. Concentración: el activo más grande no debería pasar 70%
  const topAllocation = Math.max(...items.map(i => i.allocation_pct || 0))
  let scoreConc = 0
  if (topAllocation < 40) scoreConc = 25
  else if (topAllocation < 55) scoreConc = 20
  else if (topAllocation < 70) scoreConc = 12
  else scoreConc = 4
  // 4. Momentum 24h promedio ponderado por allocation
  let weighted24h = 0
  for (const i of items) weighted24h += (i.change_24h_pct || 0) * ((i.allocation_pct || 0) / 100)
  let scoreMomentum = 0
  if (weighted24h >= 3) scoreMomentum = 25
  else if (weighted24h >= 0) scoreMomentum = 20
  else if (weighted24h >= -3) scoreMomentum = 13
  else if (weighted24h >= -10) scoreMomentum = 5
  else scoreMomentum = 0

  const total = Math.round(scoreRoi + scoreDivers + scoreConc + scoreMomentum)
  let label, color
  if (total >= 80) { label = 'Excelente'; color = '#22c55e' }
  else if (total >= 60) { label = 'Saludable'; color = '#84cc16' }
  else if (total >= 40) { label = 'Mixto'; color = '#fbbf24' }
  else if (total >= 20) { label = 'En riesgo'; color = '#fb923c' }
  else { label = 'Crítico'; color = '#ef4444' }

  return {
    total, label, color,
    breakdown: {
      roi: { value: scoreRoi, max: 25, label: 'Rentabilidad', detail: `ROI ${summary.total_roi_pct.toFixed(1)}%` },
      diversification: { value: scoreDivers, max: 25, label: 'Diversificación', detail: `${items.length} activos distintos` },
      concentration: { value: scoreConc, max: 25, label: 'Concentración', detail: `Top activo: ${topAllocation.toFixed(0)}%` },
      momentum: { value: scoreMomentum, max: 25, label: 'Momentum 24h', detail: `${weighted24h >= 0 ? '+' : ''}${weighted24h.toFixed(2)}% ponderado` },
    },
  }
}

export async function renderCrypto() {
  const root = document.getElementById('crypto-root')
  if (!root) return
  root.innerHTML = `<div style="padding:24px;color:#94a3b8;">⏳ Calculando portfolio y consultando precios…</div>`

  let data, txData, journalData, newsData = { items: [] }
  try {
    [data, txData, journalData] = await Promise.all([
      _api('crypto_list'),
      _api('crypto_transactions'),
      _api('journal_list'),
    ])
  } catch (e) {
    root.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${e.message}</div>`
    return
  }

  // Cache de precios para conversión MXN↔USD
  _currentPrices = {}
  for (const it of (data.items || [])) {
    if (it.current_price_mxn && it.current_price_usd) {
      _currentPrices[it.symbol] = {
        mxn: it.current_price_mxn,
        usd: it.current_price_usd,
        rate: it.current_price_mxn / it.current_price_usd,  // USD → MXN
      }
    }
  }

  // News en background — pide noticias y luego pide traducción al español
  const heldSymbols = data.items.map(i => i.symbol)
  if (heldSymbols.length) {
    _api('crypto_news', { symbols: heldSymbols, limit: 10 })
      .then(async (j) => {
        const items = j.items || []
        if (!items.length) { _renderNewsInto([]); return }
        try {
          const t = await _api('crypto_news_translate', { items })
          _renderNewsInto(t.translated || items)
        } catch {
          _renderNewsInto(items)
        }
      })
      .catch(() => { _renderNewsInto([]) })
  }

  _allTxs = txData.transactions || []
  const { items, summary } = data

  const pnlColor = summary.total_pnl_mxn >= 0 ? '#22c55e' : '#ef4444'

  let html = `
    <div style="padding:20px;max-width:1200px;margin:0 auto;">

      <!-- HEADER -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:24px;font-weight:800;margin:0 0 4px;">₿ Cripto Portfolio</h2>
          <p style="color:#94a3b8;font-size:13px;margin:0;">Precios CoinGecko, cache 10 min. Registro manual.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="crypto-journal-btn" style="padding:9px 14px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">📓 Journal</button>
          <button id="crypto-add-tx-btn" style="padding:9px 14px;background:linear-gradient(135deg,#f7931a,#fb923c);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">+ Nueva transacción</button>
        </div>
      </div>

      <!-- TOTAL CARD -->
      <div style="background:linear-gradient(135deg,rgba(247,147,26,0.06),rgba(247,147,26,0.14));border:1px solid rgba(247,147,26,0.35);border-radius:14px;padding:20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Portfolio total</div>
            <div style="font-size:36px;font-weight:800;color:#fb923c;margin-top:4px;">${_fmt(summary.total_value_mxn)}</div>
            <div style="font-size:14px;color:#94a3b8;margin-top:2px;">${_fmt(summary.total_value_usd, 'USD')} USD</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Ganancia / Pérdida</div>
            <div style="font-size:28px;font-weight:800;color:${pnlColor};margin-top:4px;">${summary.total_pnl_mxn >= 0 ? '+' : ''}${_fmt(summary.total_pnl_mxn)}</div>
            <div style="font-size:13px;color:${pnlColor};margin-top:2px;">${_fmtPct(summary.total_roi_pct)} ROI</div>
          </div>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;color:#94a3b8;">
          <div>📊 Activos: <span style="color:#e5e7eb;font-weight:700;">${summary.holdings_count}</span></div>
          <div>📝 Transacciones: <span style="color:#e5e7eb;font-weight:700;">${summary.tx_count}</span></div>
          <div>💰 Costo total: <span style="color:#e5e7eb;font-weight:700;">${_fmt(summary.total_cost_mxn)}</span></div>
        </div>
      </div>

      ${(() => {
        const cs = _cryptoScore(items, summary)
        if (!cs) return ''
        return `
        <!-- CRYPTO SCORE -->
        <div style="background:linear-gradient(135deg,rgba(${_hexRgb(cs.color)},0.05),rgba(${_hexRgb(cs.color)},0.12));border:1px solid ${cs.color}40;border-radius:14px;padding:18px;margin-bottom:20px;">
          <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;">
            <div style="text-align:center;min-width:140px;">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Cripto Score</div>
              <div style="font-size:54px;font-weight:800;color:${cs.color};margin-top:4px;line-height:1;">${cs.total}</div>
              <div style="font-size:11px;color:#6b7280;">/ 100</div>
              <div style="font-size:14px;font-weight:800;color:${cs.color};margin-top:6px;">${cs.label}</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
              ${Object.entries(cs.breakdown).map(([k, b]) => {
                const ratio = b.value / b.max
                const col = ratio >= 0.8 ? '#22c55e' : ratio >= 0.5 ? '#fbbf24' : '#f87171'
                return `
                  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;">
                    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:600;">${b.label}</div>
                    <div style="display:flex;align-items:baseline;gap:4px;margin-top:2px;">
                      <span style="font-size:18px;font-weight:800;color:${col};">${b.value}</span>
                      <span style="font-size:11px;color:#6b7280;">/${b.max}</span>
                    </div>
                    <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${b.detail}</div>
                    <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:5px;overflow:hidden;">
                      <div style="height:100%;width:${(ratio*100).toFixed(0)}%;background:${col};border-radius:2px;"></div>
                    </div>
                  </div>
                `
              }).join('')}
            </div>
          </div>
        </div>
        `
      })()}

      ${items.length ? `
      <!-- 2 COLUMNS: PIE + TABLE -->
      <div style="display:grid;grid-template-columns:auto 1fr;gap:20px;margin-bottom:20px;align-items:start;">

        <!-- PIE -->
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">Distribución</div>
          ${_pieChart(items)}
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;text-align:left;">
            ${items.map(it => `
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;">
                <span style="display:inline-flex;align-items:center;gap:5px;">
                  <span style="width:10px;height:10px;background:${_coinColor(it.symbol)};border-radius:2px;display:inline-block;"></span>
                  <span style="color:#e5e7eb;font-weight:600;">${it.symbol}</span>
                </span>
                <span style="color:#94a3b8;">${it.allocation_pct.toFixed(1)}%</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- TABLE -->
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
          <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Mis activos</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:rgba(255,255,255,0.03);">
                  <th style="text-align:left;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Cripto</th>
                  <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Qty</th>
                  <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Precio (24h)</th>
                  <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">Valor MXN</th>
                  <th style="text-align:right;padding:10px 12px;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => {
                  const pnlCol = it.pnl_mxn >= 0 ? '#22c55e' : '#ef4444'
                  const chCol  = it.change_24h_pct >= 0 ? '#22c55e' : '#ef4444'
                  return `
                  <tr style="border-top:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:10px 12px;">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span style="width:24px;height:24px;background:${_coinColor(it.symbol)};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${it.symbol==='XRP'?'#fff':'#000'};">${it.symbol[0]}</span>
                        <div>
                          <div style="font-weight:700;color:#e5e7eb;">${it.symbol}</div>
                          <div style="font-size:10px;color:#6b7280;">${it.tx_count} tx</div>
                        </div>
                      </div>
                    </td>
                    <td style="padding:10px 12px;text-align:right;color:#e5e7eb;font-family:monospace;">${_fmtQty(it.quantity)}</td>
                    <td style="padding:10px 12px;text-align:right;">
                      <div style="color:#e5e7eb;">${_fmt(it.current_price_mxn)}</div>
                      <div style="font-size:11px;color:${chCol};">${_fmtPct(it.change_24h_pct)}</div>
                    </td>
                    <td style="padding:10px 12px;text-align:right;">
                      <div style="color:#e5e7eb;font-weight:700;">${_fmt(it.value_mxn)}</div>
                      <div style="font-size:11px;color:#6b7280;">${it.allocation_pct.toFixed(1)}%</div>
                    </td>
                    <td style="padding:10px 12px;text-align:right;">
                      <div style="color:${pnlCol};font-weight:700;">${it.pnl_mxn >= 0 ? '+' : ''}${_fmt(it.pnl_mxn)}</div>
                      <div style="font-size:11px;color:${pnlCol};">${_fmtPct(it.roi_pct)}</div>
                    </td>
                  </tr>`
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ` : `
      <div style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:12px;padding:40px;text-align:center;margin-bottom:20px;">
        <div style="font-size:48px;margin-bottom:8px;">₿</div>
        <div style="font-size:16px;color:#e5e7eb;font-weight:700;">Aún no tienes transacciones</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:4px;">Pulsa <b>+ Nueva transacción</b> para empezar a rastrear tu portfolio.</div>
      </div>
      `}

      <!-- TRANSACCIONES RECIENTES -->
      ${_allTxs.length ? `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Transacciones recientes</div>
        <div style="display:flex;flex-direction:column;">
          ${_allTxs.slice(0, 15).map(tx => {
            const isBuy = tx.type === 'buy' || tx.type === 'transfer_in'
            const icon = isBuy ? '🟢' : '🔴'
            const sign = isBuy ? '+' : '-'
            const col = isBuy ? '#22c55e' : '#ef4444'
            return `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid rgba(255,255,255,0.04);font-size:13px;">
                <span style="font-size:16px;">${icon}</span>
                <div style="flex:1;min-width:0;">
                  <div style="color:#e5e7eb;font-weight:600;">${sign}${_fmtQty(tx.quantity)} ${tx.symbol}${tx.exchange ? ' · <span style="color:#94a3b8;font-weight:500;">' + _esc(tx.exchange) + '</span>' : ''}</div>
                  <div style="font-size:11px;color:#6b7280;">${tx.date}${tx.reasoning ? ' · ' + _esc(tx.reasoning.slice(0,60)) : ''}</div>
                </div>
                ${tx.total_mxn ? `<div style="color:${col};font-weight:700;font-size:13px;">${_fmt(tx.total_mxn)}</div>` : ''}
                <button data-edit-tx="${tx.id}" title="Editar" style="background:transparent;border:none;color:#22d3ee;cursor:pointer;padding:4px;font-size:14px;">✏️</button>
                <button data-del-tx="${tx.id}" title="Eliminar" style="background:transparent;border:none;color:#6b7280;cursor:pointer;padding:4px;font-size:14px;">🗑</button>
              </div>
            `
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- IA STRATEGY + DISPERSIÓN -->
      ${items.length ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div id="crypto-strategy-card" style="background:linear-gradient(135deg,rgba(167,139,250,0.06),rgba(99,102,241,0.10));border:1px solid rgba(167,139,250,0.3);border-radius:12px;padding:16px;">
          <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <div>
              <div style="font-size:14px;font-weight:800;color:#a78bfa;">🧠 Estrategia del momento</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">IA analiza tu portafolio + mercado</div>
            </div>
            <button id="crypto-strategy-btn" style="padding:7px 12px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);color:#c4b5fd;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;flex-shrink:0;">✨ Pídeme estrategia</button>
          </div>
          <div id="crypto-strategy-content" style="margin-top:8px;font-size:12px;color:#94a3b8;">Pulsa "Pídeme estrategia" para recibir 2-3 sugerencias accionables con razones.</div>
        </div>

        <div id="crypto-dispersion-card" style="background:linear-gradient(135deg,rgba(34,211,238,0.06),rgba(6,182,212,0.10));border:1px solid rgba(34,211,238,0.3);border-radius:12px;padding:16px;">
          <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:8px;">
            <div>
              <div style="font-size:14px;font-weight:800;color:#22d3ee;">💸 Calculadora de dispersión</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">"Hoy tengo $X, ¿cómo los reparto?"</div>
            </div>
            <button id="crypto-dispersion-btn" style="padding:7px 12px;background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.4);color:#67e8f9;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;flex-shrink:0;">💡 Calcular</button>
          </div>
          <div id="crypto-dispersion-content" style="margin-top:8px;font-size:12px;color:#94a3b8;">Pulsa "Calcular" para que la IA te sugiera cómo distribuir un monto entre tus monedas.</div>
        </div>
      </div>

      <!-- WALLETS -->
      <div style="margin-bottom:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-size:14px;font-weight:800;color:#e5e7eb;">🔐 Mis wallets y direcciones</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Cold wallet (Ledger), Hot wallet (Bitso), etc.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button id="crypto-bitso-cold-btn" title="Registra una transferencia de Bitso a tu Cold Wallet (entrada+salida+comprobante)" style="padding:7px 12px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">🔄 Bitso → Cold</button>
            <button id="crypto-wallets-btn" style="padding:7px 12px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">+ Gestionar wallets</button>
          </div>
        </div>
        <div id="crypto-wallets-content" style="padding:12px 16px;color:#6b7280;font-size:12px;">⏳</div>
      </div>
      ` : ''}

      <!-- NEWS FEED en ESPAÑOL -->
      ${items.length ? `
      <div id="crypto-news-panel" style="margin-top:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:14px;font-weight:800;color:#e5e7eb;">📡 Feed de tus criptos · en español 🇲🇽</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">CoinDesk · CoinTelegraph · Decrypt · The Defiant — traducidos con IA</div>
          </div>
          <div id="crypto-news-header-actions" style="display:flex;align-items:center;gap:8px;"></div>
        </div>
        <div id="crypto-news-list" style="padding:12px;color:#6b7280;font-size:12px;text-align:center;">⏳ Cargando feed y traduciendo…</div>
      </div>
      ` : ''}

      <!-- JOURNAL TEASER -->
      ${journalData.entries.length ? `
      <div style="margin-top:20px;background:rgba(167,139,250,0.04);border:1px solid rgba(167,139,250,0.2);border-radius:12px;padding:14px;">
        <div style="font-size:12px;color:#a78bfa;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">📓 Tesis activas (${journalData.entries.length})</div>
        ${journalData.entries.slice(0,3).map(e => `
          <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;color:#e5e7eb;">
            <b>${e.symbol}</b> · ${_esc((e.thesis||'').slice(0,80))}${e.target_price_usd ? ' · 🎯 $' + e.target_price_usd + ' USD' : ''}
          </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
  `

  root.innerHTML = html
  document.getElementById('crypto-add-tx-btn')?.addEventListener('click', () => _openTxModal(null))
  document.getElementById('crypto-journal-btn')?.addEventListener('click', () => _openJournalModal(journalData.entries, items.map(i => i.symbol)))
  root.querySelectorAll('[data-del-tx]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tx = _allTxs.find(t => t.id === btn.dataset.delTx)
      const isWithdraw = tx && (tx.type === 'sell' || tx.type === 'transfer_out')
      if (!confirm(`¿Eliminar transacción?${isWithdraw ? '\n\nEsto era una venta/retiro — perderás el registro.' : ''}`)) return
      try {
        await _api('crypto_delete_tx', { tx_id: btn.dataset.delTx })
        renderCrypto()
      } catch (e) { alert('⚠ ' + e.message) }
    })
  })
  root.querySelectorAll('[data-edit-tx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tx = _allTxs.find(t => t.id === btn.dataset.editTx)
      if (tx) _openTxModal(tx)
    })
  })

  // ── Bind nuevos botones ────────────────────────────────────
  document.getElementById('crypto-strategy-btn')?.addEventListener('click', () => _requestStrategy(items, summary))
  document.getElementById('crypto-dispersion-btn')?.addEventListener('click', () => _openDispersionModal(items, summary))
  document.getElementById('crypto-wallets-btn')?.addEventListener('click', () => _openWalletsModal())
  document.getElementById('crypto-bitso-cold-btn')?.addEventListener('click', () => _openBitsoToColdModal())
  if (items.length) _loadWalletsPreview()
}

// ── Wallets preview en home ────────────────────────────────────
async function _loadWalletsPreview() {
  const target = document.getElementById('crypto-wallets-content')
  if (!target) return
  try {
    const j = await _api('crypto_wallets_list')
    const wallets = j.wallets || []
    if (!wallets.length) {
      target.innerHTML = `<div style="font-size:13px;color:#94a3b8;">No tienes wallets registrados aún. Crea uno para empezar a organizar tus direcciones por red.</div>`
      return
    }
    target.innerHTML = wallets.map(w => {
      const addrSummary = w.addresses && w.addresses.length
        ? w.addresses.map(a => `${a.symbol}-${a.network}`).join(' · ')
        : 'Sin direcciones aún'
      const kindLabels = { cold: '🥶 Cold', hot: '🔥 Hot', exchange: '🏦 Exchange', custodial: '🔐 Custodial', paper: '📄 Paper' }
      return `
        <div style="padding:10px 0;border-top:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-weight:700;color:#e5e7eb;font-size:13px;">${_esc(w.name)}</span>
          <span style="font-size:11px;color:#94a3b8;background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:4px;">${kindLabels[w.kind] || w.kind}</span>
          ${w.provider ? `<span style="font-size:11px;color:#94a3b8;">${_esc(w.provider)}</span>` : ''}
          <span style="font-size:11px;color:#22d3ee;flex:1;text-align:right;">${_esc(addrSummary).slice(0,80)}</span>
        </div>
      `
    }).join('')
  } catch (e) {
    target.innerHTML = `<div style="color:#f87171;font-size:12px;">⚠ ${e.message}</div>`
  }
}

// ── IA Strategy ────────────────────────────────────────────────
async function _requestStrategy(items, summary) {
  const target = document.getElementById('crypto-strategy-content')
  const btn = document.getElementById('crypto-strategy-btn')
  if (!target) return
  target.innerHTML = '<div style="color:#94a3b8;font-size:12px;">🤖 Analizando portafolio y mercado…</div>'
  if (btn) btn.disabled = true

  // Construye contexto
  const context = {
    holdings: items.map(i => ({
      symbol: i.symbol, qty: i.quantity, value_mxn: i.value_mxn,
      allocation_pct: i.allocation_pct, roi_pct: i.roi_pct,
      change_24h_pct: i.change_24h_pct,
    })),
    summary: {
      total_value_mxn: summary.total_value_mxn,
      total_roi_pct: summary.total_roi_pct,
      holdings_count: items.length,
    },
    preferences: {
      weekly_budget_mxn: 200,
      preferred_for_cold: ['XRP', 'TRX'],
      exchange: 'Bitso',
      cold_wallet: 'Ledger',
    },
  }
  try {
    const j = await _api('crypto_strategy_suggest', { context })
    _renderStrategy(j.strategy)
  } catch (e) {
    target.innerHTML = `<div style="color:#f87171;font-size:12px;">⚠ ${e.message}</div>`
  } finally {
    if (btn) btn.disabled = false
  }
}

function _renderStrategy(s) {
  const target = document.getElementById('crypto-strategy-content')
  if (!target) return
  const urgencyColor = { high: '#ef4444', medium: '#fbbf24', low: '#94a3b8' }
  const typeIcon = { buy: '🟢', sell: '🔴', hold: '🤲', rebalance: '🔁', wait: '⏳' }
  let html = ''
  if (s.summary) html += `<div style="font-size:12px;color:#cbd5e1;line-height:1.5;margin-bottom:10px;font-style:italic;">${_esc(s.summary)}</div>`
  if (s.warning) html += `<div style="font-size:11px;color:#fca5a5;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);padding:8px;border-radius:6px;margin-bottom:10px;">⚠ ${_esc(s.warning)}</div>`
  if (s.actions && s.actions.length) {
    html += s.actions.map(a => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="font-size:14px;">${typeIcon[a.type] || '•'}</span>
          <span style="font-weight:700;color:#e5e7eb;font-size:13px;">${_esc(a.action)}</span>
          <span style="background:${urgencyColor[a.urgency] || '#94a3b8'}22;color:${urgencyColor[a.urgency] || '#94a3b8'};font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:1px;">${a.urgency || 'medium'}</span>
          ${a.amount_suggestion ? `<span style="font-size:11px;color:#22d3ee;margin-left:auto;">${_esc(a.amount_suggestion)}</span>` : ''}
        </div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.5;">${_esc(a.reason)}</div>
      </div>
    `).join('')
  }
  target.innerHTML = html
}

// ── Dispersión modal ──────────────────────────────────────────
function _openDispersionModal(items, summary) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:520px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;`

  modal.innerHTML = `
    <h3 style="margin:0 0 6px;font-size:17px;font-weight:800;">💸 Calculadora de dispersión</h3>
    <p style="margin:0 0 14px;font-size:12px;color:#94a3b8;">Pon el monto que tienes hoy y la IA te dice cómo repartirlo entre tus monedas, sesgada a XRP/TRX para retiros baratos a tu cold wallet.</p>

    <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Monto disponible (MXN)</label>
    <input id="disp-amount" type="number" step="1" placeholder="200" value="200" style="width:100%;padding:11px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:16px;margin-bottom:14px;font-weight:700;"/>

    <button id="disp-go" style="width:100%;padding:11px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:800;border-radius:8px;cursor:pointer;font-size:14px;">✨ Sugiéreme la mejor dispersión</button>

    <div id="disp-result" style="margin-top:14px;"></div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="disp-cancel" style="flex:1;padding:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#94a3b8;border-radius:8px;cursor:pointer;font-size:13px;">Cerrar</button>
    </div>
  `
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => document.body.removeChild(overlay)
  modal.querySelector('#disp-cancel').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  modal.querySelector('#disp-go').addEventListener('click', async () => {
    const amount = Number(modal.querySelector('#disp-amount').value)
    if (!amount || amount <= 0) { alert('Pon un monto válido'); return }
    const resultEl = modal.querySelector('#disp-result')
    resultEl.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:14px;">🤖 Calculando dispersión inteligente…</div>'

    try {
      const j = await _api('crypto_dispersion_suggest', {
        amount_mxn: amount,
        holdings_summary: items.map(i => ({
          symbol: i.symbol, allocation_pct: i.allocation_pct,
          change_24h_pct: i.change_24h_pct, value_mxn: i.value_mxn,
        })),
        prices_24h: items.reduce((m, i) => ({ ...m, [i.symbol]: { change_24h_pct: i.change_24h_pct, price_mxn: i.current_price_mxn } }), {}),
        preferences: {
          weekly_budget_mxn: 200,
          preferred_for_cold: ['XRP', 'TRX'],
          exchange: 'Bitso',
        },
      })
      _renderDispersion(j.dispersion, resultEl)
    } catch (e) {
      resultEl.innerHTML = `<div style="color:#f87171;font-size:12px;padding:14px;">⚠ ${e.message}</div>`
    }
  })
}

function _renderDispersion(d, target) {
  if (!d) return
  let html = ''
  if (d.rationale) html += `<div style="font-size:12px;color:#cbd5e1;line-height:1.6;font-style:italic;margin-bottom:12px;padding:10px;background:rgba(34,211,238,0.06);border-left:3px solid #22d3ee;border-radius:0 6px 6px 0;">${_esc(d.rationale)}</div>`
  if (d.splits && d.splits.length) {
    html += '<div style="display:flex;flex-direction:column;gap:8px;">'
    for (const s of d.splits) {
      html += `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="width:22px;height:22px;background:${_coinColor(s.symbol)};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#000;">${s.symbol[0]}</span>
            <span style="font-weight:700;color:#e5e7eb;">${s.symbol}</span>
            <span style="color:#94a3b8;font-size:11px;">${s.pct}%</span>
            <span style="margin-left:auto;font-weight:800;color:#22d3ee;">${_fmt(s.amount_mxn)}</span>
          </div>
          <div style="font-size:12px;color:#94a3b8;line-height:1.5;">${_esc(s.reason)}</div>
          ${s.low_fee_to_cold ? `<div style="font-size:10px;color:#34d399;margin-top:4px;">✓ Baja comisión Bitso → cold wallet</div>` : ''}
        </div>
      `
    }
    html += '</div>'
  }
  if (d.warnings && d.warnings.length) {
    html += '<div style="margin-top:12px;padding:10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.3);border-radius:6px;font-size:11px;color:#fde68a;">'
    html += '<strong>⚠ Considera:</strong><ul style="margin:4px 0 0 16px;padding:0;">'
    for (const w of d.warnings) html += `<li>${_esc(w)}</li>`
    html += '</ul></div>'
  }
  target.innerHTML = html
}

// ── Wallets modal completo ───────────────────────────────────
async function _openWalletsModal() {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:680px;width:100%;color:#e5e7eb;max-height:92vh;overflow-y:auto;`

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h3 style="margin:0;font-size:17px;font-weight:800;">🔐 Wallets y direcciones</h3>
      <button id="wall-close" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>
    <p style="margin:0 0 14px;font-size:12px;color:#94a3b8;line-height:1.5;">Organiza tus monedas por wallet (cold/hot) y dirección. Cada wallet puede tener múltiples direcciones (ej. XRP en 2 direcciones distintas; USDT en TRC20 y ERC20).</p>

    <!-- Form nuevo wallet -->
    <div style="background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.2);border-radius:10px;padding:12px;margin-bottom:16px;">
      <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">+ Nuevo wallet</div>
      <div style="display:grid;grid-template-columns:1fr 140px 130px;gap:6px;margin-bottom:6px;">
        <input id="wn-name" placeholder="Ej: Ledger Nano S Plus" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <select id="wn-kind" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          <option value="cold">🥶 Cold wallet</option>
          <option value="hot">🔥 Hot wallet</option>
          <option value="exchange">🏦 Exchange</option>
          <option value="custodial">🔐 Custodial</option>
          <option value="paper">📄 Paper</option>
        </select>
        <input id="wn-provider" placeholder="Proveedor" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <button id="wn-add" style="padding:8px 14px;background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.4);color:#22d3ee;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Crear wallet</button>
    </div>

    <div id="wall-list" style="display:flex;flex-direction:column;gap:10px;"></div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => { document.body.removeChild(overlay); _loadWalletsPreview() }
  modal.querySelector('#wall-close').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  const renderList = async () => {
    const list = modal.querySelector('#wall-list')
    list.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:14px;">⏳</div>'
    try {
      const j = await _api('crypto_wallets_list')
      const wallets = j.wallets || []
      if (!wallets.length) {
        list.innerHTML = '<div style="color:#6b7280;font-size:13px;text-align:center;padding:20px;background:rgba(255,255,255,0.02);border-radius:8px;">Aún no hay wallets. Crea uno arriba.</div>'
        return
      }
      const kindLabels = { cold: '🥶 Cold', hot: '🔥 Hot', exchange: '🏦 Exchange', custodial: '🔐 Custodial', paper: '📄 Paper' }
      list.innerHTML = wallets.map(w => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <strong style="color:#e5e7eb;">${_esc(w.name)}</strong>
            <span style="font-size:11px;color:#94a3b8;background:rgba(255,255,255,0.04);padding:2px 8px;border-radius:4px;">${kindLabels[w.kind] || w.kind}</span>
            ${w.provider ? `<span style="font-size:11px;color:#94a3b8;">${_esc(w.provider)}</span>` : ''}
            <button data-del-wallet="${w.id}" style="margin-left:auto;background:transparent;border:none;color:#6b7280;cursor:pointer;font-size:14px;">🗑</button>
          </div>

          <!-- Saldo equivalente MXN (para AFP) -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:8px 10px;background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.15);border-radius:8px;">
            <span style="font-size:11px;color:#94a3b8;">💵 Saldo MXN:</span>
            <input data-wallet-bal="${w.id}" type="number" step="any" placeholder="0" value="${Number(w.manual_balance_mxn || 0)}" style="flex:1;padding:5px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:#22d3ee;font-family:monospace;font-size:13px;font-weight:700;outline:none;" />
            <button data-save-bal="${w.id}" style="padding:5px 12px;background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.35);color:#22d3ee;border-radius:5px;cursor:pointer;font-size:11px;font-weight:700;">Guardar</button>
            <span style="font-size:10px;color:#6b7280;">para AFP</span>
          </div>
          <!-- Direcciones -->
          <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
            ${(w.addresses || []).map(a => `
              <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;padding:7px 10px;display:flex;align-items:center;gap:8px;font-size:12px;">
                <span style="font-weight:700;color:${_coinColor(a.symbol)};min-width:50px;">${a.symbol}</span>
                <span style="background:rgba(34,211,238,0.1);color:#22d3ee;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;">${_esc(a.network)}</span>
                ${a.label ? `<span style="color:#94a3b8;">${_esc(a.label)}</span>` : ''}
                <span style="color:#6b7280;font-family:monospace;font-size:10px;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(a.address).slice(0,28)}${a.address.length > 28 ? '…' : ''}</span>
                <button data-del-addr="${a.id}" style="background:transparent;border:none;color:#6b7280;cursor:pointer;font-size:12px;">🗑</button>
              </div>
            `).join('')}
          </div>
          <!-- Form direccion -->
          <div style="margin-top:8px;display:grid;grid-template-columns:80px 100px 1fr 70px;gap:4px;">
            <input data-addr-symbol="${w.id}" placeholder="XRP" style="padding:6px;background:#1f2937;border:1px solid #374151;border-radius:4px;color:#e5e7eb;font-size:11px;text-transform:uppercase;"/>
            <input data-addr-network="${w.id}" placeholder="XRP / TRC20" style="padding:6px;background:#1f2937;border:1px solid #374151;border-radius:4px;color:#e5e7eb;font-size:11px;"/>
            <input data-addr-address="${w.id}" placeholder="rEXXX… o TXXXXX…" style="padding:6px;background:#1f2937;border:1px solid #374151;border-radius:4px;color:#e5e7eb;font-size:11px;font-family:monospace;"/>
            <button data-add-addr="${w.id}" style="padding:6px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;">+ Dir</button>
          </div>
        </div>
      `).join('')

      // Handlers
      list.querySelectorAll('[data-del-wallet]').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este wallet y todas sus direcciones?')) return
        try { await _api('crypto_wallet_delete', { id: btn.dataset.delWallet }); renderList() }
        catch (e) { alert('⚠ ' + e.message) }
      }))
      list.querySelectorAll('[data-del-addr]').forEach(btn => btn.addEventListener('click', async () => {
        try { await _api('crypto_address_delete', { id: btn.dataset.delAddr }); renderList() }
        catch (e) { alert('⚠ ' + e.message) }
      }))
      list.querySelectorAll('[data-save-bal]').forEach(btn => btn.addEventListener('click', async () => {
        const wid = btn.dataset.saveBal
        const inp = list.querySelector(`[data-wallet-bal="${wid}"]`)
        const val = parseFloat(inp.value) || 0
        try {
          await _api('crypto_wallet_update', { id: wid, manual_balance_mxn: val })
          btn.textContent = '✓ ok'; btn.style.background = 'rgba(52,211,153,0.2)'
          setTimeout(() => { btn.textContent = 'Guardar'; btn.style.background = 'rgba(34,211,238,0.15)' }, 1500)
          // Refresca el balance-engine
          try { window.nexusBalance?.invalidate?.() } catch {}
        } catch (e) { alert('⚠ ' + e.message) }
      }))
      list.querySelectorAll('[data-add-addr]').forEach(btn => btn.addEventListener('click', async () => {
        const wid = btn.dataset.addAddr
        const symbol = list.querySelector(`[data-addr-symbol="${wid}"]`).value.trim()
        const network = list.querySelector(`[data-addr-network="${wid}"]`).value.trim()
        const address = list.querySelector(`[data-addr-address="${wid}"]`).value.trim()
        if (!symbol || !network || !address) { alert('Llena símbolo + red + dirección'); return }
        try {
          await _api('crypto_address_add', { wallet_id: wid, symbol, network, address })
          renderList()
        } catch (e) { alert('⚠ ' + e.message) }
      }))
    } catch (e) {
      list.innerHTML = `<div style="color:#f87171;font-size:12px;padding:14px;">⚠ ${e.message}</div>`
    }
  }

  modal.querySelector('#wn-add').addEventListener('click', async () => {
    const name = modal.querySelector('#wn-name').value.trim()
    const kind = modal.querySelector('#wn-kind').value
    const provider = modal.querySelector('#wn-provider').value.trim()
    if (!name) { alert('Nombre requerido'); return }
    try {
      await _api('crypto_wallet_add', { name, kind, provider: provider || null })
      modal.querySelector('#wn-name').value = ''
      modal.querySelector('#wn-provider').value = ''
      renderList()
    } catch (e) { alert('⚠ ' + e.message) }
  })

  renderList()
}

// ── Feed estilo Google Feeds ───────────────────────────────────
function _renderNewsInto(items) {
  const list = document.getElementById('crypto-news-list')
  if (!list) return
  if (!items.length) {
    list.innerHTML = '<div style="padding:14px;color:#6b7280;font-size:12px;text-align:center;">Sin noticias relevantes en este momento.</div>'
    return
  }
  // Asigna id estable por URL — soporta tanto items crudos como traducidos
  const withIds = items.map(n => ({
    ...n,
    _id: n.id || _hashUrl(n.url || n.title || n.title_en || ''),
    _displayTitle: n.title_es || n.title || n.title_en || '(sin título)',
    _displaySummary: n.summary_es || n.description || n.desc_en || '',
    _isTranslated: !!n.translated,
  }))
  const readIds = _getReadIds()
  const unreadCount = withIds.filter(n => !readIds.has(n._id)).length

  // Renderiza header con contador + "marcar todas leídas"
  const headerEl = document.getElementById('crypto-news-header-actions')
  if (headerEl) {
    headerEl.innerHTML = `
      <span style="font-size:11px;color:#22d3ee;font-weight:700;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.3);padding:2px 8px;border-radius:10px;">${unreadCount} sin leer</span>
      ${unreadCount > 0 ? `<button id="news-mark-all-read" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px;font-weight:600;">✓ Marcar todas como leídas</button>` : ''}
    `
    document.getElementById('news-mark-all-read')?.addEventListener('click', () => {
      _markAllRead(withIds.map(n => n._id))
      _renderNewsInto(items)
    })
  }

  list.style.padding = '0'
  list.style.textAlign = 'left'
  list.innerHTML = withIds.map(n => {
    const isRead = readIds.has(n._id)
    const date = n.published_at ? new Date(n.published_at) : null
    const ago = date ? _timeAgo(date) : ''
    return `
      <div data-news-id="${n._id}" class="news-card" style="border-top:1px solid rgba(255,255,255,0.04);transition:background 0.15s;${isRead ? 'opacity:0.5;' : ''}">
        <div data-news-toggle="${n._id}" style="display:flex;align-items:start;gap:12px;padding:14px 16px;cursor:pointer;">
          <div style="width:6px;height:6px;border-radius:50%;background:${isRead ? 'transparent' : '#22d3ee'};margin-top:6px;flex-shrink:0;${!isRead ? 'box-shadow:0 0 6px #22d3ee;' : ''}"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:${isRead ? '500' : '700'};color:${isRead ? '#94a3b8' : '#e5e7eb'};line-height:1.4;margin-bottom:4px;">${_esc(n._displayTitle)}</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#6b7280;flex-wrap:wrap;">
              <span style="background:rgba(167,139,250,0.15);color:#a78bfa;padding:1px 7px;border-radius:4px;font-weight:600;">${_esc(n.source)}</span>
              ${n._isTranslated ? `<span style="background:rgba(34,211,238,0.12);color:#22d3ee;padding:1px 6px;border-radius:3px;font-weight:600;">🇲🇽 ES</span>` : ''}
              <span>${ago}</span>
            </div>
          </div>
          <button data-news-expand="${n._id}" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;padding:4px;font-size:14px;flex-shrink:0;">▾</button>
        </div>
        <div data-news-body="${n._id}" style="display:none;padding:0 16px 14px 34px;">
          ${n._displaySummary ? `<p style="font-size:12px;color:#cbd5e1;line-height:1.6;margin:0 0 10px;">${_esc(n._displaySummary.slice(0,500))}</p>` : ''}
          ${n._isTranslated && n.title_en ? `<p style="font-size:11px;color:#6b7280;font-style:italic;margin:0 0 8px;">Original: "${_esc(n.title_en.slice(0,200))}"</p>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="${_esc(n.url)}" target="_blank" rel="noopener" data-news-read="${n._id}" style="padding:6px 12px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;border-radius:6px;font-size:12px;text-decoration:none;font-weight:600;">↗ Leer artículo completo</a>
            <button data-news-mark="${n._id}" style="padding:6px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#94a3b8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">${isRead ? '↻ Marcar no leído' : '✓ Marcar como leído'}</button>
          </div>
        </div>
      </div>
    `
  }).join('')

  // Handlers de expand/colapsar
  list.querySelectorAll('[data-news-toggle]').forEach(el => {
    el.addEventListener('click', (e) => {
      // Evita conflicto con clicks sobre botones internos
      if (e.target.closest('[data-news-expand]') || e.target.closest('a') || e.target.closest('button')) return
      const id = el.dataset.newsToggle
      const body = list.querySelector(`[data-news-body="${id}"]`)
      const exp = list.querySelector(`[data-news-expand="${id}"]`)
      if (body) {
        const isOpen = body.style.display === 'block'
        body.style.display = isOpen ? 'none' : 'block'
        if (exp) exp.textContent = isOpen ? '▾' : '▴'
      }
    })
  })
  // Click en "Leer artículo" → marca como leído
  list.querySelectorAll('[data-news-read]').forEach(a => {
    a.addEventListener('click', () => {
      _markRead(a.dataset.newsRead)
      setTimeout(() => _renderNewsInto(items), 600)
    })
  })
  // Botón mark/unmark
  list.querySelectorAll('[data-news-mark]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.newsMark
      const cur = _getReadIds()
      if (cur.has(id)) {
        cur.delete(id)
        try { localStorage.setItem(READ_FEED_KEY, JSON.stringify([...cur])) } catch {}
      } else {
        _markRead(id)
      }
      _renderNewsInto(items)
    })
  })
}

function _timeAgo(date) {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days} d`
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function _openTxModal(existingTx) {
  const isEdit = !!existingTx
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:520px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;`

  const today = new Date().toISOString().split('T')[0]
  const v = existingTx || {}

  const sel = (val, options) => options.map(o => `<option value="${o[0]}" ${val === o[0] ? 'selected':''}>${o[1]}</option>`).join('')
  // Catálogo agrupado por categoría
  const cryptos = [
    // Blue chips
    ['BTC','BTC · Bitcoin'],['ETH','ETH · Ethereum'],['XRP','XRP · Ripple'],
    ['BNB','BNB · BNB'],['SOL','SOL · Solana'],['ADA','ADA · Cardano'],
    ['DOGE','DOGE · Dogecoin'],['AVAX','AVAX · Avalanche'],['TRX','TRX · Tron'],
    ['DOT','DOT · Polkadot'],['LINK','LINK · Chainlink'],['LTC','LTC · Litecoin'],
    ['MATIC','MATIC · Polygon'],['ATOM','ATOM · Cosmos'],['XLM','XLM · Stellar'],
    ['XMR','XMR · Monero'],['BCH','BCH · Bitcoin Cash'],['ETC','ETC · Ethereum Classic'],
    // Stables
    ['USDT','USDT · Tether'],['USDC','USDC · USD Coin'],['DAI','DAI · Dai'],
    // L1 / L2 / DeFi
    ['NEAR','NEAR · NEAR Protocol'],['APT','APT · Aptos'],['SUI','SUI · Sui'],
    ['ARB','ARB · Arbitrum'],['OP','OP · Optimism'],['INJ','INJ · Injective'],
    ['TIA','TIA · Celestia'],['HBAR','HBAR · Hedera'],['ICP','ICP · Internet Computer'],
    ['FIL','FIL · Filecoin'],['AAVE','AAVE · Aave'],['UNI','UNI · Uniswap'],
    ['MKR','MKR · Maker'],['LDO','LDO · Lido'],['RUNE','RUNE · THORChain'],
    // Memecoins (lo que pediste)
    ['SHIB','SHIB · Shiba Inu 🐕'],['PEPE','PEPE · Pepe 🐸'],
    ['FLOKI','FLOKI · Floki 🐺'],['BONK','BONK · Bonk 🐶'],['WIF','WIF · dogwifhat 🐕'],
    // Gaming/NFT
    ['IMX','IMX · Immutable'],['RNDR','RNDR · Render'],
    ['FET','FET · Fetch.ai'],['GRT','GRT · The Graph'],
    // Otros
    ['XTZ','XTZ · Tezos'],['ALGO','ALGO · Algorand'],
  ]

  modal.innerHTML = `
    <h3 style="margin:0 0 14px;font-size:17px;font-weight:800;">${isEdit ? '✏️ Editar transacción cripto' : '+ Nueva transacción cripto'}</h3>
    <div id="tx-price-helper" style="display:none;background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.3);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#22d3ee;"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Tipo</label>
        <select id="tx-type" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;">
          ${sel(v.type || 'buy', [['buy','🟢 Compra'],['sell','🔴 Venta'],['transfer_in','⬇ Transfer in'],['transfer_out','⬆ Transfer out']])}
        </select>
      </div>
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Símbolo</label>
        <select id="tx-symbol" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;">${sel(v.symbol || 'BTC', cryptos)}</select>
      </div>
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Cantidad</label>
        <input id="tx-qty" type="number" step="any" value="${v.quantity || ''}" placeholder="0.01" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Fecha</label>
        <input id="tx-date" type="date" value="${v.date || today}" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Precio MXN <span style="color:#22d3ee;text-transform:none;font-weight:500;">(auto ↔)</span></label>
        <input id="tx-price-mxn" type="number" step="any" value="${v.price_mxn || ''}" placeholder="1200000" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Precio USD <span style="color:#22d3ee;text-transform:none;font-weight:500;">(auto ↔)</span></label>
        <input id="tx-price-usd" type="number" step="any" value="${v.price_usd || ''}" placeholder="60000" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Exchange</label>
        <select id="tx-exchange" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;">
          ${sel(v.exchange || '', [['','(ninguno)'],['Bitso','Bitso'],['Ledger','Ledger (hardware wallet)'],['Binance','Binance'],['Coinbase','Coinbase'],['Kraken','Kraken'],['Otro','Otro']])}
        </select>
      </div>
      <div>
        <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Comisión MXN</label>
        <input id="tx-fee" type="number" step="any" value="${v.fee_mxn || ''}" placeholder="0" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;"/>
      </div>
    </div>
    <div id="tx-total-display" style="margin-top:8px;padding:8px 12px;background:rgba(247,147,26,0.08);border:1px solid rgba(247,147,26,0.25);border-radius:6px;font-size:13px;color:#fb923c;text-align:center;display:none;"></div>
    <div style="margin-top:10px;">
      <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">¿Por qué? (motivo de la operación)</label>
      <textarea id="tx-reasoning" rows="2" placeholder="Ej: BTC bajó 8% en una semana, acumulo a precio bajo..." style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:13px;resize:vertical;">${_esc(v.reasoning || '')}</textarea>
    </div>
    <div style="margin-top:10px;">
      <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Notas (opcional)</label>
      <input id="tx-notes" type="text" value="${_esc(v.notes || '')}" placeholder="Tx hash, recibo, etc." style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:13px;"/>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button id="tx-cancel" style="flex:1;padding:11px;background:transparent;border:1px solid #374151;color:#94a3b8;border-radius:10px;cursor:pointer;font-size:14px;">Cancelar</button>
      <button id="tx-save" style="flex:2;padding:11px;background:linear-gradient(135deg,#f7931a,#fb923c);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:14px;">${isEdit ? '💾 Actualizar' : '+ Registrar transacción'}</button>
    </div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => document.body.removeChild(overlay)

  // ── AUTO-CONVERSIÓN MXN ↔ USD ─────────────────────────────────
  const symbolSel = modal.querySelector('#tx-symbol')
  const mxnInput = modal.querySelector('#tx-price-mxn')
  const usdInput = modal.querySelector('#tx-price-usd')
  const qtyInput = modal.querySelector('#tx-qty')
  const helper = modal.querySelector('#tx-price-helper')
  const totalDisplay = modal.querySelector('#tx-total-display')

  const updateHelper = () => {
    const sym = symbolSel.value
    const p = _currentPrices[sym]
    if (p) {
      helper.style.display = 'block'
      helper.innerHTML = `💡 Precio actual de mercado ${sym}: <strong>${_fmt(p.mxn)} MXN</strong> · ${_fmt(p.usd, 'USD')} USD · <button id="tx-use-market" style="background:rgba(34,211,238,0.2);border:1px solid rgba(34,211,238,0.4);color:#22d3ee;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;font-weight:700;margin-left:6px;">Usar precio actual</button>`
      modal.querySelector('#tx-use-market')?.addEventListener('click', () => {
        mxnInput.value = p.mxn.toFixed(2)
        usdInput.value = p.usd.toFixed(2)
        updateTotal()
      })
    } else {
      helper.style.display = 'none'
    }
  }

  const updateTotal = () => {
    const q = Number(qtyInput.value)
    const pm = Number(mxnInput.value)
    const pu = Number(usdInput.value)
    if (q > 0 && pm > 0) {
      const totalMxn = q * pm
      const totalUsd = pu > 0 ? q * pu : null
      totalDisplay.style.display = 'block'
      totalDisplay.innerHTML = `Total: <strong>${_fmt(totalMxn)}</strong>${totalUsd ? ` · <strong>${_fmt(totalUsd, 'USD')} USD</strong>` : ''}`
    } else {
      totalDisplay.style.display = 'none'
    }
  }

  let lastEditedField = null
  mxnInput.addEventListener('input', () => {
    lastEditedField = 'mxn'
    const sym = symbolSel.value
    const p = _currentPrices[sym]
    if (p && p.rate && Number(mxnInput.value) > 0 && document.activeElement === mxnInput) {
      usdInput.value = (Number(mxnInput.value) / p.rate).toFixed(2)
    }
    updateTotal()
  })
  usdInput.addEventListener('input', () => {
    lastEditedField = 'usd'
    const sym = symbolSel.value
    const p = _currentPrices[sym]
    if (p && p.rate && Number(usdInput.value) > 0 && document.activeElement === usdInput) {
      mxnInput.value = (Number(usdInput.value) * p.rate).toFixed(2)
    }
    updateTotal()
  })
  qtyInput.addEventListener('input', updateTotal)
  symbolSel.addEventListener('change', () => { updateHelper(); updateTotal() })
  updateHelper(); updateTotal()

  modal.querySelector('#tx-cancel').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  modal.querySelector('#tx-save').addEventListener('click', async () => {
    const get = id => modal.querySelector('#' + id).value.trim()
    const payload = {
      type: get('tx-type'),
      symbol: get('tx-symbol'),
      quantity: get('tx-qty'),
      price_mxn: get('tx-price-mxn') || null,
      price_usd: get('tx-price-usd') || null,
      fee_mxn: get('tx-fee') || null,
      exchange: get('tx-exchange') || null,
      reasoning: get('tx-reasoning') || null,
      notes: get('tx-notes') || null,
      date: get('tx-date'),
    }
    if (!payload.quantity || Number(payload.quantity) <= 0) { alert('Cantidad requerida'); return }
    try {
      if (isEdit) {
        await _api('crypto_update_tx', { tx_id: existingTx.id, ...payload })
      } else {
        await _api('crypto_add_tx', payload)
        if (payload.reasoning && (payload.type === 'buy' || payload.type === 'transfer_in')) {
          try { await _api('journal_add', { symbol: payload.symbol, thesis: payload.reasoning }) } catch {}
        }
      }
      cleanup()
      renderCrypto()
    } catch (e) { alert('⚠ ' + e.message) }
  })
}

function _openJournalModal(entries, holdingSymbols) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:600px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;`

  const symbols = [...new Set([...(holdingSymbols||[]), 'BTC','ETH','XRP','TRX','USDT','SOL'])]

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h3 style="margin:0;font-size:17px;font-weight:800;">📓 Crypto Journal</h3>
      <button id="j-close" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:0 0 16px;line-height:1.5;">Registra el <b>por qué</b> de cada decisión. Meses después auditas si la tesis se cumplió.</p>

    <!-- Form nuevo -->
    <div style="background:rgba(167,139,250,0.05);border:1px solid rgba(167,139,250,0.2);border-radius:10px;padding:12px;margin-bottom:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <select id="j-symbol" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          ${symbols.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <input id="j-target-usd" type="number" step="any" placeholder="🎯 Precio objetivo USD" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <textarea id="j-thesis" rows="3" placeholder="Mi tesis: ej. ETH se beneficia de upgrade Pectra, lo veo en $5K antes de fin de año." style="width:100%;padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;resize:vertical;margin-bottom:8px;"></textarea>
      <button id="j-add" style="padding:8px 14px;background:linear-gradient(135deg,#a78bfa,#7c3aed);border:none;color:#fff;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">+ Agregar tesis</button>
    </div>

    <!-- Lista existente -->
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">Tesis registradas (${entries.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${entries.length ? entries.map(e => {
        const isReviewed = !!e.outcome
        return `
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
              <span style="background:${_coinColor(e.symbol)};color:${e.symbol==='XRP'?'#fff':'#000'};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${e.symbol}</span>
              ${e.target_price_usd ? `<span style="font-size:11px;color:#94a3b8;">🎯 $${e.target_price_usd} USD</span>` : ''}
              <span style="font-size:10px;color:#6b7280;margin-left:auto;">${new Date(e.created_at).toLocaleDateString('es-MX')}</span>
              ${isReviewed ? '<span style="font-size:10px;color:#22c55e;font-weight:700;">✓ Revisada</span>' : ''}
            </div>
            <div style="font-size:13px;color:#e5e7eb;line-height:1.5;">${_esc(e.thesis)}</div>
            ${isReviewed ? `
              <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);font-size:12px;color:#94a3b8;">
                <b>Outcome:</b> ${_esc(e.outcome)} ${e.rating ? '· ' + '⭐'.repeat(e.rating) : ''}
              </div>
            ` : ''}
          </div>
        `
      }).join('') : '<div style="color:#6b7280;font-size:12px;padding:12px;text-align:center;">Sin tesis aún. Agrega tu primera.</div>'}
    </div>
  `
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => document.body.removeChild(overlay)
  modal.querySelector('#j-close').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })
  modal.querySelector('#j-add').addEventListener('click', async () => {
    const symbol = modal.querySelector('#j-symbol').value
    const thesis = modal.querySelector('#j-thesis').value.trim()
    const target = modal.querySelector('#j-target-usd').value || null
    if (!thesis) { alert('Escribe tu tesis'); return }
    try {
      await _api('journal_add', { symbol, thesis, target_price_usd: target })
      cleanup()
      renderCrypto()
    } catch (e) { alert('⚠ ' + e.message) }
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 BITSO → COLD WALLET · flujo guiado en 1 paso (S6)
// ═══════════════════════════════════════════════════════════════════════════════
// Registra una transferencia de Bitso al Cold Wallet en un solo formulario:
//   - Cantidad cripto (ej. 100 XRP)
//   - Precio en MXN (auto desde TC actual si está disponible)
//   - Wallet destino (selector entre tus wallets cold)
//   - Comprobante (URL del tronscan / xrpl explorer / etc.)
//
// Al guardar crea 2 movimientos en una sola operación:
//   1) SALIDA en cuenta primaria (Bitso) con monto MXN + comprobante
//   2) INCREMENTA el manual_balance_mxn del wallet cold elegido
//
// Esto evita que el usuario tenga que:
//   - Ir a Movimientos a registrar la salida
//   - Volver a Cripto a editar el saldo del wallet cold
//   - Pegar el comprobante por separado

async function _openBitsoToColdModal() {
  let wallets
  try {
    const w = await _api('crypto_wallets_list')
    wallets = (w.wallets || []).filter(x => x.is_active !== false)
  } catch (e) {
    alert('No pude cargar wallets: ' + e.message)
    return
  }
  const coldWallets = wallets.filter(w => w.kind === 'cold' || w.kind === 'paper')
  if (!coldWallets.length) {
    if (!confirm('No tienes wallets etiquetados como "cold" o "paper". ¿Crear uno ahora?')) return
    return _openWalletsModal()
  }

  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;'
  overlay.innerHTML = `
    <div style="background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:24px;max-width:520px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h3 style="margin:0;font-size:18px;font-weight:800;display:flex;align-items:center;gap:8px;">🔄 Bitso → Cold Wallet</h3>
        <button id="b2c-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;">✕</button>
      </div>
      <p style="margin:0 0 16px;font-size:12px;color:#94a3b8;line-height:1.55;">
        Registras la transferencia en una sola operación: se crea movimiento de salida en tu cuenta primaria + se actualiza el saldo del wallet cold.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:4px;">🪙 Moneda</label>
          <select id="b2c-symbol" class="modal-input">
            <option value="XRP">XRP</option><option value="USDT">USDT</option>
            <option value="BTC">BTC</option><option value="ETH">ETH</option>
            <option value="TRX">TRX</option><option value="SOL">SOL</option>
            <option value="DOGE">DOGE</option><option value="LTC">LTC</option>
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:4px;">Cantidad cripto</label>
            <input type="number" step="any" id="b2c-amount" class="modal-input" placeholder="100" />
          </div>
          <div>
            <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:4px;">Total MXN equivalente</label>
            <input type="number" step="any" id="b2c-mxn" class="modal-input" placeholder="2500" />
          </div>
        </div>

        <div>
          <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:4px;">📥 Wallet destino (cold)</label>
          <select id="b2c-wallet" class="modal-input">
            ${coldWallets.map(w => `<option value="${w.id}">${_esc(w.name)} (${w.kind})</option>`).join('')}
          </select>
        </div>

        <div>
          <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:4px;">📎 Comprobante (tronscan / xrpscan / etc.)</label>
          <input type="url" id="b2c-evidence" class="modal-input" placeholder="https://tronscan.org/#/transaction/..." />
        </div>

        <div>
          <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:4px;">📅 Fecha</label>
          <input type="date" id="b2c-date" class="modal-input" value="${new Date().toISOString().slice(0,10)}" />
        </div>

        <div>
          <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:4px;">📝 Nota (opcional)</label>
          <input type="text" id="b2c-notes" class="modal-input" placeholder="Compra mensual respaldo" />
        </div>
      </div>

      <div id="b2c-status" style="margin-top:14px;font-size:12px;color:#94a3b8;min-height:18px;"></div>

      <div style="display:flex;gap:10px;margin-top:8px;">
        <button id="b2c-cancel" style="flex:1;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:10px;cursor:pointer;">Cancelar</button>
        <button id="b2c-save" style="flex:2;padding:11px;background:linear-gradient(135deg,#34d399,#10b981);border:none;color:#000;font-weight:800;border-radius:10px;cursor:pointer;">🔄 Registrar transferencia</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  const cleanup = () => document.body.removeChild(overlay)
  overlay.querySelector('#b2c-close').addEventListener('click', cleanup)
  overlay.querySelector('#b2c-cancel').addEventListener('click', cleanup)

  overlay.querySelector('#b2c-save').addEventListener('click', async () => {
    const symbol = overlay.querySelector('#b2c-symbol').value
    const amount = parseFloat(overlay.querySelector('#b2c-amount').value)
    const mxn = parseFloat(overlay.querySelector('#b2c-mxn').value)
    const walletId = overlay.querySelector('#b2c-wallet').value
    const evidence = overlay.querySelector('#b2c-evidence').value.trim()
    const fecha = overlay.querySelector('#b2c-date').value
    const notas = overlay.querySelector('#b2c-notes').value.trim()
    const statusEl = overlay.querySelector('#b2c-status')

    if (!amount || amount <= 0) { statusEl.textContent = '⚠ Cantidad cripto requerida'; return }
    if (!mxn || mxn <= 0) { statusEl.textContent = '⚠ Total MXN requerido'; return }
    if (!walletId) { statusEl.textContent = '⚠ Selecciona wallet destino'; return }

    statusEl.style.color = '#fbbf24'
    statusEl.textContent = '⏳ Registrando movimiento de salida en cuenta primaria...'

    try {
      // 1) Obtener cuenta primaria del balance-engine
      const primaryOrqId = await window.nexusBalance?.primary?.()
      let movId = null
      if (primaryOrqId) {
        const { supabase } = await import('./supabase.js')
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const payload = {
            owner_id: user.id, orquestador_id: primaryOrqId,
            tipo: 'salida', fecha,
            ordenante: 'Bitso',
            beneficiario: `Cold wallet · ${symbol}`,
            cantidad: amount, moneda: symbol,
            tc: mxn / amount,
            monto_mxn: mxn,
            estado: 'hecho',
            categoria: 'Cripto/Sagrado',
            proyecto: 'cripto:cold',
            notas: notas || `Bitso → Cold · ${amount} ${symbol}`,
            comprobante_url: evidence || null,
            comprobantes: evidence ? [{ type: 'url', url: evidence, label: 'Comprobante on-chain' }] : [],
          }
          const { data, error } = await supabase.from('movimientos').insert(payload).select().single()
          if (error) throw new Error('Movimiento: ' + error.message)
          movId = data?.id
          window.nexusBalance?.invalidate?.(primaryOrqId)
        }
      }

      statusEl.textContent = '⏳ Actualizando saldo del wallet cold...'

      // 2) Sumar el MXN al wallet cold (manual_balance_mxn)
      const target = wallets.find(w => w.id === walletId)
      const currentBal = Number(target?.manual_balance_mxn || 0)
      const newBal = Math.round((currentBal + mxn) * 100) / 100
      await _api('crypto_wallet_update', { id: walletId, manual_balance_mxn: newBal })
      window.nexusBalance?.invalidate?.()

      statusEl.style.color = '#34d399'
      statusEl.textContent = `✓ Listo. Movimiento ${movId ? '#' + String(movId).slice(0, 8) : 'creado'} · Cold +$${mxn.toLocaleString('es-MX')}`
      setTimeout(() => { cleanup(); renderCrypto() }, 1200)
    } catch (e) {
      statusEl.style.color = '#f87171'
      statusEl.textContent = '⚠ ' + e.message
    }
  })
}

if (typeof window !== 'undefined') {
  window.nexusCrypto = { render: renderCrypto, openBitsoToCold: _openBitsoToColdModal }
}
