// POST /api/lead-capture
// Recibe submissions del form en propiedad.html pública.
// Crea row en property_leads. Si el owner tiene push o email configurado,
// dispara notificación.

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env faltante')
  return createClient(url, key, { auth: { persistSession: false } })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { property_id, nombre, telefono, email, mensaje, captcha } = req.body || {}

    if (!property_id) { res.status(400).json({ error: 'property_id requerido' }); return }
    if (!nombre || !nombre.trim()) { res.status(400).json({ error: 'Nombre requerido' }); return }
    if (!telefono && !email) { res.status(400).json({ error: 'Necesitamos teléfono o email para contactarte' }); return }
    if (nombre.length > 200) { res.status(400).json({ error: 'Nombre muy largo' }); return }
    if (mensaje && mensaje.length > 2000) { res.status(400).json({ error: 'Mensaje muy largo' }); return }

    // Honey-pot anti-bot básico: captcha debe estar vacío
    if (captcha) { res.status(200).json({ ok: true, message: 'recibido' }); return }

    const sb = getSupabase()

    // Verifica que el property existe
    const { data: prop } = await sb
      .from('properties')
      .select('id, user_id, titulo, folio_interno, dueno_telefono')
      .eq('id', property_id)
      .is('deleted_at', null)
      .single()

    if (!prop) {
      res.status(404).json({ error: 'Propiedad no encontrada' })
      return
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || null
    const ua = req.headers['user-agent']?.slice(0, 200) || null

    // Rate limit ultra-simple: máx 5 leads del mismo IP por property por hora
    if (ip) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count } = await sb
        .from('property_leads')
        .select('*', { count: 'exact', head: true })
        .eq('property_id', property_id)
        .eq('ip', ip)
        .gte('created_at', hourAgo)
      if ((count || 0) >= 5) {
        res.status(429).json({ error: 'Demasiadas solicitudes — intenta más tarde' })
        return
      }
    }

    // Inserta lead
    const { data: lead, error: errIns } = await sb
      .from('property_leads')
      .insert({
        property_id,
        nombre: nombre.trim(),
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        mensaje: mensaje?.trim() || null,
        ip,
        user_agent: ua,
      })
      .select('id, created_at')
      .single()

    if (errIns) {
      console.error('[lead-capture]', errIns)
      res.status(500).json({ error: 'No pudimos guardar tu solicitud — intenta de nuevo' })
      return
    }

    // Trigger notificación push al owner (best-effort)
    try {
      const baseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`
      await fetch(`${baseUrl}/api/push-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id_override: prop.user_id,
          title: '📬 Nuevo lead — ' + (prop.titulo || prop.folio_interno || 'Inmueble'),
          body: `${nombre.trim()}${telefono ? ' · ' + telefono : ''}`,
          url: '/app.html?view=inmuebles',
        }),
      })
    } catch (e) { console.warn('[lead-capture] push', e.message) }

    res.status(200).json({
      ok: true,
      lead_id: lead.id,
      message: '¡Gracias! Te contactaremos pronto.',
    })
  } catch (e) {
    console.error('[lead-capture]', e)
    res.status(500).json({ error: e.message })
  }
}
