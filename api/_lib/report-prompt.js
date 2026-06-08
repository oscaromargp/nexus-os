// Builder del prompt para Gemini que genera el HTML del Reporte geomarketing.
// Adaptado del prompt original de la gema PardeSantos:
//  - Quitadas las instrucciones de web_search/x_keyword_search (Gemini Flash no las soporta).
//  - Datos del entorno (POIs, clima, ubicación) se inyectan ya digeridos.
//  - Branding mínimo Nexus OS (no PardeSantos).
//  - CTA del presentador en lugar de asesor genérico.

function dictPOIs(pois) {
  if (!pois?.por_categoria) return 'No disponible'
  const lines = []
  for (const [cat, arr] of Object.entries(pois.por_categoria)) {
    if (!arr.length) continue
    lines.push(`- ${cat.toUpperCase()}: ${arr.map(p => `${p.name} (${p.distancia_m}m)`).join(', ')}`)
  }
  return lines.join('\n') || 'Sin POIs detectados en radio'
}

function dictClima(clima) {
  if (!Array.isArray(clima)) return 'No disponible'
  return clima.map(m =>
    `${m.mes}: ${m.t_min_c}°-${m.t_max_c}°C, lluvia ${m.lluvia_mm}mm`
  ).join(' · ')
}

function derivarProposito(p) {
  const ops = Array.isArray(p.operacion) ? p.operacion : []
  const t = p.tipo
  const op = ops.includes('renta') ? 'renta' : (ops.includes('venta') ? 'venta' : (ops[0] || ''))
  const key = `${t}-${op}`
  const map = {
    'casa-venta':         'Residencial familiar',
    'casa-renta':         'Casa en renta',
    'departamento-venta': 'Departamento residencial',
    'departamento-renta': 'Departamento en renta',
    'terreno-venta':      'Macrolote / Inversión patrimonial',
    'terreno-renta':      'Terreno en renta',
    'lote-venta':         'Lote para desarrollo',
    'local-venta':        'Local comercial (venta)',
    'local-renta':        'Local comercial en renta',
    'oficina-renta':      'Oficina corporativa en renta',
    'oficina-venta':      'Oficina corporativa (venta)',
    'bodega-venta':       'Bodega industrial (venta)',
    'bodega-renta':       'Bodega/almacén en renta',
    'nave-venta':         'Nave industrial',
    'nave-renta':         'Nave industrial en renta',
  }
  return map[key] || `${t || 'Inmueble'} en ${op || 'oferta'}`
}

export function getProposito(prop) {
  return derivarProposito(prop)
}

export function buildReportPrompt({ property, contexto, presentador, proposito }) {
  const p = property
  const prop = proposito || derivarProposito(p)
  const ubic = [p.colonia, p.municipio, p.estado_rep].filter(Boolean).join(', ')
  const dirCompleta = [p.calle, p.numero].filter(Boolean).join(' ')
  const precioStr = p.precio_venta
    ? `$${Number(p.precio_venta).toLocaleString('es-MX')} ${p.moneda||'MXN'}`
    : (p.precio_renta ? `$${Number(p.precio_renta).toLocaleString('es-MX')}/mes ${p.moneda||'MXN'}` : 'A consultar')

  const amen = [
    p.alberca && 'alberca', p.jardin && 'jardín', p.terraza && 'terraza',
    p.roof_garden && 'roof garden', p.jacuzzi && 'jacuzzi', p.gym && 'gimnasio',
    p.elevador && 'elevador', p.cisterna && 'cisterna', p.panel_solar && 'panel solar',
    p.vigilancia && 'vigilancia', p.seguridad_24h && 'seguridad 24h',
    p.porton_electrico && 'portón eléctrico', p.cctv && 'CCTV',
  ].filter(Boolean).join(', ')

  const serv = [
    p.agua && 'agua', p.luz && 'luz', p.drenaje && 'drenaje',
    p.gas && 'gas', p.internet && 'internet', p.internet_fibra && 'fibra óptica',
  ].filter(Boolean).join(', ')

  const presenterCta = presentador?.tel
    ? `WhatsApp del presentador: https://wa.me/${String(presentador.tel).replace(/\D/g,'')}`
    : 'Sin CTA disponible'

  return `Eres un analista de geomarketing inmobiliario. Vas a generar el HTML COMPLETO de un reporte estilo landing page para el inmueble descrito abajo.

REGLAS DE SALIDA (CRÍTICAS):
- Devuelve UN SOLO bloque HTML válido completo desde <!DOCTYPE html> hasta </html>. Sin markdown, sin \`\`\`html, sin explicaciones afuera.
- Incluye <script src="https://cdn.tailwindcss.com"></script> y <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet">.
- Define :root con --nx-cyan:#22d3ee; --nx-dark:#0a0e1f; --nx-bg:#0e1422; --nx-text:#e8f0f9; --nx-muted:#94a3b8; --nx-accent:#facc15;
- Body con fondo --nx-bg, texto --nx-text, font 'Inter', antialiased.
- Branding mínimo Nexus OS: solo footer pequeño "Reporte generado por Nexus OS · ${p.folio_interno||p.id||''}". NO logo grande, NO menciones de PardeSantos.
- Print-friendly: incluye @media print con backgrounds visibles (-webkit-print-color-adjust: exact; print-color-adjust: exact;), page-break-inside: avoid en secciones, y oculta el botón flotante de imprimir si lo agregas.
- HONESTIDAD: NUNCA inventes datos. Si un dato no está disponible, omite la sección o anota "Información estimada — validar con INEGI/Catastro".

ESTRUCTURA OBLIGATORIA del reporte (en este orden, todas las secciones que tengan datos):

1. HEADER NAV mínimo (texto "NEXUS OS" cyan, métricas rápidas: superficie, precio, ROI estimado si aplica, propósito).

2. HERO con badge de propósito ("${prop}"), H1 evocativo, descripción de la promesa de estilo de vida, grid de 3-4 métricas clave (superficie m², ubicación con coordenadas si las hay, precio).

3. FICHA TÉCNICA tabla estética con todas las specs del inmueble.

4. ENTORNO INMEDIATO — usa los POIs reales (educación, salud, comercio, recreación, etc.) listados al final del prompt. Grid de cards o tabla con nombre + distancia en metros. Agrupa por categoría. Si no hay POIs en una categoría, omítela.

5. CARACTERÍSTICAS URBANAS — vialidades, accesibilidad, infraestructura, basado en los POIs de transporte y comercio.

6. CALENDARIO ESTACIONAL — usa los datos de clima reales mes a mes (provistos abajo). Tabla T1-T4 con temperatura promedio min/max y precipitación. Si la zona es costera/turística mencionalo.

7. ATRIBUTOS CLAVE — vista, orientación, régimen de propiedad, uso de suelo, estatus de obra, topografía si aplica.

8. ANÁLISIS ESTRATÉGICO — PESTEL (Político/Económico/Social/Tecnológico/Ecológico/Legal) + FODA (Fortalezas/Oportunidades/Debilidades/Amenazas) basados ÚNICAMENTE en los datos del inmueble y su entorno provisto. No inventes leyes ni cifras nacionales.

9. PERFIL DEL COMPRADOR objetivo basado en propósito + datos del inmueble (lujo / inversión / familiar / etc.).

10. ESTILO DE VIDA Y ENTORNO — describe la vida en la zona usando los POIs y clima. Sin inventar flora/fauna/biodiversidad específica; si la ubicación es Baja California Sur puedes mencionar el contexto general conocido del estado.

11. CTA FINAL con frase inspiracional + botón WhatsApp grande al presentador.

12. FOOTER mínimo Nexus OS.

DATOS DE LA PROPIEDAD:
- Tipo: ${p.tipo}
- Operación: ${(p.operacion||[]).join(', ')}
- Propósito derivado: ${prop}
- Título: ${p.titulo || '(sin título)'}
- Folio: ${p.folio_interno || p.id || '—'}
- Ubicación: ${dirCompleta ? dirCompleta + ', ' : ''}${ubic || 'Sin ubicación'}
- Coordenadas: ${p.lat ? p.lat + ', ' + p.lng : 'No registradas'}
- Referencias: ${p.referencias || '—'}
- Precio: ${precioStr}${p.precio_negociable ? ' (negociable)' : ''}
- Tipo de precio: ${p.price_type || 'total'}
- Mantenimiento mensual: ${p.expenses ? '$' + p.expenses.toLocaleString('es-MX') : 'No aplica'}
- Sup. terreno: ${p.sup_terreno || '—'} m²
- Sup. construida: ${p.sup_construida || '—'} m²
- Frente x fondo: ${p.frente || '—'} x ${p.fondo || '—'} m
- Recámaras: ${p.recamaras || '—'} · Baños: ${p.banos || '—'} · ½ baños: ${p.medios_banos || '—'}
- Estacionamientos: ${p.estacionamientos || '—'} · Pisos: ${p.pisos || '—'} · Antigüedad: ${p.antiguedad_anios || '—'} años
- Vista: ${p.vista || '—'} · Orientación: ${p.orientacion || '—'}
- Estatus obra: ${p.estatus_obra || '—'} · Uso suelo: ${p.uso_suelo || '—'}
- Régimen propiedad: ${p.regimen_propiedad || '—'} · Topografía: ${p.topografia || '—'}
- Clave catastral: ${p.clave_catastral || '—'}
- Servicios: ${serv || 'No registrados'}
- Amenidades: ${amen || 'No registradas'}
${p.tipo === 'bodega' || p.tipo === 'nave' ? `- Industrial: altura libre ${p.altura_libre_m||'—'}m, andenes ${p.andenes_cantidad||'—'} (${p.andenes_tipo||'—'}), KVA ${p.kva||'—'}, trifásica: ${p.trifasica?'sí':'no'}, patio ${p.patio_maniobras_m2||'—'}m², piso ${p.resistencia_piso||'—'}` : ''}
${p.tipo === 'local' || p.tipo === 'oficina' ? `- Comercial: aforo ${p.aforo||'—'} pers., frente avenida ${p.frente_avenida_m||'—'}m, giros: ${(p.giros_permitidos||[]).join(', ')||'—'}` : ''}
- Descripción del agente: ${p.descripcion || '(sin descripción)'}

PRESENTADOR (CTA WhatsApp):
- Nombre: ${presentador?.nombre || 'Asesor Nexus OS'}
- Teléfono: ${presentador?.tel || '—'}
- Email: ${presentador?.email || '—'}
- ${presenterCta}

UBICACIÓN GEOGRÁFICA (Nominatim):
${contexto?.ubicacion ? Object.entries(contexto.ubicacion).map(([k,v])=>`- ${k}: ${v || '—'}`).join('\n') : 'No disponible'}

POIs REALES EN RADIO ${contexto?.radius || 1500}m (OpenStreetMap):
${dictPOIs(contexto?.pois)}

CLIMA HISTÓRICO MENSUAL (Open-Meteo, últimos 5 años):
${dictClima(contexto?.clima)}

RECUERDA: solo HTML válido. Empieza con <!DOCTYPE html>. Termina con </html>. Nada más.`
}
