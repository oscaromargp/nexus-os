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
function _headerReport(doc, title, subtitle, folio) {
  const W = doc.internal.pageSize.getWidth()
  // Barra oscura
  doc.setFillColor(...T.ink)
  doc.rect(0, 0, W, 26, 'F')
  // Línea cyan
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(1.8)
  doc.line(0, 26, W, 26)
  // NEXUS OS — izquierda
  doc.setTextColor(...T.cyan)
  doc.setFontSize(12)
  doc.setFont(T.font, 'bold')
  doc.text(T.brand, T.mX, 17)
  // Título — derecha arriba
  doc.setTextColor(...T.textMain)
  doc.setFontSize(9)
  doc.setFont(T.font, 'normal')
  doc.text(title.toUpperCase(), W - T.mX, 11, { align: 'right' })
  // Folio — derecha abajo
  if (folio) {
    doc.setTextColor(...T.textMid)
    doc.setFontSize(7)
    doc.text('Folio: ' + folio, W - T.mX, 18, { align: 'right' })
  }
  // Subtítulo (bajo línea cyan)
  if (subtitle) {
    doc.setTextColor(...T.textMid)
    doc.setFontSize(8)
    doc.setFont(T.font, 'normal')
    const lines = doc.splitTextToSize(subtitle, W - T.mX * 2)
    doc.text(lines, T.mX, 33)
    return 38 + (lines.length - 1) * 4
  }
  return 32
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
export function pdfEstadoCuenta(orq, list, kpis, tcCache = {}, filters = {}, emisor = {}) {
  if (!list?.length) return

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const now   = new Date()
  const folio = _folio()
  const saldo = list[0]?._balance ?? 0
  const tcUsdt = tcCache['USDT']?.price || 0

  let y = _headerReport(doc,
    'Estado de Cuenta',
    `${orq?.nombre || 'Orquestador'} · ${filters.dateFrom || 'Inicio'} → ${filters.dateTo || 'Hoy'}`,
    folio)

  // ── Saldo principal ──
  doc.setFillColor(...T.surface)
  doc.roundedRect(T.mX, y, W - T.mX * 2, 30, 3, 3, 'F')
  doc.setDrawColor(...T.cyan)
  doc.setLineWidth(0.5)
  doc.line(T.mX, y, T.mX + 22, y)
  doc.setTextColor(...T.textMid)
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'normal')
  doc.text('SALDO ACTUAL AL ' + now.toLocaleDateString('es-MX').toUpperCase(), T.mX + 5, y + 8)
  const saldoColor = saldo >= 0 ? T.green : T.red
  doc.setTextColor(...saldoColor)
  doc.setFontSize(22)
  doc.setFont(T.font, 'bold')
  doc.text(fmt$(saldo), T.mX + 5, y + 22)
  // Equivalente USDT
  if (tcUsdt > 1) {
    const eqUsdt = (saldo / tcUsdt).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    doc.setFontSize(9)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.yellow)
    doc.text(`≈ ${eqUsdt} USDT`, W - T.mX - 5, y + 14, { align: 'right' })
    doc.setFontSize(7)
    doc.setTextColor(...T.textMid)
    doc.text(`T/C: $${tcUsdt.toFixed(2)}`, W - T.mX - 5, y + 21, { align: 'right' })
  }
  y += 35

  // ── Saldo en letras ──
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'italic')
  doc.setTextColor(...T.textMid)
  const letLines = doc.splitTextToSize(numToLetras(saldo), W - T.mX * 2)
  doc.text(letLines, T.mX, y)
  y += letLines.length * 4 + 6

  // ── KPIs ──
  const kW = (W - T.mX * 2 - 9) / 4
  _kpi(doc, T.mX,            y, kW, 22, 'Entradas',    fmt$(kpis.entradas), T.green)
  _kpi(doc, T.mX + kW + 3,   y, kW, 22, 'Salidas',     fmt$(kpis.salidas),  T.red)
  _kpi(doc, T.mX + (kW+3)*2, y, kW, 22, 'Neto',        fmt$(kpis.net),      kpis.net >= 0 ? T.green : T.red)
  _kpi(doc, T.mX + (kW+3)*3, y, kW, 22, 'Movimientos', String(list.length), T.cyan)
  y += 28

  // ── Tabla ──
  _autoTable(doc, {
    startY: y,
    head: [['FECHA', 'CONCEPTO / BENEFICIARIO', 'CRIPTO', 'CARGO (−)', 'ABONO (+)', 'SALDO']],
    body: list.map(m => {
      const net = m.tipo === 'entrada' && m.comision != null
        ? Math.round((m.monto_mxn ?? 0) * m.comision * 100) / 100
        : (m.monto_mxn ?? 0)
      const isCan    = m.estado === 'cancelado'
      const isCrypto = m.moneda !== 'MXN' && m.moneda !== 'USD'
      const concepto = m.tipo === 'entrada'
        ? (m.ordenante || m.notas || 'Depósito')
        : (m.beneficiario || m.notas || 'Retiro')
      return [
        m.fecha,
        concepto + (m.banco ? '\n' + m.banco : ''),
        isCrypto && !isCan ? m.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 6 }) + ' ' + m.moneda : '',
        !isCan && m.tipo === 'salida'  ? fmt$(net)       : '',
        !isCan && m.tipo === 'entrada' ? fmt$(net)       : '',
        isCan ? 'CANCELADO' : fmt$(m._balance),
      ]
    }),
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', textColor: T.textMid },
      1: { cellWidth: 60 },
      2: { cellWidth: 22, halign: 'right', textColor: T.orange },
      3: { cellWidth: 26, halign: 'right', textColor: T.red },
      4: { cellWidth: 26, halign: 'right', textColor: T.green },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const bal = list[data.row.index]?._balance ?? 0
        data.cell.styles.textColor = bal >= 0 ? T.greenD : T.redD
      }
    },
    didDrawPage: (data) => {
      _headerReport(doc, 'Estado de Cuenta',
        `${orq?.nombre || ''} · ${filters.dateFrom || ''} → ${filters.dateTo || 'Hoy'}`, folio)
      _footer(doc, data.pageNumber, doc.internal.getNumberOfPages(), emisor)
    },
  })

  _footer(doc, 1, doc.internal.getNumberOfPages(), emisor)
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

  let y = _headerReport(doc, 'Reporte de Proyecto',
    `${meta.name || proyecto.content} · ${now.toLocaleDateString('es-MX')}`, folio)

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
        _headerReport(doc, 'Reporte de Proyecto', meta.name || '', folio)
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
        _headerReport(doc, 'Reporte de Proyecto', meta.name || '', folio)
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

/** Helper: párrafo fluido */
function _para(doc, text, y, indent = T.mX, maxW = null) {
  const W = doc.internal.pageSize.getWidth()
  const w = maxW ?? W - indent - T.mX
  const lines = doc.splitTextToSize(text, w)
  doc.text(lines, indent, y)
  return y + lines.length * 5
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

  let y = _headerDoc(doc, 'Prórroga', folio)

  // Título del documento
  y += 8
  doc.setFontSize(14)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text('SOLICITUD DE PRÓRROGA DE PAGO DE RENTA', W / 2, y, { align: 'center' })
  y += 4
  doc.setFontSize(8)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text('Documento oficial generado por Nexus OS', W / 2, y + 4, { align: 'center' })
  y += 12

  // Línea separadora
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.3)
  doc.line(T.mX, y, W - T.mX, y)
  y += 8

  // Lugar y fecha
  const { dia='__', mes='____________', anio='20__' } = data
  doc.setFontSize(9)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  doc.text(`${data.lugar || blank}, a ${dia} de ${mes} de ${anio}.`, W - T.mX, y, { align: 'right' })
  y += 8

  // Destinatario
  doc.setFont(T.font, 'bold')
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
  const cuerpo = `Yo, ${data.arrendatarioName || blank}, con domicilio en ${data.arrendatarioDom || blank}, en calidad de arrendatario del espacio en renta mencionado, comparezco para solicitar de manera respetuosa una prórroga en el pago correspondiente al mes de ${data.mesRenta || '[mes]'} del año ${anio}.`
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

  y += 20
  doc.setFontSize(8)
  doc.setTextColor(...T.textMid)
  doc.text(`Copia para: ${data.arrendadorName || blank}`, T.mX, y)

  _footer(doc, 1, 1, emisor)
  doc.save(`prorroga-renta-${folio}.pdf`)
}

// ─── 6. PAGARÉ ───────────────────────────────────────────────────────────────
export function pdfPagare(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const monto = parseFloat(data.monto || 0)
  const montoFmt   = monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const montoLetra = numToLetras(monto)

  let y = _headerDoc(doc, 'Pagaré', folio)
  y += 8

  // Título espaciado
  doc.setFontSize(20)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text('P  A  G  A  R  É', W / 2, y, { align: 'center' })
  y += 4
  doc.setFontSize(8)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text('Título de crédito', W / 2, y + 3, { align: 'center' })
  y += 10

  // Caja de monto
  y = _amountBox(doc, y, monto, montoLetra)
  y += 2

  // Datos de lugar/fecha
  doc.setFontSize(9.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  doc.text(`Lugar: ${data.lugar || blank}`, T.mX, y)
  doc.text(`Fecha: ${data.fechaLarga || new Date().toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric'})}`, W / 2, y)
  y += 8

  // Texto legal
  const legal = `A través del presente pagaré, yo ${data.deudorName || blank} me comprometo a pagar incondicionalmente la cantidad de $${montoFmt} (${montoLetra}) a la orden de ${data.benefName || blank} por concepto de "${data.concepto || blank}". Dicha cantidad será liquidada el día ${data.fechaPago || blank}.`
  doc.setFontSize(9.5)
  y = _para(doc, legal, y)
  y += 4

  if (data.metodo) {
    doc.setFont(T.font, 'bold')
    doc.setFontSize(9)
    doc.text('Método de pago:', T.mX, y)
    doc.setFont(T.font, 'normal')
    doc.text(`${data.metodo}${data.referencia ? ' · Ref: ' + data.referencia : ''}`, T.mX + 38, y)
    y += 7
  }

  // Bloques de ID
  const idBlock = (title, name, curp, rfc, elect, pasap, dir) => {
    doc.setFillColor(245, 248, 252)
    doc.setDrawColor(...T.textDim)
    doc.setLineWidth(0.2)
    doc.roundedRect(T.mX, y, W - T.mX * 2, 34, 2, 2, 'FD')
    doc.setFontSize(8)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.textInk)
    doc.text(`Datos del ${title}`, T.mX + 4, y + 6)
    doc.setFont(T.font, 'normal')
    doc.setFontSize(8)
    const col1 = T.mX + 4, col2 = W / 2
    doc.text(`Nombre: ${name || blank}`, col1, y + 12)
    doc.text(`CURP: ${curp || blank}`, col1, y + 18)
    doc.text(`RFC: ${rfc || blank}`, col2, y + 18)
    doc.text(`Clave Electoral: ${elect || blank}`, col1, y + 24)
    doc.text(`Pasaporte: ${pasap || blank}`, col2, y + 24)
    if (dir) {
      doc.setFontSize(7.5)
      const dLines = doc.splitTextToSize(`Dir: ${dir}`, W - T.mX * 2 - 8)
      doc.text(dLines[0], col1, y + 30)
    }
    return y + 38
  }

  y = idBlock('Beneficiario', data.benefName, data.bCurp, data.bRfc, data.bElect, data.bPasap, data.bDir)
  y += 2
  y = idBlock('Emisor (Deudor)', data.deudorName, data.dCurp, data.dRfc, data.dElect, data.dPasap, data.dDir)
  y += 6

  // Interés moratorio
  doc.setFontSize(8.5)
  doc.setFont(T.font, 'italic')
  doc.setTextColor(...T.textMid)
  y = _para(doc, 'En caso de incumplimiento, este pagaré causará un interés moratorio del 2.5% mensual sobre el saldo insoluto, contado a partir de la fecha de vencimiento.', y)
  y += 8

  // Firmas
  _firma(doc, T.mX + 10,      y + 18, 70, `${data.benefName || blank}\nBeneficiario`)
  _firma(doc, W - T.mX - 80,  y + 18, 70, `${data.deudorName || blank}\nQuien suscribe`)

  _footer(doc, 1, 1, emisor)
  doc.save(`pagare-${folio}.pdf`)
}

// ─── 7. RECIBO DE DINERO ─────────────────────────────────────────────────────
export function pdfRecibo(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const monto = parseFloat(data.monto || 0)
  const montoLetra = numToLetras(monto)

  let y = _headerDoc(doc, 'Recibo', folio)
  y += 8

  doc.setFontSize(16)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text('RECIBO DE DINERO', W / 2, y, { align: 'center' })
  y += 10

  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.3)
  doc.line(T.mX, y, W - T.mX, y)
  y += 8

  // Lugar y fecha
  doc.setFontSize(9.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  doc.text(`En ${data.lugar || blank}, a ${data.fecha || blank}`, W - T.mX, y, { align: 'right' })
  y += 10

  // Cuerpo
  const cuerpo = `Por medio del presente, hago constar que he recibido de: ${data.entreganteName || blank}, la cantidad de:`
  y = _para(doc, cuerpo, y)
  y += 2

  // Caja de monto
  y = _amountBox(doc, y, monto, montoLetra)
  y += 2

  const concepto = `Por concepto de: ${data.concepto || blank}.`
  y = _para(doc, concepto, y)
  y += 4

  if (data.via) {
    doc.setFont(T.font, 'bold')
    doc.setFontSize(9)
    doc.text('Vía:', T.mX, y)
    doc.setFont(T.font, 'normal')
    y = _para(doc, `${data.via}${data.receptorName && data.via !== 'Efectivo / Cash' ? ' · A nombre de ' + data.receptorName : ''}`, y, T.mX + 12)
    y += 2
  }

  y = _para(doc, 'Este recibo se extiende para los fines legales a que haya lugar, en la fecha antes mencionada.', y + 2)
  y += 20

  // Firmas
  _firma(doc, T.mX + 10,     y, 70, `${data.receptorName || blank}\n(Quien recibe)`)
  _firma(doc, W - T.mX - 80, y, 70, `${data.entreganteName || blank}\n(Quien entrega)`)

  _footer(doc, 1, 1, emisor)
  doc.save(`recibo-dinero-${folio}.pdf`)
}

// ─── 8. CARTA PODER ──────────────────────────────────────────────────────────
export function pdfCartaPoder(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'

  let y = _headerDoc(doc, 'Carta Poder', folio)
  y += 8

  doc.setFontSize(16)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text('C A R T A   P O D E R', W / 2, y, { align: 'center' })
  y += 4
  doc.setFontSize(8.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  const dest = `Para: ${data.destinatario || '[Institución o destinatario]'}`
  doc.text(dest, W / 2, y + 4, { align: 'center' })
  y += 12

  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.3)
  doc.line(T.mX, y, W - T.mX, y)
  y += 8

  // Lugar y fecha
  doc.setFontSize(9.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  doc.text(`${data.lugar || blank}, a ${data.fecha || blank}.`, W - T.mX, y, { align: 'right' })
  y += 10

  // Cuerpo legal
  const cuerpo1 = `Yo, ${data.otorgName || blank}, identificado con ${data.otorgIdType || 'INE/IFE'}: ${data.otorgIdNum || blank}, con domicilio en ${data.otorgDom || blank};`
  y = _para(doc, cuerpo1, y)
  y += 5

  const cuerpo2 = `Por medio de la presente, otorgo PODER GENERAL AMPLIO Y SUFICIENTE en términos de lo dispuesto por el Código Civil Federal, a favor de: ${data.apodName || blank}, identificado con ${data.apodIdType || 'INE/IFE'}: ${data.apodIdNum || blank}, con domicilio en ${data.apodDom || blank};`
  y = _para(doc, cuerpo2, y)
  y += 5

  const facultades = data.facultades
    || `Para que en mi nombre y representación pueda realizar los siguientes actos: ${data.actos || '[Describir los actos autorizados]'}. Asimismo, con facultades para firmar documentos, gestionar trámites y realizar todas las acciones necesarias para el cumplimiento del objeto de este poder.`
  y = _para(doc, facultades, y)
  y += 5

  y = _para(doc, 'El presente poder tendrá vigencia mientras no sea revocado expresamente por el otorgante mediante escrito dirigido al apoderado.', y)
  y += 5
  y = _para(doc, 'Se otorga la presente carta poder para todos los efectos legales a que haya lugar.', y)
  y += 18

  // Firmas
  _firma(doc, T.mX + 8,      y, 75, `${data.otorgName || blank}\nOtorgante`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.apodName || blank}\nApoderado`)

  // Testigos
  y += 20
  doc.setFontSize(8)
  doc.setTextColor(...T.textMid)
  doc.text('TESTIGOS:', T.mX, y)
  y += 12
  _firma(doc, T.mX + 8,          y, 65, 'Testigo 1\n_________________________')
  _firma(doc, (W / 2) + 4,        y, 65, 'Testigo 2\n_________________________')

  _footer(doc, 1, 1, emisor)
  doc.save(`carta-poder-${folio}.pdf`)
}

// ─── 9. CONTRATO DE PRESTACIÓN DE SERVICIOS ─────────────────────────────────
export function pdfContratoServicios(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = _folio()
  const blank = '________________________'
  const monto = parseFloat(data.monto || 0)

  let y = _headerDoc(doc, 'Contrato de Servicios', folio)
  y += 8

  doc.setFontSize(14)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text('CONTRATO DE PRESTACIÓN DE SERVICIOS', W / 2, y, { align: 'center' })
  y += 4
  doc.setFontSize(8)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  doc.text('Contrato de naturaleza civil', W / 2, y + 3, { align: 'center' })
  y += 10

  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.3)
  doc.line(T.mX, y, W - T.mX, y)
  y += 6

  doc.setFontSize(9.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  const intro = `En ${data.lugar || blank}, a ${data.fecha || blank}, comparecen por una parte ${data.clienteName || blank} (en adelante "EL CLIENTE"), y por otra parte ${data.prestadorName || blank} (en adelante "EL PRESTADOR DE SERVICIOS"), quienes convienen en celebrar el presente Contrato de Prestación de Servicios, al tenor de las siguientes cláusulas:`
  y = _para(doc, intro, y)
  y += 5

  const clausulas = [
    { titulo: 'PRIMERA. OBJETO DEL CONTRATO', texto: `EL PRESTADOR DE SERVICIOS se obliga a prestar al CLIENTE los siguientes servicios: ${data.servicios || blank}.` },
    { titulo: 'SEGUNDA. VIGENCIA', texto: `El presente contrato tendrá vigencia a partir del ${data.fechaInicio || blank} y hasta el ${data.fechaFin || blank}, salvo acuerdo previo de las partes.` },
    { titulo: 'TERCERA. HONORARIOS', texto: `EL CLIENTE se obliga a pagar al PRESTADOR la cantidad de ${fmt$(monto)} MXN (${numToLetras(monto)}) por la prestación de los servicios convenidos. Forma de pago: ${data.formaPago || blank}.` },
    { titulo: 'CUARTA. CONFIDENCIALIDAD', texto: `Ambas partes se obligan a mantener en estricta confidencialidad toda la información que sea intercambiada con motivo del presente contrato.` },
    { titulo: 'QUINTA. RESCISIÓN', texto: `Cualquiera de las partes podrá rescindir el presente contrato mediante aviso previo de ${data.diasAviso || '15'} días naturales.` },
    { titulo: 'SEXTA. JURISDICCIÓN', texto: `Para la interpretación y cumplimiento del presente contrato, las partes se someten a la jurisdicción de los tribunales de ${data.jurisdiccion || data.lugar || blank}.` },
  ]

  for (const c of clausulas) {
    if (y > 240) {
      doc.addPage()
      y = _headerDoc(doc, 'Contrato de Servicios', folio)
      y += 4
    }
    doc.setFontSize(9)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.textInk)
    doc.text(c.titulo, T.mX, y)
    y += 5
    doc.setFont(T.font, 'normal')
    doc.setFontSize(9.5)
    y = _para(doc, c.texto, y)
    y += 4
  }

  y += 10
  if (y > 250) { doc.addPage(); y = 20 }
  doc.setFontSize(9)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textInk)
  doc.text('Leído el presente instrumento por ambas partes, lo firman en señal de conformidad:', T.mX, y)
  y += 14

  _firma(doc, T.mX + 8,      y, 75, `${data.clienteName || blank}\nEL CLIENTE`)
  _firma(doc, W - T.mX - 83, y, 75, `${data.prestadorName || blank}\nEL PRESTADOR DE SERVICIOS`)

  _footer(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`contrato-servicios-${folio}.pdf`)
}

// ─── 10. NOTA DE VENTA ───────────────────────────────────────────────────────
export function pdfNotaVenta(data, emisor = {}) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W     = doc.internal.pageSize.getWidth()
  const folio = data.folio || _folio()
  const blank = '________________________'
  const items = data.items || []

  let y = _headerDoc(doc, 'Nota de Venta', folio)
  y += 6

  // ── Encabezado del emisor ──
  doc.setFillColor(245, 248, 252)
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.2)
  doc.roundedRect(T.mX, y, (W - T.mX * 2) / 2 - 3, 28, 2, 2, 'FD')
  doc.setFontSize(11)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(emisor.nombre || data.emisorName || 'Emisor', T.mX + 4, y + 8)
  doc.setFontSize(7.5)
  doc.setFont(T.font, 'normal')
  doc.setTextColor(...T.textMid)
  if (emisor.rfc || data.emisorRfc)  doc.text(`RFC: ${emisor.rfc || data.emisorRfc}`, T.mX + 4, y + 15)
  if (emisor.direccion || data.emisorDir) {
    const dLines = doc.splitTextToSize(emisor.direccion || data.emisorDir, (W - T.mX * 2) / 2 - 12)
    doc.text(dLines[0], T.mX + 4, y + 21)
  }

  // ── Datos del cliente ──
  const cX = W / 2 + 1
  doc.roundedRect(cX, y, (W - T.mX * 2) / 2 - 3, 28, 2, 2, 'FD')
  doc.setFontSize(8)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text('Cliente:', cX + 4, y + 8)
  doc.setFont(T.font, 'normal')
  doc.setFontSize(8.5)
  doc.text(data.clienteName || blank, cX + 4, y + 15)
  doc.setFontSize(7.5)
  doc.setTextColor(...T.textMid)
  doc.text(`Fecha: ${data.fecha || new Date().toLocaleDateString('es-MX')}`, cX + 4, y + 22)
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
        _headerDoc(doc, 'Nota de Venta', folio)
        _footer(doc, d.pageNumber, doc.internal.getNumberOfPages(), emisor)
      },
    })
    y = doc.lastAutoTable.finalY + 4

    // Totales
    const totX = W - T.mX - 58
    doc.setFillColor(245, 248, 252)
    doc.setDrawColor(...T.textDim)
    doc.setLineWidth(0.2)
    doc.roundedRect(totX, y, 58, data.conIva ? 28 : 16, 2, 2, 'FD')
    doc.setFontSize(8.5)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    doc.text('Subtotal:', totX + 4, y + 7)
    doc.setTextColor(...T.textInk)
    doc.text(fmt$(subtotal), totX + 54, y + 7, { align: 'right' })
    if (data.conIva) {
      doc.setTextColor(...T.textMid)
      doc.text('IVA (16%):', totX + 4, y + 14)
      doc.setTextColor(...T.textInk)
      doc.text(fmt$(iva), totX + 54, y + 14, { align: 'right' })
    }
    const totalY = data.conIva ? y + 23 : y + 13
    doc.setFontSize(10)
    doc.setFont(T.font, 'bold')
    doc.setTextColor(...T.cyan)
    doc.text('TOTAL:', totX + 4, totalY)
    doc.setTextColor(...T.textInk)
    doc.text(fmt$(total), totX + 54, totalY, { align: 'right' })
    y += (data.conIva ? 34 : 22)

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

  _footer(doc, 1, doc.internal.getNumberOfPages(), emisor)
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
function _headerCotizacion(doc, tipo, folio, titulo) {
  const W = doc.internal.pageSize.getWidth()
  // Línea cyan top
  doc.setFillColor(...T.cyan)
  doc.rect(0, 0, W, 2, 'F')
  // Tipo de documento — izquierda, bold grande
  doc.setFontSize(16)
  doc.setFont(T.font, 'bold')
  doc.setTextColor(...T.textInk)
  doc.text(tipo.toUpperCase(), T.mX, 14)
  // Folio — derecha, monospace elegante
  doc.setFontSize(10)
  doc.setFont('courier', 'bold')
  doc.setTextColor(...T.textMid)
  doc.text(folio || '', W - T.mX, 14, { align: 'right' })
  // Titulo debajo del tipo, en gris muted
  if (titulo) {
    doc.setFontSize(8)
    doc.setFont(T.font, 'normal')
    doc.setTextColor(...T.textMid)
    const tLines = doc.splitTextToSize(titulo, W - T.mX * 2 - 40)
    doc.text(tLines[0], T.mX, 21)
  }
  // Línea separadora a los 26mm
  doc.setDrawColor(...T.textDim)
  doc.setLineWidth(0.25)
  doc.line(T.mX, 26, W - T.mX, 26)
  return 32
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

  let y = _headerCotizacion(doc, 'Presupuesto', folio, data.titulo)

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

    _autoTable(doc, {
      startY: y,
      head,
      body,
      columnStyles: hasDiscount
        ? { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } }
        : { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
      didDrawPage: (d) => {
        _headerCotizacion(doc, 'Presupuesto', folio, data.titulo)
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
    y = Math.max(y + totH + 6, ty + 4)

    // Monto en letras (solo MXN)
    if (mon === 'MXN') {
      doc.setFontSize(7); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
      doc.text(numToLetras(total), T.mX, y)
      y += 7
    }
  }

  // ── Observaciones ────────────────────────────────────────────────────────────
  if (data.notas) {
    y += 2
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    const nLines = doc.splitTextToSize('Observaciones: ' + data.notas, W - T.mX * 2)
    doc.text(nLines, T.mX, y)
    y += nLines.length * 4 + 5
  }

  // ── Datos de pago ─────────────────────────────────────────────────────────────
  if (data.metodoPago || data.bancoPago || data.clabePago) {
    y += 2
    doc.setFontSize(7.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('Datos de pago:', T.mX, y); y += 5
    doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (data.metodoPago) { doc.text(`Método: ${data.metodoPago}`, T.mX, y); y += 5 }
    if (data.bancoPago)  { doc.text(`Banco: ${data.bancoPago}`,   T.mX, y); y += 5 }
    if (data.clabePago)  { doc.text(`CLABE/Wallet: ${data.clabePago}`, T.mX, y); y += 5 }
  }

  // ── Líneas de firma ──────────────────────────────────────────────────────────
  const H = doc.internal.pageSize.getHeight()
  y = Math.max(y + 8, H - 40)
  if (y < H - 24) {
    const midX = W / 2
    doc.setDrawColor(...T.textDim); doc.setLineWidth(0.3)
    doc.line(T.mX,     y, T.mX + 58,     y)
    doc.line(midX + 4, y, midX + 62, y)
    doc.setFontSize(7); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    doc.text(emisorNombre || 'Emisor / Prestador', T.mX, y + 5)
    doc.text('Cliente / Aceptante', midX + 4, y + 5)
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

  let y = _headerCotizacion(doc, 'Nota de Venta', folio, data.titulo)

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

    _autoTable(doc, {
      startY: y, head, body,
      columnStyles: hasDiscount
        ? { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } }
        : { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
      didDrawPage: (d) => {
        _headerCotizacion(doc, 'Nota de Venta', folio, data.titulo)
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
    y = Math.max(y + totH + 6, ty + 4)

    if (mon === 'MXN') {
      doc.setFontSize(7); doc.setFont(T.font, 'italic'); doc.setTextColor(...T.textMid)
      doc.text(numToLetras(total), T.mX, y); y += 7
    }
  }

  // ── Observaciones ────────────────────────────────────────────────────────────
  if (data.notas) {
    y += 2
    doc.setFontSize(7.5); doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    const nLines = doc.splitTextToSize('Observaciones: ' + data.notas, W - T.mX * 2)
    doc.text(nLines, T.mX, y); y += nLines.length * 4 + 5
  }

  // ── Datos de pago ─────────────────────────────────────────────────────────────
  if (data.metodoPago || data.bancoPago || data.clabePago) {
    y += 2
    doc.setFontSize(7.5); doc.setFont(T.font, 'bold'); doc.setTextColor(...T.textInk)
    doc.text('Datos de pago:', T.mX, y); y += 5
    doc.setFont(T.font, 'normal'); doc.setTextColor(...T.textMid)
    if (data.metodoPago) { doc.text(`Método: ${data.metodoPago}`, T.mX, y); y += 5 }
    if (data.bancoPago)  { doc.text(`Banco: ${data.bancoPago}`,   T.mX, y); y += 5 }
    if (data.clabePago)  { doc.text(`CLABE/Wallet: ${data.clabePago}`, T.mX, y); y += 5 }
  }

  _footerCotizacion(doc, 1, doc.internal.getNumberOfPages(), emisor)
  doc.save(`nota-venta-${folio}.pdf`)
}
