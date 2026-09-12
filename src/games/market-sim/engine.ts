import { createRNG } from '../../core/rng'
import type { RNG } from '../../core/rng'

export type Difficulty = 'easy'|'medium'|'hard'|'expert'
export type FormulaType = 'classic' | 'weighted' | 'product' | 'runningMax'

export type MarketSettings = {
  seed: number
  difficulty: Difficulty
  durationSec: number
  tickMs: number
  formula: FormulaType
  pMispricing: number
  epsilonScale: number
  spread: number
  sizeCap: number
  monotonic: boolean
  horizonForward: number
  horizonOption: number
  classicPreset?: boolean
}

export type VarState = {
  name: string
  value: number
  min: number
  max: number
  mean: number
  step: number
  history: number[]
}

export type InstrumentType = 'spot' | 'forward' | 'call' | 'binary' | 'monoCall'

export type Instrument = {
  id: string
  type: InstrumentType
  name: string
  fair: number
  bid: number
  ask: number
  strike?: number
  horizon?: number
  mispricing: number
  mispricingDecay: number
  lastInjectedAt: number | null
}

export type Position = {
  instrumentId: string
  qty: number
  avgPrice: number
}

export type Trade = {
  tick: number
  instrumentId: string
  side: 'buy'|'sell'
  qty: number
  price: number
  fairAtTrade: number
  mispricingAtTrade: number
  pnlInstant: number
  wasArb: boolean
  wasCorrect: boolean
}

export type MarketState = {
  seed: number
  settings: MarketSettings
  rng: RNG
  vars: VarState[]
  q: number
  qHistory: number[]
  instruments: Instrument[]
  positions: Record<string, Position>
  cash: number
  trades: Trade[]
  tick: number
  startMs: number
  nowMs: number
  remainingMs: number
  over: boolean
  // metrics
  totalInjected: number
  totalCaptured: number
  falsePositives: number
  maxPossiblePnl: number
  realizedPnl: number // cash + pos*fair - start (start 0)
}

function randInt(rng: RNG, a: number, b: number) { return rng.nextInt(a, b+1) }

function createVars(rng: RNG, formula: FormulaType): VarState[] {
  const names = ['x','y','z','w']
  // bounds depending on formula
  const min = 5
  const max = formula === 'product' ? 12 : 25
  return names.map(name => {
    const mean = (min+max)/2
    const start = randInt(rng, Math.floor(mean-3), Math.floor(mean+3))
    return {
      name,
      value: start,
      min,
      max,
      mean,
      step: 1,
      history: [start]
    }
  })
}

function computeQ(vars: VarState[], formula: FormulaType, _settings: MarketSettings, _rng?: RNG): number {
  const [x,y,z,w] = vars.map(v=>v.value)
  switch(formula) {
    case 'classic':
      return x*y + z*w
    case 'weighted': {
      const a=1.2, b=0.8, c=0.5
      return a*x*y + b*z*w + c*(x+z)
    }
    case 'product':
      return x*y*z + w // to keep reasonable
    case 'runningMax': {
      // q is running max of classic
      // For simplicity, q itself is classic but we track max elsewhere
      return x*y + z*w
    }
    default:
      return x*y + z*w
  }
}

function tickVar(v: VarState, rng: RNG): VarState {
  // mean-reverting random walk
  const distFromMean = v.value - v.mean
  const range = v.max - v.min
  const reversionStrength = 0.15
  const pUpBase = 0.5 - (distFromMean / range) * reversionStrength * 5
  const pUp = Math.max(0.1, Math.min(0.9, pUpBase + (rng.next()-0.5)*0.1))
  const step = rng.bool(pUp) ? v.step : -v.step
  let nv = v.value + step
  nv = Math.max(v.min, Math.min(v.max, nv))
  return {
    ...v,
    value: nv,
    history: [...v.history.slice(-50), nv]
  }
}

// Monte Carlo estimate for E[q_T] and option payoffs
function estimateFuture(vars: VarState[], formula: FormulaType, horizon: number, rng: RNG, trials=200): { meanQ: number, qs: number[] } {
  const qs: number[] = []
  for (let t=0; t<trials; t++) {
    // clone vars
    let cur = vars.map(v=>({ ...v, value: v.value }))
    for (let h=0; h<horizon; h++) {
      cur = cur.map(v=>{
        // simple random walk without extra rng dependency? use rng
        const dist = v.value - v.mean
        const pUp = Math.max(0.2, Math.min(0.8, 0.5 - dist*0.05))
        const step = rng.next() < pUp ? v.step : -v.step
        let nv = v.value + step
        nv = Math.max(v.min, Math.min(v.max, nv))
        return { ...v, value: nv }
      })
    }
    const q = computeQ(cur, formula, { formula } as any)
    qs.push(q)
  }
  const mean = qs.reduce((a,b)=>a+b,0)/qs.length
  return { meanQ: mean, qs }
}

function fairCall(qs: number[], strike: number): number {
  const payoffs = qs.map(q=>Math.max(0, q-strike))
  return payoffs.reduce((a,b)=>a+b,0)/payoffs.length
}
function fairBinary(qs: number[], strike: number): number {
  const wins = qs.filter(q=>q>strike).length
  return wins / qs.length
}

export function initMarket(seed: number, settings: MarketSettings): MarketState {
  const rng = createRNG(seed)
  const vars = createVars(rng, settings.formula)
  const q = computeQ(vars, settings.formula, settings)
  // create instruments
  const instruments: Instrument[] = []

  const spread = settings.spread

  // spot
  instruments.push({
    id: 'SPOT',
    type: 'spot',
    name: `SPOT q=${settings.formula}`,
    fair: q,
    bid: q - spread/2,
    ask: q + spread/2,
    mispricing: 0,
    mispricingDecay: 0,
    lastInjectedAt: null
  })

  // forward
  instruments.push({
    id: `FWD_${settings.horizonForward}`,
    type: 'forward',
    name: `FWD q T+${settings.horizonForward}`,
    fair: q, // will be updated via estimate
    bid: q - spread/2,
    ask: q + spread/2,
    horizon: settings.horizonForward,
    mispricing: 0,
    mispricingDecay: 0,
    lastInjectedAt: null
  })

  // call
  const strikeCall = Math.round(q * (rng.nextFloat(0.85, 1.15)))
  instruments.push({
    id: `CALL_${settings.horizonOption}_${strikeCall}`,
    type: 'call',
    name: `CALL K=${strikeCall} T+${settings.horizonOption}`,
    fair: Math.max(0, q - strikeCall) * 0.5, // placeholder
    bid: 0,
    ask: 0,
    strike: strikeCall,
    horizon: settings.horizonOption,
    mispricing: 0,
    mispricingDecay: 0,
    lastInjectedAt: null
  })

  // binary
  const strikeBin = Math.round(q * (rng.nextFloat(0.9, 1.1)))
  instruments.push({
    id: `BIN_${settings.horizonOption}_${strikeBin}`,
    type: 'binary',
    name: `BIN q>${strikeBin} T+${settings.horizonOption}`,
    fair: 0.5,
    bid: 0,
    ask: 0,
    strike: strikeBin,
    horizon: settings.horizonOption,
    mispricing: 0,
    mispricingDecay: 0,
    lastInjectedAt: null
  })

  if (settings.monotonic) {
    const strikeMono = Math.round(q * 0.95)
    instruments.push({
      id: `MONO_CALL_${strikeMono}`,
      type: 'monoCall',
      name: `MONO_CALL K=${strikeMono} (q non-decr)`,
      fair: Math.max(0, q - strikeMono),
      bid: 0,
      ask: 0,
      strike: strikeMono,
      horizon: settings.horizonOption,
      mispricing: 0,
      mispricingDecay: 0,
      lastInjectedAt: null
    })
  }

  // initial fair calc via monte carlo for non-spot
  // use separate rng for estimation to keep deterministic
  const estRng = createRNG(seed+9999)
  for (const inst of instruments) {
    if (inst.type === 'forward') {
      const { meanQ } = estimateFuture(vars, settings.formula, inst.horizon!, estRng, 200)
      inst.fair = meanQ
    } else if (inst.type === 'call') {
      const { qs } = estimateFuture(vars, settings.formula, inst.horizon!, estRng, 200)
      inst.fair = fairCall(qs, inst.strike!)
    } else if (inst.type === 'binary') {
      const { qs } = estimateFuture(vars, settings.formula, inst.horizon!, estRng, 200)
      inst.fair = fairBinary(qs, inst.strike!)
    } else if (inst.type === 'monoCall') {
      // running max lower bound is intrinsic, plus some time value
      const { qs } = estimateFuture(vars, settings.formula, inst.horizon!, estRng, 200)
      // monotonic means q_T >= q, so fair at least intrinsic
      const intrinsic = Math.max(0, q - inst.strike!)
      const est = fairCall(qs, inst.strike!)
      inst.fair = Math.max(intrinsic, est)
    }
    inst.bid = inst.fair - spread/2
    inst.ask = inst.fair + spread/2
  }

  const now = Date.now()
  return {
    seed,
    settings,
    rng,
    vars,
    q,
    qHistory: [q],
    instruments,
    positions: {},
    cash: 0,
    trades: [],
    tick: 0,
    startMs: now,
    nowMs: now,
    remainingMs: settings.durationSec*1000,
    over: false,
    totalInjected: 0,
    totalCaptured: 0,
    falsePositives: 0,
    maxPossiblePnl: 0,
    realizedPnl: 0
  }
}

export type MarketAction =
  | { type: 'tick', nowMs: number }
  | { type: 'trade', instrumentId: string, side: 'buy'|'sell', qty: number }

export function applyMarket(s: MarketState, a: MarketAction): MarketState {
  if (s.over) return s

  if (a.type === 'tick') {
    const elapsed = a.nowMs - s.startMs
    const remaining = s.settings.durationSec*1000 - elapsed
    if (remaining <= 0) {
      return { ...s, nowMs: a.nowMs, remainingMs: 0, over: true }
    }

    // advance vars
    const newVars = s.vars.map(v=>tickVar(v, s.rng))
    const newQ = computeQ(newVars, s.settings.formula, s.settings)

    // estimate futures for fair values
    const estRng = createRNG(s.seed + s.tick * 7919 + 12345)

    let newInstruments = s.instruments.map(inst => {
      // decay mispricing
      let mis = inst.mispricing
      if (Math.abs(mis) > 0.001) {
        mis *= 0.75 // exponential decay
        if (Math.abs(mis) < 0.01) mis = 0
      } else {
        mis = 0
      }

      let fair = inst.fair
      if (inst.type === 'spot') {
        fair = newQ
      } else if (inst.type === 'forward') {
        const { meanQ } = estimateFuture(newVars, s.settings.formula, inst.horizon!, estRng, 120)
        fair = meanQ
      } else if (inst.type === 'call') {
        const { qs } = estimateFuture(newVars, s.settings.formula, inst.horizon!, estRng, 120)
        fair = fairCall(qs, inst.strike!)
      } else if (inst.type === 'binary') {
        const { qs } = estimateFuture(newVars, s.settings.formula, inst.horizon!, estRng, 120)
        fair = fairBinary(qs, inst.strike!)
      } else if (inst.type === 'monoCall') {
        const { qs } = estimateFuture(newVars, s.settings.formula, inst.horizon!, estRng, 120)
        const intrinsic = Math.max(0, newQ - inst.strike!)
        const est = fairCall(qs, inst.strike!)
        fair = Math.max(intrinsic, est)
      }

      const spread = s.settings.spread
      const bid = fair + mis - spread/2
      const ask = fair + mis + spread/2

      return {
        ...inst,
        fair,
        bid,
        ask,
        mispricing: mis,
        mispricingDecay: mis !==0 ? inst.mispricingDecay-1 : 0
      }
    })

    // arb injection
    let totalInjected = s.totalInjected
    let maxPossiblePnl = s.maxPossiblePnl

    if (s.rng.next() < s.settings.pMispricing) {
      // pick one instrument
      const idx = s.rng.nextInt(0, newInstruments.length)
      const inst = newInstruments[idx]
      // epsilon magnitude
      const diff = s.settings.difficulty
      const baseEps = s.settings.epsilonScale * (diff==='easy'? 8 : diff==='medium'? 5 : diff==='hard'? 3 : 2) * s.settings.spread
      const dir = s.rng.bool() ? 1 : -1
      // occasional huge arb for monotonic case: quote below intrinsic
      let eps = dir * baseEps * s.rng.nextFloat(0.8, 1.5)

      if (inst.type === 'monoCall' && s.rng.bool(0.3)) {
        // force obvious arb: bid below intrinsic
        const intrinsic = Math.max(0, newQ - inst.strike!)
        // set fair + mis such that ask < intrinsic
        // ask = fair+mis+spread/2 < intrinsic => mis < intrinsic - fair - spread/2
        const targetMis = (intrinsic - inst.fair - s.settings.spread/2) - s.rng.nextFloat(1,3)
        eps = Math.min(eps, targetMis) // negative large
      }

      newInstruments[idx] = {
        ...inst,
        mispricing: eps,
        mispricingDecay: 5,
        lastInjectedAt: s.tick,
        bid: inst.fair + eps - s.settings.spread/2,
        ask: inst.fair + eps + s.settings.spread/2
      }
      totalInjected++
      maxPossiblePnl += Math.abs(eps) * s.settings.sizeCap // max if you take max size
    }

    // compute realized PnL: cash + sum pos * fair
    let pnl = s.cash
    for (const pos of Object.values(s.positions)) {
      const inst = newInstruments.find(i=>i.id===pos.instrumentId)
      if (inst) pnl += pos.qty * inst.fair
    }

    return {
      ...s,
      vars: newVars,
      q: newQ,
      qHistory: [...s.qHistory.slice(-100), newQ],
      instruments: newInstruments,
      tick: s.tick+1,
      nowMs: a.nowMs,
      remainingMs: remaining,
      totalInjected,
      maxPossiblePnl,
      realizedPnl: pnl
    }
  }

  if (a.type === 'trade') {
    const inst = s.instruments.find(i=>i.id===a.instrumentId)
    if (!inst) return s
    const qty = Math.max(1, Math.min(s.settings.sizeCap, a.qty)) * (a.side==='buy'?1:-1)
    const price = a.side==='buy' ? inst.ask : inst.bid
    const fair = inst.fair
    const mis = inst.mispricing

    // determine if arb
    const isArb = Math.abs(mis) > s.settings.spread*0.6
    const correctSide = (mis < 0 && a.side==='buy') || (mis > 0 && a.side==='sell')
    const wasCorrect = isArb && correctSide

    // update position
    const prevPos = s.positions[inst.id] || { instrumentId: inst.id, qty:0, avgPrice:0 }
    const newQty = prevPos.qty + qty
    // avg price update simple
    let newAvg = prevPos.avgPrice
    if (prevPos.qty===0) newAvg = price
    else if (Math.sign(prevPos.qty) === Math.sign(newQty) || Math.sign(newQty)===0) {
      // same direction or closing
      if (Math.abs(newQty) > Math.abs(prevPos.qty)) {
        // increasing
        newAvg = (prevPos.avgPrice*prevPos.qty + price*qty)/newQty
      }
    } else {
      // flipping
      newAvg = price
    }

    const newPositions = { ...s.positions, [inst.id]: { instrumentId: inst.id, qty: newQty, avgPrice: newAvg } }
    const newCash = s.cash - qty*price

    // metrics
    let totalCaptured = s.totalCaptured
    let falsePos = s.falsePositives
    if (wasCorrect) totalCaptured++
    else if (!isArb) falsePos++

    // pnl
    let pnl = newCash
    for (const pos of Object.values(newPositions)) {
      const ii = s.instruments.find(i=>i.id===pos.instrumentId)
      if (ii) pnl += pos.qty * ii.fair
      else if (pos.instrumentId===inst.id) pnl += pos.qty * fair
    }

    const trade: Trade = {
      tick: s.tick,
      instrumentId: inst.id,
      side: a.side,
      qty: Math.abs(qty),
      price,
      fairAtTrade: fair,
      mispricingAtTrade: mis,
      pnlInstant: (fair - price)*qty,
      wasArb: isArb,
      wasCorrect
    }

    return {
      ...s,
      positions: newPositions,
      cash: newCash,
      trades: [...s.trades, trade],
      totalCaptured,
      falsePositives: falsePos,
      realizedPnl: pnl
    }
  }

  return s
}

export function isOverMarket(s: MarketState): boolean {
  return s.over
}

export function resultMarket(s: MarketState) {
  const pnl = s.realizedPnl
  const edgeCaptured = s.maxPossiblePnl>0 ? (s.trades.reduce((sum,t)=>sum+t.pnlInstant,0) / s.maxPossiblePnl)*100 : 0
  const detectionRate = s.totalInjected>0 ? s.totalCaptured / s.totalInjected : 0
  const precision = s.trades.length>0 ? s.trades.filter(t=>t.wasCorrect).length / s.trades.length : 0
  const f1 = (detectionRate+precision)>0 ? 2*detectionRate*precision/(detectionRate+precision) : 0
  const score = Math.max(0, pnl + edgeCaptured*0.5 + detectionRate*20 - s.falsePositives*2)

  return {
    pnl,
    edgeCaptured,
    detectionRate,
    precision,
    f1,
    score,
    totalInjected: s.totalInjected,
    totalCaptured: s.totalCaptured,
    falsePositives: s.falsePositives,
    trades: s.trades.length,
    maxPossiblePnl: s.maxPossiblePnl
  }
}

export function getClassicPreset(seed: number): MarketSettings {
  return {
    seed,
    difficulty: 'medium',
    durationSec: 120,
    tickMs: 1000,
    formula: 'classic',
    pMispricing: 0.25,
    epsilonScale: 1,
    spread: 1.5,
    sizeCap: 10,
    monotonic: true,
    horizonForward: 5,
    horizonOption: 10,
    classicPreset: true
  }
}
