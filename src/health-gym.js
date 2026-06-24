// Nexus OS · Salud — Tab Gym / Rutinas
//
// Registra entrenamientos con series (ejercicio, peso, reps), calcula récords
// (PR) y 1RM estimado (Epley), y muestra el volumen por grupo muscular.
// Inspiración: LiftShift (PR/1RM/volumen) + FitnessLibrary (ejercicios→rutinas).

import { supabase } from './supabase.js'

async function _api(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session) headers.Authorization = 'Bearer ' + session.access_token
  const r = await fetch('/api/health', { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.error || 'API fail')
  return j
}
const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
const _fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : ''
const _inputCss = 'width:100%;padding:9px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e5e7eb;font-size:13px;box-sizing:border-box;'

// ── Catálogo de músculos + ejercicios (captura fácil) ──────────────
const GYM_MUSCLES = [
  { id: 'pecho',   label: 'Pecho',   color: '#f87171' },
  { id: 'espalda', label: 'Espalda', color: '#60a5fa' },
  { id: 'pierna',  label: 'Pierna',  color: '#34d399' },
  { id: 'hombro',  label: 'Hombro',  color: '#fbbf24' },
  { id: 'biceps',  label: 'Bíceps',  color: '#a78bfa' },
  { id: 'triceps', label: 'Tríceps', color: '#f472b6' },
  { id: 'core',    label: 'Core',    color: '#22d3ee' },
]
const GYM_MUSCLE_BY_ID = Object.fromEntries(GYM_MUSCLES.map(m => [m.id, m]))
const GYM_EXERCISES = [
  { name: 'Press de banca', m: 'pecho' }, { name: 'Press inclinado', m: 'pecho' }, { name: 'Press con mancuerna', m: 'pecho' }, { name: 'Aperturas', m: 'pecho' }, { name: 'Fondos en paralelas', m: 'pecho' },
  { name: 'Dominadas', m: 'espalda' }, { name: 'Remo con barra', m: 'espalda' }, { name: 'Remo con mancuerna', m: 'espalda' }, { name: 'Jalón al pecho', m: 'espalda' }, { name: 'Peso muerto', m: 'espalda' },
  { name: 'Sentadilla', m: 'pierna' }, { name: 'Prensa', m: 'pierna' }, { name: 'Extensión de cuádriceps', m: 'pierna' }, { name: 'Curl femoral', m: 'pierna' }, { name: 'Zancadas', m: 'pierna' }, { name: 'Hip thrust', m: 'pierna' }, { name: 'Pantorrillas', m: 'pierna' },
  { name: 'Press militar', m: 'hombro' }, { name: 'Elevaciones laterales', m: 'hombro' }, { name: 'Elevaciones frontales', m: 'hombro' }, { name: 'Pájaros', m: 'hombro' }, { name: 'Press Arnold', m: 'hombro' },
  { name: 'Curl con barra', m: 'biceps' }, { name: 'Curl con mancuerna', m: 'biceps' }, { name: 'Curl martillo', m: 'biceps' }, { name: 'Curl predicador', m: 'biceps' },
  { name: 'Extensión en polea', m: 'triceps' }, { name: 'Press francés', m: 'triceps' }, { name: 'Fondos en banca', m: 'triceps' }, { name: 'Patada de tríceps', m: 'triceps' },
  { name: 'Plancha', m: 'core' }, { name: 'Abdominales', m: 'core' }, { name: 'Elevación de piernas', m: 'core' }, { name: 'Russian twist', m: 'core' },
]

function _modal(inner, maxW = 480) {
  const ov = document.createElement('div')
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
  ov.innerHTML = `<div style="background:#0f1419;border:1px solid #1f2937;border-radius:14px;padding:20px;max-width:${maxW}px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">${inner}</div>`
  document.body.appendChild(ov)
  ov.addEventListener('click', e => { if (e.target === ov) document.body.removeChild(ov) })
  return { ov, close: () => { try { document.body.removeChild(ov) } catch {} } }
}

export async function renderGymTab(body) {
  body.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px;">⏳ Cargando tu gym…</div>'
  let d
  try { d = await _api('gym_dashboard') }
  catch (e) { body.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${_esc(e.message)}</div>`; return }

  const { workouts = [], prs = [], muscle_volume = {}, sets_30d = 0, workouts_30d = 0 } = d
  const maxVol = Math.max(1, ...Object.values(muscle_volume))

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;gap:8px;">
        <div style="padding:8px 14px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:10px;">
          <div style="font-size:18px;font-weight:800;color:#34d399;font-family:'JetBrains Mono',monospace;line-height:1;">${workouts_30d}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">entrenos · 30d</div>
        </div>
        <div style="padding:8px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;">
          <div style="font-size:18px;font-weight:800;color:#60a5fa;font-family:'JetBrains Mono',monospace;line-height:1;">${sets_30d}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">series · 30d</div>
        </div>
      </div>
      <button id="gym-add" style="padding:9px 16px;background:linear-gradient(135deg,#34d399,#22c55e);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">+ Registrar entreno</button>
    </div>`

  // Volumen por músculo (30d)
  if (Object.keys(muscle_volume).length) {
    html += `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">💪 Volumen por músculo <span style="font-size:11px;color:#64748b;font-weight:500;">· últimos 30 días</span></div>
        ${GYM_MUSCLES.filter(m => muscle_volume[m.id]).map(m => {
          const v = muscle_volume[m.id] || 0
          const pct = Math.round((v / maxVol) * 100)
          return `
            <div style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span style="color:#cbd5e1;font-weight:600;">${m.label}</span><span style="color:#94a3b8;font-family:'JetBrains Mono',monospace;">${Math.round(v).toLocaleString('es-MX')} kg·rep</span></div>
              <div style="height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${m.color};border-radius:4px;"></div></div>
            </div>`
        }).join('')}
      </div>`
  }

  // Récords (PR + 1RM)
  if (prs.length) {
    html += `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">🏆 Tus récords</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${prs.slice(0, 12).map(p => {
            const mc = GYM_MUSCLE_BY_ID[p.muscle]
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:700;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(p.exercise)}</div>
                  ${mc ? `<div style="font-size:10px;color:${mc.color};">${mc.label}</div>` : ''}
                </div>
                <div style="text-align:right;">
                  <div style="font-size:14px;font-weight:800;color:#34d399;font-family:'JetBrains Mono',monospace;line-height:1;">${p.max_weight} kg <span style="font-size:10px;color:#94a3b8;">× ${p.reps_at_max}</span></div>
                  <div style="font-size:10px;color:#94a3b8;margin-top:2px;">1RM est. ${p.best_1rm} kg</div>
                </div>
              </div>`
          }).join('')}
        </div>
      </div>`
  }

  // Entrenos recientes
  html += `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;">
      <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">📅 Entrenos recientes</div>
      ${workouts.length ? `<div style="display:flex;flex-direction:column;gap:8px;">
        ${workouts.map(w => {
          const exs = [...new Set((w.sets || []).map(s => s.exercise))]
          return `
            <div style="padding:11px 13px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_esc(w.title || 'Entreno')} <span style="font-size:11px;color:#94a3b8;font-weight:500;">· ${_fmtDate(w.workout_date)}${w.duration_min ? ' · ' + w.duration_min + ' min' : ''}</span></div>
                  <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${(w.sets || []).length} series · ${_esc(exs.slice(0, 4).join(', '))}${exs.length > 4 ? '…' : ''}</div>
                </div>
                <button data-gym-del="${w.id}" title="Eliminar" style="background:none;border:none;color:#475569;cursor:pointer;font-size:13px;">🗑</button>
              </div>
            </div>`
        }).join('')}
      </div>` : '<div style="font-size:12px;color:#6b7280;text-align:center;padding:18px;">Aún sin entrenos. Pulsa <b style="color:#34d399;">+ Registrar entreno</b>.</div>'}
    </div>`

  body.innerHTML = html
  body.querySelector('#gym-add')?.addEventListener('click', () => _openWorkoutModal(body))
  body.querySelectorAll('[data-gym-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este entreno?')) return
    try { await _api('gym_workout_delete', { id: b.dataset.gymDel }); renderGymTab(body) }
    catch (e) { alert('⚠ ' + e.message) }
  }))
}

function _setRowHtml(idx) {
  const muscleOpts = GYM_MUSCLES.map(m => `<option value="${m.id}">${m.label}</option>`).join('')
  return `
    <div data-set-row style="display:grid;grid-template-columns:1.1fr 1.4fr 0.8fr 0.8fr auto;gap:5px;align-items:center;margin-bottom:6px;">
      <select data-f="muscle" style="${_inputCss};padding:7px 8px;font-size:12px;">${muscleOpts}</select>
      <select data-f="exercise" style="${_inputCss};padding:7px 8px;font-size:12px;"></select>
      <input data-f="weight" type="number" step="any" inputmode="decimal" placeholder="kg" style="${_inputCss};padding:7px 8px;font-size:12px;"/>
      <input data-f="reps" type="number" inputmode="numeric" placeholder="reps" style="${_inputCss};padding:7px 8px;font-size:12px;"/>
      <button data-set-del title="Quitar" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:14px;">✕</button>
    </div>`
}
function _fillExercises(row) {
  const mus = row.querySelector('[data-f="muscle"]').value
  const exSel = row.querySelector('[data-f="exercise"]')
  exSel.innerHTML = GYM_EXERCISES.filter(e => e.m === mus).map(e => `<option value="${_esc(e.name)}">${_esc(e.name)}</option>`).join('') + '<option value="__custom">✏️ Otro…</option>'
}
function _wireSetRow(row) {
  const musSel = row.querySelector('[data-f="muscle"]')
  const exSel = row.querySelector('[data-f="exercise"]')
  musSel.addEventListener('change', () => _fillExercises(row))
  exSel.addEventListener('change', () => {
    if (exSel.value === '__custom') {
      const name = prompt('Nombre del ejercicio:')
      if (name) { const o = document.createElement('option'); o.value = name; o.textContent = name; exSel.insertBefore(o, exSel.firstChild); exSel.value = name }
      else _fillExercises(row)
    }
  })
  row.querySelector('[data-set-del]').addEventListener('click', () => {
    const cont = row.parentElement
    if (cont.querySelectorAll('[data-set-row]').length > 1) row.remove()
  })
  _fillExercises(row)
}

function _openWorkoutModal(body) {
  const today = new Date().toISOString().slice(0, 10)
  const { ov, close } = _modal(`
    <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">🏋️ Registrar entreno</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <label style="font-size:12px;color:#94a3b8;">Fecha <input id="gw-date" type="date" value="${today}" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Duración (min) <input id="gw-dur" type="number" inputmode="numeric" placeholder="60" style="${_inputCss}"/></label>
    </div>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Título (opcional) <input id="gw-title" placeholder="Día de pierna" style="${_inputCss}"/></label>
    <div style="font-size:12px;color:#94a3b8;margin-top:12px;margin-bottom:6px;font-weight:700;">Series</div>
    <div id="gw-sets">${_setRowHtml(0)}</div>
    <button id="gw-add-set" style="width:100%;padding:8px;background:rgba(52,211,153,0.08);border:1px dashed rgba(52,211,153,0.3);color:#34d399;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;margin-top:4px;">+ Añadir serie</button>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="gw-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="gw-save" style="flex:2;padding:9px;background:#34d399;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Guardar entreno</button>
    </div>`, 560)

  const $ = id => ov.querySelector('#' + id)
  const setsCont = $('gw-sets')
  setsCont.querySelectorAll('[data-set-row]').forEach(_wireSetRow)
  $('gw-add-set').onclick = () => {
    const tmp = document.createElement('div'); tmp.innerHTML = _setRowHtml(setsCont.children.length)
    const row = tmp.firstElementChild; setsCont.appendChild(row); _wireSetRow(row)
  }
  $('gw-cancel').onclick = close
  $('gw-save').onclick = async () => {
    const sets = [...setsCont.querySelectorAll('[data-set-row]')].map(r => ({
      muscle_group: r.querySelector('[data-f="muscle"]').value,
      exercise: r.querySelector('[data-f="exercise"]').value,
      weight: r.querySelector('[data-f="weight"]').value,
      reps: r.querySelector('[data-f="reps"]').value,
    })).filter(s => s.exercise && s.exercise !== '__custom')
    if (!sets.length) { alert('Agrega al menos una serie con ejercicio'); return }
    const btn = $('gw-save'); btn.disabled = true; btn.textContent = '⏳ Guardando…'
    try {
      await _api('gym_workout_add', {
        workout_date: $('gw-date').value, title: $('gw-title').value.trim() || null,
        duration_min: $('gw-dur').value || null, sets,
      })
      close(); renderGymTab(body)
      if (window.showToast) window.showToast('✅ Entreno registrado')
    } catch (e) { alert('⚠ ' + e.message); btn.disabled = false; btn.textContent = 'Guardar entreno' }
  }
}
