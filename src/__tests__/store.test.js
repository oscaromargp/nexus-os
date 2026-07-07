import { describe, it, expect, beforeEach } from 'vitest'
import { get, set, clear, age, swr, queueWrite, queueSize, flushQueue } from '../store.js'

describe('store · get/set', () => {
  beforeEach(() => { clear('k') })
  it('set y get hacen round-trip', () => {
    set('k', { a: 1 })
    expect(get('k')).toEqual({ a: 1 })
  })
  it('get de clave inexistente → null', () => {
    clear('nope')
    expect(get('nope')).toBeNull()
  })
  it('age es pequeño tras set', () => {
    set('k', 1)
    expect(age('k')).toBeLessThan(1000)
  })
})

describe('store · swr (stale-while-revalidate)', () => {
  it('sin cache → pide a la red y la devuelve', async () => {
    clear('s1'); let calls = 0
    const data = await swr('s1', async () => { calls++; return { n: 7 } }, { ttl: 60000 })
    expect(data).toEqual({ n: 7 })
    expect(calls).toBe(1)
    expect(get('s1')).toEqual({ n: 7 })
  })
  it('cache fresca → NO vuelve a pedir', async () => {
    clear('s2'); let calls = 0
    const f = async () => { calls++; return { n: 1 } }
    await swr('s2', f, { ttl: 60000 })
    await swr('s2', f, { ttl: 60000 })
    expect(calls).toBe(1)
  })
  it('cache vieja → devuelve cache al instante y revalida (onUpdate)', async () => {
    clear('s3'); let calls = 0
    const f = async () => { calls++; return { n: calls } }
    await swr('s3', f, { ttl: 60000 })          // calls=1, cachea {n:1}
    const fresh = await new Promise(res => {
      swr('s3', f, { ttl: 0, onUpdate: res })    // ttl:0 → vieja → revalida
    })
    expect(calls).toBe(2)
    expect(fresh).toEqual({ n: 2 })
  })
  it('offline (fetcher falla) con cache → devuelve la cache', async () => {
    clear('s4')
    await swr('s4', async () => ({ ok: true }), { ttl: 60000 })
    const data = await swr('s4', async () => { throw new Error('offline') }, { ttl: 0 })
    expect(data).toEqual({ ok: true })
  })
})

describe('store · cola offline', () => {
  beforeEach(() => { clear('__queue') })
  it('encola y cuenta', () => {
    queueWrite({ action: 'x' })
    expect(queueSize()).toBe(1)
  })
  it('flush exitoso vacía la cola', async () => {
    queueWrite({ action: 'a' }); queueWrite({ action: 'b' })
    const r = await flushQueue(async () => {})
    expect(r.done).toBe(2)
    expect(queueSize()).toBe(0)
  })
  it('flush con handler que falla conserva la op', async () => {
    queueWrite({ action: 'c' })
    const r = await flushQueue(async () => { throw new Error('no') })
    expect(r.left).toBe(1)
    expect(queueSize()).toBe(1)
  })
})
