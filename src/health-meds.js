// Nexus OS · Salud — Tab Medicamentos / Vitaminas / Suplementos
//
// Registra qué tomas (dosis, para qué, horarios), marca tomé/no tomé por dosis
// y guarda historial cuantificable. La Fase B añade recordatorio + respuesta
// por Telegram (cron → botones ✅/❌ → actualiza estado).

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

const KINDS = [
  { id: 'medicamento', label: 'Medicamento', emoji: '💊' },
  { id: 'vitamina',    label: 'Vitamina',    emoji: '🟡' },
  { id: 'suplemento',  label: 'Suplemento',  emoji: '🥤' },
]
const KIND_BY_ID = Object.fromEntries(KINDS.map(k => [k.id, k]))
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const FREQS = [
  { id: 'diario', label: 'Todos los días' },
  { id: 'dias',   label: 'Días específicos' },
  { id: 'prn',    label: 'Según necesidad' },
]

function _modal(inner, maxW = 480) {
  const ov = document.createElement('div')
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
  ov.innerHTML = `<div style="background:#0f1419;border:1px solid #1f2937;border-radius:14px;padding:20px;max-width:${maxW}px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">${inner}</div>`
  document.body.appendChild(ov)
  ov.addEventListener('click', e => { if (e.target === ov) document.body.removeChild(ov) })
  return { ov, close: () => { try { document.body.removeChild(ov) } catch {} } }
}

const STATUS_CFG = {
  tomado:    { label: 'Tomado',    color: '#34d399', emoji: '✅' },
  no_tomado: { label: 'No tomado', color: '#f87171', emoji: '❌' },
  pendiente: { label: 'Pendiente', color: '#fbbf24', emoji: '🟡' },
}

export async function renderMedsTab(body) {
  body.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px;">⏳ Cargando…</div>'
  let d
  try { d = await _api('med_list') }
  catch (e) { body.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${_esc(e.message)}</div>`; return }

  const { medications = [], today_doses = [] } = d
  const takenCount = today_doses.filter(x => x.status === 'tomado').length

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap;">
      <div style="font-size:11px;color:#64748b;">🔒 Privado. El recordatorio por Telegram llega en la Fase B.</div>
      <button id="med-add" style="padding:9px 16px;background:linear-gradient(135deg,#34d399,#22c55e);border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">+ Agregar</button>
    </div>`

  // ── Dosis de hoy ──
  html += `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">📅 Dosis de hoy <span style="font-size:11px;color:#64748b;font-weight:500;">· ${takenCount}/${today_doses.length} tomadas</span></div>
      ${today_doses.length ? `<div style="display:flex;flex-direction:column;gap:8px;">
        ${today_doses.map(dose => {
          const k = KIND_BY_ID[dose.kind] || { emoji: '💊' }
          const cfg = STATUS_CFG[dose.status] || STATUS_CFG.pendiente
          return `
            <div style="padding:11px 13px;background:rgba(255,255,255,0.03);border:1px solid ${dose.status==='tomado'?'rgba(52,211,153,0.3)':dose.status==='no_tomado'?'rgba(248,113,113,0.3)':'rgba(255,255,255,0.06)'};border-radius:10px;">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:20px;">${k.emoji}</span>
                <div style="flex:1;min-width:140px;">
                  <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_esc(dose.name)} ${dose.dose ? `<span style="font-size:11px;color:#94a3b8;font-weight:500;">· ${_esc(dose.dose)}</span>` : ''}</div>
                  <div style="font-size:11px;color:#94a3b8;">${dose.time ? '🕐 ' + dose.time : 'sin hora'}${dose.purpose ? ' · ' + _esc(dose.purpose) : ''}</div>
                </div>
                <span style="font-size:11px;color:${cfg.color};font-weight:700;">${cfg.emoji} ${cfg.label}</span>
              </div>
              <div style="display:flex;gap:6px;margin-top:8px;">
                <button data-med-take data-id="${dose.medication_id}" data-time="${dose.time||''}" data-dose="${_esc(dose.dose||'')}" style="flex:1;padding:7px;background:${dose.status==='tomado'?'rgba(52,211,153,0.2)':'rgba(255,255,255,0.04)'};border:1px solid ${dose.status==='tomado'?'rgba(52,211,153,0.4)':'rgba(255,255,255,0.12)'};color:${dose.status==='tomado'?'#34d399':'#94a3b8'};border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;">✅ Tomé</button>
                <button data-med-skip data-id="${dose.medication_id}" data-time="${dose.time||''}" style="flex:1;padding:7px;background:${dose.status==='no_tomado'?'rgba(248,113,113,0.2)':'rgba(255,255,255,0.04)'};border:1px solid ${dose.status==='no_tomado'?'rgba(248,113,113,0.4)':'rgba(255,255,255,0.12)'};color:${dose.status==='no_tomado'?'#f87171':'#94a3b8'};border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;">❌ No tomé</button>
              </div>
            </div>`
        }).join('')}
      </div>` : '<div style="font-size:12px;color:#6b7280;text-align:center;padding:14px;">No hay dosis programadas para hoy.</div>'}
    </div>`

  // ── Mis medicamentos ──
  html += `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">💊 Lo que tomas</div>
      ${medications.length ? `<div style="display:flex;flex-direction:column;gap:8px;">
        ${medications.map(m => {
          const k = KIND_BY_ID[m.kind] || { emoji: '💊', label: m.kind }
          const freq = m.frequency === 'prn' ? 'según necesidad' : m.frequency === 'dias' ? (m.days_of_week || []).map(i => DOW[i]).join(' ') : 'diario'
          const times = (m.schedule_times || []).join(', ')
          return `
            <div style="padding:11px 13px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;opacity:${m.active ? '1' : '0.5'};">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:18px;">${k.emoji}</span>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_esc(m.name)}${m.dose ? ` <span style="font-size:11px;color:#94a3b8;font-weight:500;">· ${_esc(m.dose)}</span>` : ''}</div>
                  <div style="font-size:11px;color:#94a3b8;">${freq}${times ? ' · ' + times : ''}${m.purpose ? ' · ' + _esc(m.purpose) : ''}</div>
                </div>
                ${m.frequency === 'prn' ? `<button data-med-now data-id="${m.id}" data-dose="${_esc(m.dose||'')}" title="Registrar toma ahora" style="padding:5px 10px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">✅ Tomé ahora</button>` : ''}
                <button data-med-edit data-id="${m.id}" title="Editar" style="padding:5px 8px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);color:#a78bfa;border-radius:6px;cursor:pointer;font-size:11px;">✏️</button>
                <button data-med-del data-id="${m.id}" title="Eliminar" style="background:none;border:none;color:#475569;cursor:pointer;font-size:13px;">🗑</button>
              </div>
            </div>`
        }).join('')}
      </div>` : '<div style="font-size:12px;color:#6b7280;text-align:center;padding:14px;">Aún no agregas nada. Pulsa <b style="color:#34d399;">+ Agregar</b>.</div>'}
    </div>`

  // ── Historial ──
  html += `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#e5e7eb;">📋 Historial</div>
        <button id="med-hist" style="font-size:11px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">Ver últimos 30 días</button>
      </div>
      <div id="med-hist-body" style="font-size:12px;color:#6b7280;">Pulsa "Ver" para cargar tu historial de tomas.</div>
    </div>`

  body.innerHTML = html
  body.querySelector('#med-add')?.addEventListener('click', () => _openMedModal(body))
  body.querySelector('#med-hist')?.addEventListener('click', () => _loadHistory(body))
  body.querySelectorAll('[data-med-take]').forEach(b => b.addEventListener('click', () => _logDose(body, b, 'tomado')))
  body.querySelectorAll('[data-med-skip]').forEach(b => b.addEventListener('click', () => _logDose(body, b, 'no_tomado')))
  body.querySelectorAll('[data-med-now]').forEach(b => b.addEventListener('click', async () => {
    const now = new Date().toTimeString().slice(0, 5)
    try { await _api('med_log_set', { medication_id: b.dataset.id, scheduled_time: now, status: 'tomado', dose_taken: b.dataset.dose || null }); renderMedsTab(body) }
    catch (e) { alert('⚠ ' + e.message) }
  }))
  body.querySelectorAll('[data-med-edit]').forEach(b => b.addEventListener('click', () => {
    const m = medications.find(x => x.id === b.dataset.id); if (m) _openMedModal(body, m)
  }))
  body.querySelectorAll('[data-med-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar? También se borra su historial.')) return
    try { await _api('med_delete', { id: b.dataset.id }); renderMedsTab(body) }
    catch (e) { alert('⚠ ' + e.message) }
  }))
}

async function _logDose(body, btn, status) {
  let dose_taken = null
  if (status === 'tomado' && btn.dataset.dose) dose_taken = btn.dataset.dose
  try {
    await _api('med_log_set', { medication_id: btn.dataset.id, scheduled_time: btn.dataset.time || '', status, dose_taken })
    renderMedsTab(body)
  } catch (e) { alert('⚠ ' + e.message) }
}

async function _loadHistory(body) {
  const el = body.querySelector('#med-hist-body')
  el.textContent = '⏳ Cargando…'
  let logs
  try { logs = (await _api('med_history', { days: 30 })).logs }
  catch (e) { el.innerHTML = `<span style="color:#f87171;">⚠ ${_esc(e.message)}</span>`; return }
  if (!logs.length) { el.textContent = 'Sin registros en los últimos 30 días.'; return }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:5px;max-height:50vh;overflow-y:auto;">
    ${logs.map(l => {
      const cfg = STATUS_CFG[l.status] || STATUS_CFG.pendiente
      const k = KIND_BY_ID[l.med?.kind] || { emoji: '💊' }
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 9px;background:rgba(255,255,255,0.02);border-radius:8px;">
        <span>${k.emoji}</span>
        <div style="flex:1;min-width:0;">
          <span style="font-size:12px;color:#e5e7eb;font-weight:600;">${_esc(l.med?.name || '—')}</span>
          <span style="font-size:11px;color:#94a3b8;">· ${_fmtDate(l.scheduled_for)}${l.scheduled_time ? ' ' + l.scheduled_time : ''}${l.dose_taken ? ' · ' + _esc(l.dose_taken) : ''}${l.source === 'telegram' ? ' · 📲' : ''}</span>
        </div>
        <span style="font-size:11px;color:${cfg.color};font-weight:700;">${cfg.emoji}</span>
      </div>`
    }).join('')}
  </div>`
}

// ── Modal agregar / editar ──
function _openMedModal(body, med) {
  const editing = !!med
  const { ov, close } = _modal(`
    <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">${editing ? '✏️ Editar' : '💊 Agregar'} medicamento</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <label style="font-size:12px;color:#94a3b8;">Nombre <input id="m-name" value="${_esc(med?.name || '')}" placeholder="Vitamina D" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Tipo
        <select id="m-kind" style="${_inputCss}">${KINDS.map(k => `<option value="${k.id}" ${med?.kind === k.id ? 'selected' : ''}>${k.emoji} ${k.label}</option>`).join('')}</select>
      </label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
      <label style="font-size:12px;color:#94a3b8;">Dosis <input id="m-dose" value="${_esc(med?.dose || '')}" placeholder="500 mg, 2 cápsulas" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">¿Para qué? <input id="m-purpose" value="${_esc(med?.purpose || '')}" placeholder="energía, presión" style="${_inputCss}"/></label>
    </div>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Frecuencia
      <select id="m-freq" style="${_inputCss}">${FREQS.map(f => `<option value="${f.id}" ${med?.frequency === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
    </label>
    <div id="m-days-wrap" style="margin-top:8px;display:none;">
      <div style="font-size:12px;color:#94a3b8;margin-bottom:5px;">Días</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">${DOW.map((d, i) => `<button type="button" data-dow="${i}" style="padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;font-size:12px;">${d}</button>`).join('')}</div>
    </div>
    <div id="m-times-wrap" style="margin-top:8px;">
      <div style="font-size:12px;color:#94a3b8;margin-bottom:5px;">Horarios</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input id="m-time-input" type="time" style="${_inputCss};flex:1;"/>
        <button id="m-time-add" type="button" style="padding:9px 12px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap;">+ Hora</button>
      </div>
      <div id="m-times" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:#94a3b8;cursor:pointer;">
      <input id="m-tg" type="checkbox" ${med?.notify_telegram !== false ? 'checked' : ''} style="width:16px;height:16px;accent-color:#34d399;"/> Avisarme por Telegram (Fase B)
    </label>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="m-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="m-save" style="flex:2;padding:9px;background:#34d399;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">${editing ? 'Guardar' : 'Agregar'}</button>
    </div>`)

  const $ = id => ov.querySelector('#' + id)
  let times = [...(med?.schedule_times || [])]
  const days = new Set(med?.days_of_week || [])

  function renderTimes() {
    $('m-times').innerHTML = times.map((t, i) => `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25);color:#34d399;border-radius:20px;font-size:12px;font-weight:700;">🕐 ${t} <button data-rmt="${i}" style="background:none;border:none;color:#34d399;cursor:pointer;font-size:14px;line-height:1;">×</button></span>`).join('')
    $('m-times').querySelectorAll('[data-rmt]').forEach(b => b.addEventListener('click', () => { times.splice(+b.dataset.rmt, 1); renderTimes() }))
  }
  function syncFreq() {
    const f = $('m-freq').value
    $('m-days-wrap').style.display = f === 'dias' ? 'block' : 'none'
    $('m-times-wrap').style.display = f === 'prn' ? 'none' : 'block'
  }
  function syncDays() {
    ov.querySelectorAll('[data-dow]').forEach(b => {
      const on = days.has(+b.dataset.dow)
      b.style.background = on ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)'
      b.style.color = on ? '#34d399' : '#94a3b8'
      b.style.borderColor = on ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'
    })
  }
  ov.querySelectorAll('[data-dow]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.dow; days.has(i) ? days.delete(i) : days.add(i); syncDays()
  }))
  $('m-freq').addEventListener('change', syncFreq)
  $('m-time-add').addEventListener('click', () => {
    const v = $('m-time-input').value
    if (v && !times.includes(v)) { times.push(v); times.sort(); renderTimes() }
  })
  renderTimes(); syncFreq(); syncDays()

  $('m-cancel').onclick = close
  $('m-save').onclick = async () => {
    const name = $('m-name').value.trim()
    if (!name) { alert('Pon el nombre'); return }
    const freq = $('m-freq').value
    const payload = {
      name, kind: $('m-kind').value, dose: $('m-dose').value.trim() || null,
      purpose: $('m-purpose').value.trim() || null, frequency: freq,
      schedule_times: freq === 'prn' ? [] : times,
      days_of_week: freq === 'dias' ? [...days] : [],
      notify_telegram: $('m-tg').checked,
    }
    try {
      if (editing) await _api('med_update', { id: med.id, patch: payload })
      else await _api('med_add', payload)
      close(); renderMedsTab(body)
    } catch (e) { alert('⚠ ' + e.message) }
  }
}
