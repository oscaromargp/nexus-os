import { createClient } from '@supabase/supabase-js'
import Fuse from 'fuse.js'

// ── Modular imports — Nexus OS v6 ─────────────────────────────────────────────
import { parseNode as _parseNodeV2, extractDate, extractPriority } from './src/parser.js'
import { getTransactions, calcBalance, buildRunningBalance, currentPeriod } from './src/finance-engine.js'
import Sortable from 'sortablejs'

// ─────────────────────────────────────────
// Clientes y Estado
// ─────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL  || 'https://t.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'a'
)

let currentUser   = null
let allNodes      = []
let activeView    = 'feed'
let calDate       = new Date()
let editingCardId = null
let userPrefs     = { tempUnit: 'C' }
let currentFilter = null
let activeTypeFilter = null   // null = todos los tipos
let feedGrouped = false       // agrupar por tipo en el feed
let activeAccount = 'all'
let editingNoteId = null
let editingAccountId = null
let calView = 'month'
let selectedEventColor = '#00f0ff'
let calDragNodeId = null
let editingEventId = null
let pendingTransformType = null
let editingFinanceId = null
let currentContactId = null
let activeContactFilter = 'all'
let currentCSheetTab = 'perfil'

// Kanban board state — must be before the boot IIFE
let boardLists = [
  { id: 'todo', title: 'Pendiente' },
  { id: 'in_progress', title: 'En Curso' },
  { id: 'done', title: 'Finalizado' }
]

// Note color map — must be before the boot IIFE
const NOTE_COLORS = {
  '': '',
  'red':    'background:#3b1a1a; border-color:#7f1d1d;',
  'orange': 'background:#3b2a12; border-color:#7c3a07;',
  'yellow': 'background:#3a3212; border-color:#78650a;',
  'green':  'background:#1a3322; border-color:#14532d;',
  'teal':   'background:#112e2e; border-color:#134e4a;',
  'blue':   'background:#122040; border-color:#1e3a8a;',
  'purple': 'background:#261a40; border-color:#4c1d95;',
  'pink':   'background:#3a1a2e; border-color:#831843;',
}

// Category icon map — used in project financial dashboard
const CATEGORY_ICONS = {
  'carpintería': '🪚', 'carpinteria': '🪚',
  'albañilería': '🧱', 'albanileria': '🧱', 'albañileria': '🧱',
  'electricidad': '⚡', 'eléctrica': '⚡', 'electrica': '⚡', 'instalación eléctrica': '⚡',
  'plomería': '🔧', 'plomeria': '🔧',
  'herrería': '⛏️', 'herreria': '⛏️',
  'pintura': '🎨',
  'impermeabilización': '💧', 'impermeabilizacion': '💧',
  'cancelería': '🪟', 'canceleria': '🪟',
  'jardinería': '🌿', 'jardineria': '🌿',
  'limpieza': '🧹',
  'diseño': '✏️', 'diseno': '✏️',
  'materiales': '📦',
  'transporte': '🚚',
  'servicios': '⚙️',
  'mano de obra': '👷',
  'acabados': '✨',
  'construcción': '🏗️', 'construccion': '🏗️',
  'seguridad': '🔒',
  'otros': '📋',
}

function getCategoryIcon(cat) {
  if (!cat) return '📋'
  const k = cat.toLowerCase().trim()
  return CATEGORY_ICONS[k] || '📋'
}

// Feed color config — must be before boot IIFE
const TYPE_CONFIG = {
  kanban:     { label: '#TAREA',      color: '#a78bfa', border: 'rgba(139,92,246,0.4)',  bg: 'rgba(139,92,246,0.06)' },
  note:       { label: '#NOTA',       color: '#60a5fa', border: 'rgba(96,165,250,0.4)',  bg: 'rgba(96,165,250,0.06)' },
  income:     { label: '#INGRESO',    color: '#4ade80', border: 'rgba(74,222,128,0.4)',  bg: 'rgba(74,222,128,0.06)' },
  expense:    { label: '#GASTO',      color: '#f87171', border: 'rgba(248,113,113,0.4)', bg: 'rgba(248,113,113,0.06)' },
  persona:    { label: '#PERSONA',    color: '#fdba74', border: 'rgba(251,146,60,0.4)',  bg: 'rgba(251,146,60,0.06)' },
  proyecto:   { label: '#PROYECTO',   color: '#2dd4bf', border: 'rgba(45,212,191,0.4)',  bg: 'rgba(45,212,191,0.06)' },
  account:    { label: '#CUENTA',     color: '#94a3b8', border: 'rgba(148,163,184,0.4)', bg: 'rgba(148,163,184,0.06)' },
  cotizacion: { label: '#COTIZACIÓN', color: '#fb923c', border: 'rgba(251,146,60,0.4)',  bg: 'rgba(251,146,60,0.06)' },
}

// Odoo account.move.payment_state — extendido para cotizaciones
const COT_STATUS = {
  pendiente:   { label:'⏳ Pendiente',    color:'#fb923c', next:'aceptada'   },
  aceptada:    { label:'✅ Aceptada',     color:'#4ade80', next:'en_proceso' },
  en_proceso:  { label:'🔄 En proceso',   color:'#60a5fa', next:'parcial'    },
  parcial:     { label:'🔶 Pago parcial', color:'#fbbf24', next:'pagada'     },
  pagada:      { label:'💰 Pagada',       color:'#a78bfa', next:null         },
  rechazada:   { label:'❌ Rechazada',    color:'#f87171', next:null         },
}
const ROL_LABEL = { dueño:'👑 Dueño', ejecutor:'⚙️ Ejecutor', colaborador:'🤝 Colaborador' }

// ── Roles de miembros de proyecto ───────────────────────────────────────────
const MIEMBRO_ROLES = [
  { id:'financiador',    label:'💰 Financiador',   desc:'Aporta el capital' },
  { id:'administrador',  label:'🗂️ Administrador',  desc:'Coordina y supervisa' },
  { id:'ejecutor',       label:'🔧 Ejecutor',       desc:'Realiza el trabajo' },
  { id:'supervisor',     label:'👁️ Supervisor',     desc:'Revisa y aprueba' },
  { id:'colaborador',    label:'🤝 Colaborador',    desc:'Apoyo y participación' },
]

// ── Categorías de trabajo (estandarizadas) ──────────────────────────────────
const CATEGORIAS_TRABAJO = [
  { grupo:'🏠 Hogar & Propiedad', items:[
    'Eléctrico','Plomería','Gas','Agua / Pipas','Internet / Telecom',
    'Teléfono','Limpieza','Jardinería','Alberca / Piscina',
    'Seguridad / Vigilancia','Control de plagas','Fumigación',
  ]},
  { grupo:'🏗️ Construcción & Remodelación', items:[
    'Albañilería','Civil / Estructura','Herrería','Carpintería',
    'Pintura','Impermeabilización','Acabados / Pisos',
    'Vidriería / Aluminio','Demolición','Excavación',
  ]},
  { grupo:'🚗 Vehículos', items:[
    'Lavado / Detailing','Mantenimiento mecánico','Gasolina / Combustible',
    'Llantas / Vulcanizadora','Seguro vehículo','Grúa / Auxilio vial',
  ]},
  { grupo:'💼 Servicios Profesionales', items:[
    'Administración','Legal / Notaría','Contabilidad / Fiscal',
    'Diseño gráfico','Diseño arquitectónico','Fotografía / Video',
    'Marketing / Publicidad','Consultoría','Ingeniería',
  ]},
  { grupo:'📦 Logística & Suministros', items:[
    'Transporte / Flete','Materiales / Ferretería',
    'Renta de equipo / Maquinaria','Bodegaje / Almacén',
  ]},
  { grupo:'🎉 Eventos & Entretenimiento', items:[
    'Catering / Chef','Música / DJ / Entretenimiento',
    'Decoración','Renta de mobiliario','Fotografía de evento',
    'Coordinación de evento',
  ]},
  { grupo:'🌿 Naturaleza & Exterior', items:[
    'Poda / Tala','Paisajismo','Riego / Aspersores',
    'Tratamiento de suelo',
  ]},
  { grupo:'📋 General', items:[
    'Overhead / Administrativo','Imprevistos','Otro',
  ]},
]

// ── Variables de módulo que el boot IIFE necesita — deben estar antes del IIFE ──
let fxIntervalId = null   // usado por initFxWidget() llamado desde boot

// ── TYPE_FILTERS — aquí para evitar TDZ con boot IIFE síncrono ──────────────
// TYPE_FILTERS — pills para el panel de comandos
const TYPE_FILTERS = [
  { type:'income',     label:'💰 Ingresos',    color:'#4ade80' },
  { type:'expense',    label:'💸 Gastos',      color:'#f87171' },
  { type:'kanban',     label:'📌 Tareas',      color:'#a78bfa' },
  { type:'note',       label:'🧠 Notas',       color:'#60a5fa' },
  { type:'contact',    label:'👥 Contactos',   color:'#34d399' },
  { type:'cotizacion', label:'📄 Cotizaciones',color:'#fb923c' },
  { type:'event',      label:'📅 Eventos',     color:'#fb923c' },
  { type:'account',    label:'🏦 Cuentas',     color:'#facc15' },
  { type:'loan',       label:'💳 Préstamos',   color:'#c084fc' },
]

// TYPE_LABELS — íconos y etiquetas por tipo de nodo
const TYPE_LABELS = {
  income:     { icon:'💰', label:'Ingreso',     color:'#4ade80' },
  expense:    { icon:'💸', label:'Gasto',       color:'#f87171' },
  kanban:     { icon:'📌', label:'Tarea',       color:'#a78bfa' },
  note:       { icon:'💡', label:'Nota',        color:'#94a3b8' },
  persona:    { icon:'👤', label:'Contacto',    color:'#fbbf24' },
  proyecto:   { icon:'📁', label:'Proyecto',    color:'#60a5fa' },
  contact:    { icon:'👤', label:'Contacto',    color:'#fbbf24' },
  account:    { icon:'🏦', label:'Cuenta',      color:'#34d399' },
  event:      { icon:'📅', label:'Evento',      color:'#34d399' },
  agenda:     { icon:'📋', label:'Agenda',      color:'#f97316' },
  cotizacion: { icon:'📄', label:'Cotización',  color:'#fb923c' },
}

// ─────────────────────────────────────────
// Boot — Fix sidebar CSS immediately (module scripts run after DOM is parsed)
// ─────────────────────────────────────────
fixLayoutDOM()   // Run BEFORE async IIFE — DOM is ready at module parse time

;(async () => {
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
     currentUser = { id: 'admin-uuid-bypass', email: 'admin@nexus.os (Simulado)' }
     document.getElementById('user-email').textContent = currentUser.email
     if (allNodes.length === 0) {
       const now = new Date().toISOString()
       allNodes = [
         { id: '1', type: 'kanban', content: 'Finalizar interfaz Nexus v4', created_at: now, metadata: { label: 'Finalizar interfaz Nexus v4', status: 'in_progress', tags: ['#urgente'], checklist: [{text:'Refactorizar CSS', done:true}, {text:'Optimizar JS', done:false}] } },
         { id: '2', type: 'kanban', content: 'Implementar Bio-Métricas', created_at: now, metadata: { label: 'Implementar Bio-Métricas', status: 'todo' } },
         { id: '3', type: 'note', content: 'Reunión estratégica con el equipo de Deep Ocean Tech a las 15:00.', created_at: now, metadata: { tags: ['#reunion'] } },
         { id: '4', type: 'income', content: 'Pago de consultoría externa', created_at: now, metadata: { amount: 2500, label: 'Pago consultoría' } },
         { id: '5', type: 'expense', content: 'Servidores AWS Mensual', created_at: now, metadata: { amount: 120, label: 'AWS' } },
         { id: '6', type: 'persona', content: 'Satoshi Nakamoto - Contacto Nivel 1', created_at: now, metadata: { label: 'Satoshi Nakamoto' } }
       ]
     }
     showDemoBanner()
     // Fix 4: setTimeout evita TDZ si alguna const se declara después del IIFE
     setTimeout(() => renderAll(), 0)
  } else {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/'; return }
    currentUser = session.user
    document.getElementById('user-email').textContent = currentUser.email
    await loadNodes()
    setupRealtimeSubscription()
  }
  fixLayoutDOM()   // Ensure aside/toggles/spotlight are inside #nexus-layout
  initTickers()
  initWorldClock()
  restorePanels()
loadSystemSettings()
  initFxWidget() // Sidebar tipo de cambio en vivo
  // Live countdown display update from inputs
  ;['cd-min','cd-sec'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (!cdRunning && cdRemaining <= 0) {
        const min = parseInt(document.getElementById('cd-min')?.value || '0') || 0
        const sec = parseInt(document.getElementById('cd-sec')?.value || '0') || 0
        const disp = document.getElementById('cd-display')
        if (disp) { disp.textContent = String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0'); disp.classList.remove('finished') }
      }
    })
  })
  document.getElementById('cronica-date')?.setAttribute('value', new Date().toISOString().split('T')[0])
  drainOfflineQueue()
  updateOfflineBar()
})()

// ── Global error handler — toast en pantalla en vez de crash silencioso ─────────
window.onerror = (msg, _src, line, _col, err) => {
  const text = (err?.message || String(msg)).slice(0, 120)
  console.error('[nexus:error]', text, 'línea', line)
  showToast(`⚠️ ${text}`)
  return false
}
window.onunhandledrejection = (e) => {
  const text = (e.reason?.message || String(e.reason)).slice(0, 120)
  console.error('[nexus:rejection]', text)
  showToast(`⚠️ ${text}`)
}

function setupRealtimeSubscription() {
  supabase
    .channel('public:nodes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes', filter: `owner_id=eq.${currentUser.id}` }, (payload) => {
      console.log('Realtime change:', payload)
      if (payload.eventType === 'INSERT') {
        // Solo agregar si no existe ya (evita duplicado cuando el mismo cliente hizo el insert)
        if (!allNodes.find(n => n.id === payload.new.id)) {
          allNodes.unshift(payload.new)
        }
      } else if (payload.eventType === 'UPDATE') {
        const idx = allNodes.findIndex(n => n.id === payload.new.id)
        if (idx !== -1) allNodes[idx] = payload.new
      } else if (payload.eventType === 'DELETE') {
        allNodes = allNodes.filter(n => n.id !== payload.old.id)
      }
      saveNodesToCache(allNodes)
      renderAll()
    })
    .subscribe()
}

// ── Cache localStorage — offline fallback ────────────────────────────────────
const NODES_CACHE_KEY = 'nexus_nodes_cache'
const NODES_CACHE_MAX = 500   // máximo de nodos a cachear (los más recientes)

function saveNodesToCache(nodes) {
  try {
    const slice = nodes.slice(0, NODES_CACHE_MAX)
    localStorage.setItem(NODES_CACHE_KEY, JSON.stringify(slice))
  } catch (e) {
    // QuotaExceededError — no bloquea la app
    console.warn('[cache] no se pudo guardar en localStorage:', e.message)
  }
}

function loadNodesFromCache() {
  try {
    const raw = localStorage.getItem(NODES_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function loadNodes() {
  // Renderiza inmediatamente desde caché mientras llega Supabase
  const cached = loadNodesFromCache()
  if (cached?.length) {
    allNodes = cached
    renderAll()
    showToast(`📦 ${cached.length} nodos desde caché — sincronizando...`, 2500)
  }

  const { data, error } = await supabase
    .from('nodes').select('*')
    .eq('owner_id', currentUser.id)
    .order('created_at', { ascending: false })

  if (error) {
    if (!cached?.length) showToast('⚠️ Sin conexión — no hay datos en caché')
    console.error('[loadNodes]', error)
  } else {
    allNodes = data || []
    saveNodesToCache(allNodes)
    renderAll()
  }

  // Muestra el onboarding solo la primera vez (no en admin bypass)
  if (!localStorage.getItem('nexus_onboarded') && localStorage.getItem('nexus_admin_bypass') !== 'true') {
    setTimeout(() => {
      const m = document.getElementById('welcome-modal')
      if (m) {
        m.style.display = 'flex'
        // Asegurar que click en el backdrop cierra el modal
        m.onclick = (ev) => { if (ev.target === m) window.closeWelcomeModal() }
      }
    }, 400)  // Reducido de 800ms a 400ms
  }
}

// ── Welcome modal ─────────────────────────────────────────────────────────────
window.closeWelcomeModal = () => {
  const m = document.getElementById('welcome-modal')
  if (m) { m.style.opacity = '0'; setTimeout(() => { m.style.display = 'none'; m.style.opacity = '' }, 300) }
  localStorage.setItem('nexus_onboarded', '1')
}
window.trywelcomeExample = (txt) => {
  window.closeWelcomeModal()
  setTimeout(() => {
    if (nexusInput) { nexusInput.value = txt; nexusInput.focus(); nexusInput.dispatchEvent(new Event('input')) }
  }, 350)
}

// ─────────────────────────────────────────
// Muro Táctico (Trello Logic)
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Muro Táctico (Trello Logic + Drag & Drop)
// ─────────────────────────────────────────
function renderKanban(nodes) {
  nodes = nodes || getFilteredNodes()
  const root = document.getElementById('kanban-root')
  if (!root) return

  // ── KPI strip ─────────────────────────────────────────────
  const kpiRoot = document.getElementById('kanban-kpi-root')
  if (kpiRoot) {
    const today0 = new Date().toISOString().slice(0,10)
    const kNodes  = allNodes.filter(n=>n.type==='kanban')
    const kTodo   = kNodes.filter(n=>(n.metadata?.status||'todo')==='todo').length
    const kProg   = kNodes.filter(n=>n.metadata?.status==='in_progress').length
    const kDone   = kNodes.filter(n=>n.metadata?.status==='done'&&(n.metadata?.done_at||'')===today0).length
    const kOver   = kNodes.filter(n=>{const d=n.metadata?.date_deadline||n.metadata?.due_date;return d&&d<today0&&n.metadata?.status!=='done'}).length
    const kpis = [
      { label:'PENDIENTES', val:kTodo,  color:'#94a3b8', icon:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` },
      { label:'EN PROGRESO',val:kProg,  color:'#fbbf24', icon:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>` },
      { label:'CERRADAS HOY',val:kDone, color:'#4ade80', icon:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>` },
      { label:'VENCIDAS',   val:kOver,  color: kOver>0?'#f87171':'#94a3b8', icon:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${kOver>0?'#f87171':'#94a3b8'}" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` },
    ]
    kpiRoot.innerHTML = `<div style="display:flex;gap:0;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;">
      ${kpis.map((k,i)=>`<div style="flex:1;padding:12px 14px;${i>0?'border-left:1px solid rgba(255,255,255,0.06);':''}display:flex;align-items:center;gap:10px;">
        ${k.icon}
        <div>
          <div style="font-size:18px;font-weight:900;color:${k.color};font-family:'JetBrains Mono',monospace;line-height:1;">${k.val}</div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.07em;color:var(--text-muted);text-transform:uppercase;margin-top:2px;">${k.label}</div>
        </div>
      </div>`).join('')}
      <div style="flex:1;padding:12px 14px;border-left:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:flex-end;">
        <button onclick="openQuickCreate('kanban')" style="font-size:11px;font-weight:700;padding:5px 14px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:8px;cursor:pointer;">+ Nueva tarea</button>
      </div>
    </div>`
  }

  const today = new Date().toISOString().split('T')[0]
  // Linear.app-style: flex row, thin borders, minimal cards
  root.style.cssText = 'display:flex; gap:16px; overflow-x:auto; padding-bottom:8px;'
  const COL_COLORS = { todo:'#94a3b8', in_progress:'#fbbf24', done:'#4ade80' }
  const PCLR = { alta:'#f87171', '1':'#f87171', media:'#fbbf24', baja:'#4ade80' }

  root.innerHTML = boardLists.map(list => {
    const cards = nodes.filter(n => {
      if (n.type !== 'kanban') return false
      const status = n.metadata?.status || 'todo'
      if (status !== list.id) return false
      // Hide 'done' cards from previous days — they live in Crónica
      if (list.id === 'done') {
        const doneAt = n.metadata?.done_at
        if (doneAt && doneAt !== today) return false
      }
      return true
    })
    const colColor = COL_COLORS[list.id] || '#60a5fa'

    const cardsHtml = cards.map(n => {
      const m = n.metadata || {}
      const isPrio = m.priority === '1' || m.priority === 'alta'
      const dl = m.date_deadline || m.due_date
      const isOverdue = dl && dl < today && m.status !== 'done'
      const projTag = m.project_tag
      const projNode = projTag ? allNodes.find(p => p.type==='proyecto' && p.metadata?.project_slug === projTag) : null
      const imgs = m.images
      const coverSrc = imgs?.length ? (typeof imgs[0]==='string' ? imgs[0] : (imgs[0].url || imgs[0].data || '')) : ''
      const lblColor = m.label_color ? (typeof LABEL_COLORS !== 'undefined' ? LABEL_COLORS[m.label_color] : null) : null
      const ck = m.checklist || []
      const ckDone = ck.filter(c => c.done).length
      const ckTotal = ck.length
      const hasAttach = (m.attachments?.length || 0) > 0
      const pClr = PCLR[m.priority]

      const meta = []
      if (isPrio || pClr) {
        const pc = pClr || '#fbbf24'
        const plbl = m.priority === 'alta' || m.priority === '1' ? 'ALTA' : (m.priority || 'ALTA').toUpperCase()
        meta.push(`<span style="font-size:10px;background:${pc}25;color:${pc};border-radius:4px;padding:1px 6px;font-weight:700;">⚑ ${plbl}</span>`)
      }
      if (dl) meta.push(`<span style="font-size:10px;color:${isOverdue?'#f87171':'var(--text-dim)'};">📅 ${dl}</span>`)
      if (ckTotal > 0) meta.push(`<span style="font-size:10px;color:${ckDone===ckTotal?'#4ade80':'var(--text-dim)'};">☑ ${ckDone}/${ckTotal}</span>`)
      if (hasAttach) meta.push(`<span style="font-size:10px;color:var(--text-dim);">📎 ${m.attachments.length}</span>`)
      if (projNode) meta.push(`<span style="font-size:10px;background:rgba(45,212,191,0.1);color:#2dd4bf;border-radius:4px;padding:1px 6px;">🏗️ ${esc(projNode.metadata?.label||projTag)}</span>`)
      if ((m.comments||[]).length > 0) meta.push(`<span style="font-size:10px;color:var(--text-dim);">💬 ${m.comments.length}</span>`)

      const otherTags = (m.tags || [])
        .filter(t => t.toLowerCase() !== '#tarea' && t.toLowerCase() !== `#${(m.project_tag||'__')}`)
      const tagsHtml = otherTags.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">${
        otherTags.map(t => `<span class="tag-pill" onclick="event.stopPropagation(); setFilter('${t}')" style="background:var(--accent-cyan-dim); color:var(--accent-cyan); font-size:9px; padding:1px 5px; border-radius:3px; cursor:pointer;">${esc(t)}</span>`).join('')
      }</div>` : ''

      return `<div class="trello-card kanban-card" id="card-${n.id}" data-node-id="${n.id}"
            style="background:var(--bg-panel); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:10px 12px; cursor:pointer; transition:border-color 0.15s, transform 0.1s;"
            onmouseover="this.style.borderColor='rgba(255,255,255,0.18)'; this.style.transform='translateY(-1px)'"
            onmouseout="this.style.borderColor='rgba(255,255,255,0.07)'; this.style.transform=''"
            onclick="openCardModal('${n.id}')">
        ${lblColor ? `<div style="height:3px;border-radius:2px;background:${lblColor};margin-bottom:8px;"></div>` : ''}
        ${coverSrc ? `<img src="${coverSrc}" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px;" onerror="this.style.display='none'" />` : ''}
        <div class="trello-card-title" style="font-size:13px;font-weight:500;color:var(--text-primary);line-height:1.4;">${esc(m.label || n.content)}</div>
        ${meta.length ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;">${meta.join('')}</div>` : ''}
        ${tagsHtml}
      </div>`
    }).join('')

    return `
      <div class="trello-list" id="list-${list.id}"
           style="flex:0 0 280px; display:flex; flex-direction:column; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; overflow:hidden; max-height:calc(100vh - 200px);">
        <div class="trello-list-header" style="padding:12px 14px; display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid ${colColor}40; background:transparent;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0;">
            <span style="width:8px;height:8px;border-radius:50%;background:${colColor};flex-shrink:0;"></span>
            <span class="trello-list-title" style="font-size:12px;font-weight:700;color:${colColor};letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(list.title)}</span>
            <span style="font-size:11px;background:${colColor}22;color:${colColor};border-radius:10px;padding:0 6px;font-weight:600;">${cards.length}</span>
          </div>
          <span title="Eliminar columna" style="color:#8c9bab; cursor:pointer; font-size:14px; padding:2px 6px; border-radius:6px; transition:background 0.15s,color 0.15s;" onmouseover="this.style.background='rgba(248,113,113,0.15)';this.style.color='#f87171'" onmouseout="this.style.background='';this.style.color='#8c9bab'" onclick="event.stopPropagation();manageList('${list.id}')">🗑</span>
        </div>
        <div class="trello-cards-container kanban-col-body" data-status="${list.id}"
             style="padding:10px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px; min-height:80px;">
          ${cardsHtml}
        </div>
        <div class="btn-add-card" onclick="startQuickAdd('${list.id}')"
             style="padding:8px 12px; font-size:12px; color:var(--text-dim); cursor:pointer; border-top:1px solid rgba(255,255,255,0.04);">
           <span>+</span> Añade una tarjeta
        </div>
      </div>
    `
  }).join('') + `
    <div class="btn-add-list" onclick="addNewList()"
         style="flex:0 0 200px; align-self:flex-start; padding:14px; font-size:12px; color:var(--text-dim); cursor:pointer; border:1px dashed rgba(255,255,255,0.08); border-radius:12px; background:rgba(255,255,255,0.01);">
      <span>+</span> Añade otra lista
    </div>
  `

  // Initialize SortableJS on each column
  initKanbanSortable()
}

// ── SortableJS initialization for Muro Táctico kanban ────────────────────────
function initKanbanSortable() {
  document.querySelectorAll('#kanban-root .kanban-col-body').forEach(col => {
    if (col._sortable) { try { col._sortable.destroy() } catch (e) {} }
    col._sortable = new Sortable(col, {
      group: 'nexus-kanban',
      animation: 150,
      ghostClass: 'kanban-ghost',
      chosenClass: 'kanban-chosen',
      dragClass: 'kanban-drag',
      delay: 50,
      delayOnTouchOnly: true,
      onEnd: async (evt) => {
        const cardId = evt.item.dataset.nodeId
        const newStatus = evt.to.dataset.status
        if (!cardId || !newStatus) return
        const node = allNodes.find(n => n.id === cardId)
        if (!node) return
        node.metadata = node.metadata || {}
        node.metadata.status = newStatus
        // Stamp the date when a card is moved to done so we can hide it next day
        if (newStatus === 'done') {
          node.metadata.done_at = new Date().toISOString().split('T')[0]
        } else {
          delete node.metadata.done_at
        }
        try {
          if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
            await updateNodeMetadata(cardId, node.metadata)
          }
        } catch (e) { /* offline-safe: state already mutated locally */ }
      }
    })
  })
}

window.addNewList = () => {
  // Inline form at the end of the kanban board
  const existing = document.getElementById('new-list-form')
  if (existing) { existing.remove(); return }
  const board = document.getElementById('kanban-root')
  const addBtn = board?.querySelector('.btn-add-list')
  const form = document.createElement('div')
  form.id = 'new-list-form'
  form.style.cssText = 'background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:16px; width:300px; flex-shrink:0; padding:16px;'
  form.innerHTML = `
    <input type="text" id="new-list-name" placeholder="Nombre de la lista..." style="width:100%; background:rgba(0,0,0,0.3); border:1px solid var(--accent-cyan); border-radius:8px; padding:10px; color:#fff; outline:none; font-size:14px;" />
    <div style="display:flex; gap:8px; margin-top:12px;">
      <button onclick="confirmNewList()" style="flex:1; background:var(--accent-cyan); color:#000; border:none; border-radius:8px; padding:8px; cursor:pointer; font-weight:800;">Añadir</button>
      <button onclick="document.getElementById('new-list-form')?.remove()" style="background:rgba(255,255,255,0.1); color:#fff; border:none; border-radius:8px; padding:8px 12px; cursor:pointer;">✕</button>
    </div>`
  if (addBtn) board.insertBefore(form, addBtn)
  setTimeout(() => document.getElementById('new-list-name')?.focus(), 50)
}

window.confirmNewList = () => {
  const input = document.getElementById('new-list-name')
  const title = input?.value.trim()
  if (!title) return
  const id = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  boardLists.push({ id: id || Date.now().toString(), title })
  document.getElementById('new-list-form')?.remove()
  renderAll()
}

window.manageList = (id) => {
  const list = boardLists.find(l => l.id === id)
  if (!list) return
  // Verificar si hay tarjetas en esta columna
  const cards = allNodes.filter(n => n.type === 'kanban' && (n.metadata?.status || 'todo') === id)
  if (cards.length > 0) {
    const first = boardLists.find(l => l.id !== id)
    const moveTo = first ? first.title : 'Pendiente'
    const ok = confirm(`La columna "${list.title}" tiene ${cards.length} tarjeta${cards.length !== 1 ? 's' : ''}.\n\n¿Mover las tarjetas a "${moveTo}" y eliminar la columna?`)
    if (!ok) return
    // Mover tarjetas a la primera columna disponible
    if (first) {
      allNodes.forEach(n => {
        if (n.type === 'kanban' && (n.metadata?.status || 'todo') === id) {
          n.metadata = { ...(n.metadata || {}), status: first.id }
          if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
            supabase.from('nodes').update({ metadata: n.metadata }).eq('id', n.id).then(() => {})
          }
        }
      })
    }
  } else {
    if (!confirm(`¿Eliminar la columna "${list.title}"? Esta acción no se puede deshacer.`)) return
  }
  boardLists = boardLists.filter(l => l.id !== id)
  renderKanban()
}

// DRAG & DROP HANDLERS
window.cardDragStart = (e, id) => {
  e.dataTransfer.setData('text/plain', id)
  e.target.style.opacity = '0.5'
}

window.allowDrop = (e) => {
  e.preventDefault()
}

window.cardDrop = async (e, listId) => {
  e.preventDefault()
  const id = e.dataTransfer.getData('text/plain')
  const card = document.getElementById(`card-${id}`)
  if (card) card.style.opacity = '1'

  const node = allNodes.find(n => n.id === id)
  if (node) {
    node.metadata = { ...(node.metadata || {}), status: listId }
    // Stamp the date when a card is moved to done so we can hide it next day
    if (listId === 'done') {
      node.metadata.done_at = new Date().toISOString().split('T')[0]
    } else {
      delete node.metadata.done_at
    }
    if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
      await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', id)
    }
    renderAll()
  }
}

window.startQuickAdd = (listId) => {
  const existing = document.getElementById(`quick-add-${listId}`)
  if (existing) { existing.remove(); return }
  const container = document.getElementById(`list-${listId}`)
  if (!container) return
  const form = document.createElement('div')
  form.id = `quick-add-${listId}`
  form.style.cssText = 'padding:8px;'
  form.innerHTML = `
    <textarea id="quick-ta-${listId}" placeholder="Título de la tarjeta..." style="width:100%; background:#1c2128; border:1px solid var(--accent-cyan); border-radius:8px; padding:10px; color:#fff; font-size:14px; resize:none; outline:none; min-height:64px; font-family:inherit;"></textarea>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button onclick="confirmQuickAdd('${listId}')" style="background:var(--accent-cyan); color:#000; border:none; border-radius:8px; padding:8px 16px; cursor:pointer; font-weight:800;">Añadir</button>
      <button onclick="document.getElementById('quick-add-${listId}')?.remove()" style="background:rgba(255,255,255,0.1); color:#fff; border:none; border-radius:8px; padding:8px 12px; cursor:pointer;">✕</button>
    </div>`
  const addBtn = container.querySelector('.btn-add-card')
  if (addBtn) container.insertBefore(form, addBtn)
  setTimeout(() => document.getElementById(`quick-ta-${listId}`)?.focus(), 50)
}

window.confirmQuickAdd = (listId) => {
  const ta = document.getElementById(`quick-ta-${listId}`)
  const title = ta?.value.trim()
  if (!title) return
  insertNodeRaw(`#tarea ${title}`, { status: listId, label: title })
  document.getElementById(`quick-add-${listId}`)?.remove()
}

// ─────────────────────────────────────────
// Modal Trello
// ─────────────────────────────────────────
window.openCardModal = (id) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  // Si es una tarjeta Kanban vinculada a una cotización → abrir la cotización
  if (node.metadata?.cot_id) {
    const cot = allNodes.find(n => n.id === node.metadata.cot_id)
    if (cot) { openCotizacionModal(cot.id); return }
  }
  editingCardId = id
  const m = node.metadata || {}

  document.getElementById('tm-title').value = m.label || node.content
  document.getElementById('tm-list-name').textContent = m.status === 'in_progress' ? 'En Curso' : m.status === 'done' ? 'Finalizado' : 'Pendiente'
  
  const descDisp = document.getElementById('tm-desc-display')
  const descInp  = document.getElementById('tm-desc-input')
  descDisp.textContent = m.description || 'Añadir una descripción más detallada...'
  descInp.value = m.description || ''
  descDisp.style.display = 'block'; descInp.style.display = 'none';

  renderActivity(m.comments || [])
  renderChecklist(m.checklist || [])
  renderAssignees(m.assignee || [])
  renderAttachments(m.images || [], 'card')
  const dueDateEl = document.getElementById('tm-due-date')
  if (dueDateEl) dueDateEl.value = m.due_date || ''
  document.getElementById('card-modal').classList.remove('hidden')
  // Sprint 14: render connections
  renderCardConnections(id)
  // Reset link search
  const lsBox = document.getElementById('tm-link-search-box')
  if (lsBox) lsBox.style.display = 'none'
}

window.closeCardModal = () => { document.getElementById('card-modal').classList.add('hidden'); editingCardId = null; }

function renderActivity(comments) {
  const root = document.getElementById('tm-activity-feed')
  if (!root) return
  root.innerHTML = comments.slice().reverse().map(c => `
    <div style="display:flex; gap:12px; margin-bottom:12px;">
      <div class="t-avatar">${(c.user || 'U')[0]}</div>
      <div style="background: rgba(255,255,255,0.03); padding: 10px; border-radius: 8px; flex: 1;">
        <div style="font-size:11px; margin-bottom: 4px;"><b style="color:var(--accent-cyan);">${c.user || 'Usuario'}</b> <span style="color:var(--text-muted);">${c.time}</span></div>
        <div style="font-size:13px; color:#f0f6fc;">${esc(c.text)}</div>
      </div>
    </div>
  `).join('')
}

function renderChecklist(items) {
  const container = document.getElementById('tm-checklist-container')
  if (!container) return
  const done = items.filter(i => i.done).length
  const pct  = items.length ? Math.round(done / items.length * 100) : 0
  const contacts = allNodes.filter(n => n.type === 'contact')
  container.innerHTML = (items.length ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:11px;color:var(--text-muted);min-width:28px;">${pct}%</span>
      <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--accent-cyan);border-radius:3px;transition:width 0.3s;"></div>
      </div>
    </div>` : '') +
  items.map((it, idx) => {
    const assignedName = it.assigned_name || ''
    const dueDate = it.due_date || ''
    const today = new Date().toISOString().split('T')[0]
    const isOverdue = dueDate && dueDate < today && !it.done
    return `
    <div style="border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;margin-bottom:6px;background:rgba(255,255,255,0.02);">
      <div style="display:flex;align-items:center;gap:10px;">
        <input type="checkbox" ${it.done ? 'checked' : ''} onchange="toggleCheckItem(${idx})"
          style="accent-color:var(--accent-cyan);width:16px;height:16px;cursor:pointer;flex-shrink:0;" />
        <span style="flex:1;font-size:13px;color:${it.done?'var(--text-muted)':'#fff'};${it.done?'text-decoration:line-through':''}">${esc(it.text)}</span>
        <span onclick="deleteCheckItem(${idx})" style="color:var(--text-muted);font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;opacity:0.5;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.5'">✕</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;padding-left:26px;flex-wrap:wrap;">
        <select onchange="updateCheckItemAssignee(${idx},this.value)"
          style="font-size:11px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 6px;color:var(--text-muted);cursor:pointer;">
          <option value="">👤 Asignar persona</option>
          ${contacts.map(c=>`<option value="${esc(c.metadata?.name||c.content)}" ${assignedName===(c.metadata?.name||c.content)?'selected':''}>${esc(c.metadata?.name||c.content)}</option>`).join('')}
        </select>
        <input type="date" value="${dueDate}" onchange="updateCheckItemDate(${idx},this.value)"
          style="font-size:11px;background:rgba(255,255,255,0.05);border:1px solid ${isOverdue?'rgba(248,113,113,0.5)':'rgba(255,255,255,0.1)'};border-radius:6px;padding:2px 6px;color:${isOverdue?'#f87171':'var(--text-muted)'};cursor:pointer;" />
        ${assignedName ? `<span style="font-size:11px;color:#a78bfa;font-weight:600;">👤 ${esc(assignedName)}</span>` : ''}
        ${isOverdue ? `<span style="font-size:11px;color:#f87171;font-weight:600;">⚠ Vencida</span>` : ''}
      </div>
    </div>`
  }).join('')
}

window.updateCheckItemAssignee = async (idx, name) => {
  const node = allNodes.find(n => n.id === editingCardId)
  if (node?.metadata?.checklist) {
    node.metadata.checklist[idx].assigned_name = name
    await updateNodeMetadata(editingCardId, node.metadata)
    renderChecklist(node.metadata.checklist)
  }
}

window.updateCheckItemDate = async (idx, date) => {
  const node = allNodes.find(n => n.id === editingCardId)
  if (node?.metadata?.checklist) {
    node.metadata.checklist[idx].due_date = date
    await updateNodeMetadata(editingCardId, node.metadata)
    renderChecklist(node.metadata.checklist)
  }
}

// Modal Interaction Handlers
document.getElementById('tm-comment-input')?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    const text = e.target.value.trim()
    const node = allNodes.find(n => n.id === editingCardId)
    if (node) {
      if (!node.metadata.comments) node.metadata.comments = []
      const settings = JSON.parse(localStorage.getItem('nexus_settings') || '{}')
      node.metadata.comments.push({
        user: settings.nickname || 'Anónimo',
        text: text,
        time: new Date().toLocaleTimeString()
      })
      e.target.value = ''
      await updateNodeMetadata(editingCardId, node.metadata)
      renderActivity(node.metadata.comments)
    }
  }
})

window.toggleCheckItem = async (idx) => {
  const node = allNodes.find(n => n.id === editingCardId)
  if (node && node.metadata.checklist) {
    node.metadata.checklist[idx].done = !node.metadata.checklist[idx].done
    await updateNodeMetadata(editingCardId, node.metadata)
    renderChecklist(node.metadata.checklist)
  }
}

window.deleteCheckItem = async (idx) => {
  const node = allNodes.find(n => n.id === editingCardId)
  if (node && node.metadata.checklist) {
    node.metadata.checklist.splice(idx, 1)
    await updateNodeMetadata(editingCardId, node.metadata)
    renderChecklist(node.metadata.checklist)
  }
}

document.getElementById('tm-btn-checklist')?.addEventListener('click', () => {
  const input = document.getElementById('tm-checklist-input')
  if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth' }) }
})

window.addCheckItem = async () => {
  const input = document.getElementById('tm-checklist-input')
  const text = input?.value.trim()
  if (!text || !editingCardId) return
  const node = allNodes.find(n => n.id === editingCardId)
  if (node) {
    if (!node.metadata.checklist) node.metadata.checklist = []
    node.metadata.checklist.push({ text, done: false })
    await updateNodeMetadata(editingCardId, node.metadata)
    renderChecklist(node.metadata.checklist)
    input.value = ''
    input.focus()
  }
}

document.getElementById('tm-btn-dates')?.addEventListener('click', () => {
  const input = document.getElementById('tm-due-date')
  if (input) { input.focus(); input.showPicker?.() }
})

document.getElementById('tm-due-date')?.addEventListener('change', async (e) => {
  const node = allNodes.find(n => n.id === editingCardId)
  if (node) {
    node.metadata.due_date = e.target.value
    await updateNodeMetadata(editingCardId, node.metadata)
  }
})

document.getElementById('tm-btn-members')?.addEventListener('click', () => {
  const el = document.getElementById('tm-assignee-row')
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none'
})

const memberInput = document.getElementById('tm-member-input')
memberInput?.addEventListener('input', () => {
  const val = memberInput.value.trim().toLowerCase()
  const drop = document.getElementById('tm-member-drop')
  if (!drop) return
  if (!val) { drop.style.display = 'none'; return }
  const matches = allNodes.filter(n => n.type==='contact' && (n.metadata?.name||n.content).toLowerCase().includes(val)).slice(0,6)
  if (!matches.length) { drop.style.display = 'none'; return }
  drop.style.display = 'block'
  drop.innerHTML = matches.map(c => {
    const name = c.metadata?.name || c.content
    const icon = c.metadata?.cType==='bank'?'🏦':c.metadata?.cType==='crypto'?'₿':'👤'
    return `<div style="padding:8px 12px; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:13px;" onmouseover="this.style.background='rgba(0,246,255,0.08)'" onmouseout="this.style.background=''" onclick="selectMemberContact('${c.id}','${esc(name)}')">${icon} ${esc(name)}</div>`
  }).join('')
})

window.selectMemberContact = async function(id, name) {
  const drop = document.getElementById('tm-member-drop')
  if (drop) drop.style.display = 'none'
  if (!editingCardId) return
  const node = allNodes.find(n => n.id === editingCardId)
  if (!node) return
  if (!node.metadata.assignee) node.metadata.assignee = []
  if (!node.metadata.assignee.includes(name)) {
    node.metadata.assignee.push(name)
    await updateNodeMetadata(editingCardId, node.metadata)
    renderAssignees(node.metadata.assignee)
  }
  const input = document.getElementById('tm-member-input')
  if (input) input.value = ''
}

document.getElementById('tm-add-member')?.addEventListener('click', async () => {
  const input = document.getElementById('tm-member-input')
  const name = input?.value.trim()
  if (!name || !editingCardId) return
  const node = allNodes.find(n => n.id === editingCardId)
  if (node) {
    if (!node.metadata.assignee) node.metadata.assignee = []
    if (!node.metadata.assignee.includes(name)) {
      node.metadata.assignee.push(name)
      await updateNodeMetadata(editingCardId, node.metadata)
      renderAssignees(node.metadata.assignee)
    }
    if (input) input.value = ''
  }
})

function renderAssignees(assignees) {
  const root = document.getElementById('tm-assignees-list')
  if (!root) return
  root.innerHTML = (assignees || []).map(a => `<span style="background:var(--accent-cyan-dim); color:var(--accent-cyan); font-size:11px; padding:3px 8px; border-radius:100px;">${esc(a)}</span>`).join('')
}

document.getElementById('tm-btn-labels')?.addEventListener('click', () => {
  const el = document.getElementById('tm-labels-row')
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none'
})

document.getElementById('tm-add-label')?.addEventListener('click', async () => {
  const input = document.getElementById('tm-label-input')
  const tag = input?.value.trim().replace(/^#?/, '#')
  if (!tag || tag === '#' || !editingCardId) return
  const node = allNodes.find(n => n.id === editingCardId)
  if (node) {
    if (!node.metadata.tags) node.metadata.tags = []
    if (!node.metadata.tags.includes(tag)) node.metadata.tags.push(tag)
    await updateNodeMetadata(editingCardId, node.metadata)
    renderAll()
    if (input) input.value = ''
  }
})

document.getElementById('tm-desc-input')?.addEventListener('blur', async (e) => {
  const node = allNodes.find(n => n.id === editingCardId)
  if (node) {
    node.metadata.description = e.target.value
    await updateNodeMetadata(editingCardId, node.metadata)
    document.getElementById('tm-desc-display').textContent = node.metadata.description || 'Añadir una descripción más detallada...'
    document.getElementById('tm-desc-display').style.display = 'block'
    e.target.style.display = 'none'
  }
})

async function updateNodeMetadata(id, metadata) {
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ metadata }).eq('id', id)
  }
  renderAll()
}

document.getElementById('tm-btn-archive')?.addEventListener('click', async () => {
  if (!confirm('¿Archivar tarjeta? Se ocultará del tablero pero podrás verla en Crónica.')) return
  const node = allNodes.find(n => n.id === editingCardId)
  if (node) {
    node.metadata = { ...(node.metadata || {}), status: 'archived' }
    if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
      await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', editingCardId)
    }
  }
  allNodes = allNodes.filter(n => n.id !== editingCardId)
  renderAll()
  closeCardModal()
})

document.getElementById('tm-btn-delete')?.addEventListener('click', async () => {
  if (!confirm('¿Eliminar esta tarjeta permanentemente? Esta acción no se puede deshacer.')) return
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes = allNodes.filter(n => n.id !== editingCardId)
    renderAll(); closeCardModal(); return
  }
  allNodes = allNodes.filter(n => n.id !== editingCardId)
  renderAll()
  closeCardModal()
  await supabase.from('nodes').delete().eq('id', editingCardId)
})

// ─────────────────────────────────────────
// Core Logic: Semantic Parser
// ─────────────────────────────────────────
// ── SEMANTIC PARSER — delegates to src/parser.js (v2 with chrono-node) ───────
function parseNode(text) {
  return _parseNodeV2(text)
}

// ── OFFLINE SYNC QUEUE ────────────────────────────────────────────────────────
const OFFLINE_QUEUE_KEY = 'nexus_offline_q'
function loadOfflineQueue()  { try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||'[]') } catch { return [] } }
function saveOfflineQueue(q) { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)) }

function updateOfflineBar() {
  const el = document.getElementById('offline-bar')
  if (!el) return
  const q = loadOfflineQueue()
  if (!navigator.onLine) {
    el.style.display = 'flex'; el.className = 'offline-bar offline'
    el.innerHTML = '📵 Sin conexión &mdash; los cambios se guardan localmente y sincronizan al reconectar'
  } else if (q.length) {
    el.style.display = 'flex'; el.className = 'offline-bar syncing'
    el.innerHTML = `🔄 Sincronizando ${q.length} cambio${q.length!==1?'s':''} pendiente${q.length!==1?'s':''}...`
  } else {
    el.style.display = 'none'
  }
}

async function drainOfflineQueue() {
  if (!currentUser || !navigator.onLine) return
  const queue = loadOfflineQueue()
  if (!queue.length) { updateOfflineBar(); return }
  const remaining = []
  for (const item of queue) {
    try {
      const { error } = await supabase.from('nodes').insert({ owner_id: currentUser.id, ...item.payload })
      if (error) remaining.push(item)
    } catch { remaining.push(item) }
  }
  saveOfflineQueue(remaining)
  if (remaining.length < queue.length) await loadNodes()
  updateOfflineBar()
}

window.addEventListener('online',  () => { updateOfflineBar(); drainOfflineQueue() })
window.addEventListener('offline', updateOfflineBar)

async function insertNodeRaw(raw, metadataOverrides={}) {
  // Ensure no ghost comments persist when creating a new node
  // Clear any existing comments in metadata to avoid stray comment artifacts
  // This addresses the ghost comment issue observed during node insertion
  // (We deliberately reset comments array before proceeding)
  // Note: This will not affect existing nodes that already have comments

  const { type, metadata, content } = parseNode(raw)
  const finalMetadata = { ...metadata, ...metadataOverrides }
  // Reset comments to avoid ghost comment artifacts on new nodes
  finalMetadata.comments = []

  if (finalMetadata.account_hint) {
    const hint = finalMetadata.account_hint
    const found = allNodes.find(n => n.type === 'account' && (n.metadata?.label||n.content).toLowerCase().includes(hint))
    if (found) finalMetadata.account_id = found.id
    else showToast(`Cuenta '@${hint}' no encontrada — asignado a General`)
    delete finalMetadata.account_hint
  }
  if (type === 'income' || type === 'expense') resolveContactInMetadata(finalMetadata, raw)

  // ── OPTIMISTIC: muestra el nodo AL INSTANTE ──────────────────────────────
  const tempId = '_tmp_' + Date.now()
  const tempNode = { id: tempId, type, content: content || raw, metadata: finalMetadata, created_at: new Date().toISOString(), _optimistic: true }
  allNodes.unshift(tempNode)
  renderAll()

  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    const idx = allNodes.findIndex(n => n.id === tempId)
    const perm = { ...tempNode, id: Math.random().toString(36).substr(2,9), _optimistic: false }
    if (idx !== -1) allNodes[idx] = perm; else allNodes.unshift(perm)
    renderAll(); showToast(`NODO INYECTADO: ${type.toUpperCase()}`); return
  }

  const payload = { owner_id: currentUser.id, content: content || raw, type, metadata: finalMetadata }

  if (!navigator.onLine) {
    const q = loadOfflineQueue(); q.push({ payload }); saveOfflineQueue(q)
    const idx = allNodes.findIndex(n => n.id === tempId)
    if (idx !== -1) allNodes[idx] = { ...tempNode, _offline: true }
    renderAll(); updateOfflineBar(); showToast('📵 Sin conexión — guardado localmente'); return
  }

  const { data: inserted, error } = await supabase.from('nodes').insert(payload).select()
  const idx = allNodes.findIndex(n => n.id === tempId)
  if (!error && inserted?.[0]) {
    if (idx !== -1) allNodes[idx] = inserted[0]; else allNodes.unshift(inserted[0])
    saveNodesToCache(allNodes)
    renderAll(); showToast(`NODO INYECTADO: ${type.toUpperCase()}`)
  } else {
    const q = loadOfflineQueue(); q.push({ payload }); saveOfflineQueue(q)
    if (idx !== -1) allNodes[idx] = { ...tempNode, _offline: true }
    saveNodesToCache(allNodes)
    renderAll(); updateOfflineBar(); showToast('⚠️ Guardado localmente — se sincronizará al reconectar')
  }
}

// ── INSERT DIRECT NODE (bypasses parseNode — used for events, agenda items) ───
async function insertDirectNode(type, content, metadata) {
  const finalMeta = { comments: [], ...metadata }
  const tempId = '_tmp_' + Date.now()
  const tempNode = { id: tempId, type, content, metadata: finalMeta, created_at: new Date().toISOString(), _optimistic: true }
  allNodes.unshift(tempNode)
  renderAll()

  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    const idx = allNodes.findIndex(n => n.id === tempId)
    const perm = { ...tempNode, id: Math.random().toString(36).substr(2,9), _optimistic: false }
    if (idx !== -1) allNodes[idx] = perm; else allNodes.unshift(perm)
    renderAll(); showToast(`✅ ${content}`); return
  }
  const payload = { owner_id: currentUser.id, content, type, metadata: finalMeta }
  if (!navigator.onLine) {
    const q = loadOfflineQueue(); q.push({ payload }); saveOfflineQueue(q)
    const idx = allNodes.findIndex(n => n.id === tempId)
    if (idx !== -1) allNodes[idx] = { ...tempNode, _offline: true }
    renderAll(); updateOfflineBar(); showToast('📵 Sin conexión — guardado localmente'); return
  }
  const { data: inserted, error } = await supabase.from('nodes').insert(payload).select()
  const idx = allNodes.findIndex(n => n.id === tempId)
  if (!error && inserted?.[0]) {
    if (idx !== -1) allNodes[idx] = inserted[0]; else allNodes.unshift(inserted[0])
    renderAll(); showToast(`✅ ${content}`)
  } else {
    const q = loadOfflineQueue(); q.push({ payload }); saveOfflineQueue(q)
    if (idx !== -1) allNodes[idx] = { ...tempNode, _offline: true }
    renderAll(); updateOfflineBar(); showToast('⚠️ Guardado localmente')
  }
}

function showToast(msg) {
  const el = document.getElementById('node-msg')
  if (!el) return
  el.textContent = msg
  el.classList.remove('hidden')
  el.style.opacity = '1'
  clearTimeout(el._timeout)
  el._timeout = setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.classList.add('hidden'), 500)
  }, 3000)
}

function showMsg(text, type = 'info') {
  const el = document.getElementById('node-msg')
  if (!el) return
  const colors = { success: '#4ade80', error: '#f87171', warning: '#fbbf24', info: 'var(--accent-cyan)' }
  const t = text.startsWith('✓') ? 'success' : text.startsWith('⚠') ? 'warning' : text.startsWith('✕') ? 'error' : type
  el.style.background = colors[t] || colors.info
  el.style.color = (t === 'warning' || t === 'success') ? '#000' : '#fff'
  el.textContent = text
  el.classList.remove('hidden')
  el.style.opacity = '1'
  clearTimeout(el._timeout)
  el._timeout = setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.classList.add('hidden'), 500)
  }, 3000)
}

function showEnrichPrompt(id, name) {
  document.getElementById('enrich-prompt')?.remove()
  const el = document.createElement('div')
  el.id = 'enrich-prompt'
  el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--glass-bg);border:1px solid rgba(0,246,255,0.4);border-radius:14px;padding:14px 20px;z-index:9999;display:flex;align-items:center;gap:16px;box-shadow:0 8px 32px rgba(0,0,0,0.5);backdrop-filter:blur(20px);max-width:440px;width:calc(100% - 40px);animation:fadeInUp 0.3s ease;'
  el.innerHTML = `
    <div style="flex:1;">
      <div style="font-size:13px;color:var(--text-primary);font-weight:600;">🔧 ${esc(name)} guardado</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">¿Deseas ver y enriquecer la ficha completa?</div>
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      <button onclick="document.getElementById('enrich-prompt').remove()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text-muted);border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;">Ahora no</button>
      <button onclick="document.getElementById('enrich-prompt').remove();openContactSheet('${id}')" style="background:rgba(0,246,255,0.15);border:1px solid rgba(0,246,255,0.4);color:#00f6ff;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">Ver ficha →</button>
    </div>
  `
  document.body.appendChild(el)
  setTimeout(() => { if (el.parentNode) { el.style.opacity='0'; el.style.transition='opacity 0.5s'; setTimeout(()=>el.remove(),500) } }, 9000)
}

function showDemoBanner() {
  const banner = document.createElement('div')
  banner.style.cssText = 'position:fixed; top:0; left:var(--sidebar-width); right:var(--widget-width); background:rgba(234,179,8,0.2); color:#eab308; font-size:10px; font-weight:800; text-align:center; padding:4px; z-index:1000; border-bottom:1px solid rgba(234,179,8,0.3); backdrop-filter:blur(10px);'
  banner.innerHTML = 'MODO DEMO OPERATIVO — LOS CAMBIOS SON LOCALES'
  document.body.appendChild(banner)
}

// Spotlight Input
const nexusInput = document.getElementById('nexus-input')

// ── Placeholder rotativo — enseña la sintaxis sin tutoriales ────────────────────
const PLACEHOLDER_HINTS = [
  'Inyecta un pensamiento o comando...',
  '-$1200 cemento @efectivo #casatulum  →  💸 gasto vinculado al proyecto',
  '#tarea confirmar entrega de ventanas  →  📌 kanban',
  '+$25000 anticipo cliente @bbva  →  💰 ingreso',
  '#cotizacion $45000 eléctrico @casatulum  →  📄 cotización',
  '#proyecto Casa Tulum  →  🏗️ nuevo proyecto',
  '#persona Carlos García electricista  →  👤 contacto CRM',
  'reunión con el arquitecto mañana 9am  →  📝 nota libre',
]
let _phIdx = 0
;(function _cyclePlaceholder() {
  if (nexusInput && document.activeElement !== nexusInput && !nexusInput.value) {
    _phIdx = (_phIdx + 1) % PLACEHOLDER_HINTS.length
    nexusInput.placeholder = PLACEHOLDER_HINTS[_phIdx]
  }
  setTimeout(_cyclePlaceholder, 3800)
})()

// ── IDE AUTOCOMPLETE ENGINE ──────────────────────────────────────────────────
const IDE_COMMANDS = [
  { icon:'📌', prefix:'#tarea ',      tpl:'#tarea [descripción de la tarea]',             desc:'Tarea → Muro Táctico',    color:'#a78bfa', cat:'Comandos' },
  { icon:'💰', prefix:'+$',           tpl:'+$[monto] [descripción] @[cuenta]',             desc:'Ingreso → Bio-Finanzas',  color:'#4ade80', cat:'Comandos' },
  { icon:'💸', prefix:'-$',           tpl:'-$[monto] [desc] @[cuenta] #[proyecto]',        desc:'Gasto → Bio-Finanzas',    color:'#f87171', cat:'Comandos' },
  { icon:'📄', prefix:'#cotizacion ', tpl:'#cotizacion $[monto] [desc] @[proyecto]',       desc:'Cotización → Proyectos',  color:'#fb923c', cat:'Comandos' },
  { icon:'🏗️', prefix:'#proyecto ',  tpl:'#proyecto [nombre del proyecto]',               desc:'Proyecto → Dashboard',    color:'#2dd4bf', cat:'Comandos' },
  { icon:'👤', prefix:'#persona ',    tpl:'#persona [nombre] — [empresa/rol]',             desc:'Contacto → CRM',          color:'#fdba74', cat:'Comandos' },
  { icon:'💡', prefix:'#idea ',       tpl:'#idea [descripción de la idea]',               desc:'Idea → Bóveda Neural',    color:'#fbbf24', cat:'Comandos' },
  { icon:'📅', prefix:'📅 ',          tpl:'📅 [evento] [fecha opcional]',                 desc:'Evento → Calendario',     color:'#34d399', cat:'Comandos' },
]

let ideIdx = -1   // currently highlighted suggestion index
let ideSuggestions = []

function buildIdeSuggestions(val) {
  const lower = val.toLowerCase()
  const results = []

  // Always filter/show commands
  IDE_COMMANDS.forEach(cmd => {
    const pfx = cmd.prefix.toLowerCase().replace(' ','')
    const inp = lower.replace(' ','')
    if (!val || inp.length <= cmd.prefix.length && cmd.prefix.toLowerCase().startsWith(inp)) {
      results.push({ ...cmd, _type: 'cmd' })
    }
  })

  // Account suggestions when @ appears
  if (val.includes('@')) {
    const afterAt = val.split('@').pop().toLowerCase()
    allNodes.filter(n => n.type === 'account').forEach(a => {
      const lbl = (a.metadata?.label || a.content)
      const key = lbl.toLowerCase().replace(/\s+/g,'')
      if (!afterAt || key.includes(afterAt.replace(/\s+/g,''))) {
        results.push({ icon: a.metadata?.icon || '🏦', prefix: '@'+key, tpl: '@'+lbl, desc: 'Cuenta bancaria', color:'#94a3b8', cat:'Cuentas', _type:'account', _key: key })
      }
    })
    // Contact wallets too
    allNodes.filter(n => n.type==='contact' && (n.metadata?.cType==='bank'||n.metadata?.cType==='crypto')).forEach(c => {
      const lbl = (c.metadata?.name || c.content)
      const key = lbl.toLowerCase().replace(/\s+/g,'')
      if (!afterAt || key.includes(afterAt.replace(/\s+/g,''))) {
        results.push({ icon: c.metadata?.cType==='bank'?'🏦':'₿', prefix:'@'+key, tpl:'@'+lbl, desc: c.metadata?.bank_name||c.metadata?.network||'Contacto', color:'#00f0ff', cat:'Contactos/Cuentas', _type:'contact_acct', _key: key })
      }
    })
  }

  // Contact suggestions for member fields and general text
  if (val.length >= 2 && !val.match(/^[+\-#📅]/)) {
    allNodes.filter(n => n.type==='contact').forEach(c => {
      const name = (c.metadata?.name || c.content)
      if (name.toLowerCase().includes(lower)) {
        results.push({ icon: c.metadata?.cType==='bank'?'🏦':c.metadata?.cType==='crypto'?'₿':'👤', prefix: name, tpl: name, desc: c.metadata?.company||c.metadata?.bank_name||c.metadata?.network||'Contacto', color: c.metadata?.color||'#00f0ff', cat:'Contactos', _type:'contact', _id: c.id })
      }
    })
  }

  // Tag autocomplete: detect # mid-input (after at least one char before it)
  const hashMatch = val.match(/#(\w*)$/)
  const isCommandStart = /^#(tarea|persona|proyecto|idea)\s/i.test(val)
  if (hashMatch && !isCommandStart && val.indexOf('#') > 0) {
    const partial = hashMatch[1].toLowerCase()
    const tagFreq = {}
    allNodes.forEach(n => {
      ;(n.metadata?.tags || []).forEach(t => {
        const tag = t.replace(/^#/, '').toLowerCase().trim()
        if (tag) tagFreq[tag] = (tagFreq[tag] || 0) + 1
      })
    })
    Object.entries(tagFreq)
      .filter(([t]) => !partial || t.startsWith(partial))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .forEach(([tag, freq]) => {
        const completed = val.replace(/#\w*$/, '#' + tag) + ' '
        results.push({
          icon: '🏷️',
          prefix: '#' + tag,
          tpl: completed,
          desc: `${freq} nodo${freq > 1 ? 's' : ''}`,
          color: '#a855f7',
          cat: 'Etiquetas',
          _type: 'tag',
          _tag: tag,
          _completed: completed
        })
      })
  }

  return results.slice(0, 12)
}

function renderIdeSuggest(val) {
  const box  = document.getElementById('ide-suggest')
  const list = document.getElementById('ide-suggest-list')
  if (!box || !list) return

  ideSuggestions = buildIdeSuggestions(val)
  ideIdx = -1

  if (!ideSuggestions.length || !val) { box.style.display = 'none'; return }

  list.innerHTML = ideSuggestions.map((s, i) => `
    <div class="ide-row" data-idx="${i}" onclick="selectIdeSuggestion(${i})"
      style="display:flex; align-items:center; gap:10px; padding:9px 14px; cursor:pointer; transition:background 0.1s; border-left:3px solid transparent;"
      onmouseover="highlightIde(${i})" onmouseout="">
      <span style="font-size:16px; flex-shrink:0;">${s.icon}</span>
      <div style="flex:1; min-width:0;">
        <div style="font-family:'JetBrains Mono',monospace; font-size:12px; color:${s.color}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(s.tpl)}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:1px;">${esc(s.desc)}</div>
      </div>
      <span style="font-size:10px; color:var(--text-dim); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; flex-shrink:0;">${s.cat}</span>
    </div>
  `).join('')

  box.style.display = 'block'
}

function highlightIde(idx) {
  document.querySelectorAll('.ide-row').forEach((r,i) => {
    r.style.background = i===idx ? 'rgba(0,246,255,0.08)' : ''
    r.style.borderLeftColor = i===idx ? 'var(--accent-cyan)' : 'transparent'
  })
  ideIdx = idx
}

window.selectIdeSuggestion = function(idx) {
  const s = ideSuggestions[idx]
  if (!s || !nexusInput) return
  const val = nexusInput.value
  if (s._type === 'account' || s._type === 'contact_acct') {
    nexusInput.value = val.replace(/@[\w]*$/, '@' + s._key) + ' '
  } else if (s._type === 'tag') {
    nexusInput.value = s._completed
  } else if (s._type === 'contact') {
    nexusInput.value = s.tpl
  } else {
    nexusInput.value = s.prefix
  }
  nexusInput.focus()
  const box = document.getElementById('ide-suggest')
  if (box) box.style.display = 'none'
  ideSuggestions = []; ideIdx = -1
  // Re-trigger input to show updated preview
  nexusInput.dispatchEvent(new Event('input'))
}

window.injectAccount = (tag) => {
  if (nexusInput && !nexusInput.value.includes('@')) nexusInput.value = nexusInput.value.trim() + ' ' + tag + ' '
  nexusInput.focus()
  const box = document.getElementById('ide-suggest')
  if (box) box.style.display = 'none'
}

nexusInput?.addEventListener('input', () => {
  const val = nexusInput.value.trim()
  const preview = document.getElementById('parser-preview')

  // IDE suggestions
  renderIdeSuggest(val)

  // Parser preview
  if (preview) {
    if (!val) { preview.style.display = 'none'; return }
    const { type, metadata } = parseNode(val)
    const cfg = {
      income:   { label:`↑ INGRESO $${metadata.amount||'?'}${metadata.account_hint?' @'+metadata.account_hint:''}`, bg:'rgba(74,222,128,0.08)', border:'rgba(74,222,128,0.3)', color:'#4ade80' },
      expense:  { label:`↓ GASTO $${metadata.amount||'?'}${metadata.account_hint?' @'+metadata.account_hint:''}`,   bg:'rgba(248,113,113,0.08)', border:'rgba(248,113,113,0.3)', color:'#f87171' },
      kanban:   { label:'📌 TAREA → Pendiente',         bg:'rgba(96,165,250,0.08)',  border:'rgba(96,165,250,0.3)',  color:'#60a5fa' },
      persona:  { label:'👤 CONTACTO → CRM',             bg:'rgba(251,191,36,0.08)',  border:'rgba(251,191,36,0.3)',  color:'#fbbf24' },
      proyecto: { label:'📁 PROYECTO → Bóveda Neural',   bg:'rgba(168,85,247,0.08)',  border:'rgba(168,85,247,0.3)',  color:'#a855f7' },
      note:     { label:'💡 NOTA LIBRE → Bóveda Neural', bg:'rgba(148,163,184,0.06)', border:'rgba(148,163,184,0.2)', color:'#94a3b8' },
    }
    const c = cfg[type] || cfg.note
    const extras = []
    if (metadata.priority) extras.push(`⚑ ${String(metadata.priority).toUpperCase()}`)
    const detectedDate = metadata.due_date || metadata.date_deadline || metadata.date
    if (detectedDate) extras.push(`📅 ${detectedDate}`)
    const extraStr = extras.length ? `  |  ${extras.join('  ')}` : ''
    preview.textContent = `${c.label}${extraStr}   ↵ Enter para guardar`
    preview.style.cssText = `display:block; position:absolute; bottom:calc(100% + 0px); left:0; right:0; padding:7px 18px; font-size:11px; font-weight:600; font-family:'JetBrains Mono',monospace; border-radius:12px 12px 0 0; border:1px solid ${c.border}; border-bottom:none; background:${c.bg}; color:${c.color}; letter-spacing:0.04em; pointer-events:none; z-index:10;`
  }
})

nexusInput?.addEventListener('keydown', e => {
  const box = document.getElementById('ide-suggest')
  const isOpen = box && box.style.display !== 'none' && ideSuggestions.length > 0

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (isOpen) { highlightIde(Math.min(ideIdx+1, ideSuggestions.length-1)) }
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (isOpen) { highlightIde(Math.max(ideIdx-1, 0)) }
    return
  }
  if ((e.key === 'Tab' || e.key === 'ArrowRight') && isOpen && ideIdx >= 0) {
    e.preventDefault()
    selectIdeSuggestion(ideIdx)
    return
  }
  if (e.key === 'Escape' && isOpen) {
    e.preventDefault()
    if (box) box.style.display = 'none'; ideSuggestions = []; ideIdx = -1
    return
  }
  if (e.key === 'Enter') {
    if (isOpen && ideIdx >= 0) {
      e.preventDefault()
      selectIdeSuggestion(ideIdx)
      return
    }
    const val = nexusInput.value.trim()
    if (!val) return
    insertNodeRaw(val)
    const wrapper = document.querySelector('.spotlight-wrapper')
    if (wrapper) { wrapper.classList.add('command-success'); setTimeout(() => wrapper.classList.remove('command-success'), 500) }
    nexusInput.value = ''
    if (box) box.style.display = 'none'
    ideSuggestions = []; ideIdx = -1
    const preview = document.getElementById('parser-preview')
    if (preview) preview.style.display = 'none'
  }
})

// Close IDE suggest when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#spotlight-container')) {
    const box = document.getElementById('ide-suggest')
    if (box) box.style.display = 'none'
    ideSuggestions = []; ideIdx = -1
  }
})

// ── Helpers & Rendering ──────────────────
function getFilteredNodes() {
  let nodes = allNodes
  if (activeTypeFilter) nodes = nodes.filter(n => n.type === activeTypeFilter)
  if (!currentFilter) return nodes
  const q = currentFilter.toLowerCase()
  return nodes.filter(n =>
    n.content.toLowerCase().includes(q) ||
    (n.metadata?.tags || []).some(t => t.toLowerCase() === q) ||
    (n.metadata?.label || '').toLowerCase().includes(q) ||
    n.type.toLowerCase().includes(q)
  )
}

window.setTypeFilter = (type) => { activeTypeFilter = activeTypeFilter === type ? null : type; renderAll() }
window.toggleFeedGroup = () => { feedGrouped = !feedGrouped; renderAll() }

// ═══════════════════════════════════════════════════════════
// PANEL DE COMANDOS — Dashboard General
// ═══════════════════════════════════════════════════════════
function renderPanelDashboard() {
  const root = document.getElementById('panel-dashboard-root')
  if (!root) return

  const esc = (s='') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const fmtM = (n) => '$' + Math.abs(n||0).toLocaleString('es-MX',{maximumFractionDigits:0})

  const today    = new Date()
  const todayStr = today.toISOString().slice(0,10)
  const monthNow = todayStr.slice(0,7)

  // ── Design tokens ─────────────────────────────────────────
  const NX_CARD  = 'background:var(--surface,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:16px;'
  const NX_HEAD  = 'font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;'

  // ── A) Global KPIs ────────────────────────────────────────
  const allTxs = allNodes.filter(n => n.type==='income' || n.type==='expense')
  const accounts = allNodes.filter(n => n.type==='account')
  const initBals = accounts.reduce((s,a)=>s+(a.metadata?.balance||0),0)
  const totalInc = allTxs.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const totalExp = allTxs.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const netTotal = initBals + totalInc - totalExp
  const netClr   = netTotal >= 0 ? '#2dd4bf' : '#f87171'

  const monthTxs = allTxs.filter(n => (n.metadata?.date||'').startsWith(monthNow))
  const monthInc = monthTxs.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const monthExp = monthTxs.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)

  const tareasActivas  = allNodes.filter(n=>n.type==='kanban'&&n.metadata?.status!=='done').length
  const proyectosCount = allNodes.filter(n=>n.type==='proyecto').length

  const ISVG = {
    net:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    inc:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    exp:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    tasks: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`,
    proj:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    users: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
    card:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    grid:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  }

  const kpiData = [
    { icon:ISVG.net,   label:'NETO TOTAL',    val:fmtM(netTotal),    color:netClr,    note:netTotal>=0?'flujo positivo':'déficit' },
    { icon:ISVG.inc,   label:'INGRESOS MES',  val:'+'+fmtM(monthInc),color:'#4ade80', note:monthTxs.filter(n=>n.type==='income').length+' movimientos' },
    { icon:ISVG.exp,   label:'GASTOS MES',    val:'-'+fmtM(monthExp),color:'#f87171', note:monthTxs.filter(n=>n.type==='expense').length+' movimientos' },
    { icon:ISVG.tasks, label:'TAREAS ACTIVAS',val:tareasActivas,     color:'#60a5fa', note:'en progreso' },
    { icon:ISVG.proj,  label:'PROYECTOS',     val:proyectosCount,    color:'#a78bfa', note:'registrados' },
  ]

  const kpiStrip = `<div style="display:flex;gap:0;margin-bottom:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;overflow-x:auto;">
    ${kpiData.map((k,i) => `<div style="flex:1;min-width:100px;padding:14px 12px;${i>0?'border-left:1px solid rgba(255,255,255,0.06);':''}">
      <div style="color:${k.color};margin-bottom:6px;opacity:0.9;">${k.icon}</div>
      <div style="font-size:9px;font-weight:800;letter-spacing:.07em;color:var(--text-muted,#64748b);margin-bottom:4px;text-transform:uppercase;">${k.label}</div>
      <div style="font-size:15px;font-weight:900;color:${k.color};font-family:'JetBrains Mono',monospace;line-height:1.1;">${k.val}</div>
      <div style="font-size:9px;color:var(--text-dim,#475569);margin-top:3px;">${k.note}</div>
    </div>`).join('')}
  </div>`

  // ── B) Próximos pagos fijos ───────────────────────────────
  const bills = allNodes
    .filter(n => (n.type==='bill'||n.type==='subscription') && !n.metadata?.paid)
    .map(n => {
      const day = n.metadata?.dayOfMonth
      const freq = n.metadata?.frequency || 'mensual'
      const mos  = {mensual:1,bimestral:2,trimestral:3,semestral:6,anual:12}[freq]||1
      if (!day) return null
      let next = new Date(today.getFullYear(), today.getMonth(), day)
      while (next <= today) next.setMonth(next.getMonth()+mos)
      return { n, daysLeft: Math.ceil((next-today)/86400000) }
    })
    .filter(Boolean)
    .sort((a,b)=>a.daysLeft-b.daysLeft)
    .slice(0,5)

  const billsHTML = bills.length ? bills.map(({n,daysLeft}) => {
    const amt = n.metadata?.amount
    const clr = daysLeft<=3?'#f87171':daysLeft<=7?'#fb923c':'#94a3b8'
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div style="min-width:36px;text-align:center;flex-shrink:0;">
        <div style="font-size:15px;font-weight:900;color:${clr};font-family:'JetBrains Mono',monospace;line-height:1;">${daysLeft}</div>
        <div style="font-size:8px;color:${clr};font-weight:700;text-transform:uppercase;">${daysLeft===1?'día':'días'}</div>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary,#f0f6fc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n.metadata?.label||n.content)}</div>
        <div style="font-size:10px;color:var(--text-dim,#475569);">${n.metadata?.frequency||'mensual'}</div>
      </div>
      <div style="font-size:12px;font-weight:800;color:${clr};font-family:'JetBrains Mono',monospace;flex-shrink:0;">${amt!=null?fmtM(amt):'Variable'}</div>
    </div>`
  }).join('') : `<div style="font-size:12px;color:var(--text-dim,#475569);padding:16px 0;text-align:center;opacity:.7;">Sin pagos próximos</div>`

  // ── C) Proyectos activos ──────────────────────────────────
  const proyectos = allNodes.filter(n=>n.type==='proyecto').slice(0,4)
  const projHTML = proyectos.length ? proyectos.map(p => {
    const m = p.metadata||{}
    const label = m.label||p.content
    const budget = +(m.budget||0)
    const slug   = m.project_slug||''
    const tags   = [(m.label||'').toLowerCase(), slug.toLowerCase()].filter(Boolean)
    const cots   = allNodes.filter(n=>n.type==='cotizacion'&&tags.some(t=>(n.metadata?.project_tag||'').toLowerCase()===t))
    const comp   = cots.reduce((s,c)=>s+(+c.metadata?.amount||0),0)
    const pct    = budget>0 ? Math.min(100,Math.round(comp/budget*100)) : 0
    const barClr = pct>90?'#f87171':pct>60?'#fb923c':'#4ade80'
    const miles  = allNodes.filter(n=>n.type==='milestone'&&tags.some(t=>(n.metadata?.project_tag||'').toLowerCase()===t))
    const mDone  = miles.filter(n=>n.metadata?.done).length
    return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" onclick="openProjectView('${p.id}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <div style="flex:1;font-size:12px;font-weight:700;color:var(--text-primary,#f0f6fc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</div>
        ${budget>0?`<span style="font-size:10px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${barClr};flex-shrink:0;">${pct}%</span>`:''}
        ${miles.length>0?`<span style="font-size:10px;color:var(--text-dim,#475569);flex-shrink:0;">${mDone}/${miles.length}</span>`:''}
      </div>
      <div style="height:3px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;">
        ${budget>0?`<div style="height:100%;width:${pct}%;background:${barClr};border-radius:2px;transition:width .5s;"></div>`:
          `<div style="height:100%;width:100%;background:rgba(255,255,255,0.05);border-radius:2px;"></div>`}
      </div>
    </div>`
  }).join('') : `<div style="font-size:12px;color:var(--text-dim,#475569);padding:16px 0;text-align:center;opacity:.7;">Sin proyectos registrados</div>`

  // ── D) Cuentas ────────────────────────────────────────────
  const accHTML = accounts.length ? accounts.map(a => {
    const inc = allTxs.filter(n=>n.type==='income' &&n.metadata?.account_id===a.id).reduce((s,n)=>s+(n.metadata?.amount||0),0)
    const exp = allTxs.filter(n=>n.type==='expense'&&n.metadata?.account_id===a.id).reduce((s,n)=>s+(n.metadata?.amount||0),0)
    const bal = (a.metadata?.balance||0)+inc-exp
    const clr = a.metadata?.color||'#4ade80'
    const neg = bal<0
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;" onclick="switchView('finance');setTimeout(()=>setActiveAccount('${a.id}'),200)">
      <span style="width:8px;height:8px;border-radius:50%;background:${neg?'#f87171':clr};flex-shrink:0;"></span>
      <span style="flex:1;font-size:12px;font-weight:600;color:var(--text-primary,#f0f6fc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.metadata?.label||a.content)}</span>
      <span style="font-size:12px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${neg?'#f87171':clr};flex-shrink:0;">${neg?'-':''}${fmtM(Math.abs(bal))}</span>
    </div>`
  }).join('') : `<div style="font-size:12px;color:var(--text-dim,#475569);padding:16px 0;text-align:center;opacity:.7;">Sin cuentas — crea una en Bio-Finanzas</div>`

  // ── E) Deudas a proveedores ───────────────────────────────
  const debtMap = {}
  allNodes.filter(n=>n.type==='cotizacion'&&!['rechazada','pagada'].includes(n.metadata?.status||'')).forEach(cot => {
    const pid = cot.metadata?.provider_id; if(!pid) return
    const prov = allNodes.find(n=>n.id===pid); if(!prov) return
    const saldo = Math.max(0, (+cot.metadata?.amount||0) - (cot.metadata?.abonos||[]).reduce((s,a)=>s+(+a.amount||0),0))
    if(saldo<=0) return
    if(!debtMap[pid]) debtMap[pid] = { name: prov.metadata?.name||prov.content||'?', saldo:0 }
    debtMap[pid].saldo += saldo
  })
  const debts = Object.values(debtMap).sort((a,b)=>b.saldo-a.saldo).slice(0,4)
  const debtHTML = debts.length ? debts.map(d => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div style="width:28px;height:28px;border-radius:50%;background:rgba(251,146,60,0.14);color:#fb923c;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;">${esc(d.name.charAt(0).toUpperCase())}</div>
      <span style="flex:1;font-size:12px;font-weight:600;color:var(--text-primary,#f0f6fc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.name)}</span>
      <span style="font-size:12px;font-weight:900;font-family:'JetBrains Mono',monospace;color:#f87171;flex-shrink:0;">${fmtM(d.saldo)}</span>
    </div>`).join('')
  : `<div style="font-size:12px;color:var(--text-dim,#475569);padding:16px 0;text-align:center;opacity:.7;">Sin saldos pendientes 🎉</div>`

  // ── Render ────────────────────────────────────────────────
  root.innerHTML = `
    ${kpiStrip}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="${NX_CARD}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          ${ISVG.clock.replace('stroke="currentColor"','stroke="#fb923c"')}
          <span style="${NX_HEAD}color:#fb923c;">Próximos pagos</span>
          ${bills.length?`<span style="margin-left:auto;font-size:10px;color:#fb923c;font-weight:700;background:rgba(251,146,60,0.1);border-radius:8px;padding:1px 7px;">${bills.length}</span>`:''}
        </div>
        ${billsHTML}
      </div>
      <div style="${NX_CARD}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          ${ISVG.grid.replace('stroke="currentColor"','stroke="#a78bfa"')}
          <span style="${NX_HEAD}color:#a78bfa;">Proyectos activos</span>
          ${proyectos.length?`<span style="margin-left:auto;font-size:10px;color:#a78bfa;font-weight:700;background:rgba(167,139,250,0.1);border-radius:8px;padding:1px 7px;">${proyectos.length}</span>`:''}
          <button onclick="switchView('proyectos')" style="font-size:10px;color:#a78bfa;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:6px;padding:2px 8px;cursor:pointer;margin-left:auto;">Ver todos</button>
        </div>
        ${projHTML}
      </div>
      <div style="${NX_CARD}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          ${ISVG.card.replace('stroke="currentColor"','stroke="#2dd4bf"')}
          <span style="${NX_HEAD}color:#2dd4bf;">Cuentas</span>
          <button onclick="switchView('finance')" style="margin-left:auto;font-size:10px;color:#2dd4bf;background:rgba(45,212,191,0.08);border:1px solid rgba(45,212,191,0.2);border-radius:6px;padding:2px 8px;cursor:pointer;">Bio-Finanzas</button>
        </div>
        ${accHTML}
      </div>
      <div style="${NX_CARD}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          ${ISVG.users.replace('stroke="currentColor"','stroke="#f87171"')}
          <span style="${NX_HEAD}color:#f87171;">A quién se debe</span>
          ${debts.length?`<span style="margin-left:auto;font-size:10px;color:#f87171;font-weight:700;background:rgba(248,113,113,0.1);border-radius:8px;padding:1px 7px;">${debts.length}</span>`:''}
        </div>
        ${debtHTML}
      </div>
    </div>`
}
window.renderPanelDashboard = renderPanelDashboard

// ── Mapa de renders por vista — lazy render (Phase C) ───────────────────────────
const VIEW_RENDER_MAP = {
  feed:      (nodes) => { renderPanelDashboard(); renderFeed(nodes); renderFilterBar() },
  kanban:    (nodes) => renderKanban(nodes),
  notes:     (nodes) => renderNotes(nodes),
  finance:   (nodes) => renderFinance(nodes),
  calendar:  (nodes) => renderCalendar(nodes),
  cronica:   (nodes) => renderCronica(nodes),
  contacts:  ()      => renderContacts(),
  agenda:    ()      => renderAgenda(allNodes),
  proyectos: ()      => renderProyectos(),
}

function renderAll() {
  // safe wrapper — un fallo en una sección no bloquea las demás
  const safe = (fn, ...args) => {
    try { fn(...args) } catch (e) { console.warn('[renderAll]', fn.name || '?', e) }
  }
  const nodes = getFilteredNodes()
  // Siempre: stats globales, alertas, búsqueda
  safe(updateStats, nodes)
  safe(checkHabitAlerts)
  if (typeof buildFuseIndex === 'function') safe(buildFuseIndex)
  // Feed siempre: semáforo y pulso son widgets del panel principal
  safe(renderSemaforoCuentas)
  safe(renderPulsoSemanal)
  // Lazy: solo renderiza la vista activa
  const viewFn = VIEW_RENDER_MAP[activeView]
  if (viewFn) safe(viewFn, nodes)
  else {
    // Fallback: render todas las vistas conocidas para vistas no mapeadas (tags, herramientas…)
    safe(renderFeed, nodes); safe(renderFilterBar)
    safe(renderKanban, nodes); safe(renderNotes, nodes)
    safe(renderFinance, nodes); safe(renderCalendar, nodes)
    safe(renderCronica, nodes); safe(renderContacts)
    safe(renderAgenda, allNodes)
  }
}

function renderFilterBar() {
  const container = document.getElementById('view-feed') // O donde quieras mostrarlo
  const existing = document.getElementById('active-filter-msg')
  if (existing) existing.remove()
  
  if (currentFilter) {
    const bar = document.createElement('div')
    bar.id = 'active-filter-msg'
    bar.className = 'filter-active-bar'
    bar.innerHTML = `<span>Filtrando por: <b>${currentFilter}</b></span><span onclick="clearFilter()" style="cursor:pointer; margin-left:auto;">✕</span>`
    container.insertBefore(bar, container.querySelector('.feed-container'))
  }
}

window.clearFilter = () => { currentFilter = null; activeTypeFilter = null; renderAll(); }
window.setFilter = (tag) => { currentFilter = tag; renderAll(); }

function updateStats(nodes) {
  const inc = allNodes.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const exp = allNodes.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  document.getElementById('dominance-balance').textContent = `$${(inc-exp).toLocaleString()}`
  document.getElementById('w-nodes-count').textContent = allNodes.filter(n=>n.type==='kanban').length
}

// TYPE_FILTERS — movido al bloque de constantes (antes del boot IIFE)

function feedItemHtml(n) {
  const tc = TYPE_CONFIG[n.type] || { label:`#${n.type.toUpperCase()}`, color:'var(--accent-cyan)', border:'rgba(0,246,255,0.3)', bg:'rgba(0,246,255,0.04)' }
  const amount = (n.type === 'income' || n.type === 'expense') && n.metadata?.amount
    ? `<span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:${tc.color};flex-shrink:0;">${n.type==='income'?'+':'-'}$${n.metadata.amount.toLocaleString()}</span>` : ''
  const timeStr = n.created_at ? `${new Date(n.created_at).getHours().toString().padStart(2,'0')}:${new Date(n.created_at).getMinutes().toString().padStart(2,'0')}` : '--:--'
  const newPulse = n._optimistic ? ' nexus-new-pulse' : ''
  // ── inline SVG micro-icons for feed actions ───────────────────────────────
  const _svgEdit  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
  const _svgFolder= `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
  const _svgCheck = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  const _svgX     = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  const _badgeBg  = tc.border.replace('0.4','0.10').replace('0.3','0.10')
  return `
    <div class="feed-item${newPulse}" data-node-id="${n.id}" style="border-left:3px solid ${tc.border};background:${tc.bg};" onclick="openCardModal('${n.id}')">
      <span class="feed-time">${timeStr}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${tc.color};background:${_badgeBg};padding:2px 8px;border-radius:4px;flex-shrink:0;">
        <span style="width:5px;height:5px;border-radius:50%;background:${tc.color};flex-shrink:0;"></span>${tc.label}
      </span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;color:#f0f6fc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n.metadata?.label || n.content)}</div>
        <div style="margin-top:3px;display:flex;gap:5px;flex-wrap:wrap;">
          ${(n.metadata?.tags||[]).filter(t=>t.toLowerCase()!==`#${n.type.toLowerCase()}`).map(t=>`<span style="background:${_badgeBg};color:${tc.color};font-size:9px;padding:1px 5px;border-radius:3px;cursor:pointer;" onclick="event.stopPropagation();setFilter('${t}')">${t}</span>`).join('')}
        </div>
      </div>
      ${amount}
      ${n.type==='proyecto' ? `
        <span onclick="event.stopPropagation();openProyectoModal('${n.id}')" title="Editar proyecto" style="display:inline-flex;align-items:center;justify-content:center;color:#2dd4bf;cursor:pointer;padding:5px;flex-shrink:0;width:24px;height:24px;border-radius:6px;background:rgba(45,212,191,0.08);border:1px solid rgba(45,212,191,0.18);">${_svgEdit}</span>
        <span onclick="event.stopPropagation();openProjectView('${n.id}')" title="Vista de Proyecto" style="display:inline-flex;align-items:center;justify-content:center;color:#60a5fa;cursor:pointer;padding:5px;flex-shrink:0;width:24px;height:24px;border-radius:6px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.18);">${_svgFolder}</span>
      ` : ''}
      ${n.type==='cotizacion' ? (() => {
        const st = n.metadata?.status || 'pendiente'
        const stCfg = COT_STATUS[st] || COT_STATUS.pendiente
        const amt = n.metadata?.amount ? `<span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:#fb923c;flex-shrink:0;font-size:12px;">$${(+n.metadata.amount).toLocaleString('es-MX')}</span>` : ''
        const statusBadge = `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:800;letter-spacing:.06em;padding:2px 7px;border-radius:4px;background:${stCfg.color}1a;color:${stCfg.color};flex-shrink:0;"><span style="width:4px;height:4px;border-radius:50%;background:${stCfg.color};"></span>${stCfg.label}</span>`
        const quickBtns = st !== 'aceptada' ? `<span onclick="event.stopPropagation();changeCotizacionStatus('${n.id}','aceptada')" title="Aceptar" style="display:inline-flex;align-items:center;justify-content:center;color:#4ade80;cursor:pointer;width:24px;height:24px;border-radius:6px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.18);flex-shrink:0;">${_svgCheck}</span>` : ''
        const editBtn = `<span onclick="event.stopPropagation();openCotizacionModal('${n.id}')" title="Editar" style="display:inline-flex;align-items:center;justify-content:center;color:#fb923c;cursor:pointer;width:24px;height:24px;border-radius:6px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.18);flex-shrink:0;">${_svgEdit}</span>`
        return amt + statusBadge + quickBtns + editBtn
      })() : ''}
      <span onclick="event.stopPropagation();if(confirm('¿Eliminar?')){deleteNode('${n.id}')}" title="Eliminar" style="display:inline-flex;align-items:center;justify-content:center;color:var(--text-dim);cursor:pointer;width:22px;height:22px;border-radius:5px;flex-shrink:0;opacity:0.5;transition:opacity 0.15s;" onmouseenter="this.style.opacity=1;this.style.color='#f87171'" onmouseleave="this.style.opacity=0.5;this.style.color='var(--text-dim)'">${_svgX}</span>
    </div>`
}

function renderFeed(nodes) {
  const root = document.getElementById('feed-root')
  if (!root) return

  // Stats del feed
  const total = allNodes.length
  const counts = {}
  TYPE_FILTERS.forEach(f => { counts[f.type] = allNodes.filter(n=>n.type===f.type).length })

  // Barra de filtros tipo tabla dinámica
  const filterBar = `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;">FILTRAR</span>
        <button onclick="clearFilter()" style="border:1px solid ${!activeTypeFilter&&!currentFilter?'var(--accent-cyan)':'var(--glass-border)'};background:${!activeTypeFilter&&!currentFilter?'rgba(0,246,255,0.12)':'transparent'};color:${!activeTypeFilter&&!currentFilter?'var(--accent-cyan)':'var(--text-muted)'};border-radius:20px;padding:4px 12px;font-size:10px;font-weight:800;cursor:pointer;">
          TODOS <span style="opacity:0.6;">(${total})</span>
        </button>
        ${TYPE_FILTERS.filter(f=>counts[f.type]>0).map(f=>`
          <button onclick="setTypeFilter('${f.type}')" style="border:1px solid ${activeTypeFilter===f.type?f.color:'var(--glass-border)'};background:${activeTypeFilter===f.type?f.color+'22':'transparent'};color:${activeTypeFilter===f.type?f.color:'var(--text-muted)'};border-radius:20px;padding:4px 12px;font-size:10px;font-weight:800;cursor:pointer;transition:all 0.15s;">
            ${f.label} <span style="opacity:0.6;">(${counts[f.type]})</span>
          </button>`).join('')}
        <button onclick="toggleFeedGroup()" style="margin-left:auto;border:1px solid ${feedGrouped?'var(--accent-cyan)':'var(--glass-border)'};background:${feedGrouped?'rgba(0,246,255,0.1)':'transparent'};color:${feedGrouped?'var(--accent-cyan)':'var(--text-muted)'};border-radius:20px;padding:4px 12px;font-size:10px;font-weight:800;cursor:pointer;" title="Agrupar por tipo">
          ${feedGrouped?'⊞ Agrupado':'⊟ Agrupar'}
        </button>
      </div>
      ${currentFilter?`<div style="display:flex;align-items:center;gap:8px;background:rgba(0,246,255,0.06);border:1px solid rgba(0,246,255,0.2);border-radius:10px;padding:8px 14px;font-size:12px;color:var(--accent-cyan);">
        <span>🔍 Buscando: <b>${currentFilter}</b></span>
        <span onclick="clearFilter()" style="cursor:pointer;margin-left:auto;color:var(--text-muted);">✕ Limpiar</span>
      </div>`:''}
    </div>`

  if (nodes.length === 0) {
    root.innerHTML = filterBar + `<div style="text-align:center;color:var(--text-muted);padding:60px 20px;">
      <div style="font-size:40px;margin-bottom:12px;">🔍</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:6px;">Sin resultados</div>
      <div style="font-size:12px;">Prueba otro filtro o borra la búsqueda</div>
    </div>`
    return
  }

  let content = ''
  if (feedGrouped) {
    // Agrupar por tipo
    const groups = {}
    nodes.forEach(n => { if (!groups[n.type]) groups[n.type] = []; groups[n.type].push(n) })
    content = Object.entries(groups).map(([type, items]) => {
      const f = TYPE_FILTERS.find(f=>f.type===type)
      const tc = TYPE_CONFIG[type] || {}
      return `
        <div style="margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--glass-border);">
            <span style="font-size:10px;font-weight:800;color:${f?.color||'var(--accent-cyan)'};letter-spacing:1.5px;">${f?.label||type.toUpperCase()}</span>
            <span style="font-size:10px;color:var(--text-dim);background:var(--glass-border);border-radius:10px;padding:1px 8px;">${items.length}</span>
          </div>
          ${items.map(feedItemHtml).join('')}
        </div>`
    }).join('')
  } else {
    content = nodes.map(feedItemHtml).join('')
  }

  root.innerHTML = filterBar + content

  // Scroll to top when a new optimistic node appears
  if (nodes.some(n => n._optimistic)) {
    const feedSection = document.getElementById('view-feed')
    if (feedSection?.classList.contains('active')) root.scrollTop = 0
  }
}

window.deleteNode = async (id) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  // Proyectos require typed confirmation — prevent accidental cascade delete
  if (node.type === 'proyecto') {
    const projectName = (node.metadata?.label || node.content || '').trim()
    const typed = window.prompt(`⚠️ Esto eliminará el proyecto "${projectName}" de forma permanente.\n\nEscribe el nombre exacto del proyecto para confirmar:`)
    if (typed?.trim() !== projectName) { showToast('❌ Nombre incorrecto — operación cancelada.'); return }
  } else {
    if (!confirm('¿Eliminar este elemento?')) return
  }
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes = allNodes.filter(n => n.id !== id)
  } else {
    await supabase.from('nodes').delete().eq('id', id)
    allNodes = allNodes.filter(n => n.id !== id)
  }
  renderAll()
}

window.changeNodeType = async (id, newType) => {
  const node = allNodes.find(n => n.id === id)
  if (node) {
    node.type = newType
    if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
      await supabase.from('nodes').update({ type: newType }).eq('id', id)
    }
    renderAll()
  }
}

function renderNotes(nodes) {
  const root = document.getElementById('notes-root')
  if (!root) return
  const notes = nodes
    .filter(n => {
      if (n.type !== 'note' && n.type !== 'persona') return false
      if (n.type === 'note' && n.metadata?.project_tag) return false
      return true
    })
    .sort((a, b) => (b.metadata?.pinned ? 1 : 0) - (a.metadata?.pinned ? 1 : 0))

  root.innerHTML = notes.map(n => {
    const color = n.metadata?.color || ''
    const colorStyle = NOTE_COLORS[color] || ''
    const isPinned = n.metadata?.pinned
    const ntc = TYPE_CONFIG[n.type] || { color:'var(--accent-cyan)', label:`#${n.type.toUpperCase()}` }
    const _svgPin = `<svg width="11" height="11" viewBox="0 0 24 24" fill="${isPinned?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>`
    return `
    <div class="note-keep" style="${colorStyle}" ondblclick="openNoteEdit('${n.id}')" title="Doble clic para editar">
      <div class="note-keep-inner">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${ntc.color};background:${ntc.color}18;padding:2px 7px;border-radius:4px;"><span style="width:4px;height:4px;border-radius:50%;background:${ntc.color};flex-shrink:0;"></span>${ntc.label}</span>
          <span title="${isPinned ? 'Desfijar' : 'Fijar'}"
                onclick="event.stopPropagation(); togglePin('${n.id}')"
                style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:${isPinned?'#fb923c':'var(--text-dim)'};opacity:${isPinned?'1':'0.35'};width:22px;height:22px;border-radius:5px;${isPinned?'background:rgba(251,146,60,0.1);':''}">${_svgPin}</span>
        </div>
        <div class="note-keep-title">${esc(n.metadata?.label || n.content)}</div>
        <div class="note-keep-body">${esc(n.content)}</div>
        <div style="display:flex; gap:4px; flex-wrap:wrap; flex-shrink:0;">
          ${(n.metadata?.tags || []).map(t => `<span class="tag-pill" onclick="event.stopPropagation(); setFilter('${t}')" style="background:var(--accent-cyan-dim); color:var(--accent-cyan); font-size:9px; padding:1px 5px; border-radius:4px; cursor:pointer;">${t}</span>`).join('')}
        </div>
        <div class="note-color-bar" onclick="event.stopPropagation()">
          ${Object.keys(NOTE_COLORS).filter(c=>c).map(c=>`
            <div title="${c}" onclick="setNoteColor('${n.id}','${c}')" style="${NOTE_COLORS[c]} width:14px; height:14px; border-radius:50%; border:2px solid ${color===c?'white':'transparent'}; cursor:pointer; display:inline-block; box-sizing:border-box;"></div>
          `).join('')}
          <div title="Sin color" onclick="setNoteColor('${n.id}','')" style="width:14px; height:14px; border-radius:50%; border:2px solid ${color===''?'white':'rgba(255,255,255,0.2)'}; cursor:pointer; display:inline-block; background:transparent;"></div>
        </div>
      </div>
    </div>
  `}).join('')
}

window.togglePin = async (id) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  node.metadata = { ...(node.metadata || {}), pinned: !node.metadata?.pinned }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', id)
  }
  renderAll()
}

window.setNoteColor = async (id, color) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  node.metadata = { ...(node.metadata || {}), color }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', id)
  }
  renderAll()
}

// ── Rich text editor builder ─────────────────────────────────────────────────
const _richEditors = {}

function buildRichEditor(textareaId, toolbarContainerId) {
  const textarea = document.getElementById(textareaId)
  if (!textarea || _richEditors[textareaId]) return
  // Create toolbar
  const toolbar = document.getElementById(toolbarContainerId)
  if (!toolbar) return
  const TOOLS = [
    { cmd:'bold',        icon:'<b>B</b>',    title:'Negrita (Ctrl+B)' },
    { cmd:'italic',      icon:'<i>I</i>',    title:'Cursiva (Ctrl+I)' },
    { cmd:'underline',   icon:'<u>U</u>',    title:'Subrayado (Ctrl+U)' },
    { cmd:'strikeThrough',icon:'<s>S</s>',   title:'Tachado' },
    { sep: true },
    { cmd:'insertUnorderedList', icon:'≡',   title:'Lista con viñetas' },
    { cmd:'insertOrderedList',   icon:'⊟',   title:'Lista numerada' },
    { sep: true },
    { cmd:'foreColor',   icon:'A',   title:'Color de texto', type:'color' },
    { cmd:'hiliteColor', icon:'✱',   title:'Resaltar', type:'color', color:'#fbbf24' },
    { sep: true },
    { cmd:'createLink',  icon:'🔗',  title:'Hipervínculo', type:'prompt', prompt:'URL del enlace:' },
    { cmd:'insertImage', icon:'📷',  title:'Imagen (URL)', type:'prompt', prompt:'URL de la imagen:' },
  ]
  toolbar.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:6px 8px;background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:8px 8px 0 0;border-bottom:none;'
  TOOLS.forEach(t => {
    if (t.sep) {
      const sep = document.createElement('div')
      sep.style.cssText = 'width:1px;height:18px;background:rgba(255,255,255,0.1);margin:0 2px;'
      toolbar.appendChild(sep)
      return
    }
    if (t.type === 'color') {
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;'
      const lbl = document.createElement('label')
      lbl.title = t.title
      lbl.style.cssText = 'width:26px;height:26px;border-radius:5px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);cursor:pointer;display:grid;place-items:center;font-size:12px;font-family:inherit;'
      lbl.innerHTML = t.icon
      const inp = document.createElement('input')
      inp.type = 'color'
      inp.value = t.color || '#ffffff'
      inp.style.cssText = 'position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;'
      inp.addEventListener('input', () => { editor.focus(); document.execCommand(t.cmd, false, inp.value) })
      lbl.appendChild(inp)
      wrap.appendChild(lbl)
      toolbar.appendChild(wrap)
    } else {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.title = t.title
      btn.innerHTML = t.icon
      btn.style.cssText = 'width:26px;height:26px;border-radius:5px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text-muted);cursor:pointer;font-size:12px;font-family:inherit;display:grid;place-items:center;'
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        editor.focus()
        if (t.type === 'prompt') {
          const val = prompt(t.prompt)
          if (val) document.execCommand(t.cmd, false, val)
        } else {
          document.execCommand(t.cmd, false, null)
        }
      })
      toolbar.appendChild(btn)
    }
  })
  // Create contenteditable editor
  const editor = document.createElement('div')
  editor.contentEditable = 'true'
  editor.style.cssText = textarea.style.cssText || ''
  editor.style.cssText += ';min-height:120px;outline:none;padding:10px 12px;background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:0 0 8px 8px;color:var(--text-primary);font-size:14px;line-height:1.6;overflow-y:auto;'
  editor.innerHTML = textarea.value || ''
  // Sync editor → textarea on every input
  editor.addEventListener('input', () => { textarea.value = editor.innerHTML })
  editor.addEventListener('blur', () => { textarea.value = editor.innerHTML })
  // Insert editor after textarea, hide textarea
  textarea.style.display = 'none'
  textarea.parentNode.insertBefore(toolbar, textarea)
  textarea.parentNode.insertBefore(editor, textarea.nextSibling)
  _richEditors[textareaId] = editor
}

function syncRichEditor(textareaId) {
  const editor = _richEditors[textareaId]
  const textarea = document.getElementById(textareaId)
  if (editor && textarea) editor.innerHTML = textarea.value || ''
}

window.openNoteEdit = (id) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  if (node.type === 'kanban') { openCardModal(id); return }
  editingNoteId = id
  const m = node.metadata || {}
  document.getElementById('ne-title').value = m.label || node.content
  document.getElementById('ne-body').value = node.content
  const tagsEl = document.getElementById('ne-tags')
  if (tagsEl) tagsEl.value = (m.tags || []).join(' ')
  renderAttachments(node.metadata.images || [], 'note')
  const noteOverlay = document.getElementById('note-edit-modal')
  noteOverlay.classList.remove('hidden')
  // Initialize rich editor (idempotent)
  buildRichEditor('ne-body', 'ne-toolbar')
  syncRichEditor('ne-body')
  // Open fullscreen by default for comfortable editing
  const modalBox = noteOverlay.querySelector('.modal-box')
  if (modalBox && !modalBox.classList.contains('fullscreen')) {
    modalBox.classList.add('fullscreen')
    const btn = document.getElementById('note-toggle-size')
    if (btn) btn.textContent = '🗗'
  }
}

window.closeNoteModal = () => {
  // Always remove fullscreen before hiding to avoid broken state on reopen
  const modalBox = document.querySelector('#note-edit-modal .modal-box')
  if (modalBox) modalBox.classList.remove('fullscreen')
  const fsBtn = document.getElementById('note-toggle-size')
  if (fsBtn) fsBtn.textContent = '🔲'
  document.getElementById('note-edit-modal').classList.add('hidden')
  const panel = document.getElementById('transform-panel')
  if (panel) panel.style.display = 'none'
  pendingTransformType = null
  editingNoteId = null
}

// Toggle note editor between normal and fullscreen modes
function toggleNoteSize() {
  const modalBox = document.querySelector('#note-edit-modal .modal-box')
  if (!modalBox) return
  const isFs = modalBox.classList.toggle('fullscreen')
  const btn = document.getElementById('note-toggle-size')
  if (btn) btn.textContent = isFs ? '🗗' : '🔲'
  // Reset inline styles when exiting fullscreen so CSS takes over cleanly
  if (!isFs) {
    const body = document.getElementById('ne-body')
    if (body) { body.style.flex = ''; body.style.height = ''; body.style.minHeight = ''; body.style.resize = '' }
    modalBox.style.display = ''
    modalBox.style.flexDirection = ''
  }
}
window.toggleNoteSize = toggleNoteSize;


document.getElementById('ne-save')?.addEventListener('click', async () => {
  const node = allNodes.find(n => n.id === editingNoteId)
  if (!node) return
  const title = document.getElementById('ne-title').value.trim()
  const body  = document.getElementById('ne-body').value.trim()
  const tagsRaw = document.getElementById('ne-tags')?.value || ''
  const tags = tagsRaw.split(/\s+/).filter(t => t.startsWith('#'))
  node.content = body
  node.metadata = { ...(node.metadata||{}), label: title, tags }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ content: body, metadata: node.metadata }).eq('id', editingNoteId)
  }
  closeNoteModal()
  renderAll()
})

document.getElementById('ne-delete')?.addEventListener('click', async () => {
  const node = allNodes.find(n => n.id === editingNoteId)
  if (!node) return
  // Proyectos require typed confirmation to prevent accidental cascade delete
  if (node.type === 'proyecto') {
    const projectName = (node.metadata?.label || node.content || '').trim()
    const typed = window.prompt(`⚠️ Esto eliminará el proyecto "${projectName}" de forma permanente.\n\nEscribe el nombre exacto del proyecto para confirmar:`)
    if (typed?.trim() !== projectName) { showToast('❌ Nombre incorrecto — operación cancelada.'); return }
  } else {
    if (!confirm('¿Eliminar esta nota?')) return
  }
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes = allNodes.filter(n => n.id !== editingNoteId)
  } else {
    await supabase.from('nodes').delete().eq('id', editingNoteId)
    allNodes = allNodes.filter(n => n.id !== editingNoteId)
  }
  closeNoteModal()
  renderAll()
})

window.showTransformPanel = (targetType) => {
  pendingTransformType = targetType
  const panel = document.getElementById('transform-panel')
  const amtInput = document.getElementById('tp-amount')
  const dateInput = document.getElementById('tp-date')
  if (!panel) return
  panel.style.display = 'flex'
  amtInput.style.display = (targetType === 'income' || targetType === 'expense') ? 'block' : 'none'
  dateInput.style.display = (targetType === 'calendar') ? 'block' : 'none'
  if (targetType === 'calendar') dateInput.value = new Date().toISOString().split('T')[0]
  if (targetType === 'kanban' || targetType === 'contact') confirmTransform()
}

window.confirmTransform = async () => {
  const id = editingNoteId
  const targetType = pendingTransformType
  const node = allNodes.find(n => n.id === id)
  if (!node || !targetType) return

  if (targetType === 'kanban') {
    node.type = 'kanban'
    node.metadata = { ...node.metadata, label: node.metadata?.label || node.content, status: 'todo' }
  } else if (targetType === 'income') {
    const amt = parseFloat(document.getElementById('tp-amount')?.value || '0')
    node.type = 'income'
    node.metadata = { ...node.metadata, amount: amt, label: node.metadata?.label || node.content }
  } else if (targetType === 'expense') {
    const amt = parseFloat(document.getElementById('tp-amount')?.value || '0')
    node.type = 'expense'
    node.metadata = { ...node.metadata, amount: amt, label: node.metadata?.label || node.content }
  } else if (targetType === 'calendar') {
    const date = document.getElementById('tp-date')?.value || new Date().toISOString().split('T')[0]
    node.type = 'kanban'
    node.metadata = { ...node.metadata, label: node.metadata?.label || node.content, due_date: date, status: 'todo' }
  } else if (targetType === 'contact') {
    const name = node.metadata?.label || node.metadata?.name || node.content
    node.type = 'contact'
    node.metadata = { ...node.metadata, cType: 'persona', name, label: name, color: node.metadata?.color || '#fdba74' }
  }

  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ type: node.type, metadata: node.metadata }).eq('id', id)
  }
  pendingTransformType = null
  closeNoteModal()
  renderAll()
}

// ─────────────────────────────────────────
// Bio-Finanzas
// ─────────────────────────────────────────
function renderFinance(nodes) {
  const root = document.getElementById('finance-root')
  if (!root) return

  const accounts = nodes.filter(n => n.type === 'account')
  // Unified FinancialEngine
  const txs = getTransactions(nodes, activeAccount)
  const _initBalForCalc = (activeAccount !== 'all')
    ? (accounts.find(a => a.id === activeAccount)?.metadata?.balance || 0)
    : 0
  const { income, expense } = calcBalance(txs, _initBalForCalc)

  const accountTabsHtml = `
    <div class="fin-tabs" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:20px;">
      <button class="fin-tab ${activeAccount==='all'?'fin-tab-active':''}" onclick="setActiveAccount('all')">Todas las Cuentas</button>
      ${accounts.map(a=>`
        <div style="display:inline-flex; align-items:center; gap:0; background:${activeAccount===a.id?'rgba(0,246,255,0.15)':'rgba(255,255,255,0.04)'}; border:1px solid ${activeAccount===a.id?'var(--accent-cyan)':'var(--glass-border)'}; border-radius:10px; overflow:hidden;">
          <button class="fin-tab" style="border:none; background:transparent; border-radius:0; padding:8px 12px;" onclick="setActiveAccount('${a.id}')">
            <span style="width:8px;height:8px;border-radius:50%;background:${esc(a.metadata?.color||'#4ade80')};display:inline-block;margin-right:6px;"></span>
            ${esc(a.metadata?.label||a.content)}
          </button>
          <button onclick="openAccountModal('${a.id}')" style="background:transparent; border:none; border-left:1px solid var(--glass-border); padding:8px 10px; cursor:pointer; color:var(--text-muted); font-size:13px;" title="Editar cuenta" onmouseover="this.style.color='var(--accent-cyan)'" onmouseout="this.style.color='var(--text-muted)'">✏️</button>
        </div>
      `).join('')}
      <button class="fin-tab" onclick="openAccountModal()" style="border-style:dashed;">+ Cuenta</button>
    </div>
  `

  const net = income - expense
  const activeAcc   = accounts.find(a => a.id === activeAccount)
  const initBalance = activeAccount !== 'all' ? (activeAcc?.metadata?.balance || 0) : 0
  const accBalance  = activeAccount !== 'all' ? initBalance + income - expense : net

  // ── Reactive finance-hero ──────────────────────────────────────
  const heroLabel = document.getElementById('dominance-label')
  const heroBalance = document.getElementById('dominance-balance')
  if (heroLabel && heroBalance) {
    if (activeAccount === 'all') {
      heroLabel.textContent = 'Balance Neto Consolidado'
      heroBalance.textContent = `$${net.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})}`
    } else {
      const accName = activeAcc?.metadata?.label || activeAcc?.content || 'Cuenta'
      heroLabel.textContent = `Balance • ${accName}`
      heroBalance.textContent = `$${accBalance.toLocaleString('es-MX', {minimumFractionDigits:2, maximumFractionDigits:2})}`
    }
  }

  // ── DASHBOARD "TODAS LAS CUENTAS" ─────────────────────────────
  let statsHtml = ''
  if (activeAccount === 'all') {
    // Fila de tarjetas por cuenta (una por cada cuenta registrada)
    const allTxs = nodes.filter(n => n.type==='income'||n.type==='expense'||n.type==='loan')
    const accountCards = accounts.length > 0
      ? accounts.map(a => {
          const aInc  = allTxs.filter(n=>n.type==='income'  && n.metadata?.account_id===a.id).reduce((s,n)=>s+(n.metadata?.amount||0),0)
          const aExp  = allTxs.filter(n=>n.type==='expense' && n.metadata?.account_id===a.id).reduce((s,n)=>s+(n.metadata?.amount||0),0)
          const aInit = a.metadata?.balance || 0
          const aBal  = aInit + aInc - aExp
          const aClr  = a.metadata?.color || '#4ade80'
          const aBg   = aBal >= 0 ? `${aClr}12` : 'rgba(248,113,113,0.08)'
          const aBdr  = aBal >= 0 ? `${aClr}30` : 'rgba(248,113,113,0.25)'
          const aBalClr = aBal >= 0 ? aClr : '#f87171'
          return `<div onclick="setActiveAccount('${a.id}')" style="cursor:pointer;background:${aBg};border:1px solid ${aBdr};border-radius:14px;padding:16px 18px;transition:transform 0.15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="width:10px;height:10px;border-radius:50%;background:${aClr};flex-shrink:0;"></span>
              <span style="font-size:11px;font-weight:800;color:${aClr};letter-spacing:0.5px;">${esc(a.metadata?.label||a.content)}</span>
            </div>
            <div style="font-size:20px;font-weight:800;color:${aBalClr};font-family:'JetBrains Mono',monospace;margin-bottom:6px;">${aBal>=0?'+':''}\$${aBal.toLocaleString()}</div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);">
              <span>↑ $${aInc.toLocaleString()}</span>
              <span>↓ $${aExp.toLocaleString()}</span>
            </div>
          </div>`
        }).join('')
      : `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px;font-size:12px;">Sin cuentas. Crea una con <b>+ Cuenta</b></div>`

    // Top 3 categorías de gasto (por tags)
    const tagTotals = {}
    allTxs.filter(n=>n.type==='expense').forEach(n => {
      ;(n.metadata?.tags||[]).forEach(t => {
        if (!tagTotals[t]) tagTotals[t] = 0
        tagTotals[t] += n.metadata?.amount || 0
      })
    })
    const topTags = Object.entries(tagTotals).sort((a,b)=>b[1]-a[1]).slice(0,3)
    const topTagsHtml = topTags.length > 0
      ? topTags.map(([tag, amt]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
          <span style="font-size:11px;color:var(--text-muted);">${tag}</span>
          <span style="font-size:11px;font-weight:700;color:#f87171;font-family:'JetBrains Mono',monospace;">-$${amt.toLocaleString()}</span>
        </div>`).join('')
      : '<div style="font-size:11px;color:var(--text-dim);">Sin datos de categorías</div>'

    const consolidatedInc = allTxs.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
    const consolidatedExp = allTxs.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
    const consolidatedNet = consolidatedInc - consolidatedExp
    const cNetClr = consolidatedNet >= 0 ? '#00f6ff' : '#fb923c'

    // ── SVG icons para Bio-Finanzas ───────────────────────────
    const FI = {
      inc:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      exp:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
      net:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
      card: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
      tag:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
      list: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
      move: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="7" height="7"/><rect x="1" y="14" width="7" height="7"/><line x1="21" y1="6" x2="9" y2="6"/><line x1="21" y1="17" x2="9" y2="17"/></svg>`,
    }
    const NX_KPI = (color) => `background:${color}0d;border:1px solid ${color}28;border-radius:14px;padding:16px;`
    const NX_LBL = (color) => `font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${color};margin-bottom:6px;display:flex;align-items:center;gap:6px;`
    const NX_VAL = (color) => `font-size:20px;font-weight:900;color:${color};font-family:'JetBrains Mono',monospace;line-height:1.1;`

    statsHtml = `
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        <span style="font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);">Balance por cuenta</span>
        <span style="font-size:10px;color:var(--text-dim);margin-left:4px;">— clic para ver detalle</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px;">
        ${accountCards}
      </div>
      <div style="display:flex;gap:0;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;">
        <div style="flex:1;padding:16px 14px;border-right:1px solid rgba(255,255,255,0.06);">
          <div style="${NX_LBL('#4ade80')}"><span style="color:#4ade80;">${FI.inc}</span>Total ingresos</div>
          <div id="fin-kpi-income" style="${NX_VAL('#4ade80')}">+$${consolidatedInc.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${allTxs.filter(n=>n.type==='income').length} transacciones</div>
        </div>
        <div style="flex:1;padding:16px 14px;border-right:1px solid rgba(255,255,255,0.06);">
          <div style="${NX_LBL('#f87171')}"><span style="color:#f87171;">${FI.exp}</span>Total gastos</div>
          <div id="fin-kpi-expense" style="${NX_VAL('#f87171')}">-$${consolidatedExp.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${allTxs.filter(n=>n.type==='expense').length} transacciones</div>
        </div>
        <div style="flex:1;padding:16px 14px;">
          <div style="${NX_LBL(consolidatedNet>=0?'#2dd4bf':'#fb923c')}"><span style="color:${consolidatedNet>=0?'#2dd4bf':'#fb923c'};">${FI.net}</span>Neto consolidado</div>
          <div id="fin-kpi-net" style="${NX_VAL(consolidatedNet>=0?'#2dd4bf':'#fb923c')}">${consolidatedNet>=0?'+':''}\$${consolidatedNet.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${consolidatedNet>=0?'Flujo positivo':'Déficit acumulado'}</div>
        </div>
      </div>
      ${topTags.length > 0 ? `<div style="margin-top:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          Top categorías de gasto
        </div>
        ${topTagsHtml}
      </div>` : ''}
    </div>`

  } else {
    // ── DASHBOARD CUENTA ESPECÍFICA ────────────────────────────────
    const aClr = activeAcc?.metadata?.color || '#60a5fa'
    const txCount = txs.length
    const avgExp  = txs.filter(n=>n.type==='expense').length > 0
      ? expense / txs.filter(n=>n.type==='expense').length : 0
    const maxTx   = [...txs].sort((a,b)=>(b.metadata?.amount||0)-(a.metadata?.amount||0))[0]
    const balClr  = accBalance >= 0 ? aClr : '#f87171'
    const balBg   = accBalance >= 0 ? `${aClr}0d` : 'rgba(248,113,113,0.06)'
    const balBdr  = accBalance >= 0 ? `${aClr}30` : 'rgba(248,113,113,0.25)'

    const FI2 = {
      inc:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
      exp:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5" stroke-linecap="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
      card: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${balClr}" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
      move: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="3" width="7" height="7"/><rect x="1" y="14" width="7" height="7"/><line x1="21" y1="6" x2="9" y2="6"/><line x1="21" y1="17" x2="9" y2="17"/></svg>`,
    }
    const NX_LBL2 = (c) => `font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${c};margin-bottom:6px;display:flex;align-items:center;gap:6px;`
    const NX_VAL2 = (c) => `font-size:20px;font-weight:900;color:${c};font-family:'JetBrains Mono',monospace;line-height:1.1;`

    statsHtml = `
    <div style="display:flex;gap:0;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;overflow:hidden;margin-bottom:24px;">
      <div style="flex:1.2;padding:18px 16px;border-right:1px solid rgba(255,255,255,0.06);">
        <div style="${NX_LBL2(balClr)}">${FI2.card} Saldo actual</div>
        <div id="fin-kpi-net" style="${NX_VAL2(balClr)}">${accBalance>=0?'+':''}\$${accBalance.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">Inicial: $${initBalance.toLocaleString()}</div>
      </div>
      <div style="flex:1;padding:18px 16px;border-right:1px solid rgba(255,255,255,0.06);">
        <div style="${NX_LBL2('#4ade80')}">${FI2.inc} Ingresos</div>
        <div id="fin-kpi-income" style="${NX_VAL2('#4ade80')}">+$${income.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${txs.filter(n=>n.type==='income').length} mov.</div>
      </div>
      <div style="flex:1;padding:18px 16px;border-right:1px solid rgba(255,255,255,0.06);">
        <div style="${NX_LBL2('#f87171')}">${FI2.exp} Gastos</div>
        <div id="fin-kpi-expense" style="${NX_VAL2('#f87171')}">-$${expense.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">Prom: $${Math.round(avgExp).toLocaleString()}</div>
      </div>
      <div style="flex:1;padding:18px 16px;">
        <div style="${NX_LBL2('#a78bfa')}">${FI2.move} Movimientos</div>
        <div style="${NX_VAL2('#a78bfa')}">${txCount}</div>
        ${maxTx ? `<div style="font-size:10px;color:var(--text-dim);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Mayor: ${esc(maxTx.metadata?.label||maxTx.content)}">Mayor: $${(maxTx.metadata?.amount||0).toLocaleString()}</div>` : ''}
      </div>
    </div>`
  }

  // ── TRANSACTIONS TABLE ──────────────────────────────────────────────────────
  const sortedTxs = [...txs].sort((a, b) => {
    const da = a.metadata?.date || a.metadata?.fecha || a.created_at || ''
    const db = b.metadata?.date || b.metadata?.fecha || b.created_at || ''
    return db.localeCompare(da)
  })

  // Running balance — unified FinancialEngine
  const initBal = activeAccount !== 'all' ? (accounts.find(a=>a.id===activeAccount)?.metadata?.balance || 0) : 0
  const txsWithBalance = buildRunningBalance(txs, initBal)

  const txTableHtml = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <span style="font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);">Movimientos (${txsWithBalance.length})</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button onclick="window.printFinanceReport()" style="font-size:11px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);color:#60a5fa;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">🖨 Imprimir reporte</button>
      <button onclick="openTransactionModal()" style="font-size:11px;background:rgba(0,246,255,0.1);border:1px solid rgba(0,246,255,0.3);color:var(--accent-cyan);border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">+ Movimiento</button>
    </div>
  </div>
  <div style="overflow-x:auto;">
    <table id="finance-tx-table" style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:rgba(255,255,255,0.04);">
          <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);">Fecha</th>
          <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);">Concepto</th>
          <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);">Cuenta</th>
          <th style="text-align:right;padding:8px 10px;color:#4ade80;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);">Entrada</th>
          <th style="text-align:right;padding:8px 10px;color:#f87171;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);">Salida</th>
          <th style="text-align:right;padding:8px 10px;color:var(--text-muted);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);">Saldo</th>
          <th style="text-align:center;padding:8px 10px;color:var(--text-muted);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);">Comprobante</th>
          <th style="text-align:center;padding:8px 10px;color:var(--text-muted);font-weight:700;border-bottom:1px solid rgba(255,255,255,0.08);"></th>
        </tr>
      </thead>
      <tbody>
      ${txsWithBalance.length === 0
        ? `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim);">Sin movimientos. Registra un ingreso o gasto.</td></tr>`
        : txsWithBalance.map(tx => {
            const m = tx.metadata || {}
            const isIncome = tx.type === 'income'
            const isExpense = tx.type === 'expense'
            const amt = m.amount || 0
            const rawDate = m.date || m.fecha || tx.created_at || ''
            const date = rawDate ? (() => { try { return new Date(rawDate.includes('T') ? rawDate : rawDate + 'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'}) } catch(e){ return rawDate.slice(0,10) } })() : '—'
            const concept = m.description || m.label || tx.content || '—'
            const accountName = accounts.find(a=>a.id===m.account_id)?.metadata?.label || m.account_id || '—'
            const bal = tx._runningBalance
            const balClr = bal >= 0 ? '#4ade80' : '#f87171'
            const comprobante = m.comprobante_url || m.receipt_url || ''
            const tags = (m.tags||[]).join(' ')
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.1s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
              <td style="padding:8px 10px;color:var(--text-muted);white-space:nowrap;">${date}</td>
              <td style="padding:8px 10px;color:var(--text-primary);max-width:200px;">
                <div style="font-weight:600;">${esc(concept)}</div>
                ${tags ? `<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${esc(tags)}</div>` : ''}
              </td>
              <td style="padding:8px 10px;color:var(--text-muted);font-size:11px;white-space:nowrap;">${esc(accountName)}</td>
              <td style="padding:8px 10px;text-align:right;color:#4ade80;font-weight:700;font-family:'JetBrains Mono',monospace;">${isIncome ? '+$' + amt.toLocaleString('es-MX',{minimumFractionDigits:2}) : ''}</td>
              <td style="padding:8px 10px;text-align:right;color:#f87171;font-weight:700;font-family:'JetBrains Mono',monospace;">${isExpense ? '-$' + amt.toLocaleString('es-MX',{minimumFractionDigits:2}) : ''}</td>
              <td style="padding:8px 10px;text-align:right;color:${balClr};font-weight:700;font-family:'JetBrains Mono',monospace;">${activeAccount !== 'all' ? (bal>=0?'+':'')+' $'+bal.toLocaleString('es-MX',{minimumFractionDigits:2}) : ''}</td>
              <td style="padding:8px 10px;text-align:center;">
                ${comprobante ? `<a href="${esc(comprobante)}" target="_blank" style="color:var(--accent-cyan);font-size:12px;text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Ver comprobante">🔗 Ver</a>` : '<span style="color:var(--text-dim);font-size:11px;">—</span>'}
              </td>
              <td style="padding:8px 10px;text-align:center;">
                <button onclick="openFinanceDetail('${tx.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;" title="Editar" onmouseover="this.style.color='var(--accent-cyan)'" onmouseout="this.style.color='var(--text-dim)'">✏️</button>
              </td>
            </tr>`
          }).join('')}
      </tbody>
    </table>
  </div>`

  // Charts toggle button in actions
  const chartsBtn = `<button class="fin-action-btn" id="fin-charts-toggle" onclick="toggleFinanceCharts()" style="background:${finChartsVisible?'rgba(0,246,255,0.15)':'rgba(255,255,255,0.05)'};color:${finChartsVisible?'var(--accent-cyan)':'var(--text-muted)'};">📊 Gráficos</button>`
  const actionsHtmlFull = `
    <div style="display:flex; gap:10px; margin-bottom:24px; flex-wrap:wrap;">
      <button class="fin-action-btn" onclick="openTransferModal()">⇄ Transferir</button>
      <button class="fin-action-btn" onclick="openLoanModal()">💸 Préstamo</button>
      <button class="fin-action-btn" onclick="exportFinanceCSV()">⬇ CSV</button>
      <button class="fin-action-btn" onclick="exportFinancePDF()">🖨 PDF</button>
      ${chartsBtn}
    </div>
  `

  // Charts panel (3 canvases)
  const chartsHtml = `
    <div id="finance-charts-panel" style="display:${finChartsVisible?'grid':'none'};grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:28px;">
      <div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:16px;padding:18px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;margin-bottom:14px;">INGRESOS VS GASTOS · ÚLTIMOS 6 MESES</div>
        <canvas id="chart-bar" style="max-height:220px;"></canvas>
      </div>
      <div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:16px;padding:18px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;margin-bottom:14px;">DISTRIBUCIÓN DE GASTOS</div>
        <canvas id="chart-donut" style="max-height:220px;"></canvas>
      </div>
      <div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:16px;padding:18px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;margin-bottom:14px;">PATRIMONIO NETO · HISTORIAL</div>
        <canvas id="chart-line" style="max-height:220px;"></canvas>
      </div>
    </div>
  `

  root.innerHTML = accountTabsHtml + statsHtml + actionsHtmlFull + chartsHtml +
    `<div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:16px;padding:24px;">${txTableHtml}</div>`

  // Animate KPI numbers
  animateStatEl('fin-kpi-income',  income)
  animateStatEl('fin-kpi-expense', expense)
  animateStatEl('fin-kpi-net',     net)

  // Render charts after DOM is painted — filtradas por cuenta activa
  if (finChartsVisible) {
    const chartNodes = activeAccount === 'all' ? nodes : nodes.filter(n => n.metadata?.account_id === activeAccount || n.type === 'account')
    setTimeout(() => renderFinanceCharts(chartNodes), 0)
  }
}

window.setActiveAccount = (id) => {
  activeAccount = id
  renderAll()
}

window.openTransactionModal = () => {
  const inp = document.getElementById('nexus-input')
  if (inp) { inp.focus(); inp.placeholder = '+$1000 Salario   ó   -$200 Renta' }
}

window.printFinanceReport = () => {
  const table = document.getElementById('finance-tx-table')
  if (!table) { showMsg('⚠ Sin datos para imprimir'); return }
  const accLabel = activeAccount === 'all' ? 'Todas las cuentas' :
    (allNodes.find(n=>n.id===activeAccount)?.metadata?.label || activeAccount)
  const date = new Date().toLocaleDateString('es-MX', {year:'numeric',month:'long',day:'numeric'})
  const win = window.open('', '_blank', 'width=900,height=700')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Reporte Financiero — ${accLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f0f0; padding: 8px 10px; text-align: left; font-weight: 700; border-bottom: 2px solid #ccc; }
      td { padding: 7px 10px; border-bottom: 1px solid #eee; }
      .income { color: #16a34a; font-weight: 700; }
      .expense { color: #dc2626; font-weight: 700; }
      .balance { font-weight: 700; }
      @media print { body { padding: 16px; } button { display: none; } }
    </style>
  </head><body>
    <h1>📊 Reporte Financiero</h1>
    <div class="meta">Cuenta: <strong>${accLabel}</strong> — Generado: ${date} — Nexus OS</div>
    ${table.outerHTML}
    <div style="margin-top:24px;font-size:11px;color:#999;">Generado con Nexus OS · nexus-os-chi.vercel.app</div>
    <script>window.onload=()=>window.print()<\\/script>
  </body></html>`)
  win.document.close()
}

window.exportFinanceCSV = () => {
  const txs = allNodes.filter(n => n.type==='income' || n.type==='expense')
  const accounts = allNodes.filter(n => n.type==='account')
  const rows = txs.map(n => {
    const acc = accounts.find(a => a.id === n.metadata?.account_id)
    return [
      new Date(n.created_at).toLocaleDateString('es-MX'),
      n.type === 'income' ? 'Ingreso' : 'Gasto',
      JSON.stringify(n.metadata?.label || n.content),
      n.metadata?.amount || 0,
      acc ? (acc.metadata?.label || acc.content) : 'General'
    ].join(',')
  })
  const csv = '\ufeff' + ['Fecha,Tipo,Descripción,Monto,Cuenta', ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `nexus-finanzas-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
}

// Export finance view as PDF (account‑specific)
window.exportFinancePDF = function exportFinancePDF() {
  // Mostrar modal de filtros antes de imprimir
  const accounts = allNodes.filter(n => n.type === 'account')
  const modal = document.getElementById('print-filter-modal')
  if (!modal) return
  // Llenar selector de cuentas
  const acSel = document.getElementById('pf-account')
  if (acSel) {
    acSel.innerHTML = '<option value="all">Todas las cuentas</option>' +
      accounts.map(a=>`<option value="${a.id}">${esc(a.metadata?.label||a.content)}</option>`).join('')
    if (activeAccount !== 'all') acSel.value = activeAccount
  }
  // Fechas por defecto: primer día del mes actual → hoy
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0,7) + '-01'
  const pfFrom = document.getElementById('pf-from')
  const pfTo   = document.getElementById('pf-to')
  if (pfFrom && !pfFrom.value) pfFrom.value = firstOfMonth
  if (pfTo   && !pfTo.value)   pfTo.value   = today
  modal.classList.remove('hidden')
}

window.doPrint = function doPrint() {
  const pfAccount = document.getElementById('pf-account')?.value || 'all'
  const pfType    = document.getElementById('pf-type')?.value    || 'all'
  const pfFrom    = document.getElementById('pf-from')?.value    || ''
  const pfTo      = document.getElementById('pf-to')?.value      || ''
  document.getElementById('print-filter-modal')?.classList.add('hidden')

  // Filtrar nodos para imprimir
  let printNodes = allNodes.filter(n => n.type === 'income' || n.type === 'expense')
  if (pfAccount !== 'all') printNodes = printNodes.filter(n => n.metadata?.account_id === pfAccount)
  if (pfType !== 'all')    printNodes = printNodes.filter(n => n.type === pfType)
  if (pfFrom) printNodes = printNodes.filter(n => (n.metadata?.fecha||n.created_at?.split('T')[0]||'') >= pfFrom)
  if (pfTo)   printNodes = printNodes.filter(n => (n.metadata?.fecha||n.created_at?.split('T')[0]||'') <= pfTo)

  const accounts = allNodes.filter(n => n.type === 'account')
  const accLabel = pfAccount === 'all' ? 'Todas las cuentas' : (accounts.find(a=>a.id===pfAccount)?.metadata?.label || pfAccount)
  const income  = printNodes.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const expense = printNodes.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)

  // Inyectar contenido en #print-zone y hacer window.print()
  let printZone = document.getElementById('print-zone')
  if (!printZone) { printZone = document.createElement('div'); printZone.id = 'print-zone'; document.body.appendChild(printZone) }
  printZone.innerHTML = `
    <div style="font-family:'JetBrains Mono',monospace; padding:32px; max-width:900px; margin:0 auto;">
      <h1 style="font-size:20px; margin-bottom:4px;">Nexus OS — Estado de Cuenta</h1>
      <p style="color:#666; font-size:12px; margin-bottom:4px;">Cuenta: ${accLabel} | Período: ${pfFrom||'inicio'} → ${pfTo||'hoy'}</p>
      <p style="color:#666; font-size:12px; margin-bottom:24px;">Generado: ${new Date().toLocaleString('es-MX')}</p>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:24px;">
        <thead>
          <tr style="border-bottom:2px solid #333;">
            <th style="text-align:left; padding:8px 4px;">Fecha</th>
            <th style="text-align:left; padding:8px 4px;">Descripción</th>
            <th style="text-align:left; padding:8px 4px;">Cuenta</th>
            <th style="text-align:right; padding:8px 4px;">Entrada</th>
            <th style="text-align:right; padding:8px 4px;">Salida</th>
          </tr>
        </thead>
        <tbody>
          ${printNodes.map(n=>{
            const acc = accounts.find(a=>a.id===n.metadata?.account_id)
            const fecha = n.metadata?.fecha || n.created_at?.split('T')[0] || ''
            return `<tr style="border-bottom:1px solid #eee;">
              <td style="padding:6px 4px;">${fecha}</td>
              <td style="padding:6px 4px;">${esc(n.metadata?.label||n.content)}</td>
              <td style="padding:6px 4px;">${esc(acc?.metadata?.label||acc?.content||'-')}</td>
              <td style="text-align:right; padding:6px 4px; color:${n.type==='income'?'green':''};">${n.type==='income'?'$'+n.metadata?.amount?.toLocaleString():''}</td>
              <td style="text-align:right; padding:6px 4px; color:${n.type==='expense'?'red':''};">${n.type==='expense'?'$'+n.metadata?.amount?.toLocaleString():''}</td>
            </tr>`
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid #333; font-weight:bold;">
            <td colspan="3" style="padding:10px 4px;">TOTALES (${printNodes.length} movimientos)</td>
            <td style="text-align:right; padding:10px 4px; color:green;">$${income.toLocaleString()}</td>
            <td style="text-align:right; padding:10px 4px; color:red;">$${expense.toLocaleString()}</td>
          </tr>
          <tr style="font-weight:bold; background:#f9f9f9;">
            <td colspan="4" style="padding:10px 4px;">SALDO NETO</td>
            <td style="text-align:right; padding:10px 4px; color:${income-expense>=0?'green':'red'};">${income-expense>=0?'+':''}\$${(income-expense).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>`

  // Añadir CSS de impresión temporal
  const style = document.createElement('style')
  style.id = 'print-override'
  style.textContent = `@media print { body > *:not(#print-zone) { display:none !important; } #print-zone { display:block !important; } }`
  document.head.appendChild(style)
  setTimeout(() => {
    window.print()
    setTimeout(() => { style.remove(); printZone.innerHTML = '' }, 800)
  }, 200)
}

// Account Modal

// Render currency conversion widget in sidebar
function renderCurrencyWidget() {
  const container = document.getElementById('sidebar-currencies')
  if (!container) return
  container.innerHTML = `
    <div class="widget-box">
      <span class="widget-label">Conversor de Monedas Fiat</span>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <input type="number" id="currency-amount" class="modal-input" placeholder="Monto" style="flex:1;" />
        <select id="currency-from" class="modal-input" style="width:70px;">
          <option value="USD">USD</option>
          <option value="MXN">MXN</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="JPY">JPY</option>
        </select>
        <select id="currency-to" class="modal-input" style="width:70px;">
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="JPY">JPY</option>
        </select>
      </div>
      <button class="btn-ghost" style="width:100%;" onclick="convertCurrency()">Convertir</button>
      <div id="currency-result" style="font-size:13px; color:var(--accent-cyan); text-align:center; margin-top:6px;"></div>
    </div>
    <div class="widget-box" style="margin-top:12px;">
      <span class="widget-label">Conversor de Criptomonedas</span>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <input type="number" id="crypto-amount" class="modal-input" placeholder="Monto" style="flex:1;" />
        <select id="crypto-from" class="modal-input" style="width:70px;">
          <option value="USDT">USDT</option>
          <option value="BTC">BTC</option>
          <option value="ETH">ETH</option>
          <option value="XRP">XRP</option>
        </select>
        <select id="crypto-to" class="modal-input" style="width:70px;">
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="JPY">JPY</option>
        </select>
      </div>
      <button class="btn-ghost" style="width:100%" onclick="convertCrypto()">Convertir</button>
      <div id="crypto-result" style="font-size:13px; color:var(--accent-cyan); text-align:center; margin-top:6px;"></div>
    </div>
    <div class="widget-box" style="margin-top:12px;">
      <span class="widget-label">Calculadora Financiera</span>
      <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
        <input type="number" id="finance-net" class="modal-input" placeholder="Objetivo neto (MXN)" style="flex:1;" />
        <input type="number" id="finance-fee" class="modal-input" placeholder="Comisión (%)" style="flex:1;" />
        <select id="finance-from" class="modal-input" style="width:70px;">
          <option value="USD">USD</option>
          <option value="MXN">MXN</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="JPY">JPY</option>
          <option value="USDT">USDT</option>
        </select>
      </div>
      <button class="btn-ghost" style="width:100%" onclick="calculateFinance()">Calcular</button>
      <div id="finance-result" style="font-size:13px; color:var(--accent-cyan); text-align:center; margin-top:6px;"></div>
    </div>
  `
}

// ── Helpers de tipo de cambio ─────────────────────────────────────────
// Fiat: open.er-api.com (gratis, sin key)
// Crypto: cdn.jsdelivr.net/@fawazahmed0/currency-api (gratis, sin key)
const CRYPTO_SYMBOLS = ['btc','eth','xrp','usdt','bnb','sol','ada','dot','matic','ltc']

async function fetchFiatRate(from, to) {
  const r = await fetch(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`)
  const d = await r.json()
  if (d.result !== 'success') throw new Error('API error')
  return d.rates[to.toUpperCase()]
}

async function fetchCryptoRate(from, to) {
  const sym = from.toLowerCase()
  const target = to.toLowerCase()
  const r = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${sym}.json`)
  const d = await r.json()
  const rate = d[sym]?.[target]
  if (rate == null) throw new Error(`No rate for ${from}→${to}`)
  return rate
}

// ── Conversor Fiat ────────────────────────────────────────────────────
async function convertCurrency() {
  const amount = parseFloat(document.getElementById('currency-amount')?.value)
  const from   = document.getElementById('currency-from')?.value
  const to     = document.getElementById('currency-to')?.value
  const resultEl = document.getElementById('currency-result')
  if (!resultEl) return
  if (isNaN(amount) || amount <= 0) { resultEl.textContent = 'Ingresa un monto válido'; return }
  resultEl.textContent = '⏳ Consultando...'
  try {
    const rate   = await fetchFiatRate(from, to)
    const result = (amount * rate).toFixed(2)
    resultEl.innerHTML = `<b>${amount.toLocaleString()} ${from}</b> = <b>${parseFloat(result).toLocaleString()} ${to}</b>`
  } catch(e) {
    console.warn('convertCurrency error', e)
    resultEl.textContent = '⚠️ No se pudo obtener el tipo de cambio'
  }
}
window.convertCurrency = convertCurrency;

// ── Conversor Crypto ──────────────────────────────────────────────────
async function convertCrypto() {
  const amount   = parseFloat(document.getElementById('crypto-amount')?.value)
  const from     = document.getElementById('crypto-from')?.value
  const to       = document.getElementById('crypto-to')?.value
  const resultEl = document.getElementById('crypto-result')
  if (!resultEl) return
  if (isNaN(amount) || amount <= 0) { resultEl.textContent = 'Ingresa un monto válido'; return }
  resultEl.textContent = '⏳ Consultando...'
  try {
    const isCryptoFrom = CRYPTO_SYMBOLS.includes(from.toLowerCase())
    let result
    if (isCryptoFrom) {
      const rate = await fetchCryptoRate(from, to)
      result = amount * rate
    } else {
      // fiat → crypto: get crypto→fiat then invert
      const rate = await fetchCryptoRate(to, from)
      result = amount / rate
    }
    const decimals = result < 1 ? 6 : 2
    resultEl.innerHTML = `<b>${amount} ${from}</b> = <b>${result.toFixed(decimals)} ${to}</b>`
  } catch(e) {
    console.warn('convertCrypto error', e)
    resultEl.textContent = '⚠️ No se pudo obtener la cotización'
  }
}
window.convertCrypto = convertCrypto;

// ── Calculadora Financiera ────────────────────────────────────────────
// Responde: ¿cuánto tengo que enviar en moneda X para que lleguen Y MXN netos?
async function calculateFinance() {
  const netTarget = parseFloat(document.getElementById('finance-net')?.value)
  const feePct    = parseFloat(document.getElementById('finance-fee')?.value) || 0
  const from      = document.getElementById('finance-from')?.value
  const resultEl  = document.getElementById('finance-result')
  if (!resultEl) return
  if (isNaN(netTarget) || netTarget <= 0 || !from) { resultEl.textContent = 'Ingresa objetivo neto y moneda'; return }
  resultEl.textContent = '⏳ Calculando...'
  try {
    const isCrypto = CRYPTO_SYMBOLS.includes(from.toLowerCase())
    let rateFROMtoMXN
    if (from.toUpperCase() === 'MXN') {
      rateFROMtoMXN = 1
    } else if (isCrypto) {
      rateFROMtoMXN = await fetchCryptoRate(from, 'mxn')
    } else {
      rateFROMtoMXN = await fetchFiatRate(from, 'MXN')
    }
    // gross = neto / (1 - fee%)
    const grossMXN      = netTarget / (1 - feePct / 100)
    const requiredFrom  = grossMXN / rateFROMtoMXN
    const feeMXN        = grossMXN - netTarget
    const decimals      = isCrypto ? 6 : 2
    resultEl.innerHTML = `
      Enviar: <b>${requiredFrom.toFixed(decimals)} ${from}</b><br>
      Bruto MXN: <b>$${grossMXN.toFixed(2)}</b> &nbsp;|&nbsp; Comisión: <b>$${feeMXN.toFixed(2)}</b><br>
      Neto recibido: <b>$${netTarget.toFixed(2)} MXN</b>
    `
  } catch(e) {
    console.warn('calculateFinance error', e)
    resultEl.textContent = '⚠️ Error al obtener tipo de cambio'
  }
}
window.calculateFinance = calculateFinance;

// Account Modal
window.openAccountModal = (id = null) => {
  editingAccountId = id
  const node = id ? allNodes.find(n => n.id === id) : null
  document.getElementById('am-name').value = node?.metadata?.label || node?.content || ''
  document.getElementById('am-type').value = node?.metadata?.acType || 'checking'
  document.getElementById('am-balance').value = node?.metadata?.initial_balance || 0
  document.getElementById('am-color').value = node?.metadata?.color || '#4ade80'
  document.getElementById('account-modal').classList.remove('hidden')
}
window.closeAccountModal = () => {
  document.getElementById('account-modal').classList.add('hidden')
  editingAccountId = null
}
document.getElementById('am-save')?.addEventListener('click', async () => {
  const label   = document.getElementById('am-name').value.trim()
  const acType  = document.getElementById('am-type').value
  const initial = parseFloat(document.getElementById('am-balance').value) || 0
  const color   = document.getElementById('am-color').value
  if (!label) return
  const meta = { label, acType, initial_balance: initial, color }
  if (editingAccountId) {
    const node = allNodes.find(n => n.id === editingAccountId)
    if (node) { node.content = label; node.metadata = meta }
    if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
      await supabase.from('nodes').update({ content: label, metadata: meta }).eq('id', editingAccountId)
    }
  } else {
    if (localStorage.getItem('nexus_admin_bypass') === 'true') {
      allNodes.unshift({ id: Math.random().toString(36).substr(2,9), type:'account', content:label, metadata:meta, created_at:new Date().toISOString() })
    } else {
      const { data: inserted } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'account', content:label, metadata:meta }).select()
      if (inserted?.[0]) allNodes.unshift(inserted[0])
    }
  }
  closeAccountModal(); renderAll()
})
document.getElementById('am-delete')?.addEventListener('click', async () => {
  if (!editingAccountId || !confirm('¿Eliminar esta cuenta?')) return
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes = allNodes.filter(n => n.id !== editingAccountId)
  } else {
    await supabase.from('nodes').delete().eq('id', editingAccountId)
  }
  closeAccountModal(); renderAll()
})

// Transfer Modal
window.openTransferModal = () => {
  const accounts = allNodes.filter(n => n.type === 'account')
  if (accounts.length === 0) {
    alert('Primero da de alta al menos una cuenta en Bio-Finanzas para poder transferir.')
    return
  }
  const opts = accounts.map(a => `<option value="${a.id}">${esc(a.metadata?.label||a.content)}</option>`).join('')
  document.getElementById('tr-from').innerHTML = opts
  // Para "to" seleccionar el segundo por defecto si existe
  document.getElementById('tr-to').innerHTML = opts
  if (accounts.length >= 2) {
    document.getElementById('tr-to').selectedIndex = 1
  }
  document.getElementById('transfer-modal').classList.remove('hidden')
}
window.closeTransferModal = () => document.getElementById('transfer-modal').classList.add('hidden')
document.getElementById('tr-save')?.addEventListener('click', async () => {
  const fromId = document.getElementById('tr-from').value
  const toId   = document.getElementById('tr-to').value
  const amount = parseFloat(document.getElementById('tr-amount').value) || 0
  const label  = document.getElementById('tr-label').value.trim() || 'Transferencia'
  if (!amount) return alert('Ingresa el monto de la transferencia.')
  if (fromId && toId && fromId === toId) return alert('La cuenta origen y destino no pueden ser la misma.')
  const expense = { owner_id:currentUser?.id, type:'expense', content:label, metadata:{ label, amount, account_id:fromId||null, transfer:true } }
  const income  = { owner_id:currentUser?.id, type:'income',  content:label, metadata:{ label, amount, account_id:toId||null,   transfer:true } }
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes.unshift({...expense, id:Math.random().toString(36).substr(2,9), created_at:new Date().toISOString()})
    allNodes.unshift({...income,  id:Math.random().toString(36).substr(2,9), created_at:new Date().toISOString()})
  } else {
    const { error } = await supabase.from('nodes').insert([expense, income])
    if (error) { alert('Error al guardar: ' + error.message); return }
  }
  closeTransferModal(); renderAll()
})

// Loan Modal — cuentas opcionales, contactos como prestamista/prestatario
window.openLoanModal = () => {
  const accounts  = allNodes.filter(n => n.type === 'account')
  const contacts  = allNodes.filter(n => n.type === 'contact' || n.type === 'persona')
  const noOpt     = `<option value="">— Ninguna —</option>`
  const accOpts   = accounts.map(a  => `<option value="${a.id}">💳 ${esc(a.metadata?.label||a.content)}</option>`).join('')
  const contOpts  = contacts.map(c  => `<option value="${c.id}">👤 ${esc(c.metadata?.name||c.content)}</option>`).join('')
  const allOpts   = noOpt + accOpts + contOpts
  document.getElementById('ln-from').innerHTML = allOpts
  document.getElementById('ln-to').innerHTML   = allOpts
  document.getElementById('loan-modal').classList.remove('hidden')
}
window.closeLoanModal = () => {
  document.getElementById('loan-modal').classList.add('hidden')
}
document.getElementById('ln-save')?.addEventListener('click', async () => {
  const label = document.getElementById('ln-label').value.trim()
  const amount = parseFloat(document.getElementById('ln-amount').value) || 0
  const interest = parseFloat(document.getElementById('ln-interest').value) || 0
  const dueDate = document.getElementById('ln-due-date').value
  const fromId = document.getElementById('ln-from').value
  const toId = document.getElementById('ln-to').value
  if (!label || !amount) return alert('Completa al menos la descripción y el monto del préstamo')
  const meta = { label, amount, interest, due_date: dueDate || undefined, lender_id: fromId, borrower_id: toId }
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes.unshift({ id: Math.random().toString(36).substr(2,9), type:'loan', content:label, metadata:meta, created_at:new Date().toISOString() })
  } else {
    const { data: inserted } = await supabase.from('nodes').insert({ owner_id: currentUser.id, type:'loan', content:label, metadata:meta }).select()
    if (inserted?.[0]) allNodes.unshift(inserted[0])
  }
  closeLoanModal(); renderAll()
})
// ── CALENDAR HELPERS ─────────────────────────────────────────────────────────
function calNodeDate(n) {
  return n.metadata?.date || n.metadata?.due_date || n.created_at?.split('T')[0] || ''
}
function calEvColor(e) {
  if (e.metadata?.color) return e.metadata.color
  const evType = e.metadata?.eventType
  if (evType === 'tarea')   return '#4ade80'
  if (evType === 'cita')    return '#fb923c'
  if (evType === 'reunion') return '#c084fc'
  return TYPE_CONFIG[e.type]?.color || 'var(--accent-cyan)'
}
function calEvIcon(e) {
  const t = e.metadata?.eventType
  if (t === 'tarea')   return '✅'
  if (t === 'cita')    return '🤝'
  if (t === 'reunion') return '👥'
  return '📅'
}
function calGetDayEvents(nodes, dateStr) {
  return nodes.filter(n => n.type !== 'account' && calNodeDate(n) === dateStr)
}
function addHour(t) {
  const [h, m] = t.split(':').map(Number)
  return `${Math.min(h+1,23).toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`
}

// ── RENDER CALENDAR (dispatcher + title + tab state) ─────────────────────────
function renderCalendar(nodes) {
  const root = document.getElementById('cal-days-root')
  if (!root) return

  // Title
  const monthTitle = document.getElementById('cal-month-title')
  if (monthTitle) {
    if (calView === 'month') {
      monthTitle.textContent = new Intl.DateTimeFormat('es-ES',{month:'long', year:'numeric'}).format(calDate).toUpperCase()
    } else if (calView === 'week') {
      const sow = new Date(calDate); sow.setDate(calDate.getDate() - calDate.getDay())
      const eow = new Date(sow); eow.setDate(sow.getDate() + 6)
      const fmt = new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short'})
      monthTitle.textContent = `${fmt.format(sow)} — ${fmt.format(eow)} ${eow.getFullYear()}`
    } else {
      monthTitle.textContent = calDate.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase()
    }
  }
  // Tab highlighting
  ['month','week','day'].forEach(v => {
    document.getElementById(`cal-view-${v}`)?.classList.toggle('fin-tab-active', calView === v)
  })

  if (calView === 'month') renderCalMonth(root, nodes)
  else if (calView === 'week') renderCalWeek(root, nodes)
  else renderCalDay(root, nodes)
}

// ── MONTH VIEW ────────────────────────────────────────────────────────────────
function renderCalMonth(root, nodes) {
  root.style.cssText = 'display:grid; grid-template-columns:repeat(7,1fr); gap:1px; background:rgba(255,255,255,0.05); border-radius:12px; overflow:hidden;'
  const firstDay   = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate()
  const prevDays   = new Date(calDate.getFullYear(), calDate.getMonth(), 0).getDate()
  const weekDays   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  let html = weekDays.map(d => `<div style="background:rgba(0,0,0,0.3);padding:8px;text-align:center;font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;">${d}</div>`).join('')
  for (let i = firstDay - 1; i >= 0; i--) html += `<div class="cal-day other-month"><span class="cal-number">${prevDays - i}</span></div>`
  for (let d = 1; d <= daysInMonth; d++) {
    const today = new Date()
    const isToday = today.getFullYear() === calDate.getFullYear() && today.getMonth() === calDate.getMonth() && today.getDate() === d
    const dayDate = `${calDate.getFullYear()}-${(calDate.getMonth()+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`
    const events = calGetDayEvents(nodes, dayDate)
    const chips = events.slice(0,3).map(e => {
      const clr = calEvColor(e)
      const icon = calEvIcon(e)
      const timeStr = e.metadata?.timeStart ? `<span style="opacity:0.6;margin-right:2px;">${e.metadata.timeStart}</span>` : ''
      return `<div class="cal-event" draggable="true"
        ondragstart="calEventDragStart(event,'${e.id}')"
        onclick="event.stopPropagation();openCardModal('${e.id}')"
        style="border-left-color:${clr};background:${clr}22;color:${clr};">
        ${timeStr}${icon} ${esc(e.metadata?.label || e.content)}
      </div>`
    }).join('')
    html += `<div class="cal-day ${isToday?'today':''}"
      ondblclick="openEventModal('${dayDate}',null)"
      ondragover="calDayDragOver(event)" ondragleave="calDayDragLeave(event)" ondrop="calDayDrop(event,'${dayDate}')">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span class="cal-number">${d}</span>
        <span class="cal-add-btn" onclick="event.stopPropagation();openEventModal('${dayDate}',null)"
          style="font-size:16px;color:var(--text-dim);cursor:pointer;opacity:0;transition:opacity 0.2s;line-height:1;padding:0 2px;">+</span>
      </div>
      <div class="cal-events-list">
        ${chips}
        ${events.length > 3 ? `<div style="font-size:9px;color:var(--text-muted);margin-top:2px;">+${events.length-3} más</div>` : ''}
      </div>
    </div>`
  }
  root.innerHTML = html
}

// ── TIME GRID BUILDER (shared by week + day) ──────────────────────────────────
const HOUR_H = 60   // px per hour — 60px/hr = 1px/min
function buildTimeGrid(dayColumns) {
  const TOTAL_H = 24 * HOUR_H
  const TIME_W  = dayColumns.length === 1 ? 64 : 48
  const nCols   = dayColumns.length
  const todayStr = new Date().toISOString().split('T')[0]
  const now = new Date()
  const nowPx = now.getHours() * HOUR_H + Math.floor(now.getMinutes() * HOUR_H / 60)

  // Header
  let headerHtml = `<div style="width:${TIME_W}px;min-width:${TIME_W}px;padding:6px 4px;flex-shrink:0;"></div>`
  dayColumns.forEach(({dayLabel, isToday}) => {
    headerHtml += `<div style="min-width:0;overflow:hidden;padding:8px 4px;text-align:center;border-left:1px solid rgba(255,255,255,0.06);${isToday?'color:var(--accent-cyan);font-weight:800;':'color:var(--text-muted);font-weight:600;'}">${dayLabel}</div>`
  })

  // All-day row
  let alldayHtml = `<div style="width:${TIME_W}px;padding:4px 4px;font-size:9px;color:var(--text-muted);display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">Todo día</div>`
  dayColumns.forEach(({date, allDayEvents, isToday}) => {
    alldayHtml += `<div style="padding:2px 4px;border-left:1px solid rgba(255,255,255,0.06);${isToday?'background:rgba(0,246,255,0.02)':''}" ondblclick="openEventModal('${date}',null)">
      ${allDayEvents.map(e => {
        const clr = calEvColor(e)
        return `<div onclick="openCardModal('${e.id}')" style="background:${clr}22;color:${clr};border-left:2px solid ${clr};padding:1px 4px;border-radius:3px;font-size:9px;font-weight:600;margin-bottom:1px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${calEvIcon(e)} ${esc(e.metadata?.label||e.content)}</div>`
      }).join('')}
    </div>`
  })

  // Time labels column
  let timeColHtml = ''
  for (let h = 0; h < 24; h++) {
    timeColHtml += `<div class="cal-timelabel" style="top:${h * HOUR_H}px;">${h.toString().padStart(2,'0')}:00</div>`
    timeColHtml += `<div class="cal-half-line" style="top:${h * HOUR_H + 30}px;"></div>`
  }

  // Day columns
  let dayColsHtml = ''
  dayColumns.forEach(({date, timedEvents, isToday}) => {
    let inner = ''
    for (let h = 0; h < 24; h++) {
      inner += `<div class="cal-hour-line" style="top:${h * HOUR_H}px;"></div>`
    }
    if (isToday) {
      inner += `<div class="cal-now-line" style="top:${nowPx}px;"><div class="cal-now-dot"></div></div>`
    }
    timedEvents.forEach(e => {
      const ts = e.metadata?.timeStart || '00:00'
      const te = e.metadata?.timeEnd   || addHour(ts)
      const [sh, sm] = ts.split(':').map(Number)
      const [eh, em] = te.split(':').map(Number)
      const topPx = sh * HOUR_H + Math.floor(sm * HOUR_H / 60)
      const heightPx = Math.max((eh * 60 + em) - (sh * 60 + sm), 30)
      const clr = calEvColor(e)
      inner += `<div class="cal-time-event"
        style="top:${topPx}px;height:${heightPx}px;background:${clr}22;color:${clr};border-color:${clr};"
        onclick="openCardModal('${e.id}')" title="${esc(e.metadata?.label||e.content)}">
        <div style="font-size:9px;opacity:0.65;">${ts}–${te}</div>
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${calEvIcon(e)} ${esc(e.metadata?.label||e.content)}</div>
      </div>`
    })
    dayColsHtml += `<div class="cal-daycol" style="height:${TOTAL_H}px;${isToday?'background:rgba(0,246,255,0.015)':''}"
      ondblclick="calTimeDblClick(event,'${date}')"
      ondragover="calDayDragOver(event)" ondragleave="calDayDragLeave(event)" ondrop="calDayDrop(event,'${date}')">
      ${inner}
    </div>`
  })

  const gridCols = `${TIME_W}px repeat(${nCols},1fr)`
  return `
    <div class="cal-timegrid-wrapper">
      <div class="cal-timegrid-header" style="grid-template-columns:${gridCols};">${headerHtml}</div>
      <div class="cal-timegrid-allday" style="grid-template-columns:${gridCols};">${alldayHtml}</div>
      <div class="cal-timegrid-scroll" id="cal-tg-scroll">
        <div class="cal-timegrid-body" style="grid-template-columns:${TIME_W}px repeat(${nCols},1fr);height:${TOTAL_H}px;">
          <div class="cal-timecol" style="height:${TOTAL_H}px;">${timeColHtml}</div>
          ${dayColsHtml}
        </div>
      </div>
    </div>`
}

// ── WEEK VIEW ─────────────────────────────────────────────────────────────────
function renderCalWeek(root, nodes) {
  root.style.cssText = 'display:block;'
  const sow = new Date(calDate); sow.setDate(calDate.getDate() - calDate.getDay())
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const dayColumns = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(sow); d.setDate(sow.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const isToday = dateStr === new Date().toISOString().split('T')[0]
    const allEv = calGetDayEvents(nodes, dateStr)
    dayColumns.push({
      date: dateStr, isToday,
      dayLabel: `<div style="font-size:10px;">${DAYS[d.getDay()]}</div><div style="font-size:15px;font-weight:${isToday?800:600};">${d.getDate()}</div>`,
      allDayEvents: allEv.filter(e => !e.metadata?.timeStart || e.metadata?.allDay),
      timedEvents:  allEv.filter(e =>  e.metadata?.timeStart && !e.metadata?.allDay)
    })
  }
  root.innerHTML = buildTimeGrid(dayColumns)
  setTimeout(() => { const s = document.getElementById('cal-tg-scroll'); if (s) s.scrollTop = 7 * HOUR_H }, 0)
}

// ── DAY VIEW ──────────────────────────────────────────────────────────────────
function renderCalDay(root, nodes) {
  root.style.cssText = 'display:block;'
  const dateStr = calDate.toISOString().split('T')[0]
  const isToday = dateStr === new Date().toISOString().split('T')[0]
  const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const allEv = calGetDayEvents(nodes, dateStr)
  const dayColumns = [{
    date: dateStr, isToday,
    dayLabel: `<div style="font-size:11px;">${DAYS[calDate.getDay()]}</div><div style="font-size:22px;">${calDate.getDate()}</div>`,
    allDayEvents: allEv.filter(e => !e.metadata?.timeStart || e.metadata?.allDay),
    timedEvents:  allEv.filter(e =>  e.metadata?.timeStart && !e.metadata?.allDay)
  }]
  root.innerHTML = buildTimeGrid(dayColumns)
  setTimeout(() => { const s = document.getElementById('cal-tg-scroll'); if (s) s.scrollTop = 7 * HOUR_H }, 0)
}

// ── DRAG & DROP ────────────────────────────────────────────────────────────────
window.calEventDragStart = (ev, nodeId) => {
  calDragNodeId = nodeId
  ev.dataTransfer.effectAllowed = 'move'
}
window.calDayDragOver = (ev) => {
  ev.preventDefault()
  ev.currentTarget.style.background = 'rgba(0,246,255,0.08)'
}
window.calDayDragLeave = (ev) => { ev.currentTarget.style.background = '' }
window.calDayDrop = async (ev, date) => {
  ev.preventDefault(); ev.currentTarget.style.background = ''
  const nodeId = calDragNodeId
  calDragNodeId = null
  if (!nodeId) return
  const node = allNodes.find(n => n.id === nodeId)
  if (!node) return
  const newMeta = { ...node.metadata, due_date: date, date }
  node.metadata = newMeta
  renderAll(); showToast(`📅 Movido al ${date}`)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
    await supabase.from('nodes').update({ metadata: newMeta }).eq('id', nodeId)
}
window.calTimeDblClick = (ev, date) => {
  const col = ev.currentTarget
  const rect = col.getBoundingClientRect()
  const scrollTop = document.getElementById('cal-tg-scroll')?.scrollTop || 0
  const relY = ev.clientY - rect.top + scrollTop
  const hour = Math.floor(relY / HOUR_H)
  const min  = Math.floor(((relY % HOUR_H) / HOUR_H) * 60 / 15) * 15
  const timeStr = `${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`
  openEventModal(date, timeStr)
}

// ── EVENT MODAL ───────────────────────────────────────────────────────────────
window.openEventModal = (date, time) => {
  editingEventId = null
  document.getElementById('ecm-title-label').textContent = 'Nuevo Evento'
  document.getElementById('ev-title').value = ''
  document.getElementById('ev-date').value = date || new Date().toISOString().split('T')[0]
  document.getElementById('ev-allday').checked = !time
  document.getElementById('ev-time-start').value = time || '09:00'
  document.getElementById('ev-time-end').value = time ? addHour(time) : '10:00'
  document.getElementById('ev-location').value = ''
  document.getElementById('ev-description').value = ''
  // Reset type
  const defType = document.querySelector('input[name="ev-type"][value="evento"]')
  if (defType) defType.checked = true
  // Reset color
  selectedEventColor = '#00f0ff'
  document.querySelectorAll('.ev-color-swatch').forEach(s => s.classList.remove('active'))
  document.querySelector('.ev-color-swatch[data-color="#00f0ff"]')?.classList.add('active')
  toggleAlldayFields()
  document.getElementById('event-create-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('ev-title')?.focus(), 60)
}
window.closeEventModal = () => {
  document.getElementById('event-create-modal')?.classList.add('hidden')
  editingEventId = null
}
window.toggleAlldayFields = () => {
  const allDay = document.getElementById('ev-allday')?.checked
  document.getElementById('ev-time-start-wrap').style.display = allDay ? 'none' : ''
  document.getElementById('ev-time-end-wrap').style.display   = allDay ? 'none' : ''
}
window.selectEventColor = (btn) => {
  document.querySelectorAll('.ev-color-swatch').forEach(s => s.classList.remove('active'))
  btn.classList.add('active')
  selectedEventColor = btn.dataset.color
}
window.saveEvent = async () => {
  const title = document.getElementById('ev-title')?.value.trim()
  if (!title) { showToast('⚠️ El título es obligatorio'); return }
  const eventType = document.querySelector('input[name="ev-type"]:checked')?.value || 'evento'
  const date      = document.getElementById('ev-date')?.value
  const allDay    = document.getElementById('ev-allday')?.checked
  const timeStart = allDay ? null : (document.getElementById('ev-time-start')?.value || null)
  const timeEnd   = allDay ? null : (document.getElementById('ev-time-end')?.value   || null)
  const location  = document.getElementById('ev-location')?.value.trim()
  const description = document.getElementById('ev-description')?.value.trim()
  closeEventModal()
  const meta = { label: title, eventType, date, due_date: date, timeStart, timeEnd, allDay: allDay||false, location, description, color: selectedEventColor, tags: [] }
  if (editingEventId) {
    // Update existing
    const node = allNodes.find(n => n.id === editingEventId)
    if (node) {
      node.metadata = { ...node.metadata, ...meta }
      renderAll()
      if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
        await supabase.from('nodes').update({ metadata: node.metadata, content: title }).eq('id', editingEventId)
      showToast('✅ Evento actualizado')
    }
  } else {
    await insertDirectNode('event', title, meta)
  }
}

// ── CALENDAR NAV BUTTONS ───────────────────────────────────────────────────────
document.getElementById('cal-prev')?.addEventListener('click', () => {
  if (calView === 'week') calDate.setDate(calDate.getDate() - 7)
  else if (calView === 'day') calDate.setDate(calDate.getDate() - 1)
  else calDate.setMonth(calDate.getMonth() - 1)
  renderAll()
})
document.getElementById('cal-next')?.addEventListener('click', () => {
  if (calView === 'week') calDate.setDate(calDate.getDate() + 7)
  else if (calView === 'day') calDate.setDate(calDate.getDate() + 1)
  else calDate.setMonth(calDate.getMonth() + 1)
  renderAll()
})
document.getElementById('cal-today')?.addEventListener('click', () => { calDate = new Date(); renderAll() })
document.getElementById('cal-view-month')?.addEventListener('click', () => { calView = 'month'; renderAll() })
document.getElementById('cal-view-week')?.addEventListener('click',  () => { calView = 'week';  renderAll() })
document.getElementById('cal-view-day')?.addEventListener('click',   () => { calView = 'day';   renderAll() })
document.getElementById('cal-export')?.addEventListener('click', () => {
  const events = allNodes.filter(n => n.type !== 'account' && n.type !== 'note')
  const rows = events.map(n => [
    new Date(n.created_at).toLocaleDateString('es-MX'),
    n.metadata?.date || n.metadata?.due_date || '',
    TYPE_CONFIG[n.type]?.label || n.type,
    JSON.stringify(n.metadata?.label || n.content)
  ].join(','))
  const csv = '\ufeff' + ['Creado,Fecha,Tipo,Descripción',...rows].join('\n')
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `nexus-calendario-${new Date().toISOString().split('T')[0]}.csv`; a.click()
})

// ═══════════════════════════════════════════════════════════════
//  FINANCE CHARTS (Chart.js)
// ═══════════════════════════════════════════════════════════════

function ensureChartDefaults() {
  if (chartJsReady || typeof Chart === 'undefined') return
  chartJsReady = true
  Chart.defaults.color = '#64748b'
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)'
  Chart.defaults.font.family = "'JetBrains Mono', monospace"
  Chart.defaults.font.size = 10
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10,15,28,0.95)'
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.1)'
  Chart.defaults.plugins.tooltip.borderWidth = 1
  Chart.defaults.plugins.tooltip.padding = 10
  Chart.defaults.plugins.tooltip.titleColor = '#e2e8f0'
  Chart.defaults.plugins.tooltip.bodyColor = '#94a3b8'
}

function destroyCharts() {
  Object.keys(finCharts).forEach(k => { if (finCharts[k]) { finCharts[k].destroy(); finCharts[k] = null } })
}

window.toggleFinanceCharts = () => {
  finChartsVisible = !finChartsVisible
  const panel = document.getElementById('finance-charts-panel')
  const btn   = document.getElementById('fin-charts-toggle')
  if (panel) panel.style.display = finChartsVisible ? 'grid' : 'none'
  if (btn)   { btn.style.background = finChartsVisible ? 'rgba(0,246,255,0.15)' : 'rgba(255,255,255,0.05)'; btn.style.color = finChartsVisible ? 'var(--accent-cyan)' : 'var(--text-muted)' }
  if (finChartsVisible) {
    const filtered = activeAccount === 'all' ? allNodes : allNodes.filter(n => n.metadata?.account_id === activeAccount || n.type === 'account')
    setTimeout(() => renderFinanceCharts(filtered), 0)
  } else destroyCharts()
}

function renderFinanceCharts(nodes) {
  if (typeof Chart === 'undefined') return
  ensureChartDefaults()
  destroyCharts()

  const today = new Date()

  // ── 1. BAR: Ingresos vs Gastos últimos 6 meses ──────────────
  const months = Array.from({length:6}, (_,i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5-i), 1)
    return { year:d.getFullYear(), month:d.getMonth(), label: d.toLocaleDateString('es-ES',{month:'short',year:'2-digit'}).toUpperCase() }
  })
  const incomeByM  = months.map(m => nodes.filter(n => n.type==='income'  && new Date(n.created_at).getFullYear()===m.year && new Date(n.created_at).getMonth()===m.month).reduce((s,n)=>s+(n.metadata?.amount||0),0))
  const expenseByM = months.map(m => nodes.filter(n => n.type==='expense' && new Date(n.created_at).getFullYear()===m.year && new Date(n.created_at).getMonth()===m.month).reduce((s,n)=>s+(n.metadata?.amount||0),0))
  const barCtx = document.getElementById('chart-bar')
  if (barCtx) {
    finCharts.bar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          { label:'Ingresos', data: incomeByM,  backgroundColor:'rgba(74,222,128,0.7)', borderColor:'#4ade80', borderWidth:1, borderRadius:6 },
          { label:'Gastos',   data: expenseByM, backgroundColor:'rgba(248,113,113,0.7)', borderColor:'#f87171', borderWidth:1, borderRadius:6 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:true,
        plugins: { legend:{ position:'bottom', labels:{ boxWidth:10, padding:12 } } },
        scales: {
          x: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b' } },
          y: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', callback: v => '$'+v.toLocaleString() } }
        }
      }
    })
  }

  // ── 2. DONUT: Distribución de gastos por categoría ───────────
  const expenses = nodes.filter(n => n.type==='expense')
  const cats = {}
  expenses.forEach(n => {
    const tags = (n.metadata?.tags||[]).filter(t => t !== '#expense' && t !== '#gasto')
    const key = tags[0] || n.metadata?.label?.split(' ').slice(0,2).join(' ') || 'Otros'
    cats[key] = (cats[key]||0) + (n.metadata?.amount||0)
  })
  const sortedCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8)
  const DONUT_COLORS = ['#00f0ff','#4ade80','#c084fc','#fb923c','#f87171','#facc15','#38bdf8','#a78bfa']
  const donutCtx = document.getElementById('chart-donut')
  if (donutCtx) {
    if (sortedCats.length === 0) {
      donutCtx.parentElement.innerHTML += '<div style="text-align:center;color:var(--text-muted);font-size:11px;padding:20px 0;">Sin gastos registrados aún</div>'
    } else {
      finCharts.donut = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: sortedCats.map(([k])=>k),
          datasets: [{ data: sortedCats.map(([,v])=>v), backgroundColor: DONUT_COLORS.slice(0,sortedCats.length), borderWidth:2, borderColor:'rgba(10,15,28,0.8)' }]
        },
        options: {
          responsive:true, maintainAspectRatio:true,
          cutout:'62%',
          plugins: {
            legend:{ position:'bottom', labels:{ boxWidth:10, padding:10 } },
            tooltip:{ callbacks:{ label: ctx => ` $${ctx.parsed.toLocaleString()}` } }
          }
        }
      })
    }
  }

  // ── 3. LINE: Patrimonio neto acumulado ───────────────────────
  const allTx = nodes.filter(n => n.type==='income'||n.type==='expense').sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
  let cum = 0
  const linePoints = allTx.map(n => {
    cum += n.type==='income' ? (n.metadata?.amount||0) : -(n.metadata?.amount||0)
    return { x: n.created_at.split('T')[0], y: Math.round(cum) }
  })
  const lineCtx = document.getElementById('chart-line')
  if (lineCtx) {
    if (linePoints.length === 0) {
      lineCtx.parentElement.innerHTML += '<div style="text-align:center;color:var(--text-muted);font-size:11px;padding:20px 0;">Sin datos suficientes aún</div>'
    } else {
      const isPositive = linePoints[linePoints.length-1]?.y >= 0
      const lineColor = isPositive ? '#4ade80' : '#f87171'
      finCharts.line = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: linePoints.map(p=>p.x),
          datasets: [{
            label:'Patrimonio Neto',
            data: linePoints.map(p=>p.y),
            borderColor: lineColor,
            backgroundColor: lineColor.replace(')', ',0.08)').replace('rgb','rgba'),
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: linePoints.length > 20 ? 0 : 3,
            pointHoverRadius: 5,
            pointBackgroundColor: lineColor
          }]
        },
        options: {
          responsive:true, maintainAspectRatio:true,
          plugins: { legend:{ display:false } },
          scales: {
            x: { display: linePoints.length <= 30, grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', maxTicksLimit:6 } },
            y: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#64748b', callback: v => '$'+v.toLocaleString() } }
          }
        }
      })
    }
  }
}

// ── ANIMATED KPI COUNTER ──────────────────────────────────────
function animateStatEl(id, target) {
  const el = document.getElementById(id)
  if (!el || !target) return
  const isNeg = target < 0
  const abs = Math.abs(target)
  const prefix = id === 'fin-kpi-income' ? '+$' : id === 'fin-kpi-expense' ? '-$' : (isNeg ? '-$' : '+$')
  const start = performance.now()
  const duration = 700
  const run = (now) => {
    const p = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1-p, 3)
    el.textContent = prefix + Math.floor(abs * eased).toLocaleString()
    if (p < 1) requestAnimationFrame(run)
    else el.textContent = prefix + abs.toLocaleString()
  }
  requestAnimationFrame(run)
}

// ═══════════════════════════════════════════════════════════════
//  AGENDA FINANCIERA
// ═══════════════════════════════════════════════════════════════
// Finance charts state
const finCharts = { bar: null, donut: null, line: null }
let finChartsVisible = true
let chartJsReady = false

let agendaItemType = 'card'
let agendaColor    = '#60a5fa'
let editingAgendaId = null
let agendaPlanAccounts = new Set() // empty = all accounts

function renderAgenda(nodes) {
  const cards  = nodes.filter(n => n.type === 'card')
  const subs   = nodes.filter(n => n.type === 'subscription')
  const bills  = nodes.filter(n => n.type === 'bill')
  const today  = new Date()
  const todayN = today.getDate()

  // ── Filtrar por cuentas seleccionadas ────────────────────────
  const accFilter = (n) => agendaPlanAccounts.size === 0 || agendaPlanAccounts.has(n.metadata?.account_id)
  const subsF  = subs.filter(accFilter)
  const billsF = bills.filter(accFilter)
  const cardsF = cards.filter(accFilter)
  const accLabel = agendaPlanAccounts.size === 0
    ? 'todas las cuentas'
    : `${agendaPlanAccounts.size} cuenta${agendaPlanAccounts.size!==1?'s':''}`

  // ── KPIs ─────────────────────────────────────────────────────
  const totalSubs  = subsF.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalBills = billsF.filter(b => !b.metadata?.paid).reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalFixed = totalSubs + totalBills
  const kpis = [
    { label:`Gasto fijo (${accLabel})`, value:fmt$(totalFixed), color:'#fb923c' },
    { label:'Suscripciones activas', value: subsF.length, color:'#a78bfa' },
    { label:'Tarjetas registradas', value: cardsF.length, color:'#60a5fa' },
    { label:'Pagos pendientes', value: billsF.filter(b => !b.metadata?.paid).length, color:'#f87171' },
  ]
  const kpiEl = document.getElementById('agenda-kpis')
  if (kpiEl) kpiEl.innerHTML = kpis.map(k => `
    <div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:14px;padding:16px 20px;">
      <div style="font-size:22px;font-weight:800;color:${k.color};font-family:'JetBrains Mono',monospace;">${k.value}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${k.label}</div>
    </div>`).join('')

  // ── PLAN DEL MES (tabla doble entrada/salida) ─────────────────
  const planMonth = document.getElementById('agenda-plan-month')
  if (planMonth) planMonth.textContent = today.toLocaleDateString('es-ES',{month:'long',year:'numeric'}).toUpperCase()

  // ── Account selector checkboxes ───────────────────────────────
  const accountNodes = allNodes.filter(n => n.type === 'account')
  const planAccountsEl = document.getElementById('agenda-plan-accounts')
  if (planAccountsEl) {
    if (accountNodes.length > 0) {
      planAccountsEl.innerHTML = `<span style="font-size:10px;color:var(--text-muted);font-weight:600;align-self:center;white-space:nowrap;">CUENTAS:</span>` +
        accountNodes.map(acc => {
          const label = acc.metadata?.label || acc.content
          const checked = agendaPlanAccounts.size === 0 || agendaPlanAccounts.has(acc.id)
          const clr = acc.metadata?.color || '#60a5fa'
          return `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;background:${clr}15;border:1px solid ${clr}33;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:${checked?clr:'var(--text-muted)'};">
            <input type="checkbox" ${checked?'checked':''} onchange="toggleAgendaAccount('${acc.id}',this)" style="display:none;" />
            ${esc(label)}
          </label>`
        }).join('')
    } else {
      planAccountsEl.innerHTML = ''
    }
  }

  // Filter incomes and expenses by CURRENT MONTH and selected accounts
  const curY = today.getFullYear(), curM = today.getMonth() // 0-indexed
  const isCurrentMonth = (n) => {
    const d = n.metadata?.date || n.created_at || ''
    if (!d) return true // no date → always include
    const dt = new Date(d)
    return dt.getFullYear() === curY && dt.getMonth() === curM
  }
  // Unified FinancialEngine — same source of truth as Bio-Finanzas
  const period = currentPeriod() // 'YYYY-MM'
  let incomeNodes = [], expenseNodes = []
  if (agendaPlanAccounts.size === 0) {
    const txs = getTransactions(nodes, 'all', period)
    incomeNodes = txs.filter(n => n.type === 'income')
    expenseNodes = txs.filter(n => n.type === 'expense')
  } else {
    const seen = new Set()
    for (const accId of agendaPlanAccounts) {
      const txs = getTransactions(nodes, accId, period)
      for (const t of txs) {
        if (seen.has(t.id)) continue
        seen.add(t.id)
        if (t.type === 'income') incomeNodes.push(t)
        else if (t.type === 'expense') expenseNodes.push(t)
      }
    }
    // También incluir transacciones sin cuenta asignada (@cuenta no especificada)
    const unassigned = getTransactions(nodes, 'all', period)
      .filter(t => !t.metadata?.account_id)
    for (const t of unassigned) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      if (t.type === 'income') incomeNodes.push(t)
      else if (t.type === 'expense') expenseNodes.push(t)
    }
  }
  const totalIn  = incomeNodes.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalOut = expenseNodes.reduce((s, n) => s + (n.metadata?.amount || 0), 0) + totalFixed

  const planBody = document.getElementById('agenda-plan-body')
  const planFoot = document.getElementById('agenda-plan-foot')
  if (planBody) {
    const rows = []
    // Ingresos como filas de entrada
    incomeNodes.slice(0,5).forEach(n => {
      rows.push(`<tr>
        <td style="padding:5px 4px;color:#fff;">${esc(n.metadata?.label||n.content)}</td>
        <td style="text-align:right;padding:5px 4px;color:#4ade80;font-family:'JetBrains Mono',monospace;">${fmt$(n.metadata?.amount||0)}</td>
        <td style="text-align:right;padding:5px 4px;color:var(--text-dim);">—</td>
        <td style="text-align:right;padding:5px 4px;"></td>
      </tr>`)
    })
    // Suscripciones como salidas fijas (filtradas por cuenta)
    subsF.forEach(n => {
      rows.push(`<tr>
        <td style="padding:5px 4px;color:var(--text-muted);">${esc(n.metadata?.label||n.content)} <span style="font-size:9px;opacity:0.5;">(día ${n.metadata?.dayOfMonth||1})</span></td>
        <td style="text-align:right;padding:5px 4px;color:var(--text-dim);">—</td>
        <td style="text-align:right;padding:5px 4px;color:#f87171;font-family:'JetBrains Mono',monospace;">${fmt$(n.metadata?.amount||0)}</td>
        <td style="text-align:right;padding:5px 4px;"></td>
      </tr>`)
    })
    // Pagos fijos pendientes (filtrados por cuenta)
    billsF.filter(b => !b.metadata?.paid).forEach(n => {
      rows.push(`<tr>
        <td style="padding:5px 4px;color:var(--text-muted);">${esc(n.metadata?.label||n.content)}</td>
        <td style="text-align:right;padding:5px 4px;color:var(--text-dim);">—</td>
        <td style="text-align:right;padding:5px 4px;color:#fb923c;font-family:'JetBrains Mono',monospace;">${fmt$(n.metadata?.amount||0)}</td>
        <td style="text-align:right;padding:5px 4px;"></td>
      </tr>`)
    })
    // Gastos variables del mes (filtrados por mes y cuenta)
    expenseNodes.slice(0, 5).forEach(n => {
      rows.push(`<tr>
        <td style="padding:5px 4px;color:var(--text-muted);">${esc(n.metadata?.label||n.content)} <span style="font-size:9px;opacity:0.4;">gasto</span></td>
        <td style="text-align:right;padding:5px 4px;color:var(--text-dim);">—</td>
        <td style="text-align:right;padding:5px 4px;color:#fbbf24;font-family:'JetBrains Mono',monospace;">${fmt$(n.metadata?.amount||0)}</td>
        <td style="text-align:right;padding:5px 4px;"></td>
      </tr>`)
    })
    if (expenseNodes.length > 5) {
      rows.push(`<tr><td colspan="4" style="padding:3px 4px;font-size:10px;color:var(--text-muted);text-align:center;">… y ${expenseNodes.length - 5} gastos más este mes</td></tr>`)
    }
    planBody.innerHTML = rows.join('') || '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">Agrega ingresos y compromisos para ver el plan</td></tr>'
  }
  const saldo = totalIn - totalOut
  const saldoClr = saldo >= 0 ? '#4ade80' : '#f87171'
  const selectedLabel = agendaPlanAccounts.size > 0
    ? ` <span style="font-size:9px;opacity:0.6;">(${agendaPlanAccounts.size} cta${agendaPlanAccounts.size!==1?'s':''})</span>`
    : ''
  if (planFoot) planFoot.innerHTML = `
    <tr style="border-top:1px solid var(--glass-border);">
      <td style="padding:8px 4px;font-weight:800;color:#fff;">TOTAL${selectedLabel}</td>
      <td style="text-align:right;padding:8px 4px;font-weight:800;color:#4ade80;font-family:'JetBrains Mono',monospace;">${fmt$(totalIn)}</td>
      <td style="text-align:right;padding:8px 4px;font-weight:800;color:#f87171;font-family:'JetBrains Mono',monospace;">${fmt$(totalOut)}</td>
      <td style="text-align:right;padding:8px 4px;font-weight:800;color:${saldoClr};font-family:'JetBrains Mono',monospace;">${fmt$(saldo)}</td>
    </tr>
    <tr>
      <td colspan="4" style="padding:6px 4px;font-size:11px;color:var(--text-muted);">
        💰 <b style="color:${saldoClr};">Disponible real: ${fmt$(saldo)}</b> = entradas (${fmt$(totalIn)}) − compromisos (${fmt$(totalOut)})
      </td>
    </tr>`

  // ── PRÓXIMOS 7 DÍAS ───────────────────────────────────────────
  const upcomingEl = document.getElementById('agenda-upcoming')
  if (upcomingEl) {
    const upcoming = []
    const in7 = new Date(today); in7.setDate(today.getDate() + 7)
    // Cards: días de corte y pago
    cards.forEach(c => {
      const m = c.metadata || {}
      ;[[m.cutDay,'✂️ Corte','#60a5fa'],[m.payDay,'💳 Pago','#f87171']].forEach(([day,label,color]) => {
        if (!day) return
        const d = new Date(today.getFullYear(), today.getMonth(), day)
        if (d < today) d.setMonth(d.getMonth() + 1)
        if (d <= in7) upcoming.push({ date:d, label:`${label} ${esc(m.label||c.content)}`, color })
      })
    })
    // Subs
    subs.forEach(s => {
      const day = s.metadata?.dayOfMonth
      if (!day) return
      const d = new Date(today.getFullYear(), today.getMonth(), day)
      if (d < today) d.setMonth(d.getMonth() + 1)
      if (d <= in7) upcoming.push({ date:d, label:`🔄 ${esc(s.metadata?.label||s.content)}`, color:'#a78bfa', amount: s.metadata?.amount })
    })
    // Bills
    bills.filter(b => !b.metadata?.paid && b.metadata?.dueDate).forEach(b => {
      const d = new Date(b.metadata.dueDate)
      if (d >= today && d <= in7) upcoming.push({ date:d, label:`📋 ${esc(b.metadata?.label||b.content)}`, color:'#fb923c', amount: b.metadata?.amount })
    })
    upcoming.sort((a,b) => a.date - b.date)

    const diffDays = d => Math.ceil((d - today) / 86400000)
    upcomingEl.innerHTML = upcoming.length === 0
      ? `<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px;">Sin vencimientos próximos esta semana 🎉</div>`
      : upcoming.map(u => {
          const days = diffDays(u.date)
          const urgency = days <= 1 ? '#f87171' : days <= 3 ? '#fb923c' : u.color
          return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${urgency}14;border:1px solid ${urgency}33;border-radius:10px;margin-bottom:8px;">
            <div style="background:${urgency};color:#000;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:800;font-family:'JetBrains Mono',monospace;flex-shrink:0;">
              ${days === 0 ? 'HOY' : days === 1 ? 'MAÑANA' : `${days}d`}
            </div>
            <div style="flex:1;">
              <div style="font-size:12px;font-weight:600;color:#fff;">${u.label}</div>
              <div style="font-size:10px;color:var(--text-muted);">${u.date.toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'})}</div>
            </div>
            ${u.amount ? `<div style="font-size:11px;font-weight:700;color:${urgency};font-family:'JetBrains Mono',monospace;">${fmt$(u.amount)}</div>` : ''}
          </div>`
        }).join('')
  }

  // ── BADGE en nav ──────────────────────────────────────────────
  const navAgenda = document.querySelector('[data-view="agenda"]')
  const urgentCount = (() => {
    const in2 = new Date(today); in2.setDate(today.getDate() + 2)
    let cnt = 0
    ;[...cards,...subs,...bills].forEach(n => {
      const m = n.metadata || {}
      const days = [m.cutDay, m.payDay, m.dayOfMonth].filter(Boolean)
      days.forEach(d => {
        const dt = new Date(today.getFullYear(), today.getMonth(), d)
        if (dt < today) dt.setMonth(dt.getMonth() + 1)
        if (dt <= in2) cnt++
      })
    })
    return cnt
  })()
  if (navAgenda) {
    const badge = navAgenda.querySelector('.agenda-badge') || (() => {
      const b = document.createElement('span')
      b.className = 'agenda-badge'
      b.style.cssText = 'background:#f87171;color:#000;border-radius:50%;font-size:9px;font-weight:800;padding:1px 5px;margin-left:4px;'
      navAgenda.appendChild(b); return b
    })()
    if (urgentCount > 0) { badge.textContent = urgentCount; badge.style.display = 'inline' }
    else badge.style.display = 'none'
  }

  // ── TARJETAS ──────────────────────────────────────────────────
  const cardsEl = document.getElementById('agenda-cards')
  if (cardsEl) cardsEl.innerHTML = cards.length === 0
    ? `<div style="color:var(--text-muted);font-size:12px;">Sin tarjetas. Agrega una con el botón "+" de arriba.</div>`
    : cards.map(c => {
        const m = c.metadata || {}
        const clr = m.color || '#60a5fa'
        const daysToPayment = (() => {
          if (!m.payDay) return null
          const d = new Date(today.getFullYear(), today.getMonth(), m.payDay)
          if (d < today) d.setMonth(d.getMonth() + 1)
          return Math.ceil((d - today) / 86400000)
        })()
        const cardNumDisplay = m.cardNumber
          ? m.cardNumber.replace(/(\d{4})(?=\d)/g,'$1 ')
          : (m.lastFour ? `•••• •••• •••• ${m.lastFour}` : '•••• •••• •••• ????')
        return `<div style="background:linear-gradient(135deg,${clr}22,${clr}08);border:1px solid ${clr}44;border-radius:16px;padding:20px;position:relative;overflow:hidden;">
          <div style="position:absolute;right:12px;top:12px;opacity:0.07;font-size:60px;pointer-events:none;">💳</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:11px;color:${clr};font-weight:700;letter-spacing:1px;">${esc(m.label||c.content)}</span>
            ${m.bank ? `<span style="font-size:10px;color:var(--text-dim);background:${clr}18;border-radius:5px;padding:1px 6px;">${esc(m.bank)}</span>` : ''}
            ${m.cardType ? `<span style="font-size:9px;color:var(--text-dim);opacity:0.7;">${m.cardType}</span>` : ''}
          </div>
          ${m.holder ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">👤 ${esc(m.holder)}</div>` : ''}
          <div style="font-family:'JetBrains Mono',monospace;font-size:15px;color:#fff;margin-bottom:8px;letter-spacing:1px;">${cardNumDisplay}</div>
          ${m.clabe ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;font-family:'JetBrains Mono',monospace;">CLABE: ${esc(m.clabe)}</div>` : ''}
          ${m.accountNum ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;font-family:'JetBrains Mono',monospace;">Cta: ${esc(m.accountNum)}</div>` : ''}
          ${m.branch ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;">🏢 ${esc(m.branch)}</div>` : ''}
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;">
            <div><div style="font-size:9px;color:var(--text-muted);">CORTE</div><div style="font-size:13px;font-weight:700;color:#fff;">Día ${m.cutDay||'—'}</div></div>
            <div><div style="font-size:9px;color:var(--text-muted);">PAGO</div><div style="font-size:13px;font-weight:700;color:${daysToPayment!==null&&daysToPayment<=3?'#f87171':'#fff'};">Día ${m.payDay||'—'}${daysToPayment!==null?` <span style="font-size:10px;opacity:0.7;">(${daysToPayment}d)</span>`:''}</div></div>
            ${m.limit ? `<div><div style="font-size:9px;color:var(--text-muted);">LÍMITE</div><div style="font-size:13px;font-weight:700;color:#fff;">${fmt$(m.limit)}</div></div>` : ''}
            <div><div style="font-size:9px;color:var(--text-muted);">MONEDA</div><div style="font-size:12px;font-weight:700;color:${clr};">${m.currency||'MXN'}</div></div>
          </div>
          <button onclick="deleteAgendaItem('${c.id}')" style="position:absolute;bottom:10px;right:10px;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:13px;" title="Eliminar">✕</button>
        </div>`
      }).join('')

  // ── SUSCRIPCIONES ─────────────────────────────────────────────
  const subsEl = document.getElementById('agenda-subs')
  if (subsEl) subsEl.innerHTML = subs.length === 0
    ? `<div style="color:var(--text-muted);font-size:12px;">Sin suscripciones registradas.</div>`
    : subs.map(s => {
        const m = s.metadata || {}
        const clr = m.color || '#a78bfa'
        return `<div style="background:${clr}18;border:1px solid ${clr}33;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px;">
          <div style="font-size:24px;">${m.category?.split(' ')[0] || '🔄'}</div>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:#fff;">${esc(m.label||s.content)}</div>
            <div style="font-size:10px;color:var(--text-muted);">Día ${m.dayOfMonth||'—'} · ${m.currency||'MXN'}</div>
          </div>
          <div style="font-size:13px;font-weight:800;color:${clr};font-family:'JetBrains Mono',monospace;">${fmt$(m.amount||0)}</div>
          <button onclick="deleteAgendaItem('${s.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;" title="Eliminar">✕</button>
        </div>`
      }).join('')

  // ── PAGOS FIJOS ───────────────────────────────────────────────
  const billsEl = document.getElementById('agenda-bills')
  if (billsEl) billsEl.innerHTML = bills.length === 0
    ? `<div style="color:var(--text-muted);font-size:12px;">Sin pagos fijos registrados.</div>`
    : bills.map(b => {
        const m = b.metadata || {}
        const clr = m.color || '#fb923c'
        const paid = m.paid || false
        const billContact = m.contactId ? allNodes.find(n => n.id === m.contactId) : null
        const billContactName = billContact ? (billContact.metadata?.name || billContact.content) : ''
        const methodLabel = { transferencia:'🏦 Transferencia', tarjeta:'💳 Tarjeta', efectivo:'💵 Efectivo', cripto:'₿ Cripto', domiciliado:'🔄 Cargo domiciliado' }
        const freqLabel = { mensual:'Mensual', bimestral:'Bimestral', trimestral:'Trimestral', semestral:'Semestral', anual:'Anual' }
        const freqStr = m.frequency ? freqLabel[m.frequency] || m.frequency : 'Mensual'
        const amountStr = m.amount != null ? fmt$(m.amount) : '<span style="font-size:10px;font-style:italic;color:var(--text-muted);">Variable</span>'
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:${paid?'rgba(74,222,128,0.05)':clr+'14'};border:1px solid ${paid?'#4ade8033':clr+'33'};border-radius:12px;opacity:${paid?0.6:1};">
          <button onclick="toggleBillPaid('${b.id}')" style="background:${paid?'#4ade80':'transparent'};border:2px solid ${paid?'#4ade80':clr};width:20px;height:20px;border-radius:5px;cursor:pointer;flex-shrink:0;color:${paid?'#000':'transparent'};font-size:12px;display:flex;align-items:center;justify-content:center;">✓</button>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:600;color:#fff;${paid?'text-decoration:line-through;':''}">${esc(m.label||b.content)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:3px;">
              ${m.dueDate?`<span style="font-size:10px;color:var(--text-muted);">📅 ${m.dueDate}</span>`:''}
              <span style="font-size:10px;color:${clr}88;">🔁 ${freqStr}</span>
              ${billContactName?`<span style="font-size:10px;color:var(--text-muted);">→ ${esc(billContactName)}</span>`:''}
              ${m.method?`<span style="font-size:10px;color:var(--text-muted);">${methodLabel[m.method]||m.method}</span>`:''}
            </div>
          </div>
          <div style="font-size:13px;font-weight:800;color:${clr};font-family:'JetBrains Mono',monospace;">${amountStr}</div>
          <button onclick="editAgendaItem('${b.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;" title="Editar">✏️</button>
          <button onclick="deleteAgendaItem('${b.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;" title="Eliminar">✕</button>
        </div>`
      }).join('')

  // Crypto portfolio
  renderCryptoPortfolio()
}

function fmt$(n) {
  if (typeof n !== 'number') return '$0'
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ── AGENDA MODAL ──────────────────────────────────────────────────────────────
window.openAgendaModal = (type, prefillProjectTag = '') => {
  agendaItemType = type
  editingAgendaId = null
  window._agendaPrefillProject = prefillProjectTag
  agendaColor = type === 'card' ? '#60a5fa' : type === 'subscription' ? '#a78bfa' : '#fb923c'
  const titles = { card:'Nueva Tarjeta de Crédito', subscription:'Nueva Suscripción / Servicio', bill:'Nuevo Pago Fijo' }
  document.getElementById('agenda-modal-title').textContent = titles[type] || 'Nuevo Ítem'
  document.getElementById('ag-name').value = ''
  // Toggle field groups
  document.getElementById('ag-fields-card').style.display      = type === 'card' ? '' : 'none'
  document.getElementById('ag-fields-recurring').style.display = type !== 'card' ? '' : 'none'
  document.getElementById('ag-category-wrap').style.display    = type === 'subscription' ? '' : 'none'
  document.getElementById('ag-bill-fields').style.display      = type === 'bill' ? '' : 'none'
  if (type !== 'card') {
    document.getElementById('ag-amount').value = ''
    document.getElementById('ag-day').value    = ''
    if (document.getElementById('ag-frequency')) document.getElementById('ag-frequency').value = 'mensual'
  } else {
    document.getElementById('ag-last4').value       = ''
    document.getElementById('ag-limit').value       = ''
    document.getElementById('ag-cut-day').value     = ''
    document.getElementById('ag-pay-day').value     = ''
    document.getElementById('ag-bank').value        = ''
    document.getElementById('ag-holder').value      = ''
    document.getElementById('ag-card-number').value = ''
    document.getElementById('ag-clabe').value       = ''
    document.getElementById('ag-account-num').value = ''
    document.getElementById('ag-branch').value      = ''
  }
  // Populate contact dropdown for bills
  if (type === 'bill') {
    const sel = document.getElementById('ag-bill-contact')
    const infoEl = document.getElementById('ag-bill-contact-info')
    if (sel) {
      const contacts = getContacts()
      sel.innerHTML = '<option value="">— Sin contacto —</option>' +
        contacts.map(c => {
          const name = c.metadata?.name || c.content
          return `<option value="${c.id}">${esc(name)}</option>`
        }).join('')
      if (infoEl) infoEl.style.display = 'none'
      sel.onchange = () => {
        const cId = sel.value
        if (!cId || !infoEl) { infoEl && (infoEl.style.display='none'); return }
        const contact = allNodes.find(n => n.id === cId)
        if (!contact) { infoEl.style.display='none'; return }
        const m = contact.metadata || {}
        const parts = []
        if (m.bank_name || m.bank) parts.push(`🏦 ${m.bank_name || m.bank}`)
        if (m.clabe)               parts.push(`CLABE: ${m.clabe}`)
        if (m.account)             parts.push(`Cta: ${m.account}`)
        if (m.phone)               parts.push(`📞 ${m.phone}`)
        if (m.email)               parts.push(`✉ ${m.email}`)
        if (m.address?.wallet)     parts.push(`₿ ${m.address.wallet}`)
        if (parts.length) { infoEl.innerHTML = parts.join(' &nbsp;·&nbsp; '); infoEl.style.display = '' }
        else infoEl.style.display = 'none'
      }
    }
  }
  // Reset color swatches
  document.querySelectorAll('#agenda-modal .ev-color-swatch').forEach(s => s.classList.remove('active'))
  document.querySelector(`#agenda-modal .ev-color-swatch[data-color="${agendaColor}"]`)?.classList.add('active')
  document.getElementById('agenda-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('ag-name')?.focus(), 60)
}
window.closeAgendaModal = () => document.getElementById('agenda-modal')?.classList.add('hidden')
window.toggleAgendaAccount = (accId, checkbox) => {
  // If currently "all selected" (empty set), initialize with all ids checked minus the one being unchecked
  if (agendaPlanAccounts.size === 0) {
    const allAcc = allNodes.filter(n => n.type === 'account').map(n => n.id)
    allAcc.forEach(id => agendaPlanAccounts.add(id))
  }
  if (checkbox.checked) agendaPlanAccounts.add(accId)
  else agendaPlanAccounts.delete(accId)
  // If all selected again → reset to "all" state
  const allAcc = allNodes.filter(n => n.type === 'account').map(n => n.id)
  if (allAcc.every(id => agendaPlanAccounts.has(id))) agendaPlanAccounts.clear()
  renderAgenda(allNodes)
}
window.selectAgendaColor = (btn) => {
  document.querySelectorAll('#agenda-modal .ev-color-swatch').forEach(s => s.classList.remove('active'))
  btn.classList.add('active'); agendaColor = btn.dataset.color
}
window.saveAgendaItem = async () => {
  const name = document.getElementById('ag-name')?.value.trim()
  if (!name) { showToast('⚠️ El nombre es obligatorio'); return }
  let meta = { label: name, color: agendaColor }
  if (agendaItemType === 'card') {
    meta = { ...meta,
      bank:       document.getElementById('ag-bank')?.value.trim() || '',
      cardType:   document.getElementById('ag-card-type')?.value || 'crédito',
      holder:     document.getElementById('ag-holder')?.value.trim() || '',
      lastFour:   document.getElementById('ag-last4')?.value.trim() || '',
      cardNumber: document.getElementById('ag-card-number')?.value.replace(/\s/g,'') || '',
      clabe:      document.getElementById('ag-clabe')?.value.trim() || '',
      accountNum: document.getElementById('ag-account-num')?.value.trim() || '',
      branch:     document.getElementById('ag-branch')?.value.trim() || '',
      limit:      parseFloat(document.getElementById('ag-limit')?.value) || 0,
      cutDay:     parseInt(document.getElementById('ag-cut-day')?.value) || null,
      payDay:     parseInt(document.getElementById('ag-pay-day')?.value) || null,
      currency:   document.getElementById('ag-card-currency')?.value || 'MXN'
    }
  } else {
    const rawAmt = document.getElementById('ag-amount')?.value?.trim()
    const frequency = document.getElementById('ag-frequency')?.value || 'mensual'
    const freqMonths = { mensual:1, bimestral:2, trimestral:3, semestral:6, anual:12 }
    meta = { ...meta,
      amount:     rawAmt !== '' ? (parseFloat(rawAmt) || 0) : null,
      currency:   document.getElementById('ag-currency')?.value || 'MXN',
      dayOfMonth: parseInt(document.getElementById('ag-day')?.value) || null,
      frequency,
      category:   document.getElementById('ag-category')?.value || '',
      paid: false
    }
    if (agendaItemType === 'bill') {
      meta.contactId = document.getElementById('ag-bill-contact')?.value || ''
      meta.method    = document.getElementById('ag-bill-method')?.value || 'transferencia'
      meta.dueDate = (() => {
        const day = meta.dayOfMonth; if (!day) return ''
        const d = new Date(); d.setDate(day)
        const months = freqMonths[frequency] || 1
        // Avanzar al próximo vencimiento según frecuencia
        while (d <= new Date()) d.setMonth(d.getMonth() + months)
        return d.toISOString().split('T')[0]
      })()
    }
    // Pre-fill project tag if opened from project dashboard
    if (window._agendaPrefillProject) {
      meta.project_tag = window._agendaPrefillProject
      if (!meta.tags) meta.tags = []
      if (!meta.tags.includes('#'+window._agendaPrefillProject)) meta.tags.push('#'+window._agendaPrefillProject)
    }
  }
  closeAgendaModal()
  window._agendaPrefillProject = ''
  if (editingAgendaId) {
    // Edit mode — update existing node
    const node = allNodes.find(n => n.id === editingAgendaId)
    if (node) {
      node.content  = name
      node.metadata = { ...node.metadata, ...meta }
      if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
        await supabase.from('nodes').update({ content: name, metadata: node.metadata }).eq('id', editingAgendaId)
      renderAll()
      showToast('✅ Actualizado')
    }
    editingAgendaId = null
  } else {
    await insertDirectNode(agendaItemType, name, meta)
  }
}
window.editAgendaItem = (nodeId) => {
  const node = allNodes.find(n => n.id === nodeId)
  if (!node) return
  const m = node.metadata || {}
  agendaItemType  = node.type
  editingAgendaId = nodeId
  agendaColor     = m.color || (node.type === 'card' ? '#60a5fa' : node.type === 'subscription' ? '#a78bfa' : '#fb923c')
  const titles = { card:'Editar Tarjeta', subscription:'Editar Suscripción', bill:'Editar Pago Fijo' }
  document.getElementById('agenda-modal-title').textContent = titles[node.type] || 'Editar'
  document.getElementById('ag-name').value = m.label || node.content || ''
  document.getElementById('ag-fields-card').style.display      = node.type === 'card' ? '' : 'none'
  document.getElementById('ag-fields-recurring').style.display = node.type !== 'card' ? '' : 'none'
  document.getElementById('ag-category-wrap').style.display    = node.type === 'subscription' ? '' : 'none'
  document.getElementById('ag-bill-fields').style.display      = node.type === 'bill' ? '' : 'none'
  if (node.type !== 'card') {
    document.getElementById('ag-amount').value = m.amount != null ? m.amount : ''
    document.getElementById('ag-day').value    = m.dayOfMonth || ''
    if (document.getElementById('ag-currency')) document.getElementById('ag-currency').value = m.currency || 'MXN'
    if (document.getElementById('ag-frequency')) document.getElementById('ag-frequency').value = m.frequency || 'mensual'
    if (node.type === 'subscription' && document.getElementById('ag-category')) document.getElementById('ag-category').value = m.category || ''
    if (node.type === 'bill') {
      if (document.getElementById('ag-bill-method')) document.getElementById('ag-bill-method').value = m.method || 'transferencia'
      // Populate & set contact
      const sel = document.getElementById('ag-bill-contact')
      if (sel) {
        const contacts = getContacts()
        sel.innerHTML = '<option value="">— Sin contacto —</option>' + contacts.map(c => {
          const name = c.metadata?.name || c.content
          return `<option value="${c.id}" ${m.contactId===c.id?'selected':''}>${esc(name)}</option>`
        }).join('')
      }
    }
  }
  document.querySelectorAll('#agenda-modal .ev-color-swatch').forEach(s => s.classList.remove('active'))
  document.querySelector(`#agenda-modal .ev-color-swatch[data-color="${agendaColor}"]`)?.classList.add('active')
  document.getElementById('agenda-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('ag-name')?.focus(), 60)
}

window.deleteAgendaItem = async (nodeId) => {
  if (!confirm('¿Eliminar este ítem?')) return
  allNodes = allNodes.filter(n => n.id !== nodeId)
  renderAll()
  if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
    await supabase.from('nodes').delete().eq('id', nodeId)
}
window.toggleBillPaid = async (nodeId) => {
  const node = allNodes.find(n => n.id === nodeId); if (!node) return
  node.metadata = { ...node.metadata, paid: !node.metadata?.paid }
  renderAll()
  if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', nodeId)
}

// ═══════════════════════════════════════════════════════════
// ABONOS — Pagos parciales a proveedores
// ═══════════════════════════════════════════════════════════
let _abonoProviderId   = null
let _abonoProjectSlug  = null
let _abonoRefreshId    = null   // project id to refresh after save

window.openAbonoModal = (provId, provName, projSlug, projectId) => {
  _abonoProviderId  = provId
  _abonoProjectSlug = projSlug
  _abonoRefreshId   = projectId
  const infoEl = document.getElementById('abono-proveedor-info')
  if (infoEl) infoEl.textContent = `💸 Abono a: ${provName}`
  document.getElementById('abono-amount').value = ''
  document.getElementById('abono-date').value   = new Date().toISOString().split('T')[0]
  document.getElementById('abono-method').value = 'transferencia'
  document.getElementById('abono-notes').value  = ''
  document.getElementById('abono-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('abono-amount')?.focus(), 60)
}
window.closeAbonoModal = () => document.getElementById('abono-modal')?.classList.add('hidden')

window.saveAbono = async () => {
  const amount = parseFloat(document.getElementById('abono-amount').value)
  if (!amount || amount <= 0) { showToast('⚠️ Ingresa un monto válido'); return }
  const date   = document.getElementById('abono-date').value || new Date().toISOString().split('T')[0]
  const method = document.getElementById('abono-method').value
  const notes  = document.getElementById('abono-notes').value.trim()
  const label  = notes || `Abono ${method}`
  const meta = {
    label, amount, date,
    method,
    contact_id:  _abonoProviderId,
    project_tag: _abonoProjectSlug,
    es_abono:    true,
    notes:       notes || undefined,
  }
  closeAbonoModal()
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    const tmp = { id: Math.random().toString(36).substr(2,9), type:'expense', content:label, metadata:meta, created_at: new Date().toISOString() }
    allNodes.unshift(tmp)
  } else {
    const { data } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'expense', content:label, metadata:meta }).select()
    if (data?.[0]) allNodes.unshift(data[0])
  }
  await autoLinkToProject(allNodes[0]?.id, _abonoProjectSlug)
  showToast(`✅ Abono de $${amount.toLocaleString('es-MX')} registrado`)
  if (_abonoRefreshId) openProjectDashboard(_abonoRefreshId)
}

// ═══════════════════════════════════════════════════════════
// DEMO DATA SEEDER — Sprint 5D
// 3 proyectos genéricos: casa, boda, estudio freelance
// ═══════════════════════════════════════════════════════════
window.seedDemoData = async () => {
  if (!confirm('⚠️ Esto insertará datos de demostración. ¿Continuar?')) return
  const uid = currentUser?.id
  const bypass = localStorage.getItem('nexus_admin_bypass') === 'true'
  const now = () => new Date().toISOString()
  const makeNode = (type, content, metadata) => ({ owner_id:uid, type, content, metadata, created_at:now() })

  // Helper: insert locally + to supabase
  const ins = async (nodes) => {
    for (const n of nodes) {
      if (bypass) { allNodes.unshift({id:'demo_'+Math.random().toString(36).substr(2,8),...n}) }
      else { const {data} = await supabase.from('nodes').insert(n).select(); if(data?.[0]) allNodes.unshift(data[0]) }
    }
  }

  // ── 1. Proyecto: Remodelación Casa ──────────────────────
  await ins([
    makeNode('proyecto','Remodelación Casa Playa',{label:'Remodelación Casa Playa',budget:480000,rol:'administrador',desc:'Remodelación integral — cocina, baños y terraza',tags:['#proyecto','#casaplaya'],color:'#2dd4bf'}),
    makeNode('contact','Ing. Roberto Díaz',{name:'Ing. Roberto Díaz',cType:'proveedor',specialty:'Construcción general',phone:'612-111-2233',tags:['#proveedor']}),
    makeNode('contact','Electroservicios Luna',{name:'Electroservicios Luna',cType:'proveedor',specialty:'Eléctrico',tags:['#proveedor']}),
    makeNode('contact','Luis Armando Vargas',{name:'Luis Armando Vargas',cType:'persona',tags:['#persona']}),
    makeNode('cotizacion','Remodelación cocina completa',{label:'Remodelación cocina completa',amount:85000,status:'aceptada',category:'Albañilería',project_tag:'casaplaya',tags:['#cotizacion','#casaplaya']}),
    makeNode('cotizacion','Instalación eléctrica 220V terraza',{label:'Instalación eléctrica 220V terraza',amount:32000,status:'aceptada',category:'Eléctrico',project_tag:'casaplaya',tags:['#cotizacion','#casaplaya']}),
    makeNode('cotizacion','Impermeabilización techo',{label:'Impermeabilización techo',amount:28000,status:'pendiente',category:'Impermeabilización',project_tag:'casaplaya',tags:['#cotizacion','#casaplaya']}),
    makeNode('expense','Pago anticipo — Remodelación cocina',{label:'Pago anticipo — Remodelación cocina',amount:42500,project_tag:'casaplaya',expense_type:'servicio',tags:['#gasto','#casaplaya']}),
    makeNode('bill','Agua potable — Casa Playa',{label:'Agua potable — Casa Playa',amount:450,dayOfMonth:5,project_tag:'casaplaya',tags:['#casaplaya']}),
    makeNode('bill','CFE — Casa Playa',{label:'CFE — Casa Playa',amount:1800,dayOfMonth:15,project_tag:'casaplaya',tags:['#casaplaya']}),
    makeNode('bill','Internet Telmex — Casa Playa',{label:'Internet Telmex — Casa Playa',amount:599,dayOfMonth:20,project_tag:'casaplaya',tags:['#casaplaya']}),
  ])

  // ── 2. Proyecto: Boda García ────────────────────────────
  await ins([
    makeNode('proyecto','Boda García-Mendoza',{label:'Boda García-Mendoza',budget:220000,rol:'administrador',desc:'Coordinación integral de boda para 150 personas',tags:['#proyecto','#bodagarcia'],color:'#f472b6'}),
    makeNode('contact','Salón Los Arcos',{name:'Salón Los Arcos',cType:'proveedor',specialty:'Renta de salón',tags:['#proveedor']}),
    makeNode('contact','Chef Mario Ríos',{name:'Chef Mario Ríos',cType:'proveedor',specialty:'Catering / Chef',tags:['#proveedor']}),
    makeNode('cotizacion','Renta salón + mobiliario 8 horas',{label:'Renta salón + mobiliario 8 horas',amount:65000,status:'aceptada',category:'Renta de mobiliario',project_tag:'bodagarcia',tags:['#cotizacion','#bodagarcia']}),
    makeNode('cotizacion','Catering 150 personas — menú premium',{label:'Catering 150 personas — menú premium',amount:75000,status:'aceptada',category:'Catering / Chef',project_tag:'bodagarcia',tags:['#cotizacion','#bodagarcia']}),
    makeNode('cotizacion','Flores y decoración',{label:'Flores y decoración',amount:28000,status:'pendiente',category:'Decoración',project_tag:'bodagarcia',tags:['#cotizacion','#bodagarcia']}),
    makeNode('cotizacion','Fotografía y video del evento',{label:'Fotografía y video del evento',amount:22000,status:'pendiente',category:'Fotografía de evento',project_tag:'bodagarcia',tags:['#cotizacion','#bodagarcia']}),
    makeNode('expense','Anticipo salón Los Arcos — 50%',{label:'Anticipo salón Los Arcos — 50%',amount:32500,project_tag:'bodagarcia',expense_type:'servicio',tags:['#gasto','#bodagarcia']}),
  ])

  // ── 3. Proyecto: Estudio Freelance ──────────────────────
  await ins([
    makeNode('proyecto','Estudio Foto & Video',{label:'Estudio Foto & Video',budget:95000,rol:'dueño',desc:'Acondicionamiento de estudio para fotografía y producción',tags:['#proyecto','#estudiofreelance'],color:'#818cf8'}),
    makeNode('contact','Electrónica Profesional SA',{name:'Electrónica Profesional SA',cType:'proveedor',specialty:'Eléctrico / Iluminación',tags:['#proveedor']}),
    makeNode('cotizacion','Instalación rieles y dimmer para luces estudio',{label:'Instalación rieles y dimmer para luces estudio',amount:18500,status:'aceptada',category:'Eléctrico',project_tag:'estudiofreelance',tags:['#cotizacion','#estudiofreelance']}),
    makeNode('cotizacion','Pintura y tratamiento acústico paredes',{label:'Pintura y tratamiento acústico paredes',amount:14000,status:'aceptada',category:'Pintura',project_tag:'estudiofreelance',tags:['#cotizacion','#estudiofreelance']}),
    makeNode('cotizacion','Carpintería — mesa de dirección y racks',{label:'Carpintería — mesa de dirección y racks',amount:22000,status:'rechazada',category:'Carpintería',project_tag:'estudiofreelance',tags:['#cotizacion','#estudiofreelance']}),
    makeNode('cotizacion','Carpintería alternativa — mesa DM',{label:'Carpintería alternativa — mesa DM',amount:14500,status:'pendiente',category:'Carpintería',project_tag:'estudiofreelance',tags:['#cotizacion','#estudiofreelance']}),
    makeNode('expense','Pago instalación eléctrica — 100%',{label:'Pago instalación eléctrica — 100%',amount:18500,project_tag:'estudiofreelance',expense_type:'servicio',tags:['#gasto','#estudiofreelance']}),
    makeNode('bill','Internet fibra — Estudio',{label:'Internet fibra — Estudio',amount:799,dayOfMonth:1,project_tag:'estudiofreelance',tags:['#estudiofreelance']}),
  ])

  renderAll()
  switchView('proyectos')
  showToast('✅ Datos de demostración insertados — 3 proyectos listos')
}

// Logout
document.getElementById('btn-logout')?.addEventListener('click', async (e) => {
  e.stopPropagation()
  localStorage.removeItem('nexus_admin_bypass')
  await supabase.auth.signOut()
  window.location.href = '/'
})

// Navegación
document.querySelectorAll('.nav-item:not(#btn-logout)').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.view) return
    switchView(btn.dataset.view)
  })
})

window.switchView = function(viewName) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
  const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`)
  if (navBtn) navBtn.classList.add('active')
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'))
  const target = document.getElementById(`view-${viewName}`)
  if (target) target.classList.add('active')
  activeView = viewName
  // Lazy render — dispara el render de la nueva vista activa
  const nodes = getFilteredNodes()
  const viewFn = VIEW_RENDER_MAP[viewName]
  if (viewFn) { try { viewFn(nodes) } catch(e) { console.warn('[switchView]', e) } }
  // Vistas especiales no en el mapa
  if (viewName === 'tags') { window.renderTagsView?.(); window.renderHabitosSection?.() }
  if (viewName === 'settings') { try { renderConfigSpecCatalog() } catch(e) {} }
  // Crónica legacy → redirige a Tiempo tab Pasado
  if (viewName === 'cronica') { switchView('calendar'); switchTiempoTab('pasado'); return }
}

window.switchTiempoTab = (tab) => {
  const futuro = document.getElementById('tiempo-panel-futuro')
  const pasado = document.getElementById('tiempo-panel-pasado')
  const btnF = document.getElementById('tiempo-tab-futuro')
  const btnP = document.getElementById('tiempo-tab-pasado')
  if (!futuro || !pasado) return
  if (tab === 'futuro') {
    futuro.style.display = ''; pasado.style.display = 'none'
    if (btnF) { btnF.style.background = 'var(--accent-cyan)'; btnF.style.color = '#000'; btnF.style.fontWeight = '700' }
    if (btnP) { btnP.style.background = 'transparent'; btnP.style.color = 'var(--text-muted)'; btnP.style.fontWeight = '600' }
  } else {
    futuro.style.display = 'none'; pasado.style.display = ''
    if (btnP) { btnP.style.background = 'var(--accent-cyan)'; btnP.style.color = '#000'; btnP.style.fontWeight = '700' }
    if (btnF) { btnF.style.background = 'transparent'; btnF.style.color = 'var(--text-muted)'; btnF.style.fontWeight = '600' }
    // Auto-set crónica a hoy si no tiene fecha
    const dateEl = document.getElementById('cronica-date')
    if (dateEl && !dateEl.value) { dateEl.value = new Date().toISOString().slice(0,10); if (typeof renderCronicaView === 'function') renderCronicaView() }
  }
}

// ── COLLAPSIBLE PANELS ───────────────────────────────────────────────────────
// ── AUDIO BEEP UTIL ──────────────────────────────────────────────────────────
function playBeep(freq = 880, duration = 0.3, volume = 0.5, delay = 0) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, ctx.currentTime + delay)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration)
    osc.start(ctx.currentTime + delay)
    osc.stop(ctx.currentTime + delay + duration + 0.05)
  } catch(e) {}
}

function playAlarm() {
  // 3 beeps descendentes
  playBeep(880, 0.25, 0.5, 0.0)
  playBeep(660, 0.25, 0.5, 0.35)
  playBeep(440, 0.35, 0.6, 0.70)
}

function playClick() {
  playBeep(1200, 0.06, 0.2, 0)
}

// ── COLLAPSIBLE PANELS ───────────────────────────────────────────────────────
window.togglePanel = function(which) {
  const cls = which === 'nav' ? 'nav-collapsed' : 'side-collapsed'
  const collapsed = document.body.classList.toggle(cls)
  if (collapsed) {
    localStorage.setItem('nexus_' + cls, '1')
  } else {
    localStorage.removeItem('nexus_' + cls)   // default = open, no key needed
  }
  const btn = document.getElementById('toggle-' + which)
  if (!btn) return
  if (which === 'nav')  btn.textContent = collapsed ? '▶' : '◀'
  if (which === 'side') btn.textContent = collapsed ? '◀' : '▶'
  playClick()
}

// Restore panel state — must run after DOM ready
// ── FIX LAYOUT DOM ───────────────────────────────────────────────────────────
// The HTML parser closes #nexus-layout before <aside> due to unbalanced divs
// inside <main>. Fix: inject position:fixed CSS for the aside so it works
// regardless of its DOM position, and compensate the main layout's right padding.
function fixLayoutDOM() {
  // Inject critical CSS override once
  if (!document.getElementById('__nexus-sidebar-fix')) {
    const s = document.createElement('style')
    s.id = '__nexus-sidebar-fix'
    s.textContent = `
      aside#widgets-sidebar {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        width: var(--widget-width, 320px) !important;
        height: 100% !important;
        z-index: 100 !important;
        overflow-y: auto !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 24px !important;
        padding: 32px 24px !important;
        background: var(--bg-widget) !important;
        border-left: 1px solid var(--glass-border) !important;
      }
      body.side-collapsed aside#widgets-sidebar {
        transform: translateX(var(--widget-width, 320px)) !important;
        pointer-events: none !important;
        padding: 0 !important;
      }
      /* Compensate main for fixed aside */
      #nexus-layout {
        padding-right: var(--widget-width, 320px) !important;
        box-sizing: border-box !important;
        grid-template-columns: var(--sidebar-width, 260px) 1fr !important;
        grid-template-areas: "nav main" !important;
      }
      body.nav-collapsed #nexus-layout {
        grid-template-columns: 0px 1fr !important;
      }
      body.side-collapsed #nexus-layout {
        padding-right: 0 !important;
      }
      /* Toggle button */
      #toggle-side {
        right: calc(var(--widget-width, 320px) - 1px) !important;
      }
      body.side-collapsed #toggle-side {
        right: 0px !important;
      }
      /* Spotlight */
      #spotlight-container {
        right: calc(var(--widget-width, 320px) + 40px) !important;
      }
      body.side-collapsed #spotlight-container {
        right: 40px !important;
      }
    `
    document.head.appendChild(s)
  }
}

function restorePanels() {
  if (localStorage.getItem('nexus_nav-collapsed') === '1') {
    document.body.classList.add('nav-collapsed')
    const b = document.getElementById('toggle-nav'); if (b) b.textContent = '▶'
  }
  // Sidebar derecha: default OPEN — only collapse if explicitly set to '1'
  if (localStorage.getItem('nexus_side-collapsed') === '1') {
    document.body.classList.add('side-collapsed')
    const b = document.getElementById('toggle-side'); if (b) b.textContent = '◀'
  } else {
    // Make sure it's explicitly open (clears any stale collapsed state)
    document.body.classList.remove('side-collapsed')
    localStorage.removeItem('nexus_side-collapsed')
    const b = document.getElementById('toggle-side'); if (b) b.textContent = '▶'
  }
}

// Expose sidebar reset for console/debug
window.resetSidebars = () => {
  localStorage.removeItem('nexus_side-collapsed')
  localStorage.removeItem('nexus_nav-collapsed')
  document.body.classList.remove('side-collapsed','nav-collapsed')
  const tn = document.getElementById('toggle-nav'); if (tn) tn.textContent = '◀'
  const ts = document.getElementById('toggle-side'); if (ts) ts.textContent = '▶'
  showToast('✅ Sidebars restauradas')
}

// ── WORLD CLOCK ──────────────────────────────────────────────────────────────
function initWorldClock() {
  const zones = [
    { id: 'clock-cdmx',  tz: 'America/Mexico_City' },
    { id: 'clock-tulum', tz: 'America/Cancun'       },
    { id: 'clock-local', tz: null },
  ]
  const localTzEl = document.getElementById('clock-local-tz')
  if (localTzEl) localTzEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'

  function tick() {
    const now = new Date()
    zones.forEach(({ id, tz }) => {
      const el = document.getElementById(id)
      if (!el) return
      el.textContent = now.toLocaleTimeString('es-MX', {
        timeZone: tz || undefined,
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      })
    })
  }
  tick()
  setInterval(tick, 1000)
}

// ── CRONÓMETRO ───────────────────────────────────────────────────────────────
// ── CRONÓMETRO ───────────────────────────────────────────────────────────────
let swRunning = false, swStart = 0, swElapsed = 0, swRafId = null, swLaps = []

function swRender() {
  const total = swElapsed + (swRunning ? Date.now() - swStart : 0)
  const ms  = Math.floor((total % 1000) / 10)
  const sec = Math.floor(total / 1000) % 60
  const min = Math.floor(total / 60000)
  const disp = document.getElementById('sw-display')
  if (disp) disp.textContent = String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0') + '.' + String(ms).padStart(2,'0')
  const alertEl = document.getElementById('sw-alert')
  const elapsed = document.getElementById('sw-elapsed')
  if (alertEl && swRunning) { alertEl.style.display = 'block'; if (elapsed) elapsed.textContent = `${Math.floor(total/1000)}s` }
  if (swRunning) swRafId = requestAnimationFrame(swRender)
}

window.swToggle = function() {
  const btn = document.getElementById('sw-btn')
  if (swRunning) {
    swElapsed += Date.now() - swStart
    swRunning = false
    cancelAnimationFrame(swRafId)
    if (btn) btn.textContent = '▶ Continuar'
    playBeep(660, 0.15, 0.3)
    // Notificación visual de pausa
    const alertEl = document.getElementById('sw-alert')
    if (alertEl) alertEl.style.display = 'none'
  } else {
    swStart = Date.now()
    swRunning = true
    if (btn) btn.textContent = '⏸ Pausar'
    playBeep(880, 0.1, 0.3)
    swRafId = requestAnimationFrame(swRender)
  }
}

window.swLap = function() {
  if (!swRunning && swElapsed === 0) return
  const total = swElapsed + (swRunning ? Date.now() - swStart : 0)
  const ms  = Math.floor((total % 1000) / 10)
  const sec = Math.floor(total / 1000) % 60
  const min = Math.floor(total / 60000)
  const lapStr = `#${swLaps.length+1} — ${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(2,'0')}`
  swLaps.push(lapStr)
  const lapsEl = document.getElementById('sw-laps')
  if (lapsEl) lapsEl.innerHTML = swLaps.slice(-4).reverse().map(l=>`<div style="border-bottom:1px solid var(--glass-border);padding:2px 0;">${l}</div>`).join('')
  playBeep(1000, 0.08, 0.2)
}

window.swReset = function() {
  cancelAnimationFrame(swRafId)
  swRunning = false; swElapsed = 0; swStart = 0; swLaps = []
  const btn  = document.getElementById('sw-btn')
  const disp = document.getElementById('sw-display')
  const laps = document.getElementById('sw-laps')
  const alrt = document.getElementById('sw-alert')
  if (btn)  btn.textContent  = '▶ Iniciar'
  if (disp) disp.textContent = '00:00.00'
  if (laps) laps.innerHTML   = ''
  if (alrt) alrt.style.display = 'none'
  playBeep(440, 0.1, 0.2)
}

// ── CUENTA REGRESIVA ─────────────────────────────────────────────────────────
let cdRunning = false, cdRemaining = 0, cdInterval = null

function cdRenderDisp() {
  const hr   = Math.floor(cdRemaining / 3600)
  const min  = Math.floor((cdRemaining % 3600) / 60)
  const sec  = cdRemaining % 60
  const disp = document.getElementById('cd-display')
  const str  = hr > 0
    ? `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  if (disp) {
    disp.textContent = str
    // Color warning cuando quedan ≤ 60 segundos
    disp.style.color = cdRemaining <= 10 ? '#f87171' : cdRemaining <= 60 ? '#fb923c' : '#fff'
  }
  if (cdRemaining <= 5 && cdRemaining > 0) playBeep(1200, 0.08, 0.15)
}

window.cdToggle = function() {
  const btn = document.getElementById('cd-btn')
  if (cdRunning) {
    clearInterval(cdInterval)
    cdRunning = false
    if (btn) btn.textContent = '▶ Continuar'
    playBeep(660, 0.15, 0.3)
  } else {
    if (cdRemaining <= 0) {
      const hr  = parseInt(document.getElementById('cd-hr')?.value  || '0') || 0
      const min = parseInt(document.getElementById('cd-min')?.value || '0') || 0
      const sec = parseInt(document.getElementById('cd-sec')?.value || '0') || 0
      cdRemaining = hr * 3600 + min * 60 + sec
      if (cdRemaining <= 0) { alert('Configura un tiempo mayor a 0'); return }
      document.getElementById('cd-display')?.classList.remove('finished')
      document.getElementById('cd-alert')?.setAttribute('style','display:none')
    }
    cdRunning = true
    if (btn) btn.textContent = '⏸ Pausar'
    playBeep(880, 0.1, 0.3)
    cdInterval = setInterval(() => {
      cdRemaining--
      cdRenderDisp()
      if (cdRemaining <= 0) {
        clearInterval(cdInterval)
        cdRunning = false
        cdRemaining = 0
        const btn2 = document.getElementById('cd-btn')
        if (btn2) btn2.textContent = '▶ Iniciar'
        document.getElementById('cd-display')?.classList.add('finished')
        // Mostrar panel de alerta visual
        const alertEl = document.getElementById('cd-alert')
        if (alertEl) alertEl.style.display = 'block'
        // Alarma sonora repetida 3 veces
        playAlarm()
        setTimeout(() => playAlarm(), 1200)
        setTimeout(() => playAlarm(), 2400)
        // Intentar notificación del navegador
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏳ Nexus OS — ¡Tiempo!', { body: 'La cuenta regresiva ha llegado a cero.', icon: '/favicon.ico' })
        }
      }
    }, 1000)
  }
}

window.cdDismiss = function() {
  const alertEl = document.getElementById('cd-alert')
  if (alertEl) alertEl.style.display = 'none'
}

window.cdReset = function() {
  clearInterval(cdInterval)
  cdRunning = false; cdRemaining = 0
  const btn  = document.getElementById('cd-btn')
  const disp = document.getElementById('cd-display')
  const alrt = document.getElementById('cd-alert')
  if (btn)  btn.textContent = '▶ Iniciar'
  if (alrt) alrt.style.display = 'none'
  disp?.classList.remove('finished')
  const min = parseInt(document.getElementById('cd-min')?.value || '5') || 5
  const sec = parseInt(document.getElementById('cd-sec')?.value || '0') || 0
  if (disp) { disp.textContent = String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0'); disp.style.color = '#fff' }
  playBeep(440, 0.1, 0.2)
}

// ── CONVERSOR UNIFICADO FIAT + CRYPTO ────────────────────────────────────────
const FIAT_SYMBOLS_SET = new Set(['USD','MXN','EUR','CNY','GBP','JPY','CAD'])

window.swapUniConverter = function() {
  const from = document.getElementById('uni-from')
  const to   = document.getElementById('uni-to')
  if (!from || !to) return
  const tmp  = from.value
  from.value = to.value
  to.value   = tmp
  convertUnified()
}

window.convertUnified = async function convertUnified() {
  const amount  = parseFloat(document.getElementById('uni-amount')?.value) || 1
  const from    = document.getElementById('uni-from')?.value?.toUpperCase()
  const to      = document.getElementById('uni-to')?.value?.toUpperCase()
  const resEl   = document.getElementById('uni-result')
  const rateEl  = document.getElementById('uni-rate')
  if (!resEl || !from || !to) return
  resEl.textContent = '⏳'
  try {
    let rate
    const fromIsFiat   = FIAT_SYMBOLS_SET.has(from)
    const toIsFiat     = FIAT_SYMBOLS_SET.has(to)
    if (from === to) { rate = 1 }
    else if (fromIsFiat && toIsFiat) {
      rate = await fetchFiatRate(from, to)
    } else if (!fromIsFiat && !toIsFiat) {
      // crypto → crypto: from→USD → USD→to
      const fromUSD = await fetchCryptoRate(from, 'usd')
      const toUSD   = await fetchCryptoRate(to,   'usd')
      rate = fromUSD / toUSD
    } else if (!fromIsFiat && toIsFiat) {
      // crypto → fiat
      rate = await fetchCryptoRate(from, to.toLowerCase())
      if (!rate) {
        const toUSD = await fetchCryptoRate(from, 'usd')
        const fxRate = toIsFiat && to !== 'USD' ? await fetchFiatRate('USD', to) : 1
        rate = toUSD * fxRate
      }
    } else {
      // fiat → crypto: invert crypto→fiat rate
      const cryptoToFiat = await fetchCryptoRate(to, from.toLowerCase())
      if (cryptoToFiat) { rate = 1 / cryptoToFiat }
      else {
        const cryptoToUSD = await fetchCryptoRate(to, 'usd')
        const fiatToUSD   = from !== 'USD' ? await fetchFiatRate(from, 'USD') : 1
        rate = (fiatToUSD) / cryptoToUSD
      }
    }
    const result   = amount * rate
    const decimals = result < 0.01 ? 8 : result < 1 ? 6 : result < 1000 ? 4 : 2
    resEl.textContent = result.toFixed(decimals) + ' ' + to
    if (rateEl) rateEl.textContent = `1 ${from} = ${rate.toFixed(rate < 0.01 ? 8 : 4)} ${to}`
  } catch(e) {
    resEl.textContent = '⚠️ Error'
    if (rateEl) rateEl.textContent = 'No se pudo obtener cotización'
    console.warn('convertUnified error', e)
  }
}

// ── CALCULADORA INVERSA — recibí X crypto → neto en MXN y USD ──────────────
window.calculateInverse = async function calculateInverse() {
  const amount   = parseFloat(document.getElementById('inv-amount')?.value)
  const coin     = document.getElementById('inv-coin')?.value?.toUpperCase()
  const price    = parseFloat(document.getElementById('inv-price')?.value)  // precio en USD
  const feePct   = parseFloat(document.getElementById('inv-fee')?.value) || 0
  const resultEl = document.getElementById('inv-result')
  if (!resultEl) return
  if (isNaN(amount) || amount <= 0 || !coin) { resultEl.innerHTML = '<span style="color:#f87171;">Ingresa la cantidad y moneda</span>'; return }

  resultEl.innerHTML = '⏳ Calculando...'
  try {
    let priceUSD = price
    // Si no ingresó precio, consultamos la API
    if (!priceUSD || isNaN(priceUSD)) {
      if (coin === 'USD' || coin === 'USDT') priceUSD = 1
      else { priceUSD = await fetchCryptoRate(coin, 'usd') }
    }
    if (!priceUSD) throw new Error('No se pudo obtener el precio')

    // Tipo de cambio USD → MXN
    const usdMXN   = await fetchFiatRate('USD', 'MXN')
    const grossUSD = amount * priceUSD
    const feeUSD   = grossUSD * (feePct / 100)
    const netUSD   = grossUSD - feeUSD
    const netMXN   = netUSD * usdMXN

    resultEl.innerHTML = `
      <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:12px;padding:14px;text-align:left;">
        <div style="font-size:10px;font-weight:800;color:#a78bfa;letter-spacing:1px;margin-bottom:10px;">LIQUIDACIÓN</div>
        <div style="display:grid;gap:6px;font-size:12px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Recibido:</span><span style="font-weight:700;color:#fff;">${amount} ${coin} @ $${priceUSD.toFixed(coin==='BTC'?0:4)} USD</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Bruto USD:</span><span style="font-weight:700;color:#fff;">$${grossUSD.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Comisión (${feePct}%):</span><span style="font-weight:700;color:#f87171;">-$${feeUSD.toFixed(2)} USD</span></div>
          <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:8px;display:flex;justify-content:space-between;"><span style="color:#4ade80;font-weight:800;">Neto USD:</span><span style="font-size:16px;font-weight:800;color:#4ade80;font-family:'JetBrains Mono',monospace;">$${netUSD.toFixed(2)} USD</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:#00f6ff;font-weight:800;">Neto MXN:</span><span style="font-size:16px;font-weight:800;color:#00f6ff;font-family:'JetBrains Mono',monospace;">$${netMXN.toFixed(2)} MXN</span></div>
          <div style="font-size:9px;color:var(--text-dim);text-align:right;margin-top:4px;">TC: 1 USD = $${usdMXN.toFixed(2)} MXN</div>
        </div>
      </div>`
  } catch(e) {
    resultEl.innerHTML = `<span style="color:#f87171;">⚠️ Error: ${e.message}</span>`
    console.warn('calculateInverse error', e)
  }
}

// WMO weather code → descripción e ícono
function wmoWeather(code) {
  const map = {
    0:['Despejado','☀️'], 1:['Mayormente despejado','🌤'], 2:['Parcialmente nublado','⛅'],
    3:['Nublado','☁️'], 45:['Niebla','🌫'], 48:['Niebla con escarcha','🌫'],
    51:['Llovizna ligera','🌦'], 53:['Llovizna','🌦'], 55:['Llovizna intensa','🌧'],
    61:['Lluvia ligera','🌧'], 63:['Lluvia','🌧'], 65:['Lluvia intensa','⛈'],
    71:['Nieve ligera','🌨'], 73:['Nieve','❄️'], 75:['Nieve intensa','❄️'],
    80:['Chubascos ligeros','🌦'], 81:['Chubascos','🌧'], 82:['Chubascos intensos','⛈'],
    95:['Tormenta eléctrica','⛈'], 96:['Tormenta con granizo','⛈'], 99:['Tormenta severa','🌩'],
  }
  return map[code] || ['Desconocido','🌡️']
}

async function initTickers() {
  const settings = JSON.parse(localStorage.getItem('nexus_settings') || '{}')
  const unit = settings.tempUnit || 'C'

  // Usar coordenadas de la ciudad configurada (default La Paz, BCS)
  const lat  = parseFloat(settings.lat  || '24.14')
  const lon  = parseFloat(settings.lon  || '-110.31')
  const city = settings.city || 'LA PAZ, BCS'

  const cityEl = document.getElementById('w-city-label')
  if (cityEl) cityEl.textContent = city

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,apparent_temperature,relative_humidity_2m,windspeed_10m,weathercode`
    const res = await (await fetch(url)).json()
    const c = res?.current
    if (c) {
      const toUnit = t => unit === 'F' ? Math.round((t * 9/5) + 32) : Math.round(t)
      const [desc, icon] = wmoWeather(c.weathercode)
      const tempDisp   = `${toUnit(c.temperature_2m)}°${unit}`
      const feelsDisp  = `${toUnit(c.apparent_temperature)}°`
      const humDisp    = `${Math.round(c.relative_humidity_2m)}%`
      const windDisp   = `${Math.round(c.windspeed_10m)} km/h`

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
      set('w-weather',      tempDisp)
      set('w-weather-desc', desc)
      set('w-weather-icon', icon)
      set('w-feels',        feelsDisp)
      set('w-humidity',     humDisp)
      set('w-wind',         windDisp)
    } else {
      document.getElementById('w-weather').textContent = 'N/A'
    }
  } catch (e) {
    console.warn('Weather fetch failed', e)
    document.getElementById('w-weather').textContent = 'Offline'
  }

  if (settings.nickname) {
    const titleEl = document.querySelector('.view-title')
    if (titleEl) titleEl.textContent = `Comandos de ${settings.nickname}`
  }
}

// ── THEME TOGGLE ────────────────────────────────────────────────
// Declarada como function para que el hoisting la haga disponible antes del boot
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('nexus_theme', theme)
  const darkBtn  = document.getElementById('theme-dark-btn')
  const lightBtn = document.getElementById('theme-light-btn')
  const accentOn  = '2px solid var(--accent-cyan)'
  const accentOff = '2px solid transparent'
  if (darkBtn)  { darkBtn.style.border  = theme === 'dark'  ? accentOn : accentOff; darkBtn.style.color  = theme === 'dark'  ? '#fff' : 'var(--text-muted)' }
  if (lightBtn) { lightBtn.style.border = theme === 'light' ? accentOn : accentOff; lightBtn.style.color = theme === 'light' ? '#fff' : 'var(--text-muted)' }
}
window.setTheme = setTheme // exponer para onclick en HTML

function applyStoredTheme() {
  const theme = localStorage.getItem('nexus_theme') || 'dark'
  setTheme(theme)
}

// Settings Logic
document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  const settings = {
    nickname: document.getElementById('pref-nickname')?.value || '',
    email:    document.getElementById('pref-email')?.value || '',
    timezone: document.getElementById('pref-tz')?.value || 'America/Mexico_City',
    tempUnit: document.getElementById('pref-temp')?.value || 'C',
    city:     (document.getElementById('pref-city')?.value || 'LA PAZ, BCS').toUpperCase(),
    lat:      document.getElementById('pref-lat')?.value || '24.14',
    lon:      document.getElementById('pref-lon')?.value || '-110.31',
  }
  localStorage.setItem('nexus_settings', JSON.stringify(settings))
  showToast('✅ Preferencias guardadas')
  initTickers() // Re-fetch weather with new city
})

// Load settings on boot
function loadSystemSettings() {
  const settings = JSON.parse(localStorage.getItem('nexus_settings') || '{}')
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val }
  setVal('pref-nickname', settings.nickname)
  setVal('pref-email',    settings.email)
  setVal('pref-tz',       settings.timezone)
  setVal('pref-temp',     settings.tempUnit)
  setVal('pref-city',     settings.city)
  setVal('pref-lat',      settings.lat)
  setVal('pref-lon',      settings.lon)
  applyStoredTheme()
}
document.getElementById('btn-change-password')?.addEventListener('click', async () => {
  const newPwd = document.getElementById('pref-new-password')?.value.trim()
  if (!newPwd || newPwd.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.')
  if (localStorage.getItem('nexus_admin_bypass') === 'true') return alert('En modo demo no se puede cambiar la contraseña.')
  const { error } = await supabase.auth.updateUser({ password: newPwd })
  if (error) alert('Error: ' + error.message)
  else { alert('Contraseña actualizada correctamente.'); document.getElementById('pref-new-password').value = '' }
})

document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
  if (!confirm('¿Estás seguro? Esta acción eliminará tu cuenta y todos tus datos permanentemente.')) return
  if (!confirm('Segunda confirmación: ¿Eliminar cuenta definitivamente?')) return
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    localStorage.removeItem('nexus_admin_bypass')
    window.location.href = '/'
    return
  }
  await supabase.from('nodes').delete().eq('owner_id', currentUser.id)
  await supabase.auth.signOut()
  window.location.href = '/'
})

// CSV Import logic
document.getElementById('btn-import-csv')?.addEventListener('click', async () => {
  const raw = document.getElementById('csv-import-area').value.trim()
  if (!raw) return
  
  const lines = raw.split('\n')
  let count = 0
  for (const line of lines) {
     const [content, type, metadataStr] = line.split(',')
     if (content && type) {
       try {
         const metadata = JSON.parse(metadataStr || '{}')
         await insertNodeRaw(content, { ...metadata, type_override: type })
         count++
       } catch(e) { console.error("Error en linea CSV:", line) }
     }
  }
  alert(`Importación completada: ${count} nodos inyectados.`)
  document.getElementById('csv-import-area').value = ''
})

// Legacy Escape handler — mantenido para compatibilidad con modales más antiguos
// El handler principal (keydown unificado al final del archivo) cubre los modales activos
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  const isVisible = (el) => {
    if (!el) return false
    const s = window.getComputedStyle(el)
    return s.display !== 'none' && s.visibility !== 'hidden'
  }
  const modalIds = [
    'contact-modal','proj-task-modal','proveedor-picker-modal',
    'milestone-modal','agenda-modal',
    'member-modal','health-modal','node-detail-modal',
    'transform-modal','search-overlay','tag-modal',
  ]
  const closeFns = {
    'contact-modal': 'closeContactModal',
    'proj-task-modal': 'closeProjTaskModal',
    'proveedor-picker-modal': 'closeProveedorPicker',
    'milestone-modal': 'closeMilestoneModal',
    'search-overlay': 'closeSearch',
    'agenda-modal': 'closeAgendaModal',
  }
  for (const id of modalIds) {
    const el = document.getElementById(id)
    if (!isVisible(el)) continue
    const fn = closeFns[id]
    if (fn && window[fn]) { window[fn](); return }
    else { el.classList.add('hidden'); return }
  }
  // Cierra cualquier modal-overlay visible
  document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(el => {
    el.classList.add('hidden')
  })
})



// ─────────────────────────────────────────
// Crónica del Día
// ─────────────────────────────────────────
function renderCronica(nodes) {
  const dateInput = document.getElementById('cronica-date')
  if (dateInput) {
    if (!dateInput.value) dateInput.value = new Date().toISOString().split('T')[0]
    renderCronicaView()
  }
}

// Exposed to window so HTML onclick puede llamarla
window.renderCronicaView = function renderCronicaView() {
  const date = document.getElementById('cronica-date')?.value || new Date().toISOString().split('T')[0]
  const allN = allNodes

  // Helper: nodo ocurrió en esta fecha
  const onDate = (n) => {
    const created = n.created_at?.split('T')[0] === date
    const metaDate = n.metadata?.date === date || n.metadata?.fecha === date || n.metadata?.due_date === date
    return created || metaDate
  }

  const tasksToday    = allN.filter(n => n.type === 'kanban'   && onDate(n))
  const notesToday    = allN.filter(n => n.type === 'note'     && onDate(n))
  const finToday      = allN.filter(n => (n.type === 'income' || n.type === 'expense') && onDate(n))
  const eventsToday   = allN.filter(n => n.type === 'event'    && onDate(n))
  const contactsToday = allN.filter(n => n.type === 'contact'  && onDate(n))
  const totalItems    = tasksToday.length + notesToday.length + finToday.length + eventsToday.length + contactsToday.length

  const netDay = finToday.reduce((s,n) => s + (n.type==='income' ? 1 : -1) * (n.metadata?.amount||0), 0)
  const incDay = finToday.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const expDay = finToday.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)

  const root  = document.getElementById('cronica-root')
  const stats = document.getElementById('cronica-stats')
  if (!root) return

  const dateFmt = new Date(date + 'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  if (stats) stats.innerHTML = `
    <span style="color:var(--accent-cyan);font-weight:800;">${dateFmt}</span>
    &nbsp;·&nbsp; ${totalItems} registros
    &nbsp;·&nbsp; <span style="color:#4ade80;">+$${incDay.toLocaleString()}</span>
    &nbsp;·&nbsp; <span style="color:#f87171;">-$${expDay.toLocaleString()}</span>
    &nbsp;·&nbsp; <span style="color:${netDay>=0?'#00f6ff':'#fb923c'};">neto ${netDay>=0?'+':''}\$${netDay.toLocaleString()}</span>
  `

  if (totalItems === 0) {
    root.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
      <div style="font-size:48px;margin-bottom:16px;">📭</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Sin actividad registrada</div>
      <div style="font-size:13px;">No hay nodos creados ni fechados para el <b>${date}</b></div>
    </div>`
    return
  }

  const col = (icon, title, color, bg, items, renderFn) => items.length === 0 ? '' : `
    <div style="background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:16px; padding:20px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <span style="font-size:16px;">${icon}</span>
        <span style="font-size:10px; font-weight:800; color:${color}; letter-spacing:1.5px; text-transform:uppercase;">${title}</span>
        <span style="margin-left:auto;background:${bg};color:${color};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800;">${items.length}</span>
      </div>
      ${items.map(renderFn).join('')}
    </div>`

  // Mini bar chart inline para finanzas del día
  const finChart = finToday.length === 0 ? '' : `
    <div style="background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:16px; padding:20px;">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1.5px;margin-bottom:14px;">💹 RESUMEN FINANCIERO DEL DÍA</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:9px;color:#6ee7b7;font-weight:800;margin-bottom:4px;">ENTRADAS</div>
          <div style="font-size:16px;font-weight:800;color:#4ade80;font-family:'JetBrains Mono',monospace;">+$${incDay.toLocaleString()}</div>
        </div>
        <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:9px;color:#fca5a5;font-weight:800;margin-bottom:4px;">SALIDAS</div>
          <div style="font-size:16px;font-weight:800;color:#f87171;font-family:'JetBrains Mono',monospace;">-$${expDay.toLocaleString()}</div>
        </div>
        <div style="background:${netDay>=0?'rgba(0,246,255,0.06)':'rgba(251,146,60,0.06)'};border:1px solid ${netDay>=0?'rgba(0,246,255,0.2)':'rgba(251,146,60,0.2)'};border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:9px;color:${netDay>=0?'#67e8f9':'#fdba74'};font-weight:800;margin-bottom:4px;">NETO</div>
          <div style="font-size:16px;font-weight:800;color:${netDay>=0?'#00f6ff':'#fb923c'};font-family:'JetBrains Mono',monospace;">${netDay>=0?'+':''}\$${netDay.toLocaleString()}</div>
        </div>
      </div>
      ${finToday.map(n => `
        <div onclick="openFinanceDetail('${n.id}')" style="display:flex;align-items:center;gap:12px;padding:8px;border-radius:8px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
          <span style="font-size:18px;">${n.type==='income'?'↑':'↓'}</span>
          <span style="flex:1;font-size:13px;color:#fff;">${esc(n.metadata?.label||n.content)}</span>
          <span style="font-size:14px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${n.type==='income'?'#4ade80':'#f87171'};">${n.type==='income'?'+':'-'}$${(n.metadata?.amount||0).toLocaleString()}</span>
        </div>`).join('')}
    </div>`

  const taskKanbanCols = { todo:'⬜ Pendiente', in_progress:'🔄 En Progreso', done:'✅ Completado' }

  root.innerHTML =
    finChart +
    col('📌','Tareas','#a78bfa','rgba(167,139,250,0.12)', tasksToday, n => `
      <div onclick="openCardModal('${n.id}')" style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.15);border-radius:10px;margin-bottom:8px;cursor:pointer;">
        <span style="font-size:11px;background:rgba(167,139,250,0.2);color:#c4b5fd;padding:2px 8px;border-radius:20px;white-space:nowrap;">${taskKanbanCols[n.metadata?.status]||'⬜ Pendiente'}</span>
        <span style="font-size:13px;color:#fff;flex:1;">${esc(n.metadata?.label||n.content)}</span>
      </div>`) +
    col('📅','Eventos','#fb923c','rgba(251,146,60,0.12)', eventsToday, n => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.15);border-radius:10px;margin-bottom:8px;">
        <span style="font-size:11px;color:#fdba74;">${n.metadata?.time||''}</span>
        <span style="font-size:13px;color:#fff;flex:1;">${esc(n.metadata?.label||n.content)}</span>
        ${n.metadata?.place?`<span style="font-size:10px;color:var(--text-muted);">📍 ${esc(n.metadata.place)}</span>`:''}
      </div>`) +
    col('🧠','Notas','#60a5fa','rgba(96,165,250,0.12)', notesToday, n => `
      <div onclick="openNoteEdit('${n.id}')" style="padding:10px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;margin-bottom:8px;cursor:pointer;">
        <div style="font-size:13px;color:#fff;margin-bottom:4px;">${esc(n.metadata?.label||n.content.slice(0,80))}</div>
        ${(n.metadata?.tags||[]).map(t=>`<span style="font-size:9px;background:rgba(96,165,250,0.15);color:#93c5fd;padding:1px 6px;border-radius:4px;margin-right:3px;">${t}</span>`).join('')}
      </div>`) +
    col('👥','Contactos','#34d399','rgba(52,211,153,0.12)', contactsToday, n => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:10px;margin-bottom:8px;">
        <span style="font-size:18px;">👤</span>
        <span style="font-size:13px;color:#fff;">${esc(n.metadata?.name||n.content)}</span>
        ${n.metadata?.company?`<span style="font-size:10px;color:var(--text-muted);">${esc(n.metadata.company)}</span>`:''}
      </div>`)
}

// ─────────────────────────────────────────
// Finance Transaction Detail Modal
// ─────────────────────────────────────────
window.openFinanceDetail = (id) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  editingFinanceId = id
  const m = node.metadata || {}
  document.getElementById('fd-title').textContent = node.type === 'income' ? '💰 Ingreso' : '💸 Gasto'
  document.getElementById('fd-label').value = m.label || node.content
  document.getElementById('fd-amount').value = m.amount || 0
  // Fecha
  const fechaEl = document.getElementById('fd-fecha')
  if (fechaEl) fechaEl.value = m.fecha || node.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
  // Moneda
  const monedaEl = document.getElementById('fd-moneda')
  if (monedaEl) monedaEl.value = m.moneda || 'MXN'
  // Tipo de cambio e IVA
  const tcEl = document.getElementById('fd-tc')
  if (tcEl) tcEl.value = m.tc || ''
  const ivaEl = document.getElementById('fd-iva')
  if (ivaEl) ivaEl.value = m.iva || ''
  // RFC / Referencia
  const refEl = document.getElementById('fd-referencia')
  if (refEl) refEl.value = m.referencia || ''
  // Ordenante
  const ordEl = document.getElementById('fd-ordenante')
  if (ordEl) ordEl.value = m.ordenante || ''
  // Cuenta origen/destino
  const accounts = allNodes.filter(n => n.type === 'account')
  const acSel = document.getElementById('fd-account')
  acSel.innerHTML = '<option value="">General</option>' + accounts.map(a => `<option value="${a.id}" ${m.account_id===a.id?'selected':''}>${esc(a.metadata?.label||a.content)}</option>`).join('')
  // Contacto (beneficiario / ordenante)
  const contacts = getContacts()
  const cSel = document.getElementById('fd-contact')
  if (cSel) {
    cSel.innerHTML = '<option value="">— Sin contacto —</option>' + contacts.map(c => {
      const name = c.metadata?.name || c.content
      const icon = c.metadata?.cType==='bank'?'🏦':c.metadata?.cType==='crypto'?'₿':'👤'
      return `<option value="${c.id}" ${m.contact_id===c.id?'selected':''}>${icon} ${esc(name)}</option>`
    }).join('')
    // Auto-fill CLABE when contact changes
    cSel.onchange = () => {
      const selContact = contacts.find(c => c.id === cSel.value)
      const clabeEl = document.getElementById('fd-clabe')
      const bancoEl = document.getElementById('fd-banco')
      if (selContact?.metadata?.cType === 'bank') {
        if (clabeEl) clabeEl.value = selContact.metadata?.clabe || ''
        if (bancoEl) bancoEl.value = selContact.metadata?.bank_name || ''
      }
    }
  }
  // CLABE y Banco
  const clabeEl = document.getElementById('fd-clabe')
  if (clabeEl) clabeEl.value = m.clabe || ''
  const bancoEl = document.getElementById('fd-banco')
  if (bancoEl) bancoEl.value = m.banco || ''
  renderFinanceComments(m.comments || [])
  renderAttachments(m.images || [], 'finance')
  document.getElementById('finance-detail-modal').classList.remove('hidden')
}

window.closeFinanceDetail = () => {
  document.getElementById('finance-detail-modal').classList.add('hidden')
  editingFinanceId = null
}

function renderFinanceComments(comments) {
  const root = document.getElementById('fd-comments')
  if (!root) return
  root.innerHTML = comments.map(c => `<div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:13px; color:#ccc;">${esc(c.text)} <span style="font-size:10px; color:var(--text-dim);">${c.time||''}</span></div>`).join('')
}

window.addFinanceComment = async () => {
  const input = document.getElementById('fd-comment-input')
  const text = input?.value.trim()
  if (!text || !editingFinanceId) return
  const node = allNodes.find(n => n.id === editingFinanceId)
  if (!node) return
  if (!node.metadata.comments) node.metadata.comments = []
  node.metadata.comments.push({ text, time: new Date().toLocaleTimeString() })
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', editingFinanceId)
  }
  renderFinanceComments(node.metadata.comments)
  input.value = ''
}

window.saveFinanceDetail = async () => {
  const node = allNodes.find(n => n.id === editingFinanceId)
  if (!node) return
  node.metadata.label     = document.getElementById('fd-label').value.trim()
  node.metadata.amount    = parseFloat(document.getElementById('fd-amount').value) || 0
  node.metadata.fecha     = document.getElementById('fd-fecha')?.value || undefined
  node.metadata.moneda    = document.getElementById('fd-moneda')?.value || 'MXN'
  node.metadata.tc        = parseFloat(document.getElementById('fd-tc')?.value) || undefined
  node.metadata.iva       = parseFloat(document.getElementById('fd-iva')?.value) || undefined
  node.metadata.referencia = document.getElementById('fd-referencia')?.value.trim() || undefined
  node.metadata.ordenante  = document.getElementById('fd-ordenante')?.value.trim() || undefined
  node.metadata.clabe      = document.getElementById('fd-clabe')?.value.trim() || undefined
  node.metadata.banco      = document.getElementById('fd-banco')?.value.trim() || undefined
  const acId = document.getElementById('fd-account').value
  node.metadata.account_id = acId || undefined
  const ctId = document.getElementById('fd-contact')?.value
  node.metadata.contact_id = ctId || undefined
  // Store contact name for display
  if (ctId) {
    const ct = getContacts().find(c => c.id === ctId)
    node.metadata.contact_name = ct ? (ct.metadata?.name || ct.content) : undefined
  } else {
    node.metadata.contact_name = undefined
  }
  node.content = node.metadata.label
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ content: node.content, metadata: node.metadata }).eq('id', editingFinanceId)
  }
  closeFinanceDetail(); renderAll()
  showToast('Movimiento guardado')
}

window.deleteFinanceNode = async () => {
  if (!editingFinanceId || !confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return
  allNodes = allNodes.filter(n => n.id !== editingFinanceId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').delete().eq('id', editingFinanceId)
  }
  closeFinanceDetail()
  renderAll()
  showToast('Movimiento eliminado')
}

// ─────────────────────────────────────────
// Image Attachments
// ─────────────────────────────────────────
function compressImage(file, cb) {
  const reader = new FileReader()
  reader.onload = e => {
    const img = new Image()
    img.onload = () => {
      const MAX = 800
      let w = img.width, h = img.height
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      cb(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

window.attachImageFromFile = (input, context) => {
  const file = input.files[0]
  if (!file) return
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    // PDFs: store as base64 data URL directly (no compression)
    if (file.size > 3 * 1024 * 1024) { showToast('PDF muy grande — máximo 3 MB'); input.value = ''; return }
    const reader = new FileReader()
    reader.onload = e => addAttachment(e.target.result, context)
    reader.readAsDataURL(file)
  } else {
    compressImage(file, base64 => addAttachment(base64, context))
  }
  input.value = ''
}

async function addAttachment(base64, context) {
  const id = context === 'card' ? editingCardId : context === 'note' ? editingNoteId : editingFinanceId
  if (!id) return
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  if (!node.metadata.images) node.metadata.images = []
  if (node.metadata.images.length >= 3) { showToast('Máximo 3 imágenes por nodo'); return }
  node.metadata.images.push(base64)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', id)
  }
  renderAttachments(node.metadata.images || [], context)
}

function renderAttachments(images, context) {
  const containerId = context === 'card' ? 'tm-attachments' : context === 'note' ? 'ne-attachments' : 'fd-attachments'
  const container = document.getElementById(containerId)
  if (!container) return
  container.innerHTML = (images || []).map((src, i) => {
    const isPdf   = src.startsWith('data:application/pdf') || src.includes(';base64,JVBER')
    const isAudio = src.startsWith('data:audio/')
    let thumb
    if (isPdf) {
      thumb = `<div onclick="viewAttachment('PDF_${i}','${context}')" style="width:80px;height:80px;border-radius:10px;border:1px solid var(--glass-border);background:rgba(248,113,113,0.1);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-direction:column;font-size:10px;color:#f87171;gap:4px;">
        <span style="font-size:28px;">📄</span><span>PDF</span></div>`
    } else if (isAudio) {
      thumb = `<div style="width:140px;border-radius:10px;border:1px solid var(--glass-border);background:rgba(0,246,255,0.05);padding:8px;display:flex;flex-direction:column;gap:4px;">
        <audio controls src="${src}" style="width:100%;height:28px;"></audio>
        <span style="font-size:10px;color:var(--text-muted);text-align:center;">🎙 audio</span></div>`
    } else {
      thumb = `<img src="${src}" onclick="viewImage('${src}')" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid var(--glass-border);cursor:pointer;" />`
    }
    return `
      <div style="position:relative; display:inline-block;">
        ${thumb}
        <span onclick="removeAttachment(${i}, '${context}')" style="position:absolute;top:-6px;right:-6px;background:#f87171;border-radius:50%;width:18px;height:18px;display:grid;place-items:center;font-size:10px;cursor:pointer;color:#000;font-weight:800;">✕</span>
      </div>`
  }).join('')
}

window.viewAttachment = (encodedKey, context) => {
  const idx = parseInt(encodedKey.split('_PDF_')[1] ?? encodedKey.split('_')[1])
  const id = context === 'card' ? editingCardId : context === 'note' ? editingNoteId : editingFinanceId
  const node = allNodes.find(n => n.id === id)
  if (!node?.metadata?.images?.[idx]) return
  const win = window.open()
  win.document.write(`<iframe src="${node.metadata.images[idx]}" style="width:100%;height:100%;border:none;"></iframe>`)
}

window.viewImage = (src) => {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:9999; display:flex; align-items:center; justify-content:center; cursor:zoom-out;'
  overlay.innerHTML = `<img src="${src}" style="max-width:90vw; max-height:90vh; border-radius:12px; box-shadow:0 0 60px rgba(0,0,0,0.8);" />`
  overlay.onclick = () => overlay.remove()
  document.body.appendChild(overlay)
}

window.removeAttachment = async (idx, context) => {
  const id = context === 'card' ? editingCardId : context === 'note' ? editingNoteId : editingFinanceId
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  node.metadata.images.splice(idx, 1)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', id)
  }
  renderAttachments(node.metadata.images || [], context)
}

document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue
      const cardOpen = !document.getElementById('card-modal')?.classList.contains('hidden')
      const noteOpen = !document.getElementById('note-edit-modal')?.classList.contains('hidden')
      const finOpen  = !document.getElementById('finance-detail-modal')?.classList.contains('hidden')
      const cotOpen  = !document.getElementById('cotizacion-modal')?.classList.contains('hidden')
      if (cotOpen) {
        if (_cotImagesDraft.filter(s=>typeof s==='string').length >= 5) { showToast('Máximo 5 imágenes por cotización'); break }
        compressImage(file, b64 => { _cotImagesDraft.push(b64); renderCotEvidencias(); showToast('📎 Imagen agregada a evidencias') })
      } else if (cardOpen) compressImage(file, b => addAttachment(b, 'card'))
      else if (noteOpen)   compressImage(file, b => addAttachment(b, 'note'))
      else if (finOpen)    compressImage(file, b => addAttachment(b, 'finance'))
      break
    }
  }
})

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─────────────────────────────────────────
// Contacts / CRM Module
// ─────────────────────────────────────────

function getContacts() {
  // Include legacy 'persona' type nodes for backward compatibility
  return allNodes.filter(n => n.type === 'contact' || n.type === 'persona')
}

function contactInitials(name) {
  return (name || '?').split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('') || '?'
}

function contactTypeIcon(cType) {
  return cType === 'bank' ? '🏦' : cType === 'crypto' ? '₿' : cType === 'proveedor' ? '🔧' : '👤'
}

const PROV_STATUS_LABEL = { activo:'✅ Activo', recomendado:'⭐ Recomendado', pausado:'⏸ Pausado', no_recomendado:'❌ No recomendado' }

window.setContactFilter = (type, btn) => {
  activeContactFilter = type
  document.querySelectorAll('.contact-filter-btn[data-ctype]').forEach(b => b.classList.remove('active'))
  btn?.classList.add('active')
  renderContacts()
}

// ── Contact Sheet compatibility stubs (kept for backward compat with openPaymentModal etc) ──
window.openContactSheet = (id) => window.openContactModal(id)
window.closeContactSheet = (e) => {
  if (e && e.target !== document.getElementById('contact-sheet')) return
  // contact-sheet no longer exists, do nothing
}

window.switchCSheetTab = (tab, btn) => {
  currentCSheetTab = tab
  document.querySelectorAll('.csheet-tab').forEach(t => t.classList.remove('active'))
  btn?.classList.add('active')
  const c = allNodes.find(n => n.id === currentContactId)
  if (c) renderCSheetTab(tab, c)
}

function renderCSheetTab(tab, c) {
  const body = document.getElementById('csh-body')
  if (!body) return
  const m = c.metadata || {}
  const name = m.name || c.content
  const cType = m.cType || 'persona'

  if (tab === 'perfil') {
    const fields = cType === 'persona' ? `
      <div class="csh-field"><span class="csh-label">📞 Teléfono</span><span>${esc(m.phone||'—')}</span></div>
      <div class="csh-field"><span class="csh-label">✉️ Email</span><span>${esc(m.email||'—')}</span></div>
      <div class="csh-field"><span class="csh-label">🏢 Empresa</span><span>${esc(m.company||'—')}</span></div>
      ${m.rfc ? `<div class="csh-field"><span class="csh-label">🪪 RFC</span><code style="font-family:monospace;font-size:13px;letter-spacing:0.05em;">${esc(m.rfc)}</code></div>` : ''}
    ` : cType === 'proveedor' ? (() => {
      const totalPaid = allNodes.filter(n=>n.type==='expense'&&n.metadata?.contact_id===c.id).reduce((s,n)=>s+(n.metadata?.amount||0),0)
      const lastNode  = allNodes.filter(n=>n.metadata?.contact_id===c.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]
      const lastDate  = lastNode ? new Date(lastNode.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}) : '—'
      return `
      <div class="csh-field"><span class="csh-label">🔧 Especialidad</span><span style="color:#f97316;">${esc(m.specialty||'—')}</span></div>
      <div class="csh-field"><span class="csh-label">📍 Zona</span><span>${esc(m.zone||'—')}</span></div>
      <div class="csh-field"><span class="csh-label">💲 Tarifa</span><span>${esc(m.price||'—')}</span></div>
      <div class="csh-field"><span class="csh-label">📞 Teléfono</span><span>${esc(m.phone||'—')}</span></div>
      <div class="csh-field"><span class="csh-label">⭐ Rating</span><span>${'⭐'.repeat(m.rating||3)} <span style="color:var(--text-dim);font-size:11px;">(${m.rating||3}/5)</span></span></div>
      <div class="csh-field"><span class="csh-label">🚦 Estado</span><span>${PROV_STATUS_LABEL[m.prov_status||'activo']||'—'}</span></div>
      ${m.rfc ? `<div class="csh-field"><span class="csh-label">🪪 RFC</span><div style="display:flex;align-items:center;gap:8px;"><code style="font-family:monospace;font-size:13px;letter-spacing:0.05em;">${esc(m.rfc)}</code><button onclick="navigator.clipboard.writeText('${esc(m.rfc)}').then(()=>showToast('RFC copiado'))" style="background:rgba(0,246,255,0.1);border:1px solid rgba(0,246,255,0.3);color:#00f6ff;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">📋</button></div></div>` : ''}
      ${m.address ? `<div class="csh-field"><span class="csh-label">🏠 Dirección</span><span>${esc(m.address)}</span></div>` : ''}
      ${m.pay_day ? `<div class="csh-field"><span class="csh-label">📅 Día de pago</span><span>Día <strong style="color:var(--accent-cyan);">${m.pay_day}</strong> de cada mes</span></div>` : ''}
      ${m.clabe ? `<div class="csh-field" style="flex-direction:column;align-items:flex-start;gap:6px;"><span class="csh-label">🏦 Cuenta (${esc(m.bank_name||'banco')})</span><div style="display:flex;align-items:center;gap:8px;"><code style="font-family:monospace;font-size:13px;letter-spacing:0.05em;">${esc(m.clabe)}</code><button onclick="navigator.clipboard.writeText('${esc(m.clabe)}').then(()=>showToast('CLABE copiada'))" style="background:rgba(0,246,255,0.1);border:1px solid rgba(0,246,255,0.3);color:#00f6ff;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">📋 Copiar</button></div></div>` : (m.bank_name ? `<div class="csh-field"><span class="csh-label">🏦 Banco</span><span>${esc(m.bank_name)}</span></div>` : '')}
      ${m.accepts_crypto ? `<div class="csh-field"><span class="csh-label">🪙 Cripto</span><span style="color:#a78bfa;">✓ Acepta ${esc(m.crypto_nets||'cripto')}</span></div>` : ''}
      <div class="csh-field"><span class="csh-label">💸 Total pagado</span><span style="color:#f87171;font-weight:700;">${totalPaid > 0 ? '-$'+totalPaid.toLocaleString('es-MX') : '—'}</span></div>
      <div class="csh-field"><span class="csh-label">🕐 Última interacción</span><span>${lastDate}</span></div>
      ${renderProvServices(c)}
      ${renderContactAccounts(c)}
    `})() : cType === 'bank' ? `
      <div class="csh-field"><span class="csh-label">🏦 Banco</span><span>${esc(m.bank_name||'—')}</span></div>
      <div class="csh-field" style="flex-direction:column;align-items:flex-start;gap:4px;">
        <span class="csh-label">🔢 CLABE</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <code style="font-family:monospace;font-size:13px;letter-spacing:0.05em;">${esc(m.clabe||'—')}</code>
          ${m.clabe ? `<button onclick="navigator.clipboard.writeText('${esc(m.clabe)}').then(()=>showToast('CLABE copiada'))" style="background:rgba(0,246,255,0.1);border:1px solid rgba(0,246,255,0.3);color:#00f6ff;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">📋 Copiar</button>` : ''}
        </div>
      </div>
      ${m.account_no ? `<div class="csh-field"><span class="csh-label">💳 Cuenta</span><code style="font-family:monospace;font-size:13px;">${esc(m.account_no)}</code></div>` : ''}
      <div class="csh-field"><span class="csh-label">👤 Titular</span><span>${esc(m.holder||'—')}</span></div>
      ${m.rfc ? `<div class="csh-field"><span class="csh-label">🪪 RFC</span><code style="font-family:monospace;font-size:13px;">${esc(m.rfc)}</code></div>` : ''}
    ` : `
      <div class="csh-field"><span class="csh-label">🌐 Red</span><span>${esc(m.network||'—')}</span></div>
      <div class="csh-field" style="flex-direction:column;align-items:flex-start;gap:4px;">
        <span class="csh-label">💳 Wallet</span>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <code style="font-family:monospace;font-size:11px;word-break:break-all;color:#a78bfa;">${esc(m.wallet||'—')}</code>
          ${m.wallet ? `<button onclick="navigator.clipboard.writeText('${esc(m.wallet)}').then(()=>showToast('Wallet copiada'))" style="background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">📋 Copiar</button>` : ''}
        </div>
      </div>
      ${m.memo ? `<div class="csh-field"><span class="csh-label">🏷 Memo</span><span>${esc(m.memo)}</span></div>` : ''}
    `
    const payBtn = (cType === 'proveedor')
      ? `<button onclick="openPaymentModal('${c.id}')" style="width:100%;margin-top:14px;padding:10px;background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.35);color:#fb923c;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.03em;">💸 Registrar Pago</button>`
      : ''
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:0;">${fields}
      <div class="csh-field" style="align-items:flex-start;"><span class="csh-label">📝 Notas</span><span style="white-space:pre-wrap;">${esc(m.notes||'—')}</span></div>
    </div>${payBtn}
    <style>
      .csh-field { display:flex; gap:16px; padding:14px 0; border-bottom:1px solid rgba(255,255,255,0.05); align-items:center; }
      .csh-label { font-size:11px; font-weight:700; color:var(--text-muted); min-width:90px; text-transform:uppercase; letter-spacing:0.04em; }
    </style>`
  }

  else if (tab === 'historial') {
    const related = allNodes.filter(n =>
      n.id !== c.id && (
        n.metadata?.contact_id === c.id ||
        (n.content || '').toLowerCase().includes('#' + name.toLowerCase().replace(/\s+/g,''))
      )
    ).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))

    if (related.length === 0) {
      body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px 0;font-size:14px;">Sin actividad registrada aún.<br>Los nodos que mencionen a <b>${esc(name)}</b> aparecerán aquí.</div>`
      return
    }
    const TYPE_ICONS = { income:'↑', expense:'↓', kanban:'📌', note:'💡', persona:'👤', proyecto:'📁' }
    const TYPE_COLORS = { income:'#4ade80', expense:'#f87171', kanban:'#60a5fa', note:'#a855f7', persona:'#fbbf24', proyecto:'#fb923c' }
    body.innerHTML = related.map(n => {
      const icon  = TYPE_ICONS[n.type] || '·'
      const color = TYPE_COLORS[n.type] || '#94a3b8'
      const label = n.metadata?.label || n.content
      const date  = new Date(n.created_at).toLocaleDateString('es-MX', {day:'numeric',month:'short',year:'numeric'})
      const amount = (n.type==='income'||n.type==='expense') ? ` <b style="color:${color}">${n.type==='income'?'+':'-'}$${(n.metadata?.amount||0).toLocaleString()}</b>` : ''
      return `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;" onclick="handleContactHistoryClick('${n.id}','${n.type}')">
        <div style="width:32px;height:32px;border-radius:8px;background:${color}18;color:${color};display:grid;place-items:center;font-size:14px;flex-shrink:0;">${icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}${amount}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${date}</div>
        </div>
      </div>`
    }).join('')
  }

  else if (tab === 'finanzas') {
    const txs = allNodes.filter(n =>
      (n.type==='income'||n.type==='expense') && n.metadata?.contact_id === c.id
    )
    const totalIn  = txs.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
    const totalOut = txs.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
    const net = totalIn - totalOut

    body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">
      <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:10px;color:#6ee7b7;font-weight:700;margin-bottom:6px;">RECIBIDO</div>
        <div style="font-size:20px;font-weight:800;color:#4ade80;">+$${totalIn.toLocaleString()}</div>
      </div>
      <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:10px;color:#fca5a5;font-weight:700;margin-bottom:6px;">PAGADO</div>
        <div style="font-size:20px;font-weight:800;color:#f87171;">-$${totalOut.toLocaleString()}</div>
      </div>
      <div style="background:rgba(0,246,255,0.06);border:1px solid rgba(0,246,255,0.15);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:10px;color:var(--accent-cyan);font-weight:700;margin-bottom:6px;">BALANCE</div>
        <div style="font-size:20px;font-weight:800;color:${net>=0?'#4ade80':'#f87171'};">${net>=0?'+':''}\$${net.toLocaleString()}</div>
      </div>
    </div>
    ${txs.length === 0
      ? `<div style="text-align:center;color:var(--text-muted);padding:20px;">Sin transacciones vinculadas.<br>Usa <code>#${name.replace(/\s+/g,'').toLowerCase()}</code> al registrar un pago.</div>`
      : txs.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(n=>{
          const isIn = n.type==='income'
          return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="width:32px;height:32px;border-radius:8px;background:${isIn?'rgba(74,222,128,0.1)':'rgba(248,113,113,0.1)'};color:${isIn?'#4ade80':'#f87171'};display:grid;place-items:center;">${isIn?'↑':'↓'}</div>
            <div style="flex:1;"><div style="font-size:13px;color:#fff;">${esc(n.metadata?.label||n.content)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${new Date(n.created_at).toLocaleDateString('es-MX')}</div></div>
            <div style="font-size:15px;font-weight:800;color:${isIn?'#4ade80':'#f87171'};">${isIn?'+':'-'}$${(n.metadata?.amount||0).toLocaleString()}</div>
          </div>`
        }).join('')
    }`
  }
}

window.handleContactHistoryClick = (id, type) => {
  if (type === 'kanban') { openCardModal(id); return }
  if (type === 'note' || type === 'persona' || type === 'proyecto') { openNoteEdit(id); return }
  if (type === 'income' || type === 'expense') { openFinanceDetail(id); return }
}

// ════════════════════════════════════════════════════════════════════════════
// CONTACTOS — Perfil Unificado
// ════════════════════════════════════════════════════════════════════════════
let _cmRating = 0
let _cmSpecialties = []
let _cmAccounts = []  // [{id, label, type, bank, clabe, wallet, network, specialty, notes}]
let _currentContactId = null

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16)
  })
}

window.openContactModal = (id = null) => {
  _currentContactId = id
  _cmRating = 0
  _cmSpecialties = []
  _cmAccounts = []

  const c = id ? allNodes.find(n => n.id === id) : null
  const m = c?.metadata || {}

  document.getElementById('contact-modal-title').textContent = c ? 'Editar Contacto' : 'Nuevo Contacto'
  document.getElementById('cm-name').value  = m.name || c?.content || ''
  document.getElementById('cm-phone').value = m.phone || ''
  document.getElementById('cm-email').value = m.email || ''
  document.getElementById('cm-city').value  = m.city || m.zone || ''
  document.getElementById('cm-rfc').value   = (m.rfc || '').toUpperCase()
  document.getElementById('cm-notes').value = m.notes || ''
  document.getElementById('cm-color').value = m.color || '#00f0ff'

  // Roles
  const roles = m.roles || (m.cType ? [m.cType] : ['persona'])
  ;['persona','proveedor','cliente','colaborador'].forEach(r => {
    const el = document.getElementById(`cm-role-${r}`)
    if (el) el.checked = roles.includes(r)
    updateRoleLabel(r)
  })

  // Rating
  _cmRating = m.rating || 0
  setCmRating(_cmRating)

  // Specialties
  const rawSpecs = m.specialties || (m.specialty ? [m.specialty] : [])
  _cmSpecialties = [...rawSpecs]
  renderCmSpecialties()
  renderSpecCatalog()

  // Accounts — support old format migration
  if (m.contact_accounts?.length) {
    _cmAccounts = m.contact_accounts.map(a => ({...a, id: a.id || uid()}))
  } else if (m.cType === 'bank') {
    _cmAccounts = [{id: uid(), label: m.bank_name||'Cuenta bancaria', type:'bank', bank:m.bank_name||'', clabe:m.clabe||'', wallet:'', network:'', specialty:'', notes:''}]
  } else if (m.cType === 'crypto') {
    _cmAccounts = [{id: uid(), label: m.network||'Cripto', type:'crypto', bank:'', clabe:'', wallet:m.wallet||'', network:m.network||'', specialty:'', notes:''}]
  } else if (m.clabe || m.bank_name) {
    _cmAccounts = [{id: uid(), label: m.bank_name||'Cuenta', type:'bank', bank:m.bank_name||'', clabe:m.clabe||'', wallet:'', network:'', specialty:'', notes:''}]
  } else {
    _cmAccounts = []
  }
  renderCmAccounts()

  document.getElementById('cm-delete').style.display = c ? 'inline-flex' : 'none'
  updateAvatarPreview()
  document.getElementById('contact-modal').classList.remove('hidden')
}

window.closeContactModal = () => {
  document.getElementById('contact-modal').classList.add('hidden')
}

window.updateAvatarPreview = function() {
  const name = document.getElementById('cm-name')?.value || ''
  const color = document.getElementById('cm-color')?.value || '#00f0ff'
  const el = document.getElementById('cm-avatar-preview')
  if (!el) return
  const initials = name.trim().split(/\s+/).map(w=>w[0]||'').join('').substring(0,2).toUpperCase() || '?'
  el.textContent = initials
  el.style.background = color + '22'
  el.style.color = color
  el.style.borderColor = color + '66'
}

window.updateRoleLabel = function(role) {
  const el = document.getElementById(`cm-role-${role}-label`)
  const cb = document.getElementById(`cm-role-${role}`)
  if (!el || !cb) return
  el.style.borderColor = cb.checked ? (role==='persona'?'#00f0ff':role==='proveedor'?'#f97316':role==='cliente'?'#4ade80':'#a78bfa') : 'rgba(255,255,255,0.12)'
  el.style.background  = cb.checked ? (role==='persona'?'rgba(0,246,255,0.08)':role==='proveedor'?'rgba(249,115,22,0.08)':role==='cliente'?'rgba(74,222,128,0.08)':'rgba(167,139,250,0.08)') : 'transparent'
  el.style.color = cb.checked ? '#fff' : 'var(--text-muted)'
}

window.setCmRating = function(n) {
  _cmRating = n
  document.querySelectorAll('#cm-rating-stars [data-star]').forEach(s => {
    s.style.opacity = parseInt(s.dataset.star) <= n ? '1' : '0.3'
  })
}

// ── Specialties ──────────────────────────────────────────────────────────────
window.addCmSpecialty = function() {
  const inp = document.getElementById('cm-specialty-input')
  const raw = inp?.value?.split(',').map(s=>s.trim()).filter(Boolean) || []
  raw.forEach(s => { if (!_cmSpecialties.includes(s)) _cmSpecialties.push(s) })
  if (inp) inp.value = ''
  renderCmSpecialties()
}

window.removeCmSpecialty = function(s) {
  _cmSpecialties = _cmSpecialties.filter(x => x !== s)
  renderCmSpecialties()
}

function renderCmSpecialties() {
  const el = document.getElementById('cm-specialties-chips')
  if (!el) return
  el.innerHTML = _cmSpecialties.map(s =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.3);color:#fb923c;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:600;">
      ${esc(s)}
      <button onclick="removeCmSpecialty('${esc(s)}')" style="background:none;border:none;color:#fb923c;cursor:pointer;font-size:14px;padding:0 0 0 2px;line-height:1;">×</button>
    </span>`
  ).join('')
}

// ── Specialties Catalog ───────────────────────────────────────────────────────
const DEFAULT_SPECIALTIES = [
  'Albañilería','Arquitectura','Cancelería','Carpintería','Carpintería metálica',
  'Diseño gráfico','Electricidad','Herrería','Impermeabilización',
  'Ingeniería civil','Instalación de aire acondicionado','Instalación de pisos',
  'Jardinería','Limpieza','Perforación','Pintura','Plomería',
  'Soldadura','Topografía','Yesería'
]

function getSpecialtiesCatalog() {
  try {
    const s = localStorage.getItem('nexus_specialties_catalog')
    if (s) return JSON.parse(s)
  } catch {}
  localStorage.setItem('nexus_specialties_catalog', JSON.stringify(DEFAULT_SPECIALTIES))
  return [...DEFAULT_SPECIALTIES]
}

function saveSpecialtiesCatalog(arr) {
  localStorage.setItem('nexus_specialties_catalog', JSON.stringify(arr))
}

function renderSpecCatalog(searchTerm = '') {
  const catalog = getSpecialtiesCatalog()
  const filtered = searchTerm ? catalog.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())) : catalog
  const el = document.getElementById('cm-spec-catalog')
  if (!el) return
  el.innerHTML = filtered.map(s => {
    const isSelected = _cmSpecialties.includes(s)
    return `<span onclick="toggleCatalogSpec('${s.replace(/'/g,"\\'")}')"
      style="cursor:pointer;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;
             background:${isSelected ? 'rgba(0,246,255,0.2)' : 'rgba(255,255,255,0.05)'};
             border:1px solid ${isSelected ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)'};
             color:${isSelected ? 'var(--accent-cyan)' : 'var(--text-muted)'};
             transition:all 0.15s;">${esc(s)}</span>`
  }).join('')
}

window.toggleCatalogSpec = (s) => {
  if (_cmSpecialties.includes(s)) {
    _cmSpecialties = _cmSpecialties.filter(x => x !== s)
  } else {
    _cmSpecialties.push(s)
  }
  renderSpecCatalog(document.getElementById('cm-spec-search')?.value || '')
  renderCmSpecialties()
}

window.filterSpecCatalog = (q) => renderSpecCatalog(q)

function renderConfigSpecCatalog() {
  const el = document.getElementById('spec-catalog-list')
  if (!el) return
  const catalog = getSpecialtiesCatalog()
  el.innerHTML = catalog.length === 0
    ? '<span style="font-size:12px;color:var(--text-dim);">Vacío. Agrega especialidades.</span>'
    : catalog.map(s => `
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;
              background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:12px;color:var(--text-muted);">
          ${esc(s)}
          <span onclick="removeCatalogSpecialty('${s.replace(/'/g,"\\'")}' )" style="cursor:pointer;color:#f87171;font-size:14px;line-height:1;" title="Eliminar">×</span>
        </span>`).join('')
}

window.addCatalogSpecialty = () => {
  const inp = document.getElementById('spec-new-input')
  const val = inp?.value.trim()
  if (!val) return
  const catalog = getSpecialtiesCatalog()
  if (!catalog.includes(val)) {
    catalog.push(val)
    catalog.sort()
    saveSpecialtiesCatalog(catalog)
    showMsg('✓ Especialidad agregada')
  }
  inp.value = ''
  renderConfigSpecCatalog()
}

window.removeCatalogSpecialty = (s) => {
  const catalog = getSpecialtiesCatalog().filter(x => x !== s)
  saveSpecialtiesCatalog(catalog)
  renderConfigSpecCatalog()
}

// ── Accounts ─────────────────────────────────────────────────────────────────
window.addCmAccount = function() {
  _cmAccounts.push({ id: uid(), label: '', type: 'bank', bank: '', clabe: '', wallet: '', network: '', specialty: '', notes: '' })
  renderCmAccounts()
}

window.removeCmAccount = function(id) {
  _cmAccounts = _cmAccounts.filter(a => a.id !== id)
  renderCmAccounts()
}

window.updateCmAccount = function(id, field, value) {
  const acc = _cmAccounts.find(a => a.id === id)
  if (acc) acc[field] = value
}

function renderCmAccounts() {
  const el = document.getElementById('cm-accounts-list')
  if (!el) return
  if (!_cmAccounts.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text-dim);padding:8px;text-align:center;">Sin cuentas. Pulsa "+ Cuenta" para agregar.</div>`
    return
  }
  el.innerHTML = _cmAccounts.map(a => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" value="${esc(a.label)}" placeholder="Etiqueta (Ej: BBVA Carpintería)" class="modal-input" style="flex:1;" onchange="updateCmAccount('${a.id}','label',this.value)"/>
        <select class="modal-input" style="width:110px;" onchange="updateCmAccount('${a.id}','type',this.value);cmToggleAccountFields('${a.id}',this.value)">
          <option value="bank" ${a.type==='bank'?'selected':''}>🏦 Banco</option>
          <option value="crypto" ${a.type==='crypto'?'selected':''}>₿ Cripto</option>
          <option value="cash" ${a.type==='cash'?'selected':''}>💵 Efectivo</option>
        </select>
        <button onclick="removeCmAccount('${a.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px;padding:4px;">✕</button>
      </div>
      <div id="cm-acc-bank-${a.id}" style="${a.type!=='bank'?'display:none;':''}display:flex;gap:8px;">
        <input type="text" value="${esc(a.bank)}" placeholder="Banco (BBVA, Nu…)" class="modal-input" style="flex:1;" onchange="updateCmAccount('${a.id}','bank',this.value)"/>
        <input type="text" value="${esc(a.clabe)}" placeholder="CLABE / No. cuenta" class="modal-input" style="flex:1;font-family:'JetBrains Mono',monospace;" onchange="updateCmAccount('${a.id}','clabe',this.value)"/>
      </div>
      <div id="cm-acc-crypto-${a.id}" style="${a.type!=='crypto'?'display:none;':''}display:flex;gap:8px;">
        <input type="text" value="${esc(a.network)}" placeholder="Red (XRP, ETH, TRX…)" class="modal-input" style="flex:1;" onchange="updateCmAccount('${a.id}','network',this.value)"/>
        <input type="text" value="${esc(a.wallet)}" placeholder="Dirección / wallet" class="modal-input" style="flex:1;font-family:'JetBrains Mono',monospace;" onchange="updateCmAccount('${a.id}','wallet',this.value)"/>
      </div>
      <input type="text" value="${esc(a.specialty)}" placeholder="Para especialidad (opcional: carpintería, plomería…)" class="modal-input" onchange="updateCmAccount('${a.id}','specialty',this.value)"/>
    </div>`).join('')
}

window.cmToggleAccountFields = function(id, type) {
  const bankEl   = document.getElementById(`cm-acc-bank-${id}`)
  const cryptoEl = document.getElementById(`cm-acc-crypto-${id}`)
  if (bankEl)   bankEl.style.display   = type === 'bank'   ? 'flex' : 'none'
  if (cryptoEl) cryptoEl.style.display = type === 'crypto' ? 'flex' : 'none'
}

// ── Save ─────────────────────────────────────────────────────────────────────
window.saveContact = async () => {
  const name = document.getElementById('cm-name')?.value.trim()
  if (!name) { showToast('⚠️ El nombre es obligatorio'); return }

  const roles = ['persona','proveedor','cliente','colaborador'].filter(r => document.getElementById(`cm-role-${r}`)?.checked)
  if (!roles.length) roles.push('persona')

  // Ensure clabe is clean
  _cmAccounts.forEach(a => {
    a.clabe = (a.clabe || '').replace(/\s/g, '')
  })

  const meta = {
    name,
    roles,
    cType: roles[0], // backwards compat
    color:      document.getElementById('cm-color')?.value || '#00f0ff',
    phone:      document.getElementById('cm-phone')?.value.trim() || undefined,
    email:      document.getElementById('cm-email')?.value.trim() || undefined,
    city:       document.getElementById('cm-city')?.value.trim() || undefined,
    rfc:        document.getElementById('cm-rfc')?.value.trim().toUpperCase() || undefined,
    rating:     _cmRating || undefined,
    specialties: _cmSpecialties.length ? _cmSpecialties : undefined,
    specialty:  _cmSpecialties[0] || undefined, // backwards compat
    contact_accounts: _cmAccounts.length ? _cmAccounts : undefined,
    notes:      document.getElementById('cm-notes')?.value.trim() || undefined,
  }
  // Remove undefined keys
  Object.keys(meta).forEach(k => meta[k] === undefined && delete meta[k])

  if (_currentContactId && allNodes.find(n => n.id === _currentContactId)) {
    const node = allNodes.find(n => n.id === _currentContactId)
    node.content = name
    node.metadata = meta
    if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
      await supabase.from('nodes').update({ content: name, metadata: meta }).eq('id', _currentContactId)
    }
    showToast('✅ Contacto actualizado')
  } else {
    const newNode = {
      id: uid(),
      owner_id: currentUser?.id,
      content: name,
      type: 'persona',
      metadata: meta,
      created_at: new Date().toISOString()
    }
    allNodes.unshift(newNode)
    if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
      await supabase.from('nodes').insert([{ id: newNode.id, owner_id: currentUser?.id, content: name, type: 'persona', metadata: meta }])
    }
    showToast('✅ Contacto creado')
  }

  closeContactModal()
  renderContacts()
}

window.deleteContact = async () => {
  if (!_currentContactId) return
  if (!confirm('¿Eliminar este contacto?')) return
  allNodes = allNodes.filter(n => n.id !== _currentContactId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').delete().eq('id', _currentContactId)
  }
  closeContactModal()
  renderContacts()
  showToast('🗑 Contacto eliminado')
}

// ── Render contacts grid ──────────────────────────────────────────────────────
function renderContacts() {
  const root = document.getElementById('contacts-root')
  if (!root) return
  const search = (document.getElementById('contact-search')?.value || '').toLowerCase()
  let contacts = allNodes.filter(n => n.type === 'persona' || n.type === 'contact')
  if (activeContactFilter !== 'all') {
    contacts = contacts.filter(c => {
      const roles = c.metadata?.roles || (c.metadata?.cType ? [c.metadata.cType] : ['persona'])
      return roles.includes(activeContactFilter)
    })
  }
  if (search) {
    contacts = contacts.filter(c => {
      const m = c.metadata || {}
      return (m.name || c.content).toLowerCase().includes(search)
        || (m.phone || '').includes(search)
        || (m.city || m.zone || '').toLowerCase().includes(search)
        || (m.specialties || []).some(s => s.toLowerCase().includes(search))
        || (m.specialty || '').toLowerCase().includes(search)
    })
  }

  if (!contacts.length) {
    root.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:60px 20px;">
      <div style="font-size:40px;margin-bottom:12px;">👥</div>
      <div style="font-size:14px;">Sin contactos. Crea uno con <b>+ Nuevo</b> o usa <code>#persona Nombre</code> en la barra.</div>
    </div>`
    return
  }

  root.innerHTML = contacts.map(c => {
    const m = c.metadata || {}
    const name    = m.name || c.content
    const color   = m.color || '#00f0ff'
    const roles   = m.roles || (m.cType ? [m.cType] : ['persona'])
    const specs   = m.specialties || (m.specialty ? [m.specialty] : [])
    const accounts = m.contact_accounts || []
    const initials = name.trim().split(/\s+/).map(w=>w[0]||'').join('').substring(0,2).toUpperCase()

    const roleColors = { persona:'#00f0ff', proveedor:'#f97316', cliente:'#4ade80', colaborador:'#a78bfa' }
    const roleIcons  = { persona:'👤', proveedor:'🔧', cliente:'💼', colaborador:'🤝' }
    const roleBadges = roles.map(r =>
      `<span style="font-size:10px;padding:2px 7px;background:${roleColors[r]||'#888'}1a;border:1px solid ${roleColors[r]||'#888'}44;color:${roleColors[r]||'#888'};border-radius:4px;font-weight:700;">${roleIcons[r]||''} ${r}</span>`
    ).join('')

    const specChips = specs.slice(0,4).map(s =>
      `<span style="font-size:10px;padding:2px 8px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2);color:#fb923c;border-radius:4px;">${esc(s)}</span>`
    ).join('') + (specs.length > 4 ? `<span style="font-size:10px;color:var(--text-dim);">+${specs.length-4}</span>` : '')

    const txCount = allNodes.filter(n =>
      (n.type==='income'||n.type==='expense') && n.metadata?.contact_id===c.id
    ).length
    const totalPaid = allNodes.filter(n => n.type==='expense' && n.metadata?.contact_id===c.id)
      .reduce((s,n) => s+(n.metadata?.amount||0), 0)

    return `<div class="contact-card" onclick="openContactModal('${c.id}')" style="cursor:pointer;">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="width:46px;height:46px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;background:${color}18;color:${color};border:1.5px solid ${color}44;">${initials||'?'}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(name)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${roleBadges}</div>
          ${m.phone ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">📞 ${esc(m.phone)}</div>` : ''}
          ${m.city  ? `<div style="font-size:11px;color:var(--text-muted);">📍 ${esc(m.city)}</div>` : ''}
          ${specs.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${specChips}</div>` : ''}
          ${m.rating ? `<div style="font-size:12px;margin-top:4px;">${'⭐'.repeat(m.rating)}</div>` : ''}
          ${accounts.length ? `<div style="font-size:10px;color:var(--text-dim);margin-top:4px;">🏦 ${accounts.length} cuenta${accounts.length>1?'s':''} de cobro</div>` : ''}
        </div>
      </div>
      ${txCount > 0 ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);">
        <span>${txCount} tx</span>
        ${totalPaid>0?`<span style="color:#f87171;">-$${totalPaid.toLocaleString()}</span>`:''}
      </div>` : ''}
    </div>`
  }).join('')
}

// ── FEEDBACK ─────────────────────────────────────────────────────────────────
let activeFbType = 'bug'

window.selectFbType = function(type, btn) {
  activeFbType = type
  document.querySelectorAll('#fb-type-btns .contact-filter-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
}

window.sendFeedback = async function() {
  const subject   = document.getElementById('fb-subject')?.value.trim()
  const body      = document.getElementById('fb-body')?.value.trim()
  const userEmail = document.getElementById('fb-email')?.value.trim()
  const status    = document.getElementById('fb-status')

  if (!subject || !body) {
    status.style.display = 'block'
    status.style.background = 'rgba(248,113,113,0.1)'
    status.style.border = '1px solid rgba(248,113,113,0.25)'
    status.style.color = '#f87171'
    status.textContent = '⚠️ Por favor completa el asunto y la descripción.'
    return
  }

  const typeLabels = { bug:'🐛 Error / Bug', feature:'✨ Nueva Función', inconsistency:'⚠️ Inconsistencia', other:'💡 Otro' }
  const typeLabel  = typeLabels[activeFbType] || activeFbType

  // Guardar en Supabase como nodo tipo feedback para que Oscar lo vea
  const meta = {
    fb_type: activeFbType,
    fb_subject: subject,
    fb_body: body,
    fb_email: userEmail || (currentUser?.email || 'anónimo'),
    fb_user_id: currentUser?.id || 'guest',
    fb_at: new Date().toISOString(),
    fb_url: window.location.href
  }

  try {
    // Intentar guardar en Supabase
    if (currentUser) {
      await supabase.from('nodes').insert({
        owner_id: currentUser.id,
        type: 'feedback',
        content: `[${typeLabel}] ${subject}`,
        metadata: meta
      })
    }
  } catch(e) { console.warn('Feedback DB:', e) }

  // Abrir mailto como canal principal (llega directo al email)
  const mailSubject = encodeURIComponent(`[Nexus OS Feedback] ${typeLabel}: ${subject}`)
  const mailBody    = encodeURIComponent(
    `Tipo: ${typeLabel}\n` +
    `Asunto: ${subject}\n` +
    (userEmail ? `Email de respuesta: ${userEmail}\n` : '') +
    `Usuario: ${currentUser?.email || 'no autenticado'}\n` +
    `Fecha: ${new Date().toLocaleString('es-MX')}\n\n` +
    `--- Descripción ---\n${body}`
  )
  window.open(`mailto:oscaromargp@gmail.com?subject=${mailSubject}&body=${mailBody}`, '_blank')

  // Limpiar form y mostrar éxito
  document.getElementById('fb-subject').value = ''
  document.getElementById('fb-body').value    = ''
  document.getElementById('fb-email').value   = ''
  status.style.display = 'block'
  status.style.background = 'rgba(34,197,94,0.1)'
  status.style.border = '1px solid rgba(34,197,94,0.25)'
  status.style.color = '#4ade80'
  status.textContent = '✅ ¡Gracias! Tu feedback fue enviado. Se abrió tu cliente de correo para enviarlo.'
  playBeep(880, 0.2, 0.4)
  setTimeout(() => { if (status) status.style.display = 'none' }, 6000)
}

// ── Parser: detect #contactname in transactions ──
function resolveContactInMetadata(metadata, raw) {
  const contacts = getContacts()
  if (!contacts.length) return metadata
  // Look for #name patterns in raw text (excluding system tags)
  const systemTags = ['tarea','persona','proyecto']
  const matches = (raw.match(/#(\w+)/g) || [])
    .map(m => m.slice(1).toLowerCase())
    .filter(m => !systemTags.includes(m))
  for (const slug of matches) {
    const found = contacts.find(c =>
      (c.metadata?.name || c.content).toLowerCase().replace(/\s+/g,'') === slug ||
      (c.metadata?.name || c.content).toLowerCase().startsWith(slug)
    )
    if (found) {
      metadata.contact_id = found.id
      metadata.contact_name = found.metadata?.name || found.content
      break
    }
  }
  return metadata
}

window.openContactByName = (name) => {
  const c = allNodes.find(n => n.type === 'contact' &&
    (n.metadata?.name || n.content).toLowerCase() === name.toLowerCase())
  if (c) openContactSheet(c.id)
  else showToast(`Contacto "${name}" no encontrado`)
}

// ─────────────────────────────────────────
// Onboarding
// ─────────────────────────────────────────
;(function initOnboarding() {
  const modal = document.getElementById('onboarding-modal')
  if (!modal) return
  const dismissed = localStorage.getItem('nexus_onboarded')
  if (!dismissed) {
    modal.style.display = 'flex'
  } else {
    modal.style.display = 'none'
  }
})()

window.closeOnboarding = (temporary = true) => {
  const modal = document.getElementById('onboarding-modal')
  if (modal) modal.style.display = 'none'
  if (!temporary) localStorage.setItem('nexus_onboarded', '1')
}

window.tryExample = (val) => {
  const input = document.getElementById('nexus-input')
  if (input) {
    input.value = val
    input.dispatchEvent(new Event('input'))
    input.focus()
    closeOnboarding(true)
  }
}

// ─────────────────────────────────────────
// Audio recording
// ─────────────────────────────────────────
let mediaRecorder = null
let audioChunks = []
let audioTimerInterval = null
let audioSeconds = 0
let audioContext = 'note'

window.toggleAudioRecord = async (context) => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopAudioRecord(context)
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    audioSeconds = 0
    audioContext = context
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data)
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      clearInterval(audioTimerInterval)
      const blob = new Blob(audioChunks, { type: 'audio/webm' })
      if (blob.size > 5 * 1024 * 1024) { showToast('Audio muy largo — máx 5 MB (~3 min)'); return }
      const reader = new FileReader()
      reader.onload = e => addAttachment(e.target.result, audioContext)
      reader.readAsDataURL(blob)
      // Reset UI
      const statusEl = document.getElementById(`${context === 'note' ? 'ne' : 'fd'}-audio-status`)
      const btnEl    = document.getElementById(`${context === 'note' ? 'ne' : 'fd'}-audio-btn`)
      if (statusEl) statusEl.style.display = 'none'
      if (btnEl) btnEl.textContent = '🎙 Grabar audio'
    }
    mediaRecorder.start()
    // UI: show recording state
    const statusEl = document.getElementById(`${context === 'note' ? 'ne' : 'fd'}-audio-status`)
    const btnEl    = document.getElementById(`${context === 'note' ? 'ne' : 'fd'}-audio-btn`)
    if (statusEl) statusEl.style.display = 'flex'
    if (btnEl) btnEl.textContent = '⏹ Detener'
    audioTimerInterval = setInterval(() => {
      audioSeconds++
      const m = String(Math.floor(audioSeconds / 60)).padStart(2, '0')
      const s = String(audioSeconds % 60).padStart(2, '0')
      const timerEl = document.getElementById(`${context === 'note' ? 'ne' : 'fd'}-audio-timer`)
      if (timerEl) timerEl.textContent = `${m}:${s}`
    }, 1000)
  } catch {
    showToast('No se pudo acceder al micrófono')
  }
}

window.stopAudioRecord = (context) => {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop()
}

// ═══════════════════════════════════════════════════════════════
//  NODOS — IMPORT CSV MASIVO
// ═══════════════════════════════════════════════════════════════
const NODE_CSV_HEADERS = ['contenido','tipo','monto','etiquetas','fecha','notas']
const NODE_VALID_TYPES = new Set(['note','kanban','income','expense','persona','contact','proyecto','event','cotizacion'])

window.downloadNodeTemplate = () => {
  const header = NODE_CSV_HEADERS.join(',')
  const examples = [
    '"Revisar informe Q2","kanban","","#trabajo #urgente","2026-05-01","Revisar con el equipo antes del viernes"',
    '"Pago freelance mayo","income","15000","#freelance #design","2026-05-15","Proyecto web landing"',
    '"Renta oficina","expense","8500","#renta #fijo","2026-05-01","Transferencia BBVA"',
    '"Reflexión sobre el producto","note","","#idea #startup","","Pensar en el modelo de precios"',
    '"Juan Pérez electricista","persona","","#proveedor #electricista","","Tel: 612 123 4567"',
  ].join('\n')
  const csv  = `${header}\n${examples}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'nexus_nodos_plantilla.csv'; a.click()
  URL.revokeObjectURL(url)
  showToast('📄 Plantilla descargada')
}

window.importNodesCSV = async (input) => {
  const resultEl = document.getElementById('nodes-import-result')
  const file = input.files?.[0]
  if (!file) return
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) {
    if (resultEl) { resultEl.style.cssText = 'display:block;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);color:#f87171;'; resultEl.textContent = '⚠️ CSV vacío o sin filas de datos.' }
    return
  }
  // Parse headers
  const parseCell = c => c?.trim().replace(/^"|"$/g,'').replace(/""/g,'"') || ''
  const headers   = lines[0].split(',').map(h => parseCell(h).toLowerCase())
  const idxOf = k => headers.indexOf(k)

  let imported = 0, errors = 0, skipped = 0
  const errDetails = []

  for (let i = 1; i < lines.length; i++) {
    const cells   = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(parseCell) || []
    const content = cells[idxOf('contenido')] || cells[0] || ''
    const tipo    = (cells[idxOf('tipo')] || 'note').toLowerCase().trim()
    const monto   = parseFloat(cells[idxOf('monto')] || '0') || 0
    const tags    = (cells[idxOf('etiquetas')] || '').split(/\s+/).filter(t=>t.startsWith('#'))
    const fecha   = cells[idxOf('fecha')] || ''
    const notas   = cells[idxOf('notas')] || ''

    if (!content) { skipped++; continue }
    if (!NODE_VALID_TYPES.has(tipo)) {
      errDetails.push(`Fila ${i+1}: tipo "${tipo}" inválido`)
      errors++; continue
    }

    const meta = { label: content, tags, notas }
    if (monto > 0) meta.amount = monto
    if (fecha)    meta.fecha   = fecha

    try {
      await insertDirectNode(tipo, content, meta)
      imported++
    } catch(e) {
      errDetails.push(`Fila ${i+1}: ${e.message}`)
      errors++
    }
  }

  input.value = ''
  const ok = imported > 0
  const msg = `✅ ${imported} nodos importados${skipped?` · ${skipped} filas vacías ignoradas`:''}${errors?` · ⚠️ ${errors} errores`:''}`
  if (resultEl) {
    resultEl.style.cssText = `display:block;background:${ok?'rgba(74,222,128,0.1)':'rgba(248,113,113,0.1)'};border:1px solid ${ok?'rgba(74,222,128,0.3)':'rgba(248,113,113,0.3)'};color:${ok?'#4ade80':'#f87171'};`
    resultEl.innerHTML = msg + (errDetails.length ? `<br><small>${errDetails.slice(0,3).join(' | ')}</small>` : '')
  }
  showToast(msg)
}

// ═══════════════════════════════════════════════════════════════
//  CONTACTOS — EXPORT / IMPORT CSV
// ═══════════════════════════════════════════════════════════════
const CONTACT_CSV_HEADERS = [
  'nombre','tipo','empresa','telefono','email','banco','clabe','cuenta','red_cripto','wallet','color','notas'
]

window.downloadContactTemplate = () => {
  const header = CONTACT_CSV_HEADERS.join(',')
  const example = [
    'Juan Pérez','persona','ACME Corp','5512345678','juan@correo.com','BBVA','021180000000000000','1234567890','','','#00f0ff','Proveedor frecuente'
  ].map(v => `"${v}"`).join(',')
  const csv = `${header}\n${example}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'nexus_contactos_plantilla.csv'; a.click()
  URL.revokeObjectURL(url)
  showToast('📄 Plantilla descargada')
}

window.exportContactsCSV = () => {
  const contacts = getContacts()
  if (!contacts.length) { showToast('Sin contactos para exportar'); return }
  const rows = [CONTACT_CSV_HEADERS.join(',')]
  contacts.forEach(c => {
    const m = c.metadata || {}
    const row = [
      m.name || c.content,
      m.cType || 'persona',
      m.company || '',
      m.phone || '',
      m.email || '',
      m.bank_name || m.bank || '',
      m.clabe || '',
      m.account || '',
      m.network || '',
      m.address?.wallet || '',
      m.color || '#00f0ff',
      m.notes || ''
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    rows.push(row)
  })
  const csv  = rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `nexus_contactos_${new Date().toISOString().split('T')[0]}.csv`; a.click()
  URL.revokeObjectURL(url)
  showToast(`⬇ ${contacts.length} contactos exportados`)
}

// ══════════════════════════════════════════════════════════════
//  IMPORTADOR CSV BANCARIO — auto-detección de columnas
// ══════════════════════════════════════════════════════════════
// Columnas soportadas (case-insensitive, sin acentos):
//   fecha / date / f.operacion
//   descripcion / concepto / description / referencia
//   retiro / cargo / debit
//   deposito / abono / credit
//   monto / importe / amount  (positivo=ingreso, negativo=gasto)

let _bankCsvRows = []  // filas parseadas pendientes de confirmar

function _normHeader(h) {
  return h.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'')
}

function _matchCol(headers, ...candidates) {
  for (const c of candidates) {
    const idx = headers.indexOf(c)
    if (idx !== -1) return idx
  }
  return -1
}

function _parseAmount(str) {
  if (!str) return 0
  return parseFloat(str.replace(/[$,\s]/g,'').replace(',','.')) || 0
}

window.previewBankCSV = (input) => {
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target.result
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) { showToast('CSV sin datos'); return }

    const parseCell = c => c?.trim().replace(/^"|"$/g,'').replace(/""/g,'"') || ''
    const rawHeaders = lines[0].split(',').map(parseCell)
    const headers = rawHeaders.map(_normHeader)

    // Detectar columnas
    const iDate  = _matchCol(headers,'fecha','date','foperacion','fechaoperacion','fecoperacion')
    const iDesc  = _matchCol(headers,'descripcion','concepto','description','referencia','detalle','concepto')
    const iDeb   = _matchCol(headers,'retiro','cargo','debit','debito')
    const iCred  = _matchCol(headers,'deposito','abono','credit','credito')
    const iAmt   = _matchCol(headers,'monto','importe','amount','valor')

    if (iDesc === -1 && iAmt === -1 && iDeb === -1) {
      document.getElementById('bank-csv-preview').innerHTML =
        `<div style="color:#f87171;font-size:12px;padding:10px;background:rgba(248,113,113,0.08);border-radius:8px;">⚠️ No se reconocieron columnas. Encabezados detectados: <code>${rawHeaders.join(', ')}</code></div>`
      return
    }

    // Parsear filas
    _bankCsvRows = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(parseCell) || []
      const desc  = cells[iDesc !== -1 ? iDesc : 0] || ''
      const date  = iDate !== -1 ? cells[iDate] : ''
      let amount  = 0, txType = 'expense'

      if (iAmt !== -1) {
        amount = _parseAmount(cells[iAmt])
        txType = amount >= 0 ? 'income' : 'expense'
        amount = Math.abs(amount)
      } else {
        const deb  = _parseAmount(iDeb  !== -1 ? cells[iDeb]  : '')
        const cred = _parseAmount(iCred !== -1 ? cells[iCred] : '')
        if (deb > 0)  { amount = deb;  txType = 'expense' }
        if (cred > 0) { amount = cred; txType = 'income'  }
      }

      if (!desc || amount === 0) continue
      _bankCsvRows.push({ desc, date, amount, txType })
    }

    if (!_bankCsvRows.length) {
      document.getElementById('bank-csv-preview').innerHTML =
        `<div style="color:#fb923c;font-size:12px;padding:10px;background:rgba(251,146,60,0.08);border-radius:8px;">⚠️ No se encontraron filas con datos válidos.</div>`
      return
    }

    const incomes  = _bankCsvRows.filter(r => r.txType === 'income')
    const expenses = _bankCsvRows.filter(r => r.txType === 'expense')
    const totalInc = incomes.reduce((s,r) => s+r.amount, 0)
    const totalExp = expenses.reduce((s,r) => s+r.amount, 0)

    // Preview con resumen + primeras 10 filas
    const rows = _bankCsvRows.slice(0,10).map(r => `
      <tr>
        <td style="padding:5px 8px;color:${r.txType==='income'?'#4ade80':'#f87171'};font-size:11px;">${r.txType==='income'?'↑ INGRESO':'↓ GASTO'}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--text-primary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.desc)}</td>
        <td style="padding:5px 8px;font-family:'JetBrains Mono',monospace;font-size:12px;color:${r.txType==='income'?'#4ade80':'#f87171'};text-align:right;">$${r.amount.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text-muted);">${r.date}</td>
      </tr>`).join('')

    document.getElementById('bank-csv-preview').innerHTML = `
      <div style="background:rgba(0,246,255,0.05);border:1px solid rgba(0,246,255,0.15);border-radius:10px;padding:12px 16px;margin-bottom:10px;">
        <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:12px;">
          <span>📊 <strong style="color:#fff;">${_bankCsvRows.length}</strong> transacciones detectadas</span>
          <span>💰 Ingresos: <strong style="color:#4ade80;">${incomes.length} — $${totalInc.toLocaleString('es-MX',{maximumFractionDigits:0})}</strong></span>
          <span>💸 Gastos: <strong style="color:#f87171;">${expenses.length} — $${totalExp.toLocaleString('es-MX',{maximumFractionDigits:0})}</strong></span>
        </div>
      </div>
      <div style="overflow-x:auto;border:1px solid rgba(255,255,255,0.07);border-radius:8px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid rgba(255,255,255,0.07);">
            <th style="padding:6px 8px;font-size:10px;color:var(--text-muted);text-align:left;">TIPO</th>
            <th style="padding:6px 8px;font-size:10px;color:var(--text-muted);text-align:left;">DESCRIPCIÓN</th>
            <th style="padding:6px 8px;font-size:10px;color:var(--text-muted);text-align:right;">MONTO</th>
            <th style="padding:6px 8px;font-size:10px;color:var(--text-muted);text-align:left;">FECHA</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${_bankCsvRows.length > 10 ? `<div style="text-align:center;padding:8px;font-size:11px;color:var(--text-muted);">… y ${_bankCsvRows.length-10} más</div>` : ''}
      </div>`

    document.getElementById('bank-csv-import-btn').style.display = 'inline-block'
  }
  reader.readAsText(file, 'UTF-8')
}

window.importBankCSV = async () => {
  if (!_bankCsvRows.length) { showToast('Primero selecciona un CSV'); return }
  const account = document.getElementById('bank-csv-account')?.value.trim().toLowerCase() || ''
  const tagRaw  = document.getElementById('bank-csv-tag')?.value.trim() || ''
  const extraTag = tagRaw ? (tagRaw.startsWith('#') ? tagRaw : '#' + tagRaw) : ''

  const btn = document.getElementById('bank-csv-import-btn')
  if (btn) btn.disabled = true

  let ok = 0, fail = 0
  for (const row of _bankCsvRows) {
    try {
      const prefix = row.txType === 'income' ? '+$' : '-$'
      const acPart = account ? ` @${account}` : ''
      const tagPart = extraTag ? ` ${extraTag}` : ''
      const raw = `${prefix}${row.amount} ${row.desc}${acPart}${tagPart}`
      await insertNodeRaw(raw)
      ok++
    } catch(e) {
      fail++
    }
    // Pequeña pausa para no saturar Supabase
    if (ok % 20 === 0) await new Promise(r => setTimeout(r, 100))
  }

  _bankCsvRows = []
  if (btn) { btn.disabled = false; btn.style.display = 'none' }
  document.getElementById('bank-csv-input').value = ''

  const resultEl = document.getElementById('bank-csv-result')
  const msg = `✅ ${ok} transacciones importadas${fail ? ` · ⚠️ ${fail} errores` : ''}`
  if (resultEl) {
    resultEl.style.cssText = `display:block;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);color:#4ade80;border-radius:8px;padding:10px 14px;`
    resultEl.textContent = msg
  }
  showToast(msg)
}

window.importContactsCSV = async (input) => {
  const file = input.files?.[0]; if (!file) return
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) { showToast('⚠️ CSV vacío o sin datos'); return }
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g,''))
  const idxOf = key => headers.indexOf(key)
  const parseCell = cell => cell?.trim().replace(/^"|"$/g,'').replace(/""/g,'"') || ''

  let imported = 0, errors = 0
  for (let i = 1; i < lines.length; i++) {
    // Respect quoted commas
    const cells = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(parseCell) || []
    const nombre = cells[idxOf('nombre')] || cells[0] || ''
    if (!nombre) { errors++; continue }
    const cType  = cells[idxOf('tipo')] || 'persona'
    const meta = {
      name:     nombre,
      cType:    ['persona','bank','crypto'].includes(cType) ? cType : 'persona',
      company:  cells[idxOf('empresa')] || '',
      phone:    cells[idxOf('telefono')] || '',
      email:    cells[idxOf('email')] || '',
      bank_name:cells[idxOf('banco')] || '',
      clabe:    cells[idxOf('clabe')] || '',
      account:  cells[idxOf('cuenta')] || '',
      network:  cells[idxOf('red_cripto')] || '',
      color:    cells[idxOf('color')] || '#00f0ff',
      notes:    cells[idxOf('notas')] || '',
    }
    const wallet = cells[idxOf('wallet')] || ''
    if (wallet) meta.address = { wallet }
    try {
      await insertDirectNode('contact', nombre, meta)
      imported++
    } catch { errors++ }
  }
  input.value = ''
  showToast(`✅ ${imported} contactos importados${errors?` (${errors} errores)`:''}`)
}

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR — TIPO DE CAMBIO EN VIVO
// ═══════════════════════════════════════════════════════════════
// let fxIntervalId — movido antes del boot IIFE para evitar TDZ

async function refreshFxWidget() {
  const container = document.getElementById('fx-table')
  const updatedEl = document.getElementById('fx-updated')
  if (!container) return

  const pairs = [
    { from:'USD',  to:'MXN',  label:'USD',  icon:'🇺🇸', crypto:false },
    { from:'EUR',  to:'MXN',  label:'EUR',  icon:'🇪🇺', crypto:false },
    { from:'btc',  to:'mxn',  label:'BTC',  icon:'₿',   crypto:true  },
    { from:'eth',  to:'mxn',  label:'ETH',  icon:'Ξ',   crypto:true  },
    { from:'xrp',  to:'mxn',  label:'XRP',  icon:'✕',   crypto:true  },
    { from:'usdt', to:'mxn',  label:'USDT', icon:'₮',   crypto:true  },
  ]

  const rows = await Promise.all(pairs.map(async p => {
    try {
      const rate = p.crypto
        ? await fetchCryptoRate(p.from, p.to)
        : await fetchFiatRate(p.from, p.to)
      if (!rate) throw new Error('no rate')
      const fmt = rate >= 10
        ? rate.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : rate.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
        <span style="font-size:11px;color:var(--text-muted);">${p.icon} ${p.label}</span>
        <span style="font-size:11px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">$${fmt}</span>
      </div>`
    } catch {
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
        <span style="font-size:11px;color:var(--text-muted);">${p.icon} ${p.label}</span>
        <span style="font-size:10px;color:var(--text-dim);">—</span>
      </div>`
    }
  }))

  container.innerHTML = rows.join('<div style="border-top:1px solid rgba(255,255,255,0.04);margin:2px 0;"></div>')
  if (updatedEl) {
    const now = new Date()
    updatedEl.textContent = now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})
  }
}

function initFxWidget() {
  refreshFxWidget()
  if (fxIntervalId) clearInterval(fxIntervalId)
  fxIntervalId = setInterval(refreshFxWidget, 60_000)
}

// ═══════════════════════════════════════════════════════════
// INTELIGENCIA DE TAGS — Sprint 11
// ═══════════════════════════════════════════════════════════

function extractTagData() {
  const freq = {}
  const lastUsed = {}
  const pairFreq = {}
  const tagNodeMap = {}

  allNodes.forEach(n => {
    const raw = n.metadata?.tags || []
    const tags = raw.map(t => t.replace(/^#/,'').toLowerCase().trim()).filter(Boolean)
    const date = n.metadata?.date || (n.created_at ? n.created_at.slice(0,10) : null)
    tags.forEach(t => {
      freq[t] = (freq[t] || 0) + 1
      if (date && (!lastUsed[t] || date > lastUsed[t])) lastUsed[t] = date
      if (!tagNodeMap[t]) tagNodeMap[t] = []
      tagNodeMap[t].push(n)
    })
    if (tags.length >= 2) {
      for (let i = 0; i < tags.length; i++) {
        for (let j = i+1; j < tags.length; j++) {
          const key = [tags[i], tags[j]].sort().join('|')
          pairFreq[key] = (pairFreq[key] || 0) + 1
        }
      }
    }
  })
  return { freq, lastUsed, pairFreq, tagNodeMap }
}

window.renderTagsView = function() {
  const { freq, lastUsed, pairFreq, tagNodeMap } = extractTagData()
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1])
  const maxFreq = sorted[0]?.[1] || 1

  // Tag Cloud
  const cloud = document.getElementById('tag-cloud')
  if (cloud) {
    if (!sorted.length) {
      cloud.innerHTML = '<span style="color:var(--text-muted);font-size:13px;">Aún no hay etiquetas. Empieza a etiquetar tus nodos con #.</span>'
    } else {
      const palette = ['#a855f7','#00f0ff','#4ade80','#f87171','#fbbf24','#60a5fa','#f97316','#34d399']
      cloud.innerHTML = sorted.map(([tag, count]) => {
        const ratio = count / maxFreq
        const size = 11 + Math.round(ratio * 22)
        const op = 0.5 + ratio * 0.5
        const color = palette[tag.charCodeAt(0) % palette.length]
        return `<span onclick="openTagFolder('${esc(tag)}')" title="${count} nodo${count>1?'s':''}"
          style="font-size:${size}px;color:${color};opacity:${op};cursor:pointer;
                 background:${color}18;border:1px solid ${color}30;border-radius:100px;
                 padding:3px 12px;transition:all 0.2s;font-weight:${ratio>0.5?700:500};"
          onmouseover="this.style.opacity=1;this.style.transform='scale(1.08)'"
          onmouseout="this.style.opacity='${op}';this.style.transform=''"
          >#${tag} <sup style="font-size:9px;">${count}</sup></span>`
      }).join('')
    }
  }

  // Top 10 con bar charts visuales
  const top10El = document.getElementById('tag-top10')
  if (top10El) {
    const maxCount = sorted[0]?.[1] || 1
    const top = sorted.slice(0, 10)
    top10El.innerHTML = top.length ? top.map(([tag, count]) => {
      const pct = Math.round((count / maxCount) * 100)
      return `<div onclick="openTagFolder('${esc(tag)}')" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
        <span style="font-size:12px;color:#fff;width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;">#${esc(tag)}</span>
        <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:4px;height:8px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#00f0ff,#a78bfa);border-radius:4px;"></div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);width:28px;text-align:right;flex-shrink:0;">${count}</span>
      </div>`
    }).join('') : '<span style="color:var(--text-muted);font-size:13px;">Sin etiquetas aún.</span>'
  }

  // Trends — tags en alza esta semana vs semana pasada
  const trendsEl = document.getElementById('tag-trends')
  if (trendsEl) {
    const now2 = new Date()
    const weekAgo = new Date(now2); weekAgo.setDate(weekAgo.getDate()-7)
    const twoWeeksAgo = new Date(now2); twoWeeksAgo.setDate(twoWeeksAgo.getDate()-14)
    const weekAgoStr = weekAgo.toISOString().slice(0,10)
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0,10)
    const todayStr = now2.toISOString().slice(0,10)
    const rising = Object.entries(tagNodeMap).map(([tag, nodes]) => {
      const thisWeek = nodes.filter(n => { const d = n.metadata?.date||(n.created_at?.slice(0,10)||''); return d >= weekAgoStr && d <= todayStr }).length
      const prevWeek = nodes.filter(n => { const d = n.metadata?.date||(n.created_at?.slice(0,10)||''); return d >= twoWeeksAgoStr && d < weekAgoStr }).length
      return { tag, thisWeek, prevWeek, delta: thisWeek - prevWeek }
    }).filter(x => x.delta > 0 && x.thisWeek > 0).sort((a,b) => b.delta - a.delta).slice(0, 5)
    trendsEl.innerHTML = rising.length ? `
      <div style="font-size:13px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">📈 Tags en Alza (esta semana)</div>
      ${rising.map(r => `
        <div onclick="openTagFolder('${esc(r.tag)}')" style="display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04);" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
          <span style="font-size:13px;color:#4ade80;font-weight:600;">#${esc(r.tag)}</span>
          <span style="flex:1;font-size:11px;color:var(--text-dim);">${r.thisWeek} usos esta semana</span>
          <span style="font-size:12px;color:#4ade80;font-weight:700;">+${r.delta} ↑</span>
        </div>`).join('')}` :
      `<div style="font-size:12px;color:var(--text-muted);">No hay tendencias detectadas esta semana.</div>`
  }

  // Durmientes (sin uso >30 días)
  const dormEl = document.getElementById('tag-dormant')
  if (dormEl) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30)
    const cutoffStr = cutoff.toISOString().slice(0,10)
    const dormant = Object.entries(lastUsed)
      .filter(([,d]) => d < cutoffStr)
      .sort((a,b) => a[1].localeCompare(b[1]))
      .slice(0,10)
    dormEl.innerHTML = dormant.length
      ? dormant.map(([tag,date]) => `
          <div onclick="openTagFolder('${esc(tag)}')" style="display:flex;align-items:center;gap:10px;padding:5px 4px;cursor:pointer;border-radius:6px;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
            <span style="font-size:13px;color:#94a3b8;">#${tag}</span>
            <span style="font-size:11px;color:var(--text-dim);margin-left:auto;">último: ${date}</span>
            <span style="font-size:10px;background:rgba(248,113,113,0.12);color:#f87171;padding:1px 7px;border-radius:5px;flex-shrink:0;">dormida</span>
          </div>`).join('')
      : '<span style="color:#4ade80;font-size:13px;">✓ Todas tus etiquetas están activas.</span>'
  }

  // Co-ocurrencias
  const coEl = document.getElementById('tag-cooccur')
  if (coEl) {
    const topPairs = Object.entries(pairFreq).filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]).slice(0,12)
    coEl.innerHTML = topPairs.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:10px;">${topPairs.map(([pair,count])=>{
          const [a,b]=pair.split('|')
          return `<div onclick="openTagFolderMulti('${esc(a)}','${esc(b)}')" style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2);border-radius:10px;padding:6px 14px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.15s;" onmouseover="this.style.background='rgba(168,85,247,0.15)'" onmouseout="this.style.background='rgba(168,85,247,0.08)'">
            <span style="color:#a855f7;font-size:13px;font-weight:600;">#${a}</span>
            <span style="color:var(--text-dim);font-size:11px;">+</span>
            <span style="color:#a855f7;font-size:13px;font-weight:600;">#${b}</span>
            <span style="background:rgba(168,85,247,0.25);color:#a855f7;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:2px;">${count}×</span>
          </div>`}).join('')}</div>`
      : '<span style="color:var(--text-muted);font-size:13px;">Se necesitan nodos con 2+ etiquetas para detectar co-ocurrencias.</span>'
  }

  // Reset tag folder
  const lbl = document.getElementById('tag-folder-label')
  const fld = document.getElementById('tag-folder-nodes')
  if (lbl) lbl.textContent = 'Selecciona una etiqueta de la nube ↑'
  if (fld) fld.innerHTML = ''
}

window.openTagFolder = function(tag) {
  const nodes = allNodes.filter(n =>
    (n.metadata?.tags||[]).map(t=>t.replace(/^#/,'').toLowerCase()).includes(tag.toLowerCase())
  )
  renderTagFolder(tag, nodes)
}

window.openTagFolderMulti = function(tagA, tagB) {
  const nodes = allNodes.filter(n => {
    const tags = (n.metadata?.tags||[]).map(t=>t.replace(/^#/,'').toLowerCase())
    return tags.includes(tagA.toLowerCase()) && tags.includes(tagB.toLowerCase())
  })
  renderTagFolder(`${tagA} + ${tagB}`, nodes)
}

function renderTagFolder(label, nodes) {
  const lbl = document.getElementById('tag-folder-label')
  const fld = document.getElementById('tag-folder-nodes')
  if (lbl) lbl.textContent = `#${label} — ${nodes.length} nodo${nodes.length!==1?'s':''}`
  if (!fld) return
  if (!nodes.length) { fld.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Ningún nodo con esta etiqueta.</div>'; return }
  fld.innerHTML = nodes.map(n => {
    const cfg = TYPE_LABELS[n.type] || { icon:'💡', label:'Nota', color:'#94a3b8' }
    const date = n.metadata?.date || (n.created_at ? n.created_at.slice(0,10) : '')
    const amtRaw = n.metadata?.amount
    const amtStr = amtRaw ? `<span style="color:${cfg.color};font-weight:700;font-size:12px;margin-left:8px;">${n.type==='income'?'+':'-'}$${(+amtRaw).toLocaleString('es-MX')}</span>` : ''
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--glass-border);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:background 0.15s;" onclick="openCardModal('${n.id}')" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
      <span style="font-size:16px;flex-shrink:0;">${cfg.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n.metadata?.label||n.content)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${date}</div>
      </div>
      ${amtStr}
      <span style="background:rgba(255,255,255,0.05);color:${cfg.color};font-size:10px;padding:1px 7px;border-radius:5px;flex-shrink:0;">${cfg.label}</span>
    </div>`
  }).join('')
  document.getElementById('tag-folder-header')?.scrollIntoView({ behavior:'smooth', block:'start' })
}

// ═══════════════════════════════════════════════════════════
// PULSO SEMANAL + HÁBITOS — Sprint 13
// ═══════════════════════════════════════════════════════════

// ── Pulso Semanal ──────────────────────────────────────────
function renderSemaforoCuentas() {
  const el = document.getElementById('semaforo-cuentas')
  if (!el) return
  const accounts = allNodes.filter(n => n.type === 'account')
  if (!accounts.length) { el.innerHTML = ''; return }

  const allTxs = allNodes.filter(n => n.type === 'income' || n.type === 'expense')
  const cards = accounts.map(a => {
    const inc  = allTxs.filter(n => n.type === 'income'  && n.metadata?.account_id === a.id).reduce((s,n) => s+(n.metadata?.amount||0), 0)
    const exp  = allTxs.filter(n => n.type === 'expense' && n.metadata?.account_id === a.id).reduce((s,n) => s+(n.metadata?.amount||0), 0)
    const bal  = (a.metadata?.balance || 0) + inc - exp
    const clr  = a.metadata?.color || '#4ade80'
    const neg  = bal < 0
    const icon = neg ? '🔴' : bal === 0 ? '⚪' : '🟢'
    return { a, bal, clr, neg, icon, inc, exp }
  })

  const totalNet = cards.reduce((s, c) => s + c.bal, 0)
  const anyNeg   = cards.some(c => c.neg)

  el.innerHTML = `
    <div style="background:rgba(255,255,255,0.02);border:1px solid ${anyNeg?'rgba(248,113,113,0.25)':'rgba(255,255,255,0.06)'};border-radius:14px;padding:12px 16px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:0.08em;flex-shrink:0;">💳 CUENTAS</span>
        ${cards.map(({a, bal, clr, neg, icon}) => `
          <div onclick="switchView('finance');setTimeout(()=>setActiveAccount('${a.id}'),200)"
               style="display:flex;align-items:center;gap:6px;background:${neg?'rgba(248,113,113,0.08)':clr+'11'};border:1px solid ${neg?'rgba(248,113,113,0.3)':clr+'33'};border-radius:8px;padding:5px 10px;cursor:pointer;transition:all 0.15s;"
               title="Ver en Bio-Finanzas">
            <span style="font-size:11px;">${icon}</span>
            <span style="font-size:11px;color:var(--text-primary);font-weight:600;">${esc(a.metadata?.label||a.content)}</span>
            <span style="font-size:11px;font-family:monospace;font-weight:800;color:${neg?'#f87171':clr};">${neg?'-':''}$${Math.abs(bal).toLocaleString('es-MX',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
          </div>`).join('')}
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-size:10px;color:var(--text-muted);">NETO</span>
          <span style="font-size:13px;font-family:monospace;font-weight:800;color:${totalNet<0?'#f87171':'#4ade80'};">${totalNet<0?'-':''}$${Math.abs(totalNet).toLocaleString('es-MX',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
        </div>
      </div>
    </div>`
}

function renderPulsoSemanal() {
  const el = document.getElementById('pulso-semanal')
  if (!el) return

  const now   = new Date()
  const wkStart = new Date(now); wkStart.setDate(now.getDate() - now.getDay())
  wkStart.setHours(0,0,0,0)
  const wkPrev  = new Date(wkStart); wkPrev.setDate(wkPrev.getDate()-7)
  const wkStartStr = wkStart.toISOString().slice(0,10)
  const wkPrevStr  = wkPrev.toISOString().slice(0,10)

  const inWeek = n => { const d=(n.metadata?.date||n.created_at?.slice(0,10)||''); return d >= wkStartStr }
  const inPrev = n => { const d=(n.metadata?.date||n.created_at?.slice(0,10)||''); return d >= wkPrevStr && d < wkStartStr }

  // KPIs esta semana
  const txThis  = allNodes.filter(n=>(n.type==='income'||n.type==='expense') && inWeek(n))
  const txPrev  = allNodes.filter(n=>(n.type==='income'||n.type==='expense') && inPrev(n))
  const gThis   = txThis.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const gPrev   = txPrev.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const iThis   = txThis.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const tasksOpen  = allNodes.filter(n=>n.type==='kanban'&&n.metadata?.status!=='done').length
  const tasksDone  = allNodes.filter(n=>n.type==='kanban'&&n.metadata?.status==='done'&& inWeek(n)).length
  const notesWk    = allNodes.filter(n=>(n.type==='note'||n.type==='proyecto')&&inWeek(n)).length

  // Eventos próximos 7 días
  const next7 = new Date(now); next7.setDate(now.getDate()+7)
  const upcoming = allNodes.filter(n => {
    if (!n.metadata?.date) return false
    const d = new Date(n.metadata.date)
    return d >= now && d <= next7
  }).sort((a,b)=>new Date(a.metadata.date)-new Date(b.metadata.date)).slice(0,3)

  // Gasto delta
  const gastoDelta = gThis - gPrev
  const gastoDeltaColor = gastoDelta <= 0 ? '#4ade80' : '#f87171'
  const gastoDeltaStr = (gastoDelta>=0?'+':'')+`$${Math.abs(gastoDelta).toLocaleString('es-MX')}`

  // Día de la semana
  const diasEs = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const weekDay = diasEs[now.getDay()]
  const dateStr = now.toLocaleDateString('es-MX',{day:'numeric',month:'long'})

  el.style.display = 'block'
  el.innerHTML = `
  <div class="pulso-card">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
      <div>
        <div style="font-size:11px; color:var(--accent-cyan); font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">⚡ Pulso Semanal</div>
        <div style="font-size:14px; color:#fff; font-weight:600; margin-top:2px;">${weekDay} ${dateStr}</div>
      </div>
      <button onclick="document.getElementById('pulso-semanal').style.display='none'" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px;padding:4px 8px;">✕</button>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:16px;">
      <div class="pulso-kpi">
        <span class="pulso-kpi-val" style="color:#f87171;">\$${gThis.toLocaleString('es-MX')}</span>
        <span class="pulso-kpi-lbl">Gasto semana</span>
        <span style="font-size:10px; color:${gastoDeltaColor}; margin-top:2px;">${gastoDeltaStr} vs anterior</span>
      </div>
      <div class="pulso-kpi">
        <span class="pulso-kpi-val" style="color:#4ade80;">\$${iThis.toLocaleString('es-MX')}</span>
        <span class="pulso-kpi-lbl">Ingresos semana</span>
      </div>
      <div class="pulso-kpi">
        <span class="pulso-kpi-val" style="color:#60a5fa;">${tasksOpen}</span>
        <span class="pulso-kpi-lbl">Tareas abiertas</span>
        ${tasksDone ? `<span style="font-size:10px;color:#4ade80;margin-top:2px;">${tasksDone} cerradas hoy</span>` : ''}
      </div>
      <div class="pulso-kpi">
        <span class="pulso-kpi-val" style="color:#a855f7;">${notesWk}</span>
        <span class="pulso-kpi-lbl">Notas esta semana</span>
      </div>
    </div>
    ${upcoming.length ? `
    <div style="margin-top:4px;">
      <div style="font-size:10px; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">📅 Próximos 7 días</div>
      ${upcoming.map(n => {
        const d = new Date(n.metadata.date)
        const label = n.metadata?.title || n.metadata?.label || n.content
        const days = Math.ceil((d - now) / 86400000)
        return `<div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
          <span style="font-size:11px; background:rgba(0,246,255,0.1); color:var(--accent-cyan); padding:2px 8px; border-radius:5px; flex-shrink:0;">${days===0?'hoy':days===1?'mañana':'en '+days+'d'}</span>
          <span style="font-size:13px; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(label)}</span>
        </div>`
      }).join('')}
    </div>` : ''}
  </div>`
}

// ── Hábitos ────────────────────────────────────────────────

function computeHabitStreaks() {
  // Todos los nodos que tienen etiqueta #hábito o is_habit:true (parser v2)
  const habitNodes = allNodes.filter(n => {
    if (n.metadata?.is_habit === true) return true
    const tags = (n.metadata?.tags||[]).map(t=>t.replace(/^#/,'').toLowerCase())
    return tags.includes('hábito') || tags.includes('habito')
  })

  // Extraer nombres de hábito (otras etiquetas además de #hábito, o habit_name del parser v2)
  const habitNames = new Set()
  habitNodes.forEach(n => {
    if (n.metadata?.is_habit && n.metadata?.habit_name) {
      habitNames.add(n.metadata.habit_name.toLowerCase().replace(/\s+/g, '_'))
    }
    ;(n.metadata?.tags||[]).forEach(t => {
      const clean = t.replace(/^#/,'').toLowerCase()
      if (clean !== 'hábito' && clean !== 'habito') habitNames.add(clean)
    })
  })

  // Por cada hábito, calcular: días con registro, racha actual, días desde último
  const habits = []
  habitNames.forEach(name => {
    const myNodes = habitNodes.filter(n => {
      const tagMatch = (n.metadata?.tags||[]).map(t=>t.replace(/^#/,'').toLowerCase()).includes(name)
      const v2Match = n.metadata?.is_habit && n.metadata?.habit_name &&
        n.metadata.habit_name.toLowerCase().replace(/\s+/g,'_') === name
      return tagMatch || v2Match
    })
    // Build set of dates (parser v2 stores habit_date; legacy uses metadata.date)
    const datesSet = new Set(
      myNodes.map(n => n.metadata?.habit_date || n.metadata?.date || n.created_at?.slice(0,10)).filter(Boolean)
    )
    const today = new Date().toISOString().slice(0,10)
    const sortedDates = [...datesSet].sort()
    const lastDate = sortedDates[sortedDates.length-1] || ''
    const daysSince = lastDate
      ? Math.floor((new Date(today) - new Date(lastDate)) / 86400000)
      : null

    // Streak: count consecutive days ending today or yesterday
    let streak = 0
    let check = new Date()
    if (lastDate && lastDate < today) check = new Date(lastDate)
    for (let i = 0; i < 366; i++) {
      const dStr = check.toISOString().slice(0,10)
      if (datesSet.has(dStr)) { streak++; check.setDate(check.getDate()-1) }
      else break
    }

    // Last 14 days dots
    const dots = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i)
      dots.push(datesSet.has(d.toISOString().slice(0,10)))
    }

    habits.push({ name, total: datesSet.size, streak, daysSince, dots, lastDate })
  })

  return habits.sort((a,b) => b.streak - a.streak)
}

window.renderHabitosSection = function() {
  const root = document.getElementById('habitos-root')
  if (!root) return
  const habits = computeHabitStreaks()
  if (!habits.length) {
    root.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">
      Añade <code style="color:#4ade80;">#hábito</code> junto con otro tag para trackear rachas.<br>
      Ej: <code>Fui al gym #hábito #gimnasio</code> en la barra de comandos.</div>`
    return
  }
  root.innerHTML = habits.map(h => {
    const streakColor = h.streak >= 7 ? '#4ade80' : h.streak >= 3 ? '#fbbf24' : '#f87171'
    const absent = h.daysSince !== null && h.daysSince > 1
    const absentBadge = absent ? `<span style="font-size:10px;background:rgba(248,113,113,0.12);color:#f87171;padding:1px 7px;border-radius:5px;flex-shrink:0;">${h.daysSince}d ausente</span>` : ''
    const dots = h.dots.map(active =>
      `<div class="habit-dot" style="background:${active?'#4ade80':'rgba(255,255,255,0.08)'}; ${active?'box-shadow:0 0 4px rgba(74,222,128,0.4)':''}"></div>`
    ).join('')
    return `<div class="habit-row">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:13px;color:#a855f7;font-weight:700;">#${h.name}</span>
          <span style="font-size:12px;color:${streakColor};font-weight:800;">${h.streak} 🔥</span>
          ${absentBadge}
        </div>
        <div class="habit-dots">${dots}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">últimas 14 días · ${h.total} registros totales · último: ${h.lastDate||'—'}</div>
      </div>
    </div>`
  }).join('')
}

// ── Alertas Contextuales de Hábitos ────────────────────────
function checkHabitAlerts() {
  const el = document.getElementById('habit-alerts')
  if (!el) return
  const habits = computeHabitStreaks()
  const absent = habits.filter(h => h.daysSince !== null && h.daysSince >= 3)
  if (!absent.length) { el.style.display = 'none'; return }
  el.style.display = 'block'
  el.innerHTML = absent.map(h => `
    <div class="habit-alert-item">
      <span style="font-size:18px;flex-shrink:0;">⚠️</span>
      <span>Llevas <b>${h.daysSince} días</b> sin un nodo <span style="color:#a855f7;font-weight:700;">#${h.name}</span></span>
      <button onclick="injectHabitTag('${h.name}')" style="margin-left:auto;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.25);color:#fbbf24;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:12px;flex-shrink:0;">+ Registrar</button>
    </div>`).join('')
}

window.injectHabitTag = function(tag) {
  const inp = document.getElementById('nexus-input')
  if (inp) {
    inp.value = `#hábito #${tag} `
    inp.focus()
  }
}

// ═══════════════════════════════════════════════════════════
// ARQUITECTURA RELACIONAL — Sprint 14
// ═══════════════════════════════════════════════════════════

// ── Render Connections in Card Modal ───────────────────────
function renderCardConnections(nodeId) {
  const root = document.getElementById('tm-links-root')
  if (!root) return
  const node = allNodes.find(n => n.id === nodeId)
  if (!node) { root.innerHTML = ''; return }
  const links = node.metadata?.linkedTo || []
  if (!links.length) { root.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:4px 0;">Sin conexiones aún.</div>'; return }
  root.innerHTML = links.map(lid => {
    const linked = allNodes.find(n => n.id === lid)
    if (!linked) return ''
    const cfg = TYPE_LABELS[linked.type] || { icon:'💡', label:'Nodo', color:'#94a3b8' }
    const label = linked.metadata?.label || linked.content || '(sin título)'
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:8px;">
      <span style="font-size:14px;flex-shrink:0;">${cfg.icon}</span>
      <span style="font-size:12px;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</span>
      <span style="font-size:10px;color:${cfg.color};background:${cfg.color}18;padding:1px 6px;border-radius:4px;flex-shrink:0;">${cfg.label}</span>
      <button onclick="unlinkNode('${nodeId}','${lid}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:0 2px;line-height:1;" title="Desvincular">✕</button>
    </div>`
  }).filter(Boolean).join('')
}

window.toggleLinkSearch = function() {
  const box = document.getElementById('tm-link-search-box')
  if (!box) return
  const visible = box.style.display !== 'none'
  box.style.display = visible ? 'none' : 'block'
  if (!visible) document.getElementById('tm-link-search-inp')?.focus()
}

let linkSearchTimer = null
window.handleLinkSearch = function() {
  clearTimeout(linkSearchTimer)
  linkSearchTimer = setTimeout(() => {
    const q = document.getElementById('tm-link-search-inp')?.value?.trim().toLowerCase()
    const resultsEl = document.getElementById('tm-link-search-results')
    if (!resultsEl || !editingCardId) return
    const current = allNodes.find(n => n.id === editingCardId)
    const alreadyLinked = new Set([editingCardId, ...(current?.metadata?.linkedTo || [])])
    const matches = allNodes
      .filter(n => !alreadyLinked.has(n.id))
      .filter(n => {
        if (!q) return true
        return (n.metadata?.label || n.content || '').toLowerCase().includes(q) ||
          (n.metadata?.tags || []).join(' ').toLowerCase().includes(q)
      })
      .slice(0, 8)
    if (!matches.length) {
      resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text-muted);">Sin resultados.</div>'
      return
    }
    resultsEl.innerHTML = matches.map(n => {
      const cfg = TYPE_LABELS[n.type] || { icon:'💡', label:'Nodo', color:'#94a3b8' }
      const label = n.metadata?.label || n.content || '(sin título)'
      return `<div onclick="linkNodeTo('${editingCardId}','${n.id}')" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background 0.1s;" onmouseover="this.style.background='rgba(0,246,255,0.06)'" onmouseout="this.style.background=''">
        <span style="font-size:14px;">${cfg.icon}</span>
        <span style="font-size:13px;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</span>
        <span style="font-size:10px;color:${cfg.color};flex-shrink:0;">${cfg.label}</span>
      </div>`
    }).join('')
  }, 150)
}

window.linkNodeTo = async function(sourceId, targetId) {
  const source = allNodes.find(n => n.id === sourceId)
  if (!source) return
  if (!source.metadata) source.metadata = {}
  if (!source.metadata.linkedTo) source.metadata.linkedTo = []
  if (!source.metadata.linkedTo.includes(targetId)) {
    source.metadata.linkedTo.push(targetId)
    await updateNodeMetadata(sourceId, source.metadata)
  }
  // Close search
  const box = document.getElementById('tm-link-search-box')
  if (box) { box.style.display = 'none'; const inp = document.getElementById('tm-link-search-inp'); if (inp) inp.value = '' }
  renderCardConnections(sourceId)
  showToast('Nodo vinculado ✓')
}

window.unlinkNode = async function(sourceId, targetId) {
  const source = allNodes.find(n => n.id === sourceId)
  if (!source?.metadata?.linkedTo) return
  source.metadata.linkedTo = source.metadata.linkedTo.filter(id => id !== targetId)
  await updateNodeMetadata(sourceId, source.metadata)
  renderCardConnections(sourceId)
  showToast('Vínculo eliminado')
}

// ── Project Unified View ────────────────────────────────────
window.openProjectView = function(nodeId) {
  const node = allNodes.find(n => n.id === nodeId)
  if (!node) return
  const modal = document.getElementById('project-view-modal')
  if (!modal) return

  const label = node.metadata?.label || node.content
  const tags  = (node.metadata?.tags || []).map(t => t.replace(/^#/,'').toLowerCase())

  document.getElementById('pv-title').textContent = label
  document.getElementById('pv-tags').textContent = tags.map(t=>'#'+t).join(' ')
  modal.style.display = 'flex'

  // Aggregate: nodes with explicit links OR sharing at least one tag
  const linked = new Set(node.metadata?.linkedTo || [])
  const related = allNodes.filter(n => {
    if (n.id === nodeId) return false
    if (linked.has(n.id)) return true
    const nTags = (n.metadata?.tags || []).map(t => t.replace(/^#/,'').toLowerCase())
    return tags.some(t => nTags.includes(t))
  })

  // Budget & rol header
  const budget   = node.metadata?.budget || 0
  const rol      = node.metadata?.rol || ''
  const totalExp = related.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const totalInc = related.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const pct      = budget > 0 ? Math.min(100, Math.round(totalExp/budget*100)) : 0
  const gaugeColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#fb923c' : '#4ade80'

  const budgetHtml = budget > 0 ? `
    <div style="grid-column:1/-1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px;margin-bottom:2px;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        ${rol ? `<span style="font-size:11px;background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;border-radius:6px;padding:3px 10px;">${ROL_LABEL[rol]||rol}</span>` : ''}
        <div style="flex:1;min-width:200px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:11px;color:var(--text-muted);font-weight:700;">PRESUPUESTO</span>
            <span style="font-size:11px;font-family:monospace;color:${gaugeColor};font-weight:700;">${pct}% — $${totalExp.toLocaleString('es-MX')} / $${budget.toLocaleString('es-MX')}</span>
          </div>
          <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${gaugeColor};border-radius:6px;transition:width 0.4s;"></div>
          </div>
        </div>
        ${totalInc > 0 ? `<span style="font-size:12px;color:#4ade80;font-weight:700;font-family:monospace;">+$${totalInc.toLocaleString('es-MX')} ingresado</span>` : ''}
        <button onclick="openProyectoModal('${nodeId}')" style="background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;border-radius:8px;padding:5px 12px;font-size:11px;cursor:pointer;font-weight:600;">✏️ Editar</button>
      </div>
    </div>` : `
    <div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;padding:8px 4px;">
      <span style="font-size:11px;color:var(--text-dim);">${rol ? ROL_LABEL[rol]||rol : 'Sin presupuesto asignado'}</span>
      <button onclick="openProyectoModal('${nodeId}')" style="background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.3);color:#2dd4bf;border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600;">+ Presupuesto / Rol</button>
    </div>`

  // Group by type
  const groups = {
    cotizacion: { label:'📄 Cotizaciones', color:'#fb923c', nodes:[] },
    kanban:     { label:'📌 Tareas',       color:'#a78bfa', nodes:[] },
    expense:    { label:'💸 Gastos',       color:'#f87171', nodes:[] },
    income:     { label:'💰 Ingresos',     color:'#4ade80', nodes:[] },
    contact:    { label:'👤 Contactos',    color:'#fbbf24', nodes:[] },
    note:       { label:'💡 Notas',        color:'#94a3b8', nodes:[] },
    other:      { label:'📦 Otros',        color:'#60a5fa', nodes:[] },
  }
  related.forEach(n => {
    const k = groups[n.type] ? n.type : 'other'
    groups[k].nodes.push(n)
  })

  const body = document.getElementById('pv-body')
  const nonEmpty = Object.values(groups).filter(g => g.nodes.length)
  if (!nonEmpty.length) {
    body.innerHTML = budgetHtml + `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px;font-size:14px;">
      Sin nodos relacionados aún.<br>Comparte etiquetas con otros nodos o vincúlalos desde el modal de tarea.
    </div>`
  } else {
    body.innerHTML = budgetHtml + nonEmpty.map(g => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px;min-width:0;">
        <div style="font-size:12px;font-weight:700;color:${g.color};text-transform:uppercase;letter-spacing:0.07em;margin-bottom:12px;">${g.label} (${g.nodes.length})</div>
        ${g.nodes.slice(0,8).map(n => {
          const lbl = n.metadata?.label || n.content || '(sin título)'
          const amtRaw = n.metadata?.amount
          const isCot = n.type === 'cotizacion'
          const st = isCot ? (COT_STATUS[n.metadata?.status] || COT_STATUS.pendiente) : null
          const amtStr = amtRaw ? `<span style="color:${g.color};font-weight:700;font-size:12px;margin-left:4px;">${n.type==='income'?'+':'-'}$${(+amtRaw).toLocaleString('es-MX')}</span>` : ''
          const cotAmt = isCot && amtRaw ? `<span style="color:#fb923c;font-weight:700;font-size:12px;font-family:monospace;">$${(+amtRaw).toLocaleString('es-MX')}</span>` : ''
          const stBadge = st ? `<span style="font-size:9px;background:${st.color}22;color:${st.color};border-radius:4px;padding:1px 6px;font-weight:700;">${st.label}</span>` : ''
          const quickAcc = isCot && n.metadata?.status !== 'aceptada' ? `<span onclick="event.stopPropagation();changeCotizacionStatus('${n.id}','aceptada')" style="color:#4ade80;cursor:pointer;font-size:13px;padding:2px 4px;" title="Aceptar">✅</span>` : ''
          const date = n.metadata?.date || (n.created_at ? n.created_at.slice(0,10) : '')
          return `<div style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="closeProjectView();setTimeout(()=>${isCot?`openCotizacionModal('${n.id}')`:`openCardModal('${n.id}')`},100)">
            <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(lbl)}</span>
            ${isCot ? cotAmt + stBadge + quickAcc : amtStr}
            ${date ? `<span style="font-size:10px;color:var(--text-dim);flex-shrink:0;">${date}</span>` : ''}
          </div>`
        }).join('')}
        ${g.nodes.length > 8 ? `<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">+${g.nodes.length-8} más</div>` : ''}
      </div>`).join('')
  }
}

window.closeProjectView = function() {
  const modal = document.getElementById('project-view-modal')
  if (modal) modal.style.display = 'none'
}

// ═══════════════════════════════════════════════════════════
// PAGO ASISTIDO — Phase 3D
// ═══════════════════════════════════════════════════════════

let paymentContactId = null
let paymentRating    = 0
let paySplitCount    = 0

window.openPaymentModal = (contactId, serviceId = null, projectTag = '') => {
  paymentContactId = contactId
  paymentRating    = 0
  paySplitCount    = 0

  const contact = allNodes.find(n => n.id === contactId)
  if (!contact) return
  const m = contact.metadata || {}

  // Proveedor info header
  const clr = m.color || '#fb923c'
  document.getElementById('pay-provider-info').innerHTML = `
    <div style="width:38px;height:38px;border-radius:50%;background:${clr}20;color:${clr};display:grid;place-items:center;font-size:18px;font-weight:800;flex-shrink:0;">${contactInitials(m.name||contact.content)}</div>
    <div>
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${esc(m.name||contact.content)}</div>
      <div style="font-size:11px;color:var(--text-muted);">${esc(m.specialty||'Proveedor')}</div>
    </div>`

  // Populate services
  const services = m.services || []
  const sel = document.getElementById('pay-service')
  sel.innerHTML = `<option value="">Sin servicio específico</option>` +
    services.map(s => `<option value="${s.id}" data-price="${s.price}" ${s.id===serviceId?'selected':''}>
      ${esc(s.name)} — $${(+s.price||0).toLocaleString('es-MX')}/${esc(s.unit||'servicio')}
    </option>`).join('')

  // Pre-fill amount from service price if pre-selected
  const selSvc = services.find(s => s.id === serviceId)
  document.getElementById('pay-total').value = selSvc?.price || ''

  // Reset fields (project-tag pre-filled if coming from anticipo)
  document.getElementById('pay-project-tag').value   = projectTag || ''
  document.getElementById('pay-quality-note').value  = ''
  document.querySelectorAll('#pay-stars [data-star]').forEach(s => s.style.opacity = '0.3')
  // Auto-select expense_type: proveedores → servicio, others → material
  const typeEl = document.getElementById('pay-expense-type')
  if (typeEl) typeEl.value = (contact.metadata?.cType === 'proveedor') ? 'servicio' : 'material'

  // Initial split row
  document.getElementById('pay-splits-container').innerHTML = ''
  document.getElementById('pay-split-warn').style.display = 'none'
  addPaySplit()

  document.getElementById('payment-modal').classList.remove('hidden')
}

window.closePaymentModal = () => document.getElementById('payment-modal').classList.add('hidden')

window.payServiceChange = () => {
  const opt = document.getElementById('pay-service').selectedOptions[0]
  const price = opt?.dataset?.price
  if (price) document.getElementById('pay-total').value = price
  paySyncTotal()
}

window.addPaySplit = () => {
  paySplitCount++
  const idx = paySplitCount
  const contact = allNodes.find(n => n.id === paymentContactId)
  const contactAccounts = contact?.metadata?.contact_accounts || []

  const accountOpts = contactAccounts.map(a =>
    `<option value="${a.id}" data-name="${esc(a.name)}">${esc(a.name)}${a.clabe?' — '+a.clabe.slice(-4):''}${a.handle?' — '+a.handle:''}</option>`
  ).join('')

  const row = document.createElement('div')
  row.id = `pay-split-${idx}`
  row.style.cssText = 'display:grid;grid-template-columns:90px 120px 1fr auto;gap:8px;align-items:center;margin-bottom:8px;'
  row.innerHTML = `
    <input  type="number" placeholder="$0" min="0" step="0.01"
            class="modal-input" style="padding:7px 10px;font-size:13px;font-family:monospace;"
            id="split-amt-${idx}" oninput="paySyncTotal()" />
    <select class="modal-input" style="padding:7px 10px;font-size:12px;" id="split-method-${idx}" onchange="splitMethodChange(${idx})">
      <option value="efectivo">💵 Efectivo</option>
      <option value="transferencia">📲 Transferencia</option>
      <option value="tarjeta">💳 Tarjeta</option>
      <option value="cripto">🪙 Cripto</option>
    </select>
    <div id="split-dest-${idx}" style="display:flex;gap:6px;align-items:center;">
      <select class="modal-input" style="padding:7px 10px;font-size:12px;flex:1;" id="split-acc-${idx}" onchange="splitAccChange(${idx})">
        <option value="">En mano / sin cuenta</option>
        ${accountOpts}
        <option value="__new__">+ Nueva cuenta...</option>
      </select>
    </div>
    <button onclick="removePaySplit(${idx})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:16px;padding:4px 6px;" title="Quitar">✕</button>`
  document.getElementById('pay-splits-container').appendChild(row)
  // Efectivo default → hide account selector
  splitMethodChange(idx)
}

window.removePaySplit = (idx) => {
  document.getElementById(`pay-split-${idx}`)?.remove()
  paySyncTotal()
}

window.splitMethodChange = (idx) => {
  const method = document.getElementById(`split-method-${idx}`)?.value
  const dest   = document.getElementById(`split-dest-${idx}`)
  if (!dest) return
  if (method === 'efectivo') {
    dest.innerHTML = '<span style="font-size:12px;color:var(--text-dim);padding:0 4px;">En mano</span>'
  } else {
    const contact = allNodes.find(n => n.id === paymentContactId)
    const cas = contact?.metadata?.contact_accounts || []
    const opts = cas.map(a => `<option value="${a.id}">${esc(a.name)}${a.clabe?' — '+a.clabe.slice(-4):''}${a.handle?' — '+a.handle:''}</option>`).join('')
    dest.innerHTML = `<select class="modal-input" style="padding:7px 10px;font-size:12px;flex:1;" id="split-acc-${idx}" onchange="splitAccChange(${idx})">
      <option value="">Sin especificar cuenta</option>${opts}<option value="__new__">+ Nueva cuenta...</option></select>`
  }
}

window.splitAccChange = (idx) => {
  const acc = document.getElementById(`split-acc-${idx}`)
  if (acc?.value === '__new__') {
    acc.value = ''
    closePaymentModal()
    openContactAccountModal(paymentContactId)
  }
}

window.paySyncTotal = () => {
  const total = parseFloat(document.getElementById('pay-total')?.value) || 0
  const rows  = document.querySelectorAll('#pay-splits-container > div[id^="pay-split-"]')
  let sum = 0
  rows.forEach(row => {
    const idx = row.id.replace('pay-split-','')
    sum += parseFloat(document.getElementById(`split-amt-${idx}`)?.value) || 0
  })
  const warn = document.getElementById('pay-split-warn')
  if (warn) warn.style.display = (total > 0 && rows.length > 1 && Math.abs(sum - total) > 0.01) ? '' : 'none'
}

window.setPayRating = (n) => {
  paymentRating = n
  document.querySelectorAll('#pay-stars [data-star]').forEach(s => {
    s.style.opacity = parseInt(s.dataset.star) <= n ? '1' : '0.25'
  })
}

window.savePayment = async () => {
  const contact = allNodes.find(n => n.id === paymentContactId)
  if (!contact) return
  const m = contact.metadata || {}

  const total      = parseFloat(document.getElementById('pay-total').value) || 0
  const selSvcId   = document.getElementById('pay-service').value
  const selSvc     = (m.services||[]).find(s => s.id === selSvcId)
  const projTag    = document.getElementById('pay-project-tag').value.trim().toLowerCase()
  const qualNote   = document.getElementById('pay-quality-note').value.trim()

  // Build splits
  const rows   = document.querySelectorAll('#pay-splits-container > div[id^="pay-split-"]')
  const splits = []
  rows.forEach(row => {
    const idx    = row.id.replace('pay-split-','')
    const amt    = parseFloat(document.getElementById(`split-amt-${idx}`)?.value) || 0
    const method = document.getElementById(`split-method-${idx}`)?.value || 'efectivo'
    const accEl  = document.getElementById(`split-acc-${idx}`)
    const accId  = accEl?.value || ''
    const accObj = (m.contact_accounts||[]).find(a => a.id === accId)
    splits.push({ amount: amt, method, account_id: accId||undefined, account_name: accObj?.name || (method==='efectivo'?'Efectivo':'Sin especificar') })
  })

  // expense_type: read from selector, auto-detect if not overridden
  let expenseType = document.getElementById('pay-expense-type')?.value || 'servicio'
  // Auto-detect: if no service linked and no proveedor cType, guess material
  if (!selSvcId && contact.metadata?.cType !== 'proveedor') expenseType = 'material'

  const tags = ['#gasto']
  if (projTag) tags.push('#' + projTag)
  if (expenseType) tags.push('#' + expenseType)

  const label = [selSvc?.name||'Pago', m.name||contact.content, projTag].filter(Boolean).join(' — ')
  const meta = {
    label, amount: total,
    contact_id:      paymentContactId,
    service_id:      selSvcId || undefined,
    service_name:    selSvc?.name || undefined,
    project_tag:     projTag || undefined,
    expense_type:    expenseType,
    splits:          splits.length ? splits : undefined,
    quality_note:    qualNote || undefined,
    quality_rating:  paymentRating || undefined,
    tags,
  }

  let savedPayId = null
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    savedPayId = 'pay_'+Date.now()
    allNodes.unshift({ id: savedPayId, type:'expense', content:label, metadata:meta, created_at:new Date().toISOString() })
  } else {
    const { data } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'expense', content:label, metadata:meta }).select()
    if (data?.[0]) { allNodes.unshift(data[0]); savedPayId = data[0].id }
  }
  if (savedPayId && projTag) await autoLinkToProject(savedPayId, projTag)
  closePaymentModal()
  renderAll()
  showToast(`Pago de $${total.toLocaleString('es-MX')} registrado`)
}

// ═══════════════════════════════════════════════════════════
// CATEGORY PICKER — Estandarización de categorías (Sprint 5A)
// ═══════════════════════════════════════════════════════════

window.openCategoryPicker = () => {
  document.getElementById('cat-picker-search').value = ''
  filterCategoryPicker('')
  document.getElementById('category-picker-modal').classList.remove('hidden')
}
window.closeCategoryPicker = () => document.getElementById('category-picker-modal').classList.add('hidden')

window.selectCategory = (cat) => {
  cat = (cat||'').trim()
  if (!cat) return
  document.getElementById('cot-category').value = cat
  document.getElementById('cot-category-text').textContent = cat
  document.getElementById('cot-category-text').style.color = 'var(--text-primary)'
  closeCategoryPicker()
}

window.filterCategoryPicker = (q = '') => {
  const body = document.getElementById('cat-picker-body')
  const ql = q.toLowerCase()
  const current = document.getElementById('cot-category').value
  body.innerHTML = CATEGORIAS_TRABAJO.map(grupo => {
    const items = grupo.items.filter(i => !ql || i.toLowerCase().includes(ql))
    if (!items.length) return ''
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:7px;letter-spacing:0.06em;">${esc(grupo.grupo)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${items.map(item => {
            const sel = item === current
            return `<button onclick="selectCategory('${esc(item)}')"
              style="font-size:12px;padding:4px 12px;border-radius:20px;cursor:pointer;transition:all 0.15s;
                     background:${sel?'rgba(96,165,250,0.2)':'rgba(255,255,255,0.05)'};
                     border:1px solid ${sel?'rgba(96,165,250,0.5)':'rgba(255,255,255,0.1)'};
                     color:${sel?'#60a5fa':'var(--text-primary)'};font-weight:${sel?'700':'400'};">
              ${esc(item)}
            </button>`
          }).join('')}
        </div>
      </div>`
  }).join('')
}

// ═══════════════════════════════════════════════════════════
// PROVEEDOR PICKER — "Contratar sin cotización" (Sprint 4C)
// ═══════════════════════════════════════════════════════════

window.openProveedorPicker = (projectTag = '') => {
  document.getElementById('prov-picker-project-tag').value = projectTag
  document.getElementById('prov-picker-search').value = ''
  filterProveedorPicker('')
  document.getElementById('proveedor-picker-modal').classList.remove('hidden')
}

window.closeProveedorPicker = () => document.getElementById('proveedor-picker-modal').classList.add('hidden')

window.filterProveedorPicker = (q = '') => {
  // getContacts() covers BOTH 'contact' and 'persona' types (old + new model)
  // Show anyone with role 'proveedor' OR cType 'proveedor' — or ALL contacts if no role filter needed
  const provs = getContacts().filter(n => {
    const m = n.metadata || {}
    // New model: has roles[] — include if any role includes proveedor OR if they have ANY role (contacts are eligible)
    if (Array.isArray(m.roles) && m.roles.length > 0) return true
    // Old model: cType === proveedor
    if (m.cType === 'proveedor') return true
    // Legacy: persona type nodes
    if (n.type === 'persona') return true
    return false
  })
  const lq = q.toLowerCase().trim()
  const filtered = !lq ? provs : provs.filter(p => {
    const name = (p.metadata?.name || p.content || '').toLowerCase()
    const spec = (p.metadata?.specialties || [p.metadata?.specialty] || []).join(' ').toLowerCase()
    const city = (p.metadata?.city || '').toLowerCase()
    return name.includes(lq) || spec.includes(lq) || city.includes(lq) ||
      [...lq].every(ch => name.includes(ch))
  })
  const list = document.getElementById('prov-picker-list')
  const projTag = document.getElementById('prov-picker-project-tag').value
  if (!filtered.length) {
    list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Sin resultados para "${esc(q)}"</div>`
    return
  }
  list.innerHTML = filtered.map(p => {
    const m = p.metadata || {}
    const name = esc(m.name || p.content)
    const specs = Array.isArray(m.specialties) ? m.specialties.join(', ') : (m.specialty || '')
    const clr = m.color || '#fb923c'
    const initials = name.slice(0,2).toUpperCase()
    const roles = (m.roles||[]).join(', ') || m.cType || ''
    return `<div onclick="closeProveedorPicker();openPaymentModal('${p.id}',null,'${projTag}')"
               style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;
                      background:rgba(255,255,255,0.04);cursor:pointer;transition:background 0.15s;margin-bottom:4px;"
               onmouseenter="this.style.background='rgba(255,255,255,0.08)'"
               onmouseleave="this.style.background='rgba(255,255,255,0.04)'">
      <div style="width:36px;height:36px;border-radius:50%;background:${clr}25;color:${clr};
                  display:grid;place-items:center;font-size:13px;font-weight:800;flex-shrink:0;">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${name}</div>
        ${specs ? `<div style="font-size:11px;color:${clr};font-weight:600;">${esc(specs)}</div>` : ''}
        ${roles ? `<div style="font-size:10px;color:var(--text-dim);">${esc(roles)}</div>` : ''}
      </div>
      <span style="font-size:12px;color:var(--text-muted);">→</span>
    </div>`
  }).join('')
}

// ═══════════════════════════════════════════════════════════
// PROJECT MEMBERS — Sprint 5B
// ═══════════════════════════════════════════════════════════

let memberProjectId = null
let memberSelectedContactId = null

window.openMemberModal = (projectId) => {
  memberProjectId = projectId
  memberSelectedContactId = null
  document.getElementById('member-search').value = ''
  document.getElementById('member-search-results').innerHTML = ''
  document.getElementById('member-contact-id').value = ''
  document.getElementById('member-selected-name').style.display = 'none'
  document.getElementById('member-notes').value = ''
  // Render role picker
  const picker = document.getElementById('member-role-picker')
  picker.innerHTML = MIEMBRO_ROLES.map((r, i) => `
    <button onclick="selectMemberRole('${r.id}',this)"
      data-role="${r.id}"
      style="font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer;transition:all 0.15s;
             background:${i===2?'rgba(96,165,250,0.15)':'rgba(255,255,255,0.05)'};
             border:1px solid ${i===2?'rgba(96,165,250,0.4)':'rgba(255,255,255,0.1)'};
             color:${i===2?'#60a5fa':'var(--text-muted)'};font-weight:${i===2?'700':'400'};"
      title="${esc(r.desc)}">
      ${esc(r.label)}
    </button>`).join('')
  document.getElementById('member-role').value = 'ejecutor'
  document.getElementById('member-modal').classList.remove('hidden')
}

window.closeMemberModal = () => document.getElementById('member-modal').classList.add('hidden')

window.selectMemberRole = (roleId, btn) => {
  document.getElementById('member-role').value = roleId
  document.querySelectorAll('#member-role-picker button').forEach(b => {
    const sel = b.dataset.role === roleId
    b.style.background = sel ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.05)'
    b.style.border = `1px solid ${sel?'rgba(96,165,250,0.4)':'rgba(255,255,255,0.1)'}`
    b.style.color = sel ? '#60a5fa' : 'var(--text-muted)'
    b.style.fontWeight = sel ? '700' : '400'
  })
}

window.filterMemberSearch = (q = '') => {
  const res = document.getElementById('member-search-results')
  if (!q.trim()) { res.innerHTML = ''; return }
  const lq = q.toLowerCase()
  // Use getContacts() to cover both old (persona) and new (contact) types
  const contacts = getContacts().filter(c => {
    const name = (c.metadata?.name || c.content || '').toLowerCase()
    const spec = Array.isArray(c.metadata?.specialties)
      ? c.metadata.specialties.join(' ').toLowerCase()
      : (c.metadata?.specialty || '').toLowerCase()
    const city = (c.metadata?.city || '').toLowerCase()
    return name.includes(lq) || spec.includes(lq) || city.includes(lq)
  })
  if (!contacts.length) {
    res.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">Sin resultados para "<b>${esc(q)}</b>"<br><span style="font-size:11px;color:var(--text-dim);">Agrega el contacto primero desde la sección Contactos</span></div>`
    return
  }
  res.innerHTML = contacts.slice(0, 8).map(c => {
    const m = c.metadata || {}
    const name = esc(m.name || c.content)
    // Support both new model (roles[]) and old model (cType)
    const roleLabel = Array.isArray(m.roles) && m.roles.length
      ? m.roles.join(' · ')
      : (m.cType || 'contacto')
    const specs = Array.isArray(m.specialties) ? m.specialties.slice(0, 2).join(', ') : (m.specialty || '')
    const clr = m.color || (roleLabel.includes('proveedor') ? '#fb923c' : roleLabel.includes('cliente') ? '#4ade80' : '#60a5fa')
    const initials = (m.name || c.content || '?').slice(0, 2).toUpperCase()
    return `<div onclick="selectMemberContact('${c.id}','${name.replace(/'/g,"\\'")}')"
      style="padding:8px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);margin-bottom:2px;"
      onmouseenter="this.style.background='rgba(255,255,255,0.08)'"
      onmouseleave="this.style.background='rgba(255,255,255,0.04)'">
      <div style="width:32px;height:32px;border-radius:50%;background:${clr}25;color:${clr};display:grid;place-items:center;font-size:12px;font-weight:800;flex-shrink:0;">${initials}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
        <div style="font-size:10px;color:var(--text-muted);">${specs || roleLabel}</div>
      </div>
    </div>`
  }).join('')
}

window.selectMemberContact = (id, name) => {
  memberSelectedContactId = id
  document.getElementById('member-contact-id').value = id
  document.getElementById('member-search').value = ''
  document.getElementById('member-search-results').innerHTML = ''
  const sel = document.getElementById('member-selected-name')
  sel.textContent = '✓ ' + name
  sel.style.display = 'block'
}

window.saveMember = async () => {
  const contactId = document.getElementById('member-contact-id').value
  if (!contactId) { showToast('Selecciona un contacto primero'); return }
  const role  = document.getElementById('member-role').value
  const notes = document.getElementById('member-notes').value.trim()
  const project = allNodes.find(n => n.id === memberProjectId)
  if (!project) return
  const members = project.metadata.members || []
  members.push({ contact_id: contactId, role, notes: notes || undefined, added_at: new Date().toISOString() })
  project.metadata = { ...project.metadata, members }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata: project.metadata }).eq('id', memberProjectId)
  closeMemberModal()
  openProjectDashboard(memberProjectId)
  showToast('Miembro añadido al proyecto')
}

window.removeMember = async (projectId, contactId) => {
  if (!confirm('¿Quitar este miembro del proyecto?')) return
  const project = allNodes.find(n => n.id === projectId)
  if (!project) return
  project.metadata = { ...project.metadata, members: (project.metadata.members||[]).filter(m => m.contact_id !== contactId) }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata: project.metadata }).eq('id', projectId)
  openProjectDashboard(projectId)
  showToast('Miembro eliminado')
}

// ═══════════════════════════════════════════════════════════
// PROYECTOS — Vista Dedicada (Sprint 4B)
// ═══════════════════════════════════════════════════════════

window.backToProjects = function() {
  _projDashId = null
  _projDashTab = 'resumen'
  renderProyectos()
}

// Exposed to window so onclick="renderProyectos()" in dashboard back button works
window.renderProyectos = function renderProyectos() {
  const root = document.getElementById('proyectos-root')
  if (!root) return
  // Si hay un dashboard de proyecto abierto, mantenerlo (no regresar a la lista)
  if (_projDashId) {
    openProjectDashboard(_projDashId)
    return
  }
  const proyectos = allNodes.filter(n => n.type === 'proyecto').sort((a,b) => new Date(b.created_at)-new Date(a.created_at))

  if (!proyectos.length) {
    root.innerHTML = `
      <div style="padding:48px 24px;text-align:center;color:var(--text-muted);">
        <div style="font-size:48px;margin-bottom:16px;">🏗️</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px;">Sin proyectos aún</div>
        <div style="font-size:13px;">Escribe <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;">#proyecto Casa Tulum</code> en el panel de comandos para crear uno.</div>
      </div>`
    return
  }

  // Stats bar
  const HEALTH_CFG2 = { on_track:{emoji:'🟢',label:'En curso',color:'#4ade80'}, at_risk:{emoji:'🟡',label:'En riesgo',color:'#fbbf24'}, off_track:{emoji:'🔴',label:'Atrasado',color:'#f87171'}, on_hold:{emoji:'🔵',label:'Pausado',color:'#60a5fa'}, done:{emoji:'🟣',label:'Terminado',color:'#a78bfa'} }
  const byHealth = {}
  proyectos.forEach(p => { const s = p.metadata?.health?.status||'sin_estado'; byHealth[s]=(byHealth[s]||0)+1 })

  root.innerHTML = `
    <div style="padding:24px 28px 20px;">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <h1 style="margin:0 0 4px;font-size:26px;font-weight:900;color:var(--text-primary);">🏗️ Proyectos</h1>
          <span style="font-size:12px;color:var(--text-muted);">${proyectos.length} proyecto${proyectos.length!==1?'s':''} en total</span>
        </div>
        <button onclick="document.getElementById('ide-input')?.focus()" style="background:linear-gradient(135deg,rgba(0,246,255,0.12),rgba(167,139,250,0.08));border:1px solid rgba(0,246,255,0.25);border-radius:10px;color:#00f6ff;padding:8px 18px;cursor:pointer;font-size:12px;font-weight:800;font-family:inherit;">+ Nuevo Proyecto</button>
      </div>

      <!-- Status summary pills -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px;">
        ${Object.entries(byHealth).map(([s,count]) => {
          const cfg = HEALTH_CFG2[s] || {emoji:'⬜',label:s,color:'#94a3b8'}
          return `<div style="display:flex;align-items:center;gap:6px;background:${cfg.color}12;border:1px solid ${cfg.color}30;border-radius:20px;padding:5px 14px;">
            <span style="font-size:13px;">${cfg.emoji}</span>
            <span style="font-size:11px;font-weight:700;color:${cfg.color};">${cfg.label}</span>
            <span style="font-size:13px;font-weight:900;color:${cfg.color};font-family:monospace;">${count}</span>
          </div>`
        }).join('')}
      </div>

      <!-- Cards grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;">
        ${proyectos.map(p => renderProjectCard(p)).join('')}
      </div>
    </div>`
}

function renderProjectCard(p) {
  const m = p.metadata || {}
  const budget = m.budget || 0
  const rol = m.rol || 'dueño'
  const rolCfg = { dueño:{label:'👑 Dueño',color:'#f59e0b'}, ejecutor:{label:'⚙️ Ejecutor',color:'#60a5fa'}, colaborador:{label:'🤝 Colaborador',color:'#a78bfa'} }
  const rCfg = rolCfg[rol] || rolCfg.dueño

  // Linked nodes
  const linkedIds = m.linkedTo || []
  const linked = linkedIds.map(id => allNodes.find(n => n.id === id)).filter(Boolean)
  const tagStr = (m.tags||[]).filter(t=>t.startsWith('#')).map(t=>t.slice(1).toLowerCase())
  const cardSlug = m.project_slug || tagStr.find(t => t !== 'proyecto') || tagStr[0] || ''
  const byTag = cardSlug ? allNodes.filter(n => {
    if (!(n.type==='cotizacion'||n.type==='expense'||n.type==='gasto')) return false
    const pt = (n.metadata?.project_tag||'').toLowerCase()
    const nt = (n.metadata?.tags||[]).map(t => t.toLowerCase())
    return pt === cardSlug || nt.includes('#' + cardSlug)
  }) : []
  const allLinked = [...new Map([...linked,...byTag].map(n=>[n.id,n])).values()]

  const cots = allLinked.filter(n => n.type === 'cotizacion')
  const ESTADOS_COMPROMETIDOS_CARD = ['aceptada','en_proceso','parcial','pagada']
  const aceptadas = cots.filter(n => ESTADOS_COMPROMETIDOS_CARD.includes(n.metadata?.status))
  const comprometido = aceptadas.reduce((s,n) => s + (+n.metadata?.amount||0), 0)
  const pagos = allLinked.filter(n => n.type === 'expense' || n.type === 'gasto')
  const cotsPagadas2 = cots.filter(n => n.metadata?.status === 'pagada')
  const pagado = pagos.reduce((s,n) => s + (+n.metadata?.amount||0), 0)
             + cotsPagadas2.reduce((s,n) => s + (+n.metadata?.amount||0), 0)
  const pendiente = Math.max(0, comprometido - pagado)
  const overBudget = comprometido > budget && budget > 0
  const budgetPct = budget > 0 ? Math.min(100, Math.round((comprometido/budget)*100)) : 0
  const gaugeColor = overBudget ? '#f87171' : budgetPct > 75 ? '#fb923c' : '#4ade80'
  const taskCount = allLinked.filter(n => n.type==='tarea'||n.type==='task').length
  const taskDone  = allLinked.filter(n => (n.type==='tarea'||n.type==='task') && n.metadata?.done).length

  const health = m.health || {}
  const HEALTH_CFG = {
    on_track: { emoji:'🟢', label:'En curso',  color:'#4ade80' },
    at_risk:  { emoji:'🟡', label:'En riesgo', color:'#fbbf24' },
    off_track:{ emoji:'🔴', label:'Atrasado',  color:'#f87171' },
    on_hold:  { emoji:'🔵', label:'Pausado',   color:'#60a5fa' },
    done:     { emoji:'🟣', label:'Terminado', color:'#a78bfa' },
  }
  const hCfg = HEALTH_CFG[health.status] || null
  const STAGE_CFG = {
    planning: { emoji:'📐', label:'Planificación', color:'#94a3b8' },
    active:   { emoji:'⚡', label:'En ejecución',  color:'#4ade80' },
    on_hold:  { emoji:'⏸',  label:'Pausado',        color:'#fbbf24' },
    done:     { emoji:'✅', label:'Terminado',      color:'#a78bfa' },
  }
  const stageCfg = STAGE_CFG[m.stage] || STAGE_CFG.planning
  const mils = m.milestones || []
  const milDone = mils.filter(ms => ms.is_reached).length
  const milOverdue = mils.filter(ms => !ms.is_reached && ms.deadline && ms.deadline < new Date().toISOString().split('T')[0]).length
  const milPct = mils.length > 0 ? Math.round((milDone/mils.length)*100) : 0
  const members = m.members || []

  // Cover — use cover_url if set, else auto-gradient from name hash
  const coverUrl = m.cover_url || ''
  const nameHash = (m.label||p.content||'P').charCodeAt(0) % 6
  const coverGradients = [
    'linear-gradient(135deg,#1e3a5f,#0f2027)',
    'linear-gradient(135deg,#2d1b69,#11998e)',
    'linear-gradient(135deg,#3c1053,#ad5389)',
    'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)',
    'linear-gradient(135deg,#134e5e,#71b280)',
    'linear-gradient(135deg,#2c3e50,#4ca1af)',
  ]
  const coverBg = coverUrl
    ? `url('${coverUrl}') center/cover no-repeat`
    : coverGradients[nameHash]

  const projEmoji = m.emoji || (m.label||p.content||'').match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u)?.[0] || '🏗️'
  const projName = (m.label||p.content||'').replace(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u,'')

  // Deadline
  const deadline = m.deadline || (mils.length ? mils.filter(ms=>!ms.is_reached).sort((a,b)=>a.deadline?.localeCompare(b.deadline||'')||0)[0]?.deadline : null)
  const deadlineStr = deadline ? new Date(deadline).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : null
  const isOverdue = deadline && deadline < new Date().toISOString().split('T')[0]

  const accentColor = hCfg?.color || stageCfg.color

  return `
    <div onclick="openProjectDashboard('${p.id}')"
         style="background:var(--bg-panel);border:1px solid ${accentColor}30;border-radius:18px;cursor:pointer;transition:all 0.22s;position:relative;overflow:hidden;display:flex;flex-direction:column;"
         onmouseenter="this.style.borderColor='${accentColor}70';this.style.transform='translateY(-3px)';this.style.boxShadow='0 12px 40px ${accentColor}20'"
         onmouseleave="this.style.borderColor='${accentColor}30';this.style.transform='translateY(0)';this.style.boxShadow='none'">

      <!-- ── COVER IMAGE / GRADIENT ── -->
      <div style="height:100px;background:${coverBg};position:relative;flex-shrink:0;">
        <!-- top accent bar -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${accentColor};"></div>
        <!-- health pill top-right -->
        ${hCfg ? `<div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);border:1px solid ${hCfg.color}50;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700;color:${hCfg.color};">${hCfg.emoji} ${hCfg.label}</div>` : ''}
        <!-- role pill top-left -->
        <div style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);border:1px solid ${rCfg.color}50;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700;color:${rCfg.color};">${rCfg.label}</div>
        <!-- big emoji icon centered-bottom -->
        <div style="position:absolute;bottom:-22px;left:20px;width:44px;height:44px;border-radius:12px;background:var(--bg-panel);border:2px solid ${accentColor}40;display:grid;place-items:center;font-size:22px;box-shadow:0 4px 16px rgba(0,0,0,0.4);">${projEmoji}</div>
      </div>

      <!-- ── BODY ── -->
      <div style="padding:30px 18px 16px;">

        <!-- Title + stage -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <div style="font-size:16px;font-weight:800;color:var(--text-primary);line-height:1.2;flex:1;min-width:0;">${esc(projName)}</div>
          <span style="font-size:10px;font-weight:700;color:${stageCfg.color};background:${stageCfg.color}15;border-radius:6px;padding:2px 8px;white-space:nowrap;flex-shrink:0;">${stageCfg.emoji} ${stageCfg.label}</span>
        </div>

        <!-- Description -->
        ${m.desc ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(m.desc)}</div>` : '<div style="margin-bottom:12px;"></div>'}

        <!-- Health note / last update -->
        ${health.note ? `<div style="font-size:11px;color:var(--text-muted);background:${accentColor}08;border-left:2px solid ${accentColor};padding:6px 10px;border-radius:0 8px 8px 0;margin-bottom:12px;font-style:italic;line-height:1.4;">"${esc(health.note)}"</div>` : ''}

        <!-- ── PROPERTIES (Notion-style rows) ── -->
        <div style="display:flex;flex-direction:column;gap:0;border:1px solid rgba(255,255,255,0.05);border-radius:10px;overflow:hidden;margin-bottom:14px;font-size:11px;">
          <!-- Budget row -->
          ${budget > 0 ? `
          <div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.04);">
            <span style="width:100px;color:var(--text-dim);font-size:10px;font-weight:600;flex-shrink:0;">💰 Presupuesto</span>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
                  <div style="height:100%;width:${budgetPct}%;background:${gaugeColor};border-radius:2px;"></div>
                </div>
                <span style="font-family:monospace;font-weight:700;color:${gaugeColor};white-space:nowrap;">${budgetPct}%</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:3px;">
                <span style="color:var(--text-dim);">$${pagado.toLocaleString('es-MX',{maximumFractionDigits:0})} pagado</span>
                <span style="color:var(--text-muted);">de $${budget.toLocaleString('es-MX',{maximumFractionDigits:0})}</span>
              </div>
            </div>
          </div>` : ''}
          <!-- Milestones row -->
          ${mils.length > 0 ? `
          <div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.04);">
            <span style="width:100px;color:var(--text-dim);font-size:10px;font-weight:600;flex-shrink:0;">🏁 Hitos</span>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
                  <div style="height:100%;width:${milPct}%;background:${milOverdue?'#f87171':'#a78bfa'};border-radius:2px;"></div>
                </div>
                <span style="font-family:monospace;font-weight:700;color:${milOverdue?'#f87171':'#a78bfa'};white-space:nowrap;">${milDone}/${mils.length}</span>
              </div>
              ${milOverdue ? `<div style="color:#f87171;margin-top:2px;font-size:10px;">⚠️ ${milOverdue} vencido${milOverdue>1?'s':''}</div>` : ''}
            </div>
          </div>` : ''}
          <!-- Tasks row -->
          ${taskCount > 0 ? `
          <div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.04);">
            <span style="width:100px;color:var(--text-dim);font-size:10px;font-weight:600;flex-shrink:0;">✅ Tareas</span>
            <span style="color:var(--text-muted);">${taskDone} completadas de ${taskCount}</span>
          </div>` : ''}
          <!-- Cotizaciones row -->
          ${cots.length > 0 ? `
          <div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.04);">
            <span style="width:100px;color:var(--text-dim);font-size:10px;font-weight:600;flex-shrink:0;">📄 Cotizaciones</span>
            <span style="color:var(--text-muted);">${aceptadas.length} aceptadas · ${cots.length} total${pendiente>0?' · <span style="color:#fb923c;">$'+pendiente.toLocaleString('es-MX',{maximumFractionDigits:0})+' pendiente</span>':''}</span>
          </div>` : ''}
          <!-- Deadline row -->
          ${deadlineStr ? `
          <div style="display:flex;align-items:center;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.04);">
            <span style="width:100px;color:var(--text-dim);font-size:10px;font-weight:600;flex-shrink:0;">📅 Fecha límite</span>
            <span style="color:${isOverdue?'#f87171':'var(--text-muted)'};font-weight:${isOverdue?'700':'400'};">${deadlineStr}${isOverdue?' ⚠️':''}</span>
          </div>` : ''}
          <!-- Tags row -->
          ${tagStr.filter(t=>t!=='proyecto').length > 0 ? `
          <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;">
            <span style="width:100px;color:var(--text-dim);font-size:10px;font-weight:600;flex-shrink:0;">🏷 Tags</span>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${tagStr.filter(t=>t!=='proyecto').map(t=>`<span style="background:${accentColor}15;color:${accentColor};border-radius:4px;padding:1px 7px;font-size:9px;font-weight:700;">#${t}</span>`).join('')}
            </div>
          </div>` : ''}
        </div>

        <!-- ── TEAM AVATARS ── -->
        ${members.length > 0 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;">
            ${members.slice(0,6).map(mb => {
              const c = allNodes.find(n => n.id === mb.contact_id)
              const name = c ? (c.metadata?.name||c.content) : '?'
              const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
              const rolColors = { financiador:'#f59e0b', administrador:'#60a5fa', ejecutor:'#fb923c', supervisor:'#a78bfa', colaborador:'#4ade80' }
              const clr = rolColors[mb.role] || '#94a3b8'
              return `<div style="width:28px;height:28px;border-radius:50%;background:${clr}25;color:${clr};border:2px solid var(--bg-panel);display:grid;place-items:center;font-size:10px;font-weight:800;margin-right:-8px;" title="${esc(name)} · ${mb.role||''}">${initials}</div>`
            }).join('')}
            ${members.length > 6 ? `<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.06);color:var(--text-muted);border:2px solid var(--bg-panel);display:grid;place-items:center;font-size:9px;font-weight:700;margin-right:-8px;">+${members.length-6}</div>` : ''}
          </div>
          <span style="font-size:10px;color:var(--text-dim);">${members.length} miembro${members.length!==1?'s':''}</span>
        </div>` : `
        <div style="display:flex;align-items:center;gap:6px;color:var(--text-dim);font-size:10px;">
          <span>Sin equipo asignado</span>
        </div>`}
      </div>
    </div>`
}

// ── Helpers de cómputo del dashboard de proyecto ────────────────────────────────
function _computeProjData(projectId) {
  const p = allNodes.find(n => n.id === projectId)
  if (!p) return null
  const m = p.metadata || {}
  const budget = m.budget || 0
  const rol = m.rol || 'dueño'
  const rolCfg = { dueño:{label:'👑 Dueño',color:'#f59e0b'}, ejecutor:{label:'⚙️ Ejecutor',color:'#60a5fa'}, colaborador:{label:'🤝 Colaborador',color:'#a78bfa'} }
  const rCfg = rolCfg[rol] || rolCfg.dueño

  const linkedIds = m.linkedTo || []
  const linked = linkedIds.map(id => allNodes.find(n => n.id === id)).filter(Boolean)
  const tagStr = (m.tags||[]).filter(t=>t.startsWith('#')).map(t=>t.slice(1).toLowerCase())
  const projSlug = m.project_slug || tagStr.find(t => t !== 'proyecto') || tagStr[0] || ''
  const byTag = projSlug ? allNodes.filter(n => {
    if (!(n.type==='cotizacion'||n.type==='expense'||n.type==='gasto'||n.type==='tarea')) return false
    const pt = (n.metadata?.project_tag||'').toLowerCase()
    const nt = (n.metadata?.tags||[]).map(t => t.toLowerCase())
    return pt === projSlug || tagStr.some(s => s !== 'proyecto' && pt === s) || nt.includes('#' + projSlug)
  }) : []
  const allLinked = [...new Map([...linked,...byTag].map(n=>[n.id,n])).values()]

  const cots        = allLinked.filter(n => n.type === 'cotizacion')
  // Odoo payment_state: aceptada + en_proceso + parcial + pagada → comprometido
  const ESTADOS_COMPROMETIDOS = ['aceptada','en_proceso','parcial','pagada']
  const aceptadas   = cots.filter(n => ESTADOS_COMPROMETIDOS.includes(n.metadata?.status))
  const pendientes  = cots.filter(n => n.metadata?.status === 'pendiente')
  const comprometido= aceptadas.reduce((s,n) => s+(+n.metadata?.amount||0), 0)
  const pagos       = allLinked.filter(n => n.type==='expense'||n.type==='gasto')
  // cotizaciones 'pagada' también suman a pagado directamente
  const cotsPagadas = cots.filter(n => n.metadata?.status === 'pagada')
  const pagado      = pagos.reduce((s,n) => s+(+n.metadata?.amount||0), 0)
                    + cotsPagadas.reduce((s,n) => s+(+n.metadata?.amount||0), 0)
  const pendientePago   = Math.max(0, comprometido - pagado)
  const sinComprometer  = Math.max(0, budget - comprometido)
  const overBudget  = comprometido > budget && budget > 0
  const pct         = budget > 0 ? Math.min(100, Math.round((comprometido/budget)*100)) : 0
  const gaugeColor  = overBudget ? '#f87171' : pct > 75 ? '#fb923c' : '#4ade80'

  const cotsByCat = {}
  cots.forEach(c => {
    const cat = c.metadata?.category || 'Sin categoría'
    if (!cotsByCat[cat]) cotsByCat[cat] = []
    cotsByCat[cat].push(c)
  })

  const provMap = {}
  aceptadas.forEach(c => {
    if (!c.metadata?.provider_id) return
    if (!provMap[c.metadata.provider_id]) provMap[c.metadata.provider_id] = { cotizaciones:[], pagos:[] }
    provMap[c.metadata.provider_id].cotizaciones.push(c)
  })
  pagos.forEach(g => {
    const pid = g.metadata?.contact_id
    if (pid && provMap[pid]) provMap[pid].pagos.push(g)
  })

  const tareas = allLinked.filter(n => n.type==='tarea'||n.type==='task')

  // Auto-progreso por hitos completados
  const mils = m.milestones || []
  const milestonePct = mils.length > 0
    ? Math.round(mils.filter(ms => ms.is_reached).length / mils.length * 100)
    : null

  // Disponible = presupuesto - comprometido (puede ser negativo = sobre-budget)
  const disponible = budget > 0 ? budget - comprometido : null

  return { p, m, budget, rol, rCfg, tagStr, projSlug, allLinked,
           cots, aceptadas, pendientes, comprometido, pagos, pagado,
           pendientePago, sinComprometer, overBudget, pct, gaugeColor,
           cotsByCat, provMap, tareas, milestonePct, disponible }
}

window.openProjectDashboard = (projectId) => {
  _projDashId  = projectId
  if (_projDashTab !== 'resumen' && _projDashId !== projectId) _projDashTab = 'resumen'
  const d = _computeProjData(projectId)
  if (!d) return
  const { p, m, budget, rCfg, tagStr, projSlug } = d

  const root = document.getElementById('proyectos-root')
  const coverUrl   = m.cover_url || ''
  const nameHash   = (m.label||p.content||'P').charCodeAt(0) % 6
  const gradients  = ['linear-gradient(135deg,#1e3a5f,#0f2027)','linear-gradient(135deg,#2d1b69,#11998e)','linear-gradient(135deg,#3c1053,#ad5389)','linear-gradient(135deg,#1a1a2e,#0f3460)','linear-gradient(135deg,#134e5e,#71b280)','linear-gradient(135deg,#2c3e50,#4ca1af)']
  const coverBg    = coverUrl ? `url('${coverUrl}') center/cover no-repeat` : gradients[nameHash]
  const projEmoji  = m.emoji || '🏗️'
  const projName   = m.label || p.content || 'Proyecto'
  const STAGE_CFG  = { planning:{emoji:'📐',label:'Planificación',color:'#94a3b8'}, active:{emoji:'⚡',label:'En ejecución',color:'#4ade80'}, on_hold:{emoji:'⏸',label:'Pausado',color:'#fbbf24'}, done:{emoji:'✅',label:'Terminado',color:'#a78bfa'} }
  const HEALTH_CFG = { on_track:{emoji:'🟢',label:'En curso',color:'#4ade80'}, at_risk:{emoji:'🟡',label:'En riesgo',color:'#fbbf24'}, off_track:{emoji:'🔴',label:'Atrasado',color:'#f87171'}, on_hold:{emoji:'🔵',label:'Pausado',color:'#60a5fa'}, done:{emoji:'🟣',label:'Terminado',color:'#a78bfa'} }
  const stageCfg   = STAGE_CFG[m.stage] || STAGE_CFG.planning
  const healthCfg  = HEALTH_CFG[(m.health||{}).status] || null
  const accentColor= healthCfg?.color || stageCfg.color

  const TABS = [
    { id:'resumen',  label:'📋 Resumen'  },
    { id:'finanzas', label:'💼 Finanzas' },
    { id:'kanban',   label:'✅ Kanban'   },
    { id:'notas',    label:'🧠 Notas'    },
    { id:'wiki',     label:'📖 Wiki'     },
  ]

  root.innerHTML = `
    <!-- ── COVER HEADER ── -->
    <div style="position:relative;height:180px;background:${coverBg};flex-shrink:0;overflow:hidden;">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.2) 0%,rgba(0,0,0,0.65) 100%);"></div>
      <!-- Back button -->
      <button onclick="backToProjects()" style="position:absolute;top:14px;left:16px;z-index:2;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.18);color:#fff;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:600;">← Proyectos</button>
      <!-- Top-right actions -->
      <div style="position:absolute;top:14px;right:16px;z-index:2;display:flex;gap:8px;">
        <button onclick="openProyectoModal('${p.id}')" style="background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;">✏️ Editar</button>
        <button onclick="printProjectReport('${p.id}')" style="background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;">📄 Reporte</button>
      </div>
      <!-- Big emoji icon -->
      <div style="position:absolute;bottom:-24px;left:24px;width:52px;height:52px;border-radius:14px;background:var(--bg-panel);border:2px solid ${accentColor}60;display:grid;place-items:center;font-size:28px;box-shadow:0 4px 20px rgba(0,0,0,0.5);z-index:2;">${projEmoji}</div>
      <!-- Project name overlaid bottom -->
      <div style="position:absolute;bottom:12px;left:90px;right:16px;z-index:2;">
        <h1 style="margin:0;font-size:20px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 8px rgba(0,0,0,0.6);">${esc(projName)}</h1>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:700;background:${stageCfg.color}22;color:${stageCfg.color};border:1px solid ${stageCfg.color}44;border-radius:6px;padding:2px 8px;">${stageCfg.emoji} ${stageCfg.label}</span>
          ${healthCfg ? `<span style="font-size:11px;font-weight:700;background:${healthCfg.color}22;color:${healthCfg.color};border:1px solid ${healthCfg.color}44;border-radius:6px;padding:2px 8px;">${healthCfg.emoji} ${healthCfg.label}</span>` : ''}
          ${rCfg ? `<span style="font-size:11px;font-weight:700;background:${rCfg.color}22;color:${rCfg.color};border:1px solid ${rCfg.color}44;border-radius:6px;padding:2px 8px;">${rCfg.label}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- ── ACCIONES RÁPIDAS ── -->
    <div style="padding:12px 20px 0;margin-top:32px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:12px;">
      <button onclick="openMilestoneForm('${p.id}')" style="font-size:12px;background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.25);color:#2dd4bf;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">🏁 Hito</button>
      <button onclick="openCotizacionModal(null,'${projSlug}')" style="font-size:12px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.25);color:#fb923c;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">📄 Cotización</button>
      <button onclick="openProveedorPicker('${projSlug}')" style="font-size:12px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">🔧 Proveedor</button>
      <button onclick="openMemberModal('${p.id}')" style="font-size:12px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">👤 Persona</button>
      <button onclick="openHealthModal('${p.id}')" style="font-size:12px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);color:#4ade80;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">📊 Estado</button>
      <button onclick="openAgendaModal('bill','${projSlug}')" style="font-size:12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);color:#f87171;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">📅 Pago Fijo</button>
    </div>

    <!-- ── TABS ── -->
    <div id="proj-tabs" style="display:flex;gap:2px;padding:0 16px;background:var(--bg-panel);border-bottom:1px solid rgba(255,255,255,0.06);">
      ${TABS.map(t => `
        <button id="proj-tab-${t.id}" onclick="switchProjTab('${t.id}')"
          style="padding:12px 16px;background:none;border:none;border-bottom:2px solid ${_projDashTab===t.id?accentColor:'transparent'};color:${_projDashTab===t.id?accentColor:'var(--text-muted)'};cursor:pointer;font-size:13px;font-weight:${_projDashTab===t.id?'700':'500'};font-family:inherit;white-space:nowrap;transition:all .15s;">
          ${t.label}
        </button>`).join('')}
    </div>

    <!-- ── TAB CONTENT ── -->
    <div id="proj-tab-content" style="padding:20px 24px;overflow-y:auto;">
      ${_renderProjTab(_projDashTab, d)}
    </div>`
  if (_projDashTab === 'kanban') {
    try { initProjKanbanSortable(_projDashId) } catch (e) { /* ignore */ }
  }
}

window.switchProjTab = (tab) => {
  _projDashTab = tab
  const d = _computeProjData(_projDashId)
  if (!d) return
  const accentColor = (d.m.health?.status ? ({on_track:'#4ade80',at_risk:'#fbbf24',off_track:'#f87171',on_hold:'#60a5fa',done:'#a78bfa'}[d.m.health.status]) : null) || ({planning:'#94a3b8',active:'#4ade80',on_hold:'#fbbf24',done:'#a78bfa'}[d.m.stage]) || '#00f6ff'
  // Update tab highlight
  document.querySelectorAll('[id^="proj-tab-"]').forEach(btn => {
    const t = btn.id.replace('proj-tab-','')
    btn.style.borderBottom = `2px solid ${t === tab ? accentColor : 'transparent'}`
    btn.style.color = t === tab ? accentColor : 'var(--text-muted)'
    btn.style.fontWeight = t === tab ? '700' : '500'
  })
  // Re-render content only
  const content = document.getElementById('proj-tab-content')
  if (content) content.innerHTML = _renderProjTab(tab, d)
  if (tab === 'kanban') {
    try { initProjKanbanSortable(_projDashId) } catch (e) { /* ignore */ }
  }
}

function _renderProjTab(tab, d) {
  if (tab === 'resumen')  return _renderProjResumen(d)
  if (tab === 'finanzas') return _renderProjFinanzas(d)
  if (tab === 'kanban')   return _renderProjKanban(d)
  if (tab === 'notas')    return _renderProjNotas(d)
  if (tab === 'wiki')     return _renderProjWiki(d)
  return ''
}

// ── TAB: RESUMEN ─────────────────────────────────────────────────────────────
function _renderProjResumen(d) {
  const { p, m, budget, rCfg, tagStr, projSlug, milestonePct, tareas,
          cots, aceptadas, pendientes, comprometido, pagado, pendientePago,
          sinComprometer, overBudget, disponible, pct, gaugeColor, provMap } = d
  const _s = (fn) => { try { return fn() } catch(e) { return '' } }
  const HCFG = { on_track:{emoji:'🟢',label:'En curso',color:'#4ade80'}, at_risk:{emoji:'🟡',label:'En riesgo',color:'#fbbf24'}, off_track:{emoji:'🔴',label:'Atrasado',color:'#f87171'}, on_hold:{emoji:'🔵',label:'Pausado',color:'#60a5fa'}, done:{emoji:'🟣',label:'Terminado',color:'#a78bfa'} }
  const STAGES = [{v:'planning',l:'📐 Planificación'},{v:'active',l:'🚀 En ejecución'},{v:'on_hold',l:'⏸️ Pausado'},{v:'done',l:'✅ Terminado'}]
  const STATUS_CFG = { pendiente:{l:'Pendiente',c:'#94a3b8'}, aceptada:{l:'Aceptada',c:'#4ade80'}, rechazada:{l:'Rechazada',c:'#f87171'}, en_proceso:{l:'En proceso',c:'#60a5fa'}, pagada:{l:'Pagada',c:'#a78bfa'}, parcial:{l:'Parcial',c:'#fbbf24'} }
  const h   = m.health || {}
  const hc  = HCFG[h.status] || null
  const mils = m.milestones || []
  const milsDone = mils.filter(ms => ms.is_reached).length
  const today = new Date().toISOString().split('T')[0]
  const displayPct = h.progress != null ? h.progress : milestonePct
  const pctSource  = h.progress != null ? 'manual' : (milestonePct != null ? 'hitos' : null)
  const barColor   = hc?.color || (displayPct >= 75 ? '#4ade80' : displayPct >= 40 ? '#fbbf24' : '#00f6ff')
  const members    = m.members || []
  const fmtM = (n) => '$' + (n||0).toLocaleString('es-MX',{maximumFractionDigits:0})

  // ── Alertas ────────────────────────────────────────────────────────────────
  const alerts = []
  if (overBudget) alerts.push({ icon:'🔴', msg:`Presupuesto excedido en ${fmtM(comprometido - budget)}`, color:'#f87171' })
  const overdueHitos = mils.filter(ms => !ms.is_reached && ms.deadline && ms.deadline < today)
  if (overdueHitos.length > 0) alerts.push({ icon:'⚠️', msg:`${overdueHitos.length} hito${overdueHitos.length>1?'s':''} vencido${overdueHitos.length>1?'s':''}`, color:'#fbbf24' })
  // Próximos pagos de cotizaciones (abonos sin fecha futura > 7 días)
  const in7d = new Date(); in7d.setDate(in7d.getDate() + 7)
  const in7str = in7d.toISOString().split('T')[0]
  const upcomingPayments = aceptadas.flatMap(c => {
    const abonos = c.metadata?.abonos||[]
    const pendAbs = abonos.filter(a => a.due_date && a.due_date <= in7str && !a.paid_at)
    return pendAbs.map(a => ({ cot:c, abono:a }))
  })
  if (upcomingPayments.length > 0) alerts.push({ icon:'📅', msg:`${upcomingPayments.length} pago${upcomingPayments.length>1?'s':''} próximo${upcomingPayments.length>1?'s':''} esta semana`, color:'#60a5fa' })
  if (pendientePago > 0 && comprometido > 0) alerts.push({ icon:'💸', msg:`${fmtM(pendientePago)} pendiente de pago en cotizaciones activas`, color:'#fb923c' })

  const alertsHTML = alerts.length ? `
    <div style="margin-bottom:16px;display:flex;flex-direction:column;gap:6px;">
      ${alerts.map(a => `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${a.color}12;border:1px solid ${a.color}35;border-radius:10px;">
        <span style="font-size:16px;flex-shrink:0;">${a.icon}</span>
        <span style="font-size:12px;font-weight:600;color:${a.color};">${a.msg}</span>
      </div>`).join('')}
    </div>` : ''

  // ── KPIs financieros ───────────────────────────────────────────────────────
  const kpisHTML = budget > 0 || comprometido > 0 ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;">💰 FINANCIERO</span>
        <button onclick="switchProjTab('finanzas')" style="font-size:11px;color:#fb923c;background:none;border:1px solid rgba(251,146,60,0.3);border-radius:5px;padding:2px 8px;cursor:pointer;">Ver detalle →</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:14px;">
        ${[
          { label:'Presupuesto', val:budget, color:'#a78bfa', icon:'💼' },
          { label:'Comprometido', val:comprometido, color:'#fb923c', icon:'📋' },
          { label:'Pagado', val:pagado, color:'#4ade80', icon:'✅' },
          { label:'Por pagar', val:pendientePago, color:'#f87171', icon:'⏳' },
          ...(disponible != null ? [{ label:disponible>=0?'Disponible':'Sobregirado', val:Math.abs(disponible), color:disponible>=0?'#2dd4bf':'#f87171', icon:disponible>=0?'🏦':'🚨' }] : []),
        ].map(k => `<div style="background:${k.color}10;border:1px solid ${k.color}28;border-radius:10px;padding:10px 8px;text-align:center;">
          <div style="font-size:15px;margin-bottom:3px;">${k.icon}</div>
          <div style="font-size:10px;color:var(--text-muted);font-weight:600;white-space:nowrap;">${k.label}</div>
          <div style="font-size:12px;font-weight:900;color:${k.color};font-family:'JetBrains Mono',monospace;margin-top:2px;">${fmtM(k.val)}</div>
        </div>`).join('')}
      </div>
      ${budget > 0 ? `
        <div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:4px;"><span>Comprometido vs Presupuesto</span><span style="font-weight:700;color:${gaugeColor};">${pct}%</span></div>
          <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;position:relative;">
            <div style="height:100%;width:${Math.min(pct,100)}%;background:${gaugeColor};border-radius:4px;transition:width .6s;"></div>
          </div>
        </div>
        ${comprometido > 0 ? (() => {
          const paidPct = Math.min(100, Math.round(pagado/comprometido*100))
          return `<div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:4px;"><span>Pagado vs Comprometido</span><span style="font-weight:700;color:#4ade80;">${paidPct}%</span></div>
            <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${paidPct}%;background:#4ade80;border-radius:4px;transition:width .6s;"></div>
            </div>
          </div>`
        })() : ''}` : `<div style="font-size:12px;color:var(--text-dim);">Sin presupuesto definido — edita el proyecto para agregar presupuesto.</div>`}
    </div>` : ''

  // ── Cotizaciones activas ───────────────────────────────────────────────────
  const activeCots = aceptadas.filter(c => !['pagada','rechazada'].includes(c.metadata?.status))
  const cotsHTML = aceptadas.length > 0 ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;">📋 COTIZACIONES</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(251,146,60,0.12);color:#fb923c;font-weight:700;">${aceptadas.length} activa${aceptadas.length>1?'s':''}</span>
          ${pendientes.length > 0 ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(148,163,184,0.12);color:#94a3b8;font-weight:700;">${pendientes.length} pendiente${pendientes.length>1?'s':''}</span>` : ''}
        </div>
        <button onclick="switchProjTab('finanzas')" style="font-size:11px;color:#fb923c;background:none;border:none;cursor:pointer;">Ver todas →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${aceptadas.slice(0,5).map(c => {
          const cm = c.metadata||{}
          const abonos = cm.abonos||[]
          const cotTotal = +(cm.amount||0)
          const cotPagado = abonos.reduce((s,a)=>s+(+a.amount||0),0)
          const cotPct = cotTotal>0 ? Math.min(100,Math.round(cotPagado/cotTotal*100)) : 0
          const stCfg = STATUS_CFG[cm.status||'pendiente']
          const prov = cm.provider_id ? allNodes.find(n=>n.id===cm.provider_id) : null
          const provName = prov ? (prov.metadata?.name||prov.content) : ''
          return `<div style="padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-left:3px solid ${stCfg.c};border-radius:9px;cursor:pointer;" onclick="openCotizacionModal('${c.id}')">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="flex:1;font-size:12px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(cm.label||c.content)}</span>
              <span style="font-size:9px;padding:2px 7px;border-radius:4px;background:${stCfg.c}22;color:${stCfg.c};font-weight:700;white-space:nowrap;">${stCfg.l}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${cotPct}%;background:${cotPct>=100?'#4ade80':cotPct>0?'#60a5fa':'#94a3b8'};border-radius:3px;"></div>
              </div>
              <span style="font-size:10px;font-weight:700;color:${cotPct>=100?'#4ade80':'#60a5fa'};font-family:monospace;white-space:nowrap;">${cotPct}%</span>
              <span style="font-size:10px;color:var(--text-muted);font-family:monospace;white-space:nowrap;">${fmtM(cotPagado)}/${fmtM(cotTotal)}</span>
            </div>
            ${provName ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">👤 ${esc(provName)}</div>` : ''}
          </div>`
        }).join('')}
        ${aceptadas.length > 5 ? `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:4px;">… y ${aceptadas.length-5} más</div>` : ''}
      </div>
    </div>` : ''

  // ── Proveedores con saldo ──────────────────────────────────────────────────
  const provEntries = Object.entries(provMap).filter(([,pd]) => {
    const total = pd.cotizaciones.reduce((s,c)=>s+(+c.metadata?.amount||0),0)
    const abonos = pd.cotizaciones.flatMap(c=>c.metadata?.abonos||[]).reduce((s,a)=>s+(+a.amount||0),0)
    const direct = pd.pagos.reduce((s,e)=>s+(+e.metadata?.amount||0),0)
    return total > 0 && (abonos+direct) < total
  })
  const provsHTML = provEntries.length > 0 ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
      <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;display:block;margin-bottom:12px;">👤 PROVEEDORES CON SALDO</span>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${provEntries.slice(0,4).map(([pid, pd]) => {
          const pNode = allNodes.find(n=>n.id===pid)
          const pName = pNode ? (pNode.metadata?.name||pNode.content) : pid
          const total = pd.cotizaciones.reduce((s,c)=>s+(+c.metadata?.amount||0),0)
          const abonos = pd.cotizaciones.flatMap(c=>c.metadata?.abonos||[]).reduce((s,a)=>s+(+a.amount||0),0)
          const direct = pd.pagos.reduce((s,e)=>s+(+e.metadata?.amount||0),0)
          const pagProv = abonos+direct
          const saldo = Math.max(0, total - pagProv)
          const pp = total>0 ? Math.min(100,Math.round(pagProv/total*100)) : 0
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.06);cursor:pointer;" ondblclick="showProveedorHistorial('${pid}','${projSlug}','${esc(pName)}')" title="Doble clic para ver historial">
            <div style="width:30px;height:30px;border-radius:50%;background:rgba(251,146,60,0.12);color:#fb923c;display:grid;place-items:center;font-size:13px;font-weight:800;flex-shrink:0;">${esc(pName.charAt(0).toUpperCase())}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${esc(pName)}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                <div style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${pp}%;background:#60a5fa;border-radius:2px;"></div></div>
                <span style="font-size:10px;color:#60a5fa;font-weight:700;">${pp}%</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:12px;font-weight:800;color:#f87171;font-family:monospace;">${fmtM(saldo)}</div>
              <div style="font-size:9px;color:var(--text-muted);">pendiente</div>
            </div>
          </div>`
        }).join('')}
        ${provEntries.length > 4 ? `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:4px;">… y ${provEntries.length-4} proveedor${provEntries.length-4>1?'es':''} más</div>` : ''}
      </div>
    </div>` : ''

  // ── Salud + Stage ──────────────────────────────────────────────────────────
  const saludHTML = `
    <div style="background:var(--surface);border:1px solid ${hc?hc.color+'44':'var(--border)'};border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:${displayPct!=null||h.note?'14px':'0'};">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;">SALUD</span>
          ${hc ? `<span style="font-size:12px;font-weight:700;background:${hc.color}18;color:${hc.color};border-radius:6px;padding:3px 10px;">${hc.emoji} ${hc.label}</span>` : '<span style="font-size:12px;color:var(--text-dim);">Sin estado</span>'}
          <select onchange="projSetStage('${p.id}',this.value)" onclick="event.stopPropagation()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:3px 8px;color:var(--text-secondary);font-size:11px;font-family:inherit;">
            ${STAGES.map(s=>`<option value="${s.v}" ${m.stage===s.v?'selected':''}>${s.l}</option>`).join('')}
          </select>
        </div>
        <button onclick="openHealthModal('${p.id}')" style="font-size:11px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);color:#4ade80;border-radius:6px;padding:3px 10px;cursor:pointer;font-weight:600;">✏️ Editar</button>
      </div>
      ${displayPct != null ? `
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:11px;color:var(--text-muted);">Avance ${pctSource==='hitos'?'<span style="color:#2dd4bf;font-size:10px;">(auto)</span>':''}</span>
            <span style="font-size:13px;font-weight:800;color:${barColor};">${displayPct}%</span>
          </div>
          <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${displayPct}%;background:${barColor};border-radius:4px;transition:width .6s;"></div>
          </div>
          ${pctSource==='hitos' ? `<div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${milsDone}/${mils.length} hitos completados</div>` : ''}
        </div>` : `<div style="font-size:12px;color:var(--text-dim);">Usa <strong style="color:#4ade80;">📊 Estado</strong> para registrar avance, o agrega hitos para cálculo automático.</div>`}
      ${h.note ? `<div style="font-size:12px;color:var(--text-muted);font-style:italic;margin-top:10px;background:rgba(255,255,255,0.03);padding:8px 12px;border-radius:8px;border-left:3px solid ${hc?.color||'var(--border)'};">"${esc(h.note)}"</div>` : ''}
      ${h.updated_at ? `<div style="font-size:10px;color:var(--text-dim);margin-top:6px;">Última actualización: ${h.updated_at}</div>` : ''}
    </div>`

  // ── Hitos (compacto) ───────────────────────────────────────────────────────
  const hitosHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;">🏁 HITOS</span>
          ${mils.length ? `<span style="font-size:11px;color:#2dd4bf;font-weight:700;">${milsDone}/${mils.length}</span>` : ''}
        </div>
        <button onclick="openMilestoneForm('${p.id}')" style="font-size:11px;background:rgba(45,212,191,0.1);border:1px solid rgba(45,212,191,0.25);color:#2dd4bf;border-radius:6px;padding:3px 10px;cursor:pointer;font-weight:600;">+ Agregar</button>
      </div>
      ${mils.length === 0 ? `<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:8px;">Sin hitos — defínelos para calcular avance automáticamente</div>` :
        mils.map((ms,i) => {
          const overdue = !ms.is_reached && ms.deadline && ms.deadline < today
          const clr = ms.is_reached ? '#4ade80' : overdue ? '#f87171' : '#2dd4bf'
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
            <button onclick="toggleMilestone('${p.id}',${i})" style="width:20px;height:20px;border-radius:50%;border:2px solid ${clr};background:${ms.is_reached?clr:'transparent'};cursor:pointer;display:grid;place-items:center;font-size:11px;color:${ms.is_reached?'#000':'transparent'};flex-shrink:0;">✓</button>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:600;color:var(--text-primary);${ms.is_reached?'text-decoration:line-through;opacity:.55;':''};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ms.name)}</div>
              ${ms.deadline ? `<div style="font-size:10px;color:${clr};">${overdue?'⚠️ Vencido':'📅'} ${ms.deadline}</div>` : ''}
            </div>
            <button onclick="openMilestoneModal('${p.id}',${i})" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;padding:2px 4px;">✏️</button>
            <button onclick="deleteMilestone('${p.id}',${i})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:13px;padding:2px 4px;">✕</button>
          </div>`
        }).join('')}
      ${mils.length > 0 ? `<div style="margin-top:10px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${Math.round(milsDone/mils.length*100)}%;background:#2dd4bf;border-radius:3px;transition:width .6s;"></div></div>` : ''}
    </div>`

  // ── Equipo ─────────────────────────────────────────────────────────────────
  const teamHTML = _s(() => {
    if (!members.length) return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:14px;"><span style="font-size:12px;font-weight:800;color:var(--text-muted);">👥 EQUIPO</span><button onclick="openMemberModal('${p.id}')" style="font-size:12px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:7px;padding:4px 12px;cursor:pointer;">+ Añadir persona</button></div>`
    const roleOrder = ['financiador','administrador','supervisor','ejecutor','colaborador']
    const grouped = {}; members.forEach(mb => { const k=mb.role||'colaborador'; if(!grouped[k])grouped[k]=[]; grouped[k].push(mb) })
    const roleCfg = { financiador:{label:'💰 Financiador',color:'#f59e0b'}, administrador:{label:'🗂️ Admin',color:'#60a5fa'}, ejecutor:{label:'🔧 Ejecutor',color:'#fb923c'}, supervisor:{label:'👁️ Supervisor',color:'#a78bfa'}, colaborador:{label:'🤝 Colaborador',color:'#4ade80'} }
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-muted);">👥 EQUIPO (${members.length})</div>
        <button onclick="openMemberModal('${p.id}')" style="font-size:11px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:6px;padding:3px 10px;cursor:pointer;">+ Añadir</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${members.map(mb => {
          const c = allNodes.find(n => n.id === mb.contact_id)
          const name = c ? (c.metadata?.name||c.content) : 'Sin nombre'
          const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()
          const cfg = roleCfg[mb.role||'colaborador'] || {label:'Colaborador',color:'#94a3b8'}
          return `<div style="display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:6px 10px;">
            <div style="width:26px;height:26px;border-radius:50%;background:${cfg.color}20;color:${cfg.color};display:grid;place-items:center;font-size:10px;font-weight:800;flex-shrink:0;">${initials}</div>
            <div><div style="font-size:12px;font-weight:600;color:var(--text-primary);">${esc(name)}</div><div style="font-size:9px;color:${cfg.color};">${cfg.label}</div></div>
            <button onclick="removeMember('${p.id}','${mb.contact_id}')" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:13px;padding:0 2px;margin-left:2px;">×</button>
          </div>`
        }).join('')}
      </div>
    </div>`
  })

  // ── Tareas ─────────────────────────────────────────────────────────────────
  const tareasHTML = tareas.length ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);">✅ TAREAS</span>
          <span style="font-size:10px;font-weight:700;color:#60a5fa;">${tareas.filter(t=>t.metadata?.status==='done').length}/${tareas.length}</span>
        </div>
        <button onclick="switchProjTab('kanban')" style="font-size:11px;color:#60a5fa;background:none;border:none;cursor:pointer;">Ver Kanban →</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${tareas.slice(0,5).map(t => {
          const ts = t.metadata?.status || 'todo'
          const tc = ts==='done'?'#4ade80':ts==='in_progress'?'#60a5fa':'#94a3b8'
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
            <div style="width:8px;height:8px;border-radius:50%;background:${tc};flex-shrink:0;"></div>
            <span style="font-size:12px;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.metadata?.label||t.content)}</span>
          </div>`
        }).join('')}
        ${tareas.length > 5 ? `<div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:4px;">… y ${tareas.length-5} más</div>` : ''}
      </div>
    </div>` : ''

  // ── Descripción ────────────────────────────────────────────────────────────
  const descHTML = m.desc ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:13px;color:var(--text-secondary);line-height:1.6;">${esc(m.desc)}</div>` : ''

  return descHTML + alertsHTML + kpisHTML + cotsHTML + provsHTML + saludHTML + hitosHTML + teamHTML + tareasHTML
}

// ── TAB: FINANZAS ────────────────────────────────────────────────────────────
function _renderProjFinanzas(d) {
  const { p, m, budget, tagStr, projSlug, cots, aceptadas, pendientes, comprometido,
          pagos, pagado, pendientePago, sinComprometer, overBudget, pct, gaugeColor,
          cotsByCat, provMap, milestonePct, disponible } = d
  const _s    = (fn) => { try { return fn() } catch(e) { return '' } }
  const fmtM  = (n) => '$' + Math.abs(n||0).toLocaleString('es-MX',{maximumFractionDigits:0})

  // ── Dashboard financiero (profesional SVG redesign) ────────
  const dashHTML = _s(() => {
    // ─── SVG Feather icons ──────────────────────────────────
    const ICON_BRIEFCASE   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`
    const ICON_CLIPBOARD   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`
    const ICON_CHECK       = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    const ICON_CLOCK       = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    const ICON_SHIELD      = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
    const ICON_ALERT       = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`

    // ─── A) Semicircle gauge SVG ────────────────────────────
    const SEMI_ARC = Math.PI * 85  // arc circumference ≈ 267
    const gaugePct = Math.min(pct, 100)
    const gaugeLen = (gaugePct / 100) * SEMI_ARC
    const gaugeStroke = overBudget ? '#f87171' : pct > 80 ? '#fb923c' : pct > 50 ? '#fbbf24' : '#4ade80'
    const gaugeSVG = budget > 0 ? `
      <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:20px;position:relative;">
        <svg viewBox="0 0 200 120" style="width:200px;height:120px;overflow:visible;">
          <!-- background track -->
          <path d="M15,100 A85,85,0,0,1,185,100" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="14" stroke-linecap="round"/>
          <!-- colored fill -->
          <path d="M15,100 A85,85,0,0,1,185,100" fill="none" stroke="${gaugeStroke}" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="${gaugeLen.toFixed(1)} ${SEMI_ARC.toFixed(1)}" style="transition:stroke-dasharray .7s;"/>
          <!-- center label -->
          <text x="100" y="85" text-anchor="middle" fill="#fff" font-size="22" font-weight="800" font-family="JetBrains Mono,monospace">${gaugePct}%</text>
          <text x="100" y="101" text-anchor="middle" fill="#64748b" font-size="9" font-weight="600" letter-spacing="0.05em">DEL PRESUPUESTO</text>
          ${overBudget ? `<text x="100" y="114" text-anchor="middle" fill="#f87171" font-size="8" font-weight="700">EXCEDIDO</text>` : ''}
          <!-- min/max labels -->
          <text x="12" y="114" text-anchor="middle" fill="#475569" font-size="8">$0</text>
          <text x="188" y="114" text-anchor="end" fill="#475569" font-size="8">${fmtM(budget)}</text>
        </svg>
        ${budget > 0 ? `<div style="display:flex;gap:16px;margin-top:-4px;">
          <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);">
            <span style="width:8px;height:8px;border-radius:2px;background:#4ade80;display:inline-block;"></span>Pagado
          </div>
          <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);">
            <span style="width:8px;height:8px;border-radius:2px;background:#f87171;display:inline-block;"></span>Por pagar
          </div>
          <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);">
            <span style="width:8px;height:8px;border-radius:2px;background:#2dd4bf;display:inline-block;"></span>Disponible
          </div>
        </div>` : ''}
      </div>` : ''

    // ─── Stacked budget bar with labeled sections ───────────
    const stackedBar = budget > 0 ? (() => {
      const pagadoPct  = Math.min(Math.round(pagado / budget * 100), 100)
      const pendPct    = Math.min(Math.round(pendientePago / budget * 100), Math.max(0, 100 - pagadoPct))
      const dispPct    = Math.max(0, 100 - pagadoPct - pendPct)
      const overPct    = comprometido > budget ? Math.min(Math.round((comprometido - budget) / budget * 100), 30) : 0
      return `<div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:6px;align-items:center;">
          <span style="font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Distribución del presupuesto</span>
          <span style="font-weight:800;font-family:'JetBrains Mono',monospace;color:${overBudget?'#f87171':gaugeStroke};">${fmtM(budget)}${overBudget ? ' — Excedido' : ''}</span>
        </div>
        <div style="height:12px;background:rgba(255,255,255,0.05);border-radius:6px;overflow:hidden;display:flex;position:relative;">
          <div style="width:${pagadoPct}%;background:#4ade80;transition:width .6s;" title="Pagado ${fmtM(pagado)}"></div>
          <div style="width:${pendPct}%;background:#f87171;transition:width .6s;" title="Por pagar ${fmtM(pendientePago)}"></div>
          <div style="width:${dispPct}%;background:#2dd4bf;opacity:0.45;transition:width .6s;" title="Disponible ${fmtM(Math.max(0,disponible||0))}"></div>
          ${overPct > 0 ? `<div style="width:${overPct}%;background:repeating-linear-gradient(45deg,#f87171,#f87171 3px,transparent 3px,transparent 6px);opacity:0.75;" title="Excedido"></div>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;">
          ${[['#4ade80','Pagado',pagado],['#f87171','Por pagar',pendientePago],['#2dd4bf','Disponible',Math.max(0,disponible||0)]].filter(x => x[2] > 0).map(([c,l,v]) => {
            const seg = `<div style="display:flex;align-items:center;gap:5px;font-size:10px;"><span style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block;flex-shrink:0;"></span><span style="color:var(--text-muted);">${l}:</span><span style="font-weight:800;color:${c};font-family:'JetBrains Mono',monospace;">${fmtM(v)}</span></div>`
            return seg
          }).join('')}
        </div>
      </div>`
    })() : ''

    // ─── B) KPI stat row with Feather SVG icons ─────────────
    const kpiData = [
      { label:'PRESUPUESTO',  val:budget,            color:'#a78bfa', icon:ICON_BRIEFCASE, show: budget > 0,    note:'' },
      { label:'COMPROMETIDO', val:comprometido,      color:'#fb923c', icon:ICON_CLIPBOARD, show: true,           note: cots.length ? cots.length + ' cots.' : '' },
      { label:'PAGADO',       val:pagado,            color:'#4ade80', icon:ICON_CHECK,     show: true,           note: comprometido > 0 ? Math.round(pagado/Math.max(comprometido,1)*100) + '% de acordado' : '' },
      { label:'POR PAGAR',    val:pendientePago,     color: pendientePago > 0 ? '#f87171' : '#94a3b8', icon:ICON_CLOCK, show: true, note: '' },
      { label: disponible != null && disponible < 0 ? 'EXCEDIDO' : 'DISPONIBLE',
        val: Math.abs(disponible || 0),
        color: disponible != null && disponible < 0 ? '#f87171' : '#2dd4bf',
        icon: disponible != null && disponible < 0 ? ICON_ALERT : ICON_SHIELD,
        show: budget > 0, note: '' },
    ].filter(k => k.show)

    const kpisHTML = `<div style="display:flex;gap:0;margin-bottom:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;">
      ${kpiData.map((k, i) => {
        const sep = i > 0 ? 'border-left:1px solid rgba(255,255,255,0.06);' : ''
        const kpiItem = `<div style="flex:1;padding:14px 12px;min-width:0;${sep}">
          <div style="color:${k.color};margin-bottom:6px;opacity:0.85;">${k.icon}</div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.07em;color:var(--text-muted);margin-bottom:4px;">${k.label}</div>
          <div style="font-size:14px;font-weight:900;color:${k.color};font-family:'JetBrains Mono',monospace;line-height:1.1;">${fmtM(k.val)}</div>
          ${k.note ? `<div style="font-size:9px;color:var(--text-dim);margin-top:3px;">${k.note}</div>` : ''}
        </div>`
        return kpiItem
      }).join('')}
    </div>`

    // ─── C) Category horizontal grouped bar chart ────────────
    const catMap = {}
    d.cots.forEach(c => {
      const cat = c.metadata?.category || 'Sin categoría'
      if (!catMap[cat]) catMap[cat] = { comprometido: 0, pagado: 0, count: 0 }
      catMap[cat].comprometido += +(c.metadata?.amount || 0)
      catMap[cat].pagado += (c.metadata?.abonos || []).reduce((s, a) => s + (+a.amount || 0), 0)
      catMap[cat].count++
    })
    const catEntries = Object.entries(catMap).sort((a, b) => b[1].comprometido - a[1].comprometido)
    const maxCat = catEntries.reduce((mx, [, v]) => Math.max(mx, v.comprometido), 1)
    const catHTML = catEntries.length > 0 ? `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <span style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.07em;text-transform:uppercase;">Desglose por categoría</span>
          <div style="display:flex;gap:10px;margin-left:auto;align-items:center;">
            <div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--text-dim);">
              <span style="display:inline-block;width:10px;height:6px;background:rgba(255,255,255,0.15);border-radius:1px;"></span>Comprometido
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:9px;color:var(--text-dim);">
              <span style="display:inline-block;width:10px;height:6px;background:#4ade80;border-radius:1px;"></span>Pagado
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${catEntries.map(([cat, v]) => {
            const paidPct2   = v.comprometido > 0 ? Math.min(100, Math.round(v.pagado / v.comprometido * 100)) : 0
            const barWidthPct = Math.round(v.comprometido / maxCat * 100)
            const icon2 = getCategoryIcon(cat)
            const catRow = `<div style="display:flex;align-items:center;gap:10px;">
              <div style="width:120px;flex-shrink:0;display:flex;align-items:center;gap:6px;overflow:hidden;">
                <span style="font-size:13px;flex-shrink:0;">${icon2}</span>
                <span style="font-size:11px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(cat)}</span>
              </div>
              <div style="flex:1;position:relative;">
                <!-- full track -->
                <div style="height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;width:${barWidthPct}%;">
                  <!-- orange = comprometido layer (full bar) -->
                  <div style="position:absolute;top:0;left:0;height:8px;width:${barWidthPct}%;background:rgba(251,146,60,0.35);border-radius:4px;"></div>
                  <!-- green = pagado layer on top -->
                  <div style="position:relative;height:8px;width:${paidPct2}%;background:linear-gradient(90deg,#4ade80,#2dd4bf);border-radius:4px;transition:width .5s;"></div>
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0;min-width:90px;">
                <div style="font-size:11px;font-weight:800;font-family:'JetBrains Mono',monospace;color:#fb923c;">${fmtM(v.comprometido)}</div>
                <div style="font-size:9px;color:${paidPct2 >= 100 ? '#4ade80' : 'var(--text-dim)'};">${paidPct2}% pagado</div>
              </div>
            </div>`
            return catRow
          }).join('')}
        </div>
      </div>` : ''

    // ─── D) Provider mini-ring chart ────────────────────────
    const provEntries2 = Object.entries(d.provMap)
      .map(([pid, pv]) => {
        const prov   = allNodes.find(n => n.id === pid)
        const name   = prov ? (prov.metadata?.name || prov.content) : '?'
        const total3 = pv.cotizaciones.reduce((s, c) => s + (+c.metadata?.amount || 0), 0)
        const paid3  = pv.cotizaciones.flatMap(c => c.metadata?.abonos || []).reduce((s, a) => s + (+a.amount || 0), 0)
                     + pv.pagos.reduce((s, e) => s + (+e.metadata?.amount || 0), 0)
        const saldo3 = Math.max(0, total3 - paid3)
        const pct3   = total3 > 0 ? Math.min(100, Math.round(paid3 / total3 * 100)) : 0
        return { pid, name, total: total3, paid: paid3, saldo: saldo3, pct: pct3 }
      })
      .sort((a, b) => b.total - a.total).slice(0, 6)

    const provChartHTML = provEntries2.length ? `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          <span style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.07em;text-transform:uppercase;">Proveedores</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${provEntries2.map(pv => {
            const ringC  = 2 * Math.PI * 12  // r=12 → C≈75.4
            const ringLen = (pv.pct / 100 * ringC).toFixed(1)
            const ringColor = pv.pct >= 100 ? '#4ade80' : pv.pct > 0 ? '#60a5fa' : '#94a3b8'
            const provRow = `<div style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 8px;border-radius:8px;transition:background .15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''" ondblclick="showProveedorHistorial('${pv.pid}','${projSlug}','${esc(pv.name)}')" title="Doble clic para historial">
              <div style="width:30px;height:30px;flex-shrink:0;position:relative;">
                <svg viewBox="0 0 32 32" width="30" height="30" style="transform:rotate(-90deg);">
                  <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="4"/>
                  <circle cx="16" cy="16" r="12" fill="none" stroke="${ringColor}" stroke-width="4" stroke-linecap="round"
                    stroke-dasharray="${ringLen} ${ringC.toFixed(1)}" stroke-dashoffset="0"/>
                </svg>
                <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;color:#fff;pointer-events:none;">${pv.pct}%</span>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pv.name)}</div>
                <div style="font-size:10px;color:var(--text-muted);">${fmtM(pv.paid)} <span style="color:var(--text-dim);">de</span> ${fmtM(pv.total)}</div>
              </div>
              ${pv.saldo > 0
                ? `<span style="font-size:11px;font-weight:700;color:#f87171;font-family:'JetBrains Mono',monospace;flex-shrink:0;">${fmtM(pv.saldo)}</span>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" flex-shrink="0"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`}
            </div>`
            return provRow
          }).join('')}
        </div>
      </div>` : ''

    // ─── E) Payment timeline (last 6 payments) ──────────────
    const recentPagos = [...pagos]
      .sort((a, b) => (b.metadata?.date || b.created_at || '').localeCompare(a.metadata?.date || a.created_at || ''))
      .slice(0, 6)
    const timelineHTML = recentPagos.length > 0 ? (() => {
      const METHOD_SVG = {
        transferencia: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
        efectivo:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
        cheque:        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        tarjeta:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
      }
      return `<div style="margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.07em;text-transform:uppercase;">Actividad reciente de pagos</span>
        </div>
        <div style="position:relative;padding:0 8px;">
          <div style="position:absolute;top:10px;left:20px;right:20px;height:1px;background:rgba(255,255,255,0.07);"></div>
          <div style="display:flex;justify-content:space-around;position:relative;">
            ${recentPagos.map(pg => {
              const pgDate   = (pg.metadata?.date || pg.created_at || '').slice(0, 10)
              const pgAmt    = +(pg.metadata?.amount || 0)
              const pgMethod = pg.metadata?.method || ''
              const pgLabel  = pg.metadata?.label || pg.metadata?.notes || pg.content || 'Pago'
              const pgIcon   = METHOD_SVG[pgMethod] || `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`
              const dot = `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;flex:1;" title="${esc(pgLabel)} — ${fmtM(pgAmt)}">
                <div style="width:26px;height:26px;border-radius:50%;background:#4ade8022;border:2px solid #4ade80;display:flex;align-items:center;justify-content:center;color:#4ade80;position:relative;z-index:1;flex-shrink:0;">${pgIcon}</div>
                <div style="font-size:9px;font-weight:800;font-family:'JetBrains Mono',monospace;color:#4ade80;white-space:nowrap;">${fmtM(pgAmt)}</div>
                <div style="font-size:8px;color:var(--text-dim);white-space:nowrap;">${pgDate.slice(5)}</div>
              </div>`
              return dot
            }).join('')}
          </div>
        </div>
      </div>`
    })() : ''

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.07em;text-transform:uppercase;">Financiero</span>
        </div>
        ${budget === 0 ? `<button onclick="openProyectoModal('${p.id}')" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#a78bfa;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:600;">${ICON_BRIEFCASE} Definir presupuesto</button>` : ''}
      </div>
      ${gaugeSVG}
      ${kpisHTML}
      ${stackedBar}
      ${catHTML}
      ${provChartHTML}
      ${timelineHTML}
    </div>`
  })

  // ── Proveedores — tabla profesional ───────────────────────
  const provsHTML = _s(() => {
    if (!Object.keys(provMap).length) return ''

    const provRows = Object.entries(provMap).map(([pid, pd], rowIdx) => {
      const prov      = allNodes.find(n => n.id === pid)
      const provName  = prov?.metadata?.name || prov?.content || 'Proveedor'
      const inicial   = esc(provName.charAt(0).toUpperCase())
      const acordado  = pd.cotizaciones.reduce((s, c) => s + (+c.metadata?.amount || 0), 0)
      const abonos    = allNodes.filter(n =>
        n.type === 'expense' && n.metadata?.contact_id === pid &&
        tagStr.some(t => (n.metadata?.project_tag || '').toLowerCase() === t)
      )
      const pagadoProv = abonos.reduce((s, a) => s + (+a.metadata?.amount || 0), 0)
      const saldo      = Math.max(0, acordado - pagadoProv)
      const excedente  = pagadoProv > acordado && acordado > 0
      const pct2       = acordado > 0 ? Math.min(100, Math.round(pagadoProv / acordado * 100)) : 0
      const numCots    = pd.cotizaciones.length
      const hasActiveCots = pd.cotizaciones.some(c => !['rechazada', 'pagada'].includes(c.metadata?.status))
      const abonoAction = hasActiveCots
        ? `showProveedorHistorial('${pid}','${projSlug}','${esc(provName)}')`
        : `openAbonoModal('${pid}','${esc(provName)}','${projSlug}','${p.id}')`
      const rowBg = rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)'

      // progress bar cell
      const barColor  = pct2 >= 100 ? '#4ade80' : pct2 > 50 ? '#60a5fa' : '#fb923c'
      const barCell   = acordado > 0
        ? `<div style="height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;min-width:60px;">
             <div style="height:100%;width:${pct2}%;background:${barColor};border-radius:2px;transition:width .5s;"></div>
           </div>
           <div style="font-size:9px;color:${barColor};font-weight:700;margin-top:3px;">${pct2}%</div>`
        : `<div style="font-size:9px;color:var(--text-dim);">—</div>`

      // saldo cell
      const saldoCell = saldo === 0 && acordado > 0
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#4ade80;">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
             Liquidado
           </span>`
        : `<span style="font-size:12px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${excedente?'#fbbf24':'#f87171'};">${fmtM(saldo)}${excedente?' <span style="font-size:9px;vertical-align:middle;">excedente</span>':''}</span>`

      return `<tr style="background:${rowBg};transition:background .12s;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='${rowBg}'">
        <td style="padding:10px 12px;vertical-align:middle;">
          <div style="display:flex;align-items:center;gap:9px;">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(251,146,60,0.14);color:#fb923c;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;cursor:pointer;" ondblclick="showProveedorHistorial('${pid}','${projSlug}','${esc(provName)}')" title="Ver historial">${inicial}</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text-primary);cursor:pointer;" onclick="showProveedorHistorial('${pid}','${projSlug}','${esc(provName)}')">${esc(provName)}</div>
              <div style="font-size:9px;color:var(--text-dim);margin-top:1px;">clic para historial</div>
            </div>
          </div>
        </td>
        <td style="padding:10px 12px;vertical-align:middle;text-align:center;">
          <span style="font-size:12px;font-weight:700;color:var(--text-muted);">${numCots}</span>
          <div style="font-size:9px;color:var(--text-dim);">cot${numCots !== 1 ? 's' : ''}.</div>
        </td>
        <td style="padding:10px 12px;vertical-align:middle;text-align:right;">
          <span style="font-size:13px;font-weight:800;font-family:'JetBrains Mono',monospace;color:#fb923c;">${fmtM(acordado)}</span>
        </td>
        <td style="padding:10px 12px;vertical-align:middle;text-align:right;">
          <span style="font-size:13px;font-weight:800;font-family:'JetBrains Mono',monospace;color:#4ade80;">${fmtM(pagadoProv)}</span>
        </td>
        <td style="padding:10px 12px;vertical-align:middle;text-align:right;">
          ${saldoCell}
        </td>
        <td style="padding:10px 12px;vertical-align:middle;min-width:80px;">
          ${barCell}
        </td>
        <td style="padding:10px 12px;vertical-align:middle;text-align:right;">
          <div style="display:flex;gap:5px;justify-content:flex-end;flex-wrap:nowrap;">
            <button onclick="showProveedorHistorial('${pid}','${projSlug}','${esc(provName)}')" style="font-size:10px;font-weight:600;padding:4px 9px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);color:#60a5fa;border-radius:6px;cursor:pointer;white-space:nowrap;">Historial</button>
            <button onclick="${abonoAction}" style="font-size:10px;font-weight:600;padding:4px 9px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);color:#4ade80;border-radius:6px;cursor:pointer;white-space:nowrap;">Pagar</button>
          </div>
        </td>
      </tr>`
    }).join('')

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 0;margin-bottom:4px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;">Proveedores</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(251,146,60,0.12);color:#fb923c;font-weight:700;">${Object.keys(provMap).length}</span>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
              <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;">Proveedor</th>
              <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;">Cots.</th>
              <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;">Acordado</th>
              <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;">Pagado</th>
              <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;">Saldo</th>
              <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;">Avance</th>
              <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${provRows}
          </tbody>
        </table>
      </div>
    </div>`
  })

  // ── Pagos fijos — rich cards ──────────────────────────────
  const pagosFijosHTML = _s(() => {
    const METHOD_ICON = { transferencia:'🏦', efectivo:'💵', tarjeta:'💳', cheque:'📄', domiciliado:'🔄', cripto:'₿' }
    const METHOD_LBL  = { transferencia:'Transferencia', efectivo:'Efectivo', tarjeta:'Tarjeta', cheque:'Cheque', domiciliado:'Cargo domiciliado', cripto:'Cripto' }
    const FREQ_LBL    = { mensual:'📅 Mensual', bimestral:'📅 Bimestral', trimestral:'📅 Trimestral', semestral:'📅 Semestral', anual:'📅 Anual' }
    const freqMos     = { mensual:1, bimestral:2, trimestral:3, semestral:6, anual:12 }

    const pagosFijos = allNodes.filter(n =>
      (n.type==='bill'||n.type==='subscription') &&
      tagStr.some(t => (n.metadata?.project_tag||'').toLowerCase()===t)
    ).sort((a,b) => (a.metadata?.dayOfMonth||99)-(b.metadata?.dayOfMonth||99))

    const today2 = new Date()

    const totalFijo = pagosFijos.reduce((s,n) => s + (n.metadata?.amount||0), 0)
    const totalPendFijo = pagosFijos.filter(n=>!n.metadata?.paid).reduce((s,n)=>s+(n.metadata?.amount||0),0)

    const cards = pagosFijos.map(n => {
      const nm   = n.metadata || {}
      const amt  = nm.amount
      const hasAmt = amt != null
      const day  = nm.dayOfMonth
      const freq = nm.frequency || 'mensual'
      const mos  = freqMos[freq] || 1
      const paid = nm.paid || false
      const clr  = n.type === 'subscription' ? '#a78bfa' : '#fb923c'

      // Calcular próxima fecha según frecuencia
      let next = null, daysLeft = null, urgent = false, overdue = false
      if (day) {
        next = new Date(today2.getFullYear(), today2.getMonth(), day)
        while (next <= today2) next.setMonth(next.getMonth() + mos)
        daysLeft = Math.ceil((next - today2) / 86400000)
        urgent   = daysLeft <= 7
        overdue  = daysLeft < 0
      }

      const urgColor = overdue ? '#f87171' : urgent ? '#fb923c' : clr

      // Destino / contacto
      const contact = nm.contactId ? allNodes.find(n2=>n2.id===nm.contactId) : null
      const contactName = contact ? (contact.metadata?.name||contact.content) : ''
      const contactInitial = contactName ? contactName.charAt(0).toUpperCase() : ''

      // Badge del día
      const dayBadge = day ? `
        <div style="min-width:44px;text-align:center;flex-shrink:0;">
          <div style="background:${urgColor}18;border:1px solid ${urgColor}44;border-radius:10px;padding:6px 4px;">
            <div style="font-size:18px;font-weight:900;color:${urgColor};font-family:'JetBrains Mono',monospace;line-height:1;">${day}</div>
            <div style="font-size:8px;color:${urgColor}99;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">día</div>
          </div>
          ${daysLeft !== null ? `<div style="font-size:9px;color:${urgColor};font-weight:700;margin-top:3px;text-align:center;">${overdue?'VENCIDO':daysLeft===0?'HOY':daysLeft===1?'MAÑANA':daysLeft+'d'}</div>` : ''}
        </div>` : `<div style="min-width:44px;flex-shrink:0;"></div>`

      // Avatar del contacto
      const contactAvatar = contactName ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:7px;">
          <div style="width:20px;height:20px;border-radius:50%;background:${clr}22;color:${clr};display:grid;place-items:center;font-size:10px;font-weight:800;flex-shrink:0;">${contactInitial}</div>
          <span style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(contactName)}</span>
          ${nm.method ? `<span style="font-size:10px;margin-left:2px;">${METHOD_ICON[nm.method]||'💸'}</span><span style="font-size:10px;color:var(--text-dim);">${METHOD_LBL[nm.method]||nm.method}</span>` : ''}
        </div>` : (nm.method ? `<div style="display:flex;align-items:center;gap:5px;margin-top:6px;"><span style="font-size:12px;">${METHOD_ICON[nm.method]||'💸'}</span><span style="font-size:11px;color:var(--text-muted);">${METHOD_LBL[nm.method]||nm.method}</span></div>` : '')

      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:13px 14px;background:${paid?'rgba(74,222,128,0.04)':urgColor+'0c'};border:1px solid ${paid?'rgba(74,222,128,0.18)':urgColor+'28'};border-radius:12px;margin-bottom:8px;transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 2px 16px rgba(0,0,0,0.25)'" onmouseout="this.style.boxShadow=''">
        ${dayBadge}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:700;color:${paid?'var(--text-muted)':'var(--text-primary)'};${paid?'text-decoration:line-through;opacity:.6;':''}flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(nm.label||n.content)}</span>
            <span style="font-size:9px;padding:2px 7px;border-radius:10px;background:${clr}18;color:${clr};font-weight:700;white-space:nowrap;">${FREQ_LBL[freq]||freq}</span>
          </div>
          ${contactAvatar}
          ${nm.dueDate && !paid ? `<div style="font-size:10px;color:var(--text-dim);margin-top:5px;">Próximo vencimiento: <span style="color:${urgColor};font-weight:600;">${nm.dueDate}</span></div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
          <div style="font-size:${hasAmt?'15':'12'}px;font-weight:${hasAmt?'900':'600'};font-family:'JetBrains Mono',monospace;color:${hasAmt?clr:'var(--text-dim)'}">${hasAmt?fmtM(amt):'Variable'}</div>
          <div style="display:flex;gap:5px;">
            <button onclick="toggleBillPaid('${n.id}')" style="font-size:10px;background:${paid?'rgba(74,222,128,0.15)':'rgba(255,255,255,0.06)'};border:1px solid ${paid?'rgba(74,222,128,0.35)':'rgba(255,255,255,0.12)'};color:${paid?'#4ade80':'var(--text-muted)'};border-radius:6px;padding:3px 9px;cursor:pointer;font-weight:700;">${paid?'✓ Pagado':'Pagar'}</button>
            <button onclick="editAgendaItem('${n.id}')" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text-muted);border-radius:6px;padding:3px 7px;cursor:pointer;font-size:11px;" title="Editar">✏️</button>
            <button onclick="deleteAgendaItem('${n.id}')" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:3px 4px;" title="Eliminar">×</button>
          </div>
        </div>
      </div>`
    }).join('')

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.07em;">📅 PAGOS RECURRENTES</span>
          ${pagosFijos.length > 0 ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(167,139,250,0.12);color:#a78bfa;font-weight:700;">${pagosFijos.length}</span>` : ''}
        </div>
        <button onclick="openAgendaModal('bill','${projSlug}')" style="font-size:11px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:700;">+ Añadir</button>
      </div>
      ${pagosFijos.length === 0
        ? `<div style="text-align:center;padding:24px 16px;color:var(--text-muted);font-size:12px;">
            <div style="font-size:28px;margin-bottom:8px;opacity:.4;">📅</div>
            Sin pagos recurrentes en este proyecto.<br>Agrégalos para llevar control de servicios y compromisos fijos.
           </div>`
        : cards}
      ${pagosFijos.length > 0 ? `
        <div style="margin-top:10px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;gap:16px;">
            <div style="font-size:10px;color:var(--text-muted);">Total periódico: <span style="font-weight:800;color:#a78bfa;font-family:monospace;">${fmtM(totalFijo)}</span></div>
            ${totalPendFijo > 0 ? `<div style="font-size:10px;color:var(--text-muted);">Pendiente: <span style="font-weight:800;color:#fb923c;font-family:monospace;">${fmtM(totalPendFijo)}</span></div>` : ''}
          </div>
          <div style="font-size:9px;color:var(--text-dim);">${pagosFijos.filter(n=>n.metadata?.paid).length} de ${pagosFijos.length} pagados</div>
        </div>` : ''}
    </div>`
  })

  // ── Cotizaciones — cards visuales con historial de pagos ─────────────────────
  const cotsHTML = _s(() => {
    if (!cots.length) return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:16px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">📄</div>
      <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">Sin cotizaciones</div>
      <div style="color:var(--text-dim);font-size:12px;margin-bottom:16px;">Registra las propuestas de proveedores para este proyecto</div>
      <button onclick="openCotizacionModal(null,'${projSlug}')" style="font-size:12px;background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.3);color:#fb923c;border-radius:8px;padding:8px 18px;cursor:pointer;font-weight:700;">+ Nueva Cotización</button>
    </div>`

    const STATUS_CFG = {
      pendiente:  { label:'⏳ Pendiente',   color:'#94a3b8', bg:'rgba(148,163,184,0.08)' },
      aceptada:   { label:'✅ Aceptada',     color:'#4ade80', bg:'rgba(74,222,128,0.08)'  },
      rechazada:  { label:'❌ Rechazada',    color:'#f87171', bg:'rgba(248,113,113,0.08)' },
      en_proceso: { label:'🔄 En proceso',   color:'#60a5fa', bg:'rgba(96,165,250,0.08)'  },
      pagada:     { label:'💰 Pagada',       color:'#a78bfa', bg:'rgba(167,139,250,0.08)' },
      parcial:    { label:'🔶 Pago parcial', color:'#fbbf24', bg:'rgba(251,191,36,0.08)'  },
    }
    const METHOD_ICON = { transferencia:'🏦', efectivo:'💵', tarjeta:'💳', cheque:'📄' }

    const buildCotCard = (c) => {
      const m       = c.metadata || {}
      const stCfg   = STATUS_CFG[m.status] || STATUS_CFG.pendiente
      const prov    = m.provider_id ? allNodes.find(n=>n.id===m.provider_id) : null
      const provName= prov ? esc(prov.metadata?.name || prov.content) : null
      const total   = +(m.amount || 0)
      const abonos  = m.abonos || []
      const pagado  = abonos.reduce((s,a) => s+(+a.amount||0), 0)
      const saldo   = Math.max(0, total - pagado)
      const pct     = total > 0 ? Math.min(100, Math.round(pagado/total*100)) : (pagado>0?100:0)
      const isFullyPaid = pct >= 100

      // Barra de color según avance
      const barColor = pct === 0 ? '#94a3b8' : pct < 50 ? '#fbbf24' : pct < 100 ? '#60a5fa' : '#4ade80'

      // Historial de pagos (máx 5 visibles + "ver más")
      const abonosHTML = abonos.length === 0
        ? `<div style="font-size:11px;color:var(--text-dim);font-style:italic;">Sin pagos registrados</div>`
        : abonos.map((a,i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:6px;margin-bottom:4px;">
              <span style="font-size:13px;flex-shrink:0;">${METHOD_ICON[a.method]||'💸'}</span>
              <span style="font-size:11px;color:#4ade80;font-weight:700;font-family:monospace;flex-shrink:0;">Pago ${i+1}</span>
              <span style="font-size:11px;color:var(--text-muted);flex-shrink:0;">${a.date||''}</span>
              <span style="flex:1;font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.notes||a.method||'')}</span>
              ${a.receipt_url ? `<a href="${esc(a.receipt_url)}" target="_blank" onclick="event.stopPropagation()" title="Ver comprobante" style="color:#60a5fa;font-size:12px;flex-shrink:0;text-decoration:none;">🔗 Comprobante</a>` : ''}
              <span style="font-size:11px;font-weight:800;color:#4ade80;font-family:monospace;flex-shrink:0;">$${(+a.amount).toLocaleString('es-MX')}</span>
            </div>`).join('')

      // Kanban status chip (si tiene tarea vinculada)
      const kanbanNode = allNodes.find(n => n.type==='kanban' && n.metadata?.cot_id===c.id)
      const kanbanChip = kanbanNode ? (() => {
        const kStatus = kanbanNode.metadata?.status || 'todo'
        const kLabels = { todo:'Pendiente', in_progress:'En progreso', doing:'En progreso', done:'Completado' }
        const kColors = { todo:'#94a3b8', in_progress:'#60a5fa', doing:'#60a5fa', done:'#4ade80' }
        return `<span style="font-size:9px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.06);color:${kColors[kStatus]||'#94a3b8'};font-weight:700;border:1px solid ${kColors[kStatus]||'#94a3b8'}33;">🗊 ${kLabels[kStatus]||kStatus}</span>`
      })() : ''

      return `<div style="background:var(--bg-panel);border:1px solid ${stCfg.color}33;border-left:3px solid ${stCfg.color};border-radius:12px;padding:16px;margin-bottom:12px;transition:box-shadow 0.15s;" onmouseover="this.style.boxShadow='0 4px 24px rgba(0,0,0,0.3)'" onmouseout="this.style.boxShadow=''">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px;cursor:pointer;" onclick="openCotizacionModal('${c.id}')">${esc(m.label||c.content)}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:11px;padding:2px 8px;border-radius:5px;background:${stCfg.bg};color:${stCfg.color};font-weight:700;">${stCfg.label}</span>
              ${m.category ? `<span style="font-size:10px;color:var(--text-muted);background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px;">${esc(m.category)}</span>` : ''}
              ${kanbanChip}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;color:#fb923c;">$${total.toLocaleString('es-MX')}</div>
            ${provName ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">👤 ${provName}</div>` : ''}
          </div>
        </div>

        <!-- Barra de progreso de pagos -->
        ${total > 0 || abonos.length > 0 ? `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="font-size:11px;color:var(--text-muted);">💸 Pagos: <b style="color:${barColor};">${abonos.length} registro${abonos.length!==1?'s':''}</b></span>
            <span style="font-size:11px;font-weight:800;color:${barColor};">${pct}% pagado</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width 0.5s;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:5px;">
            <span style="font-size:10px;color:#4ade80;">Pagado: <b>$${pagado.toLocaleString('es-MX')}</b></span>
            ${saldo > 0 ? `<span style="font-size:10px;color:#f87171;">Saldo: <b>$${saldo.toLocaleString('es-MX')}</b></span>` : `<span style="font-size:10px;color:#4ade80;font-weight:700;">✅ Saldado</span>`}
          </div>
        </div>` : ''}

        <!-- Historial de pagos (expandible) -->
        ${abonos.length > 0 ? `
        <details style="margin-bottom:10px;">
          <summary style="font-size:11px;font-weight:700;color:var(--text-muted);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;padding:4px 0;user-select:none;">
            <span>▶</span><span>📋 Historial de pagos (${abonos.length})</span>
          </summary>
          <div style="margin-top:8px;">
            ${abonosHTML}
          </div>
        </details>` : ''}

        ${m.notes ? `<div style="font-size:11px;color:var(--text-muted);background:rgba(255,255,255,0.03);border-radius:6px;padding:6px 10px;margin-bottom:10px;border-left:2px solid rgba(255,255,255,0.1);">📝 ${esc(m.notes)}</div>` : ''}

        <!-- Acciones -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button onclick="openCotizacionModal('${c.id}')" style="font-size:11px;padding:5px 12px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.25);color:#fb923c;border-radius:6px;cursor:pointer;font-weight:600;">✏️ Editar</button>
          ${!isFullyPaid && m.status !== 'rechazada' ? `<button onclick="openCotizacionModal('${c.id}');setTimeout(()=>addCotAbono(),200)" style="font-size:11px;padding:5px 12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);color:#4ade80;border-radius:6px;cursor:pointer;font-weight:600;">+ Registrar pago</button>` : ''}
          ${m.status === 'pendiente' ? `<button onclick="changeCotizacionStatus('${c.id}','aceptada')" style="font-size:11px;padding:5px 12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);color:#4ade80;border-radius:6px;cursor:pointer;">✅ Aceptar</button>` : ''}
          <button onclick="printCotizacion('${c.id}')" style="font-size:11px;padding:5px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:var(--text-muted);border-radius:6px;cursor:pointer;">🖨️ Imprimir</button>
          <div style="flex:1;"></div>
          <span style="font-size:10px;color:var(--text-dim);">${(c.created_at||'').slice(0,10)}</span>
        </div>
      </div>`
    }

    return `<div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;">📄 COTIZACIONES (${cots.length})</span>
        <button onclick="openCotizacionModal(null,'${projSlug}')" style="font-size:11px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.25);color:#fb923c;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:600;">+ Nueva</button>
      </div>
      ${Object.entries(d.cotsByCat).map(([cat,cs]) => `
        <div style="margin-bottom:4px;">
          ${cs.length > 0 && Object.keys(d.cotsByCat).length > 1 ? `<div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:6px;margin-top:4px;text-transform:uppercase;letter-spacing:.08em;padding-left:2px;">${esc(cat)}</div>` : ''}
          ${cs.map(buildCotCard).join('')}
        </div>`).join('')}
    </div>`
  })

  // ── Materiales / compras ──────────────────────────────────
  const matHTML = _s(() => {
    const materiales = [...new Map(pagos.filter(g => !g.metadata?.service_id && !provMap[g.metadata?.contact_id]).map(g=>[g.id,g])).values()]
    if (!materiales.length) return ''
    const total = materiales.reduce((s,g)=>s+(+g.metadata?.amount||0),0)
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <span style="font-size:12px;font-weight:800;color:var(--text-muted);letter-spacing:.06em;">🧱 MATERIALES / COMPRAS</span>
        <span style="font-size:12px;font-weight:800;font-family:monospace;color:#94a3b8;">$${total.toLocaleString('es-MX')}</span>
      </div>
      ${materiales.map(g=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <span style="flex:1;font-size:13px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(g.metadata?.label||g.content)}">${esc(g.metadata?.label||g.content)}</span>
        <span style="font-size:12px;font-weight:800;font-family:monospace;color:#60a5fa;">$${(+g.metadata?.amount||0).toLocaleString('es-MX')}</span>
        <span style="font-size:10px;color:var(--text-muted);flex-shrink:0;">${(g.metadata?.date||g.created_at||'').slice(0,10)}</span>
        <button onclick="deleteNode('${g.id}')" style="background:transparent;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;flex-shrink:0;">×</button>
      </div>`).join('')}
    </div>`
  })

  return dashHTML + provsHTML + pagosFijosHTML + cotsHTML + matHTML
}

// ── TAB: KANBAN INTERNO ──────────────────────────────────────────────────────
function _renderProjKanban(d) {
  const { p, m, tagStr, projSlug } = d
  // Get all task nodes linked to this project
  const linkedIds = new Set(m.linkedTo || [])
  const allTasks = allNodes.filter(n => {
    if (n.type !== 'kanban' && n.type !== 'tarea') return false
    if (linkedIds.has(n.id)) return true
    if (tagStr.some(t => (n.metadata?.project_tag||'').toLowerCase()===t)) return true
    if ((n.metadata?.tags||[]).some(t => tagStr.includes(t.replace(/^#/,'').toLowerCase()))) return true
    return false
  })

  // Columns: default + custom from project metadata
  const customCols = m.kanban_columns || []
  const defaultCols = [
    {id:'todo',        label:'📋 Pendiente',   color:'#94a3b8'},
    {id:'in_progress', label:'⚡ En progreso',  color:'#fbbf24'},
    {id:'done',        label:'✅ Listo',        color:'#4ade80'},
  ]
  const columns = [...defaultCols, ...customCols.map(c=>({id:c.id||c.label?.toLowerCase().replace(/\s/g,'_'), label:c.label, color:c.color||'#60a5fa'}))]

  return `<div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
    <span style="font-size:12px;font-weight:800;color:var(--text-muted);">KANBAN DEL PROYECTO — ${esc(m.label||p.content)}</span>
    <div style="display:flex;gap:8px;">
      <button onclick="addProjKanbanColumn('${p.id}')" style="font-size:12px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">+ Columna</button>
      <button onclick="_projAddKanbanTask('${projSlug}','${p.id}')" style="font-size:12px;background:rgba(0,246,255,0.1);border:1px solid rgba(0,246,255,0.25);color:#00f6ff;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">+ Tarea</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
    ${columns.map(col => {
      const tasks = allTasks.filter(n => {
        const s = n.metadata?.status || 'todo'
        return s === col.id
      })
      return `<div style="background:rgba(255,255,255,0.02);border:1px solid ${col.color}30;border-radius:12px;padding:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span style="font-size:12px;font-weight:700;color:${col.color};">${col.label}</span>
          <span style="font-size:10px;background:${col.color}15;color:${col.color};border-radius:10px;padding:1px 7px;">${tasks.length}</span>
        </div>
        <div class="proj-kanban-col-body" data-status="${col.id}" style="min-height:60px;display:flex;flex-direction:column;gap:6px;">
        ${tasks.length === 0 ? `<div style="text-align:center;padding:20px 12px;color:var(--text-dim);">
          <div style="font-size:24px;margin-bottom:8px;opacity:0.3;">📋</div>
          <div style="font-size:11px;">Arrastra aquí o</div>
          <div style="font-size:11px;">clic en + Agregar</div>
        </div>` :
          tasks.map(t => {
            const PCLR = {alta:'#f87171',media:'#fbbf24',baja:'#4ade80','1':'#f87171'}
            const pClr = PCLR[t.metadata?.priority] || ''
            const today2 = new Date().toISOString().split('T')[0]
            const lbl = t.metadata?.label_color ? LABEL_COLORS[t.metadata.label_color] : null
            const ck  = t.metadata?.checklist || []
            const ckDone = ck.filter(c=>c.done).length
            const hasCover = t.metadata?.cover_url
            const hasAttach = t.metadata?.attachments?.length > 0
            return `<div data-task-id="${t.id}" style="background:var(--bg-panel);border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;cursor:pointer;position:relative;transition:border-color 0.15s, transform 0.1s;" onmouseover="this.style.borderColor='rgba(255,255,255,0.18)';this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.07)';this.style.transform=''" title="Arrastrar para mover · Click ✏️ para editar">
              ${lbl ? `<div style="height:3px;background:${lbl};"></div>` : ''}
              ${hasCover ? `<img src="${t.metadata.cover_url}" style="width:100%;height:100px;object-fit:cover;object-position:center;" onerror="this.style.display='none'" />` : ''}
              <div style="padding:10px 12px;">
                <button onclick="event.stopPropagation();openProjTaskModal('${projSlug}','${p.id}','${t.id}')" style="position:absolute;top:${lbl?'8':'6'}px;right:6px;background:none;border:none;cursor:pointer;font-size:12px;opacity:0.4;" title="Editar tarea">✏️</button>
                <div onclick="_projMoveTask('${t.id}','${col.id}','${p.id}')">
                  <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:4px;padding-right:20px;line-height:1.4;">${esc(t.metadata?.label||t.content)}</div>
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">
                    ${t.metadata?.priority ? `<span style="font-size:10px;background:${pClr}25;color:${pClr||'#fbbf24'};border-radius:4px;padding:1px 6px;font-weight:700;">⚑ ${t.metadata.priority}</span>` : ''}
                    ${t.metadata?.deadline ? `<span style="font-size:10px;color:${t.metadata.deadline<today2?'#f87171':'var(--text-dim)'};">📅 ${t.metadata.deadline}</span>` : ''}
                    ${hasAttach ? `<span style="font-size:10px;color:var(--text-muted);">📎 ${t.metadata.attachments.length}</span>` : ''}
                  </div>
                  ${ck.length > 0 ? `<div style="margin-top:6px;">
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:2px;"><span>☑️ ${ckDone}/${ck.length}</span></div>
                    <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${ck.length?Math.round(ckDone/ck.length*100):0}%;background:#4ade80;border-radius:2px;"></div></div>
                  </div>` : ''}
                </div>
              </div>
            </div>`
          }).join('')}
        </div>
        <button onclick="_projAddKanbanTask('${projSlug}','${p.id}','${col.id}')" style="width:100%;margin-top:8px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.1);color:var(--text-dim);border-radius:7px;padding:6px;cursor:pointer;font-size:12px;">+ Agregar</button>
      </div>`
    }).join('')}
  </div>`
}

// ── SortableJS init for project Kanban ───────────────────────────────────────
function initProjKanbanSortable(projId) {
  document.querySelectorAll('.proj-kanban-col-body').forEach(col => {
    if (col._sortable) { try { col._sortable.destroy() } catch (e) {} }
    col._sortable = new Sortable(col, {
      group: 'proj-kanban-' + (projId || 'default'),
      animation: 150,
      ghostClass: 'kanban-ghost',
      chosenClass: 'kanban-chosen',
      dragClass: 'kanban-drag',
      delay: 50,
      delayOnTouchOnly: true,
      onEnd: async (evt) => {
        const taskId = evt.item.dataset.taskId
        const newStatus = evt.to.dataset.status
        if (!taskId || !newStatus) return
        const proj = allNodes.find(n => n.id === projId)
        if (!proj) return
        // Try embedded tasks first, then linked nodes
        const tasks = proj.metadata?.kanban_tasks || []
        const task = tasks.find(t => t.id === taskId)
        try {
          if (task) {
            task.status = newStatus
            proj.metadata.kanban_tasks = tasks
            if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
              await supabase.from('nodes').update({ metadata: proj.metadata }).eq('id', proj.id)
            }
          } else {
            const taskNode = allNodes.find(n => n.id === taskId)
            if (taskNode) {
              taskNode.metadata = taskNode.metadata || {}
              taskNode.metadata.status = newStatus
              if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
                await updateNodeMetadata(taskId, taskNode.metadata)
              }
            }
          }
        } catch (e) { /* state already mutated locally; offline-safe */ }
      }
    })
  })
}

window.addProjKanbanColumn = async (projId) => {
  const name = prompt('Nombre de la nueva columna:')
  if (!name?.trim()) return
  const proj = allNodes.find(n => n.id === projId)
  if (!proj) return
  const cols = proj.metadata?.kanban_columns || []
  if (cols.length >= 3) { showMsg('⚠ Máximo 6 columnas totales (3 por defecto + 3 personalizadas)'); return }
  cols.push({ id: name.trim().toLowerCase().replace(/\s+/g,'_') + '_' + Date.now(), label: name.trim(), color: '#a78bfa' })
  proj.metadata.kanban_columns = cols
  await supabase.from('nodes').update({ metadata: proj.metadata }).eq('id', proj.id)
  renderProyectos()
}

// ── Kanban drag & drop ────────────────────────────────────────────────────────
let _projKanbanDragId = null

window.projKanbanDragStart = function(e, taskId) {
  _projKanbanDragId = taskId
  e.dataTransfer.effectAllowed = 'move'
}

window.projKanbanDrop = async function(e, newStatus) {
  e.preventDefault()
  if (!_projKanbanDragId || !_projDashId) return
  const proj = allNodes.find(n => n.id === _projDashId)
  if (!proj) return
  // Support both embedded kanban_tasks and linked task nodes
  const tasks = proj.metadata?.kanban_tasks || []
  const task = tasks.find(t => t.id === _projKanbanDragId)
  if (task) {
    task.status = newStatus
    proj.metadata.kanban_tasks = tasks
    await supabase.from('nodes').update({ metadata: proj.metadata }).eq('id', proj.id)
  } else {
    // Try as a standalone kanban/tarea node
    const taskNode = allNodes.find(n => n.id === _projKanbanDragId)
    if (taskNode) {
      taskNode.metadata = taskNode.metadata || {}
      taskNode.metadata.status = newStatus
      await supabase.from('nodes').update({ metadata: taskNode.metadata }).eq('id', taskNode.id)
    }
  }
  _projKanbanDragId = null
  renderProyectos()
}

// ── TAB: NOTAS ───────────────────────────────────────────────────────────────
function _renderProjNotas(d) {
  const { p, m, tagStr, projSlug } = d
  const linkedIds = new Set(m.linkedTo || [])
  const notes = allNodes.filter(n => {
    if (n.type !== 'nota' && n.type !== 'note') return false
    if (linkedIds.has(n.id)) return true
    if (tagStr.some(t => (n.metadata?.project_tag||'').toLowerCase()===t)) return true
    if ((n.metadata?.tags||[]).some(t => tagStr.includes(t.replace(/^#/,'').toLowerCase()))) return true
    return false
  })
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <span style="font-size:12px;font-weight:800;color:var(--text-muted);">NOTAS DEL PROYECTO (${notes.length})</span>
    <button onclick="openProjNoteModal('${projSlug}','${p.id}',null)" style="font-size:12px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;border-radius:7px;padding:5px 12px;cursor:pointer;font-weight:600;">+ Nueva nota</button>
  </div>
  ${notes.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text-dim);">
    <div style="font-size:32px;margin-bottom:12px;">🧠</div>
    <div style="font-size:14px;">Sin notas para este proyecto</div>
    <div style="font-size:12px;margin-top:6px;color:var(--text-dim);">Las notas que crees aquí quedan exclusivamente dentro del proyecto.</div>
  </div>` :
  `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
    ${notes.map(n => {
      const m = n.metadata || {}
      const imgs = m.images || []
      const src = imgs.length ? (typeof imgs[0]==='string'?imgs[0]:imgs[0].url||'') : ''
      const title = m.label || n.content?.split('\n')[0]?.slice(0,60) || 'Sin título'
      // Bóveda Neural-style bg color support
      const noteColor = m.color || m.bg_color || ''
      const noteCssMap = (typeof NOTE_COLORS !== 'undefined') ? NOTE_COLORS : {}
      const colorCss = noteCssMap[noteColor] || ''
      const baseStyle = colorCss
        ? colorCss
        : `background:var(--surface);border-color:var(--border);`
      // Markdown-lite preview: bold + headers
      const rawBody = (n.content || '').replace(/^#\s+(.+)$/gm, '$1').slice(0, 200)
      const previewBody = esc(rawBody)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, ' ')
      return `<div onclick="openProjNoteModal('${projSlug}','${p.id}','${n.id}')" style="${baseStyle}border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;transition:all .2s;"
        onmouseenter="this.style.borderColor='rgba(167,139,250,0.4)'"
        onmouseleave="this.style.borderColor='var(--border)'">
        ${src?`<img src="${src}" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-bottom:10px;" onerror="this.style.display='none'" />`:''}
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">${esc(title)}</div>
        <div style="font-size:11px;color:var(--text-muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${previewBody}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:8px;">${(n.created_at||'').slice(0,10)}</div>
      </div>`
    }).join('')}
  </div>`}`
}

// ── TAB: WIKI ────────────────────────────────────────────────────────────────
let _wikiMode = 'edit'

function _renderProjWiki(d) {
  const { p, m } = d
  const wiki = m.wiki || {}
  const content = wiki.content || ''
  const attachments = wiki.attachments || []
  const sections = wiki.sections || []

  const attachHtml = attachments.map((a, i) => {
    const icon = a.type === 'image' ? '🖼' : a.type === 'pdf' ? '📄' : a.type === 'drive' ? '📁' : '🔗'
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:6px;">
      <span style="font-size:18px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name)}</div>
        <a href="${esc(a.url)}" target="_blank" style="font-size:11px;color:var(--accent-cyan);text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${esc(a.url.length > 60 ? a.url.slice(0,60)+'…' : a.url)}</a>
      </div>
      <button onclick="removeWikiAttachment('${p.id}',${i})" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:14px;flex-shrink:0;opacity:0.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="Eliminar">✕</button>
    </div>`
  }).join('')

  const sectionListHtml = sections.length === 0
    ? `<div style="font-size:12px;color:var(--text-dim);">Agrega encabezados (#, ##) en el editor para crear secciones automáticas.</div>`
    : sections.map(s => `<div onclick="scrollToWikiSection('${s.replace(/'/g,"\\'")}' )" style="font-size:12px;color:var(--text-muted);padding:4px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px;${s.startsWith('###')?'padding-left:24px':s.startsWith('##')?'padding-left:16px':''}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">${s.replace(/^#+\s*/,'')}</div>`).join('')

  return `
  <div style="display:grid;grid-template-columns:220px 1fr;gap:20px;min-height:500px;">
    <!-- SIDEBAR -->
    <div style="border-right:1px solid rgba(255,255,255,0.06);padding-right:16px;">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;margin-bottom:12px;">📑 SECCIONES</div>
      <div id="wiki-sections-list">${sectionListHtml}</div>
      <div style="margin-top:24px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;margin-bottom:10px;">📎 ADJUNTOS (${attachments.length})</div>
        <div id="wiki-attach-list">${attachHtml}</div>
        <!-- Add link -->
        <div style="margin-top:8px;">
          <input type="text" id="wiki-link-name" placeholder="Nombre del enlace" class="modal-input" style="font-size:12px;margin-bottom:6px;" />
          <input type="text" id="wiki-link-url" placeholder="URL (Google Drive, web...)" class="modal-input" style="font-size:12px;margin-bottom:6px;" />
          <button onclick="addWikiLink('${p.id}')" class="btn-primary" style="width:100%;padding:6px;font-size:12px;">+ Agregar enlace</button>
        </div>
        <!-- Add file -->
        <label style="display:block;margin-top:8px;cursor:pointer;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.1);border-radius:8px;padding:8px;text-align:center;font-size:12px;color:var(--text-dim);">
          📁 Subir imagen/PDF
          <input type="file" accept="image/*,.pdf" style="display:none;" onchange="addWikiFile('${p.id}',this)" />
        </label>
      </div>
    </div>
    <!-- EDITOR / PREVIEW -->
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;gap:8px;">
          <button onclick="setWikiMode('edit')" id="wiki-btn-edit"
            style="font-size:12px;padding:6px 14px;border-radius:7px;cursor:pointer;font-weight:600;background:rgba(0,246,255,0.15);border:1px solid var(--accent-cyan);color:var(--accent-cyan);">✏️ Editar</button>
          <button onclick="setWikiMode('preview')" id="wiki-btn-preview"
            style="font-size:12px;padding:6px 14px;border-radius:7px;cursor:pointer;font-weight:600;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text-muted);">👁 Vista previa</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:11px;color:var(--text-dim);">Soporta Markdown</span>
          <button onclick="saveWiki('${p.id}')" style="font-size:12px;background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.3);color:#4ade80;border-radius:7px;padding:6px 16px;cursor:pointer;font-weight:700;">💾 Guardar</button>
        </div>
      </div>
      <div id="wiki-editor-area">
        <textarea id="wiki-content-input"
          placeholder="# Nombre del Proyecto

## Descripción
Escribe aquí la descripción completa del proyecto...

## Objetivos
- Objetivo 1
- Objetivo 2

## Recursos
[Google Drive](https://drive.google.com/...) — Carpeta del proyecto"
          style="width:100%;min-height:450px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:16px;color:var(--text-primary);font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;resize:vertical;outline:none;box-sizing:border-box;"
          oninput="updateWikiSections()">${esc(content)}</textarea>
      </div>
      <div id="wiki-preview-area" style="display:none;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 20px;min-height:450px;line-height:1.7;"></div>
    </div>
  </div>`
}

function _wikiMdToHtml(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^# (.+)$/gm,'<h1 style="font-size:20px;font-weight:800;color:var(--accent-cyan);margin:16px 0 8px;" id="ws-$1">$1</h1>')
    .replace(/^## (.+)$/gm,'<h2 style="font-size:16px;font-weight:700;color:#a78bfa;margin:14px 0 6px;" id="ws-$1">$1</h2>')
    .replace(/^### (.+)$/gm,'<h3 style="font-size:14px;font-weight:700;color:#60a5fa;margin:12px 0 4px;" id="ws-$1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em style="color:#fbbf24;">$1</em>')
    .replace(/`([^`]+)`/g,'<code style="background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>')
    .replace(/^- (.+)$/gm,'<li style="margin:3px 0;padding-left:4px;">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>(\n)?)+/g,s=>`<ul style="list-style:disc;padding-left:20px;margin:8px 0;">${s}</ul>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" style="color:var(--accent-cyan);text-decoration:underline;">$1</a>')
    .replace(/\n\n/g,'<br/><br/>')
}

window.setWikiMode = (mode) => {
  _wikiMode = mode
  const editor = document.getElementById('wiki-editor-area')
  const preview = document.getElementById('wiki-preview-area')
  const btnEdit = document.getElementById('wiki-btn-edit')
  const btnPrev = document.getElementById('wiki-btn-preview')
  if (mode === 'preview') {
    const text = document.getElementById('wiki-content-input')?.value || ''
    const lines = text.split('\n').filter(l => /^#{1,3}\s/.test(l))
    const secEl = document.getElementById('wiki-sections-list')
    if (secEl) {
      secEl.innerHTML = lines.length === 0
        ? '<div style="font-size:12px;color:var(--text-dim);">Sin secciones todavía.</div>'
        : lines.map(l => `<div onclick="scrollToWikiSection('${l.replace(/'/g,"\\'")}' )" style="font-size:12px;color:var(--text-muted);padding:4px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px;${l.startsWith('###')?'padding-left:24px':l.startsWith('##')?'padding-left:16px':''}" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">${l.replace(/^#+\s*/,'')}</div>`).join('')
    }
    if (preview) {
      preview.innerHTML = _wikiMdToHtml(text) || '<p style="color:var(--text-dim);">Sin contenido. Escribe en el editor.</p>'
    }
    if (editor) editor.style.display = 'none'
    if (preview) preview.style.display = 'block'
    if (btnEdit) { btnEdit.style.background='rgba(255,255,255,0.05)'; btnEdit.style.borderColor='rgba(255,255,255,0.1)'; btnEdit.style.color='var(--text-muted)' }
    if (btnPrev) { btnPrev.style.background='rgba(0,246,255,0.15)'; btnPrev.style.borderColor='var(--accent-cyan)'; btnPrev.style.color='var(--accent-cyan)' }
  } else {
    if (editor) editor.style.display = 'block'
    if (preview) preview.style.display = 'none'
    if (btnEdit) { btnEdit.style.background='rgba(0,246,255,0.15)'; btnEdit.style.borderColor='var(--accent-cyan)'; btnEdit.style.color='var(--accent-cyan)' }
    if (btnPrev) { btnPrev.style.background='rgba(255,255,255,0.05)'; btnPrev.style.borderColor='rgba(255,255,255,0.1)'; btnPrev.style.color='var(--text-muted)' }
  }
}

window.updateWikiSections = () => {
  const text = document.getElementById('wiki-content-input')?.value || ''
  const lines = text.split('\n').filter(l => /^#{1,3}\s/.test(l))
  const el = document.getElementById('wiki-sections-list')
  if (!el) return
  el.innerHTML = lines.length === 0
    ? '<div style="font-size:12px;color:var(--text-dim);">Agrega encabezados (#, ##) para crear secciones.</div>'
    : lines.map(l => `<div style="font-size:12px;color:var(--text-muted);padding:4px 8px;border-radius:6px;margin-bottom:2px;${l.startsWith('###')?'padding-left:24px':l.startsWith('##')?'padding-left:16px':''}">${l.replace(/^#+\s*/,'')}</div>`).join('')
}

window.saveWiki = async (projId) => {
  const proj = allNodes.find(n => n.id === projId)
  if (!proj) return
  const content = document.getElementById('wiki-content-input')?.value || ''
  const wiki = proj.metadata?.wiki || {}
  wiki.content = content
  wiki.updated_at = new Date().toISOString()
  // Extract sections for sidebar
  wiki.sections = content.split('\n').filter(l => /^#{1,3}\s/.test(l))
  proj.metadata.wiki = wiki
  await supabase.from('nodes').update({ metadata: proj.metadata }).eq('id', proj.id)
  showMsg('✓ Wiki guardada')
}

window.addWikiLink = async (projId) => {
  const nameEl = document.getElementById('wiki-link-name')
  const urlEl  = document.getElementById('wiki-link-url')
  const name = nameEl?.value.trim()
  const url  = urlEl?.value.trim()
  if (!name || !url) { showMsg('⚠ Nombre y URL requeridos'); return }
  const proj = allNodes.find(n => n.id === projId)
  if (!proj) return
  proj.metadata.wiki = proj.metadata.wiki || {}
  proj.metadata.wiki.attachments = proj.metadata.wiki.attachments || []
  const type = (url.includes('drive.google.com') || url.includes('docs.google')) ? 'drive' : 'link'
  proj.metadata.wiki.attachments.push({ name, url, type })
  await supabase.from('nodes').update({ metadata: proj.metadata }).eq('id', proj.id)
  if (nameEl) nameEl.value = ''
  if (urlEl)  urlEl.value  = ''
  showMsg('✓ Enlace agregado')
  switchProjTab('wiki')
}

window.addWikiFile = async (projId, input) => {
  const file = input?.files?.[0]
  if (!file) return
  const proj = allNodes.find(n => n.id === projId)
  if (!proj) return
  proj.metadata.wiki = proj.metadata.wiki || {}
  proj.metadata.wiki.attachments = proj.metadata.wiki.attachments || []
  let dataUrl
  if (file.type.startsWith('image/')) {
    dataUrl = await new Promise(res => {
      const r = new FileReader()
      const canvas = document.createElement('canvas')
      const img = new Image()
      r.onload = e => {
        img.onload = () => {
          const MAX = 800
          let w = img.width, h = img.height
          if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
          canvas.width = w; canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          res(canvas.toDataURL('image/jpeg', 0.75))
        }
        img.src = e.target.result
      }
      r.readAsDataURL(file)
    })
    proj.metadata.wiki.attachments.push({ name: file.name, url: dataUrl, type: 'image' })
  } else {
    dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(file) })
    proj.metadata.wiki.attachments.push({ name: file.name, url: dataUrl, type: 'pdf' })
  }
  await supabase.from('nodes').update({ metadata: proj.metadata }).eq('id', proj.id)
  showMsg('✓ Archivo adjunto')
  switchProjTab('wiki')
}

window.removeWikiAttachment = async (projId, idx) => {
  const proj = allNodes.find(n => n.id === projId)
  if (!proj?.metadata?.wiki?.attachments) return
  proj.metadata.wiki.attachments.splice(idx, 1)
  await supabase.from('nodes').update({ metadata: proj.metadata }).eq('id', proj.id)
  switchProjTab('wiki')
}

window.scrollToWikiSection = (heading) => {
  const preview = document.getElementById('wiki-preview-area')
  if (!preview || preview.style.display === 'none') {
    setWikiMode('preview')
    setTimeout(() => scrollToWikiSection(heading), 100)
    return
  }
  const cleanHeading = heading.replace(/^#+\s*/,'')
  const id = 'ws-' + cleanHeading
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── Notas nativas de proyecto ──────────────────────────────────────────────────
window.openProjNoteModal = (projSlug, projId, noteId = null) => {
  document.getElementById('pn-proj-slug').value = projSlug
  document.getElementById('pn-proj-id').value   = projId
  document.getElementById('pn-node-id').value   = noteId || ''
  const note = noteId ? allNodes.find(n => n.id === noteId) : null
  document.getElementById('pn-title').value = note ? (note.metadata?.label || note.content?.split('\n')[0] || '') : ''
  document.getElementById('pn-body').value  = note ? note.content : ''
  const delBtn = document.getElementById('pn-delete-btn')
  if (delBtn) delBtn.style.display = note ? 'block' : 'none'
  document.getElementById('proj-note-modal').classList.remove('hidden')
  // Initialize rich editor (idempotent)
  buildRichEditor('pn-body', 'pn-toolbar')
  syncRichEditor('pn-body')
  setTimeout(() => (_richEditors['pn-body'] || document.getElementById('pn-body'))?.focus(), 100)
}

window.closeProjNoteModal = () => document.getElementById('proj-note-modal').classList.add('hidden')

window.saveProjNote = async () => {
  const projSlug = document.getElementById('pn-proj-slug').value
  const projId   = document.getElementById('pn-proj-id').value
  const noteId   = document.getElementById('pn-node-id').value || null
  const title    = document.getElementById('pn-title').value.trim()
  const body     = document.getElementById('pn-body').value
  if (!body.trim() && !title) { showToast('⚠️ Escribe algo antes de guardar'); return }
  const meta = {
    label: title || body.split('\n')[0].slice(0,60),
    project_tag: projSlug,
    tags: ['#'+projSlug],
  }
  if (noteId) {
    const note = allNodes.find(n => n.id === noteId)
    if (note) { note.content = body; note.metadata = { ...note.metadata, ...meta } }
    if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
      await supabase.from('nodes').update({ content:body, metadata:note?.metadata }).eq('id', noteId)
  } else {
    if (localStorage.getItem('nexus_admin_bypass') === 'true') {
      const tmp = { id:Math.random().toString(36).substr(2,9), type:'note', content:body, metadata:meta, created_at:new Date().toISOString() }
      allNodes.unshift(tmp)
      await autoLinkToProject(tmp.id, projSlug)
    } else {
      const { data } = await supabase.from('nodes').insert({ owner_id:currentUser?.id, type:'note', content:body, metadata:meta }).select()
      if (data?.[0]) { allNodes.unshift(data[0]); await autoLinkToProject(data[0].id, projSlug) }
    }
  }
  closeProjNoteModal()
  showToast(noteId ? '✏️ Nota actualizada' : '🧠 Nota guardada en el proyecto')
  openProjectDashboard(projId)
}

window.deleteProjNote = async () => {
  const noteId = document.getElementById('pn-node-id').value
  const projId = document.getElementById('pn-proj-id').value
  if (!noteId) return
  if (!confirm('¿Eliminar esta nota?')) return
  allNodes = allNodes.filter(n => n.id !== noteId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
    await supabase.from('nodes').delete().eq('id', noteId)
  closeProjNoteModal()
  showToast('🗑️ Nota eliminada')
  openProjectDashboard(projId)
}

// ── Helpers for project kanban ────────────────────────────────────────────────
// Open kanban task modal (create or edit)
window._projAddKanbanTask = (projSlug, projId, colId = 'todo') => {
  openProjTaskModal(projSlug, projId, null, colId)
}

window.openProjTaskModal = (projSlug, projId, taskId = null, colId = 'todo') => {
  document.getElementById('pt-proj-slug').value = projSlug
  document.getElementById('pt-proj-id').value   = projId
  document.getElementById('pt-task-id').value   = taskId || ''
  document.getElementById('pt-col-id').value    = colId
  const task = taskId ? allNodes.find(n => n.id === taskId) : null
  const m    = task?.metadata || {}
  document.getElementById('proj-task-modal-title').textContent = task ? '✅ Editar Tarea' : '✅ Nueva Tarea'
  document.getElementById('pt-name').value     = task ? (m.label || task.content) : ''
  document.getElementById('pt-status').value   = m.status || colId || 'todo'
  document.getElementById('pt-priority').value = m.priority || ''
  document.getElementById('pt-deadline').value = m.deadline || ''
  document.getElementById('pt-notes').value    = m.notes || ''
  // Label
  setPtLabel(m.label_color || '')
  // Cover
  const coverUrl = m.cover_url || ''
  document.getElementById('pt-cover-url').value = coverUrl
  const hidden = document.getElementById('pt-cover-val')
  if (hidden) hidden.value = coverUrl
  if (coverUrl) { document.getElementById('pt-cover-img').src=coverUrl; document.getElementById('pt-cover-area').style.display='block' }
  else document.getElementById('pt-cover-area').style.display='none'
  // Checklist
  document.getElementById('pt-checklist-items').innerHTML = ''
  document.getElementById('pt-checklist-progress').style.display = 'none'
  if (m.checklist?.length) renderPtChecklist(m.checklist)
  // Attachments
  document.getElementById('pt-attachments-list').innerHTML = ''
  if (m.attachments?.length) renderPtAttachments(m.attachments)
  const delBtn = document.getElementById('pt-delete-btn')
  if (delBtn) delBtn.style.display = task ? 'block' : 'none'
  document.getElementById('proj-task-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('pt-name')?.focus(), 100)
}

window.closeProjTaskModal = () => document.getElementById('proj-task-modal').classList.add('hidden')

const LABEL_COLORS = { rojo:'#f87171', naranja:'#fb923c', amarillo:'#fbbf24', verde:'#4ade80', cyan:'#2dd4bf', azul:'#60a5fa', morado:'#a78bfa' }

window.setPtLabel = (lbl) => {
  document.getElementById('pt-label').value = lbl
  document.querySelectorAll('#pt-label-picker [data-lbl]').forEach(el => {
    el.style.border = el.dataset.lbl === lbl ? '2px solid #fff' : '2px solid transparent'
  })
}

window.previewPtCover = (url) => {
  const area = document.getElementById('pt-cover-area')
  const img  = document.getElementById('pt-cover-img')
  const hidden = document.getElementById('pt-cover-val')
  if (url && url.trim()) {
    img.src = url.trim(); area.style.display='block'; if (hidden) hidden.value = url.trim()
  } else {
    area.style.display='none'; if (hidden) hidden.value=''
  }
}

window.clearPtCover = () => {
  document.getElementById('pt-cover-area').style.display='none'
  document.getElementById('pt-cover-img').src=''
  document.getElementById('pt-cover-url').value=''
  const hidden = document.getElementById('pt-cover-val')
  if (hidden) hidden.value=''
}

window.addPtCheckItem = (text='', done=false) => {
  const container = document.getElementById('pt-checklist-items')
  const div = document.createElement('div')
  div.style.cssText = 'display:flex;align-items:center;gap:8px;'
  div.innerHTML = `
    <input type="checkbox" ${done?'checked':''} onchange="updatePtCheckProgress()" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;" />
    <input type="text" value="${esc(text)}" class="modal-input" placeholder="Describir tarea..." style="flex:1;padding:5px 8px;" oninput="updatePtCheckProgress()" />
    <button onclick="this.parentElement.remove();updatePtCheckProgress()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;flex-shrink:0;">×</button>`
  container.appendChild(div)
  updatePtCheckProgress()
  div.querySelector('input[type=text]').focus()
}

window.renderPtChecklist = (items) => {
  document.getElementById('pt-checklist-items').innerHTML = ''
  items.forEach(it => addPtCheckItem(it.text||it, it.done||false))
}

window.updatePtCheckProgress = () => {
  const items = document.querySelectorAll('#pt-checklist-items > div')
  const total = items.length
  const done  = Array.from(items).filter(d => d.querySelector('input[type=checkbox]')?.checked).length
  const prog  = document.getElementById('pt-checklist-progress')
  if (total === 0) { prog.style.display='none'; return }
  prog.style.display='block'
  document.getElementById('pt-ck-label').textContent = `${done}/${total}`
  document.getElementById('pt-ck-bar').style.width = `${Math.round(done/total*100)}%`
}

window.addPtAttachment = (url='', name='') => {
  const container = document.getElementById('pt-attachments-list')
  const div = document.createElement('div')
  div.style.cssText = 'display:flex;align-items:center;gap:8px;'
  div.innerHTML = `
    <input type="url" value="${esc(url)}" class="modal-input" placeholder="https://..." style="flex:1;padding:5px 8px;font-size:12px;" />
    <input type="text" value="${esc(name)}" class="modal-input" placeholder="Nombre" style="width:120px;padding:5px 8px;font-size:12px;" />
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;flex-shrink:0;">×</button>`
  container.appendChild(div)
  div.querySelector('input[type=url]').focus()
}

window.renderPtAttachments = (attachments) => {
  document.getElementById('pt-attachments-list').innerHTML = ''
  attachments.forEach(a => addPtAttachment(a.url||a, a.name||''))
}

window.getPtChecklist = () => {
  return Array.from(document.querySelectorAll('#pt-checklist-items > div')).map(d => ({
    text: d.querySelector('input[type=text]')?.value || '',
    done: d.querySelector('input[type=checkbox]')?.checked || false,
  })).filter(it => it.text.trim())
}

window.getPtAttachments = () => {
  return Array.from(document.querySelectorAll('#pt-attachments-list > div')).map(d => ({
    url:  d.querySelectorAll('input')[0]?.value || '',
    name: d.querySelectorAll('input')[1]?.value || '',
  })).filter(a => a.url.trim())
}

window.saveProjTask = async () => {
  const projSlug = document.getElementById('pt-proj-slug').value
  const projId   = document.getElementById('pt-proj-id').value
  const taskId   = document.getElementById('pt-task-id').value || null
  const name     = document.getElementById('pt-name').value.trim()
  if (!name) { showToast('⚠️ El nombre es obligatorio'); return }
  const checklist   = getPtChecklist()
  const attachments = getPtAttachments()
  const coverUrl    = document.getElementById('pt-cover-val')?.value || document.getElementById('pt-cover-url')?.value || ''
  const labelColor  = document.getElementById('pt-label')?.value || ''
  const meta = {
    label:       name,
    status:      document.getElementById('pt-status').value || 'todo',
    priority:    document.getElementById('pt-priority').value || undefined,
    deadline:    document.getElementById('pt-deadline').value || undefined,
    notes:       document.getElementById('pt-notes').value.trim() || undefined,
    label_color: labelColor || undefined,
    cover_url:   coverUrl || undefined,
    checklist:   checklist.length ? checklist : undefined,
    attachments: attachments.length ? attachments : undefined,
    project_tag: projSlug,
    tags: ['#'+projSlug, '#tarea'],
  }
  if (taskId) {
    // Update existing
    const task = allNodes.find(n => n.id === taskId)
    if (task) { task.content = name; task.metadata = { ...task.metadata, ...meta } }
    if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
      await supabase.from('nodes').update({ content:name, metadata:{ ...task?.metadata } }).eq('id', taskId)
  } else {
    // Create new
    if (localStorage.getItem('nexus_admin_bypass') === 'true') {
      const tmp = { id: Math.random().toString(36).substr(2,9), type:'kanban', content:name, metadata:meta, created_at:new Date().toISOString() }
      allNodes.unshift(tmp)
      autoLinkToProject(tmp.id, projSlug)
    } else {
      const { data } = await supabase.from('nodes').insert({ owner_id:currentUser?.id, type:'kanban', content:name, metadata:meta }).select()
      if (data?.[0]) { allNodes.unshift(data[0]); await autoLinkToProject(data[0].id, projSlug) }
    }
  }
  closeProjTaskModal()
  showToast(taskId ? '✏️ Tarea actualizada' : '✅ Tarea creada')
  openProjectDashboard(projId)
}

window.deleteProjTask = async () => {
  const taskId = document.getElementById('pt-task-id').value
  const projId = document.getElementById('pt-proj-id').value
  if (!taskId) return
  if (!confirm('¿Eliminar esta tarea?')) return
  allNodes = allNodes.filter(n => n.id !== taskId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
    await supabase.from('nodes').delete().eq('id', taskId)
  closeProjTaskModal()
  showToast('🗑️ Tarea eliminada')
  openProjectDashboard(projId)
}

window._projMoveTask = async (taskId, currentColId, projId) => {
  // Cycle through statuses on click (pending → in_progress → done → pending)
  const CYCLE = ['todo','in_progress','done']
  const task = allNodes.find(n => n.id === taskId); if (!task) return
  const current = task.metadata?.status || 'todo'
  const nextIdx = (CYCLE.indexOf(current) + 1) % CYCLE.length
  task.metadata = { ...task.metadata, status: CYCLE[nextIdx] }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
    await supabase.from('nodes').update({ metadata:task.metadata }).eq('id', taskId)
  switchProjTab('kanban')
}


// ═══════════════════════════════════════════════════════════
// REPORTE DE PROYECTO — Impresión aislada
// ═══════════════════════════════════════════════════════════
// IMPORT TEMPLATES (CSV)
// ═══════════════════════════════════════════════════════════

window.downloadTemplate = (type) => {
  const TEMPLATES = {
    transactions: 'fecha,descripcion,monto,tipo,cuenta,categoria\n2026-05-01,Pago renta,5000,gasto,efectivo,Renta\n2026-05-05,Honorarios cliente,15000,ingreso,bbva,Servicios',
    contacts: 'nombre,tipo,telefono,email,especialidad,notas\nJuan Electricista,proveedor,6681234567,juan@email.com,Electricidad,Confiable',
    projects: 'nombre,categoria,presupuesto,fase,descripcion,etiqueta\nCasa Tulum,inmueble,500000,planning,Remodelacion completa,casatulum',
  }
  const NAMES = { transactions:'plantilla_transacciones.csv', contacts:'plantilla_contactos.csv', projects:'plantilla_proyectos.csv' }
  const blob = new Blob([TEMPLATES[type]], {type:'text/csv;charset=utf-8;'})
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=NAMES[type]; a.click()
}

window.importTemplate = async (type, input) => {
  const file = input.files?.[0]; if (!file) return
  const text = await file.text()
  const lines = text.trim().split('\n').filter(l=>l.trim())
  if (lines.length < 2) { showToast('⚠️ El archivo está vacío o no tiene datos'); return }
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase())
  const rows = lines.slice(1).map(l => {
    const vals = l.split(',')
    return headers.reduce((o,h,i) => { o[h]=(vals[i]||'').trim(); return o }, {})
  })
  const REQUIRED = {
    transactions: ['fecha','descripcion','monto','tipo'],
    contacts: ['nombre','tipo'],
    projects: ['nombre'],
  }
  const missing = (REQUIRED[type]||[]).filter(r => !headers.includes(r))
  if (missing.length) { showToast(`⚠️ Faltan columnas: ${missing.join(', ')}`); input.value=''; return }
  const area = document.getElementById('import-preview-area')
  if (area) {
    area.style.display='block'
    const safeRows = JSON.stringify(rows)
    area.innerHTML = `<div style="background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:10px;padding:14px;">
      <div style="font-size:12px;font-weight:700;color:#60a5fa;margin-bottom:10px;">Vista previa — ${rows.length} registros encontrados</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">Primeros 3 registros:</div>
      ${rows.slice(0,3).map(r=>`<div style="font-size:11px;background:rgba(0,0,0,0.2);border-radius:6px;padding:6px 10px;margin-bottom:4px;font-family:'JetBrains Mono',monospace;">${esc(JSON.stringify(r))}</div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button onclick="document.getElementById('import-preview-area').style.display='none'" class="btn-ghost" style="font-size:12px;padding:8px 14px;">Cancelar</button>
        <button id="confirm-import-btn" class="btn-primary" style="font-size:12px;padding:8px 14px;">✅ Confirmar importación</button>
      </div>
    </div>`
    document.getElementById('confirm-import-btn').addEventListener('click', () => confirmImport(type, rows))
  }
  input.value=''
}

window.confirmImport = async (type, rows) => {
  const toInsert = rows.map(r => {
    if (type==='transactions') return {
      type: r.tipo==='ingreso'?'income':'expense',
      content: r.descripcion || r.monto,
      metadata: { label:r.descripcion, amount:parseFloat(r.monto)||0, account:r.cuenta, category:r.categoria, date:r.fecha, tags:['#importado'] }
    }
    if (type==='contacts') return {
      type: 'contact',
      content: r.nombre,
      metadata: { name:r.nombre, cType:r.tipo==='proveedor'?'proveedor':r.tipo, phone:r.telefono, email:r.email, specialty:r.especialidad, notes:r.notas }
    }
    if (type==='projects') return {
      type: 'proyecto',
      content: r.nombre,
      metadata: { label:r.nombre, category:r.categoria, budget:parseFloat(r.presupuesto)||0, stage:'planning', description:r.descripcion, tags:[r.etiqueta?'#'+r.etiqueta:'#proyecto'] }
    }
    return null
  }).filter(Boolean)
  let imported=0
  for (const node of toInsert) {
    if (localStorage.getItem('nexus_admin_bypass')==='true') {
      const tmp={id:Math.random().toString(36).substr(2,9),...node,owner_id:'demo',created_at:new Date().toISOString()}
      allNodes.unshift(tmp); imported++
    } else if (currentUser) {
      const {data} = await supabase.from('nodes').insert({owner_id:currentUser.id,...node}).select()
      if (data?.[0]) { allNodes.unshift(data[0]); imported++ }
    }
  }
  const area = document.getElementById('import-preview-area')
  if (area) area.style.display='none'
  renderAll()
  showToast(`✅ ${imported} registros importados correctamente`)
}

// ═══════════════════════════════════════════════════════════
// BACKUP / EXPORT / RESTORE
// ═══════════════════════════════════════════════════════════
window.exportBackup = () => {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    user: currentUser?.email || 'demo',
    nodes: allNodes,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `nexus-backup-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast(`✅ Respaldo descargado (${allNodes.length} nodos)`)
}

window.importBackup = async (input) => {
  const file = input.files?.[0]
  if (!file) return
  const text = await file.text()
  let payload
  try { payload = JSON.parse(text) } catch { showToast('⚠️ Archivo JSON inválido'); return }
  const nodes = payload.nodes || payload
  if (!Array.isArray(nodes)) { showToast('⚠️ Formato de respaldo no reconocido'); return }
  if (!confirm(`¿Restaurar ${nodes.length} nodos desde "${file.name}"? Esto reemplazará los datos actuales en memoria.`)) { input.value = ''; return }
  allNodes = nodes
  renderAll()
  input.value = ''
  showToast(`✅ Restaurados ${nodes.length} nodos desde respaldo`)
}

// ── Borrado masivo por tipo ───────────────────────────────────────────────────
window.deleteNodesByType = async (type, label) => {
  // Contactos usan ambos tipos: 'persona' y 'contact'
  const types = type === 'persona' ? ['persona', 'contact'] : [type]
  const affected = allNodes.filter(n => types.includes(n.type))
  if (!affected.length) { showToast(`ℹ️ No hay ${label} para eliminar`); return }
  if (!confirm(`¿Eliminar ${affected.length} ${label}?\n\nEsta acción no se puede deshacer.`)) return
  // Eliminar en Supabase
  if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser) {
    for (const type_ of types) {
      await supabase.from('nodes').delete().eq('owner_id', currentUser.id).eq('type', type_)
    }
  }
  allNodes = allNodes.filter(n => !types.includes(n.type))
  saveNodesToCache(allNodes)
  renderAll()
  showToast(`🗑 ${affected.length} ${label} eliminados`)
}

// ── Limpiar datos de demostración ─────────────────────────────────────────────
window.deleteDemoData = async () => {
  const demoNodes = allNodes.filter(n => n.id?.startsWith('demo_'))
  if (!demoNodes.length) { showToast('ℹ️ No hay datos de demo'); return }
  if (!confirm(`¿Eliminar ${demoNodes.length} nodos de demostración?`)) return
  allNodes = allNodes.filter(n => !n.id?.startsWith('demo_'))
  saveNodesToCache(allNodes)
  renderAll()
  showToast(`🧹 ${demoNodes.length} nodos demo eliminados`)
}

// ── Reinicio total ────────────────────────────────────────────────────────────
window.resetAllData = async () => {
  if (!currentUser) { showToast('⚠️ Debes estar autenticado para reiniciar'); return }
  const count = allNodes.length
  if (!confirm(`⚠️ REINICIO TOTAL\n\nEsto eliminará TODOS tus ${count} nodos de Nexus OS en Supabase.\nEsta acción NO SE PUEDE DESHACER.\n\n¿Estás seguro?`)) return
  if (!confirm(`Confirmación final: ¿Eliminar permanentemente tus ${count} nodos?`)) return
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').delete().eq('owner_id', currentUser.id)
  }
  allNodes = []
  saveNodesToCache([])
  renderAll()
  showToast('🔄 Nexus OS reiniciado — todos los datos eliminados')
}

// ═══════════════════════════════════════════════════════════
window.printProjectReport = (projectId) => {
  const d = _computeProjData(projectId)
  if (!d) return
  const { p, m, budget, projSlug, tagStr, cots, aceptadas, comprometido, pagos, pagado,
          pendientePago, provMap, milestonePct } = d
  const projName  = m.label || p.content || 'Proyecto'
  const coverUrl  = m.cover_url || ''
  const projEmoji = m.emoji || '🏗️'
  const today     = new Date().toLocaleDateString('es-MX',{dateStyle:'long'})
  const STAGE_CFG = { planning:'Planificación', active:'En ejecución', on_hold:'Pausado', done:'Terminado' }
  const stage     = STAGE_CFG[m.stage] || ''
  const health    = m.health || {}
  const HCFG      = { on_track:'🟢 En curso', at_risk:'🟡 En riesgo', off_track:'🔴 Atrasado', on_hold:'🔵 Pausado', done:'🟣 Terminado' }
  const healthStr = HCFG[health.status] || '—'
  const mils      = m.milestones || []
  const milsDone  = mils.filter(ms => ms.is_reached).length
  const members   = m.members || []
  const pct       = budget > 0 ? Math.min(100, Math.round(comprometido/budget*100)) : 0

  // Pagos fijos del proyecto
  const pagosFijos = allNodes.filter(n =>
    (n.type==='bill'||n.type==='subscription') &&
    tagStr.some(t => (n.metadata?.project_tag||'').toLowerCase()===t)
  ).sort((a,b) => (a.metadata?.dayOfMonth||99)-(b.metadata?.dayOfMonth||99))

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Reporte — ${projName}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color:#1a1a2e; background:#fff; font-size:13px; }
    .cover { height:180px; background:${coverUrl?`url('${coverUrl}') center/cover no-repeat`:'linear-gradient(135deg,#1e3a5f,#0f2027)'}; display:flex; align-items:flex-end; padding:20px; position:relative; }
    .cover-overlay { position:absolute; inset:0; background:linear-gradient(to bottom,rgba(0,0,0,0.1),rgba(0,0,0,0.6)); }
    .cover-content { position:relative; z-index:1; color:#fff; }
    .cover-emoji { font-size:36px; margin-bottom:8px; display:block; }
    .cover-title { font-size:26px; font-weight:800; }
    .cover-sub { font-size:13px; opacity:.8; margin-top:4px; }
    h2 { font-size:14px; font-weight:700; color:#334155; text-transform:uppercase; letter-spacing:.06em; margin:20px 0 10px; border-bottom:1px solid #e2e8f0; padding-bottom:6px; }
    .section { margin:0 24px 16px; }
    .kpi-row { display:flex; gap:12px; flex-wrap:wrap; }
    .kpi { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; flex:1; min-width:100px; text-align:center; }
    .kpi-val { font-size:18px; font-weight:800; color:#1e40af; font-family:monospace; }
    .kpi-lbl { font-size:10px; color:#64748b; margin-top:3px; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { background:#f1f5f9; color:#475569; font-weight:700; text-transform:uppercase; font-size:10px; padding:6px 10px; text-align:left; }
    td { padding:7px 10px; border-bottom:1px solid #f1f5f9; color:#334155; }
    .bar-wrap { height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden; }
    .bar-fill { height:100%; background:#3b82f6; border-radius:4px; }
    .pill { display:inline-block; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; }
    .badge-ok { background:#dcfce7; color:#15803d; }
    .badge-warn { background:#fef9c3; color:#a16207; }
    .badge-err { background:#fee2e2; color:#dc2626; }
    .footer { text-align:center; font-size:10px; color:#94a3b8; padding:16px; border-top:1px solid #e2e8f0; margin-top:24px; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style>
</head>
<body>
  <!-- Cover -->
  <div class="cover">
    <div class="cover-overlay"></div>
    <div class="cover-content">
      <span class="cover-emoji">${projEmoji}</span>
      <div class="cover-title">${projName}</div>
      <div class="cover-sub">${stage}${health.status?' · '+healthStr:''} &nbsp;·&nbsp; Reporte generado: ${today}</div>
    </div>
  </div>

  <!-- Descripción -->
  ${m.desc ? `<div class="section"><h2>Descripción</h2><p style="color:#475569;line-height:1.6;">${m.desc}</p></div>` : ''}

  <!-- KPIs financieros -->
  <div class="section">
    <h2>Resumen Financiero</h2>
    <div class="kpi-row">
      ${budget > 0 ? `<div class="kpi"><div class="kpi-val">$${budget.toLocaleString('es-MX',{maximumFractionDigits:0})}</div><div class="kpi-lbl">Presupuesto</div></div>` : ''}
      <div class="kpi"><div class="kpi-val">$${comprometido.toLocaleString('es-MX',{maximumFractionDigits:0})}</div><div class="kpi-lbl">Comprometido</div></div>
      <div class="kpi"><div class="kpi-val">$${pagado.toLocaleString('es-MX',{maximumFractionDigits:0})}</div><div class="kpi-lbl">Pagado</div></div>
      <div class="kpi"><div class="kpi-val">$${pendientePago.toLocaleString('es-MX',{maximumFractionDigits:0})}</div><div class="kpi-lbl">Por pagar</div></div>
    </div>
    ${budget > 0 ? `<div style="margin-top:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px;color:#64748b;"><span>Uso del presupuesto</span><span>${pct}%</span></div><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${pct>100?'#ef4444':pct>75?'#f97316':'#3b82f6'};"></div></div></div>` : ''}
  </div>

  <!-- Proveedores y abonos -->
  ${Object.keys(provMap).length ? `
  <div class="section">
    <h2>Proveedores — Historial de Pagos</h2>
    <table>
      <tr><th>Proveedor</th><th>Acordado</th><th>Pagado</th><th>Saldo</th><th>Estado</th></tr>
      ${Object.entries(provMap).map(([pid, pd]) => {
        const prov = allNodes.find(n => n.id === pid)
        const name = prov?.metadata?.name || prov?.content || '—'
        const acord = pd.cotizaciones.reduce((s,c)=>s+(+c.metadata?.amount||0),0)
        const abonos = allNodes.filter(n => n.type==='expense' && n.metadata?.contact_id===pid && tagStr.some(t=>(n.metadata?.project_tag||'').toLowerCase()===t))
        const pagdProv = abonos.reduce((s,a)=>s+(+a.metadata?.amount||0),0)
        const saldo = Math.max(0, acord - pagdProv)
        return `<tr>
          <td>${esc(name)}</td>
          <td>$${acord.toLocaleString('es-MX')}</td>
          <td>$${pagdProv.toLocaleString('es-MX')}</td>
          <td>$${saldo.toLocaleString('es-MX')}</td>
          <td><span class="pill ${saldo===0?'badge-ok':pagdProv>0?'badge-warn':'badge-err'}">${saldo===0?'Liquidado':pagdProv>0?'Parcial':'Pendiente'}</span></td>
        </tr>
        ${abonos.length ? `<tr><td colspan="5" style="padding:0;background:#f8fafc;">
          <table style="margin:0;background:#f8fafc;">
            ${abonos.map(a=>`<tr style="background:#f8fafc;">
              <td style="padding:4px 20px;color:#64748b;">${(a.metadata?.date||a.created_at||'').slice(0,10)}</td>
              <td style="padding:4px 10px;color:#64748b;">${a.metadata?.method||'—'}</td>
              <td style="padding:4px 10px;color:#64748b;">${esc(a.metadata?.notes||a.metadata?.label||'Abono')}</td>
              <td style="padding:4px 10px;font-weight:700;font-family:monospace;">$${(+a.metadata?.amount||0).toLocaleString('es-MX')}</td>
            </tr>`).join('')}
          </table>
        </td></tr>` : ''}`
      }).join('')}
    </table>
  </div>` : ''}

  <!-- Pagos fijos -->
  ${pagosFijos.length ? `
  <div class="section">
    <h2>Pagos Fijos / Recurrentes</h2>
    <table>
      <tr><th>Servicio</th><th>Día</th><th>Monto mensual</th><th>Estado</th></tr>
      ${pagosFijos.map(n => `<tr>
        <td>${esc(n.metadata?.label||n.content)}</td>
        <td>${n.metadata?.dayOfMonth ? 'Día '+n.metadata.dayOfMonth : '—'}</td>
        <td>$${(+n.metadata?.amount||0).toLocaleString('es-MX')}</td>
        <td><span class="pill ${n.metadata?.paid?'badge-ok':'badge-warn'}">${n.metadata?.paid?'✓ Pagado':'Pendiente'}</span></td>
      </tr>`).join('')}
      <tr style="font-weight:700;background:#f1f5f9;"><td colspan="2">Total mensual</td><td>$${pagosFijos.reduce((s,n)=>s+(+n.metadata?.amount||0),0).toLocaleString('es-MX')}</td><td></td></tr>
    </table>
  </div>` : ''}

  <!-- Hitos -->
  ${mils.length ? `
  <div class="section">
    <h2>Hitos — ${milsDone}/${mils.length} completados</h2>
    <table>
      <tr><th>Hito</th><th>Fecha límite</th><th>Estado</th></tr>
      ${mils.map(ms => `<tr>
        <td ${ms.is_reached?'style="text-decoration:line-through;color:#94a3b8;"':''}>${esc(ms.name)}</td>
        <td>${ms.deadline||'—'}</td>
        <td><span class="pill ${ms.is_reached?'badge-ok':ms.deadline&&ms.deadline<new Date().toISOString().split('T')[0]?'badge-err':'badge-warn'}">${ms.is_reached?'✅ Listo':ms.deadline&&ms.deadline<new Date().toISOString().split('T')[0]?'⚠️ Vencido':'Pendiente'}</span></td>
      </tr>`).join('')}
    </table>
  </div>` : ''}

  <!-- Equipo -->
  ${members.length ? `
  <div class="section">
    <h2>Equipo</h2>
    <table>
      <tr><th>Persona</th><th>Rol</th><th>Notas</th></tr>
      ${members.map(mb => {
        const c = allNodes.find(n => n.id === mb.contact_id)
        const name = c ? (c.metadata?.name||c.content) : 'Sin nombre'
        return `<tr><td>${esc(name)}</td><td>${mb.role||'colaborador'}</td><td style="color:#64748b;">${mb.notes||'—'}</td></tr>`
      }).join('')}
    </table>
  </div>` : ''}

  <!-- Notas del health -->
  ${health.note ? `<div class="section"><h2>Nota de Estado</h2><p style="color:#475569;font-style:italic;border-left:3px solid #3b82f6;padding-left:12px;">"${esc(health.note)}"</p></div>` : ''}

  <div class="footer">Nexus OS — ${projName} — ${today}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) { showToast('⚠️ Permite ventanas emergentes para ver el reporte'); return }
  win.document.write(html)
  win.document.close()
  win.onload = () => setTimeout(() => win.print(), 400)
}

// ═══════════════════════════════════════════════════════════
// COTIZACIONES — Phase 2
// ═══════════════════════════════════════════════════════════

let currentCotizacionId = null
let _cotAbonosDraft    = []
let _cotImagesDraft    = []   // imágenes/evidencias de la cotización en edición
let _editingAbonoIdx   = null // índice del abono en edición inline (-1 = ninguno)

window.addCotAbono = () => {
  document.getElementById('cot-new-abono-form').style.display = 'block'
  document.getElementById('ca-date').value = new Date().toISOString().split('T')[0]
}

window.cancelCotAbono = () => {
  document.getElementById('cot-new-abono-form').style.display = 'none'
  document.getElementById('ca-amount').value = ''
  document.getElementById('ca-receipt').value = ''
  document.getElementById('ca-notes').value = ''
}

window.saveCotAbono = () => {
  const amount = parseFloat(document.getElementById('ca-amount').value)
  const date   = document.getElementById('ca-date').value
  if (!amount || !date) { showToast('⚠️ Monto y fecha son obligatorios'); return }
  _cotAbonosDraft.push({
    id: (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
    date, amount,
    method: document.getElementById('ca-method').value,
    receipt_url: document.getElementById('ca-receipt').value.trim() || null,
    notes: document.getElementById('ca-notes').value.trim() || null,
  })
  const total = parseFloat(document.getElementById('cot-amount').value) || 0
  renderCotAbonos(_cotAbonosDraft, total)
  cancelCotAbono()
}

window.deleteCotAbono = async (idx) => {
  const abono = _cotAbonosDraft[idx]
  // Eliminar el expense node vinculado si existe
  if (abono?.expense_id) {
    allNodes = allNodes.filter(n => n.id !== abono.expense_id)
    if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
      supabase.from('nodes').delete().eq('id', abono.expense_id).then(()=>{})
  }
  _cotAbonosDraft.splice(idx, 1)
  _editingAbonoIdx = null
  const total = parseFloat(document.getElementById('cot-amount')?.value) || 0
  renderCotAbonos(_cotAbonosDraft, total)
}

window.renderCotAbonos = (abonos, total) => {
  const listEl    = document.getElementById('cot-abonos-list')
  const summaryEl = document.getElementById('cot-abonos-summary')
  if (!listEl) return
  const METHOD_ICON  = {transferencia:'🏦',efectivo:'💵',tarjeta:'💳',cheque:'📄'}
  const METHOD_LABEL = {transferencia:'Transferencia',efectivo:'Efectivo',tarjeta:'Tarjeta',cheque:'Cheque'}
  const pagado = abonos.reduce((s,a) => s+(+a.amount||0), 0)
  const saldo  = Math.max(0, total - pagado)
  const pct    = total > 0 ? Math.min(100, Math.round(pagado/total*100)) : (pagado > 0 ? 100 : 0)
  const barColor = pct === 0 ? '#94a3b8' : pct < 50 ? '#fbbf24' : pct < 100 ? '#60a5fa' : '#4ade80'

  listEl.innerHTML = abonos.length === 0
    ? `<div style="font-size:11px;color:var(--text-dim);text-align:center;padding:12px 8px;border:1px dashed rgba(255,255,255,0.08);border-radius:8px;">Sin pagos registrados aún</div>`
    : abonos.map((a,i) => {
        const isEditing = _editingAbonoIdx === i
        if (isEditing) {
          // Formulario de edición inline
          return `<div style="background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.25);border-radius:10px;padding:12px;margin-bottom:4px;">
            <div style="font-size:11px;font-weight:700;color:#60a5fa;margin-bottom:10px;">✏️ Editando Pago ${i+1}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
              <div><label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px;">Monto *</label>
                <input type="number" id="ea-amount" value="${a.amount||''}" class="modal-input" style="font-size:13px;" /></div>
              <div><label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px;">Fecha *</label>
                <input type="date" id="ea-date" value="${a.date||''}" class="modal-input" style="font-size:13px;" /></div>
            </div>
            <div style="margin-bottom:8px;">
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px;">Método</label>
              <select id="ea-method" class="modal-input" style="font-size:13px;">
                ${['transferencia','efectivo','tarjeta','cheque'].map(m=>`<option value="${m}"${a.method===m?' selected':''}>${METHOD_LABEL[m]||m}</option>`).join('')}
              </select>
            </div>
            <div style="margin-bottom:8px;">
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px;">Comprobante (URL)</label>
              <input type="url" id="ea-receipt" value="${esc(a.receipt_url||'')}" class="modal-input" style="font-size:13px;" placeholder="https://drive.google.com/..." />
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px;">Nota</label>
              <input type="text" id="ea-notes" value="${esc(a.notes||'')}" class="modal-input" style="font-size:13px;" />
            </div>
            <div style="display:flex;gap:8px;">
              <button onclick="cancelEditCotAbono()" class="btn-ghost" style="flex:1;font-size:12px;padding:7px;">Cancelar</button>
              <button onclick="updateCotAbono(${i})" class="btn-primary" style="flex:2;font-size:12px;padding:7px;">💾 Guardar cambios</button>
            </div>
          </div>`
        }
        // Fila normal de abono
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;font-size:12px;margin-bottom:4px;">
          <span style="font-size:13px;flex-shrink:0;">${METHOD_ICON[a.method]||'💸'}</span>
          <span style="font-size:10px;font-weight:700;color:#4ade80;flex-shrink:0;min-width:48px;">Pago ${i+1}</span>
          <span style="color:var(--text-muted);flex-shrink:0;min-width:80px;">${a.date||''}</span>
          <span style="flex:1;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(a.notes||a.method||'Pago')}">${esc(a.notes||a.method||'Pago')}</span>
          ${a.receipt_url ? `<a href="${esc(a.receipt_url)}" target="_blank" onclick="event.stopPropagation()" title="Ver comprobante" style="color:#60a5fa;font-size:11px;flex-shrink:0;text-decoration:none;">🔗</a>` : ''}
          <span style="font-weight:800;color:#4ade80;font-family:'JetBrains Mono',monospace;flex-shrink:0;">$${(+a.amount).toLocaleString('es-MX')}</span>
          <button onclick="editCotAbono(${i})" style="background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);color:#60a5fa;cursor:pointer;font-size:10px;border-radius:5px;padding:2px 7px;flex-shrink:0;" title="Editar pago">✏️</button>
          <button onclick="deleteCotAbono(${i})" style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);color:#f87171;cursor:pointer;font-size:10px;border-radius:5px;padding:2px 7px;flex-shrink:0;" title="Eliminar pago">🗑</button>
        </div>`
      }).join('')

  summaryEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:11px;color:var(--text-muted);">Total acordado: <b style="color:var(--text-primary);">$${total.toLocaleString('es-MX')}</b></span>
      <span style="font-size:11px;font-weight:800;color:${barColor};">${pct}% pagado</span>
    </div>
    <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;margin-bottom:6px;">
      <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width 0.4s;"></div>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span style="font-size:10px;color:#4ade80;">✅ Pagado: <b>$${pagado.toLocaleString('es-MX')}</b></span>
      ${saldo > 0 ? `<span style="font-size:10px;color:#fb923c;">⏳ Saldo: <b>$${saldo.toLocaleString('es-MX')}</b></span>` : `<span style="font-size:10px;color:#4ade80;font-weight:700;">✅ Liquidado</span>`}
    </div>`
}

// ── Editar abono inline ───────────────────────────────────────────────────────
window.editCotAbono = (idx) => {
  _editingAbonoIdx = idx
  const total = parseFloat(document.getElementById('cot-amount')?.value) || 0
  renderCotAbonos(_cotAbonosDraft, total)
  // Scroll al form de edición
  setTimeout(() => document.getElementById('cot-abonos-list')?.scrollIntoView({behavior:'smooth',block:'nearest'}), 50)
}

window.cancelEditCotAbono = () => {
  _editingAbonoIdx = null
  const total = parseFloat(document.getElementById('cot-amount')?.value) || 0
  renderCotAbonos(_cotAbonosDraft, total)
}

window.updateCotAbono = (idx) => {
  const amount = parseFloat(document.getElementById('ea-amount')?.value)
  const date   = document.getElementById('ea-date')?.value
  if (!amount || !date) { showToast('⚠️ Monto y fecha son obligatorios'); return }
  const existing = _cotAbonosDraft[idx] || {}
  _cotAbonosDraft[idx] = {
    ...existing,
    amount,
    date,
    method:      document.getElementById('ea-method')?.value || existing.method,
    receipt_url: document.getElementById('ea-receipt')?.value.trim() || existing.receipt_url || null,
    notes:       document.getElementById('ea-notes')?.value.trim() || existing.notes || null,
  }
  _editingAbonoIdx = null
  const total = parseFloat(document.getElementById('cot-amount')?.value) || 0
  renderCotAbonos(_cotAbonosDraft, total)
  showToast('✅ Pago actualizado — guarda la cotización para persistir')
}

window.openCotizacionModal = (id = null, prefillProjectTag = '') => {
  const c = id ? allNodes.find(n => n.id === id) : null
  const m = c?.metadata || {}
  currentCotizacionId = id
  document.getElementById('cot-modal-title').textContent = c ? 'Editar Cotización' : 'Nueva Cotización'
  document.getElementById('cot-label').value         = m.label || c?.content || ''
  document.getElementById('cot-amount').value        = m.amount || ''
  document.getElementById('cot-status').value        = m.status || 'pendiente'
  document.getElementById('cot-project-tag').value  = m.project_tag || prefillProjectTag || ''
  document.getElementById('cot-notes').value         = m.notes || ''
  const catVal = m.category || ''
  const catEl = document.getElementById('cot-category')
  if (catEl) {
    // For native select: try exact match first, then partial
    const opts = Array.from(catEl.options)
    const exact = opts.find(o => o.value === catVal)
    if (exact) catEl.value = catVal
    else catEl.value = ''
  }
  // Populate provider dropdown — incluye todos los contactos (persona, contact, proveedor, etc.)
  const provs = allNodes.filter(n => n.type === 'contact' || n.type === 'persona')
    .sort((a,b) => {
      const an = (a.metadata?.name || a.content || '').toLowerCase()
      const bn = (b.metadata?.name || b.content || '').toLowerCase()
      return an.localeCompare(bn)
    })
  const sel = document.getElementById('cot-provider')
  sel.innerHTML = `<option value="">Sin proveedor</option>` +
    provs.map(p => {
      const name = esc(p.metadata?.name || p.content)
      const role = p.metadata?.cType || (p.metadata?.roles?.[0]) || ''
      const roleLabel = role ? ` (${role})` : ''
      return `<option value="${p.id}" ${m.provider_id===p.id?'selected':''}>${name}${roleLabel}</option>`
    }).join('')
  document.getElementById('cot-delete').style.display = c ? 'inline-flex' : 'none'
  // Imágenes / evidencias
  _cotImagesDraft = [...(m.images||[])]
  _editingAbonoIdx = null
  renderCotEvidencias()
  // Abonos
  _cotAbonosDraft = [...(m.abonos||[])]
  // Mostrar historial de pagos siempre (no depende del estado)
  document.getElementById('cot-abonos-section').style.display = 'block'
  document.getElementById('cot-new-abono-form').style.display = 'none'
  renderCotAbonos(_cotAbonosDraft, parseFloat(m.amount)||0)
  // Actualizar barra de progreso al cambiar el monto
  const amountEl = document.getElementById('cot-amount')
  if (amountEl) amountEl.oninput = () => renderCotAbonos(_cotAbonosDraft, parseFloat(amountEl.value)||0)
  document.getElementById('cotizacion-modal').classList.remove('hidden')
}

window.closeCotizacionModal = () => {
  document.getElementById('cotizacion-modal').classList.add('hidden')
  _editingAbonoIdx = null
}

// ── Evidencias / adjuntos de la cotización ────────────────────────────────────
window.renderCotEvidencias = () => {
  const container = document.getElementById('cot-evidencias-grid')
  if (!container) return
  const linkList  = document.getElementById('cot-links-list')
  const links = (_cotImagesDraft || []).filter(s => typeof s === 'object' && s.type === 'link')
  const images = (_cotImagesDraft || []).filter(s => typeof s === 'string')

  container.innerHTML = images.length === 0
    ? `<div style="font-size:11px;color:var(--text-dim);text-align:center;padding:16px;border:1px dashed rgba(255,255,255,0.08);border-radius:8px;grid-column:1/-1;">Pega imágenes con <kbd style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;padding:1px 6px;font-family:monospace;font-size:10px;">Ctrl+V</kbd> o usa el botón ⬆️</div>`
    : images.map((src, i) => `
        <div style="position:relative;border-radius:8px;overflow:hidden;">
          <img src="${src}" onclick="window.viewImage('${src}')" style="width:100%;height:72px;object-fit:cover;cursor:pointer;display:block;" />
          <button onclick="removeCotEvidencia(${i})" style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,0.7);border:none;color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
        </div>`).join('')

  if (linkList) {
    linkList.innerHTML = links.length === 0 ? ''
      : links.map((l,i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(96,165,250,0.05);border:1px solid rgba(96,165,250,0.15);border-radius:6px;font-size:11px;">
            <span>🔗</span>
            <a href="${esc(l.url)}" target="_blank" style="flex:1;color:#60a5fa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(l.label||l.url)}</a>
            <button onclick="removeCotLink(${_cotImagesDraft.indexOf(l)})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;">×</button>
          </div>`).join('')
  }
}

window.addCotLink = () => {
  const url   = document.getElementById('cot-link-url')?.value.trim()
  const label = document.getElementById('cot-link-label')?.value.trim()
  if (!url) { showToast('⚠️ Ingresa un URL'); return }
  _cotImagesDraft.push({ type:'link', url, label: label || url })
  document.getElementById('cot-link-url').value = ''
  document.getElementById('cot-link-label').value = ''
  renderCotEvidencias()
}

window.removeCotEvidencia = (imgIdx) => {
  const images = _cotImagesDraft.filter(s => typeof s === 'string')
  const src = images[imgIdx]
  const globalIdx = _cotImagesDraft.indexOf(src)
  if (globalIdx >= 0) _cotImagesDraft.splice(globalIdx, 1)
  renderCotEvidencias()
}

window.removeCotLink = (globalIdx) => {
  if (globalIdx >= 0) _cotImagesDraft.splice(globalIdx, 1)
  renderCotEvidencias()
}

window.uploadCotImage = (input) => {
  const file = input.files?.[0]
  if (!file) return
  if (_cotImagesDraft.filter(s=>typeof s==='string').length >= 5) { showToast('Máximo 5 imágenes por cotización'); return }
  compressImage(file, (b64) => {
    _cotImagesDraft.push(b64)
    renderCotEvidencias()
  })
  input.value = ''
}

// ── Helper: vínculo duro cotización/pago → proyecto ──────────────────────────
async function autoLinkToProject(nodeId, projectTag, _retry = 0) {
  if (!projectTag) return
  const project = allNodes.find(n =>
    n.type === 'proyecto' &&
    (n.metadata?.tags || []).some(t => t.replace(/^#/,'').toLowerCase() === projectTag.toLowerCase())
  )
  if (!project) {
    // Retry una vez tras 400ms — cubre el caso donde loadNodes no terminó aún
    if (_retry === 0) setTimeout(() => autoLinkToProject(nodeId, projectTag, 1), 400)
    return
  }
  const linked = project.metadata.linkedTo || []
  if (linked.includes(nodeId)) return
  project.metadata = { ...project.metadata, linkedTo: [...linked, nodeId] }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata: project.metadata }).eq('id', project.id)
}

window.saveCotizacion = async () => {
  const label = document.getElementById('cot-label').value.trim()
  if (!label) { showToast('La descripción es obligatoria'); return }
  const projTag  = document.getElementById('cot-project-tag').value.trim().toLowerCase()
  const category = document.getElementById('cot-category')?.value.trim() || undefined
  const tags = ['#cotizacion']
  if (projTag) tags.push('#' + projTag)
  const meta = {
    label, category,
    amount:      parseFloat(document.getElementById('cot-amount').value) || 0,
    status:      document.getElementById('cot-status').value,
    provider_id: document.getElementById('cot-provider').value || undefined,
    project_tag: projTag || undefined,
    notes:       document.getElementById('cot-notes').value.trim() || undefined,
    abonos:      _cotAbonosDraft.length ? _cotAbonosDraft : undefined,
    images:      _cotImagesDraft.length ? _cotImagesDraft : undefined,
    tags,
  }
  const bypass = localStorage.getItem('nexus_admin_bypass') === 'true'
  let savedId = currentCotizacionId
  if (currentCotizacionId) {
    const node = allNodes.find(n => n.id === currentCotizacionId)
    if (node) { node.content = label; node.metadata = meta }
    if (!bypass)
      await supabase.from('nodes').update({ content:label, metadata:meta }).eq('id', currentCotizacionId)
  } else {
    if (bypass) {
      const tmpNode = { id:Math.random().toString(36).substr(2,9), type:'cotizacion', content:label, metadata:meta, created_at:new Date().toISOString() }
      allNodes.unshift(tmpNode); savedId = tmpNode.id
    } else {
      const { data } = await supabase.from('nodes').insert({ owner_id:currentUser?.id, type:'cotizacion', content:label, metadata:meta }).select()
      if (data?.[0]) { allNodes.unshift(data[0]); savedId = data[0].id }
    }
  }

  // ── Auto-crear expense nodes para abonos sin expense_id ──────────────────
  let abonosModified = false
  for (const abono of _cotAbonosDraft) {
    if (abono.expense_id) continue  // ya tiene expense node
    const expMeta = {
      label:       abono.notes || ('Pago ' + label),
      amount:      abono.amount,
      date:        abono.date,
      method:      abono.method,
      contact_id:  meta.provider_id || undefined,
      project_tag: projTag || undefined,
      cot_id:      savedId,
      receipt_url: abono.receipt_url || undefined,
      notes:       abono.notes || undefined,
      es_abono:    true,
    }
    if (bypass) {
      const tmpId = 'demo_exp_' + Math.random().toString(36).substr(2,8)
      allNodes.unshift({ id:tmpId, type:'expense', content:expMeta.label, metadata:expMeta, created_at:new Date().toISOString() })
      abono.expense_id = tmpId
    } else if (currentUser) {
      const { data } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'expense', content:expMeta.label, metadata:expMeta }).select()
      if (data?.[0]) { allNodes.unshift(data[0]); abono.expense_id = data[0].id }
    }
    abonosModified = true
  }
  // Re-guardar cotización con los expense_ids actualizados
  if (abonosModified && savedId && !bypass) {
    const finalMeta = { ...meta, abonos: _cotAbonosDraft }
    await supabase.from('nodes').update({ metadata: finalMeta }).eq('id', savedId)
    const node = allNodes.find(n => n.id === savedId)
    if (node) node.metadata = finalMeta
  }
  // ─────────────────────────────────────────────────────────────────────────

  await autoLinkToProject(savedId, projTag)
  if (savedId) await syncCotizacionKanban(savedId, meta, projTag)
  closeCotizacionModal()
  renderAll()
  showToast(`✅ Cotización "${label}" guardada`)
}

// ── Modal historial unificado del proveedor ───────────────────────────────────
window.showProveedorHistorial = (pid, projSlug, provName) => {
  const METHOD_ICON  = {transferencia:'🏦',efectivo:'💵',tarjeta:'💳',cheque:'📄'}
  // Cotizaciones de este proveedor en este proyecto
  const provCots = allNodes.filter(n =>
    n.type === 'cotizacion' &&
    n.metadata?.provider_id === pid &&
    (n.metadata?.project_tag || '').toLowerCase() === projSlug.toLowerCase()
  )
  // Expense nodes directos (creados por openAbonoModal o por auto-sync de abonos)
  const directExpenses = allNodes.filter(n =>
    n.type === 'expense' &&
    n.metadata?.contact_id === pid &&
    (n.metadata?.project_tag || '').toLowerCase() === projSlug.toLowerCase() &&
    !n.metadata?.cot_id   // solo los que NO vienen de cotización (evitar dobles)
  ).sort((a,b) => (a.metadata?.date||a.created_at||'').localeCompare(b.metadata?.date||b.created_at||''))

  const STATUS_CFG = { pendiente:{l:'⏳ Pendiente',c:'#94a3b8'}, aceptada:{l:'✅ Aceptada',c:'#4ade80'}, rechazada:{l:'❌ Rechazada',c:'#f87171'}, en_proceso:{l:'🔄 En proceso',c:'#60a5fa'}, pagada:{l:'💰 Pagada',c:'#a78bfa'}, parcial:{l:'🔶 Parcial',c:'#fbbf24'} }

  const totalAcordado = provCots.reduce((s,c)=>s+(+c.metadata?.amount||0), 0)
  const totalAbonos   = provCots.flatMap(c=>c.metadata?.abonos||[]).reduce((s,a)=>s+(+a.amount||0), 0)
  const totalDirectos = directExpenses.reduce((s,e)=>s+(+e.metadata?.amount||0), 0)
  const totalPagado   = totalAbonos + totalDirectos
  const saldoGlobal   = Math.max(0, totalAcordado - totalPagado)
  const pct = totalAcordado > 0 ? Math.min(100, Math.round(totalPagado/totalAcordado*100)) : 0
  const barColor = pct === 0 ? '#94a3b8' : pct < 50 ? '#fbbf24' : pct < 100 ? '#60a5fa' : '#4ade80'

  const cotsHtml = provCots.length === 0
    ? `<div style="color:var(--text-dim);font-size:12px;font-style:italic;padding:8px 0;">Sin cotizaciones registradas</div>`
    : provCots.map(c => {
        const m = c.metadata || {}
        const abonos = m.abonos || []
        const cotTotal  = +(m.amount||0)
        const cotPagado = abonos.reduce((s,a)=>s+(+a.amount||0),0)
        const cotPct    = cotTotal>0 ? Math.min(100,Math.round(cotPagado/cotTotal*100)) : 0
        const stCfg = STATUS_CFG[m.status||'pendiente']
        return `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-left:3px solid ${stCfg.c};border-radius:10px;padding:12px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
            <span style="font-size:13px;font-weight:700;color:var(--text-primary);flex:1;">${esc(m.label||c.content)}</span>
            <span style="font-size:9px;padding:2px 8px;border-radius:4px;background:${stCfg.c}22;color:${stCfg.c};font-weight:700;">${stCfg.l}</span>
            <button onclick="document.getElementById('prov-hist-modal').style.display='none';openCotizacionModal('${c.id}')" style="font-size:10px;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.25);color:#fb923c;border-radius:5px;padding:2px 8px;cursor:pointer;">✏️ Editar</button>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:6px;">
            <span>Acordado: <b style="color:#fb923c;font-family:monospace;">$${cotTotal.toLocaleString('es-MX')}</b></span>
            <span>Pagado: <b style="color:#4ade80;font-family:monospace;">$${cotPagado.toLocaleString('es-MX')}</b></span>
          </div>
          <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-bottom:10px;">
            <div style="height:100%;width:${cotPct}%;background:${cotPct>=100?'#4ade80':'#60a5fa'};border-radius:2px;"></div>
          </div>
          ${abonos.length > 0 ? `<div style="padding-left:8px;border-left:2px solid rgba(255,255,255,0.07);">
            ${abonos.map((a,i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.04);">
              <span style="color:var(--text-dim);min-width:48px;">Pago ${i+1}</span>
              <span style="min-width:72px;color:var(--text-muted);">${a.date||''}</span>
              <span style="flex:1;color:var(--text-secondary);">${esc(a.notes||a.method||'Pago')}</span>
              ${a.receipt_url?`<a href="${esc(a.receipt_url)}" target="_blank" style="color:#60a5fa;font-size:10px;">🔗</a>`:''}
              <span style="font-family:monospace;font-weight:700;color:#4ade80;">$${(+a.amount).toLocaleString('es-MX')}</span>
              <span style="font-size:13px;">${METHOD_ICON[a.method]||'💸'}</span>
            </div>`).join('')}
          </div>` : `<div style="font-size:11px;color:var(--text-dim);font-style:italic;">Sin pagos en esta cotización</div>`}
        </div>`
      }).join('')

  const directHtml = directExpenses.length === 0 ? '' : `
    <div style="margin-top:12px;">
      <div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">Pagos directos (sin cotización)</div>
      ${directExpenses.map(e=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:rgba(255,255,255,0.02);border-radius:6px;font-size:11px;margin-bottom:4px;">
        <span>${METHOD_ICON[e.metadata?.method]||'💸'}</span>
        <span style="color:var(--text-muted);min-width:80px;">${(e.metadata?.date||e.created_at||'').slice(0,10)}</span>
        <span style="flex:1;color:var(--text-secondary);">${esc(e.metadata?.notes||e.metadata?.label||'Pago directo')}</span>
        <span style="font-family:monospace;font-weight:700;color:#60a5fa;">$${(+e.metadata?.amount||0).toLocaleString('es-MX')}</span>
      </div>`).join('')}
    </div>`

  // Crear/reutilizar modal flotante
  let modal = document.getElementById('prov-hist-modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'prov-hist-modal'
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:10001;display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;'
    modal.onclick = (ev) => { if (ev.target === modal) modal.style.display = 'none' }
    document.body.appendChild(modal)
  }
  // Store data for print function
  modal._printData = { pid, projSlug, provName, provCots, directExpenses, totalAcordado, totalPagado, saldoGlobal, pct }
  modal.style.display = 'flex'
  modal.innerHTML = `<div style="background:#0d1117;border:1px solid rgba(251,146,60,0.25);border-radius:16px;padding:24px;width:100%;max-width:560px;max-height:85vh;overflow-y:auto;" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Historial completo</div>
        <h3 style="margin:4px 0 0;font-size:18px;font-weight:800;color:#fb923c;">👤 ${esc(provName)}</h3>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="printProveedorHistorial()" style="background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.3);color:#60a5fa;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;">🖨️ Imprimir</button>
        <button onclick="document.getElementById('prov-hist-modal').style.display='none'" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;">✕ Cerrar</button>
      </div>
    </div>

    <!-- Resumen global -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:20px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;text-align:center;">
        <div><div style="font-size:15px;font-weight:800;font-family:monospace;color:#fb923c;">$${totalAcordado.toLocaleString('es-MX')}</div><div style="font-size:10px;color:var(--text-muted);">Acordado</div></div>
        <div><div style="font-size:15px;font-weight:800;font-family:monospace;color:#4ade80;">$${totalPagado.toLocaleString('es-MX')}</div><div style="font-size:10px;color:var(--text-muted);">Pagado</div></div>
        <div><div style="font-size:15px;font-weight:800;font-family:monospace;color:${saldoGlobal>0?'#f87171':'#4ade80'};">$${saldoGlobal.toLocaleString('es-MX')}</div><div style="font-size:10px;color:var(--text-muted);">${saldoGlobal>0?'Saldo':'✅ Saldado'}</div></div>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;"></div>
      </div>
      <div style="text-align:center;font-size:11px;color:${barColor};font-weight:700;margin-top:5px;">${pct}% completado</div>
    </div>

    <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">Cotizaciones (${provCots.length})</div>
    ${cotsHtml}
    ${directHtml}
  </div>`
}

// ── Imprimir historial del proveedor ─────────────────────────────────────────
window.printProveedorHistorial = () => {
  const modal = document.getElementById('prov-hist-modal')
  const d = modal?._printData
  if (!d) return
  const { provName, provCots, directExpenses, totalAcordado, totalPagado, saldoGlobal, pct, projSlug } = d
  const METHOD_LABEL = { transferencia:'Transferencia bancaria', efectivo:'Efectivo', tarjeta:'Tarjeta', cheque:'Cheque', cripto:'Cripto' }
  const STATUS_LABEL = { pendiente:'Pendiente', aceptada:'Aceptada', en_proceso:'En proceso', parcial:'Pago parcial', pagada:'Pagada', rechazada:'Rechazada' }
  const today = new Date().toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric'})

  const cotsRows = provCots.map(c => {
    const m = c.metadata || {}
    const abonos = m.abonos || []
    const cotTotal  = +(m.amount||0)
    const cotPagado = abonos.reduce((s,a)=>s+(+a.amount||0),0)
    const cotPct    = cotTotal>0 ? Math.min(100,Math.round(cotPagado/cotTotal*100)) : 0
    return `
      <tr style="background:#f8fafc;">
        <td colspan="4" style="padding:8px 10px;font-weight:700;font-size:13px;border-bottom:1px solid #e2e8f0;">
          📄 ${c.metadata?.label||c.content}
          <span style="font-weight:400;color:#64748b;font-size:11px;margin-left:8px;">${STATUS_LABEL[m.status||'pendiente']}</span>
        </td>
      </tr>
      ${abonos.map((a,i)=>`
      <tr>
        <td style="padding:5px 10px;font-size:12px;color:#475569;">Pago ${i+1}</td>
        <td style="padding:5px 10px;font-size:12px;color:#475569;">${a.date||'—'}</td>
        <td style="padding:5px 10px;font-size:12px;">${a.notes||METHOD_LABEL[a.method]||'Pago'}</td>
        <td style="padding:5px 10px;font-size:12px;text-align:right;font-weight:700;color:#0f172a;font-family:monospace;">$${(+a.amount).toLocaleString('es-MX')}</td>
      </tr>`).join('')}
      <tr style="background:#fff7ed;">
        <td colspan="3" style="padding:5px 10px;font-size:11px;color:#92400e;">Subtotal cotización (${cotPct}% completado)</td>
        <td style="padding:5px 10px;font-size:12px;text-align:right;font-weight:700;color:#92400e;font-family:monospace;">$${cotPagado.toLocaleString('es-MX')} / $${cotTotal.toLocaleString('es-MX')}</td>
      </tr>`
  }).join('<tr style="height:8px;"></tr>')

  const directRows = directExpenses.map(e=>`
    <tr>
      <td style="padding:5px 10px;font-size:12px;color:#475569;">Pago directo</td>
      <td style="padding:5px 10px;font-size:12px;color:#475569;">${(e.metadata?.date||e.created_at||'').slice(0,10)}</td>
      <td style="padding:5px 10px;font-size:12px;">${e.metadata?.notes||e.metadata?.label||'Pago'}</td>
      <td style="padding:5px 10px;font-size:12px;text-align:right;font-weight:700;font-family:monospace;">$${(+e.metadata?.amount||0).toLocaleString('es-MX')}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Historial — ${provName}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#0f172a;margin:0;padding:32px;background:#fff;font-size:13px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #fb923c;}
  h1{margin:0;font-size:22px;font-weight:900;color:#0f172a;}
  .sub{font-size:12px;color:#64748b;margin-top:4px;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;}
  .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center;}
  .kpi-val{font-size:18px;font-weight:900;font-family:monospace;}
  .kpi-label{font-size:10px;color:#64748b;margin-top:2px;}
  .prog-bg{height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin:10px 0;}
  .prog-bar{height:100%;border-radius:4px;background:#3b82f6;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{background:#0f172a;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;}
  tr:nth-child(even){background:#f8fafc;}
  td{border-bottom:1px solid #f1f5f9;}
  .footer{margin-top:24px;font-size:10px;color:#94a3b8;text-align:center;}
  @media print{body{padding:20px;}}
</style></head>
<body>
<div class="header">
  <div>
    <h1>👤 ${esc(provName)}</h1>
    <div class="sub">Proyecto: ${esc(projSlug)} &nbsp;·&nbsp; Generado: ${today}</div>
  </div>
  <div style="text-align:right;font-size:11px;color:#64748b;">Nexus OS</div>
</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-val" style="color:#fb923c;">$${totalAcordado.toLocaleString('es-MX')}</div><div class="kpi-label">Total Acordado</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#16a34a;">$${totalPagado.toLocaleString('es-MX')}</div><div class="kpi-label">Total Pagado</div></div>
  <div class="kpi"><div class="kpi-val" style="color:${saldoGlobal>0?'#dc2626':'#16a34a'};">$${saldoGlobal.toLocaleString('es-MX')}</div><div class="kpi-label">${saldoGlobal>0?'Saldo Pendiente':'✅ Saldado'}</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#2563eb;">${pct}%</div><div class="kpi-label">Completado</div></div>
</div>
<div class="prog-bg"><div class="prog-bar" style="width:${pct}%;background:${pct>=100?'#16a34a':pct>=50?'#2563eb':'#f59e0b'};"></div></div>

<table>
  <thead><tr><th>Concepto</th><th>Fecha</th><th>Descripción</th><th style="text-align:right;">Monto</th></tr></thead>
  <tbody>
    ${cotsRows}
    ${directRows}
    <tr style="height:6px;"></tr>
    <tr style="background:#0f172a;color:#fff;">
      <td colspan="3" style="padding:8px 10px;font-weight:800;font-size:12px;color:#fff;">TOTAL PAGADO</td>
      <td style="padding:8px 10px;text-align:right;font-weight:900;font-size:14px;color:#4ade80;font-family:monospace;">$${totalPagado.toLocaleString('es-MX')}</td>
    </tr>
  </tbody>
</table>

<div class="footer">Nexus OS · Documento generado el ${today} · nexus-os.vercel.app</div>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

// ── Auto-sync cotización → Kanban del proyecto ────────────────────────────────
async function syncCotizacionKanban(cotId, meta, projTag) {
  if (!projTag) return
  const abonos = meta.abonos || []
  const total  = +(meta.amount || 0)
  const pagado = abonos.reduce((s,a) => s+(+a.amount||0), 0)
  const pct    = total > 0 ? Math.round(pagado/total*100) : (pagado>0?100:0)

  // Determinar estado Kanban según avance
  let kanbanStatus = 'todo'
  if (meta.status === 'pagada' || pct >= 100) kanbanStatus = 'done'
  else if (abonos.length > 0 || meta.status === 'en_proceso' || meta.status === 'parcial') kanbanStatus = 'in_progress'
  else if (meta.status === 'aceptada') kanbanStatus = 'in_progress'

  // Solo crear/actualizar si hay actividad real (aceptada, en proceso, pagos)
  const hasActivity = ['aceptada','en_proceso','parcial','pagada'].includes(meta.status) || abonos.length > 0
  if (!hasActivity) return

  // Buscar tarjeta Kanban existente vinculada a esta cotización
  const existing = allNodes.find(n => n.type === 'kanban' && n.metadata?.cot_id === cotId)
  const label = meta.label || 'Cotización'
  const provNode = meta.provider_id ? allNodes.find(n => n.id === meta.provider_id) : null
  const provName = provNode ? (provNode.metadata?.name || provNode.content) : null

  const kanbanMeta = {
    status:      kanbanStatus,
    cot_id:      cotId,
    project_tag: projTag,
    label,
    tags:        ['#' + projTag, '#cotizacion'],
    notes:       `Proveedor: ${provName||'Sin asignar'} | Pagado: ${pct}% ($${pagado.toLocaleString('es-MX')} de $${(+(meta.amount||0)).toLocaleString('es-MX')})`,
    color:       kanbanStatus==='done' ? '#4ade80' : kanbanStatus==='in_progress' ? '#60a5fa' : '#94a3b8',
  }

  if (existing) {
    // Actualizar tarjeta existente
    existing.metadata = { ...existing.metadata, ...kanbanMeta }
    if (localStorage.getItem('nexus_admin_bypass') !== 'true' && currentUser)
      await supabase.from('nodes').update({ metadata: existing.metadata }).eq('id', existing.id)
  } else {
    // Crear nueva tarjeta
    const bypass = localStorage.getItem('nexus_admin_bypass') === 'true'
    if (bypass) {
      allNodes.unshift({ id: 'demo_cot_'+Math.random().toString(36).substr(2,8), type:'kanban', content:label, metadata:kanbanMeta, created_at:new Date().toISOString() })
    } else if (currentUser) {
      const { data } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'kanban', content:label, metadata:kanbanMeta }).select()
      if (data?.[0]) {
        allNodes.unshift(data[0])
        await autoLinkToProject(data[0].id, projTag)
      }
    }
  }
}

// ── Reporte imprimible por cotización ────────────────────────────────────────
window.printCotizacion = (id) => {
  const c = allNodes.find(n => n.id === id)
  if (!c) return
  const m = c.metadata || {}
  const prov = m.provider_id ? allNodes.find(n => n.id === m.provider_id) : null
  const provName = prov ? (prov.metadata?.name || prov.content) : 'Sin asignar'
  const provPhone = prov?.metadata?.phone || ''
  const provEmail = prov?.metadata?.email || ''
  const total = +(m.amount || 0)
  const abonos = m.abonos || []
  const pagado = abonos.reduce((s,a) => s+(+a.amount||0), 0)
  const saldo  = Math.max(0, total - pagado)
  const pct    = total > 0 ? Math.min(100, Math.round(pagado/total*100)) : 0
  const STATUS_LABEL = { pendiente:'Pendiente', aceptada:'Aceptada', en_proceso:'En proceso', parcial:'Pago parcial', pagada:'Pagada completamente', rechazada:'Rechazada' }
  const METHOD_LABEL = { transferencia:'Transferencia bancaria', efectivo:'Efectivo', tarjeta:'Tarjeta', cheque:'Cheque' }
  const today = new Date().toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric'})

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Cotización — ${esc(m.label||c.content)}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a2e;margin:0;padding:32px;background:#fff;font-size:13px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #fb923c;}
  h1{margin:0;font-size:20px;font-weight:900;color:#fb923c;}
  .badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#dcfce7;color:#15803d;}
  .badge.parcial{background:#fef3c7;color:#92400e;}
  .badge.en_proceso{background:#dbeafe;color:#1d4ed8;}
  .badge.pendiente{background:#f1f5f9;color:#475569;}
  .badge.rechazada{background:#fee2e2;color:#991b1b;}
  .badge.pagada{background:#ede9fe;color:#5b21b6;}
  .section{margin-bottom:24px;}
  .section-title{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .field label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:2px;}
  .field span{font-size:13px;color:#1a1a2e;}
  .progress-bar{background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden;margin:8px 0;}
  .progress-fill{height:100%;background:#fb923c;border-radius:4px;}
  .pago-row{display:flex;gap:12px;align-items:center;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;page-break-inside:avoid;}
  .pago-num{font-size:11px;font-weight:800;color:#fb923c;min-width:54px;}
  .pago-meta{flex:1;}
  .pago-amount{font-size:14px;font-weight:800;color:#15803d;font-family:monospace;}
  .totals{background:#f8fafc;border-radius:8px;padding:16px;margin-top:12px;}
  .total-row{display:flex;justify-content:space-between;padding:4px 0;}
  .total-row.final{border-top:2px solid #e2e8f0;margin-top:6px;padding-top:8px;font-size:15px;font-weight:800;}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;}
  @media print{body{padding:20px;}button{display:none!important;}}
</style></head>
<body>
  <div class="header">
    <div>
      <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">NEXUS OS — REPORTE DE COTIZACIÓN</div>
      <h1>${esc(m.label||c.content)}</h1>
      ${m.category ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">📂 ${esc(m.category)}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <span class="badge ${m.status||'pendiente'}">${STATUS_LABEL[m.status||'pendiente']}</span>
      <div style="font-size:11px;color:#94a3b8;margin-top:6px;">Reporte generado: ${today}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Información general</div>
    <div class="grid2">
      <div class="field"><label>Proveedor</label><span>${esc(provName)}</span></div>
      ${provPhone ? `<div class="field"><label>Teléfono</label><span>${esc(provPhone)}</span></div>` : '<div></div>'}
      ${provEmail ? `<div class="field"><label>Email</label><span>${esc(provEmail)}</span></div>` : '<div></div>'}
      <div class="field"><label>Monto acordado</label><span style="font-size:18px;font-weight:900;color:#fb923c;">$${total.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
    </div>
    ${m.notes ? `<div style="margin-top:12px;"><div class="field"><label>Condiciones / Notas</label><span>${esc(m.notes)}</span></div></div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Progreso de pagos</div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:12px;">
      <span>${pct}% pagado</span>
      <span>${abonos.length} pago${abonos.length!==1?'s':''} registrado${abonos.length!==1?'s':''}</span>
    </div>

    ${abonos.length > 0 ? abonos.map((a,i) => `
      <div class="pago-row">
        <div class="pago-num">Pago ${i+1}</div>
        <div class="pago-meta">
          <div style="font-weight:600;">${a.date||''} — ${esc(METHOD_LABEL[a.method]||a.method||'')}</div>
          ${a.notes ? `<div style="font-size:11px;color:#64748b;">${esc(a.notes)}</div>` : ''}
          ${a.receipt_url ? `<div style="font-size:10px;color:#3b82f6;">🔗 Comprobante: ${esc(a.receipt_url)}</div>` : ''}
        </div>
        <div class="pago-amount">$${(+a.amount).toLocaleString('es-MX',{minimumFractionDigits:2})}</div>
      </div>`).join('') : `<div style="color:#94a3b8;font-style:italic;font-size:12px;">Sin pagos registrados</div>`}

    <div class="totals">
      <div class="total-row"><span>Monto acordado</span><span style="font-family:monospace;">$${total.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
      <div class="total-row"><span>Total pagado</span><span style="font-family:monospace;color:#15803d;font-weight:700;">$${pagado.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
      <div class="total-row final"><span>Saldo pendiente</span><span style="font-family:monospace;color:${saldo>0?'#dc2626':'#15803d'};">$${saldo.toLocaleString('es-MX',{minimumFractionDigits:2})}</span></div>
    </div>
  </div>

  <div class="footer">Nexus OS — Sistema de gestión de proyectos • oscaromargp.github.io/Oscaromargp</div>
  <div style="text-align:center;margin-top:12px;"><button onclick="window.print()" style="padding:10px 28px;background:#fb923c;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Guardar PDF</button></div>
</body></html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) { win.document.write(html); win.document.close() }
}

window.deleteCotizacion = async () => {
  if (!currentCotizacionId || !confirm('¿Eliminar esta cotización?')) return
  allNodes = allNodes.filter(n => n.id !== currentCotizacionId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').delete().eq('id', currentCotizacionId)
  closeCotizacionModal()
  renderAll()
}

window.changeCotizacionStatus = async (id, status) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  node.metadata = { ...node.metadata, status }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata:node.metadata }).eq('id', id)
  // Auto-link to project when accepting
  if (status === 'aceptada' && node.metadata.project_tag) {
    await autoLinkToProject(id, node.metadata.project_tag)
  }
  renderAll()
  const msgs = { aceptada:'✅ Cotización aceptada', rechazada:'❌ Cotización rechazada', pendiente:'⏳ Pendiente', en_proceso:'🔄 Trabajo en proceso', parcial:'🔶 Pago parcial registrado', pagada:'💰 Cotización pagada completamente' }
  showToast(msgs[status] || 'Estado actualizado')
  // Anticipo prompt when accepting
  if (status === 'aceptada') {
    const prov = node.metadata.provider_id ? allNodes.find(n => n.id === node.metadata.provider_id) : null
    const amt  = node.metadata.amount || 0
    setTimeout(() => {
      const banner = document.createElement('div')
      banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid rgba(74,222,128,0.4);border-radius:12px;padding:14px 20px;display:flex;align-items:center;gap:14px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:420px;width:90%;'
      banner.innerHTML = `
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#4ade80;">✅ Cotización aceptada</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">¿Registrar anticipo o pago inicial${prov?` a ${esc(prov.metadata?.name||prov.content)}`:''} ($${amt.toLocaleString('es-MX')})?</div>
        </div>
        <button onclick="this.closest('div[style]').remove()" style="background:transparent;border:1px solid rgba(148,163,184,0.3);color:#94a3b8;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;flex-shrink:0;">Ahora no</button>
        ${prov ? `<button onclick="this.closest('div[style]').remove();openPaymentModal('${prov.id}',null,'${node.metadata.project_tag||''}')" style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.4);color:#4ade80;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:11px;font-weight:600;flex-shrink:0;">💸 Pagar</button>` : ''}
      `
      document.body.appendChild(banner)
      setTimeout(() => { banner.style.transition='opacity 0.5s'; banner.style.opacity='0'; setTimeout(()=>banner.remove(),500) }, 10000)
    }, 500)
  }
}

// ═══════════════════════════════════════════════════════════
// PROYECTO MODAL — Phase 2
// ═══════════════════════════════════════════════════════════

let currentProyectoId = null
let _projDashTab  = 'resumen'   // active tab inside project dashboard
let _projDashId   = null        // project ID currently open

window.openProyectoModal = (id) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  currentProyectoId = id
  const m = node.metadata || {}
  document.getElementById('proy-label').value    = m.label || node.content || ''
  document.getElementById('proy-budget').value   = m.budget || ''
  document.getElementById('proy-rol').value      = m.rol || 'dueño'
  document.getElementById('proy-desc').value     = m.desc || m.notes || ''
  document.getElementById('proy-emoji').value    = m.emoji || ''
  document.getElementById('proy-cover').value    = m.cover_url || ''
  document.getElementById('proy-category').value = m.category || 'inmueble'
  document.getElementById('proy-stage').value    = m.stage || 'planning'
  document.getElementById('proy-deadline').value = m.deadline || ''
  // Cover preview
  previewProjectCover(m.cover_url || '')
  // Slug display
  const slugDisplay = document.getElementById('proy-slug-display')
  if (slugDisplay) {
    const slug = m.project_slug || (m.tags||[]).find(t=>t!=='#proyecto'&&t.startsWith('#'))?.slice(1) || ''
    slugDisplay.textContent = slug ? '#' + slug : '(se generará al guardar)'
    slugDisplay.style.color = slug ? '#2dd4bf' : '#94a3b8'
  }
  document.getElementById('proyecto-modal').classList.remove('hidden')
}

window.previewProjectCover = (url) => {
  const img         = document.getElementById('proy-cover-img')
  const placeholder = document.getElementById('proy-cover-placeholder')
  if (!img) return
  if (url) {
    img.src = url
    img.style.display = ''
    img.onerror = () => { img.style.display = 'none'; if (placeholder) placeholder.style.display = '' }
    img.onload  = () => { if (placeholder) placeholder.style.display = 'none' }
    if (placeholder) placeholder.style.display = 'none'
  } else {
    img.style.display = 'none'
    img.src = ''
    if (placeholder) placeholder.style.display = ''
  }
}

window.clearProjectCover = () => {
  document.getElementById('proy-cover').value = ''
  previewProjectCover('')
}

window.handleCoverFileSelect = (input) => {
  const file = input.files?.[0]
  if (!file) return
  _loadCoverFile(file)
}

window.handleCoverDrop = (event) => {
  const file = event.dataTransfer.files?.[0]
  if (file && file.type.startsWith('image/')) _loadCoverFile(file)
}

function _loadCoverFile(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    // Compress via canvas (max 1200px wide, 80% quality)
    const img = new Image()
    img.onload = () => {
      const maxW = 1200
      const ratio = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      document.getElementById('proy-cover').value = dataUrl
      previewProjectCover(dataUrl)
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

window.closeProyectoModal = () => document.getElementById('proyecto-modal').classList.add('hidden')

window.saveProyecto = async () => {
  if (!currentProyectoId) return
  const node = allNodes.find(n => n.id === currentProyectoId)
  if (!node) return
  const label = document.getElementById('proy-label').value.trim() || node.metadata?.label || node.content
  const budgetVal = parseFloat(document.getElementById('proy-budget').value)

  // Preservar tags existentes o generar slug automático
  const existingTags = node.metadata?.tags || []
  const hasCustomTag = existingTags.some(t => t !== '#proyecto' && t.startsWith('#'))
  let projectTags = existingTags
  let projectSlug = node.metadata?.project_slug
  if (!hasCustomTag) {
    projectSlug = label.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
    projectTags = ['#proyecto', ...(projectSlug ? ['#' + projectSlug] : [])]
  }

  const coverUrl  = document.getElementById('proy-cover')?.value.trim() || undefined
  const emoji     = document.getElementById('proy-emoji')?.value.trim() || undefined
  const category  = document.getElementById('proy-category')?.value || undefined
  const stageVal  = document.getElementById('proy-stage')?.value || undefined
  const deadline  = document.getElementById('proy-deadline')?.value || undefined

  node.metadata = {
    ...node.metadata,
    label,
    budget:    budgetVal > 0 ? budgetVal : undefined,
    rol:       document.getElementById('proy-rol').value,
    desc:      document.getElementById('proy-desc').value.trim() || undefined,
    tags:      projectTags,
    project_slug: projectSlug || undefined,
    cover_url: coverUrl,
    emoji,
    category,
    stage:     stageVal,
    deadline,
  }
  node.content = label
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ content:label, metadata:node.metadata }).eq('id', currentProyectoId)
  closeProyectoModal()
  renderAll()
  showToast('Proyecto actualizado')
}

// ═══════════════════════════════════════════════════════════
// BUSCADOR GLOBAL — Fuse.js (Sprint 10)
// ═══════════════════════════════════════════════════════════

let fuseInstance = null
let searchDebounceTimer = null
// TYPE_LABELS — movido al bloque de constantes (antes del boot IIFE)

function buildFuseIndex() {
  const docs = allNodes.map(n => ({
    id: n.id,
    content: n.content || '',
    type: n.type || 'note',
    tags: (n.metadata?.tags || []).join(' '),
    account: n.metadata?.account_hint || n.metadata?.label || '',
    notes: n.metadata?.notes || '',
    name: n.metadata?.name || n.metadata?.title || '',
    date: n.metadata?.date || (n.created_at ? n.created_at.slice(0,10) : ''),
  }))
  fuseInstance = new Fuse(docs, {
    keys: [
      { name: 'content', weight: 3 },
      { name: 'name',    weight: 2 },
      { name: 'tags',    weight: 2 },
      { name: 'notes',   weight: 1 },
      { name: 'account', weight: 1 },
      { name: 'date',    weight: 0.5 },
    ],
    threshold: 0.35,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
}

window.openGlobalSearch = function() {
  buildFuseIndex()
  const modal = document.getElementById('global-search-modal')
  if (!modal) return
  modal.style.display = 'flex'
  const inp = document.getElementById('gs-input')
  if (inp) { inp.value = ''; inp.focus() }
  document.getElementById('gs-results').innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:32px 0; font-size:13px;">Empieza a escribir para buscar en todos tus nodos…</div>'
}

window.closeGlobalSearch = function() {
  const modal = document.getElementById('global-search-modal')
  if (modal) modal.style.display = 'none'
}

window.handleGsInput = function() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(runGlobalSearch, 120)
}

function runGlobalSearch() {
  const inp = document.getElementById('gs-input')
  const resultsEl = document.getElementById('gs-results')
  if (!inp || !resultsEl || !fuseInstance) return

  const q = inp.value.trim()
  if (!q) {
    resultsEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:32px 0; font-size:13px;">Empieza a escribir para buscar en todos tus nodos…</div>'
    return
  }

  const raw = fuseInstance.search(q, { limit: 20 })
  if (!raw.length) {
    resultsEl.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:32px 0; font-size:13px;">Sin resultados para "<b>${esc(q)}</b>"</div>`
    return
  }

  resultsEl.innerHTML = raw.map(({ item, score }) => {
    const node = allNodes.find(n => n.id === item.id)
    if (!node) return ''
    const cfg = TYPE_LABELS[node.type] || TYPE_LABELS.note
    const snippet = highlight(item.content || item.name || '', q)
    const tagStr = item.tags ? item.tags.split(' ').filter(Boolean).map(t => `<span style="color:#a855f7; font-size:11px;">#${t.replace(/^#/,'')}</span>`).join(' ') : ''
    const dateStr = item.date ? `<span style="color:var(--text-dim); font-size:11px;">${item.date}</span>` : ''
    const acct = item.account ? `<span style="color:#00f0ff; font-size:11px;">@${item.account}</span>` : ''
    const amtRaw = node.metadata?.amount
    const amtStr = amtRaw ? `<span style="color:${cfg.color}; font-weight:700; font-size:13px;">${node.type==='income'?'+':'-'}$${(+amtRaw).toLocaleString('es-MX')}</span>` : ''
    return `
      <div class="gs-result-row" onclick="gsNavigateTo('${node.id}','${node.type}')" title="Ir al nodo">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
          <span style="font-size:18px; flex-shrink:0;">${cfg.icon}</span>
          <span style="background:rgba(255,255,255,0.06); color:${cfg.color}; border-radius:5px; padding:1px 7px; font-size:10px; font-weight:700; letter-spacing:0.05em;">${cfg.label}</span>
          ${amtStr}
          <span style="flex:1; min-width:0; font-size:13px; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${snippet}</span>
          <span style="color:var(--text-dim); font-size:10px; flex-shrink:0;">${Math.round((1-score)*100)}%</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; padding-left:28px; flex-wrap:wrap;">${tagStr}${acct}${dateStr}</div>
      </div>`
  }).join('')
}

function highlight(text, q) {
  if (!text || !q) return esc(text)
  const words = q.trim().split(/\s+/).filter(Boolean)
  let result = esc(text.slice(0, 120))
  words.forEach(w => {
    const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi')
    result = result.replace(re, '<mark style="background:rgba(0,246,255,0.25); color:#fff; border-radius:3px; padding:0 2px;">$1</mark>')
  })
  return result
}

window.gsNavigateTo = function(nodeId, type) {
  window.closeGlobalSearch()
  const viewMap = {
    income: 'finance', expense: 'finance',
    kanban: 'kanban',
    note: 'notes', persona: 'notes', proyecto: 'notes',
    contact: 'contacts',
    account: 'finance',
    event: 'calendar',
    agenda: 'agenda',
  }
  const view = viewMap[type] || 'feed'
  document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.remove('active'))
  const navBtn = document.querySelector(`.nav-item[data-view="${view}"]`)
  if (navBtn) navBtn.classList.add('active')
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'))
  const viewEl = document.getElementById(`view-${view}`)
  if (viewEl) viewEl.classList.add('active')
  activeView = view
  // Highlight the target node after a brief moment
  setTimeout(() => {
    const el = document.querySelector(`[data-node-id="${nodeId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid var(--accent-cyan)'
      el.style.boxShadow = '0 0 20px rgba(0,246,255,0.3)'
      setTimeout(() => { el.style.outline = ''; el.style.boxShadow = '' }, 2000)
    }
  }, 250)
}

// ── Keyboard shortcuts globales ──────────────────────────────────────────────
// Inspirados en Linear: velocidad de operación sin ratón.
//
//  k           → Foco en el input principal (nueva entrada)
//  Ctrl/Cmd+K  → Búsqueda global
//  Ctrl/Cmd+/  → Mostrar cheatsheet de shortcuts
//  1-8         → Cambiar vista directamente
//  Escape      → Cerrar cualquier modal abierto
//
const NEXUS_VIEW_KEYS = {
  '1': 'feed', '2': 'kanban', '3': 'finance', '4': 'notes',
  '5': 'calendar', '6': 'proyectos', '7': 'contacts', '8': 'agenda',
}

document.addEventListener('keydown', e => {
  // Ignorar cuando el foco está en un input/textarea/select
  const tag = document.activeElement?.tagName
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || document.activeElement?.isContentEditable

  // ── Escape — cierra modales en cascada ──────────────────────────────────
  if (e.key === 'Escape') {
    // Helper: detecta correctamente si un modal es visible,
    // sin importar si usa clase 'hidden' o style.display
    const isModalVisible = (el) => {
      if (!el) return false
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }
    const checks = [
      ['welcome-modal',         () => window.closeWelcomeModal?.()],
      ['global-search-modal',   () => window.closeGlobalSearch?.()],
      ['cotizacion-modal',      () => window.closeCotizacionModal?.()],
      ['payment-modal',         () => window.closePaymentModal?.()],
      ['proyecto-modal',        () => window.closeProyectoModal?.()],
      ['contact-sheet',         () => window.closeContactSheet?.()],
      ['card-modal',            () => window.closeCardModal?.()],
      ['note-edit-modal',       () => window.closeNoteModal?.()],
      ['account-modal',         () => window.closeAccountModal?.()],
      ['transfer-modal',        () => window.closeTransferModal?.()],
      ['finance-detail-modal',  () => window.closeFinanceDetail?.()],
    ]
    for (const [id, fn] of checks) {
      const el = document.getElementById(id)
      if (isModalVisible(el)) { fn(); return }
    }
    return
  }

  // ── Shortcuts que requieren no estar editando ────────────────────────────
  if (isEditing) return

  // k → foco en el input principal
  if (e.key === 'k' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    nexusInput?.focus()
    nexusInput?.select()
    return
  }

  // Ctrl/Cmd+K → búsqueda global
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const modal = document.getElementById('global-search-modal')
    if (modal && modal.style.display !== 'none') window.closeGlobalSearch?.()
    else window.openGlobalSearch?.()
    return
  }

  // Ctrl/Cmd+/ → cheatsheet
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault()
    window.showShortcutCheatsheet?.()
    return
  }

  // 1-8 → cambio de vista
  if (NEXUS_VIEW_KEYS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    window.switchView(NEXUS_VIEW_KEYS[e.key])
    return
  }
})

// ── Cheatsheet modal ──────────────────────────────────────────────────────────
window.showShortcutCheatsheet = () => {
  let el = document.getElementById('shortcut-cheatsheet')
  if (el) { el.style.display = el.style.display === 'none' ? 'flex' : 'none'; return }
  el = document.createElement('div')
  el.id = 'shortcut-cheatsheet'
  el.onclick = () => { el.style.display = 'none' }
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);'
  const ROWS = [
    ['k',         'Foco en input — nueva entrada'],
    ['Ctrl+K',    'Búsqueda global'],
    ['Ctrl+/',    'Este cheatsheet'],
    ['1 – 8',     'Cambiar vista (Panel / Kanban / Finanzas / Notas / Tiempo / Proyectos / Contactos / Agenda)'],
    ['Esc',       'Cerrar modal activo'],
    ['↑ ↓',       'Navegar sugerencias del parser'],
    ['Tab / →',   'Completar sugerencia'],
    ['Enter',     'Guardar entrada / confirmar'],
  ]
  el.innerHTML = `<div onclick="event.stopPropagation()" style="background:#0d1117;border:1px solid rgba(0,246,255,0.2);border-radius:16px;padding:28px 32px;min-width:420px;max-width:520px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
      <span style="font-size:14px;font-weight:800;color:#fff;letter-spacing:0.04em;">⌨️ Keyboard Shortcuts</span>
      <button onclick="document.getElementById('shortcut-cheatsheet').style.display='none'" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:18px;">×</button>
    </div>
    ${ROWS.map(([k,d])=>`<div style="display:flex;align-items:center;gap:16px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <kbd style="font-family:'JetBrains Mono',monospace;font-size:11px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:5px;padding:3px 8px;color:#00f0ff;white-space:nowrap;flex-shrink:0;">${k}</kbd>
      <span style="font-size:13px;color:#94a3b8;">${d}</span>
    </div>`).join('')}
    <p style="font-size:11px;color:#64748b;margin-top:14px;text-align:center;">Presiona Esc o haz clic afuera para cerrar</p>
  </div>`
  document.body.appendChild(el)
}

// ══════════════════════════════════════════════════════════════
// QUICKCREATE — entrada visual sin parser manual
// ══════════════════════════════════════════════════════════════

/** Builds a <select> of account names from allNodes */
function _qcAccountSelect(id = 'qc-account') {
  const accounts = allNodes
    .filter(n => n.type === 'account' || n.metadata?.account_hint)
    .reduce((acc, n) => {
      const name = n.metadata?.name || n.metadata?.account_hint || n.content
      if (name && !acc.includes(name.toLowerCase())) acc.push(name.toLowerCase())
      return acc
    }, ['efectivo', 'bbva', 'banamex', 'nu', 'hsbc'])
  const opts = [...new Set(accounts)].map(a => `<option value="${a}">${a}</option>`).join('')
  return `<select id="${id}" class="modal-input">${opts}</select>`
}

/** Builds a <select> of project slugs */
function _qcProjectSelect(id = 'qc-project', allowEmpty = true) {
  const projects = allNodes.filter(n => n.type === 'proyecto')
  const emptyOpt = allowEmpty ? '<option value="">— Sin proyecto —</option>' : ''
  const opts = projects.map(n => {
    const slug = n.metadata?.project_slug || ''
    const label = n.metadata?.label || n.content
    return `<option value="${slug}">${label}</option>`
  }).join('')
  return `<select id="${id}" class="modal-input">${emptyOpt}${opts}</select>`
}

const QC_FORMS = {
  note: () => `
    <div class="modal-field">
      <label class="modal-label">Nota</label>
      <textarea id="qc-f1" class="modal-input" rows="3" placeholder="Escribe tu idea, contexto o recordatorio..." style="resize:vertical;"></textarea>
    </div>`,

  kanban: () => `
    <div class="modal-field">
      <label class="modal-label">Descripción de la tarea</label>
      <input id="qc-f1" class="modal-input" placeholder="Ej: Llamar al arquitecto" />
    </div>
    <div class="modal-field">
      <label class="modal-label">Proyecto (opcional)</label>
      ${_qcProjectSelect('qc-project')}
    </div>`,

  expense: () => `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="modal-field">
        <label class="modal-label">Monto ($)</label>
        <input id="qc-amount" class="modal-input" type="number" min="0" step="0.01" placeholder="1200" />
      </div>
      <div class="modal-field">
        <label class="modal-label">Cuenta</label>
        ${_qcAccountSelect('qc-account')}
      </div>
    </div>
    <div class="modal-field">
      <label class="modal-label">Descripción</label>
      <input id="qc-f1" class="modal-input" placeholder="Ej: cemento, gasolina, comida..." />
    </div>
    <div class="modal-field">
      <label class="modal-label">Proyecto (opcional)</label>
      ${_qcProjectSelect('qc-project')}
    </div>`,

  income: () => `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="modal-field">
        <label class="modal-label">Monto ($)</label>
        <input id="qc-amount" class="modal-input" type="number" min="0" step="0.01" placeholder="25000" />
      </div>
      <div class="modal-field">
        <label class="modal-label">Cuenta</label>
        ${_qcAccountSelect('qc-account')}
      </div>
    </div>
    <div class="modal-field">
      <label class="modal-label">Descripción</label>
      <input id="qc-f1" class="modal-input" placeholder="Ej: anticipo cliente, pago servicio..." />
    </div>`,

  proyecto: () => `
    <div class="modal-field">
      <label class="modal-label">Nombre del proyecto</label>
      <input id="qc-f1" class="modal-input" placeholder="Ej: Casa Tulum 2025" />
    </div>
    <div class="modal-field">
      <label class="modal-label">Presupuesto total (opcional)</label>
      <input id="qc-budget" class="modal-input" type="number" min="0" placeholder="500000" />
    </div>`,

  contact: () => `
    <div class="modal-field">
      <label class="modal-label">Nombre completo</label>
      <input id="qc-f1" class="modal-input" placeholder="Ej: Carlos García" />
    </div>
    <div class="modal-field">
      <label class="modal-label">Profesión / rol</label>
      <input id="qc-f2" class="modal-input" placeholder="Ej: electricista, arquitecto, contador..." />
    </div>`,

  cotizacion: () => `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="modal-field">
        <label class="modal-label">Monto ($)</label>
        <input id="qc-amount" class="modal-input" type="number" min="0" placeholder="45000" />
      </div>
      <div class="modal-field">
        <label class="modal-label">Proyecto</label>
        ${_qcProjectSelect('qc-project', false)}
      </div>
    </div>
    <div class="modal-field">
      <label class="modal-label">Descripción del servicio</label>
      <input id="qc-f1" class="modal-input" placeholder="Ej: instalación eléctrica completa" />
    </div>`,

  event: () => `
    <div class="modal-field">
      <label class="modal-label">Evento</label>
      <input id="qc-f1" class="modal-input" placeholder="Ej: reunión con arquitecto" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="modal-field">
        <label class="modal-label">Fecha</label>
        <input id="qc-date" class="modal-input" type="date" />
      </div>
      <div class="modal-field">
        <label class="modal-label">Hora (opcional)</label>
        <input id="qc-time" class="modal-input" type="time" />
      </div>
    </div>`,
}

let _qcCurrentType = null

window.openQuickCreate = function(type = null) {
  const modal = document.getElementById('quickcreate-modal')
  if (!modal) return
  modal.classList.remove('hidden')
  modal.style.display = 'flex'
  if (type) {
    qcShowForm(type)
  } else {
    document.getElementById('qc-type-picker').style.display = 'grid'
    document.getElementById('qc-form-area').style.display = 'none'
  }
}

window.closeQuickCreate = function() {
  const modal = document.getElementById('quickcreate-modal')
  if (!modal) return
  modal.classList.add('hidden')
  modal.style.display = 'none'
  _qcCurrentType = null
}

window.qcShowForm = function(type) {
  _qcCurrentType = type
  document.getElementById('qc-type-picker').style.display = 'none'
  const formArea = document.getElementById('qc-form-area')
  formArea.style.display = 'block'
  const formContent = document.getElementById('qc-form-content')
  formContent.innerHTML = QC_FORMS[type] ? QC_FORMS[type]() : ''
  // Auto-set today's date for events
  if (type === 'event') {
    const dateInput = document.getElementById('qc-date')
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0]
  }
  // Focus first input
  setTimeout(() => formContent.querySelector('input,textarea')?.focus(), 50)
}

window.qcBackToPicker = function() {
  _qcCurrentType = null
  document.getElementById('qc-type-picker').style.display = 'grid'
  document.getElementById('qc-form-area').style.display = 'none'
}

window.qcSubmit = function() {
  const type = _qcCurrentType
  if (!type) return

  let parserText = ''
  const v = id => document.getElementById(id)?.value?.trim() || ''

  switch (type) {
    case 'note':
      parserText = v('qc-f1')
      if (!parserText) { showToast('⚠️ Escribe algo para la nota'); return }
      break

    case 'kanban': {
      const desc = v('qc-f1')
      if (!desc) { showToast('⚠️ Describe la tarea'); return }
      const proj = v('qc-project')
      parserText = `#tarea ${desc}${proj ? ' #' + proj : ''}`
      break
    }

    case 'expense': {
      const amt = v('qc-amount')
      if (!amt) { showToast('⚠️ Ingresa el monto'); return }
      const desc = v('qc-f1') || 'Gasto'
      const acct = v('qc-account') || 'efectivo'
      const proj = v('qc-project')
      parserText = `-$${amt} ${desc} @${acct}${proj ? ' #' + proj : ''}`
      break
    }

    case 'income': {
      const amt = v('qc-amount')
      if (!amt) { showToast('⚠️ Ingresa el monto'); return }
      const desc = v('qc-f1') || 'Ingreso'
      const acct = v('qc-account') || 'efectivo'
      parserText = `+$${amt} ${desc} @${acct}`
      break
    }

    case 'proyecto': {
      const name = v('qc-f1')
      if (!name) { showToast('⚠️ Dale un nombre al proyecto'); return }
      const budget = v('qc-budget')
      parserText = `#proyecto ${name}`
      // budget gets added via metadata after insert — handled separately
      if (budget && +budget > 0) {
        // Store budget to inject after node creation
        window._qcPendingBudget = +budget
        window._qcPendingProjectName = name
      }
      break
    }

    case 'contact': {
      const name = v('qc-f1')
      if (!name) { showToast('⚠️ Escribe el nombre del contacto'); return }
      const role = v('qc-f2')
      parserText = `#persona ${name}${role ? ' ' + role : ''}`
      break
    }

    case 'cotizacion': {
      const amt = v('qc-amount')
      if (!amt) { showToast('⚠️ Ingresa el monto de la cotización'); return }
      const desc = v('qc-f1') || 'Servicio'
      const proj = v('qc-project')
      parserText = `#cotizacion $${amt} ${desc}${proj ? ' @' + proj : ''}`
      break
    }

    case 'event': {
      const desc = v('qc-f1')
      if (!desc) { showToast('⚠️ Describe el evento'); return }
      const date = v('qc-date')
      const time = v('qc-time')
      parserText = `${desc}${date ? ' ' + date : ''}${time ? ' ' + time : ''}`
      break
    }

    default:
      return
  }

  // Inject into the main input and fire
  const input = document.getElementById('nexus-input')
  if (input) {
    input.value = parserText
    input.dispatchEvent(new Event('input'))
    // Simulate Enter to trigger insertNode
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }

  closeQuickCreate()
}

// ══════════════════════════════════════════════════════════════
// PORTAFOLIO CRYPTO — Agenda Financiera
// ══════════════════════════════════════════════════════════════

const CRYPTO_STORAGE_KEY = 'nexus_crypto_portfolio'

/** Load portfolio from localStorage (no server needed for crypto data) */
function loadCryptoPortfolio() {
  try {
    return JSON.parse(localStorage.getItem(CRYPTO_STORAGE_KEY) || '{"purchases":[],"prices":{}}')
  } catch { return { purchases: [], prices: {} } }
}

function saveCryptoPortfolio(portfolio) {
  localStorage.setItem(CRYPTO_STORAGE_KEY, JSON.stringify(portfolio))
}

/** Aggregate purchases by coin → {coin, holdings, invested, price} */
function getCryptoCoins(portfolio) {
  const coinMap = {}
  for (const p of portfolio.purchases) {
    const c = p.coin.toUpperCase()
    if (!coinMap[c]) coinMap[c] = { coin: c, holdings: 0, invested: 0 }
    coinMap[c].holdings += Number(p.coins) || 0
    coinMap[c].invested += Number(p.pesos) || 0
  }
  return Object.values(coinMap).map(c => ({
    ...c,
    price: portfolio.prices[c.coin] || 0,
    currentValue: c.holdings * (portfolio.prices[c.coin] || 0),
  }))
}

function fmtCrypto(n) {
  if (!n && n !== 0) return '—'
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCoins(n) {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}

window.renderCryptoPortfolio = function() {
  const portfolio = loadCryptoPortfolio()
  const coins = getCryptoCoins(portfolio)

  // ── KPI row ────────────────────────────────────────────────
  const totalInvested = coins.reduce((s, c) => s + c.invested, 0)
  const totalCurrent  = coins.reduce((s, c) => s + c.currentValue, 0)
  const totalGain     = totalCurrent - totalInvested
  const totalPct      = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(1) : 0
  const gainColor     = totalGain >= 0 ? '#4ade80' : '#f87171'

  const kpiEl = document.getElementById('crypto-kpi-row')
  if (kpiEl) kpiEl.innerHTML = [
    { label: 'Total invertido', val: fmtCrypto(totalInvested), color: '#a78bfa' },
    { label: 'Valor actual',    val: totalCurrent > 0 ? fmtCrypto(totalCurrent) : '—', color: '#60a5fa' },
    { label: 'Ganancia / Pérd.', val: totalCurrent > 0 ? `${totalGain >= 0 ? '+' : ''}${fmtCrypto(totalGain)}` : '—', color: gainColor },
    { label: 'Rendimiento',     val: totalCurrent > 0 ? `${totalGain >= 0 ? '+' : ''}${totalPct}%` : '—', color: gainColor },
    { label: 'Monedas en cartera', val: String(coins.length), color: '#fbbf24' },
    { label: 'Compras totales',  val: String(portfolio.purchases.length), color: '#94a3b8' },
  ].map(k => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:6px;">${k.label}</div>
      <div style="font-size:18px;font-weight:800;color:${k.color};font-family:'JetBrains Mono',monospace;">${k.val}</div>
    </div>`).join('')

  // ── Per-coin table ─────────────────────────────────────────
  const tbody = document.getElementById('crypto-coins-body')
  if (!tbody) return

  if (coins.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;">Sin compras registradas — haz clic en <strong style="color:#a78bfa;">+ Registrar compra</strong> para comenzar</td></tr>`
  } else {
    tbody.innerHTML = coins.map(c => {
      const hasPrice = c.price > 0
      const gain     = c.currentValue - c.invested
      const gainPct  = c.invested > 0 ? ((gain / c.invested) * 100).toFixed(1) : null
      const gainClr  = gain >= 0 ? '#4ade80' : '#f87171'
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="padding:12px 16px;">
          <div style="font-weight:800;color:#fff;font-size:13px;">${esc(c.coin)}</div>
        </td>
        <td style="text-align:right;padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#e2e8f0;">${fmtCoins(c.holdings)}</td>
        <td style="text-align:right;padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#a78bfa;">${fmtCrypto(c.invested)}</td>
        <td style="text-align:right;padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;color:${hasPrice?'#60a5fa':'var(--text-muted)'};">
          ${hasPrice ? fmtCrypto(c.currentValue) : `<button onclick="openCryptoPriceModal('${c.coin}')" style="background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);border-radius:6px;padding:3px 8px;font-size:10px;color:#a78bfa;cursor:pointer;font-family:inherit;">Ingresar precio</button>`}
        </td>
        <td style="text-align:right;padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;color:${hasPrice?gainClr:'var(--text-dim)'};">
          ${hasPrice ? `${gain >= 0?'+':''}${fmtCrypto(gain)}<span style="font-size:10px;opacity:0.7;margin-left:4px;">(${gain>=0?'+':''}${gainPct}%)</span>` : '—'}
        </td>
        <td style="padding:12px 8px;text-align:right;">
          <button onclick="openCryptoPriceModal('${c.coin}')" title="Actualizar precio" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:13px;" onmouseover="this.style.color='#a78bfa'" onmouseout="this.style.color='var(--text-dim)'">✏️</button>
        </td>
      </tr>`
    }).join('')
  }

  // ── Purchase history ───────────────────────────────────────
  const histEl = document.getElementById('crypto-history')
  if (histEl) {
    const sorted = [...portfolio.purchases].sort((a, b) => new Date(b.date) - new Date(a.date))
    histEl.innerHTML = sorted.length === 0
      ? `<p style="color:var(--text-muted);font-size:12px;">Sin historial.</p>`
      : sorted.map((p, i) => {
          const realIdx = portfolio.purchases.indexOf(p)
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;">
            <div style="font-size:12px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;flex-shrink:0;">${p.date}</div>
            <div style="font-weight:700;color:#a78bfa;font-size:12px;flex-shrink:0;">${esc(p.coin)}</div>
            <div style="flex:1;font-size:12px;color:var(--text-secondary);">
              <span style="color:#4ade80;">${fmtCrypto(p.pesos)}</span> → <span style="color:#e2e8f0;">${fmtCoins(p.coins)} ${esc(p.coin)}</span>
              ${p.price ? `<span style="color:var(--text-muted);font-size:10px;"> @ ${fmtCrypto(p.price)}/u</span>` : ''}
            </div>
            <button onclick="deleteCryptoPurchase(${realIdx})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;" title="Eliminar compra">✕</button>
          </div>`
        }).join('')
  }
}

// ── Modals ─────────────────────────────────────────────────────

window.openCryptoPurchaseModal = function() {
  const modal = document.getElementById('crypto-purchase-modal')
  if (!modal) return
  modal.classList.remove('hidden')
  modal.style.display = 'flex'
  const dateInput = document.getElementById('cp-date')
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0]
  document.getElementById('cp-pesos')?.focus()
}

window.closeCryptoPurchaseModal = function() {
  const modal = document.getElementById('crypto-purchase-modal')
  if (modal) { modal.classList.add('hidden'); modal.style.display = 'none' }
  // Reset custom coin
  document.getElementById('cp-coin-custom-wrap').style.display = 'none'
  document.getElementById('cp-coin').value = 'XRP'
  document.getElementById('cp-pesos').value = ''
  document.getElementById('cp-coins').value = ''
  document.getElementById('cp-price').value = ''
}

document.addEventListener('change', e => {
  if (e.target.id === 'cp-coin') {
    const customWrap = document.getElementById('cp-coin-custom-wrap')
    if (customWrap) customWrap.style.display = e.target.value === 'OTRO' ? 'block' : 'none'
  }
})

window.cpAutoPrice = function() {
  const pesos = parseFloat(document.getElementById('cp-pesos')?.value) || 0
  const coins = parseFloat(document.getElementById('cp-coins')?.value) || 0
  if (pesos > 0 && coins > 0) {
    const priceEl = document.getElementById('cp-price')
    if (priceEl && !priceEl.matches(':focus')) priceEl.value = (pesos / coins).toFixed(6)
  }
}

window.cpAutoCoins = function() {
  const pesos = parseFloat(document.getElementById('cp-pesos')?.value) || 0
  const price = parseFloat(document.getElementById('cp-price')?.value) || 0
  if (pesos > 0 && price > 0) {
    const coinsEl = document.getElementById('cp-coins')
    if (coinsEl && !coinsEl.matches(':focus')) coinsEl.value = (pesos / price).toFixed(6)
  }
}

window.saveCryptoPurchase = function() {
  const coinSel = document.getElementById('cp-coin')?.value
  const coin = coinSel === 'OTRO'
    ? (document.getElementById('cp-coin-custom')?.value?.trim().toUpperCase() || 'OTRO')
    : coinSel
  const date  = document.getElementById('cp-date')?.value
  const pesos = parseFloat(document.getElementById('cp-pesos')?.value)
  const coins = parseFloat(document.getElementById('cp-coins')?.value)
  const price = parseFloat(document.getElementById('cp-price')?.value) || 0

  if (!coin)    { showToast('⚠️ Selecciona una moneda'); return }
  if (!date)    { showToast('⚠️ Ingresa la fecha'); return }
  if (!pesos || pesos <= 0) { showToast('⚠️ Ingresa los pesos invertidos'); return }
  if (!coins || coins <= 0) { showToast('⚠️ Ingresa las monedas recibidas'); return }

  const portfolio = loadCryptoPortfolio()
  portfolio.purchases.push({ coin, date, pesos, coins, price })
  saveCryptoPortfolio(portfolio)

  closeCryptoPurchaseModal()
  renderCryptoPortfolio()
  showToast(`✅ Compra de ${coins} ${coin} registrada`)
}

// ── Update price ─────────────────────────────────────────────

let _cpPriceCoin = null

window.openCryptoPriceModal = function(coin) {
  _cpPriceCoin = coin
  const modal = document.getElementById('crypto-price-modal')
  if (!modal) return
  modal.classList.remove('hidden')
  modal.style.display = 'flex'
  const titleEl = document.getElementById('cpm-title')
  if (titleEl) titleEl.textContent = `Precio actual: ${coin}`
  const labelEl = document.getElementById('cpm-label')
  if (labelEl) labelEl.textContent = `Precio actual de ${coin} en pesos MXN`
  const priceEl = document.getElementById('cpm-price')
  if (priceEl) {
    const portfolio = loadCryptoPortfolio()
    priceEl.value = portfolio.prices[coin] || ''
    priceEl.focus()
    priceEl.select()
  }
}

window.closeCryptoPriceModal = function() {
  const modal = document.getElementById('crypto-price-modal')
  if (modal) { modal.classList.add('hidden'); modal.style.display = 'none' }
  _cpPriceCoin = null
}

window.saveCryptoPrice = function() {
  if (!_cpPriceCoin) return
  const price = parseFloat(document.getElementById('cpm-price')?.value)
  if (!price || price <= 0) { showToast('⚠️ Precio inválido'); return }

  const portfolio = loadCryptoPortfolio()
  portfolio.prices[_cpPriceCoin] = price
  saveCryptoPortfolio(portfolio)

  closeCryptoPriceModal()
  renderCryptoPortfolio()
  showToast(`✅ Precio de ${_cpPriceCoin} actualizado: ${fmtCrypto(price)}`)
}

window.deleteCryptoPurchase = function(idx) {
  if (!confirm('¿Eliminar esta compra del historial?')) return
  const portfolio = loadCryptoPortfolio()
  portfolio.purchases.splice(idx, 1)
  saveCryptoPortfolio(portfolio)
  renderCryptoPortfolio()
  showToast('🗑 Compra eliminada')
}

// ══════════════════════════════════════════════════════════════
// ODOO PATTERNS — Project Health + Milestones + Stage
// ══════════════════════════════════════════════════════════════

// ── Stage (Odoo project.project.stage) ──────────────────────

window.projSetStage = async function(projectId, stage) {
  const node = allNodes.find(n => n.id === projectId)
  if (!node) return
  node.metadata = { ...(node.metadata || {}), stage }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    const { error } = await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', projectId)
    if (error) { showToast('⚠️ Error al guardar etapa'); return }
  }
  showToast(`✅ Etapa actualizada: ${stage}`)
  renderAll()
}

// ── Health Modal (Odoo project.update) ──────────────────────

let _healthProjectId = null

window.openHealthModal = function(projectId) {
  _healthProjectId = projectId
  const node = allNodes.find(n => n.id === projectId)
  const h = node?.metadata?.health || {}
  const modal = document.getElementById('project-health-modal')
  if (!modal) return
  // Pre-fill form
  const sel = document.getElementById('phm-status')
  if (sel) sel.value = h.status || 'on_track'
  const prog = document.getElementById('phm-progress')
  if (prog) { prog.value = h.progress ?? 0; document.getElementById('phm-progress-val').textContent = (h.progress ?? 0) + '%' }
  const note = document.getElementById('phm-note')
  if (note) note.value = h.note || ''
  phm_updateColors()
  modal.classList.remove('hidden'); modal.style.display = 'flex'
}

window.closeHealthModal = function() {
  const modal = document.getElementById('project-health-modal')
  if (modal) { modal.classList.add('hidden'); modal.style.display = 'none' }
  _healthProjectId = null
}

window.phm_updateColors = function() {
  const STATUS_COLORS = { on_track:'#4ade80', at_risk:'#fbbf24', off_track:'#f87171', on_hold:'#60a5fa', done:'#a78bfa' }
  const sel = document.getElementById('phm-status')
  if (!sel) return
  const c = STATUS_COLORS[sel.value] || '#94a3b8'
  sel.style.borderColor = c
  sel.style.color = c
}

window.saveHealthModal = async function() {
  if (!_healthProjectId) return
  const status   = document.getElementById('phm-status')?.value
  const progress = parseInt(document.getElementById('phm-progress')?.value || '0')
  const note     = document.getElementById('phm-note')?.value.trim()

  const node = allNodes.find(n => n.id === _healthProjectId)
  if (!node) return

  node.metadata = {
    ...(node.metadata || {}),
    health: {
      status,
      progress,
      note: note || null,
      updated_at: new Date().toISOString().split('T')[0],
    }
  }

  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    const { error } = await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', _healthProjectId)
    if (error) { showToast('⚠️ Error al guardar'); return }
  }

  closeHealthModal()
  showToast('✅ Estado del proyecto actualizado')
  renderAll()
  // Re-open dashboard to reflect changes
  openProjectDashboard(_healthProjectId)
}

// ── Milestones (Odoo project.milestone) ─────────────────────

// Alias: el botón Hito en action bar llama a openMilestoneForm → abre el modal
window.openMilestoneForm = function(projectId) {
  openMilestoneModal(projectId, -1)
}

// Modal de hito — crea o edita
window.openMilestoneModal = function(projectId, idx = -1) {
  document.getElementById('ms-project-id').value = projectId
  document.getElementById('ms-index').value = idx
  const node = allNodes.find(n => n.id === projectId)
  const mils = node?.metadata?.milestones || []
  const ms   = idx >= 0 ? mils[idx] : null
  document.getElementById('ms-name').value     = ms?.name || ''
  document.getElementById('ms-desc').value     = ms?.desc || ''
  document.getElementById('ms-responsible-search').value = ms?.responsible_name || ''
  document.getElementById('ms-responsible-id').value     = ms?.responsible_id || ''
  const nameDiv = document.getElementById('ms-responsible-name')
  if (ms?.responsible_name) { nameDiv.textContent = '👤 ' + ms.responsible_name; nameDiv.style.display='block' }
  else { nameDiv.textContent = ''; nameDiv.style.display='none' }
  document.getElementById('ms-deadline').value = ms?.deadline || ''
  document.getElementById('ms-reached-date').value = ms?.reached_date || ''
  const rdField = document.getElementById('ms-reached-date-field')
  if (rdField) rdField.style.display = ms?.is_reached ? 'block' : 'none'
  document.getElementById('ms-responsible-results').style.display = 'none'
  document.getElementById('milestone-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('ms-name')?.focus(), 100)
}

window.filterMsResponsible = (q) => {
  const results = document.getElementById('ms-responsible-results')
  if (!q.trim()) { results.style.display='none'; return }
  const matches = getContacts().filter(n =>
    (n.metadata?.name||n.content||'').toLowerCase().includes(q.toLowerCase())
  ).slice(0,8)
  if (!matches.length) { results.style.display='none'; return }
  results.innerHTML = matches.map(n => {
    const name = esc(n.metadata?.name||n.content)
    return `<div style="padding:8px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);"
      onmousedown="selectMsResponsible('${n.id}','${name}')">${name}</div>`
  }).join('')
  results.style.display = 'block'
}

window.selectMsResponsible = (id, name) => {
  document.getElementById('ms-responsible-id').value = id
  document.getElementById('ms-responsible-search').value = name
  const nameDiv = document.getElementById('ms-responsible-name')
  nameDiv.textContent = '👤 ' + name; nameDiv.style.display='block'
  document.getElementById('ms-responsible-results').style.display='none'
}

window.closeMilestoneModal = () => document.getElementById('milestone-modal').classList.add('hidden')

window.saveMilestoneModal = async () => {
  const projectId      = document.getElementById('ms-project-id').value
  const idx            = parseInt(document.getElementById('ms-index').value)
  const name           = document.getElementById('ms-name').value.trim()
  const desc           = document.getElementById('ms-desc').value.trim() || null
  const responsible_id = document.getElementById('ms-responsible-id').value || null
  const responsible_name = document.getElementById('ms-responsible-search').value.trim() || null
  const deadline       = document.getElementById('ms-deadline').value || null
  const reached_date   = document.getElementById('ms-reached-date').value || null
  if (!name) { showToast('⚠️ El nombre es obligatorio'); return }
  const node = allNodes.find(n => n.id === projectId)
  if (!node) return
  const mils = [...(node.metadata?.milestones || [])]
  if (idx >= 0 && mils[idx]) {
    // Edit existing
    mils[idx] = { ...mils[idx], name, desc, responsible_id, responsible_name, deadline, reached_date }
  } else {
    // New
    mils.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
      name, desc, responsible_id, responsible_name, deadline, reached_date,
      is_reached: false,
      created_at: new Date().toISOString(),
    })
  }
  node.metadata = { ...(node.metadata || {}), milestones: mils }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    const { error } = await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', projectId)
    if (error) { showToast('⚠️ Error al guardar hito'); return }
  }
  closeMilestoneModal()
  showToast(idx >= 0 ? `✏️ Hito actualizado` : `🏁 Hito "${name}" creado`)
  renderAll(); openProjectDashboard(projectId)
}

async function addMilestone(projectId, name, deadline) {
  const node = allNodes.find(n => n.id === projectId)
  if (!node) return
  const ms = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    name,
    deadline: deadline || null,
    is_reached: false,
    reached_date: null,
    created_at: new Date().toISOString(),
  }
  node.metadata = { ...(node.metadata || {}), milestones: [...(node.metadata?.milestones || []), ms] }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    const { error } = await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', projectId)
    if (error) { showToast('⚠️ Error al guardar hito'); return }
  }
  showToast(`🏁 Hito "${name}" creado`)
  renderAll(); openProjectDashboard(projectId)
}

window.toggleMilestone = async function(projectId, idx) {
  const node = allNodes.find(n => n.id === projectId)
  if (!node) return
  const mils = [...(node.metadata?.milestones || [])]
  if (!mils[idx]) return
  mils[idx] = {
    ...mils[idx],
    is_reached: !mils[idx].is_reached,
    reached_date: !mils[idx].is_reached ? new Date().toISOString().split('T')[0] : null,
  }
  node.metadata = { ...(node.metadata || {}), milestones: mils }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    const { error } = await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', projectId)
    if (error) { showToast('⚠️ Error al actualizar'); return }
  }
  const done = mils[idx].is_reached
  showToast(done ? `✅ Hito "${mils[idx].name}" alcanzado` : `↩️ Hito reabierto`)
  renderAll(); openProjectDashboard(projectId)
}

window.deleteMilestone = async function(projectId, idx) {
  if (!confirm('¿Eliminar este hito?')) return
  const node = allNodes.find(n => n.id === projectId)
  if (!node) return
  const mils = [...(node.metadata?.milestones || [])]
  mils.splice(idx, 1)
  node.metadata = { ...(node.metadata || {}), milestones: mils }
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    const { error } = await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', projectId)
    if (error) { showToast('⚠️ Error al eliminar'); return }
  }
  showToast('🗑 Hito eliminado')
  renderAll(); openProjectDashboard(projectId)
}
