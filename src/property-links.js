// Gestor de links múltiples por inmueble (property_links table)
// Carga, render dinámico, add/remove/reorder y persistencia.

import { supabase } from './supabase.js'

const TIPOS = [
  { id: 'video',    label: '🎥 Video',     placeholder: 'https://youtube.com/watch?v=...' },
  { id: 'foto',     label: '📷 Álbum',     placeholder: 'https://photos.app.goo.gl/...' },
  { id: 'tour',     label: '🌐 Tour 360°', placeholder: 'https://...' },
  { id: 'archivo',  label: '📁 Archivo',   placeholder: 'https://drive.google.com/...' },
  { id: 'otro',     label: '🔗 Otro',      placeholder: 'https://...' },
]

let _propertyId = null
let _links = []   // working copy en memoria del modal
let _tempIdSeq = 0

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))

export async function loadLinksFor(propertyId) {
  _propertyId = propertyId || null
  _tempIdSeq = 0
  if (!propertyId) { _links = []; return _links }
  const { data, error } = await supabase
    .from('property_links')
    .select('*')
    .eq('property_id', propertyId)
    .order('orden', { ascending: true })
  if (error) { console.error('[property-links] load', error); _links = []; return _links }
  _links = (data || []).map(l => ({ ...l, _isNew: false }))
  return _links
}

// Render del bloque dentro del form. Llamar tras loadLinksFor.
export function renderLinksBlock() {
  return `
    <div id="prop-links-container" style="display:flex;flex-direction:column;gap:8px;">
      ${_links.map(l => _renderLinkRow(l)).join('')}
    </div>
    <button type="button" onclick="window.propLinkAdd?.()"
      style="margin-top:10px;padding:8px 14px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);
      color:#22d3ee;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px;">
      + Agregar link
    </button>
    <div style="font-size:11px;color:#64748b;margin-top:6px;">
      Puedes agregar varios videos, álbumes o archivos. Se guardan al hacer "Guardar inmueble".
    </div>
  `
}

function _renderLinkRow(link) {
  const id = link.id || link._tempId
  return `
    <div data-link-id="${id}" class="prop-link-row"
      style="display:grid;grid-template-columns:130px 1fr 160px auto;gap:6px;align-items:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;">
      <select onchange="window.propLinkUpdate?.('${id}','tipo',this.value)"
        style="padding:6px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e8f0f9;font-size:12px;">
        ${TIPOS.map(t => `<option value="${t.id}" ${link.tipo===t.id?'selected':''}>${t.label}</option>`).join('')}
      </select>
      <input type="url" value="${_esc(link.url)}" placeholder="${_esc((TIPOS.find(t=>t.id===link.tipo)||TIPOS[0]).placeholder)}"
        onchange="window.propLinkUpdate?.('${id}','url',this.value)"
        style="padding:6px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e8f0f9;font-size:12px;min-width:0;"/>
      <input type="text" value="${_esc(link.label||'')}" placeholder="Etiqueta (opcional)"
        onchange="window.propLinkUpdate?.('${id}','label',this.value)"
        style="padding:6px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e8f0f9;font-size:12px;min-width:0;"/>
      <button type="button" onclick="window.propLinkRemove?.('${id}')"
        title="Quitar"
        style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:13px;">×</button>
    </div>`
}

// ─── Handlers globales del UI ────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.propLinkAdd = () => {
    _links.push({
      _tempId: 'new-' + (++_tempIdSeq),
      tipo: 'video',
      url: '',
      label: '',
      orden: _links.length,
      _isNew: true,
    })
    _repaint()
  }
  window.propLinkRemove = (idOrTemp) => {
    _links = _links.filter(l => (l.id || l._tempId) !== idOrTemp)
    _repaint()
  }
  window.propLinkUpdate = (idOrTemp, field, value) => {
    const l = _links.find(x => (x.id || x._tempId) === idOrTemp)
    if (l) l[field] = value
  }
}

function _repaint() {
  const cont = document.getElementById('prop-links-container')
  if (!cont) return
  cont.innerHTML = _links.map(l => _renderLinkRow(l)).join('')
}

// Persistencia: llama tras saveProp tener el id del inmueble
export async function persistLinks(propertyId) {
  if (!propertyId) return
  // Read current existing rows en DB para diff
  const { data: existing, error: errFetch } = await supabase
    .from('property_links')
    .select('id')
    .eq('property_id', propertyId)
  if (errFetch) { console.error('[property-links] fetch existing', errFetch); return }
  const existingIds = new Set((existing || []).map(r => r.id))
  const keepIds = new Set(_links.filter(l => !l._isNew && l.id).map(l => l.id))
  const toDelete = [...existingIds].filter(id => !keepIds.has(id))
  const toInsert = _links.filter(l => l._isNew && l.url?.trim())
    .map((l, i) => ({
      property_id: propertyId,
      tipo: l.tipo || 'otro',
      url: l.url.trim(),
      label: l.label?.trim() || null,
      orden: i + 1000,
    }))
  const toUpdate = _links.filter(l => !l._isNew && l.id && l.url?.trim())
    .map((l, i) => ({ id: l.id, tipo: l.tipo, url: l.url.trim(), label: l.label?.trim() || null, orden: i }))

  if (toDelete.length) await supabase.from('property_links').delete().in('id', toDelete)
  if (toInsert.length) await supabase.from('property_links').insert(toInsert)
  for (const u of toUpdate) {
    await supabase.from('property_links').update({
      tipo: u.tipo, url: u.url, label: u.label, orden: u.orden,
    }).eq('id', u.id)
  }
}

// Loader público para la vista pública (propiedad.html, detail)
export async function fetchLinksFor(propertyId) {
  const { data } = await supabase
    .from('property_links')
    .select('*')
    .eq('property_id', propertyId)
    .order('orden', { ascending: true })
  return data || []
}
