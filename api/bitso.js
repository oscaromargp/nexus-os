/**
 * Nexus OS — Bitso price proxy
 * Vercel Serverless Function: /api/bitso?book=btc_mxn
 *
 * Reenvía la petición a api.bitso.com evitando el bloqueo CORS del navegador.
 */
export default async function handler(req, res) {
  const { book } = req.query

  // Solo permitir books válidos (letras, números, guion bajo)
  if (!book || !/^[a-z0-9_]{3,20}$/.test(book)) {
    return res.status(400).json({ error: 'invalid book' })
  }

  try {
    const upstream = await fetch(`https://api.bitso.com/v3/ticker/?book=${book}`, {
      headers: { 'User-Agent': 'nexus-os-proxy/1.0' },
    })
    const data = await upstream.json()

    // Cache breve en edge (10 s) para no saturar Bitso
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20')
    return res.json(data)
  } catch (e) {
    return res.status(502).json({ success: false, error: 'upstream error' })
  }
}
