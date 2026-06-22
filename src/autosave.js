// Nexus OS · Auto-save universal
//
// Utility para guardar automáticamente cualquier campo editable.
// Filosofía: el usuario nunca debería perder lo que escribió.
//
// Cómo funciona:
//   1. Adjuntas a uno o varios elementos editables (input/textarea/contenteditable).
//   2. Cuando el usuario edita, se programa un guardado con debounce (default 2.5s).
//   3. Mientras tanto, se respalda en localStorage (recuperable si se pierde red o se cierra la pestaña).
//   4. Al guardar exitosamente, se muestra un indicador "✓ guardado · hace Xs".
//   5. Si la red falla, se mantiene el borrador y se reintenta al volver online.
//
// API:
//   attachAutoSave({ scope, fields, save, status, draftKey, debounceMs, onSaved })
//   restoreDraft(draftKey)          → { data, savedAt } | null
//   discardDraft(draftKey)
//   hasDraft(draftKey)              → boolean
//   renderStatusBadge(targetEl)     → inyecta un <span> de estado y devuelve helpers

const DEFAULT_DEBOUNCE = 2500
const _state = new Map()   // scope → { timer, fields, lastSavedAt, isDirty, lastSnapshot }

function _qs(scopeEl, sel) {
  return scopeEl?.querySelector?.(sel) || null
}

function _readField(el) {
  if (!el) return ''
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked
  if (el.isContentEditable) return el.innerHTML
  return el.value ?? ''
}

function _snapshot(scopeEl, fields) {
  const snap = {}
  for (const f of fields) {
    const el = typeof f === 'string' ? _qs(scopeEl, f) : f.el
    if (!el) continue
    const key = typeof f === 'string' ? f : f.key
    snap[key] = _readField(el)
  }
  return snap
}

function _draftStorageKey(draftKey) {
  return 'nexus_autosave_' + draftKey
}

export function restoreDraft(draftKey) {
  try {
    const raw = localStorage.getItem(_draftStorageKey(draftKey))
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

export function discardDraft(draftKey) {
  try { localStorage.removeItem(_draftStorageKey(draftKey)) } catch {}
}

export function hasDraft(draftKey) {
  return !!restoreDraft(draftKey)
}

function _saveDraft(draftKey, data) {
  try {
    localStorage.setItem(_draftStorageKey(draftKey), JSON.stringify({
      data, savedAt: Date.now(),
    }))
  } catch {}
}

/**
 * Inyecta un badge visual de estado (típicamente al lado del título del modal).
 * Devuelve helpers para actualizarlo.
 */
export function renderStatusBadge(targetEl) {
  if (!targetEl) return null
  let badge = targetEl.querySelector('[data-autosave-status]')
  if (!badge) {
    badge = document.createElement('span')
    badge.setAttribute('data-autosave-status', '1')
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;font-weight:500;margin-left:10px;transition:opacity 0.3s;opacity:0;'
    targetEl.appendChild(badge)
  }
  let lastSavedAt = null
  let interval = null

  const _refreshLabel = () => {
    if (!lastSavedAt) return
    const secs = Math.floor((Date.now() - lastSavedAt) / 1000)
    let txt = ''
    if (secs < 5) txt = '✓ guardado'
    else if (secs < 60) txt = `✓ guardado · hace ${secs}s`
    else if (secs < 3600) txt = `✓ guardado · hace ${Math.floor(secs/60)} min`
    else txt = '✓ guardado'
    badge.textContent = txt
    badge.style.color = '#34d399'
    badge.style.opacity = '1'
  }

  return {
    setSaving() {
      badge.textContent = '⏳ guardando…'
      badge.style.color = '#fbbf24'
      badge.style.opacity = '1'
    },
    setSaved(at = Date.now()) {
      lastSavedAt = at
      _refreshLabel()
      if (!interval) interval = setInterval(_refreshLabel, 10000)
    },
    setError(msg) {
      badge.textContent = '⚠ ' + (msg || 'no se pudo guardar')
      badge.style.color = '#f87171'
      badge.style.opacity = '1'
    },
    setDraft() {
      badge.textContent = '✎ borrador (sin guardar)'
      badge.style.color = '#94a3b8'
      badge.style.opacity = '1'
    },
    clear() {
      if (interval) { clearInterval(interval); interval = null }
      badge.style.opacity = '0'
    },
  }
}

/**
 * Adjunta auto-save a un scope (modal/form/section).
 *
 * @param {object} opts
 * @param {Element|string} opts.scope         contenedor padre (o selector)
 * @param {Array<string|object>} opts.fields  selectores o {key, el}
 * @param {Function} opts.save                async (data) → debe persistir
 * @param {Element} [opts.status]             elemento donde inyectar el badge
 * @param {string} [opts.draftKey]            key local para borrador
 * @param {number} [opts.debounceMs]          default 2500
 * @param {Function} [opts.onSaved]
 * @param {Function} [opts.onError]
 * @returns {object} controles { flush, detach, isDirty }
 */
export function attachAutoSave(opts) {
  const {
    scope, fields, save,
    status, draftKey,
    debounceMs = DEFAULT_DEBOUNCE,
    onSaved, onError,
  } = opts

  const scopeEl = typeof scope === 'string' ? document.querySelector(scope) : scope
  if (!scopeEl || !Array.isArray(fields) || !fields.length || typeof save !== 'function') {
    return { flush: () => {}, detach: () => {}, isDirty: () => false }
  }

  const badge = status ? renderStatusBadge(status) : null
  const id = '_as_' + Math.random().toString(36).slice(2, 9)
  let timer = null
  let lastSnap = _snapshot(scopeEl, fields)
  let savingPromise = null
  let dirty = false

  // Restaura borrador si existe y el snapshot inicial es vacío
  if (draftKey) {
    const draft = restoreDraft(draftKey)
    if (draft?.data) {
      const allEmpty = Object.values(lastSnap).every(v => !v || (typeof v === 'string' && !v.trim()))
      if (allEmpty) {
        for (const [k, v] of Object.entries(draft.data)) {
          const def = fields.find(f => (typeof f === 'string' ? f : f.key) === k)
          if (!def) continue
          const el = typeof def === 'string' ? _qs(scopeEl, def) : def.el
          if (!el) continue
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v
          else if (el.isContentEditable) el.innerHTML = v
          else el.value = v
        }
        if (badge) badge.setDraft()
      }
    }
  }

  async function doSave() {
    const snap = _snapshot(scopeEl, fields)
    lastSnap = snap
    if (badge) badge.setSaving()
    try {
      savingPromise = save(snap)
      await savingPromise
      dirty = false
      if (draftKey) discardDraft(draftKey)
      if (badge) badge.setSaved()
      if (onSaved) try { onSaved(snap) } catch {}
    } catch (e) {
      console.warn('[autosave]', e)
      if (badge) badge.setError(e.message)
      if (onError) try { onError(e) } catch {}
    } finally {
      savingPromise = null
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(doSave, debounceMs)
  }

  function onInput() {
    dirty = true
    const snap = _snapshot(scopeEl, fields)
    if (draftKey) _saveDraft(draftKey, snap)
    if (badge) badge.setDraft()
    schedule()
  }

  // Adjuntar listeners
  const tracked = []
  for (const f of fields) {
    const el = typeof f === 'string' ? _qs(scopeEl, f) : f.el
    if (!el) continue
    el.addEventListener('input', onInput, { passive: true })
    el.addEventListener('change', onInput, { passive: true })
    tracked.push({ el, handler: onInput })
  }

  // Guarda antes de cerrar la pestaña
  const beforeUnload = () => { if (dirty) doSave() }
  window.addEventListener('beforeunload', beforeUnload)

  _state.set(id, { timer, fields, tracked, beforeUnload })

  return {
    flush: doSave,
    detach() {
      if (timer) clearTimeout(timer)
      tracked.forEach(({ el, handler }) => {
        el.removeEventListener('input', handler)
        el.removeEventListener('change', handler)
      })
      window.removeEventListener('beforeunload', beforeUnload)
      if (badge) badge.clear()
      _state.delete(id)
    },
    isDirty: () => dirty,
    snapshot: () => _snapshot(scopeEl, fields),
  }
}

if (typeof window !== 'undefined') {
  window.nexusAutoSave = {
    attach: attachAutoSave,
    restoreDraft, discardDraft, hasDraft,
    renderStatusBadge,
  }
}
