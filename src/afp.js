// Nexus OS — Módulo AFP v3 (Arquitecto Financiero Personal)
//
// MÓDULO INDEPENDIENTE: usa sus propias tablas (afp_incomes,
// afp_fixed_expenses, afp_debts, afp_monthly_plans, afp_goals).
// NO lee data de otros módulos. El usuario declara TODO.
//
// Vista principal:
// - Speedometer + 3 cards (Ahorro, Deuda, Equilibrio)
// - Recomendación principal
// - Plan del mes con TODO desglosado
// - Estrategia + dispersión sugerida (teórica)
// - Metas con plan
// - Botón PDF
//
// Modal de configuración con 5 secciones:
// 💵 Ingresos · 🏠 Gastos fijos · 💳 Deudas · 📅 Plan del mes · 🎯 Metas

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
function _hexRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return '255,255,255'
  return parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16)
}

const FREQ_LABEL = {
  weekly: 'semanal', biweekly: 'quincenal', monthly: 'mensual',
  bimonthly: 'bimestral', quarterly: 'trimestral', yearly: 'anual', one_time: 'única',
}
const CATEGORIES_FIXED = ['Vivienda','Familia','Alimento','Salud','Transporte','Servicios','Educación','Suscripciones','Otro']
const CATEGORIES_INCOME = ['Salario','Freelance','Renta inmueble','Inversiones','Otro']
const CATEGORIES_PLAN = ['Familia','Salud','Educación','Tecnología','Ropa','Entretenimiento','Hogar','Regalo','Otro']

const STRATEGIES = [
  { id: '50_30_20',     name: '50/30/20 clásica', desc: '50% necesidades, 20% ahorro, 30% lifestyle.' },
  { id: '70_20_10',     name: '70/20/10 conservadora', desc: '70% necesidades, 20% ahorro, 10% lifestyle.' },
  { id: 'profit_first', name: 'Profit First Personal', desc: '55% necesidades, 25% ahorro, 15% lifestyle, 5% profit.' },
  { id: 'aggressive',   name: 'Ahorro agresivo 60/30/10', desc: '60% necesidades, 30% ahorro, 10% lifestyle.' },
  { id: 'custom',       name: 'Personalizada', desc: 'Tú defines los porcentajes.' },
]

function _speedometer(score, color) {
  const cx = 140, cy = 130, r = 110
  const angle = -Math.PI + (Math.max(0,Math.min(100,score)) / 100) * Math.PI
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
      ${arc(-Math.PI, -Math.PI + (Math.max(0,Math.min(100,score)) / 100) * Math.PI, color)}
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

let _lastData = null

export async function renderAFP() {
  const root = document.getElementById('afp-root')
  if (!root) return
  root.innerHTML = `<div style="padding:24px;color:#94a3b8;">⏳ Analizando tu plan financiero…</div>`

  let data
  try { data = await _api('afp_diagnose') }
  catch (e) { root.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${e.message}</div>`; return }
  _lastData = data

  // Estado vacío
  if (!data.has_data) {
    root.innerHTML = `
      <div style="padding:20px;max-width:800px;margin:0 auto;text-align:center;">
        <div style="margin-top:40px;">
          <div style="font-size:64px;margin-bottom:16px;">📐</div>
          <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;">AFP — Tu cerebro financiero</h2>
          <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;max-width:560px;margin-left:auto;margin-right:auto;line-height:1.6;">
            Este módulo es 100% independiente. Aquí declaras lo que ganas, lo que pagas y lo que planeas. El sistema te dice cómo distribuir tu dinero. Los datos NO afectan otros módulos.
          </p>
          <button id="afp-config-btn" style="padding:12px 28px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:14px;">⚙️ Empieza configurando tus datos</button>
        </div>
        <div style="margin-top:48px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;text-align:left;">
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">
            <div style="font-size:20px;">💵</div>
            <div style="font-size:13px;font-weight:700;color:#e5e7eb;margin-top:6px;">Declara tus ingresos</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Sueldo, freelance, rentas, lo que sea.</div>
          </div>
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">
            <div style="font-size:20px;">🏠</div>
            <div style="font-size:13px;font-weight:700;color:#e5e7eb;margin-top:6px;">Tus gastos fijos</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Renta, pensión, despensa, gasolina…</div>
          </div>
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">
            <div style="font-size:20px;">💳</div>
            <div style="font-size:13px;font-weight:700;color:#e5e7eb;margin-top:6px;">Tus deudas</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Tarjetas, préstamos. AFP te dice cuál pagar primero.</div>
          </div>
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">
            <div style="font-size:20px;">📅</div>
            <div style="font-size:13px;font-weight:700;color:#e5e7eb;margin-top:6px;">Plan del mes</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Gastos puntuales solo de este mes.</div>
          </div>
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;">
            <div style="font-size:20px;">🎯</div>
            <div style="font-size:13px;font-weight:700;color:#e5e7eb;margin-top:6px;">Tus metas</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">"Juntar $40K en 4 meses" — calcula el plan.</div>
          </div>
        </div>
      </div>
    `
    document.getElementById('afp-config-btn')?.addEventListener('click', () => _openConfigModal())
    return
  }

  const { score, health, metrics: m, score_breakdown: sb, strategy, goals, recommendations, incomes, fixed_expenses, monthly_plan, debts, debt_strategies, month } = data
  const topRec = recommendations[0] || {}
  const monthLabel = new Date(month + '-01').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  const dispersionEntries = Object.entries(strategy.dispersion).filter(([k,v]) => v > 0)

  let html = `
    <div style="padding:20px;max-width:1100px;margin:0 auto;">

      <!-- HEADER -->
      <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:24px;font-weight:800;margin:0 0 6px;display:flex;align-items:center;gap:10px;">📐 AFP <span style="font-size:13px;color:#94a3b8;font-weight:500;">— Plan ${monthLabel}</span></h2>
          <p style="color:#94a3b8;font-size:13px;margin:0;">Módulo 100% teórico — basado en lo que TÚ declaras. No mezcla con otros módulos.</p>
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
          ${_metricCard('🌱', 'Ahorro mensual', m.savings_rate_pct + '%', `${sb.ahorro}/40 pts · Margen libre ${_fmt(m.monthly_disposable)}/mes`, '#34d399')}
          ${_metricCard('💳', 'Deuda', m.debt_to_income_pct + '%', `${sb.deuda}/30 pts · Saldo total ${_fmt(m.total_debt_balance)}`, '#f87171')}
          ${_metricCard('⚖️', 'Equilibrio', (100 - m.commitment_ratio_pct).toFixed(0) + '%', `${sb.equilibrio}/30 pts · Comprometido ${m.commitment_ratio_pct.toFixed(0)}%`, '#fb923c')}
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

      <!-- PLAN DEL MES — RESUMEN -->
      <div style="background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.25);border-radius:14px;padding:18px;margin-bottom:20px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:14px;">Plan de ${monthLabel}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
          <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:12px;">
            <div style="font-size:11px;color:#86efac;font-weight:700;text-transform:uppercase;">💵 Ingresos</div>
            <div style="font-size:22px;font-weight:800;color:#86efac;margin-top:4px;">${_fmt(m.monthly_income)}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${incomes.length} fuente${incomes.length===1?'':'s'}</div>
          </div>
          <div style="background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.2);border-radius:8px;padding:12px;">
            <div style="font-size:11px;color:#fb923c;font-weight:700;text-transform:uppercase;">🏠 Fijos</div>
            <div style="font-size:22px;font-weight:800;color:#fb923c;margin-top:4px;">${_fmt(m.monthly_fixed)}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${fixed_expenses.length} concepto${fixed_expenses.length===1?'':'s'}</div>
          </div>
          ${m.monthly_plan > 0 ? `
          <div style="background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.2);border-radius:8px;padding:12px;">
            <div style="font-size:11px;color:#a78bfa;font-weight:700;text-transform:uppercase;">📅 Plan mes</div>
            <div style="font-size:22px;font-weight:800;color:#a78bfa;margin-top:4px;">${_fmt(m.monthly_plan)}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${monthly_plan.length} item${monthly_plan.length===1?'':'s'}</div>
          </div>
          ` : ''}
          ${m.monthly_min_debt > 0 ? `
          <div style="background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);border-radius:8px;padding:12px;">
            <div style="font-size:11px;color:#f87171;font-weight:700;text-transform:uppercase;">💳 Mínimos deuda</div>
            <div style="font-size:22px;font-weight:800;color:#f87171;margin-top:4px;">${_fmt(m.monthly_min_debt)}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${debts.length} deuda${debts.length===1?'':'s'}</div>
          </div>
          ` : ''}
          <div style="background:rgba(${m.monthly_disposable>=0?'34,197,94':'239,68,68'},0.1);border:1px solid rgba(${m.monthly_disposable>=0?'34,197,94':'239,68,68'},0.35);border-radius:8px;padding:12px;">
            <div style="font-size:11px;color:${m.monthly_disposable>=0?'#22c55e':'#ef4444'};font-weight:700;text-transform:uppercase;">${m.monthly_disposable>=0?'✓ Libre':'⚠ Déficit'}</div>
            <div style="font-size:22px;font-weight:800;color:${m.monthly_disposable>=0?'#22c55e':'#ef4444'};margin-top:4px;">${_fmt(m.monthly_disposable)}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${m.monthly_disposable>=0?'para ahorro/metas':'NO te alcanza'}</div>
          </div>
        </div>
      </div>

      <!-- ESTRATEGIA + DISPERSIÓN -->
      ${m.monthly_disposable > 0 ? `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:20px;">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">Dispersión sugerida con tu margen libre · ${_esc(strategy.name)}</div>
        <p style="margin:0 0 14px;color:#94a3b8;font-size:12px;">Si tienes <strong style="color:#e5e7eb;">${_fmt(m.monthly_disposable)} libres</strong> al mes, distribúyelos así (teórico):</p>
        <div style="display:grid;grid-template-columns:repeat(${dispersionEntries.length},1fr);gap:10px;">
          ${dispersionEntries.map(([key, val]) => {
            const proportion = m.monthly_disposable > 0 ? Math.round(val * m.monthly_disposable / m.monthly_income) : 0
            const conf = {
              necesidades: { icon: '🏠', label: 'Refuerzo necesidades', col: '#fca5a5' },
              ahorro:      { icon: '🌱', label: 'Ahorro / metas',       col: '#86efac' },
              lifestyle:   { icon: '✨', label: 'Lifestyle',             col: '#c4b5fd' },
              profit:      { icon: '💎', label: 'Profit',                col: '#fbbf24' },
            }[key] || { icon: '•', label: key, col: '#94a3b8' }
            return `
              <div style="background:rgba(${_hexRgb(conf.col)},0.06);border:1px solid rgba(${_hexRgb(conf.col)},0.25);border-radius:10px;padding:12px;">
                <div style="font-size:11px;color:${conf.col};font-weight:700;text-transform:uppercase;">${conf.icon} ${conf.label}</div>
                <div style="font-size:22px;font-weight:800;color:${conf.col};margin-top:4px;">${_fmt(proportion)}</div>
                <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${strategy.percentages[key] || 0}% de tu ingreso</div>
              </div>
            `
          }).join('')}
        </div>
      </div>
      ` : ''}

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

      <!-- DEUDAS — ESTRATEGIA -->
      ${debts.length ? `
      <div style="background:rgba(248,113,113,0.04);border:1px solid rgba(248,113,113,0.2);border-radius:12px;padding:16px;margin-bottom:20px;">
        <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">💳 Tus deudas (${debts.length})</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
          ${debts.map(d => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;flex-wrap:wrap;gap:8px;">
              <div>
                <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_esc(d.name)}</div>
                <div style="font-size:11px;color:#94a3b8;">${d.kind==='credit_card'?'Tarjeta':d.kind==='loan'?'Préstamo':d.kind} · Tasa ${d.interest_rate}% anual${d.due_day?' · vence día '+d.due_day:''}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:14px;font-weight:800;color:#f87171;">${_fmt(d.balance)}</div>
                <div style="font-size:11px;color:#94a3b8;">Mín: ${_fmt(d.min_payment)}</div>
              </div>
            </div>
          `).join('')}
        </div>
        ${debt_strategies.avalanche.length > 1 ? `
        <div style="padding:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;font-size:12px;color:#cbd5e1;line-height:1.6;">
          <div style="font-weight:700;color:#e5e7eb;margin-bottom:6px;">📊 Orden recomendado de pago (estrategia Avalancha = ahorras más intereses):</div>
          ${debt_strategies.avalanche.map((d,i) => `<div>${i+1}. <strong>${_esc(d.name)}</strong> — ${d.interest_rate}% — ${_fmt(d.balance)}</div>`).join('')}
        </div>
        ` : ''}
      </div>
      ` : ''}
    </div>
  `

  root.innerHTML = html
  document.getElementById('afp-pdf-btn')?.addEventListener('click', () => _exportPDF(data))
  document.getElementById('afp-config-btn')?.addEventListener('click', () => _openConfigModal())
}

// ── PDF EXPORT ────────────────────────────────────────────────
async function _exportPDF(d) {
  let jsPDF
  try {
    const mod = await import('jspdf')
    jsPDF = mod.jsPDF || mod.default
  } catch (e) { alert('No pude cargar jsPDF: ' + e.message); return }
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  let y = 50
  const M = 48
  const monthLabel = new Date(d.month + '-01').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor(20,20,30)
  doc.text('Plan Financiero Personal', M, y); y += 8
  doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor(100,100,110)
  doc.text(monthLabel.toUpperCase(), M, y + 14); y += 30

  doc.setDrawColor(220,220,230); doc.line(M, y, W - M, y); y += 18

  doc.setFontSize(13); doc.setTextColor(50,50,60); doc.setFont('helvetica','bold')
  doc.text(`Score: ${d.score}/100 — ${d.health.label}`, M, y); y += 20

  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
  doc.text('Ingresos del mes', M, y); y += 14
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
  for (const i of d.incomes) {
    doc.text(`• ${i.name}: $${i.amount.toLocaleString('es-MX')} ${FREQ_LABEL[i.frequency] || i.frequency} (≈ $${Math.round(i.monthly).toLocaleString('es-MX')}/mes)`, M, y); y += 13
  }
  doc.setFont('helvetica','bold'); doc.text(`  TOTAL: $${d.metrics.monthly_income.toLocaleString('es-MX')}/mes`, M, y); y += 18

  if (d.fixed_expenses.length) {
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
    doc.text('Gastos fijos', M, y); y += 14
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
    for (const f of d.fixed_expenses) {
      if (y > 720) { doc.addPage(); y = 50 }
      const due = f.due_day ? ` (día ${f.due_day})` : ''
      doc.text(`• ${f.name}${due}: $${f.amount.toLocaleString('es-MX')} ${FREQ_LABEL[f.frequency] || f.frequency} (≈ $${Math.round(f.monthly).toLocaleString('es-MX')}/mes)`, M, y); y += 13
    }
    doc.setFont('helvetica','bold'); doc.text(`  TOTAL: $${d.metrics.monthly_fixed.toLocaleString('es-MX')}/mes`, M, y); y += 18
  }

  if (d.monthly_plan.length) {
    if (y > 700) { doc.addPage(); y = 50 }
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
    doc.text(`Plan puntual de ${monthLabel}`, M, y); y += 14
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
    for (const p of d.monthly_plan) {
      if (y > 720) { doc.addPage(); y = 50 }
      const date = p.planned_date ? ` (${p.planned_date})` : ''
      doc.text(`• ${p.name}${date}: $${p.amount.toLocaleString('es-MX')}`, M, y); y += 13
    }
    doc.setFont('helvetica','bold'); doc.text(`  TOTAL: $${d.metrics.monthly_plan.toLocaleString('es-MX')}`, M, y); y += 18
  }

  if (d.debts.length) {
    if (y > 680) { doc.addPage(); y = 50 }
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
    doc.text('Deudas — orden de pago sugerido (Avalancha)', M, y); y += 14
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
    let idx = 1
    for (const dbt of d.debt_strategies.avalanche) {
      if (y > 720) { doc.addPage(); y = 50 }
      doc.text(`${idx++}. ${dbt.name}: saldo $${dbt.balance.toLocaleString('es-MX')} · tasa ${dbt.interest_rate}% · mín $${dbt.min_payment.toLocaleString('es-MX')}/mes`, M, y); y += 13
    }
    y += 8
  }

  if (y > 600) { doc.addPage(); y = 50 }
  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
  doc.text('Resumen', M, y); y += 14
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
  doc.text(`• Ingresos mensuales: $${d.metrics.monthly_income.toLocaleString('es-MX')}`, M, y); y += 13
  doc.text(`• Compromisos fijos + plan + mínimos deuda: $${d.metrics.monthly_committed.toLocaleString('es-MX')}`, M, y); y += 13
  doc.setFont('helvetica','bold')
  doc.setTextColor(d.metrics.monthly_disposable >= 0 ? 34 : 200, d.metrics.monthly_disposable >= 0 ? 139 : 30, d.metrics.monthly_disposable >= 0 ? 34 : 30)
  doc.text(`• Margen libre: $${d.metrics.monthly_disposable.toLocaleString('es-MX')}/mes ${d.metrics.monthly_disposable >= 0 ? '✓' : '⚠ DÉFICIT'}`, M, y); y += 16
  doc.setTextColor(70,70,80); doc.setFont('helvetica','normal')

  if (d.metrics.monthly_disposable > 0 && d.strategy) {
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
    doc.text(`Dispersión sugerida del margen libre (${d.strategy.name})`, M, y); y += 14
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
    const dispLabels = { necesidades:'Refuerzo necesidades', ahorro:'Ahorro / metas', lifestyle:'Lifestyle', profit:'Profit' }
    for (const [k,v] of Object.entries(d.strategy.dispersion)) {
      if (v <= 0) continue
      const proportion = Math.round(v * d.metrics.monthly_disposable / d.metrics.monthly_income)
      doc.text(`• ${dispLabels[k] || k}: $${proportion.toLocaleString('es-MX')} (${d.strategy.percentages[k] || 0}% del ingreso)`, M, y); y += 13
    }
    y += 10
  }

  if (d.goals.length) {
    if (y > 680) { doc.addPage(); y = 50 }
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,30)
    doc.text('Metas', M, y); y += 14
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,80)
    for (const g of d.goals) {
      if (y > 720) { doc.addPage(); y = 50 }
      doc.setFont('helvetica','bold'); doc.text(`• ${g.name}`, M, y); y += 13
      doc.setFont('helvetica','normal')
      doc.text(`  $${g.target_amount.toLocaleString('es-MX')} en ${g.months_left} meses → necesitas $${g.monthly_needed.toLocaleString('es-MX')}/mes`, M, y); y += 13
      if (!g.achievable && g.extra_job) {
        doc.setTextColor(180,30,30); doc.text(`  ⚠ Te faltan $${g.gap_monthly.toLocaleString('es-MX')}/mes. Opciones:`, M, y); y += 13
        for (const o of g.extra_job.options) {
          doc.text(`    – ${o.hours_per_week}h/sem → cobra ≥ $${o.hourly_rate.toLocaleString('es-MX')}/hora`, M, y); y += 12
        }
        doc.setTextColor(70,70,80)
      }
      y += 4
    }
  }

  doc.setFontSize(8); doc.setTextColor(150,150,160)
  doc.text(`Nexus OS · Plan teórico — los números no afectan tus cuentas reales. · ${new Date().toISOString().split('T')[0]}`, M, 760)
  doc.save(`afp-plan-${d.month}.pdf`)
}

// ── CONFIG MODAL (5 secciones con tabs) ───────────────────────
async function _openConfigModal() {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:8px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:18px;max-width:780px;width:100%;color:#e5e7eb;max-height:95vh;display:flex;flex-direction:column;`

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-shrink:0;">
      <h3 style="margin:0;font-size:18px;font-weight:800;">⚙️ Mi configuración financiera</h3>
      <button id="cfg-close" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>
    <div id="cfg-tabs" style="display:flex;gap:4px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:14px;overflow-x:auto;flex-shrink:0;">
      ${[
        ['incomes','💵 Ingresos'],
        ['fixed','🏠 Gastos fijos'],
        ['debts','💳 Deudas'],
        ['plan','📅 Plan del mes'],
        ['goals','🎯 Metas'],
        ['strategy','📊 Estrategia'],
      ].map(([id,lbl]) => `
        <button data-cfg-tab="${id}" style="padding:8px 14px;background:transparent;border:none;border-bottom:2px solid transparent;color:#94a3b8;cursor:pointer;font-size:13px;white-space:nowrap;font-weight:600;">${lbl}</button>
      `).join('')}
    </div>
    <div id="cfg-tab-content" style="flex:1;overflow-y:auto;padding-right:4px;"></div>
  `

  overlay.appendChild(modal)
  document.body.appendChild(overlay)
  const cleanup = () => { document.body.removeChild(overlay); renderAFP() }
  modal.querySelector('#cfg-close').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  // Switch tabs
  let activeTab = 'incomes'
  const setTab = (id) => {
    activeTab = id
    modal.querySelectorAll('[data-cfg-tab]').forEach(b => {
      const on = b.dataset.cfgTab === id
      b.style.borderBottomColor = on ? '#22d3ee' : 'transparent'
      b.style.color = on ? '#22d3ee' : '#94a3b8'
    })
    _renderConfigTabContent(id, modal.querySelector('#cfg-tab-content'))
  }
  modal.querySelectorAll('[data-cfg-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.cfgTab)))
  setTab('incomes')
}

async function _renderConfigTabContent(tabId, container) {
  container.innerHTML = `<div style="color:#94a3b8;padding:20px;text-align:center;">⏳</div>`

  // Helpers
  const tabHandlers = {
    incomes: { listAction: 'afp_income_list', addAction: 'afp_income_add', delAction: 'afp_income_delete' },
    fixed:   { listAction: 'afp_fixed_list',  addAction: 'afp_fixed_add',  delAction: 'afp_fixed_delete' },
    debts:   { listAction: 'afp_debt_list',   addAction: 'afp_debt_add',   delAction: 'afp_debt_delete' },
    plan:    { listAction: 'afp_plan_list',   addAction: 'afp_plan_add',   delAction: 'afp_plan_delete' },
    goals:   { listAction: 'afp_goal_list',   addAction: 'afp_goal_add',   delAction: 'afp_goal_delete' },
  }

  if (tabId === 'strategy') {
    const data = _lastData || { config: {} }
    container.innerHTML = `
      <div style="padding:8px;">
        <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Estrategia preferida</label>
        <select id="cfg-strategy-sel" style="width:100%;padding:10px;background:#1f2937;border:1px solid #374151;border-radius:8px;color:#e5e7eb;font-size:14px;margin-bottom:10px;">
          ${STRATEGIES.map(s => `<option value="${s.id}" ${data.config.strategy === s.id ? 'selected':''}>${s.name}</option>`).join('')}
        </select>
        <div id="cfg-strat-desc" style="font-size:12px;color:#94a3b8;padding:10px;background:rgba(255,255,255,0.02);border-radius:8px;margin-bottom:14px;"></div>
        <button id="cfg-save-strat" style="padding:9px 16px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">💾 Guardar</button>
      </div>
    `
    const sel = container.querySelector('#cfg-strategy-sel')
    const desc = container.querySelector('#cfg-strat-desc')
    const updateDesc = () => { desc.textContent = STRATEGIES.find(s => s.id === sel.value)?.desc || '' }
    sel.addEventListener('change', updateDesc); updateDesc()
    container.querySelector('#cfg-save-strat').addEventListener('click', async () => {
      try {
        await _api('afp_save_config', { config: { strategy: sel.value } })
        alert('✓ Estrategia guardada')
      } catch (e) { alert('⚠ ' + e.message) }
    })
    return
  }

  const h = tabHandlers[tabId]
  if (!h) return
  let items = []
  try {
    const payload = tabId === 'plan' ? { month: new Date().toISOString().substring(0, 7) } : {}
    const r = await _api(h.listAction, payload)
    items = r.items || []
  } catch (e) {
    container.innerHTML = `<div style="color:#f87171;padding:20px;">⚠ ${e.message}</div>`
    return
  }

  // Render lista + form
  const renderTab = () => {
    let html = '<div style="padding:8px;">'
    // Form de captura
    if (tabId === 'incomes') {
      html += _formIncomes()
    } else if (tabId === 'fixed') {
      html += _formFixed()
    } else if (tabId === 'debts') {
      html += _formDebts()
    } else if (tabId === 'plan') {
      html += _formPlan()
    } else if (tabId === 'goals') {
      html += _formGoals()
    }

    // Lista
    if (!items.length) {
      html += '<div style="padding:20px;color:#6b7280;text-align:center;font-size:12px;">Aún no has agregado nada aquí.</div>'
    } else {
      html += '<div style="margin-top:14px;display:flex;flex-direction:column;gap:6px;">'
      for (const item of items) html += _renderItemRow(tabId, item)
      html += '</div>'
    }
    html += '</div>'
    container.innerHTML = html
    _bindFormEvents(tabId, container, async () => {
      const payload = tabId === 'plan' ? { month: new Date().toISOString().substring(0, 7) } : {}
      const r = await _api(h.listAction, payload); items = r.items || []; renderTab()
    })
    container.querySelectorAll('[data-del-item]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar?')) return
        try { await _api(h.delAction, { id: btn.dataset.delItem }); items = items.filter(x => x.id !== btn.dataset.delItem); renderTab() }
        catch (e) { alert('⚠ ' + e.message) }
      })
    })
  }
  renderTab()
}

function _formIncomes() {
  return `
    <div style="background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.2);border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#86efac;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">+ Agregar ingreso</div>
      <div style="display:grid;grid-template-columns:1fr 110px 130px;gap:6px;margin-bottom:6px;">
        <input data-f="name" placeholder="Ej: Sueldo principal" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="amount" type="number" step="0.01" placeholder="Monto" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <select data-f="frequency" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          <option value="monthly">mensual</option>
          <option value="weekly">semanal</option>
          <option value="biweekly">quincenal</option>
          <option value="bimonthly">bimestral</option>
          <option value="quarterly">trimestral</option>
          <option value="yearly">anual</option>
          <option value="one_time">única</option>
        </select>
      </div>
      <select data-f="category" style="width:100%;padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;margin-bottom:6px;">
        ${CATEGORIES_INCOME.map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join('')}
      </select>
      <button data-action="add" style="padding:8px 14px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#86efac;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Agregar</button>
    </div>
  `
}

function _formFixed() {
  return `
    <div style="background:rgba(251,146,60,0.04);border:1px solid rgba(251,146,60,0.2);border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#fb923c;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">+ Agregar gasto fijo</div>
      <div style="display:grid;grid-template-columns:1fr 110px 130px;gap:6px;margin-bottom:6px;">
        <input data-f="name" placeholder="Ej: Renta casa" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="amount" type="number" step="0.01" placeholder="Monto" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <select data-f="frequency" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          <option value="monthly">mensual</option>
          <option value="weekly">semanal</option>
          <option value="biweekly">quincenal</option>
          <option value="bimonthly">bimestral</option>
          <option value="quarterly">trimestral</option>
          <option value="yearly">anual</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <select data-f="category" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          ${CATEGORIES_FIXED.map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join('')}
        </select>
        <input data-f="due_day" type="number" min="1" max="31" placeholder="Día del mes (1-31)" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <button data-action="add" style="padding:8px 14px;background:rgba(251,146,60,0.15);border:1px solid rgba(251,146,60,0.4);color:#fb923c;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Agregar</button>
    </div>
  `
}

function _formDebts() {
  return `
    <div style="background:rgba(248,113,113,0.04);border:1px solid rgba(248,113,113,0.2);border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#f87171;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">+ Agregar deuda</div>
      <div style="display:grid;grid-template-columns:1fr 130px;gap:6px;margin-bottom:6px;">
        <input data-f="name" placeholder="Ej: Banamex Oro" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <select data-f="kind" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          <option value="credit_card">Tarjeta crédito</option>
          <option value="loan">Préstamo</option>
          <option value="line_of_credit">Línea de crédito</option>
          <option value="informal">Informal / familia</option>
          <option value="other">Otro</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;">
        <input data-f="balance" type="number" step="0.01" placeholder="Saldo $" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="min_payment" type="number" step="0.01" placeholder="Mín mensual $" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="interest_rate" type="number" step="0.1" placeholder="Tasa anual %" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <input data-f="cut_day" type="number" min="1" max="31" placeholder="Día corte" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="due_day" type="number" min="1" max="31" placeholder="Día vencimiento" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <button data-action="add" style="padding:8px 14px;background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.4);color:#fca5a5;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Agregar</button>
    </div>
  `
}

function _formPlan() {
  const monthStr = new Date().toISOString().substring(0, 7)
  const monthLabel = new Date(monthStr + '-01').toLocaleDateString('es-MX',{month:'long',year:'numeric'})
  return `
    <div style="background:rgba(167,139,250,0.04);border:1px solid rgba(167,139,250,0.2);border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#a78bfa;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">+ Plan puntual para ${monthLabel}</div>
      <input type="hidden" data-f="month" value="${monthStr}"/>
      <div style="display:grid;grid-template-columns:1fr 130px;gap:6px;margin-bottom:6px;">
        <input data-f="name" placeholder="Ej: Libro de finanzas" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="amount" type="number" step="0.01" placeholder="Monto" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <select data-f="category" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          ${CATEGORIES_PLAN.map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join('')}
        </select>
        <input data-f="planned_date" type="date" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <button data-action="add" style="padding:8px 14px;background:rgba(167,139,250,0.15);border:1px solid rgba(167,139,250,0.4);color:#a78bfa;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Agregar</button>
    </div>
  `
}

function _formGoals() {
  return `
    <div style="background:rgba(52,211,153,0.04);border:1px solid rgba(52,211,153,0.2);border-radius:10px;padding:12px;">
      <div style="font-size:11px;color:#34d399;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">+ Agregar meta</div>
      <div style="display:grid;grid-template-columns:1fr 130px 150px;gap:6px;margin-bottom:6px;">
        <input data-f="name" placeholder="Ej: Vacaciones diciembre" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="target_amount" type="number" step="0.01" placeholder="Meta $" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input data-f="deadline" type="date" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
      </div>
      <input data-f="current_amount" type="number" step="0.01" placeholder="¿Cuánto llevas ahorrado? (opcional)" style="width:100%;padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;margin-bottom:6px;"/>
      <button data-action="add" style="padding:8px 14px;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.4);color:#34d399;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">+ Agregar</button>
    </div>
  `
}

function _renderItemRow(tabId, item) {
  let main, side
  if (tabId === 'incomes') {
    main = `<strong>${_esc(item.name)}</strong><div style="font-size:11px;color:#94a3b8;margin-top:2px;">${FREQ_LABEL[item.frequency] || item.frequency}${item.category ? ' · ' + item.category : ''}</div>`
    side = `<span style="color:#86efac;font-weight:700;">${_fmt(item.amount)}</span>`
  } else if (tabId === 'fixed') {
    main = `<strong>${_esc(item.name)}</strong><div style="font-size:11px;color:#94a3b8;margin-top:2px;">${FREQ_LABEL[item.frequency] || item.frequency}${item.due_day ? ' · día ' + item.due_day : ''}${item.category ? ' · ' + item.category : ''}</div>`
    side = `<span style="color:#fb923c;font-weight:700;">${_fmt(item.amount)}</span>`
  } else if (tabId === 'debts') {
    main = `<strong>${_esc(item.name)}</strong><div style="font-size:11px;color:#94a3b8;margin-top:2px;">${item.kind === 'credit_card' ? 'Tarjeta' : 'Préstamo'} · ${item.interest_rate||0}% · mín ${_fmt(item.min_payment||0)}</div>`
    side = `<span style="color:#f87171;font-weight:700;">${_fmt(item.balance)}</span>`
  } else if (tabId === 'plan') {
    main = `<strong>${_esc(item.name)}</strong><div style="font-size:11px;color:#94a3b8;margin-top:2px;">${item.planned_date || 'sin fecha'}${item.category ? ' · ' + item.category : ''}</div>`
    side = `<span style="color:#a78bfa;font-weight:700;">${_fmt(item.amount)}</span>`
  } else if (tabId === 'goals') {
    const pct = item.target_amount > 0 ? Math.round((item.current_amount / item.target_amount) * 100) : 0
    main = `<strong>${_esc(item.name)}</strong><div style="font-size:11px;color:#94a3b8;margin-top:2px;">${item.deadline || 'sin fecha'} · ${pct}% completado</div>`
    side = `<span style="color:#34d399;font-weight:700;">${_fmt(item.target_amount)}</span>`
  }
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;gap:10px;">
      <div style="flex:1;min-width:0;font-size:13px;color:#e5e7eb;">${main}</div>
      ${side}
      <button data-del-item="${item.id}" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:4px 8px;">🗑</button>
    </div>
  `
}

function _bindFormEvents(tabId, container, onReload) {
  const addBtn = container.querySelector('[data-action="add"]')
  if (!addBtn) return
  addBtn.addEventListener('click', async () => {
    const payload = {}
    container.querySelectorAll('[data-f]').forEach(inp => {
      let val = inp.value
      if (val === '') return
      if (inp.type === 'number') val = Number(val)
      payload[inp.dataset.f] = val
    })
    if (!payload.name) { alert('Nombre requerido'); return }
    if (tabId === 'incomes' || tabId === 'fixed' || tabId === 'plan') {
      if (!payload.amount || payload.amount <= 0) { alert('Monto requerido'); return }
    }
    if (tabId === 'goals' && !payload.target_amount) { alert('Meta requerida'); return }
    if (tabId === 'debts' && (payload.balance == null || payload.balance < 0)) { alert('Saldo requerido'); return }

    const actionMap = {
      incomes: 'afp_income_add', fixed: 'afp_fixed_add',
      debts: 'afp_debt_add', plan: 'afp_plan_add', goals: 'afp_goal_add',
    }
    try {
      await _api(actionMap[tabId], payload)
      // Limpia form
      container.querySelectorAll('[data-f]').forEach(inp => { if (inp.dataset.f !== 'month') inp.value = '' })
      await onReload()
    } catch (e) { alert('⚠ ' + e.message) }
  })
}

if (typeof window !== 'undefined') {
  window.nexusAFP = { render: renderAFP }
}
