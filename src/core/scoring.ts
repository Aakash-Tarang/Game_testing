export function toleranceScore(answer: number, truth: number, _tolerancePct = 0.01): { accuracy: number, ratio: number } {
  if (truth === 0) {
    const err = Math.abs(answer)
    if (err < 0.01) return { accuracy: 1, ratio: err }
    if (err < 0.1) return { accuracy: 0.5, ratio: err }
    return { accuracy: 0, ratio: err }
  }
  const ratio = Math.abs(answer - truth) / Math.abs(truth)
  if (ratio <= 0.01) return { accuracy: 1, ratio }
  if (ratio <= 0.05) return { accuracy: 0.5, ratio }
  if (ratio <= 0.1) return { accuracy: 0.25, ratio }
  return { accuracy: 0, ratio }
}

export function timeBonus(remainingFrac: number): number {
  // remainingFrac 0..1, bonus 1.0 .. 1.5
  return 1 + 0.5 * Math.max(0, remainingFrac)
}

export function brierScore(forecasts: number[], outcomes: number[]): number {
  let s = 0
  for (let i = 0; i < forecasts.length; i++) s += (forecasts[i] - outcomes[i]) ** 2
  return s / Math.max(1, forecasts.length)
}

export function updateElo(rating: number, expected: number, actual: number, K = 32): number {
  return rating + K * (actual - expected)
}

export function ewmaUpdate(prev: number, sample: number, alpha = 0.3): number {
  return prev * (1 - alpha) + sample * alpha
}

export function normalizeScore(raw: number, maxPossible: number): number {
  if (maxPossible === 0) return 0
  return Math.max(0, Math.min(1, raw / maxPossible))
}
