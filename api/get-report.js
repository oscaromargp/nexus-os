// api/get-report.js
// GET /api/get-report?id=xxx → devuelve el HTML del reporte cacheado
// (text/html plano, listo para inyectar en iframe)

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars no configuradas')
  return createClient(url, key, { auth: { persistSession: false } })
}

export default async function handler(req, res) {
  try {
    const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id')
    if (!id) {
      res.status(400).json({ error: 'id requerido' })
      return
    }
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('property_reports')
      .select('html_content, generated_at, model, property_id, proposito')
      .eq('id', id)
      .single()
    if (error || !data) {
      res.status(404).json({ error: 'Reporte no encontrado' })
      return
    }
    if (req.query?.format === 'json') {
      res.status(200).json(data)
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(data.html_content || '<p>Reporte sin contenido</p>')
  } catch (e) {
    console.error('[get-report]', e)
    res.status(500).json({ error: e.message })
  }
}
