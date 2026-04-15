import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────
// Supabase
// ─────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL  || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let currentUser  = null
let allNodes     = []
let activeFilter = 'all'
let activeView   = 'feed'
let dragNodeId   = null
let editingCardId = null
let calYear = new Date().getFullYear()
let calMonth = new Date().getMonth()  // 0-based
let selectedCalDay = null

const icons = { kanban:'📌', expense:'💸', income:'💰', note:'🧠' }

// ─────────────────────────────────────────
// Auth guard
// ─────────────────────────────────────────
;(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = '/'; return }
  currentUser = session.user
  const emailEl = document.getElementById('user-email')
  if (emailEl) emailEl.textContent = currentUser.email
  await loadNodes()
})()

supabase.auth.onAuthStateChange((event, session) => {
  if (!session) window.location.href = '/'
})

// ══════════════════════════════════════════
// ENHANCED SEMANTIC PARSER
// Supports: #word, #Pagar -450 de Label el DD/MM/YYYY
// ══════════════════════════════════════════
function parseNode(raw) {
  const text = raw.trim()

  // ── Any #word prefix → Kanban ──────────
  const taskMatch = text.match(/^#(\w+)\s*(.*)/i)
  if (taskMatch) {
    let rest = taskMatch[2]
    let actionWord = taskMatch[1]
    let due_date = null
    let amount = null

    // Extract date: "el DD/MM/YYYY" or "el D/M/YYYY"
    const dateRx = /\bel\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/i
    const dateM = rest.match(dateRx)
    if (dateM) {
      const [_, d, m, y] = dateM
      due_date = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
      rest = rest.replace(dateM[0], '').trim()
    }

    // Extract amount: standalone -NUMBER or -$NUMBER (not a date part)
    const amtRx = /(?:^|\s)-\$?(\d+(?:\.\d{1,2})?)(?:\s|$)/
    const amtM = rest.match(amtRx)
    if (amtM) {
      amount = parseFloat(amtM[1])
      rest = rest.replace(amtM[0], ' ').replace(/\s+/g,' ').trim()
    }

    // Build clean label: "ActionWord rest"
    const label = (actionWord + (rest ? ' ' + rest : '')).trim()

    return {
      node_type: 'kanban',
      metadata: {
        status: 'todo', priority: 'medium',
        label, description: '',
        tags: ['#' + actionWord.toLowerCase()],
        due_date, amount,
        attachments: [], checklist: []
      }
    }
  }

  // ── -$monto → Gasto ────────────────────
  const expM = text.match(/^-\$?(\d+(?:\.\d{1,2})?)\s*(.*)/)
  if (expM) return {
    node_type: 'expense',
    metadata: { amount: parseFloat(expM[1]), currency: 'USD', label: expM[2].trim() || 'Gasto', category: 'general' }
  }

  // ── +$monto → Ingreso ──────────────────
  const incM = text.match(/^\+\$?(\d+(?:\.\d{1,2})?)\s*(.*)/)
  if (incM) return {
    node_type: 'income',
    metadata: { amount: parseFloat(incM[1]), currency: 'USD', label: incM[2].trim() || 'Ingreso', category: 'general' }
  }

  // ── Free text → Note ───────────────────
  const supertags = [...text.matchAll(/#\w+/g)].map(m => m[0])
  return { node_type: 'note', metadata: { supertags, linked_nodes: [] } }
}

// Live preview while typing
const nexusInput   = document.getElementById('nexus-input')
const parsePreview = document.getElementById('parse-preview')

nexusInput?.addEventListener('input', () => {
  const val = nexusInput.value.trim()
  if (!val) { parsePreview.style.display='none'; return }
  const { node_type, metadata } = parseNode(val)
  let detail = ''
  if (node_type === 'kanban') {
    detail = `📌 KANBAN · "${metadata.label}"${metadata.due_date ? ` · 📅 ${fmtDate(metadata.due_date)}` : ''}${metadata.amount ? ` · 💲${metadata.amount}` : ''}`
  } else if (node_type === 'expense') {
    detail = `💸 GASTO · $${metadata.amount} — ${metadata.label}`
  } else if (node_type === 'income') {
    detail = `💰 INGRESO · $${metadata.amount} — ${metadata.label}`
  } else {
    detail = `🧠 NOTA${metadata.supertags.length ? ' · ' + metadata.supertags.join(' ') : ''}`
  }
  parsePreview.textContent = detail
  parsePreview.style.display = 'block'
})

// Insert node
const nodeMsg = document.getElementById('node-msg')
function showMsg(text, err=false) {
  nodeMsg.textContent = text
  nodeMsg.style.color = err ? '#f87171' : '#00f0ff'
  nodeMsg.style.display = 'block'
  setTimeout(() => { nodeMsg.style.display='none' }, 3000)
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
  parsePreview.style.display = 'none'
  await loadNodes()
}

document.getElementById('btn-add')?.addEventListener('click', () => insertNode(nexusInput.value))
nexusInput?.addEventListener('keydown', e => { if (e.key==='Enter') insertNode(nexusInput.value) })

// ─────────────────────────────────────────
// Load nodes
// ─────────────────────────────────────────
async function loadNodes() {
  if (!currentUser) return
  const { data, error } = await supabase
    .from('nexus_nodos').select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(500)
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
  renderCalendar()
}

// ─────────────────────────────────────────
// Stats
// ─────────────────────────────────────────
function updateStats() {
  const tasks   = allNodes.filter(n=>n.node_type==='kanban').length
  const notes   = allNodes.filter(n=>n.node_type==='note').length
  const income  = allNodes.filter(n=>n.node_type==='income').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const expense = allNodes.filter(n=>n.node_type==='expense').reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const balance = income - expense
  document.getElementById('s-total').textContent = allNodes.length
  document.getElementById('s-tasks').textContent = tasks
  document.getElementById('s-notes').textContent = notes
  const balEl = document.getElementById('s-balance')
  balEl.textContent = `$${balance.toFixed(0)}`
  balEl.style.color = balance >= 0 ? '#4ade80' : '#f87171'
}

// ══════════════════════════════════════════
// VIEW: FEED
// ══════════════════════════════════════════
function renderFeed(search='') {
  let nodes = activeFilter==='all' ? allNodes : allNodes.filter(n=>n.node_type===activeFilter)
  if (search) nodes = nodes.filter(n =>
    n.raw_content.toLowerCase().includes(search.toLowerCase()) ||
    (n.metadata?.label||'').toLowerCase().includes(search.toLowerCase())
  )

  const container = document.getElementById('feed-list')
  if (!nodes.length) {
    container.innerHTML = emptyState('Sin nodos todavía. Escribe algo en el input superior.')
    return
  }
  container.innerHTML = nodes.map(n => {
    const date = fmtDateTime(n.created_at)
    const meta = metaLine(n)
    return `
    <div class="feed-item">
      <span class="feed-icon">${icons[n.node_type]||'•'}</span>
      <div class="feed-body">
        <div class="feed-meta">
          <span class="pill pill-${n.node_type}">${n.node_type}</span>
          <span class="feed-date">${date}</span>
        </div>
        <div class="feed-content">${esc(n.raw_content)}</div>
        ${meta ? `<div class="feed-detail">${meta}</div>` : ''}
      </div>
      <button class="btn-del" data-id="${n.id}" title="Eliminar">✕</button>
    </div>`
  }).join('')
  container.querySelectorAll('.btn-del').forEach(b=>b.addEventListener('click',()=>deleteNode(b.dataset.id)))
}

document.querySelectorAll('.filter-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'))
    btn.classList.add('active')
    renderFeed()
  })
)

// ══════════════════════════════════════════
// VIEW: KANBAN — Trello-style cards
// ══════════════════════════════════════════
function renderKanban() {
  const tasks = allNodes.filter(n=>n.node_type==='kanban')
  const cols  = { todo:[], in_progress:[], done:[] }
  tasks.forEach(n => {
    const s = n.metadata?.status || 'todo'
    if (cols[s]) cols[s].push(n); else cols.todo.push(n)
  })
  const map = { todo:'k-todo', in_progress:'k-progress', done:'k-done' }
  Object.entries(cols).forEach(([status, nodes]) => {
    const col = document.getElementById(map[status])
    if (!col) return
    col.innerHTML = nodes.length
      ? nodes.map(n => kanbanCard(n)).join('')
      : `<div style="text-align:center;padding:24px 0;font-size:12px;color:var(--text-quaternary);opacity:.5;">Sin tarjetas</div>`
    col.querySelectorAll('.k-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.btn-del')) return
        openCardModal(card.dataset.id)
      })
      const del = card.querySelector('.btn-del')
      if (del) del.addEventListener('click', e => { e.stopPropagation(); deleteNode(del.dataset.id) })
    })
  })
  document.getElementById('k-todo-count').textContent     = cols.todo.length
  document.getElementById('k-progress-count').textContent = cols.in_progress.length
  document.getElementById('k-done-count').textContent     = cols.done.length
}

function kanbanCard(n) {
  const priority = n.metadata?.priority || 'medium'
  const label    = n.metadata?.label || n.raw_content
  const dueDate  = n.metadata?.due_date || null
  const amount   = n.metadata?.amount || null
  const attachCount = (n.metadata?.attachments || []).length
  const checkItems  = (n.metadata?.checklist || [])
  const checkDone   = checkItems.filter(c=>c.done).length
  const checkTotal  = checkItems.length

  let dueBadge = ''
  if (dueDate) {
    const now = new Date(); now.setHours(0,0,0,0)
    const due = new Date(dueDate + 'T00:00:00')
    const diff = Math.round((due-now)/86400000)
    const cls  = diff < 0 ? 'overdue' : diff <= 3 ? 'due-soon' : 'due-ok'
    const label_d = diff < 0 ? `Vencida (${Math.abs(diff)}d)` : diff === 0 ? 'Hoy' : `${fmtDate(dueDate)}`
    dueBadge = `<span class="k-card-due ${cls}">📅 ${label_d}</span>`
  }

  return `
  <div class="k-card prio-${priority}" data-id="${n.id}" draggable="true"
       ondragstart="handleDragStart(event,'${n.id}')">
    <div class="k-card-title">${esc(label)}</div>
    <div class="k-card-footer">
      ${dueBadge}
      ${amount ? `<span class="k-card-amount">-$${amount.toLocaleString('es-ES')}</span>` : ''}
      ${attachCount > 0 ? `<span class="k-card-attach">📎 ${attachCount}</span>` : ''}
      ${checkTotal > 0 ? `<span class="k-card-attach">☑️ ${checkDone}/${checkTotal}</span>` : ''}
      <span class="priority-chip prio-${priority}" style="margin-left:auto;">${priority}</span>
      <button class="k-card-open-btn" title="Abrir detalle">⤢</button>
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
  const node = allNodes.find(n=>n.id===dragNodeId)
  if (!node) return
  const newMeta = { ...node.metadata, status: newStatus }
  const { error } = await supabase.from('nexus_nodos')
    .update({ metadata: newMeta })
    .eq('id', dragNodeId).eq('user_id', currentUser.id)
  if (!error) await loadNodes()
  dragNodeId = null
}

// ══════════════════════════════════════════
// KANBAN CARD DETAIL MODAL (Trello-style)
// ══════════════════════════════════════════
function openCardModal(id) {
  const node = allNodes.find(n=>n.id===id)
  if (!node) return
  editingCardId = id
  const m = node.metadata || {}

  document.getElementById('cm-title').value    = m.label || node.raw_content
  document.getElementById('cm-desc').value     = m.description || ''
  document.getElementById('cm-due-date').value = m.due_date || ''
  document.getElementById('cm-amount').value   = m.amount || ''
  document.getElementById('cm-tags').value     = (m.tags || []).join(' ')

  // Column badge
  const status = m.status || 'todo'
  const badgeEl = document.getElementById('cm-col-badge')
  badgeEl.className = `card-modal-col-badge badge-${status}`
  badgeEl.textContent = { todo:'Por hacer', in_progress:'En progreso', done:'Hecho' }[status] || status

  // Column selector
  document.querySelectorAll('#cm-col-selector .col-opt').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.col === status)
  })

  // Priority
  const prio = m.priority || 'medium'
  document.querySelectorAll('#cm-priority-group .priority-opt').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.prio === prio)
  })

  // Checklist
  renderChecklist(m.checklist || [])

  // Attachments
  renderAttachments(m.attachments || [])

  document.getElementById('card-modal').classList.remove('hidden')
  document.getElementById('cm-title').focus()
}

function closeCardModal() {
  document.getElementById('card-modal').classList.add('hidden')
  editingCardId = null
}

document.getElementById('cm-close')?.addEventListener('click', closeCardModal)
document.getElementById('card-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('card-modal')) closeCardModal()
})

// Column selector
document.querySelectorAll('#cm-col-selector .col-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('#cm-col-selector .col-opt').forEach(o=>o.classList.remove('selected'))
    opt.classList.add('selected')
    const badge = document.getElementById('cm-col-badge')
    badge.className = `card-modal-col-badge badge-${opt.dataset.col}`
    badge.textContent = opt.textContent.trim()
  })
})

// Priority selector
document.querySelectorAll('#cm-priority-group .priority-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('#cm-priority-group .priority-opt').forEach(o=>o.classList.remove('selected'))
    opt.classList.add('selected')
  })
})

// Save card
document.getElementById('cm-save')?.addEventListener('click', async () => {
  if (!editingCardId) return
  const node = allNodes.find(n=>n.id===editingCardId)
  if (!node) return

  const selectedCol   = document.querySelector('#cm-col-selector .col-opt.selected')?.dataset.col || 'todo'
  const selectedPrio  = document.querySelector('#cm-priority-group .priority-opt.selected')?.dataset.prio || 'medium'
  const checklist     = getChecklistData()
  const attachments   = getAttachmentsData()

  const newMeta = {
    ...node.metadata,
    label:       document.getElementById('cm-title').value.trim() || node.metadata?.label,
    description: document.getElementById('cm-desc').value.trim(),
    due_date:    document.getElementById('cm-due-date').value || null,
    amount:      parseFloat(document.getElementById('cm-amount').value) || null,
    tags:        document.getElementById('cm-tags').value.split(/\s+/).filter(t=>t.startsWith('#')),
    status:      selectedCol,
    priority:    selectedPrio,
    checklist,
    attachments
  }

  const newRaw = newMeta.label || node.raw_content

  const { error } = await supabase.from('nexus_nodos')
    .update({ metadata: newMeta, raw_content: newRaw })
    .eq('id', editingCardId).eq('user_id', currentUser.id)
  if (error) { alert(error.message); return }

  closeCardModal()
  await loadNodes()
})

// Delete card from modal
document.getElementById('cm-delete')?.addEventListener('click', async () => {
  if (!editingCardId) return
  if (!confirm('¿Eliminar esta tarjeta permanentemente?')) return
  await deleteNode(editingCardId)
  closeCardModal()
})

// ── Checklist ──────────────────────────────
function renderChecklist(items) {
  const container = document.getElementById('cm-checklist')
  if (!items.length) { container.innerHTML = ''; return }
  container.innerHTML = items.map((item, i) => `
    <div class="checklist-item" data-idx="${i}">
      <input type="checkbox" class="check-cb" ${item.done?'checked':''} data-idx="${i}" />
      <input type="text" class="check-text ${item.done?'done':''}" value="${esc(item.text)}" data-idx="${i}" />
      <button class="check-del" data-idx="${i}">✕</button>
    </div>`
  ).join('')
  container.querySelectorAll('.check-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const txt = container.querySelector(`.check-text[data-idx="${cb.dataset.idx}"]`)
      txt?.classList.toggle('done', cb.checked)
    })
  })
  container.querySelectorAll('.check-del').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.checklist-item').remove()
    })
  })
}
function getChecklistData() {
  return [...document.querySelectorAll('#cm-checklist .checklist-item')].map(item => ({
    text: item.querySelector('.check-text')?.value || '',
    done: item.querySelector('.check-cb')?.checked || false
  })).filter(c => c.text.trim())
}
document.getElementById('cm-check-add')?.addEventListener('click', () => {
  const input = document.getElementById('cm-check-input')
  const text  = input.value.trim()
  if (!text) return
  const container = document.getElementById('cm-checklist')
  const idx = container.children.length
  const div = document.createElement('div')
  div.className = 'checklist-item'
  div.dataset.idx = idx
  div.innerHTML = `
    <input type="checkbox" class="check-cb" />
    <input type="text" class="check-text" value="${esc(text)}" />
    <button class="check-del">✕</button>`
  div.querySelector('.check-cb').addEventListener('change', function() {
    div.querySelector('.check-text').classList.toggle('done', this.checked)
  })
  div.querySelector('.check-del').addEventListener('click', () => div.remove())
  container.appendChild(div)
  input.value = ''
  input.focus()
})
document.getElementById('cm-check-input')?.addEventListener('keydown', e => {
  if (e.key==='Enter') document.getElementById('cm-check-add')?.click()
})

// ── Attachments (image, base64 compressed) ──
function renderAttachments(attachments) {
  const list = document.getElementById('cm-attach-list')
  list.innerHTML = attachments.map((att, i) => `
    <div class="attach-thumb" data-idx="${i}">
      <img src="${att.data}" alt="${esc(att.name||'imagen')}" onclick="window.open('${att.data}','_blank')" />
      <button class="attach-del" data-idx="${i}">✕</button>
    </div>`
  ).join('')
  list.querySelectorAll('.attach-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      btn.closest('.attach-thumb').remove()
    })
  })
}
function getAttachmentsData() {
  return [...document.querySelectorAll('#cm-attach-list .attach-thumb')].map(thumb => ({
    name: thumb.querySelector('img')?.alt || 'imagen',
    data: thumb.querySelector('img')?.src || ''
  })).filter(a => a.data)
}
document.getElementById('cm-attach-btn')?.addEventListener('click', () => {
  document.getElementById('cm-attach-input')?.click()
})
document.getElementById('cm-attach-input')?.addEventListener('change', async (e) => {
  const files = [...e.target.files].slice(0, 3)
  const current = document.querySelectorAll('#cm-attach-list .attach-thumb').length
  if (current + files.length > 3) { alert('Máximo 3 imágenes por tarjeta.'); return }
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const dataUrl = await compressImage(file, 800, 0.72)
    const list = document.getElementById('cm-attach-list')
    const div  = document.createElement('div')
    div.className = 'attach-thumb'
    div.innerHTML = `<img src="${dataUrl}" alt="${esc(file.name)}" style="cursor:pointer" onclick="window.open('${dataUrl}','_blank')" />
      <button class="attach-del">✕</button>`
    div.querySelector('.attach-del').addEventListener('click', () => div.remove())
    list.appendChild(div)
  }
  e.target.value = ''
})
function compressImage(file, maxPx, quality) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h*maxPx/w); w = maxPx }
          else       { w = Math.round(w*maxPx/h); h = maxPx }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ══════════════════════════════════════════
// VIEW: FINANCE
// ══════════════════════════════════════════
function renderFinance() {
  const incNodes = allNodes.filter(n=>n.node_type==='income')
  const expNodes = allNodes.filter(n=>n.node_type==='expense')
  const totalInc = incNodes.reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const totalExp = expNodes.reduce((s,n)=>s+(n.metadata?.amount||0),0)
  const balance  = totalInc - totalExp

  document.getElementById('f-income').textContent  = `$${totalInc.toLocaleString('es-ES')}`
  document.getElementById('f-expense').textContent = `$${totalExp.toLocaleString('es-ES')}`
  const balEl = document.getElementById('f-balance')
  balEl.textContent = `$${balance.toLocaleString('es-ES')}`
  balEl.style.color = balance >= 0 ? '#4ade80' : '#f87171'

  const total = totalInc + totalExp || 1
  document.getElementById('f-bar-inc').style.width = `${(totalInc/total*100).toFixed(1)}%`
  document.getElementById('f-bar-exp').style.width = `${(totalExp/total*100).toFixed(1)}%`

  const moves = [...incNodes,...expNodes].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
  const list  = document.getElementById('f-list')
  if (!moves.length) { list.innerHTML=emptyState('Sin movimientos. Usa -$monto o +$monto.'); return }
  list.innerHTML = moves.map(n => {
    const isInc = n.node_type==='income'
    return `
    <div class="move-row">
      <span class="move-icon">${isInc?'💰':'💸'}</span>
      <div class="move-body" style="flex:1;">
        <div class="move-label">${esc(n.metadata?.label||n.raw_content)}</div>
        <div class="move-date">${fmtDateTime(n.created_at)}</div>
      </div>
      <span class="move-amount" style="color:${isInc?'#4ade80':'#f87171'}">
        ${isInc?'+':'-'}$${n.metadata?.amount?.toLocaleString('es-ES')||0}
      </span>
      <button class="btn-del" data-id="${n.id}">✕</button>
    </div>`
  }).join('')
  list.querySelectorAll('.btn-del').forEach(b=>b.addEventListener('click',()=>deleteNode(b.dataset.id)))
}

// ══════════════════════════════════════════
// VIEW: NOTES
// ══════════════════════════════════════════
function renderNotes(query='') {
  let notes = allNodes.filter(n=>n.node_type==='note')
  if (query) notes = notes.filter(n =>
    n.raw_content.toLowerCase().includes(query.toLowerCase()) ||
    (n.metadata?.supertags||[]).some(t=>t.toLowerCase().includes(query.toLowerCase()))
  )
  const grid = document.getElementById('notes-grid')
  if (!notes.length) { grid.innerHTML=`<div style="grid-column:1/-1;">${emptyState('Sin notas. Escribe texto libre arriba.')}</div>`; return }
  grid.innerHTML = notes.map(n => {
    const tags = (n.metadata?.supertags||[]).map(t=>`<span class="note-tag">${t}</span>`).join('')
    return `
    <div class="note-card">
      <div class="note-header">
        <span style="font-size:20px;">🧠</span>
        <button class="btn-del" data-id="${n.id}">✕</button>
      </div>
      <div class="note-body">${esc(n.raw_content)}</div>
      ${tags ? `<div class="note-tags">${tags}</div>` : ''}
      <div class="note-date">${fmtDateTime(n.created_at)}</div>
    </div>`
  }).join('')
  grid.querySelectorAll('.btn-del').forEach(b=>b.addEventListener('click',()=>deleteNode(b.dataset.id)))
}
document.getElementById('note-search')?.addEventListener('input', e => renderNotes(e.target.value))

// ══════════════════════════════════════════
// VIEW: CALENDAR
// ══════════════════════════════════════════
function renderCalendar() {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  document.getElementById('cal-title').textContent = `${months[calMonth]} ${calYear}`

  const firstDay = new Date(calYear, calMonth, 1)
  let startDow = firstDay.getDay() // 0=Sun…6=Sat; we want Mon=0
  startDow = (startDow + 6) % 7    // convert to Mon-based

  const daysInMonth  = new Date(calYear, calMonth+1, 0).getDate()
  const daysInPrev   = new Date(calYear, calMonth, 0).getDate()
  const today        = new Date(); today.setHours(0,0,0,0)

  // Build a map: "YYYY-MM-DD" → [nodes]
  const dayMap = {}
  allNodes.forEach(n => {
    // Use due_date for kanban, created_at for others
    let dateStr = null
    if (n.node_type==='kanban' && n.metadata?.due_date) {
      dateStr = n.metadata.due_date
    } else {
      dateStr = n.created_at.substring(0,10)
    }
    if (!dayMap[dateStr]) dayMap[dateStr] = []
    dayMap[dateStr].push(n)
  })

  const grid = document.getElementById('cal-grid')
  let cells = ''

  // Previous month filler
  for (let i=0; i<startDow; i++) {
    const d = daysInPrev - startDow + 1 + i
    cells += `<div class="cal-cell other-month"><div class="cal-day-num">${d}</div></div>`
  }

  // Current month
  for (let d=1; d<=daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const dt = new Date(calYear, calMonth, d)
    const isToday = dt.getTime() === today.getTime()
    const isSel   = selectedCalDay === dateStr
    const nodesForDay = dayMap[dateStr] || []
    const dots = nodesForDay.slice(0,6).map(n=>`<div class="cal-dot ${n.node_type}"></div>`).join('')
    cells += `
    <div class="cal-cell${isToday?' today':''}${isSel?' selected':''}" data-date="${dateStr}" onclick="selectCalDay('${dateStr}')">
      <div class="cal-day-num">${d}</div>
      <div class="cal-dots">${dots}</div>
    </div>`
  }

  // Next month filler
  const totalCells = startDow + daysInMonth
  const remainder  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
  for (let i=1; i<=remainder; i++) {
    cells += `<div class="cal-cell other-month"><div class="cal-day-num">${i}</div></div>`
  }

  grid.innerHTML = cells

  // Refresh panel if day is selected
  if (selectedCalDay) selectCalDay(selectedCalDay, false)
}

window.selectCalDay = function(dateStr, toggle=true) {
  if (toggle && selectedCalDay===dateStr) {
    selectedCalDay = null
    document.getElementById('cal-day-panel').style.display='none'
    renderCalendar()
    return
  }
  selectedCalDay = dateStr
  renderCalendar()

  // Find nodes for this day
  const nodes = allNodes.filter(n => {
    const nDate = n.node_type==='kanban' && n.metadata?.due_date
      ? n.metadata.due_date
      : n.created_at.substring(0,10)
    return nDate === dateStr
  })

  const panel = document.getElementById('cal-day-panel')
  document.getElementById('cal-panel-title').textContent = `📅 ${fmtDateFull(dateStr)} — ${nodes.length} elemento(s)`

  if (!nodes.length) {
    document.getElementById('cal-panel-content').innerHTML =
      `<div style="padding:20px 0;color:var(--text-quaternary);font-size:14px;text-align:center;">Sin nodos para este día</div>`
  } else {
    document.getElementById('cal-panel-content').innerHTML = nodes.map(n => `
      <div class="feed-item" style="margin-bottom:8px;">
        <span class="feed-icon">${icons[n.node_type]||'•'}</span>
        <div class="feed-body">
          <div class="feed-meta">
            <span class="pill pill-${n.node_type}">${n.node_type}</span>
          </div>
          <div class="feed-content">${esc(n.raw_content)}</div>
          ${metaLine(n) ? `<div class="feed-detail">${metaLine(n)}</div>` : ''}
        </div>
      </div>`
    ).join('')
  }
  panel.style.display = 'block'
}

document.getElementById('cal-prev')?.addEventListener('click', () => {
  calMonth--; if (calMonth<0){calMonth=11;calYear--}
  selectedCalDay=null
  document.getElementById('cal-day-panel').style.display='none'
  renderCalendar()
})
document.getElementById('cal-next')?.addEventListener('click', () => {
  calMonth++; if (calMonth>11){calMonth=0;calYear++}
  selectedCalDay=null
  document.getElementById('cal-day-panel').style.display='none'
  renderCalendar()
})

// ══════════════════════════════════════════
// GLOBAL SEARCH
// ══════════════════════════════════════════
const globalSearch = document.getElementById('global-search')
const searchResults = document.getElementById('search-results')

globalSearch?.addEventListener('input', () => {
  const q = globalSearch.value.trim()
  if (!q || q.length < 2) { searchResults.style.display='none'; return }

  const matches = allNodes.filter(n =>
    n.raw_content.toLowerCase().includes(q.toLowerCase()) ||
    (n.metadata?.label||'').toLowerCase().includes(q.toLowerCase()) ||
    (n.metadata?.description||'').toLowerCase().includes(q.toLowerCase())
  ).slice(0,8)

  if (!matches.length) { searchResults.style.display='none'; return }

  searchResults.innerHTML = matches.map(n => `
    <div class="search-result-item" data-id="${n.id}" data-type="${n.node_type}">
      <span class="sr-icon">${icons[n.node_type]||'•'}</span>
      <span class="sr-text">${esc(n.raw_content)}</span>
      <span class="sr-type">${n.node_type}</span>
    </div>`
  ).join('')
  searchResults.style.display = 'block'

  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type
      const id   = item.dataset.id
      searchResults.style.display = 'none'
      globalSearch.value = ''
      // Navigate to appropriate view
      switchView(type === 'kanban' ? 'kanban' : type === 'note' ? 'notes' : type === 'expense' || type === 'income' ? 'finance' : 'feed')
      if (type === 'kanban') setTimeout(() => openCardModal(id), 150)
    })
  })
})

globalSearch?.addEventListener('blur', () => {
  setTimeout(() => { searchResults.style.display='none' }, 200)
})

// Ctrl+K shortcut
document.addEventListener('keydown', e => {
  if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); globalSearch?.focus() }
  if (e.key==='Escape') { closeCardModal(); searchResults.style.display='none' }
})

// ══════════════════════════════════════════
// PRINT
// ══════════════════════════════════════════
document.getElementById('btn-print')?.addEventListener('click', () => window.print())

// ══════════════════════════════════════════
// VIEW NAVIGATION
// ══════════════════════════════════════════
function switchView(name) {
  activeView = name
  document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view===name))
  document.querySelectorAll('.view-content').forEach(v => {
    v.classList.toggle('active', v.id===`view-${name}`)
  })
}

document.querySelectorAll('.view-tab').forEach(tab =>
  tab.addEventListener('click', () => switchView(tab.dataset.view))
)

// ── Logout ────────────────────────────────
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await supabase.auth.signOut()
  window.location.href = '/'
})

// ══════════════════════════════════════════
// DELETE NODE
// ══════════════════════════════════════════
async function deleteNode(id) {
  const { error } = await supabase.from('nexus_nodos').delete()
    .eq('id', id).eq('user_id', currentUser.id)
  if (!error) await loadNodes()
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function fmtDate(iso) {
  if (!iso) return ''
  const [y,m,d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function fmtDateFull(iso) {
  if (!iso) return ''
  const dt = new Date(iso+'T00:00:00')
  return dt.toLocaleDateString('es-ES',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
}
function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
}
function emptyState(text) {
  return `<div class="empty-state"><div class="empty-icon">✦</div><p>${text}</p></div>`
}
function metaLine(n) {
  const m = n.metadata
  if (!m) return ''
  if (n.node_type==='expense'||n.node_type==='income')
    return `${m.currency||'USD'} ${m.amount} — ${m.label||''}`
  if (n.node_type==='kanban') {
    let s = `Estado: ${m.status||'todo'} | Prioridad: ${m.priority||'medium'}`
    if (m.due_date) s += ` | Vence: ${fmtDate(m.due_date)}`
    if (m.amount)   s += ` | Monto: -$${m.amount}`
    return s
  }
  if (n.node_type==='note' && m.supertags?.length)
    return `Tags: ${m.supertags.join(' ')}`
  return ''
}
