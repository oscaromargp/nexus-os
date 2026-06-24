// Nexus OS · Salud — Tab Ciclo menstrual
//
// Registro de periodos + predicción de próximo ciclo, ovulación y fase actual.
// Datos sensibles → RLS owner-only. Las predicciones son estimaciones, no
// método anticonceptivo ni diagnóstico. Inspiración: peri + Menstrudel.

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
const _fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const _inputCss = 'width:100%;padding:9px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e5e7eb;font-size:13px;box-sizing:border-box;'

const FLOWS = [
  { id: 'ligero',    label: 'Ligero',    emoji: '💧' },
  { id: 'medio',     label: 'Medio',     emoji: '💧💧' },
  { id: 'abundante', label: 'Abundante', emoji: '💧💧💧' },
]
const SYMPTOMS = ['Cólicos', 'Dolor de cabeza', 'Cansancio', 'Antojos', 'Hinchazón', 'Acné', 'Cambios de humor', 'Sensibilidad', 'Náusea', 'Insomnio']
const PHASE_COLOR = {
  'Menstruación': '#f87171',
  'Folicular': '#34d399',
  'Ovulación (fértil)': '#a78bfa',
  'Lútea': '#fbbf24',
  '—': '#94a3b8',
}

function _modal(inner, maxW = 460) {
  const ov = document.createElement('div')
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'
  ov.innerHTML = `<div style="background:#0f1419;border:1px solid #1f2937;border-radius:14px;padding:20px;max-width:${maxW}px;width:100%;color:#e5e7eb;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">${inner}</div>`
  document.body.appendChild(ov)
  ov.addEventListener('click', e => { if (e.target === ov) document.body.removeChild(ov) })
  return { ov, close: () => { try { document.body.removeChild(ov) } catch {} } }
}

export async function renderCycleTab(body) {
  body.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px;">⏳ Cargando…</div>'
  let d
  try { d = await _api('cycle_dashboard') }
  catch (e) { body.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${_esc(e.message)}</div>`; return }

  const { cycles = [], prediction, avg_cycle = 28, avg_period = 5 } = d

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap;">
      <div style="font-size:11px;color:#64748b;">🔒 Privado · solo tú lo ves. Las predicciones son estimaciones.</div>
      <button id="cyc-add" style="padding:9px 16px;background:linear-gradient(135deg,#f472b6,#ec4899);border:none;color:#fff;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;">+ Registrar periodo</button>
    </div>`

  // Tarjeta de predicción / estado actual
  if (prediction) {
    const pc = PHASE_COLOR[prediction.phase] || '#94a3b8'
    html += `
      <div style="background:linear-gradient(135deg,rgba(244,114,182,0.08),rgba(167,139,250,0.06));border:1px solid rgba(244,114,182,0.25);border-radius:14px;padding:18px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Día del ciclo</div>
            <div style="font-size:32px;font-weight:800;color:#f472b6;font-family:'JetBrains Mono',monospace;line-height:1;">${prediction.day_of_cycle}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Fase</div>
            <div style="font-size:15px;font-weight:800;color:${pc};margin-top:4px;">${_esc(prediction.phase)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Próximo periodo</div>
            <div style="font-size:15px;font-weight:800;color:#e5e7eb;margin-top:4px;">${prediction.days_to_next >= 0 ? 'en ' + prediction.days_to_next + ' días' : 'atrasado'}</div>
          </div>
        </div>
        <div style="display:flex;gap:14px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;color:#94a3b8;flex-wrap:wrap;">
          <div>🩸 Próximo: <b style="color:#e5e7eb;">${_fmtDate(prediction.next_start)}</b></div>
          <div>🌸 Ovulación est.: <b style="color:#a78bfa;">${_fmtDate(prediction.ovulation)}</b></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <div style="flex:1;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#e5e7eb;font-family:'JetBrains Mono',monospace;">${avg_cycle}</div>
          <div style="font-size:10px;color:#94a3b8;">días · ciclo promedio</div>
        </div>
        <div style="flex:1;padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:#e5e7eb;font-family:'JetBrains Mono',monospace;">${avg_period}</div>
          <div style="font-size:10px;color:#94a3b8;">días · periodo promedio</div>
        </div>
      </div>`
  } else {
    html += `<div style="background:rgba(255,255,255,0.02);border:1px dashed rgba(244,114,182,0.3);border-radius:14px;padding:24px;text-align:center;margin-bottom:16px;">
      <div style="font-size:13px;color:#cbd5e1;margin-bottom:6px;">Registra tu primer periodo para ver predicciones</div>
      <div style="font-size:11px;color:#6b7280;">Con 2+ registros calculamos tu ciclo y ovulación estimada.</div>
    </div>`
  }

  // Historial
  html += `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;">
      <div style="font-size:13px;font-weight:800;color:#e5e7eb;margin-bottom:12px;">📋 Historial</div>
      ${cycles.length ? `<div style="display:flex;flex-direction:column;gap:8px;">
        ${cycles.map(c => {
          const fl = FLOWS.find(f => f.id === c.flow)
          return `
            <div style="padding:11px 13px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_fmtDate(c.start_date)}${c.end_date ? ' → ' + _fmtDate(c.end_date) : ''}</div>
                  <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${fl ? fl.emoji + ' ' + fl.label : ''}${(c.symptoms && c.symptoms.length) ? ' · ' + _esc(c.symptoms.join(', ')) : ''}</div>
                </div>
                <button data-cyc-del="${c.id}" title="Eliminar" style="background:none;border:none;color:#475569;cursor:pointer;font-size:13px;">🗑</button>
              </div>
            </div>`
        }).join('')}
      </div>` : '<div style="font-size:12px;color:#6b7280;text-align:center;padding:18px;">Sin registros todavía.</div>'}
    </div>`

  body.innerHTML = html
  body.querySelector('#cyc-add')?.addEventListener('click', () => _openCycleModal(body))
  body.querySelectorAll('[data-cyc-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este registro?')) return
    try { await _api('cycle_delete', { id: b.dataset.cycDel }); renderCycleTab(body) }
    catch (e) { alert('⚠ ' + e.message) }
  }))
}

function _openCycleModal(body) {
  const today = new Date().toISOString().slice(0, 10)
  const { ov, close } = _modal(`
    <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">🩸 Registrar periodo</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <label style="font-size:12px;color:#94a3b8;">Inicio <input id="cy-start" type="date" value="${today}" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Fin (opcional) <input id="cy-end" type="date" style="${_inputCss}"/></label>
    </div>
    <div style="font-size:12px;color:#94a3b8;margin-top:10px;margin-bottom:5px;">Flujo</div>
    <div style="display:flex;gap:6px;">
      ${FLOWS.map((f, i) => `<button type="button" data-flow="${f.id}" style="flex:1;padding:8px;background:${i === 1 ? 'rgba(244,114,182,0.15)' : 'rgba(255,255,255,0.04)'};border:1px solid ${i === 1 ? 'rgba(244,114,182,0.4)' : 'rgba(255,255,255,0.1)'};color:${i === 1 ? '#f472b6' : '#94a3b8'};border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">${f.emoji}<br>${f.label}</button>`).join('')}
    </div>
    <div style="font-size:12px;color:#94a3b8;margin-top:12px;margin-bottom:5px;">Síntomas</div>
    <div id="cy-symptoms" style="display:flex;flex-wrap:wrap;gap:6px;">
      ${SYMPTOMS.map(s => `<button type="button" data-sym="${_esc(s)}" style="padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:20px;cursor:pointer;font-size:11px;">${_esc(s)}</button>`).join('')}
    </div>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:12px;">Notas <input id="cy-notes" placeholder="Opcional" style="${_inputCss}"/></label>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="cy-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="cy-save" style="flex:2;padding:9px;background:#ec4899;border:none;color:#fff;font-weight:700;border-radius:8px;cursor:pointer;">Guardar</button>
    </div>`)

  const $ = id => ov.querySelector('#' + id)
  let flow = 'medio'
  ov.querySelectorAll('[data-flow]').forEach(b => b.addEventListener('click', () => {
    flow = b.dataset.flow
    ov.querySelectorAll('[data-flow]').forEach(x => {
      const on = x.dataset.flow === flow
      x.style.background = on ? 'rgba(244,114,182,0.15)' : 'rgba(255,255,255,0.04)'
      x.style.borderColor = on ? 'rgba(244,114,182,0.4)' : 'rgba(255,255,255,0.1)'
      x.style.color = on ? '#f472b6' : '#94a3b8'
    })
  }))
  const symptoms = new Set()
  ov.querySelectorAll('[data-sym]').forEach(b => b.addEventListener('click', () => {
    const s = b.dataset.sym
    if (symptoms.has(s)) { symptoms.delete(s); b.style.background = 'rgba(255,255,255,0.04)'; b.style.color = '#94a3b8'; b.style.borderColor = 'rgba(255,255,255,0.1)' }
    else { symptoms.add(s); b.style.background = 'rgba(244,114,182,0.15)'; b.style.color = '#f472b6'; b.style.borderColor = 'rgba(244,114,182,0.4)' }
  }))

  $('cy-cancel').onclick = close
  $('cy-save').onclick = async () => {
    const start = $('cy-start').value
    if (!start) { alert('Pon la fecha de inicio'); return }
    try {
      await _api('cycle_add', {
        start_date: start, end_date: $('cy-end').value || null,
        flow, symptoms: [...symptoms], notes: $('cy-notes').value.trim() || null,
      })
      close(); renderCycleTab(body)
      if (window.showToast) window.showToast('✅ Periodo registrado')
    } catch (e) { alert('⚠ ' + e.message) }
  }
}
