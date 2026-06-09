// Nexus OS — Sistema de webhooks para n8n (multi-evento)
// Cada tipo de evento puede tener su propio webhook URL.
// Si está configurado, Nexus le dispara el payload cuando ocurre el evento.

const EVENT_TYPES = [
  { id: 'lead_new',          label: '📩 Nuevo lead',             desc: 'Cuando alguien llena el form en propiedad.html' },
  { id: 'property_created',  label: '🏠 Inmueble captado',      desc: 'Cuando creas un inmueble nuevo' },
  { id: 'property_updated',  label: '✏️ Inmueble editado',      desc: 'Cuando modificas un inmueble existente' },
  { id: 'report_generated',  label: '🌟 Reporte IA generado',   desc: 'Cuando se completa un reporte geomarketing' },
  { id: 'backup_completed',  label: '📦 Backup completado',     desc: 'Cuando termina un backup a Drive' },
  { id: 'daily_summary',     label: '☀️ Resumen diario',         desc: 'Cron cada mañana con resumen del día' },
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

export { EVENT_TYPES }

if (typeof window !== 'undefined') {
  window.nexusN8n = {
    dispatch: dispatchEvent,
    get: getWebhook,
    set: setWebhook,
    all: getAllWebhooks,
    events: EVENT_TYPES,
  }
}
