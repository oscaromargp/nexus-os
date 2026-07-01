import { describe, it, expect } from 'vitest'
import { mvNetAmount, mvComisionMxn, mvNetoAmount, mvKpis, mvWithBalance, otcQuote, directQuote } from '../movimientos-calc.js'

describe('directQuote (cálculo directo · cuánto enviar para recibir X neto)', () => {
  it('bruto = neto / (1 − fee%)', () => {
    const q = directQuote({ netTarget: 993, tc: 1, feePct: 0.7 })
    expect(q.grossMXN).toBe(1000)
    expect(q.feeMXN).toBe(7)
    expect(q.sendUnits).toBe(1000)
  })
  it('convierte el bruto a la moneda con el TC manual', () => {
    const q = directQuote({ netTarget: 1000, tc: 20, feePct: 0 })
    expect(q.grossMXN).toBe(1000)
    expect(q.sendUnits).toBe(50)
  })
  it('USDT: recibir 1,000,000 neto con TC 17.46 y 0.7%', () => {
    const q = directQuote({ netTarget: 1000000, tc: 17.46, feePct: 0.7 })
    expect(q.grossMXN).toBe(1007049.35)   // 1000000/0.993
    expect(Math.round(q.sendUnits)).toBe(57678)
  })
})

describe('otcQuote (calculadora inversa · compra de cripto)', () => {
  // Ejemplo real del usuario: 443,142 USDT @ 17.46 MXN, comisión 0.7%
  const q = otcQuote({ amount: 443142, tc: 17.46, feePct: 0.7 })
  it('MXN base = cantidad × TC', () => {
    expect(q.baseMXN).toBe(7737259.32)
  })
  it('comisión = base × %', () => {
    expect(q.feeMXN).toBe(54160.82)
  })
  it('total a pagar = base + comisión', () => {
    expect(q.totalMXN).toBe(7791420.14)
  })
  it('total expresado en cripto = total / TC', () => {
    expect(Math.round(q.totalCrypto)).toBe(446244)
  })
  it('sin comisión: total = base', () => {
    const z = otcQuote({ amount: 100, tc: 17.5, feePct: 0 })
    expect(z.totalMXN).toBe(1750)
    expect(z.feeMXN).toBe(0)
  })
  it('BTC: cantidad pequeña × TC grande', () => {
    const b = otcQuote({ amount: 0.5, tc: 1900000, feePct: 1 })
    expect(b.baseMXN).toBe(950000)
    expect(b.feeMXN).toBe(9500)
    expect(b.totalMXN).toBe(959500)
  })
})

describe('mvNetAmount (bruto MXN)', () => {
  it('usa monto_mxn si está presente', () => {
    expect(mvNetAmount({ monto_mxn: 500, cantidad: 1, tc: 99 })).toBe(500)
  })
  it('calcula cantidad × TC si no hay monto_mxn (caso BTC)', () => {
    expect(mvNetAmount({ cantidad: 0.001, tc: 1900000 })).toBe(1900)
  })
  it('TC por defecto = 1', () => {
    expect(mvNetAmount({ cantidad: 100 })).toBe(100)
  })
})

describe('mvComisionMxn', () => {
  it('entrada con comisión 0.97 sobre 1000 → 30', () => {
    expect(mvComisionMxn({ tipo: 'entrada', comision: 0.97, monto_mxn: 1000 })).toBe(30)
  })
  it('salida → 0 (sin comisión)', () => {
    expect(mvComisionMxn({ tipo: 'salida', comision: 0.97, monto_mxn: 1000 })).toBe(0)
  })
  it('entrada sin comisión → 0', () => {
    expect(mvComisionMxn({ tipo: 'entrada', monto_mxn: 1000 })).toBe(0)
  })
})

describe('mvNetoAmount (cliente)', () => {
  it('entrada: bruto − comisión', () => {
    expect(mvNetoAmount({ tipo: 'entrada', comision: 0.97, monto_mxn: 1000 })).toBe(970)
  })
  it('salida: neto = bruto', () => {
    expect(mvNetoAmount({ tipo: 'salida', monto_mxn: 200 })).toBe(200)
  })
})

describe('mvKpis', () => {
  const list = [
    { tipo: 'entrada', estado: 'hecho', comision: 0.97, monto_mxn: 1000 }, // neto 970, com 30
    { tipo: 'salida', estado: 'hecho', monto_mxn: 200 },
    { tipo: 'entrada', estado: 'pendiente', monto_mxn: 500 },
    { tipo: 'entrada', estado: 'cancelado', monto_mxn: 9999 },             // ignorado
  ]
  const k = mvKpis(list)
  it('entradas suma el neto', () => expect(k.entradas).toBe(970))
  it('salidas', () => expect(k.salidas).toBe(200))
  it('net = entradas − salidas', () => expect(k.net).toBe(770))
  it('pendiente no entra al neto', () => expect(k.pendiente).toBe(500))
  it('comisiones acumuladas', () => expect(k.comisiones).toBe(30))
  it('cancelado se ignora', () => expect(k.entradas).not.toBeGreaterThan(1000))
})

describe('mvWithBalance', () => {
  // entra newest-first
  const sorted = [
    { id: 'b', tipo: 'salida', estado: 'hecho', monto_mxn: 200 },
    { id: 'a', tipo: 'entrada', estado: 'hecho', comision: 0.97, monto_mxn: 1000 },
  ]
  const out = mvWithBalance(sorted)
  it('conserva el orden newest-first', () => {
    expect(out[0].id).toBe('b')
    expect(out[1].id).toBe('a')
  })
  it('saldo acumulado correcto (970 luego 770)', () => {
    expect(out[1]._balance).toBe(970) // tras la entrada
    expect(out[0]._balance).toBe(770) // tras la salida
  })
  it('marca pendientes y no afectan saldo', () => {
    const p = mvWithBalance([{ tipo: 'entrada', estado: 'pendiente', monto_mxn: 500 }])
    expect(p[0]._pending).toBe(true)
    expect(p[0]._balance).toBe(0)
  })
})
