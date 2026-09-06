// Seeded PRNG - mulberry32 + splitmix32 for seeding
// Deterministic, fast, good enough for games

export type RNG = {
  seed: number
  next: () => number // [0,1)
  nextInt: (min: number, max: number) => number // [min, max) int
  nextFloat: (min: number, max: number) => number // [min, max)
  choice: <T>(arr: T[]) => T
  shuffle: <T>(arr: T[]) => T[]
  bool: (p?: number) => boolean
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function splitmix32(seed: number) {
  let x = seed | 0
  return function () {
    x += 0x9e3779b9
    let z = x
    z = (z ^ (z >>> 16)) * 0x85ebca6b
    z = (z ^ (z >>> 13)) * 0xc2b2ae35
    return (z ^ (z >>> 16)) >>> 0
  }
}

export function createRNG(seed: number): RNG {
  const sm = splitmix32(seed)
  const innerSeed = sm()
  const gen = mulberry32(innerSeed)

  const next = () => gen()

  return {
    seed,
    next,
    nextInt: (min: number, max: number) => {
      return Math.floor(next() * (max - min)) + min
    },
    nextFloat: (min: number, max: number) => {
      return next() * (max - min) + min
    },
    choice: <T>(arr: T[]): T => {
      return arr[Math.floor(next() * arr.length)]
    },
    shuffle: <T>(arr: T[]): T[] => {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    },
    bool: (p = 0.5) => next() < p,
  }
}

// hash string to seed
export function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0
  }
  return h >>> 0
}
