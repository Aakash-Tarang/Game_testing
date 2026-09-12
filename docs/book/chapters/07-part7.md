# Part VII — The Evidence

*Everything in this part is reproducible: Appendix C lists the commands; the harness lives in
`docs/book/experiments/`; all seeds are fixed.*

# Chapter 14 — Verification: Is Every Fair Value Right?

## 14.1 The unit suite

```
npx vitest run

 ✓ tests/determinism.test.ts (6 tests) 71ms
   EV Drill determinism
     ✓ same seed + same actions => same result
     ✓ fairValues are exact
   Market Sim determinism
     ✓ same seed => same init
     ✓ fairValues correctness: spot = q
     ✓ obvious arb detection: mono call below intrinsic
     ✓ random policy ≈ 0 score

 Test Files  1 passed (1)   Tests  6 passed (6)   Duration ≈ 1.16s
```

What each test *proves*: seed-identical question streams and market states (the Chapter 4
contract); spot fair ≡ $q$ exactly (a definitional golden case); the mono-call arb predicate
fires on a quote below intrinsic (Theorem 6.5 wired correctly); and a no-trade session holds
P&L at exactly 0 (the do-nothing baseline). Note the EV test compares scores with
`toBeCloseTo(…, 0)` — necessary because of audit finding F1 (wall-clock time bonuses leak into
scores; actions do not carry timestamps).

## 14.2 Generator truths: 1000/1000

The independent re-implementation of all six EV-Drill truth formulas agreed with the engine on
**1000 of 1000** generated scenarios (250 per difficulty), max absolute difference $0.0$
(§12.4). The closed forms of §3.8 matched brute force on every parameter set the generator can
emit.

## 14.3 The martingale check, exactly

Dynamic programming (§5.2) computes the *exact* distribution of $q_T$ from the distribution's
start at the centre (all variables at 15, $q_0 = 450$), under both kernels:

| horizon | kernel | $\mathbb{E}[q_T]$ | $\sigma(q_T)$ | $\mathbb{E}[(q_T-473)^+]$ | $P(q_T>473)$ | support size |
|---|---|---|---|---|---|---|
| $h=5$ | T (true tick law) | **450.000** | 58.011 | 13.709 | 0.3778 | 104 |
| $h=5$ | E (estimator law) | **450.000** | 55.209 | 12.661 | 0.3758 | 104 |
| $h=10$ | T | **450.000** | 69.829 | 18.148 | 0.3841 | 439 |
| $h=10$ | E | **450.000** | 63.723 | 15.825 | 0.3814 | 439 |

$\mathbb{E}[q_T] = q_0 = 450$ **exactly**, for both kernels and both horizons — the martingale
property of §6.3, verified to machine zero. The mechanism is the reflection symmetry
$P(\uparrow \mid \mu+d) = 1 - P(\uparrow \mid \mu-d)$: drift cancels by symmetry. Meanwhile the
*spread* grows with $h$ and differs between kernels — which is exactly why the calls disagree
below.

## 14.4 Monte Carlo against exact DP: the $\sigma/\sqrt{M}$ law, observed

Thirty independent runs of the engine's actual estimator (200 trials, as at init), horizon 10,
from the at-centre state:

| estimator | mean over 30 runs | observed SD | predicted SE $\sigma_g/\sqrt{200}$ | verdict |
|---|---|---|---|---|
| $\hat{\mathbb{E}}[q_{10}]$ | 450.783 | 4.270 | 4.506 (from $\sigma_E=63.72$) | ✓ within noise |
| $\hat{C}$ (K=473) | 16.135 | 2.070 | — (payoff SD) | ✓ |
| $\hat{P}(q>473)$ | 0.3878 | — | — | ✓ |

The observed estimator spread matches the $\sqrt{M}$ prediction ($4.27$ vs $4.51$; the small gap
is the 30-replication noise on the SD itself). The forward estimator is *unbiased for the mean*
— but the next table is where the real story is.

## 14.5 The model-mismatch table (finding F3, quantified)

The illustrative live state (seed 4242): $(x,y,z,w) = (16,12,14,13)$, $q_0 = 374$. Exact DP from
this *off-centre* state, under both kernels, vs what the engine quotes:

| instrument | engine quote (MC, kernel E) | exact under E | exact under T (true law) | engine vs true |
|---|---|---|---|---|
| SPOT | 374.000 | 374.000 | 374.000 | exact ✓ |
| FWD_5 | 406.460 | 405.356 | **398.752** | **+7.71 too high** |
| CALL_10 K=410 | 29.770 | 31.805 | **29.394** | +0.38 (within MC SE ≈ 2.8) |
| BIN_10 K=346 | 0.930 | 0.909 | **0.858** | **+0.072 too high** |

And at the at-centre state (§14.3), the $h=10$ call is biased the *other* way: estimator law
15.825 vs true 18.148 — **−12.8%** — because kernel E reverts faster toward the centre (AR(1)
0.95 vs 0.925, half-lives 13.5 vs 8.9 ticks) and clamps harder, compressing $\sigma(q_T)$ from
69.8 to 63.7, and call value is *made of variance* (§6.4).

Two clean lessons fall out, and they are the reason this table is the heart of the book:

1. **A forward needs the right drift; an option needs the right variance.** The estimator gets
   means right (martingale/symmetry) and still misprices options, because its transition law is
   not the world's transition law.
2. **An estimator bias is indistinguishable from an edge.** A player computing exact-T values
   would see the engine's BIN quote 0.93 against a true 0.86 and "arb" it — the simulator's own
   model error looks like free money. Training tools must not teach lessons that are bugs.
   (Remedy: unify the kernels — F3's fix sketch in Chapter 16.)

# Chapter 15 — The Policy Experiments: Who Makes Money, and Why

## 15.1 Design

400 independent sessions (seeds 10 000–10 399), 60 ticks each, classic formula, medium
difficulty ($p_{\text{mis}} = 0.25$, $\Delta = 1.5$, cap $=10$, mono-call on). The market stream
is identical for all policies on a given seed (the policy RNG is separate, so policies never
perturb the market — and the comparison is paired). Four policies:

- **none** — watch, never trade (the "do nothing" baseline the plan demands);
- **random** — each tick, 30% chance to trade a random instrument, random side, size 5;
- **arb1 (disciplined)** — on the tick an arb is injected, trade the flagged side at max size,
  once per injection;
- **arbGreedy** — arb1, but re-trades every tick while $|m| > 0.6\Delta$ (models a naive bot
  that keeps hitting a stale quote).

Injection counts behaved exactly as Binomial(60, 0.25) theory says: mean 14.65 (theory 15.0),
SD 3.27 (theory 3.35).

## 15.2 Results (400 sessions per policy)

| metric | none | random | **arb1** | arbGreedy |
|---|---|---|---|---|
| mean final P&L | **0.00** | +1.58 | **+1389.26** | +3634.98 |
| median final P&L | 0.00 | **−38.80** | +1299.20 | +4151.50 |
| SD of P&L | 0 | 1210 | 2407 | 15 177 |
| % of sessions profitable | — | 47% | **76%** | 64% |
| mean Σ instant edge | 0 | **−73.44** | +1232.10 | +3563.20 |
| edge captured % | 0 | −5.8% | **91.7%** | 265.8% ⚠ |
| detection rate | 0 | 0.20 | **1.000** | 6.67 ⚠ |
| precision | 0 | 0.16 | **1.000** | 0.998 |
| F1 | 0 | 0.17 | **1.000** | 1.73 ⚠ (>1!) |
| false positives / session | 0 | 12.07 | **0.00** | 0.24 |
| trades / session | 0 | 17.9 | 14.6 | 96.9 |

## 15.3 Reading the table

**The design criterion holds.** Do-nothing scores exactly 0. The random trader has a *negative
median* (−38.80) and bleeds the half-spread on average (mean instant edge −73.44): Chapter 6's
algebra — $|m| < \Delta/2$ trades lose — is visible in the wild. The disciplined arb-taker is
positive in 76% of sessions with a fat mean (+1389); the 24% losing sessions are the ones where
held marks (forwards/options marked to a moving fair) swung against open positions before the
end — the risk half of the lesson.

**Random ≠ arb, even with identical information.** The random policy sees the same quotes and
the same 14.6 injections; it captures 0.2 of them *by accident* and pays for the privilege. Edge
is not in the data; it is in the *comparison to fair value*. That is the platform's thesis,
confirmed at scale.

**Three metric pathologies surface here** (all findings F10 in Chapter 16):

1. **Detection 6.67 > 1** — the metric counts *trades* per *injection*; arbGreedy re-trades a
   decaying arb up to ~8 times (§7.5's window), so it "detects" the same arb six times.
2. **Edge captured 265.8% > 100%** — numerator re-counts those repeat captures; denominator
   counts each injection once at $|\varepsilon|\cdot\text{cap}$.
3. **F1 1.73 > 1** — inherited from the inflated detection rate; a true F1 is bounded by 1.

None of these corrupt *P&L* (the anchor metric), but the diagnostics must be per-injection
deduplicated before they can be trusted as training signals.

**arbGreedy's higher mean is real but fragile.** Re-trading a decaying edge is legitimate profit
*as coded* (each re-trade captures the remaining $|m| - \Delta/2$), but its SD is 6× arb1's
(15 177 vs 2407) — it is the same strategy levered on repeated fills, and its 64% win rate
shows the variance swallowing sessions. For a *human trainer*, arb1's numbers are the honest
benchmark of the skill; the greedy bot is what the metric fix (F10) should de-incentivize.

## 15.4 The verdict on Phase 1

The acceptance criteria of the plan, checked against evidence:

- *Deterministic engines* — Chapter 14.1, ✓ (modulo F1's time-bonus caveat);
- *Fair values provably correct* — spot exactly; EV truths 1000/1000; MC quantified against
  exact DP, model mismatch documented (F3);
- *Random policy ≈ 0, correct policy > 0* — Chapter 15, ✓ and quantified;
- *Obvious arb awarded, no-edge trades penalized* — mono-call badge + false-positive penalty;
  ✓ with the F10 threshold caveat.
