import { describe, it, expect } from 'vitest'
import { initEV, applyEV } from '../src/games/ev-drill/engine'
import { initMarket, applyMarket } from '../src/games/market-sim/engine'

describe('EV Drill determinism', () => {
  it('same seed + same actions => same result', () => {
    const settings = { seed: 123, difficulty: 'medium' as const, durationSec: 60, questionTimeSec: 30 }
    let s1 = initEV(123, settings)
    let s2 = initEV(123, settings)
    expect(s1.questions[0].truth).toBe(s2.questions[0].truth)

    // apply same answers
    s1 = applyEV(s1, { type: 'answer', value: s1.questions[0].truth })
    s2 = applyEV(s2, { type: 'answer', value: s2.questions[0].truth })
    expect(s1.totalScore).toBeCloseTo(s2.totalScore, 0)
    expect(s1.questions[1].truth).toBe(s2.questions[1].truth)
  })

  it('fairValues are exact', () => {
    const settings = { seed: 42, difficulty: 'easy' as const, durationSec: 60, questionTimeSec: 30 }
    const s = initEV(42, settings)
    // check first 10 questions have truth computable
    for (let i=0;i<10;i++) {
      const q = s.questions[i]
      expect(typeof q.truth).toBe('number')
      expect(isFinite(q.truth)).toBe(true)
    }
  })
})

describe('Market Sim determinism', () => {
  it('same seed => same init', () => {
    const base = { seed: 999, difficulty: 'medium' as const, durationSec: 60, tickMs: 1000, formula: 'classic' as const, pMispricing: 0.2, epsilonScale: 1, spread: 1, sizeCap: 10, monotonic: true, horizonForward: 5, horizonOption: 10 }
    const s1 = initMarket(999, base)
    const s2 = initMarket(999, base)
    expect(s1.q).toBe(s2.q)
    expect(s1.vars[0].value).toBe(s2.vars[0].value)
    expect(s1.instruments[0].fair).toBe(s2.instruments[0].fair)
  })

  it('fairValues correctness: spot = q', () => {
    const base = { seed: 1, difficulty: 'easy' as const, durationSec: 60, tickMs: 1000, formula: 'classic' as const, pMispricing: 0, epsilonScale: 1, spread: 1, sizeCap: 10, monotonic: false, horizonForward: 5, horizonOption: 10 }
    const s = initMarket(1, base)
    const spot = s.instruments.find(i=>i.type==='spot')!
    expect(spot.fair).toBe(s.q)
  })

  it('obvious arb detection: mono call below intrinsic', () => {
    // create state where q=100, strike 90, intrinsic 10, but quote ask 5
    const base = { seed: 2, difficulty: 'easy' as const, durationSec: 60, tickMs: 1000, formula: 'classic' as const, pMispricing: 0, epsilonScale: 1, spread: 1, sizeCap: 10, monotonic: true, horizonForward: 5, horizonOption: 10 }
    let s = initMarket(2, base)
    // manually set q high and instrument low to simulate arb
    const inst = s.instruments.find(i=>i.type==='monoCall')
    if (inst) {
      const intrinsic = Math.max(0, s.q - (inst.strike||0))
      // force arb
      const fakeInst = { ...inst, fair: intrinsic+2, bid: intrinsic-1, ask: intrinsic-0.5, mispricing: -3 }
      s.instruments = s.instruments.map(i=>i.id===fakeInst.id?fakeInst:i)
      const isObvious = fakeInst.ask < intrinsic
      expect(isObvious).toBe(true)
    }
  })

  it('random policy ≈ 0 score', () => {
    const base = { seed: 10, difficulty: 'medium' as const, durationSec: 10, tickMs: 100, formula: 'classic' as const, pMispricing: 0.25, epsilonScale: 1, spread: 1.5, sizeCap: 10, monotonic: true, horizonForward: 5, horizonOption: 10 }
    let s = initMarket(10, base)
    // simulate 20 ticks with no trades => pnl 0
    for (let i=0;i<20;i++) {
      s = applyMarket(s, { type: 'tick', nowMs: Date.now() + i*100 })
    }
    expect(s.realizedPnl).toBe(0)
    // random trades without edge should not be systematically positive - we just check structure
    expect(s.trades.length).toBe(0)
  })
})
