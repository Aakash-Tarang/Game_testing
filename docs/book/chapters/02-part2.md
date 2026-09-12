# Part II — The Distribution Library

# Chapter 3 — Six Distributions, Derived and Verified

The file `src/core/distributions.ts` implements a `Distribution` interface and six constructors.
Every game's randomness is built from these. For each one we give: the story, the pmf/pdf, the
mean derivation, the exact implementation behaviour, and its **verification table row** —
200 000 samples drawn with a fixed seed, compared to theory. (Verification harness:
`docs/book/experiments/experiments.ts`, §2; results in `results.json`.)

```ts
export interface Distribution<T = number> {
  mean(): number
  sample(rng: RNG): T
  pdf?(x: T): number
  cdf?(x: T): number
  support(): T[]
  expectedValue(f: (x: T) => number): number
}
```

The design is deliberate: a distribution *knows* its support, so `expectedValue(f)` can compute
$\sum_x f(x)P(x)$ **exactly** by enumeration — no sampling in the scoring path. Sampling is used
only to *create* game content, never to grade it.

## 3.1 Uniform (discrete) — `uniformDiscrete(min, max, step)`

**Law.** $X$ takes values $a, a{+}s, a{+}2s,\dots,b$ (the code builds the value grid by stepping
with a $10^{-9}$ tolerance on the endpoint) each with probability $1/n$, $n = \frac{b-a}{s}+1$.

**Mean.** An arithmetic series:
$$\mathbb{E}[X] = \frac{1}{n}\sum_{i=0}^{n-1}(a + is) = a + \frac{s(n-1)}{2} = \frac{a+b}{2}.$$
For step 1 this is just "the midpoint". **Variance:** $\frac{n^2-1}{12}s^2$ — e.g. for
$U\{1..20\}$: $\frac{400-1}{12} = 33.25$.

**Used by:** EV Drill tiers 2, 3, 6; anywhere a "fair coin among options" is needed.

**Verification (200 000 draws, seed 2024):**

| quantity | theory | engine `mean()` | empirical |
|---|---|---|---|
| $U\{1..20\}$ mean | $10.5$ | $10.5$ | $10.4903$ |
| $U\{1..20\}$ variance | $33.25$ | — | $33.295$ |

Empirical standard error of the mean is $\sigma/\sqrt{N} = 5.766/447.2 \approx 0.0129$, so the
observed deviation $0.0097$ is well inside one standard error. The engine's analytic `mean()`
matches the midpoint formula exactly.

## 3.2 Uniform (continuous) — `uniformContinuous(min, max)`

**Law.** $f(x) = \frac{1}{b-a}$ on $[a,b]$; $F(x) = \frac{x-a}{b-a}$.

**Mean.** $\int_a^b \frac{x}{b-a}dx = \frac{a+b}{2}$ — same midpoint as the discrete case, which
is why the code can just `return (min+max)/2`.

**Numerical expectation.** There is no finite support, so `expectedValue(f)` uses the
**composite midpoint rule** with $N = 1000$ panels:

$$\int_a^b f(x)\,dx \approx \frac{b-a}{N}\sum_{i=0}^{N-1} f\!\Big(a + \tfrac{(2i+1)(b-a)}{2N}\Big).$$

The midpoint rule is exact for linear $f$ and has error $\frac{(b-a)^3}{24N^2}\max|f''|$ —
second order in $N$. Verified: for $U[0,10]$, `expectedValue(x => x)` returns
$5.000000000000001$ (exact), and `expectedValue(x => x*x)` returns $33.3333$ vs exact
$\mathbb{E}[X^2] = \frac{(b-a)^2}{12} + (\mathbb{E}X)^2 = \frac{100}{12}+25 = 33.3\overline{3}$ —
the quadratic case is where the $O(N^{-2})$ error would show, and at $N=1000$ it is below display
precision. **Verification:** empirical mean over 200 000 samples $= 4.9956$ (theory 5).

## 3.3 Binomial — `binomial(n, p)`

**Story.** $n$ independent yes/no trials, each yes with probability $p$; $X$ counts the yeses.

**pmf (derived, not asserted).** A specific sequence with $k$ yeses has probability
$p^k(1-p)^{n-k}$ (independence), and there are $\binom{n}{k}$ such sequences, so

$$P(X=k) = \binom{n}{k} p^k (1-p)^{n-k}.$$

**Mean (the elegant derivation).** Write $X = \sum_{i=1}^n \mathbb{1}_i$ where
$\mathbb{1}_i$ indicates trial $i$ was yes. Then by **linearity alone** (no independence needed
for the mean!):

$$\mathbb{E}[X] = \sum_i \mathbb{E}[\mathbb{1}_i] = \sum_i P(\text{yes}) = np.$$

**Variance:** each indicator has variance $p(1-p)$; independence makes them add:
$n p (1-p)$.

**Implementation.** The pmf is precomputed into a `Map` for all $k \in \{0..n\}$; the binomial
coefficient is computed by the multiplicative formula
$\binom{n}{k} = \prod_{i=1}^{k}\frac{n-i+1}{i}$ (never evaluates factorials, so it cannot
overflow for reasonable $n$). Sampling is **inverse-CDF**: draw $u$, walk the cumulative pmf,
return the first $k$ where the cumulative exceeds $u$. Verified: `pmf` sums to $1.0$; with
$n=10, p=0.3$: theory mean $3$, engine `mean()` $3$, empirical $2.999$; theory variance $2.1$,
empirical $2.107$.

## 3.4 Geometric — `geometric(p, maxK = 50)`

**Story.** Repeated independent trials until the first success; $X$ = trial index of first
success.

**pmf.** $P(X = k) = (1-p)^{k-1}p$ — $k-1$ failures then a success.

**Mean, via the tail-sum trick.** For a positive integer random variable,
$\mathbb{E}[X] = \sum_{k\ge1} P(X \ge k)$. Here $P(X \ge k) = (1-p)^{k-1}$ (the first $k-1$ all
fail), so with $q = 1-p$:

$$\mathbb{E}[X] = \sum_{k\ge1} q^{k-1} = \frac{1}{1-q} = \frac{1}{p}.$$

**The truncation subtlety (worth learning from).** A pmf with infinite support cannot be stored,
so the code truncates at $k \le 50$ and **renormalizes**: every stored probability is divided by
$Z = \sum_{k=1}^{50}(1-p)^{k-1}p$. How much mass is discarded? The remaining geometric tail sums
to $q^{50}$ exactly. For $p = 0.2$: $0.8^{50} = 1.427\times10^{-5}$ — twelve parts per million.
The truncated law's mean is $\frac{1}{p}$ minus a negligible correction, so `mean()` still
reports the closed form $1/p$; the verification table shows empirical mean $5.0008$ vs theory
$5$ for $p=0.2$ (variance $20.095$ vs $(1-p)/p^2 = 20$).

## 3.5 Triangular — `triangular(min, max, mode)`

**Law.** The two-dice shape, generalized: density rises linearly from $a=\min$ to the mode
$c$, then falls linearly to $b=\max$:

$$f(x) = \begin{cases} \dfrac{2(x-a)}{(b-a)(c-a)} & a \le x \le c \\[2mm]
\dfrac{2(b-x)}{(b-a)(b-c)} & c \le x \le b \end{cases}$$

(The leading $2$ makes the two triangles' areas sum to 1.)

**Mean.** By the centroid of the two triangles (or direct integration):
$\mathbb{E}[X] = \frac{a+b+c}{3}$ — the mode pulls the midpoint toward itself with weight
$\tfrac13$. **Variance:** $\frac{a^2+b^2+c^2-ab-ac-bc}{18}$.

**Inverse-CDF sampling, derived.** The code samples by inverting the CDF analytically. On the
left branch, $F(x) = \frac{(x-a)^2}{(b-a)(c-a)}$; setting $F(x) = u$ and solving:

$$x = a + \sqrt{u\,(b-a)(c-a)} \qquad (u < \tfrac{c-a}{b-a}),$$

and symmetrically $x = b - \sqrt{(1-u)(b-a)(b-c)}$ on the right branch — exactly the two lines
in the implementation. This is the general **inverse-transform** principle of §4.7 applied to a
piecewise-quadratic CDF. `expectedValue` uses the midpoint rule weighted by the closed-form pdf.
**Verification** for $(a,b,c)=(2,12,7)$: mean theory $7$, empirical $6.9976$; variance theory
$4.1667$, empirical $4.178$.

## 3.6 Normal (discretized) — `normalDiscretized(mean, std, min, max, step)`

**Law.** The Gaussian $\phi(x) = \frac{1}{\sigma\sqrt{2\pi}}\,e^{-\frac12\left(\frac{x-\mu}{\sigma}\right)^2}$, evaluated on a finite grid
$\{v : \min \le v \le \max, \text{ step } s\}$ and **renormalized**:

$$P(v) = \frac{\phi(v)}{Z}, \qquad Z = \sum_{v} \phi(v).$$

This is the standard trick for making a continuous law discrete without bias: renormalizing
preserves the *shape* exactly. For a grid spanning $\mu \pm 5\sigma$ the discarded tails total
under $6\times10^{-7}$; for the EV Drill's typical grid ($\mu\pm10\sigma$) they are effectively
zero. Because the grid is symmetric and $\phi$ is symmetric in $x-\mu$, the grid mean equals
$\mu$ *exactly* when $\mu$ sits on the grid; otherwise the nearest-grid-point correction
applies. Verified for $(\mu,\sigma)=(50,10)$, grid $0..100$ step 5: grid sum of probabilities
$= 1.0$, grid mean $= 50.0$, empirical mean $49.9939$, empirical variance $100.227$ vs theory
$100$.

**Why discretize at all?** Because the entire platform rests on *exactly computable* answers. A
discretized normal has finite support → `expectedValue` is an exact finite sum → an EV Drill
question about a bell-shaped lottery has a truth that is *provably* correct, not approximated.

## 3.7 Custom table — `customTable(values, probs)`

The raw material: any finite list of values with weights, normalized internally
($\tilde p_i = p_i / \sum_j p_j$). Everything else — sampling, mean, `expectedValue` — is the
finite-sum machinery. **Verification** for values $\{10,20,50\}$, weights $\{1,2,1\}$: mean
theory $\frac{10\cdot1+20\cdot2+50\cdot1}{4} = 25$, empirical $24.9831$; variance theory
$225$, empirical $224.85$.

*Audit flag (Finding F11):* this constructor's `cdf(x)` contains a convoluted double-filter that
computes the right value only by coincidence of index arithmetic; it is unused by any game, but
it should be replaced by the two-line cumulative sum used in the binomial sampler.

## 3.8 The two closed forms the EV Drill grades against

Two scenario families have closed-form truths; both are proved here and both were checked
against brute force for the exact parameter sets the generator can produce (agreement to
floating-point zero, `closedForms` in `results.json`).

**(a) Conditional expectation of a uniform.** For $X \sim U\{1..b\}$ and a threshold $k$:

$$\mathbb{E}[X \mid X > k] = \frac{1}{b-k}\sum_{x=k+1}^{b} x = \frac{(k+1) + b}{2},$$

the midpoint of the surviving segment. Brute-force check: $(b,k) = (20,7) \to 14$,
$(50,25) \to 38$, $(100,60) \to 80.5$ — all match the closed form.

**(b) Call-payoff expectation.** For $X \sim U\{0..b\}$ and strike $K$, with $m = b - K$:

$$\mathbb{E}[\max(0, X-K)] = \frac{1}{b+1}\sum_{x=K+1}^{b} (x - K)
= \frac{1}{b+1}\cdot\frac{m(m+1)}{2}.$$

The sum is a telescoping count: the payoff takes values $1, 2, \dots, m$ once each. Checks:
$(b,K) = (20,8) \to \frac{12\cdot13}{2\cdot21} = 3.714285\ldots$, $(50,30) \to 4.117647\ldots$,
$(100,55) \to 10.2475\ldots$ — brute force agrees to machine precision in all three cases.

These two formulas are the *fast mental-math paths* a trainee should internalize: "conditional
uniform = midpoint of the tail", "uniform call = $\frac{m(m+1)}{2(b+1)}$". Chapter 12 shows them
appearing verbatim in generated questions.

## 3.9 The verification table in one place

All rows: 200 000 samples, fixed seeds, from the actual library code.

| distribution | theory mean | engine mean() | empirical mean | theory var | empirical var |
|---|---|---|---|---|---|
| $U\{1..20\}$ | 10.5 | 10.5 | 10.4903 | 33.25 | 33.295 |
| $\mathrm{Bin}(10, 0.3)$ | 3 | 3 | 2.9990 | 2.1 | 2.107 |
| $\mathrm{Geom}(0.2)$ trunc@50 | 5 | 5 | 5.0008 | 20 | 20.095 |
| $\mathcal{N}_d(50,10; 0..100)$ | 50 | 50.0 | 49.9939 | 100 | 100.227 |
| $\mathrm{Tri}(2,12,7)$ | 7 | 7 | 6.9976 | 4.1667 | 4.178 |
| $\{10,20,50\}@\{1,2,1\}$ | 25 | 25 | 24.9831 | 225 | 224.85 |
| $U[0,10]$ | 5 | 5 | 4.9956 | 8.333 | 8.345 |

Every empirical mean is within $1.1$ standard errors of theory. The library does what the
mathematics says it does.
