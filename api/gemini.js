// api/gemini.js — Endpoint serverless Vercel
// Genera narrativa enriquecida de una propiedad usando Google Gemini 1.5 Flash (free tier)
//
// POST /api/gemini
// Body: { property: {...}, context?: {...} }
// Devuelve: { narrativa: string }

const GEMINI_MODEL = 'gemini-1.5-flash'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

function buildPrompt(p, ctx) {
  const tipo = (p.tipo || 'inmueble').replace('_', ' ')
  const ubic = [p.colonia, p.municipio, p.estado_rep].filter(Boolean).join(', ')
  const m2c  = p.sup_construida ? `${p.sup_construida} m² construidos` : ''
  const m2t  = p.sup_terreno    ? `${p.sup_terreno} m² de terreno`    : ''
  const recs = p.recamaras      ? `${p.recamaras} recámaras`           : ''
  const banos= p.banos          ? `${p.banos} baños`                   : ''
  const precio = p.precio_venta ? `$${Number(p.precio_venta).toLocaleString('es-MX')} ${p.moneda||'MXN'}` : ''

  const specs = [tipo, ubic, m2c, m2t, recs, banos].filter(Boolean).join(' · ')

  const amenidades = [
    p.alberca && 'alberca', p.jardin && 'jardín', p.roof_garden && 'roof garden',
    p.terraza && 'terraza', p.vigilancia && 'vigilancia 24h', p.cisterna && 'cisterna',
    p.panel_solar && 'panel solar', p.gym && 'gimnasio', p.elevador && 'elevador',
  ].filter(Boolean).join(', ')

  const servicios = [
    p.agua && 'agua', p.luz && 'luz', p.drenaje && 'drenaje',
    p.gas && 'gas', p.internet && 'internet',
  ].filter(Boolean).join(', ')

  const ctxLines = []
  if (ctx?.cercanos?.length)  ctxLines.push(`Puntos de interés cercanos: ${ctx.cercanos.join(', ')}`)
  if (ctx?.clima)             ctxLines.push(`Clima: ${ctx.clima}`)
  if (ctx?.demografia)        ctxLines.push(`Demografía de zona: ${ctx.demografia}`)

  return `Eres un copywriter inmobiliario experto en Baja California Sur, México. Escribes para Nexus OS, un CRM de un agente que vende patrimonio sólido a inversionistas.

Genera una narrativa cálida, evocativa pero honesta y profesional (NO inventes datos que no te di), entre 180-250 palabras. Sigue este flujo:

1. Apertura con la promesa de estilo de vida que ofrece la propiedad.
2. Descripción técnica natural (no como lista) entrelazada con beneficios humanos.
3. Contexto del entorno: qué le rodea, cómo se vive ahí.
4. Cierre con llamada a imaginar el patrimonio/oportunidad.

Tono: sofisticado pero accesible. Sin clichés ("imperdible", "única en su tipo"). Sin emojis. Sin precio (eso ya está aparte). En español.

DATOS DE LA PROPIEDAD:
${specs}
${precio ? 'Precio venta: ' + precio : ''}
${p.titulo ? 'Título actual: ' + p.titulo : ''}
${p.descripcion ? 'Descripción base del agente: ' + p.descripcion : ''}
${p.referencias ? 'Referencias del lugar: ' + p.referencias : ''}
${p.vista ? 'Vista: ' + p.vista : ''}
${p.orientacion ? 'Orientación: ' + p.orientacion : ''}
${amenidades ? 'Amenidades: ' + amenidades : ''}
${servicios ? 'Servicios: ' + servicios : ''}
${p.uso_suelo ? 'Uso de suelo: ' + p.uso_suelo : ''}
${p.regimen_propiedad ? 'Régimen: ' + p.regimen_propiedad : ''}
${p.estatus_obra ? 'Estatus: ' + p.estatus_obra : ''}
${ctxLines.join('\n')}

Responde SOLO con la narrativa, sin encabezados ni meta-comentarios.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    res.status(500).json({ error: 'GEMINI_API_KEY no configurado' })
    return
  }

  const { property, context } = req.body || {}
  if (!property) {
    res.status(400).json({ error: 'Falta property en el body' })
    return
  }

  try {
    const prompt = buildPrompt(property, context)

    const r = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 600,
          topP: 0.95,
        },
      }),
    })

    if (!r.ok) {
      const errBody = await r.text()
      console.error('[gemini] api error', r.status, errBody)
      res.status(502).json({ error: 'Gemini API error', status: r.status, detail: errBody.slice(0, 500) })
      return
    }

    const data = await r.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text) {
      res.status(502).json({ error: 'Respuesta vacía de Gemini', raw: data })
      return
    }

    res.status(200).json({ narrativa: text, model: GEMINI_MODEL })
  } catch (e) {
    console.error('[gemini] exception', e)
    res.status(500).json({ error: e.message })
  }
}
