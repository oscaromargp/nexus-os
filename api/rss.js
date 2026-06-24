// POST /api/rss   { action, ... }
//
// API unificada del módulo RSS dentro de Proyectos.
// Auth: JWT del usuario en Authorization Bearer.
//
// Acciones:
//   - list_sources  { project_id }
//   - add_source    { project_id, platform, handle, label?, artist_name? }
//   - update_source { source_id, patch: {...} }
//   - delete_source { source_id }
//   - list_items    { project_id, status?, limit? }
//   - update_item   { item_id, patch: { status?, notes?, scheduled_for?, blog_post_url? } }
//   - delete_item   { item_id }
//   - resolve_url   { platform, handle }   // helper para resolver feed URL

import { createClient } from '@supabase/supabase-js'

const RSSHUB_BASE = process.env.RSSHUB_BASE_URL || 'https://rsshub.app'

// ── Normaliza handle: si pegaron URL completa, extrae sólo el identificador ──
function normalizeHandle(platform, raw) {
  if (!raw) return ''
  let h = raw.trim()

  // Si pegaron URL completa, intenta extraer la parte relevante
  if (/^https?:\/\//i.test(h)) {
    try {
      const u = new URL(h)
      const path = u.pathname.replace(/^\/+|\/+$/g, '')
      const host = u.host.toLowerCase()

      if (platform === 'youtube' || host.includes('youtube.com') || host.includes('youtu.be')) {
        // Patrones:
        //   /@handle, /channel/UCxxx, /user/name, /c/name
        const m = path.match(/^(?:c\/|channel\/|user\/)?(@?[A-Za-z0-9_\-]+)/)
        if (m) h = m[1]
      } else if (platform === 'instagram' || host.includes('instagram.com')) {
        h = path.split('/')[0]
      } else if (platform === 'tiktok' || host.includes('tiktok.com')) {
        h = (path.split('/')[0] || '').replace(/^@/, '')
      } else if (platform === 'spotify' || host.includes('spotify.com')) {
        // /artist/<ID>
        const m = path.match(/artist\/([A-Za-z0-9]+)/)
        if (m) h = m[1]
      } else if (platform === 'twitter' || host.includes('twitter.com') || host.includes('x.com')) {
        h = path.split('/')[0]
      } else if (platform === 'facebook' || host.includes('facebook.com')) {
        h = path.split('/')[0]
      } else if (platform === 'soundcloud' || host.includes('soundcloud.com')) {
        h = path.split('/')[0]
      } else if (platform === 'bandcamp' || host.includes('bandcamp.com')) {
        // subdomain.bandcamp.com → subdomain
        const sub = host.split('.')[0]
        if (sub && sub !== 'www' && sub !== 'bandcamp') h = sub
      } else if (platform === 'twitch' || host.includes('twitch.tv')) {
        h = path.split('/')[0]
      } else if (platform === 'wordpress') {
        h = host
      }
    } catch { /* malformed URL, leave as-is */ }
  }

  return h.replace(/^@/, '').replace(/\s+/g, '')
}

// ── Mapper de plataforma + handle → URL de RSS ────────────────────
// Conservador: si no sabemos cómo, devuelve null y exigimos URL directa.
function buildFeedUrl(platform, handle) {
  if (!handle) return null
  const h = normalizeHandle(platform, handle)
  if (!h) return null

  switch (platform) {
    case 'youtube':
      // Soporta: channel_id (UCxxx), handle (@nombre), o user/nombre
      if (/^UC[\w-]{20,}$/.test(h)) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${h}`
      }
      // handle moderno (@badbunnypr) → RSSHub
      return `${RSSHUB_BASE}/youtube/user/${h}`

    case 'instagram':
      return `${RSSHUB_BASE}/instagram/user/${h}`

    case 'tiktok':
      return `${RSSHUB_BASE}/tiktok/user/${h}`

    case 'spotify':
      // Spotify por artist_id (típicamente lo que viene después de /artist/)
      return `${RSSHUB_BASE}/spotify/artist/${h}/new_releases`

    case 'twitter':
      return `${RSSHUB_BASE}/twitter/user/${h}`

    case 'facebook':
      return `${RSSHUB_BASE}/facebook/page/${h}`

    case 'soundcloud':
      return `${RSSHUB_BASE}/soundcloud/${h}/tracks`

    case 'bandcamp':
      return `https://${h}.bandcamp.com/feed`

    case 'twitch':
      return `${RSSHUB_BASE}/twitch/live/${h}`

    case 'wordpress':
      return h.startsWith('http') ? `${h.replace(/\/$/, '')}/feed` : `https://${h.replace(/\/$/, '')}/feed`

    case 'news':
      // Google News búsqueda (no normalizar)
      return `https://news.google.com/rss/search?q=${encodeURIComponent(handle)}&hl=es-419&gl=MX&ceid=MX:es`

    case 'rss':
    case 'custom':
      return handle.startsWith('http') ? handle : null

    default:
      return null
  }
}

// ── Instancias públicas de RSSHub (la oficial bloquea con 403 seguido) ──────
// Probamos varias en orden hasta que una responda. Mantener corto: cada intento
// suma latencia. Estas rotan; si todas fallan, devolvemos el último error.
const RSSHUB_MIRRORS = [
  RSSHUB_BASE,
  'https://rsshub.rssforever.com',
  'https://rss.shab.fun',
  'https://rsshub.pseudoyu.com',
  'https://hub.slarker.me',
]

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// fetch con User-Agent de navegador + timeout. Devuelve { ok, status, text }.
async function fetchText(url, { timeout = 12000, accept } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': accept || 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    const text = await r.text()
    return { ok: r.ok, status: r.status, text }
  } catch (e) {
    return { ok: false, status: 0, text: '', error: e.name === 'AbortError' ? 'timeout' : e.message }
  } finally {
    clearTimeout(t)
  }
}

// YouTube: resuelve @handle / user / c → channel_id (UC...) leyendo la página.
// Con el channel_id usamos el feed NATIVO de YouTube (sin RSSHub → sin 403).
async function resolveYouTubeChannelId(handle) {
  if (!handle) return null
  if (/^UC[\w-]{20,}$/.test(handle)) return handle
  const tries = [
    `https://www.youtube.com/${handle.startsWith('@') ? handle : '@' + handle}`,
    `https://www.youtube.com/c/${handle.replace(/^@/, '')}`,
    `https://www.youtube.com/user/${handle.replace(/^@/, '')}`,
  ]
  for (const u of tries) {
    const r = await fetchText(u, { timeout: 9000, accept: 'text/html' })
    if (!r.text) continue
    const m = r.text.match(/"channelId":"(UC[\w-]{20,})"/)
          || r.text.match(/<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{20,})"/)
          || r.text.match(/channel\/(UC[\w-]{20,})/)
    if (m) return m[1]
  }
  return null
}

// Decode mínimo de entidades XML/HTML comunes.
function decodeEntities(s) {
  if (!s) return ''
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
    .trim()
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1] : ''
}

function pickAttr(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, 'i'))
  return m ? m[1] : ''
}

// Parser RSS 2.0 + Atom → [{ external_id, title, url, description, author, published_at, thumbnail }]
function parseFeed(xml) {
  if (!xml) return []
  const items = []
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const blockRe = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi
  const blocks = xml.match(blockRe) || []
  for (const b of blocks) {
    let url = ''
    if (isAtom) {
      url = pickAttr(b, 'link', 'href') || pick(b, 'id')
    } else {
      url = stripTags(pick(b, 'link')) || pickAttr(b, 'atom:link', 'href')
    }
    const guid = stripTags(pick(b, 'guid')) || stripTags(pick(b, 'id')) || url
    const title = stripTags(pick(b, 'title')) || '(sin título)'
    const rawDesc = pick(b, 'description') || pick(b, 'summary') || pick(b, 'content') || pick(b, 'media:description')
    const description = stripTags(rawDesc).slice(0, 600)
    const author = stripTags(pick(b, 'dc:creator')) || stripTags(pick(pick(b, 'author'), 'name')) || stripTags(pick(b, 'author'))
    const dateStr = stripTags(pick(b, 'pubDate')) || stripTags(pick(b, 'published')) || stripTags(pick(b, 'updated')) || stripTags(pick(b, 'dc:date'))
    let published_at = null
    if (dateStr) { const d = new Date(dateStr); if (!isNaN(d)) published_at = d.toISOString() }
    // thumbnail: media:thumbnail / media:content / enclosure / primer <img> del HTML
    let thumbnail = pickAttr(b, 'media:thumbnail', 'url') || pickAttr(b, 'media:content', 'url') || pickAttr(b, 'enclosure', 'url')
    if (!thumbnail) { const im = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i); if (im) thumbnail = im[1] }
    if (!guid && !url) continue
    items.push({
      external_id: (guid || url).slice(0, 500),
      title: title.slice(0, 500),
      url: url || null,
      description: description || null,
      author: author || null,
      published_at,
      thumbnail: thumbnail || null,
    })
  }
  return items
}

// Dada una fuente, devuelve la lista de URLs candidatas a probar (con mirrors).
async function candidateFeedUrls(source) {
  const { platform, feed_url, handle } = source
  // YouTube: intenta resolver a feed nativo (sin RSSHub)
  if (platform === 'youtube') {
    const chId = await resolveYouTubeChannelId(handle || feed_url)
    if (chId) return [`https://www.youtube.com/feeds/videos.xml?channel_id=${chId}`]
  }
  // Si el feed_url apunta a RSSHub, generamos variantes con cada mirror
  if (feed_url && /rsshub/i.test(feed_url)) {
    try {
      const u = new URL(feed_url)
      const path = u.pathname + u.search
      return RSSHUB_MIRRORS.map(base => base.replace(/\/$/, '') + path)
    } catch { /* cae al default */ }
  }
  return feed_url ? [feed_url] : []
}

function getSupabase(authToken) {
  const url  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + authToken } },
  })
}

function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

// refresh_now baja varios feeds → puede tardar; pedimos margen a Vercel.
export const config = { maxDuration: 30 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action } = req.body || {}

    // resolve_url no requiere auth
    if (action === 'resolve_url') {
      const { platform, handle } = req.body
      const url = buildFeedUrl(platform, handle)
      return res.status(200).json({ ok: true, feed_url: url })
    }

    // Resto requiere auth
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Sin token' })
    const sb = getSupabase(token)
    const { data: { user }, error: uErr } = await sb.auth.getUser()
    if (uErr || !user) return res.status(401).json({ error: 'Token inválido' })
    const userId = user.id
    const admin = getAdminSupabase()

    // ── LIST sources ────────────────────────────────────────────
    if (action === 'list_sources') {
      const { project_id } = req.body
      if (!project_id) return res.status(400).json({ error: 'project_id requerido' })
      const { data, error } = await admin
        .from('project_rss_sources')
        .select('*')
        .eq('owner_id', userId)
        .eq('project_id', project_id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return res.status(200).json({ ok: true, sources: data || [] })
    }

    // ── REFRESH NOW: baja y parsea los feeds DEL LADO DEL SERVIDOR ──
    // Independiente de n8n. Resuelve YouTube a feed nativo, rota mirrors de
    // RSSHub, parsea RSS/Atom y hace upsert de items nuevos. Devuelve un
    // resumen por fuente para que el usuario vea cuál sirvió y cuál no.
    if (action === 'refresh_now') {
      const { project_id, source_id } = req.body
      if (!project_id && !source_id) return res.status(400).json({ error: 'project_id o source_id requerido' })

      let q = admin.from('project_rss_sources').select('*').eq('owner_id', userId).eq('enabled', true)
      if (source_id) q = q.eq('id', source_id)
      else q = q.eq('project_id', project_id)
      const { data: sources, error: sErr } = await q
      if (sErr) throw sErr

      const nowIso = () => new Date().toISOString()

      const processOne = async (src) => {
        const urls = await candidateFeedUrls(src)
        let fetched = null, lastErr = urls.length ? 'no respondió' : 'sin feed_url'
        for (const u of urls) {
          const r = await fetchText(u, { timeout: 8000 })
          if (r.ok && r.text && /<(rss|feed|item|entry)[\s>]/i.test(r.text)) { fetched = r; break }
          lastErr = r.error ? r.error : ('HTTP ' + r.status + (r.status === 403 ? ' (bloqueado)' : ''))
        }

        if (!fetched) {
          await admin.from('project_rss_sources').update({
            last_check_at: nowIso(), fail_count: 1, last_error: lastErr.slice(0, 280),
          }).eq('id', src.id)
          return { source_id: src.id, label: src.label || src.handle || src.platform, platform: src.platform, ok: false, error: lastErr, new: 0 }
        }

        const parsed = parseFeed(fetched.text)
        let newCount = 0
        if (parsed.length) {
          const seen = new Set()
          const rows = parsed.filter(it => { if (seen.has(it.external_id)) return false; seen.add(it.external_id); return true })
            .slice(0, 40)
            .map(it => ({
              source_id: src.id, project_id: src.project_id, owner_id: userId,
              external_id: it.external_id, title: it.title, url: it.url,
              description: it.description, author: it.author,
              published_at: it.published_at, thumbnail: it.thumbnail,
            }))
          const { data: up, error: upErr } = await admin
            .from('project_rss_items')
            .upsert(rows, { onConflict: 'source_id,external_id', ignoreDuplicates: true })
            .select('id')
          if (upErr) return { source_id: src.id, label: src.label || src.handle || src.platform, platform: src.platform, ok: false, error: 'DB: ' + upErr.message, new: 0 }
          newCount = up ? up.length : 0
        }

        await admin.from('project_rss_sources').update({
          last_check_at: nowIso(), last_seen_at: nowIso(), fail_count: 0, last_error: null,
        }).eq('id', src.id)
        return { source_id: src.id, label: src.label || src.handle || src.platform, platform: src.platform, ok: true, found: parsed.length, new: newCount }
      }

      // Procesamos en paralelo (cada fuente resuelve su propio feed).
      const results = await Promise.all((sources || []).map(s => processOne(s).catch(e => ({
        source_id: s.id, label: s.label || s.handle || s.platform, platform: s.platform, ok: false, error: e.message, new: 0,
      }))))

      const total_new = results.reduce((a, r) => a + (r.new || 0), 0)
      const okCount = results.filter(r => r.ok).length
      return res.status(200).json({ ok: true, results, total_new, ok_count: okCount, source_count: results.length })
    }

    // ── ADD source ──────────────────────────────────────────────
    if (action === 'add_source') {
      const { project_id, platform, handle, label, artist_name, feed_url: directUrl } = req.body
      if (!project_id || !platform) return res.status(400).json({ error: 'project_id + platform requeridos' })
      const feed_url = directUrl || buildFeedUrl(platform, handle)
      if (!feed_url) return res.status(400).json({ error: 'No pude construir feed_url. Pásalo directo en feed_url o usa platform=custom.' })

      const { data, error } = await admin
        .from('project_rss_sources')
        .insert({
          project_id, owner_id: userId,
          platform, handle: handle || null,
          feed_url, label: label || null, artist_name: artist_name || null,
          enabled: true,
        })
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, source: data })
    }

    // ── UPDATE source ───────────────────────────────────────────
    if (action === 'update_source') {
      const { source_id, patch } = req.body
      if (!source_id || !patch) return res.status(400).json({ error: 'source_id + patch requeridos' })
      const allowed = ['enabled', 'label', 'artist_name', 'platform', 'handle', 'feed_url', 'thumbnail', 'last_error', 'fail_count']
      const update = {}
      for (const k of allowed) if (k in patch) update[k] = patch[k]
      const { data, error } = await admin
        .from('project_rss_sources')
        .update(update)
        .eq('id', source_id)
        .eq('owner_id', userId)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, source: data })
    }

    // ── DELETE source ───────────────────────────────────────────
    if (action === 'delete_source') {
      const { source_id } = req.body
      if (!source_id) return res.status(400).json({ error: 'source_id requerido' })
      const { error } = await admin
        .from('project_rss_sources')
        .delete()
        .eq('id', source_id)
        .eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── LIST items ──────────────────────────────────────────────
    if (action === 'list_items') {
      const { project_id, status, limit = 50 } = req.body
      if (!project_id) return res.status(400).json({ error: 'project_id requerido' })
      let q = admin
        .from('project_rss_items')
        .select('*, source:project_rss_sources(platform, handle, label, artist_name)')
        .eq('owner_id', userId)
        .eq('project_id', project_id)
        .order('published_at', { ascending: false, nullsLast: true })
        .limit(Math.min(limit, 200))
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return res.status(200).json({ ok: true, items: data || [] })
    }

    // ── UPDATE item ─────────────────────────────────────────────
    if (action === 'update_item') {
      const { item_id, patch } = req.body
      if (!item_id || !patch) return res.status(400).json({ error: 'item_id + patch requeridos' })
      const allowed = ['status', 'notes', 'scheduled_for', 'blog_post_url', 'draft_content']
      const update = {}
      for (const k of allowed) if (k in patch) update[k] = patch[k]
      const { data, error } = await admin
        .from('project_rss_items')
        .update(update)
        .eq('id', item_id)
        .eq('owner_id', userId)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json({ ok: true, item: data })
    }

    // ── DELETE item ─────────────────────────────────────────────
    if (action === 'delete_item') {
      const { item_id } = req.body
      if (!item_id) return res.status(400).json({ error: 'item_id requerido' })
      const { error } = await admin
        .from('project_rss_items')
        .delete()
        .eq('id', item_id)
        .eq('owner_id', userId)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    // ── GENERATE DRAFT (Gemini) ──────────────────────────────────
    // Toma un item RSS y produce un draft listo para blog: título SEO,
    // meta description, slug, H1, body markdown, tags, prompt de imagen.
    if (action === 'generate_draft') {
      const { item_id, tone, audience, brand, language } = req.body
      if (!item_id) return res.status(400).json({ error: 'item_id requerido' })

      const { data: item, error: iErr } = await admin
        .from('project_rss_items')
        .select('*, source:project_rss_sources(platform, handle, label, artist_name), project:nodes!project_rss_items_project_id_fkey(content, metadata)')
        .eq('id', item_id)
        .eq('owner_id', userId)
        .single()
      if (iErr || !item) return res.status(404).json({ error: 'Item no encontrado' })

      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' })

      const projectName = item.project?.content || item.project?.metadata?.label || 'Proyecto'
      const finalBrand = brand || projectName
      const finalTone = tone || 'profesional, cercano, conciso'
      const finalAudience = audience || 'lectores generales del blog'
      const finalLang = language || 'es-MX'

      const sourceDesc = item.source?.artist_name
        ? `del artista/marca "${item.source.artist_name}"`
        : `de la fuente "${item.source?.label || item.source?.handle || item.source?.platform}"`

      const userPrompt = `Eres redactor SEO senior para el blog del proyecto "${finalBrand}".

Te paso una publicación detectada ${sourceDesc} en ${item.source?.platform || 'web'} y debes producir un *draft de nota* listo para publicar en WordPress.

DATOS ORIGINALES:
- Título original: ${item.title || '(sin título)'}
- URL: ${item.url || '—'}
- Autor: ${item.author || '—'}
- Publicado: ${item.published_at || '—'}
- Descripción/snippet: ${(item.description || '—').slice(0, 1500)}

INSTRUCCIONES:
- Idioma: ${finalLang}
- Tono: ${finalTone}
- Audiencia: ${finalAudience}
- NO copies texto literal de la fuente — reescribe en tus palabras.
- Optimiza para ranking en Google México sin sonar a click-bait.
- Incluye al menos 1 párrafo con palabras clave naturales.
- Body de 200 a 400 palabras, en Markdown (usa ## para subtítulos si conviene).
- Termina con un párrafo de contexto y referencia a la fuente original.

DEVUELVE *EXCLUSIVAMENTE* un objeto JSON con esta forma exacta (sin markdown fences, sin texto fuera del JSON):

{
  "title_seo": "Título de 50-60 chars optimizado SEO",
  "h1": "Título principal de la nota (puede ser más rico que el SEO)",
  "slug": "url-amigable-en-minusculas-con-guiones",
  "meta_description": "Resumen de 140-160 chars para Google",
  "excerpt": "Resumen de 1-2 líneas para índice del blog",
  "body_markdown": "Cuerpo completo del post en Markdown, 200-400 palabras",
  "tags": ["tag1", "tag2", "tag3"],
  "category_suggestion": "Categoría sugerida en español",
  "og_image_prompt": "Descripción detallada de imagen para generar con DALL-E/MJ, en inglés",
  "keywords_focus": ["palabra clave principal", "secundaria 1", "secundaria 2"]
}`

      let gemResp
      try {
        gemResp = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 2000,
                responseMimeType: 'application/json',
              },
            }),
          }
        )
      } catch (e) {
        return res.status(502).json({ error: 'Gemini fetch fail: ' + e.message })
      }

      if (!gemResp.ok) {
        const txt = await gemResp.text()
        return res.status(502).json({ error: 'Gemini ' + gemResp.status + ': ' + txt.slice(0, 300) })
      }

      const gemJson = await gemResp.json()
      const raw = gemJson?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      let draft
      try { draft = JSON.parse(raw) }
      catch (e) {
        // intenta extraer JSON entre { y }
        const m = raw.match(/\{[\s\S]*\}/)
        if (!m) return res.status(500).json({ error: 'Respuesta IA no parseable', raw: raw.slice(0, 500) })
        try { draft = JSON.parse(m[0]) }
        catch { return res.status(500).json({ error: 'JSON inválido', raw: raw.slice(0, 500) }) }
      }

      // Guardar en item.draft_content y mover a status=edited
      const { data: updated, error: uErr } = await admin
        .from('project_rss_items')
        .update({
          draft_content: JSON.stringify(draft),
          status: 'edited',
        })
        .eq('id', item_id)
        .eq('owner_id', userId)
        .select()
        .single()
      if (uErr) throw uErr

      return res.status(200).json({ ok: true, draft, item: updated })
    }

    // ── PUBLISH TO WORDPRESS ─────────────────────────────────────
    // Toma un item con draft_content (JSON con campos SEO) y lo publica al
    // WordPress del usuario via REST API. Credenciales en user_metadata.wordpress.
    if (action === 'publish_to_wordpress') {
      const { item_id, status = 'draft' } = req.body  // status: 'draft'|'publish'
      if (!item_id) return res.status(400).json({ error: 'item_id requerido' })

      // Credenciales WP del user_metadata
      const wpUrl = user.user_metadata?.wordpress?.url
      const wpUser = user.user_metadata?.wordpress?.username
      const wpPass = user.user_metadata?.wordpress?.app_password
      if (!wpUrl || !wpUser || !wpPass) {
        return res.status(400).json({ error: 'Configura tu WordPress en Configuración → Conexiones → 📰 WordPress.' })
      }

      const { data: item, error: iErr } = await admin
        .from('project_rss_items')
        .select('*')
        .eq('id', item_id)
        .eq('owner_id', userId)
        .single()
      if (iErr || !item) return res.status(404).json({ error: 'Item no encontrado' })
      if (!item.draft_content) return res.status(400).json({ error: 'Item no tiene draft generado. Pulsa "🤖 Draft IA" primero.' })

      let draft
      try { draft = JSON.parse(item.draft_content) }
      catch { return res.status(500).json({ error: 'draft_content inválido' }) }

      // Construye payload WP (mínimo: title, content, status, slug, excerpt)
      // El body es markdown — WP lo guarda y muestra; si quieres renderear, instala MD plugin.
      const wpPayload = {
        title:   draft.title_seo || draft.h1 || item.title || '(sin título)',
        content: draft.body_markdown || '',
        status,  // 'draft' | 'publish'
        excerpt: draft.excerpt || '',
        slug:    draft.slug || undefined,
        meta:    {
          // Algunos plugins SEO (Yoast/Rank Math) leen estos meta keys
          _yoast_wpseo_title:    draft.title_seo,
          _yoast_wpseo_metadesc: draft.meta_description,
          rank_math_title:       draft.title_seo,
          rank_math_description: draft.meta_description,
        },
      }

      // POST a /wp-json/wp/v2/posts
      const auth = Buffer.from(wpUser + ':' + wpPass).toString('base64')
      let wpResp
      try {
        wpResp = await fetch(wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + auth,
          },
          body: JSON.stringify(wpPayload),
        })
      } catch (e) {
        return res.status(502).json({ error: 'WordPress fetch fail: ' + e.message })
      }

      const wpJson = await wpResp.json().catch(() => ({}))
      if (!wpResp.ok) {
        return res.status(502).json({ error: 'WP ' + wpResp.status + ': ' + (wpJson.message || JSON.stringify(wpJson).slice(0, 200)) })
      }

      // Update item con URL del post
      const postUrl = wpJson.link || (wpUrl + '/?p=' + wpJson.id)
      await admin
        .from('project_rss_items')
        .update({
          status: status === 'publish' ? 'published' : 'scheduled',
          blog_post_url: postUrl,
        })
        .eq('id', item_id)

      return res.status(200).json({
        ok: true,
        post: { id: wpJson.id, url: postUrl, status: wpJson.status },
      })
    }

    return res.status(400).json({ error: 'action no reconocida: ' + action })
  } catch (e) {
    console.error('[rss]', e)
    return res.status(500).json({ error: e.message })
  }
}
