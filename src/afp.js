// Nexus OS — Módulo AFP v2 (Arquitecto Financiero Personal)
//
// Vista única con:
// - Speedometer de salud + 3 cards
// - Recomendación principal
// - Estrategia seleccionable con dispersión sugerida
// - Metas con plan + cálculo de trabajo extra
// - Lista de pagos próximos
// - Botón PDF (jsPDF)
// - Panel de configuración (cuentas / gastos fijos / metas / estrategia)

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

function _fmt(n) { return '$' + Math.round(n).toLocaleString('es-MX') }
function _esc(s) { return String(s||'').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])) }

const STRATEGIES = [
  { id: '50_30_20',     name: '50/30/20 clásica', desc: '50% necesidades, 20% ahorro, 30% lifestyle. Recomendada para empezar.' },
  { id: '70_20_10',     name: '70/20/10 conservadora', desc: '70% necesidades, 20% ahorro, 10% lifestyle. Si tienes deuda alta.' },
  { id: 'profit_first', name: 'Profit First Personal', desc: '55% necesidades, 25% ahorro, 15% lifestyle, 5% profit. Mentalidad emprendedora.' },
  { id: 'aggressive',   name: 'Ahorro agresivo 60/30/10', desc: '60% necesidades, 30% ahorro, 10% lifestyle. Para metas grandes.' },
  { id: 'custom',       name: 'Personalizada', desc: 'Tú defines los porcentajes.' },
]

function _speedometer(score, color) {
  const cx = 140, cy = 130, r = 110
  const angle = -Math.PI + (score / 100) * Math.PI
  const nx = cx + r * 0.85 * Math.cos(angle)
  const ny = cy + r * 0.85 * Math.sin(angle)
  const arc = (start, end, col) => {
    const sx = cx + r * Math.cos(start), sy = cy + r * Math.sin(start)
    const ex = cx + r * Math.cos(end),   ey = cy + r * Math.sin(end)
    const large = end - start > Math.PI ? 1 : 0
    return `<path d="M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}" stroke="${col}" stroke-width="18" fill="none" stroke-linecap="round"/>`
  }
  return `
    <svg viewBox="0 0 280 160" style="width:100%;max-width:340px;">
      ${arc(-Math.PI, -Math.PI * 0.001, 'rgba(255,255,255,0.06)')}
      ${arc(-Math.PI, -Math.PI + (score / 100) * Math.PI, color)}
      <circle cx="${cx}" cy="${cy}" r="6" fill="${color}"/>
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
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

function _hexRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return '255,255,255'
  return parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16)
}

let _lastData = null

export async function renderAFP() {
  const root = document.getElementById('afp-root')
  if (!root) return
  root.innerHTML = `<div style="padding:24px;color:#94a3b8;">⏳ Calculando tu salud financiera…</div>`

  let data
  try { data = await _api('afp_diagnose') }
  catch (e) { root.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${e.message}</div>`; return }
  _lastData = data

  const { score, health, metrics: m, score_breakdown: sb, strategy, goals, recommendations, upcoming_bills, accounts_all, manual_fixed_expenses } = data
  const topRec = recommendations[0] || {}
  const dispersionEntries = Object.entries(strategy.dispersion).filter(([k,v]) => v > 0)

  let html = `
    <div style="padding:20px;max-width:1100px;margin:0 auto;">

      <!-- HEADER -->
      <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:24px;font-weight:800;margin:0 0 6px;display:flex;align-items:center;gap:10px;">📐 AFP <span style="font-size:13px;color:#94a3b8;font-weight:500;">— Arquitecto Financiero Personal</span></h2>
          <p style="color:#94a3b8;font-size:13px;margin:0;">Diagnóstico teórico — las dispersiones aquí no afectan tus cuentas reales.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="afp-pdf-btn" style="padding:9px 14px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">📄 Exportar plan PDF</button>
          <button id="afp-config-btn" style="padding:9px 14px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">⚙️ Mi configuración</button>
        </div>
      </div>

      <!-- SCORE + METRICS -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div style="background:linear-gradient(135deg,rgba(${_hexRgb(health.color)},0.04),rgba(${_hexRgb(health.color)},0.12));border:1px solid ${health.color}44;border-radius:14px;padding:16px;text-align:center;">
          <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Salud financiera</div>
          ${_speedometer(score, health.color)}
          <div style="font-size:18px;font-weight:800;color:${health.color};margin-top:-10px;">${health.label}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${_metricCard('💧', 'Liquidez', m.liquidity_months + ' meses', `${sb.liquidez}/40 pts · ${_fmt(m.total_liquido)} disponible`, '#22d3ee')}
          ${_metricCard('🌱', 'Ahorro', m.savings_rate_pct + '%', `${sb.ahorro}/30 pts · Margen mensual ${_fmt(m.monthly_savings_capacity)}`, '#34d399')}
          ${_metricCard('🔻', 'Compromisos', m.commitment_ratio_pct + '%', `${sb.deuda}/30 pts · Fijos ${_fmt(m.monthly_committed)}/mes`, '#fb923c')}
        </div>
      </div>

      ${topRec.title ? `
        <div style="background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.3);border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:14px;background:${topRec.priority==='alta'?'#ef4444':topRec.priority==='media'?'#fbbf24':'#94a3b8'}33;color:${topRec.priority==='alta'?'#fca5a5':topRec.priority==='media'?'#fde68a':'#cbd5e1'};padding:2px 10px;border-radius:6px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${topRec.priority}</span>
            <strong style="color:#e5e7eb;font-size:16px;">💡 ${_esc(topRec.title)}</strong>
          </div>
          <p style="margin:6px 0 0;color:#cbd5e1;font-size:13px;line-height:1.6;">${_esc(topRec.detail)}</p>
        </div>
      ` : ''}

      <!-- ESTRATEGIA + DISPERSIÓN -->
      <div style="background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.25);border-radius:14px;padding:18px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Estrategia: ${_esc(strategy.name)}</div>
            <div style="font-size:18px;font-weight:800;color:#e5e7eb;margin-top:2px;">Si recibes ${_fmt(strategy.next_income)} → distribuye así:</div>
          </div>
        </div>

        ${strategy.adjustment_note ? `<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#fde68a;">${_esc(strategy.adjustment_note)}</div>` : ''}

        <div style="display:grid;grid-template-columns:repeat(${dispersionEntries.length},1fr);gap:10px;">
          ${dispersionEntries.map(([key, val]) => {
            const conf = {
              necesidades: { icon: '🏠', label: 'Necesidades', col: '#fca5a5', sub: 'Renta · comida · servicios · transporte' },
              ahorro:      { icon: '🌱', label: 'Ahorro',      col: '#86efac', sub: 'Fondo emergencia · inversión · metas' },
              lifestyle:   { icon: '✨', label: 'Lifestyle',   col: '#c4b5fd', sub: 'Restaurantes · entretenimiento' },
              profit:      { icon: '💎', label: 'Profit',      col: '#fbbf24', sub: 'Margen / utilidad intocable' },
            }[key] || { icon: '•', label: key, col: '#94a3b8', sub: '' }
            const pct = strategy.percentages[key] || 0
            return `
              <div style="background:rgba(${_hexRgb(conf.col)},0.06);border:1px solid rgba(${_hexRgb(conf.col)},0.25);border-radius:10px;padding:14px;">
                <div style="font-size:11px;color:${conf.col};font-weight:700;text-transform:uppercase;">${conf.icon} ${conf.label}</div>
                <div style="font-size:24px;font-weight:800;color:${conf.col};margin-top:4px;">${_fmt(val)}</div>
                <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${pct}% · ${conf.sub}</div>
              </div>
            `
          }).join('')}
        </div>
      </div>

      <!-- METAS -->
      ${goals.length ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">🎯 Mis metas (${goals.length})</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${goals.map(g => `
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;${g.achievable?'border-left:3px solid #22c55e;':'border-left:3px solid #f87171;'}">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                <strong style="color:#e5e7eb;font-size:14px;">${_esc(g.name)}</strong>
                <span style="color:${g.achievable?'#22c55e':'#f87171'};font-size:12px;font-weight:700;">${g.achievable?'✓ Alcanzable':'⚠ Necesitas más ingreso'}</span>
              </div>
              <div style="display:flex;align-items:center;gap:14px;margin-top:8px;flex-wrap:wrap;font-size:12px;color:#94a3b8;">
                <span>🎯 Meta: <strong style="color:#e5e7eb;">${_fmt(g.target_amount)}</strong></span>
                ${g.current_amount > 0 ? `<span>📊 Llevas: <strong style="color:#34d399;">${_fmt(g.current_amount)}</strong> (${g.progress_pct}%)</span>` : ''}
                <span>📅 ${g.months_left} meses restantes</span>
                <span>💰 Necesitas: <strong style="color:${g.achievable?'#22c55e':'#f87171'};">${_fmt(g.monthly_needed)}/mes</strong></span>
              </div>
              ${!g.achievable && g.extra_job ? `
                <div style="margin-top:10px;padding:10px;background:rgba(251,113,133,0.06);border:1px solid rgba(251,113,133,0.2);border-radius:8px;font-size:12px;color:#cbd5e1;">
                  <div style="font-weight:700;color:#fda4af;margin-bottom:6px;">Te faltan ${_fmt(g.gap_monthly)}/mes. Opciones de trabajo extra:</div>
                  ${g.extra_job.options.map(o => `
                    <div>• Si trabajas <strong>${o.hours_per_week}h/sem</strong>, cobra ≥ <strong style="color:#fda4af;">${_fmt(o.hourly_rate)}/hora</strong></div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- PAGOS PRÓXIMOS + PATRIMONIO -->
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
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Patrimonio total estimado</div>
          <div style="font-size:32px;font-weight:800;color:#22d3ee;margin-top:6px;">${_fmt(m.patrimonio_total)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">${_fmt(m.total_liquido)} líquido${m.total_cripto_cost > 0 ? ` + ${_fmt(m.total_cripto_cost)} cripto` : ''}</div>
        </div>
      </div>

      <div style="margin-top:16px;text-align:center;font-size:11px;color:#6b7280;">
        Última actualización: ${new Date(data.last_updated).toLocaleString('es-MX')} · Recalcula al recargar
      </div>
    </div>
  `

  root.innerHTML = html
  document.getElementById('afp-pdf-btn')?.addEventListener('click', () => _exportPDF(data))
  document.getElementById('afp-config-btn')?.addEventListener('click', () => _openConfigModal(data))
}

// ── PDF EXPORT con jsPDF ──────────────────────────────────────
async function _exportPDF(d) {
  // Lazy-load jsPDF (ya está en el bundle vendor-pdf)
  let jsPDF
  try {
    const mod = await import('jspdf')
    jsPDF = mod.jsPDF || mod.default
  } catch (e) {
    alert('No pude cargar jsPDF: ' + e.message)
    return
  }
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  let y = 50
  const M = 48

  // Header
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(20, 20, 30)
  doc.text('Plan Financiero Personal', M, y); y += 8
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(100,100,110)
  doc.text(`Generado por Nexus OS · ${new Date().toLocaleDateString('es-MX',{dateStyle:'long'})}`, M, y + 14); y += 30

  // Score
  doc.setDrawColor(220, 220, 230); doc.setLineWidth(0.5)
  doc.line(M, y, W - M, y); y += 16
  doc.setFontSize(13); doc.setTextColor(50,50,60); doc.setFont('helvetica','bold')
  doc.text(`Score: ${d.score}/100 — ${d.health.label}`, M, y); y += 18
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,90)
  const intro = `Este plan se basa en tus movimientos financieros, cuentas activas y metas declaradas en AFP. Los porcentajes y dispersiones son sugerencias teóricas — no se aplican automáticamente. Úsalas como guía para decidir cómo dirigir tu próximo ingreso.`
  const introLines = doc.splitTextToSize(intro, W - M*2); doc.text(introLines, M, y); y += introLines.length * 13 + 10

  // Métricas resumen
  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
  doc.text('Tu situación actual', M, y); y += 16
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
  const lines = [
    `• Ingreso mensual promedio: $${d.metrics.monthly_income.toLocaleString('es-MX')}`,
    `• Gasto mensual promedio: $${d.metrics.monthly_expense.toLocaleString('es-MX')}`,
    `• Compromisos fijos al mes: $${d.metrics.monthly_committed.toLocaleString('es-MX')} (${d.metrics.commitment_ratio_pct}% de tu ingreso)`,
    `• Capacidad de ahorro: $${d.metrics.monthly_savings_capacity.toLocaleString('es-MX')}/mes`,
    `• Liquidez: ${d.metrics.liquidity_months} meses cubiertos por tu efectivo actual`,
    `• Patrimonio total estimado: $${d.metrics.patrimonio_total.toLocaleString('es-MX')}`,
  ]
  for (const l of lines) { doc.text(l, M, y); y += 14 }
  y += 6

  // Estrategia
  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
  doc.text(`Estrategia: ${d.strategy.name}`, M, y); y += 16
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(70,70,80)
  const stratIntro = `Cuando recibas tu próximo ingreso de $${d.strategy.next_income.toLocaleString('es-MX')}, distribúyelo de esta manera:`
  doc.text(doc.splitTextToSize(stratIntro, W-M*2), M, y); y += 18

  for (const [key, val] of Object.entries(d.strategy.dispersion)) {
    if (val <= 0) continue
    const pct = d.strategy.percentages[key] || 0
    const labels = {
      necesidades: 'Necesidades (renta, comida, servicios, transporte)',
      ahorro: 'Ahorro (emergencia, inversión, metas)',
      lifestyle: 'Lifestyle (restaurantes, antojos, entretenimiento)',
      profit: 'Profit (utilidad intocable)',
    }
    doc.setFont('helvetica','bold'); doc.text(`• $${val.toLocaleString('es-MX')} (${pct}%)`, M, y)
    doc.setFont('helvetica','normal'); doc.text(` → ${labels[key] || key}`, M + 100, y)
    y += 14
  }
  y += 10

  // Metas
  if (d.goals.length) {
    if (y > 700) { doc.addPage(); y = 50 }
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
    doc.text('Tus metas', M, y); y += 16
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
    for (const g of d.goals) {
      if (y > 720) { doc.addPage(); y = 50 }
      doc.setFont('helvetica','bold'); doc.text(`• ${g.name}`, M, y); y += 14
      doc.setFont('helvetica','normal')
      doc.text(`  Meta: $${g.target_amount.toLocaleString('es-MX')} en ${g.months_left} meses`, M, y); y += 13
      doc.text(`  Necesitas: $${g.monthly_needed.toLocaleString('es-MX')}/mes · Tu capacidad actual: $${g.monthly_capacity.toLocaleString('es-MX')}/mes`, M, y); y += 13
      if (g.achievable) {
        doc.setTextColor(34,139,34); doc.text(`  ✓ Alcanzable con tu ingreso actual.`, M, y); doc.setTextColor(70,70,80); y += 14
      } else {
        doc.setTextColor(180,30,30); doc.text(`  ⚠ Te faltan $${g.gap_monthly.toLocaleString('es-MX')}/mes. Opciones de trabajo extra:`, M, y); doc.setTextColor(70,70,80); y += 14
        for (const o of g.extra_job.options) {
          doc.text(`    – Si trabajas ${o.hours_per_week} h/sem, cobra mínimo $${o.hourly_rate.toLocaleString('es-MX')}/hora`, M, y); y += 13
        }
      }
      y += 6
    }
  }

  // Recomendaciones
  if (d.recommendations.length) {
    if (y > 700) { doc.addPage(); y = 50 }
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
    doc.text('Recomendaciones', M, y); y += 16
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
    for (const r of d.recommendations) {
      if (y > 730) { doc.addPage(); y = 50 }
      doc.setFont('helvetica','bold'); doc.text(`• ${r.title} (${r.priority})`, M, y); y += 13
      doc.setFont('helvetica','normal')
      const ll = doc.splitTextToSize('  ' + r.detail, W - M*2)
      doc.text(ll, M, y); y += ll.length * 13 + 4
    }
  }

  // Footer
  doc.setFontSize(8); doc.setTextColor(150,150,160)
  doc.text(`Nexus OS · Plan teórico — no aplica cambios automáticos a tus cuentas. · ${new Date().toISOString().split('T')[0]}`, M, 760)

  doc.save(`plan-afp-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ── CONFIG MODAL ──────────────────────────────────────────────
function _openConfigModal(data) {
  const cfg = data.config || {}
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:22px;max-width:680px;width:100%;color:#e5e7eb;max-height:92vh;overflow-y:auto;`

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
      <h3 style="margin:0;font-size:18px;font-weight:800;">⚙️ Configuración AFP</h3>
      <button id="cfg-close" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>

    <!-- CUENTAS INCLUIDAS -->
    <div style="background:rgba(255,255,255,0.02);border:1px solid #1f2937;border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-size:12px;color:#22d3ee;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">🏦 Cuentas incluidas en el diagnóstico</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">Marca solo las cuentas que SON TUYAS (no las de referencia o ajenas). Si no marcas ninguna, se incluyen todas.</div>
      <div id="cfg-accounts-list" style="display:flex;flex-direction:column;gap:6px;">
        ${data.accounts_all.map(a => `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:6px;cursor:pointer;font-size:13px;">
            <input type="checkbox" data-acc="${_esc(a.name)}" ${a.included?'checked':''} style="accent-color:#22d3ee;"/>
            <span style="flex:1;color:#e5e7eb;">${_esc(a.name)}</span>
            <span style="color:#94a3b8;">${_fmt(a.balance)}</span>
          </label>
        `).join('') || '<div style="color:#6b7280;font-size:12px;">Sin cuentas configuradas en Nexus.</div>'}
      </div>
    </div>

    <!-- GASTOS FIJOS MANUALES -->
    <div style="background:rgba(255,255,255,0.02);border:1px solid #1f2937;border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-size:12px;color:#fb923c;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">🏠 Gastos fijos manuales</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">Renta, pensión, suscripciones, pagos recurrentes que NO están en Agenda Financiera. Solo AFP los toma en cuenta.</div>
      <div id="cfg-expenses-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        ${(cfg.fixed_expenses||[]).map((e,i) => `
          <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.02);padding:6px 10px;border-radius:6px;font-size:13px;">
            <span style="flex:1;color:#e5e7eb;">${_esc(e.name)}</span>
            <span style="color:#fb923c;font-weight:700;">${_fmt(e.amount)}/${e.frequency==='monthly'?'mes':e.frequency==='yearly'?'año':e.frequency}</span>
            <button data-rm-exp="${i}" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;">×</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <input id="exp-name" type="text" placeholder="Ej: Renta casa" style="flex:1;min-width:120px;padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input id="exp-amount" type="number" placeholder="Monto" style="width:100px;padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <select id="exp-freq" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          <option value="monthly">/mes</option>
          <option value="biweekly">/quincena</option>
          <option value="weekly">/semana</option>
          <option value="quarterly">/trimestre</option>
          <option value="yearly">/año</option>
        </select>
        <button id="exp-add" style="padding:8px 14px;background:rgba(251,146,60,0.15);border:1px solid rgba(251,146,60,0.4);color:#fb923c;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Agregar</button>
      </div>
    </div>

    <!-- METAS -->
    <div style="background:rgba(255,255,255,0.02);border:1px solid #1f2937;border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-size:12px;color:#34d399;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">🎯 Mis metas</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">"Ahorrar $40,000 en 4 meses" — AFP te calcula cuánto mensual y si necesitas trabajo extra a qué tarifa.</div>
      <div id="cfg-goals-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        ${(cfg.goals||[]).map((g,i) => `
          <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:6px;font-size:13px;">
            <span style="flex:1;color:#e5e7eb;">${_esc(g.name)}</span>
            <span style="color:#34d399;">${_fmt(g.target_amount)}</span>
            <span style="color:#94a3b8;font-size:11px;">→ ${_esc(g.deadline||'sin fecha')}</span>
            <button data-rm-goal="${i}" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;">×</button>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <input id="goal-name" type="text" placeholder="Ej: Fondo vacaciones" style="flex:1;min-width:140px;padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input id="goal-target" type="number" placeholder="Meta $" style="width:110px;padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input id="goal-deadline" type="date" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <button id="goal-add" style="padding:8px 14px;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.4);color:#34d399;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Agregar</button>
      </div>
    </div>

    <!-- ESTRATEGIA -->
    <div style="background:rgba(255,255,255,0.02);border:1px solid #1f2937;border-radius:10px;padding:14px;margin-bottom:14px;">
      <div style="font-size:12px;color:#a78bfa;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">📊 Estrategia preferida</div>
      <select id="cfg-strategy" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;margin-bottom:8px;">
        ${STRATEGIES.map(s => `<option value="${s.id}" ${cfg.strategy === s.id ? 'selected':''}>${s.name}</option>`).join('')}
      </select>
      <div id="cfg-strategy-desc" style="font-size:11px;color:#94a3b8;line-height:1.5;"></div>
    </div>

    <div style="display:flex;gap:8px;margin-top:18px;">
      <button id="cfg-cancel" style="flex:1;padding:11px;background:transparent;border:1px solid #374151;color:#94a3b8;border-radius:10px;cursor:pointer;font-size:14px;">Cancelar</button>
      <button id="cfg-save" style="flex:2;padding:11px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:14px;">💾 Guardar configuración</button>
    </div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => document.body.removeChild(overlay)

  // Strategy description
  const updateStratDesc = () => {
    const s = STRATEGIES.find(x => x.id === modal.querySelector('#cfg-strategy').value)
    modal.querySelector('#cfg-strategy-desc').textContent = s?.desc || ''
  }
  modal.querySelector('#cfg-strategy').addEventListener('change', updateStratDesc)
  updateStratDesc()

  // Working state
  let workingExpenses = [...(cfg.fixed_expenses || [])]
  let workingGoals = [...(cfg.goals || [])]

  const rerender = () => {
    modal.querySelector('#cfg-expenses-list').innerHTML = workingExpenses.map((e,i) => `
      <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.02);padding:6px 10px;border-radius:6px;font-size:13px;">
        <span style="flex:1;color:#e5e7eb;">${_esc(e.name)}</span>
        <span style="color:#fb923c;font-weight:700;">${_fmt(e.amount)}/${e.frequency==='monthly'?'mes':e.frequency==='yearly'?'año':e.frequency}</span>
        <button data-rm-exp="${i}" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;">×</button>
      </div>
    `).join('')
    modal.querySelector('#cfg-goals-list').innerHTML = workingGoals.map((g,i) => `
      <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.02);padding:8px 10px;border-radius:6px;font-size:13px;">
        <span style="flex:1;color:#e5e7eb;">${_esc(g.name)}</span>
        <span style="color:#34d399;">${_fmt(g.target_amount)}</span>
        <span style="color:#94a3b8;font-size:11px;">→ ${_esc(g.deadline||'sin fecha')}</span>
        <button data-rm-goal="${i}" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 6px;">×</button>
      </div>
    `).join('')
    // Re-bind
    modal.querySelectorAll('[data-rm-exp]').forEach(b => b.addEventListener('click', () => { workingExpenses.splice(Number(b.dataset.rmExp), 1); rerender() }))
    modal.querySelectorAll('[data-rm-goal]').forEach(b => b.addEventListener('click', () => { workingGoals.splice(Number(b.dataset.rmGoal), 1); rerender() }))
  }
  rerender()

  modal.querySelector('#exp-add').addEventListener('click', () => {
    const name = modal.querySelector('#exp-name').value.trim()
    const amount = Number(modal.querySelector('#exp-amount').value)
    const frequency = modal.querySelector('#exp-freq').value
    if (!name || !amount) { alert('Pon nombre y monto'); return }
    workingExpenses.push({ name, amount, frequency })
    modal.querySelector('#exp-name').value = ''
    modal.querySelector('#exp-amount').value = ''
    rerender()
  })

  modal.querySelector('#goal-add').addEventListener('click', () => {
    const name = modal.querySelector('#goal-name').value.trim()
    const target_amount = Number(modal.querySelector('#goal-target').value)
    const deadline = modal.querySelector('#goal-deadline').value
    if (!name || !target_amount) { alert('Pon nombre y meta'); return }
    workingGoals.push({ id: 'g_' + Date.now(), name, target_amount, deadline, current_amount: 0 })
    modal.querySelector('#goal-name').value = ''
    modal.querySelector('#goal-target').value = ''
    modal.querySelector('#goal-deadline').value = ''
    rerender()
  })

  modal.querySelector('#cfg-close').addEventListener('click', cleanup)
  modal.querySelector('#cfg-cancel').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  modal.querySelector('#cfg-save').addEventListener('click', async () => {
    const checked = Array.from(modal.querySelectorAll('#cfg-accounts-list input[type=checkbox]:checked')).map(c => c.dataset.acc)
    const allCount = modal.querySelectorAll('#cfg-accounts-list input[type=checkbox]').length
    const includedAccounts = (checked.length === allCount || checked.length === 0) ? null : checked
    const config = {
      included_accounts: includedAccounts,
      fixed_expenses: workingExpenses,
      goals: workingGoals,
      strategy: modal.querySelector('#cfg-strategy').value,
    }
    try {
      await _api('afp_save_config', { config })
      cleanup()
      renderAFP()
    } catch (e) { alert('⚠ ' + e.message) }
  })
}

if (typeof window !== 'undefined') {
  window.nexusAFP = { render: renderAFP }
}
