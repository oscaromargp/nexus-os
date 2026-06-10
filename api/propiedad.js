// Server-Side Rendering para preview en redes sociales (WhatsApp, Telegram,
// Facebook, Twitter, LinkedIn, iMessage).
//
// Los crawlers NO ejecutan JavaScript, sólo leen el HTML estático. Esta
// edge function devuelve HTML con todas las meta tags pre-llenadas con
// datos reales de la propiedad ANTES de que el crawler las lea.
//
// Rutas:
//   /propiedad/:id  → /api/propiedad?id=:id  (rewrite en vercel.json)
//
// Para usuarios humanos: incluye un script que redirige al SPA real
// (propiedad.html?id=...) para que tengan la experiencia completa.
//
// Para crawlers: ya tienen los datos OG en <head>, no necesitan JS.

import { createClient } from '@supabase/supabase-js'

function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  return createClient(url, key, { auth: { persistSession: false } })
}

function esc(s) {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}

function fmt$(n) {
  if (n == null || isNaN(n)) return ''
  return '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

function buildOgImage(p) {
  // 1) Si tiene seo_image_url explícito
  if (p.seo_image_url) return p.seo_image_url
  // 2) Primera foto del array fotos
  if (Array.isArray(p.fotos) && p.fotos.length > 0) {
    const first = p.fotos[0]
    return typeof first === 'string' ? first : (first?.url || '')
  }
  // 3) Imagen default genérica (el logo o un placeholder)
  return 'https://nexus-os-chi.vercel.app/icons/icon-512.png'
}

function buildOgTitle(p) {
  if (p.seo_title) return p.seo_title
  const tipo = p.tipo ? p.tipo[0].toUpperCase() + p.tipo.slice(1) : 'Inmueble'
  const op = p.operacion === 'renta' ? 'en renta' : 'en venta'
  const titulo = p.titulo || `${tipo} ${op}`
  const precio = p.operacion === 'renta' ? p.precio_renta : p.precio_venta
  const precioStr = precio ? fmt$(precio) : ''
  return [titulo, precioStr].filter(Boolean).join(' · ')
}

function buildOgDescription(p) {
  if (p.seo_description) return p.seo_description
  const parts = []
  if (p.recamaras) parts.push(`${p.recamaras} rec`)
  if (p.banos) parts.push(`${p.banos} baños`)
  if (p.sup_construida) parts.push(`${p.sup_construida} m² construcción`)
  if (p.sup_terreno) parts.push(`${p.sup_terreno} m² terreno`)
  if (p.estacionamientos) parts.push(`${p.estacionamientos} estac.`)
  const fisica = parts.join(' · ')
  const ubic = [p.municipio, p.estado_rep].filter(Boolean).join(', ')
  const desc = p.descripcion ? p.descripcion.slice(0, 100).replace(/\s+/g, ' ').trim() : ''
  return [fisica, ubic, desc].filter(Boolean).join(' — ').slice(0, 200)
}

function renderHtml(p, baseUrl, spaUrl) {
  const ogTitle = buildOgTitle(p)
  const ogDesc  = buildOgDescription(p)
  const ogImage = buildOgImage(p)
  const ogUrl   = baseUrl + '/propiedad/' + (p.slug || p.id)
  const titulo  = p.titulo || 'Inmueble'
  const precio  = p.operacion === 'renta' ? p.precio_renta : p.precio_venta
  const ubic    = [p.municipio, p.estado_rep].filter(Boolean).join(', ')

  // JSON-LD Schema.org (Producto/Residence)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': p.tipo === 'casa' || p.tipo === 'departamento' || p.tipo === 'terreno' ? 'Residence' : 'Product',
    name: ogTitle,
    description: ogDesc,
    image: ogImage,
    url: ogUrl,
    ...(precio && {
      offers: {
        '@type': 'Offer',
        priceCurrency: p.moneda || 'MXN',
        price: precio,
        availability: 'https://schema.org/InStock',
      },
    }),
    ...(p.calle && {
      address: {
        '@type': 'PostalAddress',
        streetAddress: [p.calle, p.numero].filter(Boolean).join(' '),
        addressLocality: p.municipio || '',
        addressRegion: p.estado_rep || '',
        postalCode: p.cp || '',
        addressCountry: 'MX',
      },
    }),
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${esc(ogTitle)}</title>
  <meta name="description" content="${esc(ogDesc)}"/>
  ${p.seo_keywords ? `<meta name="keywords" content="${esc(p.seo_keywords)}"/>` : ''}
  <meta name="theme-color" content="#00f0ff"/>

  <!-- Open Graph (Facebook, WhatsApp, Telegram, LinkedIn) -->
  <meta property="og:title" content="${esc(ogTitle)}"/>
  <meta property="og:description" content="${esc(ogDesc)}"/>
  <meta property="og:image" content="${esc(ogImage)}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:image:alt" content="${esc(titulo)}"/>
  <meta property="og:url" content="${esc(ogUrl)}"/>
  <meta property="og:type" content="product"/>
  <meta property="og:site_name" content="Nexus OS Inmobiliario"/>
  <meta property="og:locale" content="es_MX"/>
  ${precio ? `<meta property="product:price:amount" content="${precio}"/>
  <meta property="product:price:currency" content="${esc(p.moneda || 'MXN')}"/>` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(ogTitle)}"/>
  <meta name="twitter:description" content="${esc(ogDesc)}"/>
  <meta name="twitter:image" content="${esc(ogImage)}"/>
  <meta name="twitter:image:alt" content="${esc(titulo)}"/>

  <!-- JSON-LD Schema.org -->
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <!-- Redirige usuarios al SPA real -->
  <meta http-equiv="refresh" content="0; url=${esc(spaUrl)}"/>
  <link rel="canonical" href="${esc(ogUrl)}"/>

  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; background: #0a0e13; color: #e5e7eb; margin: 0; padding: 24px; max-width: 720px; margin: 0 auto; }
    img { max-width: 100%; border-radius: 12px; }
    .price { font-size: 28px; color: #00f0ff; font-weight: 800; margin: 12px 0; }
    .meta { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .cta { display: inline-block; background: #00f0ff; color: #000; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; margin-top: 20px; }
  </style>
</head>
<body>
  <!-- Contenido visible para crawlers y por si JS está desactivado -->
  <h1>${esc(titulo)}</h1>
  <img src="${esc(ogImage)}" alt="${esc(titulo)}" loading="eager"/>
  ${precio ? `<div class="price">${fmt$(precio)}</div>` : ''}
  ${ubic ? `<div class="meta">📍 ${esc(ubic)}</div>` : ''}
  <p class="meta">${esc(ogDesc)}</p>
  <a class="cta" href="${esc(spaUrl)}">Ver detalle completo →</a>
  <script>window.location.replace(${JSON.stringify(spaUrl)});</script>
</body>
</html>`
}

export default async function handler(req, res) {
  const id = req.query.id || req.query.slug || ''
  if (!id) {
    res.setHeader('Location', '/')
    return res.status(302).end()
  }

  // Detecta si es un slug (alfanumérico con guiones) o un UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const lookupField = isUuid ? 'id' : 'slug'

  try {
    const sb = getAdminSupabase()
    const { data: p, error } = await sb
      .from('properties')
      .select('id, slug, titulo, tipo, operacion, precio_venta, precio_renta, moneda, descripcion, fotos, calle, numero, municipio, estado_rep, cp, recamaras, banos, sup_construida, sup_terreno, estacionamientos, seo_title, seo_description, seo_keywords, seo_image_url, deleted_at')
      .eq(lookupField, id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !p) {
      // Fallback: redirige al SPA con el id por si lo encuentra
      const fallback = '/propiedad.html?id=' + encodeURIComponent(id)
      res.setHeader('Location', fallback)
      return res.status(302).end()
    }

    // Construye base URL desde headers de la request
    const proto = (req.headers['x-forwarded-proto'] || 'https')
    const host  = (req.headers['x-forwarded-host'] || req.headers.host || 'nexus-os-chi.vercel.app')
    const baseUrl = `${proto}://${host}`

    // URL del SPA real (el usuario llega ahí tras el redirect)
    const spaUrl = baseUrl + '/propiedad.html?id=' + encodeURIComponent(p.id)

    const html = renderHtml(p, baseUrl, spaUrl)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Cache: 5 min en CDN, 60s navegador. Suficiente para crawlers
    // pero no tanto que ediciones de SEO tarden en propagarse.
    res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60')
    return res.status(200).send(html)
  } catch (e) {
    console.error('[propiedad og]', e)
    // En caso de error, redirige al SPA
    const fallback = '/propiedad.html?id=' + encodeURIComponent(id)
    res.setHeader('Location', fallback)
    return res.status(302).end()
  }
}
