# Part IV — The Economics of a Toy Market

# Chapter 6 — Fair Value, Forwards, Options, and the No-Arbitrage Rule

## 6.1 The invariant, again, precisely

At any moment the Market Simulator is in a state $s$ (the values $x,y,z,w$, the formula, the
instruments' parameters). The engine can always compute, for each instrument $i$, the number

$$F_i(s) = \mathbb{E}[\,\text{payoff of } i \mid s\,],$$

the conditional expectation of the instrument's payoff given the current state. That number is
the instrument's **fair value**. The design rule is that quotes are always of the form

$$\text{bid} = F_i + m - \tfrac{1}{2}\Delta, \qquad \text{ask} = F_i + m + \tfrac{1}{2}\Delta,$$

with $\Delta$ the quoted spread and $m$ a **mispricing** that is (usually) zero. The player's
job is to compute (an approximation of) $F_i$ mentally, notice when $m \neq 0$, and trade. The
engine's job is to grade: profit should flow exactly to correct $F_i$-relative trading.

## 6.2 The four payoffs (and the fifth, a corollary)

Let $q_T$ be the derived quantity $h$ ticks from now, $T = t + h$. The instruments are exactly
the first four contracts of elementary derivatives:

| instrument | payoff at $T$ | fair value |
|---|---|---|
| **SPOT** | $q_t$ (it *is* the quantity) | $q_t$ — no expectation needed |
| **FWD $h$** (forward) | $q_T - \text{price}$, price fixed now | $\mathbb{E}[q_T \mid s]$ |
| **CALL $(K,h)$** | $\max(q_T - K,\, 0)$ | $\mathbb{E}[(q_T - K)^+ \mid s]$ |
| **BIN $(K,h)$** | $1$ if $q_T > K$ else $0$ | $P(q_T > K \mid s)$ |
| **MONO-CALL $(K)$** | $\max(q_M - K, 0)$, $q$ non-decreasing | $\ge (q_t - K)^+$ — Theorem below |

Everything reduces to expectations of functions of $q_T$ — LOTUS from Chapter 2 with four
different $g$'s. Code: `fairCall(qs, K)` averages `max(0, q−K)` over simulated futures;
`fairBinary` counts the fraction with `q > K`.

## 6.3 Forwards and the martingale property

If $q$ has no drift — if $\mathbb{E}[q_{t+1} \mid s] = q_t$ — then by iterating,

$$\mathbb{E}[q_T \mid s] = q_t \quad\text{for every horizon } T,$$

the **martingale property**: the best estimate of the future is the present. A zero-drift random
walk prices all forwards at spot.

But the simulator's variables are **mean-reverting** (Chapter 7), and the interesting teaching
case is a state *away* from the mean. Example from the actual seed-4242 session: state
$(x,y,z,w) = (16,12,14,13)$, so $q_t = 16\cdot12 + 14\cdot13 = 374$, while the variables' centre
of gravity is $15$ each ($q$ centre $= 450$). Mean reversion says the system drifts *up* toward
450, so $\mathbb{E}[q_{t+5}] \approx 399$–$405$ (exact value depends on the transition kernel —
the difference between kernels is precisely the audit finding F12) and the FWD 5 quote *should*
be above spot. The forward's fair value being state-dependent and *computable* is the whole
game: a player who believes "forwards equal spot" is systematically exploitable here, and the
simulator is the safe place to learn that.

## 6.4 Calls: variance made tradeable

$\mathbb{E}[(q_T-K)^+]$ does not depend only on $\mathbb{E}[q_T]$; it grows with the *spread*
(spread = standard deviation here) of $q_T$. Simple intuition: payoff is a convex function, so
by Jensen's inequality $\mathbb{E}[(q_T-K)^+] \ge (\mathbb{E}[q_T]-K)^+$ — the call is worth at
least its discounted-forward intrinsic expectation, and the gap is pure volatility value.

This is the mathematics behind one of the audit's sharpest findings (F12, quantified in Chapter
14): two dynamics kernels with the *same* mean path but different variance (and different
clamping) price the same call differently — by $1.0$ to $2.3$ points (6–13%) at the parameters
tested. If your estimator's kernel is not the true kernel, your "fair" is not fair, and the
mismatch itself looks like an edge.

## 6.5 The monotonic-arbitrage theorem (the "obvious arb" mode)

**Setting.** $q$ is guaranteed non-decreasing from $t$ to $M$ (the running-max / monotonic mode).
$K$ fixed. The MONO-CALL pays $(q_M - K)^+$.

**Theorem.** Its fair value satisfies
$$\mathbb{E}[(q_M-K)^+ \mid s] \;\ge\; \max(0,\, q_t - K).$$

**Proof.** Since $q_M \ge q_t$ pathwise, $(q_M - K)^+ \ge (q_t - K)^+$ pathwise (the function
$x \mapsto (x-K)^+$ is non-decreasing). Taking expectations of both sides preserves the
inequality. $\square$

The right side, $(q_t-K)^+$, is the **intrinsic value** — what the call would pay if exercised
immediately. The theorem says time can only help a call on a non-decreasing underlying: fair ≥
intrinsic, always.

**The arbitrage.** Suppose a quote lets you *buy* the call below intrinsic, i.e. $\text{ask} < (q_t - K)^+$. Buy at the ask, and — since fair ≥ intrinsic — you acquire, at price $p < \text{fair}$, an asset whose expected value exceeds what you paid. Not pathwise free money, but
*expectation-positive with certainty about the sign of the edge*: the quote is provably wrong,
no probability model needed beyond monotonicity. This is the interview skill the plan calls
"spot the trivially wrong quote". The engine implements the check verbatim:

```ts
const intrinsic = Math.max(0, q − K)
// any ask < intrinsic is provably mispriced:
isMonoArb = inst.type === 'monoCall' && inst.ask < Math.max(0, q − K)
```

and the injector deliberately creates such quotes with probability 0.3 whenever it targets the
mono-call (Chapter 13, §13.6).

## 6.6 From edge to money: the trading algebra

Trading is signed: buying $s$ units at the ask, or selling $s$ (i.e. $s < 0$) at the bid. With
mispricing $m$ and spread $\Delta$:

$$\text{buy: price} = F + m + \tfrac{\Delta}{2}, \qquad \text{sell: price} = F + m - \tfrac{\Delta}{2}.$$

The **instant mark-to-market edge** of a trade of signed size $s$ (positive = long) is

$$\text{pnlInstant} = (\text{fair} - \text{price})\cdot s
= \begin{cases} (-m - \tfrac{\Delta}{2})\, s & \text{buy} \\ (-m + \tfrac{\Delta}{2})\, s & \text{sell}\end{cases}
\quad\Longrightarrow\quad |\text{edge}| = \big(|m| - \tfrac{\Delta}{2}\big)\,|s|.$$

Three consequences the games are calibrated around:

1. **The half-spread is the house edge.** Trading with $|m| < \Delta/2$ *loses* money on
   average no matter the direction. This is exactly what the random-policy experiment measures
   (Chapter 15: mean instant edge $-73.4$ over 400 sessions).
2. **The profitability threshold is $|m| > \Delta/2$**; the engine's *arb flag* uses the
   slightly stricter $|m| > 0.6\Delta$ so that flagged arbs are safely profitable.
3. **Edge decays.** $m$ shrinks by $\times 0.75$ each tick (Chapter 7), so an uncaptured edge is
   a wasting asset: at medium difficulty $\varepsilon \in [6, 11.25]$ against $\Delta = 1.5$
   gives $|m| - \Delta/2 \in [5.25, 10.5]$ per unit at capture, but only $0.75^k$ of that $k$
   ticks later.

**Worked numbers** (from the actual code paths, `tradeExample` in `results.json`): fair
$F = 100$, injected $m = -3$, $\Delta = 1.5$. Ask $= 100 - 3 + 0.75 = 97.75$. Buy 10:
$\text{pnlInstant} = (100 - 97.75)\cdot 10 = 22.5$. Two ticks later the quote has reverted:
fair-plus-residual $= 100 - 3\cdot0.5625 = 98.3125$, so the same trade's remaining edge is
$(98.3125-97.75)\cdot10 = 5.625$ — a quarter of the original. Act fast; the math says so.

# Chapter 7 — Dynamics: Random Walks, Mean Reversion, and Decaying Edges

## 7.1 The tick kernel, exactly as coded

Each tick, each variable $v$ (state space $\{5,\dots,25\}$, centre $\mu = 15$, step $\pm1$)
does:

```ts
const distFromMean = v.value − v.mean            // d
const pUpBase = 0.5 − (distFromMean / range) * 0.75   // 0.15 × 5 = 0.75, range = 20
const pUp = clamp(0.1, 0.9, pUpBase + (rng.next() − 0.5) * 0.1)   // ±0.05 jitter
const step = rng.bool(pUp) ? +1 : −1
new v = clamp(5, 25, v + step)
```

So the transition law is: **up-probability is a decreasing linear function of the distance above
the mean.** In symbols (ignoring the clamp and jitter for a moment):

$$P(\uparrow \mid v) = \tfrac12 - \tfrac{0.75}{20}\,(v-\mu), \qquad
P(\downarrow \mid v) = 1 - P(\uparrow \mid v).$$

Note the beautiful symmetry: $P(\uparrow \mid \mu + d) = P(\downarrow \mid \mu - d)$ — the kernel
is *reflection-symmetric* around $\mu$.

## 7.2 The restoring force and the half-life

The conditional expected move is

$$\mathbb{E}[v_{t+1} - v_t \mid v_t] = (+1)P(\uparrow) + (-1)P(\downarrow)
= 2P(\uparrow) - 1 = -\frac{1.5}{20}(v_t - \mu) = -0.075\,(v_t - \mu).$$

Therefore the *expected* distance from the mean obeys the linear recurrence

$$d_{t+1} = (1 - 0.075)\, d_t = 0.925\, d_t.$$

This is a discrete **Ornstein–Uhlenbeck / AR(1) process** with mean-reversion coefficient
$\varphi = 0.925$. The **half-life** — time for a displacement to halve in expectation — is

$$t_{1/2} = \frac{\ln 0.5}{\ln \varphi} = \frac{0.6931}{0.07796} \approx 8.9 \text{ ticks}.$$

The jitter term $U(-0.05, 0.05)$ added to $p_{\uparrow}$ before the clamp has mean zero, so it
does not change this expectation; it thickens the transition spread (more effective variance)
without moving the centre.

## 7.3 The estimator's kernel is a *different* process

The Monte Carlo estimator (`estimateFuture`) uses its own, simpler kernel:

$$P_E(\uparrow \mid v) = \mathrm{clamp}\big(0.2,\, 0.8,\, 0.5 - 0.05\,(v-\mu)\big),$$

no jitter, tighter clamp, gentler slope far from the mean (and an *absolute* rather than
range-relative slope). Its AR(1) coefficient is $\varphi_E = 1 - 0.05 = 0.95$, half-life
$\frac{0.693}{0.0513} \approx 13.5$ ticks — versus the true 8.9. Consequences, measured exactly
in Chapter 14:

- **Forward fairs inherit the wrong drift speed** — e.g. the seed-4242 state's FWD 5 true value
  (jitter-free approximation) is $398.75$; the estimator says $405.36$;
- **variance of $q_T$ is understated** ($\sigma$: 54.4 vs 51.9 at $h=5$ from that state), so
  option fairs carry a model bias of several percent.

This is finding F12, and it is also the single best *lesson* in the codebase: a simulation is
only as good as its transition law, and "the mean is right" is not the same as "the price is
right".

## 7.4 Clamping, and why the corners matter little

The clamps ($P(\uparrow)\in[0.1,0.9]$; state $\in[5,25]$) turn the ideal AR(1) into a reflected
random walk in a box. At the boundary $v = 25$, an up-step leaves you at 25 (clamp), so the box
edge behaves like a soft wall. Because the clamp engages only beyond $|d| \approx 10.7$ (where
the unclamped $P(\uparrow)$ hits 0.1), and mean reversion pulls states back before they linger,
the ideal-process analysis above is accurate in the working region $d \in [-10, 10]$.

## 7.5 The mispricing decay — a wasting edge in closed form

Injected mispricings decay multiplicatively: $m_{t+1} = 0.75\, m_t$, i.e.

$$m_{t+k} = m_t\,(0.75)^k, \qquad (0.75)^k \text{ for } k = 0..8:\;
1,\, .75,\, .5625,\, .4219,\, .3164,\, .2373,\, .1780,\, .1335,\, .1001.$$

A $0.75$ geometric decay loses $87\%$ of the edge in five ticks. Two design consequences:

- **The capture window is short.** With the arb flag at $|m| > 0.6\Delta = 0.9$ and a max
  injection $\varepsilon = 11.25$, a medium-difficulty arb stays flaggable for
  $\ln(0.9/11.25)/\ln 0.75 \approx 8.8$ ticks — and stays *profitable* ($|m| > 0.75$) a little
  longer. But the remaining edge shrinks by the table above: waiting three ticks costs $58\%$ of
  the trade.
- **Discretization guard.** The decay zeroes $m$ once $|m| < 0.01$ — after $\approx 15$ ticks
  any injection is fully absorbed, quotes return to fair, and the instrument is clean again.

In the language of Part IV: the market is *efficient over ~5 ticks*, and the player's speed of
computation is literally the variable the game measures.

## 7.6 Preview: the continuous Ornstein–Uhlenbeck (Phase 2's ETF-arb engine)

The plan's ETF-Arbitrage game (§1.3) tracks a tracking error $e_t = P_t - \mathrm{NAV}_t$
following $e_{t+1} = \varphi e_t + \eta_t$, $\eta \sim \mathcal{N}(0,\sigma^2)$. Two numbers
govern the trade:

- **Stationary variance:** $\mathrm{Var}(e_\infty) = \dfrac{\sigma^2}{1 - \varphi^2}$ — how wide
  the gap normally swings;
- **Entry rule:** trade when $|e_t| > c + \text{fee}$ where $c$ is a multiple of the stationary
  standard deviation; expected profit of a round trip entered at $e_0$ and exited at level $x$
  is $|e_0| - \mathbb{E}|e_\tau| - \text{fees}$, with $\mathbb{E}|e_\tau|$ decaying like
  $\varphi^\tau\sqrt{2/\pi}\,\sigma_e$ for the half-normal starting displacement.

Chapter 17 develops this into the full Phase 2 spec. The Phase 1 simulator already exercises the
discrete skeleton of the same skill: *identify a gap, decide if it survives costs, harvest the
convergence*.
