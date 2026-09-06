# Trading Simulator — Plan of Action

> Goal: build a local, web-based **quant interview training platform** — a suite of mini-games
> that train EV calculation, pattern recognition, arbitrage detection, market-making, and fast
> mental math. Minimal finance knowledge required; the games are fundamentally **math puzzles
> with a trading skin**.
>
> Primary audience: one user (the developer) prepping for an Optiver-style quant-trading
> internship interview. Secondary value: a replayable, self-scoring practice environment with
> tracked progress over time.

---

## 0. Product summary

A single-page web app ("hub") that hosts **8–12 independent mini-games**, each with:

- a settings screen (difficulty, duration, seed, mode),
- a live "game view",
- a results screen (score breakdown),
- a persistent per-game **rating** (Elo) and full history.

Every game shares one core loop: **see information → compute a number / spot an edge → act →
get scored on EV-correctness and speed.** All randomness is seedable and reproducible.

### The single most important design rule

> **Every game must have a well-defined, *computable* fair value.** The player's edge is always
> "find the fair value fast and trade when the market is off from it." This is what the real
> Optiver simulator tests, so this is the invariant every game engine must satisfy. The engine
> computes fair value; the player tries to; the gap is the skill being measured.

---

## 1. Game catalog

Each entry: **Mechanics · Math model · Scoring · Difficulty levers**.

---

### 1.1 EV Drill (from your interview — 30 points / 30 seconds)

**Mechanics.** A "scenario" is shown for a fixed time (default 30s). The player must produce a
numeric answer (free-text, tolerance-graded) before the clock runs out. Scenarios are drawn from
a generator with difficulty tiers.

**Scenario types (tiered):**

| Tier | Scenario | Answer | Notes |
|------|----------|--------|-------|
| 1 | Lottery: outcomes `x_i` with probabilities `p_i` | `Σ p_i·x_i` | 3–6 outcomes |
| 2 | Sequence of 30 data points shown; "what is the mean / sum / EV of a bet on this draw" | mean, sum, or EV | the "30 points" feel |
| 3 | Conditional EV: "EV given X > k" | `E[x | x>k]` | truncated distributions |
| 4 | Two-step: EV of EV (compound lottery / option-like) | nested EV | |
| 5 | EV with cost/entry fee: "worth paying c?" | net EV, yes/no + amount | |
| 6 | Mixed: EV of `max(0, x-K)` over a small discrete distribution | call payoff EV | bridges to options |

**Math model.** Distributions are drawn from a fixed library (uniform, binomial, geometric,
normal-discretized, custom tables). The generator *computes* the exact answer first, then
renders the scenario — so the answer is always exact (tolerance only absorbs rounding).

**Scoring.** `base_points · accuracy(tolerance_ratio) · time_bonus(remaining_frac)`. Accuracy is a
step function: within 1% → full, 5% → half, else 0. Time bonus rewards speed without making
guessing optimal (no points below 0).

**Difficulty levers.** Outcome count, value magnitude/decimals, distribution entropy, time limit,
MCQ vs free-text.

---

### 1.2 Market Simulator — the core Optiver-style game (highest priority)

This is the flagship. Faithful to what you described, then generalized.

**Mechanics.** A live ticker runs at cadence `T` ms (default 1000ms, configurable). At each tick
a small set of **base variables** evolves. Derived quantities and their quoted instruments are
shown. Some quotes are *fair*, some are *mispriced*. The player buys/sells any instrument at the
quoted price, with size `s ∈ [-S, +S]`. P&L is mark-to-market against fair value. The goal:
detect mispricings and trade before they correct.

**Base variables.** Four variables `x, y, z, w` (this is the `x·y + z·w` you saw), each following
a discrete mean-reverting / random-walk process (steps ±δ with configurable drift, bounded
range). Extensible to more variables and richer formulas.

**Derived quantity.** `q = x·y + z·w` (tier 1), then
`q = a·x·y + b·z·w + c·(x+z)` (tier 2), possibly `q = x·y·z` or a running-max term (tier 3).

**Instruments & fair values** (all computable by the engine from the current state):

| Instrument | Fair value | Arb injection |
|------------|------------|---------------|
| Spot `q` | `q` | quote = `q ± spread/2`, occasionally off by `ε` |
| Forward (swap on `q` at horizon `h`) | `E[q_{t+h}]` (martingale → `= q` if zero drift) | quote off by `ε` |
| Call on `q`, strike `K` | `E[max(q_T − K, 0)]` via brute-force over the known step distribution | quote off by `ε` |
| Binary / digital on `q > K` | `P(q_T > K)` | quote off by `ε` |
| Monotonic variant | `q` known non-decreasing (e.g. running max), so `E[q_T]` has a tight bound | quote violates the bound → **obvious arb** |

**Arb injection scheme.** Each tick, with probability `p_mispricing`, exactly one instrument's
quote is shifted by `±ε` (ε scales with difficulty). The mispricing **mean-reverts** over the
next few ticks (the quote decays back toward fair). The player must (a) *notice* the quote is
wrong relative to the fair value they can compute from the visible variables, and (b) *act*
before it decays. Correct arb = buy the underpriced / sell the overpriced instrument; the P&L is
`|ε|·|s|` realized as the quote converges.

**The "monotonically up" case (from your interview).** A dedicated mode where the underlying is
guaranteed non-decreasing, so a call's fair value has a closed-form lower bound equal to
`max(0, q_t − K)` (intrinsic value). Any quote *below* intrinsic is instant free money. This
trains "spot the trivially wrong quote" — the skill you said you missed.

**Scoring.** Total P&L + efficiency bonus: `Σ realized P&L` normalized by `Σ |ε|·S` (max possible)
→ "edge captured %". Plus a detection-metric: fraction of injected arbs you traded, with a
penalty for trading *when no edge existed* (false positives — this is what separates real
traders). Final score = P&L-weighted + detection F1 + speed.

**Difficulty levers.** Tick cadence, ε magnitude, `p_mispricing`, number of instruments,
complexity of `q`, spread width, order-size cap, whether spot is shown raw or must be derived.

---

### 1.3 ETF Arbitrage (random; **no AI market makers**)

**Mechanics.** A basket of `n` stocks (default 4–5) with weights `w_i`, and one ETF. The ETF's
**NAV** = `Σ w_i · S_i` is always recomputable. The ETF's *price* `P` follows a random walk
around NAV but occasionally deviates by more than a transaction-cost threshold. The player trades
the ETF (buy when `P ≪ NAV`, sell when `P ≫ NAV`) and books the convergence when `|P − NAV|`
closes back below threshold.

**No AI**: the "quotes" are mechanical — `P` is just NAV plus a mean-reverting tracking error
`e` (Ornstein–Uhlenbeck, discretized). Nothing adversarial, no market maker logic; the only
signal is the visible gap `P − NAV`.

**Math model.** `e_t = φ·e_{t-1} + noise`. Arb condition: `|e| > c + fee` where `c` is the
round-trip cost. P&L on a round trip = `|e_entry| − |e_exit| − fees`.

**Scoring.** P&L over a session (default 60s), plus **spotted-but-missed** penalty for large gaps
the player didn't trade. Difficulty: noise σ, φ (convergence speed), fee, n stocks (mental-load:
summing the basket fast), whether NAV is shown or must be summed by the player.

---

### 1.4 Card Game — Market Taking

**Mechanics.** Classic market-taking exercise. The player holds one card with value `v`
(1–10). The "market" posts a two-sided quote for a card of *unknown* value `u ~ U{1..10}`
(EV 5.5): bid `b` (they'll buy at `b`), ask `a` (they'll sell at `a`). The player can **sell**
their card at `b` (edge if `b > v`) or **buy** at `a` (edge if `a < 5.5`), or pass. Deal →
resolve → repeat. Fast rounds.

**Variant (harder):** the player sees *two* of their own cards, the market's quote is on the
*sum* or the *max*, and sometimes the quote is off by a known bias. Train: "read quote → compare
to EV → take or pass instantly."

**Math model.** All values discrete and exact. Edge = `b − v` (sell) or `5.5 − a` (buy). Take iff
`edge > 0`; score = realized edge, penalize negative-edge takes.

**Difficulty levers.** Card range, whether market quote is clean or noisy (small random bias you
must average out), round time, multi-card variants.

---

### 1.5 Market Making Dice Game

**Mechanics.** The event is the **sum of two dice** (distribution: triangular, 2–12). The player
is a market maker: each round they post a **bid** and an **ask** for a defined contract (e.g.
binary "sum ≥ 7", or a 1-point payout per pip). Simulated flow arrives:

- **noise flow** (50–80%): hits either side randomly (market makers earn the spread),
- **informed flow** (the rest): knows the true dice outcome and hits only the *wrong* side.

After `n` trades or a "settlement" roll, the contract resolves at true value. The player's
inventory is marked, and event risk materializes.

**Math model.** Fair value of "sum ≥ 7" = `21/36`. Fair of "sum = k" = `P(k)`. The player's
task: keep quotes *tight enough to get filled* but *wide enough to survive informed flow*, and
manage inventory (net exposure to the event). Classic MM tradeoff: spread vs adverse selection.

**Scoring.** `flow P&L + settlement P&L − inventory-risk penalty` (e.g. mark inventory at fair
with a risk charge proportional to exposure·variance). Difficulty: informed-flow %, tick/round
speed, inventory caps, contract complexity (sum, difference, product of two rolls).

---

### 1.6 Fermi Estimation

**Mechanics.** Show a question ("How many piano tuners in Mumbai?", "How many golf balls fit in a
Boeing 747?", "Length of the Nile in km"). The player enters a **90% confidence interval**
`[lo, hi]`. Timer runs. Scored on coverage, tightness, and speed.

**Math model.** The "true" answer is stored per question (known, factual, plus a few
computable ones). Scoring uses an **interval score**: correct (true ∈ [lo,hi]) → reward scaled by
`tightness = 1/(1+log(hi/lo))`; wrong → penalty scaled by how far the truth missed the interval.
Track **calibration**: what % of your 90% intervals actually contain the truth (should trend to
90%).

**Difficulty levers.** Question bank tier, allowed time, required coverage level (50/80/90%).

---

### 1.7 Event Contracts (YES/NO)

**Mechanics.** A binary event has a hidden true probability `p` (drawn from a known distribution).
The player quotes a two-sided market on "YES". Flow arrives over a window:

- **noise flow** hits randomly,
- **informed flow** (knows the outcome) hits the mispriced side.

At the end the event **resolves** to its true binary outcome. The player's final book settles.

**Math model.** The player's edge = keep quotes around their belief `p̂` so that informed flow
can't systematically win while noise flow pays the spread. Resolve: YES pays 1, NO pays 0.
Score = `flow P&L + settlement P&L`, plus **Brier/calibration score** comparing `p̂` to realized
frequency (separate metric — trains honest probability judgment, the key Optiver YESNO skill).

**Difficulty levers.** Informed-flow %, quote window, event-prior distribution, number of
sequential events (build a calibration curve).

---

### 1.8 Arithmetic Speed ("80 in 8", rated)

**Mechanics.** Zetamac-style: `N` questions (default 80) in `M` minutes (default 8). Operations:
`+ − × ÷`, configurable. Free-text answer, instant next. Missed/blank counts as wrong.

**Math model.** Problem generator with difficulty classes (digit ranges, division exactness,
mixed-sign). **Rated**: each operation family has its own **Elo**; problem difficulty is Elo-scaled
so the engine serves questions near your current ability (adaptive).

**Scoring.** `correct − 0·blank` (Zetamac convention: blanks just cost time; wrong also costs
time). Report speed (Q/min), accuracy, and per-op Elo. This becomes your "rated arithmetic"
benchmark you asked for.

---

### 1.9 Own additions (pick-and-choose, low build cost)

| Game | One-line spec | Trains |
|------|---------------|--------|
| **EV Flash** | 5s per question: "which has higher EV?" MCQ, rapid | fast EV ranking |
| **Kelly Sizing** | given win-prob `p` and odds `b`, state optimal fraction `f* = (bp−(1−p))/b`; scored vs `f*` | bet sizing |
| **Brier Trainer** | state a probability for a fact (trivia with known answer); score Brier | calibration |
| **Sequence / Pattern** | next term in a numeric sequence (arithmetic, geometric, quadratic, Fibonacci, modular) | pattern recognition |
| **Approximation** | estimate `√x`, `x·y`, `x/y`, `x^y` within tolerance; scored by relative error | number sense |
| **Payoff Recognition** | identify option payoff from a payoff diagram (call/put/spread/straddle) | option intuition |
| **Arb Detection** | two correlated quotes flash; "arb or no arb?" yes/no, timed | arb instinct |

---

## 2. Architecture

### 2.1 Stack (recommended default)

- **Vite + React + TypeScript** (fast `npm run dev`, hot reload, zero config). No backend, no DB
  server — everything runs locally in the browser.
- **State**: Zustand (light, per-game) + a thin app shell. No Redux.
- **Persistence**: `localStorage` for settings/profile + **IndexedDB** (via `idb` or Dexie) for
  large history (game logs, per-game Elo curves).
- **Styling**: plain CSS modules or Tailwind. Keep it minimal/dark ("terminal" aesthetic fits the
  trading theme and is fast to build).
- **Testing**: Vitest. Engines are pure functions → unit-testable without the UI.

*Decision (default chosen): Vite + React + TS. Override if you prefer Next.js, Svelte, or
vanilla. The engine layer is UI-agnostic, so this choice is low-cost to change later.*

### 2.2 Core abstractions

```
core/
  rng.ts          # seeded PRNG (mulberry32 + splitmix32). Every game takes a seed.
  engine.ts       # GameEngine<State, Action, Render, Result> interface (below)
  scoring.ts      # score normalization, tolerance grading, Brier, Elo update, calibration
  clock.ts        # tick scheduler / requestAnimationFrame driver with configurable cadence
  distributions.ts# uniform, binomial, geometric, normal-discretized, triangular — each with pdf/E[] 
  types.ts        # shared types
```

**The GameEngine interface** (the contract every game implements):

```ts
interface GameEngine<State, Action, Render, Result> {
  init(seed: number, settings: Settings): State;
  tick?(s: State, dtMs: number): State;          // live games only
  apply(s: State, a: Action): State;             // player action
  fairValues?(s: State): Record<string, number>; // engine truth (used for scoring + tests)
  isOver(s: State): boolean;
  result(s: State): Result;                       // score breakdown
  render(s: State): Render;                       // UI-view model (pure)
}
```

Rules:
1. Engines are **pure and deterministic** given `seed` + action sequence (replayable).
2. `fairValues` is *the* source of truth — UI may hide it, scoring uses it, tests assert it.
3. `render` returns a serializable view-model so UI components stay dumb.

### 2.3 App shell / hub

- Router (hash-based, no server): `/` dashboard, `/{game}/settings`, `/{game}/play`, `/{game}/results`, `/profile`.
- Dashboard: list of games, each with current Elo, best score, last-7-days trend, "Play".
- Profile: single local account (name + stats). No auth — just a local identity persisted in
  `localStorage`, with JSON export/import for backup.
- Global settings: default seed, difficulty presets, sound on/off.

### 2.4 Persistence model

- `profile`: id, display name, created-at, aggregate stats.
- `ratings`: `{gameId → Elo}` + per-sub-skill Elo (e.g. per-operation arithmetic).
- `history`: append-only log of every completed session (`gameId, seed, settings, score, breakdown, ts`).
- `calibration`: rolling records for Fermi/YESNO/Brier (interval-hit %, Brier score over time).

---

## 3. Scoring & rating (unified)

Two layers:

1. **Session score** (per game, game-specific formula — see §1) with sub-components
   (accuracy / speed / P&L / calibration / detection).
2. **Rating** (Elo, updated after each session) so you can see *improvement over time*, which is
   the whole point of interview prep.

Elo update: `R' = R + K·(S − E)` with `K=32`, `S` = 1/0.5/0 from a **session outcome vs your own
expected level** (self-anchored Elo — since there's only one user, we anchor difficulty by
session score vs a moving average, not vs another player). Simpler alternative for v1: just
store a normalized **skill score** per game (exponentially-weighted moving average of session
scores) and render a trend chart. *Default: implement the EWMA skill score first; Elo only if
you want adaptive difficulty (arithmetic §1.8 needs it).*

---

## 4. Project structure

```
trading-sim/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── app/               # shell, router, dashboard, profile, settings store
│   ├── core/              # rng, engine, scoring, clock, distributions, types
│   ├── ui/                # shared components (Timer, ScoreBoard, NumberInput, Sparkline…)
│   └── games/
│       ├── ev-drill/
│       ├── market-sim/        # flagship (1.2)
│       ├── etf-arb/
│       ├── card-taking/
│       ├── dice-mm/
│       ├── fermi/
│       ├── event-contract/
│       ├── arithmetic/
│       └── (own additions)/
└── tests/                 # vitest, per-engine
```

Each `games/<id>/` exports `{ id, name, settings, engine, GameView, ResultsView }` and registers
itself with the hub via a registry — adding a new game = drop a folder + register it.

---

## 5. Implementation phases (execution order)

### Phase 0 — Scaffolding (½ day)
- [ ] Vite + React + TS project init; `npm run dev` works.
- [ ] Hash router + dashboard shell + profile store (localStorage).
- [ ] `core/rng.ts` (seeded PRNG) + `core/engine.ts` interface + `core/scoring.ts` stubs.
- [ ] `core/distributions.ts` (uniform/binomial/geometric/normal-discretized/triangular, each with `pdf`, `cdf`, `mean`, `sample`, `expectedValue(f)`).
- [ ] Shared UI kit: Timer, ScoreBoard, NumberInput, Chart/Sparkline.
- [ ] Vitest wired; one dummy engine + passing test to prove the pattern.

### Phase 1 — MVP: the two interview-critical games (1–2 days)
- [ ] **EV Drill** (1.1) full loop: generator → play → results → history.
- [ ] **Market Simulator** (1.2) tier-1: 4 vars, `q = x·y + z·w`, spot + forward + call, arb
      injection with mean-reversion, P&L + detection scoring. This is the make-or-break build;
      get the tick loop + mark-to-market right.
- [ ] Tests: fair-value correctness (property tests over seeds), arb-injection determinism.

### Phase 2 — Tradermath ports (2 days)
- [ ] ETF Arb (1.3), Card Taking (1.4), Dice MM (1.5), Fermi (1.6), Event Contracts (1.7).
- [ ] Each with settings + scoring + one test.

### Phase 3 — Own games + rating (1–2 days)
- [ ] Arithmetic "80 in 8" (1.8) with per-op Elo / adaptive difficulty.
- [ ] 2–4 additions from §1.9 (EV Flash, Brier Trainer, Approximation, Sequence).
- [ ] Unified rating/EWMA + dashboard trend charts + JSON export/import.

### Phase 4 — Polish & tuning (1 day)
- [ ] Difficulty presets, seed UI, replay-a-session, sound.
- [ ] Calibration dashboard (Fermi interval-hit %, YESNO/Brier).
- [ ] Balance pass on every game's difficulty levers (aim: you score mid-range, not max, at
      current skill — room to improve).

---

## 6. Acceptance criteria

- [ ] `npm run dev` → browser opens the hub; all games reachable and playable end-to-end.
- [ ] Every game engine has a **deterministic** test (same seed + same actions → same result).
- [ ] Every game's `fairValues` is **provably correct** (unit-tested against hand-computed cases).
- [ ] Progress persists across reloads; dashboard shows per-game trend.
- [ ] No game rewards guessing/random input above the "do nothing" baseline (guard with a
      "random policy" test: random actions ≈ 0 score, optimal-ish actions > 0).
- [ ] The Market Simulator can inject an *obvious* arb and correctly award a trade on it, and
      penalize a trade when no edge exists.

---

## 7. Decisions made (defaults — override if you disagree)

1. **Stack**: Vite + React + TS, no backend, all-local. (matches "npm run + browser")
2. **Account**: single local profile, no auth, JSON export for backup.
3. **Rating**: EWMA skill score first; Elo only for adaptive arithmetic.
4. **RNG**: seedable everywhere; every session records its seed for replay.
5. **No AI market makers anywhere** (per your request) — markets are mechanical/random.

## 8. Open questions for the user (resolve before/at start)

1. **EV Drill input format**: free-text number (tolerance-graded) vs 4-way MCQ vs both (tiered)?
   *(default: both — MCQ at low tiers, free-text at high tiers)*
2. **Market Simulator fidelity**: do you want to replicate the *exact* "4 variables + swaps +
   monotonic options" setup you saw, or the generalized version in §1.2? *(default: generalized,
   but with a "classic" preset that matches what you described)*
3. **Aesthetic**: dark "terminal" theme vs clean light theme? *(default: dark)*
4. **Session lengths**: should games be fixed-duration (60s) or "until you quit"? *(default:
   fixed with configurable duration)*

## 9. Risks & mitigations

- **Tick-loop performance**: live games re-render at high frequency → drive the ticker with
  `requestAnimationFrame`/`setInterval` updating a Zustand store, render only changed numbers,
  keep the view-model small. Don't re-render whole trees per tick.
- **Fair-value bugs = broken training**: mitigate with property tests + "random policy ≈ 0"
  tests + hand-computed golden cases per instrument.
- **Scope creep (12 games)**: phases are ordered by interview value; MVP is only EV Drill +
  Market Simulator. Ship that first, then expand.
- **Overfitting the wrong skill**: every game must trace back to a concrete interview skill
  (EV / pattern / arb / calibration / speed). Drop games that don't.

---

## 10. How the next agent should START

1. Read this file.
2. Answer §8 (or accept defaults).
3. Execute Phase 0 fully (scaffold + `core/` + one dummy engine + tests green).
4. Build Phase 1 (EV Drill + Market Simulator) to completion before touching Phase 2.
5. Check in after MVP: show the two games running + the deterministic test suite passing, then
   continue through Phases 2–4.

*Definition of done for the MVP handoff: `npm run dev` opens a hub with two fully playable,
scored, persistence-backed games (EV Drill + Market Simulator), and `npm test` passes the engine
test suite.*
