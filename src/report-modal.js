// Modal de generación de Reporte: ¿Quién presenta? + Propósito (override)
// Llama POST /api/generate-report y abre /reporte?id=xxx al terminar.

import { supabase } from './supabase.js'

const PROPOSITOS = [
  'Residencial familiar',
  'Departamento residencial',
  'Departamento en renta',
  'Casa en renta',
  'Macrolote / Inversión patrimonial',
  'Lote para desarrollo',
  'Terreno en renta',
  'Hostal / Renta vacacional',
  'Local comercial en renta',
  'Local comercial (venta)',
  'Oficina corporativa',
  'Bodega industrial',
  'Bodega/almacén en renta',
  'Nave industrial',
  'Eco-luxury retreat',
  'Otro (escribir abajo)',
]

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))

function deriveProposito(prop) {
  const ops = Array.isArray(prop.operacion) ? prop.operacion : []
  const t = prop.tipo
  const op = ops.includes('renta') ? 'renta' : (ops.includes('venta') ? 'venta' : (ops[0] || ''))
  const map = {
    'casa-venta':         'Residencial familiar',
    'casa-renta':         'Casa en renta',
    'departamento-venta': 'Departamento residencial',
    'departamento-renta': 'Departamento en renta',
    'terreno-venta':      'Macrolote / Inversión patrimonial',
    'terreno-renta':      'Terreno en renta',
    'lote-venta':         'Lote para desarrollo',
    'local-venta':        'Local comercial (venta)',
    'local-renta':        'Local comercial en renta',
    'oficina-renta':      'Oficina corporativa',
    'oficina-venta':      'Oficina corporativa',
    'bodega-venta':       'Bodega industrial',
    'bodega-renta':       'Bodega/almacén en renta',
    'nave-venta':         'Nave industrial',
    'nave-renta':         'Nave industrial',
  }
  return map[`${t}-${op}`] || `${t || 'Inmueble'} en ${op || 'oferta'}`
}

async function loadPresenters() {
  // 35 contactos tipo persona; los con rol "colaborador" van primero
  const { data, error } = await supabase
    .from('nodes')
    .select('id, content, metadata')
    .eq('type', 'persona')
  if (error) { console.error('[report-modal] presenters', error); return [] }
  const rows = (data || []).map(n => {
    const m = n.metadata || {}
    const isCollab = Array.isArray(m.roles) && m.roles.includes('colaborador')
    return {
      id: n.id,
      nombre: m.name || n.content,
      tel:    m.phone || m.phones?.[0]?.number || '',
      email:  m.email || '',
      photo:  m.photo_url || '',
      isCollab,
    }
  })
  rows.sort((a, b) => (b.isCollab - a.isCollab) || a.nombre.localeCompare(b.nombre))
  return rows
}

export async function openReportModal(propertyOrId) {
  const property = typeof propertyOrId === 'string'
    ? (await supabase.from('properties').select('*').eq('id', propertyOrId).single()).data
    : propertyOrId
  if (!property) { window.showToast?.('❌ Inmueble no encontrado'); return }

  const presenters = await loadPresenters()
  const autoProposito = deriveProposito(property)

  const overlay = document.createElement('div')
  overlay.id = 'report-modal-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  overlay.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(250,204,21,0.25);border-radius:16px;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;box-shadow:0 28px 80px rgba(0,0,0,0.7);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <h3 style="margin:0;font-size:15px;font-weight:800;color:#facc15;">🌟 Generar Reporte geomarketing</h3>
        <button onclick="document.getElementById('report-modal-overlay').remove()"
          style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;">✕</button>
      </div>

      <div style="padding:20px 22px;">

        <!-- Quién presenta -->
        <div style="margin-bottom:18px;">
          <label style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:8px;">¿Quién presenta este inmueble?</label>
          <select id="rep-presenter" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e8f0f9;font-size:13px;">
            <option value="">— Selecciona presentador —</option>
            <optgroup label="Colaboradores">
              ${presenters.filter(p => p.isCollab).map(p => `
                <option value="${p.id}" data-tel="${_esc(p.tel)}" data-email="${_esc(p.email)}">
                  ${_esc(p.nombre)}${p.tel?' · '+_esc(p.tel):''}
                </option>`).join('')}
            </optgroup>
            <optgroup label="Otros contactos">
              ${presenters.filter(p => !p.isCollab).map(p => `
                <option value="${p.id}" data-tel="${_esc(p.tel)}" data-email="${_esc(p.email)}">
                  ${_esc(p.nombre)}${p.tel?' · '+_esc(p.tel):''}
                </option>`).join('')}
            </optgroup>
            <option value="__manual__">📝 Otro presentador (escribir manualmente)</option>
          </select>

          <div id="rep-manual" style="display:none;margin-top:10px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.12);border-radius:8px;padding:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <input id="rep-man-nombre" type="text" placeholder="Nombre"
                style="padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e8f0f9;font-size:12px;"/>
              <input id="rep-man-tel" type="tel" placeholder="Tel (con LADA)"
                style="padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e8f0f9;font-size:12px;"/>
            </div>
            <input id="rep-man-email" type="email" placeholder="Email (opcional)"
              style="margin-top:8px;width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e8f0f9;font-size:12px;box-sizing:border-box;"/>
          </div>
        </div>

        <!-- Propósito -->
        <div style="margin-bottom:22px;">
          <label style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:8px;">
            Propósito del inmueble en el reporte
          </label>
          <div style="background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.18);border-radius:8px;padding:10px 12px;margin-bottom:10px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:3px;">Auto-detectado:</div>
            <div style="font-size:13px;color:#22d3ee;font-weight:700;">${_esc(autoProposito)}</div>
          </div>
          <select id="rep-proposito" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e8f0f9;font-size:13px;">
            ${PROPOSITOS.map(p => `<option value="${_esc(p)}" ${p===autoProposito?'selected':''}>${_esc(p)}</option>`).join('')}
          </select>
          <input id="rep-proposito-custom" type="text" placeholder="Propósito personalizado"
            style="display:none;margin-top:8px;width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#e8f0f9;font-size:13px;box-sizing:border-box;"/>
        </div>

        <!-- Aviso costo y tiempo -->
        <div style="background:rgba(250,204,21,0.05);border:1px solid rgba(250,204,21,0.15);border-radius:8px;padding:10px 12px;margin-bottom:18px;font-size:12px;color:#fde68a;line-height:1.6;">
          ⏱ La generación tarda <strong>15–30 segundos</strong>: recolectamos POIs, clima e información geográfica reales,
          y un modelo de IA redacta el HTML del reporte (Gemini Flash · free tier).
          El reporte queda guardado y puedes abrirlo o regenerarlo después.
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button onclick="document.getElementById('report-modal-overlay').remove()"
            style="padding:9px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;font-size:13px;">Cancelar</button>
          <button id="rep-generate"
            style="padding:9px 20px;background:linear-gradient(135deg,#facc15,#f59e0b);border:none;color:#0a0e1f;border-radius:8px;cursor:pointer;font-size:13px;font-weight:800;">
            🌟 Generar reporte
          </button>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  const presenterSel = overlay.querySelector('#rep-presenter')
  const manualBlock = overlay.querySelector('#rep-manual')
  presenterSel.onchange = () => {
    manualBlock.style.display = presenterSel.value === '__manual__' ? 'block' : 'none'
  }

  const propSel = overlay.querySelector('#rep-proposito')
  const propCustom = overlay.querySelector('#rep-proposito-custom')
  propSel.onchange = () => {
    propCustom.style.display = propSel.value === 'Otro (escribir abajo)' ? 'block' : 'none'
  }

  overlay.querySelector('#rep-generate').onclick = async () => {
    const presenterId = presenterSel.value
    if (!presenterId) { window.showToast?.('Selecciona un presentador'); return }

    const body = { property_id: property.id }
    if (presenterId === '__manual__') {
      const nombre = overlay.querySelector('#rep-man-nombre').value.trim()
      const tel    = overlay.querySelector('#rep-man-tel').value.trim()
      const email  = overlay.querySelector('#rep-man-email').value.trim()
      if (!nombre || !tel) { window.showToast?.('Nombre y tel son requeridos'); return }
      body.presenter_data = { nombre, tel, email }
    } else {
      body.presenter_node_id = presenterId
    }

    const propValue = propSel.value === 'Otro (escribir abajo)'
      ? (propCustom.value.trim() || autoProposito)
      : propSel.value
    body.proposito = propValue

    const btn = overlay.querySelector('#rep-generate')
    btn.disabled = true
    btn.textContent = '⏳ Generando…'

    try {
      const r = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok || !data.report_id) {
        window.showToast?.('❌ ' + (data.error || 'Error generando reporte'))
        btn.disabled = false; btn.textContent = '🌟 Generar reporte'
        return
      }
      window.showToast?.('✨ Reporte generado — abriendo…')
      try { window.nexusTrack?.('action:report_generate', { property_id: property.id, proposito: propValue }) } catch {}
      overlay.remove()
      window.open(`/reporte?id=${data.report_id}`, '_blank')
    } catch (e) {
      window.showToast?.('❌ ' + e.message)
      btn.disabled = false; btn.textContent = '🌟 Generar reporte'
    }
  }
}

if (typeof window !== 'undefined') {
  window.propOpenReportModal = openReportModal
}
