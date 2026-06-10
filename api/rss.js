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

// ── Mapper de plataforma + handle → URL de RSS ────────────────────
// Conservador: si no sabemos cómo, devuelve null y exigimos URL directa.
function buildFeedUrl(platform, handle) {
  if (!handle) return null
  const h = handle.trim().replace(/^@/, '')

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
      // h debería ser la URL base ej: 'misitio.com'
      return h.startsWith('http') ? `${h.replace(/\/$/, '')}/feed` : `https://${h.replace(/\/$/, '')}/feed`

    case 'news':
      // Google News búsqueda
      return `https://news.google.com/rss/search?q=${encodeURIComponent(h)}&hl=es-419&gl=MX&ceid=MX:es`

    case 'rss':
    case 'custom':
      return h.startsWith('http') ? h : null

    default:
      return null
  }
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
      const allowed = ['enabled', 'label', 'artist_name', 'platform', 'handle', 'feed_url', 'thumbnail']
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

    return res.status(400).json({ error: 'action no reconocida: ' + action })
  } catch (e) {
    console.error('[rss]', e)
    return res.status(500).json({ error: e.message })
  }
}
