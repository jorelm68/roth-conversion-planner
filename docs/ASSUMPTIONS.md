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
* QBI deduction (IRC §199A, made permanent by the OBBBA): for other-income entries marked **QBI**, 20% of that income, capped at 20% of (taxable income before the deduction − qualified dividends and long-term gains). Above the 2026 threshold ($201,750 single / $403,500 joint, Rev. Proc. 2025-32, indexed) the QBI counted falls in a straight line to zero over the OBBBA phase-in range ($75,000 / $150,000, not indexed). That is the **specified service trade or business** rule, which fits most professional-firm partners. For other businesses the W-2 wage / property limits would apply instead; they are not modeled, nor is the $400 minimum deduction for active businesses. The deduction does not reduce AGI, so it does not change Social Security taxation, IRMAA, the ACA subsidy, NIIT or the (AGI-based) state tax. Conversions raise taxable income and can push the deduction into its phase-out; the optimizer accounts for this.
* What-if tax-rate increase (optional): from the chosen tax year, ordinary taxable income above the chosen level (2026 dollars, indexed like the brackets) pays higher rates, either a percentage of each bracket rate (20% turns 24% into 28.8%) or percentage points. It applies to you and to your heirs' tax on an inherited Traditional IRA. Capital-gain rates, deductions and bracket boundaries are unchanged, and the "highest bracket" figures still name the statutory bracket.

## Simplifications you should know about

* **One household, one age clock.** Ages and RMDs follow the primary owner. Spouse only affects 65+ deductions and IRMAA enrollee count. No survivor (widow) filing-status change and no spouse-specific IRAs or Joint Life table.
* **Living expenses (optional).** When off, other income is assumed to cover living costs and its own taxes, and after-tax RMDs are reinvested in the outside account, which is why it can keep growing; wealth comparisons are then about IRA-related taxes, not total net worth. When on, every dollar of wages, other income and Social Security goes into the outside account, and the monthly expenses you enter (today's dollars, grown with inflation) and every tax are paid from it. If it cannot cover a year:
  * **Unlimited** payment mode: other savings cover the gap. The outside balance goes negative ("extra funds needed") and IRAs are not tapped beyond RMDs.
  * **Outside account, then IRA** and **From the IRA**: the money comes first from that year's conversion (it is taxed either way; that part is reported as a withdrawal for spending, not a conversion), then from an extra Traditional IRA withdrawal sized so that it also covers its own tax (and the 10% penalty before 59½), then from the Roth (treated as tax- and penalty-free). If every account is empty the shortfall is shown as "unfunded" and the outside balance goes negative.
  * Do not enter income that your outside account itself produces (interest, dividends): its return already covers it. Payroll taxes on wages are not modeled.
* **Outside account** grows at its own return (you set it separately from the IRA return, since cash and bonds usually earn less) minus tax drag; the drag is not run through the bracket calculation. A negative balance is charged the full outside-account return.
* **Early-withdrawal penalty.** Money taken out of the IRA (to pay tax, or for spending) before age 60 is grossed up by 10% and the penalty is 10% of the net amount.
* **State tax** is a flat effective rate on AGI excluding taxable Social Security; no state deductions, exclusions or brackets.
* **Roth 5-year rules** are ignored (assumes Roth balances are qualified). Early-withdrawal penalty is applied before age 60 (the year you turn 59½).
* **Timing:** RMD and conversion occur at the start of the year, then balances grow. First RMD is taken in the year you reach the RMD age (no April 1 delay).
* **Heirs:** modeled as single filers with the "other income" you enter, splitting an inherited Traditional IRA evenly and withdrawing it in 10 level payments; tax is discounted at the investment return. Roth inherits tax-free. Eligible designated beneficiaries (spouse, minor children, disabled) have different rules. No estate tax (2026 exemption is $15M per person).
* **Other taxes not modeled:** AMT, itemized deductions, QBI wage/property limits, payroll/self-employment tax, Medicare Part B/D base premiums, IRMAA appeals, QCDs, state-specific retirement exclusions.
* **ACA** applies while the primary is under 65, household size 1 (single) or 2 (MFJ), and uses the benchmark premium you enter.

Verify the figures in `taxData.ts` against IRS publications when a new tax year is released.
