# Part III — Deterministic Randomness and Numerical Expectation

# Chapter 4 — The PRNG: Manufacturing Deterministic Chance

## 4.1 Why a game about randomness must have *no* real randomness

Real randomness is the enemy of a trainer. If a session can't be reproduced, you can't (a) replay
a bad session to study it, (b) verify a score was computed fairly, or (c) write a test that
asserts the fair value was right. So the platform's foundational decision is:

> **All randomness is a deterministic function of a seed.** Same seed + same player actions ⇒
> bit-identical session.

This is implemented by giving every engine a generator from `createRNG(seed)` in
`src/core/rng.ts`, and by making engines pure functions of `(seed, action list)` (Chapter 8).
The "randomness" is then a *deterministic sequence that looks random* — a **pseudo-random number
generator (PRNG)**.

## 4.2 The raw material: 32-bit integer churn

JavaScript numbers are 64-bit floats, but bitwise operators (`^`, `|`, `&`, `>>>`) first coerce
operands to **32-bit integers**. The PRNGs live in that 32-bit integer world and only divide by
$2^{32}$ at the very end to land in $[0,1)$. Two operators to understand before reading the code:

- `Math.imul(a, b)` — true 32-bit integer multiplication: computes $a\cdot b$ and keeps the low
  32 bits (plain `*` would lose precision past $2^{53}$).
- `x >>> 0` — unsigned right shift by 0: a no-op *except* it converts to an unsigned 32-bit
  integer, i.e. reinterprets the bits in $[0, 2^{32})$.

## 4.3 mulberry32 — the generator, line by line

```js
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)              // (1) Weyl-style advance of the state
    t = Math.imul(t ^ (t >>> 15), t | 1)   // (2) mix: xor-fold, force odd, multiply
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61) // (3) non-linear self-mixing
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 // (4) final avalanche, map to [0,1)
  }
}
```

- **(1)** The hidden state `a` is first advanced by adding $C = 0\mathrm{x6D2B79F5} = 1{,}831{,}565{,}813$ — an odd constant with good additive-lattice properties (this style of
  "add a golden-ratio-like constant each call" is the Weyl sequence idea). The *output* is
  computed from the advanced state, so consecutive draws never collide in a simple pattern.
- **(2)** `t ^ (t >>> 15)` folds the high half of `t` into the low half; `| 1` forces the
  multiplier input odd (an even value would zero out a bit permanently); `Math.imul` then
  avalanches those changes upward into high bits.
- **(3)** Adding `Math.imul(t ^ (t >>> 7), t | 61)` back into `t` mixes additions and
  multiplications — XOR alone is linear over GF(2) and can be attacked; the `+` breaks that
  structure.
- **(4)** The final `t ^ (t >>> 14)` spreads the last correlations to the top bits — the ones
  that matter, since dividing by $2^{32}$ means the *high* bits of `t` determine the leading
  binary digits of the output.

The result is 32 output bits per call, mapped to $u \in \{0, 1, \dots, 2^{32}-1\}/2^{32}$ —
a grid of spacing $2^{-32} \approx 2.3\times10^{-10}$, far finer than anything the games need.
mulberry32 is tiny, passes the usual quick statistical batteries, and is fully deterministic —
exactly the trade-off a local training tool wants. (It is *not* cryptographic; nothing here
needs to be.)

## 4.4 splitmix32 — turning one seed into a good starting state

`createRNG(seed)` does not feed `seed` straight into mulberry32. It first runs **splitmix32**:

```js
function splitmix32(seed: number) {
  let x = seed | 0
  return function () {
    x += 0x9e3779b9                      // golden-ratio increment, φ⁻¹·2³² (rounded)
    let z = x
    z = (z ^ (z >>> 16)) * 0x85ebca6b    // Murmur3-style finalizer
    z = (z ^ (z >>> 13)) * 0xc2b2ae35
    return (z ^ (z >>> 16)) >>> 0
  }
}
// const sm = splitmix32(seed); const gen = mulberry32(sm())  — one draw = the inner seed
```

The increment $0\mathrm{x9E3779B9} = 2{,}654{,}435{,}769 = \lfloor 2^{32}/\varphi \rfloor$ with
$\varphi$ the golden ratio: successive states are spread maximally evenly around the 32-bit
circle (the three-distance theorem in action). The multiply-xorshift "finalizer" is the same
avalanche pattern MurmurHash uses: each input bit affects each output bit with probability ≈ ½
(we test this statistically below).

Why bother? **Seed hygiene.** Users type seeds like `1`, `2`, `3`, or `42`. Feeding such small
values directly into a PRNG risks correlated early streams. Splitmix32 first *scrambles* the
seed into an apparently unrelated 32-bit value, then mulberry32 runs from there. Two nearby
seeds therefore give unrelated streams — the property the determinism tests rely on, and the
reason `seed 123456` begins
`[0.0468, 0.3188, 0.2481, 0.6629, ...]` while `seed 123457` begins
`[0.5801, 0.4110, 0.6031, 0.2515, ...]`: they differ from the very first draw.

## 4.5 The derived API

```ts
next:      () => gen()                        // u ∈ [0,1)
nextInt:   (min, max) => Math.floor(u·(max−min)) + min   // half-open [min, max)
nextFloat: (min, max) => u·(max−min) + min
choice:    arr => arr[Math.floor(u·arr.length)]
bool:      (p = 0.5) => u < p
```

All of them are the **inverse-transform principle in miniature**: a uniform $u$ plus the right
monotone map gives the target law. For an integer in $[min, max)$ the map is
$x \mapsto \lfloor \min + u(\max - min)\rfloor$; each of the $max-min$ values captures exactly
$2^{32}/(max-min)$ of the underlying grid (an incommensurability bias of at most one grid point
out of $2^{32}$ — unmeasurable here). Note the engine layer wraps `nextInt` in
`randInt(a,b) = nextInt(a, b+1)` to get inclusive ranges, matching the plan's notation.

`shuffle` is a **Fisher–Yates** (descending variant):

```ts
for (let i = a.length - 1; i > 0; i--) {
  const j = Math.floor(next() * (i + 1));  [a[i], a[j]] = [a[j], a[i]]
}
```

**Correctness proof sketch.** By induction: element $i$ (0-indexed from the end) gets each
position $j \le i$ with probability $\frac{1}{i+1}$ at its step, and survives later steps with
probability $\prod \frac{k}{k+1} = \frac{i}{i+1}\cdots\frac{1}{2}$ — multiply out and every of the
$n!$ permutations has probability exactly $\frac{1}{n!}$. Empirics below agree.

`hashSeed(s)` maps a string to a 32-bit seed with the classic Java-style polynomial rolling
hash, $h \leftarrow 31h + c_i \pmod{2^{32}}$ — convenient for "name your session" reproducibility.

## 4.6 The statistical evidence (all real numbers, harness §1)

200 000 draws from `createRNG(42)`:

| test | theory | observed | verdict |
|---|---|---|---|
| mean | $0.5$ | $0.5007$ | within $0.5$ SE ($SE = 2.04\times10^{-3}$) |
| std dev | $\sqrt{1/12} = 0.28868$ | $0.28861$ | ✓ |
| $\chi^2$, 20 equiprobable bins | $\sim\chi^2_{19}$, 1% critical $36.19$ | $20.07$ | ✓ fits uniform |
| lag-1 autocorrelation | $0$ | $0.0001$ | ✓ no serial correlation |
| die faces `nextInt(1,7)` $\chi^2_5$ | 1% critical $15.09$ | $6.83$ | ✓ faces `[33462, 33505, 33384, 33518, 33093, 33038]` |
| shuffle of 3 items, 60 000 shuffles $\chi^2_5$ | 1% critical $15.09$ | $6.07$ | ✓ all six permutations ≈ 10 000: `{123: 10019, 132: 9942, 213: 10030, 231: 10124, 312: 9812, 321: 10073}` |

*(A $\chi^2$ statistic aggregates squared bin deviations, $(O-E)^2/E$; under the null it follows
a $\chi^2$ law with (bins−1) degrees of freedom, and values in the extreme 1% tail would signal
non-uniformity. All six statistics sit comfortably in the central mass.)*

And the determinism property itself, tested directly: `createRNG(123456)` twice produces
identical sequences (all 8 checked draws equal), while `createRNG(123457)` differs at draw 0.

## 4.7 Inverse-transform sampling, stated generally

Several components (binomial, geometric, normal-discretized samplers) draw $u$ and walk a
cumulative distribution. The general theorem: if $U \sim U[0,1)$ and $F$ is a CDF, then
$X = F^{-1}(U)$ has CDF $F$ — because $P(F^{-1}(U) \le x) = P(U \le F(x)) = F(x)$. The
triangular sampler (§3.5) is the continuous case solved in closed form; the tabulated samplers
are the same idea with a lookup walk. One implementation note: the walks compare `u < cum` with
the *left-over* probability implicitly assigned to the last support point (`return n` / `return
values[values.length-1]` fallback) — a defensive guard against floating-point underflow of the
cumulative sum below 1.

# Chapter 5 — Computing an Expectation: Three Engines, One Truth

The platform needs $\mathbb{E}[g(X)]$ constantly — as the *answer* in the EV Drill and as the
*fair value* in the Market Simulator. Three computational strategies coexist by design; knowing
their error behaviour is the difference between an exact game and a rigged one.

## 5.1 Strategy A — exact enumeration (the grader)

When the support is finite, `expectedValue(f)` sums $f(x)P(x)$ over the support. This is the
definition of expectation, executed. Cost: $O(|\text{support}|)$. Used for every EV Drill truth
and every scoring decision. **Zero error** (to floating point). This is why the acceptance
criterion "every game's fairValues is provably correct" is enforceable at all.

## 5.2 Strategy B — dynamic programming over independent factors (the verifier)

For the Market Simulator, $q_T = x_Ty_T + z_Tw_T$ is a *function of four independent chains*.
Instead of enumerating $2^{4h}$ joint paths, compute each variable's time-$h$ pmf by a
Markov-chain sweep (each variable has only 21 states):

$$p_{t+1}(v') = \sum_{v} p_t(v)\, P(v \to v'), \qquad P(v\to v\pm1) = p_{\pm}(v),\;\;
P(v \to v) = \text{(clamped)}.$$

Then:

- $\mathbb{E}[q_T] = \mathbb{E}[x_T]\mathbb{E}[y_T] + \mathbb{E}[z_T]\mathbb{E}[w_T]$
  (independence, linearity);
- the full pmf of $q_T$ by convolving the two product-laws
  ($p_{xy\,+\,zw} = p_{xy} * p_{zw}$, with $p_{xy}(m) = \sum_{i\cdot j = m} p_x(i)p_y(j)$);
- call and binary fairs from that pmf: $\sum_m (m-K)^+ p_{q}(m)$ and $\sum_{m>K} p_q(m)$.

Cost: $O(h \cdot 21^2)$ per variable plus two small convolutions — microseconds, **zero error**.
Chapter 14 uses this as the ground truth that the simulator's Monte Carlo is judged against. The
measured supports are small ($q_T$ takes only 104 distinct values at horizon 5, 439 at horizon
10), so convolution is trivially cheap.

## 5.3 Strategy C — Monte Carlo (the runtime estimator)

The Market Simulator's forward/call/binary fairs are estimated by brute-force simulation:
`estimateFuture(vars, formula, horizon, rng, trials)` replays `trials` (200 at init, 120 per
tick per instrument) random futures and averages the payoff:

$$\hat{F} = \frac{1}{M}\sum_{i=1}^{M} g\big(q^{(i)}_T\big).$$

By the **law of large numbers** $\hat F \to \mathbb{E}[g(q_T)]$, and — the practically important
part — its standard error is

$$\boxed{\;\mathrm{SE}(\hat F) = \frac{\sigma_g}{\sqrt{M}}\;}$$

where $\sigma_g$ is the per-trial standard deviation of the payoff. Fourfold accuracy costs
sixteenfold trials. Measured in Chapter 14: for $\mathbb{E}[q_{10}]$ with
$\sigma_{q} \approx 64$–$70$, $M = 200$ predicts $\mathrm{SE} \approx 4.5$–$5.0$; the observed
spread of the estimator over 30 independent replications was $4.27$ — the $\sqrt{M}$ law doing
exactly what the theory says.

**Why keep an estimator when Strategy B exists?** Historical (the simulator shipped first) and
practical: Monte Carlo generalizes instantly to formulas whose factors are *not* independent
(product $q = xyz$, running-max terms, path-dependent payoffs), where DP factorization breaks.
Chapter 16 (F12) recommends the upgrade path: keep MC as the general engine, add the DP as an
exact special case for the `classic`/`weighted` formulas.

## 5.4 The rules this chapter imposes on the codebase

1. **Anything graded must come from Strategy A** (exact enumeration) — scores and EV Drill
   truths never carry simulation noise.
2. **Anything simulated must quote its own error** — the MC estimator's $\sigma/\sqrt{M}$ is
   computable and is reported against exact DP in Chapter 14.
3. **Anything random must be seedable** — Chapter 4's contract — so all three strategies are
   reproducible, and a "wrong" fair value is a bug you can catch in a test, not a vibe.
