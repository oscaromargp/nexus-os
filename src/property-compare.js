// Nexus OS — Comparativa side-by-side de inmuebles
// Permite seleccionar 2-4 inmuebles y verlos en tabla comparativa.

import { supabase } from './supabase.js'

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
const _fmt$ = n => n ? '$' + Number(n).toLocaleString('es-MX') : '—'
const _fmtM2 = n => n ? Number(n).toLocaleString('es-MX') + ' m²' : '—'

let _selectedIds = new Set()
let _selectionActive = false

export function getSelectedIds() { return Array.from(_selectedIds) }
export function isSelectionActive() { return _selectionActive }

export function toggleSelectionMode() {
  _selectionActive = !_selectionActive
  if (!_selectionActive) _selectedIds.clear()
  _renderSelectionBar()
  window.renderInmuebles?.()
}

export function toggleSelection(id) {
  if (!_selectionActive) return
  if (_selectedIds.has(id)) _selectedIds.delete(id)
  else {
    if (_selectedIds.size >= 4) {
      window.showToast?.('Máximo 4 inmuebles para comparar')
      return
    }
    _selectedIds.add(id)
  }
  _renderSelectionBar()
}

function _renderSelectionBar() {
  let bar = document.getElementById('compare-bar')
  if (!_selectionActive || _selectedIds.size === 0) {
    bar?.remove()
    return
  }
  if (!bar) {
    bar = document.createElement('div')
    bar.id = 'compare-bar'
    bar.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0e1422;border:1px solid rgba(167,139,250,0.3);border-radius:14px;padding:10px 16px;box-shadow:0 12px 32px rgba(0,0,0,0.5);z-index:9051;display:flex;align-items:center;gap:12px;backdrop-filter:blur(10px);'
    document.body.appendChild(bar)
  }
  bar.innerHTML = `
    <span style="font-size:13px;color:#cbd5e1;font-weight:600;">${_selectedIds.size} seleccionado${_selectedIds.size===1?'':'s'}</span>
    ${_selectedIds.size >= 2 ? `
      <button onclick="window.openPropertyCompare?.()"
        style="padding:8px 16px;background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">
        🔄 Comparar
      </button>` : ''}
    <button onclick="window.togglePropertySelectionMode?.()"
      style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;">
      Cancelar
    </button>
  `
}

export async function openCompare() {
  if (_selectedIds.size < 2) {
    window.showToast?.('Selecciona al menos 2 inmuebles')
    return
  }
  const ids = Array.from(_selectedIds)
  const { data: props } = await supabase.from('properties').select('*').in('id', ids)
  if (!props?.length) { window.showToast?.('❌ No se cargaron datos'); return }

  const overlay = document.createElement('div')
  overlay.id = 'compare-modal-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10100;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(8px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  // Filas comparativas
  const ROWS = [
    { label: 'Tipo', get: p => p.tipo?.toUpperCase() || '—' },
    { label: 'Operación', get: p => (p.operacion || []).join(', ').toUpperCase() || '—' },
    { label: 'Estado',    get: p => p.status || '—' },
    { label: 'Ubicación', get: p => [p.colonia, p.municipio].filter(Boolean).join(', ') || '—' },
    { label: 'Precio venta', get: p => _fmt$(p.precio_venta), highlight: 'price' },
    { label: 'Precio renta', get: p => p.precio_renta ? _fmt$(p.precio_renta) + '/mes' : '—' },
    { label: 'Sup. terreno', get: p => _fmtM2(p.sup_terreno) },
    { label: 'Sup. construida', get: p => _fmtM2(p.sup_construida) },
    { label: '$ / m²', get: p => p.precio_venta && p.sup_construida ? '$' + Math.round(p.precio_venta / p.sup_construida).toLocaleString('es-MX') : '—', highlight: 'priceM2' },
    { label: 'Recámaras', get: p => p.recamaras || '—' },
    { label: 'Baños', get: p => p.banos || '—' },
    { label: 'Estacionamientos', get: p => p.estacionamientos || '—' },
    { label: 'Antigüedad', get: p => p.antiguedad_anios ? p.antiguedad_anios + ' años' : '—' },
    { label: 'Vista', get: p => p.vista || '—' },
    { label: 'Régimen', get: p => p.regimen_propiedad || '—' },
    { label: 'Servicios', get: p => [
        p.agua && 'agua', p.luz && 'luz', p.drenaje && 'drenaje', p.gas && 'gas', p.internet && 'internet',
      ].filter(Boolean).join(', ') || '—' },
    { label: 'Amenidades', get: p => [
        p.alberca && 'alberca', p.jardin && 'jardín', p.terraza && 'terraza',
        p.gym && 'gym', p.cisterna && 'cisterna', p.panel_solar && 'solar',
        p.vigilancia && 'vigilancia',
      ].filter(Boolean).join(', ') || '—' },
  ]

  // Calcula mejor valor por fila para resaltar (más barato $/m², más recámaras, etc)
  const bestIdx = {}
  ROWS.forEach((r, ri) => {
    if (r.highlight === 'price') {
      const prices = props.map(p => p.precio_venta || Infinity)
      const min = Math.min(...prices)
      bestIdx[ri] = min !== Infinity ? prices.indexOf(min) : -1
    } else if (r.highlight === 'priceM2') {
      const ratios = props.map(p => p.precio_venta && p.sup_construida ? p.precio_venta / p.sup_construida : Infinity)
      const min = Math.min(...ratios)
      bestIdx[ri] = min !== Infinity ? ratios.indexOf(min) : -1
    }
  })

  const cols = props.map((p, i) => {
    const firstFoto = (p.fotos || [])[0]
    const img = firstFoto?.url || firstFoto?.thumb_url || ''
    return `
      <div style="flex:1;min-width:180px;display:flex;flex-direction:column;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;overflow:hidden;">
        <div style="height:110px;background:#000;display:flex;align-items:center;justify-content:center;">
          ${img ? `<img src="${_esc(img)}" style="width:100%;height:100%;object-fit:cover;"/>` : `<div style="font-size:42px;opacity:0.3;">🏠</div>`}
        </div>
        <div style="padding:10px;flex:1;display:flex;flex-direction:column;">
          <div style="font-size:13px;font-weight:700;color:#f1f5f9;line-height:1.3;margin-bottom:4px;">${_esc(p.titulo || p.tipo + ' en ' + (p.colonia||p.municipio||''))}</div>
          <div style="font-size:11px;color:#64748b;">${_esc(p.folio_interno || '')}</div>
        </div>
      </div>
    `
  }).join('')

  overlay.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(167,139,250,0.3);border-radius:14px;width:100%;max-width:980px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
        <h3 style="margin:0;font-size:15px;font-weight:800;color:#a78bfa;">🔄 Comparar inmuebles · ${props.length} seleccionados</h3>
        <button onclick="document.getElementById('compare-modal-overlay').remove()"
          style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;">✕</button>
      </div>

      <div style="overflow-y:auto;padding:14px;">
        <!-- Cards superiores con cover -->
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">${cols}</div>

        <!-- Tabla comparativa -->
        <div style="border:1px solid rgba(255,255,255,0.06);border-radius:10px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            ${ROWS.map((r, ri) => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);${ri % 2 === 0 ? 'background:rgba(255,255,255,0.01);' : ''}">
                <td style="padding:8px 12px;color:#64748b;font-weight:600;width:140px;border-right:1px solid rgba(255,255,255,0.04);">${r.label}</td>
                ${props.map((p, pi) => {
                  const val = r.get(p)
                  const isBest = bestIdx[ri] === pi
                  return `<td style="padding:8px 12px;color:${isBest ? '#4ade80' : '#cbd5e1'};${isBest ? 'font-weight:700;' : ''}border-right:1px solid rgba(255,255,255,0.04);">${_esc(val)}${isBest ? ' 👍' : ''}</td>`
                }).join('')}
              </tr>
            `).join('')}
          </table>
        </div>

        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button onclick="window.exportCompareToPDF?.(['${ids.join("','")}'])"
            style="padding:10px 16px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.35);color:#22d3ee;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">📄 Exportar PDF</button>
          <button onclick="document.getElementById('compare-modal-overlay').remove()"
            style="padding:10px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;font-size:13px;">Cerrar</button>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
}

// Export PDF stub — usa window.print con CSS print
window.exportCompareToPDF = () => {
  const m = document.getElementById('compare-modal-overlay')?.querySelector('div')
  if (!m) return
  const w = window.open('', '_blank')
  if (!w) { window.showToast?.('Permite popups para exportar PDF'); return }
  w.document.write(`<!DOCTYPE html><html><head><title>Comparativa Nexus OS</title>
    <style>body{font-family:sans-serif;background:#fff;color:#000;padding:20px;}
    table{width:100%;border-collapse:collapse;font-size:11px;}
    td{padding:6px 10px;border:1px solid #ddd;}
    img{max-width:100%;}</style></head><body>${m.innerHTML.replace(/onclick="[^"]*"/g, '')}</body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

if (typeof window !== 'undefined') {
  window.togglePropertySelectionMode = toggleSelectionMode
  window.togglePropertySelection = toggleSelection
  window.openPropertyCompare = openCompare
  window.isPropertySelectionActive = isSelectionActive
  window.isPropertySelected = (id) => _selectedIds.has(id)
}
