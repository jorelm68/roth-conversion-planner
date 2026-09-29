# Tax Conversion Planner

A browser-only tool that finds the year-by-year Traditional → Roth IRA conversion schedule that maximizes your
**after-tax wealth at your chosen lifespan (default 90)**, and compares it side by side with simpler strategies
(no conversions, fill the 12/22/24/32% bracket, stay under IRMAA, convert everything now, ...).

* **Excel report + year-by-year audit:** download a workbook with every input, all strategies side by side, a sheet per strategy and a full "Calculation detail" sheet; click any year on screen to see each step of that year's math.
* **How it's calculated:** a full-page view (the "How it's calculated" button, or `/#how-it-works`) that walks through every formula with your numbers: each step shows the rule, the rule with your values plugged in, and the result, marked ✓ where it matches the planner's own number. It also covers how the numbers change year to year, the heirs' tax, the strategy search, and the tax-law figures used. Content is built in `src/methodology/` and tested against the engine.
* **Pick up where you left off:** "Import settings from Excel" reads the Inputs sheet of a downloaded report (you can edit its yellow cells in Excel first) and restores every setting.
* **No server, no storage.** Static Next.js export; the math runs in a Web Worker in your browser. Inputs are never sent or saved.
* **Everything is an input:** birth year, age, filing status, balances, other income streams (optionally marked as QBI), Social Security,
  IRA return and a separate outside-account return, inflation, monthly living expenses, conversion window, lifespan, how conversion
  tax is paid, ACA, heirs, and an optional "what if" future tax-rate increase.
* **Living expenses and cash flow:** optionally route all income, spending and taxes through the outside account; once it runs out, spending
  is drawn from the IRAs (Traditional first, grossed up for its own tax, then Roth). A year-by-year cash-flow table shows where the money goes.
* **Modeled:** 2026 federal brackets and deductions (indexed for inflation), OBBBA senior deduction ($6,000, 2025–2028, phased out),
  the §199A QBI deduction (20%, specified-service phase-out over $75k / $150k above $201,750 / $403,500),
  Social Security "tax torpedo", capital-gain stacking, NIIT, Medicare IRMAA (2-year look-back), ACA premium tax credit
  (original schedule, 400% FPL cliff), SECURE 2.0 RMD ages and the Uniform Lifetime Table, pro-rata basis, 10% early-withdrawal
  penalty when tax must come out of the IRA, and the 10-year rule for heirs.

Privacy details and how they are enforced: [docs/PRIVACY.md](docs/PRIVACY.md). See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) for the data sources, how "best" is defined, and known simplifications.

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
