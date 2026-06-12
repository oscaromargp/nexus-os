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
  BTC: '#f7931a', ETH: '#627eea', XRP: '#000000', USDT: '#26a17b',
  TRX: '#ff0027', USDC: '#2775ca', SOL: '#14f195', ADA: '#0033ad',
  DOGE: '#c2a633', BNB: '#f3ba2f', AVAX: '#e84142', MATIC: '#8247e5',
  DOT: '#e6007a', LINK: '#2a5ada', LTC: '#bfbbbb',
}
function _coinColor(sym) {
  return COIN_COLORS[sym] || '#94a3b8'
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

  // News en background — no bloquea render
  const heldSymbols = data.items.map(i => i.symbol)
  if (heldSymbols.length) {
    _api('crypto_news', { symbols: heldSymbols, limit: 10 })
      .then(j => { _renderNewsInto(j.items || []) })
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

      <!-- NEWS PANEL -->
      ${items.length ? `
      <div id="crypto-news-panel" style="margin-top:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;display:flex;align-items:center;justify-content:space-between;">
          <span>📡 Noticias de tus criptos</span>
          <span style="font-size:10px;color:#6b7280;text-transform:none;letter-spacing:0;">CoinDesk · CoinTelegraph · Decrypt · The Defiant</span>
        </div>
        <div id="crypto-news-list" style="padding:12px;color:#6b7280;font-size:12px;text-align:center;">⏳ Cargando noticias…</div>
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
      if (!confirm('¿Eliminar transacción?')) return
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
}

function _renderNewsInto(items) {
  const list = document.getElementById('crypto-news-list')
  if (!list) return
  if (!items.length) {
    list.innerHTML = '<div style="padding:14px;color:#6b7280;font-size:12px;text-align:center;">Sin noticias relevantes en este momento.</div>'
    return
  }
  list.style.padding = '0'
  list.style.textAlign = 'left'
  list.innerHTML = items.map(n => {
    const date = n.published_at ? new Date(n.published_at).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}) : ''
    return `
      <a href="${_esc(n.url)}" target="_blank" rel="noopener" style="display:block;padding:12px 16px;border-top:1px solid rgba(255,255,255,0.04);text-decoration:none;color:inherit;">
        <div style="font-size:13px;font-weight:700;color:#e5e7eb;margin-bottom:3px;line-height:1.4;">${_esc(n.title)}</div>
        ${n.description ? `<div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-bottom:4px;">${_esc(n.description.slice(0,160))}…</div>` : ''}
        <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:#6b7280;">
          <span style="background:rgba(167,139,250,0.15);color:#a78bfa;padding:1px 6px;border-radius:4px;font-weight:600;">${_esc(n.source)}</span>
          <span>${date}</span>
        </div>
      </a>
    `
  }).join('')
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
  const cryptos = [['BTC','BTC · Bitcoin'],['ETH','ETH · Ethereum'],['XRP','XRP · Ripple'],['TRX','TRX · Tron'],['USDT','USDT · Tether'],['USDC','USDC · USD Coin'],['SOL','SOL · Solana'],['ADA','ADA · Cardano'],['DOGE','DOGE · Dogecoin'],['BNB','BNB · BNB'],['AVAX','AVAX · Avalanche'],['MATIC','MATIC · Polygon'],['DOT','DOT · Polkadot'],['LINK','LINK · Chainlink'],['LTC','LTC · Litecoin']]

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

if (typeof window !== 'undefined') {
  window.nexusCrypto = { render: renderCrypto }
}
