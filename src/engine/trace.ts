import { irmaaSurchargePerPerson, irmaaThreshold, irmaaTier, applicablePercentage, povertyLine } from "./health";
import { rmdStartAge, uniformDistributionPeriod } from "./rmd";
import type { YearData } from "./simulate";
import { bracketTop, hikeFor, type FederalResult } from "./tax";
import {
  ADDITIONAL_STANDARD_DEDUCTION_65,
  IRMAA,
  LTCG_THRESHOLDS,
  NIIT,
  ORDINARY_BRACKETS,
  QBI,
  SENIOR_DEDUCTION,
  SS_BASE,
  STANDARD_DEDUCTION,
} from "./taxData";
import type { PlannerInputs, Target, TraceLine, TraceSection } from "./types";

export interface TraceParams {
  inputs: PlannerInputs;
  yd: YearData;
  pre: { trad: number; basis: number; roth: number; outside: number };
  target: Target;
  cap: number;
  inWindow: boolean;
  windowYearsLeft: number;
  fraction: number;
  rmd: number;
  maxC: number;
  conv: number;
  f: FederalResult;
  stateTax: number;
  irmaa: number;
  lagMagi: number;
  subsidy: number;
  subsidyBase: number;
  acaLost: number;
  baseCost: number;
  extra: number;
  fromOutside: number;
  shortfall: number;
  drawn: number;
  withheldTax: number;
  penalty: number;
  uncovered: number;
  outsideNow: number;
  post: { trad: number; roth: number; outside: number };
  outsideGrowth: number;
  totalCost: number;
  marginalAllIn: number;
  /** Living expenses are modeled (full cash flow through the outside account). */
  spend: boolean;
  /** Cash income − living expenses − cost with no IRA money (0 when living expenses are off). */
  netCash: number;
  /** Outside account + netCash + RMD: cash on hand before paying the extra tax on IRA money. */
  pool: number;
  /** Outside account after paying the extra tax, before covering any spending shortfall. */
  cashBeforeCover: number;
  /** Part of the strategy's conversion kept as cash for living expenses instead of going to the Roth. */
  redirect: number;
  /** Extra, taxable Traditional IRA withdrawal for living expenses. */
  spendW: number;
  /** Extra tax caused by that withdrawal. */
  coverTax: number;
  fromRoth: number;
  unfunded: number;
  /** Early-withdrawal penalty on money taken for living expenses. */
  spendPenalty: number;
}

const usd = (label: string, value: number, note?: string, key?: string): TraceLine => ({ key, label, value, fmt: "usd", note });
const pctL = (label: string, value: number, note?: string, key?: string): TraceLine => ({ key, label, value, fmt: "pct", note });
const num = (label: string, value: number, note?: string, key?: string): TraceLine => ({ key, label, value, fmt: "num", note });
const text = (label: string, value: string, note?: string, key?: string): TraceLine => ({ key, label, value, fmt: "text", note });

const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pc = (r: number, d = 0) => `${(r * 100).toFixed(d)}%`;

export function describeTarget(p: TraceParams): { text: string; limit?: TraceLine } {
  const { target, inputs, yd } = p;
  const status = inputs.filingStatus;
  switch (target.kind) {
    case "none":
      return { text: "No conversion this year" };
    case "all":
      return { text: "Convert everything that remains after the RMD" };
    case "even":
      return { text: `Spread evenly: remaining balance ÷ ${p.windowYearsLeft} year(s) left in the conversion window` };
    case "amount":
      return { text: `Fixed amount of ${dollars(target.value)}` };
    case "bracket": {
      const rate = Math.min(target.rate, p.cap);
      const top = bracketTop(rate, status, yd.factor);
      return {
        text: `Fill the ${pc(rate)} bracket (ordinary taxable income up to the top of that bracket)`,
        limit: Number.isFinite(top) ? usd("Ordinary taxable income limit", top, `Top of the ${pc(rate)} bracket in ${yd.year} dollars`) : undefined,
      };
    }
    case "irmaa": {
      const factor2 = Math.pow(1 + inputs.inflation, Math.max(0, yd.year + 2 - 2026));
      return {
        text: `Keep MAGI at or below Medicare IRMAA threshold #${target.tier + 1} (this income sets premiums in ${yd.year + 2})`,
        limit: usd("MAGI limit", irmaaThreshold(target.tier, status, factor2), `IRMAA threshold indexed to ${yd.year + 2}`),
      };
    }
    case "aca":
      return {
        text: `Keep ACA MAGI at or below ${(target.ratio * 100).toFixed(0)}% of the poverty line`,
        limit: usd("ACA MAGI limit", target.ratio * povertyLine(yd.householdSize, yd.factor), `${(target.ratio * 100).toFixed(0)}% × poverty line for household of ${yd.householdSize}`),
      };
  }
}

/** Step-by-step walk-through of one simulated year, for review and testing. */
export function buildYearTrace(p: TraceParams): TraceSection[] {
  const { inputs, yd, f } = p;
  const status = inputs.filingStatus;
  const mfj = status === "mfj";
  const sections: TraceSection[] = [];
  const add = (title: string, lines: TraceLine[]) => sections.push({ title, lines });

  // 1. Situation
  add("1. Situation", [
    num("Tax year", yd.year, undefined, "year"),
    num("Your age (attained this year)", yd.age, undefined, "age"),
    ...(mfj ? [num("Spouse age", yd.year - inputs.spouseBirthYear)] : []),
    text("Filing status", mfj ? "Married filing jointly" : "Single"),
    num("People age 65+", yd.seniors, "Each gets the extra standard deduction and the senior deduction"),
    num("Tax-law indexing factor", yd.factor, `(1 + inflation)^(year − 2026); scales brackets, deductions, thresholds`),
    num("Inflation factor for your today's-dollar inputs", yd.real, `(1 + inflation)^(years since plan start)`),
  ]);

  // 2. Income before IRA distributions
  add("2. Income before any IRA distribution", [
    usd("Ordinary income (wages, pension, rental, interest)", yd.ordinary, "Wages until retirement age plus your other-income entries active at this age", "ordinaryIncome"),
    usd("  of which interest (subject to NIIT)", yd.interest),
    usd("Long-term gains & qualified dividends", yd.preferential, "Taxed at 0/15/20%", "preferentialIncome"),
    usd("Tax-exempt interest", yd.taxExempt, "Not taxed, but counts toward Social Security taxation, IRMAA and ACA"),
    usd("Social Security benefits", yd.ss, "Household benefit grown with inflation from today, from the claiming age", "socialSecurity"),
    ...(yd.qbi > 0 ? [usd("Qualified business income (§199A)", yd.qbi, "Ordinary income entries you marked as QBI", "qbi")] : []),
  ]);

  // 3. RMD
  const startAge = rmdStartAge(inputs.birthYear);
  const rmdLines: TraceLine[] = [
    usd("Traditional IRA balance at start of year", p.pre.trad, "Equals last year's end balance", "tradStart"),
    num("RMD starting age for your birth year", startAge, "72 if born ≤1950, 73 if 1951–1959, 75 if 1960+"),
  ];
  if (yd.age >= startAge && p.pre.trad > 0) {
    const period = uniformDistributionPeriod(yd.age);
    rmdLines.push(num("IRS Uniform Lifetime Table divisor", period, `Distribution period at age ${yd.age}`));
    rmdLines.push(usd("Required minimum distribution", p.rmd, `balance ÷ divisor = ${dollars(p.pre.trad)} ÷ ${period}`, "rmd"));
  } else {
    rmdLines.push(usd("Required minimum distribution", 0, yd.age < startAge ? "Not yet at RMD age" : "No balance", "rmd"));
  }
  rmdLines.push(usd("After-tax basis remaining (Form 8606)", p.pre.basis));
  rmdLines.push(pctL("Taxable share of any IRA distribution", p.fraction, "Pro-rata rule: 1 − basis ÷ balance", "taxableFraction"));
  rmdLines.push(usd("Taxable part of the RMD", p.rmd * p.fraction, undefined, "taxableRmd"));
  add("3. Required minimum distribution", rmdLines);

  // 4. Conversion decision
  const t = describeTarget(p);
  const convLines: TraceLine[] = [
    text("Inside the conversion window?", p.inWindow ? "Yes" : "No", `Window is ages ${inputs.conversionStartAge}–${inputs.lastConversionAge}`),
    text("Strategy this year", t.text),
  ];
  if (t.limit) convLines.push(t.limit);
  if (p.cap < 0.37 - 1e-9) {
    const top = bracketTop(p.cap, status, yd.factor);
    convLines.push(pctL("Bracket cap on this schedule", p.cap, Number.isFinite(top) ? `Ordinary taxable income may not exceed ${dollars(top)}` : undefined));
  }
  convLines.push(usd("Available to convert", p.maxC, "Balance minus the RMD (RMDs cannot be converted)"));
  const converted = p.conv - p.redirect;
  if (p.redirect > 0) {
    convLines.push(usd("Strategy amount", p.conv, "Largest amount that satisfies the strategy, solved against the full tax calculation below"));
    convLines.push(usd("  − kept as cash for living expenses", p.redirect, "The outside account could not cover this year's spending (see the cash-flow section)"));
  }
  convLines.push(usd("Roth conversion", converted, p.redirect > 0 ? undefined : "Largest amount that satisfies the strategy, solved against the full tax calculation below", "conversion"));
  convLines.push(usd("Taxable part of the conversion", converted * p.fraction, undefined, "taxableConversion"));
  add("4. Roth conversion decision", convLines);

  // 5. AGI & Social Security
  const ss = SS_BASE[status];
  const spendOut = p.redirect + p.spendW;
  const otherAgi = yd.ordinary + (p.rmd + p.conv + p.spendW) * p.fraction + yd.preferential;
  let ssNote = "Provisional income is at or below the first threshold: none of the benefit is taxable";
  if (f.provisionalIncome > ss.second) ssNote = `Above the second threshold (${dollars(ss.second)}): up to 85% of the benefit is taxable`;
  else if (f.provisionalIncome > ss.first) ssNote = `Between the thresholds (${dollars(ss.first)}–${dollars(ss.second)}): up to 50% of the benefit is taxable`;
  add("5. Adjusted gross income & Social Security", [
    usd("Ordinary income", yd.ordinary),
    usd("+ Taxable RMD", p.rmd * p.fraction),
    usd("+ Taxable Roth conversion", converted * p.fraction),
    ...(spendOut > 0 ? [usd("+ Taxable IRA withdrawals for living expenses", spendOut * p.fraction)] : []),
    usd("+ Long-term gains & qualified dividends", yd.preferential),
    usd("= Income before Social Security", otherAgi, undefined, "incomeBeforeSS"),
    usd("Provisional income", f.provisionalIncome, "Income before SS + tax-exempt interest + 50% of Social Security", "provisionalIncome"),
    text("Social Security thresholds", `${dollars(ss.first)} / ${dollars(ss.second)}`, "Fixed by statute, not indexed"),
    usd("Taxable Social Security", f.taxableSS, ssNote, "taxableSS"),
    pctL("Share of Social Security that is taxable", yd.ss > 0 ? f.taxableSS / yd.ss : 0),
    usd("Adjusted gross income (AGI)", f.agi, "Income before SS + taxable Social Security", "agi"),
    usd("MAGI (AGI + tax-exempt interest)", f.magi, "Used for IRMAA and NIIT", "magi"),
  ]);

  // 6. Deductions
  const baseStd = STANDARD_DEDUCTION[status] * yd.factor;
  const addl = ADDITIONAL_STANDARD_DEDUCTION_65[status] * yd.seniors * yd.factor;
  const seniorMax = yd.year <= SENIOR_DEDUCTION.lastYear ? SENIOR_DEDUCTION.amount * yd.seniors : 0;
  add("6. Deductions & taxable income", [
    usd("Standard deduction", baseStd, "2026 amount × indexing factor"),
    usd("Additional deduction for age 65+", addl, `${yd.seniors} person(s) × amount × indexing factor`),
    usd("Senior deduction before phase-out", seniorMax, `$6,000 per person 65+, tax years 2025–2028 only`),
    usd("Senior deduction after phase-out", f.seniorDeduction, `Reduced by 6% of AGI above ${dollars(SENIOR_DEDUCTION.threshold[status])}`, "seniorDeduction"),
    usd("Total deduction", f.deduction, undefined, "deduction"),
    ...(yd.qbi > 0
      ? [
          usd("Taxable income before the QBI deduction", f.taxableBeforeQbi, "AGI − deductions (not below 0)", "taxableBeforeQbi"),
          pctL("Share of QBI still counted", f.qbiShare, `Falls in a straight line from 100% at ${dollars(QBI.threshold[status] * yd.factor)} to 0% at ${dollars(QBI.threshold[status] * yd.factor + QBI.phaseIn[status])} of taxable income`),
          usd("QBI deduction (§199A)", f.qbiDeduction, "20% × QBI × share counted, at most 20% × (taxable income before it − gains & qualified dividends)", "qbiDeduction"),
        ]
      : []),
    usd("Taxable income", f.taxableIncome, yd.qbi > 0 ? "Taxable income before the QBI deduction − QBI deduction" : "AGI − deductions (not below 0)", "taxableIncome"),
    usd("  of which long-term gains & qualified dividends", f.preferentialTaxable),
    usd("  of which ordinary taxable income", f.ordinaryTaxable, undefined, "ordinaryTaxable"),
  ]);

  // 7. Federal tax
  const fedLines: TraceLine[] = [];
  const brackets = ORDINARY_BRACKETS[status];
  brackets.forEach((b, i) => {
    const lo = b.from * yd.factor;
    const hi = i + 1 < brackets.length ? brackets[i + 1].from * yd.factor : Infinity;
    const inB = Math.max(0, Math.min(f.ordinaryTaxable, hi) - lo);
    if (inB <= 0) return;
    fedLines.push({
      key: `bracket${Math.round(b.rate * 100)}`,
      label: `${pc(b.rate)} bracket (${dollars(lo)}–${Number.isFinite(hi) ? dollars(hi) : "and up"})`,
      value: inB * b.rate,
      fmt: "usd",
      note: `${dollars(inB)} × ${pc(b.rate)}`,
    });
  });
  if (fedLines.length === 0) fedLines.push(usd("No ordinary income tax", 0, "Ordinary taxable income is zero"));
  const lt = LTCG_THRESHOLDS[status];
  fedLines.push(usd("Tax on ordinary income", f.ordinaryTax, undefined, "ordinaryTax"));
  fedLines.push(
    usd("Tax on gains & qualified dividends", f.preferentialTax, `Stacked on top of ordinary income: 0% up to ${dollars(lt.zeroTo * yd.factor)}, 15% up to ${dollars(lt.fifteenTo * yd.factor)}, 20% above`, "preferentialTax"),
  );
  if (yd.hike) {
    const h = yd.hike;
    fedLines.push(
      usd(
        "What-if rate increase",
        f.rateIncreaseTax,
        `Ordinary taxable income above ${dollars(h.threshold)} pays ${h.mode === "relative" ? `each bracket's rate × ${pc(h.amount)} more (e.g. 24% → ${pc(0.24 + hikeFor(0.24, h), 1)})` : `${pc(h.amount, 1)} more in every bracket`}, from ${inputs.taxIncrease.startYear}`,
        "taxIncrease",
      ),
    );
  }
  fedLines.push(usd("Federal income tax", f.tax, undefined, "federalTax"));
  fedLines.push(pctL("Marginal bracket (next ordinary dollar)", f.marginal, undefined, "marginalBracket"));
  const nii = yd.interest + yd.preferential;
  fedLines.push(usd("Net investment income", nii));
  fedLines.push(usd("Net Investment Income Tax (3.8%)", f.niit, `3.8% × the lesser of NII and MAGI over ${dollars(NIIT.threshold[status])} (not indexed)`, "niit"));
  add("7. Federal income tax", fedLines);

  // 8. State
  const stateBase = Math.max(0, f.agi - f.taxableSS);
  add("8. State income tax", [
    usd("State taxable base", stateBase, "AGI excluding taxable Social Security"),
    pctL("Effective state rate", inputs.stateTaxRate),
    usd("State income tax", p.stateTax, undefined, "stateTax"),
  ]);

  // 9. IRMAA
  const factorIrmaa = yd.factor;
  const tier = irmaaTier(p.lagMagi, status, factorIrmaa);
  add("9. Medicare IRMAA (uses MAGI from two years earlier)", [
    num("People on Medicare this year", yd.medicare, "Age 65 or older"),
    usd("MAGI two years ago", p.lagMagi, yd.k >= 2 ? "From this scenario's own results" : "Your entry, or an estimate for years before the plan started"),
    text("First IRMAA threshold", dollars(IRMAA.thresholds[status][0] * factorIrmaa), "Single 109,000 / joint 218,000 in 2026 dollars, indexed"),
    num("IRMAA tier reached (0 = none)", yd.medicare > 0 ? tier : 0),
    usd("Annual surcharge per person (Part B + Part D)", yd.medicare > 0 ? irmaaSurchargePerPerson(tier, factorIrmaa) : 0),
    usd("IRMAA surcharge this year", p.irmaa, undefined, "irmaa"),
  ]);

  // 10. ACA
  if (yd.acaOn) {
    const fpl = povertyLine(yd.householdSize, yd.factor);
    const ratio = Math.max(f.acaMagi, fpl) / fpl;
    add("10. ACA premium tax credit", [
      usd("Benchmark (second-lowest silver) premium", yd.benchmark),
      usd("ACA MAGI (MAGI + untaxed Social Security)", f.acaMagi),
      usd(`Poverty line, household of ${yd.householdSize}`, fpl, "2025 guideline indexed"),
      num("Income as a multiple of the poverty line", ratio, "Above 4.0 the subsidy disappears (the cliff)"),
      pctL("Applicable percentage", ratio > 4 ? 0 : applicablePercentage(ratio), "Share of income you are expected to pay toward the benchmark plan"),
      usd("Premium tax credit with these IRA distributions", p.subsidy, "Benchmark − applicable % × income (not below 0)", "subsidy"),
      usd("Premium tax credit with no IRA distributions", p.subsidyBase),
      usd("Subsidy lost because of IRA distributions", p.acaLost, undefined, "acaLost"),
    ]);
  }

  // 11. Cost & payment
  add("11. Total cost this year and how the extra is paid", [
    usd("Federal + state + NIIT + IRMAA + lost ACA subsidy + penalty", p.totalCost, undefined, "totalCost"),
    usd("Cost with no IRA distributions at all", p.baseCost, "Reference case for the same income"),
    usd("Extra cost caused by IRA distributions", p.extra, "Cost with distributions − reference cost (before penalty)", "extraCost"),
    text("Payment mode", inputs.paymentMode === "unlimited" ? "From other savings (unlimited)" : inputs.paymentMode === "limited" ? "From outside account, then from the IRA" : "From the IRA (no outside funds)"),
    usd("Paid from outside funds / RMD cash", p.fromOutside),
    usd("Shortfall to withhold from the IRA", p.shortfall),
    usd("Withheld from the conversion (tax + penalty)", p.drawn, undefined, "withheld"),
    usd("  early-withdrawal penalty (10% before 59½)", p.penalty),
    usd("Could not be covered (adds to outside deficit)", p.uncovered),
  ]);

  // 11b. Cash flow
  if (p.spend) {
    const cashLines: TraceLine[] = [
      usd("Outside account at start of year", p.pre.outside),
      usd("+ Wages, other income and Social Security received", yd.cashIncome, undefined, "cashIncome"),
      usd("− Living expenses", yd.expenses, `${dollars(inputs.expenses.monthly)} a month × 12, grown with inflation`, "expenses"),
      usd("− Taxes on that income alone", p.baseCost, "The cost with no IRA money (same in every strategy)"),
      usd("+ RMD received", p.rmd),
      usd("− Extra tax on IRA money paid from this account", p.fromOutside),
      usd("= Cash after this year's spending and taxes", p.cashBeforeCover, p.cashBeforeCover < 0 ? "Negative: spending the account cannot cover" : undefined, "cashBeforeCover"),
    ];
    if (inputs.paymentMode === "unlimited") {
      cashLines.push(text("Shortfall", p.cashBeforeCover < 0 ? "Covered by other savings" : "None", "“Unlimited” mode: the balance may go negative (extra funds needed); IRAs are not tapped"));
    } else {
      cashLines.push(
        usd("Kept from the conversion for spending", p.redirect, "Already taxed as part of the conversion"),
        usd("Extra Traditional IRA withdrawal for spending", p.spendW, "Taxable; sized so that after its own tax it covers what is left", "spendW"),
        usd("  tax on that withdrawal", p.coverTax),
        usd("Withdrawn from the Roth for spending", p.fromRoth, "Tax-free; used only once the Traditional IRA is empty", "spendFromRoth"),
        usd("  early-withdrawal penalty on spending withdrawals", p.spendPenalty),
        usd("Spending no account could cover", p.unfunded, p.unfunded > 0 ? "Every account is empty: the outside balance goes negative" : undefined, "unfunded"),
      );
    }
    add("11b. Cash flow and living expenses", cashLines);
  }

  // 12. Marginal rates
  add("12. Marginal tax rate on the next dollar of IRA income", [
    pctL("Federal ordinary bracket", f.marginal),
    pctL("All-in rate (federal + state + Social Security torpedo + NIIT)", p.marginalAllIn, "Measured by adding $1,000 of IRA income and re-running the tax calculation", "marginalAllIn"),
  ]);

  // 13. Roll-forward
  const r = inputs.investmentReturn;
  add("13. Account roll-forward (RMD and conversion happen at start of year, then growth)", [
    usd("Traditional IRA: start", p.pre.trad),
    usd("  − RMD", p.rmd),
    usd("  − Roth conversion", converted),
    ...(spendOut > 0 ? [usd("  − withdrawn for living expenses", spendOut)] : []),
    pctL("  × growth (investment return)", r),
    usd("Traditional IRA: end", p.post.trad, undefined, "tradEnd"),
    usd("Roth IRA: start", p.pre.roth),
    usd("  + conversion", converted),
    usd("  − withheld for tax/penalty", p.drawn),
    ...(p.fromRoth > 0 ? [usd("  − withdrawn for living expenses", p.fromRoth)] : []),
    pctL("  × growth (investment return)", r),
    usd("Roth IRA: end", p.post.roth, undefined, "rothEnd"),
    usd("Outside account: start", p.pre.outside),
    ...(p.spend ? [usd("  + income − living expenses − tax on that income", p.netCash)] : []),
    usd(p.spend ? "  + RMD received" : "  + RMD received (reinvested)", p.rmd),
    usd("  − extra cost paid from outside funds", p.fromOutside),
    usd("  − uncovered shortfall", p.uncovered),
    ...(p.spend && inputs.paymentMode !== "unlimited"
      ? [usd("  + IRA money for living expenses, after its tax and penalty", p.outsideNow - p.cashBeforeCover)]
      : []),
    usd("  = after this year's cash flows", p.outsideNow, undefined, "outsideNow"),
    pctL("  × growth (outside return less tax drag; outside return if negative)", p.outsideGrowth),
    usd("Outside account: end", p.post.outside, undefined, "outsideEnd"),
  ]);

  return sections;
}
