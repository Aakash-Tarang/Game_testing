# Part VI — The Builds, Phase by Phase

# Chapter 11 — Phase 0: Scaffolding (the day the machine got its bones)

Phase 0's deliverables, all checked in: a Vite + React + TS project (`package.json` scripts:
`dev`, `build`, `lint` (oxlint), `test` (vitest)); the `core/` layer — `rng.ts`,
`distributions.ts`, `scoring.ts`, `engine.ts`, `clock.ts`, `types.ts` — whose mathematics fills
Parts II–V; the app shell (router, dashboard, profile, store); the shared UI kit; and a green
test proving the determinism pattern on a stub. Two games' engines (EV Drill, Market Sim) and
their pages followed within Phase 1, but Phase 0's *shape* — pure cores, dumb views, one store —
was fixed here, and nothing in Phase 1 needed to break it.

The repo tree as it stands (line counts from `wc -l`):

```
src/
  core/        rng 72 | distributions 173 | scoring 38 | engine 21 | clock 36 | types 38
  app/         Dashboard 100 | ProfilePage 68 | router 43 | store 82
  ui/          shared kit 65
  games/
    ev-drill/    engine 351 | page 265
    market-sim/  engine 559 | page 298
tests/determinism.test.ts  75
uploads/PLAN_OF_ACTION.md  452   ← the founding spec this book documents against
```

# Chapter 12 — Phase 1a: The EV Drill (30 points, 30 seconds, rebuilt from math)

## 12.1 What the game is

A question appears; a 30-second clock (configurable 15/30/45/60) burns; you type a number; Enter.
Scoring is Chapter 9's $10 \cdot \text{acc} \cdot \text{timeBonus}$. The session runs a fixed
duration (60–300 s); questions are pre-generated at `init` (100 of them, from the seeded RNG) so
the question stream is itself deterministic and replayable.

## 12.2 The six scenario tiers and their generator mathematics

Each tier is a generator function `(rng, difficulty) → {prompt, visual, truth, meta}`. The
**truth is computed first, exactly**, from the actual sampled parameters — the prompt is then
rendered from those same parameters. That ordering (`compute, then render`) is the
anti-rigging guarantee.

**T1 — Lottery (`genLottery`).** Draw $n$ outcomes and weights $w_i \sim U(0.5, 2)$, normalize
$p_i = w_i/\sum w_j$ (so probabilities are exact and sum to 1 by construction), draw outcomes
$x_i$ (integers in $[-M, M]$; at medium/hard 30% get one decimal), truth $= \sum p_i x_i$.
Magnitudes: $M = 20/100/500$ by difficulty; $n = 3$–$4$ (easy), $3$–$5$ (medium), $4$–$6$
(hard/expert). *Real generated instance* (medium): outcomes $15@30.6\%$, $86@32.7\%$, $98@15.2\%$, $63@21.6\%$ — truth $= 0.30596\cdot15 + 0.32657\cdot86 + 0.15171\cdot98 + 0.21577\cdot63 = 61.1349$. The player's fast path: round the probabilities to thirds-and-sixths, weight the big numbers, refine — tolerance grading (±1% full credit =
±0.61 here) forgives the rounding.

**T2 — Thirty data points (`genSequence`).** Draw mean $\mu \in \{10..50\}$, noise width
$\sigma = 5/10/20$ by difficulty; sample 30 values $v_i \sim U(\mu - \sigma, \mu + \sigma)$
(rounded to integers at easy, to 1 decimal otherwise). Question variant: SUM, MEAN, or "EV of a
random draw" (all three truths are the same two numbers, $\sum v_i$ or $\bar v$). *Real
instance* (easy): the 30 integers shown in Chapter 3's table row; truth (mean) $= 16.4$,
$\text{sum} = 492$. The training point: the mean of a sample *is* the EV of a draw from the
empirical distribution — the interview's "30 points" question is a mean with extra steps.

**T3 — Conditional EV (`genConditional`).** $X \sim U\{1..M\}$, $M = 20/50/100$;
$k \sim U\{\lfloor 0.3M \rfloor .. \lfloor 0.7M \rfloor\}$; truth by the closed form of §3.8(a),
$\frac{(k+1)+M}{2}$. *Real instance:* $U\{1..50\}$, $k=30$ → truth $40.5$. Mental path: "answer
is the midpoint of $31..50$" — two seconds.

**T4 — Compound lottery (`genCompound`).** $\mathbb{E}_A, \mathbb{E}_B \sim U\{-20, 80\}$,
$p \sim U(0.2, 0.8)$; truth $= p\,\mathbb{E}_A + (1{-}p)\,\mathbb{E}_B$ (tower property).
*Real instance:* $p = 0.73806$, $\mathbb{E}_A = 73$, $\mathbb{E}_B = -3$ → $53.0929$. (Display
rounds $p$ to "74%": audit finding F8.)

**T5 — EV with a cost (`genWithCost`).** Reuses T1's lottery, shows its gross EV, draws an entry
fee $c \sim U\{1 .. \max(5, |\text{gross}|/2)\}$; truth $= \text{gross} - c$. *Real instance*
(expert): gross $160.45$, fee $41$, truth $119.4525$. Trains the reflex: *never* evaluate a bet
gross.

**T6 — Call payoff (`genCallPayoff`).** $X \sim U\{0..M\}$, $M = 20/50/100$,
$K \sim U\{\lfloor 0.2M\rfloor..\lfloor 0.8M\rfloor\}$; truth by §3.8(b),
$\frac{m(m+1)}{2(M+1)}$ with $m = M - K$. *Real instance:* $U\{0..100\}$, $K = 56$ →
$\frac{44\cdot45}{202} = 9.8020$. Mental path: average of $1..44$ divided by 101.

**Difficulty pools** (which generators can fire, `pickGenerator`):

| difficulty | pool |
|---|---|
| easy | T1, T1, T2 |
| medium | T1, T2, T3 |
| hard | T2, T3, T4, T5 |
| expert | T1, T2, T3, T4, T5, T6 |

Measured mix over 300 generated questions per difficulty (harness §3) — note the duplicated T1
entry in the easy pool halves to a 2:1 lottery:sequence ratio by construction:

| difficulty | counts by type | truth mean | neg. truths |
|---|---|---|---|
| easy | lottery 201, sequence 99 | 106.3 | 33% |
| medium | sequence 104, lottery 103, conditional 93 | 121.8 | 20% |
| hard | sequence 84, compound 76, conditional 75, withCost 65 | 103.3 | 14% |
| expert | conditional 62, sequence 55, callPayoff 49, withCost 46, compound 46, lottery 42 | 67.2 | 14% |

## 12.3 The engine loop

`EVState` holds the pregenerated questions, a cursor, two clocks (session and per-question), and
the answers ledger. Three actions:

- `tick (nowMs)` — from the 100 ms UI interval; updates the session countdown; **auto-skips** a
  question whose 30 s expired, recording it as `userAns: null, score: 0` (a timeout is a skip,
  never a guess on your behalf);
- `answer (value)` — grades via `toleranceScore`, adds `10·acc·timeBonus`, advances;
- `skip` — zero-score advance.

Results: total, answered, perfect (≤1%), close (≤5%), mean time, mean relative error, and the
per-question ledger with colour-coded rows. Session end writes a `SessionRecord` into the store
(seed + settings + score + full breakdown) — the replay trail.

## 12.4 Independent verification of the truths

A second implementation of all six truth formulas (written against the `meta` payloads alone,
not the engine's arithmetic) was run over **1000 generated scenarios** (250 per difficulty):
**1000/1000 agreements, max absolute difference $0$** (`evdrillCrossCheck` in `results.json`).
Combined with the closed-form checks of §3.8, the EV Drill's grading truths are as proven as
floating-point allows.

# Chapter 13 — Phase 1b: The Market Simulator (the flagship, instrument by instrument)

## 13.1 The world

Four variables $x, y, z, w$ on $\{5..25\}$ (centre 15, step 1) driven by the mean-reverting
kernel of §7.1, started at $\mathrm{round}(\mu + U\{-3..3\})$. The derived quantity, by formula
setting:

| formula | $q$ |
|---|---|
| `classic` (the interview) | $xy + zw$ |
| `weighted` | $1.2xy + 0.8zw + 0.5(x+z)$ |
| `product` | $xyz + w$ (vars on $\{5..12\}$ to bound the magnitude) |
| `runningMax` | $xy + zw$ with the monotone-instrument treatment of §6.5 |

Every tick (default 1000 ms): each variable steps, $q$ recomputes, all fairs recompute, quotes
re-spread, mispricings decay ×0.75, and with probability $p$ (default 0.25) one instrument gets
injected with an $\varepsilon$ (§13.6).

## 13.2 The instruments, concretely (a real init, seed 4242, classic, monotonic on)

State after init: $(x,y,z,w) = (16,12,14,13)$, $q = 16\cdot12 + 14\cdot13 = 374$:

| instrument | parameters | engine fair |
|---|---|---|
| SPOT | — | 374.000 (exactly $q$) |
| FWD_5 | horizon 5 | 406.460 |
| CALL_10_410 | $K = \mathrm{round}(q\cdot U(0.85,1.15)) = 410$, $h=10$ | 29.770 |
| BIN_10_346 | $K = \mathrm{round}(q\cdot U(0.9,1.1)) = 346$, $h=10$ | 0.930 |
| MONO_CALL_355 | $K = \mathrm{round}(0.95q) = 355$ | 72.755 |

The engine's fairs come from the Monte Carlo estimator (§5.3, kernel E). Chapter 14's exact DP
recomputes all of these under both kernels and quantifies every discrepancy.

## 13.3 Trade accounting, exactly

A trade is `{instrumentId, side, qty}`; the engine computes signed size
$s = \pm\min(|\text{qty}|, \text{sizeCap})$ (cap default 10) and price (ask on buy, bid on
sell), then:

$$\text{cash}' = \text{cash} - s\cdot\text{price}, \qquad
\text{P\&L}_{MTM} = \text{cash} + \sum_{\text{positions}} s_j \cdot F_j.$$

Average-cost basis (for the per-position display only): extending a position VWAPs
$\text{avg}' = \frac{\text{avg}\cdot q_{old} + \text{price}\cdot q_{new}}{q_{old}+q_{new}}$;
flipping resets basis to the trade price; MTM total never uses the basis, so display
conventions cannot corrupt the score. Each trade also logs
$\text{pnlInstant} = (F - \text{price})\cdot s$ — the §6.6 algebra — and its classification
(`wasArb`: $|m| > 0.6\Delta$; `wasCorrect`: arb flag **and** correct side), which feeds the
detection metrics below.

## 13.4 A worked trade from a real session (seed 10 000)

Tick 29 of the worked session (`workedSession` in `results.json`): FWD_5 shows fair
$422.30$, but the quote reads **bid 413.29 / ask 414.79** — an injected $m = -8.26$. The market
is offering the forward $7.51$ below fair. Buy 10 at 414.79:

$$\text{pnlInstant} = (422.30 - 414.79)\cdot 10 = +75.06.$$

The position then rides the market: by tick 31 the same instrument's fair has moved to 427.08
(the state drifted up) — held marks fluctuate, which is the *risk* half of the lesson. Over the
60-tick session with a disciplined arb-taker, real injections/trades looked like:

| tick | instrument | fair | quote (bid/ask) | $m$ | action | instant P&L |
|---|---|---|---|---|---|---|
| 12 | BIN_10_439 | 0.31 | 8.77 / 10.27 | +9.21 | SELL 10 @ 8.77 | +84.57 |
| 23 | CALL_10_365 | 46.67 | 38.48 / 39.98 | −7.44 | BUY 10 @ 39.98 | +66.89 |
| 29 | FWD_5 | 422.30 | 413.29 / 414.79 | −8.26 | BUY 10 @ 414.79 | +75.06 |
| 31 | FWD_5 | 427.08 | 415.83 / 417.33 | −10.50 | BUY 10 @ 417.33 | +97.49 |
| 32 | FWD_5 | 422.57 | 431.60 / 433.10 | +9.78 | SELL 10 @ 431.60 | +90.31 |
| 36 | FWD_5 | 488.13 | 493.71 / 495.21 | +6.33 | SELL 10 @ 493.71 | +55.75 |
| 38 | CALL_10_365 | 98.45 | 86.65 / 88.15 | −11.05 | BUY 10 @ 88.15 | +102.96 |
| 45 | MONO_CALL_380 | 145.00 | 155.09 / 156.59 | +10.84 | SELL 10 @ 155.09 | +100.87 |

(Tick 12 also shows audit finding F13: the binary's $\varepsilon$ is added in *spot* units, so a
0.31-probability instrument quotes at 8.77 — trivially spottable, and unrealistic.)

## 13.5 Scoring, term by term

$$\text{score} = \max\Big(0,\; \underbrace{\text{P\&L}}_{\text{MTM at end}} \;+\;
0.5\cdot\underbrace{\text{edge\%}}_{\sum \text{pnlInstant} / \sum |\varepsilon| S_{\max}}
\;+\; 20\cdot\underbrace{\text{detection}}_{\text{captured}/\text{injected}} \;-\;
2\cdot\underbrace{\text{falsePos}}_{\text{trades w/o arb}}\Big)$$

and the diagnostics $\text{precision} = \text{correct trades}/\text{trades}$,
$\text{F1} = \frac{2\, d\, p}{d + p}$. Chapter 15 measures all of them across policies — and
documents where the *metrics themselves* misbehave (detection can exceed 1 when one arb is
traded repeatedly; edge% can exceed 100% for the same reason). The P&L term is the anchor: it is
pure Chapter 6 algebra and cannot be gamed by churning.

## 13.6 The arb injector, exactly

Each tick, with probability $p_{\text{mis}}$: pick one instrument uniformly; draw direction
$\pm$ with equal probability; magnitude

$$\varepsilon = \pm\; \epsilon_{\text{scale}}\cdot k_{\text{diff}}\cdot\Delta\cdot U(0.8,\,1.5),
\qquad k_{\text{diff}} = 8/5/3/2 \;\;(\text{easy/medium/hard/expert}).$$

At defaults ($\epsilon_{\text{scale}} = 1$, $\Delta = 1.5$): easy $[9.6, 18]$, medium $[6, 11.25]$, hard $[3.6, 6.75]$, expert $[2.4, 4.5]$. Against the $0.6\Delta = 0.9$ arb flag,
*medium* injections are flagged for $\approx 8.8$ ticks (§7.5) — the capture window the player
races. If the picked instrument is the mono-call, with probability 0.3 the injector *forces the
obvious arb*: it sets $m$ to

$$m_{\text{target}} = \underbrace{(q - K)^+}_{\text{intrinsic}} - F_{\text{mono}} -
\tfrac{\Delta}{2} - U(1, 3),$$

which makes $\text{ask} = F + m + \Delta/2 \le \text{intrinsic} - 1$ — provably below the
Theorem-6.5 floor, signalling "free money" to anyone who knows the intrinsic check. Each
injection also accrues $\text{maxPossiblePnl} \mathrel{+}= |\varepsilon|\cdot\text{sizeCap}$
(the denominator of edge%; its idealizations are audited as F15).

## 13.7 The interface, briefly

Left panel: the four variables with sparkline histograms and $q$'s rolling history, positions
table (qty / avg / fair / unrealized), cash and live P&L. Right panel: each instrument as a card
— bid / **fair** / ask, the mispricing figure, BUY/SELL buttons at the current size — with the
arb badge ($|m| > 0.6\Delta$, arrow showing the side) and the pulsing `BELOW INTRINSIC!` badge
for mono-call violations, plus the intrinsic arithmetic printed in words ("Quote below intrinsic
= instant free money"). Trades append to a live blotter; session end writes the full trade list
and metrics into the results screen and the store. The fair column is *shown* deliberately
(Phase 1 is for learning the dynamics); hiding it (compute-it-yourself mode) is a settings
toggle queued for Phase 4.
