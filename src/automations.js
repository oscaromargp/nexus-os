// Nexus OS — Vista Disparadores (Automatizaciones)
//
// Renderiza el módulo de recetas IFTTT-style: galería del catálogo,
// lista de activas, toggle ON/OFF, modal de parámetros, log de runs.

import { supabase } from './supabase.js'

let _catalog = []      // [{ id, name, desc, category, icon, color, paramsSchema }]
let _active  = []      // [{ id, recipe_id, enabled, params, n8n_webhook_url, ... }]

async function _fetchCatalog() {
  const r = await fetch('/api/automations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'catalog' }),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(j.error || 'catalog fail')
  return j.recipes || []
}

async function _fetchActive() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const r = await fetch('/api/automations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ action: 'list' }),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(j.error || 'list fail')
  return j.automations || []
}

async function _enable(recipe_id, params) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sin sesión')
  const r = await fetch('/api/automations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ action: 'enable', recipe_id, params }),
  })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.error || 'enable fail')
  return j
}

async function _disable(automation_id) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/automations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ action: 'disable', automation_id }),
  })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.error || 'disable fail')
  return j
}

async function _delete(automation_id) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/automations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
    },
    body: JSON.stringify({ action: 'delete', automation_id }),
  })
  const j = await r.json()
  if (!r.ok || !j.ok) throw new Error(j.error || 'delete fail')
  return j
}

// ── Modal de parámetros ───────────────────────────────────────────
function _openParamsModal(recipe, currentParams = {}) {
  return new Promise((resolve) => {
    const fields = recipe.paramsSchema || []
    const params = { ...currentParams }

    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:9999;
      display:flex; align-items:center; justify-content:center; padding:16px;
    `

    const modal = document.createElement('div')
    modal.style.cssText = `
      background:#0f1419; border:1px solid #1f2937; border-radius:16px;
      padding:24px; max-width:480px; width:100%; color:#e5e7eb;
      max-height:90vh; overflow-y:auto;
    `

    let html = `
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
        <div style="font-size:32px;">${recipe.icon}</div>
        <div>
          <div style="font-weight:700; font-size:18px;">${recipe.name}</div>
          <div style="font-size:12px; color:#9ca3af;">${recipe.desc}</div>
        </div>
      </div>
    `

    if (fields.length === 0) {
      html += `<p style="font-size:14px; color:#9ca3af; padding:12px 0;">Esta receta no requiere parámetros — sólo activa.</p>`
    } else {
      html += `<div style="display:flex; flex-direction:column; gap:14px; margin:16px 0;">`
      fields.forEach(f => {
        const val = params[f.key] !== undefined ? params[f.key] : (f.default ?? '')
        params[f.key] = val
        if (f.type === 'bool') {
          html += `
            <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
              <input type="checkbox" data-key="${f.key}" ${val ? 'checked' : ''} style="width:18px; height:18px;"/>
              <span style="font-size:14px;">${f.label}</span>
            </label>
          `
        } else if (f.type === 'number') {
          html += `
            <div>
              <label style="display:block; font-size:13px; color:#9ca3af; margin-bottom:4px;">${f.label}</label>
              <input type="number" data-key="${f.key}" value="${val}"
                ${f.min !== undefined ? `min="${f.min}"` : ''}
                ${f.max !== undefined ? `max="${f.max}"` : ''}
                style="width:100%; padding:10px 12px; background:#1f2937; border:1px solid #374151; border-radius:8px; color:#e5e7eb; font-size:14px;"/>
            </div>
          `
        } else {
          html += `
            <div>
              <label style="display:block; font-size:13px; color:#9ca3af; margin-bottom:4px;">${f.label}</label>
              <input type="text" data-key="${f.key}" value="${val}"
                style="width:100%; padding:10px 12px; background:#1f2937; border:1px solid #374151; border-radius:8px; color:#e5e7eb; font-size:14px;"/>
            </div>
          `
        }
      })
      html += `</div>`
    }

    html += `
      <div style="display:flex; gap:8px; margin-top:20px;">
        <button data-act="cancel" style="flex:1; padding:12px; background:transparent; border:1px solid #374151; color:#9ca3af; border-radius:10px; cursor:pointer; font-size:14px;">Cancelar</button>
        <button data-act="save" style="flex:2; padding:12px; background:linear-gradient(135deg, ${recipe.color}, ${recipe.color}cc); border:none; color:#000; font-weight:700; border-radius:10px; cursor:pointer; font-size:14px;">${currentParams && Object.keys(currentParams).length ? '✓ Guardar' : '⚡ Activar receta'}</button>
      </div>
    `

    modal.innerHTML = html
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const cleanup = (result) => {
      document.body.removeChild(overlay)
      resolve(result)
    }

    modal.querySelectorAll('input[data-key]').forEach(input => {
      input.addEventListener('input', e => {
        const key = e.target.dataset.key
        if (e.target.type === 'checkbox') params[key] = e.target.checked
        else if (e.target.type === 'number') params[key] = Number(e.target.value)
        else params[key] = e.target.value
      })
    })

    modal.querySelector('[data-act=cancel]').addEventListener('click', () => cleanup(null))
    modal.querySelector('[data-act=save]').addEventListener('click', () => cleanup(params))
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null) })
  })
}

// ── Render principal ──────────────────────────────────────────────
async function renderAutomations() {
  const root = document.getElementById('automations-root')
  if (!root) return

  root.innerHTML = `
    <div style="padding:20px; color:#9ca3af;">⏳ Cargando…</div>
  `

  try {
    if (!_catalog.length) _catalog = await _fetchCatalog()
    _active = await _fetchActive()
  } catch (e) {
    root.innerHTML = `<div style="padding:20px; color:#f87171;">Error: ${e.message}</div>`
    return
  }

  const activeByRecipe = {}
  _active.forEach(a => { activeByRecipe[a.recipe_id] = a })

  const categories = [
    { id: 'daily',    label: '☀️ Cotidiano',  color: '#fbbf24' },
    { id: 'crm',      label: '👥 CRM',        color: '#22d3ee' },
    { id: 'finance',  label: '💰 Finanzas',   color: '#34d399' },
    { id: 'wellness', label: '🩺 Salud',      color: '#34d399' },
    { id: 'content',  label: '📡 Contenido',  color: '#a78bfa' },
    { id: 'system',   label: '⚙️ Sistema',    color: '#94a3b8' },
  ]

  const activeRecipes = _catalog.filter(r => activeByRecipe[r.id]?.enabled)
  const inactiveRecipes = _catalog.filter(r => !activeByRecipe[r.id]?.enabled)

  let html = `
    <div style="padding:20px; max-width:1200px; margin:0 auto;">
      <div style="margin-bottom:24px;">
        <h2 style="font-size:24px; font-weight:800; margin:0 0 6px;">⚡ Flujos</h2>
        <p style="color:#9ca3af; font-size:14px; margin:0;">
          Recetas pre-armadas que conectan Nexus con Telegram, n8n y servicios externos.
          Activa con un toggle — sin programar.
        </p>
      </div>
  `

  // ── Sección: Activas
  html += `<div style="margin-bottom:32px;">
    <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:#9ca3af; margin:0 0 14px; font-weight:700;">
      Activas (${activeRecipes.length})
    </h3>`

  if (activeRecipes.length === 0) {
    html += `<div style="padding:24px; background:rgba(255,255,255,0.02); border:1px dashed #374151; border-radius:12px; text-align:center; color:#6b7280; font-size:14px;">
      Aún no tienes recetas activas. Explora el catálogo abajo ↓
    </div>`
  } else {
    html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap:12px;">`
    activeRecipes.forEach(r => {
      const a = activeByRecipe[r.id]
      html += `
        <div style="padding:16px; background:rgba(${_hexToRgb(r.color)},0.06); border:1px solid ${r.color}40; border-radius:12px; position:relative;">
          <div style="display:flex; align-items:start; gap:12px; margin-bottom:10px;">
            <div style="font-size:28px;">${r.icon}</div>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:700; color:#e5e7eb; font-size:14px;">${r.name}</div>
              <div style="font-size:11px; color:#10b981; margin-top:2px;">🟢 Activo</div>
            </div>
          </div>
          <div style="display:flex; gap:6px; margin-top:10px;">
            <button data-act="config" data-id="${r.id}" data-aid="${a.id}" style="flex:1; padding:6px 10px; background:rgba(255,255,255,0.05); border:1px solid #374151; color:#9ca3af; border-radius:6px; cursor:pointer; font-size:11px;">⚙️ Configurar</button>
            <button data-act="disable" data-aid="${a.id}" style="padding:6px 12px; background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.25); color:#f87171; border-radius:6px; cursor:pointer; font-size:11px;">⏸ Pausar</button>
          </div>
          ${a.n8n_webhook_url ? `
            <details style="margin-top:8px;">
              <summary style="font-size:11px; color:#6b7280; cursor:pointer;">🔗 URL del webhook</summary>
              <input type="text" readonly value="${a.n8n_webhook_url}"
                onclick="this.select()"
                style="width:100%; margin-top:6px; padding:6px 8px; background:#0a0e13; border:1px solid #374151; border-radius:4px; color:#34d399; font-size:10px; font-family:monospace;"/>
            </details>
          ` : ''}
        </div>
      `
    })
    html += `</div>`
  }
  html += `</div>`

  // ── Sección: Catálogo (inactivas)
  html += `<div>
    <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:#9ca3af; margin:0 0 14px; font-weight:700;">
      Explora el catálogo (${inactiveRecipes.length})
    </h3>`

  categories.forEach(cat => {
    const inCat = inactiveRecipes.filter(r => r.category === cat.id)
    if (inCat.length === 0) return
    html += `<div style="margin-bottom:20px;">
      <div style="font-size:12px; color:${cat.color}; margin-bottom:10px; font-weight:600;">${cat.label}</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap:12px;">`
    inCat.forEach(r => {
      const isDisabled = r.requiresPhase && r.requiresPhase > 1
      html += `
        <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px solid #1f2937; border-radius:12px; ${isDisabled ? 'opacity:0.5;' : ''}">
          <div style="display:flex; align-items:start; gap:12px; margin-bottom:10px;">
            <div style="font-size:28px;">${r.icon}</div>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:700; color:#e5e7eb; font-size:14px;">${r.name}</div>
              <div style="font-size:11px; color:#9ca3af; margin-top:4px; line-height:1.4;">${r.desc}</div>
            </div>
          </div>
          ${isDisabled ? `
            <div style="margin-top:10px; padding:6px 10px; background:rgba(167,139,250,0.08); border:1px solid rgba(167,139,250,0.2); color:#a78bfa; border-radius:6px; font-size:11px; text-align:center;">
              🚧 Llega en Fase ${r.requiresPhase}
            </div>
          ` : `
            <button data-act="enable" data-id="${r.id}" style="width:100%; margin-top:10px; padding:8px; background:linear-gradient(135deg, ${r.color}, ${r.color}cc); border:none; color:#000; font-weight:700; border-radius:8px; cursor:pointer; font-size:12px;">
              ▶ Activar
            </button>
          `}
        </div>
      `
    })
    html += `</div></div>`
  })

  html += `</div></div>`

  root.innerHTML = html

  // Event handlers
  root.querySelectorAll('[data-act=enable]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const recipe = _catalog.find(r => r.id === id)
      const params = await _openParamsModal(recipe)
      if (params === null) return
      btn.textContent = '⏳ Activando…'
      btn.disabled = true
      try {
        const r = await _enable(id, params)
        if (r.afterResult?.webhookUrl) {
          alert('✅ Activado.\n\n' + r.afterResult.instruction + '\n\n' + r.afterResult.webhookUrl)
        } else {
          alert('✅ Receta activa.')
        }
        await renderAutomations()
      } catch (e) {
        alert('⚠️ Error: ' + e.message)
        btn.textContent = '▶ Activar'
        btn.disabled = false
      }
    })
  })

  root.querySelectorAll('[data-act=disable]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aid = btn.dataset.aid
      if (!confirm('¿Pausar esta receta? Puedes reactivarla luego sin perder configuración.')) return
      try {
        await _disable(aid)
        await renderAutomations()
      } catch (e) {
        alert('⚠️ Error: ' + e.message)
      }
    })
  })

  root.querySelectorAll('[data-act=config]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id
      const recipe = _catalog.find(r => r.id === id)
      const current = _active.find(a => a.recipe_id === id)
      const params = await _openParamsModal(recipe, current?.params || {})
      if (params === null) return
      try {
        await _enable(id, params)  // upsert reusa la lógica
        await renderAutomations()
      } catch (e) {
        alert('⚠️ Error: ' + e.message)
      }
    })
  })
}

function _hexToRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return '255,255,255'
  return parseInt(m[1],16) + ',' + parseInt(m[2],16) + ',' + parseInt(m[3],16)
}

export { renderAutomations }

if (typeof window !== 'undefined') {
  window.nexusAutomations = { render: renderAutomations }
}
