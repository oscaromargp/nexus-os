import { describe, it, expect } from 'vitest'
import { parseNode, computeProjData } from '../logic.js'

// ══════════════════════════════════════════════════════════════
// parseNode — parser semántico
// ══════════════════════════════════════════════════════════════
describe('parseNode', () => {

  // ── Tipos básicos ──────────────────────────────────────────
  it('texto libre → note', () => {
    const r = parseNode('reunión con el arquitecto mañana')
    expect(r.type).toBe('note')
  })

  it('gasto: tipo, monto y cuenta', () => {
    const r = parseNode('-$1200 cemento @efectivo')
    expect(r.type).toBe('expense')
    expect(r.metadata.amount).toBe(1200)
    expect(r.metadata.account_hint).toBe('efectivo')
  })

  it('ingreso: tipo y monto', () => {
    const r = parseNode('+$25000 anticipo cliente @bbva')
    expect(r.type).toBe('income')
    expect(r.metadata.amount).toBe(25000)
    expect(r.metadata.account_hint).toBe('bbva')
  })

  it('tarea → kanban con status todo', () => {
    const r = parseNode('#tarea llamar al arquitecto')
    expect(r.type).toBe('kanban')
    expect(r.metadata.status).toBe('todo')
    expect(r.metadata.tags).toContain('#tarea')
  })

  it('persona → contact', () => {
    const r = parseNode('#persona Carlos García electricista')
    expect(r.type).toBe('contact')
    expect(r.metadata.cType).toBe('persona')
    expect(r.content).toBe('Carlos García electricista')
  })

  it('cotización: monto y project_tag', () => {
    const r = parseNode('#cotizacion $45000 instalación eléctrica @casatulum')
    expect(r.type).toBe('cotizacion')
    expect(r.metadata.amount).toBe(45000)
    expect(r.metadata.project_tag).toBe('casatulum')
    expect(r.metadata.status).toBe('pendiente')
  })

  // ── Proyecto: slug automático ──────────────────────────────
  it('proyecto: genera slug sin acentos', () => {
    const r = parseNode('#proyecto Remodelación Villa Marina')
    expect(r.type).toBe('proyecto')
    expect(r.metadata.project_slug).toBe('remodelacionvillamarina')
    expect(r.metadata.tags).toContain('#remodelacionvillamarina')
  })

  it('proyecto: slug solo alfanumérico', () => {
    const r = parseNode('#proyecto Casa Tulum 2025')
    expect(r.metadata.project_slug).toBe('casatulum2025')
  })

  // ── Gastos → vinculación a proyectos vía #hashtag ─────────
  it('gasto con #hashtag extrae tags y limpia el label', () => {
    const r = parseNode('-$1200 cemento @efectivo #casatulum')
    expect(r.metadata.tags).toContain('#casatulum')
    expect(r.metadata.label).not.toContain('#casatulum')
    expect(r.metadata.account_hint).toBe('efectivo')
  })

  it('gasto con múltiples #tags los extrae todos', () => {
    const r = parseNode('-$500 pintura @bbva #casatulum #remodelacion')
    expect(r.metadata.tags).toContain('#casatulum')
    expect(r.metadata.tags).toContain('#remodelacion')
  })

  // ── Edge cases ─────────────────────────────────────────────
  it('monto con decimales', () => {
    const r = parseNode('-$1200.50 gasolina @efectivo')
    expect(r.metadata.amount).toBe(1200.50)
  })

  it('cotización con acento (#cotización)', () => {
    const r = parseNode('#cotización $38500 impermeabilización @casatulum')
    expect(r.type).toBe('cotizacion')
    expect(r.metadata.amount).toBe(38500)
  })

  it('input vacío → note con contenido vacío', () => {
    const r = parseNode('   ')
    expect(r.type).toBe('note')
  })
})

// ══════════════════════════════════════════════════════════════
// computeProjData — métricas financieras del proyecto
// ══════════════════════════════════════════════════════════════
describe('computeProjData', () => {
  const makeNode = (id, type, metadata = {}) => ({
    id, type, content: id, created_at: new Date().toISOString(), metadata,
  })

  // Proyecto base con presupuesto
  const proyecto = makeNode('proj-1', 'proyecto', {
    label: 'Casa Tulum',
    budget: 500000,
    tags: ['#proyecto', '#casatulum'],
    project_slug: 'casatulum',
  })

  it('retorna null si el proyecto no existe', () => {
    expect(computeProjData('nonexistent', [proyecto])).toBeNull()
  })

  it('0 cotizaciones y 0 gastos → todas las métricas en cero', () => {
    const d = computeProjData('proj-1', [proyecto])
    expect(d.comprometido).toBe(0)
    expect(d.pagado).toBe(0)
    expect(d.pendientePago).toBe(0)
    expect(d.sinComprometer).toBe(500000)
    expect(d.overBudget).toBe(false)
  })

  it('cotización pendiente no suma a comprometido', () => {
    const cot = makeNode('cot-1', 'cotizacion', {
      amount: 85000, status: 'pendiente', project_tag: 'casatulum',
    })
    const d = computeProjData('proj-1', [proyecto, cot])
    expect(d.comprometido).toBe(0)
    expect(d.cots.length).toBe(1)
    expect(d.pendientes.length).toBe(1)
  })

  it('cotización aceptada suma a comprometido', () => {
    const cot = makeNode('cot-2', 'cotizacion', {
      amount: 85000, status: 'aceptada', project_tag: 'casatulum',
    })
    const d = computeProjData('proj-1', [proyecto, cot])
    expect(d.comprometido).toBe(85000)
    expect(d.aceptadas.length).toBe(1)
    expect(d.pendientePago).toBe(85000)
  })

  it('gasto con project_tag suma a pagado', () => {
    const cot = makeNode('cot-3', 'cotizacion', {
      amount: 85000, status: 'aceptada', project_tag: 'casatulum',
    })
    const gasto = makeNode('gasto-1', 'expense', {
      amount: 25000, project_tag: 'casatulum',
    })
    const d = computeProjData('proj-1', [proyecto, cot, gasto])
    expect(d.pagado).toBe(25000)
    expect(d.pendientePago).toBe(60000)
  })

  it('gasto con #hashtag (sin project_tag) suma a pagado', () => {
    const cot = makeNode('cot-4', 'cotizacion', {
      amount: 85000, status: 'aceptada', project_tag: 'casatulum',
    })
    // Este gasto usa el hashtag, no project_tag — el bug que arreglamos
    const gasto = makeNode('gasto-2', 'expense', {
      amount: 12500,
      tags: ['#casatulum'],   // sin project_tag
    })
    const d = computeProjData('proj-1', [proyecto, cot, gasto])
    expect(d.pagado).toBe(12500)
    expect(d.pendientePago).toBe(72500)
  })

  it('detecta overBudget cuando comprometido > presupuesto', () => {
    const cot = makeNode('cot-5', 'cotizacion', {
      amount: 600000, status: 'aceptada', project_tag: 'casatulum',
    })
    const d = computeProjData('proj-1', [proyecto, cot])
    expect(d.overBudget).toBe(true)
    expect(d.pct).toBe(100) // capped at 100
  })

  it('pct se calcula como comprometido/presupuesto', () => {
    const cot = makeNode('cot-6', 'cotizacion', {
      amount: 250000, status: 'aceptada', project_tag: 'casatulum',
    })
    const d = computeProjData('proj-1', [proyecto, cot])
    expect(d.pct).toBe(50)
  })

  it('linkedTo (hard link) también suma', () => {
    const cot = makeNode('cot-hard', 'cotizacion', {
      amount: 40000, status: 'aceptada',
      // SIN project_tag — vinculado por linkedTo en el proyecto
    })
    const proyectoConLink = makeNode('proj-2', 'proyecto', {
      label: 'Otro',
      budget: 100000,
      tags: ['#proyecto', '#otro'],
      project_slug: 'otro',
      linkedTo: ['cot-hard'],
    })
    const d = computeProjData('proj-2', [proyectoConLink, cot])
    expect(d.comprometido).toBe(40000)
  })
})
