// Nexus OS — Sistema de webhooks para n8n (multi-evento)
// Cada tipo de evento puede tener su propio webhook URL.
// Si está configurado, Nexus le dispara el payload cuando ocurre el evento.
//
// Persistencia dual:
//   - localStorage: rápido para lectura cliente-side
//   - user_metadata.n8n_webhooks en Supabase: requerido por endpoints server-side
//     (como /api/lead-capture que corre anónimo desde propiedad.html)

import { supabase } from './supabase.js'

const EVENT_TYPES = [
  { id: 'lead_new',          label: '📩 Nuevo lead',             desc: 'Cuando alguien llena el form en propiedad.html' },
  { id: 'property_created',  label: '🏠 Inmueble captado',      desc: 'Cuando creas un inmueble nuevo' },
  { id: 'property_updated',  label: '✏️ Inmueble editado',      desc: 'Cuando modificas un inmueble existente' },
  { id: 'report_generated',  label: '🌟 Reporte IA generado',   desc: 'Cuando se completa un reporte geomarketing' },
  { id: 'backup_completed',  label: '📦 Backup completado',     desc: 'Cuando termina un backup a Drive' },
  { id: 'daily_summary',     label: '☀️ Resumen diario',         desc: 'Cron cada mañana con resumen del día' },
  { id: 'movement_created',  label: '💰 Movimiento registrado',  desc: 'Cuando capturas un ingreso o gasto en Bio-Finanzas o Movimientos' },
]

function _key(eventId) { return 'nexus_n8n_webhook_' + eventId }

export function getWebhook(eventId) {
  try { return localStorage.getItem(_key(eventId)) || '' } catch { return '' }
}

export function setWebhook(eventId, url) {
  try {
    if (url) localStorage.setItem(_key(eventId), url.trim())
    else localStorage.removeItem(_key(eventId))
  } catch {}
  // Persiste también en user_metadata para que endpoints server-side puedan leerlo
  _syncToMetadata().catch(e => console.warn('[n8n] meta sync', e.message))
}

async function _syncToMetadata() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const map = {}
  for (const t of EVENT_TYPES) {
    const u = getWebhook(t.id)
    if (u) map[t.id] = u
  }
  const current = user.user_metadata?.n8n_webhooks || {}
  // Sólo update si cambió
  if (JSON.stringify(current) === JSON.stringify(map)) return
  await supabase.auth.updateUser({ data: { n8n_webhooks: map } })
}

// Al iniciar, hidrata localStorage desde user_metadata (multi-device sync)
export async function hydrateFromMetadata() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const map = user?.user_metadata?.n8n_webhooks
    if (!map || typeof map !== 'object') return
    for (const [eventId, url] of Object.entries(map)) {
      if (url && !getWebhook(eventId)) {
        try { localStorage.setItem(_key(eventId), url) } catch {}
      }
    }
  } catch {}
}

export async function dispatchEvent(eventId, payload) {
  const url = getWebhook(eventId)
  if (!url) return { ok: false, reason: 'no_webhook' }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: eventId,
        timestamp: new Date().toISOString(),
        source: 'nexus-os',
        data: payload,
      }),
      signal: AbortSignal.timeout(10000),
    })
    try { window.nexusTrack?.('n8n:dispatch', { event: eventId, status: r.status }) } catch {}
    return { ok: r.ok, status: r.status }
  } catch (e) {
    console.warn('[n8n] dispatch fail', eventId, e.message)
    return { ok: false, error: e.message }
  }
}

export function getAllWebhooks() {
  return EVENT_TYPES.map(t => ({ ...t, url: getWebhook(t.id) }))
}

// Helper específico para movimientos: normaliza el payload y dispara.
// Se invoca después de un INSERT exitoso en nodes (type income/expense) o
// en movimientos (tipo entrada/salida). Best-effort, no bloquea UI.
export function dispatchMovement(source, node) {
  const url = getWebhook('movement_created')
  if (!url) return  // sin webhook config → no-op silencioso

  // Normaliza shape común entre `nodes` (income/expense) y `movimientos` (entrada/salida)
  let payload = {}
  if (source === 'node') {
    const isIncome = node.type === 'income'
    payload = {
      kind:        isIncome ? 'income' : 'expense',
      amount:      node.metadata?.amount || 0,
      currency:    node.metadata?.currency || 'MXN',
      label:       node.content || node.metadata?.label || '—',
      account:     node.metadata?.account_hint || node.metadata?.account || null,
      tags:        node.metadata?.tags || [],
      date:        node.metadata?.date || node.created_at?.split('T')[0],
      project_tag: node.metadata?.project_tag || null,
      contact_id:  node.metadata?.contact_id || null,
      source:      'nodes',
      node_id:     node.id,
    }
  } else if (source === 'movimiento') {
    const isIncome = node.tipo === 'entrada'
    payload = {
      kind:           isIncome ? 'income' : 'expense',
      amount:         node.monto_mxn || node.cantidad || 0,
      currency:       node.moneda || 'MXN',
      label:          (node.tipo === 'entrada' ? 'Ingreso: ' : 'Pago: ') + (node.beneficiario || node.ordenante || '—'),
      account:        node.banco_origen || node.banco || null,
      account_dest:   node.banco_destino || null,
      date:           node.fecha,
      categoria:      node.categoria || null,
      proyecto:       node.proyecto || null,
      comprobante:    node.comprobante_url || null,  // ← PDF / link de evidencia
      notas:          (node.notas || '').slice(0, 300),
      estado:         node.estado || null,
      source:         'movimientos',
      movimiento_id:  node.id,
    }
  }
  dispatchEvent('movement_created', payload).catch(() => { /* silent */ })
}

export { EVENT_TYPES }

if (typeof window !== 'undefined') {
  window.nexusN8n = {
    dispatch: dispatchEvent,
    dispatchMovement,
    get: getWebhook,
    set: setWebhook,
    all: getAllWebhooks,
    events: EVENT_TYPES,
    hydrate: hydrateFromMetadata,
  }
  // Auto-hidrata al cargar (best-effort)
  setTimeout(() => hydrateFromMetadata(), 1500)
}

// ── WordPress connector (F6) ─────────────────────────────────────
export async function loadWordPressCreds() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.user_metadata?.wordpress || null
  } catch { return null }
}

export async function saveWordPressCreds({ url, username, app_password }) {
  if (!url || !username || !app_password) throw new Error('Faltan campos')
  const cleanUrl = url.replace(/\/$/, '')
  const { error } = await supabase.auth.updateUser({
    data: { wordpress: { url: cleanUrl, username, app_password } },
  })
  if (error) throw error
}

export async function testWordPress() {
  const creds = await loadWordPressCreds()
  if (!creds) throw new Error('Guarda credenciales primero')
  const auth = btoa(creds.username + ':' + creds.app_password)
  const r = await fetch(creds.url + '/wp-json/wp/v2/users/me', {
    headers: { Authorization: 'Basic ' + auth },
  })
  if (!r.ok) throw new Error('WP ' + r.status)
  const j = await r.json()
  return j.name || j.username || 'OK'
}

async function _initWpConnector() {
  const elUrl  = document.getElementById('conn-wp-url')
  const elUser = document.getElementById('conn-wp-user')
  const elPass = document.getElementById('conn-wp-pass')
  const elSave = document.getElementById('conn-wp-save')
  const elTest = document.getElementById('conn-wp-test')
  const elStat = document.getElementById('conn-wp-status')
  if (!elUrl) return  // panel no cargado todavía

  const creds = await loadWordPressCreds()
  if (creds) {
    elUrl.value = creds.url || ''
    elUser.value = creds.username || ''
    // No mostramos el app_password — campo vacío significa "conserva el actual"
    elStat.textContent = '🟢 Conectado a ' + creds.url
    elStat.style.color = '#22c55e'
  } else {
    elStat.textContent = '⚪ No conectado'
  }

  elSave.addEventListener('click', async () => {
    const url = elUrl.value.trim()
    const username = elUser.value.trim()
    let app_password = elPass.value.trim()
    if (!app_password && creds) app_password = creds.app_password  // conserva
    try {
      await saveWordPressCreds({ url, username, app_password })
      elStat.textContent = '💾 Guardado'
      elStat.style.color = '#22c55e'
      elPass.value = ''
    } catch (e) {
      elStat.textContent = '⚠ Error: ' + e.message
      elStat.style.color = '#f87171'
    }
  })

  elTest.addEventListener('click', async () => {
    elStat.textContent = '⏳ Probando…'
    elStat.style.color = '#9ca3af'
    try {
      const who = await testWordPress()
      elStat.textContent = '✓ Conectado como ' + who
      elStat.style.color = '#22c55e'
    } catch (e) {
      elStat.textContent = '⚠ ' + e.message
      elStat.style.color = '#f87171'
    }
  })
}

// ── Agent provider selector (F8) ─────────────────────────────────
async function _initAgentConnector() {
  const sel = document.getElementById('conn-agent-provider')
  const testBtn = document.getElementById('conn-agent-test')
  const statusEl = document.getElementById('conn-agent-status')
  const resultEl = document.getElementById('conn-agent-test-result')
  if (!sel || !testBtn) return

  // Carga preferencia actual
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const current = user?.user_metadata?.agent_provider || 'groq'
    sel.value = current
    statusEl.textContent = '🟢 Proveedor activo: ' + (current === 'groq' ? 'Groq Llama 3.3' : 'Gemini Flash')
    statusEl.style.color = '#22c55e'
  } catch (e) {
    statusEl.textContent = '⚪ No disponible'
  }

  sel.addEventListener('change', async () => {
    const newProvider = sel.value
    try {
      await supabase.auth.updateUser({ data: { agent_provider: newProvider } })
      statusEl.textContent = '💾 Guardado: ' + newProvider
      statusEl.style.color = '#22c55e'
    } catch (e) {
      statusEl.textContent = '⚠ Error: ' + e.message
      statusEl.style.color = '#f87171'
    }
  })

  testBtn.addEventListener('click', async () => {
    resultEl.textContent = '⏳ Probando…'
    resultEl.style.color = '#9ca3af'
    try {
      const r = await fetch('/api/agent', { method: 'GET' })
      const j = await r.json()
      if (j.ok) {
        const status = j.providers.map(p => `${p.id}: ${p.available ? '🟢' : '⚪'}`).join(' · ')
        resultEl.textContent = `✓ Endpoint OK · ${status} · Default: ${j.default}`
        resultEl.style.color = '#22c55e'
      } else {
        resultEl.textContent = '⚠ ' + (j.error || 'fail')
        resultEl.style.color = '#f87171'
      }
    } catch (e) {
      resultEl.textContent = '⚠ ' + e.message
      resultEl.style.color = '#f87171'
    }
  })
}

if (typeof window !== 'undefined') {
  setTimeout(() => { try { _initWpConnector() } catch (e) { console.warn('[wp]', e) } }, 2000)
  setTimeout(() => { try { _initAgentConnector() } catch (e) { console.warn('[agent]', e) } }, 2100)
  // Re-inicializa si el usuario navega a la tab de Conexiones después
  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('.cfg-tab')) setTimeout(() => {
      try { _initWpConnector() } catch {}
      try { _initAgentConnector() } catch {}
    }, 200)
  })
}
