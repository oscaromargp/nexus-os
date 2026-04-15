import { createClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────
// Supabase client
// ──────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ──────────────────────────────────────────────
// Guard: solo usuarios autenticados
// ──────────────────────────────────────────────
let currentUser = null

;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = '/'
    return
  }
  currentUser = session.user
  document.getElementById('user-email').textContent = currentUser.email
  await loadNodes()
})()

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = '/'
  }
})

// ──────────────────────────────────────────────
// PARSER SEMÁNTICO
// Analiza el texto libre y devuelve { node_type, metadata }
// ──────────────────────────────────────────────
function parseNode(raw) {
  const text = raw.trim()

  // Tarea / Kanban: comienza con #tarea
  if (/^#tarea\b/i.test(text)) {
    const label = text.replace(/^#tarea\s*/i, '').trim()
    return {
      node_type: 'kanban',
      metadata: {
        status: 'todo',
        priority: 'medium',
        tags: ['#tarea'],
        label,
      },
    }
  }

  // Gasto: comienza con -$ (ej: -$500 Renta)
  const expenseMatch = text.match(/^-\$(\d+(?:\.\d{1,2})?)\s*(.*)/)
  if (expenseMatch) {
    return {
      node_type: 'expense',
      metadata: {
        amount: parseFloat(expenseMatch[1]),
        currency: 'USD',
        label: expenseMatch[2].trim() || 'Gasto',
        category: 'general',
      },
    }
  }

  // Ingreso: comienza con +$ (ej: +$1500 Freelance)
  const incomeMatch = text.match(/^\+\$(\d+(?:\.\d{1,2})?)\s*(.*)/)
  if (incomeMatch) {
    return {
      node_type: 'income',
      metadata: {
        amount: parseFloat(incomeMatch[1]),
        currency: 'USD',
        label: incomeMatch[2].trim() || 'Ingreso',
        category: 'general',
      },
    }
  }

  // Nota libre — extrae supertags (#palabra)
  const supertags = [...text.matchAll(/#\w+/g)].map(m => m[0])
  return {
    node_type: 'note',
    metadata: {
      supertags,
      linked_nodes: [],
    },
  }
}

// Preview en tiempo real del parser
const nexusInput   = document.getElementById('nexus-input')
const parsePreview = document.getElementById('parse-preview')

nexusInput?.addEventListener('input', () => {
  const val = nexusInput.value.trim()
  if (!val) {
    parsePreview.classList.add('hidden')
    return
  }
  const { node_type, metadata } = parseNode(val)
  const icons = { kanban: '📌', expense: '💸', income: '💰', note: '🧠' }
  parsePreview.textContent = `${icons[node_type] || '•'} Tipo detectado: ${node_type}  |  ${JSON.stringify(metadata)}`
  parsePreview.classList.remove('hidden')
})

// ──────────────────────────────────────────────
// INSERTAR NODO en Supabase
// ──────────────────────────────────────────────
const btnAdd     = document.getElementById('btn-add-node')
const nodeMsg    = document.getElementById('node-message')

function showNodeMsg(text, isError = false) {
  nodeMsg.textContent = text
  nodeMsg.className   = `mt-2 text-xs ${isError ? 'text-red-400' : 'text-cyan-neon'}`
  nodeMsg.classList.remove('hidden')
  setTimeout(() => nodeMsg.classList.add('hidden'), 3000)
}

async function insertNode(raw) {
  if (!raw.trim()) return
  const { node_type, metadata } = parseNode(raw)

  const { error } = await supabase
    .from('nexus_nodos')
    .insert({
      user_id:     currentUser.id,
      raw_content: raw.trim(),
      node_type,
      metadata,
    })

  if (error) {
    showNodeMsg(`Error: ${error.message}`, true)
    return
  }

  showNodeMsg(`Nodo [${node_type}] guardado`)
  nexusInput.value = ''
  parsePreview.classList.add('hidden')
  await loadNodes()
}

btnAdd?.addEventListener('click', () => insertNode(nexusInput.value))

nexusInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') insertNode(nexusInput.value)
})

// ──────────────────────────────────────────────
// CARGAR NODOS desde Supabase
// ──────────────────────────────────────────────
let activeFilter = 'all'
let allNodes     = []

async function loadNodes() {
  if (!currentUser) return

  let query = supabase
    .from('nexus_nodos')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (activeFilter !== 'all') {
    query = query.eq('node_type', activeFilter)
  }

  const { data, error } = await query
  if (error) { console.error(error); return }

  allNodes = data || []
  renderNodes(allNodes)
  updateStats(allNodes)
}

// ──────────────────────────────────────────────
// RENDERIZAR NODOS
// ──────────────────────────────────────────────
function renderNodes(nodes) {
  const feed = document.getElementById('nodes-feed')

  if (!nodes.length) {
    feed.innerHTML = `
      <div class="text-center text-cyan-muted text-sm py-12 opacity-50">
        Sin nodos todavía. Escribe algo arriba para comenzar.
      </div>`
    return
  }

  feed.innerHTML = nodes.map(node => {
    const icons  = { kanban: '📌', expense: '💸', income: '💰', note: '🧠' }
    const colors = {
      kanban:  'border-yellow-400/40 text-yellow-400',
      expense: 'border-red-400/40   text-red-400',
      income:  'border-green-400/40 text-green-400',
      note:    'border-purple-400/40 text-purple-400',
    }
    const date = new Date(node.created_at).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })

    const metaStr = formatMeta(node.node_type, node.metadata)

    return `
    <div class="glass p-4 border-l-4 ${colors[node.node_type] || 'border-cyan-neon/40'} fade-in">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-lg">${icons[node.node_type] || '•'}</span>
            <span class="text-xs font-mono ${colors[node.node_type]?.split(' ')[1] || 'text-cyan-neon'} uppercase tracking-widest">
              ${node.node_type}
            </span>
          </div>
          <p class="text-white text-sm mb-1">${escapeHtml(node.raw_content)}</p>
          ${metaStr ? `<p class="text-xs text-cyan-muted font-mono">${metaStr}</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-2 shrink-0">
          <span class="text-xs text-cyan-muted opacity-60">${date}</span>
          <button class="btn-delete text-xs text-red-400/50 hover:text-red-400 transition-colors"
            data-id="${node.id}">✕</button>
        </div>
      </div>
    </div>`
  }).join('')

  // Botones de borrar
  feed.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteNode(btn.dataset.id))
  })
}

function formatMeta(type, meta) {
  if (!meta) return ''
  if (type === 'expense' || type === 'income') {
    return `${meta.currency} ${meta.amount} — ${meta.label}`
  }
  if (type === 'kanban') {
    return `Estado: ${meta.status || 'todo'} | Prioridad: ${meta.priority || 'medium'}`
  }
  if (type === 'note' && meta.supertags?.length) {
    return `Tags: ${meta.supertags.join(' ')}`
  }
  return ''
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ──────────────────────────────────────────────
// ELIMINAR NODO
// ──────────────────────────────────────────────
async function deleteNode(id) {
  const { error } = await supabase
    .from('nexus_nodos')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id)

  if (!error) await loadNodes()
}

// ──────────────────────────────────────────────
// ESTADÍSTICAS
// ──────────────────────────────────────────────
function updateStats(nodes) {
  const tasks   = nodes.filter(n => n.node_type === 'kanban').length
  const notes   = nodes.filter(n => n.node_type === 'note').length
  const income  = nodes.filter(n => n.node_type === 'income')
                       .reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const expense = nodes.filter(n => n.node_type === 'expense')
                       .reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const balance = income - expense

  document.getElementById('stat-total').textContent   = nodes.length
  document.getElementById('stat-tasks').textContent   = tasks
  document.getElementById('stat-notes').textContent   = notes
  const balEl = document.getElementById('stat-balance')
  balEl.textContent  = `$${balance.toFixed(0)}`
  balEl.className    = `text-2xl font-bold ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`
}

// ──────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    activeFilter = btn.dataset.filter
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.add('opacity-50'))
    btn.classList.remove('opacity-50')
    await loadNodes()
  })
})

// ──────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = '/'
})
