// api/property-context.js
//
// Recolecta el contexto geomarketing de una propiedad por coordenadas:
//   - POIs cercanos (OpenStreetMap Overpass): escuelas, hospitales, supermercados,
//     gasolineras, restaurantes, parques, bancos, transporte
//   - Clima histórico mensual (Open-Meteo Archive — gratis, sin token)
//   - Reverse geocoding (Nominatim) para contexto geográfico
//
// POST /api/property-context
// Body: { lat: number, lng: number, radius?: number (m, default 1500) }
// Respuesta: { pois, clima, ubicacion, generated_at }
//
// Cero costo, todas APIs son free tier sin token. Cache en cliente y en
// property_reports.contexto_json una vez generado el reporte completo.

const POI_CATEGORIES = {
  educacion:   { tags: ['amenity=school','amenity=kindergarten','amenity=university','amenity=college'], label: 'Educación' },
  salud:       { tags: ['amenity=hospital','amenity=clinic','amenity=doctors','amenity=pharmacy'],        label: 'Salud' },
  comercio:    { tags: ['shop=supermarket','shop=convenience','shop=mall','shop=department_store'],       label: 'Comercio' },
  combustible: { tags: ['amenity=fuel'],                                                                    label: 'Combustible' },
  comida:      { tags: ['amenity=restaurant','amenity=cafe','amenity=fast_food','amenity=bar'],            label: 'Restaurantes' },
  recreacion:  { tags: ['leisure=park','leisure=playground','tourism=attraction','natural=beach'],         label: 'Recreación' },
  finanzas:    { tags: ['amenity=bank','amenity=atm'],                                                      label: 'Bancos/ATM' },
  transporte:  { tags: ['highway=bus_stop','amenity=bus_station','aeroway=aerodrome'],                     label: 'Transporte' },
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function buildOverpassQuery(lat, lng, radius) {
  // Una sola consulta combinada con todas las categorías
  const blocks = []
  for (const cat of Object.values(POI_CATEGORIES)) {
    for (const tag of cat.tags) {
      const [k, v] = tag.split('=')
      blocks.push(`node[${k}=${v}](around:${radius},${lat},${lng});`)
      blocks.push(`way[${k}=${v}](around:${radius},${lat},${lng});`)
    }
  }
  return `[out:json][timeout:25];(${blocks.join('')});out center 200;`
}

function classifyPOI(tags) {
  for (const [key, cat] of Object.entries(POI_CATEGORIES)) {
    for (const t of cat.tags) {
      const [k, v] = t.split('=')
      if (tags[k] === v) return { key, label: cat.label }
    }
  }
  return { key: 'otro', label: 'Otro' }
}

async function fetchOverpass(lat, lng, radius) {
  const query = buildOverpassQuery(lat, lng, radius)
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  })
  if (!r.ok) throw new Error('Overpass ' + r.status)
  const data = await r.json()
  const elements = data.elements || []
  const pois = []
  for (const el of elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    if (!elLat || !elLng) continue
    const tags = el.tags || {}
    const cls = classifyPOI(tags)
    if (cls.key === 'otro') continue
    pois.push({
      id: el.type + el.id,
      categoria: cls.key,
      categoria_label: cls.label,
      name: tags.name || tags['name:es'] || tags.brand || 'Sin nombre',
      lat: elLat,
      lng: elLng,
      distancia_m: Math.round(haversineMeters(lat, lng, elLat, elLng)),
      tags,
    })
  }
  // Ordenar por distancia y agrupar por categoría con top 6 por cat
  pois.sort((a, b) => a.distancia_m - b.distancia_m)
  const porCategoria = {}
  for (const k of Object.keys(POI_CATEGORIES)) porCategoria[k] = []
  for (const p of pois) {
    if (porCategoria[p.categoria].length < 6) porCategoria[p.categoria].push(p)
  }
  return { total: pois.length, por_categoria: porCategoria }
}

async function fetchClima(lat, lng) {
  // Open-Meteo Archive — promedios mensuales últimos 5 años
  const end = new Date()
  const start = new Date(end.getFullYear() - 5, 0, 1)
  const fmt = d => d.toISOString().slice(0, 10)
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${fmt(start)}&end_date=${fmt(end)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Open-Meteo ' + r.status)
  const data = await r.json()
  const daily = data.daily || {}
  const meses = Array.from({ length: 12 }, () => ({ t_max: [], t_min: [], lluvia: [] }))
  ;(daily.time || []).forEach((t, i) => {
    const m = new Date(t).getMonth()
    if (daily.temperature_2m_max?.[i] != null) meses[m].t_max.push(daily.temperature_2m_max[i])
    if (daily.temperature_2m_min?.[i] != null) meses[m].t_min.push(daily.temperature_2m_min[i])
    if (daily.precipitation_sum?.[i] != null)  meses[m].lluvia.push(daily.precipitation_sum[i])
  })
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null
  const sum = a => a.length ? a.reduce((s, x) => s + x, 0) : 0
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return meses.map((m, i) => ({
    mes: MESES[i],
    t_max_c: avg(m.t_max) != null ? Math.round(avg(m.t_max) * 10) / 10 : null,
    t_min_c: avg(m.t_min) != null ? Math.round(avg(m.t_min) * 10) / 10 : null,
    lluvia_mm: Math.round(sum(m.lluvia) / Math.max(1, m.lluvia.length / 30)),
  }))
}

async function fetchUbicacion(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es-MX&zoom=14`
  const r = await fetch(url, { headers: { 'User-Agent': 'NexusOS/1.0' } })
  if (!r.ok) return null
  const d = await r.json()
  const a = d.address || {}
  return {
    estado: a.state || null,
    municipio: a.city || a.town || a.municipality || a.county || null,
    colonia: a.suburb || a.neighbourhood || a.village || null,
    cp: a.postcode || null,
    full: d.display_name || null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { lat, lng, radius = 1500 } = req.body || {}
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'lat y lng requeridos como number' })
    return
  }
  try {
    // Ejecutamos en paralelo, capturando errores individuales para no tumbar todo
    const [poisR, climaR, ubicR] = await Promise.allSettled([
      fetchOverpass(lat, lng, radius),
      fetchClima(lat, lng),
      fetchUbicacion(lat, lng),
    ])
    res.status(200).json({
      lat, lng, radius,
      pois:      poisR.status === 'fulfilled' ? poisR.value      : { error: String(poisR.reason) },
      clima:     climaR.status === 'fulfilled' ? climaR.value    : { error: String(climaR.reason) },
      ubicacion: ubicR.status === 'fulfilled' ? ubicR.value      : null,
      generated_at: new Date().toISOString(),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
