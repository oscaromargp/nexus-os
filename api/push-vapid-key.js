// GET /api/push-vapid-key → devuelve la clave pública VAPID
// para que los clientes puedan suscribirse.

export default function handler(req, res) {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    res.status(503).json({ error: 'VAPID_PUBLIC_KEY no configurada en Vercel env' })
    return
  }
  res.status(200).json({ publicKey })
}
