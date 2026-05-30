/**
 * Nexus OS — PDF Reports Engine v2.0
 * Design System unificado: NEXUS_PDF_THEME
 *
 * Exports financieros:
 *   pdfEstadoCuenta(orq, list, kpis, tcCache, filters, emisor?)
 *   pdfDispersionOTC(data, fecha, emisor?)
 *   pdfReporteProyecto(proyecto, nodes, emisor?)
 *   pdfResumenMensual(period, allNodes, accounts, emisor?)
 *
 * Exports trámites:
 *   pdfProrroga(data, emisor?)
 *   pdfPagare(data, emisor?)
 *   pdfRecibo(data, emisor?)
 *   pdfCartaPoder(data, emisor?)
 *   pdfContratoServicios(data, emisor?)
 *   pdfNotaVenta(data, emisor?)
 *   pdfPresupuesto(data, emisor?)
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'

// ═══════════════════════════════════════════════════════════════════════════════
// NEXUS_PDF_THEME — fuente única de verdad para todos los documentos
// ═══════════════════════════════════════════════════════════════════════════════
export const NEXUS_PDF_THEME = {
  // Paleta cromática (RGB arrays)
  ink:      [5,   8,   15],     // bg-deep — header oscuro
  surface:  [14,  20,  34],     // bg-panel — cajas KPI
  panel:    [24,  32,  50],     // bg-surface — fila alternada oscura
  rowAlt:   [248, 250, 253],    // fila alternada clara (tablas light)
  cyan:     [34,  211, 238],    // accent principal #22d3ee
  white:    [255, 255, 255],
  textMain: [232, 240, 249],    // texto claro (sobre fondos oscuros)
  textMid:  [122, 136, 153],    // texto muted
  textDim:  [76,  90,  110],    // texto dim / separadores
  textInk:  [20,  30,  45],     // texto oscuro (sobre fondos claros)
  green:    [74,  222, 128],
  greenD:   [22,  163, 74],
  red:      [248, 113, 113],
  redD:     [185, 28,  28],
  yellow:   [251, 191, 36],
  blue:     [96,  165, 250],
  violet:   [167, 139, 250],
  orange:   [251, 146, 60],
  // Fuente (jsPDF built-in)
  font:     'helvetica',
  // Layout
  mX:       16,  // margen horizontal
  mY:       16,  // margen vertical
  // Identidad
  brand:    'NEXUS OS',
  url:      'nexus-os.vercel.app',
}

const T = NEXUS_PDF_THEME  // alias

// ─── Banda de proyecto ─────────────────────────────────────────────────────────

/**
 * Carga una imagen desde URL y la devuelve como data URL lista para jsPDF.
 * Devuelve '' si la URL está vacía o si ocurre cualquier error.
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function preloadCover(url) {
  if (!url || typeof url !== 'string') return ''
  try {
    const res  = await fetch(url)
    if (!res.ok) return ''
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader     = new FileReader()
      reader.onload  = () => resolve(/** @type {string} */ (reader.result))
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(blob)
    })
  } catch { return '' }
}

/**
 * Detecta el formato de imagen a partir del data URL.
 * @param {string} dataUrl
 * @returns {'PNG'|'WEBP'|'JPEG'}
 */
function _imgFormat(dataUrl) {
  if (dataUrl.startsWith('data:image/png'))  return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return 'JPEG'
}

/**
 * Dibuja la banda del proyecto en la parte superior de la página (y = 0).
 * Aparece solo cuando hay un proyecto vinculado (cover y/o nombre).
 * Diseño: fondo oscuro · thumbnail portada a la izquierda · nombre a la derecha.
 *
 * @param {jsPDF} doc
 * @param {string} [coverDataUrl]  — data URL de la portada (puede estar vacío)
 * @param {string} [proyName]      — nombre del proyecto (puede estar vacío)
 * @returns {number} altura consumida en mm (0 si no hay info de proyecto)
 */
function _projectBand(doc, coverDataUrl, proyName) {
  if (!coverDataUrl && !proyName) return 0
  const W  = doc.internal.pageSize.getWidth()
  const BH = 14                            // alto de banda en mm
  const IW = coverDataUrl ? BH : 0         // thumbnail cuadrado

  // ── Fondo oscuro ─────────────────────────────────────────────────────────
  doc.setFillColor(...T.ink)
  doc.rect(0, 0, W, BH, 'F')

  // ── Imagen portada ────────────────────────────────────────────────────────
  if (coverDataUrl) {
    try {
      doc.addImage(coverDataUrl, _imgFormat(coverDataUrl), 0, 0, IW, BH)
    } catch { /* imagen inválida — solo banda oscura */ }
    // Separador vertical cyan
    doc.setFillColor(...T.cyan)
    doc.rect(IW, 0, 0.7, BH, 'F')
  }

  // ── Texto — etiqueta + nombre del proyecto ────────────────────────────────
  const tx = IW + (IW ? 4 : T.mX)
  doc.setFontSize(6)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text('PROYECTO', tx, 5)

  if (proyName) {
    doc.setFontSize(8.5)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.textMain)
    const maxW = W - tx - T.mX - 28
    doc.text(doc.splitTextToSize(proyName, maxW)[0], tx, 10.5)
  }

  // ── Marca Nexus OS — extremo derecho ──────────────────────────────────────
  doc.setFontSize(6)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.cyan)
  doc.text(T.brand, W - T.mX, 8.5, { align: 'right' })

  // ── Línea cyan inferior ────────────────────────────────────────────────────
  doc.setFillColor(...T.cyan)
  doc.rect(0, BH - 0.5, W, 0.5, 'F')

  return BH  // offset para el header principal
}

// ─── Utilidades de formato ─────────────────────────────────────────────────────

/** Genera folio único NX-YYYYMMDD-XXXX */
function _folio() {
  const d = new Date()
  const ds = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `NX-${ds}-${Math.floor(Math.random() * 9000 + 1000)}`
}

/** Formato moneda MXN */
export function fmt$(n) {
  return '$' + Math.abs(n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

/** Número a palabras en español */
export function numToLetras(n) {
  const entero = Math.floor(Math.abs(n))
  const cents  = Math.round((Math.abs(n) - entero) * 100)
  const u = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE']
  const t = ['DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE']
  const d = ['','DIEZ','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
  const h = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
  const fn = (num) => {
    if (!num) return ''
    if (num === 100) return 'CIEN'
    if (num < 10)   return u[num]
    if (num < 20)   return t[num - 10]
    if (num < 100)  return d[Math.floor(num / 10)] + (num % 10 ? ' Y ' + u[num % 10] : '')
    return h[Math.floor(num / 100)] + (num % 100 ? ' ' + fn(num % 100) : '')
  }
  const miles = Math.floor(entero / 1000), resto = entero % 1000
  let str = miles > 0 ? (miles === 1 ? 'MIL' : fn(miles) + ' MIL') + (resto ? ' ' : '') : ''
  str += fn(resto)
  return (str || 'CERO') + ` PESOS ${String(cents).padStart(2, '0')}/100 M.N.`
}

// ─── Bloques estructurales ─────────────────────────────────────────────────────

/**
 * HEADER A — Reportes financieros
 * Barra oscura con NEXUS OS + título + folio
 * @returns {number} Y después del header
 */
function _headerReport(doc, title, subtitle, folio, opts = {}) {
  const W  = doc.internal.pageSize.getWidth()
  const po = _projectBand(doc, opts.coverDataUrl, opts.proyName)
  // Barra oscura
  doc.setFillColor(...T.ink)
  doc.rect(0, po, W, 26, 'F')
  // Línea cyan
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(1.8)
  doc.line(0, po + 26, W, po + 26)
  // NEXUS OS — izquierda
  doc.setTextColor(...T.cyan)
  doc.setFontSize(12)
  doc.setFont(T.font, 'bold')
  doc.text(T.brand, T.mX, po + 17)
  // Título — derecha arriba
  doc.setTextColor(...T.textMain)
  doc.setFontSize(9)
  doc.setFont(T.font, 'normal')
  doc.text(title.toUpperCase(), W - T.mX, po + 11, { align: 'right' })
  // Folio — derecha abajo
  if (folio) {
    doc.setTextColor(...T.textMid)
    doc.setFontSize(7)
    doc.text('Folio: ' + folio, W - T.mX, po + 18, { align: 'right' })
  }
  // Subtítulo (bajo línea cyan)
  if (subtitle) {
    doc.setTextColor(...T.textMid)
    doc.setFontSize(8)
    doc.setFont(T.font, 'normal')
    const lines = doc.splitTextToSize(subtitle, W - T.mX * 2)
    doc.text(lines, T.mX, po + 33)
    return po + 38 + (lines.length - 1) * 4
  }
  return po + 32
}

/**
 * HEADER B — Documentos legales / Trámites
 * Banda delgada (3 px cyan + 12 px oscura) + título centrado prominente
 * @returns {number} Y de inicio del cuerpo
 */
function _headerDoc(doc, docType, folio) {
  const W = doc.internal.pageSize.getWidth()
  // Barra cyan superior (decorativa)
  doc.setFillColor(...T.cyan)
  doc.rect(0, 0, W, 3, 'F')
  // Mini-header oscuro
  doc.setFillColor(...T.ink)
  doc.rect(0, 3, W, 11, 'F')
  doc.setTextColor(...T.cyan)
  doc.setFontSize(7)
  doc.setFont(T.font, 'bold')
  doc.text(T.brand + ' · ' + T.url, T.mX, 11)
  if (folio) {
    doc.setTextColor(...T.textMid)
    doc.setFontSize(7)
    doc.setFont(T.font, 'normal')
    doc.text('Folio: ' + folio, W - T.mX, 11, { align: 'right' })
  }
  return 14  // Y de inicio del cuerpo del documento
}

/**
 * FOOTER estándar — igual para todos los documentos
 */
function _footer(doc, pageNum, totalPages, emisor) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.25)
  doc.line(T.mX, H - 13, W - T.mX, H - 13)
  doc.setFontSize(7)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  const left = emisor?.nombre
    ? `${T.brand} · ${T.url} · ${emisor.nombre}${emisor.rfc ? ' · RFC: ' + emisor.rfc : ''}`
    : `${T.brand} · ${T.url}`
  doc.text(doc.splitTextToSize(left, (W / 2) - T.mX)[0], T.mX, H - 7)
  const ts = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) + ' · Pág. ' + pageNum + ' de ' + totalPages
  doc.text(ts, W - T.mX, H - 7, { align: 'right' })
}

/**
 * Título de sección — H2 con línea decorativa
 */
function _section(doc, text, y) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFontSize(9)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.cyan)
  doc.text(text.toUpperCase(), T.mX, y)
  const tw = doc.getTextWidth(text.toUpperCase())
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.4)
  doc.line(T.mX, y + 1, T.mX + tw, y + 1)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.line(T.mX + tw + 2, y + 1, W - T.mX, y + 1)
  return y + 6
}

/**
 * KPI box estándar (fondos oscuros, acento cyan en borde top)
 */
function _kpi(doc, x, y, w, h, label, value, valueColor = T.textMain) {
  doc.setFillColor(...T.surface)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')
  // Borde superior — cyan corto + dim resto
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.8)
  doc.line(x, y, x + 16, y)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.line(x + 16, y, x + w, y)
  // Label
  doc.setFontSize(6.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text(label.toUpperCase(), x + 4, y + 8)
  // Value
  doc.setFontSize(10.5)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...valueColor)
  doc.text(String(value), x + 4, y + 17)
}

/**
 * Tabla de transacciones estándar (autoTable config compartido)
 */
function _autoTable(doc, opts) {
  const base = {
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      font: 'helvetica',
      overflow: 'linebreak',
      lineColor: [220, 228, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: T.ink,
      textColor: T.textMain,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      lineColor: T.cyan,
      lineWidth: { bottom: 0.8 },
    },
    footStyles: {
      fillColor: T.surface,
      textColor: T.textMain,
      fontStyle: 'bold',
      lineColor: T.textDim,
    },
    alternateRowStyles: { fillColor: T.rowAlt },
    rowPageBreak: 'auto',
  }
  autoTable(doc, { ...base, ...opts })
}

/**
 * Caja de datos (fondo neutro, etiqueta + valor)
 */
function _dataBox(doc, x, y, w, h, label, value) {
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')
  doc.setFontSize(6.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text(label.toUpperCase(), x + 4, y + 6)
  doc.setFontSize(8)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  const lines = doc.splitTextToSize(String(value || '—'), w - 8)
  doc.text(lines[0], x + 4, y + 13)
}

/**
 * Caja destacada con monto en letras
 */
function _amountBox(doc, y, monto, montoLetras) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.5)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 22, 2, 2, 'FD')
  doc.setFontSize(14)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(fmt$(monto) + ' MXN', T.mX + 6, y + 10)
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'italic')
  doc.setTextColor(...T.textMid)
  const letLines = doc.splitTextToSize(montoLetras, W - T.mX * 2 - 12)
  doc.text(letLines, T.mX + 6, y + 17)
  return y + 26
}

/**
 * Bloque de firma (línea + nombre + rol)
 */
function _signBlock(doc, x, y, w, name, role) {
  doc.setDrawColor(...T.textInk)
  doc.setLineWidth(0.4)
  doc.line(x, y, x + w, y)
  doc.setFontSize(8)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  const nameLines = doc.splitTextToSize(name, w)
  doc.text(nameLines, x + w / 2, y + 5, { align: 'center' })
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text(role, x + w / 2, y + 10, { align: 'center' })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ESTADO DE CUENTA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Footer con QR code en la esquina inferior derecha (solo para Estado de Cuenta)
 */
function _footerWithQR(doc, pageNum, totalPages, emisor, qrDataUrl) {
  const W      = doc.internal.pageSize.getWidth()
  const H      = doc.internal.pageSize.getHeight()
  const qrSize = 14
  const qrX    = W - T.mX - qrSize
  const qrY    = H - T.mX - qrSize - 2
  const lineX2 = qrDataUrl ? qrX - 3 : W - T.mX

  if (qrDataUrl) {
    try { doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize) } catch { /* skip */ }
  }

  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.25)
  doc.line(T.mX, H - 13, lineX2, H - 13)
  doc.setFontSize(7)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  const left = emisor?.nombre
    ? `${T.brand} · ${T.url} · ${emisor.nombre}${emisor.rfc ? ' · RFC: ' + emisor.rfc : ''}`
    : `${T.brand} · ${T.url}`
  doc.text(doc.splitTextToSize(left, (W / 2) - T.mX)[0], T.mX, H - 7)
  const ts = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) + ' · Pag. ' + pageNum + ' de ' + totalPages
  doc.text(ts, lineX2, H - 7, { align: 'right' })
}

export async function pdfEstadoCuenta(orq, list, kpis, tcCache = {}, filters = {}, emisor = {}) {
  if (!list?.length) return

  // Pre-generar QR
  let qrDataUrl = ''
  try {
    qrDataUrl = await QRCode.toDataURL('https://' + T.url, {
      width: 96, margin: 1,
      color: { dark: '#0d1627', light: '#ffffff' },
    })
  } catch { /* sin QR */ }

  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W      = doc.internal.pageSize.getWidth()
  const H      = doc.internal.pageSize.getHeight()
  const now    = new Date()
  const folio  = _folio()
  const saldo  = list[0]?._balance ?? 0
  const tcUsdt = tcCache['USDT']?.price || 0

  const _pageFooter = (pageNum, total) =>
    _footerWithQR(doc, pageNum, total, emisor, qrDataUrl)

  // ── Header ───────────────────────────────────────────────────────────────────
  let y = _headerReport(doc,
    'Estado de Cuenta',
    `${orq?.nombre || 'Orquestador'} · ${filters.dateFrom || 'Inicio'} → ${filters.dateTo || 'Hoy'}`,
    folio)

  // ── Saldo principal ──────────────────────────────────────────────────────────
  const saldoColor = saldo >= 0 ? T.green : T.red
  doc.setFillColor(...T.surface)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 32, 3, 3, 'F')
  // Borde izquierdo de color según positivo/negativo
  doc.setFillColor(...saldoColor)
  doc.rect(T.mX, y, 3, 32, 'F')
  doc.setTextColor(...T.textMid)
  doc.setFontSize(7)
  doc.setFont(T.font, 'normal')
  doc.text(
    'SALDO NETO AL ' + now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
    T.mX + 8, y + 8,
  )
  doc.setTextColor(...saldoColor)
  doc.setFontSize(22)
  doc.setFont(T.font, 'bold')
  doc.text(fmt$(saldo) + ' MXN', T.mX + 8, y + 22)
  // Equivalente USDT (derecha)
  if (tcUsdt > 1) {
    const eqUsdt = (Math.abs(saldo) / tcUsdt).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    doc.setFontSize(9)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.yellow)
    doc.text('~' + eqUsdt + ' USDT', W - T.mX - 5, y + 15, { align: 'right' })
    doc.setFontSize(7)
    doc.setTextColor(...T.textMid)
    doc.text('T/C USDT: $' + tcUsdt.toFixed(2), W - T.mX - 5, y + 22, { align: 'right' })
  }
  // Saldo en letras (dentro del mismo panel)
  doc.setFontSize(7)
  doc.setFont(T.font, 'italic')
  doc.setTextColor(...T.textMid)
  const letLines = doc.splitTextToSize(numToLetras(saldo), W - T.mX * 2 - 16)
  doc.text(letLines[0], T.mX + 8, y + 29)
  y += 38

  // ── KPIs — 5 cajas con mini-iconos vectoriales ───────────────────────────────
  const uniqBancos = new Set(list.map(m => m.banco).filter(Boolean)).size
  const kGap = 3
  const kW   = (W - T.mX * 2 - kGap * 4) / 5
  _kpi(doc, T.mX,                        y, kW, 22, 'Entradas',     fmt$(kpis.entradas),  T.green)
  _kpi(doc, T.mX + (kW + kGap),          y, kW, 22, 'Salidas',      fmt$(kpis.salidas),   T.red)
  _kpi(doc, T.mX + (kW + kGap) * 2,     y, kW, 22, 'Neto periodo', fmt$(kpis.net),       kpis.net >= 0 ? T.green : T.red)
  _kpi(doc, T.mX + (kW + kGap) * 3,     y, kW, 22, 'Movimientos',  String(list.length),  T.cyan)
  _kpi(doc, T.mX + (kW + kGap) * 4,     y, kW, 22, 'Bancos',       String(uniqBancos || 0), T.violet)

  // Mini-iconos en esquina superior derecha de cada KPI
  const _kpiIco = (type, kx) => {
    const ix = kx + kW - 5.5
    const iy = y + 5
    const s  = 2.2
    switch (type) {
      case 'up':   doc.setFillColor(...T.greenD); doc.triangle(ix - s, iy + s, ix + s, iy + s, ix, iy - s, 'F'); break
      case 'down': doc.setFillColor(...T.redD);   doc.triangle(ix - s, iy - s, ix + s, iy - s, ix, iy + s, 'F'); break
      case 'dot':  doc.setFillColor(...T.cyan);   doc.circle(ix, iy, s * 0.85, 'F'); break
      case 'bank':
        doc.setFillColor(...T.violet)
        doc.roundedRect(ix - s, iy - s * 0.5, s * 2, s * 1.1, 0.3, 0.3, 'F')
        doc.setFillColor(...T.surface)
        doc.rect(ix - s * 0.6, iy - s * 0.05, s * 0.4, s * 0.7, 'F')
        doc.rect(ix + s * 0.15, iy - s * 0.05, s * 0.4, s * 0.7, 'F')
        break
    }
  }
  _kpiIco('up',   T.mX)
  _kpiIco('down', T.mX + (kW + kGap))
  _kpiIco(kpis.net >= 0 ? 'up' : 'down', T.mX + (kW + kGap) * 2)
  _kpiIco('dot',  T.mX + (kW + kGap) * 3)
  _kpiIco('bank', T.mX + (kW + kGap) * 4)
  y += 28

  // ── Tabla de movimientos — trazable (ordenante → beneficiario + banco + CLABE) ─
  _autoTable(doc, {
    startY: y,
    head: [['FECHA', '', 'ORDENANTE / BENEFICIARIO', 'CRIPTO', 'CARGO (-)', 'ABONO (+)', 'SALDO']],
    body: list.map(m => {
      const net      = m.tipo === 'entrada' && m.comision != null
        ? Math.round((m.monto_mxn ?? 0) * (1 - (m.comision || 0)) * 100) / 100
        : (m.monto_mxn ?? 0)
      const isCan    = m.estado === 'cancelado'
      const isCrypto = m.moneda !== 'MXN' && m.moneda !== 'USD'
      // Contraparte rastreable: nombre + banco + CLABE enmascarada
      const nombre      = m.tipo === 'entrada'
        ? (m.ordenante    || m.notas || 'Deposito')
        : (m.beneficiario || m.notas || 'Retiro')
      const clabeHint   = m.clabe ? '···' + String(m.clabe).slice(-4) : ''
      const bancoClabe  = [m.banco, clabeHint].filter(Boolean).join(' · ')
      const extraNote   = m.notas && m.notas !== nombre ? m.notas : ''
      const contraparte = nombre
        + (bancoClabe ? '\n' + bancoClabe : '')
        + (extraNote  ? '\n' + extraNote  : '')
      return [
        m.fecha,
        '',            // ← triángulo dibujado en didDrawCell
        contraparte,
        isCrypto && !isCan
          ? (m.cantidad || 0).toLocaleString('es-MX', { maximumFractionDigits: 6 }) + '\n' + m.moneda
          : '',
        !isCan && m.tipo === 'salida'  ? fmt$(net) : '',
        !isCan && m.tipo === 'entrada' ? fmt$(net) : '',
        isCan ? 'CANCELADO' : fmt$(m._balance),
      ]
    }),
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', textColor: T.textMid,  fontSize: 7 },
      1: { cellWidth:  8, halign: 'center' },
      2: { cellWidth: 55, fontSize: 7.5 },
      3: { cellWidth: 17, halign: 'center', textColor: T.orange,   fontSize: 6.5 },
      4: { cellWidth: 23, halign: 'right',  textColor: T.redD,     fontStyle: 'bold' },
      5: { cellWidth: 23, halign: 'right',  textColor: T.greenD,   fontStyle: 'bold' },
      6: { cellWidth: 32, halign: 'right',  fontStyle: 'bold',     fontSize: 8 },
    },
    didDrawCell: (data) => {
      // ── Triángulo direccional (col 1) ────────────────────────────────────────
      if (data.section === 'body' && data.column.index === 1) {
        const m    = list[data.row.index]
        const isEnt = m?.tipo === 'entrada'
        const cx   = data.cell.x + data.cell.width  / 2
        const cy   = data.cell.y + data.cell.height / 2
        const s    = 2.2
        doc.setFillColor(...(isEnt ? T.greenD : T.redD))
        if (isEnt) {
          doc.triangle(cx - s, cy + s * 0.85, cx + s, cy + s * 0.85, cx, cy - s * 0.85, 'F')
        } else {
          doc.triangle(cx - s, cy - s * 0.85, cx + s, cy - s * 0.85, cx, cy + s * 0.85, 'F')
        }
      }
      // ── Saldo — color según positivo / negativo (col 6) ─────────────────────
      if (data.section === 'body' && data.column.index === 6) {
        const bal = list[data.row.index]?._balance ?? 0
        data.cell.styles.textColor = bal >= 0 ? T.greenD : T.redD
      }
    },
    didDrawPage: (data) => {
      _headerReport(doc, 'Estado de Cuenta',
        `${orq?.nombre || ''} · ${filters.dateFrom || ''} → ${filters.dateTo || 'Hoy'}`, folio)
      _pageFooter(data.pageNumber, doc.internal.getNumberOfPages())
    },
  })

  // ── Top contactos por volumen (compacto) ─────────────────────────────────────
  const afterY = (doc.lastAutoTable?.finalY ?? y) + 6
  let topY = afterY

  // Nueva página si no cabe (~40mm necesarios)
  if (topY + 40 > H - 18) {
    doc.addPage()
    _headerReport(doc, 'Estado de Cuenta',
      `${orq?.nombre || ''} · ${filters.dateFrom || ''} → ${filters.dateTo || 'Hoy'}`, folio)
    topY = 42
  }

  const contactMap = {}
  list.forEach(m => {
    const nombre = m.tipo === 'entrada' ? (m.ordenante || '—') : (m.beneficiario || '—')
    if (!contactMap[nombre]) contactMap[nombre] = { ent: 0, sal: 0, count: 0 }
    if (m.tipo === 'entrada') contactMap[nombre].ent += (m.monto_mxn ?? 0)
    else                       contactMap[nombre].sal += (m.monto_mxn ?? 0)
    contactMap[nombre].count++
  })
  const top5 = Object.entries(contactMap)
    .sort((a, b) => (b[1].ent + b[1].sal) - (a[1].ent + a[1].sal))
    .slice(0, 5)

  if (top5.length) {
    topY = _section(doc, 'Contactos por Volumen', topY)

    const CTCL    = [T.cyan, T.violet, T.orange, T.greenD, T.blue]  // paleta avatar
    const maxVol  = (top5[0][1].ent + top5[0][1].sal) || 1
    const barMaxW = W - T.mX * 2 - 68          // ancho máximo de barra relativa
    const ROW_H   = 9                           // mm por fila (antes: 13)
    const AVR     = 2.6                         // radio del avatar circle

    top5.forEach(([nombre, d], i) => {
      const clr  = CTCL[i % CTCL.length]
      const rowY = topY + i * ROW_H
      const midY = rowY + ROW_H / 2

      // ── Avatar circle con inicial ──────────────────────────────────────────
      doc.setFillColor(...clr)
      doc.circle(T.mX + AVR, midY, AVR, 'F')
      doc.setFontSize(5.5)
      doc.setFont(T.font, 'bold')
      doc.setTextColor(...T.white)
      doc.text((nombre.trim()[0] || '?').toUpperCase(), T.mX + AVR, midY + 1.1, { align: 'center' })

      // ── Nombre ─────────────────────────────────────────────────────────────
      doc.setFontSize(7)
      doc.setFont(T.font, 'bold')
      doc.setTextColor(...T.textInk)
      doc.text(doc.splitTextToSize(nombre, 44)[0], T.mX + 7.5, midY + 1.1)

      // ── Conteo ─────────────────────────────────────────────────────────────
      doc.setFontSize(6)
      doc.setFont(T.font, 'normal')
      doc.setTextColor(...T.textMid)
      doc.text(d.count + ' mov.', T.mX + 55, midY + 1.1)

      // ── Entrada ────────────────────────────────────────────────────────────
      doc.setFontSize(6.5)
      doc.setTextColor(...T.greenD)
      doc.text('+' + fmt$(d.ent), T.mX + 73, midY + 1.1)

      // ── Salida ─────────────────────────────────────────────────────────────
      doc.setTextColor(...T.redD)
      doc.text('-' + fmt$(d.sal), T.mX + 110, midY + 1.1)

      // ── Barra de progreso fina con color del avatar ────────────────────────
      const pct  = (d.ent + d.sal) / maxVol
      const barY = rowY + ROW_H - 2
      doc.setFillColor(220, 228, 240)
      doc.roundedRect(T.mX + 7, barY, barMaxW, 1.4, 0.4, 0.4, 'F')
      if (pct > 0) {
        doc.setFillColor(...clr)
        doc.roundedRect(T.mX + 7, barY, barMaxW * pct, 1.4, 0.4, 0.4, 'F')
      }
    })
  }

  // ── Footer última página ─────────────────────────────────────────────────────
  _pageFooter(doc.internal.getNumberOfPages(), doc.internal.getNumberOfPages())
  doc.save(`estado-cuenta-${(orq?.nombre || 'orq').replace(/\s+/g, '-').toLowerCase()}-${now.toISOString().slice(0, 10)}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DISPERSIÓN OTC
// ═══════════════════════════════════════════════════════════════════════════════
export function pdfDispersionOTC(data, fecha = new Date(), emisor = {}) {
  if (!data?.rows?.length) return

  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()

  let y = _headerReport(doc, 'Dispersión OTC',
    `${data.orqName || ''} · ${fecha.toLocaleDateString('es-MX')} · ${data.rows.length} operaciones`,
    folio)

  // KPIs
  const kW = (W - T.mX * 2 - 9) / 4
  _kpi(doc, T.mX,            y, kW, 22, 'Total Cripto', `${(data.totals?.usdt||0).toLocaleString('es-MX',{minimumFractionDigits:2})} ${data.coin||'USDT'}`, T.yellow)
  _kpi(doc, T.mX + kW + 3,   y, kW, 22, 'Bruto MXN',   fmt$(data.totals?.bruto),   T.blue)
  _kpi(doc, T.mX + (kW+3)*2, y, kW, 22, 'Neto MXN',    fmt$(data.totals?.neto),    T.green)
  _kpi(doc, T.mX + (kW+3)*3, y, kW, 22, 'Ganancia Op.', fmt$(data.totals?.ganancia), T.cyan)
  y += 28

  _autoTable(doc, {
    startY: y,
    head: [['#', 'BENEFICIARIO', 'BANCO', 'CLABE', 'CANTIDAD', 'MONEDA', 'T/C', 'COMISIÓN', 'NETO MXN', 'COMPROBANTE']],
    body: data.rows.map((r, i) => [
      i + 1,
      r.beneficiario || '—',
      r.banco || '—',
      r.clabe ? '···' + String(r.clabe).slice(-4) : '—',
      r.cantidad?.toLocaleString('es-MX', { maximumFractionDigits: 6 }) || '—',
      r.moneda || 'USDT',
      r.tc ? '$' + r.tc.toFixed(2) : '—',
      r.comision ? (r.comision * 100).toFixed(1) + '%' : '—',
      fmt$(r.neto ?? (r.cantidad * (r.tc || 1) * (r.comision || 1))),
      r.comprobante ? '✓' : '—',
    ]),
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      3: { font: 'courier', fontSize: 7 },
      4: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
      8: { halign: 'right', fontStyle: 'bold', textColor: T.green },
      9: { halign: 'center', textColor: T.green },
    },
    foot: [['', 'TOTALES', '', '',
      `${(data.totals?.usdt||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`, '', '', '',
      fmt$(data.totals?.neto), '']],
    didDrawPage: (d) => {
      _headerReport(doc, 'Dispersión OTC', `${data.orqName||''} · ${fecha.toLocaleDateString('es-MX')}`, folio)
      _footer(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
    },
  })

  _footer(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`dispersion-otc-${fecha.toISOString().slice(0, 10)}-${folio}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REPORTE DE PROYECTO
// ═══════════════════════════════════════════════════════════════════════════════
export function pdfReporteProyecto(proyecto, nodes = [], emisor = {}) {
  if (!proyecto) return

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const now   = new Date()
  const meta  = proyecto.metadata || {}
  const folio = _folio()
  const RPTS_OPTS = { coverDataUrl: meta.cover_url || '', proyName: meta.name || proyecto.content || '' }

  let y = _headerReport(doc, 'Reporte de Proyecto',
    `${meta.name || proyecto.content} · ${now.toLocaleDateString('es-MX')}`, folio, RPTS_OPTS)

  // ── Encabezado del proyecto ──
  doc.setFillColor(...T.surface)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 32, 3, 3, 'F')
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.5)
  doc.line(T.mX, y, T.mX + 24, y)
  doc.setTextColor(...T.textMain)
  doc.setFontSize(13)
  doc.setFont(T.font, 'bold')
  doc.text(meta.name || proyecto.content || 'Proyecto', T.mX + 5, y + 11)
  if (meta.description) {
    doc.setFontSize(8)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    const desc = doc.splitTextToSize(meta.description, W - T.mX * 2 - 10)
    doc.text(desc.slice(0, 2), T.mX + 5, y + 18)
  }
  // Barra de progreso
  const progress = meta.progress ?? 0
  const barY = y + 27
  doc.setFillColor(...T.textDim)
  doc.roundedRect(T.mX + 5, barY, W - T.mX * 2 - 10, 3, 1, 1, 'F')
  if (progress > 0) {
    doc.setFillColor(...(progress >= 100 ? T.green : T.cyan))
    doc.roundedRect(T.mX + 5, barY, (W - T.mX * 2 - 10) * (progress / 100), 3, 1, 1, 'F')
  }
  doc.setFontSize(7)
  doc.setTextColor(...T.textMid)
  doc.text(`${progress}% completado`, W - T.mX - 5, barY + 2.5, { align: 'right' })
  y += 38

  // ── KPIs ──
  const expenses  = nodes.filter(n => n.type === 'expense' && n.metadata?.project_id === proyecto.id)
  const incomes   = nodes.filter(n => n.type === 'income'  && n.metadata?.project_id === proyecto.id)
  const tasks     = nodes.filter(n => n.type === 'kanban'  && n.metadata?.project_id === proyecto.id)
  const doneTasks = tasks.filter(n => n.metadata?.status === 'done').length
  const totalExp  = expenses.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalInc  = incomes.reduce((s, n)  => s + (n.metadata?.amount || 0), 0)
  const kW = (W - T.mX * 2 - 9) / 4
  _kpi(doc, T.mX,            y, kW, 22, 'Ingresos',  fmt$(totalInc), T.green)
  _kpi(doc, T.mX + kW + 3,   y, kW, 22, 'Gastos',    fmt$(totalExp), T.red)
  _kpi(doc, T.mX + (kW+3)*2, y, kW, 22, 'Resultado', fmt$(totalInc - totalExp), (totalInc-totalExp)>=0?T.green:T.red)
  _kpi(doc, T.mX + (kW+3)*3, y, kW, 22, 'Tareas', `${doneTasks}/${tasks.length}`, T.cyan)
  y += 28

  // ── Tabla de tareas ──
  if (tasks.length) {
    y = _section(doc, 'Tareas', y)
    const statusLabel = { todo: 'Pendiente', 'in-progress': 'En proceso', done: 'Completada', backlog: 'Backlog' }
    const statusColor = { todo: T.yellow, 'in-progress': T.blue, done: T.green, backlog: T.textMid }
    _autoTable(doc, {
      startY: y,
      head: [['TAREA', 'ESTADO', 'PRIORIDAD', 'FECHA']],
      body: tasks.map(t => [
        t.content || '—',
        statusLabel[t.metadata?.status] || t.metadata?.status || '—',
        t.metadata?.priority || '—',
        t.metadata?.date || t.created_at?.slice(0, 10) || '—',
      ]),
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center', textColor: T.textMid },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          data.cell.styles.textColor = statusColor[tasks[data.row.index]?.metadata?.status] || T.textMid
        }
      },
      didDrawPage: (d) => {
        _headerReport(doc, 'Reporte de Proyecto', meta.name || '', folio, RPTS_OPTS)
        _footer(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // ── Movimientos financieros ──
  if (expenses.length || incomes.length) {
    const txRows = [...incomes.map(n => ({...n, _tipo:'Ingreso'})), ...expenses.map(n => ({...n, _tipo:'Gasto'}))]
      .sort((a, b) => (a.metadata?.date||'').localeCompare(b.metadata?.date||''))
    y = _section(doc, 'Movimientos Financieros', y)
    _autoTable(doc, {
      startY: y,
      head: [['FECHA', 'CONCEPTO', 'TIPO', 'MONTO']],
      body: txRows.map(n => [
        n.metadata?.date || n.created_at?.slice(0, 10) || '—',
        n.content || n.metadata?.description || '—',
        n._tipo,
        (n._tipo === 'Ingreso' ? '+' : '−') + fmt$(n.metadata?.amount || 0),
      ]),
      columnStyles: {
        0: { cellWidth: 22, halign: 'center', textColor: T.textMid },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3)
          data.cell.styles.textColor = txRows[data.row.index]?._tipo === 'Ingreso' ? T.greenD : T.redD
      },
      didDrawPage: (d) => {
        _headerReport(doc, 'Reporte de Proyecto', meta.name || '', folio, RPTS_OPTS)
        _footer(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
  }

  _footer(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`proyecto-${(meta.name||'proyecto').replace(/\s+/g,'-').toLowerCase()}-${now.toISOString().slice(0,10)}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RESUMEN MENSUAL
// ═══════════════════════════════════════════════════════════════════════════════
export function pdfResumenMensual(period, allNodes = [], accounts = [], emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const [yr, mo] = period.split('-').map(Number)
  const monthName = new Date(yr, mo - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  let y = _headerReport(doc, 'Resumen Mensual', monthName.toUpperCase(), folio)

  const txs       = allNodes.filter(n => {
    if (n.type !== 'income' && n.type !== 'expense') return false
    return String(n.metadata?.date || n.created_at || '').slice(0, 7) === period
  })
  const incomes   = txs.filter(n => n.type === 'income')
  const expenses  = txs.filter(n => n.type === 'expense')
  const totalInc  = incomes.reduce((s, n)  => s + (n.metadata?.amount || 0), 0)
  const totalExp  = expenses.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const net       = totalInc - totalExp

  // ── Resultado del mes ──
  doc.setFillColor(...T.surface)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 26, 3, 3, 'F')
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.5)
  doc.line(T.mX, y, T.mX + 22, y)
  doc.setTextColor(...T.textMid)
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'normal')
  doc.text('RESULTADO DEL MES', T.mX + 5, y + 8)
  doc.setTextColor(...(net >= 0 ? T.green : T.red))
  doc.setFontSize(20)
  doc.setFont(T.font, 'bold')
  doc.text((net >= 0 ? '+' : '') + fmt$(net), T.mX + 5, y + 20)
  doc.setFontSize(8.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text(monthName, W - T.mX - 5, y + 20, { align: 'right' })
  y += 32

  // ── KPIs ──
  const kW = (W - T.mX * 2 - 6) / 3
  _kpi(doc, T.mX,          y, kW, 22, 'Ingresos', fmt$(totalInc), T.green)
  _kpi(doc, T.mX + kW + 3, y, kW, 22, 'Gastos',   fmt$(totalExp), T.red)
  _kpi(doc, T.mX+(kW+3)*2, y, kW, 22, 'Ahorro',   fmt$(net),      net >= 0 ? T.cyan : T.red)
  y += 28

  // ── Gastos por categoría ──
  if (expenses.length) {
    const byAcc = {}
    expenses.forEach(n => {
      const acc = accounts.find(a => a.id === (n.metadata?.account_id || ''))
      const lbl = acc?.name || n.metadata?.category || 'General'
      byAcc[lbl] = (byAcc[lbl] || 0) + (n.metadata?.amount || 0)
    })
    const sorted = Object.entries(byAcc).sort((a, b) => b[1] - a[1]).slice(0, 10)
    y = _section(doc, 'Gastos por Categoría', y)
    _autoTable(doc, {
      startY: y,
      head: [['CATEGORÍA', 'MONTO', '% DEL TOTAL']],
      body: sorted.map(([lbl, amt]) => [
        lbl, fmt$(amt),
        totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) + '%' : '—',
      ]),
      columnStyles: {
        1: { halign: 'right', textColor: T.red, fontStyle: 'bold' },
        2: { halign: 'center', textColor: T.textMid },
      },
      didDrawPage: (d) => {
        _headerReport(doc, 'Resumen Mensual', monthName.toUpperCase(), folio)
        _footer(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // ── Detalle de transacciones ──
  if (txs.length) {
    y = _section(doc, 'Detalle de Transacciones', y)
    _autoTable(doc, {
      startY: y,
      head: [['FECHA', 'CONCEPTO', 'TIPO', 'MONTO']],
      body: txs
        .sort((a, b) => (a.metadata?.date||'').localeCompare(b.metadata?.date||''))
        .map(n => [
          n.metadata?.date || n.created_at?.slice(0, 10) || '—',
          n.content || n.metadata?.description || '—',
          n.type === 'income' ? '▲ Ingreso' : '▼ Gasto',
          (n.type === 'income' ? '+' : '−') + fmt$(n.metadata?.amount || 0),
        ]),
      columnStyles: {
        0: { cellWidth: 22, halign: 'center', textColor: T.textMid },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3)
          data.cell.styles.textColor = txs[data.row.index]?.type === 'income' ? T.greenD : T.redD
      },
      didDrawPage: (d) => {
        _headerReport(doc, 'Resumen Mensual', monthName.toUpperCase(), folio)
        _footer(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
  }

  _footer(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`resumen-mensual-${period}-${folio}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRAMITES — header B (documento legal)
// Todos los trámites reciben un objeto `data` con los campos del formulario
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HEADER TRAMITE — Documentos legales mejorado
 * Línea cyan delgada + folio derecha + título centrado bold
 * @returns {number} Y = 26 (inicio del cuerpo)
 */
function _headerTramite(doc, titulo, folio, opts = {}) {
  const W  = doc.internal.pageSize.getWidth()
  const po = _projectBand(doc, opts.coverDataUrl, opts.proyName)
  // Línea cyan superior
  doc.setFillColor(...T.cyan)
  doc.rect(0, po, W, 1.5, 'F')
  // Folio alineado a la derecha
  if (folio) {
    doc.setFontSize(7.5)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    doc.text('Folio: ' + folio, W - T.mX, po + 10, { align: 'right' })
  }
  // Título del documento centrado
  doc.setFontSize(18)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(titulo, W / 2, po + 18, { align: 'center' })
  // Separador delgado
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.25)
  doc.line(T.mX, po + 22, W - T.mX, po + 22)
  return po + 26  // inicio del cuerpo
}

/**
 * FOOTER TRAMITE — con leyenda opcional centrada
 */
function _footerTramite(doc, emisor, leyenda) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.25)
  doc.line(T.mX, H - 15, W - T.mX, H - 15)
  doc.setFontSize(6.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  const left = emisor?.nombre
    ? `${emisor.nombre}${emisor.rfc ? ' · RFC: ' + emisor.rfc : ''}`
    : T.url
  doc.text(doc.splitTextToSize(left, (W / 2) - T.mX)[0], T.mX, H - 9)
  const ts = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  doc.text(ts, W - T.mX, H - 9, { align: 'right' })
  if (leyenda) {
    doc.setFontSize(6)
    doc.setFont(T.font, 'italic')
    doc.text(leyenda, W / 2, H - 9, { align: 'center' })
  }
}

/** Helper: párrafo fluido */
function _para(doc, text, y, indent = T.mX, maxW = null) {
  const W = doc.internal.pageSize.getWidth()
  const w = maxW ?? W - indent - T.mX
  const lines = doc.splitTextToSize(text, w)
  doc.text(lines, indent, y)
  return y + lines.length * 5
}

/** Párrafo con justificación simulada */
function _paraJ(doc, text, y, indent, maxW) {
  const W  = doc.internal.pageSize.getWidth()
  const w  = maxW ?? (W - (indent ?? T.mX) - T.mX)
  const ix = indent ?? T.mX
  const lines = doc.splitTextToSize(text, w)
  const lh    = doc.getFontSize() * 0.4 + 3.2
  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1 || line.trim() === ''
    if (isLast) {
      doc.text(line, ix, y + i * lh)
    } else {
      const words = line.trimEnd().split(' ')
      if (words.length <= 1) { doc.text(line, ix, y + i * lh); return }
      const textW  = doc.getTextWidth(words.join(''))
      const gap    = (w - textW) / (words.length - 1)
      let x = ix
      words.forEach((word, wi) => {
        doc.text(word, x, y + i * lh)
        x += doc.getTextWidth(word) + gap
      })
    }
  })
  return y + lines.length * lh
}

/** Borde de firma y línea de texto */
function _firma(doc, x, y, w, label) {
  doc.setDrawColor(...T.textInk)
  doc.setLineWidth(0.4)
  doc.line(x, y, x + w, y)
  doc.setFontSize(8)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  const ls = doc.splitTextToSize(label, w)
  doc.text(ls, x + w / 2, y + 5, { align: 'center' })
}

// ─── 5. PRÓRROGA DE PAGO DE RENTA ───────────────────────────────────────────
export function pdfProrroga(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  let y = _headerTramite(doc, 'SOLICITUD DE PRÓRROGA DE PAGO DE RENTA', folio, OPTS)
  y += 4

  // Lugar y fecha
  const { dia='__', mes='____________', anio='20__' } = data
  doc.setFontSize(9)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  doc.text(`${data.lugar || blank}, a ${dia} de ${mes} de ${anio}.`, W - T.mX, y, { align: 'right' })
  y += 10

  // Destinatario
  doc.setFont(T.font, 'bold')
  doc.setFontSize(9)
  doc.text('Para:', T.mX, y)
  doc.setFont(T.font, 'normal')
  y = _para(doc, `${data.arrendadorName || blank}\n${data.arrendadorCargo || 'Arrendador del inmueble'}`, y + 5, T.mX + 12)
  y += 4

  doc.setFont(T.font, 'bold')
  doc.text('Asunto:', T.mX, y)
  doc.setFont(T.font, 'normal')
  doc.text('Solicitud formal de prórroga de pago de renta', T.mX + 20, y)
  y += 10

  // Cuerpo
  doc.setFontSize(9.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  const curpStr = data.arrendatarioCurp ? `, CURP: ${data.arrendatarioCurp},` : ''
  const montoStr = data.montoRenta ? ` por la cantidad de $${parseFloat(data.montoRenta).toLocaleString('es-MX', { minimumFractionDigits: 2 })} M.N.` : ''
  const cuerpo = `Por medio del presente, yo ${data.arrendatarioName || blank}${curpStr}, con domicilio en ${data.arrendatarioDom || blank}, en calidad de arrendatario del espacio en renta${montoStr}, comparezco para solicitar respetuosamente una prórroga en el pago correspondiente al mes de ${data.mesRenta || '[mes]'} del año ${anio}.`
  y = _para(doc, cuerpo, y)
  y += 5

  doc.setFont(T.font, 'bold')
  doc.setFontSize(9)
  doc.text('Motivo de la prórroga:', T.mX, y)
  y += 5
  doc.setFont(T.font, 'normal')
  doc.setFontSize(9.5)
  y = _para(doc, data.motivo || '[Describir brevemente el motivo]', y)
  y += 5

  const comprStr = `Me comprometo a realizar el pago completo, incluyendo el importe de la renta y, en su caso, la penalización correspondiente, a más tardar el día ${data.diaPago || '__'} de ${data.mesPago || '____________'} de ${data.anioPago || '20__'}.`
  y = _para(doc, comprStr, y)
  y += 5

  y = _para(doc, 'Manifiesto que esta solicitud no exime mi responsabilidad contractual ni elimina el cobro de la multa por morosidad si aplica conforme a las condiciones establecidas.', y)
  y += 5
  y = _para(doc, 'Agradezco de antemano su comprensión y quedo a su disposición para cualquier aclaración.', y)
  y += 10

  doc.setFont(T.font, 'normal')
  doc.setFontSize(9)
  doc.text('Atentamente,', T.mX, y)
  y += 20

  _firma(doc, T.mX + 30, y, 80, `${data.arrendatarioName || blank}\nArrendatario`)

  _footerTramite(doc, emisor, 'Original para el interesado - Copia para el otorgante')
  doc.save(`prorroga-renta-${folio}.pdf`)
}

// ─── 6. PAGARÉ ───────────────────────────────────────────────────────────────
export function pdfPagare(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const monto = parseFloat(data.monto || 0)
  const moneda = data.moneda || 'MXN'
  const montoFmt   = monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const montoLetra = numToLetras(monto)
  const interesMoratorio = data.interesMoratorio || '2.5'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  let y = _headerTramite(doc, 'P A G A R É', folio, OPTS)
  y += 2

  // Subtítulo
  doc.setFontSize(8)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text('Título de crédito', W / 2, y, { align: 'center' })
  y += 6

  // Caja de monto con moneda
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.5)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 22, 2, 2, 'FD')
  doc.setFontSize(14)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(`$${montoFmt} ${moneda}`, T.mX + 6, y + 10)
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'italic')
  doc.setTextColor(...T.textMid)
  const letLines = doc.splitTextToSize(montoLetra, W - T.mX * 2 - 12)
  doc.text(letLines, T.mX + 6, y + 17)
  if (data.tc && moneda !== 'MXN') {
    doc.setFontSize(7)
    doc.text(`TC: ${data.tc}`, W - T.mX - 4, y + 10, { align: 'right' })
  }
  y += 26

  // Datos de lugar/fecha
  doc.setFontSize(9.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  const fechaLarga = data.fechaLarga || new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.text(`En ${data.lugar || blank}, a ${fechaLarga}.`, T.mX, y)
  y += 8

  // Texto legal
  const legal = `A través del presente pagaré, yo ${data.deudorName || blank} me comprometo a pagar INCONDICIONALMENTE la cantidad de $${montoFmt} (${montoLetra}) a la orden de ${data.benefName || blank}, por concepto de "${data.concepto || blank}". Dicha cantidad será liquidada el día ${data.fechaPago || blank}.`
  doc.setFontSize(9.5)
  y = _para(doc, legal, y)
  y += 4

  // MXN equivalent cuando es cripto/divisa
  if (data.montoMxn && moneda !== 'MXN') {
    doc.setFontSize(8); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
    doc.text(`≈ $${parseFloat(data.montoMxn).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN al T.C. de $${data.tc} por ${moneda}`, W / 2, y, { align: 'center' })
    y += 6
  }

  if (data.metodo) {
    doc.setFont(T.font, 'bold')
    doc.setFontSize(9)
    doc.text('Método de pago:', T.mX, y)
    doc.setFont(T.font, 'normal')
    doc.text(`${data.metodo}${data.referencia ? ' · Ref: ' + data.referencia : ''}`, T.mX + 38, y)
    y += 7
  }

  // Caja de datos de cobro del beneficiario
  if (data.benefBanco || data.benefClabe) {
    doc.setFillColor(240, 253, 250); doc.setDrawColor(...T.cyan); doc.setLineWidth(0.4)
    doc.roundedRect(T.mX, y, W - T.mX * 2, 20, 2, 2, 'FD')
    doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.cyan)
    doc.text('DATOS PARA DEPÓSITO / TRANSFERENCIA AL BENEFICIARIO', T.mX + 4, y + 6)
    doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk); doc.setFontSize(8)
    const pagoCol1 = T.mX + 4, pagoCol2 = W / 2 + 4
    if (data.benefBanco) doc.text(`Banco: ${data.benefBanco}`, pagoCol1, y + 13)
    if (data.benefClabe) { doc.setFont(T.font, 'bold'); doc.text(`CLABE / Wallet: ${data.benefClabe}`, data.benefBanco ? pagoCol2 : pagoCol1, y + 13) }
    y += 24
  }

  // Bloques de ID completos
  const idBlock = (title, name, curp, rfc, elect, pasap, tel, email, dir) => {
    const boxH = 44
    doc.setFillColor(245, 248, 252)
    doc.setDrawColor(...T.textDim)
    doc.setLineWidth(0.2)
    doc.roundedRect(T.mX, y, W - T.mX * 2, boxH, 2, 2, 'FD')
    doc.setFontSize(8)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.textInk)
    doc.text(`Datos del ${title}:`, T.mX + 4, y + 6)
    doc.setFont(T.font, 'normal')
    doc.setFontSize(7.8)
    const col1 = T.mX + 4, col2 = W / 2 + 2
    doc.text(`Nombre: ${name || blank}`, col1, y + 12)
    doc.text(`CURP: ${curp || blank}`, col1, y + 18)
    doc.text(`RFC: ${rfc || blank}`, col2, y + 18)
    doc.text(`Clave Electoral: ${elect || blank}`, col1, y + 24)
    doc.text(`Pasaporte: ${pasap || blank}`, col2, y + 24)
    if (tel || email) {
      doc.text(`Tel: ${tel || blank}`, col1, y + 30)
      doc.text(`Email: ${email || blank}`, col2, y + 30)
    }
    if (dir) {
      doc.setFontSize(7.5)
      const dLines = doc.splitTextToSize(`Dir: ${dir}`, W - T.mX * 2 - 8)
      doc.text(dLines[0], col1, y + 37)
    }
    return y + boxH + 3
  }

  y = idBlock('Beneficiario', data.benefName, data.bCurp, data.bRfc, data.bElect, data.bPasap, data.bTel, data.bEmail, data.bDir)
  y = idBlock('Emisor (Deudor)', data.deudorName, data.dCurp, data.dRfc, data.dElect, data.dPasap, data.dTel, data.dEmail, data.dDir)
  y += 2

  // Tabla de pagos en serie (si aplica)
  if (data.pagos && data.pagos.length > 0) {
    doc.setFontSize(8.5)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.textInk)
    doc.text('Tabla de pagos en serie:', T.mX, y)
    y += 3
    _autoTable(doc, {
      startY: y,
      head: [['#', 'FECHA DE PAGO', 'MONTO']],
      body: data.pagos.map((p, i) => [i + 1, p.fecha || '—', `$${parseFloat(p.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda}`]),
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 60, halign: 'center' },
        2: { halign: 'right', fontStyle: 'bold' },
      },
    })
    y = doc.lastAutoTable.finalY + 4
  }

  // Interés moratorio
  doc.setFontSize(8.5)
  doc.setFont(T.font, 'italic')
  doc.setTextColor(...T.textMid)
  y = _para(doc, `En caso de incumplimiento en el pago, este pagaré causará un interés moratorio del ${interesMoratorio}% mensual sobre el saldo insoluto, contado a partir de la fecha de vencimiento o requerimiento de pago.`, y)
  y += 8

  // Firmas
  _firma(doc, T.mX + 10,      y + 18, 70, `${data.benefName || blank}\nBeneficiario`)
  _firma(doc, W - T.mX - 80,  y + 18, 70, `${data.deudorName || blank}\nQuien suscribe`)

  _footerTramite(doc, emisor, 'Original para el beneficiario - Copia para el suscriptor')
  doc.save(`pagare-${folio}.pdf`)
}

// ─── 7. RECIBO DE DINERO ─────────────────────────────────────────────────────
export function pdfRecibo(data, emisor = {}) {
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W      = doc.internal.pageSize.getWidth()
  const folio  = _folio()
  const blank  = '________________________'
  const monto  = parseFloat(data.monto || 0)
  const moneda = data.moneda || 'MXN'
  const tc     = parseFloat(data.tc || 0)
  const montoMxn = data.montoMxn ? parseFloat(data.montoMxn) : (moneda !== 'MXN' && tc > 0 ? monto * tc : null)

  // Texto canónico del monto según regla oficial mexicana
  const _fmtMxn = n => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${numToLetras(n)} MONEDA NACIONAL)`
  let montoTexto = ''
  if (moneda === 'MXN') {
    montoTexto = _fmtMxn(monto)
  } else if (montoMxn) {
    montoTexto = `${_fmtMxn(montoMxn)}, calculado con base en una referencia comercial equivalente a ${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda} a un tipo de cambio acordado de $${tc.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
  } else {
    montoTexto = `$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda} (${numToLetras(monto)})`
  }

  // ID helpers — solo mostrar si tienen valor
  const _idParts = m => [
    m.rfc   ? `RFC: ${m.rfc}`   : '',
    m.curp  ? `CURP: ${m.curp}` : '',
    m.elect ? `C.Elect.: ${m.elect}` : '',
    m.dom   ? `Dom.: ${m.dom}`  : '',
  ].filter(Boolean).join(' · ')
  const OPTS = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  let y = _headerTramite(doc, 'RECIBO DE DINERO', folio, OPTS)
  y += 4

  // Lugar y fecha — alineado a la derecha
  doc.setFontSize(9.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk)
  doc.text(`En ${data.lugar || blank}, a ${data.fecha || blank}.`, W - T.mX, y, { align: 'right' })
  y += 10

  // Cuerpo — quién entrega
  const entIdParts = _idParts({ rfc: data.entreganteRfc, curp: data.entreganteCurp, elect: data.entreganteElect, dom: data.entreganteDom })
  const cuerpo = `Por medio del presente instrumento, hago constar que he recibido de: ${data.entreganteName || blank}${entIdParts ? ', '+entIdParts : ''}, la cantidad de:`
  y = _paraJ(doc, cuerpo, y)
  y += 3

  // Caja de monto — regla oficial MXN
  const montoBoxH = montoMxn && moneda !== 'MXN' ? 30 : 22
  doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.cyan); doc.setLineWidth(0.5)
  doc.roundedRect(T.mX, y, W - T.mX * 2, montoBoxH, 2, 2, 'FD')
  doc.setFontSize(13); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  const montoDisplay = moneda === 'MXN'
    ? `$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
    : `$${(montoMxn || monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
  doc.text(montoDisplay, T.mX + 6, y + 9)
  doc.setFontSize(7); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
  const letraLine = moneda === 'MXN'
    ? `(${numToLetras(monto)} MONEDA NACIONAL)`
    : `(${numToLetras(montoMxn || monto)} MONEDA NACIONAL)`
  doc.text(doc.splitTextToSize(letraLine, W - T.mX * 2 - 12), T.mX + 6, y + 15)
  if (montoMxn && moneda !== 'MXN') {
    doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text(`Referencia: ${monto.toLocaleString('es-MX',{minimumFractionDigits:2})} ${moneda} × T.C. acordado $${tc.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN`, T.mX + 6, y + 22)
  }
  y += montoBoxH + 4

  const concepto = `Por concepto de: ${data.concepto || blank}.`
  y = _paraJ(doc, concepto, y)
  y += 4

  if (data.via) {
    doc.setFontSize(9); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('Forma de pago:', T.mX, y)
    doc.setFont(T.font, 'normal')
    y = _para(doc, data.via, y, T.mX + 36)
    y += 4
  }

  // Identificación completa del receptor
  const recIdParts = _idParts({ rfc: data.receptorRfc, curp: data.receptorCurp, elect: data.receptorElect, dom: data.receptorDom })
  doc.setFontSize(8.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('Receptor:', T.mX, y + 4)
  doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  y = _para(doc, `${data.receptorName || blank}${recIdParts ? ' · '+recIdParts : ''}`, y + 4, T.mX + 22)
  y += 6

  y = _paraJ(doc, 'El presente recibo se extiende de conformidad, para los fines legales a que haya lugar, en la fecha antes mencionada.', y + 2)
  y += 22

  // Firmas
  _firma(doc, T.mX + 6,      y, 74, `${data.receptorName  || blank}\n(Quien recibe el dinero)`)
  _firma(doc, W - T.mX - 80, y, 74, `${data.entreganteName || blank}\n(Quien entrega el dinero)`)

  _footerTramite(doc, emisor, 'Original para quien entrega — Copia para el receptor')
  doc.save(`recibo-dinero-${folio}.pdf`)
}

// ─── 8. CARTA PODER ──────────────────────────────────────────────────────────
export function pdfCartaPoder(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  const _checkY = (curY, needed = 20) => {
    if (curY + needed > 265) {
      doc.addPage()
      _footerTramite(doc, emisor, 'Original para el apoderado — Copia para el otorgante · Firmar todas las hojas')
      return _headerTramite(doc, 'C A R T A   P O D E R', folio, OPTS) + 4
    }
    return curY
  }

  let y = _headerTramite(doc, 'C A R T A   P O D E R', folio, OPTS)
  y += 2

  // Destinatario
  doc.setFontSize(8.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(`Para: ${data.destinatario || 'A QUIEN CORRESPONDA'}`, W / 2, y, { align: 'center' })
  y += 8

  // Lugar y fecha
  doc.setFontSize(9.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk)
  doc.text(`${data.lugar || blank}, a ${data.fecha || blank}.`, W - T.mX, y, { align: 'right' })
  y += 8

  // Otorgante — solo mostrar campos con valor
  const _idOpts = (idType, idNum, curp, rfc, dom) => [
    idNum && idNum !== blank ? `identificado con ${idType || 'INE'}: ${idNum}` : '',
    curp  ? `CURP: ${curp}` : '',
    rfc   ? `RFC: ${rfc}`   : '',
    dom && dom !== blank ? `con domicilio en ${dom}` : '',
  ].filter(Boolean).join(', ')

  const otorgId = _idOpts(data.otorgIdType, data.otorgIdNum, data.otorgCurp, data.otorgRfc, data.otorgDom)
  const cuerpo1 = `Yo, ${data.otorgName || blank}${otorgId ? ', '+otorgId : ''}, declaro ser mayor de edad y estar en plenas facultades físicas y mentales.`
  y = _checkY(y, 16)
  y = _paraJ(doc, cuerpo1, y)
  y += 5

  const apodId = _idOpts(data.apodIdType, data.apodIdNum, data.apodCurp, data.apodRfc, data.apodDom)
  const cuerpo2 = `Por medio de la presente, otorgo PODER ESPECIAL, AMPLIO Y SUFICIENTE a favor de: ${data.apodName || blank}${apodId ? ', '+apodId : ''}.`
  y = _checkY(y, 16)
  y = _paraJ(doc, cuerpo2, y)
  y += 5

  // Facultades — lista + texto libre
  y = _checkY(y, 20)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('PARA QUE EN MI NOMBRE Y REPRESENTACIÓN PUEDA:', T.mX, y); y += 5
  doc.setFont(T.font, 'normal')

  if (data.facultadesList && data.facultadesList.length > 0) {
    data.facultadesList.forEach(f => {
      y = _checkY(y, 8)
      doc.setFontSize(9)
      y = _para(doc, `• ${f}.`, y, T.mX + 4)
      y += 1
    })
    y += 2
  }
  if (data.actos) {
    y = _checkY(y, 10)
    y = _paraJ(doc, data.actos, y, T.mX + 4)
    y += 3
  }
  if (!data.facultadesList?.length && !data.actos) {
    y = _paraJ(doc, '[Describir los actos autorizados].', y, T.mX + 4)
    y += 3
  }

  // Cláusulas estándar
  y = _checkY(y, 16)
  y = _paraJ(doc, 'El presente poder tendrá vigencia mientras no sea revocado expresamente por el otorgante mediante escrito dirigido al apoderado.', y)
  y += 4
  y = _checkY(y, 10)
  y = _paraJ(doc, 'Se otorga la presente carta poder para todos los efectos legales a que haya lugar.', y)
  y += 5

  // Nota de identificaciones
  y = _checkY(y, 10)
  doc.setFontSize(8); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
  doc.text('NOTA: Este documento debe presentarse acompañado de copia de las identificaciones oficiales vigentes de todos los firmantes.', T.mX, y, { maxWidth: W - T.mX * 2 })
  y += 12

  // Firmas principales
  y = _checkY(y, 35)
  y += 4
  _firma(doc, T.mX + 6,      y, 75, `${data.otorgName || blank}\nOTORGANTE`)
  _firma(doc, W - T.mX - 81, y, 75, `${data.apodName || blank}\nAPODERADO`)

  // Testigos — solo los que tienen nombre
  const testigos = [
    { name: data.testigo1Name, label: 'TESTIGO 1' },
    { name: data.testigo2Name, label: 'TESTIGO 2' },
  ].filter(t => t.name && t.name.trim())

  if (testigos.length > 0) {
    y += 30
    y = _checkY(y, 30)
    doc.setFontSize(8.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('TESTIGOS:', T.mX, y); y += 10
    if (testigos.length === 1) {
      _firma(doc, W / 2 - 37, y, 74, `${testigos[0].name}\n${testigos[0].label}`)
    } else {
      _firma(doc, T.mX + 6,    y, 74, `${testigos[0].name}\n${testigos[0].label}`)
      _firma(doc, W / 2 + 4,   y, 74, `${testigos[1].name}\n${testigos[1].label}`)
    }
  }

  _footerTramite(doc, emisor, 'Original para el apoderado — Copia para el otorgante')
  doc.save(`carta-poder-${folio}.pdf`)
}

// ─── 9. CONTRATO DE PRESTACIÓN DE SERVICIOS ─────────────────────────────────
export function pdfContratoServicios(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const monto = parseFloat(data.monto || 0)
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  // Campos extendidos (nuevos)
  const prestCurp  = data.prestadorCurp  || ''
  const prestElect = data.prestadorElect || ''
  const prestPasap = data.prestadorPasap || ''
  const clientCurp = data.clienteCurp    || ''
  const clientElect = data.clienteElect  || ''
  const clientPasap = data.clientePasap  || ''
  const prestBanco = data.prestadorBanco || ''
  const prestClabe = data.prestadorClabe || ''
  const monedaC    = data.monedaContrato || 'MXN'

  const _newPage = () => {
    doc.addPage()
    const ny = _headerTramite(doc, 'CONTRATO DE PRESTACIÓN DE SERVICIOS', folio, OPTS)
    _footerTramite(doc, emisor, 'Original para el Cliente — Copia para el Prestador de Servicios · Firmar todas las hojas al calce')
    return ny + 4
  }
  const _checkY = (curY, needed = 20) => curY + needed > 260 ? _newPage() : curY

  let y = _headerTramite(doc, 'CONTRATO DE PRESTACIÓN DE SERVICIOS', folio, OPTS)
  y += 2

  doc.setFontSize(8); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text('Contrato de naturaleza civil', W / 2, y, { align: 'center' })
  y += 8

  // ── Bloque de partes con identificaciones completas ──────────────────────
  doc.setFontSize(9); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('PARTES:', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setFontSize(9); doc.setTextColor(...T.textInk)

  const _idLine = (parts) => parts.filter(Boolean).join(' · ')

  const prestIdParts = [
    data.prestadorName || blank,
    data.prestadorRfc   ? `RFC: ${data.prestadorRfc}`   : '',
    prestCurp           ? `CURP: ${prestCurp}`          : '',
    prestElect          ? `Clave Electoral: ${prestElect}` : '',
    prestPasap          ? `Pasaporte: ${prestPasap}`    : '',
    data.prestadorNac   ? `F. Nac.: ${data.prestadorNac}` : '',
    data.prestadorDom   ? `Dom.: ${data.prestadorDom}`  : '',
  ]
  y = _paraJ(doc, `- EL PRESTADOR: ${_idLine(prestIdParts)}.`, y, T.mX + 2)
  y += 3

  const clientIdParts = [
    data.clienteName || blank,
    data.clienteRfc   ? `RFC: ${data.clienteRfc}`       : '',
    clientCurp        ? `CURP: ${clientCurp}`            : '',
    clientElect       ? `Clave Electoral: ${clientElect}` : '',
    clientPasap       ? `Pasaporte: ${clientPasap}`      : '',
    data.clienteNac   ? `F. Nac.: ${data.clienteNac}`   : '',
    data.clienteDom   ? `Dom.: ${data.clienteDom}`       : '',
  ]
  y = _paraJ(doc, `- EL CLIENTE: ${_idLine(clientIdParts)}.`, y, T.mX + 2)
  y += 6

  doc.setFontSize(9.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk)
  const proyectoPart = data.proyectoNombre ? ` (Proyecto: "${data.proyectoNombre}")` : ''
  const intro = `En ${data.lugar || blank}, a ${data.fecha || blank}, ambas partes convienen en celebrar el presente Contrato de Prestación de Servicios${proyectoPart}, al tenor de las siguientes cláusulas:`
  y = _paraJ(doc, intro, y); y += 5

  // ── Conversor ordinal español ─────────────────────────────────────────────────
  const _ORDINALES = ['','PRIMERA','SEGUNDA','TERCERA','CUARTA','QUINTA','SEXTA',
    'SÉPTIMA','OCTAVA','NOVENA','DÉCIMA','UNDÉCIMA','DUODÉCIMA','DECIMOTERCERA',
    'DECIMOCUARTA','DECIMOQUINTA','DECIMOSEXTA','DECIMOSÉPTIMA','DECIMOCTAVA','DECIMONOVENA','VIGÉSIMA']
  const _ordinal = n => _ORDINALES[n] || `${n}A`

  // ── Texto de honorarios con regla oficial MXN ────────────────────────────────
  const tc = parseFloat(data.tc || 0)
  const montoMxn = (monedaC !== 'MXN' && tc > 0) ? monto * tc : null
  let montoStr = ''
  if (monedaC === 'MXN') {
    montoStr = `$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${numToLetras(monto)} MONEDA NACIONAL)`
  } else if (montoMxn) {
    montoStr = `$${montoMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${numToLetras(montoMxn)} MONEDA NACIONAL), calculado con base en ${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${monedaC} a un tipo de cambio acordado de $${tc.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN por ${monedaC}`
  } else {
    montoStr = `$${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${monedaC} (${numToLetras(monto)})`
  }

  // ── Cláusulas base ────────────────────────────────────────────────────────
  let clausulaIdx = 1
  const clausulas = [
    { titulo: `${_ordinal(clausulaIdx++)} — OBJETO`, texto: `EL PRESTADOR DE SERVICIOS se compromete a proporcionar al CLIENTE los siguientes servicios: ${data.servicios || blank}.${data.proyectoNombre ? ` Proyecto de referencia: "${data.proyectoNombre}".` : ''}${data.cotizacionVinculada ? ` Los servicios se detallan conforme a la ${data.cotizacionVinculada.titulo || ''}${data.cotizacionVinculada.folio ? ' (Folio ' + data.cotizacionVinculada.folio + ')' : ''} por un importe de $${(data.cotizacionVinculada.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${data.cotizacionVinculada.moneda || 'MXN'}, documento que se adjunta como Anexo A del presente contrato.` : ''}` },
    { titulo: `${_ordinal(clausulaIdx++)} — HONORARIOS Y FORMA DE PAGO`, texto: `EL CLIENTE se obliga a pagar al PRESTADOR la cantidad de ${montoStr} por los servicios convenidos. Forma de pago: ${data.formaPago || blank}.${prestBanco ? ` Cuenta del prestador: ${prestBanco}` : ''}${prestClabe ? ` — CLABE/Wallet: ${prestClabe}` : ''}.` },
    { titulo: `${_ordinal(clausulaIdx++)} — VIGENCIA`, texto: `El presente contrato tendrá vigencia a partir del ${data.fechaInicio || blank} y hasta el ${data.fechaFin || blank}, renovable con previo aviso de ${data.diasAviso || '15'} días naturales por escrito.` },
    { titulo: `${_ordinal(clausulaIdx++)} — CONFIDENCIALIDAD`, texto: `Las partes acuerdan mantener estricta confidencialidad sobre toda la información intercambiada con motivo del presente contrato, incluyendo datos técnicos, comerciales, personales y de terceros, aun después de concluida la vigencia del mismo.` },
    { titulo: `${_ordinal(clausulaIdx++)} — RESCISIÓN`, texto: `Cualquiera de las partes podrá rescindir el presente contrato mediante aviso previo de ${data.diasAviso || '15'} días naturales por escrito. El incumplimiento grave de alguna de las partes dará derecho a la otra a rescindir de manera inmediata sin responsabilidad alguna.` },
    { titulo: `${_ordinal(clausulaIdx++)} — JURISDICCIÓN`, texto: `Para la interpretación y cumplimiento del presente contrato, las partes se someten expresamente a la jurisdicción y competencia de los tribunales de ${data.jurisdiccion || data.lugar || blank}, renunciando a cualquier fuero que por razón de su domicilio presente o futuro pudiere corresponderles.` },
  ]

  // Cláusulas adicionales (texto libre)
  if (data.clausulasExtra) {
    clausulas.push({ titulo: `${_ordinal(clausulaIdx++)} — DISPOSICIONES ADICIONALES`, texto: data.clausulasExtra })
  }

  // Cláusulas del catálogo
  if (Array.isArray(data.clausulasSeleccionadas) && data.clausulasSeleccionadas.length > 0) {
    data.clausulasSeleccionadas.forEach(cl => {
      clausulas.push({ titulo: `${_ordinal(clausulaIdx++)} — ${(cl.titulo || 'CLÁUSULA ADICIONAL').toUpperCase()}`, texto: cl.texto || '' })
    })
  }

  for (const c of clausulas) {
    y = _checkY(y, 18)
    doc.setFontSize(9); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text(c.titulo, T.mX, y); y += 5
    doc.setFont(T.font, 'normal'); doc.setFontSize(9.5)
    y = _paraJ(doc, c.texto, y); y += 4
  }

  // ── Firma ─────────────────────────────────────────────────────────────────
  y = _checkY(y, 35)
  y += 6
  doc.setFontSize(9); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk)
  y = _paraJ(doc, 'Leído el presente instrumento por ambas partes y enteradas de su contenido y alcance legal, lo firman de conformidad en todas sus hojas.', y); y += 14

  _firma(doc, T.mX + 8,      y, 75, `${data.clienteName || blank}\nEL CLIENTE`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.prestadorName || blank}\nEL PRESTADOR DE SERVICIOS`)

  _footerTramite(doc, emisor, 'Original para el Cliente — Copia para el Prestador de Servicios · Firmar todas las hojas al calce')
  doc.save(`contrato-servicios-${folio}.pdf`)
}

/** Convierte número a romano (para numerar cláusulas) */
function _numRomano(n) {
  const vals = [10,'X',9,'IX',8,'VIII',7,'VII',6,'VI',5,'V',4,'IV',3,'III',2,'II',1,'I']
  let r = ''
  for (let i = 0; i < vals.length; i += 2) while (n >= vals[i]) { r += vals[i+1]; n -= vals[i] }
  return r
}

// ─── 10. NOTA DE VENTA ───────────────────────────────────────────────────────
export function pdfNotaVenta(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = data.folio || _folio()
  const blank = '________________________'
  const items = data.items || []
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  let y = _headerTramite(doc, 'NOTA DE VENTA', folio, OPTS)
  y += 4

  // ── Encabezado del emisor ──
  const boxW = (W - T.mX * 2) / 2 - 3
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, boxW, 28, 2, 2, 'FD')
  // Borde top cyan corto
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.8)
  doc.line(T.mX, y, T.mX + 20, y)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.setFontSize(11)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(emisor.nombre || data.emisorName || 'Emisor', T.mX + 4, y + 8)
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  if (emisor.rfc || data.emisorRfc)  doc.text(`RFC: ${emisor.rfc || data.emisorRfc}`, T.mX + 4, y + 14)
  if (emisor.direccion || data.emisorDir) {
    const dLines = doc.splitTextToSize(emisor.direccion || data.emisorDir, boxW - 10)
    doc.text(dLines[0], T.mX + 4, y + 20)
  }

  // ── Datos del cliente ──
  const cX = W / 2 + 1
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.roundedRect(cX, y, boxW, 28, 2, 2, 'FD')
  doc.setFontSize(7)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textMid)
  doc.text('CLIENTE:', cX + 4, y + 7)
  doc.setFontSize(9.5)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(doc.splitTextToSize(data.clienteName || blank, boxW - 10)[0], cX + 4, y + 14)
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text(`Fecha: ${data.fecha || new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`, cX + 4, y + 21)
  doc.text(`Folio: ${folio}`, cX + 4, y + 27)
  y += 34

  // ── Tabla de conceptos ──
  if (items.length) {
    const subtotal = items.reduce((s, i) => s + (i.subtotal || (parseFloat(i.cantidad||1) * parseFloat(i.precio||0))), 0)
    const iva = data.conIva ? subtotal * 0.16 : 0
    const total = subtotal + iva

    _autoTable(doc, {
      startY: y,
      head: [['#', 'DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'SUBTOTAL']],
      body: items.map((it, i) => {
        const sub = it.subtotal || (parseFloat(it.cantidad||1) * parseFloat(it.precio||0))
        return [
          i + 1,
          it.descripcion || '—',
          parseFloat(it.cantidad || 1).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
          fmt$(parseFloat(it.precio || 0)),
          fmt$(sub),
        ]
      }),
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: (d) => {
        _headerTramite(doc, 'NOTA DE VENTA', folio, OPTS)
        _footerTramite(doc, emisor, null)
      },
    })
    y = doc.lastAutoTable.finalY + 4

    // Totales — diseño mejorado
    const totX = W - T.mX - 64
    const totH = data.conIva ? 36 : 22
    doc.setFillColor(248, 250, 253)
    doc.setDrawColor(...T.textDim)
    doc.setLineWidth(0.2)
    doc.roundedRect(totX, y, 64, totH, 2, 2, 'FD')
    // Borde top cyan
    doc.setDrawColor(...T.cyan)
    doc.setLineWidth(0.8)
    doc.line(totX, y, totX + 20, y)
    doc.setDrawColor(...T.textDim)
    doc.setLineWidth(0.2)

    doc.setFontSize(8)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    doc.text('Subtotal:', totX + 4, y + 8)
    doc.setTextColor(...T.textInk)
    doc.setFont(T.font, 'bold')
    doc.text(fmt$(subtotal), totX + 60, y + 8, { align: 'right' })

    if (data.conIva) {
      doc.setFont(T.font, 'normal')
      doc.setTextColor(...T.textMid)
      doc.text('IVA (16%):', totX + 4, y + 16)
      doc.setFont(T.font, 'bold')
      doc.setTextColor(...T.textInk)
      doc.text(fmt$(iva), totX + 60, y + 16, { align: 'right' })
      // Separador interno
      doc.setDrawColor(...T.textDim)
      doc.setLineWidth(0.15)
      doc.line(totX + 4, y + 20, totX + 60, y + 20)
    }

    const totalRowY = data.conIva ? y + 29 : y + 17
    doc.setFontSize(10.5)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.cyan)
    doc.text('TOTAL:', totX + 4, totalRowY)
    doc.setTextColor(...T.textInk)
    doc.text(fmt$(total), totX + 60, totalRowY, { align: 'right' })
    y += totH + 6

    // Monto en letras
    doc.setFontSize(7.5)
    doc.setFont(T.font, 'italic')
    doc.setTextColor(...T.textMid)
    doc.text(numToLetras(total), T.mX, y)
    y += 6
  }

  // Notas
  if (data.notas) {
    doc.setFontSize(8)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    doc.text('Notas: ' + data.notas, T.mX, y + 4)
    y += 10
  }

  _footerTramite(doc, emisor, null)
  doc.save(`nota-venta-${folio}.pdf`)
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESUPUESTO / COTIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────
export function pdfPresupuesto(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = data.folio || _folio()
  const blank = '________________________'
  const items = (data.items || []).filter(it => it.descripcion)

  let y = _headerDoc(doc, 'Presupuesto / Cotización', folio)
  y += 6

  // ── Cajas emisor + cliente ──────────────────────────────────────────────────
  const boxW = (W - T.mX * 2) / 2 - 3

  // Emisor
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, boxW, 32, 2, 2, 'FD')
  doc.setFontSize(11); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text(emisor.nombre || 'Emisor', T.mX + 4, y + 9)
  doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  if (emisor.rfc)       doc.text(`RFC: ${emisor.rfc}`, T.mX + 4, y + 16)
  if (emisor.direccion) doc.text(doc.splitTextToSize(emisor.direccion, boxW - 10)[0], T.mX + 4, y + 22)

  // Cliente
  const cX = W / 2 + 1
  doc.setFillColor(245, 248, 252)
  doc.roundedRect(cX, y, boxW, 32, 2, 2, 'FD')
  doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textMid)
  doc.text('PRESUPUESTO PARA:', cX + 4, y + 7)
  doc.setFontSize(10); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  const cnLines = doc.splitTextToSize(data.clienteName || blank, boxW - 10)
  doc.text(cnLines[0], cX + 4, y + 15)
  doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(`Fecha: ${data.fecha || new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' })}`, cX + 4, y + 22)
  if (data.validezDias) {
    const vd = new Date(); vd.setDate(vd.getDate() + parseInt(data.validezDias))
    doc.text(`Válido hasta: ${vd.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })}`, cX + 4, y + 28)
  }
  y += 40

  // Concepto
  if (data.concepto) {
    doc.setFontSize(8); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
    doc.text('Concepto: ' + data.concepto, T.mX, y)
    y += 8
  }

  // ── Tabla de conceptos ──────────────────────────────────────────────────────
  if (items.length) {
    const subtotal = items.reduce((s, it) => s + (it.subtotal || 0), 0)
    const iva      = data.conIva ? subtotal * 0.16 : 0
    const total    = subtotal + iva

    _autoTable(doc, {
      startY: y,
      head: [['#', 'DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'SUBTOTAL']],
      body: items.map((it, i) => [
        i + 1,
        it.descripcion,
        parseFloat(it.cantidad || 1).toLocaleString('es-MX', { maximumFractionDigits: 2 }),
        fmt$(parseFloat(it.precio || 0)),
        fmt$(it.subtotal || 0),
      ]),
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: (d) => {
        _headerDoc(doc, 'Presupuesto / Cotización', folio)
        _footer(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
    y = doc.lastAutoTable.finalY + 4

    // Caja de totales
    const totX  = W - T.mX - 58
    const totH  = data.conIva ? 28 : 16
    doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(totX, y, 58, totH, 2, 2, 'FD')
    doc.setFontSize(8.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text('Subtotal:', totX + 4, y + 7)
    doc.setTextColor(...T.textInk); doc.text(fmt$(subtotal), totX + 54, y + 7, { align: 'right' })
    if (data.conIva) {
      doc.setTextColor(...T.textMid); doc.text('IVA (16%):', totX + 4, y + 14)
      doc.setTextColor(...T.textInk); doc.text(fmt$(iva), totX + 54, y + 14, { align: 'right' })
    }
    const totalY = data.conIva ? y + 23 : y + 13
    doc.setFontSize(10); doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.cyan);    doc.text('TOTAL:', totX + 4, totalY)
    doc.setTextColor(...T.textInk); doc.text(fmt$(total), totX + 54, totalY, { align: 'right' })
    y += totH + 8

    // Monto en letras
    doc.setFontSize(7.5); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
    doc.text(numToLetras(total), T.mX, y)
    y += 8
  }

  // Observaciones
  if (data.notas) {
    doc.setFontSize(8); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    const nLines = doc.splitTextToSize('Observaciones: ' + data.notas, W - T.mX * 2)
    doc.text(nLines, T.mX, y); y += nLines.length * 4.5 + 6
  }

  // Líneas de firma
  y += 6
  const H = doc.internal.pageSize.getHeight()
  if (y < H - 40) {
    const midX = W / 2
    doc.setDrawColor(...T.textDim); doc.setLineWidth(0.3)
    doc.line(T.mX, y, T.mX + 55, y)
    doc.line(midX + 4, y, midX + 59, y)
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text(emisor.nombre || 'Emisor / Prestador', T.mX, y + 5)
    doc.text('Cliente / Aceptante', midX + 4, y + 5)
  }

  _footer(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`presupuesto-${folio}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// COTIZACIONES PRO — Header / Footer especializados + PDF completos
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * _headerCotizacion — Header para Presupuestos y Notas de Venta Pro
 * Barra delgada cyan (2px) en top, tipo doc grande izquierda, folio derecha.
 * Si hay titulo: debajo del tipo en gris.
 * @returns {number} Y de inicio del cuerpo
 */
function _headerCotizacion(doc, tipo, folio, titulo, opts = {}) {
  const W  = doc.internal.pageSize.getWidth()
  const po = _projectBand(doc, opts.coverDataUrl, opts.proyName)
  // Línea cyan top
  doc.setFillColor(...T.cyan)
  doc.rect(0, po, W, 2, 'F')
  // Tipo de documento — izquierda, bold grande
  doc.setFontSize(16)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(tipo.toUpperCase(), T.mX, po + 14)
  // Folio — derecha, monospace elegante
  doc.setFontSize(10)
  doc.setFont('courier', 'bold')
  doc.setTextColor(...T.textMid)
  doc.text(folio || '', W - T.mX, po + 14, { align: 'right' })
  // Titulo debajo del tipo, en gris muted
  if (titulo) {
    doc.setFontSize(8)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    const tLines = doc.splitTextToSize(titulo, W - T.mX * 2 - 40)
    doc.text(tLines[0], T.mX, po + 21)
  }
  // Línea separadora
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.25)
  doc.line(T.mX, po + 26, W - T.mX, po + 26)
  return po + 32
}

/**
 * _footerCotizacion — Footer para Presupuestos y Notas de Venta Pro
 */
function _footerCotizacion(doc, pageNum, totalPages, emisor) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.25)
  doc.line(T.mX, H - 14, W - T.mX, H - 14)
  doc.setFontSize(7)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  // Izquierda: emisor o marca
  const left = (emisor?.nombre)
    ? `${emisor.nombre}${emisor.rfc ? ' · RFC: ' + emisor.rfc : ''}`
    : `${T.brand} · ${T.url}`
  doc.text(doc.splitTextToSize(left, (W / 2) - T.mX)[0], T.mX, H - 7)
  // Derecha: paginación
  doc.text(`Pág. ${pageNum} de ${totalPages}`, W - T.mX, H - 7, { align: 'right' })
  // Centro (solo primera página): leyenda original/copia
  if (pageNum === 1) {
    doc.setFontSize(6.5)
    doc.setTextColor(...T.textDim)
    doc.text('Original para el interesado · Copia para el otorgante', W / 2, H - 7, { align: 'center' })
  }
}

/** Formato moneda con símbolo de moneda arbitraria */
function _fmtMon(n, moneda) {
  const sym = moneda === 'USD' ? 'US$' : moneda === 'USDT' ? 'USDT ' : moneda === 'BTC' ? '₿' : '$'
  return sym + Math.abs(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: moneda === 'BTC' ? 8 : 2 })
}

// ─── PRESUPUESTO PRO ─────────────────────────────────────────────────────────
/**
 * pdfPresupuesto — Presupuesto / Cotización profesional completo.
 * data: { folio, titulo, fecha, fechaFmt, validezDias,
 *         emisorNombre, emisorRfc, emisorDireccion, emisorTel,
 *         clienteName, clienteRfc, clienteDireccion, clienteTel, clienteEmail,
 *         proyectoNombre,
 *         moneda, tipoCambio, metodoPago, bancoPago, clabePago,
 *         items: [{ descripcion, cantidad, precio, descuento, subtotal }],
 *         conIva, subtotal, descuentoTotal, iva, total, notas }
 */
export function pdfPresupuestoPro(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = data.folio || _folio()
  const items = (data.items || []).filter(it => it.descripcion)
  const mon   = data.moneda || 'MXN'
  const blank = '________________________'
  const COT_OPTS = { coverDataUrl: data.cover_data_url || '', proyName: data.proyectoNombre || '' }

  let y = _headerCotizacion(doc, 'Presupuesto', folio, data.titulo, COT_OPTS)

  // ── Bloque emisor + cliente ──────────────────────────────────────────────────
  const boxW = (W - T.mX * 2) / 2 - 3
  const emisorNombre = data.emisorNombre || emisor.nombre || ''
  const emisorRfc    = data.emisorRfc    || emisor.rfc    || ''
  const emisorDir    = data.emisorDireccion || emisor.direccion || ''
  const emisorTel    = data.emisorTel    || emisor.tel    || ''

  // Caja Emisor
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, boxW, 36, 2, 2, 'FD')
  doc.setFontSize(6.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textMid)
  doc.text('EMISOR', T.mX + 4, y + 6)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text(doc.splitTextToSize(emisorNombre || 'Emisor', boxW - 8)[0], T.mX + 4, y + 13)
  doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  if (emisorRfc)    doc.text(`RFC: ${emisorRfc}`,    T.mX + 4, y + 20)
  if (emisorDir)    doc.text(doc.splitTextToSize(emisorDir, boxW - 10)[0], T.mX + 4, y + 26)
  if (emisorTel)    doc.text(`Tel: ${emisorTel}`,    T.mX + 4, y + 32)

  // Caja Cliente
  const cX = W / 2 + 1
  doc.setFillColor(245, 248, 252)
  doc.roundedRect(cX, y, boxW, 36, 2, 2, 'FD')
  doc.setFontSize(6.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textMid)
  doc.text('CLIENTE', cX + 4, y + 6)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text(doc.splitTextToSize(data.clienteName || blank, boxW - 8)[0], cX + 4, y + 13)
  doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  if (data.clienteRfc)       doc.text(`RFC: ${data.clienteRfc}`,     cX + 4, y + 20)
  if (data.clienteDireccion) doc.text(doc.splitTextToSize(data.clienteDireccion, boxW - 10)[0], cX + 4, y + 26)
  if (data.clienteTel)       doc.text(`Tel: ${data.clienteTel}`,     cX + 4, y + 32)
  y += 42

  // ── Meta: fecha, validez, proyecto ──────────────────────────────────────────
  doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  const fechaStr = data.fechaFmt || data.fecha || new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' })
  doc.text(`Fecha: ${fechaStr}`, T.mX, y)
  if (data.validezDias) {
    const vd = new Date(data.fecha ? data.fecha + 'T12:00:00' : Date.now())
    vd.setDate(vd.getDate() + parseInt(data.validezDias))
    doc.text(`Validez: ${data.validezDias} días (hasta ${vd.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })})`, T.mX + 60, y)
  }
  if (mon !== 'MXN') {
    doc.text(`Moneda: ${mon}${data.tipoCambio ? ` (TC: ${data.tipoCambio})` : ''}`, W - T.mX, y, { align: 'right' })
  }
  y += 6

  // Proyecto vinculado
  if (data.proyectoNombre) {
    doc.setFontSize(7.5); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
    doc.text(`Proyecto: ${data.proyectoNombre}`, T.mX, y)
    y += 6
  }

  y += 2
  doc.setDrawColor(...T.textDim); doc.setLineWidth(0.15)
  doc.line(T.mX, y, W - T.mX, y)
  y += 5

  // ── Tabla de ítems ───────────────────────────────────────────────────────────
  if (items.length) {
    const hasDiscount = items.some(it => (it.descuento || 0) > 0)
    const head = hasDiscount
      ? [['#', 'DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'DESC.%', 'SUBTOTAL']]
      : [['#', 'DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'SUBTOTAL']]

    const body = items.map((it, i) => {
      const cant  = parseFloat(it.cantidad || 1)
      const prec  = parseFloat(it.precio || 0)
      const desc  = parseFloat(it.descuento || 0)
      const sub   = it.subtotal ?? (cant * prec * (1 - desc / 100))
      const row = [
        i + 1,
        it.descripcion || '—',
        cant.toLocaleString('es-MX', { maximumFractionDigits: 2 }),
        _fmtMon(prec, mon),
      ]
      if (hasDiscount) row.push(desc > 0 ? `${desc}%` : '—')
      row.push(_fmtMon(sub, mon))
      return row
    })

    // margin.top = header height on continuation pages (project band 14 + header 32 + 2 gap)
    const _cotTopMargin = (COT_OPTS.coverDataUrl ? 14 : 0) + 34
    _autoTable(doc, {
      startY: y,
      head,
      body,
      margin: { left: T.mX, right: T.mX, top: _cotTopMargin, bottom: 18 },
      columnStyles: hasDiscount
        ? { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 14, halign: 'center' }, 5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } }
        : { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
      didDrawPage: (d) => {
        _headerCotizacion(doc, 'Presupuesto', folio, data.titulo, COT_OPTS)
        _footerCotizacion(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
    y = doc.lastAutoTable.finalY + 4

    // Totales
    const subtotal      = data.subtotal       ?? items.reduce((s, it) => s + (it.subtotal || 0), 0)
    const descTotal     = data.descuentoTotal  ?? 0
    const iva           = data.iva            ?? (data.conIva ? subtotal * 0.16 : 0)
    const total         = data.total          ?? (subtotal - descTotal + iva)
    const totX          = W - T.mX - 64
    const hasDescLine   = descTotal > 0
    const totRows       = 1 + (hasDescLine ? 1 : 0) + (data.conIva ? 1 : 0) + 1
    const totH          = totRows * 9 + 4

    doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(totX, y, 64, totH, 2, 2, 'FD')
    let ty = y + 8
    const _totRow = (label, val, bold = false, color = T.textInk) => {
      doc.setFontSize(bold ? 9 : 8); doc.setFont(T.font, bold ? 'bold' : 'normal')
      doc.setTextColor(...T.textMid); doc.text(label, totX + 4, ty)
      doc.setTextColor(...color);    doc.text(_fmtMon(val, mon), totX + 60, ty, { align: 'right' })
      ty += 9
    }
    _totRow('Subtotal:', subtotal)
    if (hasDescLine) _totRow('Descuento:', -descTotal, false, T.red)
    if (data.conIva)  _totRow('IVA (16%):', iva)
    _totRow(`TOTAL ${mon}:`, total, true, T.cyan)

    // Equivalente en MXN cuando la moneda es extranjera
    const tc = parseFloat(data.tipoCambio || 0)
    if (mon !== 'MXN' && tc > 0) {
      const mxnTotal = total * tc
      doc.setFontSize(7); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
      doc.text(`≈ MXN ${mxnTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (TC ${tc})`,
        totX + 60, ty, { align: 'right' })
      ty += 7
    }
    y = Math.max(y + totH + 6, ty + 4)

    // Monto en letras (MXN nativo o equivalente)
    const mxnForLetras = (mon === 'MXN') ? total : (tc > 0 ? total * tc : 0)
    if (mxnForLetras > 0) {
      doc.setFontSize(7); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
      const letrasLines = doc.splitTextToSize(numToLetras(mxnForLetras), W - T.mX * 2)
      doc.text(letrasLines, T.mX, y)
      y += letrasLines.length * 4 + 3
    }
  }

  const _H = doc.internal.pageSize.getHeight()
  const _safePageBreak = (neededH) => {
    if (y + neededH > _H - 20) { doc.addPage(); _headerCotizacion(doc, 'Presupuesto', folio, data.titulo, COT_OPTS); y = 38 }
  }

  // ── Observaciones / Plan de trabajo ─────────────────────────────────────────
  if (data.notas) {
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal')
    const obsLines = doc.splitTextToSize(data.notas, W - T.mX * 2 - 10)
    const obsH     = obsLines.length * 4.8 + 14
    _safePageBreak(obsH + 8)
    y += 4
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(T.mX, y, W - T.mX * 2, obsH, 2, 2, 'FD')
    doc.setFontSize(6.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.cyan)
    doc.text('OBSERVACIONES / PLAN DE TRABAJO', T.mX + 5, y + 7)
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text(obsLines, T.mX + 5, y + 13)
    y += obsH + 5
  }

  // ── Datos de pago — caja destacada ───────────────────────────────────────────
  if (data.metodoPago || data.bancoPago || data.clabePago) {
    const _pagoW    = W - T.mX * 2 - 10
    const _pagoTxt  = (s) => doc.splitTextToSize(s, _pagoW)
    const metLines  = data.metodoPago ? _pagoTxt(`Método de Pago:  ${data.metodoPago}`) : []
    const banLines  = data.bancoPago  ? _pagoTxt(`Banco / Institución:  ${data.bancoPago}`) : []
    const claLines  = data.clabePago  ? _pagoTxt(`CLABE / Cuenta / Wallet:  ${data.clabePago}`) : []
    const pagoH     = (metLines.length + banLines.length + claLines.length) * 5.5 + 18
    _safePageBreak(pagoH + 8)
    y += 4
    // Fondo sutil cyan
    doc.setFillColor(0, 240, 255); doc.setGState(doc.GState({ opacity: 0.04 }))
    doc.roundedRect(T.mX, y, W - T.mX * 2, pagoH, 2, 2, 'F')
    doc.setGState(doc.GState({ opacity: 1 }))
    doc.setDrawColor(...T.cyan); doc.setLineWidth(0.4)
    doc.roundedRect(T.mX, y, W - T.mX * 2, pagoH, 2, 2, 'D')

    doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.cyan)
    doc.text('💳  DATOS DE PAGO', T.mX + 5, y + 8)
    let py = y + 15
    doc.setFontSize(8); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (metLines.length) { doc.text(metLines, T.mX + 5, py); py += metLines.length * 5.5 }
    if (banLines.length) { doc.text(banLines, T.mX + 5, py); py += banLines.length * 5.5 }
    if (claLines.length) {
      doc.setFont(T.font, 'bold'); doc.setFontSize(8.5); doc.setTextColor(...T.textInk)
      doc.text(claLines, T.mX + 5, py)
    }
    y += pagoH + 5
  }

  // ── Líneas de firma ──────────────────────────────────────────────────────────
  const sigY = Math.max(y + 8, _H - 38)
  if (sigY < _H - 20) {
    const midX = W / 2
    doc.setDrawColor(...T.textDim); doc.setLineWidth(0.3)
    doc.line(T.mX,     sigY, T.mX + 62,     sigY)
    doc.line(midX + 4, sigY, midX + 66, sigY)
    doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text(emisorNombre || 'Emisor / Prestador de Servicios', T.mX, sigY + 5)
    doc.text('Cliente / Receptor / Aceptante', midX + 4, sigY + 5)
  }

  _footerCotizacion(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`presupuesto-${folio}.pdf`)
}

// ─── NOTA DE VENTA PRO ───────────────────────────────────────────────────────
/**
 * pdfNotaVentaPro — Nota de Venta profesional completa.
 * Mismos campos que pdfPresupuestoPro, sin validez ni líneas de firma.
 */
export function pdfNotaVentaPro(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = data.folio || _folio()
  const items = (data.items || []).filter(it => it.descripcion)
  const mon   = data.moneda || 'MXN'
  const blank = '________________________'
  const COT_OPTS = { coverDataUrl: data.cover_data_url || '', proyName: data.proyectoNombre || '' }

  let y = _headerCotizacion(doc, 'Nota de Venta', folio, data.titulo, COT_OPTS)

  // ── Bloque emisor + cliente ──────────────────────────────────────────────────
  const boxW = (W - T.mX * 2) / 2 - 3
  const emisorNombre = data.emisorNombre || emisor.nombre || ''
  const emisorRfc    = data.emisorRfc    || emisor.rfc    || ''
  const emisorDir    = data.emisorDireccion || emisor.direccion || ''
  const emisorTel    = data.emisorTel    || emisor.tel    || ''

  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, boxW, 36, 2, 2, 'FD')
  doc.setFontSize(6.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textMid)
  doc.text('EMISOR', T.mX + 4, y + 6)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text(doc.splitTextToSize(emisorNombre || 'Emisor', boxW - 8)[0], T.mX + 4, y + 13)
  doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  if (emisorRfc) doc.text(`RFC: ${emisorRfc}`, T.mX + 4, y + 20)
  if (emisorDir) doc.text(doc.splitTextToSize(emisorDir, boxW - 10)[0], T.mX + 4, y + 26)
  if (emisorTel) doc.text(`Tel: ${emisorTel}`, T.mX + 4, y + 32)

  const cX = W / 2 + 1
  doc.setFillColor(245, 248, 252)
  doc.roundedRect(cX, y, boxW, 36, 2, 2, 'FD')
  doc.setFontSize(6.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textMid)
  doc.text('CLIENTE', cX + 4, y + 6)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text(doc.splitTextToSize(data.clienteName || blank, boxW - 8)[0], cX + 4, y + 13)
  doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  if (data.clienteRfc)       doc.text(`RFC: ${data.clienteRfc}`,     cX + 4, y + 20)
  if (data.clienteDireccion) doc.text(doc.splitTextToSize(data.clienteDireccion, boxW - 10)[0], cX + 4, y + 26)
  if (data.clienteTel)       doc.text(`Tel: ${data.clienteTel}`,     cX + 4, y + 32)
  y += 42

  // ── Meta ──────────────────────────────────────────────────────────────────────
  doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  const fechaStr = data.fechaFmt || data.fecha || new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' })
  doc.text(`Fecha: ${fechaStr}`, T.mX, y)
  if (mon !== 'MXN') doc.text(`Moneda: ${mon}${data.tipoCambio ? ` (TC: ${data.tipoCambio})` : ''}`, W - T.mX, y, { align: 'right' })
  y += 6
  if (data.proyectoNombre) {
    doc.setFontSize(7.5); doc.setFont(T.font, 'italic')
    doc.text(`Proyecto: ${data.proyectoNombre}`, T.mX, y); y += 6
  }
  y += 2
  doc.setDrawColor(...T.textDim); doc.setLineWidth(0.15)
  doc.line(T.mX, y, W - T.mX, y); y += 5

  // ── Tabla de ítems ───────────────────────────────────────────────────────────
  if (items.length) {
    const hasDiscount = items.some(it => (it.descuento || 0) > 0)
    const head = hasDiscount
      ? [['#', 'DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'DESC.%', 'SUBTOTAL']]
      : [['#', 'DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'SUBTOTAL']]

    const body = items.map((it, i) => {
      const cant  = parseFloat(it.cantidad || 1)
      const prec  = parseFloat(it.precio || 0)
      const desc  = parseFloat(it.descuento || 0)
      const sub   = it.subtotal ?? (cant * prec * (1 - desc / 100))
      const row = [i + 1, it.descripcion || '—', cant.toLocaleString('es-MX', { maximumFractionDigits: 2 }), _fmtMon(prec, mon)]
      if (hasDiscount) row.push(desc > 0 ? `${desc}%` : '—')
      row.push(_fmtMon(sub, mon))
      return row
    })

    // margin.top = header height on continuation pages (project band 14 + header 32 + 2 gap)
    const _cotTopMarginNV = (COT_OPTS.coverDataUrl ? 14 : 0) + 34
    _autoTable(doc, {
      startY: y, head, body,
      margin: { left: T.mX, right: T.mX, top: _cotTopMarginNV, bottom: 18 },
      columnStyles: hasDiscount
        ? { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 14, halign: 'center' }, 5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } }
        : { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
      didDrawPage: (d) => {
        _headerCotizacion(doc, 'Nota de Venta', folio, data.titulo, COT_OPTS)
        _footerCotizacion(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
    y = doc.lastAutoTable.finalY + 4

    const subtotal  = data.subtotal      ?? items.reduce((s, it) => s + (it.subtotal || 0), 0)
    const descTotal = data.descuentoTotal ?? 0
    const iva       = data.iva           ?? (data.conIva ? subtotal * 0.16 : 0)
    const total     = data.total         ?? (subtotal - descTotal + iva)
    const totX      = W - T.mX - 64
    const hasDescLine = descTotal > 0
    const totRows   = 1 + (hasDescLine ? 1 : 0) + (data.conIva ? 1 : 0) + 1
    const totH      = totRows * 9 + 4

    doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(totX, y, 64, totH, 2, 2, 'FD')
    let ty = y + 8
    const _totRow2 = (label, val, bold = false, color = T.textInk) => {
      doc.setFontSize(bold ? 9 : 8); doc.setFont(T.font, bold ? 'bold' : 'normal')
      doc.setTextColor(...T.textMid); doc.text(label, totX + 4, ty)
      doc.setTextColor(...color);    doc.text(_fmtMon(val, mon), totX + 60, ty, { align: 'right' })
      ty += 9
    }
    _totRow2('Subtotal:', subtotal)
    if (hasDescLine) _totRow2('Descuento:', -descTotal, false, T.red)
    if (data.conIva)  _totRow2('IVA (16%):', iva)
    _totRow2(`TOTAL ${mon}:`, total, true, T.cyan)

    // Equivalente MXN para monedas extranjeras
    const tcNV = parseFloat(data.tipoCambio || 0)
    if (mon !== 'MXN' && tcNV > 0) {
      const mxnTotalNV = total * tcNV
      doc.setFontSize(7); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
      doc.text(`≈ MXN ${mxnTotalNV.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (TC ${tcNV})`,
        totX + 60, ty, { align: 'right' })
      ty += 7
    }
    y = Math.max(y + totH + 6, ty + 4)

    const mxnForLetrasNV = (mon === 'MXN') ? total : (tcNV > 0 ? total * tcNV : 0)
    if (mxnForLetrasNV > 0) {
      doc.setFontSize(7); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
      const letrasLinesNV = doc.splitTextToSize(numToLetras(mxnForLetrasNV), W - T.mX * 2)
      doc.text(letrasLinesNV, T.mX, y)
      y += letrasLinesNV.length * 4 + 3
    }
  }

  const _HNV = doc.internal.pageSize.getHeight()
  const _safeBreakNV = (neededH) => {
    if (y + neededH > _HNV - 20) { doc.addPage(); _headerCotizacion(doc, 'Nota de Venta', folio, data.titulo, COT_OPTS); y = 38 }
  }

  // ── Observaciones / Plan de trabajo ─────────────────────────────────────────
  if (data.notas) {
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal')
    const obsLines = doc.splitTextToSize(data.notas, W - T.mX * 2 - 10)
    const obsH     = obsLines.length * 4.8 + 14
    _safeBreakNV(obsH + 8)
    y += 4
    doc.setFillColor(248, 250, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(T.mX, y, W - T.mX * 2, obsH, 2, 2, 'FD')
    doc.setFontSize(6.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.cyan)
    doc.text('OBSERVACIONES / PLAN DE TRABAJO', T.mX + 5, y + 7)
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text(obsLines, T.mX + 5, y + 13)
    y += obsH + 5
  }

  // ── Datos de pago — caja destacada ───────────────────────────────────────────
  if (data.metodoPago || data.bancoPago || data.clabePago) {
    const _pagoWnv  = W - T.mX * 2 - 10
    const _pagoTxtN = (s) => doc.splitTextToSize(s, _pagoWnv)
    const metLinesNV = data.metodoPago ? _pagoTxtN(`Método de Pago:  ${data.metodoPago}`) : []
    const banLinesNV = data.bancoPago  ? _pagoTxtN(`Banco / Institución:  ${data.bancoPago}`) : []
    const claLinesNV = data.clabePago  ? _pagoTxtN(`CLABE / Cuenta / Wallet:  ${data.clabePago}`) : []
    const pagoH      = (metLinesNV.length + banLinesNV.length + claLinesNV.length) * 5.5 + 18
    _safeBreakNV(pagoH + 8)
    y += 4
    doc.setFillColor(0, 240, 255); doc.setGState(doc.GState({ opacity: 0.04 }))
    doc.roundedRect(T.mX, y, W - T.mX * 2, pagoH, 2, 2, 'F')
    doc.setGState(doc.GState({ opacity: 1 }))
    doc.setDrawColor(...T.cyan); doc.setLineWidth(0.4)
    doc.roundedRect(T.mX, y, W - T.mX * 2, pagoH, 2, 2, 'D')
    doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.cyan)
    doc.text('💳  DATOS DE PAGO', T.mX + 5, y + 8)
    let py = y + 15
    doc.setFontSize(8); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (metLinesNV.length) { doc.text(metLinesNV, T.mX + 5, py); py += metLinesNV.length * 5.5 }
    if (banLinesNV.length) { doc.text(banLinesNV, T.mX + 5, py); py += banLinesNV.length * 5.5 }
    if (claLinesNV.length) {
      doc.setFont(T.font, 'bold'); doc.setFontSize(8.5); doc.setTextColor(...T.textInk)
      doc.text(claLinesNV, T.mX + 5, py)
    }
    y += pagoH + 5
  }

  _footerCotizacion(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`nota-venta-${folio}.pdf`)
}

// ════════════════════════════════════════════════════════════════════════════
// NUEVAS PLANTILLAS — Trámites adicionales v2.1
// ════════════════════════════════════════════════════════════════════════════

// ─── 11. RECONOCIMIENTO DE ADEUDO ────────────────────────────────────────────
export function pdfReconocimientoAdeudo(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  const _checkY = (curY, needed = 20) => {
    if (curY + needed > 265) {
      doc.addPage()
      _footerTramite(doc, emisor, 'Original para el acreedor — Copia para el deudor · Firmar todas las hojas')
      return _headerTramite(doc, 'RECONOCIMIENTO DE ADEUDO', folio, OPTS) + 4
    }
    return curY
  }

  let y = _headerTramite(doc, 'RECONOCIMIENTO DE ADEUDO', folio, OPTS)
  y += 4

  // Lugar y fecha
  doc.setFontSize(9); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(`${data.lugar || blank}, a ${data.fecha || blank}.`, W - T.mX, y, { align: 'right' })
  y += 8

  // Identificación del deudor
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('I.   DEUDOR', T.mX, y); y += 5
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 26, 2, 2, 'FD')
  // borde cyan izquierdo
  doc.setFillColor(...T.cyan); doc.rect(T.mX, y, 1.5, 26, 'F')
  doc.setFontSize(9); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text(data.deudorName || blank, T.mX + 6, y + 7)
  doc.setFontSize(8); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  const dId = [data.deudorRfc && `RFC: ${data.deudorRfc}`, data.deudorCurp && `CURP: ${data.deudorCurp}`, data.deudorDom && `Dom.: ${data.deudorDom}`].filter(Boolean).join('  ·  ')
  if (dId) { const dl = doc.splitTextToSize(dId, W - T.mX * 2 - 10); doc.text(dl, T.mX + 6, y + 13) }
  y += 32

  // Identificación del acreedor
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('II.  ACREEDOR', T.mX, y); y += 5
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 26, 2, 2, 'FD')
  doc.setFillColor(...T.blue); doc.rect(T.mX, y, 1.5, 26, 'F')
  doc.setFontSize(9); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text(data.acreedorName || blank, T.mX + 6, y + 7)
  doc.setFontSize(8); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  const aId = [data.acreedorRfc && `RFC: ${data.acreedorRfc}`, data.acreedorDom && `Dom.: ${data.acreedorDom}`].filter(Boolean).join('  ·  ')
  if (aId) { const al = doc.splitTextToSize(aId, W - T.mX * 2 - 10); doc.text(al, T.mX + 6, y + 13) }
  y += 32

  // Monto reconocido
  const monto = parseFloat(data.monto || 0)
  const moneda = data.moneda || 'MXN'
  const tc     = parseFloat(data.tc || 0)
  const montoMxn = (moneda !== 'MXN' && tc > 0) ? monto * tc : null
  const montoStr = montoMxn
    ? `$${montoMxn.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN (${numToLetras(montoMxn)}), equivalente a ${monto.toLocaleString('es-MX',{minimumFractionDigits:2})} ${moneda} al tipo de cambio de $${tc.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN`
    : `$${monto.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN (${numToLetras(monto)})`

  y = _checkY(y, 22)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('III. MONTO RECONOCIDO', T.mX, y); y += 5
  doc.setFillColor(244, 252, 247); doc.setDrawColor(...T.greenD); doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 14, 2, 2, 'FD')
  doc.setFontSize(11); doc.setFont(T.font, 'bold'); doc.setTextColor(...[22,163,74])
  doc.text(montoStr, W / 2, y + 9, { align: 'center' })
  y += 20

  // Cuerpo legal
  y = _checkY(y, 16)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('IV.  DECLARACIÓN', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  const texto1 = `Por medio del presente instrumento, el suscrito ${data.deudorName || blank}, reconoce deber y adeudar legítimamente a ${data.acreedorName || blank} la cantidad de ${montoStr}, por concepto de: ${data.concepto || blank}.`
  y = _paraJ(doc, texto1, y); y += 4

  y = _checkY(y, 16)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('V.   COMPROMISO DE PAGO', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  const texto2 = `El deudor se compromete a liquidar la cantidad adeudada a más tardar el día ${data.fechaPago || blank}, mediante ${data.formaPago || 'transferencia bancaria o forma acordada entre las partes'}.${data.intereses ? ` En caso de mora se generarán intereses del ${data.intereses}% mensual sobre saldo insoluto.` : ' No se generarán intereses siempre que el pago se realice en la fecha acordada.'}`
  y = _paraJ(doc, texto2, y); y += 4

  if (data.notas) {
    y = _checkY(y, 14)
    doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('VI.  CONDICIONES ADICIONALES', T.mX, y); y += 5
    doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk)
    y = _paraJ(doc, data.notas, y); y += 4
  }

  y = _checkY(y, 16)
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  y = _paraJ(doc, 'El presente reconocimiento tiene plena fuerza y valor legal y podrá ser utilizado por el acreedor para todos los efectos jurídicos a que haya lugar.', y); y += 12

  y = _checkY(y, 40)
  _firma(doc, T.mX + 8,      y, 75, `${data.deudorName || blank}\nDeudor`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.acreedorName || blank}\nAcreedor (Testigo)`)

  _footerTramite(doc, emisor, 'Original para el acreedor — Copia para el deudor')
  doc.save(`reconocimiento-adeudo-${folio}.pdf`)
}

// ─── 12. NDA / ACUERDO DE CONFIDENCIALIDAD ───────────────────────────────────
export function pdfNDA(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  const _checkY = (curY, needed = 20) => {
    if (curY + needed > 265) {
      doc.addPage()
      _footerTramite(doc, emisor, 'Original para ambas partes · Firmar todas las hojas')
      return _headerTramite(doc, 'ACUERDO DE CONFIDENCIALIDAD', folio, OPTS) + 4
    }
    return curY
  }

  let y = _headerTramite(doc, 'ACUERDO DE CONFIDENCIALIDAD (NDA)', folio, OPTS)
  y += 3

  doc.setFontSize(9); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(`${data.lugar || blank}, a ${data.fecha || blank}.`, W - T.mX, y, { align: 'right' })
  y += 7

  // Partes
  const boxW = (W - T.mX * 2 - 6) / 2
  ;[{ label: 'PARTE DIVULGADORA', name: data.parte1Name, rfc: data.parte1Rfc, dom: data.parte1Dom, color: T.cyan },
    { label: 'PARTE RECEPTORA', name: data.parte2Name, rfc: data.parte2Rfc, dom: data.parte2Dom, color: T.violet }].forEach((p, i) => {
    const px = T.mX + i * (boxW + 6)
    doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(px, y, boxW, 26, 2, 2, 'FD')
    doc.setFillColor(...p.color); doc.rect(px, y, 1.5, 26, 'F')
    doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...p.color)
    doc.text(p.label, px + 5, y + 5)
    doc.setFontSize(8.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text(doc.splitTextToSize(p.name || blank, boxW - 8), px + 5, y + 11)
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (p.rfc) doc.text(`RFC: ${p.rfc}`, px + 5, y + 20)
  })
  y += 33

  const _ORDINALES = ['','PRIMERA','SEGUNDA','TERCERA','CUARTA','QUINTA','SEXTA','SÉPTIMA','OCTAVA','NOVENA','DÉCIMA']
  let ci = 1

  const clausulas = [
    { titulo: `${_ORDINALES[ci++]} — OBJETO`, texto: `Las partes acuerdan mantener estricta confidencialidad sobre toda la Información Confidencial que sea divulgada por la Parte Divulgadora a la Parte Receptora con motivo de: ${data.objeto || blank}.` },
    { titulo: `${_ORDINALES[ci++]} — DEFINICIÓN DE INFORMACIÓN CONFIDENCIAL`, texto: 'Se considerará Información Confidencial toda aquella información técnica, comercial, financiera, estratégica, de clientes, proveedores, procesos internos, datos personales, know-how, modelos de negocio y cualquier otro dato que sea revelado de forma oral, escrita, digital o por cualquier otro medio, y que no sea de dominio público.' },
    { titulo: `${_ORDINALES[ci++]} — OBLIGACIONES DE LA PARTE RECEPTORA`, texto: 'La Parte Receptora se obliga a: (a) utilizar la Información Confidencial exclusivamente para los fines del presente acuerdo; (b) no divulgar, copiar, distribuir ni transmitir la información a terceros sin autorización escrita previa; (c) proteger la información con el mismo nivel de cuidado que aplica a su propia información confidencial, y en ningún caso con menos de diligencia razonable.' },
    { titulo: `${_ORDINALES[ci++]} — EXCLUSIONES`, texto: 'Las obligaciones de confidencialidad no aplican a información que: (a) sea o llegue a ser de dominio público sin incumplimiento del presente; (b) sea conocida por la Parte Receptora antes de su divulgación; (c) sea desarrollada de forma independiente; o (d) deba revelarse por mandato de autoridad competente, dando aviso previo a la Parte Divulgadora en la medida en que la ley lo permita.' },
    { titulo: `${_ORDINALES[ci++]} — VIGENCIA`, texto: `El presente acuerdo tendrá una vigencia de ${data.vigencia || '2 años'} a partir de la fecha de su firma, o hasta que la información deje de ser confidencial, lo que ocurra primero.` },
    { titulo: `${_ORDINALES[ci++]} — SANCIONES`, texto: 'El incumplimiento de las obligaciones establecidas dará derecho a la Parte Divulgadora a exigir el cese inmediato del uso o divulgación no autorizado, así como a reclamar los daños y perjuicios que el incumplimiento hubiere ocasionado, sin perjuicio de las sanciones penales aplicables.' },
    { titulo: `${_ORDINALES[ci++]} — JURISDICCIÓN`, texto: `Para la interpretación y cumplimiento del presente acuerdo, las partes se someten a los tribunales de ${data.jurisdiccion || data.lugar || blank}, renunciando a cualquier fuero que pudiera corresponderles.` },
  ]
  if (data.clausulasExtra) clausulas.push({ titulo: `${_ORDINALES[ci++]} — DISPOSICIONES ADICIONALES`, texto: data.clausulasExtra })

  for (const c of clausulas) {
    y = _checkY(y, 18)
    doc.setFontSize(9); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text(c.titulo, T.mX, y); y += 5
    doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
    y = _paraJ(doc, c.texto, y); y += 4
  }

  y = _checkY(y, 16)
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  y = _paraJ(doc, 'Leído el presente instrumento y enteradas las partes de su contenido y alcance legal, lo suscriben en señal de conformidad en la fecha indicada.', y); y += 14

  y = _checkY(y, 40)
  _firma(doc, T.mX + 8,      y, 75, `${data.parte1Name || blank}\nParte Divulgadora`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.parte2Name || blank}\nParte Receptora`)

  _footerTramite(doc, emisor, 'Se emiten dos originales de igual valor — Una copia para cada parte')
  doc.save(`nda-confidencialidad-${folio}.pdf`)
}

// ─── 13. CONVENIO DE PAGO EN PARCIALIDADES ───────────────────────────────────
export function pdfConvenioPago(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  const _checkY = (curY, needed = 20) => {
    if (curY + needed > 265) {
      doc.addPage()
      _footerTramite(doc, emisor, 'Original para el acreedor — Copia para el deudor')
      return _headerTramite(doc, 'CONVENIO DE PAGO EN PARCIALIDADES', folio, OPTS) + 4
    }
    return curY
  }

  let y = _headerTramite(doc, 'CONVENIO DE PAGO EN PARCIALIDADES', folio, OPTS)
  y += 3

  doc.setFontSize(9); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(`${data.lugar || blank}, a ${data.fecha || blank}.`, W - T.mX, y, { align: 'right' })
  y += 7

  // Partes
  const boxW = (W - T.mX * 2 - 6) / 2
  ;[{ label: 'ACREEDOR', name: data.acreedorName, rfc: data.acreedorRfc, dom: data.acreedorDom, color: T.blue },
    { label: 'DEUDOR', name: data.deudorName, rfc: data.deudorRfc, dom: data.deudorDom, color: T.orange }].forEach((p, i) => {
    const px = T.mX + i * (boxW + 6)
    doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(px, y, boxW, 26, 2, 2, 'FD')
    doc.setFillColor(...p.color); doc.rect(px, y, 1.5, 26, 'F')
    doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...p.color)
    doc.text(p.label, px + 5, y + 5)
    doc.setFontSize(8.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text(doc.splitTextToSize(p.name || blank, boxW - 8), px + 5, y + 11)
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (p.rfc) doc.text(`RFC: ${p.rfc}`, px + 5, y + 20)
    if (p.dom) { const dl = doc.splitTextToSize(`Dom.: ${p.dom}`, boxW - 8); doc.text(dl[0], px + 5, p.rfc ? y + 23 : y + 20) }
  })
  y += 33

  // Monto total y concepto
  const montoTotal = parseFloat(data.montoTotal || 0)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('DECLARACIÓN DEL ADEUDO', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  const texto1 = `Las partes reconocen que ${data.deudorName || blank} adeuda a ${data.acreedorName || blank} la cantidad total de $${montoTotal.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN (${numToLetras(montoTotal)}), por concepto de: ${data.concepto || blank}.`
  y = _paraJ(doc, texto1, y); y += 4

  y = _checkY(y, 14)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('ACUERDO DE PAGOS', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  const nPagos = parseInt(data.nPagos || 1)
  const montoParcial = montoTotal / nPagos
  const texto2 = `Las partes acuerdan liquidar la deuda mediante ${nPagos} ${nPagos === 1 ? 'pago' : 'pagos'} ${data.frecuencia || 'mensuales'} de $${montoParcial.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN (${numToLetras(montoParcial)}) cada uno, siendo el primero el día ${data.fechaPrimerPago || blank}${data.diaPago ? ` y los subsecuentes el día ${data.diaPago} de cada mes` : ''}.`
  y = _paraJ(doc, texto2, y); y += 4

  // Tabla de pagos
  if (nPagos > 1 && data.fechaPrimerPago) {
    y = _checkY(y, 10)
    const rows = []
    let fecha = new Date(data.fechaPrimerPago + 'T12:00:00')
    for (let i = 0; i < Math.min(nPagos, 24); i++) {
      rows.push([
        `${i + 1}`,
        fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
        `$${montoParcial.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
      ])
      // Avanzar según frecuencia
      const freq = (data.frecuencia || 'mensual').toLowerCase()
      if (freq.includes('sem') && !freq.includes('man')) fecha.setDate(fecha.getDate() + 7)
      else if (freq.includes('quinc')) fecha.setDate(fecha.getDate() + 15)
      else fecha.setMonth(fecha.getMonth() + 1)
    }
    autoTable(doc, {
      startY: y,
      head: [['#', 'Fecha de pago', 'Monto']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: T.ink, textColor: T.cyan, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: T.textInk },
      alternateRowStyles: { fillColor: [248, 250, 253] },
      columnStyles: { 0: { cellWidth: 12 }, 2: { halign: 'right' } },
      margin: { left: T.mX, right: T.mX },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  y = _checkY(y, 18)
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('INCUMPLIMIENTO', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk)
  const texto3 = `El incumplimiento de cualquier pago facultará al acreedor a exigir el pago total del saldo insoluto de forma inmediata${data.intereses ? `, más intereses moratorios del ${data.intereses}% mensual sobre el saldo vencido` : ''}. Se emitirán los comprobantes de pago correspondientes.`
  y = _paraJ(doc, texto3, y); y += 6

  y = _checkY(y, 16)
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5)
  y = _paraJ(doc, `Las partes se someten a los tribunales de ${data.jurisdiccion || data.lugar || blank} para todo lo relacionado con el presente convenio.`, y); y += 4
  y = _paraJ(doc, 'Leído el presente convenio y enteradas las partes de su contenido, lo suscriben de conformidad en todas sus hojas.', y); y += 14

  y = _checkY(y, 40)
  _firma(doc, T.mX + 8,      y, 75, `${data.acreedorName || blank}\nAcreedor`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.deudorName || blank}\nDeudor`)

  _footerTramite(doc, emisor, 'Original para el acreedor — Copia para el deudor · Firmar todas las hojas')
  doc.save(`convenio-pago-${folio}.pdf`)
}

// ─── 14. ORDEN DE SERVICIO ───────────────────────────────────────────────────
export function pdfOrdenServicio(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = data.folio || _folio()
  const blank = '________________________'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  let y = _headerTramite(doc, 'ORDEN DE SERVICIO', folio, OPTS)
  y += 2

  // Fecha y lugar — fila superior
  doc.setFontSize(9); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(`Fecha: ${data.fecha || blank}  ·  Lugar: ${data.lugar || blank}`, T.mX, y); y += 8

  // ── Bloque cliente / prestador ──
  const boxW = (W - T.mX * 2 - 6) / 2
  ;[{ label: 'CLIENTE / SOLICITANTE', name: data.clienteName, rfc: data.clienteRfc, tel: data.clienteTel, color: T.cyan },
    { label: 'PROVEEDOR / TÉCNICO', name: data.prestadorName, rfc: data.prestadorRfc, tel: data.prestadorTel, color: T.violet }].forEach((p, i) => {
    const px = T.mX + i * (boxW + 6)
    doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(px, y, boxW, 28, 2, 2, 'FD')
    doc.setFillColor(...p.color); doc.rect(px, y, 1.5, 28, 'F')
    doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...p.color)
    doc.text(p.label, px + 5, y + 5)
    doc.setFontSize(9); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text(doc.splitTextToSize(p.name || blank, boxW - 8), px + 5, y + 11)
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (p.rfc) doc.text(`RFC: ${p.rfc}`, px + 5, y + 19)
    if (p.tel) doc.text(`Tel: ${p.tel}`, px + 5, y + 24)
  })
  y += 34

  // ── Descripción del servicio ──
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('DESCRIPCIÓN DEL SERVICIO SOLICITADO', T.mX, y); y += 5
  const srvLines = doc.splitTextToSize(data.descripcion || blank, W - T.mX * 2)
  doc.setFillColor(248, 250, 253); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
  const srvH = Math.max(18, srvLines.length * 5 + 8)
  doc.roundedRect(T.mX, y, W - T.mX * 2, srvH, 2, 2, 'FD')
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  doc.text(srvLines, T.mX + 4, y + 6)
  y += srvH + 6

  // ── Materiales / equipos ──
  if (data.materiales) {
    doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('MATERIALES / EQUIPOS UTILIZADOS', T.mX, y); y += 5
    const matLines = doc.splitTextToSize(data.materiales, W - T.mX * 2)
    const matH = Math.max(14, matLines.length * 5 + 8)
    doc.setFillColor(248, 250, 253); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(T.mX, y, W - T.mX * 2, matH, 2, 2, 'FD')
    doc.setFont(T.font, 'normal'); doc.setFontSize(9); doc.setTextColor(...T.textInk)
    doc.text(matLines, T.mX + 4, y + 5)
    y += matH + 6
  }

  // ── Costo ──
  const monto  = parseFloat(data.monto || 0)
  const moneda = data.moneda || 'MXN'
  const tc     = parseFloat(data.tc || 0)
  const mxnEq  = (moneda !== 'MXN' && tc) ? monto * tc : null
  if (monto > 0) {
    doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('COSTO DEL SERVICIO', T.mX, y); y += 5
    doc.setFillColor(244, 252, 247); doc.setDrawColor(...T.greenD); doc.setLineWidth(0.2)
    doc.roundedRect(T.mX, y, W - T.mX * 2, 16, 2, 2, 'FD')
    doc.setFontSize(10); doc.setFont(T.font, 'bold'); doc.setTextColor(...[22,163,74])
    const costoStr = mxnEq
      ? `$${mxnEq.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN  (equivalente a ${monto.toLocaleString('es-MX',{minimumFractionDigits:2})} ${moneda} × T.C. $${tc})`
      : `$${monto.toLocaleString('es-MX',{minimumFractionDigits:2})} MXN (${numToLetras(monto)})`
    doc.text(costoStr, W / 2, y + 10, { align: 'center' })
    y += 22
    if (data.formaPago) {
      doc.setFontSize(8.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
      doc.text(`Forma de pago: ${data.formaPago}`, T.mX, y); y += 6
    }
  }

  // ── Notas técnicas ──
  if (data.notasTecnicas) {
    doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('NOTAS TÉCNICAS / OBSERVACIONES', T.mX, y); y += 5
    const ntLines = doc.splitTextToSize(data.notasTecnicas, W - T.mX * 2)
    const ntH = Math.max(14, ntLines.length * 5 + 8)
    doc.setFillColor(254, 252, 232); doc.setDrawColor(...T.yellow); doc.setLineWidth(0.2)
    doc.roundedRect(T.mX, y, W - T.mX * 2, ntH, 2, 2, 'FD')
    doc.setFont(T.font, 'normal'); doc.setFontSize(9); doc.setTextColor(...T.textInk)
    doc.text(ntLines, T.mX + 4, y + 5)
    y += ntH + 6
  }

  // ── Autorización de conformidad ──
  y += 6
  doc.setFontSize(9); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textInk)
  y = _paraJ(doc, 'El cliente declara haber recibido el servicio a su entera satisfacción, conforme a lo descrito en la presente orden.', y); y += 14

  _firma(doc, T.mX + 8,      y, 75, `${data.clienteName || blank}\nCliente — Firma de conformidad`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.prestadorName || blank}\nProveedor / Técnico`)

  _footerTramite(doc, emisor, 'Original para el cliente — Copia para el proveedor')
  doc.save(`orden-servicio-${folio}.pdf`)
}

// ─── 15. CARTA RESPONSIVA ────────────────────────────────────────────────────
export function pdfCartaResponsiva(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const OPTS  = { coverDataUrl: data.cover_data_url, proyName: data.proyecto_nombre }

  let y = _headerTramite(doc, 'CARTA RESPONSIVA', folio, OPTS)
  y += 4

  // Lugar y fecha
  doc.setFontSize(9); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(`${data.lugar || blank}, a ${data.fecha || blank}.`, W - T.mX, y, { align: 'right' })
  y += 10

  // Descripción del bien
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('I.   BIEN / ACTIVO ENTREGADO', T.mX, y); y += 5
  doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
  const bienLines = doc.splitTextToSize(data.bienDescripcion || blank, W - T.mX * 2 - 8)
  const bienH = Math.max(18, bienLines.length * 5 + 8)
  doc.roundedRect(T.mX, y, W - T.mX * 2, bienH, 2, 2, 'FD')
  doc.setFillColor(...T.orange); doc.rect(T.mX, y, 1.5, bienH, 'F')
  doc.setFont(T.font, 'bold'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  doc.text(bienLines, T.mX + 6, y + 6)
  if (data.bienSerie) {
    doc.setFont(T.font, 'normal'); doc.setFontSize(8); doc.setTextColor(...T.textMid)
    doc.text(`Serie / N° inventario: ${data.bienSerie}`, T.mX + 6, y + bienH - 4)
  }
  y += bienH + 6

  // Responsable y propietario
  const boxW = (W - T.mX * 2 - 6) / 2
  ;[{ label: 'RESPONSABLE / USUARIO', name: data.responsableName, rfc: data.responsableRfc, dom: data.responsableDom, color: T.orange },
    { label: 'PROPIETARIO / EMPRESA', name: data.propietarioName, rfc: data.propietarioRfc, color: T.blue }].forEach((p, i) => {
    const px = T.mX + i * (boxW + 6)
    doc.setFillColor(245, 248, 252); doc.setDrawColor(...T.textDim); doc.setLineWidth(0.2)
    doc.roundedRect(px, y, boxW, 26, 2, 2, 'FD')
    doc.setFillColor(...p.color); doc.rect(px, y, 1.5, 26, 'F')
    doc.setFontSize(7); doc.setFont(T.font, 'bold'); doc.setTextColor(...p.color)
    doc.text(p.label, px + 5, y + 5)
    doc.setFontSize(8.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text(doc.splitTextToSize(p.name || blank, boxW - 8), px + 5, y + 11)
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (p.rfc) doc.text(`RFC: ${p.rfc}`, px + 5, y + 20)
    if (p.dom) { const dl = doc.splitTextToSize(`Dom.: ${p.dom}`, boxW - 8); doc.text(dl[0], px + 5, p.rfc ? y + 23 : y + 20) }
  })
  y += 33

  // Cuerpo legal
  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('II.  DECLARACIÓN DE RESPONSABILIDAD', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  const texto1 = `Por medio de la presente, yo ${data.responsableName || blank}${data.responsableRfc ? ', RFC: ' + data.responsableRfc : ''}, me hago responsable del bien descrito en la sección I del presente documento, propiedad de ${data.propietarioName || blank}, que me ha sido entregado en comodato/préstamo para el siguiente uso: ${data.uso || blank}.`
  y = _paraJ(doc, texto1, y); y += 4

  doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
  doc.text('III. COMPROMISOS', T.mX, y); y += 5
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5); doc.setTextColor(...T.textInk)
  const compromisos = [
    'Usar el bien exclusivamente para el fin indicado y de manera responsable.',
    'Mantener el bien en buen estado de conservación y funcionamiento.',
    'No ceder, prestar, modificar ni subcontratar el bien sin autorización escrita del propietario.',
    'Devolver el bien en las mismas condiciones en que fue recibido, salvo desgaste natural por uso normal.',
    'Responsabilizarme económicamente por cualquier daño, pérdida o robo que ocurra durante mi posesión del bien.',
  ]
  if (data.compromisosExtra) compromisos.push(data.compromisosExtra)
  compromisos.forEach(c => {
    const ls = doc.splitTextToSize(`• ${c}`, W - T.mX * 2 - 6)
    doc.text(ls, T.mX + 4, y)
    y += ls.length * 5 + 1
  })
  y += 3

  if (data.vigencia) {
    doc.setFontSize(9.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('IV.  VIGENCIA', T.mX, y); y += 5
    doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textInk)
    y = _paraJ(doc, `La presente carta responsiva tendrá vigencia ${data.vigencia}.`, y); y += 4
  }

  y += 4
  doc.setFont(T.font, 'normal'); doc.setFontSize(9.5)
  y = _paraJ(doc, 'Firmo la presente carta responsiva de manera libre y voluntaria, consciente de las obligaciones que asumo.', y); y += 14

  _firma(doc, T.mX + 8,      y, 75, `${data.responsableName || blank}\nResponsable`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.propietarioName || blank}\nPropietario`)

  _footerTramite(doc, emisor, 'Original para el propietario — Copia para el responsable')
  doc.save(`carta-responsiva-${folio}.pdf`)
}

// ─── 16. BITÁCORA DE ACTIVIDADES ────────────────────────────────────────────
/**
 * Exporta las entradas de la Bitácora de un proyecto en PDF.
 *
 * @param {Array<{id:string,type:string,content:string,metadata:Object}>} entries
 * @param {{content?:string,metadata?:{nombre?:string}}} proyecto
 * @param {{nombre?:string,rfc?:string}} emisor
 */
export function pdfBitacora(entries = [], proyecto = {}, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const H     = doc.internal.pageSize.getHeight()
  const now   = new Date()
  const slug  = (proyecto.content || proyecto.metadata?.nombre || 'proyecto')
                  .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20)
  const ymd   = now.toISOString().slice(0, 10).replace(/-/g, '')
  const folio = `BIT-${slug}-${ymd}`

  // ── Header estándar ────────────────────────────────────────────────────────
  let y = _headerTramite(doc, 'BITÁCORA DE ACTIVIDADES', folio, { coverDataUrl: proyecto.cover_data_url, proyName: proyecto.content || proyecto.metadata?.nombre })

  // ── Watermark vertical (costilla izquierda) ────────────────────────────────
  const _drawWatermark = () => {
    doc.setFontSize(6)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(210, 218, 230)
    doc.text('Documento controlado digitalmente por Nexus OS', 4, H * 0.72, { angle: 90 })
  }
  _drawWatermark()

  // ── Meta del proyecto ──────────────────────────────────────────────────────
  const proyName  = proyecto.content || proyecto.metadata?.nombre || '—'
  const fechaHoy  = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFontSize(8.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text(
    `Proyecto: ${proyName}   ·   Emitido: ${fechaHoy}   ·   Registros: ${entries.length}`,
    T.mX, y
  )
  y += 8

  // ── Formateador de detalles_clave por contexto ─────────────────────────────
  const _fmtDetalles = (ctx, det) => {
    if (!det || typeof det !== 'object') return '—'
    try {
      switch (ctx) {
        case 'CONTENIDO_POST':
          return [
            det.plataforma       ? `Plataforma: ${det.plataforma}`                                  : '',
            det.tipo_contenido   ? `Tipo: ${det.tipo_contenido}`                                     : '',
            det.titulo_tema      ? `Tema: ${det.titulo_tema}`                                        : '',
            Array.isArray(det.keywords) && det.keywords.length
                                 ? `KW: ${det.keywords.slice(0, 3).join(', ')}`                      : '',
            det.hora_publicacion ? `Hora: ${String(det.hora_publicacion).slice(0, 16)}`              : '',
            det.url_publicado    ? `URL: ${String(det.url_publicado).slice(0, 30)}`                  : '',
          ].filter(Boolean).join('\n')
        case 'ADMIN_FINANZAS':
          return [
            det.cuenta               ? `Cuenta: ${det.cuenta}`                                       : '',
            det.categoria            ? `Cat: ${det.categoria}`                                       : '',
            det.monto_informativo != null
                                     ? `Monto: $${Number(det.monto_informativo).toLocaleString('es-MX')}` : '',
            det.periodo              ? `Periodo: ${det.periodo}`                                     : '',
            det.concepto             ? `Concepto: ${det.concepto}`                                   : '',
          ].filter(Boolean).join('\n')
        case 'GESTION_OBRA':
          return [
            det.etapa         ? `Etapa: ${det.etapa}`                                                : '',
            det.contratista   ? `Cont: ${det.contratista}`                                           : '',
            det.avance_pct != null ? `Avance: ${det.avance_pct}%`                                   : '',
            det.area_ubicacion ? `Área: ${det.area_ubicacion}`                                       : '',
            det.observacion   ? `Obs: ${String(det.observacion).slice(0, 50)}`                       : '',
          ].filter(Boolean).join('\n')
        case 'TRAMITE':
          return [
            det.tipo_doc        ? `Doc: ${det.tipo_doc}`                                             : '',
            det.contraparte     ? `Parte: ${det.contraparte}`                                        : '',
            det.estado_tramite  ? `Estado: ${det.estado_tramite}`                                    : '',
            det.folio_nexus     ? `Folio: ${det.folio_nexus}`                                        : '',
          ].filter(Boolean).join('\n')
        case 'GENERAL':
          return [
            det.descripcion ? String(det.descripcion).slice(0, 110)                                  : '',
            Array.isArray(det.etiquetas) && det.etiquetas.length
                            ? `Tags: ${det.etiquetas.slice(0, 4).join(', ')}`                        : '',
          ].filter(Boolean).join('\n')
        default:
          return JSON.stringify(det).slice(0, 100)
      }
    } catch { return '—' }
  }

  const _ctxLabel = ctx => ({
    CONTENIDO_POST: 'Contenido/Post',
    ADMIN_FINANZAS: 'Admin Finanzas',
    GESTION_OBRA:   'Gestión Obra',
    TRAMITE:        'Trámite',
    GENERAL:        'General',
  }[ctx] || ctx || '—')

  // ── Construir filas ────────────────────────────────────────────────────────
  const head = [['Fecha y Hora', 'Contexto', 'Actividad / Concepto', 'Datos Clave', 'Evidencia', 'Impacto / Estado']]
  const body = entries.length
    ? entries.map(e => {
        const m   = e.metadata || {}
        const det = m.detalles_clave || {}
        const imp = m.impacto_metricas || {}
        const fecha = m.fecha_ejecucion
          ? new Date(m.fecha_ejecucion).toLocaleString('es-MX', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          : '—'
        const evidencia = m.enlace_evidencia
          ? String(m.enlace_evidencia).length > 32
            ? String(m.enlace_evidencia).slice(0, 30) + '…'
            : String(m.enlace_evidencia)
          : '—'
        const impTxt = Object.keys(imp).length
          ? Object.entries(imp).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('\n')
          : '—'
        return [
          fecha,
          _ctxLabel(m.modulo_contexto),
          e.content || '—',
          _fmtDetalles(m.modulo_contexto, det),
          evidencia,
          impTxt,
        ]
      })
    : [['—', '—', 'Sin registros en este período', '—', '—', '—']]

  // ── Tabla principal — 178mm total (210 - 16*2) ────────────────────────────
  // 24 + 24 + 44 + 42 + 24 + 20 = 178
  autoTable(doc, {
    startY: y,
    head,
    body,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
      font: T.font,
      overflow: 'linebreak',
      lineColor: [220, 228, 240],
      lineWidth: 0.1,
      valign: 'top',
      textColor: T.textInk,
    },
    headStyles: {
      fillColor: T.ink,
      textColor: T.cyan,
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      lineColor: T.cyan,
      lineWidth: { bottom: 0.8 },
    },
    alternateRowStyles: { fillColor: T.rowAlt },
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 44 },
      3: { cellWidth: 42, fontSize: 7 },
      4: { cellWidth: 24, fontSize: 7, textColor: T.textMid },
      5: { cellWidth: 20, fontSize: 7 },
    },
    margin: { left: T.mX, right: T.mX },
    didDrawPage: () => { _drawWatermark() },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── Firmas ─────────────────────────────────────────────────────────────────
  if (y > H - 55) { doc.addPage(); _drawWatermark(); y = 24 }

  doc.setFontSize(8); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
  doc.text('Firmas de conformidad:', T.mX, y); y += 10

  _firma(doc, T.mX + 6,        y, 74, 'Responsable de Ejecución')
  _firma(doc, W - T.mX - 80,   y, 74, 'Conformidad de Recepción')

  // ── Footer ─────────────────────────────────────────────────────────────────
  _footerTramite(doc, emisor, 'Original para el solicitante — Copia para archivo del proyecto')
  doc.save(`bitacora-${folio}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENDA FINANCIERA — Reporte de obligaciones y flujo de caja
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Genera PDF del reporte Agenda Financiera.
 * @param {{ periodLabel:string, items:Array, kpis:Object }} data
 * @param {Object} emisor
 */
export function pdfAgendaFinanciera(data = {}, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const H     = doc.internal.pageSize.getHeight()
  const folio = _folio()

  let y = _headerReport(doc, 'Agenda Financiera', (data.periodLabel || '').toUpperCase(), folio)

  // ── KPI row ────────────────────────────────────────────────────────────────
  const kpis = data.kpis || {}
  const kpiDefs = [
    { label:'Saldo Disponible',   value: kpis.saldo ?? 0,             clr: (kpis.saldo ?? 0) >= 0 ? T.green    : T.red    },
    { label:'Próximos Pagos',     value: kpis.proximosPagos ?? 0,     clr: T.red    },
    { label:'Ingresos Esperados', value: kpis.ingresosEsperados ?? 0, clr: T.green  },
    { label:'Cash Flow Neto',     value: kpis.cashFlow ?? 0,          clr: (kpis.cashFlow ?? 0) >= 0 ? T.green : T.red },
  ]
  const kW = (W - T.mX * 2 - 9) / 4
  kpiDefs.forEach((k, i) => {
    const x = T.mX + i * (kW + 3)
    doc.setFillColor(...T.surface)
    doc.roundedRect(x, y, kW, 18, 2, 2, 'F')
    doc.setTextColor(...k.clr)
    doc.setFontSize(10); doc.setFont(T.font, 'bold')
    const sign = k.label === 'Cash Flow Neto' && k.value > 0 ? '+' : ''
    doc.text(sign + fmt$(k.value), x + kW / 2, y + 11, { align: 'center' })
    doc.setTextColor(...T.textMid)
    doc.setFontSize(6); doc.setFont(T.font, 'normal')
    doc.text(k.label.toUpperCase(), x + kW / 2, y + 16.5, { align: 'center' })
  })
  y += 24

  // ── Alerta banner ───────────────────────────────────────────────────────────
  const alerts = kpis.alertasCount || 0
  if (alerts > 0) {
    doc.setFillColor(...T.redD)
    doc.roundedRect(T.mX, y, W - T.mX * 2, 9, 2, 2, 'F')
    doc.setTextColor(...T.white); doc.setFontSize(7.5); doc.setFont(T.font, 'bold')
    doc.text(`⚠  ${alerts} obligación${alerts !== 1 ? 'es' : ''} urgente${alerts !== 1 ? 's' : ''} — vencen en ≤ 3 días`,
      W / 2, y + 6, { align: 'center' })
    y += 14
  } else { y += 4 }

  // ── Tabla de obligaciones ───────────────────────────────────────────────────
  const items = data.items || []
  if (items.length === 0) {
    doc.setTextColor(...T.textMid); doc.setFontSize(9); doc.setFont(T.font, 'normal')
    doc.text('Sin vencimientos en el período seleccionado.', W / 2, y + 12, { align: 'center' })
  } else {
    doc.setFontSize(8); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textMain)
    doc.text('OBLIGACIONES DEL PERÍODO', T.mX, y + 6); y += 10

    autoTable(doc, {
      startY:  y,
      margin:  { left: T.mX, right: T.mX, top: 36, bottom: 18 },
      theme:   'plain',
      styles:  { font: T.font, fontSize: 8.5, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 }, textColor: T.textInk },
      headStyles: { fillColor: T.ink, textColor: T.textMain, fontStyle: 'bold', fontSize: 7.5, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 24 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24, halign: 'right' },
      },
      head: [['Estado', 'Concepto', 'Tipo', 'Fecha', 'Monto']],
      body: items.map(it => {
        const badge = it.paid ? 'PAGADO' : it.diffDays < 0 ? `VENCIDO (${Math.abs(it.diffDays)}d)` : it.diffDays === 0 ? 'HOY' : it.diffDays === 1 ? 'MAÑANA' : `${it.diffDays} días`
        const dateStr = it.date instanceof Date
          ? it.date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
          : String(it.date || '')
        return [badge, it.label || '', it.type || '', dateStr, it.amount ? fmt$(it.amount) : '—']
      }),
      bodyStyles:          { fillColor: [248, 250, 253] },
      alternateRowStyles:  { fillColor: [255, 255, 255] },
      willDrawCell: ({ section, column, row, cell }) => {
        if (section !== 'body' || column.index !== 0) return
        const it = items[row.index]
        if (!it) return
        if (it.paid) { cell.styles.textColor = T.textMid; return }
        cell.styles.fontStyle = 'bold'
        cell.styles.textColor = it.diffDays < 0 ? T.redD : it.diffDays <= 3 ? [185,90,20] : it.diffDays <= 7 ? [160,120,0] : T.greenD
      },
      didDrawPage: () => _headerReport(doc, 'Agenda Financiera', (data.periodLabel || '').toUpperCase(), folio),
    })
  }

  // ── Footer en cada página ───────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    const fY = H - 12
    doc.setDrawColor(...T.textDim); doc.setLineWidth(0.3)
    doc.line(T.mX, fY - 4, W - T.mX, fY - 4)
    doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text(`${T.brand} · ${T.url}`, T.mX, fY)
    doc.text(`Pág. ${p} / ${pages}`, W - T.mX, fY, { align: 'right' })
    if (emisor?.name) doc.text(emisor.name, W / 2, fY, { align: 'center' })
  }

  doc.save(`agenda-financiera-${folio}.pdf`)
}
