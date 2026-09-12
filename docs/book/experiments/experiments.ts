// Book experiment harness — generates every number cited in the report.
// Run: npx esbuild docs/book/experiments/experiments.ts --bundle --platform=node --outfile=docs/book/experiments/experiments.mjs && node docs/book/experiments/experiments.mjs
import * as fs from 'node:fs'
import { createRNG } from '../../../src/core/rng'
import { uniformDiscrete, binomial, geometric, normalDiscretized, triangular, customTable, uniformContinuous } from '../../../src/core/distributions'
import { initEV, applyEV, generateScenario, resultEV } from '../../../src/games/ev-drill/engine'
import type { EVSettings, Difficulty } from '../../../src/games/ev-drill/engine'
import { initMarket, applyMarket, resultMarket } from '../../../src/games/market-sim/engine'
import type { MarketSettings, VarState, FormulaType } from '../../../src/games/market-sim/engine'

// --- verbatim copies of engine internals (they are module-private in the game engine;
// --- copied exactly so experiments measure the real estimator, not a re-derivation) ---
function computeQ(vars: VarState[], formula: FormulaType): number {
  const [x, y, z, w] = vars.map(v => v.value)
  switch (formula) {
    case 'classic': return x * y + z * w
    case 'weighted': { const a = 1.2, b = 0.8, c = 0.5; return a * x * y + b * z * w + c * (x + z) }
    case 'product': return x * y * z + w
    default: return x * y + z * w
  }
}
function estimateFuture(vars: VarState[], formula: FormulaType, horizon: number, rng: { next(): number }, trials = 200): { meanQ: number, qs: number[] } {
  const qs: number[] = []
  for (let t = 0; t < trials; t++) {
    let cur = vars.map(v => ({ ...v, value: v.value }))
    for (let h = 0; h < horizon; h++) {
      cur = cur.map(v => {
        const dist = v.value - v.mean
        const pUp = Math.max(0.2, Math.min(0.8, 0.5 - dist * 0.05))
        const step = rng.next() < pUp ? v.step : -v.step
        let nv = v.value + step
        nv = Math.max(v.min, Math.min(v.max, nv))
        return { ...v, value: nv }
      })
    }
    const q = computeQ(cur, formula)
    qs.push(q)
  }
  const mean = qs.reduce((a, b) => a + b, 0) / qs.length
  return { meanQ: mean, qs }
}
function fairCall(qs: number[], strike: number): number {
  const payoffs = qs.map(q => Math.max(0, q - strike))
  return payoffs.reduce((a, b) => a + b, 0) / payoffs.length
}
function fairBinary(qs: number[], strike: number): number {
  const wins = qs.filter(q => q > strike).length
  return wins / qs.length
}

const out: any = {}
const N = 200_000

/* ---------------- 1. PRNG statistics ---------------- */
{
  const rng = createRNG(42)
  const draws: number[] = []
  for (let i = 0; i < N; i++) draws.push(rng.next())
  const mean = draws.reduce((a, b) => a + b, 0) / N
  const varr = draws.reduce((a, b) => a + (b - mean) ** 2, 0) / (N - 1)
  // chi-square over 20 equiprobable bins
  const B = 20
  const counts = new Array(B).fill(0)
  for (const d of draws) counts[Math.min(B - 1, Math.floor(d * B))]++
  const expected = N / B
  const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0)
  // lag-1 autocorrelation
  let num = 0
  for (let i = 0; i < N - 1; i++) num += (draws[i] - mean) * (draws[i + 1] - mean)
  const ac1 = num / ((N - 1) * varr)
  // determinism
  const r1 = createRNG(123456), r2 = createRNG(123456), r3 = createRNG(123457)
  const seq1 = Array.from({ length: 8 }, () => r1.next())
  const seq2 = Array.from({ length: 8 }, () => r2.next())
  const seq3 = Array.from({ length: 8 }, () => r3.next())
  let firstDiverge = -1
  for (let i = 0; i < 8; i++) if (seq1[i] !== seq3[i]) { firstDiverge = i; break }
  // nextInt uniformity over [1..6]
  const die = createRNG(7)
  const faces = new Array(6).fill(0)
  for (let i = 0; i < N; i++) faces[die.nextInt(1, 7) - 1]++
  const chi2die = faces.reduce((s, c) => s + (c - N / 6) ** 2 / (N / 6), 0)
  // shuffle uniformity: 3! = 6 permutations of [1,2,3], 60k shuffles
  const permRng = createRNG(99)
  const permCount: Record<string, number> = {}
  for (let i = 0; i < 60_000; i++) {
    const k = permRng.shuffle([1, 2, 3]).join('')
    permCount[k] = (permCount[k] || 0) + 1
  }
  const permExp = 60_000 / 6
  const chi2perm = Object.values(permCount).reduce((s, c) => s + (c - permExp) ** 2 / permExp, 0)
  out.prng = {
    mean, meanTheory: 0.5, std: Math.sqrt(varr), stdTheory: Math.sqrt(1 / 12),
    chi2_20bins: chi2, chi2_crit_19dof_0p01: 36.19,
    ac1,
    seq42: Array.from({ length: 8 }, () => createRNG(42).next()).slice(0, 3),
    seq1, seq2identical: JSON.stringify(seq1) === JSON.stringify(seq2), seq3, firstDiverge,
    dieFaces: faces, chi2die, chi2die_crit_5dof_0p01: 15.09,
    permCount, chi2perm, chi2perm_crit_5dof_0p01: 15.09,
  }
}

/* ---------------- 2. Distribution library checks ---------------- */
{
  const M = 200_000
  const check = (name: string, d: ReturnType<typeof uniformDiscrete>, theoMean: number, theoVar: number, extra?: any) => {
    const rng = createRNG(2024)
    const xs = Array.from({ length: M }, () => d.sample(rng))
    const m = xs.reduce((a, b) => a + b, 0) / M
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (M - 1)
    return { name, engineMean: d.mean(), empiricalMean: m, theoMean, empiricalVar: v, theoVar, ...extra }
  }
  const ud = uniformDiscrete(1, 20)
  const bn = binomial(10, 0.3)
  const gm = geometric(0.2)
  const nd = normalDiscretized(50, 10, 0, 100, 5)
  const tr = triangular(2, 12, 7)
  const ct = customTable([10, 20, 50], [1, 2, 1])
  const uc = uniformContinuous(0, 10)
  const varUD = (20 * 20 - 1) / 12
  const res = [
    check('uniformDiscrete{1..20}', ud, 10.5, varUD, { closedFormMean: '(1+20)/2 = 10.5' }),
    check('binomial(n=10,p=0.3)', bn, 3, 10 * 0.3 * 0.7, { pmfSum: Array.from({ length: 11 }, (_, k) => bn.pdf!(k)).reduce((a, b) => a + b, 0) }),
    check('geometric(p=0.2) trunc@50', gm, 5, (1 - 0.2) / (0.2 * 0.2), { truncationMass: Math.pow(0.8, 50), pmfSum: Array.from({ length: 50 }, (_, i) => gm.pdf!(i + 1)).reduce((a, b) => a + b, 0) }),
    check('normalDiscr(50,10;0..100,step5)', nd, 50, 100, { gridMean: nd.mean(), gridSum: Array.from({ length: 21 }, (_, i) => nd.pdf!(i * 5)).reduce((a, b) => a + b, 0) }),
    check('triangular(2,12,7)', tr, (2 + 12 + 7) / 3, null, {}),
    check('customTable{10@1,20@2,50@1}', ct, (10 * 1 + 20 * 2 + 50 * 1) / 4, null, {}),
    check('uniformContinuous(0,10)', uc, 5, 100 / 12, { midRuleEV: (() => { const d = uniformContinuous(0, 10); return d.expectedValue(x => x) })(), midRuleEVsq: (() => { const d = uniformContinuous(0, 10); return d.expectedValue(x => x * x) })(), exactEVsq: 100 / 3 }),
  ]
  // triangular variance closed form
  const a = 2, b = 12, c = 7
  const trVar = (a * a + b * b + c * c - a * b - a * c - b * c) / 18
  res[4].theoVar = trVar
  // customTable variance
  const cm = (10 + 40 + 50) / 4
  res[5].theoVar = ((10 - cm) ** 2 * 1 + (20 - cm) ** 2 * 2 + (50 - cm) ** 2 * 1) / 4
  out.distributions = res

  // E[X|X>k] engine vs closed form
  const kTest = 13
  const cond = ud.expectedValue(x => x > kTest ? x : 0) / ud.expectedValue(x => x > kTest ? 1 : 0)
  out.conditionalCheck = { engine: cond, closedForm: (14 + 20) / 2, formula: '(k+1+max)/2' }
}

/* ---------------- 3. EV Drill generator audit ---------------- */
{
  const byDiff: any = {}
  for (const diff of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    const rng = createRNG(1000 + diff.length)
    const counts: Record<string, number> = {}
    const truths: number[] = []
    const samples: Record<string, any> = {}
    for (let i = 0; i < 300; i++) {
      const s = generateScenario(rng, diff)
      counts[s.type] = (counts[s.type] || 0) + 1
      truths.push(s.truth)
      if (!samples[s.type]) samples[s.type] = { prompt: s.prompt, visual: s.visual, truth: s.truth, meta: s.meta, tier: s.tier }
    }
    const n = truths.length
    byDiff[diff] = {
      counts,
      truthMean: truths.reduce((a, b) => a + b, 0) / n,
      truthMin: Math.min(...truths), truthMax: Math.max(...truths),
      negFrac: truths.filter(t => t < 0).length / n,
      samples,
    }
  }
  out.evdrillMix = byDiff
}

/* ---------------- 4. Independent reimplementation of EV truths ---------------- */
{
  // second, independent implementation of each tier's truth to cross-check the engine
  function independentTruth(type: string, meta: any, visual: string | undefined, prompt: string): number | null {
    switch (type) {
      case 'lottery': {
        const { outcomes, probs } = meta
        return outcomes.reduce((s: number, v: number, i: number) => s + v * probs[i], 0)
      }
      case 'sequence': {
        const { vals, variant } = meta
        const sum = vals.reduce((a: number, b: number) => a + b, 0)
        return variant === 'sum' ? sum : sum / vals.length
      }
      case 'conditional': {
        const { min, max, k } = meta
        let s = 0, c = 0
        for (let v = min; v <= max; v++) if (v > k) { s += v; c++ }
        return s / c
      }
      case 'compound': {
        const { p, evA, evB } = meta
        return p * evA + (1 - p) * evB
      }
      case 'withCost': {
        const { base, cost } = meta
        const { outcomes, probs } = base
        const gross = outcomes.reduce((s: number, v: number, i: number) => s + v * probs[i], 0)
        return gross - cost
      }
      case 'callPayoff': {
        const { min, max, K } = meta
        let s = 0, c = 0
        for (let v = min; v <= max; v++) { s += Math.max(0, v - K); c++ }
        return s / c
      }
      default: return null
    }
  }
  let checked = 0, agree = 0, maxAbsErr = 0
  const mismatches: any[] = []
  for (const diff of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
    const rng = createRNG(555_000)
    for (let i = 0; i < 250; i++) {
      const s = generateScenario(rng, diff)
      const t = independentTruth(s.type, s.meta, s.visual, s.prompt)
      if (t === null) continue
      checked++
      const err = Math.abs(t - s.truth)
      maxAbsErr = Math.max(maxAbsErr, err)
      if (err < 1e-9) agree++
      else mismatches.push({ diff, type: s.type, engine: s.truth, indep: t })
    }
  }
  out.evdrillCrossCheck = { checked, agree, maxAbsErr, mismatches: mismatches.slice(0, 5) }

  // closed-form check for tier-3 and tier-6 formulas
  const closedCond: any[] = []
  for (const [max, k] of [[20, 7], [50, 25], [100, 60]]) {
    const closed = (k + 1 + max) / 2
    let brute = 0, c = 0
    for (let v = 1; v <= max; v++) if (v > k) { brute += v; c++ }
    closedCond.push({ max, k, brute: brute / c, closedForm: closed })
  }
  const closedCall: any[] = []
  for (const [max, K] of [[20, 8], [50, 30], [100, 55]]) {
    const m = max - K
    const closed = m * (m + 1) / (2 * (max + 1))
    let s = 0
    for (let v = 0; v <= max; v++) s += Math.max(0, v - K)
    closedCall.push({ max, K, brute: s / (max + 1), closedForm: closed })
  }
  out.closedForms = { conditional: closedCond, callPayoff: closedCall }
}

/* ---------------- 5. Scoring worked examples ---------------- */
{
  const { toleranceScore, timeBonus } = await import('../../../src/core/scoring')
  const cases = [
    [100.4, 100], [101, 100], [104, 100], [107, 100], [111, 100], [0.005, 0], [0.05, 0], [0.5, 0],
  ].map(([ans, truth]) => ({ ans, truth, ...toleranceScore(ans, truth) }))
  out.tolerance = cases
  out.timeBonus = [1, 0.75, 0.5, 0.25, 0].map(f => ({ remainingFrac: f, bonus: timeBonus(f) }))
  // full-score example: 10 pts * 1 * bonus
  out.scoreExamples = [
    { desc: 'instant & exact', base: 10, acc: 1, frac: 0.9, score: 10 * 1 * timeBonus(0.9) },
    { desc: 'half credit, slow', base: 10, acc: 0.5, frac: 0.05, score: 10 * 0.5 * timeBonus(0.05) },
    { desc: 'quarter credit', base: 10, acc: 0.25, frac: 0.5, score: 10 * 0.25 * timeBonus(0.5) },
  ]
}

/* ---------------- 6. Exact DP fair values vs engine Monte Carlo ---------------- */
{
  // Exact distribution of each var after h steps under a given (jitter-free) kernel.
  // Kernel T (tick, systematic): pUp = clamp(0.1, 0.9, 0.5 - 0.75*d/range)
  // Kernel E (estimator):        pUp = clamp(0.2, 0.8, 0.5 - 0.05*d)
  function varDist(h: number, kernel: 'T' | 'E'): Map<number, number> {
    const min = 5, max = 25
    let dist = new Map<number, number>()
    // deterministic start for reproducibility: start each var at mean 15
    dist.set(15, 1)
    for (let t = 0; t < h; t++) {
      const nd = new Map<number, number>()
      for (const [v, p] of dist) {
        const d = v - 15
        const pUp = kernel === 'T'
          ? Math.max(0.1, Math.min(0.9, 0.5 - (d / 20) * 0.75))
          : Math.max(0.2, Math.min(0.8, 0.5 - d * 0.05))
        for (const [step, ps] of [[1, pUp], [-1, 1 - pUp]] as const) {
          const nv = Math.max(min, Math.min(max, v + step))
          nd.set(nv, (nd.get(nv) || 0) + p * ps)
        }
      }
      dist = nd
    }
    return dist
  }
  function exactQStats(h: number, kernel: 'T' | 'E', Kcall: number, Kbin: number) {
    const dists = [0, 1, 2, 3].map(() => varDist(h, kernel))
    // E[q] by independence: E[xy]+E[zw] = E[x]E[y]+E[z]E[w]
    const E = dists.map(dd => [...dd.entries()].reduce((s, [v, p]) => s + v * p, 0))
    const Eq = E[0] * E[1] + E[2] * E[3]
    // full pmf of q via convolution of product distributions
    const prodDist = (d1: Map<number, number>, d2: Map<number, number>) => {
      const m = new Map<number, number>()
      for (const [a, pa] of d1) for (const [b, pb] of d2) m.set(a * b, (m.get(a * b) || 0) + pa * pb)
      return m
    }
    const p1 = prodDist(dists[0], dists[1]), p2 = prodDist(dists[2], dists[3])
    const q = new Map<number, number>()
    for (const [a, pa] of p1) for (const [b, pb] of p2) q.set(a + b, (q.get(a + b) || 0) + pa * pb)
    let call = 0, bin = 0, varq = 0
    for (const [v, p] of q) { call += p * Math.max(0, v - Kcall); if (v > Kbin) bin += p; varq += p * (v - Eq) ** 2 }
    return { Eq, sd: Math.sqrt(varq), call, binary: bin, support: q.size }
  }

  const seed = 4242
  const settings: MarketSettings = {
    seed, difficulty: 'medium', durationSec: 60, tickMs: 1000, formula: 'classic',
    pMispricing: 0.25, epsilonScale: 1, spread: 1.5, sizeCap: 10, monotonic: true,
    horizonForward: 5, horizonOption: 10, classicPreset: true,
  }
  const st = initMarket(seed, settings)
  const varsNow: VarState[] = st.vars.map(v => ({ ...v, value: 15 })) // force start at mean for exact comparison
  const qNow = computeQ(varsNow, 'classic', settings)
  const Kcall = Math.round(qNow * 1.05), Kbin = Math.round(qNow * 1.05)

  const results: any[] = []
  for (const h of [5, 10]) {
    const exactT = exactQStats(h, 'T', Kcall, Kbin)
    const exactE = exactQStats(h, 'E', Kcall, Kbin)
    // engine MC (200 trials, as at init) — replicated 30x to measure its spread
    const estRng = createRNG(seed + 9999)
    const mc: number[][] = []
    for (let rep = 0; rep < 30; rep++) {
      const { meanQ, qs } = estimateFuture(varsNow, 'classic', h, createRNG(1000 + rep), 200)
      mc.push([meanQ, fairCall(qs, Kcall), fairBinary(qs, Kbin)])
    }
    const col = (i: number) => mc.map(r => r[i])
    const stat = (xs: number[]) => ({ mean: xs.reduce((a, b) => a + b, 0) / xs.length, sd: Math.sqrt(xs.reduce((a, b) => a + (b - xs.reduce((c, d) => c + d, 0) / xs.length) ** 2, 0) / (xs.length - 1)) })
    const mcQ = stat(col(0)), mcC = stat(col(1)), mcB = stat(col(2))
    const mcSE_Q = exactE.sd / Math.sqrt(200) // MC standard error prediction
    results.push({
      h, Kcall, Kbin,
      kernelT: exactT, kernelE: exactE,
      mc200: { q: mcQ, call: mcC, binary: mcB },
      mcSE_Q, seFormulaCheck: { observedSD: mcQ.sd, predicted: mcSE_Q },
      biasQ_TminusE: exactE.Eq - exactT.Eq,
      relBiasQ_pct: 100 * (exactE.Eq - exactT.Eq) / exactT.Eq,
    })
  }
  out.dp = results

  // half-life numbers
  const phiT = 0.925, phiE = 0.95
  out.halflife = { phiT, phiE, hlT: Math.log(0.5) / Math.log(phiT), hlE: Math.log(0.5) / Math.log(phiE) }
}

/* ---------------- 7. Mispricing decay table ---------------- */
{
  out.decay = Array.from({ length: 9 }, (_, t) => ({ t, factor: Math.pow(0.75, t) }))
}

/* ---------------- 8. Policy experiments (none / random / arb-taker) ---------------- */
{
  const SESS = 400
  const TICKS = 60
  const base: MarketSettings = {
    seed: 0, difficulty: 'medium', durationSec: TICKS, tickMs: 1000, formula: 'classic',
    pMispricing: 0.25, epsilonScale: 1, spread: 1.5, sizeCap: 10, monotonic: true,
    horizonForward: 5, horizonOption: 10, classicPreset: true,
  }
  type Summ = { pnl: number[]; pnlInst: number[]; edge: number[]; det: number[]; prec: number[]; f1: number[]; fp: number[]; trades: number[]; injected: number[] }
  const mk = (): Summ => ({ pnl: [], pnlInst: [], edge: [], det: [], prec: [], f1: [], fp: [], trades: [], injected: [] })
  const summ: Record<string, Summ> = { none: mk(), random: mk(), arb1: mk(), arbGreedy: mk() }

  for (let s = 0; s < SESS; s++) {
    const seed = 10_000 + s
    for (const policy of ['none', 'random', 'arb1', 'arbGreedy'] as const) {
      let st = initMarket(seed, { ...base, seed })
      const prng = createRNG(seed * 31 + 7) // policy RNG, independent of market stream
      for (let t = 0; t < TICKS; t++) {
        st = applyMarket(st, { type: 'tick', nowMs: (t + 1) * 1000 })
        if (policy === 'random') {
          if (prng.next() < 0.3) {
            const inst = st.instruments[prng.nextInt(0, st.instruments.length)]
            const side = prng.bool() ? 'buy' : 'sell'
            st = applyMarket(st, { type: 'trade', instrumentId: inst.id, side, qty: 5 })
          }
        } else if (policy === 'arb1' || policy === 'arbGreedy') {
          const once = policy === 'arb1'
          for (const inst of st.instruments) {
            const mis = inst.mispricing
            const fresh = inst.lastInjectedAt === st.tick - 1 // injected on the tick just applied
            if (once && !fresh) continue
            const intrinsic = inst.type === 'monoCall' ? Math.max(0, st.q - (inst.strike || 0)) : null
            const obviousMono = intrinsic !== null && inst.ask < intrinsic
            if (obviousMono && mis <= 0) { st = applyMarket(st, { type: 'trade', instrumentId: inst.id, side: 'buy', qty: base.sizeCap }); continue }
            if (Math.abs(mis) > 0.6 * base.spread) {
              const side = mis < 0 ? 'buy' : 'sell'
              st = applyMarket(st, { type: 'trade', instrumentId: inst.id, side, qty: base.sizeCap })
            }
          }
        }
      }
      const r = resultMarket(st)
      const S = summ[policy]
      S.pnl.push(r.pnl); S.edge.push(r.edgeCaptured); S.det.push(r.detectionRate); S.prec.push(r.precision)
      S.f1.push(r.f1); S.fp.push(r.falsePositives); S.trades.push(r.trades); S.injected.push(r.totalInjected)
      S.pnlInst.push(st.trades.reduce((a, t2) => a + t2.pnlInstant, 0))
    }
  }
  const summarise = (S: Summ) => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) }
    const med = (xs: number[]) => { const y = [...xs].sort((a, b) => a - b); return y[Math.floor(y.length / 2)] }
    const pos = (xs: number[]) => xs.filter(x => x > 0).length / xs.length
    return {
      sessions: S.pnl.length,
      pnl: { mean: mean(S.pnl), median: med(S.pnl), sd: sd(S.pnl), pctPositive: pos(S.pnl), min: Math.min(...S.pnl), max: Math.max(...S.pnl) },
      capturedInstant: { mean: mean(S.pnlInst), sd: sd(S.pnlInst) },
      edgeCapturedPct: { mean: mean(S.edge), sd: sd(S.edge) },
      detection: mean(S.det), precision: mean(S.prec), f1: mean(S.f1),
      falsePositives: { mean: mean(S.fp), sd: sd(S.fp) },
      trades: { mean: mean(S.trades) }, injected: { mean: mean(S.injected) },
    }
  }
  out.policies = { none: summarise(summ.none), random: summarise(summ.random), arb1: summarise(summ.arb1), arbGreedy: summarise(summ.arbGreedy) }
  out.injectedStats = (() => {
    const xs = summ.none.injected
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
    const hist: Record<number, number> = {}
    for (const x of xs) hist[x] = (hist[x] || 0) + 1
    return { mean: m, sd, theoryMean: TICKS * base.pMispricing, theorySd: Math.sqrt(TICKS * base.pMispricing * (1 - base.pMispricing)), hist }
  })()

  // worked session: log every tick where an arb was injected and the immediate response (arb1 policy)
  {
    const seed = 10_000
    let st = initMarket(seed, { ...base, seed })
    const log: any[] = []
    for (let t = 0; t < 60 && log.length < 8; t++) {
      st = applyMarket(st, { type: 'tick', nowMs: (t + 1) * 1000 })
      const fresh = st.instruments.filter(i => i.lastInjectedAt === st.tick - 1 && Math.abs(i.mispricing) > 0.01)
      if (fresh.length === 0) continue
      let traded: any = null
      for (const inst of fresh) {
        const mis = inst.mispricing
        if (Math.abs(mis) > 0.6 * base.spread) {
          const side = mis < 0 ? 'buy' : 'sell'
          st = applyMarket(st, { type: 'trade', instrumentId: inst.id, side, qty: base.sizeCap })
          traded = { id: inst.id, side, qty: base.sizeCap, price: +(side === 'buy' ? inst.ask : inst.bid).toFixed(2), fairAtTrade: +inst.fair.toFixed(2), instantPnl: +((inst.fair - (side === 'buy' ? inst.ask : inst.bid)) * base.sizeCap).toFixed(3) }
          break
        }
      }
      log.push({ tick: t + 1, q: st.q, injected: fresh.map(i => ({ id: i.id, fair: +i.fair.toFixed(2), bid: +i.bid.toFixed(2), ask: +i.ask.toFixed(2), mis: +i.mispricing.toFixed(2) })), traded, pnlAfter: +st.realizedPnl.toFixed(3) })
    }
    out.workedSession = log
  }
}

/* ---------------- 9. EWMA / Elo rating demo ---------------- */
{
  const scores = [42, 61, 55, 78, 66, 80, 71, 85]
  let ewma = scores[0], elo = 1200
  const rows: any[] = []
  scores.forEach((sc, i) => {
    if (i === 0) { rows.push({ n: 1, score: sc, ewma, elo: Math.round(elo) }); return }
    ewma = ewma * 0.75 + sc * 0.25
    elo = elo + 32 * (sc / 100 - 0.5)
    rows.push({ n: i + 1, score: sc, ewma: +ewma.toFixed(2), elo: Math.round(elo) })
  })
  out.rating = { rows, note: 'alpha=0.25, K=32, S=score/100' }
}

/* ---------------- 10. Market sim basics for the book ---------------- */
{
  const settings: MarketSettings = {
    seed: 4242, difficulty: 'medium', durationSec: 60, tickMs: 1000, formula: 'classic',
    pMispricing: 0, epsilonScale: 1, spread: 1.5, sizeCap: 10, monotonic: true,
    horizonForward: 5, horizonOption: 10, classicPreset: true,
  }
  const st = initMarket(4242, settings)
  out.marketIllustration = {
    vars: st.vars.map(v => ({ name: v.name, value: v.value, min: v.min, max: v.max, mean: v.mean })),
    q: st.q,
    instruments: st.instruments.map(i => ({ id: i.id, type: i.type, fair: +i.fair.toFixed(3), strike: i.strike, horizon: i.horizon })),
  }
  // eps sizes by difficulty (medium): baseEps = 1 * 5 * 1.5 = 7.5, times U(0.8,1.5)
  out.epsByDifficulty = ['easy', 'medium', 'hard', 'expert'].map(d => {
    const mult = d === 'easy' ? 8 : d === 'medium' ? 5 : d === 'hard' ? 3 : 2
    return { difficulty: d, baseEps: mult * settings.spread, epsRange: [0.8 * mult * settings.spread, 1.5 * mult * settings.spread] }
  })
  // trade accounting worked example: buy 10 at ask when fair=100, mis=-3, spread=1.5
  const fair = 100, mis = -3, spread = 1.5
  const ask = fair + mis + spread / 2
  const pnlInstant = (fair - ask) * 10
  out.tradeExample = { fair, mis, spread, ask, qty: 10, pnlInstant, decayedValueAt2Ticks: (fair + mis * Math.pow(0.75, 2)) * 10 - ask * 10 }
}

fs.writeFileSync(new URL('./results.json', import.meta.url).pathname, JSON.stringify(out, null, 2))
console.log('WROTE results.json')
console.log(JSON.stringify({
  prngChi2: out.prng.chi2_20bins, policies: Object.fromEntries(Object.entries(out.policies).map(([k, v]: any) => [k, { pnl: +v.pnl.mean.toFixed(2), f1: +v.f1.toFixed(2) }])),
  dp: out.dp.map(r => ({ h: r.h, exactT: +r.kernelT.Eq.toFixed(4), exactE: +r.kernelE.Eq.toFixed(4), mc: +r.mc200.q.mean.toFixed(4), biasPct: +r.relBiasQ_pct.toFixed(3) })),
  crossCheck: out.evdrillCrossCheck,
}, null, 2))
