import { createClient } from '@supabase/supabase-js'

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
let activeAccount = 'all'
let editingNoteId = null
let editingAccountId = null
let calView = 'month'
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
  kanban:   { label: '#TAREA',    color: '#a78bfa', border: 'rgba(139,92,246,0.4)', bg: 'rgba(139,92,246,0.06)' },
  note:     { label: '#NOTA',     color: '#60a5fa', border: 'rgba(96,165,250,0.4)',  bg: 'rgba(96,165,250,0.06)' },
  income:   { label: '#INGRESO',  color: '#4ade80', border: 'rgba(74,222,128,0.4)',  bg: 'rgba(74,222,128,0.06)' },
  expense:  { label: '#GASTO',    color: '#f87171', border: 'rgba(248,113,113,0.4)', bg: 'rgba(248,113,113,0.06)' },
  persona:  { label: '#PERSONA',  color: '#fdba74', border: 'rgba(251,146,60,0.4)',  bg: 'rgba(251,146,60,0.06)' },
  proyecto: { label: '#PROYECTO', color: '#2dd4bf', border: 'rgba(45,212,191,0.4)',  bg: 'rgba(45,212,191,0.06)' },
  account:  { label: '#CUENTA',   color: '#94a3b8', border: 'rgba(148,163,184,0.4)', bg: 'rgba(148,163,184,0.06)' },
}

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
  // renderCurrencyWidget() — widgets moved to view-herramientas, sidebar-currencies hidden
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

  return results.slice(0, 10)
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
    // Replace the @partial with @full
    nexusInput.value = val.replace(/@[\w]*$/, '@' + s._key) + ' '
  } else if (s._type === 'contact') {
    nexusInput.value = s.tpl
  } else {
    // Command: replace entire input with template
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
  if (!currentFilter) return allNodes
  return allNodes.filter(n => 
    n.content.toLowerCase().includes(currentFilter.toLowerCase()) || 
    (n.metadata?.tags || []).some(t => t.toLowerCase() === currentFilter.toLowerCase()) ||
    (n.metadata?.label || '').toLowerCase().includes(currentFilter.toLowerCase())
  )
}

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
  renderFilterBar()
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

window.clearFilter = () => { currentFilter = null; renderAll(); }
window.setFilter = (tag) => { currentFilter = tag; renderAll(); }

function updateStats(nodes) {
  const inc = nodes.filter(n=>n.type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const exp = nodes.filter(n=>n.type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  document.getElementById('dominance-balance').textContent = `$${(inc-exp).toLocaleString()}`
  document.getElementById('w-nodes-count').textContent = nodes.filter(n=>n.type==='kanban').length
}

function renderFeed(nodes) {
  const root = document.getElementById('feed-root')
  root.innerHTML = nodes.map(n => {
    const tc = TYPE_CONFIG[n.type] || { label: `#${n.type.toUpperCase()}`, color: 'var(--accent-cyan)', border: 'var(--glass-border)', bg: 'var(--glass-bg)' }
    const amount = (n.type === 'income' || n.type === 'expense') && n.metadata?.amount
      ? `<span style="font-family:'JetBrains Mono',monospace; font-weight:800; color:${tc.color}; margin-left:auto;">${n.type==='income'?'+':'-'}$${n.metadata.amount.toLocaleString()}</span>` : ''
    return `
    <div class="feed-item" style="border-left:3px solid ${tc.border}; background:${tc.bg};" onclick="openCardModal('${n.id}')">
      <span class="feed-time">${new Date(n.created_at).getHours().toString().padStart(2,'0')}:${new Date(n.created_at).getMinutes().toString().padStart(2,'0')}</span>
      <span style="font-size:9px; font-weight:800; color:${tc.color}; background:${tc.border.replace('0.4','0.15')}; padding:2px 8px; border-radius:4px; flex-shrink:0;">${tc.label}</span>
      <div style="flex:1; min-width:0;">
        <div style="font-size:14px; color:#f0f6fc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(n.metadata?.label || n.content)}</div>
        <div style="margin-top:4px; display:flex; gap:5px; flex-wrap:wrap;">
          ${(n.metadata?.tags || []).filter(t => t.toLowerCase() !== `#${n.type.toLowerCase()}`).map(t => `<span style="background:${tc.border.replace('0.4','0.12')}; color:${tc.color}; font-size:9px; padding:1px 5px; border-radius:3px; cursor:pointer;" onclick="event.stopPropagation(); setFilter('${t}')">${t}</span>`).join('')}
        </div>
      </div>
      ${amount}
      <span onclick="event.stopPropagation(); if(confirm('¿Eliminar este nodo?')){ deleteNode('${n.id}') }" style="color:var(--text-dim); cursor:pointer; padding:4px; flex-shrink:0;" title="Eliminar">✕</span>
    </div>`
  }).join('')
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
  const statsHtml = `
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:28px;">
      <div style="background:rgba(74,222,128,0.08); border:1px solid rgba(74,222,128,0.2); border-radius:14px; padding:20px;">
        <div style="font-size:11px; color:#6ee7b7; font-weight:700; letter-spacing:1px; margin-bottom:8px;">↑ INGRESOS</div>
        <div style="font-size:22px; font-weight:800; color:#4ade80; font-family:'JetBrains Mono',monospace;">+$${income.toLocaleString()}</div>
      </div>
      <div style="background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.2); border-radius:14px; padding:20px;">
        <div style="font-size:11px; color:#fca5a5; font-weight:700; letter-spacing:1px; margin-bottom:8px;">↓ GASTOS</div>
        <div style="font-size:22px; font-weight:800; color:#f87171; font-family:'JetBrains Mono',monospace;">-$${expense.toLocaleString()}</div>
      </div>
      <div style="background:${net>=0?'rgba(0,246,255,0.06)':'rgba(251,146,60,0.06)'}; border:1px solid ${net>=0?'rgba(0,246,255,0.2)':'rgba(251,146,60,0.2)'}; border-radius:14px; padding:20px;">
        <div style="font-size:11px; color:${net>=0?'#67e8f9':'#fdba74'}; font-weight:700; letter-spacing:1px; margin-bottom:8px;">⚖ SALDO NETO</div>
        <div style="font-size:22px; font-weight:800; color:${net>=0?'#00f6ff':'#fb923c'}; font-family:'JetBrains Mono',monospace;">${net>=0?'+':''}\$${net.toLocaleString()}</div>
      </div>
    </div>
  `

  const actionsHtml = `
    <div style="display:flex; gap:10px; margin-bottom:24px; flex-wrap:wrap;">
      <button class="fin-action-btn" onclick="openTransferModal()">⇄ Transferir</button>
      <button class="fin-action-btn" onclick="openLoanModal()">💸 Préstamo</button>
      <button class="fin-action-btn" onclick="exportFinanceCSV()">⬇ CSV</button>
      <button class="fin-action-btn" onclick="exportFinancePDF()">🖨 PDF</button>
    </div>
  `

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

  root.innerHTML = accountTabsHtml + statsHtml + actionsHtml +
    `<div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:16px;padding:24px;">${rowsHtml}</div>`
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
function exportFinancePDF() {
  // Hide all non‑finance sections temporarily
  const allSections = document.querySelectorAll('.view-section')
  const hidden = []
  allSections.forEach(sec => {
    if (!sec.id.startsWith('view-finance')) {
      hidden.push(sec)
      sec.style.display = 'none'
    }
  })
  // Ensure any pending UI updates are applied before printing
  setTimeout(() => {
    window.print()
    // Restore hidden sections after a short delay to avoid race conditions
    setTimeout(() => {
      hidden.forEach(sec => sec.style.display = '')
    }, 500)
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
function renderCalendar(nodes) {
  const root = document.getElementById('cal-days-root')
  if (!root) return
  const monthTitle = document.getElementById('cal-month-title')
  if (monthTitle) monthTitle.textContent = new Intl.DateTimeFormat('es-ES',{month:'long', year:'numeric'}).format(calDate).toUpperCase()

  if (calView === 'month') renderCalMonth(root, nodes)
  else if (calView === 'week') renderCalWeek(root, nodes)
  else renderCalDay(root, nodes)
}

function renderCalMonth(root, nodes) {
  root.style.gridTemplateColumns = 'repeat(7,1fr)'
  const firstDay = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate()
  const prevMonthDays = new Date(calDate.getFullYear(), calDate.getMonth(), 0).getDate()
  const weekDays = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  let html = weekDays.map(d => `<div style="background:rgba(0,0,0,0.3); padding:8px; text-align:center; font-size:10px; font-weight:800; color:var(--text-muted); letter-spacing:1px;">${d}</div>`).join('')
  for (let i = firstDay - 1; i >= 0; i--) html += `<div class="cal-day other-month"><span class="cal-number">${prevMonthDays - i}</span></div>`
  for (let d = 1; d <= daysInMonth; d++) {
    const today = new Date()
    const isToday = today.getFullYear() === calDate.getFullYear() && today.getMonth() === calDate.getMonth() && today.getDate() === d
    const dayDate = `${calDate.getFullYear()}-${(calDate.getMonth()+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`
    const events = nodes.filter(n => n.type !== 'account' && (n.metadata?.due_date === dayDate || n.created_at?.startsWith(dayDate)))
    html += `
      <div class="cal-day ${isToday ? 'today' : ''}" ondblclick="planDay('${dayDate}')">
        <span class="cal-number">${d}</span>
        <div class="cal-events-list">
          ${events.slice(0,3).map(e => {
            const tc = TYPE_CONFIG[e.type] || {}
            return `<div class="cal-event" style="border-left-color:${tc.color||'var(--accent-cyan)'}; background:${(tc.border||'rgba(0,246,255,0.3)').replace('0.4','0.1')}; color:${tc.color||'var(--accent-cyan)'};" onclick="openCardModal('${e.id}')">${esc(e.metadata?.label || e.content)}</div>`
          }).join('')}
          ${events.length > 3 ? `<div style="font-size:9px; color:var(--text-muted); margin-top:2px;">+${events.length-3} más</div>` : ''}
        </div>
      </div>`
  }
  root.innerHTML = html
}

function renderCalWeek(root, nodes) {
  root.style.gridTemplateColumns = 'repeat(7,1fr)'
  const startOfWeek = new Date(calDate)
  startOfWeek.setDate(calDate.getDate() - calDate.getDay())
  let html = ''
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    const dayDate = d.toISOString().split('T')[0]
    const isToday = d.toDateString() === new Date().toDateString()
    const events = nodes.filter(n => n.type !== 'account' && (n.metadata?.due_date === dayDate || n.created_at?.startsWith(dayDate)))
    html += `
      <div class="cal-day" style="min-height:200px; ${isToday ? 'background:var(--accent-cyan-dim)' : ''}">
        <span class="cal-number" style="font-size:11px;">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()]} ${d.getDate()}</span>
        ${events.map(e => {
          const tc = TYPE_CONFIG[e.type] || {}
          return `<div class="cal-event" style="border-left-color:${tc.color||'var(--accent-cyan)'}; background:${(tc.border||'rgba(0,246,255,0.3)').replace('0.4','0.12')}; color:${tc.color||'var(--accent-cyan)'}; white-space:normal; margin-bottom:4px;" onclick="openCardModal('${e.id}')">${esc(e.metadata?.label || e.content)}</div>`
        }).join('')}
        <div style="font-size:10px; color:var(--text-dim); margin-top:auto; cursor:pointer;" ondblclick="planDay('${dayDate}')">+ Añadir</div>
      </div>`
  }
  root.innerHTML = html
}

function renderCalDay(root, nodes) {
  root.style.gridTemplateColumns = '1fr'
  const dayDate = calDate.toISOString().split('T')[0]
  const events = nodes.filter(n => n.type !== 'account' && (n.metadata?.due_date === dayDate || n.created_at?.startsWith(dayDate)))
  const isToday = calDate.toDateString() === new Date().toDateString()
  root.innerHTML = `
    <div style="background:var(--bg-panel); padding:24px; min-height:400px;">
      <div style="font-size:14px; font-weight:700; color:${isToday?'var(--accent-cyan)':'#fff'}; margin-bottom:20px;">
        ${calDate.toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' }).toUpperCase()}
      </div>
      ${events.length === 0
        ? `<div style="text-align:center; color:var(--text-muted); padding:40px;">Sin eventos. Doble clic para planificar.</div>`
        : events.map(e => {
            const tc = TYPE_CONFIG[e.type] || {}
            return `<div onclick="openCardModal('${e.id}')" style="display:flex; gap:12px; align-items:center; padding:14px; margin-bottom:10px; background:${tc.bg||'var(--glass-bg)'}; border:1px solid ${tc.border||'var(--glass-border)'}; border-radius:12px; cursor:pointer;">
              <div style="width:6px; height:40px; border-radius:3px; background:${tc.color||'var(--accent-cyan)'}; flex-shrink:0;"></div>
              <div>
                <div style="font-size:14px; color:#fff; font-weight:600;">${esc(e.metadata?.label || e.content)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${tc.label||''}</div>
              </div>
            </div>`
          }).join('')}
      <div ondblclick="planDay('${dayDate}')" style="padding:14px; border:1px dashed var(--glass-border); border-radius:12px; text-align:center; color:var(--text-muted); cursor:pointer; font-size:13px; margin-top:8px;">+ Planificar este día</div>
    </div>`
}

window.planDay = (date) => {
  const existing = document.getElementById('plan-day-form')
  if (existing) existing.remove()
  const form = document.createElement('div')
  form.id = 'plan-day-form'
  form.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg-panel);border:1px solid var(--accent-cyan);border-radius:14px;padding:16px;z-index:2000;display:flex;gap:8px;width:400px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.6);'
  form.innerHTML = `
    <input type="text" id="plan-day-input" placeholder="Tarea para el ${date}..." style="flex:1;background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:8px;padding:10px;color:#fff;outline:none;font-size:14px;" />
    <button onclick="confirmPlanDay('${date}')" style="background:var(--accent-cyan);color:#000;border:none;border-radius:8px;padding:10px 16px;cursor:pointer;font-weight:800;">+</button>
    <button onclick="document.getElementById('plan-day-form')?.remove()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:8px;padding:10px 12px;cursor:pointer;">✕</button>`
  document.body.appendChild(form)
  setTimeout(() => document.getElementById('plan-day-input')?.focus(), 50)
}

window.confirmPlanDay = (date) => {
  const task = document.getElementById('plan-day-input')?.value.trim()
  if (task) insertNodeRaw(`#tarea ${task}`, { due_date: date })
  document.getElementById('plan-day-form')?.remove()
}

document.getElementById('cal-prev')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderAll(); })
document.getElementById('cal-next')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderAll(); })

document.getElementById('cal-view-month')?.addEventListener('click', () => { calView = 'month'; renderAll() })
document.getElementById('cal-view-week')?.addEventListener('click', () => { calView = 'week'; renderAll() })
document.getElementById('cal-view-day')?.addEventListener('click', () => { calView = 'day'; renderAll() })
document.getElementById('cal-export')?.addEventListener('click', () => {
  const events = allNodes.filter(n => n.type !== 'account' && n.type !== 'note')
  const rows = events.map(n => [
    new Date(n.created_at).toLocaleDateString('es-MX'),
    n.metadata?.due_date || '',
    TYPE_CONFIG[n.type]?.label || n.type,
    JSON.stringify(n.metadata?.label || n.content)
  ].join(','))
  const csv = '\ufeff' + ['Creado,Vencimiento,Tipo,Descripción', ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `nexus-calendario-${new Date().toISOString().split('T')[0]}.csv`; a.click()
})

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
let swRunning = false, swStart = 0, swElapsed = 0, swRafId = null

function swRender() {
  const total = swElapsed + (swRunning ? Date.now() - swStart : 0)
  const ms  = Math.floor((total % 1000) / 10)
  const sec = Math.floor(total / 1000) % 60
  const min = Math.floor(total / 60000)
  const disp = document.getElementById('sw-display')
  if (disp) disp.textContent =
    String(min).padStart(2,'0') + ':' +
    String(sec).padStart(2,'0') + '.' +
    String(ms).padStart(2,'0')
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
  } else {
    swStart = Date.now()
    swRunning = true
    if (btn) btn.textContent = '⏸ Pausar'
    playBeep(880, 0.1, 0.3)
    swRafId = requestAnimationFrame(swRender)
  }
}

window.swReset = function() {
  cancelAnimationFrame(swRafId)
  swRunning = false; swElapsed = 0; swStart = 0
  const btn  = document.getElementById('sw-btn')
  const disp = document.getElementById('sw-display')
  if (btn)  btn.textContent  = '▶ Iniciar'
  if (disp) disp.textContent = '00:00.00'
  playBeep(440, 0.1, 0.2)
}

// ── CUENTA REGRESIVA ─────────────────────────────────────────────────────────
let cdRunning = false, cdRemaining = 0, cdInterval = null

function cdRenderDisp() {
  const min  = Math.floor(cdRemaining / 60)
  const sec  = cdRemaining % 60
  const disp = document.getElementById('cd-display')
  if (disp) disp.textContent = String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0')
  // Warning beep last 5 seconds
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
      const min = parseInt(document.getElementById('cd-min')?.value || '0') || 0
      const sec = parseInt(document.getElementById('cd-sec')?.value || '0') || 0
      cdRemaining = min * 60 + sec
      if (cdRemaining <= 0) return
      document.getElementById('cd-display')?.classList.remove('finished')
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
        playAlarm()
      }
    }, 1000)
  }
}

window.cdReset = function() {
  clearInterval(cdInterval)
  cdRunning = false; cdRemaining = 0
  const btn  = document.getElementById('cd-btn')
  const disp = document.getElementById('cd-display')
  if (btn)  btn.textContent = '▶ Iniciar'
  disp?.classList.remove('finished')
  const min = parseInt(document.getElementById('cd-min')?.value || '5') || 5
  const sec = parseInt(document.getElementById('cd-sec')?.value || '0') || 0
  if (disp) disp.textContent = String(min).padStart(2,'0') + ':' + String(sec).padStart(2,'0')
  playBeep(440, 0.1, 0.2)
}

async function initTickers() {
  const settings = JSON.parse(localStorage.getItem('nexus_settings') || '{}')
  const unit = settings.tempUnit || 'C'
  try {
    const res = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=24.14&longitude=-110.31&current_weather=true`)).json()
    if (res && res.current_weather) {
      let temp = res.current_weather.temperature
      if (unit === 'F') temp = (temp * 9/5) + 32
      document.getElementById('w-weather').textContent = `${Math.round(temp)}°${unit}`
    } else {
      document.getElementById('w-weather').textContent = `N/A`
    }
  } catch (e) {
    console.warn("Weather fetch failed", e)
    document.getElementById('w-weather').textContent = `OFFLINE`
  }
  
  if (settings.nickname) {
    const titleEl = document.querySelector('.view-title')
    if (titleEl) titleEl.textContent = `Comandos de ${settings.nickname}`
  }
}

// Settings Logic
document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  const settings = {
    nickname: document.getElementById('pref-nickname').value,
    email: document.getElementById('pref-email').value,
    timezone: document.getElementById('pref-tz').value,
    tempUnit: document.getElementById('pref-temp').value
  }
  localStorage.setItem('nexus_settings', JSON.stringify(settings))
  alert('Sistema Actualizado: Preferencias sincronizadas.')
  location.reload()
})

// Load settings on boot
function loadSystemSettings() {
  const settings = JSON.parse(localStorage.getItem('nexus_settings') || '{}')
  if (settings.nickname) document.getElementById('pref-nickname').value = settings.nickname
  if (settings.email) document.getElementById('pref-email').value = settings.email
  if (settings.timezone) document.getElementById('pref-tz').value = settings.timezone
  if (settings.tempUnit) document.getElementById('pref-temp').value = settings.tempUnit
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
    if (!dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0]
    }
    renderCronicaView()
  }
}

function renderCronicaView() {
  const date = document.getElementById('cronica-date')?.value || new Date().toISOString().split('T')[0]
  const allN = allNodes
  const tasksToday = allN.filter(n => n.type === 'kanban' && (n.created_at?.startsWith(date) || n.metadata?.due_date === date))
  const notesToday = allN.filter(n => (n.type === 'note' || n.type === 'persona' || n.type === 'proyecto') && n.created_at?.startsWith(date))
  const finToday   = allN.filter(n => (n.type === 'income' || n.type === 'expense') && n.created_at?.startsWith(date))
  const netDay = finToday.reduce((s,n) => s + (n.type==='income' ? 1 : -1) * (n.metadata?.amount||0), 0)

  const root = document.getElementById('cronica-root')
  const stats = document.getElementById('cronica-stats')
  if (!root) return
  if (stats) stats.textContent = `${tasksToday.length} tareas · ${notesToday.length} notas · ${finToday.length} movimientos · balance ${netDay >= 0 ? '+' : ''}$${netDay.toLocaleString()}`

  const col = (title, color, items, renderFn) => `
    <div style="background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:16px; padding:20px;">
      <div style="font-size:11px; font-weight:800; color:${color}; letter-spacing:1px; margin-bottom:16px; text-transform:uppercase;">${title}</div>
      ${items.length === 0
        ? `<div style="color:var(--text-dim); font-size:13px; text-align:center; padding:20px;">Sin registros</div>`
        : items.map(renderFn).join('')}
    </div>`

  root.innerHTML =
    col('📌 Tareas', '#a78bfa', tasksToday, n => `
      <div onclick="openCardModal('${n.id}')" style="padding:10px; background:rgba(167,139,250,0.06); border:1px solid rgba(167,139,250,0.2); border-radius:10px; margin-bottom:8px; cursor:pointer;">
        <div style="font-size:13px; color:#fff;">${esc(n.metadata?.label || n.content)}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:3px;">${n.metadata?.status || 'todo'}</div>
      </div>`) +
    col('🧠 Notas', '#60a5fa', notesToday, n => `
      <div onclick="openNoteEdit('${n.id}')" style="padding:10px; background:rgba(96,165,250,0.06); border:1px solid rgba(96,165,250,0.2); border-radius:10px; margin-bottom:8px; cursor:pointer;">
        <div style="font-size:13px; color:#fff;">${esc(n.metadata?.label || n.content)}</div>
      </div>`) +
    col('💹 Finanzas', '#4ade80', finToday, n => `
      <div onclick="openFinanceDetail('${n.id}')" style="padding:10px; background:${n.type==='income'?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)'}; border:1px solid ${n.type==='income'?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'}; border-radius:10px; margin-bottom:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:13px; color:#fff;">${esc(n.metadata?.label || n.content)}</div>
        <div style="font-size:14px; font-weight:800; color:${n.type==='income'?'#4ade80':'#f87171'}; font-family:'JetBrains Mono',monospace;">${n.type==='income'?'+':'-'}$${(n.metadata?.amount||0).toLocaleString()}</div>
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
  return cType === 'bank' ? '🏦' : cType === 'crypto' ? '₿' : '👤'
}

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
    const color = m.color || '#00f0ff'
    const inits = cType === 'persona' ? contactInitials(name) : contactTypeIcon(cType)
    // Count transactions linked to this contact
    const txCount = allNodes.filter(n =>
      (n.type === 'income' || n.type === 'expense') && n.metadata?.contact_id === c.id
    ).length
    const totalPaid = allNodes
      .filter(n => n.type === 'expense' && n.metadata?.contact_id === c.id)
      .reduce((s,n) => s + (n.metadata?.amount||0), 0)

    return `<div class="contact-card" onclick="openContactSheet('${c.id}')">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div class="contact-avatar" style="background:${color}20; color:${color}; border:1.5px solid ${color}40; font-size:${cType==='persona'?'16':'20'}px;">${inits}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:14px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(name)}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(m.company || m.bank_name || m.network || '')}</div>
          ${m.phone ? `<div style="font-size:11px; color:var(--text-muted); margin-top:1px;">📞 ${esc(m.phone)}</div>` : ''}
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
    ` : cType === 'bank' ? `
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
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:0;">${fields}
      <div class="csh-field" style="align-items:flex-start;"><span class="csh-label">📝 Notas</span><span style="white-space:pre-wrap;">${esc(m.notes||'—')}</span></div>
    </div>
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
  document.getElementById('cm-persona-fields').style.display = type === 'persona' ? '' : 'none'
  document.getElementById('cm-bank-fields').style.display   = type === 'bank'    ? '' : 'none'
  document.getElementById('cm-crypto-fields').style.display = type === 'crypto'  ? '' : 'none'
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
  closeContactModal()
  renderAll()
  showToast(`Contacto "${name}" guardado`)
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
