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

import { createClient } from '@supabase/supabase-js'
import Sortable from 'sortablejs'
import { pdfFichaCaptacion } from './pdf-inmuebles.js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL  || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)

// ─── Estado del módulo ────────────────────────────────────────────────────────
let _props       = []          // todas las propiedades del usuario
let _interactions= {}          // { [propId]: interaction[] }
let _propFilters = {
  tipo: '', operacion: '', status: '', colonia: '',
  precioMin: '', precioMax: '', search: '',
}
let _propView    = localStorage.getItem('nexus_prop_view') || 'grid'
let _propPage    = 1
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
    .order('created_at', { ascending: false })
  if (error) { console.error('[inmuebles] load:', error); _propLoading = false; return }
  _props = data || []
  _propFolioSeq = _props.length + 1
  _propLoading = false
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

  const filtered = _filtered()
  const totalPages = Math.ceil(filtered.length / _PAGE_SIZE)
  const paged = filtered.slice((_propPage - 1) * _PAGE_SIZE, _propPage * _PAGE_SIZE)

  container.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:0 0 40px;">

      <!-- ── Header ── -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
        <div>
          <h2 style="font-size:20px;font-weight:800;color:#e8f0f9;margin:0;letter-spacing:-0.02em;">🏠 Inmuebles</h2>
          <p style="font-size:12px;color:#7a8899;margin:4px 0 0;">${_props.length} propiedades · ${filtered.length} en vista</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <!-- Toggle vista -->
          <div style="display:flex;background:rgba(255,255,255,0.05);border-radius:8px;padding:2px;">
            <button onclick="propSetView('grid')"
              style="padding:5px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;
              background:${_propView==='grid'?'rgba(34,211,238,0.15)':'transparent'};
              color:${_propView==='grid'?'#22d3ee':'#7a8899'};">
              ⊞ Grid
            </button>
            <button onclick="propSetView('lista')"
              style="padding:5px 12px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600;
              background:${_propView==='lista'?'rgba(34,211,238,0.15)':'transparent'};
              color:${_propView==='lista'?'#22d3ee':'#7a8899'};">
              ☰ Lista
            </button>
          </div>
          <button onclick="openPropModal()"
            style="padding:8px 18px;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0d0f1f;
            font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:6px;">
            + Captar inmueble
          </button>
        </div>
      </div>

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

  return `
    <div style="background:rgba(14,20,34,0.95);border:1px solid rgba(255,255,255,0.07);border-radius:14px;
    overflow:hidden;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;position:relative;"
    onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 32px rgba(0,0,0,0.4)'"
    onmouseleave="this.style.transform='';this.style.boxShadow=''"
    onclick="openPropDetail('${p.id}')">

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

      <form id="prop-form" onsubmit="return false" style="padding:24px;">

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
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
            ${_field('prop-colonia','Colonia','text',val('colonia'),'Col. Centro')}
            ${_field('prop-municipio','Municipio','text',val('municipio','La Paz'),'La Paz')}
            ${_field('prop-cp','C.P.','text',val('cp'),'23000')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
            ${_field('prop-estado-rep','Estado','text',val('estado_rep','BCS'),'BCS')}
            ${_field('prop-referencias','Referencias','text',val('referencias'),'Frente al parque, portón azul')}
          </div>
        </div>

        <!-- ── Sección: Precios ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Precios
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
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
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#94a3b8;">
            <input type="checkbox" id="prop-negociable" ${valB('precio_negociable')?'checked':''}
              style="accent-color:#22d3ee;width:15px;height:15px;"/>
            Precio negociable
          </label>
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
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Servicios básicos
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
            ${[['agua','💧 Agua'],['luz','⚡ Luz'],['drenaje','🚿 Drenaje'],['gas','🔥 Gas'],['internet','📶 Internet']].map(([k,l])=>`
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:#94a3b8;">
                <input type="checkbox" id="prop-${k}" ${valB(k)?'checked':''}
                  style="accent-color:#22d3ee;width:15px;height:15px;"/>
                ${l}
              </label>`).join('')}
          </div>
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Amenidades
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;">
            ${[['alberca','🏊 Alberca'],['jardin','🌿 Jardín'],['roof_garden','🌇 Roof garden'],
               ['bodega_ext','📦 Bodega'],['cuarto_servicio','🧹 Cuarto servicio'],['vigilancia','🔒 Vigilancia']].map(([k,l])=>`
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:#94a3b8;">
                <input type="checkbox" id="prop-${k.replace('_','-')}" ${valB(k)?'checked':''}
                  style="accent-color:#22d3ee;width:15px;height:15px;"/>
                ${l}
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

        <!-- ── Sección: Archivos ── -->
        <div style="margin-bottom:22px;">
          <div style="font-size:11px;font-weight:700;color:#22d3ee;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
            Archivos y fotos
          </div>
          <!-- Subida de fotos -->
          <div style="border:2px dashed rgba(34,211,238,0.2);border-radius:10px;padding:16px;text-align:center;margin-bottom:12px;cursor:pointer;"
            onclick="document.getElementById('prop-foto-input').click()"
            ondragover="event.preventDefault()" ondrop="propHandleDrop(event)">
            <input type="file" id="prop-foto-input" multiple accept="image/*" style="display:none;"
              onchange="propHandleFiles(this.files,'${prop?.id||''}')"/>
            <div style="font-size:28px;margin-bottom:6px;opacity:0.5;">📷</div>
            <div style="font-size:13px;color:#7a8899;">Arrastra fotos aquí o haz clic para seleccionar</div>
            <div style="font-size:11px;color:#4b5563;margin-top:4px;">JPEG, PNG, WEBP · máx 5MB por imagen</div>
          </div>
          <!-- Fotos existentes -->
          <div id="prop-fotos-preview" style="display:flex;flex-wrap:wrap;gap:8px;">
            ${(prop?.fotos||[]).map((f,i)=>`
              <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
                <img src="${_esc(f.thumb_url||f.url)}" style="width:100%;height:100%;object-fit:cover;"/>
                <button onclick="propRemoveFoto(${i})"
                  style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;
                  background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:10px;line-height:1;">✕</button>
              </div>`).join('')}
          </div>
          <!-- Link Google Drive -->
          ${_field('prop-drive','Carpeta Google Drive (link)','url',val('drive_folder_url'),'https://drive.google.com/drive/folders/...')}
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

// ─── Modal de detalle ─────────────────────────────────────────────────────────
export async function openPropDetail(id) {
  const p = _props.find(x => x.id === id)
  if (!p) return

  const st    = _statusInfo(p.status)
  const tipo  = _tipoInfo(p.tipo)
  const fotos = p.fotos || []

  // Carga historial en paralelo
  loadInteractions(id).then(() => {
    const el = document.getElementById(`inter-list-${id}`)
    if (el) el.outerHTML = _renderHistorial(id).match(/id="inter-list-[^"]+">[\s\S]*?<\/div>/)?.[0] || ''
  })

  const specs = [
    p.recamaras        ? { icon:'🛏', label:'Recámaras',   val: p.recamaras }              : null,
    p.banos            ? { icon:'🚿', label:'Baños',        val: p.banos }                  : null,
    p.medios_banos     ? { icon:'🚽', label:'Medios baños', val: p.medios_banos }            : null,
    p.estacionamientos ? { icon:'🚗', label:'Estacionam.',  val: p.estacionamientos }        : null,
    p.pisos            ? { icon:'🏗', label:'Pisos',         val: p.pisos }                  : null,
    p.sup_construida   ? { icon:'📐', label:'Construida',   val: _fmtM2(p.sup_construida) }  : null,
    p.sup_terreno      ? { icon:'🌿', label:'Terreno',      val: _fmtM2(p.sup_terreno) }     : null,
    p.frente           ? { icon:'↔', label:'Frente',        val: p.frente + ' m' }           : null,
    p.fondo            ? { icon:'↕', label:'Fondo',         val: p.fondo + ' m' }            : null,
    p.antiguedad_anios ? { icon:'📅', label:'Antigüedad',   val: p.antiguedad_anios + ' años'}: null,
  ].filter(Boolean)

  const servicios  = ['agua','luz','drenaje','gas','internet'].filter(k => p[k])
  const amenidades = ['alberca','jardin','roof_garden','bodega_ext','cuarto_servicio','vigilancia'].filter(k => p[k])
  const SERV_ICONS  = { agua:'💧',luz:'⚡',drenaje:'🚿',gas:'🔥',internet:'📶' }
  const SERV_LABELS = { agua:'Agua',luz:'Luz',drenaje:'Drenaje',gas:'Gas',internet:'Internet' }
  const AMEN_ICONS  = { alberca:'🏊',jardin:'🌿',roof_garden:'🌇',bodega_ext:'📦',cuarto_servicio:'🧹',vigilancia:'🔒' }
  const AMEN_LABELS = { alberca:'Alberca',jardin:'Jardín',roof_garden:'Roof garden',bodega_ext:'Bodega',cuarto_servicio:'C. servicio',vigilancia:'Vigilancia' }

  // Tab activa
  let _detailTab = 'info'

  const overlay = document.createElement('div')
  overlay.id = 'prop-detail-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);'
  overlay.onclick = e => { if (e.target === overlay) overlay.remove() }

  overlay.innerHTML = `
    <div style="background:#0e1422;border:1px solid rgba(34,211,238,0.2);border-radius:16px;
    width:100%;max-width:860px;max-height:93vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.6);">

      <!-- ── Header sticky ── -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;
      border-bottom:1px solid rgba(255,255,255,0.07);position:sticky;top:0;background:#0e1422;z-index:2;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-size:10px;color:#7a8899;margin-bottom:2px;">
            ${_esc(p.folio_interno||'')} · ${tipo.icon} ${tipo.label}
            <span style="color:${st.color};font-weight:700;"> · ${st.label}</span>
          </div>
          <h3 style="margin:0;font-size:15px;font-weight:800;color:#e8f0f9;line-height:1.2;">
            ${_esc(p.titulo || tipo.label + ' en ' + (p.colonia || ''))}
          </h3>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <button onclick="propExportPDF('${p.id}')"
            style="padding:6px 13px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);
            color:#a78bfa;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">📄 PDF Ficha</button>
          <button onclick="propWhatsApp('${p.id}')"
            style="padding:6px 13px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.3);
            color:#4ade80;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">📲 WhatsApp</button>
          <button onclick="propCopyLink('${p.id}','${_esc(p.slug||p.id)}')"
            style="padding:6px 13px;background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.25);
            color:#22d3ee;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">🔗 Link</button>
          <button onclick="openPropModal('${p.id}')"
            style="padding:6px 13px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            color:#94a3b8;border-radius:8px;cursor:pointer;font-size:12px;">✏️ Editar</button>
          <button onclick="document.getElementById('prop-detail-overlay').remove()"
            style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            color:#94a3b8;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;">✕</button>
        </div>
      </div>

      <!-- ── Tabs ── -->
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.07);padding:0 20px;">
        ${[['info','Ficha'],['galeria','Galería ('+fotos.length+')'],['crm','Historial']].map(([tab,label])=>`
          <button onclick="propDetailTab('${tab}','${p.id}')" id="dtab-${tab}"
            style="padding:10px 16px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;
            color:${tab==='info'?'#22d3ee':'#7a8899'};border-bottom:2px solid ${tab==='info'?'#22d3ee':'transparent'};
            transition:all 0.15s;">${label}</button>`).join('')}
      </div>

      <div style="padding:20px;">

        <!-- ══ TAB: INFO ══ -->
        <div id="dpanel-info">

          <!-- Galería preview -->
          ${fotos.length ? `
            <div id="detail-gallery" style="display:grid;grid-template-columns:${fotos.length>1?'2fr 1fr':'1fr'};gap:5px;margin-bottom:18px;border-radius:10px;overflow:hidden;max-height:280px;">
              <img id="detail-main-img" src="${_esc(fotos[0].url||fotos[0].thumb_url||'')}"
                style="width:100%;height:100%;max-height:280px;object-fit:cover;cursor:zoom-in;"
                onclick="propDetailTab('galeria','${p.id}')"/>
              ${fotos.length > 1 ? `
                <div style="display:grid;grid-template-rows:repeat(${Math.min(fotos.length-1,3)},1fr);gap:5px;">
                  ${fotos.slice(1,4).map((f,i)=>`
                    <div style="position:relative;overflow:hidden;">
                      <img src="${_esc(f.thumb_url||f.url||'')}"
                        style="width:100%;height:${Math.floor(280/Math.min(fotos.length-1,3))}px;object-fit:cover;cursor:zoom-in;"
                        onclick="propDetailTab('galeria','${p.id}')"/>
                      ${i === 2 && fotos.length > 4 ? `
                        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;cursor:pointer;"
                          onclick="propDetailTab('galeria','${p.id}')">
                          <span style="font-size:16px;font-weight:800;color:#fff;">+${fotos.length-4} fotos</span>
                        </div>` : ''}
                    </div>`).join('')}
                </div>` : ''}
            </div>` : ''}

          <!-- Precio + ops -->
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
            <div>
              <div style="font-size:24px;font-weight:900;color:#22d3ee;">${_esc(_precioLabel(p))}</div>
              ${p.precio_negociable ? `<div style="font-size:12px;color:#4ade80;margin-top:2px;">Precio negociable</div>` : ''}
              <div style="font-size:13px;color:#7a8899;margin-top:6px;">
                📍 ${_esc([p.calle,p.numero].filter(Boolean).join(' '))}
                <br>${_esc([p.colonia,p.municipio,p.estado_rep].filter(Boolean).join(', '))}
                ${p.referencias ? `<br><span style="color:#4b5563;">${_esc(p.referencias)}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
              ${(p.operacion||[]).map(op=>`
                <span style="padding:5px 14px;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.3);
                color:#22d3ee;border-radius:8px;font-size:12px;font-weight:700;text-transform:uppercase;">${op}</span>`).join('')}
              ${p.lat && p.lng ? `
                <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener"
                  style="font-size:11px;color:#60a5fa;text-decoration:none;">🗺 Ver en Google Maps</a>` : ''}
            </div>
          </div>

          <!-- Specs -->
          ${specs.length ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-bottom:16px;">
              ${specs.map(s=>`
                <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
                border-radius:8px;padding:10px;text-align:center;">
                  <div style="font-size:18px;margin-bottom:3px;">${s.icon}</div>
                  <div style="font-size:10px;color:#7a8899;">${s.label}</div>
                  <div style="font-size:13px;font-weight:700;color:#e8f0f9;">${_esc(String(s.val))}</div>
                </div>`).join('')}
            </div>` : ''}

          <!-- Servicios + Amenidades -->
          ${servicios.length || amenidades.length ? `
            <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px;">
              ${servicios.map(k=>`<span style="font-size:12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);color:#4ade80;padding:4px 10px;border-radius:6px;">${SERV_ICONS[k]} ${SERV_LABELS[k]}</span>`).join('')}
              ${amenidades.map(k=>`<span style="font-size:12px;background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.2);color:#22d3ee;padding:4px 10px;border-radius:6px;">${AMEN_ICONS[k]} ${AMEN_LABELS[k]}</span>`).join('')}
            </div>` : ''}

          <!-- Descripción -->
          ${p.descripcion ? `
            <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:16px;">
              <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Descripción</div>
              <p style="font-size:13px;color:#94a3b8;line-height:1.7;margin:0;white-space:pre-wrap;">${_esc(p.descripcion)}</p>
            </div>` : ''}

          <!-- Dueño + Drive -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;">
              <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;margin-bottom:7px;">Dueño</div>
              <div style="font-size:13px;color:#e8f0f9;font-weight:600;">${_esc(p.dueno_nombre||'—')}</div>
              ${p.dueno_telefono ? `
                <a href="tel:${_esc(p.dueno_telefono)}" style="font-size:12px;color:#4ade80;display:block;margin-top:4px;text-decoration:none;">
                  📞 ${_esc(p.dueno_telefono)}</a>` : ''}
              ${p.dueno_email ? `
                <a href="mailto:${_esc(p.dueno_email)}" style="font-size:12px;color:#60a5fa;display:block;margin-top:2px;text-decoration:none;">
                  ✉ ${_esc(p.dueno_email)}</a>` : ''}
            </div>
            <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;">
              <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;margin-bottom:7px;">Archivos</div>
              ${p.drive_folder_url
                ? `<a href="${_esc(p.drive_folder_url)}" target="_blank" rel="noopener"
                    style="font-size:13px;color:#60a5fa;text-decoration:none;display:flex;align-items:center;gap:5px;">
                    📁 Carpeta Google Drive
                  </a>`
                : `<span style="font-size:12px;color:#4b5563;">Sin carpeta vinculada</span>`}
              <div style="margin-top:8px;font-size:11px;color:#4b5563;">${fotos.length} foto${fotos.length!==1?'s':''} en Nexus</div>
            </div>
          </div>

          <!-- Exclusiva -->
          ${p.exclusiva && p.exclusiva_fin ? (() => {
            const diff = (new Date(p.exclusiva_fin) - new Date()) / (1000 * 60 * 60 * 24)
            const alertColor = diff < 0 ? '#f87171' : diff <= 7 ? '#fb923c' : '#22d3ee'
            return `
              <div style="background:${alertColor}10;border:1px solid ${alertColor}30;border-radius:10px;padding:12px;">
                <div style="font-size:11px;color:${alertColor};font-weight:700;text-transform:uppercase;margin-bottom:6px;">
                  ${diff < 0 ? '⚠ Exclusiva vencida' : diff <= 7 ? `⚠ Exclusiva vence en ${Math.ceil(diff)} días` : 'Exclusiva activa'}
                </div>
                <div style="font-size:13px;color:#94a3b8;">
                  ${_esc(p.exclusiva_inicio||'')} → ${_esc(p.exclusiva_fin)}
                  &nbsp;·&nbsp; Comisión: <strong style="color:${alertColor};">${p.comision_pct||5}%</strong>
                </div>
              </div>` })() : ''}
        </div>

        <!-- ══ TAB: GALERÍA ══ -->
        <div id="dpanel-galeria" style="display:none;">
          <div style="font-size:12px;color:#7a8899;margin-bottom:12px;">
            Arrastra para reordenar · Las fotos se guardan automáticamente
          </div>
          <div id="gallery-sortable-${p.id}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">
            ${fotos.map((f,i)=>`
              <div data-index="${i}" data-url="${_esc(f.url||f.thumb_url||'')}"
                style="position:relative;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);
                cursor:grab;aspect-ratio:4/3;background:rgba(14,20,34,0.8);">
                <img src="${_esc(f.thumb_url||f.url||'')}" style="width:100%;height:100%;object-fit:cover;pointer-events:none;"/>
                ${f.categoria ? `
                  <div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;
                  background:rgba(0,0,0,0.65);font-size:9px;color:#22d3ee;font-weight:700;text-transform:uppercase;">
                    ${_esc(f.categoria)}
                  </div>` : ''}
                <button onclick="propDeleteFoto('${p.id}',${i})"
                  style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
                  background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:12px;line-height:1;">✕</button>
                ${i===0 ? `<div style="position:absolute;top:4px;left:4px;background:rgba(34,211,238,0.85);
                  color:#0d0f1f;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;">PORTADA</div>` : ''}
              </div>`).join('')}
          </div>
          ${fotos.length === 0 ? `
            <div style="text-align:center;padding:40px 20px;color:#4b5563;">
              Sin fotos. Edita la propiedad para agregar imágenes.
            </div>` : ''}

          <!-- Subir más fotos desde este panel -->
          <div style="margin-top:16px;border:2px dashed rgba(34,211,238,0.2);border-radius:10px;padding:14px;text-align:center;cursor:pointer;"
            onclick="document.getElementById('gallery-upload-${p.id}').click()">
            <input type="file" id="gallery-upload-${p.id}" multiple accept="image/*" style="display:none;"
              onchange="propHandleFiles(this.files,'${p.id}')"/>
            <div style="font-size:12px;color:#7a8899;">+ Agregar más fotos</div>
          </div>
        </div>

        <!-- ══ TAB: HISTORIAL CRM ══ -->
        <div id="dpanel-crm" style="display:none;">
          ${_renderHistorial(p.id)}
        </div>

      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // Inicializar drag-drop galería (SortableJS)
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
    internet:          gb('prop-internet'),

    alberca:           gb('prop-alberca'),
    jardin:            gb('prop-jardin'),
    roof_garden:       gb('prop-roof-garden'),
    bodega_ext:        gb('prop-bodega-ext'),
    cuarto_servicio:   gb('prop-cuarto-servicio'),
    vigilancia:        gb('prop-vigilancia'),

    descripcion:       g('prop-descripcion')?.value?.trim() || null,
    notas_internas:    g('prop-notas')?.value?.trim()       || null,
    drive_folder_url:  gv('prop-drive'),

    exclusiva:         gb('prop-exclusiva'),
    exclusiva_inicio:  gv('prop-excl-inicio'),
    exclusiva_fin:     gv('prop-excl-fin'),
    comision_pct:      gv('prop-comision') ? Number(gv('prop-comision')) : 5,

    dueno_nombre:      gv('prop-dueno-nombre'),
    dueno_telefono:    gv('prop-dueno-tel'),
    dueno_email:       gv('prop-dueno-email'),
  }

  // Generar slug si es nuevo
  if (!id) {
    payload.slug = _buildSlug(payload) + '-' + Date.now().toString(36).slice(-4)
    if (!payload.folio_interno) payload.folio_interno = _buildFolio(_propFolioSeq)
  }

  const btn = document.querySelector('#prop-form button[onclick*="saveProp"]')
  if (btn) { btn.textContent = '⏳ Guardando...'; btn.disabled = true }

  let error
  if (id) {
    ;({ error } = await supabase.from('properties').update(payload).eq('id', id))
  } else {
    ;({ error } = await supabase.from('properties').insert({ ...payload, user_id: (await supabase.auth.getUser()).data.user?.id }))
  }

  if (error) {
    console.error('[inmuebles] save:', error)
    if (btn) { btn.textContent = '❌ Error — reintentar'; btn.disabled = false }
    if (typeof window.showToast === 'function') window.showToast('❌ Error al guardar: ' + error.message)
    return
  }

  closePropModal()
  await loadProperties()
  renderInmuebles()
  if (typeof window.showToast === 'function')
    window.showToast(id ? '✅ Propiedad actualizada' : '✅ Propiedad captada')
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

  for (const file of Array.from(files)) {
    if (file.size > 8 * 1024 * 1024) { window.showToast?.('⚠ ' + file.name + ' es muy grande (máx 8MB)'); continue }

    // Skeleton mientras sube
    const skId = 'sk-' + Date.now()
    if (preview) preview.innerHTML += `
      <div id="${skId}" style="width:80px;height:80px;border-radius:8px;background:rgba(34,211,238,0.08);
      border:1px dashed rgba(34,211,238,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;color:#22d3ee;">⏳</div>`

    const compressed = await _compressImage(file)
    const ext   = 'jpg'
    const cat   = _categorizarFoto(file.name)
    const path  = `properties/${propId || 'draft-' + user.id}/${cat}-${Date.now()}.${ext}`

    const { data, error } = await supabase.storage.from('nexus-media').upload(path, compressed, { upsert: false })
    document.getElementById(skId)?.remove()

    if (error) { window.showToast?.('❌ Error subiendo ' + file.name); continue }

    const { data: urlData } = supabase.storage.from('nexus-media').getPublicUrl(path)
    const url = urlData.publicUrl

    // Agregar a la vista previa
    if (preview) {
      const idx = preview.children.length
      preview.innerHTML += `
        <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid rgba(34,211,238,0.3);">
          <img src="${url}" style="width:100%;height:100%;object-fit:cover;"/>
          <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);font-size:8px;color:#22d3ee;text-align:center;padding:2px;">${cat}</div>
          <button onclick="propRemoveFotoByUrl('${url}')"
            style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;
            background:rgba(0,0,0,0.7);border:none;color:#f87171;cursor:pointer;font-size:10px;line-height:1;">✕</button>
        </div>`
    }

    // Si la propiedad ya existe, guardar en DB inmediatamente
    if (propId) {
      const existing = _props.find(p => p.id === propId)
      const fotos = [...(existing?.fotos || []), { url, storage_path: path, categoria: cat, orden: (existing?.fotos||[]).length }]
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
window.propHandleFiles  = (files, id) => propHandleFiles(files, id)
window.propHandleDrop   = (e)  => propHandleDrop(e)

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

window.propRemoveFotoByUrl = (url) => {
  const all = document.querySelectorAll('#prop-fotos-preview > div')
  all.forEach(el => { if (el.querySelector('img')?.src === url) el.remove() })
}

window.propCopyLink = (id, slug) => {
  const url = `${location.origin}/propiedad.html?id=${id}`
  navigator.clipboard.writeText(url).then(() => window.showToast?.('🔗 Link copiado'))
}

window.propWhatsApp = (id) => {
  const p = _props.find(x => x.id === id)
  if (!p) return
  const tipo  = _tipoInfo(p.tipo)
  const link  = `${location.origin}/propiedad.html?id=${id}`
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
  ;['info', 'galeria', 'crm'].forEach(p => {
    const panel = document.getElementById('dpanel-' + p)
    const btn   = document.getElementById('dtab-' + p)
    const active = p === tab
    if (panel) panel.style.display = active ? 'block' : 'none'
    if (btn) {
      btn.style.color        = active ? '#22d3ee' : '#7a8899'
      btn.style.borderBottom = active ? '2px solid #22d3ee' : '2px solid transparent'
    }
  })
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
  const btn = document.querySelector(`button[onclick*="propExportPDF('${propId}')"]`)
  if (btn) { btn.textContent = '⏳ Generando...'; btn.disabled = true }
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const emisor = {
      nombre:  localStorage.getItem('nexus_agent_name')   || user?.user_metadata?.full_name || 'Agente',
      tel:     localStorage.getItem('nexus_agent_tel')    || '',
      email:   localStorage.getItem('nexus_agent_email')  || user?.email || '',
      agencia: localStorage.getItem('nexus_agent_agency') || 'Nexus OS Inmobiliario',
    }
    await pdfFichaCaptacion(p, emisor)
  } catch (err) {
    console.error('[inmuebles] propExportPDF:', err)
    window.showToast?.('❌ Error al generar PDF: ' + err.message)
  } finally {
    if (btn) { btn.textContent = '📄 PDF Ficha'; btn.disabled = false }
  }
}

// Exportar función de carga para app.js
export { loadProperties as _loadProperties }
