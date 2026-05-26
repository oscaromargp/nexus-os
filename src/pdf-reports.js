/**
 * Nexus OS — PDF Reports Engine v1.0
 * Powered by jsPDF + jspdf-autotable + html2canvas
 *
 * Exports:
 *   pdfEstadoCuenta(orq, list, kpis, tcCache, filters)
 *   pdfDispersionOTC(data, fecha)
 *   pdfReporteProyecto(proyecto, nodes)
 *   pdfResumenMensual(period, allNodes, accounts)
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Tokens de diseño ─────────────────────────────────────────────────────────
const C = {
  black:     [10, 14, 33],
  darkGray:  [30, 41, 59],
  midGray:   [71, 85, 105],
  lightGray: [148, 163, 184],
  white:     [255, 255, 255],
  cyan:      [0, 240, 255],
  cyanDark:  [6, 182, 212],
  green:     [22, 163, 74],
  greenL:    [74, 222, 128],
  red:       [220, 38, 38],
  redL:      [248, 113, 113],
  yellow:    [217, 119, 6],
  yellowL:   [251, 191, 36],
  blue:      [37, 99, 235],
}

const BRAND_GRAY = [241, 245, 249]  // fondo KPI header

/** Formatea número como moneda MXN */
function fmt$(n) {
  return '$' + Math.abs(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Número a letras en español (para importes) */
function numToLetras(n) {
  const entero = Math.floor(Math.abs(n))
  const cents  = Math.round((Math.abs(n) - entero) * 100)
  const units  = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE']
  const teens  = ['DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE']
  const tens   = ['','DIEZ','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
  const hundreds = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
  const fn = (num) => {
    if (num === 0) return ''
    if (num === 100) return 'CIEN'
    if (num < 10) return units[num]
    if (num < 20) return teens[num - 10]
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' Y ' + units[num % 10] : '')
    return hundreds[Math.floor(num / 100)] + (num % 100 ? ' ' + fn(num % 100) : '')
  }
  const miles = Math.floor(entero / 1000)
  const resto = entero % 1000
  let str = ''
  if (miles > 0) str += (miles === 1 ? 'MIL' : fn(miles) + ' MIL') + (resto > 0 ? ' ' : '')
  str += fn(resto)
  return (str || 'CERO') + ` PESOS ${String(cents).padStart(2, '0')}/100 M.N.`
}

/** Dibuja el encabezado corporativo en cada página */
function _drawHeader(doc, title, subtitle = '') {
  const W = doc.internal.pageSize.getWidth()
  // Barra superior oscura
  doc.setFillColor(...C.darkGray)
  doc.rect(0, 0, W, 22, 'F')
  // Título
  doc.setTextColor(...C.white)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('NEXUS OS', 14, 14)
  // Título del reporte (derecha)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(title.toUpperCase(), W - 14, 14, { align: 'right' })
  // Línea acento cyan
  doc.setDrawColor(...C.cyan)
  doc.setLineWidth(1.2)
  doc.line(0, 22, W, 22)
  // Subtítulo
  if (subtitle) {
    doc.setTextColor(...C.midGray)
    doc.setFontSize(8)
    doc.text(subtitle, 14, 30)
  }
}

/** Dibuja el pie de página */
function _drawFooter(doc, pageNum, totalPages) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...C.lightGray)
  doc.setLineWidth(0.3)
  doc.line(14, H - 12, W - 14, H - 12)
  doc.setFontSize(7)
  doc.setTextColor(...C.lightGray)
  doc.text('Nexus OS · Generado ' + new Date().toLocaleString('es-MX'), 14, H - 6)
  doc.text(`Página ${pageNum} de ${totalPages}`, W - 14, H - 6, { align: 'right' })
}

/** Bloque KPI: label arriba, valor grande abajo */
function _kpiBox(doc, x, y, w, h, label, value, color = C.darkGray, bg = BRAND_GRAY) {
  doc.setFillColor(...bg)
  doc.roundedRect(x, y, w, h, 2, 2, 'F')
  doc.setTextColor(...C.midGray)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(label.toUpperCase(), x + 4, y + 8)
  doc.setTextColor(...color)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(value, x + 4, y + 18)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ESTADO DE CUENTA
// ═══════════════════════════════════════════════════════════════════════════════
export function pdfEstadoCuenta(orq, list, kpis, tcCache = {}, filters = {}) {
  if (!list || !list.length) return

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const now  = new Date()
  const saldo = list[0]?._balance ?? 0
  const tcUsdt = tcCache['USDT']?.price || 0
  const equivUsdt = tcUsdt > 1 ? (saldo / tcUsdt) : 0

  _drawHeader(doc, 'Estado de Cuenta',
    `${orq?.nombre || 'Orquestador'} · ${filters.dateFrom || 'Inicio'} → ${filters.dateTo || 'Hoy'}`)

  let y = 36

  // ── Saldo principal ──
  doc.setFillColor(...C.darkGray)
  doc.roundedRect(14, y, W - 28, 28, 3, 3, 'F')
  doc.setTextColor(...C.lightGray)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('SALDO ACTUAL', 22, y + 8)
  doc.text(now.toLocaleDateString('es-MX'), W - 22, y + 8, { align: 'right' })

  const saldoColor = saldo >= 0 ? C.greenL : C.redL
  doc.setTextColor(...saldoColor)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text(fmt$(saldo), 22, y + 20)

  const estadoLabel = saldo >= 0 ? '▲ SALDO POSITIVO' : '▼ SALDO NEGATIVO'
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(estadoLabel, W - 22, y + 20, { align: 'right' })
  y += 32

  // ── Importe en letras ──
  doc.setTextColor(...C.midGray)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'italic')
  const letras = numToLetras(saldo)
  const letrasLines = doc.splitTextToSize(letras, W - 28)
  doc.text(letrasLines, 14, y)
  y += letrasLines.length * 4 + 4

  // ── KPIs ──
  const kW = (W - 28 - 9) / 4
  _kpiBox(doc, 14,          y, kW, 22, 'Entradas', fmt$(kpis.entradas), C.green)
  _kpiBox(doc, 14 + kW + 3, y, kW, 22, 'Salidas',  fmt$(kpis.salidas),  C.red)
  _kpiBox(doc, 14 + (kW+3)*2, y, kW, 22, 'Neto',   fmt$(kpis.net), kpis.net >= 0 ? C.green : C.red)
  const kpiLast = 14 + (kW+3)*3
  if (equivUsdt > 0) {
    _kpiBox(doc, kpiLast, y, kW, 22,
      `Equiv. USDT (${tcUsdt.toFixed(2)})`,
      equivUsdt.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDT',
      C.yellowL)
  } else {
    _kpiBox(doc, kpiLast, y, kW, 22, 'Movimientos', String(list.length), C.cyanDark)
  }
  y += 26

  // ── Tabla ──
  const rows = list.map(m => {
    const netMxn = m.tipo === 'entrada' && m.comision != null
      ? Math.round((m.monto_mxn ?? 0) * m.comision * 100) / 100
      : (m.monto_mxn ?? 0)
    const isCan   = m.estado === 'cancelado'
    const isCrypto = m.moneda !== 'MXN' && m.moneda !== 'USD'
    const concepto = m.tipo === 'entrada'
      ? (m.ordenante || m.notas || 'Depósito')
      : (m.beneficiario || m.notas || 'Retiro')
    return [
      m.fecha,
      concepto + (m.banco ? '\n' + m.banco : ''),
      isCrypto && !isCan ? m.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 6 }) + ' ' + m.moneda : '',
      (!isCan && m.tipo === 'salida') ? fmt$(netMxn) : '',
      (!isCan && m.tipo === 'entrada') ? fmt$(netMxn) : '',
      isCan ? '—' : fmt$(m._balance),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['FECHA', 'CONCEPTO / BENEFICIARIO', 'CRIPTO', 'CARGO (−)', 'ABONO (+)', 'SALDO']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', overflow: 'linebreak' },
    headStyles: { fillColor: C.darkGray, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center', textColor: C.midGray },
      1: { cellWidth: 60 },
      2: { cellWidth: 24, halign: 'right', textColor: [180, 83, 9] },
      3: { cellWidth: 26, halign: 'right', textColor: C.red },
      4: { cellWidth: 26, halign: 'right', textColor: C.green },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    rowPageBreak: 'auto',
    didDrawCell: (data) => {
      // Colorear saldo según positivo/negativo
      if (data.section === 'body' && data.column.index === 5) {
        const bal = list[data.row.index]?._balance ?? 0
        data.cell.styles.textColor = bal >= 0 ? C.green : C.red
      }
    },
    didDrawPage: (data) => {
      _drawFooter(doc, data.pageNumber, doc.internal.getNumberOfPages())
    },
  })

  _drawFooter(doc, 1, doc.internal.getNumberOfPages())
  doc.save(`estado-cuenta-${(orq?.nombre || 'orq').replace(/\s+/g, '-').toLowerCase()}-${now.toISOString().slice(0, 10)}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DISPERSIÓN OTC
// ═══════════════════════════════════════════════════════════════════════════════
export function pdfDispersionOTC(data, fecha = new Date()) {
  // data: { orqName, rows:[{beneficiario,banco,clabe,monto,moneda,tc,comision,comprobante}], totals }
  if (!data?.rows?.length) return

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W   = doc.internal.pageSize.getWidth()

  _drawHeader(doc, 'Dispersión OTC',
    `${data.orqName || 'Orquestador'} · ${fecha.toLocaleDateString('es-MX')} · ${data.rows.length} operaciones`)

  let y = 36

  // KPIs
  const kW = (W - 28 - 6) / 4
  _kpiBox(doc, 14,          y, kW, 22, 'Total USDT', data.totals?.usdt?.toLocaleString('es-MX', {minimumFractionDigits:2}) + ' USDT', C.yellowL)
  _kpiBox(doc, 14+kW+2,     y, kW, 22, 'Bruto MXN', fmt$(data.totals?.bruto), C.blue)
  _kpiBox(doc, 14+(kW+2)*2, y, kW, 22, 'Neto MXN',  fmt$(data.totals?.neto),  C.green)
  _kpiBox(doc, 14+(kW+2)*3, y, kW, 22, 'Ganancia',  fmt$(data.totals?.ganancia), C.cyan)
  y += 26

  autoTable(doc, {
    startY: y,
    head: [['#', 'BENEFICIARIO', 'BANCO', 'CLABE', 'CANTIDAD', 'MONEDA', 'T/C', 'COM.', 'NETO MXN', 'COMPROBANTE']],
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
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2.2 },
    headStyles: { fillColor: C.darkGray, textColor: C.white, fontStyle: 'bold', fontSize: 7, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      3: { font: 'courier', fontSize: 7 },
      4: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center' },
      8: { halign: 'right', fontStyle: 'bold', textColor: C.green },
      9: { halign: 'center', textColor: C.green },
    },
    foot: [['', 'TOTALES', '', '', (data.totals?.usdt||0).toLocaleString('es-MX', {minimumFractionDigits:2}), '', '', '', fmt$(data.totals?.neto), '']],
    footStyles: { fillColor: C.darkGray, textColor: C.white, fontStyle: 'bold' },
    didDrawPage: (d) => _drawFooter(doc, d.pageNumber, doc.internal.getNumberOfPages()),
  })

  _drawFooter(doc, 1, doc.internal.getNumberOfPages())
  doc.save(`dispersion-otc-${fecha.toISOString().slice(0, 10)}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REPORTE DE PROYECTO
// ═══════════════════════════════════════════════════════════════════════════════
export function pdfReporteProyecto(proyecto, nodes = []) {
  if (!proyecto) return

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const now  = new Date()
  const meta = proyecto.metadata || {}

  _drawHeader(doc, 'Reporte de Proyecto', `${meta.name || proyecto.content} · ${now.toLocaleDateString('es-MX')}`)

  let y = 36

  // ── Encabezado del proyecto ──
  doc.setFillColor(...BRAND_GRAY)
  doc.roundedRect(14, y, W - 28, 30, 3, 3, 'F')

  doc.setTextColor(...C.darkGray)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(meta.name || proyecto.content || 'Proyecto', 20, y + 10)

  if (meta.description) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.midGray)
    const desc = doc.splitTextToSize(meta.description, W - 40)
    doc.text(desc, 20, y + 17)
  }

  // Barra de progreso
  const progress = meta.progress ?? 0
  const barY = y + 25
  doc.setFillColor(...C.lightGray)
  doc.roundedRect(20, barY, W - 40, 3, 1, 1, 'F')
  if (progress > 0) {
    doc.setFillColor(...(progress >= 100 ? C.green : C.cyan))
    doc.roundedRect(20, barY, (W - 40) * (progress / 100), 3, 1, 1, 'F')
  }
  doc.setFontSize(7)
  doc.setTextColor(...C.midGray)
  doc.text(`${progress}% completado`, W - 22, barY + 2.5, { align: 'right' })
  y += 36

  // ── KPIs ──
  const expenses = nodes.filter(n => n.type === 'expense' && n.metadata?.project_id === proyecto.id)
  const incomes  = nodes.filter(n => n.type === 'income'  && n.metadata?.project_id === proyecto.id)
  const tasks    = nodes.filter(n => n.type === 'kanban'  && n.metadata?.project_id === proyecto.id)
  const doneTasks = tasks.filter(n => n.metadata?.status === 'done').length
  const totalExp  = expenses.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalInc  = incomes.reduce((s, n)  => s + (n.metadata?.amount || 0), 0)

  const kW = (W - 28 - 9) / 4
  _kpiBox(doc, 14,          y, kW, 22, 'Ingresos', fmt$(totalInc), C.green)
  _kpiBox(doc, 14+kW+3,     y, kW, 22, 'Gastos',   fmt$(totalExp), C.red)
  _kpiBox(doc, 14+(kW+3)*2, y, kW, 22, 'Resultado', fmt$(totalInc - totalExp), (totalInc - totalExp) >= 0 ? C.green : C.red)
  _kpiBox(doc, 14+(kW+3)*3, y, kW, 22, 'Tareas', `${doneTasks}/${tasks.length}`, C.cyanDark)
  y += 28

  // ── Tabla de tareas ──
  if (tasks.length) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.darkGray)
    doc.text('TAREAS', 14, y)
    y += 4

    const statusLabel = { todo: 'Pendiente', 'in-progress': 'En proceso', done: 'Completada', backlog: 'Backlog' }
    const statusColor = { todo: C.yellowL, 'in-progress': C.blue, done: C.green, backlog: C.lightGray }

    autoTable(doc, {
      startY: y,
      head: [['TAREA', 'ESTADO', 'PRIORIDAD', 'FECHA']],
      body: tasks.map(t => [
        t.content || '—',
        statusLabel[t.metadata?.status] || t.metadata?.status || '—',
        t.metadata?.priority || '—',
        t.metadata?.date || t.created_at?.slice(0, 10) || '—',
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: C.darkGray, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center', textColor: C.midGray } },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const status = tasks[data.row.index]?.metadata?.status || 'todo'
          data.cell.styles.textColor = statusColor[status] || C.midGray
        }
      },
      didDrawPage: (d) => _drawFooter(doc, d.pageNumber, doc.internal.getNumberOfPages()),
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Tabla de gastos/ingresos ──
  if (expenses.length || incomes.length) {
    const txRows = [...incomes.map(n => ({...n, _tipo:'Ingreso'})), ...expenses.map(n => ({...n, _tipo:'Gasto'}))]
      .sort((a, b) => (a.metadata?.date || '').localeCompare(b.metadata?.date || ''))
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.darkGray)
    doc.text('MOVIMIENTOS FINANCIEROS', 14, y)
    y += 4
    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'CONCEPTO', 'TIPO', 'MONTO']],
      body: txRows.map(n => [
        n.metadata?.date || n.created_at?.slice(0, 10) || '—',
        n.content || n.metadata?.description || '—',
        n._tipo,
        (n._tipo === 'Ingreso' ? '+' : '-') + fmt$(n.metadata?.amount || 0),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: C.darkGray, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          data.cell.styles.textColor = txRows[data.row.index]?._tipo === 'Ingreso' ? C.green : C.red
        }
      },
      didDrawPage: (d) => _drawFooter(doc, d.pageNumber, doc.internal.getNumberOfPages()),
    })
  }

  _drawFooter(doc, 1, doc.internal.getNumberOfPages())
  doc.save(`proyecto-${(meta.name || 'proyecto').replace(/\s+/g, '-').toLowerCase()}-${now.toISOString().slice(0, 10)}.pdf`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RESUMEN MENSUAL
// ═══════════════════════════════════════════════════════════════════════════════
export function pdfResumenMensual(period, allNodes = [], accounts = []) {
  // period: 'YYYY-MM'
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const now  = new Date()
  const [y, m] = period.split('-').map(Number)
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  _drawHeader(doc, 'Resumen Mensual', monthName.toUpperCase())

  let curY = 36

  // Filtrar transacciones del mes
  const txs = allNodes.filter(n => {
    if (n.type !== 'income' && n.type !== 'expense') return false
    const d = n.metadata?.date || n.created_at || ''
    return String(d).slice(0, 7) === period
  })

  const incomes  = txs.filter(n => n.type === 'income')
  const expenses = txs.filter(n => n.type === 'expense')
  const totalInc = incomes.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const totalExp = expenses.reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const net      = totalInc - totalExp

  // ── Saldo del mes ──
  doc.setFillColor(...C.darkGray)
  doc.roundedRect(14, curY, W - 28, 24, 3, 3, 'F')
  doc.setTextColor(...C.lightGray)
  doc.setFontSize(8)
  doc.text('RESULTADO DEL MES', 22, curY + 8)
  doc.setTextColor(...(net >= 0 ? C.greenL : C.redL))
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text((net >= 0 ? '+' : '') + fmt$(net), 22, curY + 19)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.lightGray)
  doc.text(monthName, W - 22, curY + 19, { align: 'right' })
  curY += 28

  // ── KPIs ──
  const kW = (W - 28 - 6) / 3
  _kpiBox(doc, 14,          curY, kW, 22, 'Ingresos', fmt$(totalInc), C.green)
  _kpiBox(doc, 14 + kW + 3, curY, kW, 22, 'Gastos',   fmt$(totalExp), C.red)
  _kpiBox(doc, 14+(kW+3)*2, curY, kW, 22, 'Ahorro',   fmt$(net),      net >= 0 ? C.cyanDark : C.red)
  curY += 28

  // ── Top 5 gastos por categoría/concepto ──
  if (expenses.length) {
    // Agrupar por cuenta/concepto
    const byAccount = {}
    expenses.forEach(n => {
      const key = n.metadata?.account_id || 'general'
      const acc = accounts.find(a => a.id === key)
      const label = acc?.name || n.metadata?.category || 'General'
      byAccount[label] = (byAccount[label] || 0) + (n.metadata?.amount || 0)
    })
    const sorted = Object.entries(byAccount).sort((a, b) => b[1] - a[1]).slice(0, 8)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.darkGray)
    doc.text('GASTOS POR CATEGORÍA', 14, curY)
    curY += 4

    autoTable(doc, {
      startY: curY,
      head: [['CATEGORÍA', 'MONTO', '% DEL TOTAL']],
      body: sorted.map(([label, amt]) => [
        label,
        fmt$(amt),
        totalExp > 0 ? ((amt / totalExp) * 100).toFixed(1) + '%' : '—',
      ]),
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: C.darkGray, textColor: C.white, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        1: { halign: 'right', textColor: C.red, fontStyle: 'bold' },
        2: { halign: 'center', textColor: C.midGray },
      },
      didDrawPage: (d) => _drawFooter(doc, d.pageNumber, doc.internal.getNumberOfPages()),
    })
    curY = doc.lastAutoTable.finalY + 10
  }

  // ── Detalle de transacciones ──
  if (txs.length) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.darkGray)
    doc.text('DETALLE DE TRANSACCIONES', 14, curY)
    curY += 4

    autoTable(doc, {
      startY: curY,
      head: [['FECHA', 'CONCEPTO', 'TIPO', 'MONTO']],
      body: txs
        .sort((a, b) => (a.metadata?.date || '').localeCompare(b.metadata?.date || ''))
        .map(n => [
          n.metadata?.date || n.created_at?.slice(0, 10) || '—',
          n.content || n.metadata?.description || '—',
          n.type === 'income' ? '▲ Ingreso' : '▼ Gasto',
          (n.type === 'income' ? '+' : '-') + fmt$(n.metadata?.amount || 0),
        ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: C.darkGray, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center', textColor: C.midGray },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          data.cell.styles.textColor = txs[data.row.index]?.type === 'income' ? C.green : C.red
        }
      },
      didDrawPage: (d) => _drawFooter(doc, d.pageNumber, doc.internal.getNumberOfPages()),
    })
  }

  _drawFooter(doc, 1, doc.internal.getNumberOfPages())
  doc.save(`resumen-mensual-${period}.pdf`)
}
