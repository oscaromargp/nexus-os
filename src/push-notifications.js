// Nexus OS — Push notifications PWA
// Web Push API + VAPID (estándar W3C, sin Google/Firebase/OneSignal).
// El usuario suscribe → guardamos la suscripción en Supabase → desde la app
// (o cron) podemos disparar notificaciones a través de un endpoint serverless.
//
// Casos de uso:
//   - "📬 5 personas vieron Lote 034 hoy" (analytics de propiedad pública)
//   - "💰 Cobro $5,000 vence mañana"
//   - "✨ Nuevo reporte IA listo"

const VAPID_PUBLIC_KEY_KEY = 'nexus_vapid_public'

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function pushPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

export async function getCurrentSubscription() {
  if (!await isPushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// Suscribe al usuario actual. Requiere VAPID_PUBLIC_KEY guardada.
export async function subscribeToPush() {
  if (!await isPushSupported()) throw new Error('Push no soportado en este navegador')

  // Pide permiso
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado')

  // Obtener clave pública del servidor (la generaste con web-push)
  const publicKey = localStorage.getItem(VAPID_PUBLIC_KEY_KEY)
  if (!publicKey) {
    // Intenta cargarla del endpoint del proyecto
    try {
      const r = await fetch('/api/push-vapid-key')
      if (r.ok) {
        const { publicKey: serverKey } = await r.json()
        if (serverKey) localStorage.setItem(VAPID_PUBLIC_KEY_KEY, serverKey)
      }
    } catch {}
  }
  const finalKey = localStorage.getItem(VAPID_PUBLIC_KEY_KEY)
  if (!finalKey) {
    throw new Error('VAPID public key no configurado. Avisa al admin para generar las VAPID keys.')
  }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(finalKey),
  })

  // Persiste la suscripción en Supabase (tabla push_subscriptions)
  try {
    const { supabase } = await import('./supabase.js')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        keys: sub.toJSON().keys,
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: 'endpoint' })
    }
  } catch (e) { console.warn('[push] save subscription', e) }

  try { window.nexusTrack?.('action:push_subscribe') } catch {}
  return sub
}

export async function unsubscribeFromPush() {
  const sub = await getCurrentSubscription()
  if (!sub) return false
  const ok = await sub.unsubscribe()
  // Borra de DB
  try {
    const { supabase } = await import('./supabase.js')
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  } catch {}
  try { window.nexusTrack?.('action:push_unsubscribe') } catch {}
  return ok
}

// Trigger manual desde la app (envía una push al user actual como test)
export async function sendTestPush() {
  const r = await fetch('/api/push-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '🚀 Nexus OS',
      body: 'Notificaciones funcionando correctamente.',
      url: '/app.html',
    }),
  })
  if (!r.ok) throw new Error('Test push: ' + r.status)
  return r.json()
}

if (typeof window !== 'undefined') {
  window.nexusPush = {
    isSupported: isPushSupported,
    permission: pushPermission,
    subscribe: subscribeToPush,
    unsubscribe: unsubscribeFromPush,
    test: sendTestPush,
    getCurrentSubscription,
  }
}
