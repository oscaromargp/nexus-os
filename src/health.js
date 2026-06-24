// Nexus OS · Módulo Salud Física
//
// - Metas diarias (agua, pasos, ejercicio, sin azúcar) con barras + rachas
// - Estudios médicos con valores y tendencias en el tiempo
// - Recordatorio de próximo análisis
// - Resumen IA de análisis (Groq/Gemini, sin costo extra)

import { supabase } from './supabase.js'
import { renderGymTab } from './health-gym.js'
import { renderCycleTab } from './health-cycle.js'
import { heatmapDays } from './health-calc.js'

async function _api(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session) headers.Authorization = 'Bearer ' + session.access_token
  const r = await fetch('/api/health', { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.error || 'API fail')
  return j
}

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}
function _fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Catálogo de marcadores comunes (México) ────────────────────────
// Unidad + rango de referencia pre-cargados → captura manual de 1 toque.
// El usuario elige categoría y marcador; o usa "Otro…" para personalizado.
const HEALTH_CATS = [
  { id: 'vitales',   label: 'Signos vitales',        emoji: '🫀' },
  { id: 'antropo',   label: 'Peso y medidas',        emoji: '⚖️' },
  { id: 'biometria', label: 'Biometría hemática',    emoji: '🩸' },
  { id: 'quimica',   label: 'Química sanguínea',     emoji: '🧪' },
  { id: 'lipidos',   label: 'Perfil de lípidos',     emoji: '🩸' },
  { id: 'higado',    label: 'Función hepática',      emoji: '🫁' },
  { id: 'tiroides',  label: 'Tiroides',              emoji: '🦋' },
  { id: 'orina',     label: 'Examen de orina',       emoji: '💧' },
  { id: 'vitaminas', label: 'Vitaminas y minerales', emoji: '💊' },
  { id: 'otro',      label: 'Otro (personalizado)',  emoji: '✏️' },
]
const HEALTH_CAT_BY_ID = Object.fromEntries(HEALTH_CATS.map(c => [c.id, c]))

const HEALTH_MARKERS = [
  // Signos vitales
  { name: 'Presión arterial',     unit: 'mmHg',  low: 90,  high: 120, cat: 'vitales', dual: true, label2: 'Diastólica', low2: 60, high2: 80 },
  { name: 'Frecuencia cardiaca',  unit: 'lpm',   low: 60,  high: 100, cat: 'vitales' },
  { name: 'Saturación O₂',        unit: '%',     low: 95,  high: 100, cat: 'vitales' },
  { name: 'Temperatura',          unit: '°C',    low: 36,  high: 37.5, cat: 'vitales' },
  { name: 'Glucosa capilar',      unit: 'mg/dL', low: 70,  high: 100, cat: 'vitales' },
  // Peso y medidas
  { name: 'Peso',                 unit: 'kg',    cat: 'antropo' },
  { name: 'Estatura',             unit: 'cm',    cat: 'antropo' },
  { name: 'IMC',                  unit: 'kg/m²', low: 18.5, high: 24.9, cat: 'antropo' },
  { name: 'Cintura',              unit: 'cm',    cat: 'antropo' },
  { name: '% Grasa corporal',     unit: '%',     cat: 'antropo' },
  // Biometría hemática
  { name: 'Hemoglobina',          unit: 'g/dL',  low: 13.5, high: 17.5, cat: 'biometria' },
  { name: 'Hematocrito',          unit: '%',     low: 38,  high: 50, cat: 'biometria' },
  { name: 'Leucocitos',           unit: '10³/µL', low: 4,  high: 11, cat: 'biometria' },
  { name: 'Plaquetas',            unit: '10³/µL', low: 150, high: 450, cat: 'biometria' },
  // Química sanguínea
  { name: 'Glucosa en ayunas',    unit: 'mg/dL', low: 70,  high: 100, cat: 'quimica' },
  { name: 'Hemoglobina glucosilada (HbA1c)', unit: '%', low: 4, high: 5.6, cat: 'quimica' },
  { name: 'Urea',                 unit: 'mg/dL', low: 15,  high: 45, cat: 'quimica' },
  { name: 'Creatinina',           unit: 'mg/dL', low: 0.7, high: 1.3, cat: 'quimica' },
  { name: 'Ácido úrico',          unit: 'mg/dL', low: 3.5, high: 7.2, cat: 'quimica' },
  // Lípidos
  { name: 'Colesterol total',     unit: 'mg/dL', low: 0,   high: 200, cat: 'lipidos' },
  { name: 'Colesterol HDL',       unit: 'mg/dL', low: 40,  high: 200, cat: 'lipidos', higher: true },
  { name: 'Colesterol LDL',       unit: 'mg/dL', low: 0,   high: 100, cat: 'lipidos' },
  { name: 'Triglicéridos',        unit: 'mg/dL', low: 0,   high: 150, cat: 'lipidos' },
  // Hígado
  { name: 'AST / TGO',            unit: 'U/L',   low: 0,   high: 40, cat: 'higado' },
  { name: 'ALT / TGP',            unit: 'U/L',   low: 0,   high: 41, cat: 'higado' },
  { name: 'Bilirrubina total',    unit: 'mg/dL', low: 0.1, high: 1.2, cat: 'higado' },
  // Tiroides
  { name: 'TSH',                  unit: 'µUI/mL', low: 0.4, high: 4.0, cat: 'tiroides' },
  { name: 'T4 libre',             unit: 'ng/dL', low: 0.8, high: 1.8, cat: 'tiroides' },
  // Orina
  { name: 'pH urinario',          unit: '',      low: 4.5, high: 8, cat: 'orina' },
  { name: 'Densidad urinaria',    unit: '',      low: 1.005, high: 1.030, cat: 'orina' },
  // Vitaminas y minerales
  { name: 'Vitamina D',           unit: 'ng/mL', low: 30,  high: 100, cat: 'vitaminas' },
  { name: 'Vitamina B12',         unit: 'pg/mL', low: 200, high: 900, cat: 'vitaminas' },
  { name: 'Hierro sérico',        unit: 'µg/dL', low: 60,  high: 170, cat: 'vitaminas' },
  { name: 'Ferritina',            unit: 'ng/mL', low: 30,  high: 300, cat: 'vitaminas' },
]
const HEALTH_MARKER_BY_NAME = Object.fromEntries(HEALTH_MARKERS.map(m => [m.name, m]))
// Marcadores rápidos para los botones de acceso directo
const HEALTH_QUICK = ['Presión arterial', 'Peso', 'Glucosa en ayunas', 'Glucosa capilar']

let _healthTab = 'inicio'

export async function renderHealth() {
  const root = document.getElementById('view-salud') || document.getElementById('health-root')
  if (!root) return
  root.innerHTML = `
    <div style="padding:20px;max-width:1000px;margin:0 auto;">
      <h2 style="font-size:24px;font-weight:800;margin:0 0 4px;display:flex;align-items:center;gap:10px;">🩺 Salud</h2>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 14px;">Mide para mejorar — análisis, hábitos, gym y ciclo en un solo lugar.</p>
      <div style="display:flex;gap:4px;margin-bottom:18px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:4px;">
        ${[['inicio', '🏠 Inicio'], ['general', '📊 General'], ['gym', '🏋️ Gym'], ['ciclo', '🩸 Ciclo']].map(([t, lbl]) => {
          const on = _healthTab === t
          return `<button data-health-tab="${t}" style="flex:1;padding:9px 4px;border:none;border-radius:9px;cursor:pointer;font-size:12px;font-weight:700;background:${on ? 'rgba(52,211,153,0.15)' : 'transparent'};color:${on ? '#34d399' : '#94a3b8'};white-space:nowrap;">${lbl}</button>`
        }).join('')}
      </div>
      <div id="health-tab-body"><div style="padding:24px;color:#94a3b8;font-size:13px;">⏳ Cargando…</div></div>
    </div>`
  root.querySelectorAll('[data-health-tab]').forEach(b => b.addEventListener('click', () => {
    _healthTab = b.dataset.healthTab
    renderHealth()
  }))
  const body = root.querySelector('#health-tab-body')
  if (_healthTab === 'gym')   { renderGymTab(body); return }
  if (_healthTab === 'ciclo') { renderCycleTab(body); return }
  if (_healthTab === 'general') { _renderGeneralTab(body); return }
  _renderOverviewTab(body)
}

// Navega a otra pestaña desde el dashboard
function _goHealthTab(tab) { _healthTab = tab; renderHealth() }

// ── Dashboard de Inicio: resumen de todas las áreas ──
async function _renderOverviewTab(body) {
  body.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px;">⏳ Cargando tu resumen…</div>'
  let d
  try { d = await _api('health_overview') }
  catch (e) { body.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${_esc(e.message)}</div>`; return }

  const { vitals, habits, gym, cycle, has_cycle } = d
  const card = (tab, icon, title, bigHtml, subHtml, accent) => `
    <div data-go-tab="${tab}" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;cursor:pointer;transition:border-color .2s;" onmouseover="this.style.borderColor='${accent}55'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
      <div style="display:flex;align-items:center;gap:7px;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:8px;">${icon} ${title}<span style="margin-left:auto;color:#475569;">›</span></div>
      <div style="font-size:22px;font-weight:800;color:#e5e7eb;font-family:'JetBrains Mono',monospace;line-height:1.1;">${bigHtml}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:3px;">${subHtml}</div>
    </div>`

  // Vitales
  const v = vitals || {}
  let vBig = '—', vSub = 'sin registros aún'
  if (v.presion) { vBig = `${v.presion.value}/${v.presion.value2 ?? ''}`; vSub = `presión · <span style="color:${v.presion.in_range ? '#34d399' : '#f87171'}">${v.presion.in_range ? 'en rango' : 'fuera'}</span>` }
  else if (v.peso) { vBig = `${v.peso.value} <span style="font-size:12px;color:#94a3b8;">kg</span>`; vSub = 'peso' }
  else if (v.glucosa) { vBig = `${v.glucosa.value}`; vSub = `glucosa · <span style="color:${v.glucosa.in_range ? '#34d399' : '#f87171'}">${v.glucosa.in_range ? 'en rango' : 'fuera'}</span>` }
  const vExtra = []
  if (v.peso && v.presion) vExtra.push(`Peso ${v.peso.value}kg`)
  if (v.glucosa && (v.presion || v.peso)) vExtra.push(`Gluc ${v.glucosa.value}`)
  if (vExtra.length) vSub += ` · ${vExtra.join(' · ')}`

  // Hábitos
  const h = habits || { done: 0, total: 0, best_streak: 0 }
  const hBig = `${h.done} / ${h.total || 0}`
  const hSub = h.total ? `de hoy · 🔥 racha ${h.best_streak} días` : 'sin hábitos aún'

  // Gym
  const g = gym || { workouts_7d: 0, top: null }
  const gBig = `${g.workouts_7d}`
  const gSub = g.top ? `entrenos · 7d · 🏆 ${_esc(g.top.exercise)} ${g.top.weight}kg` : 'entrenos · últimos 7 días'

  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;">`
  html += card('general', '🫀', 'Vitales', vBig, vSub, '#34d399')
  html += card('general', '🔥', 'Hábitos', hBig, hSub, '#fb923c')
  html += card('gym', '🏋️', 'Gym', gBig, gSub, '#60a5fa')
  if (has_cycle && cycle) {
    html += card('ciclo', '🩸', 'Ciclo', `Día ${cycle.day_of_cycle}`, `${_esc(cycle.phase)} · próximo en ${cycle.days_to_next}d`, '#f472b6')
  } else {
    html += card('ciclo', '🩸', 'Ciclo', '—', 'registra tu periodo', '#f472b6')
  }
  html += `</div>`

  // Accesos rápidos
  html += `
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button data-ov-act="valor" style="flex:1;min-width:120px;padding:11px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;">+ Registrar valor</button>
      <button data-ov-act="foto" style="flex:1;min-width:120px;padding:11px;background:linear-gradient(135deg,rgba(167,139,250,0.18),rgba(96,165,250,0.18));border:1px solid rgba(167,139,250,0.4);color:#c4b5fd;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;">📷 Foto → IA</button>
      <button data-ov-act="entreno" style="flex:1;min-width:110px;padding:11px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;">🏋️ Entreno</button>
    </div>`

  body.innerHTML = html
  body.querySelectorAll('[data-go-tab]').forEach(c => c.addEventListener('click', () => _goHealthTab(c.dataset.goTab)))
  body.querySelector('[data-ov-act="valor"]')?.addEventListener('click', () => { _healthTab = 'general'; renderHealth().then(() => setTimeout(() => _openReadingModal(), 60)) })
  body.querySelector('[data-ov-act="foto"]')?.addEventListener('click', () => { _healthTab = 'general'; renderHealth().then(() => setTimeout(() => _openPhotoAiModal(), 60)) })
  body.querySelector('[data-ov-act="entreno"]')?.addEventListener('click', () => _goHealthTab('gym'))
}

async function _renderGeneralTab(body) {
  body.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px;">⏳ Cargando tu salud…</div>'

  let d
  try {
    d = (await _api('health_dashboard'))
    // Siembra metas por defecto si no hay
    if (!d.goals.length) {
      await _api('health_goal_seed').catch(() => {})
      d = (await _api('health_dashboard'))
    }
  } catch (e) {
    body.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${_esc(e.message)}</div>`
    return
  }

  const { goals, today_progress, studies, trends, streaks, next_checkup, logs = [] } = d

  // ── Acción: analizar con IA ──
  let html = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
        <button id="health-ai-btn" style="padding:9px 16px;background:linear-gradient(135deg,#34d399,#10b981);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">✨ Analizar mis estudios con IA</button>
      </div>`

  // ── Recordatorio de próximo análisis ──
  if (next_checkup) {
    const days = Math.ceil((new Date(next_checkup.next_checkup_date) - new Date()) / 86400000)
    html += `
      <div style="background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.25);border-radius:12px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:22px;">🔔</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#60a5fa;">Próximo análisis: ${_esc(next_checkup.title)}</div>
          <div style="font-size:12px;color:#94a3b8;">${_fmtDate(next_checkup.next_checkup_date)} · ${days > 0 ? 'en ' + days + ' días' : 'hoy'}</div>
        </div>
      </div>`
  }

  // ── Rachas ──
  const streakEntries = Object.entries(streaks).filter(([, s]) => s.current > 0 || s.record > 0)
  if (streakEntries.length) {
    html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
      ${streakEntries.map(([, s]) => `
        <div style="flex:1;min-width:130px;padding:10px 12px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.25);border-radius:10px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:20px;">🔥</span>
          <div>
            <div style="font-size:17px;font-weight:800;color:#fb923c;font-family:'JetBrains Mono',monospace;line-height:1;">${s.current} <span style="font-size:10px;color:#94a3b8;font-weight:500;">días</span></div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${_esc(s.emoji||'')} ${_esc(s.label)} · récord ${s.record}</div>
          </div>
        </div>`).join('')}
    </div>`
  }

  // ── Metas diarias de hoy ──
  html += `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:18px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;color:#e5e7eb;">📅 Metas de hoy</div>
        <button id="health-goal-add" style="font-size:12px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">+ Meta</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${goals.length ? goals.map(g => {
          const cur = Number(today_progress[g.kind] || 0)
          const tgt = Number(g.target || 1)
          const tt  = g.target_type || 'count'
          const pct = Math.min(100, Math.round((cur / tgt) * 100))
          const done = cur >= tgt
          const color = done ? '#34d399' : '#22d3ee'
          const step = tt === 'time' ? 5 : (g.kind==='steps' ? 500 : g.kind==='exercise' ? 5 : 1)
          // Tipo de hábito determina los controles
          let controls
          if (tt === 'binary') {
            controls = `
              <button data-health-toggle="${g.kind}" data-done="${done?1:0}" style="flex:1;padding:8px;background:${done?'rgba(52,211,153,0.15)':'rgba(255,255,255,0.04)'};border:1px solid ${done?'rgba(52,211,153,0.4)':'rgba(255,255,255,0.12)'};color:${done?'#34d399':'#94a3b8'};border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;">${done?'✓ Hecho hoy':'Marcar hecho'}</button>`
          } else {
            controls = `
              <button data-health-inc="${g.kind}" data-step="${step}" data-cur="${cur}" style="padding:5px 12px;background:${color}20;border:1px solid ${color}50;color:${color};border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;">+ ${step}</button>
              <button data-health-set="${g.kind}" data-tgt="${tgt}" data-cur="${cur}" style="padding:5px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:7px;cursor:pointer;font-size:12px;">✎ Ajustar</button>
              ${!done ? `<button data-health-done="${g.kind}" data-tgt="${tgt}" style="padding:5px 10px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);color:#34d399;border-radius:7px;cursor:pointer;font-size:12px;">✓ Cumplir</button>` : ''}`
          }
          return `
            <div style="padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid ${done?'rgba(52,211,153,0.3)':'rgba(255,255,255,0.06)'};border-radius:10px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <div style="font-size:13px;font-weight:700;color:#e5e7eb;display:flex;align-items:center;gap:6px;">${_esc(g.emoji||'🎯')} ${_esc(g.label)} ${done?'<span style="font-size:11px;color:#34d399;">✓</span>':''}</div>
                <div style="font-size:13px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;">${tt==='binary' ? (done?'Hecho':'Pendiente') : cur + ' / ' + tgt + ' <span style="font-size:10px;color:#94a3b8;">' + _esc(g.unit||'') + '</span>'}</div>
              </div>
              ${tt!=='binary' ? `<div style="height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;margin-bottom:8px;"><div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width 0.4s;"></div></div>` : ''}
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                ${controls}
                <button data-health-goal-del="${g.id}" title="Eliminar meta" style="margin-left:auto;background:none;border:none;color:#475569;cursor:pointer;font-size:13px;">🗑</button>
              </div>
            </div>`
        }).join('') : '<div style="font-size:12px;color:#6b7280;text-align:center;padding:14px;">Sin metas. Agrega una arriba.</div>'}
      </div>
    </div>`

  // ── Constancia (heatmap estilo GitHub) ──
  if (goals.length && logs.length) {
    html += _renderHabitHeatmaps(goals, logs)
  }

  // ── Registro rápido (1 toque) ──
  html += `
    <div style="background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.18);border-radius:14px;padding:14px 16px;margin-bottom:18px;">
      <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:10px;">⚡ Registro rápido</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${HEALTH_QUICK.map(name => {
          const m = HEALTH_MARKER_BY_NAME[name]
          const cat = m ? HEALTH_CAT_BY_ID[m.cat] : null
          return `<button data-health-quick="${_esc(name)}" style="padding:9px 14px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;">${cat?cat.emoji:'📈'} ${_esc(name)}</button>`
        }).join('')}
        <button data-health-quick="" style="padding:9px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">+ Otro valor</button>
        <button id="health-photo-ai" style="padding:9px 14px;background:linear-gradient(135deg,rgba(167,139,250,0.18),rgba(96,165,250,0.18));border:1px solid rgba(167,139,250,0.4);color:#c4b5fd;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;">📷 Foto del estudio → IA</button>
      </div>
    </div>`

  // ── Tendencias de análisis ──
  const trendMarkers = Object.keys(trends)
  if (trendMarkers.length) {
    html += `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:18px;">
        <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">📈 Tendencias de tus análisis</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${trendMarkers.map(marker => {
            const series = trends[marker]
            const last = series[series.length - 1]
            const prev = series.length > 1 ? series[series.length - 2] : null
            const delta = prev ? last.value - prev.value : 0
            const inRange = (last.ref_low == null || last.value >= last.ref_low) && (last.ref_high == null || last.value <= last.ref_high)
            const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→'
            const arrowColor = delta === 0 ? '#94a3b8' : '#cbd5e1'
            // mini sparkline con barras
            const max = Math.max(...series.map(s => s.value)) || 1
            const spark = series.slice(-12).map(s => {
              const h = Math.max(4, Math.round((s.value / max) * 32))
              const inR = (s.ref_low == null || s.value >= s.ref_low) && (s.ref_high == null || s.value <= s.ref_high)
              return `<div title="${s.value} · ${_fmtDate(s.date)}" style="width:8px;height:${h}px;background:${inR?'#34d399':'#f87171'};border-radius:2px;"></div>`
            }).join('')
            return `
              <div style="padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                  <div style="flex:1;min-width:140px;">
                    <div style="font-size:13px;font-weight:700;color:#e5e7eb;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${_esc(marker)}${last.source==='photo_ai'?'<span style="font-size:9px;background:rgba(167,139,250,0.15);color:#a78bfa;padding:1px 5px;border-radius:4px;">📷 IA</span>':''}</div>
                    <div style="font-size:18px;font-weight:800;color:${inRange?'#34d399':'#f87171'};font-family:'JetBrains Mono',monospace;">
                      ${last.value2 != null ? last.value + '/' + last.value2 : last.value} <span style="font-size:11px;color:#94a3b8;">${_esc(last.unit||'')}</span>
                      ${prev ? `<span style="font-size:12px;color:${arrowColor};margin-left:6px;">${arrow} ${Math.abs(delta).toFixed(1)}</span>` : ''}
                      ${inRange ? '<span style="font-size:11px;color:#34d399;margin-left:6px;">✓ en rango</span>' : '<span style="font-size:11px;color:#f87171;margin-left:6px;">⚠ fuera</span>'}
                    </div>
                    <div style="font-size:10px;color:#94a3b8;">${last.ref_low!=null||last.ref_high!=null ? `Rango: ${last.ref_low??'?'}–${last.ref_high??'?'} · ` : ''}${_fmtDate(last.date)}</div>
                  </div>
                  <div style="display:flex;align-items:flex-end;gap:3px;height:36px;">${spark}</div>
                </div>
              </div>`
          }).join('')}
        </div>
        <button id="health-reading-add" style="margin-top:12px;width:100%;padding:8px;background:rgba(34,211,238,0.08);border:1px dashed rgba(34,211,238,0.3);color:#22d3ee;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">+ Registrar valor (glucosa, colesterol, etc.)</button>
      </div>`
  } else {
    html += `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:18px;text-align:center;">
        <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:8px;">📈 Tendencias de análisis</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">Aún no registras valores. Agrega tu glucosa, colesterol, etc. para ver tendencias.</div>
        <button id="health-reading-add" style="padding:8px 16px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.25);color:#22d3ee;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">+ Registrar primer valor</button>
      </div>`
  }

  // ── Estudios médicos ──
  html += `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;color:#e5e7eb;">📄 Mis estudios médicos</div>
        <button id="health-study-add" style="font-size:12px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">+ Estudio</button>
      </div>
      ${studies.length ? `<div style="display:flex;flex-direction:column;gap:8px;">
        ${studies.map(s => `
          <div style="padding:11px 13px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span style="font-size:18px;">📄</span>
              <div style="flex:1;min-width:160px;">
                <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_esc(s.title)}</div>
                <div style="font-size:11px;color:#94a3b8;">${s.study_date?_fmtDate(s.study_date):'sin fecha'}${s.next_checkup_date?' · 🔔 repetir '+_fmtDate(s.next_checkup_date):''}</div>
              </div>
              ${s.file_url?`<a href="${_esc(s.file_url)}" target="_blank" style="font-size:11px;color:#22d3ee;text-decoration:none;">↗ Ver</a>`:''}
              <button data-health-study-del="${s.id}" style="background:none;border:none;color:#475569;cursor:pointer;font-size:13px;">🗑</button>
            </div>
            ${s.ai_summary?`<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:11px;color:#34d399;font-weight:600;">✨ Resumen IA</summary><div style="font-size:12px;color:#cbd5e1;line-height:1.6;margin-top:6px;white-space:pre-wrap;">${_esc(s.ai_summary)}</div></details>`:''}
          </div>`).join('')}
      </div>` : '<div style="font-size:12px;color:#6b7280;text-align:center;padding:14px;">Sube tu primer estudio para guardarlo + analizarlo con IA.</div>'}
    </div>`

  body.innerHTML = html
  _bindHealth(body)
  if (window.refreshIcons) window.refreshIcons()
}

// Heatmap estilo GitHub: una cuadrícula por meta (16 semanas). Verde = cumplido.
function _renderHabitHeatmaps(goals, logs) {
  const byKind = {}
  for (const l of logs) { (byKind[l.k] = byKind[l.k] || {})[l.d] = l.v }

  // Días del grid (UTC, a prueba de DST) — lógica testeada en health-calc.js
  const WEEKS = 16
  const { days } = heatmapDays(new Date(), WEEKS)

  let html = `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:18px;">
      <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">🔥 Tu constancia <span style="font-size:11px;color:#64748b;font-weight:500;">· últimas ${WEEKS} semanas</span></div>
      <div style="display:flex;flex-direction:column;gap:14px;">`

  for (const g of goals) {
    const done = byKind[g.kind] || {}
    const tgt = Number(g.target || 1)
    const cols = []
    let week = []
    days.forEach((day, i) => {
      const v = done[day.ds]
      const has = v != null
      const did = has && tgt > 0 && v >= tgt
      const bg = day.future ? 'transparent' : did ? '#34d399' : has ? 'rgba(52,211,153,0.28)' : 'rgba(255,255,255,0.05)'
      week.push(`<div title="${day.ds}${has ? ' · ' + v : ''}" style="width:11px;height:11px;border-radius:2px;background:${bg};"></div>`)
      if (i % 7 === 6) { cols.push(`<div style="display:flex;flex-direction:column;gap:3px;">${week.join('')}</div>`); week = [] }
    })
    if (week.length) cols.push(`<div style="display:flex;flex-direction:column;gap:3px;">${week.join('')}</div>`)
    html += `
      <div>
        <div style="font-size:12px;color:#cbd5e1;margin-bottom:6px;font-weight:600;">${_esc(g.emoji || '🎯')} ${_esc(g.label)}</div>
        <div style="display:flex;gap:3px;overflow-x:auto;padding-bottom:2px;">${cols.join('')}</div>
      </div>`
  }
  html += `</div>
      <div style="font-size:10px;color:#64748b;margin-top:10px;display:flex;align-items:center;gap:6px;">
        Menos <span style="width:10px;height:10px;border-radius:2px;background:rgba(255,255,255,0.05);"></span>
        <span style="width:10px;height:10px;border-radius:2px;background:rgba(52,211,153,0.28);"></span>
        <span style="width:10px;height:10px;border-radius:2px;background:#34d399;"></span> Más · verde = cumplido
      </div>
    </div>`
  return html
}

function _bindHealth(root) {
  // Incrementar progreso de meta
  root.querySelectorAll('[data-health-inc]').forEach(b => b.addEventListener('click', async () => {
    const kind = b.dataset.healthInc
    const step = Number(b.dataset.step)
    const cur  = Number(b.dataset.cur)
    try { await _api('health_log_set', { goal_kind: kind, value: cur + step }); renderHealth() }
    catch (e) { alert('⚠ ' + e.message) }
  }))
  // Cumplir meta (poner al 100%)
  root.querySelectorAll('[data-health-done]').forEach(b => b.addEventListener('click', async () => {
    try { await _api('health_log_set', { goal_kind: b.dataset.healthDone, value: Number(b.dataset.tgt) }); renderHealth() }
    catch (e) { alert('⚠ ' + e.message) }
  }))
  // Hábito binario: alterna hecho/no-hecho hoy
  root.querySelectorAll('[data-health-toggle]').forEach(b => b.addEventListener('click', async () => {
    const next = b.dataset.done === '1' ? 0 : 1
    try { await _api('health_log_set', { goal_kind: b.dataset.healthToggle, value: next }); renderHealth() }
    catch (e) { alert('⚠ ' + e.message) }
  }))
  // Ajustar valor manual
  root.querySelectorAll('[data-health-set]').forEach(b => b.addEventListener('click', async () => {
    const v = prompt('Valor de hoy:', b.dataset.cur)
    if (v === null) return
    try { await _api('health_log_set', { goal_kind: b.dataset.healthSet, value: Number(v) || 0 }); renderHealth() }
    catch (e) { alert('⚠ ' + e.message) }
  }))
  // Eliminar meta
  root.querySelectorAll('[data-health-goal-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta meta?')) return
    try { await _api('health_goal_delete', { id: b.dataset.healthGoalDel }); renderHealth() }
    catch (e) { alert('⚠ ' + e.message) }
  }))
  // Eliminar estudio
  root.querySelectorAll('[data-health-study-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este estudio?')) return
    try { await _api('health_study_delete', { id: b.dataset.healthStudyDel }); renderHealth() }
    catch (e) { alert('⚠ ' + e.message) }
  }))
  // Registro rápido (preselecciona marcador)
  root.querySelectorAll('[data-health-quick]').forEach(b => b.addEventListener('click', () => {
    _openReadingModal(b.dataset.healthQuick || undefined)
  }))
  root.querySelector('#health-goal-add')?.addEventListener('click', _openGoalModal)
  root.querySelector('#health-reading-add')?.addEventListener('click', () => _openReadingModal())
  root.querySelector('#health-study-add')?.addEventListener('click', _openStudyModal)
  root.querySelector('#health-ai-btn')?.addEventListener('click', _openAiModal)
  root.querySelector('#health-photo-ai')?.addEventListener('click', _openPhotoAiModal)
}

function _modal(inner, maxW = 420) {
  const ov = document.createElement('div')
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
  ov.innerHTML = `<div style="background:#0f1419;border:1px solid #1f2937;border-radius:14px;padding:20px;max-width:${maxW}px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">${inner}</div>`
  document.body.appendChild(ov)
  ov.addEventListener('click', e => { if (e.target === ov) document.body.removeChild(ov) })
  return { ov, close: () => { try { document.body.removeChild(ov) } catch {} } }
}
const _inputCss = 'width:100%;padding:9px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e5e7eb;font-size:13px;margin-top:4px;box-sizing:border-box;'

function _openGoalModal() {
  const { ov, close } = _modal(`
    <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">🎯 Nuevo hábito</h3>
    <label style="font-size:12px;color:#94a3b8;">Tipo de hábito</label>
    <select id="hg-type" style="${_inputCss}">
      <option value="binary">✓ Sí / No (lo hice o no)</option>
      <option value="count" selected>🔢 Contar (vasos, pasos…)</option>
      <option value="time">⏱️ Tiempo (minutos)</option>
    </select>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;margin-top:8px;align-items:end;">
      <label style="font-size:12px;color:#94a3b8;">Emoji <input id="hg-emoji" value="🎯" style="${_inputCss};width:64px;text-align:center;"/></label>
      <label style="font-size:12px;color:#94a3b8;">Nombre <input id="hg-label" placeholder="Meditar" style="${_inputCss}"/></label>
    </div>
    <div id="hg-target-wrap" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
      <label style="font-size:12px;color:#94a3b8;">Meta diaria <input id="hg-target" type="number" inputmode="decimal" placeholder="10" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Unidad <input id="hg-unit" placeholder="min" style="${_inputCss}"/></label>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="hg-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="hg-save" style="flex:1;padding:9px;background:#34d399;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Agregar</button>
    </div>`)
  const $ = id => ov.querySelector('#' + id)
  // El tipo binario no necesita meta/unidad
  $('hg-type').addEventListener('change', () => {
    $('hg-target-wrap').style.display = $('hg-type').value === 'binary' ? 'none' : 'grid'
  })
  $('hg-cancel').onclick = close
  $('hg-save').onclick = async () => {
    const label = $('hg-label').value.trim()
    const type = $('hg-type').value
    const target = Number($('hg-target').value)
    if (!label) { alert('Escribe el nombre del hábito'); return }
    if (type !== 'binary' && !target) { alert('Pon la meta diaria'); return }
    const kind = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20)
    try {
      await _api('health_goal_add', {
        kind, label, target_type: type,
        target: type === 'binary' ? 1 : target,
        unit: type === 'binary' ? 'sí' : $('hg-unit').value.trim(),
        emoji: $('hg-emoji').value.trim() || '🎯',
      })
      close(); renderHealth()
    } catch (e) { alert('⚠ ' + e.message) }
  }
}

// preselectName: abre el modal con un marcador ya elegido (botones rápidos)
function _openReadingModal(preselectName) {
  const today = new Date().toISOString().slice(0, 10)
  const pre = preselectName ? HEALTH_MARKER_BY_NAME[preselectName] : null
  const preCat = pre ? pre.cat : 'vitales'

  const catOpts = HEALTH_CATS.map(c => `<option value="${c.id}" ${c.id === preCat ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('')

  const { ov, close } = _modal(`
    <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;">📈 Registrar valor</h3>
    <p style="margin:0 0 12px;font-size:11px;color:#94a3b8;">Elige el estudio y el valor — la unidad y el rango se llenan solos.</p>

    <label style="font-size:12px;color:#94a3b8;">Categoría</label>
    <select id="hr-cat" style="${_inputCss}">${catOpts}</select>

    <div id="hr-marker-wrap" style="margin-top:8px;">
      <label style="font-size:12px;color:#94a3b8;">Marcador</label>
      <select id="hr-marker-sel" style="${_inputCss}"></select>
    </div>
    <div id="hr-custom-wrap" style="margin-top:8px;display:none;">
      <label style="font-size:12px;color:#94a3b8;">Nombre del marcador <input id="hr-marker-custom" placeholder="Ej: Proteína C reactiva" style="${_inputCss}"/></label>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
      <label style="font-size:12px;color:#94a3b8;"><span id="hr-value-lbl">Valor</span> <input id="hr-value" type="number" step="any" inputmode="decimal" placeholder="95" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Unidad <input id="hr-unit" placeholder="mg/dL" style="${_inputCss}"/></label>
    </div>
    <div id="hr-value2-wrap" style="margin-top:8px;display:none;">
      <label style="font-size:12px;color:#94a3b8;"><span id="hr-value2-lbl">Diastólica</span> <input id="hr-value2" type="number" step="any" inputmode="decimal" placeholder="80" style="${_inputCss}"/></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
      <label style="font-size:12px;color:#94a3b8;">Rango mín <input id="hr-low" type="number" step="any" placeholder="70" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Rango máx <input id="hr-high" type="number" step="any" placeholder="100" style="${_inputCss}"/></label>
    </div>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Fecha <input id="hr-date" type="date" value="${today}" style="${_inputCss}"/></label>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="hr-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="hr-save" style="flex:1;padding:9px;background:#22d3ee;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Guardar</button>
    </div>`, 440)

  const $ = id => ov.querySelector('#' + id)
  const catSel = $('hr-cat'), markerSel = $('hr-marker-sel')

  // Rellena el <select> de marcadores según la categoría
  function fillMarkers() {
    const cat = catSel.value
    if (cat === 'otro') {
      $('hr-marker-wrap').style.display = 'none'
      $('hr-custom-wrap').style.display = 'block'
      applyMarker(null)
      return
    }
    $('hr-marker-wrap').style.display = 'block'
    $('hr-custom-wrap').style.display = 'none'
    const list = HEALTH_MARKERS.filter(m => m.cat === cat)
    markerSel.innerHTML = list.map(m => `<option value="${_esc(m.name)}">${_esc(m.name)}</option>`).join('')
    if (pre && pre.cat === cat) markerSel.value = pre.name
    applyMarker(HEALTH_MARKER_BY_NAME[markerSel.value])
  }

  // Auto-llena unidad/rango y muestra 2do valor si es presión
  function applyMarker(m) {
    if (m) {
      $('hr-unit').value = m.unit || ''
      $('hr-low').value  = m.low != null ? m.low : ''
      $('hr-high').value = m.high != null ? m.high : ''
      if (m.dual) {
        $('hr-value2-wrap').style.display = 'block'
        $('hr-value-lbl').textContent = 'Sistólica'
        $('hr-value2-lbl').textContent = m.label2 || 'Diastólica'
      } else {
        $('hr-value2-wrap').style.display = 'none'
        $('hr-value-lbl').textContent = 'Valor'
      }
    } else {
      $('hr-value2-wrap').style.display = 'none'
      $('hr-value-lbl').textContent = 'Valor'
    }
  }

  catSel.addEventListener('change', fillMarkers)
  markerSel.addEventListener('change', () => applyMarker(HEALTH_MARKER_BY_NAME[markerSel.value]))
  fillMarkers()

  $('hr-cancel').onclick = close
  $('hr-save').onclick = async () => {
    const isCustom = catSel.value === 'otro'
    const marker = isCustom ? $('hr-marker-custom').value.trim() : markerSel.value
    const value = $('hr-value').value
    if (!marker) { alert('Escribe el nombre del marcador'); return }
    if (value === '') { alert('Falta el valor'); return }
    const def = HEALTH_MARKER_BY_NAME[marker]
    try {
      await _api('health_reading_add', {
        marker,
        value: Number(value),
        value2: $('hr-value2-wrap').style.display !== 'none' ? ($('hr-value2').value || null) : null,
        unit: $('hr-unit').value.trim(),
        category: isCustom ? 'otro' : catSel.value,
        source: 'manual',
        ref_low: $('hr-low').value || null,
        ref_high: $('hr-high').value || null,
        measured_at: $('hr-date').value,
      })
      close(); renderHealth()
    } catch (e) { alert('⚠ ' + e.message) }
  }
}

function _openStudyModal() {
  const today = new Date().toISOString().slice(0, 10)
  const { close } = _modal(`
    <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">📄 Nuevo estudio</h3>
    <label style="font-size:12px;color:#94a3b8;">Título <input id="hs-title" placeholder="Biometría hemática" style="${_inputCss}"/></label>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Fecha del estudio <input id="hs-date" type="date" value="${today}" style="${_inputCss}"/></label>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Link al PDF/foto (opcional) <input id="hs-url" type="url" placeholder="https://drive.google.com/..." style="${_inputCss}"/></label>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">🔔 Recordar repetir el <input id="hs-next" type="date" style="${_inputCss}"/></label>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Notas <input id="hs-notes" placeholder="Ayuno 12h" style="${_inputCss}"/></label>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="hs-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="hs-save" style="flex:1;padding:9px;background:#60a5fa;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Guardar</button>
    </div>`)
  document.getElementById('hs-cancel').onclick = close
  document.getElementById('hs-save').onclick = async () => {
    const title = document.getElementById('hs-title').value.trim()
    if (!title) { alert('Título requerido'); return }
    try {
      await _api('health_study_add', {
        title, study_date: document.getElementById('hs-date').value || null,
        file_url: document.getElementById('hs-url').value.trim() || null,
        next_checkup_date: document.getElementById('hs-next').value || null,
        notes: document.getElementById('hs-notes').value.trim() || null,
      })
      close(); renderHealth()
    } catch (e) { alert('⚠ ' + e.message) }
  }
}

// Consentimiento para enviar datos de salud a la IA (Groq/Gemini). Opt-in,
// se recuerda en localStorage. Devuelve Promise<boolean>.
function _aiConsent() {
  return new Promise(resolve => {
    try { if (localStorage.getItem('nexus_health_ai_consent') === '1') return resolve(true) } catch {}
    const { ov, close } = _modal(`
      <h3 style="margin:0 0 10px;font-size:16px;font-weight:800;">🔒 Antes de usar la IA</h3>
      <p style="font-size:12px;color:#cbd5e1;line-height:1.6;margin:0 0 10px;">
        Para leer o resumir tu estudio, Nexus envía <b>el texto o la imagen de ese análisis</b> a un proveedor de IA
        (<b>Google Gemini</b> o <b>Groq</b>), que lo procesa y devuelve el resultado.
      </p>
      <ul style="font-size:12px;color:#94a3b8;line-height:1.7;margin:0 0 12px;padding-left:18px;">
        <li>Solo se envía lo que tú subes en ese momento.</li>
        <li>No se comparte con nadie más ni se publica.</li>
        <li>Puedes seguir registrando todo <b>a mano</b>, sin IA.</li>
      </ul>
      <p style="font-size:11px;color:#64748b;margin:0 0 14px;">Las lecturas de la IA son estimaciones, no un diagnóstico médico.</p>
      <div style="display:flex;gap:8px;">
        <button id="aic-no" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
        <button id="aic-yes" style="flex:2;padding:9px;background:#34d399;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Acepto, continuar</button>
      </div>`, 440)
    ov.querySelector('#aic-no').onclick = () => { close(); resolve(false) }
    ov.querySelector('#aic-yes').onclick = () => { try { localStorage.setItem('nexus_health_ai_consent', '1') } catch {} ; close(); resolve(true) }
  })
}

// Reescala una imagen a máx 1400px y la devuelve como base64 JPEG (q0.72).
// Evita subir fotos de varios MB (límite de Vercel) y acelera la IA.
function _downscaleImage(file, maxSide = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width: w, height: h } = img
      if (Math.max(w, h) > maxSide) {
        const r = maxSide / Math.max(w, h)
        w = Math.round(w * r); h = Math.round(h * r)
      }
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No pude leer la imagen')) }
    img.src = url
  })
}

// ── Modal: Foto del estudio → IA extrae valores → revisión → guardar ──
function _openPhotoAiModal() {
  const today = new Date().toISOString().slice(0, 10)
  const { ov, close } = _modal(`
    <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;">📷 Foto del estudio → IA</h3>
    <p style="margin:0 0 12px;font-size:11px;color:#94a3b8;line-height:1.5;">Toma o sube la foto de tus resultados. La IA extrae los valores y <strong>tú revisas antes de guardar</strong>. No reemplaza a tu médico.</p>

    <div id="pa-drop" style="border:1px dashed rgba(167,139,250,0.4);border-radius:12px;padding:18px;text-align:center;background:rgba(167,139,250,0.04);">
      <input id="pa-file" type="file" accept="image/*" capture="environment" style="display:none;"/>
      <button id="pa-pick" style="padding:10px 18px;background:linear-gradient(135deg,#a78bfa,#60a5fa);border:none;color:#000;font-weight:700;border-radius:10px;cursor:pointer;font-size:13px;">📷 Tomar / subir foto</button>
      <div id="pa-fname" style="font-size:11px;color:#94a3b8;margin-top:8px;"></div>
    </div>

    <div id="pa-status" style="margin-top:12px;font-size:12px;color:#94a3b8;text-align:center;"></div>
    <div id="pa-results"></div>

    <label style="font-size:12px;color:#94a3b8;display:none;margin-top:10px;" id="pa-date-wrap">Fecha del estudio <input id="pa-date" type="date" value="${today}" style="${_inputCss}"/></label>

    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="pa-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="pa-save" style="flex:2;padding:9px;background:#34d399;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;display:none;">✓ Guardar valores</button>
    </div>`, 560)

  const $ = id => ov.querySelector('#' + id)
  let extracted = []

  $('pa-cancel').onclick = close
  $('pa-pick').onclick = () => $('pa-file').click()

  $('pa-file').onchange = async () => {
    const file = $('pa-file').files?.[0]
    if (!file) return
    if (!(await _aiConsent())) { $('pa-file').value = ''; return }
    $('pa-fname').textContent = file.name
    const status = $('pa-status')
    status.style.color = '#94a3b8'
    status.textContent = '⏳ Procesando imagen…'
    $('pa-results').innerHTML = ''
    $('pa-save').style.display = 'none'
    try {
      const dataUrl = await _downscaleImage(file)
      status.textContent = '🤖 La IA está leyendo tu estudio… (10-30s)'
      const r = await _api('health_extract_labs', { image_base64: dataUrl })
      extracted = r.readings || []
      if (!extracted.length) {
        status.style.color = '#fbbf24'
        status.textContent = '⚠ No pude leer valores claros. Prueba con mejor luz o regístralos a mano.'
        return
      }
      status.style.color = '#34d399'
      status.textContent = `✓ Encontré ${extracted.length} valor(es). Revisa y corrige antes de guardar:`
      _renderPaTable($, extracted)
      $('pa-date-wrap').style.display = 'block'
      $('pa-save').style.display = 'block'
    } catch (e) {
      status.style.color = '#f87171'
      status.textContent = '⚠ ' + e.message
    }
  }

  $('pa-save').onclick = async () => {
    // Lee la tabla editada
    const rows = [...ov.querySelectorAll('[data-pa-row]')].map(tr => ({
      marker: tr.querySelector('[data-f="marker"]').value.trim(),
      value:  tr.querySelector('[data-f="value"]').value,
      value2: tr.querySelector('[data-f="value2"]')?.value || null,
      unit:   tr.querySelector('[data-f="unit"]').value.trim(),
      ref_low:  tr.querySelector('[data-f="low"]').value || null,
      ref_high: tr.querySelector('[data-f="high"]').value || null,
    })).filter(r => r.marker && r.value !== '')
    if (!rows.length) { alert('No hay valores para guardar'); return }
    const btn = $('pa-save'); btn.disabled = true; btn.textContent = '⏳ Guardando…'
    try {
      const r = await _api('health_readings_bulk', { readings: rows, measured_at: $('pa-date').value, source: 'photo_ai' })
      close(); renderHealth()
      if (window.showToast) window.showToast(`✅ ${r.inserted} valores guardados desde la foto`)
    } catch (e) { alert('⚠ ' + e.message); btn.disabled = false; btn.textContent = '✓ Guardar valores' }
  }
}

// Tabla editable de los valores extraídos por la IA
function _renderPaTable($, readings) {
  const rowCss = 'width:100%;padding:6px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e5e7eb;font-size:12px;box-sizing:border-box;'
  $('pa-results').innerHTML = `
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow-y:auto;">
      ${readings.map((r, i) => {
        const dual = r.value2 != null
        return `
        <div data-pa-row style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:8px;">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
            <input data-f="marker" value="${_esc(r.marker)}" placeholder="Marcador" style="${rowCss};font-weight:700;flex:1;"/>
            <button data-pa-del="${i}" title="Quitar" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:14px;flex-shrink:0;">🗑</button>
          </div>
          <div style="display:grid;grid-template-columns:${dual ? '1fr 1fr 1.2fr' : '1fr 1.4fr'};gap:6px;">
            <input data-f="value" type="number" step="any" inputmode="decimal" value="${r.value ?? ''}" placeholder="${dual ? 'Sistólica' : 'Valor'}" style="${rowCss}"/>
            ${dual ? `<input data-f="value2" type="number" step="any" inputmode="decimal" value="${r.value2}" placeholder="Diastólica" style="${rowCss}"/>` : ''}
            <input data-f="unit" value="${_esc(r.unit||'')}" placeholder="Unidad" style="${rowCss}"/>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
            <input data-f="low" type="number" step="any" value="${r.ref_low ?? ''}" placeholder="rango mín" style="${rowCss}"/>
            <input data-f="high" type="number" step="any" value="${r.ref_high ?? ''}" placeholder="rango máx" style="${rowCss}"/>
          </div>
        </div>`
      }).join('')}
    </div>`
  // Quitar fila
  $('pa-results').querySelectorAll('[data-pa-del]').forEach(b => b.addEventListener('click', () => {
    b.closest('[data-pa-row]').remove()
  }))
}

function _openAiModal() {
  const { close } = _modal(`
    <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;">✨ Analizar estudios con IA</h3>
    <p style="margin:0 0 12px;font-size:11px;color:#94a3b8;line-height:1.5;">Pega el texto de tus resultados (copia del PDF o escríbelos). La IA te dará un resumen claro. <strong>No reemplaza a tu médico.</strong></p>
    <textarea id="ha-text" rows="8" placeholder="Glucosa: 95 mg/dL (70-100)\nColesterol total: 210 mg/dL (<200)\nTrigliceridos: 180 mg/dL ..." style="${_inputCss};resize:vertical;font-family:'JetBrains Mono',monospace;font-size:12px;"></textarea>
    <div id="ha-result" style="margin-top:12px;font-size:12px;color:#cbd5e1;line-height:1.6;white-space:pre-wrap;"></div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="ha-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cerrar</button>
      <button id="ha-run" style="flex:2;padding:9px;background:linear-gradient(135deg,#34d399,#10b981);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">✨ Analizar</button>
    </div>`, 520)
  document.getElementById('ha-cancel').onclick = close
  document.getElementById('ha-run').onclick = async () => {
    const text = document.getElementById('ha-text').value.trim()
    if (text.length < 20) { alert('Pega más texto de tu análisis'); return }
    if (!(await _aiConsent())) return
    const resEl = document.getElementById('ha-result')
    const btn = document.getElementById('ha-run')
    btn.disabled = true; btn.textContent = '⏳ Analizando…'
    resEl.textContent = ''
    try {
      const r = await _api('health_ai_summary', { raw_text: text })
      resEl.innerHTML = `<div style="padding:12px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:10px;">${_esc(r.summary)}</div><div style="font-size:10px;color:#64748b;margin-top:6px;text-align:right;">vía ${r.provider}</div>`
    } catch (e) {
      resEl.innerHTML = `<div style="color:#f87171;">⚠ ${_esc(e.message)}</div>`
    }
    btn.disabled = false; btn.textContent = '✨ Analizar'
  }
}

if (typeof window !== 'undefined') {
  window.nexusHealth = { render: renderHealth }
}
