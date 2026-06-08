// api/cron-backup.js
//
// Endpoint disparado por Vercel Cron diariamente.
// Para cada usuario con Google Drive conectado, escribe el snapshot
// de sus inmuebles/finanzas/contactos en sus Google Sheets.
//
// SECURITY: solo Vercel debe llamar este endpoint. Lo protegemos con
// CRON_SECRET (variable de entorno) que Vercel inyecta automáticamente
// en el header x-vercel-cron al hacer la llamada programada.
//
// STUB: la lógica de sync a Sheets se implementa en Fase 2 cuando el
// OAuth Google esté activo. Por ahora solo registra que se llamó.

export default async function handler(req, res) {
  // Verificación: Vercel cron usa CRON_SECRET. En desarrollo permitimos sin secret.
  const isProd = process.env.VERCEL_ENV === 'production'
  if (isProd) {
    const auth = req.headers['authorization'] || ''
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
  }

  // TODO Fase 2: para cada usuario con provider_token Google guardado,
  // sincronizar inmuebles/finanzas/etc. a sus Sheets.

  res.status(200).json({
    status: 'ok',
    message: 'Cron backup ejecutado (stub — pendiente lógica Sheets Fase 2)',
    timestamp: new Date().toISOString(),
  })
}
