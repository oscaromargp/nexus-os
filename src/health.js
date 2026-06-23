// Nexus OS · Módulo Salud Física
//
// - Metas diarias (agua, pasos, ejercicio, sin azúcar) con barras + rachas
// - Estudios médicos con valores y tendencias en el tiempo
// - Recordatorio de próximo análisis
// - Resumen IA de análisis (Groq/Gemini, sin costo extra)

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

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}
function _fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export async function renderHealth() {
  const root = document.getElementById('view-salud') || document.getElementById('health-root')
  if (!root) return
  root.innerHTML = '<div style="padding:24px;color:#94a3b8;font-size:13px;">⏳ Cargando tu salud…</div>'

  let d
  try {
    d = (await _api('health_dashboard'))
    // Siembra metas por defecto si no hay
    if (!d.goals.length) {
      await _api('health_goal_seed').catch(() => {})
      d = (await _api('health_dashboard'))
    }
  } catch (e) {
    root.innerHTML = `<div style="padding:24px;color:#f87171;">⚠ ${_esc(e.message)}</div>`
    return
  }

  const { goals, today_progress, studies, trends, streaks, next_checkup } = d

  // ── Header ──
  let html = `
    <div style="padding:20px;max-width:1000px;margin:0 auto;">
      <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:24px;font-weight:800;margin:0 0 4px;display:flex;align-items:center;gap:10px;">🩺 Salud</h2>
          <p style="color:#94a3b8;font-size:13px;margin:0;">Tu copiloto físico — metas, hábitos y análisis. Nexus también te cuida.</p>
        </div>
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
          const pct = Math.min(100, Math.round((cur / tgt) * 100))
          const done = cur >= tgt
          const color = done ? '#34d399' : '#22d3ee'
          return `
            <div style="padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid ${done?'rgba(52,211,153,0.3)':'rgba(255,255,255,0.06)'};border-radius:10px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <div style="font-size:13px;font-weight:700;color:#e5e7eb;display:flex;align-items:center;gap:6px;">${_esc(g.emoji||'🎯')} ${_esc(g.label)} ${done?'<span style="font-size:11px;color:#34d399;">✓</span>':''}</div>
                <div style="font-size:13px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;">${cur} / ${tgt} <span style="font-size:10px;color:#94a3b8;">${_esc(g.unit||'')}</span></div>
              </div>
              <div style="height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;margin-bottom:8px;">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width 0.4s;"></div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                <button data-health-inc="${g.kind}" data-step="${g.kind==='steps'?500:g.kind==='exercise'?5:1}" data-cur="${cur}" style="padding:5px 12px;background:${color}20;border:1px solid ${color}50;color:${color};border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;">+ ${g.kind==='steps'?500:g.kind==='exercise'?5:1}</button>
                <button data-health-set="${g.kind}" data-tgt="${tgt}" data-cur="${cur}" style="padding:5px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:7px;cursor:pointer;font-size:12px;">✎ Ajustar</button>
                ${!done ? `<button data-health-done="${g.kind}" data-tgt="${tgt}" style="padding:5px 10px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);color:#34d399;border-radius:7px;cursor:pointer;font-size:12px;">✓ Cumplir</button>` : ''}
                <button data-health-goal-del="${g.id}" title="Eliminar meta" style="margin-left:auto;background:none;border:none;color:#475569;cursor:pointer;font-size:13px;">🗑</button>
              </div>
            </div>`
        }).join('') : '<div style="font-size:12px;color:#6b7280;text-align:center;padding:14px;">Sin metas. Agrega una arriba.</div>'}
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
                    <div style="font-size:13px;font-weight:700;color:#e5e7eb;">${_esc(marker)}</div>
                    <div style="font-size:18px;font-weight:800;color:${inRange?'#34d399':'#f87171'};font-family:'JetBrains Mono',monospace;">
                      ${last.value} <span style="font-size:11px;color:#94a3b8;">${_esc(last.unit||'')}</span>
                      ${prev ? `<span style="font-size:12px;color:${arrowColor};margin-left:6px;">${arrow} ${Math.abs(delta).toFixed(1)}</span>` : ''}
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
    </div>
  </div>`

  root.innerHTML = html
  _bindHealth(root)
  if (window.refreshIcons) window.refreshIcons()
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
  root.querySelector('#health-goal-add')?.addEventListener('click', _openGoalModal)
  root.querySelector('#health-reading-add')?.addEventListener('click', _openReadingModal)
  root.querySelector('#health-study-add')?.addEventListener('click', _openStudyModal)
  root.querySelector('#health-ai-btn')?.addEventListener('click', _openAiModal)
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
  const { close } = _modal(`
    <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">🎯 Nueva meta</h3>
    <label style="font-size:12px;color:#94a3b8;">Emoji <input id="hg-emoji" value="🎯" style="${_inputCss}"/></label>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Nombre <input id="hg-label" placeholder="Meditar" style="${_inputCss}"/></label>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Meta diaria <input id="hg-target" type="number" placeholder="10" style="${_inputCss}"/></label>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Unidad <input id="hg-unit" placeholder="min" style="${_inputCss}"/></label>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="hg-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="hg-save" style="flex:1;padding:9px;background:#34d399;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Agregar</button>
    </div>`)
  document.getElementById('hg-cancel').onclick = close
  document.getElementById('hg-save').onclick = async () => {
    const label = document.getElementById('hg-label').value.trim()
    const target = Number(document.getElementById('hg-target').value)
    if (!label || !target) { alert('Nombre y meta requeridos'); return }
    const kind = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20)
    try {
      await _api('health_goal_add', { kind, label, target, unit: document.getElementById('hg-unit').value.trim(), emoji: document.getElementById('hg-emoji').value.trim() || '🎯' })
      close(); renderHealth()
    } catch (e) { alert('⚠ ' + e.message) }
  }
}

function _openReadingModal() {
  const today = new Date().toISOString().slice(0, 10)
  const { close } = _modal(`
    <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;">📈 Registrar valor</h3>
    <p style="margin:0 0 12px;font-size:11px;color:#94a3b8;">Ej: Glucosa 95 mg/dL, rango 70–100</p>
    <label style="font-size:12px;color:#94a3b8;">Marcador <input id="hr-marker" placeholder="Glucosa" style="${_inputCss}"/></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
      <label style="font-size:12px;color:#94a3b8;">Valor <input id="hr-value" type="number" step="any" placeholder="95" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Unidad <input id="hr-unit" placeholder="mg/dL" style="${_inputCss}"/></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
      <label style="font-size:12px;color:#94a3b8;">Rango mín <input id="hr-low" type="number" step="any" placeholder="70" style="${_inputCss}"/></label>
      <label style="font-size:12px;color:#94a3b8;">Rango máx <input id="hr-high" type="number" step="any" placeholder="100" style="${_inputCss}"/></label>
    </div>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-top:8px;">Fecha <input id="hr-date" type="date" value="${today}" style="${_inputCss}"/></label>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button id="hr-cancel" style="flex:1;padding:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;">Cancelar</button>
      <button id="hr-save" style="flex:1;padding:9px;background:#22d3ee;border:none;color:#000;font-weight:700;border-radius:8px;cursor:pointer;">Guardar</button>
    </div>`)
  document.getElementById('hr-cancel').onclick = close
  document.getElementById('hr-save').onclick = async () => {
    const marker = document.getElementById('hr-marker').value.trim()
    const value = document.getElementById('hr-value').value
    if (!marker || value === '') { alert('Marcador y valor requeridos'); return }
    try {
      await _api('health_reading_add', {
        marker, value: Number(value),
        unit: document.getElementById('hr-unit').value.trim(),
        ref_low: document.getElementById('hr-low').value || null,
        ref_high: document.getElementById('hr-high').value || null,
        measured_at: document.getElementById('hr-date').value,
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
