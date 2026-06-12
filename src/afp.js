// Nexus OS — Módulo AFP (Arquitecto Financiero Personal)
//
// Diagnóstico determinístico de salud financiera con:
// - Speedometer 0-100
// - 3 cards: Liquidez, Deuda, Ahorro
// - Recomendación principal
// - Dispersión sugerida del próximo ingreso
// - Recordatorios de pagos próximos
//
// Consume datos existentes (nodes income/expense/bill/account).
// NO requiere data nueva.

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

function _fmt(n) {
  return '$' + (Math.round(n)).toLocaleString('es-MX')
}
function _esc(s) { return String(s||'').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])) }

// SVG speedometer
function _speedometer(score, color) {
  // Arc de 180° (semicírculo) coloreado según score
  const radius = 110
  const cx = 140
  const cy = 130
  // Punto del arco según score (0 = izquierda, 100 = derecha)
  const angle = -Math.PI + (score / 100) * Math.PI
  const needleX = cx + radius * 0.85 * Math.cos(angle)
  const needleY = cy + radius * 0.85 * Math.sin(angle)
  // Path del arco completo
  const arc = (start, end, col) => {
    const sx = cx + radius * Math.cos(start)
    const sy = cy + radius * Math.sin(start)
    const ex = cx + radius * Math.cos(end)
    const ey = cy + radius * Math.sin(end)
    const large = end - start > Math.PI ? 1 : 0
    return `<path d="M ${sx} ${sy} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey}" stroke="${col}" stroke-width="18" fill="none" stroke-linecap="round"/>`
  }
  return `
    <svg viewBox="0 0 280 160" style="width:100%;max-width:340px;">
      <!-- Background arc -->
      ${arc(-Math.PI, -Math.PI * 0.001, 'rgba(255,255,255,0.06)')}
      <!-- Filled arc -->
      ${arc(-Math.PI, -Math.PI + (score / 100) * Math.PI, color)}
      <!-- Tick marks -->
      ${[0,25,50,75,100].map(t => {
        const a = -Math.PI + (t / 100) * Math.PI
        const x1 = cx + (radius - 22) * Math.cos(a)
        const y1 = cy + (radius - 22) * Math.sin(a)
        const x2 = cx + (radius - 30) * Math.cos(a)
        const y2 = cy + (radius - 30) * Math.sin(a)
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>`
      }).join('')}
      <!-- Needle -->
      <circle cx="${cx}" cy="${cy}" r="6" fill="${color}"/>
      <line x1="${cx}" y1="${cy}" x2="${needleX}" y2="${needleY}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      <!-- Score text -->
      <text x="${cx}" y="${cy - 30}" text-anchor="middle" fill="${color}" style="font-size:54px;font-weight:800;font-family:inherit;">${score}</text>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="rgba(255,255,255,0.5)" style="font-size:12px;font-family:inherit;">/ 100</text>
    </svg>
  `
}

function _metricCard(icon, label, value, sublabel, color) {
  return `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-left:3px solid ${color};border-radius:12px;padding:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:18px;">${icon}</span>
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${label}</div>
      </div>
      <div style="font-size:22px;font-weight:800;color:${color};">${value}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px;">${sublabel}</div>
    </div>
  `
}

export async function renderAFP() {
  const root = document.getElementById('afp-root')
  if (!root) return
  root.innerHTML = `<div style="padding:24px;color:#94a3b8;">⏳ Calculando tu salud financiera…</div>`

  let data
  try {
    data = await _api('afp_diagnose')
  } catch (e) {
    root.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${e.message}</div>`
    return
  }

  const { score, health, metrics: m, score_breakdown: sb, strategy, recommendations, upcoming_bills, accounts_summary } = data
  const topRec = recommendations[0] || {}

  let html = `
    <div style="padding:20px;max-width:1100px;margin:0 auto;">

      <!-- ── HEADER ── -->
      <div style="margin-bottom:24px;">
        <h2 style="font-size:24px;font-weight:800;margin:0 0 6px;display:flex;align-items:center;gap:10px;">📐 AFP <span style="font-size:13px;color:#94a3b8;font-weight:500;">— Arquitecto Financiero Personal</span></h2>
        <p style="color:#94a3b8;font-size:13px;margin:0;">Diagnóstico determinístico basado en tus movimientos de los últimos 90 días.</p>
      </div>

      <!-- ── SCORE PANEL ── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div style="background:linear-gradient(135deg,rgba(${_hexRgb(health.color)},0.04),rgba(${_hexRgb(health.color)},0.12));border:1px solid ${health.color}44;border-radius:14px;padding:16px;text-align:center;">
          <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Salud financiera</div>
          ${_speedometer(score, health.color)}
          <div style="font-size:18px;font-weight:800;color:${health.color};margin-top:-10px;">${health.label}</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          ${_metricCard('💧', 'Liquidez', m.liquidity_months + ' meses', `${sb.liquidez}/40 pts · $${m.total_liquido.toLocaleString('es-MX')} disponible`, '#22d3ee')}
          ${_metricCard('🌱', 'Ahorro', m.savings_rate_pct + '%', `${sb.ahorro}/30 pts · Margen mensual ${_fmt(m.monthly_income - m.monthly_expense)}`, '#34d399')}
          ${_metricCard('🔻', 'Compromisos', m.commitment_ratio_pct + '%', `${sb.deuda}/30 pts · Pagos fijos ${_fmt(m.monthly_committed)}/mes`, '#fb923c')}
        </div>
      </div>

      <!-- ── RECOMENDACIÓN PRINCIPAL ── -->
      ${topRec.title ? `
        <div style="background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.3);border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:14px;background:${topRec.priority==='alta'?'#ef4444':topRec.priority==='media'?'#fbbf24':'#94a3b8'}33;color:${topRec.priority==='alta'?'#fca5a5':topRec.priority==='media'?'#fde68a':'#cbd5e1'};padding:2px 10px;border-radius:6px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${topRec.priority}</span>
            <strong style="color:#e5e7eb;font-size:16px;">💡 ${_esc(topRec.title)}</strong>
          </div>
          <p style="margin:6px 0 0;color:#cbd5e1;font-size:13px;line-height:1.6;">${_esc(topRec.detail)}</p>
        </div>
      ` : ''}

      <!-- ── DISPERSIÓN SUGERIDA ── -->
      <div style="background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.25);border-radius:14px;padding:18px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Estrategia ${_esc(strategy.name)}</div>
            <div style="font-size:18px;font-weight:800;color:#e5e7eb;margin-top:2px;">Si recibes ${_fmt(strategy.next_income)} →</div>
          </div>
          <button id="afp-apply-btn" style="padding:9px 16px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:13px;">✓ Aplicar dispersión</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
          <div style="background:rgba(252,165,165,0.06);border:1px solid rgba(252,165,165,0.25);border-radius:10px;padding:14px;">
            <div style="font-size:11px;color:#fca5a5;font-weight:700;text-transform:uppercase;">🏠 Necesidades</div>
            <div style="font-size:24px;font-weight:800;color:#fca5a5;margin-top:4px;">${_fmt(strategy.dispersion.necesidades)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${strategy.percentages.necesidades}% · Renta, comida, servicios, transporte</div>
          </div>
          <div style="background:rgba(134,239,172,0.06);border:1px solid rgba(134,239,172,0.25);border-radius:10px;padding:14px;">
            <div style="font-size:11px;color:#86efac;font-weight:700;text-transform:uppercase;">🌱 Ahorro</div>
            <div style="font-size:24px;font-weight:800;color:#86efac;margin-top:4px;">${_fmt(strategy.dispersion.ahorro)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${strategy.percentages.ahorro}% · Fondo emergencia, inversión, metas</div>
          </div>
          <div style="background:rgba(196,181,253,0.06);border:1px solid rgba(196,181,253,0.25);border-radius:10px;padding:14px;">
            <div style="font-size:11px;color:#c4b5fd;font-weight:700;text-transform:uppercase;">✨ Lifestyle</div>
            <div style="font-size:24px;font-weight:800;color:#c4b5fd;margin-top:4px;">${_fmt(strategy.dispersion.lifestyle)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${strategy.percentages.lifestyle}% · Restaurantes, entretenimiento, antojos</div>
          </div>
        </div>
      </div>

      <!-- ── 2 columnas: PAGOS PRÓXIMOS + CUENTAS ── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;">
          <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:10px;">📅 Pagos próximos (30d)</div>
          ${upcoming_bills.length ? upcoming_bills.map(b => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;">
              <span style="color:#e5e7eb;">${_esc(b.name)}</span>
              <span style="color:#fb923c;font-weight:700;">${_fmt(b.amount)} · ${_esc(b.due)}</span>
            </div>
          `).join('') : '<div style="color:#6b7280;font-size:12px;padding:8px 0;">Sin pagos próximos.</div>'}
        </div>

        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;">
          <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:10px;">🏦 Cuentas (saldos iniciales)</div>
          ${accounts_summary.length ? accounts_summary.map(a => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;">
              <span style="color:#e5e7eb;">${_esc(a.name)}</span>
              <span style="color:#22d3ee;font-weight:700;">${_fmt(a.balance)}</span>
            </div>
          `).join('') : '<div style="color:#6b7280;font-size:12px;padding:8px 0;">No hay cuentas configuradas.</div>'}
        </div>
      </div>

      <!-- ── PATRIMONIO TOTAL ── -->
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px;text-align:center;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Patrimonio total estimado</div>
        <div style="font-size:32px;font-weight:800;color:#22d3ee;margin-top:6px;">${_fmt(m.patrimonio_total)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${_fmt(m.total_liquido)} líquido${m.total_cripto_cost > 0 ? ` + ${_fmt(m.total_cripto_cost)} cripto` : ''}</div>
      </div>

      <!-- ── DETALLE DE RECOMENDACIONES ── -->
      ${recommendations.length > 1 ? `
        <div style="margin-top:20px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">Otras recomendaciones</div>
          ${recommendations.slice(1).map(r => `
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-left:3px solid ${r.priority==='alta'?'#ef4444':r.priority==='media'?'#fbbf24':'#94a3b8'};border-radius:10px;padding:12px;margin-bottom:8px;">
              <div style="font-weight:700;color:#e5e7eb;font-size:13px;">${_esc(r.title)}</div>
              <div style="color:#94a3b8;font-size:12px;margin-top:3px;line-height:1.5;">${_esc(r.detail)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="margin-top:16px;text-align:center;font-size:11px;color:#6b7280;">
        Última actualización: ${new Date(data.last_updated).toLocaleString('es-MX')} · Recalcula al recargar
      </div>
    </div>
  `

  root.innerHTML = html

  document.getElementById('afp-apply-btn')?.addEventListener('click', async () => {
    if (!confirm(`¿Aplicar dispersión sugerida?\n\n• ${_fmt(strategy.dispersion.necesidades)} necesidades\n• ${_fmt(strategy.dispersion.ahorro)} ahorro\n• ${_fmt(strategy.dispersion.lifestyle)} lifestyle\n\nSe crearán entradas en Nexus para tracking.`)) return
    try {
      const r = await _api('afp_apply_dispersion', { dispersion: strategy.dispersion })
      alert('✅ Dispersión aplicada — ' + r.created + ' entradas creadas en tu Feed Central.')
      window.location?.reload?.()
    } catch (e) {
      alert('⚠ Error: ' + e.message)
    }
  })
}

function _hexRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return '255,255,255'
  return parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16)
}

if (typeof window !== 'undefined') {
  window.nexusAFP = { render: renderAFP }
}
