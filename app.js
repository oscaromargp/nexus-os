import { createClient } from '@supabase/supabase-js'

// ── Supabase ──────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL  || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)

// ── Estado global ─────────────────────────────────────────
let currentUser = null
let allNodes    = []
let activeFilter = 'all'
let activeView   = 'feed'
let dragNodeId   = null

// ── Guard: solo autenticados ──────────────────────────────
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = '/'; return }
  currentUser = session.user
  document.getElementById('user-email').textContent = currentUser.email
  await loadNodes()
})()

supabase.auth.onAuthStateChange((event, session) => {
  if (!session) window.location.href = '/'
})

// ══════════════════════════════════════════════════════════
// PARSER SEMÁNTICO — corazón de "Everything is a Node"
// ══════════════════════════════════════════════════════════
function parseNode(raw) {
  const text = raw.trim()

  // #tarea → Kanban
  if (/^#tarea\b/i.test(text)) {
    const label = text.replace(/^#tarea\s*/i, '').trim()
    return {
      node_type: 'kanban',
      metadata: { status: 'todo', priority: 'medium', tags: ['#tarea'], label }
    }
  }

  // -$monto → Gasto
  const exp = text.match(/^-\$(\d+(?:\.\d{1,2})?)\s*(.*)/)
  if (exp) return {
    node_type: 'expense',
    metadata: { amount: parseFloat(exp[1]), currency: 'USD', label: exp[2].trim() || 'Gasto', category: 'general' }
  }

  // +$monto → Ingreso
  const inc = text.match(/^\+\$(\d+(?:\.\d{1,2})?)\s*(.*)/)
  if (inc) return {
    node_type: 'income',
    metadata: { amount: parseFloat(inc[1]), currency: 'USD', label: inc[2].trim() || 'Ingreso', category: 'general' }
  }

  // Texto libre → Nota
  const supertags = [...text.matchAll(/#\w+/g)].map(m => m[0])
  return { node_type: 'note', metadata: { supertags, linked_nodes: [] } }
}

// Preview en tiempo real
const nexusInput   = document.getElementById('nexus-input')
const parsePreview = document.getElementById('parse-preview')
const icons = { kanban: '📌', expense: '💸', income: '💰', note: '🧠' }

nexusInput?.addEventListener('input', () => {
  const val = nexusInput.value.trim()
  if (!val) { parsePreview.classList.add('hidden'); return }
  const { node_type, metadata } = parseNode(val)
  const detail = node_type === 'kanban'
    ? `label: "${metadata.label}"`
    : node_type === 'expense' || node_type === 'income'
      ? `$${metadata.amount} — ${metadata.label}`
      : `supertags: [${metadata.supertags.join(', ')}]`
  parsePreview.textContent = `${icons[node_type]} Tipo detectado: ${node_type}  |  ${detail}`
  parsePreview.classList.remove('hidden')
})

// ── Insertar nodo ─────────────────────────────────────────
const nodeMsg = document.getElementById('node-msg')

function showMsg(text, err = false) {
  nodeMsg.textContent = text
  nodeMsg.className = `mt-1 text-xs ${err ? 'text-red-400' : 'text-cyan-neon'}`
  nodeMsg.classList.remove('hidden')
  setTimeout(() => nodeMsg.classList.add('hidden'), 3000)
}

async function insertNode(raw) {
  if (!raw.trim()) return
  const { node_type, metadata } = parseNode(raw)
  const { error } = await supabase.from('nexus_nodos').insert({
    user_id: currentUser.id, raw_content: raw.trim(), node_type, metadata
  })
  if (error) { showMsg(error.message, true); return }
  showMsg(`${icons[node_type]} Nodo [${node_type}] guardado`)
  nexusInput.value = ''
  parsePreview.classList.add('hidden')
  await loadNodes()
}

document.getElementById('btn-add')?.addEventListener('click', () => insertNode(nexusInput.value))
nexusInput?.addEventListener('keydown', e => { if (e.key === 'Enter') insertNode(nexusInput.value) })

// ══════════════════════════════════════════════════════════
// CARGA DE NODOS
// ══════════════════════════════════════════════════════════
async function loadNodes() {
  if (!currentUser) return
  const { data, error } = await supabase
    .from('nexus_nodos')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) { console.error(error); return }
  allNodes = data || []
  renderAll()
}

function renderAll() {
  updateStats()
  renderFeed()
  renderKanban()
  renderFinance()
  renderNotes()
}

// ══════════════════════════════════════════════════════════
// STATS BAR
// ══════════════════════════════════════════════════════════
function updateStats() {
  const tasks   = allNodes.filter(n => n.node_type === 'kanban').length
  const notes   = allNodes.filter(n => n.node_type === 'note').length
  const income  = allNodes.filter(n => n.node_type === 'income').reduce((s,n) => s + (n.metadata?.amount||0), 0)
  const expense = allNodes.filter(n => n.node_type === 'expense').reduce((s,n) => s + (n.metadata?.amount||0), 0)
  const balance = income - expense

  document.getElementById('s-total').textContent   = allNodes.length
  document.getElementById('s-tasks').textContent   = tasks
  document.getElementById('s-notes').textContent   = notes
  const balEl = document.getElementById('s-balance')
  balEl.textContent = `$${balance.toFixed(0)}`
  balEl.className   = `text-xl font-bold ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`
}

// ══════════════════════════════════════════════════════════
// VIEW: FEED
// ══════════════════════════════════════════════════════════
function renderFeed() {
  const nodes = activeFilter === 'all'
    ? allNodes
    : allNodes.filter(n => n.node_type === activeFilter)

  const container = document.getElementById('feed-list')
  if (!nodes.length) {
    container.innerHTML = `<div class="text-center text-cyan-muted text-sm py-16 opacity-40">
      Sin nodos todavía. Escribe algo arriba.
    </div>`
    return
  }

  container.innerHTML = nodes.map(n => {
    const pillCls = `pill pill-${n.node_type}`
    const date = new Date(n.created_at).toLocaleString('es-ES', {
      day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'
    })
    const meta = metaLine(n)
    return `
    <div class="glass p-3 flex items-start gap-3 fade-in hover:border-cyan-neon/30 transition-all">
      <span class="text-xl mt-0.5">${icons[n.node_type]||'•'}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="${pillCls}">${n.node_type}</span>
          <span class="text-xs text-cyan-muted opacity-50">${date}</span>
        </div>
        <p class="text-white text-sm break-words">${esc(n.raw_content)}</p>
        ${meta ? `<p class="text-xs text-cyan-muted font-mono mt-1">${meta}</p>` : ''}
      </div>
      <button class="btn-del text-red-400/30 hover:text-red-400 text-sm transition-colors shrink-0"
        data-id="${n.id}">✕</button>
    </div>`
  }).join('')

  container.querySelectorAll('.btn-del').forEach(b =>
    b.addEventListener('click', () => deleteNode(b.dataset.id))
  )
}

// Filtros del feed
document.querySelectorAll('.filter-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.add('opacity-50'))
    btn.classList.remove('opacity-50')
    renderFeed()
  })
)

// ══════════════════════════════════════════════════════════
// VIEW: KANBAN (drag & drop)
// ══════════════════════════════════════════════════════════
function renderKanban() {
  const tasks = allNodes.filter(n => n.node_type === 'kanban')
  const cols  = { todo: [], in_progress: [], done: [] }
  tasks.forEach(n => {
    const s = n.metadata?.status || 'todo'
    if (cols[s]) cols[s].push(n); else cols.todo.push(n)
  })

  const map = { todo: 'k-todo', in_progress: 'k-progress', done: 'k-done' }
  Object.entries(cols).forEach(([status, nodes]) => {
    const col = document.getElementById(map[status])
    if (!col) return
    col.innerHTML = nodes.length
      ? nodes.map(n => kanbanCard(n)).join('')
      : `<div class="text-xs text-cyan-muted opacity-30 text-center py-4">vacío</div>`
    col.querySelectorAll('.btn-del').forEach(b =>
      b.addEventListener('click', () => deleteNode(b.dataset.id))
    )
  })

  document.getElementById('k-todo-count').textContent    = cols.todo.length
  document.getElementById('k-progress-count').textContent = cols.in_progress.length
  document.getElementById('k-done-count').textContent    = cols.done.length
}

function kanbanCard(n) {
  const priority = n.metadata?.priority || 'medium'
  const pColor = { low: 'text-green-400', medium: 'text-yellow-400', high: 'text-red-400' }
  const label  = n.metadata?.label || n.raw_content
  const date   = new Date(n.created_at).toLocaleDateString('es-ES')
  return `
  <div class="kanban-card glass p-3 rounded-md border border-cyan-neon/10 fade-in"
       draggable="true" data-id="${n.id}"
       ondragstart="handleDragStart(event, '${n.id}')">
    <div class="flex justify-between items-start gap-2 mb-2">
      <p class="text-white text-xs leading-tight flex-1">${esc(label)}</p>
      <button class="btn-del text-red-400/20 hover:text-red-400 text-xs transition-colors shrink-0"
        data-id="${n.id}">✕</button>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-xs ${pColor[priority] || 'text-yellow-400'}">${priority}</span>
      <span class="text-xs text-cyan-muted opacity-40">${date}</span>
    </div>
  </div>`
}

// Drag & Drop
window.handleDragStart = (e, id) => {
  dragNodeId = id
  e.dataTransfer.effectAllowed = 'move'
}
window.handleDrop = async (e, newStatus) => {
  e.preventDefault()
  e.currentTarget.classList.remove('drag-over')
  if (!dragNodeId) return
  const node = allNodes.find(n => n.id === dragNodeId)
  if (!node) return
  const newMeta = { ...node.metadata, status: newStatus }
  const { error } = await supabase
    .from('nexus_nodos')
    .update({ metadata: newMeta })
    .eq('id', dragNodeId)
    .eq('user_id', currentUser.id)
  if (!error) await loadNodes()
  dragNodeId = null
}

// ══════════════════════════════════════════════════════════
// VIEW: FINANZAS
// ══════════════════════════════════════════════════════════
function renderFinance() {
  const incNodes = allNodes.filter(n => n.node_type === 'income')
  const expNodes = allNodes.filter(n => n.node_type === 'expense')
  const totalInc = incNodes.reduce((s,n) => s + (n.metadata?.amount||0), 0)
  const totalExp = expNodes.reduce((s,n) => s + (n.metadata?.amount||0), 0)
  const balance  = totalInc - totalExp

  document.getElementById('f-income').textContent  = `$${totalInc.toLocaleString('es-ES')}`
  document.getElementById('f-expense').textContent = `$${totalExp.toLocaleString('es-ES')}`
  const balEl = document.getElementById('f-balance')
  balEl.textContent = `$${balance.toLocaleString('es-ES')}`
  balEl.className   = `text-3xl font-bold ${balance >= 0 ? 'text-cyan-neon' : 'text-red-400'}`

  // Barra porcentual
  const total = totalInc + totalExp || 1
  document.getElementById('f-bar-income').style.width  = `${(totalInc/total*100).toFixed(1)}%`
  document.getElementById('f-bar-expense').style.width = `${(totalExp/total*100).toFixed(1)}%`

  // Lista de movimientos
  const moves = [...incNodes, ...expNodes]
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
  const list = document.getElementById('f-list')
  if (!moves.length) {
    list.innerHTML = `<div class="text-center text-cyan-muted text-sm py-8 opacity-40">
      Sin movimientos. Usa <code>-$monto</code> o <code>+$monto</code>.
    </div>`
    return
  }
  list.innerHTML = moves.map(n => {
    const isInc = n.node_type === 'income'
    const date  = new Date(n.created_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
    return `
    <div class="flex items-center gap-3 py-2 border-b border-cyan-neon/10">
      <span class="text-lg">${isInc ? '💰' : '💸'}</span>
      <div class="flex-1">
        <p class="text-white text-sm">${esc(n.metadata?.label || n.raw_content)}</p>
        <p class="text-xs text-cyan-muted">${date}</p>
      </div>
      <span class="font-bold font-mono ${isInc ? 'text-green-400' : 'text-red-400'}">
        ${isInc ? '+' : '-'}$${n.metadata?.amount?.toLocaleString('es-ES') || 0}
      </span>
      <button class="btn-del text-red-400/20 hover:text-red-400 text-xs" data-id="${n.id}">✕</button>
    </div>`
  }).join('')
  list.querySelectorAll('.btn-del').forEach(b =>
    b.addEventListener('click', () => deleteNode(b.dataset.id))
  )
}

// ══════════════════════════════════════════════════════════
// VIEW: NOTAS (con búsqueda en tiempo real)
// ══════════════════════════════════════════════════════════
function renderNotes(query = '') {
  let notes = allNodes.filter(n => n.node_type === 'note')
  if (query) notes = notes.filter(n =>
    n.raw_content.toLowerCase().includes(query.toLowerCase()) ||
    (n.metadata?.supertags || []).some(t => t.toLowerCase().includes(query.toLowerCase()))
  )
  const grid = document.getElementById('notes-grid')
  if (!notes.length) {
    grid.innerHTML = `<div class="col-span-2 text-center text-cyan-muted text-sm py-16 opacity-40">
      Sin notas todavía. Escribe cualquier texto libre arriba.
    </div>`
    return
  }
  grid.innerHTML = notes.map(n => {
    const tags = (n.metadata?.supertags || [])
      .map(t => `<span class="text-xs text-cyan-neon/70">${t}</span>`).join(' ')
    const date = new Date(n.created_at).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
    return `
    <div class="glass p-4 rounded-lg hover:border-purple-400/40 transition-all fade-in">
      <div class="flex justify-between items-start mb-3">
        <span class="text-purple-400 text-lg">🧠</span>
        <button class="btn-del text-red-400/20 hover:text-red-400 text-xs" data-id="${n.id}">✕</button>
      </div>
      <p class="text-white text-sm leading-relaxed mb-3">${esc(n.raw_content)}</p>
      <div class="flex flex-wrap gap-1 mb-2">${tags}</div>
      <p class="text-xs text-cyan-muted opacity-40">${date}</p>
    </div>`
  }).join('')
  grid.querySelectorAll('.btn-del').forEach(b =>
    b.addEventListener('click', () => deleteNode(b.dataset.id))
  )
}

document.getElementById('note-search')?.addEventListener('input', e =>
  renderNotes(e.target.value)
)

// ══════════════════════════════════════════════════════════
// ELIMINAR NODO
// ══════════════════════════════════════════════════════════
async function deleteNode(id) {
  const { error } = await supabase
    .from('nexus_nodos').delete()
    .eq('id', id).eq('user_id', currentUser.id)
  if (!error) await loadNodes()
}

// ══════════════════════════════════════════════════════════
// NAVEGACIÓN DE VISTAS
// ══════════════════════════════════════════════════════════
document.querySelectorAll('.view-tab').forEach(tab =>
  tab.addEventListener('click', () => {
    activeView = tab.dataset.view
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    document.querySelectorAll('.view-content').forEach(v => v.classList.add('hidden'))
    document.getElementById(`view-${activeView}`)?.classList.remove('hidden')
  })
)

// ── Logout ────────────────────────────────────────────────
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = '/'
})

// ── Helpers ───────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function metaLine(n) {
  const m = n.metadata
  if (!m) return ''
  if (n.node_type === 'expense' || n.node_type === 'income')
    return `${m.currency} ${m.amount} — ${m.label}`
  if (n.node_type === 'kanban')
    return `Estado: ${m.status||'todo'} | Prioridad: ${m.priority||'medium'}`
  if (n.node_type === 'note' && m.supertags?.length)
    return `Tags: ${m.supertags.join(' ')}`
  return ''
}
