# QUANT_SIM — quant-interview training platform

A local, seeded, deterministic suite of quant-interview training games (EV Drill + Market
Simulator), built with Vite + React + TypeScript.

## Documentation

**Read [`docs/book.html`](docs/book.html)** — *QUANT_SIM: The Book* — the complete
from-first-principles record of this project: all the probability theory, every formula in the
code with its derivation, the phase-by-phase build narrative, verification experiments with
reproducible numbers, and an honest audit of known bugs. (Plain markdown version:
[`docs/REPORT.md`](docs/REPORT.md); experiment harness: `docs/book/experiments/`.)

## Quick start

```bash
npm install
npm run dev     # hub at :5173
npm test        # 6-test determinism / verification suite
```

---

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
