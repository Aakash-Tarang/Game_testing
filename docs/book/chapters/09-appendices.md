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
