# Part V — The Machine

# Chapter 8 — The Engine Contract: Purity as a Design Weapon

## 8.1 The interface every game implements

```ts
export interface GameEngine<State, Action, Render, Result> {
  init(seed: number, settings: any): State      // seed → deterministic start
  tick?(s: State, dtMs: number): State          // live games only
  apply(s: State, a: Action): State             // player action (pure)
  fairValues?(s: State): Record<string, number> // THE TRUTH
  isOver(s: State): boolean
  result(s: State): Result                      // score breakdown
  render(s: State): Render                      // serializable view-model
}
```

Four rules give this interface its power:

1. **Engines are pure.** `init`/`apply`/`tick` never mutate their inputs, never read the wall
   clock or network — the only "randomness" is the seeded PRNG captured in `State`. Therefore a
   session is *the fold of an action list over an initial seed*, and replay is free.
2. **`fairValues` is the single source of truth.** The UI may hide it; scoring may not invent a
   different number. This kills an entire class of "the score disagrees with the screen" bugs.
3. **`render` returns a serializable view-model,** so React components stay dumb and a session
   log is literally the list of `Render` objects.
4. **Results are breakdowns, not just numbers** — every result carries its sub-components
   (accuracy, time, P&L, detection), which is what makes Part VII's analysis possible.

## 8.2 Why purity ⇒ testability ⇒ fairness

Because engines are pure and seeded, the acceptance tests could be written *before* the games
were tuned (and they were — `tests/determinism.test.ts`, Chapter 14):

- **Determinism:** `init(seed)` twice ⇒ identical states; identical action streams ⇒ identical
  results.
- **Golden cases:** hand-computed fair values asserted against `fairValues`.
- **Policy sanity:** a do-nothing policy must score exactly 0; a random policy must not beat a
  correct-arb policy (Chapter 15 runs this at 400-session scale).

The deeper point, worth internalizing: *in a system whose whole purpose is grading a human
fairly, determinism is not a nice-to-have — it is the audit trail.* Every disputed score can be
recomputed from `(seed, actions)`.

## 8.3 The registry pattern

`EngineRegistryEntry` (in `core/engine.ts`) binds `{ id, name, settings schema, engine, GameView,
ResultsView }` so the hub can list games without importing them individually, and so Phase 2+
games are "drop a folder + register" operations. In the Phase 1 build the router still maps the
two live games explicitly (Chapter 10), with the registry reserved for when the game count
grows.

# Chapter 9 — The Mathematics of Scoring

## 9.1 Tolerance grading (EV Drill accuracy)

`toleranceScore(answer, truth)` is a **step function of relative error** $r = |a - y|/|y|$:

$$\text{acc}(r) = \begin{cases}
1 & r \le 0.01 \\
0.5 & 0.01 < r \le 0.05 \\
0.25 & 0.05 < r \le 0.1 \\
0 & \text{otherwise}\end{cases} \qquad
\text{(truth} = 0\text{: absolute error } <0.01 \to 1,\; <0.1 \to 0.5,\; \text{else } 0)$$

Real rows from the engine (`tolerance` in `results.json`): answer $100.4$ vs truth $100$: $r = 0.004 \to 1.0$; $101 \to r = 0.01 \to 1.0$ (the boundary is inclusive); $104 \to 0.5$;
$107 \to 0.25$; $111 \to 0$.

**Why a step function and not continuous decay?** Two reasons. (a) *Interview fidelity:* real
screen-style gradings are bands. (b) *Incentive shape:* a steep cliff at 1% concentrates all
marginal value on the last digit of precision, which is precisely the mental-habit the drill
wants to build. A smooth $e^{-r}$ score would let sloppy answers farm partial credit.

## 9.2 The time bonus, and why guessing can't win

$$\text{timeBonus} = 1 + 0.5\,\max\big(0, \tfrac{T_q - t}{T_q}\big), \qquad
\text{score} = 10 \cdot \text{acc} \cdot \text{timeBonus}.$$

Maximum per question: $10 \times 1 \times 1.5 = 15$ (answer instantly, exactly). Real examples:
instant-and-exact ($t = 0.1\,T_q$): $14.5$ pts; slow half-credit: $5.13$; quarter-credit at half
time: $3.13$.

**The guessing analysis.** Suppose you know nothing and guess uniformly on an interval of width
$W$ around the truth $y$. Your probability of full credit is $\min(1, 0.02\,|y|/W)$ — for a
typical truth $y \approx 50$ and a $W = 20$ guess window, that is $5\%$; expected accuracy adds
$\approx 0.05\cdot1 + 0.05\cdot0.5 + 0.05\cdot0.25 = 0.0875$, expected score $\approx 0.9$–$1.3$
pts on a 15-pt scale — and guessing *consumes the clock that a real attempt needs*. The design
goal from the plan ("no points below 0, guessing never optimal") holds structurally: score is
multiplicative in accuracy, so a wrong answer is worth exactly nothing, and the opportunity cost
does the rest.

## 9.3 Brier score (defined now, used in Phase 2/3)

For a forecast $p \in [0,1]$ of a binary outcome $o \in \{0,1\}$:

$$B = \frac{1}{n}\sum_{i=1}^n (p_i - o_i)^2 \in [0,1], \qquad \text{best } 0,\; \text{worst } 1.$$

Constant forecasting $p = 0.5$ gives $B = 0.25$ — the natural benchmark to beat. $B$ decomposes
into reliability − resolution + uncertainty (Murphy), which is why it is the right backbone for
the planned calibration dashboard: it simultaneously rewards *honest* probabilities and
*confident-when-right* ones.

## 9.4 Elo — the real model, and the simplified one actually used

The Elo model rates players $A, B$ with $R_A, R_B$; the expectation that $A$ scores the point is

$$E_A = \frac{1}{1 + 10^{(R_B - R_A)/400}}, \qquad \text{update: } R_A' = R_A + K\,(S_A - E_A),$$

with $S_A \in \{1, 0.5, 0\}$ the actual outcome and $K$ the learning rate. The core's
`updateElo(rating, expected, actual, K = 32)` implements exactly this update shape.

Because there is only one player and no opponent pool, the store uses a *self-anchored*
simplification: treat the normalized session score $s/100$ as the outcome and 0.5 as the
expectation:

$$R' = R + 32\,\big(\tfrac{s}{100} - 0.5\big).$$

Score 100 ⇒ +16 Elo; score 0 ⇒ −16; a 100-pt game can therefore add at most $+16$ per session —
slow, stable, never wild. (Audit note F14: $s$ can exceed 100 in EV Drill, making the drift
asymmetric; bounded normalization is queued for Phase 3.)

## 9.5 The EWMA skill score — the rating actually displayed

The **exponentially weighted moving average** of session scores is

$$\hat{s}_n = \alpha\, s_n + (1-\alpha)\,\hat{s}_{n-1}, \qquad \alpha = 0.25,
\qquad \hat{s}_0 = s_0.$$

Unrolling: $\hat{s}_n = \alpha \sum_{k=0}^{n-1} (1-\alpha)^k s_{n-k} + (1-\alpha)^n \hat s_0$ —
geometrically decaying weights, total memory $\approx \frac{1}{\alpha} = 4$ sessions (the
"effective sample size" $1/\alpha$), and a noise variance that shrinks as
$\frac{\alpha}{2-\alpha}\sigma_s^2$ in steady state. Real path (experiment §9, scores $42, 61, 55, 78, 66, 80, 71, 85$):

| n | score | EWMA (α=0.25) | Elo (R′ = R+32(s/100−.5)) |
|---|---|---|---|
| 1 | 42 | 42.00 | 1200 |
| 2 | 61 | 46.75 | 1204 |
| 3 | 55 | 48.81 | 1205 |
| 4 | 78 | 56.11 | 1214 |
| 5 | 66 | 58.58 | 1219 |
| 6 | 80 | 63.94 | 1229 |
| 7 | 71 | 65.70 | 1236 |
| 8 | 85 | 70.53 | 1247 |

The EWMA lags the improving scores (by design — it is a *level*, not a snapshot) and the Elo
drifts up at $+32(\bar s/100 - 0.5)$ per session while the trend lasts. Two rating views, one
per-game row, zero servers.

## 9.6 Session scores as compositions

Every session score in the platform is a composition of the primitives above:

- EV Drill: $\text{total} = \sum \text{score}_i$ over questions (pure accumulation);
- Market Sim: $\text{score} = \max\big(0,\; \text{P\&L} + 0.5\cdot\text{edge\%} + 20\cdot\text{detection} - 2\cdot\text{falsePos}\big)$
  (Chapter 13 derives each term; Chapter 15 stresses it);
- both flow into `addSession` → EWMA + Elo + `best` + history append (capped at 1000 records),
  persisted to `localStorage` under `quant-sim` keys `profile`, `ratings`, `history`.

# Chapter 10 — The App Shell: Vite, React, Zustand, localStorage

## 10.1 Stack rationale (Phase 0 decisions, kept)

- **Vite + React + TypeScript** — instant HMR for iteration on a game feel; TS types are the
  engine contract's enforcement arm; zero backend keeps everything local and inspectable.
- **Zustand** for the shell store (profile/ratings/history) — one `create()` call, selectors
  prevent re-render storms; engines themselves stay *outside* React state: the game pages hold
  engine state in `useState` and advance it with `applyEV/applyMarket` — the React tree renders
  view-models, the engine owns the truth.
- **localStorage** for persistence (profile, ratings, last-1000 sessions); JSON export/import in
  the Profile page is the backup path. (IndexedDB was deferred: 1000 small records fit fine.)
- **Vitest + jsdom** for the engine tests; engines being pure, tests need no DOM at all.

## 10.2 Routing and layout

A 43-line hash router (`app/router.tsx`) parses `#/path?query` into a `Route` and maps:
`/` → Dashboard, `/ev-drill` → EV Drill page, `/market-sim` → Market Sim page, `/profile` →
Profile. Hash routing means the built site works from any static host or `file://` with no
server rewrites. The Dashboard renders the game cards (two live, two "LOCKED" placeholders for
Phase 2) with per-game EWMA/best/Elo and a sparkline of the last 20 session scores.

## 10.3 The tick loop

Live games need a heartbeat. The pages use `setInterval` at the game's cadence
(`settings.tickMs`, default 1000 ms for the market; 100 ms for the EV Drill's *display* timer,
which only re-renders the countdown — actual question scoring uses timestamps captured at
submit). Each beat dispatches an engine `tick` action with `nowMs: Date.now()`; the engine
handles duration expiry internally, so the UI never makes timing decisions. The shared
`Ticker`/`useCountdown` helpers in `ui/index.tsx` wrap the same pattern for reuse.

## 10.4 What runs where (the mental model)

```
┌────────────── browser ──────────────┐
│ React UI  ← render(state)           │  dumb view-models, re-render per tick
│    │ actions                         │
│    ▼                                 │
│ Engine state (useState)              │  pure, seeded, replayable
│    │ result(state) on over           │
│    ▼                                 │
│ Zustand store → localStorage         │  profile, ratings(EWMA/Elo), history
└──────────────────────────────────────┘
```

The engine layer is UI-agnostic and importable from Node — which is exactly what allowed the
entire Part VII experiment suite (400-session policy runs, exact DP verification) to run
headlessly against the *same code* the browser plays.
