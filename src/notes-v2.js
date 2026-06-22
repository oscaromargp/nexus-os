// Nexus OS · Notas v2 (S5)
//
// Mejoras sobre el módulo de notas existente:
//
// 1) Recordatorios funcionales: lee notas con metadata.reminder y dispara
//    notificaciones web reales (igual que las alarmas de S3). Cada nota
//    con reminder se registra en localStorage como "alarma virtual" y el
//    polling existente las dispara cuando llega la hora.
//
// 2) Compartir por WhatsApp: helper que genera un texto limpio del cuerpo
//    de la nota y abre wa.me con el contenido pre-llenado.
//
// 3) Hook para que cuando se guarde una nota con reminder, se sincronice
//    automáticamente con el sistema de alarmas.

const NOTE_ALARM_PREFIX = 'note-'

// ── Util: extrae texto plano del HTML de la nota ───────────────────────────
function _htmlToPlainText(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  // Reemplaza <br> y bloques con saltos de línea
  div.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
  div.querySelectorAll('h1, h2, h3, p, div, li').forEach(el => {
    el.appendChild(document.createTextNode('\n'))
  })
  // Checkboxes
  div.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const txt = cb.checked ? '[x] ' : '[ ] '
    cb.replaceWith(document.createTextNode(txt))
  })
  let text = div.textContent || ''
  // Normaliza saltos múltiples
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

// ── Recordatorios: sincroniza con sistema de alarmas localStorage ──────────
// Las alarmas se guardan en localStorage como JSON array (igual que S3).
// Para una nota con reminder, agregamos/actualizamos su entrada con id "note-<noteId>".
const ALM_STORAGE_KEY = 'nexus_alarms_v1'

function _loadAlarms() {
  try { return JSON.parse(localStorage.getItem(ALM_STORAGE_KEY) || '[]') } catch { return [] }
}
function _saveAlarms(list) {
  try { localStorage.setItem(ALM_STORAGE_KEY, JSON.stringify(list)) } catch {}
}

/**
 * Sincroniza el recordatorio de UNA nota con el sistema de alarmas.
 * Idempotente: si ya existe la alarma, la actualiza; si la nota perdió su
 * reminder, la quita.
 */
export function syncNoteReminder(node) {
  if (!node || node.type !== 'note') return
  const reminder = node.metadata?.reminder
  const noteId = node.id
  const alarmId = NOTE_ALARM_PREFIX + noteId
  let alarms = _loadAlarms()

  if (!reminder) {
    // Quitar alarma vinculada si existía
    const before = alarms.length
    alarms = alarms.filter(a => a.id !== alarmId)
    if (alarms.length !== before) _saveAlarms(alarms)
    return
  }

  const label = (node.metadata?.label || node.content || 'Recordatorio').slice(0, 100)
  const when = reminder.length === 10 ? reminder + 'T09:00:00' : reminder
  const existing = alarms.find(a => a.id === alarmId)
  if (existing) {
    // Update si cambió la fecha o el label
    if (existing.when !== when || existing.label !== label) {
      existing.when = when
      existing.label = label
      existing.fired = false   // re-arm si moviste la fecha
      _saveAlarms(alarms)
    }
  } else {
    alarms.push({
      id: alarmId, label, when,
      fired: false,
      noteId,                  // ← referencia para abrir la nota al click
      createdAt: Date.now(),
    })
    _saveAlarms(alarms)
  }
}

/** Sincroniza TODAS las notas con reminder. Útil al cargar la app. */
export function syncAllNoteReminders(allNodes) {
  if (!Array.isArray(allNodes)) return
  for (const n of allNodes) {
    if (n.type === 'note' && n.metadata?.reminder) {
      syncNoteReminder(n)
    }
  }
}

// ── Compartir por WhatsApp ─────────────────────────────────────────────────
/**
 * Abre wa.me con el contenido de la nota pre-llenado.
 * Sin destinatario: el usuario elige a quién mandar desde el menú nativo.
 */
window.shareNoteWhatsApp = function(noteId) {
  const allNodes = window.allNodes || []
  const note = allNodes.find(n => n.id === noteId)
  if (!note) { window.showToast?.('Nota no encontrada'); return }

  const title = note.metadata?.label || ''
  const body = _htmlToPlainText(note.content || '')
  const tags = (note.metadata?.tags || []).join(' ')

  let text = ''
  if (title) text += `*${title}*\n\n`
  if (body)  text += body + '\n'
  if (tags)  text += `\n${tags}`

  // wa.me con texto pre-llenado (sin destinatario)
  const url = 'https://wa.me/?text=' + encodeURIComponent(text.slice(0, 4096))
  window.open(url, '_blank', 'noopener')
}

// ── Patch saveNote_fp para que sincronice reminders al guardar ────────────
// Al cargar este módulo, hookeamos saveNote_fp original.
function _wrapSaveNote() {
  if (typeof window === 'undefined') return
  const original = window.saveNote_fp
  if (!original || original.__nv2Wrapped) return
  window.saveNote_fp = async function(id, opts) {
    const result = await original.call(this, id, opts)
    // Después de guardar, sincroniza el reminder
    try {
      const node = (window.allNodes || []).find(n => n.id === id)
      if (node) syncNoteReminder(node)
    } catch {}
    return result
  }
  window.saveNote_fp.__nv2Wrapped = true
}

// ── Init ──────────────────────────────────────────────────────────────────
function _init() {
  // Sincroniza notas existentes al cargar (esperamos a que allNodes esté listo)
  let attempts = 0
  const tryInit = () => {
    if (window.allNodes?.length) {
      syncAllNoteReminders(window.allNodes)
      _wrapSaveNote()
    } else if (attempts < 30) {
      attempts++
      setTimeout(tryInit, 500)
    }
  }
  tryInit()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init)
  } else {
    setTimeout(_init, 100)
  }
}

if (typeof window !== 'undefined') {
  window.nexusNotesV2 = {
    syncNoteReminder, syncAllNoteReminders,
    htmlToPlainText: _htmlToPlainText,
  }
}
