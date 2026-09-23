# Roth Conversion Planner

A browser-only tool that finds the year-by-year Traditional → Roth IRA conversion schedule that maximizes your
**after-tax wealth at your chosen lifespan (default 90)**, and compares it side by side with simpler strategies
(no conversions, fill the 12/22/24/32% bracket, stay under IRMAA, convert everything now, ...).

* **No server, no storage.** Static Next.js export; the math runs in a Web Worker in your browser. Inputs are never sent or saved.
* **Everything is an input:** birth year, age, filing status, balances, other income streams, Social Security, return, inflation,
  conversion window, lifespan, how conversion tax is paid, ACA, heirs.
* **Modeled:** 2026 federal brackets and deductions (indexed for inflation), OBBBA senior deduction ($6,000, 2025–2028, phased out),
  Social Security "tax torpedo", capital-gain stacking, NIIT, Medicare IRMAA (2-year look-back), ACA premium tax credit
  (original schedule, 400% FPL cliff), SECURE 2.0 RMD ages and the Uniform Lifetime Table, pro-rata basis, 10% early-withdrawal
  penalty when tax must come out of the IRA, and the 10-year rule for heirs.

See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) for the data sources, how "best" is defined, and known simplifications.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: tax engine unit + planner tests
npm run typecheck
npm run build      # static export to ./out
```

## Layout

| Path | What |
| --- | --- |
| `src/engine/` | The tax engine: pure TypeScript, no React. `taxData.ts` holds every statutory number. |
| `src/engine/__tests__/` | Tests for brackets, SS taxation, IRMAA, ACA, RMDs, heirs, and the planner. |
| `src/components/`, `src/app/` | The Next.js UI. |

Not tax or investment advice.
