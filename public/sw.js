const CACHE = 'nexus-os-v2'
const PRECACHE = ['/', '/app.html', '/index.html', '/reset-password.html']

self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Skip Supabase API calls — never cache those
  if (e.request.url.includes('supabase.co')) return
  if (e.request.method !== 'GET') return
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
