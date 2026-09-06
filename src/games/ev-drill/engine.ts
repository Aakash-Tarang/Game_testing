import { createRNG, RNG } from '../../core/rng'
import { customTable, uniformDiscrete, binomial, geometric, normalDiscretized } from '../../core/distributions'
import { toleranceScore, timeBonus } from '../../core/scoring'

export type Difficulty = 'easy'|'medium'|'hard'|'expert'

export type EVScenario = {
  id: string
  tier: number
  type: string
  prompt: string
  visual?: string // extra rendering
  truth: number
  meta: any // for explanation
}

export type EVSettings = {
  seed: number
  difficulty: Difficulty
  durationSec: number // total session duration
  questionTimeSec: number // per question time limit
}

export type EVState = {
  seed: number
  settings: EVSettings
  rng: RNG
  questions: EVScenario[]
  currentIdx: number
  currentStartMs: number
  sessionStartMs: number
  sessionRemainingMs: number
  answers: {
    scenario: EVScenario
    userAns: number | null
    truth: number
    timeTakenMs: number
    accuracy: number
    score: number
    ratio: number
  }[]
  totalScore: number
  over: boolean
  // live
  nowMs: number
}

// --- generators ---

function randInt(rng: RNG, a: number, b: number) { return rng.nextInt(a, b+1) } // inclusive

function genLottery(rng: RNG, difficulty: Difficulty): EVScenario {
  const n = difficulty === 'easy' ? randInt(rng, 3,4) : difficulty === 'medium' ? randInt(rng, 3,5) : randInt(rng, 4,6)
  const outcomes: number[] = []
  const probs: number[] = []
  // generate probs that sum to 1 with nice fractions maybe
  // generate random weights then normalize
  let weights: number[] = []
  for (let i=0;i<n;i++) weights.push(rng.nextFloat(0.5, 2))
  const sumW = weights.reduce((a,b)=>a+b,0)
  const normProbs = weights.map(w=>w/sumW)

  // outcomes: depending on difficulty magnitude
  const mag = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 100 : 500
  for (let i=0;i<n;i++) {
    let v: number
    if (difficulty === 'easy') v = randInt(rng, -mag, mag)
    else if (rng.bool(0.3)) v = Number((rng.nextFloat(-mag, mag)).toFixed(1))
    else v = randInt(rng, -mag, mag)
    outcomes.push(v)
  }

  const truth = outcomes.reduce((s,v,i)=>s+v*normProbs[i],0)

  const rows = outcomes.map((v,i)=> `${v} @ ${(normProbs[i]*100).toFixed(1)}%`).join(' | ')

  return {
    id: `lot-${rng.nextInt(0,1e9)}`,
    tier: 1,
    type: 'lottery',
    prompt: `Lottery EV: outcomes with probabilities. What is E[X]?`,
    visual: rows,
    truth,
    meta: { outcomes, probs: normProbs }
  }
}

function genSequence(rng: RNG, difficulty: Difficulty): EVScenario {
  const n = 30
  // generate underlying distribution then sample 30 points
  const mean = randInt(rng, 10, 50)
  const std = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 10 : 20
  const vals: number[] = []
  for (let i=0;i<n;i++) {
    // normal-ish via uniform for simplicity
    const v = Math.round(rng.nextFloat(mean - std, mean + std) * (difficulty === 'easy' ? 1 : 10))/ (difficulty==='easy'?1:10)
    vals.push(v)
  }
  const sum = vals.reduce((a,b)=>a+b,0)
  const meanVal = sum / n
  // question variant: mean / sum / EV of bet on this draw (which is mean)
  const variant = rng.choice(['mean','sum','EV of random draw'] as const)
  let truth = variant === 'sum' ? sum : meanVal
  let prompt = variant === 'sum' ? `30 data points shown. What is the SUM?` : `30 data points shown. What is the MEAN / EV of a random draw?`
  return {
    id: `seq-${rng.nextInt(0,1e9)}`,
    tier: 2,
    type: 'sequence',
    prompt,
    visual: vals.map(v=>v.toString()).join(', '),
    truth,
    meta: { vals, variant, sum, mean: meanVal }
  }
}

function genConditional(rng: RNG, difficulty: Difficulty): EVScenario {
  // distribution uniformDiscrete 1..20 or 0..100
  const min = 1
  const max = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 50 : 100
  const vals: number[] = []
  for (let v=min; v<=max; v++) vals.push(v)
  const k = randInt(rng, Math.floor(max*0.3), Math.floor(max*0.7))
  const filtered = vals.filter(v=>v>k)
  const truth = filtered.reduce((a,b)=>a+b,0)/filtered.length
  return {
    id: `cond-${rng.nextInt(0,1e9)}`,
    tier: 3,
    type: 'conditional',
    prompt: `X ~ Uniform{${min}..${max}}. What is E[X | X > ${k}] ?`,
    visual: `P(X=k)=1/${max-min+1} for k in [${min},${max}]`,
    truth,
    meta: { min, max, k, filtered }
  }
}

function genCompound(rng: RNG, difficulty: Difficulty): EVScenario {
  // Two-step: first lottery chooses which second lottery
  // e.g., 50% -> lottery A EV=..., 50% -> lottery B
  const evA = randInt(rng, -20, 80)
  const evB = randInt(rng, -20, 80)
  const p = rng.nextFloat(0.2,0.8)
  // but make second layer have variance
  // simple: truth = p*evA + (1-p)*evB
  const pPct = (p*100).toFixed(0)
  return {
    id: `comp-${rng.nextInt(0,1e9)}`,
    tier: 4,
    type: 'compound',
    prompt: `Compound lottery: with prob ${pPct}% you get lottery A with EV=${evA}, else lottery B with EV=${evB}. What is overall EV?`,
    visual: `P(A)=${p.toFixed(2)}, EV_A=${evA}, EV_B=${evB}`,
    truth: p*evA + (1-p)*evB,
    meta: { p, evA, evB }
  }
}

function genWithCost(rng: RNG, difficulty: Difficulty): EVScenario {
  const base = genLottery(rng, difficulty)
  const cost = randInt(rng, 1, Math.max(5, Math.abs(Math.round(base.truth*0.5)) || 10))
  const net = base.truth - cost
  return {
    id: `cost-${rng.nextInt(0,1e9)}`,
    tier: 5,
    type: 'withCost',
    prompt: `Lottery EV is ${base.truth.toFixed(2)} (from: ${base.visual}). Entry fee = ${cost}. What is net EV? Is it worth paying? (enter net EV)`,
    visual: `${base.visual} | cost=${cost}`,
    truth: net,
    meta: { base: base.meta, cost, gross: base.truth }
  }
}

function genCallPayoff(rng: RNG, difficulty: Difficulty): EVScenario {
  // EV of max(0, X-K)
  const min = 0
  const max = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 50 : 100
  const K = randInt(rng, Math.floor(max*0.2), Math.floor(max*0.8))
  // uniform discrete
  const vals = Array.from({length: max-min+1}, (_,i)=>min+i)
  const payoff = (x:number)=>Math.max(0, x-K)
  const truth = vals.reduce((s,v)=>s+payoff(v),0)/vals.length
  return {
    id: `call-${rng.nextInt(0,1e9)}`,
    tier: 6,
    type: 'callPayoff',
    prompt: `X ~ Uniform{${min}..${max}}. Payoff = max(0, X - ${K}). What is E[payoff]? (call option EV)`,
    visual: `Call K=${K}, underlying uniform ${min}..${max}`,
    truth,
    meta: { min, max, K, vals }
  }
}

function pickGenerator(rng: RNG, difficulty: Difficulty): () => EVScenario {
  const pool: (()=>EVScenario)[] = []
  if (difficulty === 'easy') {
    pool.push(()=>genLottery(rng, difficulty), ()=>genLottery(rng, difficulty), ()=>genSequence(rng, difficulty))
  } else if (difficulty === 'medium') {
    pool.push(()=>genLottery(rng, difficulty), ()=>genSequence(rng, difficulty), ()=>genConditional(rng, difficulty))
  } else if (difficulty === 'hard') {
    pool.push(()=>genConditional(rng, difficulty), ()=>genCompound(rng, difficulty), ()=>genWithCost(rng, difficulty), ()=>genSequence(rng, difficulty))
  } else {
    pool.push(()=>genConditional(rng, difficulty), ()=>genCompound(rng, difficulty), ()=>genWithCost(rng, difficulty), ()=>genCallPayoff(rng, difficulty), ()=>genSequence(rng, difficulty), ()=>genLottery(rng, difficulty))
  }
  return rng.choice(pool)
}

export function generateScenario(rng: RNG, difficulty: Difficulty): EVScenario {
  const gen = pickGenerator(rng, difficulty)
  return gen()
}

// Engine implementation

export function initEV(seed: number, settings: EVSettings): EVState {
  const rng = createRNG(seed)
  const questions: EVScenario[] = []
  // pregenerate maybe 100 questions
  for (let i=0;i<100;i++) {
    questions.push(generateScenario(rng, settings.difficulty))
  }
  const now = Date.now()
  return {
    seed,
    settings,
    rng,
    questions,
    currentIdx: 0,
    currentStartMs: now,
    sessionStartMs: now,
    sessionRemainingMs: settings.durationSec * 1000,
    answers: [],
    totalScore: 0,
    over: false,
    nowMs: now
  }
}

export type EVAction =
  | { type: 'answer', value: number }
  | { type: 'skip' }
  | { type: 'tick', nowMs: number }

export function applyEV(s: EVState, a: EVAction): EVState {
  if (s.over) return s

  if (a.type === 'tick') {
    const elapsedSession = a.nowMs - s.sessionStartMs
    const remaining = s.settings.durationSec * 1000 - elapsedSession
    const over = remaining <= 0
    // also check per-question timeout
    const elapsedQuestion = a.nowMs - s.currentStartMs
    let ns = { ...s, nowMs: a.nowMs, sessionRemainingMs: Math.max(0, remaining), over }
    if (!over && elapsedQuestion > s.settings.questionTimeSec * 1000) {
      // auto skip / zero score
      const curQ = s.questions[s.currentIdx]
      const ans = {
        scenario: curQ,
        userAns: null,
        truth: curQ.truth,
        timeTakenMs: elapsedQuestion,
        accuracy: 0,
        score: 0,
        ratio: 1
      }
      ns = {
        ...ns,
        answers: [...ns.answers, ans],
        currentIdx: ns.currentIdx + 1,
        currentStartMs: a.nowMs
      }
      if (ns.currentIdx >= ns.questions.length) ns.over = true
    }
    return ns
  }

  if (a.type === 'skip') {
    const curQ = s.questions[s.currentIdx]
    const now = Date.now()
    const elapsedQuestion = now - s.currentStartMs
    const ans = {
      scenario: curQ,
      userAns: null,
      truth: curQ.truth,
      timeTakenMs: elapsedQuestion,
      accuracy: 0,
      score: 0,
      ratio: 1
    }
    const nextIdx = s.currentIdx + 1
    return {
      ...s,
      answers: [...s.answers, ans],
      currentIdx: nextIdx,
      currentStartMs: now,
      over: nextIdx >= s.questions.length || s.sessionRemainingMs <= 0
    }
  }

  if (a.type === 'answer') {
    const curQ = s.questions[s.currentIdx]
    const now = Date.now()
    const elapsedQuestion = now - s.currentStartMs
    const remainingFrac = Math.max(0, 1 - elapsedQuestion / (s.settings.questionTimeSec * 1000))
    const { accuracy, ratio } = toleranceScore(a.value, curQ.truth, 0.01)
    const base = 10
    const score = base * accuracy * timeBonus(remainingFrac)

    const ans = {
      scenario: curQ,
      userAns: a.value,
      truth: curQ.truth,
      timeTakenMs: elapsedQuestion,
      accuracy,
      score,
      ratio
    }

    const nextIdx = s.currentIdx + 1
    const total = s.totalScore + score
    const over = nextIdx >= s.questions.length || s.sessionRemainingMs <= 0

    return {
      ...s,
      answers: [...s.answers, ans],
      currentIdx: nextIdx,
      currentStartMs: now,
      totalScore: total,
      over
    }
  }

  return s
}

export function isOverEV(s: EVState): boolean {
  return s.over
}

export function resultEV(s: EVState) {
  const answered = s.answers.length
  const correct = s.answers.filter(a=>a.accuracy>=1).length
  const half = s.answers.filter(a=>a.accuracy>=0.5 && a.accuracy<1).length
  const avgTime = answered ? s.answers.reduce((sum,a)=>sum+a.timeTakenMs,0)/answered/1000 : 0
  const avgRatio = answered ? s.answers.reduce((sum,a)=>sum+a.ratio,0)/answered : 0
  return {
    totalScore: s.totalScore,
    answered,
    correct,
    half,
    avgTime,
    avgRatio,
    answers: s.answers
  }
}
