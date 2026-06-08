// Nexus OS — Email via n8n webhook
// El usuario configura un webhook en su n8n que enruta a SMTP/Gmail/Mailgun/etc.
// Nexus solo dispara el webhook con el JSON {to, subject, html}.
//
// Setup:
//  1. En tu n8n (n8n.zxyw.site), crear workflow:
//     · Trigger: Webhook → POST → genera URL única
//     · Action: SMTP node (o Gmail node) usando tu cuenta
//  2. Copia la Webhook URL.
//  3. En Nexus OS → Configuración → 🔗 Conexiones → "n8n Email" → pega la URL.
//
// Uso desde código:
//   import { sendEmailViaN8n } from './email-n8n.js'
//   await sendEmailViaN8n({
//     to: 'cliente@ejemplo.com',
//     subject: '🏠 Tu propiedad: ' + folio,
//     html: '<p>Hola, te comparto…</p>',
//     attachments: [{name:'reporte.pdf', url:'https://...'}]
//   })

const STORAGE_KEY = 'nexus_n8n_email_webhook'

export function getEmailWebhook() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

export function setEmailWebhook(url) {
  if (url && !url.startsWith('https://')) throw new Error('Webhook debe ser HTTPS')
  if (url) localStorage.setItem(STORAGE_KEY, url.trim())
  else localStorage.removeItem(STORAGE_KEY)
}

export async function sendEmailViaN8n({ to, subject, html, text, from, replyTo, attachments }) {
  const url = getEmailWebhook()
  if (!url) throw new Error('No has configurado el webhook n8n para emails. Configúralo en Configuración → 🔗 Conexiones.')
  if (!to) throw new Error('Falta destinatario (to)')
  if (!subject) throw new Error('Falta subject')
  if (!html && !text) throw new Error('Falta html o text')

  const payload = {
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    from,
    reply_to: replyTo,
    attachments: attachments || [],
    sent_at: new Date().toISOString(),
    source: 'nexus-os',
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`n8n ${r.status}: ${txt.slice(0, 200)}`)
  }
  try { window.nexusTrack?.('action:email_send', { provider: 'n8n', subject: subject.slice(0, 50) }) } catch {}
  return { ok: true, status: r.status }
}

// Test de conexión: envía un email de prueba al usuario actual
export async function testEmailWebhook(testEmail) {
  return sendEmailViaN8n({
    to: testEmail,
    subject: '✅ Nexus OS — Test de email',
    html: `<div style="font-family:sans-serif;padding:20px;">
      <h2 style="color:#22d3ee;">¡Email funcionando!</h2>
      <p>Si recibes esto, tu webhook de n8n está enrutando correctamente.</p>
      <p style="color:#64748b;font-size:12px;">Enviado desde Nexus OS · ${new Date().toLocaleString('es-MX')}</p>
    </div>`,
    text: 'Email funcionando. Si recibes esto, tu webhook n8n enruta correctamente.',
  })
}

if (typeof window !== 'undefined') {
  window.nexusEmail = { send: sendEmailViaN8n, test: testEmailWebhook, getWebhook: getEmailWebhook, setWebhook: setEmailWebhook }
}
