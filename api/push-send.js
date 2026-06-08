// POST /api/push-send
// Envía una notificación push a TODAS las suscripciones del usuario actual.
// Body: { title, body, url?, icon? }
//
// Requiere VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT en env Vercel.
// Genera con: npx web-push generate-vapid-keys

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars faltantes')
  return createClient(url, key, { auth: { persistSession: false } })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject    = process.env.VAPID_SUBJECT || 'mailto:admin@nexus.os'
  if (!publicKey || !privateKey) {
    res.status(503).json({ error: 'VAPID keys no configuradas. Genera con npx web-push generate-vapid-keys.' })
    return
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  const { title, body, url, icon, user_id_override } = req.body || {}
  if (!title || !body) {
    res.status(400).json({ error: 'Falta title y body' })
    return
  }

  try {
    // Auth: obtener user_id desde el bearer token
    let user_id = user_id_override
    if (!user_id) {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.replace(/^Bearer /, '')
      if (token) {
        const supa = createClient(process.env.VITE_SUPABASE_URL, token, { auth: { persistSession: false } })
        const { data: { user } } = await supa.auth.getUser()
        user_id = user?.id
      }
    }
    if (!user_id) {
      res.status(401).json({ error: 'Sin sesión' })
      return
    }

    const sb = getSupabase()
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', user_id)
    if (!subs?.length) {
      res.status(200).json({ sent: 0, message: 'No subscriptions' })
      return
    }

    const payload = JSON.stringify({ title, body, url: url || '/app.html', icon: icon || '/nexus-icon-192.png' })
    const results = await Promise.allSettled(subs.map(s =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload)
    ))

    // Limpia suscripciones gone (404/410)
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'rejected' && (r.reason?.statusCode === 410 || r.reason?.statusCode === 404)) {
        await sb.from('push_subscriptions').delete().eq('endpoint', subs[i].endpoint)
      }
    }

    const sent = results.filter(r => r.status === 'fulfilled').length
    res.status(200).json({ sent, total: subs.length })
  } catch (e) {
    console.error('[push-send]', e)
    res.status(500).json({ error: e.message })
  }
}
