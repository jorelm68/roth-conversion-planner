# Assumptions and simplifications

## Objective

For each strategy the engine simulates every year from your current age through your lifespan and reports

`after-tax wealth = Roth IRA + outside account + Traditional IRA − PV of tax your heirs owe on the Traditional IRA`

at the end of the lifespan year. The **Optimized** scenarios search per-year conversion targets (fill a bracket, stay under an
IRMAA tier, stay under an ACA subsidy level, convert everything, or nothing) by coordinate ascent starting from the best
"fill bracket X" schedule. It is a local search, not a proof of global optimality. Capped variants ("never above 22%") show the
cost of keeping brackets low.

## Law and data (tax year 2026, `src/engine/taxData.ts`)

* Brackets, standard deduction, 65+ additional deduction, LTCG 0/15/20% thresholds: IRS 2026 inflation adjustments (Rev. Proc. 2025-32, as amended by the One Big Beautiful Bill Act). Indexed by your inflation input in later years.
* Senior deduction: $6,000 per person 65+, 2025–2028 only, reduced by 6% of MAGI over $75k / $150k (not indexed). Gone after 2028, per current law.
* Social Security taxation: 25k/34k (single), 32k/44k (MFJ) base amounts, not indexed. NIIT thresholds $200k/$250k, not indexed.
* IRMAA: 2026 tiers and Part B + Part D surcharges, applied to MAGI from two years earlier, per Medicare enrollee, indexed by inflation. First years use your optional prior-year MAGI inputs or an estimate.
* ACA: original premium-tax-credit schedule (enhanced credits expired after 2025), 2.10%–9.96% of income, no subsidy above 400% of the poverty line (2025 guideline $15,650 + $5,500/person, indexed).
* RMDs: age 72 (born ≤1950), 73 (1951–1959), 75 (1960+); IRS Uniform Lifetime Table.

## Simplifications you should know about

* **One household, one age clock.** Ages and RMDs follow the primary owner. Spouse only affects 65+ deductions and IRMAA enrollee count. No survivor (widow) filing-status change and no spouse-specific IRAs or Joint Life table.
* **No spending model.** Other income is assumed to cover living costs and its own taxes. After-tax RMDs are reinvested in the outside account. Wealth comparisons are therefore about IRA-related taxes, not total net worth.
* **Outside account** grows at return minus tax drag; the drag is not run through the bracket calculation. In "unlimited" payment mode it can go negative, which means "extra savings needed", charged at the investment return.
* **State tax** is a flat effective rate on AGI excluding taxable Social Security; no state deductions, exclusions or brackets.
* **Roth 5-year rules** are ignored (assumes Roth balances are qualified). Early-withdrawal penalty is applied before age 60 (the year you turn 59½).
* **Timing:** RMD and conversion occur at the start of the year, then balances grow. First RMD is taken in the year you reach the RMD age (no April 1 delay).
* **Heirs:** modeled as single filers with the "other income" you enter, splitting an inherited Traditional IRA evenly and withdrawing it in 10 level payments; tax is discounted at the investment return. Roth inherits tax-free. Eligible designated beneficiaries (spouse, minor children, disabled) have different rules. No estate tax (2026 exemption is $15M per person).
* **Other taxes not modeled:** AMT, itemized deductions, QBI, payroll/self-employment tax, Medicare Part B/D base premiums, IRMAA appeals, QCDs, state-specific retirement exclusions.
* **ACA** applies while the primary is under 65, household size 1 (single) or 2 (MFJ), and uses the benchmark premium you enter.

Verify the figures in `taxData.ts` against IRS publications when a new tax year is released.
