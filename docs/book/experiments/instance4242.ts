// Exact fair values (via distribution DP) for the illustrative seed-4242 state,
// under both the tick kernel (T) and the estimator kernel (E), vs the engine's MC.
import * as fs from 'node:fs'
import { initMarket } from '../../../src/games/market-sim/engine'

const settings = {
  seed: 4242, difficulty: 'medium', durationSec: 60, tickMs: 1000, formula: 'classic',
  pMispricing: 0, epsilonScale: 1, spread: 1.5, sizeCap: 10, monotonic: true,
  horizonForward: 5, horizonOption: 10, classicPreset: true,
}
const st = initMarket(4242, settings)
const start = st.vars.map(v => v.value) // [16,12,14,13]
const q0 = st.q

function varDist(h, startVal, kernel) {
  const min = 5, max = 25, mean = 15
  let dist = new Map([[startVal, 1]])
  for (let t = 0; t < h; t++) {
    const nd = new Map()
    for (const [v, p] of dist) {
      const d = v - mean
      const pUpBase = kernel === 'T' ? 0.5 - (d / 20) * 0.75 : 0.5 - d * 0.05
      const lo = kernel === 'T' ? 0.1 : 0.2, hi = kernel === 'T' ? 0.9 : 0.8
      const pUp = Math.max(lo, Math.min(hi, pUpBase))
      for (const [step, ps] of [[1, pUp], [-1, 1 - pUp]]) {
        const nv = Math.max(min, Math.min(max, v + step))
        nd.set(nv, (nd.get(nv) || 0) + p * ps)
      }
    }
    dist = nd
  }
  return dist
}
function qStats(h, kernel, Kcall, Kbin) {
  const dists = start.map(s => varDist(h, s, kernel))
  const E = dists.map(dd => [...dd.entries()].reduce((s, [v, p]) => s + v * p, 0))
  const Eq = E[0] * E[1] + E[2] * E[3]
  const prod = (d1, d2) => { const m = new Map(); for (const [a, pa] of d1) for (const [b, pb] of d2) m.set(a * b, (m.get(a * b) || 0) + pa * pb); return m }
  const p1 = prod(dists[0], dists[1]), p2 = prod(dists[2], dists[3])
  const q = new Map()
  for (const [a, pa] of p1) for (const [b, pb] of p2) q.set(a + b, (q.get(a + b) || 0) + pa * pb)
  let call = 0, bin = 0, sd2 = 0
  for (const [v, p] of q) { call += p * Math.max(0, v - Kcall); if (v > Kbin) bin += p; sd2 += p * (v - Eq) ** 2 }
  return { Eq: +Eq.toFixed(3), sd: +Math.sqrt(sd2).toFixed(3), call: +call.toFixed(3), binary: +bin.toFixed(5) }
}
const call = st.instruments.find(i => i.type === 'call')
const bin = st.instruments.find(i => i.type === 'binary')
const out = {
  start, q0,
  instruments: st.instruments.map(i => ({ id: i.id, type: i.type, K: i.strike, h: i.horizon, engineFair: +i.fair.toFixed(3) })),
  exact: {
    fwd5: { T: qStats(5, 'T', call.strike, bin.strike).Eq, E: qStats(5, 'E', call.strike, bin.strike).Eq, sdT: qStats(5, 'T', call.strike, bin.strike).sd, sdE: qStats(5, 'E', call.strike, bin.strike).sd },
    call10: { T: qStats(10, 'T', call.strike, bin.strike).call, E: qStats(10, 'E', call.strike, bin.strike).call },
    bin10: { T: qStats(10, 'T', call.strike, bin.strike).binary, E: qStats(10, 'E', call.strike, bin.strike).binary },
  },
}
fs.writeFileSync(new URL('./results_instance4242.json', import.meta.url).pathname, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
