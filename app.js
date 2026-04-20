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
  loadSystemSettings()
  document.getElementById('cronica-date')?.setAttribute('value', new Date().toISOString().split('T')[0])
})()

function setupRealtimeSubscription() {
  supabase
    .channel('public:nodes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes', filter: `owner_id=eq.${currentUser.id}` }, (payload) => {
      console.log('Realtime change:', payload)
      if (payload.eventType === 'INSERT') {
        allNodes.unshift(payload.new)
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

document.getElementById('tm-add-member')?.addEventListener('click', async () => {
  const input = document.getElementById('tm-member-input')
  const name = input?.value.trim()
  if (!name || !editingCardId) return
  const node = allNodes.find(n => n.id === editingCardId)
  if (node) {
    if (!node.metadata.assignee) node.metadata.assignee = []
    node.metadata.assignee.push(name)
    await updateNodeMetadata(editingCardId, node.metadata)
    renderAssignees(node.metadata.assignee)
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
    type = 'persona'
    metadata.tags.push('#persona')
    cleanContent = t.replace('#persona', '').trim()
    metadata.label = cleanContent
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

async function insertNodeRaw(raw, metadataOverrides={}) {
  const { type, metadata, content } = parseNode(raw)
  const finalMetadata = { ...metadata, ...metadataOverrides }

  // Resolve @account_hint to actual account_id
  if (finalMetadata.account_hint) {
    const hint = finalMetadata.account_hint
    const foundAccount = allNodes.find(n => n.type === 'account' &&
      (n.metadata?.label || n.content).toLowerCase().includes(hint))
    if (foundAccount) {
      finalMetadata.account_id = foundAccount.id
    } else {
      showToast(`Cuenta '@${hint}' no encontrada — asignado a General`)
    }
    delete finalMetadata.account_hint
  }

  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
     const newNode = { 
       id: Math.random().toString(36).substr(2, 9), 
       type, 
       content: content || raw, 
       metadata: finalMetadata, 
       created_at: new Date().toISOString() 
     }
     allNodes.unshift(newNode)
     renderAll()
     return
  }

  const { data: inserted, error } = await supabase.from('nodes').insert({
    owner_id: currentUser.id,
    content: content || raw,
    type,
    metadata: finalMetadata
  }).select()

  if (error) {
    console.error("Error inserting node:", error)
    showToast('Error al guardar el nodo')
  } else {
    if (inserted?.[0]) allNodes.unshift(inserted[0])
    renderAll()
    showToast(`NODO INYECTADO: ${type.toUpperCase()}`)
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
nexusInput?.addEventListener('keydown', e => { 
  if (e.key === 'Enter') {
     const val = nexusInput.value.trim()
     if (!val) return
     insertNodeRaw(val)
     const wrapper = document.querySelector('.spotlight-wrapper')
     if (wrapper) {
       wrapper.classList.add('command-success')
       setTimeout(() => wrapper.classList.remove('command-success'), 500)
     }
     if (localStorage.getItem('nexus_admin_bypass') === 'true') {
       showToast("PROCESANDO PENSAMIENTO...")
     }
     nexusInput.value = ''
     const suggest = document.getElementById('account-suggest')
     if (suggest) suggest.style.display = 'none'
  }
})

nexusInput?.addEventListener('input', () => {
  const val = nexusInput.value.trim()
  const suggest = document.getElementById('account-suggest')
  if (!suggest) return
  const accounts = allNodes.filter(n => n.type === 'account')
  if ((val.startsWith('+$') || val.startsWith('-$')) && accounts.length > 0) {
    suggest.style.display = 'flex'
    suggest.innerHTML = accounts.map(a =>
      `<button onclick="injectAccount('@${(a.metadata?.label||a.content).toLowerCase().replace(/\s+/g,'')}')"
       style="background:rgba(0,246,255,0.1); border:1px solid var(--accent-cyan); border-radius:8px; padding:4px 10px; color:var(--accent-cyan); font-size:12px; cursor:pointer; font-family:inherit;">
         @${a.metadata?.label||a.content}
       </button>`
    ).join('')
  } else {
    suggest.style.display = 'none'
  }
})

window.injectAccount = (tag) => {
  if (nexusInput && !nexusInput.value.includes('@')) nexusInput.value = nexusInput.value.trim() + ' ' + tag + ' '
  nexusInput.focus()
  const suggest = document.getElementById('account-suggest')
  if (suggest) suggest.style.display = 'none'
}

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
    <div class="note-keep" style="${colorStyle}" onclick="openNoteEdit('${n.id}')">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:9px; font-weight:800; color:var(--accent-cyan);">#${n.type.toUpperCase()}</div>
        <div style="display:flex; gap:8px;">
          <span title="${isPinned ? 'Desfijar' : 'Fijar'}"
                onclick="event.stopPropagation(); togglePin('${n.id}')"
                style="cursor:pointer; font-size:14px; opacity:${isPinned ? '1' : '0.3'};">📌</span>
        </div>
      </div>
      <div class="note-keep-title">${esc(n.metadata?.label || n.content)}</div>
      <div class="note-keep-body">${esc(n.content)}</div>
      <div style="display:flex; gap:5px; flex-wrap:wrap; margin-top:4px;">
        ${(n.metadata?.tags || []).map(t => `<span class="tag-pill" onclick="event.stopPropagation(); setFilter('${t}')" style="background:var(--accent-cyan-dim); color:var(--accent-cyan); font-size:9px; padding:2px 6px; border-radius:4px; cursor:pointer;">${t}</span>`).join('')}
      </div>
      <div class="note-color-bar" onclick="event.stopPropagation()">
        ${Object.keys(NOTE_COLORS).filter(c=>c).map(c=>`
          <div class="nc-swatch nc-${c}" title="${c}" onclick="setNoteColor('${n.id}','${c}')" style="${NOTE_COLORS[c]} width:18px; height:18px; border-radius:50%; border:2px solid ${color===c?'white':'transparent'}; cursor:pointer; display:inline-block; box-sizing:border-box;"></div>
        `).join('')}
        <div title="Sin color" onclick="setNoteColor('${n.id}','')" style="width:18px; height:18px; border-radius:50%; border:2px solid ${color===''?'white':'rgba(255,255,255,0.2)'}; cursor:pointer; display:inline-block; background:transparent;"></div>
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
  document.getElementById('note-edit-modal').classList.add('hidden')
  const panel = document.getElementById('transform-panel')
  if (panel) panel.style.display = 'none'
  pendingTransformType = null
  editingNoteId = null
}

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
  if (targetType === 'kanban') confirmTransform()
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
  const txs = nodes.filter(n => (n.type === 'income' || n.type === 'expense') &&
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

  const statsHtml = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px;">
      <div style="background:rgba(74,222,128,0.08); border:1px solid rgba(74,222,128,0.2); border-radius:14px; padding:20px;">
        <div style="font-size:11px; color:#6ee7b7; font-weight:700; letter-spacing:1px; margin-bottom:8px;">INGRESOS</div>
        <div style="font-size:28px; font-weight:800; color:#4ade80; font-family:'JetBrains Mono',monospace;">+$${income.toLocaleString()}</div>
      </div>
      <div style="background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.2); border-radius:14px; padding:20px;">
        <div style="font-size:11px; color:#fca5a5; font-weight:700; letter-spacing:1px; margin-bottom:8px;">GASTOS</div>
        <div style="font-size:28px; font-weight:800; color:#f87171; font-family:'JetBrains Mono',monospace;">-$${expense.toLocaleString()}</div>
      </div>
    </div>
  `

  const actionsHtml = `
    <div style="display:flex; gap:10px; margin-bottom:24px; flex-wrap:wrap;">
      <button class="fin-action-btn" onclick="openTransferModal()">⇄ Transferir</button>
      <button class="fin-action-btn" onclick="exportFinanceCSV()">⬇ CSV</button>
      <button class="fin-action-btn" onclick="window.print()">🖨 PDF</button>
    </div>
  `

  const rowsHtml = txs.length === 0
    ? '<div style="text-align:center; color:var(--text-muted); padding:40px;">Sin transacciones. Escribe <b>+$1000 Salario</b> o <b>-$200 Renta</b></div>'
    : txs.map(n => {
        const isIncome = n.type === 'income'
        const acc = accounts.find(a => a.id === n.metadata?.account_id)
        return `
        <div onclick="openFinanceDetail('${n.id}')" style="display:flex; align-items:center; gap:16px; padding:16px 0; border-bottom:1px solid rgba(255,255,255,0.04); cursor:pointer; transition:background 0.2s; border-radius:8px; padding-left:8px; padding-right:8px;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
          <div style="width:36px;height:36px;border-radius:10px;background:${isIncome?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.12)'};display:grid;place-items:center;font-size:16px;">
            ${isIncome ? '↑' : '↓'}
          </div>
          <div style="flex:1;">
            <div style="font-size:14px;color:#fff;font-weight:500;">${esc(n.metadata?.label||n.content)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
              ${new Date(n.created_at).toLocaleDateString('es-MX')}
              ${acc ? `· <span style="color:${esc(acc.metadata?.color||'#4ade80')}">${esc(acc.metadata?.label||acc.content)}</span>` : ''}
            </div>
          </div>
          <div style="font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${isIncome?'#4ade80':'#f87171'};">
            ${isIncome?'+':'-'}$${(n.metadata?.amount||0).toLocaleString()}
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
  if (accounts.length < 2) { alert('Necesitas al menos 2 cuentas para transferir.'); return }
  const opts = accounts.map(a => `<option value="${a.id}">${esc(a.metadata?.label||a.content)}</option>`).join('')
  document.getElementById('tr-from').innerHTML = opts
  document.getElementById('tr-to').innerHTML   = opts
  document.getElementById('transfer-modal').classList.remove('hidden')
}
window.closeTransferModal = () => document.getElementById('transfer-modal').classList.add('hidden')
document.getElementById('tr-save')?.addEventListener('click', async () => {
  const fromId = document.getElementById('tr-from').value
  const toId   = document.getElementById('tr-to').value
  const amount = parseFloat(document.getElementById('tr-amount').value) || 0
  const label  = document.getElementById('tr-label').value.trim() || 'Transferencia'
  if (!amount || fromId === toId) return alert('Verifica los datos.')
  const expense = { owner_id:currentUser?.id, type:'expense', content:label, metadata:{ label, amount, account_id:fromId, transfer:true } }
  const income  = { owner_id:currentUser?.id, type:'income',  content:label, metadata:{ label, amount, account_id:toId, transfer:true } }
  if (localStorage.getItem('nexus_admin_bypass') === 'true') {
    allNodes.unshift({...expense, id:Math.random().toString(36).substr(2,9), created_at:new Date().toISOString()})
    allNodes.unshift({...income,  id:Math.random().toString(36).substr(2,9), created_at:new Date().toISOString()})
  } else {
    await supabase.from('nodes').insert([expense, income])
  }
  closeTransferModal(); renderAll()
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
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'))
    btn.classList.add('active')
    document.querySelectorAll('.view-section').forEach(v=>v.classList.remove('active'))
    const target = document.getElementById(`view-${btn.dataset.view}`)
    if (target) target.classList.add('active')
  })
})

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
  const accounts = allNodes.filter(n => n.type === 'account')
  const acSel = document.getElementById('fd-account')
  acSel.innerHTML = '<option value="">General</option>' + accounts.map(a => `<option value="${a.id}" ${m.account_id===a.id?'selected':''}>${esc(a.metadata?.label||a.content)}</option>`).join('')
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
  node.metadata.label = document.getElementById('fd-label').value.trim()
  node.metadata.amount = parseFloat(document.getElementById('fd-amount').value) || 0
  const acId = document.getElementById('fd-account').value
  node.metadata.account_id = acId || undefined
  node.content = node.metadata.label
  if (localStorage.getItem('nexus_admin_bypass') !== 'true') {
    await supabase.from('nodes').update({ content: node.content, metadata: node.metadata }).eq('id', editingFinanceId)
  }
  closeFinanceDetail(); renderAll()
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
    const isPdf = src.startsWith('data:application/pdf') || src.includes(';base64,JVBER')
    const thumb = isPdf
      ? `<div onclick="viewAttachment('${encodeURIComponent(src.slice(0,50))}_PDF_${i}','${context}')" style="width:80px;height:80px;border-radius:10px;border:1px solid var(--glass-border);background:rgba(248,113,113,0.1);display:grid;place-items:center;cursor:pointer;flex-direction:column;font-size:10px;color:#f87171;gap:4px;">
           <span style="font-size:28px;">📄</span>
           <span>PDF</span>
         </div>`
      : `<img src="${src}" onclick="viewImage('${src}')" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid var(--glass-border);cursor:pointer;" />`
    return `
      <div style="position:relative; display:inline-block;">
        ${thumb}
        <span onclick="removeAttachment(${i}, '${context}')" style="position:absolute;top:-6px;right:-6px;background:#f87171;border-radius:50%;width:18px;height:18px;display:grid;place-items:center;font-size:10px;cursor:pointer;color:#000;font-weight:800;">✕</span>
      </div>`
  }).join('')
}

window.viewAttachment = (encodedKey, context) => {
  // For PDFs: open full base64 data URL in new tab
  const idx = parseInt(encodedKey.split('_PDF_')[1])
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
