/**
 * Nexus OS — PDF Inmobiliario v2.0  (Light Theme)
 * src/pdf-inmuebles.js
 *
 * Ficha técnica limpia, imprimible, para compartir con clientes.
 * Sin tema dark. Folio en rojo. Agente configurable por ficha.
 *
 * Exports:
 *   pdfFichaCaptacion(prop, emisor?)
 */

import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

// ── Paleta light ──────────────────────────────────────────────────────────────
const C = {
  sky:   [14,  165, 233],   // sky-500 — accent titulos, labels
  red:   [220, 38,  38],    // red-600 — folio identifier
  green: [22,  163, 74],    // green-600 — precio negociable
  amber: [217, 119, 6],     // amber-600 — exclusiva
  t900:  [15,  23,  42],    // slate-900 — texto principal
  t700:  [51,  65,  85],    // slate-700 — texto secundario
  t500:  [100, 116, 139],   // slate-500 — texto muted
  t400:  [148, 163, 184],   // slate-400 — texto dim
  s200:  [226, 232, 240],   // slate-200 — separadores
  s100:  [241, 245, 249],   // slate-100 — fondo sutil
  s50:   [248, 250, 252],   // slate-50  — fondo muy sutil
  white: [255, 255, 255],
}

const FONT  = 'helvetica'
const MX    = 12   // margen horizontal

// ── Catálogos ─────────────────────────────────────────────────────────────────
const TIPO_LBL = {
  casa: 'Casa', depto: 'Departamento', terreno: 'Terreno',
  lote: 'Lote', bodega: 'Bodega', local: 'Local Comercial', nave: 'Nave Industrial',
}
const OP_LBL = { venta: 'Venta', renta: 'Renta', traspaso: 'Traspaso' }

// ── Helpers internos ──────────────────────────────────────────────────────────
const _s = s => String(s ?? '')

function _fmtPrice(p) {
  if (!p.precio_venta && !p.precio_renta) return 'Precio a consultar'
  const fmt = n => '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })
  const parts = []
  if (p.precio_venta) parts.push(fmt(p.precio_venta) + (p.moneda === 'USD' ? ' USD' : ' MXN'))
  if (p.precio_renta) parts.push(fmt(p.precio_renta) + '/mes')
  return parts.join('  /  ')
}

function _fmtM2(n) {
  if (!n) return null
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' m2'
}

function _ubicacion(p) {
  return [p.calle, p.numero, p.colonia, p.municipio, p.estado_rep]
    .filter(Boolean).join(', ')
}

function _mapsUrl(p) {
  if (p.lat && p.lng)
    return `https://www.google.com/maps?q=${p.lat},${p.lng}`
  const addr = [p.calle, p.numero, p.colonia, p.municipio, p.estado_rep].filter(Boolean).join(' ')
  return addr ? `https://www.google.com/maps/search/${encodeURIComponent(addr)}` : null
}

// Construye URL de imagen estática del mapa (OSM staticmap gratis, sin token)
function _mapStaticUrl(p) {
  if (!p.lat || !p.lng) return null
  // staticmap.openstreetmap.de — gratis, sin token, marker rojo en el pin
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${p.lat},${p.lng}&zoom=15&size=600x300&markers=${p.lat},${p.lng},red-pushpin&maptype=mapnik`
}

async function _loadImg(url) {
  if (!url) return ''
  // Skip URLs that are obviously not images (video players, maps, etc.)
  if (/youtube\.com|youtu\.be|maps\.google|vimeo\.com|tiktok\.com|instagram\.com|facebook\.com|google\.com\/maps/i.test(url)) return ''
  return _loadImgRaw(url)
}

// Carga cualquier URL como dataURL (sin filtros). Útil para mapas estáticos OSM.
async function _loadImgRaw(url) {
  if (!url) return ''
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout?.(15000) })
    if (!res.ok) return ''
    const blob = await res.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch { return '' }
}

/** Intenta cada foto en orden hasta encontrar una que cargue — garantiza portada válida */
async function _loadFirstImg(fotos) {
  for (const f of (fotos || [])) {
    const url = f?.url || f?.thumb_url
    const data = await _loadImg(url)
    if (data) return data
  }
  return ''
}

function _imgFmt(dataUrl) {
  if (dataUrl.startsWith('data:image/png'))  return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return 'JPEG'
}

// ── Primitivas de dibujo ──────────────────────────────────────────────────────

/** Texto — devuelve número de líneas renderizadas */
function _t(doc, text, x, y, { size = 9, w = 'normal', color = C.t900, align = 'left', wrap } = {}) {
  doc.setFontSize(size)
  doc.setFont(FONT, w)
  doc.setTextColor(...color)
  if (Array.isArray(text)) {
    doc.text(text, x, y, { align })
    return text.length
  }
  const str = _s(text)
  if (wrap) {
    const lines = doc.splitTextToSize(str, wrap)
    doc.text(lines, x, y, { align })
    return lines.length
  }
  doc.text(str, x, y, { align })
  return 1
}

/** Línea horizontal */
function _hline(doc, x, y, x2, color = C.s200, lw = 0.2) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.line(x, y, x2, y)
}

/** Línea vertical */
function _vline(doc, x, y1, y2, color = C.s200, lw = 0.2) {
  doc.setDrawColor(...color)
  doc.setLineWidth(lw)
  doc.line(x, y1, x, y2)
}

/** Rect redondeado */
function _box(doc, x, y, w, h, fill = null, stroke = null, lw = 0.25, r = 1.5) {
  const mode = fill && stroke ? 'FD' : fill ? 'F' : stroke ? 'S' : null
  if (!mode) return
  if (fill)   doc.setFillColor(...fill)
  if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(lw) }
  doc.roundedRect(x, y, w, h, r, r, mode)
}

/** Pill badge */
function _pill(doc, text, x, y, fill = C.sky, textColor = C.white) {
  doc.setFontSize(6.5)
  doc.setFont(FONT, 'bold')
  const tw = doc.getStringUnitWidth(text) * 6.5 / doc.internal.scaleFactor + 8
  _box(doc, x, y - 4, tw, 6, fill, null, 0, 2)
  _t(doc, text, x + 4, y, { size: 6.5, w: 'bold', color: textColor })
  return tw
}

/**
 * Micro-icono vectorial dibujado con primitivas jsPDF.
 * cx/cy = centro geométrico, sz = lado del cuadro envolvente en mm.
 */
function _icoSpec(doc, type, cx, cy, sz = 3.5) {
  const r  = sz / 2
  const lw = 0.28
  doc.setFillColor(...C.sky)
  doc.setDrawColor(...C.sky)
  doc.setLineWidth(lw)

  switch (type) {
    case 'bed': {
      // Cabecero (barra izquierda)
      doc.rect(cx - r, cy - r * 0.4, r * 0.28, r * 1.3, 'F')
      // Colchón
      doc.roundedRect(cx - r * 0.62, cy + r * 0.15, r * 1.65, r * 0.7, 0.35, 0.35, 'F')
      // Almohadas blancas
      doc.setFillColor(...C.white)
      doc.roundedRect(cx - r * 0.52, cy - r * 0.05, r * 0.55, r * 0.28, 0.25, 0.25, 'F')
      doc.roundedRect(cx + r * 0.08,  cy - r * 0.05, r * 0.55, r * 0.28, 0.25, 0.25, 'F')
      doc.setFillColor(...C.sky)
      break
    }
    case 'bath': {
      // Tina redondeada
      doc.roundedRect(cx - r, cy + r * 0.1, sz, r * 0.75, r * 0.28, r * 0.28, 'F')
      // Grifo (línea vertical + barra horizontal)
      doc.rect(cx - r * 0.1, cy - r * 0.6, r * 0.2, r * 0.7, 'F')
      doc.rect(cx - r * 0.4, cy - r * 0.65, r * 0.8, r * 0.18, 'F')
      break
    }
    case 'car': {
      // Carrocería inferior
      doc.roundedRect(cx - r, cy + r * 0.1, sz, r * 0.75, r * 0.22, r * 0.22, 'F')
      // Cabina superior (más estrecha)
      doc.roundedRect(cx - r * 0.58, cy - r * 0.35, sz * 0.58, r * 0.52, r * 0.18, r * 0.18, 'F')
      // Ruedas blancas
      doc.setFillColor(...C.white)
      doc.circle(cx - r * 0.48, cy + r * 0.88, r * 0.24, 'F')
      doc.circle(cx + r * 0.48, cy + r * 0.88, r * 0.24, 'F')
      doc.setFillColor(...C.sky)
      break
    }
    case 'area': {
      // Cuadrado + cuadrícula 2×2
      doc.rect(cx - r, cy - r, sz, sz, 'S')
      doc.line(cx, cy - r, cx, cy + r)
      doc.line(cx - r, cy, cx + r, cy)
      break
    }
    case 'land': {
      // Pico principal (triángulo)
      doc.triangle(cx - r, cy + r, cx - r * 0.05, cy - r, cx + r, cy + r, 'F')
      // Pico secundario más claro (superpuesto)
      doc.setFillColor(...C.s100)
      doc.triangle(cx + r * 0.1, cy + r, cx + r * 0.65, cy - r * 0.3, cx + r, cy + r, 'F')
      doc.setFillColor(...C.sky)
      break
    }
    case 'floors': {
      // 3 fajas apiladas
      const fh  = sz * 0.23
      const gap = sz * 0.07
      for (let i = 0; i < 3; i++) {
        doc.rect(cx - r, cy - r + i * (fh + gap), sz, fh, 'F')
      }
      break
    }
    case 'calendar': {
      // Marco
      doc.setDrawColor(...C.sky)
      doc.roundedRect(cx - r, cy - r * 0.75, sz, sz, 0.45, 0.45, 'S')
      // Cabecera rellena
      doc.roundedRect(cx - r, cy - r * 0.75, sz, r * 0.58, 0.45, 0.45, 'F')
      // Puntos de días
      doc.setFillColor(...C.t500)
      const dotR  = 0.3
      const cols  = [-0.4, 0, 0.4]
      const rows  = [r * 0.12, r * 0.65]
      rows.forEach(dy => cols.forEach(dx => doc.circle(cx + dx * r, cy + dy, dotR, 'F')))
      break
    }
  }
  // Restaurar
  doc.setFillColor(...C.sky)
  doc.setDrawColor(...C.sky)
}

/**
 * Botón CTA con hipervínculo real.
 * En el PDF se puede hacer clic y abre la URL.
 */
function _cta(doc, label, url, x, y, bw, bh = 12, icon = '') {
  const fill   = url ? C.s50   : [238, 238, 238]
  const stroke = url ? C.s200  : [210, 210, 210]
  const tColor = url ? C.sky   : C.t400
  _box(doc, x, y, bw, bh, fill, stroke, 0.4, 2.5)
  // Icono grande arriba
  if (icon) _t(doc, icon, x + bw / 2, y + 4.5, { size: 10, color: tColor, align: 'center' })
  // Label abajo
  _t(doc, label, x + bw / 2, y + bh - 2.5, { size: 7, w: 'bold', color: tColor, align: 'center' })
  if (url) doc.link(x, y, bw, bh, { url })
}

/** Footer estándar (igual en todas las páginas) */
function _renderFooter(doc, emisor, pageNum, totalPages, W, H) {
  const fy = H - 10
  _hline(doc, MX, fy, W - MX, C.s200, 0.25)
  // Agente — izquierda
  const agLine = [emisor?.nombre, emisor?.tel, emisor?.email].filter(Boolean).join('  ·  ')
  if (agLine) _t(doc, agLine, MX, fy + 5, { size: 7, color: C.t500 })
  _t(doc, 'Generado con Nexus OS', MX, fy + 9, { size: 5.5, color: C.t400 })
  // Paginación — derecha
  _t(doc, `Pag. ${pageNum} / ${totalPages}`, W - MX, fy + 5, { size: 7, color: C.t400, align: 'right' })
}

// ═══════════════════════════════════════════════════════════════════════════════
// FICHA DE CAPTACIÓN v2 — Light, compacta, imprimible
// ═══════════════════════════════════════════════════════════════════════════════
export async function pdfFichaCaptacion(prop, emisor = {}) {
  if (!prop) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W   = doc.internal.pageSize.getWidth()    // 210
  const H   = doc.internal.pageSize.getHeight()   // 297
  const now = new Date()

  // Campos derivados
  const tipo   = TIPO_LBL[prop.tipo] || prop.tipo || 'Propiedad'
  const ops    = (prop.operacion || []).map(o => OP_LBL[o] || o).join(' / ')
  const precio = _fmtPrice(prop)
  const ubic   = _ubicacion(prop)
  const titulo = prop.titulo || `${tipo}${prop.colonia ? ' en ' + prop.colonia : ''}`
  const folio  = prop.folio_interno || ('FP-' + now.toISOString().slice(0, 10).replace(/-/g, ''))
  const mapUrl = _mapsUrl(prop)

  // ── Pre-cargar imágenes ───────────────────────────────────────────────────
  const fotos  = prop.fotos || []
  const [img0, img1, img2, qrUrl] = await Promise.all([
    _loadFirstImg(fotos),                                               // ← primera foto válida (salta videos/mapas)
    _loadImg(fotos[1]?.url || fotos[1]?.thumb_url),
    _loadImg(fotos[2]?.url || fotos[2]?.thumb_url),
    QRCode.toDataURL(
      `${location?.origin || 'https://nexus-os-chi.vercel.app'}/propiedad.html?id=${prop.id}`,
      { width: 80, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }
    ).catch(() => ''),
  ])

  const extraFotos = fotos.slice(1)
  // totalPages se calcula dinámicamente al final (descripción larga puede agregar páginas)
  let totalPages = extraFotos.length >= 2 ? 2 : 1

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Franja accent (2mm) ───────────────────────────────────────────────────
  doc.setFillColor(...C.sky)
  doc.rect(0, 0, W, 2, 'F')

  // ── Header: folio (rojo) + fecha — sin branding ───────────────────────────
  // Tipo + operación — sutil, izquierda
  if (ops || tipo) {
    _t(doc, [tipo.toUpperCase(), ops.toUpperCase()].filter(Boolean).join('  ·  '),
      MX, 8.5, { size: 7, w: 'normal', color: C.t400 })
  }
  // Folio en rojo — esquina derecha, prominente
  _t(doc, folio, W - MX, 8, { size: 12, w: 'bold', color: C.red, align: 'right' })
  _t(doc,
    now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
    W - MX, 12.5, { size: 7, color: C.t400, align: 'right' })

  let y = 15  // cursor Y

  // ── Sección fotos ─────────────────────────────────────────────────────────
  const hasThumbs = !!(img1 || img2)
  const thumbColW = hasThumbs ? 52 : 0
  const heroW     = W - MX * 2 - (hasThumbs ? thumbColW + 3 : 0)
  const heroH     = 66

  // Foto principal
  if (img0) {
    try { doc.addImage(img0, _imgFmt(img0), MX, y, heroW, heroH, '', 'FAST') }
    catch { _box(doc, MX, y, heroW, heroH, C.s100, C.s200) }
  } else {
    _box(doc, MX, y, heroW, heroH, C.s100, C.s200)
    _t(doc, 'Sin foto principal', MX + heroW / 2, y + heroH / 2 + 3,
      { size: 9, color: C.t400, align: 'center' })
  }

  // Badge VENTA / RENTA sobre la foto — esquina superior izquierda
  if (ops) _pill(doc, ops.toUpperCase(), MX + 4, y + 9, C.sky, C.white)

  // Columna de thumbnails
  if (hasThumbs) {
    const tx  = MX + heroW + 3
    const th1 = img1 && img2 ? Math.floor((heroH - 3) / 2) : heroH
    const th2 = heroH - th1 - 3

    if (img1) {
      try { doc.addImage(img1, _imgFmt(img1), tx, y, thumbColW, th1, '', 'FAST') }
      catch { _box(doc, tx, y, thumbColW, th1, C.s100, C.s200) }
    } else {
      _box(doc, tx, y, thumbColW, th1, C.s100, C.s200)
    }

    if (img2) {
      try { doc.addImage(img2, _imgFmt(img2), tx, y + th1 + 3, thumbColW, th2, '', 'FAST') }
      catch { _box(doc, tx, y + th1 + 3, thumbColW, th2, C.s100, C.s200) }
    }

    // Indicador "+N fotos" si hay más de 3
    if (fotos.length > 3) {
      doc.setFillColor(0, 0, 0)
      doc.setGState(doc.GState({ opacity: 0.45 }))
      doc.rect(tx, y + heroH - 9, thumbColW, 9, 'F')
      doc.setGState(doc.GState({ opacity: 1 }))
      _t(doc, `+${fotos.length - 3} fotos`, tx + thumbColW / 2, y + heroH - 3,
        { size: 6.5, w: 'bold', color: C.white, align: 'center' })
    }
  }

  y += heroH + 6

  // ── Separador sutil ───────────────────────────────────────────────────────
  _hline(doc, MX, y, W - MX, C.s200, 0.3)
  y += 5

  // ── Título + precio ───────────────────────────────────────────────────────
  // Nombre de propiedad — bold, grande
  const titleMaxW = W - MX * 2 - 72
  const titleLines = doc.splitTextToSize(_s(titulo), titleMaxW)
  _t(doc, titleLines[0], MX, y + 7, { size: 15, w: 'bold', color: C.t900 })

  // Precio — derecha, destacado
  _t(doc, precio, W - MX, y + 7, { size: 13, w: 'bold', color: C.t900, align: 'right' })
  if (prop.precio_negociable) {
    _t(doc, 'Precio negociable', W - MX, y + 12.5,
      { size: 7, color: C.green, align: 'right' })
  }

  y += 11

  // Tipo · Status
  const statusLbl = prop.status
    ? prop.status.charAt(0).toUpperCase() + prop.status.slice(1).replace(/_/g, ' ')
    : ''
  _t(doc, [tipo, statusLbl].filter(Boolean).join('  ·  '), MX, y + 4,
    { size: 8, color: C.t500 })

  y += 7

  // Dirección — sin emojis, limpia
  if (ubic) {
    const ubicStr = 'Ubicacion: ' + ubic
    const ubicLines = doc.splitTextToSize(ubicStr, W - MX * 2)
    _t(doc, ubicLines[0], MX, y + 3.5, { size: 8.5, color: C.t500 })
    y += 7
  }

  _hline(doc, MX, y + 1, W - MX, C.s200, 0.2)
  y += 6

  // ── Especificaciones — tira horizontal con micro-iconos vectoriales ──────
  const specs = [
    prop.recamaras        && { ico: 'bed',      lbl: 'Recamaras',    val: String(prop.recamaras) },
    prop.banos            && { ico: 'bath',      lbl: 'Banos',        val: String(prop.banos) },
    prop.medios_banos     && { ico: 'bath',      lbl: 'Med. Bano',    val: String(prop.medios_banos) },
    prop.estacionamientos && { ico: 'car',       lbl: 'Estac.',       val: String(prop.estacionamientos) },
    prop.pisos            && { ico: 'floors',    lbl: 'Pisos',        val: String(prop.pisos) },
    prop.sup_construida   && { ico: 'area',      lbl: 'Construida',   val: _fmtM2(prop.sup_construida) },
    prop.sup_terreno      && { ico: 'land',      lbl: 'Terreno',      val: _fmtM2(prop.sup_terreno) },
    prop.frente           && { ico: null,        lbl: 'Frente',       val: prop.frente + ' m' },
    prop.antiguedad_anios && { ico: 'calendar',  lbl: 'Antiguedad',   val: prop.antiguedad_anios + ' anos' },
    prop.amueblado        && { ico: null,        lbl: 'Amueblado',    val: 'Si' },
  ].filter(Boolean)

  if (specs.length) {
    const ROW_H   = 14
    const ROWS    = [specs.slice(0, 5), specs.slice(5, 10)].filter(r => r.length)
    const rowsUsed = ROWS.length

    ROWS.forEach((row, ri) => {
      const colW = (W - MX * 2) / row.length
      const ry   = y + ri * (ROW_H + 1)

      row.forEach((s, ci) => {
        const cx = MX + ci * colW
        // Fondo alterno muy sutil
        if (ci % 2 === 0) {
          doc.setFillColor(...C.s50)
          doc.rect(cx, ry, colW, ROW_H, 'F')
        }
        // Accent bar top
        doc.setFillColor(...C.sky)
        doc.rect(cx, ry, colW * 0.25, 0.65, 'F')
        // Micro-icono (izquierda, centrado verticalmente)
        if (s.ico) _icoSpec(doc, s.ico, cx + 5, ry + ROW_H / 2, 3.5)
        // Texto a la derecha del icono
        const tx = s.ico ? cx + 10 : cx + 3
        _t(doc, _s(s.lbl), tx, ry + 5,    { size: 5.5, color: C.t400 })
        _t(doc, _s(s.val), tx, ry + 11.5, { size: 9.5, w: 'bold', color: C.t900 })
        // Separador vertical
        if (ci < row.length - 1) _vline(doc, cx + colW, ry + 1, ry + ROW_H - 1, C.s200, 0.15)
      })
    })

    y += rowsUsed * (ROW_H + 1) + 2
    _hline(doc, MX, y, W - MX, C.s200, 0.2)
    y += 5
  }

  // ── Servicios + Amenidades — inline, sin cajas ────────────────────────────
  const servList = [
    prop.agua            && 'Agua potable',
    prop.luz             && 'Luz electrica',
    prop.drenaje         && 'Drenaje',
    prop.gas             && 'Gas LP',
    prop.gas_natural     && 'Gas natural',
    prop.gas_tanque      && 'Gas estacionario',
    prop.internet        && 'Internet',
    prop.internet_fibra  && 'Fibra optica',
    prop.cable_tv        && 'Cable TV',
    prop.seguridad_24h   && 'Seguridad 24h',
  ].filter(Boolean)

  const amenList = [
    prop.alberca          && 'Alberca',
    prop.jardin           && 'Jardin',
    prop.roof_garden      && 'Roof garden',
    prop.terraza          && 'Terraza',
    prop.asador_bbq       && 'Asador/BBQ',
    prop.bodega_ext       && 'Bodega',
    prop.cuarto_servicio  && 'Cuarto de servicio',
    prop.vigilancia       && 'Vigilancia',
    prop.cctv             && 'CCTV',
    prop.porton_electrico && 'Porton electrico',
    prop.cisterna         && 'Cisterna',
    prop.panel_solar      && 'Panel solar',
    prop.jacuzzi          && 'Jacuzzi',
    prop.gym              && 'Gimnasio',
    prop.elevador         && 'Elevador',
    prop.salon_eventos    && 'Salon de eventos',
    prop.amueblado        && 'Amueblado',
  ].filter(Boolean)

  // Render servicios/amenidades como chips visuales en una grilla
  const renderChips = (label, items, color) => {
    if (!items.length) return
    if (y + 14 > H - 22) { doc.addPage(); doc.setFillColor(...C.sky); doc.rect(0, 0, W, 2, 'F'); y = 14 }
    _t(doc, label.toUpperCase(), MX, y + 4.5, { size: 8, w: 'bold', color })
    doc.setFillColor(...color)
    doc.rect(MX, y + 6, 22, 0.7, 'F')
    y += 11
    // Layout: chips de altura 6mm con padding
    const padX = 3, padY = 2
    const chipH = 6
    let cx = MX, cy = y
    doc.setFontSize(8)
    items.forEach(item => {
      const w = doc.getTextWidth(item) + padX * 2
      if (cx + w > W - MX) { cx = MX; cy += chipH + 2 }
      if (cy + chipH > H - 22) {
        doc.addPage(); doc.setFillColor(...C.sky); doc.rect(0, 0, W, 2, 'F')
        _t(doc, label + ' (cont.)', MX, 9, { size: 7.5, color: C.t500 })
        _hline(doc, MX, 12, W - MX, C.s200, 0.2)
        cy = 16; cx = MX
      }
      // Chip fondo
      doc.setFillColor(color[0], color[1], color[2])
      doc.setDrawColor(color[0], color[1], color[2])
      doc.roundedRect(cx, cy, w, chipH, 1.5, 1.5, 'FD')
      // Texto blanco arriba
      _t(doc, item, cx + padX, cy + chipH - 1.8, { size: 8, color: [255,255,255], w: 'bold' })
      cx += w + 2
    })
    y = cy + chipH + 4
  }

  if (servList.length) renderChips('SERVICIOS', servList, [16, 138, 152])
  if (amenList.length) renderChips('AMENIDADES', amenList, [80, 102, 200])

  if (servList.length || amenList.length) {
    _hline(doc, MX, y, W - MX, C.s200, 0.2)
    y += 4
  }

  // Helper local: imprime texto largo con auto-pagebreak respetando footer
  const FOOTER_SAFE = 22
  const LINE_H = 4.8
  const printLongText = (title, text, accentColor) => {
    if (!text) return
    // Si no cabe ni el título, salta página
    if (y + 14 > H - FOOTER_SAFE) {
      doc.addPage()
      doc.setFillColor(...accentColor); doc.rect(0, 0, W, 2, 'F')
      y = 14
    }
    // Banda de título con color accent
    _t(doc, title, MX, y + 5, { size: 8.5, w: 'bold', color: accentColor })
    doc.setFillColor(...accentColor)
    doc.rect(MX, y + 6.5, 28, 0.7, 'F')
    y += 11

    const lines = doc.splitTextToSize(_s(text), W - MX * 2)
    for (let i = 0; i < lines.length; i++) {
      if (y + LINE_H > H - FOOTER_SAFE) {
        _renderFooter(doc, emisor, doc.internal.getNumberOfPages(), totalPages, W, H)
        doc.addPage()
        doc.setFillColor(...accentColor); doc.rect(0, 0, W, 2, 'F')
        _t(doc, title + ' (cont.)', MX, 9, { size: 7.5, color: C.t500 })
        _hline(doc, MX, 12, W - MX, C.s200, 0.2)
        y = 16
      }
      _t(doc, lines[i], MX, y, { size: 9, color: C.t700 })
      y += LINE_H
    }
    y += 4
  }

  // ── Descripción del agente (texto completo, auto-paginado) ───────────────
  if (prop.descripcion) {
    printLongText('DESCRIPCION', prop.descripcion, C.sky)
  }

  // ── Atributos enriquecidos ────────────────────────────────────────────────
  const atribs = [
    prop.vista          && ['Vista',       String(prop.vista)],
    prop.orientacion    && ['Orientación', String(prop.orientacion)],
    prop.estatus_obra   && ['Estatus obra', String(prop.estatus_obra).replace('_',' ')],
    prop.uso_suelo      && ['Uso suelo',   String(prop.uso_suelo)],
    prop.regimen_propiedad && ['Régimen',  String(prop.regimen_propiedad)],
    prop.topografia     && ['Topografía',  String(prop.topografia).replace('_',' ')],
    prop.clave_catastral&& ['Cat. catastral', String(prop.clave_catastral)],
    (prop.altura_libre_m && (prop.tipo==='bodega'||prop.tipo==='nave')) && ['Altura libre', prop.altura_libre_m+' m'],
    (prop.andenes_cantidad && (prop.tipo==='bodega'||prop.tipo==='nave')) && ['Andenes', String(prop.andenes_cantidad)],
    (prop.kva && (prop.tipo==='bodega'||prop.tipo==='nave')) && ['KVA', String(prop.kva)],
    (prop.aforo && (prop.tipo==='local'||prop.tipo==='oficina')) && ['Aforo', String(prop.aforo) + ' pers.'],
  ].filter(Boolean)
  if (atribs.length) {
    _t(doc, 'ATRIBUTOS', MX, y + 5, { size: 7.5, w: 'bold', color: C.sky })
    doc.setFillColor(...C.sky)
    doc.rect(MX, y + 6.2, 22, 0.6, 'F')
    y += 10
    const cols = 3
    const colW = (W - MX * 2) / cols
    atribs.forEach((a, i) => {
      const cx = MX + (i % cols) * colW
      const cy = y + Math.floor(i / cols) * 5.5
      _t(doc, a[0] + ':', cx, cy, { size: 7.5, color: C.t400 })
      _t(doc, a[1], cx + 16, cy, { size: 7.5, color: C.t700, w: 'bold' })
    })
    y += Math.ceil(atribs.length / cols) * 5.5 + 4
  }

  // Referencia
  if (prop.referencias) {
    _t(doc, 'Ref: ' + _s(prop.referencias), MX, y + 3,
      { size: 7.5, color: C.t400 })
    y += 8
  }

  // ── Thumbnail de mapa estático (OSM) ──────────────────────────────────────
  const mapStatic = _mapStaticUrl(prop)
  if (mapStatic) {
    if (y + 50 > H - 22) { doc.addPage(); doc.setFillColor(...C.sky); doc.rect(0,0,W,2,'F'); y = 14 }
    _t(doc, 'UBICACION EN MAPA', MX, y + 4.5, { size: 8, w: 'bold', color: C.sky })
    doc.setFillColor(...C.sky)
    doc.rect(MX, y + 6, 32, 0.7, 'F')
    y += 11
    try {
      const mapImg = await _loadImgRaw(mapStatic)
      if (mapImg) {
        const mapW = W - MX * 2
        const mapH = 45
        doc.addImage(mapImg, 'PNG', MX, y, mapW, mapH)
        // overlay link clicable encima del mapa
        if (mapUrl) doc.link(MX, y, mapW, mapH, { url: mapUrl })
        y += mapH + 3
        _t(doc, 'Click sobre el mapa para abrir en Google Maps', MX, y, { size: 6.5, color: C.t400 })
        y += 6
      }
    } catch (e) { console.warn('[pdf] map img', e) }
  }

  // ── CTAs con icono + hipervínculos — mapa primero, video al final ────────
  // Tomamos también los property_links si vienen en prop._links
  const linksArr = Array.isArray(prop._links) ? prop._links : []
  const isUrl = s => /^https?:\/\//i.test(String(s||''))
  const linkUrl = l => isUrl(l.url) ? l.url : (isUrl(l.label) ? l.label : l.url)
  const ctas = [
    mapUrl && { lbl: 'Ver en mapa', url: mapUrl, icon: 'MAPA' },
    ...linksArr.filter(l => l.tipo === 'video').map(l   => ({ lbl: 'Video',  url: linkUrl(l), icon: 'VIDEO' })),
    ...linksArr.filter(l => l.tipo === 'tour').map(l    => ({ lbl: 'Tour 360', url: linkUrl(l), icon: '360 VR' })),
    ...linksArr.filter(l => l.tipo === 'foto').map(l    => ({ lbl: 'Album',  url: linkUrl(l), icon: 'FOTOS' })),
    ...linksArr.filter(l => l.tipo === 'archivo').map(l => ({ lbl: 'Archivo', url: linkUrl(l), icon: 'DRIVE' })),
    // Legacy single fields como fallback si no hay nada en property_links
    !linksArr.length && prop.tour_url         && { lbl: 'Tour 360',     url: prop.tour_url,          icon: '360 VR' },
    !linksArr.length && prop.album_fotos_url  && { lbl: 'Galeria fotos', url: prop.album_fotos_url,  icon: 'FOTOS'  },
    !linksArr.length && prop.drive_folder_url && { lbl: 'Carpeta',      url: prop.drive_folder_url,  icon: 'DRIVE'  },
    !linksArr.length && prop.video_url        && { lbl: 'Video',        url: prop.video_url,         icon: 'VIDEO'  },
  ].filter(Boolean).filter(c => c.url).slice(0, 8)

  if (ctas.length) {
    // Asegurar espacio (CTA box mide 14mm de alto)
    if (y + 16 > H - 14) {
      doc.addPage()
      doc.setFillColor(...C.sky); doc.rect(0, 0, W, 2, 'F')
      _t(doc, 'ENLACES Y RECURSOS', MX, 9, { size: 8, w: 'bold', color: C.sky })
      _hline(doc, MX, 12, W - MX, C.s200, 0.2)
      y = 16
    }
    const gap  = 4
    const ctaW = (W - MX * 2 - gap * (ctas.length - 1)) / ctas.length
    ctas.forEach((c, i) => {
      _cta(doc, c.lbl, c.url, MX + i * (ctaW + gap), y, ctaW, 13, c.icon)
    })
    y += 17
  }

  // ── Exclusiva ─────────────────────────────────────────────────────────────
  if (prop.exclusiva && prop.exclusiva_fin) {
    _box(doc, MX, y, W - MX * 2, 10, [255, 251, 235], [252, 211, 77], 0.25, 1.5)
    doc.setFillColor(...C.amber)
    doc.rect(MX, y, 3, 10, 'F')
    _t(doc, 'EXCLUSIVA', MX + 6, y + 7, { size: 7, w: 'bold', color: C.amber })
    _t(doc,
      'Vigencia: ' + _s(prop.exclusiva_inicio || '') + ' - ' + _s(prop.exclusiva_fin) +
      '   Comision: ' + (prop.comision_pct || 5) + '%',
      MX + 30, y + 7, { size: 7.5, color: C.t500 })
    y += 15
  }

  // (footer se estampa al final de todas las páginas)

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2 — Galería completa (si hay 2+ fotos adicionales)
  // ═══════════════════════════════════════════════════════════════════════════
  if (extraFotos.length >= 2) {
    doc.addPage()

    // Franja accent
    doc.setFillColor(...C.sky)
    doc.rect(0, 0, W, 2, 'F')

    // Mini-header
    _t(doc, 'GALERIA DE FOTOS  ·  ' + _s(titulo), MX, 9, { size: 7.5, color: C.t500 })
    _t(doc, folio, W - MX, 9, { size: 9, w: 'bold', color: C.red, align: 'right' })
    _hline(doc, MX, 12, W - MX, C.s200, 0.2)

    let gy   = 16
    const COLS = 3
    const GAP  = 4
    const gW   = (W - MX * 2 - GAP * (COLS - 1)) / COLS
    const gH   = 52

    for (let i = 0; i < extraFotos.length; i++) {
      if (gy + gH > H - 22) break   // respetar zona de footer

      const col = i % COLS
      const gx  = MX + col * (gW + GAP)

      let imgData = ''
      try { imgData = await _loadImg(extraFotos[i].url || extraFotos[i].thumb_url) } catch { /* skip */ }

      if (imgData) {
        try { doc.addImage(imgData, _imgFmt(imgData), gx, gy, gW, gH, '', 'FAST') }
        catch { _box(doc, gx, gy, gW, gH, C.s100, C.s200) }
      } else {
        _box(doc, gx, gy, gW, gH, C.s100, C.s200)
      }

      // Label categoría sobre la foto
      if (extraFotos[i].categoria) {
        doc.setFillColor(0, 0, 0)
        doc.setGState(doc.GState({ opacity: 0.4 }))
        doc.rect(gx, gy + gH - 8, gW, 8, 'F')
        doc.setGState(doc.GState({ opacity: 1 }))
        _t(doc, _s(extraFotos[i].categoria).toUpperCase(),
          gx + gW / 2, gy + gH - 3, { size: 6, w: 'bold', color: C.white, align: 'center' })
      }

      // Avanzar fila al terminar la última columna
      if (col === COLS - 1) gy += gH + GAP
    }

    // QR esquina inferior derecha
    if (qrUrl) {
      try {
        const qS = 18
        doc.addImage(qrUrl, 'PNG', W - MX - qS, H - 26, qS, qS)
        _t(doc, 'Ficha online', W - MX - qS / 2, H - 6.5,
          { size: 5.5, color: C.t400, align: 'center' })
      } catch { /* skip */ }
    }

    // (footer se estampa al final)
  }

  // ── Estampar footers en TODAS las páginas con número correcto ────────────
  totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    _renderFooter(doc, emisor, p, totalPages, W, H)
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  const fname = `ficha-${_s(prop.folio_interno || prop.id).toLowerCase().replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`
  doc.save(fname)
}
