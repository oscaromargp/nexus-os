/**
 * Nexus OS — PDF Inmobiliario v1.0
 * src/pdf-inmuebles.js
 *
 * Exports:
 *   pdfFichaCaptacion(prop, emisor?)   — Ficha técnica para cliente
 *   pdfContratoExclusiva(prop, emisor?) — Contrato exclusiva (Fase 4)
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import { NEXUS_PDF_THEME, fmt$ } from './pdf-reports.js'

const T = NEXUS_PDF_THEME

// ─── Catálogos ────────────────────────────────────────────────────────────────
const TIPO_LABELS = {
  casa:'Casa',depto:'Departamento',terreno:'Terreno',
  lote:'Lote',bodega:'Bodega',local:'Local Comercial',nave:'Nave Industrial',
}
const OP_LABELS = { venta:'Venta',renta:'Renta',traspaso:'Traspaso' }

// ─── Helpers internos ─────────────────────────────────────────────────────────
function _esc(s) { return String(s ?? '') }

function _fmtM2(n) {
  if (!n) return null
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' m²'
}

function _fmtPrice(p) {
  if (!p.precio_venta && !p.precio_renta) return 'Precio a consultar'
  const parts = []
  if (p.precio_venta) parts.push(fmt$(p.precio_venta) + (p.moneda === 'USD' ? ' USD' : ' MXN'))
  if (p.precio_renta) parts.push(fmt$(p.precio_renta) + '/mes')
  return parts.join('  ·  ')
}

function _ubicacion(p) {
  const linea1 = [p.calle, p.numero].filter(Boolean).join(' ')
  const linea2 = [p.colonia, p.municipio, p.estado_rep].filter(Boolean).join(', ')
  return [linea1, linea2].filter(Boolean).join('\n')
}

/** Carga imagen desde URL como data URL */
async function _loadImg(url) {
  if (!url) return ''
  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch { return '' }
}

function _imgFormat(dataUrl) {
  if (dataUrl.startsWith('data:image/png'))  return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return 'JPEG'
}

/** Línea cyan decorativa */
function _accentLine(doc, x, y, w) {
  doc.setFillColor(...T.cyan)
  doc.rect(x, y, w, 0.8, 'F')
}

/** Rectángulo con borde redondeado y relleno */
function _panel(doc, x, y, w, h, fill = T.surface) {
  doc.setFillColor(...fill)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')
}

/** Texto con sombra (para precio hero) */
function _heroText(doc, text, x, y, size, color) {
  doc.setFontSize(size)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...color)
  doc.text(text, x, y)
}

// ═══════════════════════════════════════════════════════════════════════════════
// FICHA DE CAPTACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
export async function pdfFichaCaptacion(prop, emisor = {}) {
  if (!prop) return

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()   // 210
  const H     = doc.internal.pageSize.getHeight()  // 297
  const mX    = T.mX   // 16
  const now   = new Date()

  // ── Pre-cargar recursos async ─────────────────────────────────────────────
  const fotos = prop.fotos || []
  const [mainImgData, qrDataUrl] = await Promise.all([
    fotos[0] ? _loadImg(fotos[0].url || fotos[0].thumb_url) : Promise.resolve(''),
    QRCode.toDataURL(
      `${location?.origin || 'https://nexus-os-chi.vercel.app'}/propiedad.html?id=${prop.id}`,
      { width: 80, margin: 1, color: { dark: '#0d1627', light: '#ffffff' } }
    ).catch(() => ''),
  ])

  const tipo     = TIPO_LABELS[prop.tipo] || prop.tipo || 'Propiedad'
  const ops      = (prop.operacion || []).map(o => OP_LABELS[o] || o).join(' / ')
  const precio   = _fmtPrice(prop)
  const ubic     = _ubicacion(prop)
  const titulo   = prop.titulo || `${tipo}${prop.colonia ? ' en ' + prop.colonia : ''}`

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1
  // ══════════════════════════════════════════════════════════════════════════

  // ── Header brand ─────────────────────────────────────────────────────────
  doc.setFillColor(...T.ink)
  doc.rect(0, 0, W, 18, 'F')
  _accentLine(doc, 0, 18, W)

  doc.setFontSize(11)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.cyan)
  doc.text('NEXUS OS', mX, 12)

  doc.setFontSize(7.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text('FICHA TÉCNICA DE PROPIEDAD', mX + 28, 12)

  // Folio + fecha
  const folio   = prop.folio_interno || ('FP-' + now.toISOString().slice(0, 10).replace(/-/g, ''))
  doc.setFontSize(7)
  doc.text(folio, W - mX, 8, { align: 'right' })
  doc.text(now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }), W - mX, 14, { align: 'right' })

  let y = 24

  // ── Foto principal ────────────────────────────────────────────────────────
  const imgH = 82
  if (mainImgData) {
    try {
      doc.addImage(mainImgData, _imgFormat(mainImgData), 0, y, W, imgH, '', 'FAST')
    } catch { /* sin imagen */ }
    // Gradiente oscuro inferior sobre la foto
    doc.setFillColor(13, 15, 31)
    doc.setGState(doc.GState({ opacity: 0.55 }))
    doc.rect(0, y + imgH - 22, W, 22, 'F')
    doc.setGState(doc.GState({ opacity: 1 }))
  } else {
    // Placeholder sin imagen
    _panel(doc, 0, y, W, imgH, [14, 20, 34])
    doc.setFontSize(32)
    doc.setTextColor(...T.textDim)
    doc.text('🏠', W / 2, y + imgH / 2 + 8, { align: 'center' })
  }

  // Badge operación sobre la foto
  if (ops) {
    doc.setFillColor(...T.cyan)
    doc.roundedRect(mX, y + 5, ops.length * 2.5 + 10, 7, 1.5, 1.5, 'F')
    doc.setFontSize(7)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.ink)
    doc.text(ops.toUpperCase(), mX + 5, y + 10.5)
  }

  // Miniaturas (máx 4) a la derecha si hay más fotos
  if (fotos.length > 1) {
    // Se cargan de forma no bloqueante — las thumbnails extras son opcionales
    const thumbW = 18
    const thumbH = 14
    const thumbsToShow = fotos.slice(1, 5)
    for (let i = 0; i < thumbsToShow.length; i++) {
      try {
        const td = await _loadImg(thumbsToShow[i].thumb_url || thumbsToShow[i].url)
        if (td) {
          doc.addImage(td, _imgFormat(td), W - mX - thumbW, y + 5 + i * (thumbH + 2), thumbW, thumbH, '', 'FAST')
        }
      } catch { /* skip */ }
    }
    // Indicador de total de fotos
    doc.setFillColor(...T.ink)
    doc.roundedRect(W - mX - thumbW, y + imgH - 10, thumbW, 8, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.cyan)
    doc.text(`+${fotos.length} fotos`, W - mX - thumbW / 2, y + imgH - 5, { align: 'center' })
  }

  y += imgH + 6

  // ── Título + precio ───────────────────────────────────────────────────────
  _panel(doc, mX, y, W - mX * 2, 28, T.surface)
  _accentLine(doc, mX, y, 18)

  doc.setFontSize(8)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text(tipo.toUpperCase() + (prop.status ? '  ·  ' + prop.status.toUpperCase() : ''), mX + 4, y + 7)

  const titleLines = doc.splitTextToSize(titulo, W - mX * 2 - 8)
  doc.setFontSize(12.5)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textMain)
  doc.text(titleLines[0], mX + 4, y + 15)

  // Precio — derecha
  _heroText(doc, precio, W - mX - 4, y + 15, 13, T.cyan)
  if (prop.precio_negociable) {
    doc.setFontSize(7)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.green)
    doc.text('Precio negociable', W - mX - 4, y + 21, { align: 'right' })
  }

  // Ubicación
  doc.setFontSize(8)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  const ubicLine = ubic.replace('\n', '  ·  ')
  doc.text('📍  ' + doc.splitTextToSize(ubicLine, W - mX * 2 - 8)[0], mX + 4, y + 24)

  y += 34

  // ── KPIs (specs) ─────────────────────────────────────────────────────────
  const specs = [
    prop.recamaras        ? { label: 'Recámaras',   val: String(prop.recamaras) }        : null,
    prop.banos            ? { label: 'Baños',        val: String(prop.banos) }            : null,
    prop.medios_banos     ? { label: 'Medios b.',    val: String(prop.medios_banos) }     : null,
    prop.estacionamientos ? { label: 'Estac.',       val: String(prop.estacionamientos) } : null,
    prop.pisos            ? { label: 'Pisos',        val: String(prop.pisos) }            : null,
    prop.sup_construida   ? { label: 'Construida',   val: _fmtM2(prop.sup_construida) }   : null,
    prop.sup_terreno      ? { label: 'Terreno',      val: _fmtM2(prop.sup_terreno) }      : null,
    prop.frente           ? { label: 'Frente',       val: prop.frente + ' m' }           : null,
    prop.antiguedad_anios ? { label: 'Antigüedad',   val: prop.antiguedad_anios + ' años'} : null,
    prop.amueblado        ? { label: 'Amueblado',    val: 'Sí' }                          : null,
  ].filter(Boolean)

  if (specs.length) {
    const cols = Math.min(specs.length, 5)
    const kW   = (W - mX * 2 - (cols - 1) * 3) / cols
    specs.slice(0, cols).forEach((s, i) => {
      const kx = mX + i * (kW + 3)
      _panel(doc, kx, y, kW, 18, T.surface)
      doc.setFillColor(...T.cyan)
      doc.rect(kx, y, 6, 0.6, 'F')
      doc.setFontSize(6.5)
      doc.setFont(T.font, 'normal')
      doc.setTextColor(...T.textMid)
      doc.text(_esc(s.label).toUpperCase(), kx + 3, y + 7)
      doc.setFontSize(10)
      doc.setFont(T.font, 'bold')
      doc.setTextColor(...T.textMain)
      doc.text(_esc(s.val), kx + 3, y + 15)
    })
    // Segunda fila si hay más de 5 specs
    if (specs.length > 5) {
      const y2   = y + 22
      const rem  = specs.slice(5)
      const cols2 = Math.min(rem.length, 5)
      const kW2  = (W - mX * 2 - (cols2 - 1) * 3) / cols2
      rem.slice(0, cols2).forEach((s, i) => {
        const kx = mX + i * (kW2 + 3)
        _panel(doc, kx, y2, kW2, 18, T.surface)
        doc.setFillColor(...T.cyan)
        doc.rect(kx, y2, 6, 0.6, 'F')
        doc.setFontSize(6.5)
        doc.setFont(T.font, 'normal')
        doc.setTextColor(...T.textMid)
        doc.text(_esc(s.label).toUpperCase(), kx + 3, y2 + 7)
        doc.setFontSize(10)
        doc.setFont(T.font, 'bold')
        doc.setTextColor(...T.textMain)
        doc.text(_esc(s.val), kx + 3, y2 + 15)
      })
      y += 22
    }
    y += 24
  }

  // ── Servicios + Amenidades ────────────────────────────────────────────────
  const servList = [
    prop.agua          && 'Agua potable',
    prop.luz           && 'Luz eléctrica',
    prop.drenaje       && 'Drenaje',
    prop.gas           && 'Gas LP',
    prop.gas_natural   && 'Gas natural',
    prop.gas_tanque    && 'Gas estacionario',
    prop.internet      && 'Internet',
    prop.internet_fibra && 'Fibra óptica',
    prop.cable_tv      && 'Cable TV',
    prop.seguridad_24h && 'Seguridad 24 h',
  ].filter(Boolean)

  const amenList = [
    prop.alberca         && 'Alberca',
    prop.jardin          && 'Jardín',
    prop.roof_garden     && 'Roof garden',
    prop.terraza         && 'Terraza',
    prop.asador_bbq      && 'Asador BBQ',
    prop.bodega_ext      && 'Bodega',
    prop.cuarto_servicio && 'Cuarto de servicio',
    prop.vigilancia      && 'Vigilancia',
    prop.cctv            && 'CCTV',
    prop.porton_electrico && 'Portón eléctrico',
    prop.cisterna        && 'Cisterna',
    prop.panel_solar     && 'Panel solar',
    prop.jacuzzi         && 'Jacuzzi',
    prop.gym             && 'Gimnasio',
    prop.elevador        && 'Elevador',
    prop.salon_eventos   && 'Salón de eventos',
    prop.area_juegos     && 'Área de juegos',
    prop.cine_privado    && 'Cine privado',
    prop.lobby           && 'Lobby',
    prop.concierge       && 'Concierge',
    prop.amueblado       && 'Amueblado',
  ].filter(Boolean)

  if (servList.length || amenList.length) {
    // Dos bloques separados para mayor legibilidad en el PDF
    const blockH = 16
    if (servList.length) {
      _panel(doc, mX, y, W - mX * 2, blockH, T.surface)
      doc.setFontSize(6.5)
      doc.setFont(T.font, 'bold')
      doc.setTextColor(...T.cyan)
      doc.text('SERVICIOS', mX + 4, y + 6)
      doc.setFont(T.font, 'normal')
      doc.setTextColor(...T.textMid)
      const sLines = doc.splitTextToSize(servList.join('  ·  '), W - mX * 2 - 8)
      doc.text(sLines[0], mX + 4, y + 12)
      y += blockH + 4
    }
    if (amenList.length) {
      // Puede ocupar hasta 2 líneas cuando hay muchas amenidades
      const aText  = amenList.join('  ·  ')
      const aLines = doc.splitTextToSize(aText, W - mX * 2 - 8)
      const aH     = aLines.length > 1 ? blockH + 5 : blockH
      _panel(doc, mX, y, W - mX * 2, aH, T.surface)
      doc.setFontSize(6.5)
      doc.setFont(T.font, 'bold')
      doc.setTextColor(...T.cyan)
      doc.text('AMENIDADES', mX + 4, y + 6)
      doc.setFont(T.font, 'normal')
      doc.setTextColor(...T.textMid)
      doc.text(aLines.slice(0, 2), mX + 4, y + 12)
      y += aH + 4
    }
  }

  // ── Descripción ───────────────────────────────────────────────────────────
  if (prop.descripcion) {
    doc.setFontSize(8.5)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.cyan)
    doc.text('DESCRIPCIÓN', mX, y + 5)
    _accentLine(doc, mX, y + 6, 22)
    doc.setLineWidth(0.15)
    doc.setDrawColor(...T.textDim)
    doc.line(mX + 24, y + 6.4, W - mX, y + 6.4)
    y += 10

    doc.setFontSize(8.5)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textInk)
    const descLines = doc.splitTextToSize(_esc(prop.descripcion), W - mX * 2)
    const maxLines  = 6
    doc.text(descLines.slice(0, maxLines), mX, y)
    y += Math.min(descLines.length, maxLines) * 4.5 + 6
  }

  // ── Referencias ───────────────────────────────────────────────────────────
  if (prop.referencias) {
    doc.setFontSize(7.5)
    doc.setFont(T.font, 'italic')
    doc.setTextColor(...T.textMid)
    doc.text('Referencia: ' + _esc(prop.referencias), mX, y)
    y += 8
  }

  // ── Exclusiva badge ───────────────────────────────────────────────────────
  if (prop.exclusiva && prop.exclusiva_fin) {
    _panel(doc, mX, y, W - mX * 2, 12, [24, 32, 50])
    doc.setFillColor(...T.cyan)
    doc.rect(mX, y, 3, 12, 'F')
    doc.setFontSize(7)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.cyan)
    doc.text('EXCLUSIVA', mX + 6, y + 5)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    doc.text(
      `Vigencia: ${_esc(prop.exclusiva_inicio || '')} → ${_esc(prop.exclusiva_fin)}  ·  Comisión: ${prop.comision_pct || 5}%`,
      mX + 30, y + 5,
    )
    y += 18
  }

  // ── Footer pág 1 ─────────────────────────────────────────────────────────
  const footerY = H - 22
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.line(mX, footerY, W - mX, footerY)

  // QR
  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl, 'PNG', W - mX - 18, footerY + 2, 16, 16) } catch { /* skip */ }
    doc.setFontSize(6)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    doc.text('Ver ficha online', W - mX - 10, footerY + 20, { align: 'center' })
  }

  // Datos agente
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.cyan)
  doc.text(emisor?.nombre || 'Agente Nexus OS', mX, footerY + 7)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  const emisorLine = [emisor?.telefono, emisor?.email].filter(Boolean).join('  ·  ')
  if (emisorLine) doc.text(emisorLine, mX, footerY + 13)
  doc.text('NEXUS OS  ·  nexus-os-chi.vercel.app  ·  ' + folio, mX, footerY + 19)

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2 — Galería completa (si hay fotos adicionales)
  // ══════════════════════════════════════════════════════════════════════════
  const extraFotos = fotos.slice(1)
  if (extraFotos.length >= 2) {
    doc.addPage()

    // Mini-header
    doc.setFillColor(...T.ink)
    doc.rect(0, 0, W, 12, 'F')
    doc.setFontSize(7.5)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.cyan)
    doc.text('NEXUS OS', mX, 8.5)
    doc.setTextColor(...T.textMid)
    doc.setFont(T.font, 'normal')
    doc.text('GALERÍA DE FOTOS  ·  ' + _esc(titulo), mX + 22, 8.5)
    doc.text(folio, W - mX, 8.5, { align: 'right' })
    _accentLine(doc, 0, 12, W)

    let gy = 18
    const gW = (W - mX * 2 - 4) / 2  // 2 columnas
    const gH = 52

    for (let i = 0; i < extraFotos.length && gy + gH < H - 16; i++) {
      try {
        const td = await _loadImg(extraFotos[i].url || extraFotos[i].thumb_url)
        if (!td) continue
        const col = i % 2
        const gx  = mX + col * (gW + 4)
        doc.addImage(td, _imgFormat(td), gx, gy, gW, gH, '', 'FAST')
        // Categoría
        if (extraFotos[i].categoria) {
          doc.setFillColor(...T.ink)
          doc.setFillColor(0, 0, 0)
          doc.setGState(doc.GState({ opacity: 0.55 }))
          doc.rect(gx, gy + gH - 8, gW, 8, 'F')
          doc.setGState(doc.GState({ opacity: 1 }))
          doc.setFontSize(6.5)
          doc.setFont(T.font, 'normal')
          doc.setTextColor(255, 255, 255)
          doc.text(_esc(extraFotos[i].categoria).toUpperCase(), gx + gW / 2, gy + gH - 3, { align: 'center' })
        }
        if (col === 1) gy += gH + 5
      } catch { /* skip */ }
    }

    // Footer pág 2
    doc.setDrawColor(...T.textDim)
    doc.setLineWidth(0.2)
    doc.line(mX, H - 10, W - mX, H - 10)
    doc.setFontSize(6.5)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    doc.text(`${T.brand} · nexus-os-chi.vercel.app · ${folio} · Pág. 2`, W / 2, H - 5, { align: 'center' })
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  const filename = `ficha-${(prop.folio_interno || prop.id).toLowerCase().replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
