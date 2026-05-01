import { createClient } from '@supabase/supabase-js'
import Fuse from 'fuse.js'

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

const COT_STATUS = {
  pendiente:  { label:'⏳ Pendiente',  color:'#fb923c' },
  aceptada:   { label:'✅ Aceptada',   color:'#4ade80' },
  rechazada:  { label:'❌ Rechazada',  color:'#f87171' },
}
const ROL_LABEL = { dueño:'👑 Dueño', ejecutor:'⚙️ Ejecutor', colaborador:'🤝 Colaborador' }

// ─────────────────────────────────────────
// Boot
// ─────────────────────────────────────────
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
  } else {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.href = '/'; return }
    currentUser = session.user
    document.getElementById('user-email').textContent = currentUser.email
    await loadNodes()
    setupRealtimeSubscription()
  }
  renderAll()
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
      renderAll()
    })
    .subscribe()
}

async function loadNodes() {
  const { data, error } = await supabase.from('nodes').select('*').eq('owner_id', currentUser.id).order('created_at', { ascending: false })
  if (!error) allNodes = data || []
  renderAll()
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

  const today = new Date().toISOString().split('T')[0]
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
    return `
      <div class="trello-list" 
           id="list-${list.id}" 
           ondragover="allowDrop(event)" 
           ondrop="cardDrop(event, '${list.id}')">
        <div class="trello-list-header">
          <span class="trello-list-title">${list.title}</span>
          <span style="color:#8c9bab; cursor:pointer;" onclick="manageList('${list.id}')">...</span>
        </div>
        <div class="trello-cards-container">
          ${cards.map(n => `
            <div class="trello-card" 
                 id="card-${n.id}" 
                 draggable="true" 
                 ondragstart="cardDragStart(event, '${n.id}')"
                 ondragend="this.style.opacity='1'"
                 onclick="openCardModal('${n.id}')">
              ${(() => { const imgs = n.metadata?.images; if (!imgs?.length) return ''; const src = typeof imgs[0]==='string' ? imgs[0] : (imgs[0].url||imgs[0].data||''); return src ? `<div style="margin:-12px -12px 10px -12px;height:120px;overflow:hidden;border-radius:8px 8px 0 0;"><img src="${src}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none'"/></div>` : '' })()}
              <div class="trello-card-title">${esc(n.metadata?.label || n.content)}</div>
              <div class="trello-card-meta">
                 ${(n.metadata?.comments || []).length > 0 ? `<span>💬 ${(n.metadata?.comments || []).length}</span>` : ''}
              </div>
              <div style="margin-top:8px; display:flex; gap:4px; flex-wrap:wrap;">
                 ${(n.metadata?.tags || [])
                   .filter(t => t.toLowerCase() !== `#${n.type.toLowerCase()}`)
                   .map(t => `<span class="tag-pill" onclick="event.stopPropagation(); setFilter('${t}')" style="background:var(--accent-cyan-dim); color:var(--accent-cyan); font-size:8px; padding:1px 4px; border-radius:3px; cursor:pointer;">${t}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="btn-add-card" onclick="startQuickAdd('${list.id}')">
           <span>+</span> Añade una tarjeta
        </div>
      </div>
    `
  }).join('') + `
    <div class="btn-add-list" onclick="addNewList()">
      <span>+</span> Añade otra lista
    </div>
  `
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
  if (confirm(`¿Eliminar la lista "${id}"?`)) {
    boardLists = boardLists.filter(l => l.id !== id)
    renderKanban()
  }
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
  container.innerHTML = (items.length ? `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
      <span style="font-size:11px; color:var(--text-muted); min-width:28px;">${pct}%</span>
      <div style="flex:1; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
        <div style="height:100%; width:${pct}%; background:var(--accent-cyan); border-radius:3px; transition:width 0.3s;"></div>
      </div>
    </div>` : '') +
  items.map((it, idx) => `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; group">
      <input type="checkbox" ${it.done ? 'checked' : ''} onchange="toggleCheckItem(${idx})" style="accent-color:var(--accent-cyan); width:16px; height:16px; cursor:pointer;" />
      <span style="flex:1; font-size:14px; color:${it.done ? 'var(--text-muted)' : '#fff'}; ${it.done ? 'text-decoration:line-through' : ''}">${esc(it.text)}</span>
      <span onclick="deleteCheckItem(${idx})" style="color:var(--text-muted); font-size:14px; cursor:pointer; padding:2px 6px; border-radius:4px; opacity:0.5;" onmouseover="this.style.opacity='1'; this.style.color='#f87171';" onmouseout="this.style.opacity='0.5'; this.style.color='var(--text-muted)';">✕</span>
    </div>
  `).join('')
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
function parseNode(text) {
  const t = text.trim()
  let type = 'note'
  let metadata = { tags: [] }
  let cleanContent = t

  // 1. Finanzas: +$ o -$
  if (t.startsWith('+$') || t.startsWith('-$')) {
    const isIncome = t.startsWith('+$')
    type = isIncome ? 'income' : 'expense'
    const acMatch = t.match(/@(\w+)/)
    const acHint = acMatch ? acMatch[1].toLowerCase() : null
    const match = t.match(/^([+-]\$\d+(?:\.\d+)?)\s*(.*)/)
    if (match) {
      metadata.amount = parseFloat(match[1].replace('+$', '').replace('-$', ''))
      metadata.currency = 'USD'
      const rawLabel = match[2] || (isIncome ? 'Ingreso' : 'Gasto')
      metadata.label = rawLabel.replace(/@\w+/g, '').trim() || (isIncome ? 'Ingreso' : 'Gasto')
      cleanContent = metadata.label
      if (acHint) metadata.account_hint = acHint
    }
  } 
  // 2. Supertags: #tarea, #persona, #proyecto
  else if (t.includes('#tarea')) {
    type = 'kanban'
    metadata.status = 'todo'
    metadata.tags.push('#tarea')
    cleanContent = t.replace('#tarea', '').trim()
    metadata.label = cleanContent
  }
  else if (t.includes('#persona')) {
    type = 'contact'
    metadata.cType = 'persona'
    metadata.tags.push('#persona')
    cleanContent = t.replace('#persona', '').trim()
    metadata.name  = cleanContent
    metadata.label = cleanContent
    metadata.color = '#fdba74'
  }
  else if (t.includes('#proyecto')) {
    type = 'proyecto'
    metadata.tags.push('#proyecto')
    cleanContent = t.replace('#proyecto', '').trim()
    metadata.label = cleanContent
  }
  else if (t.includes('#cotizacion') || t.includes('#cotización')) {
    type = 'cotizacion'
    metadata.tags.push('#cotizacion')
    metadata.status = 'pendiente'
    const amtMatch = t.match(/\$(\d+(?:[\.,]\d+)?)/)
    if (amtMatch) metadata.amount = parseFloat(amtMatch[1].replace(',', ''))
    const projMatch = t.match(/@(\w+)/)
    if (projMatch) metadata.project_tag = projMatch[1].toLowerCase()
    cleanContent = t.replace(/#cotizaci[oó]n/,'').replace(/\$[\d.,]+/,'').replace(/@\w+/,'').trim()
    metadata.label = cleanContent
  }
  // 3. Nota por defecto
  else {
    type = 'note'
    metadata.supertags = []
  }

  return { type, metadata, content: cleanContent }
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
    renderAll(); showToast(`NODO INYECTADO: ${type.toUpperCase()}`)
  } else {
    const q = loadOfflineQueue(); q.push({ payload }); saveOfflineQueue(q)
    if (idx !== -1) allNodes[idx] = { ...tempNode, _offline: true }
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
  setTimeout(() => {
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

// ── IDE AUTOCOMPLETE ENGINE ──────────────────────────────────────────────────
const IDE_COMMANDS = [
  { icon:'📌', prefix:'#tarea ',   tpl:'#tarea [descripción de la tarea]',       desc:'Tarea → Muro Táctico',    color:'#a78bfa', cat:'Comandos' },
  { icon:'💰', prefix:'+$',        tpl:'+$[monto] [descripción] @[cuenta]',       desc:'Ingreso → Bio-Finanzas',  color:'#4ade80', cat:'Comandos' },
  { icon:'💸', prefix:'-$',        tpl:'-$[monto] [descripción] @[cuenta]',       desc:'Gasto → Bio-Finanzas',    color:'#f87171', cat:'Comandos' },
  { icon:'👤', prefix:'#persona ', tpl:'#persona [nombre] — [empresa/rol]',       desc:'Contacto → CRM',          color:'#fdba74', cat:'Comandos' },
  { icon:'📁', prefix:'#proyecto ',tpl:'#proyecto [nombre] [descripción]',        desc:'Proyecto → Bóveda',       color:'#60a5fa', cat:'Comandos' },
  { icon:'💡', prefix:'#idea ',    tpl:'#idea [descripción de la idea]',          desc:'Idea → Bóveda Neural',    color:'#fbbf24', cat:'Comandos' },
  { icon:'📅', prefix:'📅 ',       tpl:'📅 [evento] [fecha opcional]',            desc:'Evento → Calendario',     color:'#34d399', cat:'Comandos' },
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
    preview.textContent = c.label + '   ↵ Enter para guardar'
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

function renderAll() {
  const nodes = getFilteredNodes()
  updateStats(nodes)
  renderFeed(nodes)
  renderKanban(nodes)
  renderNotes(nodes)
  renderFinance(nodes)
  renderCalendar(nodes)
  renderCronica(nodes)
  renderContacts()
  renderAgenda(allNodes)
  renderFilterBar()
  renderSemaforoCuentas()
  renderPulsoSemanal()
  checkHabitAlerts()
  // Keep Fuse index in sync with allNodes
  if (typeof buildFuseIndex === 'function') buildFuseIndex()
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

function feedItemHtml(n) {
  const tc = TYPE_CONFIG[n.type] || { label:`#${n.type.toUpperCase()}`, color:'var(--accent-cyan)', border:'rgba(0,246,255,0.3)', bg:'rgba(0,246,255,0.04)' }
  const amount = (n.type === 'income' || n.type === 'expense') && n.metadata?.amount
    ? `<span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:${tc.color};flex-shrink:0;">${n.type==='income'?'+':'-'}$${n.metadata.amount.toLocaleString()}</span>` : ''
  const timeStr = n.created_at ? `${new Date(n.created_at).getHours().toString().padStart(2,'0')}:${new Date(n.created_at).getMinutes().toString().padStart(2,'0')}` : '--:--'
  const newPulse = n._optimistic ? ' nexus-new-pulse' : ''
  return `
    <div class="feed-item${newPulse}" data-node-id="${n.id}" style="border-left:3px solid ${tc.border};background:${tc.bg};" onclick="openCardModal('${n.id}')">
      <span class="feed-time">${timeStr}</span>
      <span style="font-size:9px;font-weight:800;color:${tc.color};background:${tc.border.replace('0.4','0.12').replace('0.3','0.12')};padding:2px 8px;border-radius:4px;flex-shrink:0;">${tc.label}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;color:#f0f6fc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(n.metadata?.label || n.content)}</div>
        <div style="margin-top:3px;display:flex;gap:5px;flex-wrap:wrap;">
          ${(n.metadata?.tags||[]).filter(t=>t.toLowerCase()!==`#${n.type.toLowerCase()}`).map(t=>`<span style="background:${tc.border.replace('0.4','0.1').replace('0.3','0.1')};color:${tc.color};font-size:9px;padding:1px 5px;border-radius:3px;cursor:pointer;" onclick="event.stopPropagation();setFilter('${t}')">${t}</span>`).join('')}
        </div>
      </div>
      ${amount}
      ${n.type==='proyecto' ? `
        <span onclick="event.stopPropagation();openProyectoModal('${n.id}')" title="Editar proyecto" style="color:#2dd4bf;cursor:pointer;padding:4px;flex-shrink:0;font-size:13px;" title="Editar presupuesto/rol">✏️</span>
        <span onclick="event.stopPropagation();openProjectView('${n.id}')" title="Vista de Proyecto" style="color:#60a5fa;cursor:pointer;padding:4px;flex-shrink:0;font-size:13px;">📁</span>
      ` : ''}
      ${n.type==='cotizacion' ? (() => {
        const st = n.metadata?.status || 'pendiente'
        const stCfg = COT_STATUS[st] || COT_STATUS.pendiente
        const amt = n.metadata?.amount ? `<span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:#fb923c;flex-shrink:0;font-size:12px;">$${(+n.metadata.amount).toLocaleString('es-MX')}</span>` : ''
        const statusBadge = `<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:${stCfg.color}22;color:${stCfg.color};font-weight:700;flex-shrink:0;">${stCfg.label}</span>`
        const quickBtns = st !== 'aceptada' ? `<span onclick="event.stopPropagation();changeCotizacionStatus('${n.id}','aceptada')" title="Aceptar" style="color:#4ade80;cursor:pointer;padding:4px;flex-shrink:0;font-size:14px;">✅</span>` : ''
        const editBtn = `<span onclick="event.stopPropagation();openCotizacionModal('${n.id}')" title="Editar" style="color:#fb923c;cursor:pointer;padding:4px;flex-shrink:0;font-size:13px;">✏️</span>`
        return amt + statusBadge + quickBtns + editBtn
      })() : ''}
      <span onclick="event.stopPropagation();if(confirm('¿Eliminar?')){deleteNode('${n.id}')}" style="color:var(--text-dim);cursor:pointer;padding:4px;flex-shrink:0;">✕</span>
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
    .filter(n => n.type === 'note' || n.type === 'persona' || n.type === 'proyecto')
    .sort((a, b) => (b.metadata?.pinned ? 1 : 0) - (a.metadata?.pinned ? 1 : 0))

  root.innerHTML = notes.map(n => {
    const color = n.metadata?.color || ''
    const colorStyle = NOTE_COLORS[color] || ''
    const isPinned = n.metadata?.pinned
    return `
    <div class="note-keep" style="${colorStyle}" ondblclick="openNoteEdit('${n.id}')" title="Doble clic para editar">
      <div class="note-keep-inner">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
          <div style="font-size:9px; font-weight:800; color:var(--accent-cyan);">#${n.type.toUpperCase()}</div>
          <span title="${isPinned ? 'Desfijar' : 'Fijar'}"
                onclick="event.stopPropagation(); togglePin('${n.id}')"
                style="cursor:pointer; font-size:12px; opacity:${isPinned ? '1' : '0.3'};">📌</span>
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
  document.getElementById('note-edit-modal').classList.remove('hidden')
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
  if (!confirm('¿Eliminar esta nota?')) return
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes = allNodes.filter(n => n.id !== editingNoteId)
  } else {
    await supabase.from('nodes').delete().eq('id', editingNoteId)
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
  const txs = nodes.filter(n => (n.type === 'income' || n.type === 'expense' || n.type === 'loan') &&
    (activeAccount === 'all' || (n.metadata?.account_id === activeAccount)))

  const income  = txs.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const expense = txs.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)

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

    statsHtml = `
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1.5px;margin-bottom:12px;">💼 BALANCE POR CUENTA — clic para ver detalle</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px;">
        ${accountCards}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
        <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:14px;padding:16px;">
          <div style="font-size:10px;color:#6ee7b7;font-weight:800;letter-spacing:1.5px;margin-bottom:8px;">↑ TOTAL INGRESOS</div>
          <div id="fin-kpi-income" style="font-size:22px;font-weight:800;color:#4ade80;font-family:'JetBrains Mono',monospace;">+$${consolidatedInc.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${allTxs.filter(n=>n.type==='income').length} transacciones</div>
        </div>
        <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:14px;padding:16px;">
          <div style="font-size:10px;color:#fca5a5;font-weight:800;letter-spacing:1.5px;margin-bottom:8px;">↓ TOTAL GASTOS</div>
          <div id="fin-kpi-expense" style="font-size:22px;font-weight:800;color:#f87171;font-family:'JetBrains Mono',monospace;">-$${consolidatedExp.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${allTxs.filter(n=>n.type==='expense').length} transacciones</div>
        </div>
        <div style="background:${consolidatedNet>=0?'rgba(0,246,255,0.06)':'rgba(251,146,60,0.06)'};border:1px solid ${consolidatedNet>=0?'rgba(0,246,255,0.2)':'rgba(251,146,60,0.2)'};border-radius:14px;padding:16px;">
          <div style="font-size:10px;color:${cNetClr};font-weight:800;letter-spacing:1.5px;margin-bottom:8px;">⚖ NETO CONSOLIDADO</div>
          <div id="fin-kpi-net" style="font-size:22px;font-weight:800;color:${cNetClr};font-family:'JetBrains Mono',monospace;">${consolidatedNet>=0?'+':''}\$${consolidatedNet.toLocaleString()}</div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${consolidatedNet>=0?'✅ Flujo positivo':'⚠️ Déficit acumulado'}</div>
        </div>
      </div>
      ${topTags.length > 0 ? `<div style="margin-top:16px;background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:12px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;margin-bottom:10px;">🏷 TOP CATEGORÍAS DE GASTO</div>
        ${topTagsHtml}
      </div>` : ''}
    </div>`

  } else {
    // ── DASHBOARD CUENTA ESPECÍFICA ────────────────────────────────
    const aClr = activeAcc?.metadata?.color || '#00f6ff'
    const txCount = txs.length
    const avgExp  = txs.filter(n=>n.type==='expense').length > 0
      ? expense / txs.filter(n=>n.type==='expense').length : 0
    const maxTx   = [...txs].sort((a,b)=>(b.metadata?.amount||0)-(a.metadata?.amount||0))[0]
    const balClr  = accBalance >= 0 ? aClr : '#fb923c'
    const balBg   = accBalance >= 0 ? `${aClr}0d` : 'rgba(251,146,60,0.06)'
    const balBdr  = accBalance >= 0 ? `${aClr}30` : 'rgba(251,146,60,0.25)'

    statsHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-bottom:28px;">
      <div style="background:${balBg};border:1px solid ${balBdr};border-radius:14px;padding:18px;grid-column:span 1;">
        <div style="font-size:9px;color:${balClr};font-weight:800;letter-spacing:1.5px;margin-bottom:8px;">💳 SALDO ACTUAL</div>
        <div id="fin-kpi-net" style="font-size:22px;font-weight:800;color:${balClr};font-family:'JetBrains Mono',monospace;">${accBalance>=0?'+':''}\$${accBalance.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">Inicial: $${initBalance.toLocaleString()}</div>
      </div>
      <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:14px;padding:18px;">
        <div style="font-size:9px;color:#6ee7b7;font-weight:800;letter-spacing:1.5px;margin-bottom:8px;">↑ INGRESOS</div>
        <div id="fin-kpi-income" style="font-size:22px;font-weight:800;color:#4ade80;font-family:'JetBrains Mono',monospace;">+$${income.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${txs.filter(n=>n.type==='income').length} mov.</div>
      </div>
      <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:14px;padding:18px;">
        <div style="font-size:9px;color:#fca5a5;font-weight:800;letter-spacing:1.5px;margin-bottom:8px;">↓ GASTOS</div>
        <div id="fin-kpi-expense" style="font-size:22px;font-weight:800;color:#f87171;font-family:'JetBrains Mono',monospace;">-$${expense.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">Prom: $${Math.round(avgExp).toLocaleString()}</div>
      </div>
      <div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:14px;padding:18px;">
        <div style="font-size:9px;color:#c4b5fd;font-weight:800;letter-spacing:1.5px;margin-bottom:8px;">📊 MOVIMIENTOS</div>
        <div style="font-size:22px;font-weight:800;color:#a78bfa;font-family:'JetBrains Mono',monospace;">${txCount}</div>
        ${maxTx ? `<div style="font-size:10px;color:var(--text-dim);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Mayor: ${esc(maxTx.metadata?.label||maxTx.content)}">Mayor: $${(maxTx.metadata?.amount||0).toLocaleString()}</div>` : ''}
      </div>
    </div>`
  }

  const rowsHtml = txs.length === 0
    ? '<div style="text-align:center; color:var(--text-muted); padding:40px;">Sin transacciones. Escribe <b>+$1000 Salario</b> o <b>-$200 Renta</b></div>'
    : txs.map(n => {
        const isIncome = n.type === 'income'; const isLoan = n.type === 'loan'
        const m = n.metadata || {}
        const acc = accounts.find(a => a.id === m.account_id)
        const fechaDisp = m.fecha || n.created_at?.split('T')[0] || ''
        const moneda = m.moneda || 'MXN'
        const refIcon = m.referencia ? '🧾' : ''
        const contactBadge = m.contact_name
          ? `<span style="background:rgba(0,246,255,0.1);color:#00f6ff;border-radius:6px;padding:1px 7px;font-size:10px;cursor:pointer;" onclick="event.stopPropagation();openContactByName('${esc(m.contact_name)}')">${isIncome?'De':'A'}: ${esc(m.contact_name)}</span>` : ''
        const bancoBadge = m.banco ? `<span style="background:rgba(255,255,255,0.06);color:#94a3b8;border-radius:6px;padding:1px 7px;font-size:10px;">🏦 ${esc(m.banco)}</span>` : ''
        const clabeBadge = m.clabe ? `<span style="background:rgba(255,255,255,0.04);color:#64748b;border-radius:6px;padding:1px 7px;font-size:10px;font-family:monospace;">${esc(m.clabe.slice(-6).padStart(m.clabe.length,'·'))}</span>` : ''
        return `
        <div onclick="openFinanceDetail('${n.id}')" style="display:flex; align-items:flex-start; gap:16px; padding:14px 8px; border-bottom:1px solid rgba(255,255,255,0.04); cursor:pointer; transition:background 0.15s; border-radius:8px;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
          <div style="width:36px;height:36px;border-radius:10px;flex-shrink:0;background:${isIncome?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.12)'};display:grid;place-items:center;font-size:18px;margin-top:2px;">
            ${isIncome ? '↑' : '↓'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;color:#fff;font-weight:600;margin-bottom:4px;">${esc(m.label||n.content)} ${refIcon}</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
              <span style="font-size:11px;color:var(--text-muted);">${fechaDisp}</span>
              ${acc ? `<span style="background:${acc.metadata?.color||'#4ade80'}22;color:${acc.metadata?.color||'#4ade80'};border-radius:6px;padding:1px 7px;font-size:10px;font-weight:700;">${esc(acc.metadata?.label||acc.content)}</span>` : ''}
              ${contactBadge}
              ${bancoBadge}
              ${clabeBadge}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:17px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${isIncome?'#4ade80':'#f87171'};">${isIncome?'+':'-'}$${(m.amount||0).toLocaleString()}</div>
            <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${moneda}</div>
          </div>
        </div>
      `}).join('')

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
    `<div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:16px;padding:24px;">${rowsHtml}</div>`

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
  let headerHtml = `<div style="width:${TIME_W}px;padding:6px 4px;"></div>`
  dayColumns.forEach(({dayLabel, isToday}) => {
    headerHtml += `<div style="padding:8px 4px;text-align:center;border-left:1px solid rgba(255,255,255,0.06);${isToday?'color:var(--accent-cyan);font-weight:800;':'color:var(--text-muted);font-weight:600;'}">${dayLabel}</div>`
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
      dayLabel: `<div style="font-size:10px;">${DAYS[d.getDay()]}</div><div style="font-size:${isToday?20:15}px;">${d.getDate()}</div>`,
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

  // ── KPIs ─────────────────────────────────────────────────────
  const totalSubs  = subs.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalBills = bills.filter(b => !b.metadata?.paid).reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalFixed = totalSubs + totalBills
  const kpis = [
    { label:'Gasto fijo mensual', value:fmt$(totalFixed), color:'#fb923c' },
    { label:'Suscripciones activas', value: subs.length, color:'#a78bfa' },
    { label:'Tarjetas registradas', value: cards.length, color:'#60a5fa' },
    { label:'Pagos pendientes', value: bills.filter(b => !b.metadata?.paid).length, color:'#f87171' },
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

  const incomeAll = nodes.filter(n => n.type === 'income')
  const incomeNodes = agendaPlanAccounts.size === 0
    ? incomeAll
    : incomeAll.filter(n => !n.metadata?.account_id || agendaPlanAccounts.has(n.metadata.account_id))
  const expenseNodes = nodes.filter(n => n.type === 'expense')
  const totalIn  = incomeNodes.reduce((s,n)  => s + (n.metadata?.amount||0), 0)
  const totalOut = expenseNodes.reduce((s,n) => s + (n.metadata?.amount||0), 0) + totalFixed

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
    // Suscripciones como salidas fijas
    subs.forEach(n => {
      rows.push(`<tr>
        <td style="padding:5px 4px;color:var(--text-muted);">${esc(n.metadata?.label||n.content)} <span style="font-size:9px;opacity:0.5;">(día ${n.metadata?.dayOfMonth||1})</span></td>
        <td style="text-align:right;padding:5px 4px;color:var(--text-dim);">—</td>
        <td style="text-align:right;padding:5px 4px;color:#f87171;font-family:'JetBrains Mono',monospace;">${fmt$(n.metadata?.amount||0)}</td>
        <td style="text-align:right;padding:5px 4px;"></td>
      </tr>`)
    })
    // Pagos fijos pendientes
    bills.filter(b => !b.metadata?.paid).forEach(n => {
      rows.push(`<tr>
        <td style="padding:5px 4px;color:var(--text-muted);">${esc(n.metadata?.label||n.content)}</td>
        <td style="text-align:right;padding:5px 4px;color:var(--text-dim);">—</td>
        <td style="text-align:right;padding:5px 4px;color:#fb923c;font-family:'JetBrains Mono',monospace;">${fmt$(n.metadata?.amount||0)}</td>
        <td style="text-align:right;padding:5px 4px;"></td>
      </tr>`)
    })
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
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:${paid?'rgba(74,222,128,0.05)':clr+'14'};border:1px solid ${paid?'#4ade8033':clr+'33'};border-radius:12px;opacity:${paid?0.6:1};">
          <button onclick="toggleBillPaid('${b.id}')" style="background:${paid?'#4ade80':'transparent'};border:2px solid ${paid?'#4ade80':clr};width:20px;height:20px;border-radius:5px;cursor:pointer;flex-shrink:0;color:${paid?'#000':'transparent'};font-size:12px;display:flex;align-items:center;justify-content:center;">✓</button>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:600;color:#fff;${paid?'text-decoration:line-through;':''}">${esc(m.label||b.content)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:3px;">
              ${m.dueDate?`<span style="font-size:10px;color:var(--text-muted);">📅 ${m.dueDate}</span>`:''}
              ${billContactName?`<span style="font-size:10px;color:var(--text-muted);">→ ${esc(billContactName)}</span>`:''}
              ${m.method?`<span style="font-size:10px;color:var(--text-muted);">${methodLabel[m.method]||m.method}</span>`:''}
            </div>
          </div>
          <div style="font-size:13px;font-weight:800;color:${clr};font-family:'JetBrains Mono',monospace;">${fmt$(m.amount||0)}</div>
          <button onclick="deleteAgendaItem('${b.id}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:12px;" title="Eliminar">✕</button>
        </div>`
      }).join('')
}

function fmt$(n) {
  if (typeof n !== 'number') return '$0'
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ── AGENDA MODAL ──────────────────────────────────────────────────────────────
window.openAgendaModal = (type) => {
  agendaItemType = type
  editingAgendaId = null
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
    meta = { ...meta,
      amount:     parseFloat(document.getElementById('ag-amount')?.value) || 0,
      currency:   document.getElementById('ag-currency')?.value || 'MXN',
      dayOfMonth: parseInt(document.getElementById('ag-day')?.value) || null,
      category:   document.getElementById('ag-category')?.value || '',
      paid: false
    }
    if (agendaItemType === 'bill') {
      meta.contactId = document.getElementById('ag-bill-contact')?.value || ''
      meta.method    = document.getElementById('ag-bill-method')?.value || 'transferencia'
      meta.dueDate = (() => {
        const day = meta.dayOfMonth; if (!day) return ''
        const d = new Date(); d.setDate(day)
        if (d < new Date()) d.setMonth(d.getMonth() + 1)
        return d.toISOString().split('T')[0]
      })()
    }
  }
  closeAgendaModal()
  await insertDirectNode(agendaItemType, name, meta)
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
  // Render on-demand views
  if (viewName === 'tags') { window.renderTagsView(); window.renderHabitosSection() }
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
  localStorage.setItem('nexus_' + cls, collapsed ? '1' : '0')
  const btn = document.getElementById('toggle-' + which)
  if (!btn) return
  if (which === 'nav')  btn.textContent = collapsed ? '▶' : '◀'
  if (which === 'side') btn.textContent = collapsed ? '◀' : '▶'
  playClick()
}

// Restore panel state — must run after DOM ready
function restorePanels() {
  if (localStorage.getItem('nexus_nav-collapsed') === '1') {
    document.body.classList.add('nav-collapsed')
    const b = document.getElementById('toggle-nav'); if (b) b.textContent = '▶'
  }
  if (localStorage.getItem('nexus_side-collapsed') === '1') {
    document.body.classList.add('side-collapsed')
    const b = document.getElementById('toggle-side'); if (b) b.textContent = '◀'
  }
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
window.setTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('nexus_theme', theme)
  const darkBtn  = document.getElementById('theme-dark-btn')
  const lightBtn = document.getElementById('theme-light-btn')
  const accentOn  = '2px solid var(--accent-cyan)'
  const accentOff = '2px solid transparent'
  if (darkBtn)  { darkBtn.style.border  = theme === 'dark'  ? accentOn : accentOff; darkBtn.style.color  = theme === 'dark'  ? '#fff' : 'var(--text-muted)' }
  if (lightBtn) { lightBtn.style.border = theme === 'light' ? accentOn : accentOff; lightBtn.style.color = theme === 'light' ? '#fff' : 'var(--text-muted)' }
}

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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (!document.getElementById('card-modal')?.classList.contains('hidden')) closeCardModal()
  if (!document.getElementById('note-edit-modal')?.classList.contains('hidden')) closeNoteModal()
  if (!document.getElementById('account-modal')?.classList.contains('hidden')) closeAccountModal()
  if (!document.getElementById('transfer-modal')?.classList.contains('hidden')) closeTransferModal()
  if (!document.getElementById('finance-detail-modal')?.classList.contains('hidden')) closeFinanceDetail()
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
      if (cardOpen) compressImage(file, b => addAttachment(b, 'card'))
      else if (noteOpen) compressImage(file, b => addAttachment(b, 'note'))
      else if (finOpen) compressImage(file, b => addAttachment(b, 'finance'))
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

function renderContacts() {
  const root = document.getElementById('contacts-root')
  if (!root) return
  const search = document.getElementById('contact-search')?.value?.toLowerCase() || ''
  let contacts = getContacts()
  if (activeContactFilter !== 'all') contacts = contacts.filter(c => c.metadata?.cType === activeContactFilter)
  if (search) contacts = contacts.filter(c =>
    (c.metadata?.name || c.content).toLowerCase().includes(search) ||
    (c.metadata?.phone || '').includes(search) ||
    (c.metadata?.email || '').toLowerCase().includes(search) ||
    (c.metadata?.company || '').toLowerCase().includes(search)
  )

  if (contacts.length === 0) {
    root.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:60px 20px;">
      <div style="font-size:40px;margin-bottom:12px;">👥</div>
      <div style="font-size:14px;">Sin contactos aún.<br>Crea uno con el botón <b>+ Nuevo</b> o usa <code>#persona Nombre</code> en la barra.</div>
    </div>`
    return
  }

  root.innerHTML = contacts.map(c => {
    const m = c.metadata || {}
    const name  = m.name || c.content
    const cType = m.cType || 'persona'
    const color = m.color || (cType==='proveedor' ? '#f97316' : '#00f0ff')
    const inits = cType === 'persona' ? contactInitials(name) : contactTypeIcon(cType)
    const txCount = allNodes.filter(n =>
      (n.type === 'income' || n.type === 'expense') && n.metadata?.contact_id === c.id
    ).length
    const totalPaid = allNodes
      .filter(n => n.type === 'expense' && n.metadata?.contact_id === c.id)
      .reduce((s,n) => s + (n.metadata?.amount||0), 0)

    const provExtra = cType === 'proveedor' ? `
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px;">
        ${m.specialty ? `<span style="font-size:11px; color:#f97316; background:rgba(249,115,22,0.1); padding:1px 7px; border-radius:4px;">${esc(m.specialty)}</span>` : ''}
        ${m.zone ? `<span style="font-size:11px; color:var(--text-dim);">📍${esc(m.zone)}</span>` : ''}
        ${m.rating ? `<span style="font-size:11px;">${'⭐'.repeat(m.rating)}</span>` : ''}
        ${m.prov_status ? `<span style="font-size:10px; color:var(--text-dim);">${PROV_STATUS_LABEL[m.prov_status]||''}</span>` : ''}
      </div>` : ''

    return `<div class="contact-card" onclick="openContactSheet('${c.id}')">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div class="contact-avatar" style="background:${color}20; color:${color}; border:1.5px solid ${color}40; font-size:${cType==='persona'?'16':'20'}px;">${inits}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(name)}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(m.company || m.bank_name || m.network || m.specialty || '')}</div>
          ${m.phone ? `<div style="font-size:11px; color:var(--text-muted); margin-top:1px;">📞 ${esc(m.phone)}</div>` : ''}
          ${provExtra}
        </div>
      </div>
      ${txCount > 0 ? `<div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted);">
        <span>${txCount} transacción${txCount!==1?'es':''}</span>
        ${totalPaid > 0 ? `<span style="color:#f87171;">-$${totalPaid.toLocaleString()}</span>` : ''}
      </div>` : ''}
    </div>`
  }).join('')
}

// ── Contact Sheet (slide-in) ──────────────
// ── Servicios y Cuentas de cobro — renderizado en ficha ──────────────────────

function renderProvServices(c) {
  const services = c.metadata?.services || []
  const btnStyle = 'background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.3);color:#fb923c;border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;font-weight:600;'
  const delStyle = 'background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:2px 4px;'
  return `
  <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);padding-top:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:0.08em;">💼 SERVICIOS</span>
      <button onclick="openServiceModal('${c.id}')" style="${btnStyle}">+ Añadir servicio</button>
    </div>
    ${services.length ? services.map(s => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${esc(s.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);">$${(+s.price||0).toLocaleString('es-MX')} / ${esc(s.unit||'servicio')}</div>
        </div>
        <button onclick="openPaymentModal('${c.id}','${s.id}')" style="background:rgba(251,146,60,0.12);border:1px solid rgba(251,146,60,0.3);color:#fb923c;border-radius:7px;padding:5px 10px;font-size:11px;cursor:pointer;font-weight:700;">💸 Pagar</button>
        <button onclick="deleteProvService('${c.id}','${s.id}')" style="${delStyle}" title="Eliminar servicio">✕</button>
      </div>`).join('')
    : `<div style="color:var(--text-dim);font-size:12px;padding:8px 0;">Sin servicios. Añade uno para agilizar registros de pago.</div>`}
  </div>`
}

function renderContactAccounts(c) {
  const accounts = c.metadata?.contact_accounts || []
  const btnStyle = 'background:rgba(0,246,255,0.08);border:1px solid rgba(0,246,255,0.25);color:#00f6ff;border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;font-weight:600;'
  const delStyle = 'background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;padding:2px 4px;'
  return `
  <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);padding-top:14px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:0.08em;">🏦 CUENTAS DE COBRO</span>
      <button onclick="openContactAccountModal('${c.id}')" style="${btnStyle}">+ Añadir cuenta</button>
    </div>
    ${accounts.length ? accounts.map(a => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${esc(a.name)}</div>
          ${a.clabe ? `<code style="font-size:11px;font-family:monospace;color:var(--text-muted);">${esc(a.clabe)}</code>` : ''}
          ${a.handle ? `<span style="font-size:11px;color:var(--text-muted);">${esc(a.handle)}</span>` : ''}
          ${a.type && a.type!=='bank' ? `<span style="font-size:10px;background:rgba(167,139,250,0.1);color:#a78bfa;border-radius:4px;padding:1px 5px;margin-left:4px;">${a.type}</span>` : ''}
        </div>
        ${a.clabe ? `<button onclick="navigator.clipboard.writeText('${esc(a.clabe)}').then(()=>showToast('CLABE copiada'))" style="background:rgba(0,246,255,0.08);border:1px solid rgba(0,246,255,0.2);color:#00f6ff;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">📋</button>` : ''}
        <button onclick="deleteContactAccount('${c.id}','${a.id}')" style="${delStyle}" title="Eliminar cuenta">✕</button>
      </div>`).join('')
    : `<div style="color:var(--text-dim);font-size:12px;padding:8px 0;">Sin cuentas. Añade la(s) cuenta(s) donde te cobra este proveedor.</div>`}
  </div>`
}

// ── CRUD servicios ────────────────────────────────────────────────────────────
let editingServiceContactId = null

window.openServiceModal = (contactId) => {
  editingServiceContactId = contactId
  document.getElementById('svc-name').value  = ''
  document.getElementById('svc-price').value = ''
  document.getElementById('svc-unit').value  = 'servicio'
  document.getElementById('svc-notes').value = ''
  document.getElementById('service-modal').classList.remove('hidden')
}

window.closeServiceModal = () => document.getElementById('service-modal').classList.add('hidden')

window.saveService = async () => {
  const name = document.getElementById('svc-name').value.trim()
  if (!name) { showToast('El nombre del servicio es obligatorio'); return }
  const node = allNodes.find(n => n.id === editingServiceContactId)
  if (!node) return
  const service = {
    id:    'svc_' + Date.now(),
    name,
    price: parseFloat(document.getElementById('svc-price').value) || 0,
    unit:  document.getElementById('svc-unit').value.trim() || 'servicio',
    notes: document.getElementById('svc-notes').value.trim() || undefined,
  }
  node.metadata.services = [...(node.metadata.services || []), service]
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', node.id)
  closeServiceModal()
  renderAll()
  setTimeout(() => openContactSheet(editingServiceContactId), 150)
  showToast(`Servicio "${name}" añadido`)
}

window.deleteProvService = async (contactId, serviceId) => {
  const node = allNodes.find(n => n.id === contactId)
  if (!node) return
  node.metadata.services = (node.metadata.services || []).filter(s => s.id !== serviceId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', node.id)
  renderAll()
  setTimeout(() => openContactSheet(contactId), 150)
}

// ── CRUD cuentas de cobro ─────────────────────────────────────────────────────
let editingAccountContactId = null

window.openContactAccountModal = (contactId) => {
  editingAccountContactId = contactId
  document.getElementById('cacc-name').value   = ''
  document.getElementById('cacc-type').value   = 'bank'
  document.getElementById('cacc-clabe').value  = ''
  document.getElementById('cacc-handle').value = ''
  document.getElementById('cacc-clabe-row').style.display  = ''
  document.getElementById('cacc-handle-row').style.display = 'none'
  document.getElementById('contact-account-modal').classList.remove('hidden')
}

window.closeContactAccountModal = () => document.getElementById('contact-account-modal').classList.add('hidden')

window.caccTypeChange = () => {
  const t = document.getElementById('cacc-type').value
  document.getElementById('cacc-clabe-row').style.display  = t === 'bank' ? '' : 'none'
  document.getElementById('cacc-handle-row').style.display = t !== 'bank' ? '' : 'none'
}

window.saveContactAccount = async () => {
  const name = document.getElementById('cacc-name').value.trim()
  if (!name) { showToast('El nombre del banco/billetera es obligatorio'); return }
  const node = allNodes.find(n => n.id === editingAccountContactId)
  if (!node) return
  const t = document.getElementById('cacc-type').value
  const account = {
    id:     'cacc_' + Date.now(),
    name,
    type:   t,
    clabe:  t === 'bank'  ? document.getElementById('cacc-clabe').value.trim()  || undefined : undefined,
    handle: t !== 'bank'  ? document.getElementById('cacc-handle').value.trim() || undefined : undefined,
  }
  node.metadata.contact_accounts = [...(node.metadata.contact_accounts || []), account]
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', node.id)
  closeContactAccountModal()
  renderAll()
  setTimeout(() => openContactSheet(editingAccountContactId), 150)
  showToast(`Cuenta "${name}" añadida`)
}

window.deleteContactAccount = async (contactId, accountId) => {
  const node = allNodes.find(n => n.id === contactId)
  if (!node) return
  node.metadata.contact_accounts = (node.metadata.contact_accounts || []).filter(a => a.id !== accountId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true')
    await supabase.from('nodes').update({ metadata: node.metadata }).eq('id', node.id)
  renderAll()
  setTimeout(() => openContactSheet(contactId), 150)
}

window.openContactSheet = (id) => {
  const c = allNodes.find(n => n.id === id)
  if (!c) return
  currentContactId = id
  const m = c.metadata || {}
  const name  = m.name || c.content
  const cType = m.cType || 'persona'
  const color = m.color || '#00f0ff'
  const inits = cType === 'persona' ? contactInitials(name) : contactTypeIcon(cType)

  const avatarEl = document.getElementById('csh-avatar')
  if (avatarEl) {
    avatarEl.textContent = inits
    avatarEl.style.cssText = `width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:${cType==='persona'?'18':'24'}px;font-weight:800;background:${color}20;color:${color};border:2px solid ${color}50;`
  }
  document.getElementById('csh-name').textContent = name
  document.getElementById('csh-type-badge').innerHTML = `<span style="background:${color}18;color:${color};border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">${contactTypeIcon(cType)} ${cType.toUpperCase()}</span>`

  currentCSheetTab = 'perfil'
  document.querySelectorAll('.csheet-tab').forEach((t,i) => t.classList.toggle('active', i===0))
  renderCSheetTab('perfil', c)

  const sheet = document.getElementById('contact-sheet')
  if (sheet) sheet.classList.remove('hidden')
}

window.closeContactSheet = (e) => {
  if (e && e.target !== document.getElementById('contact-sheet')) return
  document.getElementById('contact-sheet')?.classList.add('hidden')
  currentContactId = null
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

// ── Contact Modal (create / edit) ─────────
let editingContactType = 'persona'

window.openContactModal = (id = null) => {
  editingContactType = 'persona'
  const c = id ? allNodes.find(n => n.id === id) : null
  const m = c?.metadata || {}
  editingContactType = m.cType || 'persona'

  document.getElementById('contact-modal-title').textContent = c ? 'Editar Contacto' : 'Nuevo Contacto'
  document.getElementById('cm-name').value    = m.name || c?.content || ''
  document.getElementById('cm-color').value  = m.color || '#00f0ff'
  document.getElementById('cm-phone').value  = m.phone || ''
  document.getElementById('cm-email').value  = m.email || ''
  document.getElementById('cm-company').value = m.company || ''
  if (document.getElementById('cm-rfc')) document.getElementById('cm-rfc').value = m.rfc || ''
  document.getElementById('cm-bank-name').value = m.bank_name || ''
  document.getElementById('cm-clabe').value  = m.clabe || ''
  if (document.getElementById('cm-account-no')) document.getElementById('cm-account-no').value = m.account_no || ''
  document.getElementById('cm-holder').value = m.holder || ''
  if (document.getElementById('cm-bank-rfc')) document.getElementById('cm-bank-rfc').value = m.rfc || ''
  document.getElementById('cm-network').value = m.network || ''
  document.getElementById('cm-wallet').value = m.wallet || ''
  if (document.getElementById('cm-memo')) document.getElementById('cm-memo').value = m.memo || ''
  // Proveedor fields
  if (document.getElementById('cm-prov-specialty')) document.getElementById('cm-prov-specialty').value = m.specialty || ''
  if (document.getElementById('cm-prov-zone'))      document.getElementById('cm-prov-zone').value      = m.zone || ''
  if (document.getElementById('cm-prov-price'))     document.getElementById('cm-prov-price').value     = m.price || ''
  if (document.getElementById('cm-prov-phone'))     document.getElementById('cm-prov-phone').value     = m.phone || ''
  if (document.getElementById('cm-prov-status'))    document.getElementById('cm-prov-status').value    = m.prov_status || 'activo'
  if (document.getElementById('cm-prov-rating'))    document.getElementById('cm-prov-rating').value    = String(m.rating || 3)
  // Phase 1 — Proveedor extra fields
  if (document.getElementById('cm-prov-rfc'))     document.getElementById('cm-prov-rfc').value     = m.rfc || ''
  if (document.getElementById('cm-prov-pay-day')) document.getElementById('cm-prov-pay-day').value = m.pay_day || ''
  if (document.getElementById('cm-prov-address')) document.getElementById('cm-prov-address').value = m.address || ''
  if (document.getElementById('cm-prov-bank'))    document.getElementById('cm-prov-bank').value    = m.bank_name || ''
  if (document.getElementById('cm-prov-clabe'))   document.getElementById('cm-prov-clabe').value   = m.clabe || ''
  if (document.getElementById('cm-prov-crypto'))  {
    const cb = document.getElementById('cm-prov-crypto')
    cb.checked = !!m.accepts_crypto
    const netEl = document.getElementById('cm-prov-crypto-net')
    if (netEl) { netEl.style.display = m.accepts_crypto ? 'flex' : 'none'; netEl.value = m.crypto_nets || '' }
  }
  document.getElementById('cm-notes').value  = m.notes || ''
  document.getElementById('cm-delete').style.display = c ? 'inline-flex' : 'none'

  // Set type buttons
  document.querySelectorAll('[data-ct]').forEach(btn => btn.classList.toggle('active', btn.dataset.ct === editingContactType))
  showContactTypeFields(editingContactType)

  currentContactId = id
  document.getElementById('contact-modal').classList.remove('hidden')
}

window.closeContactModal = () => {
  document.getElementById('contact-modal').classList.add('hidden')
}

window.selectContactType = (type, btn) => {
  editingContactType = type
  document.querySelectorAll('[data-ct]').forEach(b => b.classList.remove('active'))
  btn?.classList.add('active')
  showContactTypeFields(type)
}

function showContactTypeFields(type) {
  document.getElementById('cm-persona-fields').style.display    = type === 'persona'   ? '' : 'none'
  document.getElementById('cm-proveedor-fields').style.display  = type === 'proveedor' ? '' : 'none'
  document.getElementById('cm-bank-fields').style.display       = type === 'bank'      ? '' : 'none'
  document.getElementById('cm-crypto-fields').style.display     = type === 'crypto'    ? '' : 'none'
}

window.saveContact = async () => {
  const name = document.getElementById('cm-name').value.trim()
  if (!name) return
  const cType = editingContactType
  const meta = {
    name, cType,
    color:    document.getElementById('cm-color').value,
    notes:    document.getElementById('cm-notes').value.trim(),
    ...(cType==='persona' ? {
      phone:   document.getElementById('cm-phone').value.trim(),
      email:   document.getElementById('cm-email').value.trim(),
      company: document.getElementById('cm-company').value.trim(),
      rfc:     document.getElementById('cm-rfc')?.value.trim() || undefined,
    } : cType==='proveedor' ? {
      specialty:      document.getElementById('cm-prov-specialty')?.value.trim() || '',
      zone:           document.getElementById('cm-prov-zone')?.value.trim() || '',
      price:          document.getElementById('cm-prov-price')?.value.trim() || '',
      phone:          document.getElementById('cm-prov-phone')?.value.trim() || '',
      prov_status:    document.getElementById('cm-prov-status')?.value || 'activo',
      rating:         parseInt(document.getElementById('cm-prov-rating')?.value || '3'),
      rfc:            document.getElementById('cm-prov-rfc')?.value.trim().toUpperCase() || undefined,
      pay_day:        document.getElementById('cm-prov-pay-day')?.value ? parseInt(document.getElementById('cm-prov-pay-day').value) : undefined,
      address:        document.getElementById('cm-prov-address')?.value.trim() || undefined,
      bank_name:      document.getElementById('cm-prov-bank')?.value.trim() || undefined,
      clabe:          document.getElementById('cm-prov-clabe')?.value.trim() || undefined,
      accepts_crypto: document.getElementById('cm-prov-crypto')?.checked || false,
      crypto_nets:    document.getElementById('cm-prov-crypto-net')?.value.trim() || undefined,
    } : cType==='bank' ? {
      bank_name:  document.getElementById('cm-bank-name').value.trim(),
      clabe:      document.getElementById('cm-clabe').value.trim(),
      account_no: document.getElementById('cm-account-no')?.value.trim() || undefined,
      holder:     document.getElementById('cm-holder').value.trim(),
      rfc:        document.getElementById('cm-bank-rfc')?.value.trim() || undefined,
    } : {
      network: document.getElementById('cm-network').value.trim(),
      wallet:  document.getElementById('cm-wallet').value.trim(),
      memo:    document.getElementById('cm-memo')?.value.trim() || undefined,
    })
  }

  if (currentContactId && allNodes.find(n=>n.id===currentContactId)) {
    const node = allNodes.find(n=>n.id===currentContactId)
    node.content = name; node.metadata = meta
    if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
      await supabase.from('nodes').update({ content:name, metadata:meta }).eq('id', currentContactId)
    }
  } else {
    if (localStorage.getItem('nexus_admin_bypass') === 'true') {
      allNodes.unshift({ id: Math.random().toString(36).substr(2,9), type:'contact', content:name, metadata:meta, created_at:new Date().toISOString() })
    } else {
      const { data } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'contact', content:name, metadata:meta }).select()
      if (data?.[0]) allNodes.unshift(data[0])
    }
  }
  const isNewProveedor = cType === 'proveedor' && !currentContactId
  closeContactModal()
  renderAll()
  showToast(`Contacto "${name}" guardado`)
  // Prompt contextual para nuevos proveedores
  if (isNewProveedor) {
    const saved = allNodes.find(n => n.type === 'contact' && n.metadata?.name === name && n.metadata?.cType === 'proveedor')
    if (saved) setTimeout(() => showEnrichPrompt(saved.id, name), 400)
  }
}

window.deleteContact = async () => {
  if (!currentContactId || !confirm('¿Eliminar este contacto?')) return
  allNodes = allNodes.filter(n=>n.id!==currentContactId)
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').delete().eq('id', currentContactId)
  }
  closeContactModal()
  document.getElementById('contact-sheet')?.classList.add('hidden')
  renderAll()
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
let fxIntervalId = null

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

  // Top 10 con tendencia mensual
  const top10El = document.getElementById('tag-top10')
  if (top10El) {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10)
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1).toISOString().slice(0,10)
    const top = sorted.slice(0, 10)
    top10El.innerHTML = top.length ? top.map(([tag, count], idx) => {
      const nodes = tagNodeMap[tag] || []
      const cThis = nodes.filter(n => { const d = n.metadata?.date||(n.created_at?.slice(0,10)||''); return d >= thisMonthStart }).length
      const cPrev = nodes.filter(n => { const d = n.metadata?.date||(n.created_at?.slice(0,10)||''); return d >= prevMonthStart && d < thisMonthStart }).length
      const trend = cThis > cPrev ? '↑' : cThis < cPrev ? '↓' : '→'
      const tColor = trend==='↑'?'#4ade80':trend==='↓'?'#f87171':'#94a3b8'
      const bar = Math.round((count/maxFreq)*100)
      return `<div onclick="openTagFolder('${esc(tag)}')" style="display:flex;align-items:center;gap:10px;padding:6px 4px;cursor:pointer;border-radius:8px;transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''">
        <span style="font-size:11px;color:var(--text-dim);width:16px;text-align:right;flex-shrink:0;">${idx+1}</span>
        <span style="font-size:13px;color:#a855f7;flex:1;font-weight:600;">#${tag}</span>
        <div style="width:60px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;flex-shrink:0;">
          <div style="width:${bar}%;height:100%;background:#a855f7;border-radius:3px;"></div>
        </div>
        <span style="font-size:12px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;flex-shrink:0;">${count}</span>
        <span style="font-size:13px;color:${tColor};flex-shrink:0;" title="Este mes:${cThis} / Anterior:${cPrev}">${trend}</span>
      </div>`
    }).join('') : '<span style="color:var(--text-muted);font-size:13px;">Sin etiquetas aún.</span>'
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
  // Todos los nodos que tienen etiqueta #hábito
  const habitNodes = allNodes.filter(n => {
    const tags = (n.metadata?.tags||[]).map(t=>t.replace(/^#/,'').toLowerCase())
    return tags.includes('hábito') || tags.includes('habito')
  })

  // Extraer nombres de hábito (otras etiquetas además de #hábito)
  const habitNames = new Set()
  habitNodes.forEach(n => {
    ;(n.metadata?.tags||[]).forEach(t => {
      const clean = t.replace(/^#/,'').toLowerCase()
      if (clean !== 'hábito' && clean !== 'habito') habitNames.add(clean)
    })
  })

  // Por cada hábito, calcular: días con registro, racha actual, días desde último
  const habits = []
  habitNames.forEach(name => {
    const myNodes = habitNodes.filter(n =>
      (n.metadata?.tags||[]).map(t=>t.replace(/^#/,'').toLowerCase()).includes(name)
    )
    // Build set of dates
    const datesSet = new Set(myNodes.map(n => n.metadata?.date || n.created_at?.slice(0,10)).filter(Boolean))
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

window.openPaymentModal = (contactId, serviceId = null) => {
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

  // Reset fields
  document.getElementById('pay-project-tag').value   = ''
  document.getElementById('pay-quality-note').value  = ''
  document.querySelectorAll('#pay-stars [data-star]').forEach(s => s.style.opacity = '0.3')

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

  const tags = ['#gasto']
  if (projTag) tags.push('#' + projTag)

  const label = [selSvc?.name||'Pago', m.name||contact.content, projTag].filter(Boolean).join(' — ')
  const meta = {
    label, amount: total,
    contact_id:      paymentContactId,
    service_id:      selSvcId || undefined,
    service_name:    selSvc?.name || undefined,
    project_tag:     projTag || undefined,
    splits:          splits.length ? splits : undefined,
    quality_note:    qualNote || undefined,
    quality_rating:  paymentRating || undefined,
    tags,
  }

  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes.unshift({ id: 'pay_'+Date.now(), type:'expense', content:label, metadata:meta, created_at:new Date().toISOString() })
  } else {
    const { data } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'expense', content:label, metadata:meta }).select()
    if (data?.[0]) allNodes.unshift(data[0])
  }
  closePaymentModal()
  renderAll()
  showToast(`Pago de $${total.toLocaleString('es-MX')} registrado`)
}

// ═══════════════════════════════════════════════════════════
// COTIZACIONES — Phase 2
// ═══════════════════════════════════════════════════════════

let currentCotizacionId = null

window.openCotizacionModal = (id = null) => {
  const c = id ? allNodes.find(n => n.id === id) : null
  const m = c?.metadata || {}
  currentCotizacionId = id
  document.getElementById('cot-modal-title').textContent = c ? 'Editar Cotización' : 'Nueva Cotización'
  document.getElementById('cot-label').value         = m.label || c?.content || ''
  document.getElementById('cot-amount').value        = m.amount || ''
  document.getElementById('cot-status').value        = m.status || 'pendiente'
  document.getElementById('cot-project-tag').value  = m.project_tag || ''
  document.getElementById('cot-notes').value         = m.notes || ''
  // Populate provider dropdown
  const provs = allNodes.filter(n => n.type === 'contact' && n.metadata?.cType === 'proveedor')
  const sel = document.getElementById('cot-provider')
  sel.innerHTML = `<option value="">Sin proveedor</option>` +
    provs.map(p => `<option value="${p.id}" ${m.provider_id===p.id?'selected':''}>${esc(p.metadata?.name||p.content)}</option>`).join('')
  document.getElementById('cot-delete').style.display = c ? 'inline-flex' : 'none'
  document.getElementById('cotizacion-modal').classList.remove('hidden')
}

window.closeCotizacionModal = () => document.getElementById('cotizacion-modal').classList.add('hidden')

window.saveCotizacion = async () => {
  const label = document.getElementById('cot-label').value.trim()
  if (!label) { showToast('La descripción es obligatoria'); return }
  const projTag = document.getElementById('cot-project-tag').value.trim().toLowerCase()
  const tags = ['#cotizacion']
  if (projTag) tags.push('#' + projTag)
  const meta = {
    label,
    amount:      parseFloat(document.getElementById('cot-amount').value) || 0,
    status:      document.getElementById('cot-status').value,
    provider_id: document.getElementById('cot-provider').value || undefined,
    project_tag: projTag || undefined,
    notes:       document.getElementById('cot-notes').value.trim() || undefined,
    tags,
  }
  if (currentCotizacionId) {
    const node = allNodes.find(n => n.id === currentCotizacionId)
    if (node) { node.content = label; node.metadata = meta }
    if (localStorage.getItem('nexus_admin_bypass') !== 'true')
      await supabase.from('nodes').update({ content:label, metadata:meta }).eq('id', currentCotizacionId)
  } else {
    if (localStorage.getItem('nexus_admin_bypass') === 'true') {
      allNodes.unshift({ id:Math.random().toString(36).substr(2,9), type:'cotizacion', content:label, metadata:meta, created_at:new Date().toISOString() })
    } else {
      const { data } = await supabase.from('nodes').insert({ owner_id:currentUser.id, type:'cotizacion', content:label, metadata:meta }).select()
      if (data?.[0]) allNodes.unshift(data[0])
    }
  }
  closeCotizacionModal()
  renderAll()
  showToast(`Cotización "${label}" guardada`)
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
  renderAll()
  const msgs = { aceptada:'✅ Cotización aceptada', rechazada:'❌ Cotización rechazada', pendiente:'⏳ Pendiente' }
  showToast(msgs[status] || 'Estado actualizado')
}

// ═══════════════════════════════════════════════════════════
// PROYECTO MODAL — Phase 2
// ═══════════════════════════════════════════════════════════

let currentProyectoId = null

window.openProyectoModal = (id) => {
  const node = allNodes.find(n => n.id === id)
  if (!node) return
  currentProyectoId = id
  const m = node.metadata || {}
  document.getElementById('proy-label').value  = m.label || node.content || ''
  document.getElementById('proy-budget').value = m.budget || ''
  document.getElementById('proy-rol').value    = m.rol || 'dueño'
  document.getElementById('proy-desc').value   = m.desc || m.notes || ''
  document.getElementById('proyecto-modal').classList.remove('hidden')
}

window.closeProyectoModal = () => document.getElementById('proyecto-modal').classList.add('hidden')

window.saveProyecto = async () => {
  if (!currentProyectoId) return
  const node = allNodes.find(n => n.id === currentProyectoId)
  if (!node) return
  const label = document.getElementById('proy-label').value.trim() || node.metadata?.label || node.content
  const budgetVal = parseFloat(document.getElementById('proy-budget').value)
  node.metadata = {
    ...node.metadata,
    label,
    budget: budgetVal > 0 ? budgetVal : undefined,
    rol:    document.getElementById('proy-rol').value,
    desc:   document.getElementById('proy-desc').value.trim() || undefined,
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

const TYPE_LABELS = {
  income:   { icon:'💰', label:'Ingreso',   color:'#4ade80' },
  expense:  { icon:'💸', label:'Gasto',     color:'#f87171' },
  kanban:   { icon:'📌', label:'Tarea',     color:'#a78bfa' },
  note:     { icon:'💡', label:'Nota',      color:'#94a3b8' },
  persona:  { icon:'👤', label:'Contacto',  color:'#fbbf24' },
  proyecto: { icon:'📁', label:'Proyecto',  color:'#60a5fa' },
  contact:  { icon:'👤', label:'Contacto',  color:'#fbbf24' },
  account:  { icon:'🏦', label:'Cuenta',    color:'#34d399' },
  event:      { icon:'📅', label:'Evento',      color:'#34d399' },
  agenda:     { icon:'📋', label:'Agenda',      color:'#f97316' },
  cotizacion: { icon:'📄', label:'Cotización',  color:'#fb923c' },
}

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

// Keyboard shortcut Ctrl+K / Cmd+K to open search
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const modal = document.getElementById('global-search-modal')
    if (modal && modal.style.display !== 'none') {
      window.closeGlobalSearch()
    } else {
      window.openGlobalSearch()
    }
  }
  if (e.key === 'Escape') {
    const modal = document.getElementById('global-search-modal')
    if (modal && modal.style.display !== 'none') window.closeGlobalSearch()
  }
})
