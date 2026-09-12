# Part VIII — The Honest Audit, and the Road Ahead

# Chapter 16 — Known Limitations and Bugs (each with a fix sketch)

A trainer that hides its flaws teaches false lessons. These are the findings, numbered, with
severity and the fix. *None blocks play; several are excellent exercises.*

**F1 — Wall-clock scoring breaks perfect replay (severity: high, conceptually).**
`applyEV`'s `answer`/`skip` read `Date.now()` internally, so the time bonus — hence the score —
depends on *when* you act, not just what you do. Same seed + same answer values can produce
slightly different totals (the determinism test survives only via `toBeCloseTo(…, 0)`).
**Fix:** actions carry `nowMs` (the market engine already does this for ticks); engines then
never touch the clock and replays are bit-exact.

**F2 — Session-expiry race (low).** `answer`'s end-of-session check uses `sessionRemainingMs`
last written by a tick (100 ms earlier), so a submission up to one tick after expiry can count.
**Fix:** compute remaining time from the action timestamp (free once F1 is done).

**F3 — Estimator kernel ≠ tick kernel (high, quantified in §14.5).** `estimateFuture` uses
$p_\uparrow = \mathrm{clamp}(0.2, 0.8,\ 0.5 - 0.05\,d)$ with no jitter; the world uses
$\mathrm{clamp}(0.1, 0.9,\ 0.5 - 0.75\,d/20 + U(-0.05, 0.05))$. Half-lives 13.5 vs 8.9 ticks;
off-centre FWD_5 biased +7.71 on 374; at-centre $h{=}10$ call biased −12.8%; instance binary
+0.072. **Fix:** extract one `stepKernel(v) → pUp` used by both `tickVar` and `estimateFuture`;
add the same jitter. Then re-derive §14.5 — the columns must merge.

**F4 — Estimator ignores the jitter's widening (medium).** Even with matching slopes, dropping
the $U(-0.05,0.05)$ jitter understates transition entropy → understated option variance.
**Fix:** same as F3 (include jitter in shared kernel).

**F5 — One `estRng` shared by all instruments per tick (low).** Fairs are deterministic (good)
but their MC errors are correlated across instruments within a tick; a "cheap" random stream
makes two quotes wrong in the same direction. **Fix:** derive per-instrument seeds,
e.g. `createRNG(seed + tick·7919 + hash(inst.id) )`.

**F6 — Clamp mismatch at the box edges (low).** Estimator clamps $p_\uparrow$ to $[0.2,0.8]$,
world to $[0.1,0.9]$: near $v=5/25$ the estimator reverts slower than the world.
**Fix:** shared kernel (F3) inherits the correct clamps.

**F7 — `maxPossiblePnl` is an idealization (low).** Denominator of edge% accrues
$|\varepsilon|\cdot\text{cap}$ per injection, ignoring (a) the half-spread cost of capture — the true
max instant edge is $(|\varepsilon| - \Delta/2)\cdot\text{cap}$ — and (b) decay (a late capture is
worth $0.75^k$ of it). Edge% therefore *overstates* headroom. **Fix:** score against
$\sum (|\varepsilon_i| - \Delta/2)^+\cdot\text{cap}$; optionally discount by decay from injection tick.

**F8 — Compound lottery displays a rounded $p$ (medium, player-facing).** Prompt shows "74%"
while the truth uses $p = 0.73806$; the difference (≤ 0.005·|EV_A − EV_B| ≤ 0.5 absolute) is
inside 1% tolerance when $|\text{truth}|$ is large, but can *exceed* it when the two EVs nearly
cancel (truth near 0). **Fix:** display $p$ to one decimal place, or grade against the
displayed (rounded) $p$.

**F9 — ε units are not per-instrument (medium).** The injector adds $\varepsilon$ in *spot*
units to every instrument: a binary (fair ∈ [0,1]) can quote at 8.77 against a fair of 0.31
(tick 12, §13.4) — trivially spottable and unrealistic; a mono-call's "obvious" injections are
fine in price units, but probabilities want relative or logit-unit shocks. **Fix:** scale by
instrument type — price instruments: $\varepsilon \propto F$; binaries: $\varepsilon \in [0.05, 0.15]$ absolute.

**F10 — Detection/edge/F1 metric pathologies (medium).** Demonstrated by arbGreedy in
Chapter 15: detection 6.67 (per-trade counting), edge% 265.8 (asymmetric numerator/denominator),
F1 1.73 (> 1). Also: a genuinely profitable trade with $0.5\Delta < |m| \le 0.6\Delta$ is
counted a *false positive* (the arb threshold is stricter than the profitability threshold).
**Fix:** tag each injection with an id; count a capture once per id (first correct trade);
align the arb flag with the profitability threshold ($|m| > 0.5\Delta$) or the policy threshold;
report F1 only after dedup.

**F11 — `customTable.cdf` is convoluted (low, unused).** The double-filter expression computes
correct values only by index arithmetic luck. **Fix:** `values.filter(v => v <= x).reduce((s,v)
=> s + norm[values.indexOf(v)], 0)`.

**F12 — Discretization renormalizations (informational).** Geometric truncates at $k=50$
(discards $(1-p)^{50} = 1.4\times10^{-5}$ at $p=0.2$, then renormalizes); the discretized
normal renormalizes a finite grid; the triangular/continuous EVs use $N=1000$ midpoint
quadrature ($O(N^{-2})$). All verified harmless at game scales (§3.9), and all documented here
so nobody mistakes them for exactness.

**F13 — Elo normalization asymmetry (low).** $R' = R + 32(s/100 - 0.5)$ assumes $s \in [0,100]$;
EV Drill sessions can exceed 100 points (15 pts × many questions), skewing drift upward.
**Fix:** squash $s$ through a bounded map, e.g. $S = s/(s + s_{50})$ calibrated so a
target session scores 0.5.

**F14 — EWMA cold start (informational).** First session *is* the EWMA (no prior shrinkage);
one wild session drags the level for ~4 sessions ($1/\alpha$). Acceptable at this scale;
a Bayesian prior (shrink toward 50 with weight $1/\alpha$ pseudo-sessions) is the elegant fix.

**F15 — `genSequence` samples uniform, not normal (informational).** The comment says
"normal-ish"; the sampler is uniform on $\mu \pm \sigma$ (no tails). For mental- sums training
this is *better* (no outlier-dominated totals); the comment should say uniform.

**F16 — Mono-call fair can exceed both models (low).** `fair = max(intrinsic, MC-estimate)`
takes the more conservative of two models; since MC understates variance (F3), the true fair is
sometimes higher still — the displayed "fair" is a *lower bound*, which is the right side to
err on for a game about "quotes below intrinsic are free money".

**F17 — `Ticker` measures `dt` but nobody consumes it (informational).** Dynamics are per-tick
(event-driven), not per-ms, so variable frame timing cannot distort the market — a correct
choice that makes the unused parameter merely cosmetic.

**F18 — EV Drill question bank is 100 (informational).** `over` flips when the cursor passes
100; a 300 s sprint at ~2 s/question (~150 answers) can outrun it. Bump to `max(100,
4·duration)` at next touch.

**F19 — Store's `updateRating` writes are synchronous localStorage (informational).** Fine for
≤1000 small records; the Phase 3 migration to IndexedDB (per the plan) removes the ceiling.

**F20 — Injected-arb direction is uniform even when "wrong" (design note).** Real microstructure
has state-dependent mispricing; here $\pm$ is a fair coin by design (mechanical, no AI — per the
plan's own constraint), which keeps the fair-value skill separable from flow-reading. Phase 2's
informed-flow games add the conditional structure.

**F21 — arb-flag threshold vs profitability threshold (see F10).** Listed separately only to
say: the *badge* and the *scoring* must agree, or the UI teaches distrust.

# Chapter 17 — The Road Ahead: Phase 2–4 Mathematics, Pre-Derived

*(The plan's §1.3–1.9 specs, each with its governing math worked out — so the next build starts
where this book ends.)*

## 17.1 ETF Arbitrage — the OU tracking error

Gap process $e_{t+1} = \varphi e_t + \eta_t$, $\eta \sim \mathcal{N}(0, \sigma^2)$:

- stationary variance $\mathrm{Var}(e_\infty) = \frac{\sigma^2}{1-\varphi^2}$ — set the entry
  threshold at $c\,\sigma_e$ with $c \approx 2$;
- $k$-step conditional variance $\sigma^2\frac{1-\varphi^{2k}}{1-\varphi^2}$ — the convergence
  you can expect in $k$ ticks;
- expected round-trip profit, enter at $e_0 > c\sigma_e$, exit near zero:
  $\approx e_0 - \sigma_e\sqrt{2/\pi}\sum_{\tau} \varphi^\tau w_\tau - 2\,\text{fee}$;
  trade iff positive — the *cost hurdle* rule of §6.6 in continuous clothing.

Player experience: NAV is recomputable (sum of $w_i S_i$); the ETF price wanders; only the gap
$P - \mathrm{NAV}$ is signal. Difficulty = noise $\sigma$, persistence $\varphi$, fee, basket
size $n$ (mental-sum load).

## 17.2 Card Taking — EV of an unknown card

Unknown $u \sim U\{1..10\}$ ($\mathbb{E}u = 5.5$). Market quotes bid $b$ / ask $a$ for the
*next* card. Sell your known card $v$ at $b$: edge $= b - v > 0$ iff $b > v$. Buy at $a$: edge
$= \mathbb{E}[u] - a = 5.5 - a$. The entire game is **one subtraction against 5.5**, repeated —
plus the harder variant where your information is a *pair* and the quote is on the sum/max
(tower property again: $\mathbb{E}[u_1 + u_2] = 11$, and $\mathbb{E}[\max] = 7.7$ — the mental table worth memorizing).

## 17.3 Dice Market-Making — spread vs adverse selection, in one inequality

Contract: "sum ≥ 7", fair $p^\* = \tfrac{21}{36} = \tfrac{7}{12}$ (21 winning pairs of 36; the
2d6 triangular law of §2.1). You quote bid $b <$ p\* $<$ ask $a$. With noise fraction $\nu$ and
informed fraction $1-\nu$ (informed traders know the roll and hit only the mispriced side):

$$\mathbb{E}[\text{profit per trade}] = \nu\cdot\tfrac{a-b}{2} \;-\; (1-\nu)\cdot
\underbrace{\mathbb{E}[\,|\text{quote} - p^*|\,]}_{\text{adverse-selection cost}} \;>\; 0
\;\;\Longleftrightarrow\;\; a - b \;>\; \frac{2(1-\nu)}{\nu}\,\mathbb{E}[\text{AS cost}].$$

Tighter quotes earn more spread but bleed to informed flow — the classic tradeoff, now with a
formula to *hold yourself to*. Inventory risk term: mark position $I$ at fair with charge
$\lambda I^2\sigma^2_{\text{settle}}$.

## 17.4 Fermi Estimation — calibration is a binomial you can grade

You state a 90% interval $[lo, hi]$; truth $y$. Coverage $c$ = fraction of intervals containing
$y$; a calibrated player has $c \to 0.9$ with binomial noise $\sqrt{0.9\cdot0.1/n}$ (at $n=50$,
±4.2%). Score combines coverage (did you hit?) and tightness
$t = \frac{1}{1+\log(hi/lo)}$ ∈ (0,1] — the *log* rewarding ratio-symmetric widening, which is
the natural geometry for order-of-magnitude questions. The dashboard plots your coverage against
the 45° line with a Wilson interval band — miscalibration becomes visible in ~20 questions.

## 17.5 Kelly Sizing — one derivation, worth having forever

Bet fraction $f$ at decimal odds $b$ (net $b$ per unit staked) with win probability $p$.
Maximize expected log wealth $g(f) = p\ln(1+bf) + (1-p)\ln(1-f)$:

$$g'(f) = \frac{pb}{1+bf} - \frac{1-p}{1-f} = 0
\;\Longrightarrow\; f^* = \frac{pb - (1-p)}{b} = \frac{bp - q}{b},\quad q = 1-p.$$

$g$ is concave in $f$, so this is the max; $f^* = 0$ exactly at $bp = q$ (no edge, no bet) —
the same cost-hurdle logic as every game above. The trainer asks for $f^*$ given $(p, b)$ and
grades by tolerance — pure recall of the most useful formula in betting.

## 17.6 Event Contracts & Brier (§1.7) and adaptive Arithmetic (§1.8)

Event contracts: quote around your belief $\hat p$; resolve 1/0; your flow P&L plus a
**Brier** (§9.3) calibration track across events. Adaptive arithmetic: keep an Elo per operation
family; draw each question near your current rating (target ~70% success, the standard adaptive
sweet spot), so questions track skill instead of a fixed table — the same Elo of §9.4 turned
from scoreboard into curriculum.

## 17.7 Sequencing

Phase 2 (ETF arb, cards, dice MM, Fermi, event contracts) needs no new core machinery — every
formula above runs on the existing `Distribution`/engine/scoring layers. Phase 3 adds per-op
Elo and the calibration dashboard. Phase 4 is balance: the policy-harness of Chapter 15 becomes
the tuning instrument (target: *mid-range* scores at current skill — room to grow), and F1/F3
should be fixed first so the harness measures the game, not the clock or the kernel.
