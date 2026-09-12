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
