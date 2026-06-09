const CACHE = 'nexus-os-v4'
const PRECACHE = ['/', '/app.html', '/index.html', '/reset-password.html']

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

// Push notification handlers
self.addEventListener('push', e => {
  let data = { title: 'Nexus OS', body: 'Nueva notificación', url: '/app.html' }
  try { if (e.data) data = { ...data, ...e.data.json() } } catch {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon || '/nexus-icon-192.png',
    badge: '/nexus-icon-192.png',
    data: { url: data.url || '/app.html' },
    vibrate: [80, 40, 80],
    tag: data.tag || 'nexus',
    renotify: true,
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/app.html'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.includes(url) && 'focus' in c) return c.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  }))
})

self.addEventListener('fetch', e => {
  // Skip Supabase API calls — never cache those
  if (e.request.url.includes('supabase.co')) return
  if (e.request.method !== 'GET') return
  const url = e.request.url
  // HTML pages: network-first para que cambios en app.html lleguen rápido
  if (url.endsWith('.html') || url.endsWith('/') || url.includes('/app') || url.includes('/propiedad')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => caches.match(e.request))
    )
    return
  }
  // Demás (JS, CSS, imgs): cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      }).catch(() => cached)
      return cached || network
    })
  )
})
