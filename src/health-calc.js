// Nexus OS — Funciones puras (sin DOM ni red) de cálculo, testeables con Vitest.
// Centralizadas aquí para (1) cubrirlas con tests y (2) evitar duplicar lógica
// crítica de dinero/salud entre app.js, api/health.js y src/health*.js.

// ── Parser numérico tolerante a coma decimal (teclados móviles ES) ──
// "0,5"→0.5 · "1.900,50"→1900.50 · "$1,900,000"→1900000 · "1,900"→1900 · ""→NaN
// Regla: si hay ambos separadores, el ÚLTIMO es el decimal y el otro es de miles.
// Con un solo separador repetido (1,900,000) son miles. Una sola coma con 3
// dígitos detrás se trata como miles; con 1-2 dígitos, como decimal.
export function parseDecimalEs(v) {
  let s = String(v ?? '').trim()
  if (!s) return NaN
  s = s.replace(/[^0-9.,\-]/g, '')   // quita símbolos ($, espacios…)
  if (!s) return NaN
  const commas = (s.match(/,/g) || []).length
  const dots = (s.match(/\./g) || []).length
  if (commas && dots) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (commas > 1) {
    s = s.replace(/,/g, '')          // miles
  } else if (dots > 1) {
    s = s.replace(/\./g, '')         // miles
  } else if (commas === 1) {
    s = (s.split(',')[1] || '').length === 3 ? s.replace(',', '') : s.replace(',', '.')
  }
  return parseFloat(s)
}

// ── 1RM estimado (fórmula de Epley), redondeado ──
export function epley1RM(weight, reps) {
  const w = Number(weight), r = Number(reps)
  if (!w || !r || w <= 0 || r <= 0) return 0
  return Math.round(w * (1 + r / 30))
}

// ── Predicción de ciclo menstrual ──
// cycles: [{ start_date:'YYYY-MM-DD', end_date? }]. nowIso opcional (para tests).
// Devuelve { prediction|null, avg_cycle, avg_period }.
export function cyclePrediction(cycles, nowIso) {
  const sorted = [...(cycles || [])].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const cycleLengths = [], periodLengths = []
  for (let i = 1; i < sorted.length; i++) {
    const d = (new Date(sorted[i].start_date) - new Date(sorted[i - 1].start_date)) / 86400000
    if (d > 0 && d < 90) cycleLengths.push(d)
  }
  for (const c of sorted) {
    if (c.end_date) { const d = (new Date(c.end_date) - new Date(c.start_date)) / 86400000 + 1; if (d > 0 && d < 15) periodLengths.push(d) }
  }
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null
  const avgCycle = avg(cycleLengths) || 28
  const avgPeriod = avg(periodLengths) || 5
  const last = sorted[sorted.length - 1] || null
  let prediction = null
  if (last) {
    const lastStart = new Date(last.start_date + 'T00:00:00')
    const today0 = new Date((nowIso || new Date().toISOString().slice(0, 10)) + 'T00:00:00')
    const dayOfCycle = Math.floor((today0 - lastStart) / 86400000) + 1
    const nextStart = new Date(lastStart); nextStart.setDate(nextStart.getDate() + avgCycle)
    const ovulation = new Date(nextStart); ovulation.setDate(ovulation.getDate() - 14)
    const daysToNext = Math.ceil((nextStart - today0) / 86400000)
    const ovDay = avgCycle - 14
    let phase = '—'
    if (dayOfCycle >= 1 && dayOfCycle <= avgPeriod) phase = 'Menstruación'
    else if (Math.abs(dayOfCycle - ovDay) <= 1) phase = 'Ovulación (fértil)'
    else if (dayOfCycle < ovDay) phase = 'Folicular'
    else phase = 'Lútea'
    prediction = {
      day_of_cycle: dayOfCycle, next_start: nextStart.toISOString().slice(0, 10),
      ovulation: ovulation.toISOString().slice(0, 10), days_to_next: daysToNext, phase,
    }
  }
  return { prediction, avg_cycle: avgCycle, avg_period: avgPeriod }
}

// ── Días del heatmap de constancia (UTC, a prueba de DST) ──
// Devuelve { days:[{ms, ds:'YYYY-MM-DD', future}], totalCells } alineado a domingo.
export function heatmapDays(now = new Date(), weeks = 16) {
  const dayMs = 86400000
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  let startMs = endMs - (weeks * 7 - 1) * dayMs
  startMs -= new Date(startMs).getUTCDay() * dayMs   // retrocede al domingo (UTC)
  const daysSpan = Math.round((endMs - startMs) / dayMs) + 1
  const totalCells = Math.ceil(daysSpan / 7) * 7
  const days = []
  for (let i = 0; i < totalCells; i++) {
    const ms = startMs + i * dayMs
    days.push({ ms, ds: new Date(ms).toISOString().slice(0, 10), future: ms > endMs })
  }
  return { days, totalCells, startMs, endMs }
}
