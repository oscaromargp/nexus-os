import { describe, it, expect } from 'vitest'
import { parseDecimalEs, epley1RM, cyclePrediction, heatmapDays } from '../health-calc.js'

// ══════════════════════════════════════════════════════════════
// parseDecimalEs — el parser de dinero (causa del bug de BTC en móvil)
// ══════════════════════════════════════════════════════════════
describe('parseDecimalEs', () => {
  it('coma decimal del teclado móvil: "0,5" → 0.5', () => {
    expect(parseDecimalEs('0,5')).toBe(0.5)
  })
  it('punto normal: "0.5" → 0.5', () => {
    expect(parseDecimalEs('0.5')).toBe(0.5)
  })
  it('miles con punto + decimal con coma: "1.900,50" → 1900.5', () => {
    expect(parseDecimalEs('1.900,50')).toBe(1900.5)
  })
  it('separadores de miles con coma: "1,900,000" → 1900000', () => {
    expect(parseDecimalEs('1,900,000')).toBe(1900000)
  })
  it('limpia símbolos: "$1,900,000" → 1900000', () => {
    expect(parseDecimalEs('$1,900,000')).toBe(1900000)
  })
  it('entero simple: "95" → 95', () => {
    expect(parseDecimalEs('95')).toBe(95)
  })
  it('vacío → NaN', () => {
    expect(parseDecimalEs('')).toBeNaN()
    expect(parseDecimalEs(null)).toBeNaN()
    expect(parseDecimalEs(undefined)).toBeNaN()
  })
})

// ══════════════════════════════════════════════════════════════
// epley1RM — 1RM estimado del gym
// ══════════════════════════════════════════════════════════════
describe('epley1RM', () => {
  it('1 rep = el mismo peso (redondeado): 100×1 → 103', () => {
    expect(epley1RM(100, 1)).toBe(103)
  })
  it('80kg × 8 reps → 101', () => {
    expect(epley1RM(80, 8)).toBe(101)
  })
  it('sin peso o sin reps → 0', () => {
    expect(epley1RM(0, 5)).toBe(0)
    expect(epley1RM(100, 0)).toBe(0)
    expect(epley1RM(null, null)).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// cyclePrediction — predicción de ciclo menstrual
// ══════════════════════════════════════════════════════════════
describe('cyclePrediction', () => {
  const dos = [{ start_date: '2026-05-01' }, { start_date: '2026-05-29' }] // 28 días

  it('sin registros → prediction null, promedios por defecto', () => {
    const r = cyclePrediction([])
    expect(r.prediction).toBeNull()
    expect(r.avg_cycle).toBe(28)
    expect(r.avg_period).toBe(5)
  })
  it('calcula ciclo promedio de 28 días', () => {
    expect(cyclePrediction(dos, '2026-05-30').avg_cycle).toBe(28)
  })
  it('día del ciclo y fase Menstruación al inicio', () => {
    const p = cyclePrediction(dos, '2026-05-30').prediction
    expect(p.day_of_cycle).toBe(2)
    expect(p.phase).toBe('Menstruación')
  })
  it('fase Folicular a mitad temprana', () => {
    expect(cyclePrediction(dos, '2026-06-05').prediction.phase).toBe('Folicular')
  })
  it('fase Ovulación (fértil) ~día 14', () => {
    expect(cyclePrediction(dos, '2026-06-12').prediction.phase).toBe('Ovulación (fértil)')
  })
  it('fase Lútea después de ovulación', () => {
    expect(cyclePrediction(dos, '2026-06-20').prediction.phase).toBe('Lútea')
  })
  it('predice próximo inicio a 28 días del último', () => {
    expect(cyclePrediction(dos, '2026-05-30').prediction.next_start).toBe('2026-06-26')
  })
})

// ══════════════════════════════════════════════════════════════
// heatmapDays — grid del heatmap (UTC, a prueba de DST)
// ══════════════════════════════════════════════════════════════
describe('heatmapDays', () => {
  it('el primer día es domingo (UTC)', () => {
    const { days } = heatmapDays(new Date('2026-06-24T12:00:00Z'), 16)
    expect(new Date(days[0].ms).getUTCDay()).toBe(0)
  })
  it('total de celdas múltiplo de 7', () => {
    const { days, totalCells } = heatmapDays(new Date('2026-06-24T12:00:00Z'), 16)
    expect(totalCells % 7).toBe(0)
    expect(days.length).toBe(totalCells)
  })
  it('hoy está incluido y no marcado como futuro', () => {
    const { days } = heatmapDays(new Date('2026-06-24T12:00:00Z'), 16)
    const hoy = days.find(d => d.ds === '2026-06-24')
    expect(hoy).toBeTruthy()
    expect(hoy.future).toBe(false)
  })
  it('no se rompe a través de un cambio de horario (mar→jun)', () => {
    // marzo a junio cruza el inicio del horario de verano en muchas zonas
    const { days } = heatmapDays(new Date('2026-06-24T12:00:00Z'), 16)
    const unicos = new Set(days.map(d => d.ds))
    expect(unicos.size).toBe(days.length) // sin días duplicados ni saltados
  })
})
