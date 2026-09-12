# Preface

This document is the **complete record** of the `Game_testing` project — the quant-interview
training platform that lives in this repository. It is written as a book, in the order in which
the ideas were needed, and it assumes **nothing**: every mathematical object is built from first
principles, every engineering decision is justified, and every claim about behaviour is backed by
an experiment you can re-run.

The project's origin is a single interview experience — a 30-points-in-30-seconds expected-value
question and an `x·y + z·w` market-simulation round — and the recognition that the only reliable
way to train for that format is to *rebuild it*. The platform is therefore not a toy: it is a set
of small, exact, deterministic markets in which every price has a **computable fair value**, and
the entire skill being trained is *find the fair value fast, then trade when the market is off it*.

## What this book covers

| Part | Content |
|---|---|
| **I** | Probability from zero: sample spaces, axioms, conditional probability, random variables, expectation, variance — with the worked dice/lottery examples the games actually use |
| **II** | The distribution library (`core/distributions.ts`): six families, each derived and each verified against 200 000 empirical draws |
| **III** | Deterministic randomness: the mulberry32/splitmix32 PRNGs, line by line, plus the statistical evidence that they are sound; and the three ways the code computes expectations (enumeration, DP, Monte Carlo) with measured errors |
| **IV** | The economics: fair value, the martingale property, the four instrument families (spot/forward/call/binary), the intrinsic-value bound and the monotonic-arbitrage theorem, mean reversion and half-lives |
| **V** | The machine: the engine contract, the scoring mathematics (tolerance grading, time bonus, Brier, Elo, EWMA), and the app shell |
| **VI** | The builds, phase by phase: Phase 0 (scaffolding) and Phase 1 (EV Drill + Market Simulator) — every generator parameter, every formula in the code, worked numerical examples solved by hand |
| **VII** | The evidence: the test suite, exact-vs-Monte-Carlo fair-value tables, and a 400-session × 4-policy experiment showing *do-nothing = 0, random ≈ losing, arb-taking ≫ both* |
| **VIII** | An honest audit (21 findings, each quantified) and the mathematical preview of Phases 2–4 |

## The one rule everything hangs on

> **Every game must have a well-defined, computable fair value.**
> The engine always knows the truth; the player tries to compute it; the gap between them is
> precisely the skill being measured and trained.

This rule is why the book spends so long on expectation, distributions and PRNGs: they are the
machinery that makes "computable fair value" possible at all.

## How to read it

- Read Parts I–IV in order if the mathematics is new to you; each chapter uses only what came
  before.
- If you only want to know *what was built*, read Chapters 8, 11–13 and skim Part VII.
- If you want to *verify* everything: Chapter 14–15 cite real numbers, and
  Appendix C lists the exact commands that regenerate every table from the source.
- Formulas are typeset; where a formula appears in code, the code is quoted verbatim and the
  formula is derived immediately before or after it.

## Notation

| Symbol | Meaning |
|---|---|
| $\Omega, \omega$ | sample space; a particular outcome |
| $P(A)$ | probability of event $A$ |
| $X, Y$ | random variables |
| $\mathbb{E}[X]$ | expectation (mean) of $X$ |
| $\mathbb{E}[X \mid Y]$ | conditional expectation |
| $\mathrm{Var}(X)$, $\sigma_X$ | variance and standard deviation |
| $X \sim U\{a..b\}$ | uniform on the integers $a, a+1, \dots, b$ |
| $X \sim U[a,b]$ | uniform on the real interval $[a,b]$ |
| $\mathrm{Bin}(n,p)$, $\mathrm{Geom}(p)$ | binomial and geometric distributions |
| $q_t$ | the market simulator's derived quantity at tick $t$ |
| $\varepsilon$ | an injected mispricing (quote error vs fair value) |
| $s$ | trade size; $s>0$ = buy, $s<0$ = sell |
| $\hat{p}$ | an estimate of a probability |
| $u$ | a draw from $U[0,1)$ produced by the PRNG |

Rounding convention: numbers quoted from experiments are shown to the precision that matters
(monetary values to 2 decimals, probabilities to 3–5, as appropriate). All experiment seeds are
fixed, so every number in this book is reproducible bit-for-bit.
