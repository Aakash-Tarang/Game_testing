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


---

# Part I — Probability from Zero

# Chapter 1 — Experiments, Events, and the Rules of Chance

## 1.1 What probability assigns numbers to

Everything in this project begins with an **experiment**: a process whose outcome is not
determined in advance but whose set of possible outcomes *is* known. Rolling a die, drawing a
card, generating the next tick of a market variable — all experiments.

The set of possible outcomes is the **sample space** $\Omega$, and subsets of $\Omega$ are
**events**. For one roll of a fair six-sided die, $\Omega = \{1,2,3,4,5,6\}$; the event
"the roll is even" is the subset $E = \{2,4,6\}$.

## 1.2 The three axioms

Probability is any function $P$ that maps events to numbers subject to Kolmogorov's axioms:

1. **Non-negativity:** $P(A) \ge 0$ for every event $A$.
2. **Normalization:** $P(\Omega) = 1$.
3. **Additivity:** for disjoint events $A_1, A_2, \dots$,
   $P(A_1 \cup A_2 \cup \cdots) = P(A_1) + P(A_2) + \cdots$

Everything else is a theorem. The ones this project uses constantly:

- **Complement:** $P(A^c) = 1 - P(A)$.
- **Equally likely outcomes:** if $\Omega$ has $n$ outcomes that are symmetric, then
  $P(A) = |A|/n$. This single formula powers the entire EV Drill: a uniform distribution on
  $\{1,\dots,20\}$ puts probability $1/20$ on each value because there is nothing distinguishing
  them.
- **Multiplication:** $P(A \cap B) = P(A)\,P(B \mid A)$.

## 1.3 Conditional probability

$P(A \mid B) = \dfrac{P(A \cap B)}{P(B)}$ — "the probability of $A$ once we know $B$ happened."
Conditioning *shrinks the world*: we recompute probabilities inside the subset $B$, renormalizing
so they still sum to 1.

This is not an abstract nicety — it is **Tier 3 of the EV Drill**. The question
"X is uniform on $\{1..50\}$; what is $\mathbb{E}[X \mid X > 30]$?" is answered exactly this way:
throw away everything outside $\{31,\dots,50\}$, renormalize (each surviving value now carries
probability $1/20$), and average. Chapter 3 derives the closed form
$\mathbb{E}[X\mid X>k] = \frac{(k+1)+b}{2}$ and the engine's generated answer for a real
instance was $40.5$ for $X\sim U\{1..50\},\, k=30$: the midpoint of $31..50$, exactly.

## 1.4 Independence

Events $A, B$ are **independent** when $P(A\cap B) = P(A)P(B)$ — knowing one tells you nothing
about the other. In the Market Simulator the four base variables $x,y,z,w$ evolve *independently*:
each has its own up/down coin, and no coin influences another. This is a deliberate design choice,
because independence makes fair values factor:

$$\mathbb{E}[xy] = \mathbb{E}[x]\,\mathbb{E}[y] \quad \text{(when } x \perp y\text{)},$$

a fact the exact-verification machinery of Chapter 14 exploits to compute option fairs to full
precision without simulation.

## 1.5 Where Bayes would enter (and why it is queued, not needed yet)

Bayes' theorem,

$$P(A \mid B) = \frac{P(B\mid A)\,P(A)}{P(B)},$$

is the mathematics of *updating a belief when evidence arrives*. The platform's planned
Phase 2 games (Event Contracts in the plan §1.7) are explicit Bayes exercises: a hidden true
probability $p$, observed flow as evidence, and the trader updating $\hat p$. In the Phase 1
build nothing requires inverting a conditional, so Bayes appears only in this preview. It is
listed in the roadmap (Chapter 17) with the Brier-score calibration machinery it feeds.

# Chapter 2 — Random Variables and Expectation

## 2.1 Random variables

A **random variable** is a function $X : \Omega \to \mathbb{R}$: it attaches a number to each
outcome. "The sum of two dice" is a random variable: the outcome is a *pair* $(i,j)$, and
$X(i,j) = i + j$.

For a **discrete** random variable the complete description is the **probability mass function**
(pmf):

$$p_X(x) = P(X = x), \qquad \sum_x p_X(x) = 1.$$

Two pmfs dominate everything here:

- **Two dice.** If $S = i+j$ with $i,j$ independent uniform on $\{1..6\}$, then
  $p_S(k) = \frac{k-1}{36}$ for $k \le 7$ and $p_S(k) = \frac{13-k}{36}$ for $k \ge 7$
  — the triangular law. (Count the pairs: $S=2$ only from $(1,1)$: $1/36$; $S=7$ from six pairs:
  $6/36$.) This is the exact distribution the planned Dice Market-Making game trades, and it is
  the same triangle the library's `triangular` distribution generalizes.
- **Uniform on $\{a..b\}$:** $p_X(x) = \frac{1}{b-a+1}$ — the EV Drill's default object.

## 2.2 Expectation is a center of mass

The **expected value** of a discrete random variable is the probability-weighted average:

$$\boxed{\;\mathbb{E}[X] = \sum_{x} x\, P(X=x)\;}$$

Think of the pmf as masses sitting on a number line; $\mathbb{E}[X]$ is the balance point.

**Worked example — one die.** $\mathbb{E}[X] = \frac{1+2+3+4+5+6}{6} = 3.5$. Note the expectation
need not be a *possible* value: no roll gives 3.5. Fair value is an average, not a prediction.

**Worked example — two dice.** By a symmetry argument (every pair $(i,j)$ has a partner
$(7-i, 7-j)$) the center is $7$; formally
$\mathbb{E}[S] = \mathbb{E}[i] + \mathbb{E}[j] = 3.5 + 3.5 = 7$ — which is our next law.

## 2.3 The three expectation laws the code runs on

**(a) Linearity.** For any random variables (independent or not) and constants $a,b$:

$$\mathbb{E}[aX + bY] = a\,\mathbb{E}[X] + b\,\mathbb{E}[Y].$$

This is the most-used formula in the repository. Consequences that appear verbatim in the games:

- The EV Drill's lottery generator draws outcomes $x_1,\dots,x_n$ with probabilities $p_i$, and
  the truth is $\mathbb{E}[X] = \sum_i p_i x_i$ — literally the definition, evaluated exactly.
- The Market Simulator's derived quantity $q = xy + zw$ has expectation
  $\mathbb{E}[q] = \mathbb{E}[x]\mathbb{E}[y] + \mathbb{E}[z]\mathbb{E}[w]$ *when the variables are
  independent* (linearity plus the independence factorization). Chapter 14 uses this to compute
  exact forwards.

**(b) Law of the unconscious statistician (LOTUS).** For any function $g$,

$$\mathbb{E}[g(X)] = \sum_x g(x)\,P(X=x).$$

You never need the distribution of $g(X)$ to get its mean. The call-payoff tier of the EV Drill
is exactly LOTUS with $g(x) = \max(0, x - K)$: the code loops over the support, applies $g$, and
weights by $P(x)$ — no attempt to derive the pmf of the payoff.

**(c) Law of total expectation (tower property).** If $B_1, \dots, B_m$ partition the world,

$$\mathbb{E}[X] = \sum_{i=1}^m P(B_i)\,\mathbb{E}[X \mid B_i].$$

Tier 4 of the EV Drill ("compound lottery: with probability $p$ you get lottery A, else lottery
B") is this law with two branches:

$$\mathbb{E}[X] = p\,\mathbb{E}[A] + (1-p)\,\mathbb{E}[B].$$

A real generated instance: $p = 0.7380649728$, $\mathbb{E}[A] = 73$, $\mathbb{E}[B] = -3$, truth
$= 0.73806\cdot 73 - 0.26194\cdot 3 = 53.0929$. (The prompt displayed "74%", a rounding this
book flags as Finding F8 in the audit — grading uses the exact $p$, not the displayed one.)

## 2.4 Variance: how much fair value wobbles

Expectation says where the center is; **variance** says how spread out around it:

$$\mathrm{Var}(X) = \mathbb{E}\big[(X - \mathbb{E}X)^2\big] = \mathbb{E}[X^2] - (\mathbb{E}X)^2,
\qquad \sigma_X = \sqrt{\mathrm{Var}(X)}.$$

Two facts matter downstream:

- **Variance adds only for independent variables:**
  $\mathrm{Var}(X+Y) = \mathrm{Var}(X)+\mathrm{Var}(Y)$ if $X\perp Y$. This is why the Monte
  Carlo standard-error formula of Chapter 5 has a $\sqrt{N}$ in it.
- **Variance is the raw material of option value.** A forward cares only about
  $\mathbb{E}[q_T]$; a call $\mathbb{E}[(q_T-K)^+]$ depends heavily on the *spread* of $q_T$
  around its mean. Two dynamics with the same mean but different variance price calls
  differently — the Market Simulator's estimator/model mismatch (Chapter 14) is exactly this
  effect, quantified.

**Worked example.** For a single die, $\mathbb{E}[X^2] = \frac{1+4+\dots+36}{6} = \frac{91}{6}$,
so $\mathrm{Var} = \frac{91}{6} - 3.5^2 = \frac{35}{12} \approx 2.917$, $\sigma \approx 1.708$.
For the two-dice sum, independence gives $\mathrm{Var}(S) = \frac{35}{12}+\frac{35}{12} = \frac{35}{6} \approx 5.833$, with $\sigma \approx 2.415$.

## 2.5 Why "expectation" deserves the name *fair value*

If a game pays $g(X)$ and you pay price $c$ to enter, your net gain is $g(X) - c$ and its
expectation is $\mathbb{E}[g(X)] - c$ (linearity again). The price $c^* = \mathbb{E}[g(X)]$ is
the unique price at which the game is *fair* — neither side expects to profit. Every instrument
in the Market Simulator is quoted around exactly such a price, and the whole training problem is:

$$\text{trade when } \big| \text{quote} - \text{fair} \big| > \text{costs}, \qquad
\text{in the direction the gap points.}$$

The Tier 5 EV Drill scenario makes the accounting explicit: a lottery with
$\mathbb{E} = 160.45$ and an entry fee of $41$ has net $\mathbb{E} = 119.4525$ — pay the fee,
keep the expectation; the graded "truth" is that difference.

This is the mathematical content of the plan-of-action's design rule from the Preface. The rest
of Part I–III builds the machinery to *compute* $\mathbb{E}[\cdot]$ exactly; Part IV turns it
into prices; Parts VI–VII build the games and prove the scoring rewards exactly this computation.


---

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


---

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


---

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


---

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


---

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


---

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


---

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


---

# Appendices

# Appendix A — The Formula Sheet

*Every formula the platform runs on, in one place.*

**Expectation and variance**
- $\mathbb{E}[X] = \sum_x x P(X=x)$; LOTUS: $\mathbb{E}[g(X)] = \sum_x g(x)P(x)$
- Linearity: $\mathbb{E}[aX+bY] = a\mathbb{E}X + b\mathbb{E}Y$; tower:
  $\mathbb{E}X = \sum_i P(B_i)\mathbb{E}[X\mid B_i]$
- $\mathrm{Var}(X) = \mathbb{E}X^2 - (\mathbb{E}X)^2$; independent ⇒ variances add
- Uniform discrete $U\{a..b\}$: mean $\frac{a+b}{2}$, var $\frac{n^2-1}{12}$ ($n = b-a+1$)
- Conditional uniform: $\mathbb{E}[X\mid X>k] = \frac{(k+1)+b}{2}$
- Uniform call: $\mathbb{E}[(X-K)^+] = \frac{m(m+1)}{2(b+1)}$, $m = b-K$
- Binomial: $P(k) = \binom{n}{k}p^k(1-p)^{n-k}$, mean $np$, var $np(1-p)$
- Geometric: $P(k) = (1-p)^{k-1}p$, mean $1/p$; truncated tail mass $(1-p)^{K}$
- Triangular $(a,c,b)$: mean $\frac{a+b+c}{3}$, var $\frac{a^2+b^2+c^2-ab-ac-bc}{18}$;
  inverse CDF $x = a + \sqrt{u(b-a)(c-a)}$ on the left branch
- Normal discretized: $P(v) = \phi(v)/\sum_u \phi(u)$

**PRNG**
- Uniform draw $u \in [0,1)$; integer: $\lfloor u(b-a)\rfloor + a$; Fisher–Yates shuffle
  (uniform over $n!$, proven §4.5); string seed hash $h \leftarrow 31h + c \bmod 2^{32}$
- Monte Carlo SE: $\sigma_g/\sqrt{M}$ (observed 4.27 vs predicted 4.51 at $M=200$)

**Market**
- Quotes: bid $= F + m - \Delta/2$, ask $= F + m + \Delta/2$
- Instant edge: $(|m| - \Delta/2)\cdot|s|$; arb flag $|m| > 0.6\Delta$; profitability $|m| > \Delta/2$
- Tick kernel: $p_\uparrow = \mathrm{clamp}(0.1, 0.9,\ 0.5 - 0.75\,d/20 + U(-0.05,0.05))$
- Mean reversion: $d_{t+1} = 0.925\,d_t$, half-life $\ln 0.5/\ln 0.925 \approx 8.9$ ticks
  (estimator kernel: $0.95$, 13.5)
- Mispricing decay: $m_{t+k} = m_t\,0.75^k$; window for $\varepsilon = 11.25$, $\Delta = 1.5$:
  $\approx 8.8$ ticks
- Injection: $\varepsilon = \pm\,\epsilon_{\text{scale}}\,k_{\text{diff}}\,\Delta\,U(0.8,1.5)$,
  $k \in \{8,5,3,2\}$
- MTM P&L $=$ cash $+ \sum s_j F_j$; VWAP on extension only
- Mono theorem: fair $\ge (q_t - K)^+$ (pathwise domination + expectation)
- Score $= \max(0,\ \text{P\&L} + 0.5\,\text{edge\%} + 20\,\text{detection} - 2\,\text{falsePos})$

**Scoring & rating**
- Accuracy steps: $r \le 1\% \to 1$, $\le 5\% \to 0.5$, $\le 10\% \to 0.25$, else 0
- Time bonus $1 + 0.5f$; question score $10\cdot\text{acc}\cdot\text{bonus}$ (max 15)
- EWMA: $\hat s_n = 0.25 s_n + 0.75 \hat s_{n-1}$, memory $\approx 4$ sessions
- Elo: $R' = R + 32(S - E)$, $E = 1/(1+10^{-(\Delta R)/400})$; store simplification
  $R' = R + 32(s/100 - 0.5)$
- Brier: $B = \frac1n\sum (p_i - o_i)^2$; coin-flip benchmark 0.25
- Kelly: $f^* = \frac{bp - (1-p)}{b}$

**Phase 2 previews**
- OU: $\mathrm{Var}(e_\infty) = \sigma^2/(1-\varphi^2)$; $k$-step var
  $\sigma^2(1-\varphi^{2k})/(1-\varphi^2)$
- 2d6: $P(S{=}k) = \frac{k-1}{36}$ ($k\le7$), $\frac{13-k}{36}$ ($k\ge7$); $P(S\ge7) = \frac{21}{36}$
- MM survival: $a - b > \frac{2(1-\nu)}{\nu}\,\mathbb{E}[\text{adverse cost}]$
- Fermi tightness $t = 1/(1+\log(\,hi/lo\,))$; coverage noise $\sqrt{c(1-c)/n}$

# Appendix B — File Map

| file | lines | role |
|---|---|---|
| `src/core/rng.ts` | 72 | splitmix32 + mulberry32, derived API, hashSeed |
| `src/core/distributions.ts` | 173 | 6 distributions + interface (Ch 3) |
| `src/core/scoring.ts` | 38 | tolerance, timeBonus, Brier, Elo, EWMA, normalize |
| `src/core/engine.ts` | 21 | the GameEngine contract + registry entry |
| `src/core/clock.ts` | 36 | Ticker (setInterval wrapper) |
| `src/core/types.ts` | 38 | Settings/SessionRecord/Rating/Profile |
| `src/games/ev-drill/engine.ts` | 351 | 6 tier generators + loop + results (Ch 12) |
| `src/games/ev-drill/index.tsx` | 265 | settings / play / results screens |
| `src/games/market-sim/engine.ts` | 559 | vars, q, instruments, injector, accounting (Ch 13) |
| `src/games/market-sim/index.tsx` | 298 | settings / live board / results |
| `src/app/store.ts` | 82 | Zustand + localStorage + EWMA/Elo updates |
| `src/app/router.tsx` | 43 | hash router |
| `src/app/Dashboard.tsx` | 100 | hub cards, sparklines |
| `src/app/ProfilePage.tsx` | 68 | identity, ratings, history, export/import |
| `src/ui/index.tsx` | 65 | Timer, NumberInput, ScoreBoard, useCountdown |
| `tests/determinism.test.ts` | 75 | the 6-test suite (Ch 14.1) |
| `uploads/PLAN_OF_ACTION.md` | 452 | founding spec |
| `docs/book/` | — | this book + experiments harness |

# Appendix C — Runbook (how to verify everything yourself)

```bash
npm install                      # toolchain
npm run dev                      # the hub at :5173 — play both games
npm test                         # the 6-test determinism/verification suite
npm run build && npm run preview # production build

# the book's experiment harness (all Part VII numbers):
npx esbuild docs/book/experiments/experiments.ts --bundle --platform=node \
  --format=esm --outfile=docs/book/experiments/experiments.mjs
node docs/book/experiments/experiments.mjs          # → results.json

# the seed-4242 instrument audit table (§14.5):
npx esbuild docs/book/experiments/instance4242.ts --bundle --platform=node \
  --format=esm --outfile=docs/book/experiments/instance4242.mjs
node docs/book/experiments/instance4242.mjs         # → results_instance4242.json

# rebuild the book (docs/book.html + docs/REPORT.md):
cd docs/book && npm install && node build.mjs
```

All harness seeds are constants in the scripts; every table in this book is byte-stable across
runs (the only wall-clock value printed anywhere is a test duration).

# Appendix D — Glossary

**Arbitrage (in this project)** — a quote provably on the wrong side of a computable bound
(below intrinsic for a mono-call; beyond $|m| > 0.6\Delta$ generally). **Ask/bid** — the price
you buy at / sell at; their gap $\Delta$ is the spread. **Brier score** — mean squared error of
probability forecasts. **EWMA** — exponentially weighted moving average. **Fair value** —
$\mathbb{E}[\text{payoff} \mid \text{state}]$; the engine's truth. **Fisher–Yates** — the
uniform shuffle. **Forward** — a contract paying $q_T$, fair $= \mathbb{E}[q_T \mid s]$.
**Half-life (reversion)** — ticks for a displacement's expectation to halve. **Intrinsic value**
— $(q_t - K)^+$, the immediate-exercise value. **Martingale** — a process whose future
expectation equals its present value. **Mean reversion** — drift proportional to displacement
from a centre (AR(1)/OU). **Mispricing $m$** — quote offset from fair; injected $\varepsilon$
decays ×0.75/tick. **Monte Carlo** — expectation by simulated sampling, SE $\sigma/\sqrt M$.
**pmf/pdf** — probability mass/density function. **PRNG** — pseudo-random number generator
(here: splitmix32-seeded mulberry32). **Size cap** — max trade size (10 at defaults). **Tower
property** — total expectation over a partition. **VWAP** — volume-weighted average price
(position basis on extension).

# Appendix E — Experiment Manifest

| experiment | file | seeds | key outputs |
|---|---|---|---|
| PRNG statistics | `experiments.ts` §1 | 42, 123456/123457, 7, 99 | mean 0.5007; χ² 20.07; ac1 0.0001; die χ² 6.83; permutation χ² 6.07 |
| Distribution verification | §2 | 2024 | the Ch 3.9 table |
| EV Drill generator mix | §3 | 1000–1003 | per-difficulty type counts, truth ranges |
| Truth cross-check | §4 | 555 000+ | 1000/1000 exact; closed forms exact |
| Tolerance/time-bonus rows | §5 | — | Ch 9 tables |
| Exact DP vs engine MC | §6 | 4242, 1000–1029 | martingale exact; SE law; kernel bias |
| Decay table | §7 | — | $0.75^k$, $k = 0..8$ |
| Policy experiments | §8 | 10 000–10 399 | the Ch 15 table; worked session |
| Rating path | §9 | — | EWMA/Elo 8-row table |
| Seed-4242 instrument audit | `instance4242.ts` | 4242 | the §14.5 table |

---

*Built with the engine it documents: every number in Parts II–VII was produced by the same
`src/core` and `src/games` code the browser plays. That is the standard this project set for
itself — and the standard the next phases inherit.*
