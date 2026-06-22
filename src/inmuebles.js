/**
 * Nexus OS — Módulo Inmobiliario v1.1
 * src/inmuebles.js
 *
 * Exporta:
 *   renderInmuebles()          — vista principal (grid/lista + filtros)
 *   openPropModal(id?)         — modal crear/editar
 *   openPropDetail(id)         — modal detalle con galería + historial CRM
 *   window.* handlers          — acciones desde HTML
 */

import { supabase } from './supabase.js'
import Sortable from 'sortablejs'
import { pdfFichaCaptacion } from './pdf-inmuebles.js'
import { renderDocumentos, loadPropertyDocs } from './docs-inmuebles.js'
import { loadMxLocations, renderEstadoMunicipioSelects } from './mx-locations.js'
import { openMapPicker } from './map-picker.js'
import { loadLinksFor, renderLinksBlock, persistLinks, fetchLinksFor } from './property-links.js'
import './property-compare.js'
import { ensureNexusFolder, uploadToDrive, hasDriveAccess, driveDirectImageUrl } from './drive-storage.js'

// ─── Estado del módulo ────────────────────────────────────────────────────────
let _props       = []          // todas las propiedades del usuario
let _interactions= {}          // { [propId]: interaction[] }
let _propFilters = {
  tipo: '', operacion: '', status: '', colonia: '',
  precioMin: '', precioMax: '', search: '',
}
let _propView    = localStorage.getItem('nexus_prop_view') || 'grid'
let _propPage    = 1
let _inmTab      = localStorage.getItem('nexus_inm_tab')  || 'propiedades'
const _PAGE_SIZE = 12
let _propLoading = false

// Folio consecutivo (se calcula al crear)
let _propFolioSeq = 0

// ─── Catálogos ────────────────────────────────────────────────────────────────
export const PROP_TIPOS = [
  { id: 'casa',       label: 'Casa',        icon: '🏠' },
  { id: 'depto',      label: 'Departamento',icon: '🏢' },
  { id: 'terreno',    label: 'Terreno',     icon: '🌿' },
  { id: 'lote',       label: 'Lote',        icon: '📐' },
  { id: 'bodega',     label: 'Bodega',      icon: '🏭' },
  { id: 'local',      label: 'Local',       icon: '🏪' },
  { id: 'nave',       label: 'Nave',        icon: '🏗️' },
]

const PROP_STATUS = [
  { id: 'captacion',    label: 'Captación',    color: '#60a5fa' },
  { id: 'activa',       label: 'Activa',       color: '#4ade80' },
  { id: 'negociacion',  label: 'Negociación',  color: '#fb923c' },
  { id: 'vendida',      label: 'Vendida',      color: '#a78bfa' },
  { id: 'cancelada',    label: 'Cancelada',    color: '#64748b' },
]

// Campos que aplican por tipo
const TIPO_FIELDS = {
  casa:    ['recamaras','banos','medios_banos','estacionamientos','pisos','antiguedad_anios','amueblado','sup_construida','sup_terreno','frente','fondo'],
  depto:   ['recamaras','banos','medios_banos','estacionamientos','pisos','antiguedad_anios','amueblado','sup_construida'],
  terreno: ['sup_terreno','frente','fondo'],
  lote:    ['sup_terreno','frente','fondo'],
  bodega:  ['sup_construida','sup_terreno','pisos'],
  local:   ['sup_construida','pisos','amueblado'],
  nave:    ['sup_construida','sup_terreno','pisos'],
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function _fmt$(n, mon = 'MXN') {
  if (!n && n !== 0) return '—'
  const v = Number(n)
  if (mon === 'USD') return 'USD ' + v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function _fmtM2(n) {
  if (!n) return '—'
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' m²'
}

function _statusInfo(s) {
  return PROP_STATUS.find(x => x.id === s) || PROP_STATUS[0]
}

function _tipoInfo(t) {
  return PROP_TIPOS.find(x => x.id === t) || PROP_TIPOS[0]
}

function _buildSlug(p) {
  const parts = []
  if (p.tipo)      parts.push(p.tipo)
  if (p.recamaras) parts.push(p.recamaras + 'rec')
  if (p.colonia)   parts.push(p.colonia.toLowerCase().replace(/\s+/g, '-'))
  if (p.municipio) parts.push(p.municipio.toLowerCase().replace(/\s+/g, '-'))
  if (p.estado_rep) parts.push(p.estado_rep.toLowerCase())
  return parts.join('-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 80)
}

function _buildFolio(seq) {
  const y = new Date().getFullYear()
  return `LP-${y}-${String(seq).padStart(3, '0')}`
}

function _precioLabel(p) {
  if (p.precio_venta && p.precio_renta) return _fmt$(p.precio_venta, p.moneda) + ' / ' + _fmt$(p.precio_renta, p.moneda) + '/mes'
  if (p.precio_venta) return _fmt$(p.precio_venta, p.moneda)
  if (p.precio_renta) return _fmt$(p.precio_renta, p.moneda) + '/mes'
  return 'Precio a consultar'
}

function _filtered() {
  const f = _propFilters
  let list = [..._props]
  if (f.tipo)      list = list.filter(p => p.tipo === f.tipo)
  if (f.operacion) list = list.filter(p => (p.operacion || []).includes(f.operacion))
  if (f.status)    list = list.filter(p => p.status === f.status)
  if (f.colonia)   list = list.filter(p => (p.colonia || '').toLowerCase().includes(f.colonia.toLowerCase()))
  if (f.precioMin) list = list.filter(p => (p.precio_venta || p.precio_renta || 0) >= Number(f.precioMin))
  if (f.precioMax) list = list.filter(p => (p.precio_venta || p.precio_renta || Infinity) <= Number(f.precioMax))
  if (f.search) {
    const q = f.search.toLowerCase()
    list = list.filter(p =>
      (p.titulo || '').toLowerCase().includes(q) ||
      (p.colonia || '').toLowerCase().includes(q) ||
      (p.calle || '').toLowerCase().includes(q) ||
      (p.folio_interno || '').toLowerCase().includes(q) ||
      (p.dueno_nombre || '').toLowerCase().includes(q)
    )
  }
  return list
}

function _coloniasList() {
  const set = new Set(_props.map(p => p.colonia).filter(Boolean))
  return [...set].sort()
}

function _getThumb(p) {
  const fotos = p.fotos || []
  // Si el usuario marcó foto principal, esa gana (columna dedicada main_image_url)
  const mainUrl = p.main_image_url
  if (mainUrl) {
    const m = fotos.find(f => (f.url || f.thumb_url) === mainUrl)
    if (m) return m.thumb_url || m.url
    return mainUrl
  }
  const first = fotos[0]
  if (!first) return null
  return first.thumb_url || first.url || null
}

// ─── Carga de datos ───────────────────────────────────────────────────────────
export async function loadProperties() {
  _propLoading = true
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) { console.error('[inmuebles] load:', error); _propLoading = false; return }
  _props = data || []
  _propFolioSeq = _props.length + 1
  _propLoading = false
}

// Cargar inmuebles en papelera (eliminados últimos 30 días)
export async function loadTrash() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', cutoff)
    .order('deleted_at', { ascending: false })
  if (error) { console.error('[inmuebles] trash:', error); return [] }
  return data || []
}

// Soft delete · funciona tanto desde la lista como desde el detalle modal
window.propDelete = async (id) => {
  const p = _props.find(x => x.id === id)
  if (!p) return
  const label = p.titulo || p.folio_interno || 'este inmueble'
  if (!confirm(`¿Enviar "${label}" a la papelera?\n\nPodrás recuperarlo dentro de 30 días desde la vista Papelera.`)) return
  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { window.showToast?.('❌ No se pudo eliminar: ' + error.message); return }
  _props = _props.filter(x => x.id !== id)
  // Cierra el overlay de detalle si está abierto
  document.getElementById('prop-detail-overlay')?.remove()
  window.showToast?.('🗑️ Inmueble enviado a papelera (recupéralo en 30 días)')
  window.renderInmuebles?.()
}

// Restaurar desde papelera
window.propRestore = async (id) => {
  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) { window.showToast?.('❌ No se pudo restaurar: ' + error.message); return }
  window.showToast?.('♻️ Inmueble restaurado')
  await loadProperties()
  window.renderInmuebles?.()
}

// Hard delete definitivo desde papelera
window.propPurge = async (id) => {
  if (!confirm('⚠️ ELIMINAR DEFINITIVAMENTE\n\nEsta acción NO se puede deshacer. ¿Continuar?')) return
  const { error } = await supabase.from('properties').delete().eq('id', id)
  if (error) { window.showToast?.('❌ No se pudo eliminar: ' + error.message); return }
  window.showToast?.('🔥 Inmueble eliminado definitivamente')
  window.renderInmuebles?.()
}

// ─── CRM — Historial de interacciones ─────────────────────────────────────────
export async function loadInteractions(propId) {
  const { data } = await supabase
    .from('property_interactions')
    .select('*')
    .eq('property_id', propId)
    .order('created_at', { ascending: false })
    .limit(20)
  _interactions[propId] = data || []
  return _interactions[propId]
}

export async function logInteraction(propId, tipo, descripcion, monto = null) {
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return
  const { data, error } = await supabase
    .from('property_interactions')
    .insert({ property_id: propId, user_id: user.id, tipo, descripcion, monto })
    .select()
    .single()
  if (error) { console.error('[inmuebles] logInteraction:', error); return null }
  if (!_interactions[propId]) _interactions[propId] = []
  _interactions[propId].unshift(data)
  return data
}

function _renderHistorial(propId) {
  const items = _interactions[propId] || []
  const TIPO_ICONS = {
    visita:'👁', llamada:'📞', whatsapp:'📲', oferta:'💰',
    nota:'📝', cambio_status:'🔄', otro:'📌',
  }
  const TIPO_COLORS = {
    visita:'#60a5fa', llamada:'#a78bfa', whatsapp:'#4ade80', oferta:'#fb923c',
    nota:'#facc15', cambio_status:'#22d3ee', otro:'#94a3b8',
  }

  return `
    <div style="margin-top:0;">
      <!-- Log nueva interacción -->
      <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;margin-bottom:12px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          ${['visita','llamada','whatsapp','oferta','nota'].map(t=>`
            <button onclick="propSelectInterTipo('${t}')" id="inter-tipo-${t}"
              style="padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;transition:all 0.15s;
              background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#7a8899;">
              ${TIPO_ICONS[t]} ${t.charAt(0).toUpperCase()+t.slice(1)}
            </button>`).join('')}
        </div>
        <input type="hidden" id="inter-tipo-val" value="nota"/>
        <div style="display:flex;gap:8px;">
          <input type="text" id="inter-desc" placeholder="Descripción de la interacción..."
            style="flex:1;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;"
            onkeydown="if(event.key==='Enter')propLogInter('${propId}')"/>
          <input type="number" id="inter-monto" placeholder="$ Monto" step="0.01"
            style="width:100px;padding:8px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;"/>
          <button onclick="propLogInter('${propId}')"
            style="padding:8px 14px;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0d0f1f;
            font-weight:700;border:none;border-radius:8px;cursor:pointer;font-size:12px;white-space:nowrap;">
            + Registrar
          </button>
        </div>
      </div>

      <!-- Lista de interacciones -->
      <div id="inter-list-${propId}" style="display:flex;flex-direction:column;gap:6px;">
        ${items.length === 0
          ? `<div style="text-align:center;padding:20px;color:#4b5563;font-size:13px;">Sin interacciones registradas</div>`
          : items.map(it => {
            const color = TIPO_COLORS[it.tipo] || '#94a3b8'
            const icon  = TIPO_ICONS[it.tipo]  || '📌'
            const fecha = new Date(it.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
            return `
              <div style="display:flex;gap:10px;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;border-left:3px solid ${color};">
                <div style="font-size:18px;flex-shrink:0;">${icon}</div>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;">${_esc(it.tipo||'nota')}</span>
                    ${it.monto ? `<span style="font-size:11px;color:#4ade80;font-weight:700;">$${Number(it.monto).toLocaleString('es-MX')}</span>` : ''}
                    <span style="font-size:10px;color:#4b5563;margin-left:auto;">${fecha}</span>
                  </div>
                  <div style="font-size:13px;color:#94a3b8;margin-top:3px;">${_esc(it.descripcion||'')}</div>
                </div>
              </div>`
          }).join('')}
      </div>
    </div>
  `
}

// ─── Render principal ─────────────────────────────────────────────────────────
export function renderInmuebles() {
  const container = document.getElementById('app-content')
  if (!container) return

  const filtered    = _filtered()
  const totalPages  = Math.ceil(filtered.length / _PAGE_SIZE)
  const paged       = filtered.slice((_propPage - 1) * _PAGE_SIZE, _propPage * _PAGE_SIZE)

  container.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:0 0 40px;">

      <!-- ── Módulo tabs ── -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;gap:0;background:rgba(255,255,255,0.04);border-radius:10px;padding:3px;border:1px solid rgba(255,255,255,0.07);">
          <button onclick="inmSetTab('propiedades')"
            style="padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:all 0.15s;
            background:${_inmTab==='propiedades'?'rgba(34,211,238,0.18)':'transparent'};
            color:${_inmTab==='propiedades'?'#22d3ee':'#64748b'};">
            🏘 Propiedades
          </button>
          <button onclick="inmSetTab('tramites')"
            style="padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:all 0.15s;
            background:${_inmTab==='tramites'?'rgba(167,139,250,0.18)':'transparent'};
            color:${_inmTab==='tramites'?'#a78bfa':'#64748b'};">
            📋 Trámites
          </button>
          <button onclick="inmSetTab('papelera')"
            style="padding:8px 18px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:all 0.15s;
            background:${_inmTab==='papelera'?'rgba(239,68,68,0.18)':'transparent'};
            color:${_inmTab==='papelera'?'#ef4444':'#64748b'};">
            🗑️ Papelera
          </button>
        </div>
        ${_inmTab === 'propiedades' ? `
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <div style="display:flex;background:rgba(255,255,255,0.05);border-radius:8px;padding:2px;">
              <button onclick="propSetView('grid')"
                style="padding:5px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;
                background:${_propView==='grid'?'rgba(34,211,238,0.15)':'transparent'};
                color:${_propView==='grid'?'#22d3ee':'#7a8899'};">⊞ Grid</button>
              <button onclick="propSetView('lista')"
                style="padding:5px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;
                background:${_propView==='lista'?'rgba(34,211,238,0.15)':'transparent'};
                color:${_propView==='lista'?'#22d3ee':'#7a8899'};">☰ Lista</button>
            </div>
            <button onclick="togglePropertySelectionMode()"
              title="Activa selección múltiple para comparar"
              style="padding:7px 12px;background:${window.isPropertySelectionActive?.() ? 'rgba(167,139,250,0.18)' : 'rgba(167,139,250,0.06)'};border:1px solid rgba(167,139,250,0.3);
              color:#a78bfa;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">
              🔄 Comparar
            </button>
            <button onclick="openPropModal()"
              style="padding:8px 18px;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0d0f1f;
              font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;">
              + Captar inmueble
            </button>
          </div>` : ''}
      </div>

      ${_inmTab === 'tramites' ? _renderTramites() :
        _inmTab === 'papelera' ? `<div id="papelera-mount">${_renderPapeleraSkeleton()}</div>` : `
        <!-- ── Filtros ── -->
        ${_renderFilters(filtered.length)}
        <!-- ── KPIs rápidos ── -->
        ${_renderKpis()}
        <!-- ── Contenido ── -->
        ${_propLoading ? _loadingSkeleton() : (
          paged.length === 0 ? _emptyState() :
          _propView === 'grid' ? _renderGrid(paged) : _renderLista(paged)
        )}
        <!-- ── Paginación ── -->
        ${totalPages > 1 ? _renderPagination(totalPages) : ''}
      `}
    </div>
  `
}

// ─── Render: tab Papelera ─────────────────────────────────────────────────────
function _renderPapeleraSkeleton() {
  // Trigger async load after mount
  setTimeout(() => _mountPapelera(), 30)
  return `<div style="text-align:center;padding:60px 20px;color:#64748b;">Cargando papelera…</div>`
}

async function _mountPapelera() {
  const trash = await loadTrash()
  const el = document.getElementById('papelera-mount')
  if (!el) return
  if (!trash.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#64748b;">
        <div style="font-size:64px;margin-bottom:16px;opacity:0.4;">🗑️</div>
        <h3 style="color:#94a3b8;margin:0 0 8px;font-size:16px;">Papelera vacía</h3>
        <p style="font-size:13px;color:#64748b;margin:0;">Los inmuebles eliminados se conservan 30 días antes de borrarse definitivamente.</p>
      </div>`
    return
  }
  el.innerHTML = `
    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px 16px;margin-bottom:14px;color:#fca5a5;font-size:12px;">
      ⏳ ${trash.length} inmueble${trash.length>1?'s':''} en papelera. Se eliminan automáticamente 30 días después de su envío.
    </div>
    <div style="display:grid;gap:10px;">
      ${trash.map(p => {
        const tipo = _tipoInfo(p.tipo)
        const daysLeft = 30 - Math.floor((Date.now() - new Date(p.deleted_at).getTime()) / 86400000)
        return `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <span style="font-size:28px;">${tipo.icon}</span>
            <div style="flex:1;min-width:200px;">
              <div style="font-weight:700;color:#f1f5f9;font-size:14px;">${_esc(p.titulo || tipo.label + ' en ' + (p.colonia||p.municipio||''))}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">
                ${p.folio_interno ? _esc(p.folio_interno) + ' · ' : ''}Eliminado hace ${30 - daysLeft} día${30-daysLeft===1?'':'s'} · Quedan ${daysLeft} día${daysLeft===1?'':'s'}
              </div>
            </div>
            <button onclick="propRestore('${p.id}')"
              style="padding:6px 12px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);
              color:#22d3ee;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">♻️ Restaurar</button>
            <button onclick="propPurge('${p.id}')"
              style="padding:6px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);
              color:#ef4444;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">🔥 Borrar</button>
          </div>`
      }).join('')}
    </div>`
}

// ─── Render: tab Trámites ──────────────────────────────────────────────────────
function _renderTramites() {
  // Secciones estilo Par de Santos
  const CAMPO_FORMS = [
    { name:'Registro de Campo',     desc:'Captura de leads en campo (prospectos)',         url:'https://forms.gle/6QVv7DeM763Gz9HJA' },
    { name:'Registro de Propiedad', desc:'Alta de propiedad desde campo con fotos',        url:'https://forms.gle/3ULqTMBdCvJVtZqF8' },
  ]
  const RECURSOS = [
    { name:'Drive Corporativo',   icon:'📁', url:'https://drive.google.com' },
    { name:'Google Fotos',        icon:'📷', url:'https://photos.google.com' },
    { name:'Logo y Marca',        icon:'🎨', url:'https://sites.google.com/view/pardesantos' },
    { name:'Papelería',           icon:'📄', url:'https://sites.google.com/view/pardesantos' },
  ]

  // Plantillas por categoría
  const cats = [
    { key:'captacion',  label:'Captación',        color:'#22d3ee', icon:'📋',
      tpls: window._INMUEBLES_TEMPLATES?.filter(t=>t.cat==='captacion') || [] },
    { key:'negociacion',label:'Negociación',       color:'#fb923c', icon:'🤝',
      tpls: window._INMUEBLES_TEMPLATES?.filter(t=>t.cat==='negociacion') || [] },
    { key:'profeco',    label:'Contratos PROFECO', color:'#a78bfa', icon:'📜',
      tpls: window._INMUEBLES_TEMPLATES?.filter(t=>t.cat==='profeco') || [] },
  ]

  return `
    <!-- Header Trámites -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
      <div>
        <h3 style="margin:0;font-size:18px;font-weight:800;color:#e8f0f9;">📋 Biblioteca de Trámites</h3>
        <p style="font-size:12px;color:#64748b;margin:4px 0 0;">Documentos legales inmobiliarios · metodología Par de Santos</p>
      </div>
      <a href="https://sites.google.com/view/pardesantos" target="_blank" rel="noopener"
        style="display:inline-flex;align-items:center;gap:7px;padding:8px 16px;
        background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;
        border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
        🔗 Ver originales Par de Santos
      </a>
    </div>

    <!-- ── CAMPO ── -->
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:800;color:#22d3ee;text-transform:uppercase;letter-spacing:0.1em;
      margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <span style="background:rgba(34,211,238,0.15);padding:3px 10px;border-radius:4px;">🏠 CAMPO</span>
        <span style="flex:1;height:1px;background:rgba(34,211,238,0.15);"></span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
        <!-- Captar propiedad rápido -->
        <div onclick="openPropModal()" style="cursor:pointer;padding:14px 16px;background:rgba(34,211,238,0.06);
          border:1px solid rgba(34,211,238,0.2);border-radius:12px;display:flex;align-items:center;gap:12px;transition:all 0.15s;"
          onmouseover="this.style.background='rgba(34,211,238,0.12)'" onmouseout="this.style.background='rgba(34,211,238,0.06)'">
          <div style="width:38px;height:38px;background:rgba(34,211,238,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;">🏠</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#e2e8f0;">Captar inmueble</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Alta rápida en Nexus OS</div>
          </div>
        </div>
        ${CAMPO_FORMS.map(f=>`
          <a href="${f.url}" target="_blank" rel="noopener"
            style="padding:14px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
            border-radius:12px;display:flex;align-items:center;gap:12px;text-decoration:none;transition:all 0.15s;"
            onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <div style="width:38px;height:38px;background:rgba(74,222,128,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;">📝</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:#e2e8f0;">${f.name}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">${f.desc}</div>
            </div>
            <span style="margin-left:auto;font-size:11px;color:#22d3ee;opacity:0.6;">↗</span>
          </a>`).join('')}
      </div>
    </div>

    <!-- ── OFICINA — secciones por categoría ── -->
    ${cats.map(cat=>`
      <div style="margin-bottom:28px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;
        color:${cat.color};margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span style="background:${cat.color}18;padding:3px 10px;border-radius:4px;">${cat.icon} OFICINA · ${cat.label.toUpperCase()}</span>
          <span style="flex:1;height:1px;background:${cat.color}25;"></span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">
          ${cat.tpls.length ? cat.tpls.map(tpl=>`
            <div style="padding:14px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
              border-radius:12px;display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="width:36px;height:36px;background:${cat.color}15;border-radius:9px;
                  display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">${cat.icon}</div>
                <div style="min-width:0;">
                  <div style="font-size:13px;font-weight:700;color:#e2e8f0;line-height:1.3;">${tpl.name}</div>
                  ${tpl.desc?`<div style="font-size:11px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tpl.desc}</div>`:''}
                </div>
              </div>
              <div style="display:flex;gap:6px;margin-top:2px;">
                <button onclick="docPreviewFromLib('${tpl.id}')"
                  style="flex:1;padding:7px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
                  color:#94a3b8;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;">
                  👁 Vista previa
                </button>
                <button onclick="docCreateFromLib('${tpl.id}')"
                  style="flex:1;padding:7px 10px;background:${cat.color}15;border:1px solid ${cat.color}40;
                  color:${cat.color};border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;">
                  ✚ Crear
                </button>
              </div>
            </div>`).join('')
          : `<div style="color:#475569;font-size:12px;padding:12px;grid-column:1/-1;">
              Cargando plantillas... <span style="font-size:11px;">(asegúrate de haber entrado al módulo)</span>
            </div>`}
        </div>
      </div>`).join('')}

    <!-- ── RECURSOS ── -->
    <div style="margin-bottom:20px;">
      <div style="font-size:10px;font-weight:800;color:#fbbf24;text-transform:uppercase;letter-spacing:0.1em;
      margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <span style="background:rgba(251,191,36,0.15);padding:3px 10px;border-radius:4px;">🎨 RECURSOS Y DISEÑO</span>
        <span style="flex:1;height:1px;background:rgba(251,191,36,0.15);"></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${RECURSOS.map(r=>`
          <a href="${r.url}" target="_blank" rel="noopener"
            style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;
            background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#94a3b8;
            border-radius:8px;text-decoration:none;font-size:12px;transition:all 0.15s;"
            onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
            ${r.icon} ${r.name} <span style="opacity:0.4;font-size:10px;">↗</span>
          </a>`).join('')}
      </div>
    </div>
  `
}

// ─── Filtros ──────────────────────────────────────────────────────────────────
function _renderFilters(count) {
  const f = _propFilters
  const colonias = _coloniasList()
  const hasFilters = f.tipo || f.operacion || f.status || f.colonia || f.precioMin || f.precioMax || f.search

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center;">
      <!-- Búsqueda -->
      <input
        type="text" placeholder="🔍 Buscar por título, colonia, calle, folio..." value="${_esc(f.search)}"
        oninput="propFilter('search', this.value)"
        style="flex:1;min-width:220px;padding:8px 12px;background:rgba(255,255,255,0.06);
        border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;"/>

      <!-- Tipo -->
      <select onchange="propFilter('tipo',this.value)"
        style="padding:8px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:${f.tipo?'#22d3ee':'#7a8899'};font-size:12px;cursor:pointer;">
        <option value="">🏠 Todos los tipos</option>
        ${PROP_TIPOS.map(t=>`<option value="${t.id}" ${f.tipo===t.id?'selected':''}>${t.icon} ${t.label}</option>`).join('')}
      </select>

      <!-- Operación -->
      <select onchange="propFilter('operacion',this.value)"
        style="padding:8px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:${f.operacion?'#22d3ee':'#7a8899'};font-size:12px;cursor:pointer;">
        <option value="">💼 Operación</option>
        <option value="venta"    ${f.operacion==='venta'?'selected':''}>Venta</option>
        <option value="renta"    ${f.operacion==='renta'?'selected':''}>Renta</option>
        <option value="traspaso" ${f.operacion==='traspaso'?'selected':''}>Traspaso</option>
      </select>

      <!-- Status -->
      <select onchange="propFilter('status',this.value)"
        style="padding:8px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:${f.status?'#22d3ee':'#7a8899'};font-size:12px;cursor:pointer;">
        <option value="">● Status</option>
        ${PROP_STATUS.map(s=>`<option value="${s.id}" ${f.status===s.id?'selected':''} style="color:${s.color}">${s.label}</option>`).join('')}
      </select>

      <!-- Colonia -->
      ${colonias.length ? `
        <select onchange="propFilter('colonia',this.value)"
          style="padding:8px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
          border-radius:8px;color:${f.colonia?'#22d3ee':'#7a8899'};font-size:12px;cursor:pointer;">
          <option value="">📍 Colonia</option>
          ${colonias.map(c=>`<option value="${c}" ${f.colonia===c?'selected':''}>${_esc(c)}</option>`).join('')}
        </select>` : ''}

      <!-- Precio -->
      <input type="number" placeholder="$ Mín" value="${f.precioMin}"
        onchange="propFilter('precioMin',this.value)"
        style="width:90px;padding:8px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:#e8f0f9;font-size:12px;outline:none;"/>
      <input type="number" placeholder="$ Máx" value="${f.precioMax}"
        onchange="propFilter('precioMax',this.value)"
        style="width:90px;padding:8px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:#e8f0f9;font-size:12px;outline:none;"/>

      ${hasFilters ? `
        <button onclick="propClearFilters()"
          style="padding:7px 12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);
          color:#f87171;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">✕ Limpiar</button>` : ''}
    </div>
  `
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function _renderKpis() {
  const activas     = _props.filter(p => p.status === 'activa').length
  const captacion   = _props.filter(p => p.status === 'captacion').length
  const negociacion = _props.filter(p => p.status === 'negociacion').length
  const vendidas    = _props.filter(p => p.status === 'vendida').length
  const exclusivas  = _props.filter(p => p.exclusiva && p.exclusiva_fin && new Date(p.exclusiva_fin) > new Date()).length
  const exclusivasPorVencer = _props.filter(p => {
    if (!p.exclusiva || !p.exclusiva_fin) return false
    const diff = (new Date(p.exclusiva_fin) - new Date()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff <= 7
  }).length

  const kpi = (label, val, color, extra = '') => `
    <div style="flex:1;min-width:100px;background:rgba(14,20,34,0.8);border:1px solid rgba(255,255,255,0.06);
    border-radius:10px;padding:12px 14px;border-top:2px solid ${color};">
      <div style="font-size:10px;color:#7a8899;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
      <div style="font-size:20px;font-weight:800;color:${color};margin-top:4px;">${val}</div>
      ${extra}
    </div>`

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
      ${kpi('Activas', activas, '#4ade80')}
      ${kpi('Captación', captacion, '#60a5fa')}
      ${kpi('Negociación', negociacion, '#fb923c')}
      ${kpi('Vendidas', vendidas, '#a78bfa')}
      ${kpi('Exclusivas', exclusivas, '#22d3ee',
        exclusivasPorVencer
          ? `<div style="font-size:10px;color:#fb923c;margin-top:3px;">⚠ ${exclusivasPorVencer} por vencer</div>`
          : ''
      )}
    </div>
  `
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
function _renderGrid(list) {
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
      ${list.map(p => _propCard(p)).join('')}
    </div>
  `
}

function _propCard(p) {
  const st     = _statusInfo(p.status)
  const tipo   = _tipoInfo(p.tipo)
  const thumb  = _getThumb(p)
  const precio = _precioLabel(p)
  const ops    = (p.operacion || []).join(' · ')

  const specs = []
  if (p.recamaras)        specs.push(`🛏 ${p.recamaras}`)
  if (p.banos)            specs.push(`🚿 ${p.banos}`)
  if (p.estacionamientos) specs.push(`🚗 ${p.estacionamientos}`)
  if (p.sup_construida)   specs.push(`📐 ${_fmtM2(p.sup_construida)}`)
  else if (p.sup_terreno) specs.push(`📐 ${_fmtM2(p.sup_terreno)}`)

  const exclusivaAlert = (() => {
    if (!p.exclusiva || !p.exclusiva_fin) return ''
    const diff = (new Date(p.exclusiva_fin) - new Date()) / (1000 * 60 * 60 * 24)
    if (diff < 0) return `<div style="position:absolute;top:8px;right:8px;background:rgba(248,113,113,0.9);color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:6px;">EXCL. VENCIDA</div>`
    if (diff <= 7) return `<div style="position:absolute;top:8px;right:8px;background:rgba(251,146,60,0.9);color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:6px;">EXCL. ${Math.ceil(diff)}d</div>`
    return `<div style="position:absolute;top:8px;right:8px;background:rgba(34,211,238,0.15);color:#22d3ee;font-size:9px;font-weight:700;padding:2px 7px;border-radius:6px;border:1px solid rgba(34,211,238,0.3);">EXCLUSIVA</div>`
  })()

  const isSelectMode = window.isPropertySelectionActive?.()
  const isSelected = window.isPropertySelected?.(p.id)
  return `
    <div style="background:rgba(14,20,34,0.95);border:1px solid ${isSelected?'rgba(167,139,250,0.5)':'rgba(255,255,255,0.07)'};border-radius:14px;
    overflow:hidden;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;position:relative;${isSelected?'box-shadow:0 0 0 2px rgba(167,139,250,0.25);':''}"
    onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 32px rgba(0,0,0,0.4)'"
    onmouseleave="this.style.transform='';this.style.boxShadow='${isSelected?'0 0 0 2px rgba(167,139,250,0.25)':''}'"
    onclick="${isSelectMode?`togglePropertySelection('${p.id}');event.stopPropagation();window.renderInmuebles?.()`:`openPropDetail('${p.id}')`}">
    ${isSelectMode ? `<div style="position:absolute;top:8px;left:8px;width:24px;height:24px;border-radius:50%;background:${isSelected?'#a78bfa':'rgba(0,0,0,0.6)'};border:2px solid ${isSelected?'#fff':'rgba(255,255,255,0.4)'};display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;z-index:2;">${isSelected?'✓':''}</div>` : ''}

      <!-- Imagen / placeholder -->
      <div style="position:relative;height:160px;background:linear-gradient(135deg,rgba(34,211,238,0.05),rgba(14,20,34,0.8));overflow:hidden;">
        ${thumb
          ? `<img src="${_esc(thumb)}" alt="" style="width:100%;height:100%;object-fit:cover;"/>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3;">${tipo.icon}</div>`
        }
        <!-- Badge status -->
        <div style="position:absolute;bottom:8px;left:8px;background:${st.color}22;border:1px solid ${st.color}55;
        color:${st.color};font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;backdrop-filter:blur(4px);">
          ${st.label.toUpperCase()}
        </div>
        ${exclusivaAlert}
      </div>

      <!-- Info -->
      <div style="padding:14px;">
        <!-- Folio + Tipo -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:10px;color:#7a8899;font-weight:600;">${_esc(p.folio_interno || '')} ${ops ? '· ' + ops.toUpperCase() : ''}</span>
          <span style="font-size:11px;">${tipo.icon} ${tipo.label}</span>
        </div>

        <!-- Título / dirección -->
        <div style="font-size:14px;font-weight:700;color:#e8f0f9;margin-bottom:4px;line-height:1.3;">
          ${_esc(p.titulo || (tipo.label + (p.colonia ? ' en ' + p.colonia : '')))}
        </div>
        <div style="font-size:12px;color:#7a8899;margin-bottom:10px;">
          📍 ${_esc([p.colonia, p.municipio].filter(Boolean).join(', ') || 'Sin ubicación')}
        </div>

        <!-- Specs -->
        ${specs.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
            ${specs.map(s => `<span style="font-size:11px;color:#94a3b8;background:rgba(255,255,255,0.04);
            padding:2px 7px;border-radius:6px;border:1px solid rgba(255,255,255,0.07);">${s}</span>`).join('')}
          </div>` : ''}

        <!-- Precio -->
        <div style="font-size:16px;font-weight:800;color:#22d3ee;">${_esc(precio)}</div>
        ${p.precio_negociable ? `<div style="font-size:10px;color:#4ade80;margin-top:2px;">Precio negociable</div>` : ''}

        <!-- Dueño + Acciones rápidas -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);">
          <span style="font-size:11px;color:#7a8899;">👤 ${_esc(p.dueno_nombre || 'Sin dueño')}</span>
          <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
            <button title="Editar" onclick="openPropModal('${p.id}')"
              style="padding:4px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
              color:#94a3b8;border-radius:6px;cursor:pointer;font-size:11px;">✏️</button>
            <button title="Compartir link" onclick="propCopyLink('${p.id}','${_esc(p.slug || p.id)}')"
              style="padding:4px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
              color:#94a3b8;border-radius:6px;cursor:pointer;font-size:11px;">🔗</button>
            <button title="WhatsApp" onclick="propWhatsApp('${p.id}')"
              style="padding:4px 8px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);
              color:#4ade80;border-radius:6px;cursor:pointer;font-size:11px;">📲</button>
          </div>
        </div>
      </div>
    </div>
  `
}

// ─── Vista Lista ──────────────────────────────────────────────────────────────
function _renderLista(list) {
  return `
    <div style="display:flex;flex-direction:column;gap:6px;">
      <!-- Header -->
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 120px;gap:10px;
      padding:8px 14px;font-size:10px;font-weight:700;color:#7a8899;text-transform:uppercase;letter-spacing:0.05em;">
        <span>Inmueble</span><span>Tipo</span><span>Precio</span><span>Sup.</span><span>Status</span><span>Acciones</span>
      </div>
      ${list.map(p => {
        const st   = _statusInfo(p.status)
        const tipo = _tipoInfo(p.tipo)
        const sup  = p.sup_construida ? _fmtM2(p.sup_construida) : p.sup_terreno ? _fmtM2(p.sup_terreno) : '—'
        return `
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 120px;gap:10px;align-items:center;
          padding:12px 14px;background:rgba(14,20,34,0.8);border:1px solid rgba(255,255,255,0.06);border-radius:10px;cursor:pointer;"
          onclick="openPropDetail('${p.id}')"
          onmouseenter="this.style.borderColor='rgba(34,211,238,0.2)'"
          onmouseleave="this.style.borderColor='rgba(255,255,255,0.06)'">
            <div>
              <div style="font-size:13px;font-weight:600;color:#e8f0f9;">${_esc(p.titulo || tipo.label + ' ' + (p.colonia||''))}</div>
              <div style="font-size:11px;color:#7a8899;margin-top:2px;">📍 ${_esc([p.colonia,p.municipio].filter(Boolean).join(', ') || '—')} · ${_esc(p.folio_interno||'')}</div>
            </div>
            <div style="font-size:12px;color:#94a3b8;">${tipo.icon} ${tipo.label}</div>
            <div style="font-size:13px;font-weight:700;color:#22d3ee;">${_esc(_precioLabel(p))}</div>
            <div style="font-size:12px;color:#94a3b8;">${sup}</div>
            <div>
              <span style="font-size:10px;font-weight:700;color:${st.color};background:${st.color}18;
              padding:3px 8px;border-radius:6px;">${st.label.toUpperCase()}</span>
            </div>
            <div style="display:flex;gap:5px;" onclick="event.stopPropagation()">
              <button onclick="openPropModal('${p.id}')"
                style="padding:4px 8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);
                color:#94a3b8;border-radius:6px;cursor:pointer;font-size:11px;">✏️</button>
              <button onclick="propWhatsApp('${p.id}')"
                style="padding:4px 8px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);
                color:#4ade80;border-radius:6px;cursor:pointer;font-size:11px;">📲</button>
            </div>
          </div>`
      }).join('')}
    </div>
  `
}

// ─── Paginación ───────────────────────────────────────────────────────────────
function _renderPagination(total) {
  const pages = []
  for (let i = 1; i <= total; i++) pages.push(i)
  return `
    <div style="display:flex;justify-content:center;gap:6px;margin-top:24px;">
      ${pages.map(i => `
        <button onclick="propSetPage(${i})"
          style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,${_propPage===i?'0.2':'0.08'});
          background:${_propPage===i?'rgba(34,211,238,0.15)':'rgba(255,255,255,0.04)'};
          color:${_propPage===i?'#22d3ee':'#7a8899'};cursor:pointer;font-size:13px;font-weight:600;">
          ${i}
        </button>`).join('')}
    </div>`
}

// ─── Vacío / Loading ──────────────────────────────────────────────────────────
function _emptyState() {
  const hasFilters = Object.values(_propFilters).some(Boolean)
  return `
    <div style="text-align:center;padding:60px 20px;color:#7a8899;">
      <div style="font-size:56px;margin-bottom:16px;opacity:0.4;">🏠</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;color:#94a3b8;">
        ${hasFilters ? 'Sin resultados con estos filtros' : 'No hay propiedades aún'}
      </div>
      <div style="font-size:13px;margin-bottom:20px;">
        ${hasFilters
          ? 'Intenta con otros filtros o limpia la búsqueda'
          : 'Empieza captando tu primera propiedad'}
      </div>
      ${hasFilters
        ? `<button onclick="propClearFilters()" style="padding:8px 20px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);color:#22d3ee;border-radius:8px;cursor:pointer;">Limpiar filtros</button>`
        : `<button onclick="openPropModal()" style="padding:10px 24px;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0d0f1f;font-weight:700;border:none;border-radius:10px;cursor:pointer;">+ Captar primer inmueble</button>`
      }
    </div>`
}

function _loadingSkeleton() {
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
      ${Array.from({length:6}).map(()=>`
        <div style="background:rgba(14,20,34,0.8);border:1px solid rgba(255,255,255,0.05);border-radius:14px;overflow:hidden;animation:pulse 1.5s infinite;">
          <div style="height:160px;background:rgba(255,255,255,0.04);"></div>
          <div style="padding:14px;">
            <div style="height:12px;background:rgba(255,255,255,0.05);border-radius:4px;margin-bottom:8px;width:60%;"></div>
            <div style="height:16px;background:rgba(255,255,255,0.05);border-radius:4px;margin-bottom:8px;"></div>
            <div style="height:12px;background:rgba(255,255,255,0.04);border-radius:4px;width:40%;"></div>
          </div>
        </div>`).join('')}
    </div>`
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL — Crear / Editar propiedad
// ═══════════════════════════════════════════════════════════════════════════════
export function openPropModal(id = null) {
  const prop = id ? _props.find(p => p.id === id) : null
  const isNew = !prop
  const tipo  = prop?.tipo || 'casa'
  const fields = TIPO_FIELDS[tipo] || TIPO_FIELDS.casa

  const show  = (f) => fields.includes(f)
  const val   = (k, def = '') => prop ? (_esc(prop[k] ?? def)) : def
  const valB  = (k) => prop ? !!prop[k] : false
  const ops   = prop?.operacion || []
  const opCheck = (v) => ops.includes(v) ? 'checked' : ''

  const overlay = document.createElement('div')
  overlay.id = 'prop-modal-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);'
  overlay.onclick = (e) => { if (e.target === overlay) closePropModal() }

  // Preload MX locations dataset (estados/municipios) y repaint selects al llegar
  loadMxLocations().then(() => {
    const row = document.getElementById('prop-edo-mun-row')
    if (row) row.innerHTML = renderEstadoMunicipioSelects({
      estadoVal:    document.getElementById('prop-estado-rep')?.value || prop?.estado_rep || 'BCS',
      municipioVal: document.getElementById('prop-municipio')?.value  || prop?.municipio  || '',
    })
  })

  // Cargar links múltiples del inmueble (si existe) y montar UI
  loadLinksFor(prop?.id || null).then(() => {
    const mount = document.getElementById('prop-links-mount')
    if (mount) mount.innerHTML = renderLinksBlock()
  })

  overlay.innerHTML = `
    <div id="prop-modal" style="background:#0e1422;border:1px solid rgba(34,211,238,0.2);border-radius:16px;
    width:100%;max-width:760px;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.6);">

      <!-- Header modal -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;
      border-bottom:1px solid rgba(255,255,255,0.07);position:sticky;top:0;background:#0e1422;z-index:1;">
        <h3 style="margin:0;font-size:16px;font-weight:800;color:#e8f0f9;">
          ${isNew ? '🏠 Captar inmueble' : '✏️ Editar — ' + _esc(prop.folio_interno || prop.titulo || 'Propiedad')}
        </h3>
        <button onclick="closePropModal()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;">✕</button>
      </div>

      <form id="prop-form" data-prop-id="${prop?.id||''}" onsubmit="return false" style="padding:24px;">

        <!-- ── Sección: Tipo y Operación ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Tipo de inmueble
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;" id="tipo-selector">
            ${PROP_TIPOS.map(t => `
              <button type="button"
                onclick="propSelectTipo('${t.id}')"
                id="tipo-btn-${t.id}"
                style="padding:8px 14px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.15s;
                ${tipo===t.id
                  ? 'background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.4);color:#22d3ee;'
                  : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#7a8899;'}">
                ${t.icon} ${t.label}
              </button>`).join('')}
          </div>
          <input type="hidden" id="prop-tipo" value="${tipo}"/>

          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;margin-top:16px;">
            Operación (puede ser más de una)
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;">
            ${['venta','renta','traspaso'].map(v => `
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:#94a3b8;">
                <input type="checkbox" name="operacion" value="${v}" ${opCheck(v)}
                  style="accent-color:#22d3ee;width:15px;height:15px;cursor:pointer;"/>
                ${v.charAt(0).toUpperCase() + v.slice(1)}
              </label>`).join('')}
          </div>
        </div>

        <!-- ── Sección: Identificación ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Identificación
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${_field('prop-titulo','Título (opcional)','text',val('titulo'),'Casa en Colonia Obregón · 3 rec')}
            ${_field('prop-folio','Folio interno','text', val('folio_interno', _buildFolio(_propFolioSeq)), 'LP-2026-001', !isNew)}
          </div>
        </div>

        <!-- ── Sección: Ubicación ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Ubicación
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px;">
            ${_field('prop-calle','Calle','text',val('calle'),'Calle Álvaro Obregón')}
            ${_field('prop-numero','Número','text',val('numero'),'123')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;" id="prop-edo-mun-row">
            ${renderEstadoMunicipioSelects({ estadoVal: prop?.estado_rep || 'BCS', municipioVal: prop?.municipio || '' })}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            ${_field('prop-colonia','Colonia','text',val('colonia'),'Col. Centro')}
            ${_field('prop-cp','C.P.','text',val('cp'),'23000')}
          </div>
          ${_field('prop-referencias','Referencias','text',val('referencias'),'Frente al parque, portón azul')}

          <!-- Coordenadas + mapa picker + GPS auto -->
          <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            ${_field('prop-lat','Latitud','number',val('lat'),'24.142600')}
            ${_field('prop-lng','Longitud','number',val('lng'),'-110.312800')}
          </div>
          <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button type="button" onclick="propUseCurrentGPS()"
              style="padding:10px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.35);
              color:#4ade80;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;">
              📍 Mi ubicación
            </button>
            <button type="button" onclick="propOpenMapPicker()"
              style="padding:10px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.35);
              color:#22d3ee;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;">
              🗺 Ubicar en mapa
            </button>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:6px;">
            <strong style="color:#4ade80;">Mi ubicación</strong>: usa GPS de tu cel y rellena dirección automáticamente. Ideal cuando estás parado frente al inmueble.
          </div>
        </div>

        <!-- ── Sección: Precios ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Precios
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
            ${_field('prop-precio-venta','Precio venta','number',val('precio_venta'),'2500000')}
            ${_field('prop-precio-renta','Precio renta/mes','number',val('precio_renta'),'15000')}
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Moneda</label>
              <select id="prop-moneda"
                style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="MXN" ${val('moneda','MXN')==='MXN'?'selected':''}>MXN</option>
                <option value="USD" ${val('moneda')==='USD'?'selected':''}>USD</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Tipo precio</label>
              <select id="prop-price-type"
                style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="total"        ${val('price_type','total')==='total'?'selected':''}>Total</option>
                <option value="por_m2"       ${val('price_type')==='por_m2'?'selected':''}>Por m²</option>
                <option value="por_hectarea" ${val('price_type')==='por_hectarea'?'selected':''}>Por hectárea</option>
                <option value="por_mes"      ${val('price_type')==='por_mes'?'selected':''}>Por mes (renta)</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;">
            ${_field('prop-expenses','Mantenimiento mensual ($)','number',val('expenses'),'1500')}
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#94a3b8;height:38px;">
              <input type="checkbox" id="prop-negociable" ${valB('precio_negociable')?'checked':''}
                style="accent-color:#22d3ee;width:15px;height:15px;"/>
              Precio negociable
            </label>
          </div>
        </div>

        <!-- ── Sección: Detalles avanzados ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Detalles avanzados
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Vista</label>
              <select id="prop-vista" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="">—</option>
                ${['mar','montana','golf','jardin','ciudad','interior','panoramica','desierto'].map(v =>
                  `<option value="${v}" ${val('vista')===v?'selected':''}>${v[0].toUpperCase()+v.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Orientación</label>
              <select id="prop-orientacion" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="">—</option>
                ${['norte','sur','este','oeste','noreste','noroeste','sureste','suroeste'].map(o =>
                  `<option value="${o}" ${val('orientacion')===o?'selected':''}>${o[0].toUpperCase()+o.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Estatus de obra</label>
              <select id="prop-estatus-obra" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="">—</option>
                <option value="a_estrenar"      ${val('estatus_obra')==='a_estrenar'?'selected':''}>A estrenar</option>
                <option value="preventa"        ${val('estatus_obra')==='preventa'?'selected':''}>Preventa</option>
                <option value="en_construccion" ${val('estatus_obra')==='en_construccion'?'selected':''}>En construcción</option>
                <option value="usado"           ${val('estatus_obra')==='usado'?'selected':''}>Usado</option>
                <option value="remodelado"      ${val('estatus_obra')==='remodelado'?'selected':''}>Remodelado</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Régimen propiedad</label>
              <select id="prop-regimen" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="">—</option>
                <option value="privada"             ${val('regimen_propiedad')==='privada'?'selected':''}>Privada</option>
                <option value="ejidal"              ${val('regimen_propiedad')==='ejidal'?'selected':''}>Ejidal</option>
                <option value="comunal"             ${val('regimen_propiedad')==='comunal'?'selected':''}>Comunal</option>
                <option value="fideicomiso"         ${val('regimen_propiedad')==='fideicomiso'?'selected':''}>Fideicomiso (zona costera)</option>
                <option value="posesion"            ${val('regimen_propiedad')==='posesion'?'selected':''}>Posesión</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Uso de suelo</label>
              <select id="prop-uso-suelo" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="">—</option>
                <option value="residencial" ${val('uso_suelo')==='residencial'?'selected':''}>Residencial</option>
                <option value="comercial"   ${val('uso_suelo')==='comercial'?'selected':''}>Comercial</option>
                <option value="mixto"       ${val('uso_suelo')==='mixto'?'selected':''}>Mixto</option>
                <option value="industrial"  ${val('uso_suelo')==='industrial'?'selected':''}>Industrial</option>
                <option value="rustico"     ${val('uso_suelo')==='rustico'?'selected':''}>Rústico</option>
                <option value="agricola"    ${val('uso_suelo')==='agricola'?'selected':''}>Agrícola</option>
              </select>
            </div>
            ${_field('prop-clave-catastral','Clave catastral / folio real','text',val('clave_catastral'),'III-001-234-567')}
          </div>

          ${(tipo==='terreno' || tipo==='lote') ? `
          <!-- Específico terreno -->
          <div style="background:rgba(74,222,128,0.04);border:1px solid rgba(74,222,128,0.18);border-radius:10px;padding:10px 12px;margin-top:8px;">
            <div style="font-size:10px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🌿 Específico de terreno</div>
            <div>
              <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Topografía</label>
              <select id="prop-topografia" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;">
                <option value="">—</option>
                <option value="plana"                 ${val('topografia')==='plana'?'selected':''}>Plana</option>
                <option value="pendiente_leve"        ${val('topografia')==='pendiente_leve'?'selected':''}>Pendiente leve</option>
                <option value="pendiente_pronunciada" ${val('topografia')==='pendiente_pronunciada'?'selected':''}>Pendiente pronunciada</option>
                <option value="irregular"             ${val('topografia')==='irregular'?'selected':''}>Irregular</option>
                <option value="en_esquina"            ${val('topografia')==='en_esquina'?'selected':''}>En esquina</option>
              </select>
            </div>
          </div>` : ''}

          ${(tipo==='local' || tipo==='oficina') ? `
          <!-- Específico comercial -->
          <div style="background:rgba(251,146,60,0.04);border:1px solid rgba(251,146,60,0.18);border-radius:10px;padding:10px 12px;margin-top:8px;">
            <div style="font-size:10px;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🏪 Específico comercial</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              ${_field('prop-aforo','Aforo (personas)','number',val('aforo'),'80')}
              ${_field('prop-frente-avenida','Frente sobre avenida (m)','number',val('frente_avenida_m'),'12')}
            </div>
            <div style="margin-top:10px;">
              ${_field('prop-giros','Giros permitidos (separados por coma)','text',val('giros_permitidos')?.toString()||'','restaurante, oficina, retail')}
            </div>
          </div>` : ''}

          ${(tipo==='bodega' || tipo==='nave') ? `
          <!-- Específico industrial -->
          <div style="background:rgba(168,85,247,0.04);border:1px solid rgba(168,85,247,0.18);border-radius:10px;padding:10px 12px;margin-top:8px;">
            <div style="font-size:10px;font-weight:700;color:#a855f7;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">🏭 Específico industrial</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:8px;">
              ${_field('prop-altura-libre','Altura libre (m)','number',val('altura_libre_m'),'8')}
              ${_field('prop-andenes-cant','Andenes cantidad','number',val('andenes_cantidad'),'4')}
              <div>
                <label style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">Andenes tipo</label>
                <select id="prop-andenes-tipo" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;">
                  <option value="">—</option>
                  <option value="dock_high"            ${val('andenes_tipo')==='dock_high'?'selected':''}>Dock high</option>
                  <option value="a_piso"               ${val('andenes_tipo')==='a_piso'?'selected':''}>A piso</option>
                  <option value="nivelador_hidraulico" ${val('andenes_tipo')==='nivelador_hidraulico'?'selected':''}>Nivelador hidráulico</option>
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:end;">
              ${_field('prop-kva','Capacidad eléctrica (KVA)','number',val('kva'),'300')}
              ${_field('prop-patio-maniobras','Patio maniobras (m²)','number',val('patio_maniobras_m2'),'500')}
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#94a3b8;height:38px;">
                <input type="checkbox" id="prop-trifasica" ${valB('trifasica')?'checked':''} style="accent-color:#a855f7;width:15px;height:15px;"/>
                Trifásica
              </label>
            </div>
            <div style="margin-top:8px;">
              ${_field('prop-resistencia-piso','Resistencia piso (kg/cm²)','text',val('resistencia_piso'),'350 kg/cm²')}
            </div>
          </div>` : ''}

          <!-- Privacidad pin -->
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#94a3b8;margin-top:12px;">
            <input type="checkbox" id="prop-show-pin" ${(prop?.show_exact_location !== false)?'checked':''}
              style="accent-color:#22d3ee;width:15px;height:15px;"/>
            Mostrar ubicación exacta en fichas públicas (desmarca para ocultar el pin exacto)
          </label>
          <!-- Mostrar calculadora hipotecaria -->
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#94a3b8;margin-top:8px;">
            <input type="checkbox" id="prop-mostrar-hipoteca" ${(prop?.mostrar_hipoteca !== false)?'checked':''}
              style="accent-color:#22d3ee;width:15px;height:15px;"/>
            Mostrar calculadora hipotecaria en la ficha pública (desmarca para operaciones de contado o terrenos sin financiamiento)
          </label>
        </div>

        <!-- ── Sección: SEO (opcional) ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
            🔎 SEO &amp; Compartir en redes <span style="font-weight:400;color:#64748b;text-transform:none;">(opcional)</span>
          </div>
          <div style="font-size:11px;color:#64748b;margin-bottom:10px;line-height:1.6;">
            Personaliza cómo se ve la ficha pública en buscadores y cuando alguien comparte el link en WhatsApp/Facebook/Twitter. Si los dejas vacíos, se generan automáticamente desde el título y descripción.
          </div>
          ${_field('prop-seo-title','Título SEO','text',val('seo_title'),'Lote 034 La Ventana BCS · 1,200 m² frente a playa $850K USD')}
          <div style="font-size:10px;color:#475569;margin:-6px 0 10px;">Ideal 60-70 caracteres. Aparece en Google y como título del link compartido.</div>
          ${_field('prop-seo-desc','Descripción SEO','text',val('seo_description'),'Inversión patrimonial en zona kiteboarding, vista al Cerralvo, 1,200 m², agua y luz disponibles…')}
          <div style="font-size:10px;color:#475569;margin:-6px 0 10px;">Ideal 150-160 caracteres. Aparece debajo del título en Google.</div>
          ${_field('prop-seo-keywords','Keywords (separadas por coma)','text',val('seo_keywords'),'terreno la ventana, lote bcs, inversión inmobiliaria, kiteboarding')}
          <div style="font-size:10px;color:#475569;margin:-6px 0 10px;">Palabras clave que describen este inmueble (pueblo, deporte, tipo de inversor objetivo, etc.).</div>
          ${_field('prop-seo-image','Imagen para preview (opcional)','url',val('seo_image_url'),'https://...')}
          <div style="font-size:10px;color:#475569;margin:-6px 0 4px;">URL específica para WhatsApp/FB/Twitter. Si la dejas vacía se usa la primera foto del inmueble. Recomendado: 1200×630px.</div>
        </div>

        <!-- ── Sección: Dimensiones ── -->
        <div style="margin-bottom:22px;" id="prop-dims-section">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Dimensiones
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
            ${show('sup_terreno')     ? _field('prop-sup-terreno','Sup. terreno m²','number',val('sup_terreno')) : ''}
            ${show('sup_construida')  ? _field('prop-sup-construida','Sup. construida m²','number',val('sup_construida')) : ''}
            ${show('frente')          ? _field('prop-frente','Frente m','number',val('frente')) : ''}
            ${show('fondo')           ? _field('prop-fondo','Fondo m','number',val('fondo')) : ''}
          </div>
        </div>

        <!-- ── Sección: Características ── -->
        <div style="margin-bottom:22px;" id="prop-caract-section">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Características
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;">
            ${show('recamaras')        ? _field('prop-recamaras','Recámaras','number',val('recamaras')) : ''}
            ${show('banos')            ? _field('prop-banos','Baños','number',val('banos')) : ''}
            ${show('medios_banos')     ? _field('prop-medios-banos','Medios baños','number',val('medios_banos')) : ''}
            ${show('estacionamientos') ? _field('prop-estacionamientos','Estacionam.','number',val('estacionamientos')) : ''}
            ${show('pisos')            ? _field('prop-pisos','Pisos/Niveles','number',val('pisos')) : ''}
            ${show('antiguedad_anios') ? _field('prop-antiguedad','Antigüedad años','number',val('antiguedad_anios')) : ''}
          </div>
          ${show('amueblado') ? `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#94a3b8;">
              <input type="checkbox" id="prop-amueblado" ${valB('amueblado')?'checked':''}
                style="accent-color:#22d3ee;width:15px;height:15px;"/>
              Amueblado
            </label>` : ''}
        </div>

        <!-- ── Sección: Servicios y Amenidades ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">
            Servicios
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px;margin-bottom:16px;">
            ${[
              ['agua',          _SVG.water,    'Agua potable'],
              ['luz',           _SVG.zap,      'Luz eléctrica'],
              ['drenaje',       _SVG.pipe,     'Drenaje'],
              ['gas',           _SVG.flame,    'Gas (genérico)'],
              ['gas_natural',   _SVG.flame,    'Gas natural'],
              ['gas_tanque',    _SVG.cylinder, 'Gas tanque'],
              ['internet',      _SVG.wifi,     'Internet'],
              ['internet_fibra',_SVG.zap,      'Fibra óptica'],
              ['cable_tv',      _SVG.tv,       'Cable TV'],
              ['seguridad_24h', _SVG.shield,   'Seguridad 24h'],
            ].map(([k,ico,lbl])=>`
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;color:#94a3b8;
              padding:7px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;">
                <input type="checkbox" id="prop-${k.replace(/_/g,'-')}" ${valB(k)?'checked':''}
                  style="accent-color:#22d3ee;width:14px;height:14px;flex-shrink:0;"/>
                <span style="display:inline-flex;align-items:center;flex-shrink:0;opacity:0.7;">${ico}</span>
                ${lbl}
              </label>`).join('')}
          </div>
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">
            Amenidades
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px;">
            ${[
              ['alberca',          _SVG.waves,    'Alberca'],
              ['jacuzzi',          _SVG.thermo,   'Jacuzzi'],
              ['gym',              _SVG.dumbbell, 'Gym'],
              ['elevador',         _SVG.arrowud,  'Elevador'],
              ['roof_garden',      _SVG.building, 'Roof garden'],
              ['jardin',           _SVG.leaf,     'Jardín'],
              ['terraza',          _SVG.sun,      'Terraza'],
              ['asador_bbq',       _SVG.flame,    'Asador / BBQ'],
              ['salon_eventos',    _SVG.users,    'Salón de eventos'],
              ['area_juegos',      _SVG.gamepad,  'Área de juegos'],
              ['cine_privado',     _SVG.film,     'Cine privado'],
              ['lobby',            _SVG.building, 'Lobby'],
              ['concierge',        _SVG.users,    'Concierge'],
              ['cctv',             _SVG.camera,   'CCTV'],
              ['porton_electrico', _SVG.car,      'Portón eléctrico'],
              ['cisterna',         _SVG.cylinder, 'Cisterna'],
              ['panel_solar',      _SVG.solar,    'Panel solar'],
              ['bodega_ext',       _SVG.package,  'Bodega exterior'],
              ['cuarto_servicio',  _SVG.wrench,   'Cuarto servicio'],
              ['vigilancia',       _SVG.eye,      'Vigilancia'],
            ].map(([k,ico,lbl])=>`
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;color:#94a3b8;
              padding:7px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;">
                <input type="checkbox" id="prop-${k.replace(/_/g,'-')}" ${valB(k)?'checked':''}
                  style="accent-color:#22d3ee;width:14px;height:14px;flex-shrink:0;"/>
                <span style="display:inline-flex;align-items:center;flex-shrink:0;opacity:0.7;">${ico}</span>
                ${lbl}
              </label>`).join('')}
          </div>
        </div>

        <!-- ── Sección: Descripción ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Descripción
          </div>
          <textarea id="prop-descripcion" rows="3" placeholder="Descripción para el cliente y landing pública..."
            style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            border-radius:8px;color:#e8f0f9;font-size:13px;resize:vertical;outline:none;box-sizing:border-box;">${val('descripcion')}</textarea>
          <textarea id="prop-notas" rows="2" placeholder="Notas internas (no se publican)..."
            style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            border-radius:8px;color:#7a8899;font-size:12px;resize:vertical;outline:none;margin-top:8px;box-sizing:border-box;">${val('notas_internas')}</textarea>
        </div>

        <!-- ── Sección: Dueño ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Datos del dueño
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            ${_field('prop-dueno-nombre','Nombre dueño','text',val('dueno_nombre'),'Luis Moreno')}
            ${_field('prop-dueno-tel','Teléfono','tel',val('dueno_telefono'),'612 123 4567')}
            ${_field('prop-dueno-email','Email','email',val('dueno_email'),'luis@mail.com')}
          </div>
        </div>

        <!-- ── Sección: Exclusiva ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Exclusiva y comisión
          </div>
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#94a3b8;">
              <input type="checkbox" id="prop-exclusiva" ${valB('exclusiva')?'checked':''}
                onchange="propToggleExclusiva(this.checked)"
                style="accent-color:#22d3ee;width:15px;height:15px;"/>
              Exclusiva
            </label>
            <div id="prop-exclusiva-fields" style="display:${valB('exclusiva')?'flex':'none'};gap:10px;flex-wrap:wrap;align-items:center;">
              ${_field('prop-excl-inicio','Inicio','date',val('exclusiva_inicio'))}
              ${_field('prop-excl-fin','Vence','date',val('exclusiva_fin'))}
              ${_field('prop-comision','Comisión %','number',val('comision_pct','5'))}
            </div>
          </div>
        </div>

        <!-- ── Sección: Multimedia y links múltiples ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            📸 Links multimedia (videos, álbumes, tours, archivos)
          </div>
          <div id="prop-links-mount" style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:10px;padding:12px;">
            <div style="font-size:12px;color:#64748b;">Cargando links…</div>
          </div>

          <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:14px;margin-top:4px;">
            <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:10px;">Fotos individuales (portada y galería interna)</div>
            <!-- URL de imagen directa -->
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <input type="url" id="prop-foto-url" placeholder="Pegar URL directa de imagen (https://lh3.googleusercontent.com/...)"
                style="flex:1;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;"
                onkeydown="if(event.key==='Enter'){event.preventDefault();propAddPhotoUrl('${prop?.id||''}');}"/>
              <button type="button" onclick="propAddPhotoUrl('${prop?.id||''}')"
                style="padding:8px 14px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);
                color:#22d3ee;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">+ Agregar</button>
            </div>
            <div style="font-size:11px;color:#475569;margin-bottom:10px;">💡 En Google Fotos: abre una foto → clic derecho → "Copiar dirección de imagen" → pega aquí. También funciona con Imgur, Cloudinary, etc.</div>
            <!-- Subida de archivo: 2 botones (cámara + galería) -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
              <!-- Cámara directa: capture=environment fuerza cámara trasera en cel -->
              <label for="prop-foto-camera"
                style="border:2px dashed rgba(74,222,128,0.25);border-radius:10px;padding:14px 8px;text-align:center;cursor:pointer;background:rgba(74,222,128,0.04);">
                <input type="file" id="prop-foto-camera" accept="image/*" capture="environment" style="display:none;"
                  onchange="propHandleFiles(this.files,'${prop?.id||''}')"/>
                <div style="font-size:24px;margin-bottom:4px;">📸</div>
                <div style="font-size:11px;color:#4ade80;font-weight:600;">Tomar foto</div>
                <div style="font-size:9px;color:#16a34a;margin-top:2px;">cámara directa</div>
              </label>
              <!-- Galería / archivo -->
              <label for="prop-foto-input"
                style="border:2px dashed rgba(34,211,238,0.18);border-radius:10px;padding:14px 8px;text-align:center;cursor:pointer;background:rgba(34,211,238,0.03);"
                ondragover="event.preventDefault()" ondrop="propHandleDrop(event)">
                <input type="file" id="prop-foto-input" multiple accept="image/*" style="display:none;"
                  onchange="propHandleFiles(this.files,'${prop?.id||''}')"/>
                <div style="font-size:24px;margin-bottom:4px;">🖼️</div>
                <div style="font-size:11px;color:#22d3ee;font-weight:600;">Desde galería</div>
                <div style="font-size:9px;color:#0891b2;margin-top:2px;">o arrastra · máx 5MB</div>
              </label>
            </div>
            <!-- Fotos existentes -->
            <div id="prop-fotos-preview" style="display:flex;flex-wrap:wrap;gap:8px;">
              ${(prop?.fotos||[]).map((f,i)=>`
                <div style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
                  <img src="${_esc(f.thumb_url||f.url||'')}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.opacity=0.3"/>
                  ${i===0?'<div style="position:absolute;top:2px;left:2px;background:rgba(34,211,238,0.85);color:#0d0f1f;font-size:7px;font-weight:800;padding:1px 4px;border-radius:3px;">PORTADA</div>':''}
                  <button onclick="propRemoveFoto(${i})"
                    style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;
                    background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:10px;line-height:1;">✕</button>
                </div>`).join('')}
            </div>
          </div>
        </div>

        <!-- ── Sección: Status ── -->
        <div style="margin-bottom:28px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Status de la propiedad
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${PROP_STATUS.map(s=>`
              <button type="button" onclick="propSelectStatus('${s.id}')" id="status-btn-${s.id}"
                style="padding:7px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.15s;
                ${(prop?.status||'captacion')===s.id
                  ? `background:${s.color}22;border:1px solid ${s.color}55;color:${s.color};`
                  : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#7a8899;'}">
                ${s.label}
              </button>`).join('')}
          </div>
          <input type="hidden" id="prop-status" value="${prop?.status||'captacion'}"/>
        </div>

        <!-- ── Botones ── -->
        <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:16px;border-top:1px solid rgba(255,255,255,0.07);">
          <button type="button" onclick="closePropModal()"
            style="padding:10px 20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            color:#94a3b8;border-radius:10px;cursor:pointer;font-size:14px;">Cancelar</button>
          <button type="button" onclick="saveProp('${prop?.id||''}')"
            style="padding:10px 24px;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0d0f1f;
            font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:14px;">
            ${isNew ? '💾 Guardar propiedad' : '💾 Actualizar'}
          </button>
        </div>
      </form>
    </div>
  `

  document.body.appendChild(overlay)
  setTimeout(() => { document.getElementById('prop-titulo')?.focus() }, 100)
}

// ─── Helper campo de formulario ───────────────────────────────────────────────
function _field(id, label, type, value = '', placeholder = '', disabled = false) {
  return `
    <div>
      <label for="${id}" style="font-size:11px;color:#7a8899;display:block;margin-bottom:6px;">${label}</label>
      <input type="${type}" id="${id}" value="${value}" placeholder="${_esc(placeholder)}"
        ${disabled ? 'disabled style="opacity:0.5;"' : ''}
        style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
        border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;box-sizing:border-box;${disabled?'opacity:0.5;':''}"/>
    </div>`
}

// ─── Íconos SVG ──────────────────────────────────────────────────────────────
const _SVG = {
  // ── Especificaciones ─────────────────────────────────────────────────────
  bed:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V4h20v5"/><rect x="1" y="9" width="22" height="9" rx="2"/><path d="M1 14h22M4 20v2M20 20v2"/></svg>`,
  bath:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4z"/><path d="M6 12V6a2 2 0 0 1 4 0v.5"/></svg>`,
  car:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V9l3-4h14l3 4v6a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>`,
  area:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>`,
  land:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18l4-8 4 4 3-5 4 9H3z"/><path d="M3 21h18"/></svg>`,
  floors:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="1"/><rect x="2" y="14" width="20" height="8" rx="1"/><path d="M6 10v4M12 10v4M18 10v4"/></svg>`,
  age:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  // ── Navegación / acciones ─────────────────────────────────────────────────
  map:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  video:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  globe:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  link:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  folder:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  album:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  img:      `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  // ── Servicios ─────────────────────────────────────────────────────────────
  water:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c-5.33 4.55-8 8.48-8 11.8a8 8 0 0 0 16 0c0-3.32-2.67-7.25-8-11.8z"/></svg>`,
  zap:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  pipe:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2H6v6l-3 7h18l-3-7V2h-3v6"/><path d="M9 12h6"/></svg>`,
  flame:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3C8.93 6.86 9.75 4.95 12 3c.5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  wifi:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  shield:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  tv:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>`,
  cylinder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  // ── Amenidades ────────────────────────────────────────────────────────────
  waves:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`,
  thermo:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`,
  dumbbell: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5h11M6.5 17.5h11M6 8V6a1 1 0 0 0-2 0v12a1 1 0 0 0 2 0v-2M18 8V6a1 1 0 0 1 2 0v12a1 1 0 0 1-2 0v-2M4 12h16"/></svg>`,
  arrowud:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 6v4M12 14v4M9 8l3-3 3 3M9 16l3 3 3-3"/></svg>`,
  leaf:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
  sun:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  eye:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  camera:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  package:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  wrench:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  building: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M8 10h.01M16 10h.01M12 14h.01M8 14h.01M16 14h.01"/></svg>`,
  film:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
  users:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  gamepad:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`,
  solar:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8h4v4H7zM13 8h4v4h-4z"/></svg>`,
}

// Extrae el ID de un URL de YouTube (youtu.be o youtube.com)
function _ytId(url) {
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return m?.[1] || null
}

// ─── Modal de detalle ─────────────────────────────────────────────────────────
export async function openPropDetail(id) {
  const p = _props.find(x => x.id === id)
  if (!p) return

  const st    = _statusInfo(p.status)
  const tipo  = _tipoInfo(p.tipo)
  const fotos = p.fotos || []

  window._nexusProps = _props

  loadPropertyDocs(id).then(() => {
    const docsEl = document.getElementById('dpanel-docs')
    if (docsEl && docsEl.dataset.propId === id) docsEl.innerHTML = renderDocumentos(id)
  })
  // Cargar property_links y meterlos en el panel info bajo "Multimedia"
  fetchLinksFor(id).then(links => {
    const mount = document.getElementById(`dlinks-${id}`)
    if (!mount) return
    if (!links?.length) {
      mount.innerHTML = `<div style="font-size:12px;color:#475569;padding:8px 0;">Sin links adjuntos</div>`
      return
    }
    const ICON = { video:'🎥', foto:'📷', tour:'🌐', archivo:'📁', otro:'🔗' }
    mount.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;">
        ${links.map(l => {
          // Tolerar inversión url/label que el usuario haya hecho
          const isUrl = s => /^https?:\/\//i.test(String(s||''))
          const url = isUrl(l.url) ? l.url : (isUrl(l.label) ? l.label : l.url)
          const label = isUrl(l.url) ? (l.label||'') : (isUrl(l.label) ? l.url : (l.label||''))
          return `
            <a href="${_esc(url)}" target="_blank" rel="noopener"
              style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(255,255,255,0.04);
              border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#cbd5e1;text-decoration:none;font-size:12px;">
              <span style="font-size:18px;">${ICON[l.tipo]||'🔗'}</span>
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${_esc(label || l.tipo)}
              </span>
              <span style="font-size:10px;opacity:0.6;">↗</span>
            </a>`
        }).join('')}
      </div>
    `
  })
  loadInteractions(id).then(() => {
    const el = document.getElementById(`inter-list-${id}`)
    if (el) el.outerHTML = _renderHistorial(id).match(/id="inter-list-[^"]+">[\s\S]*?<\/div>/)?.[0] || ''
  })

  const SERV_ICONS  = { agua: _SVG.water, luz: _SVG.zap, drenaje: _SVG.pipe, gas: _SVG.flame, internet: _SVG.wifi }
  const SERV_LABELS = { agua:'Agua', luz:'Luz', drenaje:'Drenaje', gas:'Gas', internet:'Internet' }
  const AMEN_ICONS  = {
    alberca: _SVG.waves, jardin: _SVG.leaf, roof_garden: _SVG.building,
    bodega_ext: _SVG.package, cuarto_servicio: _SVG.wrench, vigilancia: _SVG.eye,
  }
  const AMEN_LABELS = { alberca:'Alberca', jardin:'Jardín', roof_garden:'Roof garden', bodega_ext:'Bodega', cuarto_servicio:'C. servicio', vigilancia:'Vigilancia' }

  const servicios  = ['agua','luz','drenaje','gas','internet'].filter(k => p[k])
  const amenidades = ['alberca','jardin','roof_garden','bodega_ext','cuarto_servicio','vigilancia'].filter(k => p[k])

  // Specs con SVG icons
  const specs = [
    p.recamaras        ? { svg: _SVG.bed,    label: p.recamaras + ' rec.' }                           : null,
    p.banos            ? { svg: _SVG.bath,   label: p.banos + (p.banos===1?' baño':' baños') }        : null,
    p.estacionamientos ? { svg: _SVG.car,    label: p.estacionamientos + ' auto' }                    : null,
    p.sup_construida   ? { svg: _SVG.area,   label: _fmtM2(p.sup_construida) + ' const.' }            : null,
    p.sup_terreno      ? { svg: _SVG.land,   label: _fmtM2(p.sup_terreno) + ' terreno' }              : null,
    p.pisos            ? { svg: _SVG.floors, label: p.pisos + ' nivel' + (p.pisos>1?'es':'') }        : null,
    p.antiguedad_anios ? { svg: _SVG.age,    label: p.antiguedad_anios + ' años' }                    : null,
  ].filter(Boolean)

  const overlay = document.createElement('div')
  overlay.id = 'prop-detail-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9000;display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(6px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  // Store fotos for gallery nav
  window._nexusGallery = window._nexusGallery || {}
  window._nexusGallery[p.id] = fotos

  overlay.innerHTML = `
    <div style="background:#0d1222;border:1px solid rgba(34,211,238,0.18);border-radius:18px;
    width:100%;max-width:920px;max-height:95vh;overflow-y:auto;box-shadow:0 32px 100px rgba(0,0,0,0.8);">

      <!-- ── HEADER ────────────────────────────────────────────────────────── -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px 12px;
      border-bottom:1px solid rgba(255,255,255,0.06);position:sticky;top:0;background:#0d1222;z-index:2;flex-wrap:wrap;gap:8px;">
        <div style="min-width:0;">
          <div style="font-size:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
            <span style="background:${st.color}22;color:${st.color};padding:2px 8px;border-radius:4px;font-weight:800;font-size:9px;text-transform:uppercase;">${st.label}</span>
            <span style="color:#64748b;">${tipo.icon} ${tipo.label}</span>
            ${p.folio_interno ? `<span style="color:#475569;">· ${_esc(p.folio_interno)}</span>` : ''}
            ${p.exclusiva ? `<span style="color:#fb923c;font-weight:700;">· ⭐ Exclusiva</span>` : ''}
          </div>
          <h3 style="margin:0;font-size:16px;font-weight:800;color:#f1f5f9;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${_esc(p.titulo || tipo.label + ' en ' + (p.colonia||p.municipio||''))}</h3>
        </div>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;flex-shrink:0;">
          <button onclick="propExportPDF('${p.id}')"
            style="padding:6px 12px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);
            color:#a78bfa;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">📄 PDF</button>
          <button onclick="propWhatsApp('${p.id}')"
            style="padding:6px 12px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);
            color:#4ade80;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">📲 WA</button>
          <button onclick="openPropModal('${p.id}')"
            style="padding:6px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            color:#94a3b8;border-radius:8px;cursor:pointer;font-size:12px;">✏️ Editar</button>
          <button onclick="propDelete('${p.id}')"
            title="Enviar a papelera"
            style="padding:6px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);
            color:#ef4444;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">🗑️ Eliminar</button>
          <button onclick="document.getElementById('prop-detail-overlay').remove()"
            style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:18px;line-height:1;">✕</button>
        </div>
      </div>

      <!-- ── HERO GALLERY ───────────────────────────────────────────────────── -->
      ${fotos.length ? `
        <div style="position:relative;background:#000;overflow:hidden;">
          <img id="hero-img-${p.id}" src="${_esc(_getThumb(p) || fotos[0].url || fotos[0].thumb_url || '')}"
            style="width:100%;height:310px;object-fit:cover;display:block;cursor:zoom-in;transition:opacity 0.2s;"
            onclick="propOpenLightbox('${p.id}',0)"/>
          <!-- Badge foto count -->
          <div style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.72);color:#fff;
          font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;backdrop-filter:blur(4px);display:flex;align-items:center;gap:5px;">
            ${_SVG.img.replace('width="40" height="40"','width="13" height="13"').replace('stroke-width="1.2"','stroke-width="2"')}
            <span id="hero-idx-${p.id}">1</span>/${fotos.length}
          </div>
          <!-- Video overlay -->
          ${p.video_url ? `
            <a href="${_esc(p.video_url)}" target="_blank" rel="noopener"
              style="position:absolute;bottom:12px;left:12px;background:rgba(220,38,38,0.88);color:#fff;
              font-size:12px;font-weight:700;padding:6px 14px;border-radius:8px;text-decoration:none;
              display:inline-flex;align-items:center;gap:6px;backdrop-filter:blur(4px);">
              ${_SVG.video} Ver video
            </a>` : ''}
          <!-- Nav arrows -->
          ${fotos.length>1 ? `
            <button onclick="propGalleryNav('${p.id}',-1)"
              style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);
              border:none;color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:20px;line-height:1;backdrop-filter:blur(4px);">‹</button>
            <button onclick="propGalleryNav('${p.id}',1)"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);
              border:none;color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:20px;line-height:1;backdrop-filter:blur(4px);">›</button>` : ''}
        </div>
        <!-- Thumbnail strip -->
        <div id="thumb-strip-${p.id}" style="display:flex;gap:4px;padding:6px 12px;background:rgba(0,0,0,0.5);overflow-x:auto;scrollbar-width:none;">
          ${fotos.map((f,i) => `
            <img src="${_esc(f.thumb_url||f.url||'')}" id="thumb-${p.id}-${i}"
              onclick="propGalleryJump('${p.id}',${i})"
              style="width:54px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;flex-shrink:0;
              border:2px solid ${i===0?'#22d3ee':'transparent'};opacity:${i===0?1:0.55};transition:all 0.15s;"/>`).join('')}
        </div>`
      : `
        <div style="background:linear-gradient(135deg,#0d1222,#161e35);height:200px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#334155;">
          ${_SVG.img.replace('stroke="currentColor"','stroke="#334155"')}
          <div style="font-size:13px;">Sin fotos · <span style="color:#22d3ee;cursor:pointer;text-decoration:underline;" onclick="openPropModal('${p.id}')">Agregar imágenes</span></div>
        </div>`}

      ${(() => {
        const ytId = _ytId(p.video_url)
        if (!ytId) return ''
        return `
        <!-- ── YouTube embed ─────────────────────────────────────────────── -->
        <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;background:#000;">
          <iframe
            src="https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1"
            title="Video de la propiedad"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;">
          </iframe>
        </div>`
      })()}

      <div style="padding:20px;">

        <!-- ── PRECIO + SPECS ─────────────────────────────────────────────── -->
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
            <div>
              <div style="font-size:30px;font-weight:900;color:#22d3ee;line-height:1;letter-spacing:-1px;">${_esc(_precioLabel(p))}</div>
              ${p.sup_construida && p.precio_venta ? `
                <div style="font-size:12px;color:#64748b;margin-top:3px;">
                  $${Math.round(p.precio_venta/p.sup_construida).toLocaleString('es-MX')}/m² construido</div>` : ''}
              ${p.precio_negociable ? `<span style="font-size:11px;color:#4ade80;font-weight:700;margin-top:3px;display:inline-flex;align-items:center;gap:4px;">✓ Precio negociable</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${(p.operacion||[]).map(op=>`
                <span style="padding:5px 14px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);
                color:#22d3ee;border-radius:8px;font-size:12px;font-weight:700;text-transform:uppercase;">${op}</span>`).join('')}
            </div>
          </div>
          <!-- Specs pills con SVG -->
          ${specs.length ? `
            <div style="display:flex;flex-wrap:wrap;gap:7px;">
              ${specs.map(s=>`
                <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 13px;
                background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:9px;color:#e2e8f0;">
                  <span style="color:#22d3ee;display:flex;">${s.svg}</span>
                  <span style="font-size:13px;font-weight:600;">${s.label}</span>
                </div>`).join('')}
            </div>` : ''}
        </div>

        <!-- ── QUICK ACTIONS ──────────────────────────────────────────────── -->
        <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,0.06);">
          ${p.lat && p.lng ? `
            <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;
              border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
              ${_SVG.map} Ver mapa</a>` : ''}
          ${p.album_fotos_url ? `
            <a href="${_esc(p.album_fotos_url)}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);color:#fbbf24;
              border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
              ${_SVG.album} Álbum fotos</a>` : ''}
          ${p.video_url ? `
            <a href="${_esc(p.video_url)}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.25);color:#f87171;
              border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
              ${_SVG.video} ${_ytId(p.video_url) ? 'Ver en YouTube' : 'Ver video'}</a>` : ''}
          ${p.tour_url ? `
            <a href="${_esc(p.tour_url)}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;
              border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
              ${_SVG.globe} Tour 360°</a>` : ''}
          ${p.drive_folder_url ? `
            <a href="${_esc(p.drive_folder_url)}" target="_blank" rel="noopener"
              style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
              background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;
              border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;">
              ${_SVG.folder} Documentos</a>` : ''}
          <button onclick="propCopyLink('${p.id}','${_esc(p.slug||p.id)}')"
            style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
            background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.2);color:#22d3ee;
            border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">
            ${_SVG.link} Compartir</button>
        </div>

        <!-- ── TABS ──────────────────────────────────────────────────────── -->
        <div style="display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:18px;overflow-x:auto;scrollbar-width:none;">
          ${[['info','📋 Info'],['galeria','🖼 Galería'+(fotos.length?` (${fotos.length})`:'')],['crm','📞 CRM'],['leads','📩 Leads'],['docs','📄 Docs'],['seo','🔎 SEO']].map(([tab,label])=>`
            <button onclick="propDetailTab('${tab}','${p.id}')" id="dtab-${tab}"
              style="padding:10px 14px;border:none;background:transparent;cursor:pointer;font-size:12px;font-weight:600;
              color:${tab==='info'?'#22d3ee':'#64748b'};border-bottom:2px solid ${tab==='info'?'#22d3ee':'transparent'};
              white-space:nowrap;transition:all 0.15s;">${label}</button>`).join('')}
        </div>

        <!-- ── TAB INFO ───────────────────────────────────────────────────── -->
        <div id="dpanel-info">

          <!-- Dirección -->
          <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:16px;
          background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.14);border-radius:10px;">
            <span style="color:#60a5fa;display:flex;flex-shrink:0;margin-top:1px;">${_SVG.map}</span>
            <div style="font-size:13px;color:#94a3b8;line-height:1.7;">
              ${_esc([p.calle,p.numero].filter(Boolean).join(' '))}
              ${p.calle ? `<br>` : ''}${_esc([p.colonia,p.municipio,p.estado_rep,p.cp?'C.P.'+p.cp:''].filter(Boolean).join(', '))}
              ${p.referencias ? `<br><span style="font-size:12px;color:#475569;font-style:italic;">${_esc(p.referencias)}</span>` : ''}
            </div>
          </div>

          <!-- Descripción del agente -->
          ${p.descripcion ? `
            <div style="margin-bottom:16px;">
              <div style="font-size:10px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Descripción</div>
              <p id="desc-text-${p.id}" style="font-size:13px;color:#94a3b8;line-height:1.75;margin:0;white-space:pre-wrap;
              display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;">${_esc(p.descripcion)}</p>
              <button onclick="const el=document.getElementById('desc-text-${p.id}');const exp=el.style.webkitLineClamp==='unset';el.style.webkitLineClamp=exp?'4':'unset';this.textContent=exp?'Ver más ▾':'Ver menos ▴'"
                style="background:none;border:none;color:#22d3ee;font-size:12px;cursor:pointer;padding:4px 0;margin-top:4px;">Ver más ▾</button>
            </div>` : ''}

          <!-- Multimedia links (cargados async desde property_links) -->
          <div style="margin-bottom:16px;">
            <div style="font-size:10px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Multimedia adjunta</div>
            <div id="dlinks-${p.id}" style="font-size:12px;color:#475569;">Cargando…</div>
          </div>

          <!-- Atributos enriquecidos: vista/orientación/régimen/uso suelo/clave catastral -->
          ${(p.vista||p.orientacion||p.regimen_propiedad||p.uso_suelo||p.estatus_obra||p.clave_catastral||p.topografia) ? `
            <div style="margin-bottom:16px;background:rgba(34,211,238,0.04);border:1px solid rgba(34,211,238,0.15);border-radius:10px;padding:12px;">
              <div style="font-size:10px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Atributos clave</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px 14px;font-size:12px;">
                ${p.vista          ? `<div><span style="color:#64748b;">Vista:</span> <span style="color:#e8f0f9;text-transform:capitalize;">${_esc(p.vista)}</span></div>` : ''}
                ${p.orientacion    ? `<div><span style="color:#64748b;">Orientación:</span> <span style="color:#e8f0f9;text-transform:capitalize;">${_esc(p.orientacion)}</span></div>` : ''}
                ${p.estatus_obra   ? `<div><span style="color:#64748b;">Estatus:</span> <span style="color:#e8f0f9;">${_esc(p.estatus_obra.replace('_',' '))}</span></div>` : ''}
                ${p.uso_suelo      ? `<div><span style="color:#64748b;">Uso suelo:</span> <span style="color:#e8f0f9;text-transform:capitalize;">${_esc(p.uso_suelo)}</span></div>` : ''}
                ${p.regimen_propiedad ? `<div><span style="color:#64748b;">Régimen:</span> <span style="color:#e8f0f9;text-transform:capitalize;">${_esc(p.regimen_propiedad)}</span></div>` : ''}
                ${p.topografia     ? `<div><span style="color:#64748b;">Topografía:</span> <span style="color:#e8f0f9;">${_esc(p.topografia.replace('_',' '))}</span></div>` : ''}
                ${p.clave_catastral? `<div><span style="color:#64748b;">Catastral:</span> <span style="color:#e8f0f9;font-family:monospace;">${_esc(p.clave_catastral)}</span></div>` : ''}
              </div>
            </div>` : ''}

          <!-- Amenidades -->
          ${amenidades.length ? `
            <div style="margin-bottom:14px;">
              <div style="font-size:10px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Amenidades</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${amenidades.map(k=>`
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;
                  background:rgba(34,211,238,0.07);border:1px solid rgba(34,211,238,0.2);color:#22d3ee;padding:5px 11px;border-radius:7px;">
                    ${AMEN_ICONS[k]} ${AMEN_LABELS[k]}</span>`).join('')}
              </div>
            </div>` : ''}

          <!-- Servicios -->
          ${servicios.length ? `
            <div style="margin-bottom:16px;">
              <div style="font-size:10px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Servicios</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${servicios.map(k=>`
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;
                  background:rgba(74,222,128,0.07);border:1px solid rgba(74,222,128,0.2);color:#4ade80;padding:5px 11px;border-radius:7px;">
                    ${SERV_ICONS[k]} ${SERV_LABELS[k]}</span>`).join('')}
              </div>
            </div>` : ''}

          <!-- Propietario -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:13px;">
              <div style="font-size:10px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;">Propietario</div>
              <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-bottom:5px;">${_esc(p.dueno_nombre||'—')}</div>
              ${p.dueno_telefono ? `
                <a href="https://wa.me/52${p.dueno_telefono.replace(/\D/g,'')}?text=Hola%2C+me+interesa+la+propiedad+${_esc(p.folio_interno||p.id)}" target="_blank"
                  style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#4ade80;text-decoration:none;margin-bottom:3px;">
                  📲 ${_esc(p.dueno_telefono)}</a><br>` : ''}
              ${p.dueno_email ? `<a href="mailto:${_esc(p.dueno_email)}" style="font-size:12px;color:#60a5fa;text-decoration:none;">✉ ${_esc(p.dueno_email)}</a>` : ''}
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:13px;">
              <div style="font-size:10px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;">Más detalles</div>
              ${p.amueblado ? `<div style="font-size:12px;color:#a78bfa;margin-bottom:3px;">🪑 Amueblado</div>` : ''}
              ${p.medios_banos ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:3px;">½ Baños: ${p.medios_banos}</div>` : ''}
              ${p.frente ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:3px;">↔ Frente: ${p.frente}m</div>` : ''}
              ${p.fondo  ? `<div style="font-size:12px;color:#94a3b8;margin-bottom:3px;">↕ Fondo: ${p.fondo}m</div>` : ''}
              <div style="font-size:11px;color:#475569;margin-top:4px;">${fotos.length} foto${fotos.length!==1?'s':''}</div>
            </div>
          </div>

          <!-- Exclusiva -->
          ${p.exclusiva && p.exclusiva_fin ? (() => {
            const diff = (new Date(p.exclusiva_fin) - new Date()) / (1000*60*60*24)
            const ac   = diff < 0 ? '#f87171' : diff <= 7 ? '#fb923c' : '#22d3ee'
            return `
              <div style="background:${ac}10;border:1px solid ${ac}30;border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;">
                <div style="font-size:22px;">⭐</div>
                <div>
                  <div style="font-size:11px;color:${ac};font-weight:700;text-transform:uppercase;">
                    ${diff < 0 ? 'Exclusiva vencida' : diff <= 7 ? `Vence en ${Math.ceil(diff)} días` : 'Exclusiva activa'}</div>
                  <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                    ${_esc(p.exclusiva_inicio||'')} → ${_esc(p.exclusiva_fin)}
                    &nbsp;·&nbsp; Comisión: <strong style="color:${ac};">${p.comision_pct||5}%</strong>
                  </div>
                </div>
              </div>`
          })() : ''}
        </div>

        <!-- ── TAB GALERÍA ────────────────────────────────────────────────── -->
        <div id="dpanel-galeria" style="display:none;">
          <div style="font-size:12px;color:#64748b;margin-bottom:12px;">Arrastra para reordenar · Clic para zoom</div>
          <div id="gallery-sortable-${p.id}" data-prop-grid="${p.id}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
            ${fotos.map((f,i)=>{
              const url = f.url || f.thumb_url || ''
              const mainUrl = p.main_image_url
              const isMain = (mainUrl && mainUrl === url) || (!mainUrl && i === 0)
              return `
              <div data-index="${i}" data-url="${_esc(url)}"
                style="position:relative;border-radius:10px;overflow:hidden;border:1px solid ${isMain?'#facc15':'rgba(255,255,255,0.08)'};
                cursor:grab;aspect-ratio:4/3;background:rgba(14,20,34,0.8);${isMain?'box-shadow:0 0 0 2px rgba(250,204,21,0.25);':''}">
                <img src="${_esc(f.thumb_url||f.url||'')}" style="width:100%;height:100%;object-fit:cover;"
                  onclick="propOpenLightbox('${p.id}',${i})"/>
                ${f.categoria ? `
                  <div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;
                  background:rgba(0,0,0,0.7);font-size:9px;color:#22d3ee;font-weight:700;text-transform:uppercase;">${_esc(f.categoria)}</div>` : ''}
                <!-- ⭐ Marcar principal -->
                <button data-prop-main-star data-url="${_esc(url)}"
                  onclick="event.stopPropagation();propSetMainPhoto('${_esc(url)}','${p.id}')"
                  title="${isMain?'Foto principal':'Marcar como principal'}"
                  style="position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:50%;
                  background:rgba(0,0,0,0.7);border:none;color:${isMain?'#facc15':'#64748b'};cursor:pointer;font-size:14px;line-height:1;">${isMain?'★':'☆'}</button>
                <!-- 🗑 Eliminar -->
                <button onclick="event.stopPropagation();propRemoveFotoByUrl('${_esc(url)}','${p.id}')"
                  title="Eliminar foto"
                  style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
                  background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:12px;line-height:1;">✕</button>
              </div>`}).join('')}
          </div>
          ${fotos.length===0?`<div style="text-align:center;padding:30px;color:#475569;">Sin fotos aún</div>`:''}
          <!-- Agregar por URL -->
          <div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;background:rgba(255,255,255,0.02);margin-bottom:10px;">
            <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;margin-bottom:8px;">+ Agregar foto por URL</div>
            <div style="display:flex;gap:8px;">
              <input type="url" id="gallery-url-input-${p.id}" placeholder="https://... URL de imagen (Drive, Dropbox, Imgur, etc.)"
                style="flex:1;padding:8px 12px;background:rgba(14,20,34,0.8);border:1px solid rgba(255,255,255,0.1);
                border-radius:7px;color:#e8f0f9;font-size:13px;outline:none;"
                onkeydown="if(event.key==='Enter'){event.preventDefault();propAddPhotoUrlFromDetail('${p.id}');}"/>
              <button onclick="propAddPhotoUrlFromDetail('${p.id}')"
                style="padding:8px 14px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);
                color:#22d3ee;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;">Agregar</button>
            </div>
          </div>
          <!-- Subir desde dispositivo -->
          <div style="border:2px dashed rgba(34,211,238,0.2);border-radius:10px;padding:14px;text-align:center;cursor:pointer;"
            onclick="document.getElementById('gallery-upload-${p.id}').click()">
            <input type="file" id="gallery-upload-${p.id}" multiple accept="image/*" style="display:none;"
              onchange="propHandleFiles(this.files,'${p.id}')"/>
            <div style="font-size:12px;color:#64748b;">+ Subir fotos desde dispositivo</div>
          </div>
        </div>

        <!-- ── TAB CRM ────────────────────────────────────────────────────── -->
        <div id="dpanel-crm" style="display:none;">${_renderHistorial(p.id)}</div>

        <!-- ── TAB DOCS ───────────────────────────────────────────────────── -->
        <div id="dpanel-docs" data-prop-id="${p.id}" style="display:none;">
          <div style="text-align:center;padding:20px;color:#475569;font-size:13px;">Cargando documentos…</div>
        </div>

        <!-- ── TAB LEADS ──────────────────────────────────────────────────── -->
        <div id="dpanel-leads" data-prop-id="${p.id}" style="display:none;">
          <div style="text-align:center;padding:20px;color:#475569;font-size:13px;">Cargando leads…</div>
        </div>

        <!-- ── TAB SEO ────────────────────────────────────────────────────── -->
        <div id="dpanel-seo" data-prop-id="${p.id}" style="display:none;">
          ${_renderSeoPanel(p)}
        </div>

        <!-- ── TAB REPORTES ───────────────────────────────────────────────── -->
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // Init SortableJS galería
  requestAnimationFrame(() => {
    const sortEl = document.getElementById(`gallery-sortable-${p.id}`)
    if (sortEl && typeof Sortable !== 'undefined') {
      new Sortable(sortEl, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: () => { propSaveGalleryOrder(p.id) },
      })
    }
  })
}

// ─── Cerrar modal ─────────────────────────────────────────────────────────────
export function closePropModal() {
  document.getElementById('prop-modal-overlay')?.remove()
}

// ═══════════════════════════════════════════════════════════════════════════════
// GUARDAR — Create / Update
// ═══════════════════════════════════════════════════════════════════════════════
export async function saveProp(id) {
  const g  = (sel) => document.getElementById(sel)
  const gv = (sel) => g(sel)?.value?.trim() || null
  const gb = (sel) => g(sel)?.checked || false

  const tipo     = gv('prop-tipo') || 'casa'
  const operacion = [...document.querySelectorAll('input[name="operacion"]:checked')].map(el => el.value)

  const payload = {
    tipo,
    operacion,
    status:            gv('prop-status')         || 'captacion',
    titulo:            gv('prop-titulo'),
    folio_interno:     gv('prop-folio'),

    calle:             gv('prop-calle'),
    numero:            gv('prop-numero'),
    colonia:           gv('prop-colonia'),
    municipio:         gv('prop-municipio')      || 'La Paz',
    estado_rep:        gv('prop-estado-rep')     || 'BCS',
    cp:                gv('prop-cp'),
    referencias:       gv('prop-referencias'),

    precio_venta:      gv('prop-precio-venta')   ? Number(gv('prop-precio-venta'))   : null,
    precio_renta:      gv('prop-precio-renta')   ? Number(gv('prop-precio-renta'))   : null,
    moneda:            gv('prop-moneda')          || 'MXN',
    precio_negociable: gb('prop-negociable'),

    sup_terreno:       gv('prop-sup-terreno')    ? Number(gv('prop-sup-terreno'))    : null,
    sup_construida:    gv('prop-sup-construida') ? Number(gv('prop-sup-construida')) : null,
    frente:            gv('prop-frente')         ? Number(gv('prop-frente'))         : null,
    fondo:             gv('prop-fondo')          ? Number(gv('prop-fondo'))          : null,

    recamaras:         gv('prop-recamaras')      ? Number(gv('prop-recamaras'))      : null,
    banos:             gv('prop-banos')          ? Number(gv('prop-banos'))          : null,
    medios_banos:      gv('prop-medios-banos')   ? Number(gv('prop-medios-banos'))   : null,
    estacionamientos:  gv('prop-estacionamientos')? Number(gv('prop-estacionamientos')):null,
    pisos:             gv('prop-pisos')          ? Number(gv('prop-pisos'))          : null,
    antiguedad_anios:  gv('prop-antiguedad')     ? Number(gv('prop-antiguedad'))     : null,
    amueblado:         gb('prop-amueblado'),

    agua:              gb('prop-agua'),
    luz:               gb('prop-luz'),
    drenaje:           gb('prop-drenaje'),
    gas:               gb('prop-gas'),
    gas_natural:       gb('prop-gas-natural'),
    gas_tanque:        gb('prop-gas-tanque'),
    internet:          gb('prop-internet'),
    internet_fibra:    gb('prop-internet-fibra'),
    cable_tv:          gb('prop-cable-tv'),
    seguridad_24h:     gb('prop-seguridad-24h'),

    alberca:           gb('prop-alberca'),
    jacuzzi:           gb('prop-jacuzzi'),
    gym:               gb('prop-gym'),
    elevador:          gb('prop-elevador'),
    jardin:            gb('prop-jardin'),
    roof_garden:       gb('prop-roof-garden'),
    terraza:           gb('prop-terraza'),
    asador_bbq:        gb('prop-asador-bbq'),
    salon_eventos:     gb('prop-salon-eventos'),
    area_juegos:       gb('prop-area-juegos'),
    cine_privado:      gb('prop-cine-privado'),
    lobby:             gb('prop-lobby'),
    concierge:         gb('prop-concierge'),
    cctv:              gb('prop-cctv'),
    porton_electrico:  gb('prop-porton-electrico'),
    cisterna:          gb('prop-cisterna'),
    panel_solar:       gb('prop-panel-solar'),
    bodega_ext:        gb('prop-bodega-ext'),
    cuarto_servicio:   gb('prop-cuarto-servicio'),
    vigilancia:        gb('prop-vigilancia'),

    descripcion:       g('prop-descripcion')?.value?.trim() || null,
    notas_internas:    g('prop-notas')?.value?.trim()       || null,
    // Links múltiples viven en tabla property_links; campos legacy
    // (drive_folder_url, video_url, tour_url, album_fotos_url) NO se tocan al
    // guardar para no perder datos antiguos. Vistas legacy los leen como fallback.

    exclusiva:         gb('prop-exclusiva'),
    exclusiva_inicio:  gv('prop-excl-inicio'),
    exclusiva_fin:     gv('prop-excl-fin'),
    comision_pct:      gv('prop-comision') ? Number(gv('prop-comision')) : 5,

    dueno_nombre:      gv('prop-dueno-nombre'),
    dueno_telefono:    gv('prop-dueno-tel'),
    dueno_email:       gv('prop-dueno-email'),

    // Coordenadas
    lat:               gv('prop-lat') ? Number(gv('prop-lat')) : null,
    lng:               gv('prop-lng') ? Number(gv('prop-lng')) : null,

    // Campos enriquecidos (Fase 1 parte 2)
    price_type:        gv('prop-price-type')        || 'total',
    expenses:          gv('prop-expenses')          ? Number(gv('prop-expenses')) : null,
    orientacion:       gv('prop-orientacion'),
    vista:             gv('prop-vista'),
    regimen_propiedad: gv('prop-regimen'),
    estatus_obra:      gv('prop-estatus-obra'),
    clave_catastral:   gv('prop-clave-catastral'),
    show_exact_location: g('prop-show-pin') ? g('prop-show-pin').checked : true,
    mostrar_hipoteca:    g('prop-mostrar-hipoteca') ? g('prop-mostrar-hipoteca').checked : true,
    seo_title:           gv('prop-seo-title'),
    seo_description:     gv('prop-seo-desc'),
    seo_keywords:        gv('prop-seo-keywords'),
    seo_image_url:       gv('prop-seo-image') || null,
    uso_suelo:         gv('prop-uso-suelo'),
    topografia:        gv('prop-topografia'),
    // Industrial
    altura_libre_m:    gv('prop-altura-libre')      ? Number(gv('prop-altura-libre')) : null,
    andenes_cantidad:  gv('prop-andenes-cant')      ? Number(gv('prop-andenes-cant')) : null,
    andenes_tipo:      gv('prop-andenes-tipo'),
    kva:               gv('prop-kva')               ? Number(gv('prop-kva'))          : null,
    trifasica:         gb('prop-trifasica'),
    patio_maniobras_m2:gv('prop-patio-maniobras')   ? Number(gv('prop-patio-maniobras')) : null,
    resistencia_piso:  gv('prop-resistencia-piso'),
    // Comercial
    aforo:             gv('prop-aforo')             ? Number(gv('prop-aforo'))        : null,
    frente_avenida_m:  gv('prop-frente-avenida')    ? Number(gv('prop-frente-avenida')) : null,
    giros_permitidos:  gv('prop-giros') ? gv('prop-giros').split(',').map(s=>s.trim()).filter(Boolean) : null,
  }

  // Generar slug si es nuevo
  if (!id) {
    payload.slug = _buildSlug(payload) + '-' + Date.now().toString(36).slice(-4)
    if (!payload.folio_interno) payload.folio_interno = _buildFolio(_propFolioSeq)
  }

  const btn = document.querySelector('#prop-form button[onclick*="saveProp"]')
  if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true }

  let error, savedId = id
  if (id) {
    ;({ error } = await supabase.from('properties').update(payload).eq('id', id))
  } else {
    const insertRes = await supabase
      .from('properties')
      .insert({ ...payload, user_id: (await supabase.auth.getUser()).data.user?.id })
      .select('id')
      .single()
    error = insertRes.error
    savedId = insertRes.data?.id
  }

  if (error) {
    console.error('[inmuebles] save:', error)
    if (btn) { btn.textContent = '❌ Error — reintentar'; btn.disabled = false }
    if (typeof window.showToast === 'function') window.showToast('❌ Error al guardar: ' + error.message)
    return
  }

  // Persistir links múltiples (después de tener id del inmueble)
  if (savedId) {
    try { await persistLinks(savedId) }
    catch (e) { console.error('[inmuebles] persistLinks', e) }
  }

  // Dispatch evento n8n (fire-and-forget, no bloquea UI)
  try {
    const eventName = id ? 'property_updated' : 'property_created'
    window.nexusN8n?.dispatch?.(eventName, { property: { ...payload, id: savedId } })
  } catch {}

  closePropModal()
  await loadProperties()
  renderInmuebles()
  if (typeof window.showToast === 'function')
    window.showToast(id ? '✅ Propiedad actualizada' : '✅ Propiedad captada')
  try { window.nexusTrack?.(id ? 'action:property_update' : 'action:property_capture', { tipo, folio: payload.folio_interno }) } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBIDA DE FOTOS (Supabase Storage)
// ═══════════════════════════════════════════════════════════════════════════════

/** Categorización automática por nombre de archivo */
function _categorizarFoto(filename) {
  const n = filename.toLowerCase()
  if (/fachada|frente|exterior|entrada/.test(n))    return 'fachada'
  if (/sala|living|estancia/.test(n))               return 'sala'
  if (/cocina|kitchen/.test(n))                     return 'cocina'
  if (/rec.mara|cuarto|bedroom|hab/.test(n))        return 'recamara'
  if (/ba.o|toilet|wc/.test(n))                     return 'bano'
  if (/patio|jardin|yard|garden/.test(n))           return 'patio'
  if (/area|a.rea|drone|aero/.test(n))              return 'aerea'
  if (/plano|blueprint|plan/.test(n))               return 'plano'
  if (/terreno|lote|lot/.test(n))                   return 'terreno'
  return 'general'
}

/** Comprime imagen antes de subir (canvas) */
async function _compressImage(file, maxW = 1280, quality = 0.82) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const ratio = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width * ratio)
        canvas.height = Math.round(img.height * ratio)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export async function propHandleFiles(files, propId) {
  if (!files?.length) return
  const preview = document.getElementById('prop-fotos-preview')
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return

  // ¿Usuario tiene Google Drive conectado? Si sí, subimos a Drive; si no, fallback a Supabase Storage
  const useDrive = await hasDriveAccess()
  let driveFolderId = null
  if (useDrive && propId) {
    const existing = _props.find(p => p.id === propId)
    const folio = existing?.folio_interno || propId.slice(0, 8)
    try {
      driveFolderId = await ensureNexusFolder(`Nexus OS/Inmuebles/${folio}/fotos`)
    } catch (e) {
      console.warn('[drive] folder create fail, fallback Supabase Storage:', e.message)
    }
  }

  for (const file of Array.from(files)) {
    if (file.size > 8 * 1024 * 1024) { window.showToast?.('⚠ ' + file.name + ' es muy grande (máx 8MB)'); continue }

    const skId = 'sk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    if (preview) preview.innerHTML += `
      <div id="${skId}" style="width:80px;height:80px;border-radius:8px;background:rgba(34,211,238,0.08);
      border:1px dashed rgba(34,211,238,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;color:#22d3ee;">⏳</div>`

    const compressed = await _compressImage(file)
    const cat   = _categorizarFoto(file.name)
    const fname = `${cat}-${Date.now()}.jpg`

    let url, storage_path, drive_id

    if (useDrive && driveFolderId) {
      // Drive del usuario
      try {
        const driveFile = await uploadToDrive(compressed, { folderId: driveFolderId, name: fname })
        drive_id = driveFile.id
        url = driveDirectImageUrl(driveFile.id)
      } catch (e) {
        console.error('[drive] upload fail, fallback Supabase:', e)
        // Mensaje amigable según el tipo de error
        const isAuth = /401|403|token|unauthor/i.test(e.message || '')
        if (isAuth) {
          window.showToast?.('🔌 Tu Google Drive se desconectó — guardando en Nexus mientras. Reconecta desde Configuración → Drive.')
        } else {
          window.showToast?.('⚠ Drive falló, subiendo a Nexus: ' + e.message)
        }
      }
    }

    if (!url) {
      // Fallback Supabase Storage
      const path  = `properties/${propId || 'draft-' + user.id}/${fname}`
      const { error } = await supabase.storage.from('nexus-media').upload(path, compressed, { upsert: false })
      if (error) { document.getElementById(skId)?.remove(); window.showToast?.('❌ Error subiendo ' + file.name); continue }
      const { data: urlData } = supabase.storage.from('nexus-media').getPublicUrl(path)
      url = urlData.publicUrl
      storage_path = path
    }

    document.getElementById(skId)?.remove()

    if (preview) {
      preview.innerHTML += `
        <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid rgba(34,211,238,0.3);">
          <img src="${url}" style="width:100%;height:100%;object-fit:cover;"/>
          <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);font-size:8px;color:#22d3ee;text-align:center;padding:2px;">${cat}</div>
          <button onclick="propRemoveFotoByUrl('${url}','${propId||''}')"
            style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;
            background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:10px;line-height:1;">✕</button>
        </div>`
    }

    if (propId) {
      const existing = _props.find(p => p.id === propId)
      const fotos = [...(existing?.fotos || []), {
        url,
        storage_path: storage_path || null,
        drive_id:     drive_id || null,
        categoria:    cat,
        orden:        (existing?.fotos||[]).length,
      }]
      await supabase.from('properties').update({ fotos }).eq('id', propId)
      if (existing) existing.fotos = fotos
    }
  }
}

export function propHandleDrop(e) {
  e.preventDefault()
  const propId = document.querySelector('#prop-form')?.dataset?.propId || ''
  propHandleFiles(e.dataTransfer.files, propId)
}

// ═══════════════════════════════════════════════════════════════════════════════
// WINDOW HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
window.openPropModal    = (id) => openPropModal(id)
window.openPropDetail   = (id) => openPropDetail(id)
window.closePropModal   = ()   => closePropModal()
window.saveProp         = (id) => saveProp(id)

// GPS directo: usa geolocalización del navegador + reverse geocoding
window.propUseCurrentGPS = async () => {
  const g = (id) => document.getElementById(id)
  if (!navigator.geolocation) {
    window.showToast?.('❌ GPS no disponible en este navegador')
    return
  }
  window.showToast?.('📍 Obteniendo ubicación…')
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })
    })
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    g('prop-lat').value = lat.toFixed(6)
    g('prop-lng').value = lng.toFixed(6)

    // Reverse geocode con Nominatim
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es-MX&zoom=18`,
        { headers: { 'User-Agent': 'NexusOS/1.0' } }
      )
      if (r.ok) {
        const data = await r.json()
        const a = data.address || {}
        if (g('prop-calle') && !g('prop-calle').value && (a.road || a.pedestrian))
          g('prop-calle').value = a.road || a.pedestrian
        if (g('prop-colonia') && !g('prop-colonia').value && (a.suburb || a.neighbourhood))
          g('prop-colonia').value = a.suburb || a.neighbourhood
        if (g('prop-cp') && !g('prop-cp').value && a.postcode)
          g('prop-cp').value = a.postcode
        if (a.city || a.town || a.municipality) {
          const mun = a.city || a.town || a.municipality
          if (g('prop-municipio')) {
            const opt = [...g('prop-municipio').options].find(o => o.value.toLowerCase() === mun.toLowerCase())
            if (opt) g('prop-municipio').value = opt.value
          }
        }
      }
    } catch (e) { console.warn('[gps] reverse geocode', e) }

    const acc = pos.coords.accuracy ? ` (±${Math.round(pos.coords.accuracy)}m)` : ''
    window.showToast?.(`✓ Ubicación capturada${acc}`)
  } catch (e) {
    let msg = 'Error desconocido'
    if (e.code === 1) msg = 'Permiso de ubicación denegado'
    else if (e.code === 2) msg = 'No se pudo obtener ubicación'
    else if (e.code === 3) msg = 'GPS timeout — intenta de nuevo'
    window.showToast?.('❌ ' + msg)
  }
}

// Map picker: abre overlay y llena lat/lng + (opcional) calle/colonia/municipio/cp si están vacíos
window.propOpenMapPicker = async () => {
  const g = (id) => document.getElementById(id)
  const cur = {
    lat: parseFloat(g('prop-lat')?.value) || 24.1426,
    lng: parseFloat(g('prop-lng')?.value) || -110.3128,
  }
  const result = await openMapPicker(cur)
  if (!result) return
  g('prop-lat').value = result.lat.toFixed(6)
  g('prop-lng').value = result.lng.toFixed(6)
  if (result.address) {
    const a = result.address
    // Solo rellena los que estén vacíos para no sobrescribir lo que el usuario ya puso
    if (g('prop-calle')   && !g('prop-calle').value   && a.calle)     g('prop-calle').value   = a.calle
    if (g('prop-colonia') && !g('prop-colonia').value && a.colonia)   g('prop-colonia').value = a.colonia
    if (g('prop-cp')      && !g('prop-cp').value      && a.cp)        g('prop-cp').value      = a.cp
    // Para municipio/estado intentamos match en el dataset
    if (a.municipio && g('prop-municipio')) {
      const opt = [...g('prop-municipio').options].find(o => o.value.toLowerCase() === a.municipio.toLowerCase())
      if (opt) g('prop-municipio').value = opt.value
    }
  }
  window.showToast?.('📍 Coordenadas guardadas')
}
window.propHandleFiles  = (files, id) => propHandleFiles(files, id)
window.propHandleDrop   = (e)  => propHandleDrop(e)

window.inmSetTab = (tab) => {
  _inmTab = tab
  localStorage.setItem('nexus_inm_tab', tab)
  renderInmuebles()
}

window.propSetView = (v) => {
  _propView = v
  localStorage.setItem('nexus_prop_view', v)
  renderInmuebles()
}

window.propSetPage = (n) => { _propPage = n; renderInmuebles() }

window.propFilter = (key, val) => {
  _propFilters[key] = val
  _propPage = 1
  renderInmuebles()
}

window.propClearFilters = () => {
  _propFilters = { tipo:'', operacion:'', status:'', colonia:'', precioMin:'', precioMax:'', search:'' }
  _propPage = 1
  renderInmuebles()
}

window.propSelectTipo = (tipo) => {
  document.getElementById('prop-tipo').value = tipo
  PROP_TIPOS.forEach(t => {
    const btn = document.getElementById('tipo-btn-' + t.id)
    if (!btn) return
    if (t.id === tipo) {
      btn.style.background = 'rgba(34,211,238,0.15)'
      btn.style.borderColor = 'rgba(34,211,238,0.4)'
      btn.style.color = '#22d3ee'
    } else {
      btn.style.background = 'rgba(255,255,255,0.05)'
      btn.style.borderColor = 'rgba(255,255,255,0.1)'
      btn.style.color = '#7a8899'
    }
  })
}

window.propSelectStatus = (s) => {
  document.getElementById('prop-status').value = s
  PROP_STATUS.forEach(st => {
    const btn = document.getElementById('status-btn-' + st.id)
    if (!btn) return
    if (st.id === s) {
      btn.style.background = st.color + '22'
      btn.style.borderColor = st.color + '55'
      btn.style.color = st.color
    } else {
      btn.style.background = 'rgba(255,255,255,0.04)'
      btn.style.borderColor = 'rgba(255,255,255,0.08)'
      btn.style.color = '#7a8899'
    }
  })
}

window.propToggleExclusiva = (on) => {
  const f = document.getElementById('prop-exclusiva-fields')
  if (f) f.style.display = on ? 'flex' : 'none'
}

window.propRemoveFoto = (idx) => {
  const thumbs = document.querySelectorAll('#prop-fotos-preview > div')
  thumbs[idx]?.remove()
}

// Borra una foto del array `fotos` de la propiedad + del Storage/Drive + del DOM.
// Si la foto era la principal, promueve la siguiente disponible como principal.
window.propRemoveFotoByUrl = async (url, propId) => {
  // 1. Quita visualmente (optimista)
  const grids = document.querySelectorAll('#prop-fotos-preview > div, [data-prop-grid] > div')
  grids.forEach(el => { if (el.querySelector('img')?.src === url) el.remove() })

  // 2. Si no hay propId, era un upload sin guardar todavía — listo
  if (!propId) return

  const existing = _props.find(p => p.id === propId)
  if (!existing) return
  const fotos = existing.fotos || []
  const found = fotos.find(f => (f.url || f.thumb_url) === url)
  const newFotos = fotos.filter(f => (f.url || f.thumb_url) !== url)

  // 3. Si era la foto principal, promueve la siguiente disponible
  let mainUpdate = {}
  if (existing.main_image_url === url) {
    mainUpdate.main_image_url = newFotos[0]?.url || null
  }

  // 4. Persist BD
  const { error } = await supabase.from('properties').update({ fotos, ...mainUpdate }).eq('id', propId)
  if (error) { window.showToast?.('❌ ' + error.message); return }
  existing.fotos = newFotos
  if ('main_image_url' in mainUpdate) existing.main_image_url = mainUpdate.main_image_url

  // 5. Borra del Storage / Drive (best-effort, no bloquea UI si falla)
  if (found?.storage_path) {
    supabase.storage.from('nexus-media').remove([found.storage_path]).catch(() => {})
  }
  if (found?.drive_id) {
    try {
      const { deleteDriveFile } = await import('./drive-storage.js')
      deleteDriveFile?.(found.drive_id).catch(() => {})
    } catch {}
  }

  window.showToast?.('🗑 Foto eliminada')
}

// Marca una foto como "principal" — persiste en columna main_image_url
window.propSetMainPhoto = async (url, propId) => {
  if (!propId) return
  const existing = _props.find(p => p.id === propId)
  if (!existing) return
  const { error } = await supabase.from('properties').update({ main_image_url: url }).eq('id', propId)
  if (error) { window.showToast?.('❌ ' + error.message); return }
  existing.main_image_url = url
  window.showToast?.('⭐ Foto principal actualizada')
  // Repinta la galería si está abierta para que el ⭐ se mueva
  document.querySelectorAll('[data-prop-main-star]').forEach(s => {
    const isMain = s.dataset.url === url
    s.textContent = isMain ? '★' : '☆'
    s.style.color = isMain ? '#facc15' : '#64748b'
  })
}

// Genera el link público con OG-friendly URL.
// Si la propiedad tiene slug, usa /propiedad/<slug> (más bonito y SEO).
// Si no, usa /propiedad/<id> (UUID).
// La URL pasa por api/propiedad.js que renderiza HTML con OG tags
// pre-llenados — preview correcto en WhatsApp/Telegram/FB/Twitter.
function _propPublicUrl(p) {
  const ref = p?.slug || p?.id
  return `${location.origin}/propiedad/${ref}`
}

// ── Panel SEO con preview en vivo (pestaña 🔎 SEO del detalle) ───────────────
function _renderSeoPanel(p) {
  const url       = _propPublicUrl(p)
  const ogImg     = `${location.origin}/api/og-image?id=${encodeURIComponent(p.slug || p.id)}`
  const titulo    = p.titulo || 'Inmueble'
  const tipo      = p.tipo ? p.tipo[0].toUpperCase() + p.tipo.slice(1) : 'Inmueble'
  const op        = p.operacion === 'renta' ? 'en renta' : 'en venta'
  const precio    = p.operacion === 'renta' ? p.precio_renta : p.precio_venta
  const precioStr = precio ? '$' + Number(precio).toLocaleString('es-MX') : ''
  // Defaults sugeridos
  const defTitle  = p.seo_title || [titulo, precioStr].filter(Boolean).join(' · ')
  const ubic      = [p.municipio, p.estado_rep].filter(Boolean).join(', ')
  const defDesc   = p.seo_description || [`${tipo} ${op}`, ubic, (p.descripcion||'').slice(0,80)].filter(Boolean).join(' · ')
  const defExcerpt= p.seo_excerpt || (p.descripcion || '').slice(0, 160)
  const keywords  = p.seo_keywords || ''

  const _in = (id, label, val, ph, max, multiline) => `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
        <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${label}</label>
        ${max ? `<span data-seo-count="${id}" style="font-size:10px;color:#64748b;">${(val||'').length}/${max}</span>` : ''}
      </div>
      ${multiline
        ? `<textarea id="${id}" rows="3" oninput="_seoLivePreview('${p.id}')" placeholder="${_esc(ph)}" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;">${_esc(val||'')}</textarea>`
        : `<input type="text" id="${id}" value="${_esc(val||'')}" oninput="_seoLivePreview('${p.id}')" placeholder="${_esc(ph)}" style="width:100%;padding:9px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e8f0f9;font-size:13px;outline:none;box-sizing:border-box;" />`}
    </div>`

  return `
    <div style="max-width:680px;">
      <div style="font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:18px;padding:10px 14px;background:rgba(34,211,238,0.05);border:1px solid rgba(34,211,238,0.15);border-radius:10px;">
        Configura cómo se verá esta propiedad al compartirla en WhatsApp, Facebook y Google. La imagen ⭐ que marcaste en Galería es la que aparece.
      </div>

      <!-- Preview tarjeta en vivo (estilo WhatsApp/FB) -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Vista previa al compartir</div>
        <div style="max-width:420px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;background:#0f1419;">
          <img id="seo-pv-img" src="${_esc(ogImg)}" style="width:100%;height:200px;object-fit:cover;background:#1a2332;" onerror="this.style.display='none'" />
          <div style="padding:12px 14px;">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;" id="seo-pv-url">${_esc(url.replace(/^https?:\/\//,''))}</div>
            <div style="font-size:14px;font-weight:700;color:#e8f0f9;line-height:1.3;margin-bottom:4px;" id="seo-pv-title">${_esc(defTitle)}</div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.4;" id="seo-pv-desc">${_esc(defDesc)}</div>
          </div>
        </div>
      </div>

      <!-- Campos editables -->
      ${_in('seo-f-title', 'Meta-título', defTitle, 'Casa en venta Tulum · $3,500,000', 60)}
      ${_in('seo-f-desc', 'Meta-descripción', defDesc, 'Hermosa casa de 3 recámaras en zona...', 155, true)}
      ${_in('seo-f-excerpt', 'Extracto (resumen corto)', defExcerpt, 'Resumen breve para listados internos', 160, true)}
      ${_in('seo-f-keywords', 'Etiquetas / Keywords (separadas por coma)', keywords, 'casa tulum, venta, 3 recamaras, alberca', 0)}

      <!-- URL slug preview -->
      <div style="margin-bottom:16px;">
        <label style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:5px;">URL pública</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <code style="flex:1;font-size:12px;color:#22d3ee;background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.15);border-radius:8px;padding:9px 12px;font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(url)}</code>
          <button onclick="navigator.clipboard.writeText('${_esc(url)}').then(()=>window.showToast?.('🔗 Link copiado'))" style="padding:9px 14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;cursor:pointer;font-size:12px;">📋 Copiar</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:20px;">
        <button onclick="_saveSeoPanel('${p.id}')" style="flex:1;padding:11px;background:linear-gradient(135deg,#22d3ee,#06b6d4);border:none;color:#000;font-weight:800;border-radius:10px;cursor:pointer;font-size:13px;">💾 Guardar SEO</button>
        <button onclick="window.open('https://wa.me/?text='+encodeURIComponent('${_esc(url)}'),'_blank')" style="padding:11px 18px;background:rgba(37,211,102,0.12);border:1px solid rgba(37,211,102,0.3);color:#25d366;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;">📱 Probar en WA</button>
      </div>
    </div>`
}

// Actualiza la tarjeta de preview en vivo mientras el usuario escribe
window._seoLivePreview = (propId) => {
  const g = (id) => document.getElementById(id)?.value || ''
  const title = g('seo-f-title')
  const desc  = g('seo-f-desc')
  if (g('seo-f-title') !== undefined) {
    const pvTitle = document.getElementById('seo-pv-title')
    const pvDesc  = document.getElementById('seo-pv-desc')
    if (pvTitle) pvTitle.textContent = title || '(sin título)'
    if (pvDesc)  pvDesc.textContent = desc || '(sin descripción)'
  }
  // Actualiza contadores
  ;[['seo-f-title',60],['seo-f-desc',155],['seo-f-excerpt',160]].forEach(([id,max]) => {
    const el = document.getElementById(id)
    const counter = document.querySelector(`[data-seo-count="${id}"]`)
    if (el && counter) {
      const len = el.value.length
      counter.textContent = `${len}/${max}`
      counter.style.color = len > max ? '#f87171' : '#64748b'
    }
  })
}

window._saveSeoPanel = async (propId) => {
  const g = (id) => document.getElementById(id)?.value?.trim() || null
  const payload = {
    seo_title:       g('seo-f-title'),
    seo_description: g('seo-f-desc'),
    seo_excerpt:     g('seo-f-excerpt'),
    seo_keywords:    g('seo-f-keywords'),
  }
  const { error } = await supabase.from('properties').update(payload).eq('id', propId)
  if (error) { window.showToast?.('❌ ' + error.message); return }
  const existing = _props.find(p => p.id === propId)
  if (existing) Object.assign(existing, payload)
  window.showToast?.('✅ SEO guardado')
}

window.propCopyLink = (id, slug) => {
  const url = `${location.origin}/propiedad/${slug || id}`
  navigator.clipboard.writeText(url).then(() => window.showToast?.('🔗 Link copiado'))
}

window.propWhatsApp = (id) => {
  const p = _props.find(x => x.id === id)
  if (!p) return
  const tipo  = _tipoInfo(p.tipo)
  const link  = _propPublicUrl(p)
  const ops   = (p.operacion||[]).join(' / ')
  const precio = _precioLabel(p)
  const msg = encodeURIComponent(
    `🏠 *${tipo.label} en ${p.colonia || 'La Paz, BCS'}*\n` +
    (ops ? `💼 ${ops.toUpperCase()}\n` : '') +
    `💰 ${precio}\n` +
    (p.recamaras ? `🛏 ${p.recamaras} rec  ` : '') +
    (p.banos ? `🚿 ${p.banos} baños  ` : '') +
    (p.sup_construida ? `📐 ${_fmtM2(p.sup_construida)}` : '') +
    `\n\n📍 ${[p.calle,p.numero,p.colonia].filter(Boolean).join(', ')}\n` +
    `\n🔗 ${link}`
  )
  window.open('https://api.whatsapp.com/send?text=' + msg, '_blank')
}

// ─── Handlers modal de detalle ────────────────────────────────────────────────

window.propDetailTab = (tab, propId) => {
  ;['info', 'galeria', 'crm', 'leads', 'docs', 'seo'].forEach(p => {
    const panel = document.getElementById('dpanel-' + p)
    const btn   = document.getElementById('dtab-' + p)
    const active = p === tab
    if (panel) panel.style.display = active ? 'block' : 'none'
    if (btn) {
      btn.style.color        = active ? '#22d3ee' : '#7a8899'
      btn.style.borderBottom = active ? '2px solid #22d3ee' : '2px solid transparent'
    }
  })
  if (tab === 'leads') _loadLeadsPanel(propId)
}

async function _loadLeadsPanel(propId) {
  const el = document.getElementById('dpanel-leads')
  if (!el) return
  const { data, error } = await supabase
    .from('property_leads')
    .select('*')
    .eq('property_id', propId)
    .order('created_at', { ascending: false })
  if (error) {
    el.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:12px;">Error: ${_esc(error.message)}</div>`
    return
  }
  const leads = data || []
  if (!leads.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#64748b;font-size:13px;">
        <div style="font-size:48px;margin-bottom:12px;opacity:0.4;">📩</div>
        Aún no hay solicitudes de información para este inmueble.<br>
        <span style="font-size:11px;color:#475569;">Cuando alguien llene el formulario en la ficha pública, aparecerá aquí.</span>
      </div>`
    return
  }
  const STATUS_LABELS = {
    nuevo:'🆕 Nuevo', contactado:'✓ Contactado', negociacion:'💬 Negociación',
    cerrado:'🎉 Cerrado', descartado:'🗑 Descartado',
  }
  const STATUS_COLORS = {
    nuevo:'#22d3ee', contactado:'#a78bfa', negociacion:'#facc15',
    cerrado:'#4ade80', descartado:'#64748b',
  }
  el.innerHTML = `
    <div style="font-size:12px;color:#94a3b8;margin-bottom:14px;">${leads.length} solicitud${leads.length===1?'':'es'} de información</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${leads.map(l => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <div style="flex:1;min-width:160px;">
              <div style="font-size:14px;font-weight:700;color:#f1f5f9;">${_esc(l.nombre)}</div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">
                ${new Date(l.created_at).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' })}
              </div>
            </div>
            <select onchange="propLeadStatus('${l.id}','${propId}',this.value)"
              style="padding:5px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:${STATUS_COLORS[l.status]||'#94a3b8'};font-size:11px;font-weight:600;">
              ${Object.entries(STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${l.status===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:14px;font-size:12px;color:#cbd5e1;flex-wrap:wrap;margin-bottom:6px;">
            ${l.telefono ? `<a href="tel:${_esc(l.telefono)}" style="color:#4ade80;text-decoration:none;">📞 ${_esc(l.telefono)}</a>` : ''}
            ${l.telefono ? `<a href="https://wa.me/52${l.telefono.replace(/\\D/g,'')}" target="_blank" style="color:#22d3ee;text-decoration:none;">💬 WhatsApp</a>` : ''}
            ${l.email ? `<a href="mailto:${_esc(l.email)}" style="color:#a78bfa;text-decoration:none;">✉ ${_esc(l.email)}</a>` : ''}
          </div>
          ${l.mensaje ? `<div style="font-size:12px;color:#94a3b8;font-style:italic;background:rgba(255,255,255,0.02);border-left:2px solid rgba(34,211,238,0.4);padding:6px 10px;margin-top:6px;border-radius:4px;">${_esc(l.mensaje)}</div>` : ''}
        </div>`).join('')}
    </div>`
}

window.propLeadStatus = async (leadId, propId, newStatus) => {
  await supabase.from('property_leads').update({ status: newStatus }).eq('id', leadId)
  window.showToast?.('✓ Estado actualizado')
}

window.propSaveGalleryOrder = async (propId) => {
  const sortEl   = document.getElementById('gallery-sortable-' + propId)
  const existing = _props.find(p => p.id === propId)
  if (!sortEl || !existing) return
  const oldFotos = existing.fotos || []
  const reordered = [...sortEl.children].map((child, i) => {
    const url  = child.dataset.url
    const orig = oldFotos.find(f => (f.url || f.thumb_url) === url)
    return orig ? { ...orig, orden: i } : null
  }).filter(Boolean)
  if (reordered.length === 0) return
  const { error } = await supabase.from('properties').update({ fotos: reordered }).eq('id', propId)
  if (!error) {
    existing.fotos = reordered
    window.showToast?.('🔄 Orden guardado')
  }
}

window.propDeleteFoto = async (propId, index) => {
  const existing = _props.find(p => p.id === propId)
  if (!existing) return
  const fotos    = [...(existing.fotos || [])]
  // Identify by current DOM position (SortableJS may have reordered)
  const sortEl   = document.getElementById('gallery-sortable-' + propId)
  let   targetUrl = null
  if (sortEl) {
    const item = [...sortEl.children].find(el => Number(el.dataset.index) === index)
               || sortEl.children[index]
    targetUrl  = item?.dataset?.url
  }
  const newFotos = targetUrl
    ? fotos.filter(f => (f.url || f.thumb_url) !== targetUrl)
    : fotos.filter((_, i) => i !== index)

  const { error } = await supabase.from('properties').update({ fotos: newFotos }).eq('id', propId)
  if (error) { window.showToast?.('❌ Error al eliminar foto'); return }
  existing.fotos = newFotos
  window.showToast?.('🗑 Foto eliminada')

  // Re-render gallery in-place
  if (sortEl) {
    sortEl.innerHTML = newFotos.map((f, i) => `
      <div data-index="${i}" data-url="${_esc(f.url||f.thumb_url||'')}"
        style="position:relative;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);
        cursor:grab;aspect-ratio:4/3;background:rgba(14,20,34,0.8);">
        <img src="${_esc(f.thumb_url||f.url||'')}" style="width:100%;height:100%;object-fit:cover;pointer-events:none;"/>
        ${f.categoria ? `
          <div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;
          background:rgba(0,0,0,0.65);font-size:9px;color:#22d3ee;font-weight:700;text-transform:uppercase;">
            ${_esc(f.categoria)}
          </div>` : ''}
        <button onclick="propDeleteFoto('${propId}',${i})"
          style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
          background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:12px;line-height:1;">✕</button>
        ${i === 0 ? `<div style="position:absolute;top:4px;left:4px;background:rgba(34,211,238,0.85);
          color:#0d0f1f;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;">PORTADA</div>` : ''}
      </div>`).join('')
    new Sortable(sortEl, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: () => { window.propSaveGalleryOrder(propId) },
    })
  }
}

window.propSelectInterTipo = (tipo) => {
  document.querySelectorAll('[id^="inter-tipo-"]').forEach(btn => {
    btn.style.background  = 'rgba(255,255,255,0.05)'
    btn.style.borderColor = 'rgba(255,255,255,0.1)'
    btn.style.color       = '#7a8899'
  })
  const active = document.getElementById('inter-tipo-' + tipo)
  if (active) {
    active.style.background  = 'rgba(34,211,238,0.15)'
    active.style.borderColor = 'rgba(34,211,238,0.4)'
    active.style.color       = '#22d3ee'
  }
  const hidden = document.getElementById('inter-tipo-val')
  if (hidden) hidden.value = tipo
}

window.propLogInter = async (propId) => {
  const tipo    = document.getElementById('inter-tipo-val')?.value || 'nota'
  const descEl  = document.getElementById('inter-desc')
  const montoEl = document.getElementById('inter-monto')
  const desc    = descEl?.value?.trim()
  const monto   = montoEl?.value ? Number(montoEl.value) : null
  if (!desc) { window.showToast?.('⚠ Escribe una descripción'); return }

  const item = await logInteraction(propId, tipo, desc, monto)
  if (!item) return
  if (descEl)  descEl.value  = ''
  if (montoEl) montoEl.value = ''

  // Reemplazar solo la lista (no el formulario)
  const listEl = document.getElementById('inter-list-' + propId)
  if (listEl) {
    const tmp = document.createElement('div')
    tmp.innerHTML = _renderHistorial(propId)
    const newList = tmp.querySelector('#inter-list-' + propId)
    if (newList) listEl.replaceWith(newList)
  }
  window.showToast?.('✅ Interacción registrada')
}

window.propExportPDF = async (propId) => {
  const p = _props.find(x => x.id === propId)
  if (!p) return

  // Mostrar modal de agente — pre-llena desde localStorage
  const emisor = await _promptAgentModal()
  if (!emisor) return   // usuario canceló

  const btn = document.querySelector(`button[onclick*="propExportPDF('${propId}')"]`)
  if (btn) { btn.textContent = '⏳ Generando...'; btn.disabled = true }
  try {
    // Carga property_links y los inyecta al objeto del inmueble para que el PDF los use
    const links = await fetchLinksFor(p.id)
    await pdfFichaCaptacion({ ...p, _links: links }, emisor)
  } catch (err) {
    console.error('[inmuebles] propExportPDF:', err)
    window.showToast?.('❌ Error al generar PDF: ' + err.message)
  } finally {
    if (btn) { btn.textContent = '📄 PDF Ficha'; btn.disabled = false }
  }
}

/**
 * Modal de confirmación de agente antes de generar PDF.
 * Pre-llena desde localStorage. Guarda al aceptar.
 * Devuelve { nombre, tel, email } o null si el usuario cancela.
 */
function _promptAgentModal() {
  return new Promise(resolve => {
    const saved = {
      nombre: localStorage.getItem('nexus_agent_name')  || '',
      tel:    localStorage.getItem('nexus_agent_tel')   || '',
      email:  localStorage.getItem('nexus_agent_email') || '',
    }

    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:99999;',
      'display:flex;align-items:center;justify-content:center;',
      'background:rgba(15,23,42,0.55);backdrop-filter:blur(5px);',
    ].join('')

    overlay.innerHTML = `
      <div style="
        background:#fff;border-radius:16px;padding:28px 28px 24px;
        width:100%;max-width:360px;margin:16px;
        box-shadow:0 20px 60px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.06);
        font-family:system-ui,-apple-system,sans-serif;
      ">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
          <div style="width:36px;height:36px;border-radius:10px;background:#eff6ff;display:grid;place-items:center;flex-shrink:0;font-size:18px;">👤</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:#0f172a;line-height:1.2;">Datos del agente</div>
            <div style="font-size:11px;color:#64748b;">Aparecerán en el pie de la ficha PDF</div>
          </div>
        </div>

        <!-- Nombre -->
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;">
            Nombre completo <span style="color:#ef4444;">*</span>
          </label>
          <input id="_ag-nombre" type="text" value="${saved.nombre}"
            placeholder="Oscar Omar Gómez Peña"
            style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:8px;
                   font-size:13px;color:#0f172a;outline:none;box-sizing:border-box;
                   transition:border-color .15s;"
            onfocus="this.style.borderColor='#0ea5e9'"
            onblur="this.style.borderColor='#e2e8f0'" />
        </div>

        <!-- Teléfono -->
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;">Teléfono</label>
          <input id="_ag-tel" type="tel" value="${saved.tel}"
            placeholder="612 100 2000"
            style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:8px;
                   font-size:13px;color:#0f172a;outline:none;box-sizing:border-box;
                   transition:border-color .15s;"
            onfocus="this.style.borderColor='#0ea5e9'"
            onblur="this.style.borderColor='#e2e8f0'" />
        </div>

        <!-- Email -->
        <div style="margin-bottom:22px;">
          <label style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:4px;">Email</label>
          <input id="_ag-email" type="email" value="${saved.email}"
            placeholder="agente@mail.com"
            style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:8px;
                   font-size:13px;color:#0f172a;outline:none;box-sizing:border-box;
                   transition:border-color .15s;"
            onfocus="this.style.borderColor='#0ea5e9'"
            onblur="this.style.borderColor='#e2e8f0'" />
        </div>

        <!-- Nota guardar -->
        <div style="font-size:10px;color:#94a3b8;margin-bottom:16px;">
          💾 Se recordarán para la próxima ficha
        </div>

        <!-- Botones -->
        <div style="display:flex;gap:10px;">
          <button id="_ag-cancel"
            style="flex:1;padding:10px;border:1.5px solid #e2e8f0;border-radius:9px;
                   background:#f8fafc;color:#475569;font-size:13px;font-weight:600;
                   cursor:pointer;transition:background .15s;"
            onmouseover="this.style.background='#f1f5f9'"
            onmouseout="this.style.background='#f8fafc'">
            Cancelar
          </button>
          <button id="_ag-ok"
            style="flex:2;padding:10px;border:none;border-radius:9px;
                   background:#0ea5e9;color:#fff;font-size:13px;font-weight:700;
                   cursor:pointer;transition:background .15s;"
            onmouseover="this.style.background='#0284c7'"
            onmouseout="this.style.background='#0ea5e9'">
            Generar PDF
          </button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)

    const cleanup = () => document.body.removeChild(overlay)

    // Cancelar
    document.getElementById('_ag-cancel').onclick = () => { cleanup(); resolve(null) }
    overlay.onclick = e => { if (e.target === overlay) { cleanup(); resolve(null) } }

    // Aceptar
    document.getElementById('_ag-ok').onclick = () => {
      const nombre = document.getElementById('_ag-nombre').value.trim()
      const tel    = document.getElementById('_ag-tel').value.trim()
      const email  = document.getElementById('_ag-email').value.trim()

      if (!nombre) {
        const inp = document.getElementById('_ag-nombre')
        inp.style.borderColor = '#ef4444'
        inp.placeholder = 'El nombre es requerido'
        inp.focus()
        return
      }

      // Guardar en localStorage para reutilizar
      localStorage.setItem('nexus_agent_name',  nombre)
      localStorage.setItem('nexus_agent_tel',   tel)
      localStorage.setItem('nexus_agent_email', email)

      cleanup()
      resolve({ nombre, tel, email })
    }

    // Enter confirma
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { cleanup(); resolve(null) }
      if (e.key === 'Enter')  document.getElementById('_ag-ok')?.click()
    })

    setTimeout(() => document.getElementById('_ag-nombre')?.focus(), 60)
  })
}

// ─── Gallery navigation handlers ─────────────────────────────────────────────
window.propGalleryJump = (propId, idx) => {
  const fotos = window._nexusGallery?.[propId] || []
  if (!fotos[idx]) return
  const hero  = document.getElementById('hero-img-' + propId)
  const idxEl = document.getElementById('hero-idx-' + propId)
  if (hero) hero.src = fotos[idx].url || fotos[idx].thumb_url || ''
  if (idxEl) idxEl.textContent = idx + 1
  for (let i = 0; i < fotos.length; i++) {
    const th = document.getElementById(`thumb-${propId}-${i}`)
    if (th) { th.style.border = i===idx?'2px solid #22d3ee':'2px solid transparent'; th.style.opacity = i===idx?'1':'0.55' }
  }
  // update lightbox click target
  if (hero) hero.setAttribute('onclick', `propOpenLightbox('${propId}',${idx})`)
}

window.propGalleryNav = (propId, dir) => {
  const fotos = window._nexusGallery?.[propId] || []
  if (!fotos.length) return
  let cur = 0
  for (let i = 0; i < fotos.length; i++) {
    const th = document.getElementById(`thumb-${propId}-${i}`)
    if (th && th.style.border.includes('#22d3ee')) { cur = i; break }
  }
  window.propGalleryJump(propId, (cur + dir + fotos.length) % fotos.length)
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
window.propOpenLightbox = (propId, startIdx) => {
  const fotos = window._nexusGallery?.[propId]
    || (window._nexusProps||[]).find(p=>p.id===propId)?.fotos || []
  if (!fotos.length) return
  let cur = startIdx ?? 0

  document.getElementById('prop-lightbox')?.remove()
  const lb = document.createElement('div')
  lb.id = 'prop-lightbox'
  lb.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.96);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);'

  const render = () => {
    lb.innerHTML = `
      <button onclick="document.getElementById('prop-lightbox').remove()"
        style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);
        color:#fff;width:42px;height:42px;border-radius:50%;cursor:pointer;font-size:22px;line-height:1;">✕</button>
      ${fotos.length>1?`
        <button onclick="window._lbNav(-1)"
          style="position:absolute;left:16px;background:rgba(255,255,255,0.1);border:none;color:#fff;
          width:52px;height:52px;border-radius:50%;cursor:pointer;font-size:28px;line-height:1;">‹</button>` : ''}
      <img src="${_esc(fotos[cur].url||fotos[cur].thumb_url||'')}"
        style="max-width:92vw;max-height:88vh;object-fit:contain;border-radius:6px;user-select:none;"/>
      ${fotos.length>1?`
        <button onclick="window._lbNav(1)"
          style="position:absolute;right:16px;background:rgba(255,255,255,0.1);border:none;color:#fff;
          width:52px;height:52px;border-radius:50%;cursor:pointer;font-size:28px;line-height:1;">›</button>` : ''}
      <div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.65);
      color:#fff;font-size:13px;padding:5px 16px;border-radius:8px;">${cur+1} / ${fotos.length}</div>`
  }

  window._lbNav = (d) => { cur = (cur + d + fotos.length) % fotos.length; render() }
  lb.onclick = e => { if (e.target === lb) lb.remove() }

  document.body.appendChild(lb)
  render()

  const onKey = (e) => {
    if (!document.getElementById('prop-lightbox')) { document.removeEventListener('keydown', onKey); return }
    if (e.key === 'ArrowRight') window._lbNav(1)
    if (e.key === 'ArrowLeft')  window._lbNav(-1)
    if (e.key === 'Escape')     { lb.remove(); document.removeEventListener('keydown', onKey) }
  }
  document.addEventListener('keydown', onKey)
}

// ─── Agregar foto por URL (modal de edición) ──────────────────────────────────
window.propAddPhotoUrl = async (propId) => {
  const input = document.getElementById('prop-foto-url')
  const url   = input?.value?.trim()
  if (!url || !url.startsWith('http')) { window.showToast?.('⚠ Ingresa una URL válida (https://...)'); return }

  const preview = document.getElementById('prop-fotos-preview')
  if (preview) {
    preview.insertAdjacentHTML('beforeend', `
      <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid rgba(34,211,238,0.35);">
        <img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.opacity=0.25"/>
        <button onclick="propRemoveFotoByUrl('${url}')"
          style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;
          background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:10px;line-height:1;">✕</button>
      </div>`)
  }

  if (propId) {
    const existing = _props.find(p => p.id === propId)
    const fotos = [...(existing?.fotos||[]), { url, thumb_url: url, categoria: 'exterior', orden: (existing?.fotos||[]).length }]
    const { error } = await supabase.from('properties').update({ fotos }).eq('id', propId)
    if (!error && existing) existing.fotos = fotos
    if (error) { window.showToast?.('❌ Error al guardar: ' + error.message); return }
  }

  if (input) input.value = ''
  window.showToast?.('✅ Imagen agregada')
}

// ─── Agregar foto por URL desde panel de galería del detalle ─────────────────
window.propAddPhotoUrlFromDetail = async (propId) => {
  const input = document.getElementById('gallery-url-input-' + propId)
  const url   = input?.value?.trim()
  if (!url || !url.startsWith('http')) { window.showToast?.('⚠ Ingresa una URL válida'); return }

  const existing = _props.find(p => p.id === propId)
  if (!existing) { window.showToast?.('❌ Propiedad no encontrada'); return }

  const fotos = [...(existing.fotos||[]), { url, thumb_url: url, categoria: 'exterior', orden: (existing.fotos||[]).length }]
  const { error } = await supabase.from('properties').update({ fotos }).eq('id', propId)
  if (error) { window.showToast?.('❌ Error al guardar: ' + error.message); return }

  existing.fotos = fotos
  if (!window._nexusGallery) window._nexusGallery = {}
  window._nexusGallery[propId] = fotos

  if (input) input.value = ''

  // Añadir a la grid
  const sortEl = document.getElementById('gallery-sortable-' + propId)
  if (sortEl) {
    const i = fotos.length - 1
    const div = document.createElement('div')
    div.dataset.index = String(i); div.dataset.url = url
    div.style.cssText = 'position:relative;border-radius:10px;overflow:hidden;border:1px solid rgba(34,211,238,0.3);aspect-ratio:4/3;background:rgba(14,20,34,0.8);'
    div.innerHTML = `
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.opacity=0.25"/>
      <button onclick="propDeleteFoto('${propId}',${i})"
        style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
        background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:12px;line-height:1;">✕</button>`
    sortEl.appendChild(div)
  }

  // Actualizar hero si es la primera foto
  if (fotos.length === 1) {
    const hero = document.getElementById('hero-img-' + propId)
    if (hero) hero.src = url
  }

  window.showToast?.('✅ Imagen agregada')
}

// Exportar función de carga para app.js
export { loadProperties as _loadProperties }
