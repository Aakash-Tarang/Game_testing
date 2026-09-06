import { RNG } from './rng'

export interface Distribution<T = number> {
  mean(): number
  sample(rng: RNG): T
  pdf?(x: T): number
  cdf?(x: T): number
  support(): T[]
  expectedValue(f: (x: T) => number): number
}

export function uniformDiscrete(min: number, max: number, step = 1): Distribution {
  const vals: number[] = []
  for (let v = min; v <= max + 1e-9; v += step) vals.push(Number(v.toFixed(10)))
  return {
    mean: () => vals.reduce((a, b) => a + b, 0) / vals.length,
    sample: (rng) => rng.choice(vals),
    pdf: (x) => (vals.includes(x) ? 1 / vals.length : 0),
    cdf: (x) => vals.filter((v) => v <= x).length / vals.length,
    support: () => vals,
    expectedValue: (f) => vals.reduce((s, v) => s + f(v), 0) / vals.length,
  }
}

export function uniformContinuous(min: number, max: number): Distribution {
  return {
    mean: () => (min + max) / 2,
    sample: (rng) => rng.nextFloat(min, max),
    pdf: (x) => (x >= min && x <= max ? 1 / (max - min) : 0),
    cdf: (x) => {
      if (x < min) return 0
      if (x > max) return 1
      return (x - min) / (max - min)
    },
    support: () => [min, max],
    expectedValue: (f) => {
      // numeric integration coarse for continuous - but ok
      const N = 1000
      let s = 0
      for (let i = 0; i < N; i++) {
        const x = min + (max - min) * (i + 0.5) / N
        s += f(x)
      }
      return s / N
    },
  }
}

export function binomial(n: number, p: number): Distribution {
  // precompute pmf
  const pmf: Map<number, number> = new Map()
  const comb = (n: number, k: number) => {
    let r = 1
    for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i
    return r
  }
  for (let k = 0; k <= n; k++) {
    pmf.set(k, comb(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k))
  }
  const vals = Array.from({ length: n + 1 }, (_, i) => i)
  return {
    mean: () => n * p,
    sample: (rng) => {
      const r = rng.next()
      let cum = 0
      for (let k = 0; k <= n; k++) {
        cum += pmf.get(k)!
        if (r < cum) return k
      }
      return n
    },
    pdf: (x) => pmf.get(x) ?? 0,
    cdf: (x) => vals.filter((v) => v <= x).reduce((s, v) => s + (pmf.get(v) ?? 0), 0),
    support: () => vals,
    expectedValue: (f) => vals.reduce((s, v) => s + f(v) * (pmf.get(v) ?? 0), 0),
  }
}

export function geometric(p: number, maxK = 50): Distribution {
  const vals = Array.from({ length: maxK }, (_, i) => i + 1)
  const pmf = (k: number) => Math.pow(1 - p, k - 1) * p
  const total = vals.reduce((s, k) => s + pmf(k), 0)
  return {
    mean: () => 1 / p,
    sample: (rng) => {
      const r = rng.next()
      let cum = 0
      for (let k = 1; k <= maxK; k++) {
        cum += pmf(k) / total
        if (r < cum) return k
      }
      return maxK
    },
    pdf: (x) => pmf(x) / total,
    cdf: (x) => vals.filter((v) => v <= x).reduce((s, v) => s + pmf(v) / total, 0),
    support: () => vals,
    expectedValue: (f) => vals.reduce((s, v) => s + f(v) * (pmf(v) / total), 0),
  }
}

export function triangular(min: number, max: number, mode: number): Distribution {
  return {
    mean: () => (min + max + mode) / 3,
    sample: (rng) => {
      const u = rng.next()
      const c = (mode - min) / (max - min)
      if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min))
      else return max - Math.sqrt((1 - u) * (max - min) * (max - mode))
    },
    support: () => [min, mode, max],
    expectedValue: (f) => {
      const N = 1000
      let s = 0
      for (let i = 0; i < N; i++) {
        // approximate via sampling many
        const x = min + (max - min) * (i + 0.5) / N
        // triangular pdf
        let pdf = 0
        if (x < mode) pdf = (2 * (x - min)) / ((max - min) * (mode - min))
        else pdf = (2 * (max - x)) / ((max - min) * (max - mode))
        s += f(x) * pdf * ((max - min) / N)
      }
      return s
    },
  }
}

export function normalDiscretized(mean: number, std: number, min: number, max: number, step = 1): Distribution {
  const vals: number[] = []
  for (let v = min; v <= max + 1e-9; v += step) vals.push(Number(v.toFixed(10)))
  const pdfRaw = (x: number) => Math.exp(-0.5 * ((x - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI))
  const total = vals.reduce((s, v) => s + pdfRaw(v), 0)
  return {
    mean: () => vals.reduce((s, v) => s + v * (pdfRaw(v) / total), 0),
    sample: (rng) => {
      const r = rng.next()
      let cum = 0
      for (const v of vals) {
        cum += pdfRaw(v) / total
        if (r < cum) return v
      }
      return vals[vals.length - 1]
    },
    pdf: (x) => pdfRaw(x) / total,
    cdf: (x) => vals.filter((v) => v <= x).reduce((s, v) => s + pdfRaw(v) / total, 0),
    support: () => vals,
    expectedValue: (f) => vals.reduce((s, v) => s + f(v) * (pdfRaw(v) / total), 0),
  }
}

export function customTable(values: number[], probs: number[]): Distribution {
  const total = probs.reduce((a, b) => a + b, 0)
  const norm = probs.map((p) => p / total)
  return {
    mean: () => values.reduce((s, v, i) => s + v * norm[i], 0),
    sample: (rng) => {
      const r = rng.next()
      let cum = 0
      for (let i = 0; i < values.length; i++) {
        cum += norm[i]
        if (r < cum) return values[i]
      }
      return values[values.length - 1]
    },
    pdf: (x) => {
      const idx = values.indexOf(x)
      return idx >= 0 ? norm[idx] : 0
    },
    cdf: (x) => values.filter((v, i) => v <= x).reduce((s, _, i) => s + norm[values.indexOf(values.filter(v => v <= x)[i])], 0),
    support: () => values,
    expectedValue: (f) => values.reduce((s, v, i) => s + f(v) * norm[i], 0),
  }
}
