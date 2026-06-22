// api/og-image.js
// Proxy de imagen para Open Graph (WhatsApp / Facebook / Twitter).
//
// Problema que resuelve: las URLs de Google Drive
// (drive.google.com/thumbnail?id=...) NO son renderizadas de forma fiable
// por los bots de WhatsApp/Facebook. Este endpoint busca la foto principal
// de la propiedad, la descarga server-side y la re-sirve desde NUESTRO dominio
// con Content-Type correcto y cache agresivo.
//
// Uso: /api/og-image?id=<propiedad-id-o-slug>
//
// Resultado: og:image siempre apunta a una URL estable de nuestro dominio
// que cualquier scraper puede leer.

import { createClient } from '@supabase/supabase-js'

function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

// Normaliza una URL de Drive al formato thumbnail que sí permite hotlink server-side
function normalizeDriveUrl(url) {
  if (!url) return url
  const m = String(url).match(/\/file\/d\/([^/]+)\//) || String(url).match(/[?&]id=([^&]+)/)
  if (m && /drive\.google|googleusercontent/.test(url)) {
    return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`
  }
  return url
}

// Selecciona la mejor imagen de la propiedad:
//   1. metadata.main_image_url (la foto ⭐ que el usuario eligió)
//   2. seo_image_url explícito
//   3. primera del array fotos
function pickImageUrl(p) {
  const mainUrl = p.metadata?.main_image_url
  if (mainUrl) return mainUrl
  if (p.seo_image_url) return p.seo_image_url
  if (Array.isArray(p.fotos) && p.fotos.length) {
    const f = p.fotos[0]
    return typeof f === 'string' ? f : (f?.url || f?.thumb_url || '')
  }
  return null
}

export default async function handler(req, res) {
  const id = req.query.id || req.query.slug || ''
  if (!id) return res.status(400).send('missing id')

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const lookupField = isUuid ? 'id' : 'slug'

  try {
    const sb = getAdminSupabase()
    const { data: p } = await sb.from('properties')
      .select('id, slug, fotos, seo_image_url, metadata, deleted_at')
      .eq(lookupField, id).is('deleted_at', null).maybeSingle()

    let imgUrl = p ? pickImageUrl(p) : null
    imgUrl = normalizeDriveUrl(imgUrl)

    if (!imgUrl) {
      // Sin imagen: redirige al placeholder estático
      res.setHeader('Location', '/icons/icon-512.png')
      return res.status(302).end()
    }

    // Descarga la imagen server-side
    const imgRes = await fetch(imgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusOG/1.0)' },
      redirect: 'follow',
    })
    if (!imgRes.ok) {
      // Si falla la descarga, redirige a la URL original como último recurso
      res.setHeader('Location', imgUrl)
      return res.status(302).end()
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    // Si no es imagen (Drive devolvió HTML de error), redirige
    if (!/^image\//i.test(contentType)) {
      res.setHeader('Location', imgUrl)
      return res.status(302).end()
    }

    const buffer = Buffer.from(await imgRes.arrayBuffer())

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600')   // 1 día CDN
    res.setHeader('Content-Length', buffer.length)
    return res.status(200).send(buffer)
  } catch (e) {
    console.error('[og-image]', e)
    res.setHeader('Location', '/icons/icon-512.png')
    return res.status(302).end()
  }
}
