// api/generate-report.js
//
// Orquesta el flujo completo de generación de un Reporte geomarketing:
//   1) Resuelve datos del inmueble desde Supabase (service_role).
//   2) Llama internamente a /api/property-context si hay lat/lng.
//   3) Compone el prompt (lib/report-prompt) y llama a Gemini 1.5 Flash.
//   4) Guarda el HTML resultante en property_reports y devuelve el id.
//
// POST /api/generate-report
// Body: { property_id, presenter_node_id?, presenter_data?, proposito? }
// Resp: { report_id, generated_at } | { error }

import { createClient } from '@supabase/supabase-js'
import { buildReportPrompt, getProposito } from './_lib/report-prompt.js'

const GEMINI_MODEL = 'gemini-1.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXUS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars no configuradas en Vercel')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function fetchContext(lat, lng, baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/api/property-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, radius: 1500 }),
    })
    if (!r.ok) throw new Error('property-context ' + r.status)
    return await r.json()
  } catch (e) {
    console.warn('[generate-report] context fail', e.message)
    return null
  }
}

function stripFences(text) {
  if (!text) return text
  return text
    .replace(/^\s*```html\s*/i, '')
    .replace(/^\s*```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY no configurado')
  const r = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 8192,
        topP: 0.95,
      },
    }),
  })
  if (!r.ok) {
    const detail = await r.text()
    throw new Error(`Gemini ${r.status}: ${detail.slice(0, 400)}`)
  }
  const data = await r.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Respuesta vacía de Gemini')
  return stripFences(text)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { property_id, presenter_node_id, presenter_data, proposito } = req.body || {}
    if (!property_id) {
      res.status(400).json({ error: 'property_id requerido' })
      return
    }

    const supabase = getSupabase()

    // 1) Propiedad
    const { data: property, error: errP } = await supabase
      .from('properties')
      .select('*')
      .eq('id', property_id)
      .single()
    if (errP || !property) {
      res.status(404).json({ error: 'Inmueble no encontrado' })
      return
    }

    // 2) Presentador (si vino node id) → snapshot
    let presentador = presenter_data || null
    if (presenter_node_id && !presentador) {
      const { data: node } = await supabase
        .from('nodes')
        .select('id, content, metadata')
        .eq('id', presenter_node_id)
        .single()
      if (node) {
        const m = node.metadata || {}
        presentador = {
          nombre: m.name || node.content,
          tel:    m.phone || m.phones?.[0]?.number || null,
          email:  m.email || null,
          photo:  m.photo_url || null,
        }
      }
    }

    // 3) Contexto geomarketing (POIs + clima + ubicación)
    let contexto = null
    if (property.lat && property.lng) {
      const proto = req.headers['x-forwarded-proto'] || 'https'
      const host = req.headers['x-forwarded-host'] || req.headers.host
      const baseUrl = `${proto}://${host}`
      contexto = await fetchContext(Number(property.lat), Number(property.lng), baseUrl)
    }

    // 4) Propósito (auto si no vino)
    const finalProposito = proposito || getProposito(property)

    // 5) Prompt + Gemini
    const prompt = buildReportPrompt({ property, contexto, presentador, proposito: finalProposito })
    const html = await callGemini(prompt)

    // 6) Persistir en property_reports
    const { data: saved, error: errSave } = await supabase
      .from('property_reports')
      .insert({
        property_id,
        presenter_node_id: presenter_node_id || null,
        presenter_data: presentador,
        proposito: finalProposito,
        contexto_json: contexto,
        html_content: html,
        model: GEMINI_MODEL,
      })
      .select('id, generated_at')
      .single()
    if (errSave) throw new Error('DB insert: ' + errSave.message)

    res.status(200).json({
      report_id: saved.id,
      generated_at: saved.generated_at,
      model: GEMINI_MODEL,
    })
  } catch (e) {
    console.error('[generate-report]', e)
    res.status(500).json({ error: e.message })
  }
}
