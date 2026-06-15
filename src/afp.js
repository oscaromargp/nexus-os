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

// ── Plantillas predefinidas — el usuario sólo escoge y pone el monto ──
const TEMPLATES_INCOME = [
  { name: 'Sueldo principal',  category: 'salario',    frequency: 'monthly' },
  { name: 'Sueldo secundario', category: 'salario',    frequency: 'biweekly' },
  { name: 'Freelance',         category: 'freelance',  frequency: 'monthly' },
  { name: 'Renta de inmueble', category: 'renta inmueble', frequency: 'monthly' },
  { name: 'Comisiones',        category: 'salario',    frequency: 'monthly' },
  { name: 'Inversiones',       category: 'inversiones',frequency: 'monthly' },
  { name: 'Pensión / Apoyo',   category: 'salario',    frequency: 'monthly' },
  { name: 'Aguinaldo / Bono',  category: 'salario',    frequency: 'yearly' },
]
const TEMPLATES_FIXED = [
  { name: 'Renta / Hipoteca',  category: 'vivienda',    icon: '🏠' },
  { name: 'Luz (CFE)',         category: 'servicios',   icon: '💡' },
  { name: 'Agua',              category: 'servicios',   icon: '💧' },
  { name: 'Gas',               category: 'servicios',   icon: '🔥' },
  { name: 'Internet',          category: 'servicios',   icon: '📡' },
  { name: 'Teléfono / Celular',category: 'servicios',   icon: '📱' },
  { name: 'Despensa',          category: 'alimento',    icon: '🛒' },
  { name: 'Gasolina',          category: 'transporte',  icon: '⛽' },
  { name: 'Transporte público',category: 'transporte',  icon: '🚌' },
  { name: 'Medicinas',         category: 'salud',       icon: '💊' },
  { name: 'Seguro de salud',   category: 'salud',       icon: '🏥' },
  { name: 'Seguro de auto',    category: 'transporte',  icon: '🚗' },
  { name: 'Colegiatura',       category: 'educación',   icon: '🎓' },
  { name: 'Pensión hijos',     category: 'familia',     icon: '👶' },
  { name: 'Mantenimiento (mensual)', category: 'vivienda', icon: '🔧' },
  { name: 'Estacionamiento',   category: 'transporte',  icon: '🅿️' },
  { name: 'Gym / Deporte',     category: 'salud',       icon: '💪' },
  { name: 'Netflix',           category: 'suscripciones', icon: '📺' },
  { name: 'Spotify',           category: 'suscripciones', icon: '🎧' },
  { name: 'iCloud / Drive',    category: 'suscripciones', icon: '☁️' },
  { name: 'Mascotas (alimento/vet)', category: 'familia', icon: '🐕' },
  { name: 'Donaciones',        category: 'otro',        icon: '💝' },
]
const TEMPLATES_PLAN = [
  { name: 'Regalo cumpleaños', category: 'regalo',        icon: '🎁' },
  { name: 'Consulta médica',   category: 'salud',         icon: '🩺' },
  { name: 'Curso / Libro',     category: 'educación',     icon: '📚' },
  { name: 'Salida especial',   category: 'entretenimiento',icon: '🍽️' },
  { name: 'Viaje corto',       category: 'entretenimiento',icon: '✈️' },
  { name: 'Reparación auto',   category: 'familia',       icon: '🛠️' },
  { name: 'Reparación casa',   category: 'hogar',         icon: '🔨' },
  { name: 'Ropa / Calzado',    category: 'ropa',          icon: '👕' },
  { name: 'Electrónico',       category: 'tecnología',    icon: '💻' },
  { name: 'Tenida fiesta',     category: 'entretenimiento',icon: '🎉' },
]
const ADJUSTMENT_KINDS = [
  { id: 'expense',  label: 'Gasto imprevisto', icon: '💸', color: '#ef4444', desc: 'Algo no planificado que tuviste que pagar' },
  { id: 'income',   label: 'Ingreso extra',    icon: '💰', color: '#22c55e', desc: 'Dinero que llegó fuera del plan' },
  { id: 'transfer', label: 'Movimiento entre cuentas', icon: '🔄', color: '#94a3b8', desc: 'Pasaste dinero de una cuenta a otra' },
  { id: 'save',     label: 'Ahorro extra',     icon: '🌱', color: '#34d399', desc: 'Apartaste para metas / fondo emergencia' },
]

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

  const { score, health, metrics: m, score_breakdown: sb, strategy, goals, recommendations, incomes, fixed_expenses, monthly_plan, debts, debt_strategies, month, cushion } = data
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
          <button id="afp-adjust-btn" style="padding:9px 14px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.3);color:#fb923c;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">⚡ Reajustar</button>
          <button id="afp-pdf-btn" style="padding:9px 14px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">📄 PDF para el refri</button>
          <button id="afp-config-btn" style="padding:9px 14px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">⚙️ Mi configuración</button>
        </div>
      </div>

      <!-- 🎯 ESTA SEMANA · plan accionable (placeholder, se hidrata async) -->
      <div id="afp-weekplan" data-afp-weekplan style="margin-bottom:20px;">
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;font-size:13px;color:#94a3b8;">⏳ Calculando tu plan semanal…</div>
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

      <!-- COLCHÓN FIAT -->
      ${(() => {
        const cur = cushion?.current_balance || 0
        const tgt = cushion?.target_amount || 0
        const pct = cushion?.progress_pct || 0
        const monthsCov = cushion?.months_covered || 0
        const monthsTgt = cushion?.target_months || 3
        const barColor = pct >= 100 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#f87171'
        const ready = pct >= 100
        return `
        <div style="background:rgba(52,211,153,0.04);border:1px solid rgba(52,211,153,0.25);border-radius:12px;padding:16px;margin-bottom:20px;">
          <div style="display:flex;align-items:start;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
            <div>
              <div style="font-size:14px;font-weight:800;color:#34d399;display:flex;align-items:center;gap:6px;">🛡️ Colchón Fiat ${cushion?.account_label ? `<span style="font-size:11px;color:#94a3b8;font-weight:500;">· ${_esc(cushion.account_label)}</span>` : ''}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Fondo de emergencia — el suelo que te sostiene si algo falla</div>
            </div>
            <button id="afp-cushion-btn" style="padding:7px 12px;background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.4);color:#34d399;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;">💵 Depositar/Retirar</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;">
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Saldo actual</div>
              <div style="font-size:22px;font-weight:800;color:#34d399;margin-top:4px;">${_fmt(cur)}</div>
              <div style="font-size:10px;color:#6b7280;">cubre ${monthsCov.toFixed(1)} meses de fijos</div>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;">
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Meta</div>
              <div style="font-size:22px;font-weight:800;color:#e5e7eb;margin-top:4px;">${_fmt(tgt)}</div>
              <div style="font-size:10px;color:#6b7280;">${monthsTgt} meses de gastos fijos</div>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;">
              <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Progreso</div>
              <div style="font-size:22px;font-weight:800;color:${barColor};margin-top:4px;">${pct}%</div>
              <div style="font-size:10px;color:#6b7280;">${ready ? '✓ Meta lograda' : _fmt(tgt - cur) + ' restantes'}</div>
            </div>
          </div>
          <div style="height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.4s;"></div>
          </div>
        </div>
        `
      })()}

      <!-- 💵 SALDO REAL EN CUENTAS DE MOVIMIENTOS — placeholder hidratado al cargar -->
      <div id="afp-real-balances" data-afp-real-balances style="margin-bottom:20px;">
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;font-size:12px;color:#6b7280;">⏳ Leyendo saldos reales…</div>
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
  document.getElementById('afp-adjust-btn')?.addEventListener('click', () => _openAdjustmentModal(data))
  document.getElementById('afp-cushion-btn')?.addEventListener('click', () => _openCushionModal(data))

  // Hidrata paneles asíncronos y se suscribe a cambios de saldo
  _hydrateRealBalances()
  _hydrateWeekPlan()
  if (!window._afpBalanceSub) {
    window._afpBalanceSub = window.nexusBalance?.onChange?.(() => {
      _hydrateRealBalances()
      _hydrateWeekPlan()
    })
  }
}

// ── Plan semanal · instrucciones nombre+razón ───────────────────────────────
async function _hydrateWeekPlan() {
  const mount = document.querySelector('[data-afp-weekplan]')
  if (!mount) return
  let plan
  try {
    const r = await _api('afp_weekplan_get')
    plan = r.weekplan
  } catch (e) {
    mount.innerHTML = `<div style="background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);border-radius:12px;padding:14px;font-size:12px;color:#f87171;">⚠ ${_esc(e.message)}</div>`
    return
  }

  const MODE_CFG = {
    survival:   { color: '#f87171', emoji: '🩹', label: 'Supervivencia' },
    debt:       { color: '#fb923c', emoji: '🔥', label: 'Liquidación' },
    build:      { color: '#fbbf24', emoji: '🏗️', label: 'Construcción' },
    accumulate: { color: '#34d399', emoji: '🌱', label: 'Acumulación' },
    balance:    { color: '#22d3ee', emoji: '⚖️', label: 'Equilibrio' },
  }
  const mc = MODE_CFG[plan.mode] || MODE_CFG.balance
  const _fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX')

  // Lista de compromisos ordenada: sagrado > colchón > deudas > metas
  const allCommitments = [
    ...plan.sacred.map(x  => ({ ...x, prio: 1, color: '#f59e0b' })),
    ...plan.cushion.map(x => ({ ...x, prio: 2, color: '#fbbf24' })),
    ...plan.debts.map(x   => ({ ...x, prio: 3, color: '#fb923c' })),
    ...plan.goals.map(x   => ({ ...x, prio: 4, color: '#a78bfa' })),
  ].filter(x => x.amount > 0)

  const _commitHtml = (c) => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid ${c.color}30;border-left:3px solid ${c.color};border-radius:8px;">
      <input type="checkbox" disabled style="width:18px;height:18px;margin-top:1px;flex-shrink:0;accent-color:${c.color};opacity:0.4;cursor:not-allowed;" title="Marca como hecho desde Movimientos (próximamente en 1 tap)" />
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_esc(c.label)}</div>
          <div style="font-size:14px;font-weight:800;color:${c.color};font-family:'JetBrains Mono',monospace;">${_fmt(c.amount)}${c.reduced ? ' ⬇' : ''}</div>
        </div>
        <div style="font-size:11px;color:#94a3b8;line-height:1.4;margin-top:2px;">${_esc(c.reason)}</div>
      </div>
    </div>`

  const _incomeHtml = (i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:8px;">
      <div style="font-size:12px;color:#e5e7eb;"><span style="color:#34d399;font-weight:700;">+ ${_esc(i.label)}</span> <span style="color:#94a3b8;">· ${_esc(i.reason)}</span></div>
      <div style="font-size:13px;font-weight:800;color:#34d399;font-family:'JetBrains Mono',monospace;">${_fmt(i.amount)}</div>
    </div>`

  const livingOK = plan.free_amount >= plan.min_living_weekly
  const livingColor = livingOK ? '#34d399' : '#fb923c'

  mount.innerHTML = `
    <div style="background:linear-gradient(135deg,${mc.color}10,${mc.color}05);border:2px solid ${mc.color}50;border-radius:16px;padding:18px;">
      <!-- Header del plan -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="font-size:11px;color:${mc.color};text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">Esta semana · ${plan.week_start.slice(5)} → ${plan.week_end.slice(5)}</div>
          <h3 style="margin:4px 0 0;font-size:18px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
            <span style="font-size:22px;">${mc.emoji}</span>
            <span>Modo ${mc.label}</span>
          </h3>
          <p style="margin:6px 0 0;font-size:12px;color:#cbd5e1;line-height:1.5;">${_esc(plan.modeReason)}</p>
        </div>
        ${plan.primary_account_label ? `
          <div style="text-align:right;background:rgba(0,0,0,0.25);padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);">
            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Saldo real ${_esc(plan.primary_account_label)}</div>
            <div style="font-size:18px;font-weight:800;color:${plan.real_balance >= 0 ? '#22d3ee' : '#f87171'};font-family:'JetBrains Mono',monospace;">${_fmt(plan.real_balance)}</div>
          </div>` : `
          <div style="font-size:10px;color:#fb923c;background:rgba(251,146,60,0.08);padding:6px 10px;border-radius:8px;border:1px solid rgba(251,146,60,0.25);max-width:240px;">⚠ Marca una cuenta principal abajo (★) para que AFP use tu saldo real.</div>`}
      </div>

      <!-- Ingresos esperados -->
      ${plan.income.length ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:10px;color:#34d399;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:6px;">📥 Ingresos esperados</div>
          <div style="display:flex;flex-direction:column;gap:5px;">${plan.income.map(_incomeHtml).join('')}</div>
        </div>` : `
        <div style="font-size:11px;color:#94a3b8;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:8px;margin-bottom:14px;">Sin ingresos programados esta semana.</div>`}

      <!-- Compromisos -->
      ${allCommitments.length ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:10px;color:${mc.color};text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:6px;">🎯 Dispersiones (pase lo que pase)</div>
          <div style="display:flex;flex-direction:column;gap:6px;">${allCommitments.map(_commitHtml).join('')}</div>
        </div>` : `
        <div style="font-size:11px;color:#94a3b8;padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:8px;margin-bottom:14px;">Sin dispersiones obligatorias esta semana.</div>`}

      <!-- Libre para vivir -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:${livingColor}10;border:1px solid ${livingColor}40;border-radius:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:160px;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Libre para ti</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">mínimo respetado: ${_fmt(plan.min_living_weekly)} · ${livingOK ? 'ok' : 'ajustamos metas'}</div>
        </div>
        <div style="font-size:22px;font-weight:800;color:${livingColor};font-family:'JetBrains Mono',monospace;">${_fmt(plan.free_amount)}</div>
      </div>

      ${plan.warnings.length ? `
        <div style="margin-top:10px;padding:10px 12px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.25);border-radius:8px;font-size:11px;color:#fb923c;line-height:1.5;">
          ${plan.warnings.map(w => '⚠ ' + _esc(w)).join('<br>')}
        </div>` : ''}

      <div style="margin-top:10px;text-align:right;">
        <span style="font-size:10px;color:#6b7280;">comprometido $${plan.total_committed.toLocaleString()} de $${plan.total_income.toLocaleString()} esperados · ejecuta tap-a-tap próximamente</span>
      </div>
    </div>`
}

// ── Saldos Reales · lee del balance-engine y pinta ───────────────────────────
async function _hydrateRealBalances() {
  const mount = document.querySelector('[data-afp-real-balances]')
  if (!mount) return
  try {
    const { accounts, totals } = await window.nexusBalance.getAll()
    if (!accounts.length) {
      mount.innerHTML = `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;font-size:12px;color:#6b7280;">
          Sin cuentas en Movimientos. Crea una para ver tu Saldo Real aquí.
        </div>`
      return
    }
    const primary = await window.nexusBalance.primary()

    const _fmt = (n) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const _badge = (lbl, val, color) => `
      <div style="text-align:center;flex:1;min-width:90px;">
        <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:2px;">${lbl}</div>
        <div style="font-size:14px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;">${_fmt(val)}</div>
      </div>`

    // Encabezado con totales
    let html = `
      <div style="background:linear-gradient(135deg,rgba(34,211,238,0.06),rgba(167,139,250,0.04));border:1px solid rgba(34,211,238,0.2);border-radius:12px;padding:14px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <div style="font-size:14px;font-weight:800;color:#22d3ee;display:flex;align-items:center;gap:6px;">💵 Saldo Real · todas tus cuentas</div>
          <span style="font-size:10px;color:#6b7280;">basado en Movimientos · pendientes ya restados</span>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:10px;">
          ${_badge('Disponible', totals.disponible, '#34d399')}
          ${_badge('Pendiente salida', totals.pendienteOut, '#fbbf24')}
          ${_badge('Pendiente entrada', totals.pendienteIn, '#60a5fa')}
          ${_badge('SALDO REAL', totals.real, totals.real >= 0 ? '#22d3ee' : '#f87171')}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">`

    for (const a of accounts) {
      const isPrim = a.orqId === primary
      html += `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid ${isPrim?'rgba(34,211,238,0.35)':'rgba(255,255,255,0.06)'};border-radius:8px;">
          <button data-afp-set-primary="${a.orqId}" title="Marcar como cuenta principal AFP"
            style="background:none;border:none;cursor:pointer;font-size:14px;color:${isPrim?'#22d3ee':'#475569'};padding:2px;">${isPrim?'★':'☆'}</button>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(a.nombre)}</div>
            <div style="font-size:10px;color:#6b7280;">${a.count} mov · ${_esc(a.moneda_principal || 'MXN')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:800;color:${a.real >= 0 ? '#22d3ee' : '#f87171'};font-family:'JetBrains Mono',monospace;">${_fmt(a.real)}</div>
            <div style="font-size:9px;color:#94a3b8;">
              <span style="color:#34d399;">${_fmt(a.disponible)}</span>
              ${a.pendienteOut > 0 ? ` <span style="color:#fbbf24;">- ${_fmt(a.pendienteOut)}</span>` : ''}
              ${a.pendienteIn  > 0 ? ` <span style="color:#60a5fa;">+ ${_fmt(a.pendienteIn)}</span>` : ''}
            </div>
          </div>
        </div>`
    }
    html += `</div></div>`
    mount.innerHTML = html

    // Bind: marcar cuenta principal
    mount.querySelectorAll('[data-afp-set-primary]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.afpSetPrimary
        await window.nexusBalance.setPrimary(id === primary ? null : id)
        _hydrateRealBalances()
      })
    })
  } catch (e) {
    mount.innerHTML = `<div style="background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);border-radius:12px;padding:12px;font-size:12px;color:#f87171;">⚠ ${_esc(e.message)}</div>`
  }
}

// ── PDF EXPORT v4 — rediseñado con secciones, tablas y gráficas ──
async function _exportPDF(d) {
  let jsPDF
  try {
    const mod = await import('jspdf')
    jsPDF = mod.jsPDF || mod.default
  } catch (e) { alert('No pude cargar jsPDF: ' + e.message); return }

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40                      // margen
  const monthLabel = new Date(d.month + '-01').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  // Paleta de colores (RGB)
  const C = {
    primary:  [34, 211, 238],   // cyan
    accent:   [167, 139, 250],  // violet
    income:   [34, 197, 94],    // green
    expense:  [251, 146, 60],   // orange
    debt:     [239, 68, 68],    // red
    plan:     [167, 139, 250],  // violet
    ok:       [34, 197, 94],
    bad:      [239, 68, 68],
    text:     [30, 41, 59],
    muted:    [100, 116, 139],
    light:    [241, 245, 249],
    bg:       [255, 255, 255],
  }

  const setColor = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])
  const setFill  = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2])
  const setDraw  = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2])

  // ════════════════════════════════════════════
  // PORTADA: header con banda de color + branding
  // ════════════════════════════════════════════
  setFill(C.text); doc.rect(0, 0, W, 95, 'F')
  // Logo / texto Nexus
  setColor([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('NEXUS OS', M, 28)
  setColor(C.primary); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
  doc.text('PLAN FINANCIERO PERSONAL', M, 42)

  setColor([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(28)
  doc.text('Mi plan del mes', M, 75)

  // Fecha en lado derecho
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); setColor(C.primary)
  doc.text(monthLabel.toUpperCase(), W - M, 28, { align: 'right' })
  setColor([255, 255, 255]); doc.setFontSize(8)
  doc.text('Generado: ' + new Date().toLocaleDateString('es-MX'), W - M, 42, { align: 'right' })

  let y = 130

  // ════════════════════════════════════════════
  // SCORE BLOCK
  // ════════════════════════════════════════════
  const scoreColor = d.score >= 75 ? C.ok : d.score >= 55 ? [132, 204, 22] : d.score >= 35 ? [251, 191, 36] : C.bad
  setFill(C.light); doc.rect(M, y, W - 2*M, 80, 'F')
  // Círculo del score
  setFill(scoreColor); doc.circle(M + 50, y + 40, 32, 'F')
  setColor([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(28)
  doc.text(String(d.score), M + 50, y + 50, { align: 'center' })

  setColor(C.text); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text(d.health.label, M + 100, y + 32)
  setColor(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text('Salud financiera de tu plan', M + 100, y + 48)
  doc.text(`Ahorro mensual: ${d.metrics.savings_rate_pct}% · Compromiso: ${d.metrics.commitment_ratio_pct}%`, M + 100, y + 62)

  y += 100

  // ════════════════════════════════════════════
  // GRÁFICO DE BARRAS — Ingresos vs Egresos
  // ════════════════════════════════════════════
  const sectionTitle = (title, color) => {
    setFill(color); doc.rect(M, y, 4, 16, 'F')
    setColor(C.text); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(title, M + 12, y + 12); y += 24
  }

  sectionTitle('Tu mes en un vistazo', C.primary)

  const income = d.metrics.effective_income || d.metrics.monthly_income
  const fixed = d.metrics.monthly_fixed
  const plan = d.metrics.monthly_plan
  const debt = d.metrics.monthly_min_debt
  const dispMargin = d.metrics.monthly_disposable

  const maxVal = Math.max(income, fixed + plan + debt + Math.max(0, dispMargin))
  const barH = 28
  const barWidth = W - 2*M - 100  // espacio para etiquetas
  const labelX = M
  const barX = M + 100

  const drawBar = (label, segments, totalLabel) => {
    setColor(C.text); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text(label, labelX, y + 18)
    let cx = barX
    for (const seg of segments) {
      const segW = maxVal > 0 ? (seg.value / maxVal) * barWidth : 0
      if (segW > 0) {
        setFill(seg.color); doc.rect(cx, y, segW, barH, 'F')
        if (segW > 35) {
          setColor([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
          doc.text('$' + Math.round(seg.value).toLocaleString('es-MX'), cx + segW / 2, y + 18, { align: 'center' })
        }
        cx += segW
      }
    }
    setColor(C.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(totalLabel, W - M, y + 18, { align: 'right' })
    y += barH + 6
  }

  drawBar('INGRESOS', [{ value: income, color: C.income }], '$' + income.toLocaleString('es-MX'))
  const segs = []
  if (fixed > 0) segs.push({ value: fixed, color: C.expense })
  if (plan > 0)  segs.push({ value: plan,  color: C.plan })
  if (debt > 0)  segs.push({ value: debt,  color: C.debt })
  drawBar('COMPROMISOS', segs, '$' + (fixed + plan + debt).toLocaleString('es-MX'))

  if (dispMargin >= 0) {
    drawBar('LIBRE', [{ value: dispMargin, color: C.ok }], '$' + dispMargin.toLocaleString('es-MX') + ' ✓')
  } else {
    drawBar('DÉFICIT', [{ value: Math.abs(dispMargin), color: C.bad }], '-$' + Math.abs(dispMargin).toLocaleString('es-MX') + ' ⚠')
  }

  // Leyenda
  y += 4
  setColor(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const legend = [
    { col: C.income,  label: 'Ingresos' },
    { col: C.expense, label: 'Fijos' },
    { col: C.plan,    label: 'Plan mes' },
    { col: C.debt,    label: 'Mín deudas' },
    { col: C.ok,      label: 'Libre' },
  ]
  let lx = M + 100
  for (const l of legend) {
    setFill(l.col); doc.rect(lx, y + 3, 8, 8, 'F')
    setColor(C.muted)
    doc.text(l.label, lx + 12, y + 10)
    lx += 70
  }
  y += 28

  // ════════════════════════════════════════════
  // TABLA — Ingresos
  // ════════════════════════════════════════════
  const drawTable = (rows, headers, widths) => {
    if (y > H - 80) { doc.addPage(); y = 50 }
    // Header
    setFill(C.text); doc.rect(M, y, W - 2*M, 22, 'F')
    setColor([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    let cx = M + 8
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], cx, y + 14, headers[i].align || {})
      cx += widths[i]
    }
    y += 22
    // Rows
    let alt = false
    for (const r of rows) {
      if (y > H - 50) {
        doc.addPage(); y = 50
        setFill(C.text); doc.rect(M, y, W - 2*M, 22, 'F')
        setColor([255, 255, 255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
        let cxh = M + 8
        for (let i = 0; i < headers.length; i++) { doc.text(headers[i], cxh, y + 14); cxh += widths[i] }
        y += 22
      }
      if (alt) { setFill([248, 250, 252]); doc.rect(M, y, W - 2*M, 18, 'F') }
      alt = !alt
      setColor(C.text); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      let cx = M + 8
      for (let i = 0; i < r.length; i++) {
        const cell = r[i]
        if (typeof cell === 'object') {
          if (cell.color) setColor(cell.color); else setColor(C.text)
          if (cell.bold) doc.setFont('helvetica', 'bold'); else doc.setFont('helvetica', 'normal')
          doc.text(String(cell.text), cx, y + 13, cell.opts || {})
        } else {
          doc.text(String(cell), cx, y + 13)
        }
        cx += widths[i]
      }
      y += 18
    }
    y += 6
  }

  // INGRESOS
  if (d.incomes.length) {
    sectionTitle('Mis ingresos', C.income)
    const rows = d.incomes.map(i => [
      i.name, FREQ_LABEL[i.frequency] || i.frequency,
      { text: '$' + Math.round(i.amount).toLocaleString('es-MX'), color: C.muted, opts: { align: 'right' } },
      { text: '$' + Math.round(i.monthly).toLocaleString('es-MX') + ' /mes', color: C.income, bold: true, opts: { align: 'right' } },
    ])
    rows.push([
      { text: 'TOTAL', bold: true, color: C.text },
      '',
      '',
      { text: '$' + d.metrics.monthly_income.toLocaleString('es-MX') + ' /mes', color: C.income, bold: true, opts: { align: 'right' } },
    ])
    const widths = [220, 90, 100, W - 2*M - 410]
    drawTable(rows, ['CONCEPTO', 'FRECUENCIA', 'MONTO', 'MENSUAL'], widths)
  }

  // GASTOS FIJOS
  if (d.fixed_expenses.length) {
    sectionTitle('Gastos fijos', C.expense)
    const rows = d.fixed_expenses.map(f => [
      f.name + (f.due_day ? ` · día ${f.due_day}` : ''),
      f.category || '—',
      { text: '$' + Math.round(f.amount).toLocaleString('es-MX'), color: C.muted, opts: { align: 'right' } },
      { text: '$' + Math.round(f.monthly).toLocaleString('es-MX') + ' /mes', color: C.expense, bold: true, opts: { align: 'right' } },
    ])
    rows.push([
      { text: 'TOTAL', bold: true, color: C.text }, '', '',
      { text: '$' + d.metrics.monthly_fixed.toLocaleString('es-MX') + ' /mes', color: C.expense, bold: true, opts: { align: 'right' } },
    ])
    const widths = [240, 90, 100, W - 2*M - 430]
    drawTable(rows, ['CONCEPTO', 'CATEGORÍA', 'MONTO', 'MENSUAL'], widths)
  }

  // PLAN DEL MES
  if (d.monthly_plan.length) {
    sectionTitle('Plan puntual de ' + monthLabel, C.plan)
    const rows = d.monthly_plan.map(p => [
      p.name,
      p.planned_date || '—',
      p.category || '—',
      { text: '$' + Math.round(p.amount).toLocaleString('es-MX'), color: C.plan, bold: true, opts: { align: 'right' } },
    ])
    rows.push([
      { text: 'TOTAL', bold: true, color: C.text }, '', '',
      { text: '$' + d.metrics.monthly_plan.toLocaleString('es-MX'), color: C.plan, bold: true, opts: { align: 'right' } },
    ])
    const widths = [220, 90, 110, W - 2*M - 420]
    drawTable(rows, ['CONCEPTO', 'FECHA', 'CATEGORÍA', 'MONTO'], widths)
  }

  // DEUDAS
  if (d.debts.length) {
    sectionTitle('Mis deudas — pagar primero las más caras', C.debt)
    let idx = 1
    const rows = d.debt_strategies.avalanche.map(dbt => [
      `${idx++}. ${dbt.name}`,
      dbt.kind === 'credit_card' ? 'Tarjeta' : dbt.kind === 'loan' ? 'Préstamo' : dbt.kind,
      { text: dbt.interest_rate + '% ', color: C.debt, opts: { align: 'right' } },
      { text: '$' + Math.round(dbt.balance).toLocaleString('es-MX'), color: C.text, bold: true, opts: { align: 'right' } },
      { text: '$' + Math.round(dbt.min_payment).toLocaleString('es-MX'), color: C.muted, opts: { align: 'right' } },
    ])
    rows.push([
      { text: 'TOTAL', bold: true, color: C.text }, '', '',
      { text: '$' + d.metrics.total_debt_balance.toLocaleString('es-MX'), color: C.debt, bold: true, opts: { align: 'right' } },
      { text: '$' + d.metrics.monthly_min_debt.toLocaleString('es-MX') + ' /mes', color: C.debt, bold: true, opts: { align: 'right' } },
    ])
    const widths = [180, 70, 70, 110, W - 2*M - 430]
    drawTable(rows, ['DEUDA', 'TIPO', 'TASA', 'SALDO', 'MÍN /MES'], widths)
  }

  // AJUSTES DEL MES
  if (d.adjustments && d.adjustments.length) {
    sectionTitle('Reajustes del mes (imprevistos)', C.accent)
    const adjLabels = { expense: '💸 Gasto', income: '💰 Ingreso', transfer: '🔄 Transfer', save: '🌱 Ahorro' }
    const rows = d.adjustments.map(a => [
      adjLabels[a.kind] || a.kind,
      a.reason,
      a.category || '—',
      { text: (a.kind === 'expense' ? '-$' : '+$') + Math.round(a.amount).toLocaleString('es-MX'),
        color: a.kind === 'expense' ? C.debt : C.income, bold: true, opts: { align: 'right' } },
    ])
    const widths = [90, 250, 90, W - 2*M - 446]
    drawTable(rows, ['TIPO', 'MOTIVO', 'CATEGORÍA', 'MONTO'], widths)
  }

  // DISPERSIÓN
  if (dispMargin > 0 && d.strategy) {
    if (y > H - 130) { doc.addPage(); y = 50 }
    sectionTitle('Dispersión sugerida del libre — ' + (d.strategy.name || ''), C.primary)
    const dispLabels = { necesidades:'Refuerzo necesidades', ahorro:'Ahorro / metas', lifestyle:'Lifestyle', profit:'Profit' }
    const dispColors = { necesidades: C.expense, ahorro: C.income, lifestyle: C.accent, profit: [251, 191, 36] }

    // Tarjetas horizontales
    const entries = Object.entries(d.strategy.dispersion).filter(([k,v]) => v > 0)
    const cardW = (W - 2*M - 10 * (entries.length - 1)) / Math.max(1, entries.length)
    let cx = M
    for (const [k, v] of entries) {
      const proportion = Math.round(v * dispMargin / income)
      const col = dispColors[k] || C.muted
      setFill([col[0]/255*200 + 55*0.85, col[1]/255*200 + 55*0.85, col[2]/255*200 + 55*0.85].map(n => Math.min(255, n)))
      doc.rect(cx, y, cardW, 60, 'F')
      setFill(col); doc.rect(cx, y, 4, 60, 'F')
      setColor(col); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      doc.text((dispLabels[k] || k).toUpperCase(), cx + 12, y + 16)
      setColor(C.text); doc.setFontSize(22); doc.setFont('helvetica', 'bold')
      doc.text('$' + proportion.toLocaleString('es-MX'), cx + 12, y + 40)
      setColor(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
      doc.text((d.strategy.percentages[k] || 0) + '% del ingreso', cx + 12, y + 53)
      cx += cardW + 10
    }
    y += 75
  }

  // METAS
  if (d.goals && d.goals.length) {
    if (y > H - 120) { doc.addPage(); y = 50 }
    sectionTitle('Mis metas', C.income)
    for (const g of d.goals) {
      if (y > H - 70) { doc.addPage(); y = 50 }
      setFill(g.achievable ? [240, 253, 244] : [254, 242, 242])
      doc.rect(M, y, W - 2*M, 50, 'F')
      setFill(g.achievable ? C.ok : C.bad); doc.rect(M, y, 4, 50, 'F')
      setColor(C.text); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
      doc.text(g.name, M + 12, y + 16)
      setColor(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.text(`Meta: $${g.target_amount.toLocaleString('es-MX')} · ${g.months_left} meses restantes · Necesitas $${g.monthly_needed.toLocaleString('es-MX')}/mes`, M + 12, y + 32)
      setColor(g.achievable ? C.ok : C.bad); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text(g.achievable ? '✓ Alcanzable' : `⚠ Te faltan $${g.gap_monthly.toLocaleString('es-MX')}/mes`, W - M - 8, y + 16, { align: 'right' })
      if (!g.achievable && g.extra_job) {
        setColor(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
        const opt = g.extra_job.options[1] || g.extra_job.options[0]
        doc.text(`Opción: ${opt.hours_per_week}h/sem a $${opt.hourly_rate.toLocaleString('es-MX')}/hora`, W - M - 8, y + 32, { align: 'right' })
      }
      y += 56
    }
  }

  // FOOTER en todas las páginas
  const pageCount = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    setFill(C.text); doc.rect(0, H - 28, W, 28, 'F')
    setColor([255, 255, 255]); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text('Nexus OS · Plan teórico — los números no afectan tus cuentas reales.', M, H - 12)
    setColor(C.primary)
    doc.text(`${monthLabel.toUpperCase()} · Pag. ${p}/${pageCount}`, W - M, H - 12, { align: 'right' })
  }

  doc.save(`afp-plan-${d.month}.pdf`)
}

// ── Modal de reajuste ────────────────────────────────────────
function _openAdjustmentModal(data) {
  const monthStr = data.month
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:8px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:18px;max-width:680px;width:100%;color:#e5e7eb;max-height:95vh;overflow-y:auto;`

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <h3 style="margin:0;font-size:18px;font-weight:800;">⚡ Reajustar plan</h3>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Pasó algo no planeado este mes. Regístralo aquí — el plan se reajusta al instante.</p>
      </div>
      <button id="adj-close" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;">
      ${ADJUSTMENT_KINDS.map(k => `
        <button data-adj-kind="${k.id}" style="padding:12px;background:rgba(${_hexRgb(k.color)},0.05);border:1px solid rgba(${_hexRgb(k.color)},0.2);border-radius:10px;cursor:pointer;text-align:left;color:#e5e7eb;">
          <div style="font-size:20px;margin-bottom:4px;">${k.icon}</div>
          <div style="font-size:13px;font-weight:700;color:${k.color};">${k.label}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${k.desc}</div>
        </button>
      `).join('')}
    </div>

    <div id="adj-form" style="display:none;">
      <input type="hidden" id="adj-kind" />
      <input type="hidden" id="adj-month" value="${monthStr}" />
      <div style="display:grid;grid-template-columns:1fr 130px;gap:8px;margin-bottom:8px;">
        <input id="adj-reason" type="text" placeholder="¿Qué pasó? Ej: 'Llanta ponchada'" style="padding:9px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <input id="adj-amount" type="number" step="0.01" placeholder="Monto MXN" style="padding:9px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;font-weight:700;"/>
      </div>
      <input id="adj-category" type="text" placeholder="Categoría (opcional, ej: transporte)" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;margin-bottom:8px;"/>
      <textarea id="adj-notes" placeholder="Notas adicionales (opcional)" rows="2" style="width:100%;padding:9px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;resize:vertical;margin-bottom:10px;"></textarea>
      <button id="adj-save" style="width:100%;padding:11px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:800;border-radius:8px;cursor:pointer;font-size:14px;">💾 Registrar reajuste</button>
    </div>

    <!-- Lista de ajustes ya registrados -->
    <div style="margin-top:18px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">Reajustes ya registrados en ${new Date(monthStr + '-01').toLocaleDateString('es-MX', { month: 'long' })}</div>
      <div id="adj-list" style="display:flex;flex-direction:column;gap:6px;"></div>
    </div>
  `

  document.body.appendChild(overlay)
  overlay.appendChild(modal)
  const cleanup = () => { document.body.removeChild(overlay); renderAFP() }
  modal.querySelector('#adj-close').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  // Pick kind
  modal.querySelectorAll('[data-adj-kind]').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.adjKind
      modal.querySelector('#adj-kind').value = kind
      modal.querySelectorAll('[data-adj-kind]').forEach(b => b.style.outline = '')
      btn.style.outline = '2px solid ' + (ADJUSTMENT_KINDS.find(k => k.id === kind)?.color || '#22d3ee')
      modal.querySelector('#adj-form').style.display = 'block'
      modal.querySelector('#adj-reason').focus()
    })
  })

  const renderList = async () => {
    const list = modal.querySelector('#adj-list')
    list.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:6px;">⏳</div>'
    try {
      const r = await _api('afp_adjustment_list', { month: monthStr })
      const items = r.items || []
      if (!items.length) {
        list.innerHTML = '<div style="color:#6b7280;font-size:12px;padding:6px;text-align:center;background:rgba(255,255,255,0.02);border-radius:6px;">Sin reajustes este mes.</div>'
        return
      }
      list.innerHTML = items.map(a => {
        const k = ADJUSTMENT_KINDS.find(x => x.id === a.kind) || ADJUSTMENT_KINDS[0]
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-left:3px solid ${k.color};border-radius:6px;font-size:12px;">
            <span style="font-size:16px;">${k.icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="color:#e5e7eb;font-weight:600;">${_esc(a.reason)}</div>
              <div style="color:#6b7280;font-size:10px;">${k.label}${a.category ? ' · ' + _esc(a.category) : ''} · ${new Date(a.created_at).toLocaleDateString('es-MX')}</div>
            </div>
            <span style="color:${k.color};font-weight:800;font-size:13px;">${a.kind === 'expense' ? '-' : '+'}$${Math.round(a.amount).toLocaleString('es-MX')}</span>
            <button data-del-adj="${a.id}" style="background:transparent;border:none;color:#6b7280;cursor:pointer;font-size:14px;padding:2px;">🗑</button>
          </div>
        `
      }).join('')
      list.querySelectorAll('[data-del-adj]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este reajuste?')) return
        try { await _api('afp_adjustment_delete', { id: b.dataset.delAdj }); renderList() }
        catch (e) { alert('⚠ ' + e.message) }
      }))
    } catch (e) {
      list.innerHTML = `<div style="color:#f87171;font-size:12px;">⚠ ${e.message}</div>`
    }
  }

  modal.querySelector('#adj-save').addEventListener('click', async () => {
    const kind = modal.querySelector('#adj-kind').value
    const reason = modal.querySelector('#adj-reason').value.trim()
    const amount = Number(modal.querySelector('#adj-amount').value)
    const category = modal.querySelector('#adj-category').value.trim() || null
    const notes = modal.querySelector('#adj-notes').value.trim() || null
    if (!kind) { alert('Elige un tipo'); return }
    if (!reason) { alert('Escribe el motivo'); return }
    if (!amount || amount <= 0) { alert('Pon un monto válido'); return }
    try {
      await _api('afp_adjustment_add', { month: monthStr, kind, amount, reason, category, notes })
      // Limpia form
      modal.querySelector('#adj-reason').value = ''
      modal.querySelector('#adj-amount').value = ''
      modal.querySelector('#adj-category').value = ''
      modal.querySelector('#adj-notes').value = ''
      modal.querySelector('#adj-form').style.display = 'none'
      modal.querySelectorAll('[data-adj-kind]').forEach(b => b.style.outline = '')
      renderList()
    } catch (e) { alert('⚠ ' + e.message) }
  })

  renderList()
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
      <div style="font-size:11px;color:#86efac;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;">⚡ Plantillas rápidas — clic para usar</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">
        ${TEMPLATES_INCOME.map(t => `<button data-tpl-income='${JSON.stringify(t).replace(/'/g, "&#39;")}' style="padding:4px 9px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#86efac;border-radius:14px;font-size:11px;cursor:pointer;font-weight:600;">+ ${t.name}</button>`).join('')}
      </div>
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
      <div style="font-size:11px;color:#fb923c;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;">⚡ Plantillas rápidas — clic para usar (luego pon monto)</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;max-height:140px;overflow-y:auto;">
        ${TEMPLATES_FIXED.map(t => `<button data-tpl-fixed='${JSON.stringify(t).replace(/'/g, "&#39;")}' style="padding:4px 9px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.25);color:#fb923c;border-radius:14px;font-size:11px;cursor:pointer;font-weight:600;">${t.icon} ${t.name}</button>`).join('')}
      </div>
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
      <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.25);border-radius:8px;margin-bottom:8px;cursor:pointer;">
        <input data-f="is_sacred" type="checkbox" style="width:16px;height:16px;accent-color:#fbbf24;"/>
        <div style="flex:1;">
          <div style="font-size:12px;color:#fde68a;font-weight:700;">🪙 Compromiso sagrado</div>
          <div style="font-size:10px;color:#94a3b8;line-height:1.4;">Intocable. Se separa <em>antes</em> de cualquier dispersión (ej. cripto $200/sem, ahorro fijo).</div>
        </div>
      </label>
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
      <div style="font-size:11px;color:#a78bfa;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;">⚡ Plantillas rápidas</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">
        ${TEMPLATES_PLAN.map(t => `<button data-tpl-plan='${JSON.stringify(t).replace(/'/g, "&#39;")}' style="padding:4px 9px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;border-radius:14px;font-size:11px;cursor:pointer;font-weight:600;">${t.icon} ${t.name}</button>`).join('')}
      </div>
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
    const sacredBadge = item.is_sacred ? ' <span style="font-size:9px;color:#fbbf24;background:rgba(251,191,36,0.15);padding:1px 6px;border-radius:4px;letter-spacing:1px;font-weight:700;">🪙 SAGRADO</span>' : ''
    main = `<strong>${_esc(item.name)}</strong>${sacredBadge}<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${FREQ_LABEL[item.frequency] || item.frequency}${item.due_day ? ' · día ' + item.due_day : ''}${item.category ? ' · ' + item.category : ''}</div>`
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
  // Click en plantilla → pre-llena el formulario
  const templateAttr = { incomes: 'data-tpl-income', fixed: 'data-tpl-fixed', plan: 'data-tpl-plan' }[tabId]
  if (templateAttr) {
    container.querySelectorAll('[' + templateAttr + ']').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          const tpl = JSON.parse(btn.getAttribute(templateAttr).replace(/&#39;/g, "'"))
          for (const [k, v] of Object.entries(tpl)) {
            const inp = container.querySelector(`[data-f="${k}"]`)
            if (inp) inp.value = v
          }
          // Focus en amount para que el usuario sólo escriba el número
          const amt = container.querySelector('[data-f="amount"]') || container.querySelector('[data-f="target_amount"]')
          if (amt) { amt.focus(); amt.select?.() }
        } catch {}
      })
    })
  }
  const addBtn = container.querySelector('[data-action="add"]')
  if (!addBtn) return
  addBtn.addEventListener('click', async () => {
    const payload = {}
    container.querySelectorAll('[data-f]').forEach(inp => {
      if (inp.type === 'checkbox') { payload[inp.dataset.f] = !!inp.checked; return }
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

// ── Modal del Colchón Fiat ────────────────────────────────────
async function _openCushionModal(data) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:8px;overflow-y:auto;`
  const modal = document.createElement('div')
  modal.style.cssText = `background:#0f1419;border:1px solid #1f2937;border-radius:16px;padding:18px;max-width:560px;width:100%;color:#e5e7eb;max-height:95vh;overflow-y:auto;`

  let cushion = null
  try {
    const r = await _api('afp_cushion_get'); cushion = r.cushion
  } catch (e) { cushion = { current_balance: 0, target_months: 3, account_label: null } }

  const monthlyFixed = data?.metrics?.monthly_fixed || 0
  const targetAmt = monthlyFixed * (Number(cushion.target_months) || 3)
  const cur = Number(cushion.current_balance || 0)

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <h3 style="margin:0;font-size:18px;font-weight:800;">🛡️ Colchón Fiat</h3>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Tu fondo de emergencia — depósitos y retiros con motivo.</p>
      </div>
      <button id="cush-close" style="background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;">×</button>
    </div>

    <!-- Configuración -->
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;margin-bottom:14px;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">Configuración</div>
      <div style="display:grid;grid-template-columns:1fr 110px;gap:8px;margin-bottom:6px;">
        <input id="cush-label" type="text" placeholder="Etiqueta (ej. BBVA débito)" value="${_esc(cushion.account_label || '')}" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
        <select id="cush-target-months" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;">
          ${[1,2,3,6,9,12].map(n => `<option value="${n}" ${n === (cushion.target_months || 3) ? 'selected':''}>${n} ${n===1?'mes':'meses'}</option>`).join('')}
        </select>
      </div>
      <div style="font-size:10px;color:#6b7280;margin-bottom:6px;">Meta automática: ${cushion.target_months || 3} meses × $${monthlyFixed.toLocaleString('es-MX')} fijos = <strong style="color:#34d399;">$${targetAmt.toLocaleString('es-MX')}</strong></div>
      <button id="cush-save-cfg" style="padding:7px 14px;background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.4);color:#22d3ee;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">💾 Guardar configuración</button>
    </div>

    <!-- Movimiento -->
    <div style="background:rgba(52,211,153,0.05);border:1px solid rgba(52,211,153,0.2);border-radius:10px;padding:12px;margin-bottom:14px;">
      <div style="font-size:11px;color:#34d399;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">Registrar movimiento</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <button data-cush-kind="deposit" style="padding:9px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#86efac;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">💵 Depositar</button>
        <button data-cush-kind="withdraw" style="padding:9px;background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.4);color:#fca5a5;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;">↗ Retirar</button>
      </div>
      <input type="hidden" id="cush-kind" />
      <div id="cush-form" style="display:none;">
        <div style="display:grid;grid-template-columns:1fr 130px;gap:6px;margin-bottom:6px;">
          <input id="cush-reason" type="text" placeholder="Motivo (ej: ahorro mensual junio)" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;"/>
          <input id="cush-amount" type="number" step="0.01" placeholder="Monto MXN" style="padding:8px;background:#1f2937;border:1px solid #374151;border-radius:6px;color:#e5e7eb;font-size:13px;font-weight:700;"/>
        </div>
        <button id="cush-save-mv" style="padding:9px 14px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;border-radius:6px;cursor:pointer;font-size:13px;font-weight:800;">💾 Guardar movimiento</button>
      </div>
    </div>

    <!-- Saldo y meta -->
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;margin-bottom:14px;text-align:center;">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Saldo actual</div>
      <div id="cush-balance-display" style="font-size:28px;font-weight:800;color:#34d399;margin-top:4px;">${_fmt(cur)}</div>
    </div>

    <!-- Histórico -->
    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:6px;">Movimientos recientes</div>
    <div id="cush-moves" style="display:flex;flex-direction:column;gap:6px;"></div>
  `

  document.body.appendChild(overlay)
  overlay.appendChild(modal)
  const cleanup = () => { document.body.removeChild(overlay); renderAFP() }
  modal.querySelector('#cush-close').addEventListener('click', cleanup)
  overlay.addEventListener('click', e => { if (e.target === overlay) cleanup() })

  modal.querySelectorAll('[data-cush-kind]').forEach(b => {
    b.addEventListener('click', () => {
      modal.querySelector('#cush-kind').value = b.dataset.cushKind
      modal.querySelector('#cush-form').style.display = 'block'
      modal.querySelectorAll('[data-cush-kind]').forEach(x => x.style.outline = '')
      b.style.outline = '2px solid ' + (b.dataset.cushKind === 'deposit' ? '#22c55e' : '#ef4444')
      modal.querySelector('#cush-reason').focus()
    })
  })

  modal.querySelector('#cush-save-cfg').addEventListener('click', async () => {
    const label = modal.querySelector('#cush-label').value.trim() || null
    const months = Number(modal.querySelector('#cush-target-months').value)
    try {
      await _api('afp_cushion_set', { account_label: label, target_months: months })
      alert('✓ Configuración guardada')
    } catch (e) { alert('⚠ ' + e.message) }
  })

  modal.querySelector('#cush-save-mv').addEventListener('click', async () => {
    const kind = modal.querySelector('#cush-kind').value
    const reason = modal.querySelector('#cush-reason').value.trim()
    const amount = Number(modal.querySelector('#cush-amount').value)
    if (!kind) { alert('Elige depositar o retirar'); return }
    if (!reason) { alert('Escribe el motivo'); return }
    if (!amount || amount <= 0) { alert('Monto > 0 requerido'); return }
    try {
      const r = await _api('afp_cushion_move', { kind, amount, reason })
      modal.querySelector('#cush-balance-display').textContent = _fmt(r.new_balance)
      modal.querySelector('#cush-reason').value = ''
      modal.querySelector('#cush-amount').value = ''
      modal.querySelector('#cush-form').style.display = 'none'
      modal.querySelectorAll('[data-cush-kind]').forEach(x => x.style.outline = '')
      renderMoves()
    } catch (e) { alert('⚠ ' + e.message) }
  })

  const renderMoves = async () => {
    const wrap = modal.querySelector('#cush-moves')
    wrap.innerHTML = '<div style="color:#6b7280;font-size:12px;text-align:center;padding:6px;">⏳</div>'
    try {
      const r = await _api('afp_cushion_moves_list')
      const moves = r.moves || []
      if (!moves.length) { wrap.innerHTML = '<div style="color:#6b7280;font-size:12px;text-align:center;padding:10px;background:rgba(255,255,255,0.02);border-radius:6px;">Sin movimientos aún.</div>'; return }
      wrap.innerHTML = moves.map(mv => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:6px;font-size:12px;">
          <span style="font-size:16px;">${mv.kind === 'deposit' ? '💵' : '↗'}</span>
          <div style="flex:1;min-width:0;">
            <div style="color:#e5e7eb;font-weight:600;">${_esc(mv.reason || '(sin motivo)')}</div>
            <div style="color:#6b7280;font-size:10px;">${new Date(mv.created_at).toLocaleString('es-MX')}</div>
          </div>
          <span style="font-weight:800;color:${mv.kind === 'deposit' ? '#22c55e' : '#ef4444'};">${mv.kind === 'deposit' ? '+' : '-'}${_fmt(mv.amount)}</span>
        </div>
      `).join('')
    } catch (e) { wrap.innerHTML = `<div style="color:#f87171;font-size:12px;">⚠ ${e.message}</div>` }
  }
  renderMoves()
}

if (typeof window !== 'undefined') {
  window.nexusAFP = { render: renderAFP }
}
