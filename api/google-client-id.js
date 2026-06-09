// GET /api/google-client-id — devuelve el Client ID público de Google OAuth
// para que el cliente pueda inicializar Google Identity Services (GIS).

export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    res.status(503).json({ error: 'GOOGLE_CLIENT_ID no configurado' })
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).json({ clientId })
}
