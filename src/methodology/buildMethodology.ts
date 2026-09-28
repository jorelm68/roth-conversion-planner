import { money, pct } from "@/components/format";
import {
  describeTarget,
  type PlanDetail,
  type PlannerInputs,
  type PlannerOutput,
  type ScenarioResult,
  type TraceParams,
  type YearRow,
} from "@/engine";
import { applicablePercentage, irmaaTier, povertyLine } from "@/engine/health";
import { rmdStartAge, uniformDistributionPeriod } from "@/engine/rmd";
import { bracketTop, hikeFor } from "@/engine/tax";
import {
  ACA,
  ADDITIONAL_STANDARD_DEDUCTION_65,
  BASE_YEAR,
  EARLY_WITHDRAWAL_PENALTY,
  IRMAA,
  LTCG_THRESHOLDS,
  MEDICARE_AGE,
  NIIT,
  ORDINARY_BRACKETS,
  PENALTY_FREE_AGE,
  QBI,
  SENIOR_DEDUCTION,
  SS_BASE,
  STANDARD_DEDUCTION,
  UNIFORM_LIFETIME,
} from "@/engine/taxData";

/**
 * Builds the "How it's calculated" page content. Every step shows the rule, the rule with the user's numbers
 * plugged in, and a result computed here, independently, from those numbers. Where the planner has its own
 * value for the same quantity it is recorded in `engine`; tests assert the two agree, so this page cannot
 * drift from what the planner actually does.
 */

export type Fmt = "usd" | "pct" | "num" | "text";

export interface Step {
  label: string;
  /** The rule, in words. */
  formula?: string;
  /** The rule with this year's numbers plugged in. */
  work?: string;
  value: number | string;
  fmt: Fmt;
  /** The planner's own value for the same quantity (tests assert it equals `value`). */
  engine?: number;
  strong?: boolean;
}

export interface Table {
  caption?: string;
  head: string[];
  rows: string[][];
  foot?: string[];
  /** Index of a row to highlight. */
  highlight?: number;
}

export interface Block {
  id: string;
  title: string;
  explain: string;
  table?: Table;
  steps: Step[];
  /** Where the rule comes from. */
  law?: string;
}

const $ = (n: number) => money(n);
const P = (r: number, d = 2) => pct(r, d);
const X = (n: number, d = 4) => n.toLocaleString("en-US", { maximumFractionDigits: d });
const TOP = 0.37;

function step(label: string, fmt: Fmt, value: number | string, o: Partial<Omit<Step, "label" | "fmt" | "value">> = {}): Step {
  return { label, fmt, value, ...o };
}

const KIND_TREATMENT = {
  ordinary: "Ordinary income",
  interest: "Ordinary income; also counts for NIIT",
  qualified: "0/15/20% capital-gain rates; counts for NIIT",
  taxExempt: "Not taxed; counts for Social Security, IRMAA and ACA",
} as const;

/** The step-by-step calculation of one year of one strategy. */
export function yearBlocks(p: TraceParams, row: YearRow): Block[] {
  const i = p.inputs;
  const yd = p.yd;
  const f = p.f;
  const status = i.filingStatus;
  const mfj = status === "mfj";
  const blocks: Block[] = [];

  // 1. Time and indexing
  const start = i.birthYear + i.currentAge;
  const factor = Math.pow(1 + i.inflation, Math.max(0, yd.year - BASE_YEAR));
  const real = Math.pow(1 + i.inflation, yd.k);
  const spouseAge = yd.year - i.spouseBirthYear;
  const seniors = (yd.age >= 65 ? 1 : 0) + (mfj && spouseAge >= 65 ? 1 : 0);
  blocks.push({
    id: "time",
    title: "Where this year sits in time",
    explain:
      "Each year of the plan is one tax year. Tax brackets, deductions and most thresholds rise with inflation, so the planner scales the 2026 figures by your inflation assumption. Amounts you entered in today's dollars grow at the same rate.",
    steps: [
      step("Plan start year", "num", start, { formula: "birth year + current age", work: `${i.birthYear} + ${i.currentAge}`, engine: yd.year - yd.k }),
      step("Tax year", "num", start + yd.k, { formula: "plan start year + years into the plan", work: `${start} + ${yd.k}`, engine: yd.year }),
      step("Your age", "num", i.currentAge + yd.k, { formula: "current age + years into the plan", work: `${i.currentAge} + ${yd.k}`, engine: yd.age }),
      step("Tax-law indexing factor", "num", factor, {
        formula: "(1 + inflation) ^ (tax year − 2026)",
        work: `(1 + ${P(i.inflation)}) ^ (${yd.year} − 2026)`,
        engine: yd.factor,
      }),
      step("Growth factor for today's-dollar inputs", "num", real, { formula: "(1 + inflation) ^ (years into the plan)", work: `(1 + ${P(i.inflation)}) ^ ${yd.k}`, engine: yd.real }),
      step("People age 65 or older", "num", seniors, {
        formula: mfj ? "you (if 65+) + your spouse (if 65+)" : "1 if you are 65 or older",
        work: mfj ? `you ${yd.age}, spouse ${spouseAge}` : `age ${yd.age}`,
        engine: yd.seniors,
      }),
    ],
    law: "Not indexed by law, so they stay fixed: the Social Security base amounts, the NIIT thresholds, and the senior-deduction phase-out thresholds.",
  });

  // 2. Income before IRA money
  const wages = yd.age < i.retirementAge ? i.wagesAnnual * real : 0;
  const sources: string[][] = [
    ["Wages", yd.age < i.retirementAge ? `${$(i.wagesAnnual)} × ${X(real)}` : `stopped at retirement age ${i.retirementAge}`, "Ordinary income", $(wages)],
  ];
  let ordinary = wages;
  let interest = 0;
  let preferential = 0;
  let taxExempt = 0;
  let qbi = 0;
  for (const s of i.incomeStreams) {
    const active = yd.age >= s.startAge && yd.age <= s.endAge;
    const amt = active ? s.annualAmount * (s.inflationAdjusted ? real : 1) : 0;
    const isQbi = s.kind === "ordinary" && !!s.qbi;
    if (s.kind === "ordinary") {
      ordinary += amt;
      if (isQbi) qbi += amt;
    } else if (s.kind === "interest") {
      ordinary += amt;
      interest += amt;
    } else if (s.kind === "qualified") preferential += amt;
    else taxExempt += amt;
    const how = !active
      ? `only ages ${s.startAge}–${s.endAge}`
      : s.inflationAdjusted
        ? `${$(s.annualAmount)} × ${X(real)}`
        : `${$(s.annualAmount)} (fixed)`;
    sources.push([s.label || "Other income", how, isQbi ? "Ordinary income; qualified business income (§199A)" : KIND_TREATMENT[s.kind], $(amt)]);
  }
  const ss = yd.age >= i.socialSecurityStartAge ? i.socialSecurityAnnual * real : 0;
  sources.push([
    "Social Security",
    yd.age >= i.socialSecurityStartAge ? `${$(i.socialSecurityAnnual)} × ${X(real)}` : `starts at age ${i.socialSecurityStartAge}`,
    "Partly taxable (see below)",
    $(ss),
  ]);
  blocks.push({
    id: "income",
    title: "Income before any IRA money",
    explain: "Everything you receive this year apart from the Traditional IRA. Each source is taxed according to its type.",
    table: { head: ["Source", "How it's figured", "Tax treatment", "Amount"], rows: sources },
    steps: [
      step("Ordinary income", "usd", ordinary, { formula: "wages + pensions, rental, interest and other ordinary income", engine: yd.ordinary }),
      step("  of which interest", "usd", interest, { formula: "interest and non-qualified dividends", engine: yd.interest }),
      step("Qualified dividends and long-term gains", "usd", preferential, { engine: yd.preferential }),
      step("Tax-exempt interest", "usd", taxExempt, { engine: yd.taxExempt }),
      step("Social Security benefits", "usd", ss, { formula: "benefit × growth factor, from your claiming age", engine: yd.ss }),
      ...(qbi > 0 || yd.qbi > 0 ? [step("  of which qualified business income", "usd", qbi, { formula: "ordinary income entries marked as QBI (§199A)", engine: yd.qbi })] : []),
    ],
  });

  // 3. RMD
  const startAge = rmdStartAge(i.birthYear);
  const due = yd.age >= startAge && p.pre.trad > 0;
  const divisor = due ? uniformDistributionPeriod(yd.age) : 0;
  const rmd = due ? Math.min(p.pre.trad, p.pre.trad / divisor) : 0;
  const share = p.pre.trad > 0 ? Math.min(1, Math.max(0, 1 - p.pre.basis / p.pre.trad)) : 0;
  const rmdSteps: Step[] = [
    step("Traditional IRA at the start of the year", "usd", p.pre.trad, { formula: yd.k === 0 ? "the balance you entered" : "last year's ending balance" }),
    step("Age required distributions start", "num", startAge, { formula: "72 if born 1950 or earlier, 73 if born 1951–1959, 75 if born 1960 or later", work: `born ${i.birthYear}` }),
  ];
  if (due) rmdSteps.push(step("IRS Uniform Lifetime Table divisor", "num", divisor, { formula: "distribution period for your age", work: `age ${yd.age}` }));
  rmdSteps.push(
    step("Required minimum distribution (RMD)", "usd", rmd, {
      formula: "start-of-year balance ÷ divisor (0 before the starting age)",
      work: due ? `${$(p.pre.trad)} ÷ ${divisor}` : p.pre.trad > 0 ? `age ${yd.age} is before ${startAge}` : "the account is empty",
      engine: p.rmd,
      strong: true,
    }),
    step("Taxable share of IRA money", "pct", share, {
      formula: "1 − after-tax basis ÷ start-of-year balance (pro-rata rule)",
      work: p.pre.trad > 0 ? `1 − ${$(p.pre.basis)} ÷ ${$(p.pre.trad)}` : undefined,
      engine: p.fraction,
    }),
    step("Taxable part of the RMD", "usd", rmd * share, { formula: "RMD × taxable share", work: `${$(rmd)} × ${P(share)}` }),
  );
  blocks.push({
    id: "rmd",
    title: "Required minimum distribution",
    explain: "Once you reach the starting age, the IRS requires a minimum withdrawal each year. It is taxable income and cannot itself be converted to a Roth.",
    steps: rmdSteps,
    law: "SECURE 2.0 Act starting ages; IRS Uniform Lifetime Table (Publication 590-B, Appendix B).",
  });

  // 4. Conversion
  const t = describeTarget(p);
  const available = Math.max(0, p.pre.trad - rmd);
  const conv = p.conv;
  const kind = p.target.kind;
  let independent: number | undefined;
  let convFormula: string;
  let convWork: string | undefined;
  if (!p.inWindow || kind === "none" || available <= 1) {
    independent = 0;
    convFormula = !p.inWindow ? "no conversion outside the conversion window" : "no conversion this year";
  } else if (kind === "bracket" || kind === "irmaa" || kind === "aca" || p.cap < TOP - 1e-9) {
    convFormula =
      "the largest amount that keeps the limit above, found by repeatedly halving the search range (to within $0.50) and re-running the complete tax calculation below for each candidate";
  } else if (kind === "all") {
    independent = available;
    convFormula = "everything available";
  } else if (kind === "even") {
    independent = available / Math.max(1, p.windowYearsLeft);
    convFormula = "available ÷ years left in the conversion window";
    convWork = `${$(available)} ÷ ${p.windowYearsLeft}`;
  } else {
    independent = Math.min(available, p.target.kind === "amount" ? p.target.value : 0);
    convFormula = "the fixed amount, up to what is available";
  }
  const convSteps: Step[] = [
    step("Inside your conversion window?", "text", p.inWindow ? "Yes" : "No", { formula: `ages ${i.conversionStartAge}–${i.lastConversionAge}`, work: `age ${yd.age}` }),
    step("This year's rule", "text", t.text),
  ];
  if (t.limit) convSteps.push(step(t.limit.label, "usd", t.limit.value as number, { formula: t.limit.note }));
  if (p.cap < TOP - 1e-9) {
    const capTop = bracketTop(p.cap, status, yd.factor);
    convSteps.push(step(`Never above the ${P(p.cap, 0)} bracket`, "usd", capTop, { formula: "ordinary taxable income may not pass the top of this bracket" }));
  }
  const converted = conv - p.redirect;
  convSteps.push(
    step("Available to convert", "usd", available, { formula: "start-of-year balance − RMD", work: `${$(p.pre.trad)} − ${$(rmd)}`, engine: p.maxC }),
    step(p.redirect > 0 ? "Strategy amount" : "Roth conversion", "usd", independent ?? conv, { formula: convFormula, work: convWork, engine: conv, strong: p.redirect <= 0 }),
  );
  if (p.redirect > 0) {
    convSteps.push(
      step("  kept as cash for living expenses", "usd", p.redirect, { formula: "the part of this year's spending the outside account could not cover (see the cash-flow step)" }),
      step("Roth conversion", "usd", converted, { formula: "strategy amount − amount kept for spending", work: `${$(conv)} − ${$(p.redirect)}`, engine: row.conversion, strong: true }),
    );
  }
  convSteps.push(step("Taxable part of the conversion", "usd", converted * share, { formula: "conversion × taxable share", work: `${$(converted)} × ${P(share)}` }));
  blocks.push({
    id: "conversion",
    title: "How much is converted to the Roth",
    explain: `Strategy: ${t.text}. The amount is chosen so the whole year's tax picture (brackets, Social Security, IRMAA, ACA) respects the rule.`,
    steps: convSteps,
  });

  // 5. Social Security taxation
  const spendW = p.spendW;
  const incomeBeforeSS = ordinary + rmd * share + conv * share + spendW * share + preferential;
  const provisional = incomeBeforeSS + taxExempt + 0.5 * ss;
  const { first: b1, second: b2 } = SS_BASE[status];
  let taxableSS = 0;
  let ssWork: string;
  if (ss <= 0) ssWork = "no benefits this year";
  else if (provisional <= b1) ssWork = `${$(provisional)} ≤ ${$(b1)}, so none is taxable`;
  else if (provisional <= b2) {
    taxableSS = Math.min(0.5 * (provisional - b1), 0.5 * ss);
    ssWork = `min(50% × (${$(provisional)} − ${$(b1)}), 50% × ${$(ss)})`;
  } else {
    const tier1 = Math.min(0.5 * ss, 0.5 * (b2 - b1));
    taxableSS = Math.min(0.85 * ss, 0.85 * (provisional - b2) + tier1);
    ssWork = `min(85% × ${$(ss)}, 85% × (${$(provisional)} − ${$(b2)}) + ${$(tier1)})`;
  }
  blocks.push({
    id: "social-security",
    title: "How much Social Security is taxed (the “tax torpedo”)",
    explain:
      "Up to 85% of benefits become taxable as your other income rises. While you are in that range, each extra $1 of IRA income can make up to $0.85 more of your benefit taxable, so that dollar is taxed at as much as 1.85× your bracket rate.",
    steps: [
      step("Income before Social Security", "usd", incomeBeforeSS, {
        formula:
          spendW > 0
            ? "ordinary income + taxable RMD + taxable conversion (including any part kept for spending) + taxable withdrawal for spending + gains and qualified dividends"
            : "ordinary income + taxable RMD + taxable conversion + gains and qualified dividends",
        work: spendW > 0
          ? `${$(ordinary)} + ${$(rmd * share)} + ${$(conv * share)} + ${$(spendW * share)} + ${$(preferential)}`
          : `${$(ordinary)} + ${$(rmd * share)} + ${$(conv * share)} + ${$(preferential)}`,
        engine: f.agi - f.taxableSS,
      }),
      step("Provisional income", "usd", provisional, {
        formula: "income before Social Security + tax-exempt interest + ½ × benefits",
        work: `${$(incomeBeforeSS)} + ${$(taxExempt)} + ½ × ${$(ss)}`,
        engine: f.provisionalIncome,
      }),
      step("Base amounts", "text", `${$(b1)} / ${$(b2)}`, { formula: mfj ? "married filing jointly (fixed by law)" : "single (fixed by law)" }),
      step("Taxable Social Security", "usd", taxableSS, {
        formula:
          "0 up to the first base amount; then 50% of the excess (at most 50% of benefits); above the second base amount, 85% of that excess plus the first tier (at most 85% of benefits)",
        work: ssWork,
        engine: f.taxableSS,
        strong: true,
      }),
    ],
    law: "Internal Revenue Code §86.",
  });

  // 6. AGI
  const agi = incomeBeforeSS + taxableSS;
  const magi = agi + taxExempt;
  blocks.push({
    id: "agi",
    title: "Adjusted gross income",
    explain: "AGI drives the deduction phase-outs and state tax; MAGI (AGI plus tax-exempt interest) drives Medicare IRMAA and the NIIT.",
    steps: [
      step("Adjusted gross income (AGI)", "usd", agi, { formula: "income before Social Security + taxable Social Security", work: `${$(incomeBeforeSS)} + ${$(taxableSS)}`, engine: f.agi, strong: true }),
      step("Modified AGI (MAGI)", "usd", magi, { formula: "AGI + tax-exempt interest", work: `${$(agi)} + ${$(taxExempt)}`, engine: f.magi }),
    ],
  });

  // 7. Deductions and taxable income
  const std = STANDARD_DEDUCTION[status] * factor;
  const add65 = ADDITIONAL_STANDARD_DEDUCTION_65[status] * seniors * factor;
  const seniorMax = seniors > 0 && yd.year <= SENIOR_DEDUCTION.lastYear ? SENIOR_DEDUCTION.amount * seniors : 0;
  const seniorThr = SENIOR_DEDUCTION.threshold[status];
  const senior = seniorMax > 0 ? Math.max(0, seniorMax - SENIOR_DEDUCTION.phaseoutRate * Math.max(0, agi - seniorThr)) : 0;
  const deduction = std + add65 + senior;
  const taxableBefore = Math.max(0, agi - deduction);
  const qbiThr = QBI.threshold[status] * factor;
  const qbiRange = QBI.phaseIn[status];
  const qbiShare = Math.min(1, Math.max(0, 1 - (taxableBefore - qbiThr) / qbiRange));
  const qbiLimit = QBI.rate * Math.max(0, taxableBefore - preferential);
  const qbiDed = qbi > 0 ? Math.min(QBI.rate * qbi * qbiShare, qbiLimit) : 0;
  const taxable = Math.max(0, taxableBefore - qbiDed);
  const prefTaxable = Math.min(preferential, taxable);
  const ordTaxable = taxable - prefTaxable;
  blocks.push({
    id: "deductions",
    title: "Deductions and taxable income",
    explain: "The planner uses the standard deduction (itemizing is not modeled), plus the extra amounts for people 65 and older.",
    steps: [
      step("Standard deduction", "usd", std, { formula: "2026 amount × indexing factor", work: `${$(STANDARD_DEDUCTION[status])} × ${X(factor)}` }),
      step("Extra deduction for age 65+", "usd", add65, {
        formula: "2026 amount × people 65+ × indexing factor",
        work: `${$(ADDITIONAL_STANDARD_DEDUCTION_65[status])} × ${seniors} × ${X(factor)}`,
      }),
      step("Senior deduction", "usd", senior, {
        formula: `$6,000 per person 65+ (tax years 2025–2028 only), reduced by 6% of AGI above ${$(seniorThr)}`,
        work:
          seniorMax > 0
            ? `max(0, ${$(seniorMax)} − 6% × max(0, ${$(agi)} − ${$(seniorThr)}))`
            : seniors === 0
              ? "nobody is 65 or older"
              : `ends after ${SENIOR_DEDUCTION.lastYear}`,
        engine: f.seniorDeduction,
      }),
      step("Total deductions", "usd", deduction, { formula: "sum of the three", engine: f.deduction }),
      ...(qbi > 0
        ? [
            step("Taxable income before the QBI deduction", "usd", taxableBefore, { formula: "AGI − total deductions (not below 0)", work: `${$(agi)} − ${$(deduction)}`, engine: f.taxableBeforeQbi }),
            step("Share of QBI still counted", "pct", qbiShare, {
              formula: `100% up to ${$(qbiThr)} of taxable income (the 2026 threshold × indexing factor), falling in a straight line to 0% at ${$(qbiThr + qbiRange)} (specified service business rule)`,
              work: `1 − (${$(taxableBefore)} − ${$(qbiThr)}) ÷ ${$(qbiRange)}, kept between 0% and 100%`,
              engine: f.qbiShare,
            }),
            step("QBI deduction (§199A)", "usd", qbiDed, {
              formula: "the smaller of 20% × QBI × share counted and 20% × (taxable income before it − gains and qualified dividends)",
              work: `min(20% × ${$(qbi)} × ${P(qbiShare)}, 20% × max(0, ${$(taxableBefore)} − ${$(preferential)}))`,
              engine: f.qbiDeduction,
            }),
            step("Taxable income", "usd", taxable, { formula: "taxable income before the QBI deduction − QBI deduction", work: `${$(taxableBefore)} − ${$(qbiDed)}`, engine: f.taxableIncome, strong: true }),
          ]
        : [step("Taxable income", "usd", taxable, { formula: "AGI − total deductions (not below 0)", work: `${$(agi)} − ${$(deduction)}`, engine: f.taxableIncome, strong: true })]),
      step("  taxed at capital-gain rates", "usd", prefTaxable, { formula: "the gains and qualified dividends inside taxable income" }),
      step("  taxed at ordinary rates", "usd", ordTaxable, { formula: "taxable income − the capital-gain part", engine: f.ordinaryTaxable }),
    ],
    law:
      qbi > 0
        ? "2026 figures from IRS Rev. Proc. 2025-32 as amended by the One Big Beautiful Bill Act (senior deduction: 2025–2028). QBI deduction: IRC §199A, made permanent by the OBBBA, which widened the phase-in range to $75,000 / $150,000."
        : "2026 figures from IRS Rev. Proc. 2025-32 as amended by the One Big Beautiful Bill Act (senior deduction: 2025–2028).",
  });

  // 8. Federal income tax
  const brackets = ORDINARY_BRACKETS[status];
  let ordTax = 0;
  let current = 0;
  const bracketRows = brackets.map((b, n) => {
    const lo = b.from * factor;
    const hi = n + 1 < brackets.length ? brackets[n + 1].from * factor : Infinity;
    const inB = Math.max(0, Math.min(ordTaxable, hi) - lo);
    const tax = inB * b.rate;
    ordTax += tax;
    if (ordTaxable >= lo) current = n;
    return [P(b.rate, 0), $(lo), Number.isFinite(hi) ? $(hi) : "and up", $(inB), inB > 0 ? `${$(inB)} × ${P(b.rate, 0)}` : "", $(tax)];
  });
  const lt = LTCG_THRESHOLDS[status];
  const zeroTo = lt.zeroTo * factor;
  const fifteenTo = lt.fifteenTo * factor;
  const stackTop = ordTaxable + prefTaxable;
  const at15 = Math.max(0, Math.min(stackTop, fifteenTo) - Math.max(ordTaxable, zeroTo));
  const at20 = Math.max(0, stackTop - Math.max(ordTaxable, fifteenTo));
  const gainsTax = 0.15 * at15 + 0.2 * at20;
  const h = yd.hike;
  let hikeTax = 0;
  const hikeRows: string[][] = [];
  if (h) {
    brackets.forEach((b, n) => {
      const lo = Math.max(b.from * factor, h.threshold);
      const hi = n + 1 < brackets.length ? brackets[n + 1].from * factor : Infinity;
      const inB = Math.max(0, Math.min(ordTaxable, hi) - lo);
      if (inB <= 0) return;
      const add = h.mode === "relative" ? b.rate * h.amount : h.amount;
      hikeTax += inB * add;
      hikeRows.push([P(b.rate, 0), `${$(inB)} × ${P(add, 2)}`]);
    });
  }
  const hikeSteps: Step[] = h
    ? [
        step("What-if rate increase", "usd", hikeTax, {
          formula: `from ${i.taxIncrease.startYear}, ordinary taxable income above ${$(i.taxIncrease.threshold)} (2026 dollars; ${$(h.threshold)} in ${yd.year}) pays ${
            h.mode === "relative" ? `each bracket's rate × ${P(h.amount, 0)} more (24% becomes ${P(0.24 + hikeFor(0.24, h), 1)})` : `${P(h.amount, 1)} more in every bracket`
          }`,
          work: hikeRows.length ? hikeRows.map((r) => `${r[0]} bracket: ${r[1]}`).join(" + ") : `${$(ordTaxable)} is not above ${$(h.threshold)}`,
          engine: f.rateIncreaseTax,
        }),
      ]
    : [];
  blocks.push({
    id: "federal",
    title: "Federal income tax",
    explain:
      "Ordinary income fills the brackets from the bottom up; each slice is taxed at its own rate. Gains and qualified dividends sit on top of ordinary income and use the 0/15/20% rates.",
    table: {
      caption: `${mfj ? "Married filing jointly" : "Single"} brackets for ${yd.year} (2026 amounts × ${X(factor)})`,
      head: ["Rate", "From", "To", "Your income in this bracket", "Calculation", "Tax"],
      rows: bracketRows,
      foot: ["Total", "", "", $(ordTaxable), "", $(ordTax)],
      highlight: current,
    },
    steps: [
      step("Tax on ordinary income", "usd", ordTax, { formula: "sum of the bracket slices above", engine: f.ordinaryTax }),
      step("Marginal bracket", "pct", brackets[current].rate, { formula: "rate of the bracket the next dollar falls in", engine: f.marginal }),
      step("Gains taxed at 15%", "usd", at15, {
        formula: `the part of the gains stacked between ${$(zeroTo)} and ${$(fifteenTo)} of taxable income`,
        work: `max(0, min(${$(stackTop)}, ${$(fifteenTo)}) − max(${$(ordTaxable)}, ${$(zeroTo)}))`,
      }),
      step("Gains taxed at 20%", "usd", at20, { formula: `the part above ${$(fifteenTo)}`, work: `max(0, ${$(stackTop)} − max(${$(ordTaxable)}, ${$(fifteenTo)}))` }),
      step("Tax on gains and qualified dividends", "usd", gainsTax, { formula: "15% × gains at 15% + 20% × gains at 20%", work: `15% × ${$(at15)} + 20% × ${$(at20)}`, engine: f.preferentialTax }),
      ...hikeSteps,
      step("Federal income tax", "usd", ordTax + gainsTax + hikeTax, {
        formula: h ? "ordinary tax + gains tax + what-if rate increase" : "ordinary tax + gains tax",
        work: h ? `${$(ordTax)} + ${$(gainsTax)} + ${$(hikeTax)}` : `${$(ordTax)} + ${$(gainsTax)}`,
        engine: f.tax,
        strong: true,
      }),
    ],
  });

  // 9. NIIT
  const nii = interest + preferential;
  const niitThr = NIIT.threshold[status];
  const niit = NIIT.rate * Math.max(0, Math.min(nii, magi - niitThr));
  blocks.push({
    id: "niit",
    title: "Net Investment Income Tax",
    explain: "A 3.8% tax on investment income for higher incomes. IRA distributions and conversions are not investment income, but they raise MAGI, which can pull your investment income into this tax.",
    steps: [
      step("Net investment income", "usd", nii, { formula: "interest + gains and qualified dividends", work: `${$(interest)} + ${$(preferential)}` }),
      step("NIIT", "usd", niit, {
        formula: `3.8% × the smaller of investment income and MAGI above ${$(niitThr)} (not indexed)`,
        work: `3.8% × max(0, min(${$(nii)}, ${$(magi)} − ${$(niitThr)}))`,
        engine: f.niit,
      }),
    ],
  });

  // 10. State
  const stateBase = Math.max(0, agi - taxableSS);
  const stateTax = i.stateTaxRate * stateBase;
  blocks.push({
    id: "state",
    title: "State income tax",
    explain: "Modeled as one effective rate on AGI, excluding Social Security (which most states do not tax).",
    steps: [
      step("State taxable income", "usd", stateBase, { formula: "AGI − taxable Social Security", work: `${$(agi)} − ${$(taxableSS)}` }),
      step("State income tax", "usd", stateTax, { formula: "your state rate × state taxable income", work: `${P(i.stateTaxRate)} × ${$(stateBase)}`, engine: p.stateTax, strong: true }),
    ],
  });

  // 11. IRMAA
  const tier = irmaaTier(p.lagMagi, status, factor);
  const enrollees = yd.medicare;
  const monthly = tier > 0 ? IRMAA.monthlySurcharge[tier - 1] : 0;
  const irmaa = enrollees > 0 && tier > 0 ? monthly * 12 * factor * enrollees : 0;
  const lagSource =
    yd.k >= 2
      ? `MAGI from ${yd.year - 2} in this same plan`
      : (yd.k === 0 ? i.priorMagi2 : i.priorMagi1) !== null
        ? `the MAGI you entered for ${yd.year - 2}`
        : `an estimate for ${yd.year - 2} (your first plan year's income with no IRA money), since that MAGI was left blank`;
  blocks.push({
    id: "irmaa",
    title: "Medicare IRMAA surcharge",
    explain: `From age ${MEDICARE_AGE}, higher-income Medicare enrollees pay extra Part B and Part D premiums. The tier is set by MAGI from two years earlier, so a large conversion now can raise premiums two years later.`,
    table: {
      caption: `IRMAA tiers for ${yd.year} (2026 amounts × ${X(factor)})`,
      head: ["Tier", "MAGI above", "Monthly surcharge per person", "Per year per person"],
      rows: IRMAA.thresholds[status].map((th, n) => [
        String(n + 1),
        $(th * factor),
        $(IRMAA.monthlySurcharge[n] * factor),
        $(IRMAA.monthlySurcharge[n] * 12 * factor),
      ]),
      highlight: tier > 0 ? tier - 1 : undefined,
    },
    steps: [
      step("People on Medicare", "num", enrollees, { formula: `everyone ${MEDICARE_AGE} or older` }),
      step("MAGI two years earlier", "usd", p.lagMagi, { formula: lagSource }),
      step("Tier reached", "num", tier, { formula: "highest tier whose threshold that MAGI is above (0 = none)" }),
      step("IRMAA surcharge", "usd", irmaa, {
        formula: "monthly surcharge × 12 × indexing factor × people on Medicare",
        work: enrollees === 0 ? "nobody is on Medicare yet" : tier === 0 ? "below the first threshold" : `${$(monthly)} × 12 × ${X(factor)} × ${enrollees}`,
        engine: p.irmaa,
        strong: true,
      }),
    ],
    law: "2026 Medicare Part B and Part D income-related monthly adjustment amounts.",
  });

  // 12. ACA
  if (yd.acaOn) {
    const fpl = povertyLine(yd.householdSize, factor);
    const acaIncome = magi + (ss - taxableSS);
    const ratio = Math.max(acaIncome, fpl) / fpl;
    const ap = ratio > ACA.cliffRatio ? 0 : applicablePercentage(ratio);
    const contribution = ap * Math.max(acaIncome, fpl);
    const subsidy = ratio > ACA.cliffRatio ? 0 : Math.max(0, yd.benchmark - contribution);
    const lost = Math.max(0, p.subsidyBase - subsidy);
    const benchmark = i.aca.benchmarkPremium * Math.pow(1 + i.aca.premiumGrowth, yd.k);
    blocks.push({
      id: "aca",
      title: "ACA premium tax credit",
      explain:
        "Before Medicare, the marketplace subsidy shrinks as income rises and disappears entirely above 400% of the poverty line (the “cliff”). IRA money that reduces your subsidy is counted as a cost of that money.",
      table: {
        caption: "Share of income you are expected to pay toward the benchmark plan",
        head: ["Income (× poverty line)", "Starts at", "Rises to"],
        rows: ACA.bands.map(([from, a, b], n) => [`${X(from, 2)}${n + 1 < ACA.bands.length ? `–${X(ACA.bands[n + 1][0], 2)}` : "–4.00"}`, P(a), P(b)]).concat([["above 4.00", "no credit", ""]]),
      },
      steps: [
        step("Benchmark premium", "usd", benchmark, {
          formula: "the premium you entered × (1 + premium growth) ^ years into the plan",
          work: `${$(i.aca.benchmarkPremium)} × (1 + ${P(i.aca.premiumGrowth)}) ^ ${yd.k}`,
          engine: yd.benchmark,
        }),
        step("Income for the ACA", "usd", acaIncome, { formula: "MAGI + untaxed Social Security", work: `${$(magi)} + ${$(ss - taxableSS)}`, engine: f.acaMagi }),
        step(`Poverty line, household of ${yd.householdSize}`, "usd", fpl, {
          formula: "($15,650 + $5,500 per extra person) × indexing factor",
          work: `(${$(ACA.fplBase)} + ${$(ACA.fplPerAdditional)} × ${yd.householdSize - 1}) × ${X(factor)}`,
        }),
        step("Income as a multiple of the poverty line", "num", ratio, { formula: "income ÷ poverty line", work: `${$(Math.max(acaIncome, fpl))} ÷ ${$(fpl)}` }),
        step("Applicable percentage", "pct", ap, { formula: "from the table; within a band it rises in a straight line" }),
        step("Your expected contribution", "usd", contribution, { formula: "applicable percentage × income", work: `${P(ap)} × ${$(Math.max(acaIncome, fpl))}` }),
        step("Premium tax credit", "usd", subsidy, {
          formula: "benchmark − expected contribution (not below 0; 0 above 4× the poverty line)",
          work: ratio > ACA.cliffRatio ? `${X(ratio, 2)} is above 4.00` : `${$(benchmark)} − ${$(contribution)}`,
          engine: p.subsidy,
        }),
        step("Credit you would get with no IRA money", "usd", p.subsidyBase, { formula: "same calculation without the RMD or conversion" }),
        step("Credit lost because of IRA money", "usd", lost, { formula: "credit without IRA money − credit with it", work: `${$(p.subsidyBase)} − ${$(subsidy)}`, engine: p.acaLost, strong: true }),
      ],
      law: "Premium tax credit, IRC §36B; 2026 applicable percentages (Rev. Proc. 2025-25); enhanced credits expired after 2025.",
    });
  }

  // 13. Cost and payment
  const penaltyBase = p.withheldTax + (p.redirect + p.spendW) / (1 + EARLY_WITHDRAWAL_PENALTY);
  const penalty = yd.age < PENALTY_FREE_AGE ? EARLY_WITHDRAWAL_PENALTY * penaltyBase : 0;
  const total = f.tax + p.stateTax + f.niit + p.irmaa + p.acaLost + penalty;
  const extra = f.tax + p.stateTax + f.niit + p.irmaa + p.acaLost - p.baseCost;
  const modeText =
    i.paymentMode === "unlimited"
      ? "You pay it from other savings (the outside account may go negative, meaning extra savings were needed)."
      : i.paymentMode === "limited"
        ? "Paid from the outside account and the RMD cash first; any shortfall is withheld from the conversion."
        : "No outside funds: any tax beyond the RMD cash is withheld from the conversion.";
  blocks.push({
    id: "cost",
    title: "This year's total cost and who pays it",
    explain: `The extra tax caused by IRA money is what a conversion costs. ${modeText} Before age ${PENALTY_FREE_AGE} (the year you turn 59½), tax withheld from the IRA also carries the 10% early-withdrawal penalty.`,
    steps: [
      step("Cost with no IRA money at all", "usd", p.baseCost, { formula: "federal + state + NIIT + IRMAA on your other income alone" }),
      ...(p.coverTax !== 0
        ? [
            step("Extra cost caused by all IRA money", "usd", extra, {
              formula: "(federal + state + NIIT + IRMAA + ACA credit lost) − cost with no IRA money",
              work: `${$(f.tax)} + ${$(p.stateTax)} + ${$(f.niit)} + ${$(p.irmaa)} + ${$(p.acaLost)} − ${$(p.baseCost)}`,
            }),
            step("  of which: tax on the extra withdrawal for living expenses", "usd", p.coverTax, { formula: "paid out of that withdrawal (see the cash-flow step)" }),
            step("Extra cost caused by the RMD and conversion", "usd", extra - p.coverTax, {
              formula: "extra cost of all IRA money − tax on the withdrawal for living expenses",
              work: `${$(extra)} − ${$(p.coverTax)}`,
              engine: p.extra,
            }),
          ]
        : [
            step("Extra cost caused by IRA money", "usd", extra, {
              formula: "(federal + state + NIIT + IRMAA + ACA credit lost) − cost with no IRA money",
              work: `${$(f.tax)} + ${$(p.stateTax)} + ${$(f.niit)} + ${$(p.irmaa)} + ${$(p.acaLost)} − ${$(p.baseCost)}`,
              engine: p.extra,
            }),
          ]),
      step("Paid from outside funds or RMD cash", "usd", p.fromOutside),
      step("Withheld from the conversion (tax + penalty)", "usd", p.drawn),
      step("Early-withdrawal penalty", "usd", penalty, {
        formula: `10% × the net amount taken out of the IRA for tax (and for living expenses), only before age ${PENALTY_FREE_AGE}`,
        work: yd.age < PENALTY_FREE_AGE ? `10% × ${$(penaltyBase)}` : `age ${yd.age}: no penalty`,
        engine: p.penalty,
      }),
      step("Total taxes and costs this year", "usd", total, {
        formula: "federal + state + NIIT + IRMAA + ACA credit lost + penalty",
        work: `${$(f.tax)} + ${$(p.stateTax)} + ${$(f.niit)} + ${$(p.irmaa)} + ${$(p.acaLost)} + ${$(penalty)}`,
        engine: p.totalCost,
        strong: true,
      }),
      step("All-in marginal rate on the next IRA dollar", "pct", p.marginalAllIn, {
        formula: "(total tax with $1,000 more IRA income − total tax now) ÷ $1,000; includes federal, state, NIIT and extra Social Security taxation",
      }),
    ],
  });

  // 14. Roll-forward
  // Cash flow (living expenses)
  if (p.spend) {
    const expenses = i.expenses.monthly * 12 * real;
    const cashIncome = ordinary + preferential + taxExempt + ss;
    const netCash = cashIncome - expenses - p.baseCost;
    const before = p.pre.outside + netCash + rmd - p.fromOutside - p.uncovered;
    const cashSteps: Step[] = [
      step("Cash received", "usd", cashIncome, { formula: "wages + other income + Social Security", work: `${$(ordinary)} + ${$(preferential)} + ${$(taxExempt)} + ${$(ss)}`, engine: yd.cashIncome }),
      step("Living expenses", "usd", expenses, { formula: "monthly expenses × 12 × growth factor", work: `${$(i.expenses.monthly)} × 12 × ${X(real)}`, engine: row.expenses }),
      step("Left after expenses and the tax on that income", "usd", netCash, {
        formula: "cash received − living expenses − cost with no IRA money (the same in every strategy)",
        work: `${$(cashIncome)} − ${$(expenses)} − ${$(p.baseCost)}`,
        engine: p.netCash,
      }),
      step("Outside account after spending and taxes", "usd", before, {
        formula: "start of year + amount above + RMD − extra tax paid from the account − any tax that could not be covered",
        work: `${$(p.pre.outside)} + ${$(netCash)} + ${$(rmd)} − ${$(p.fromOutside)} − ${$(p.uncovered)}`,
        engine: p.cashBeforeCover,
        strong: true,
      }),
    ];
    if (i.paymentMode === "unlimited") {
      cashSteps.push(step("How a shortfall is covered", "text", before < 0 ? "By other savings (the balance goes negative)" : "No shortfall", { formula: "“Unlimited” payment mode: IRAs are never tapped for spending" }));
    } else {
      const pen = yd.age < PENALTY_FREE_AGE ? EARLY_WITHDRAWAL_PENALTY : 0;
      cashSteps.push(
        step("Kept from the conversion", "usd", p.redirect, { formula: "first source: this year's conversion (it is taxed either way), grossed up for any penalty" }),
        step("Extra Traditional IRA withdrawal", "usd", p.spendW, {
          formula: "next source: the smallest withdrawal that, after its own tax (and any penalty), covers what is left; found by repeatedly halving the search range",
          engine: row.spendFromTrad - p.redirect,
        }),
        step("  tax caused by that withdrawal", "usd", p.coverTax),
        step("From the Roth IRA", "usd", p.fromRoth, { formula: "last source, once the Traditional IRA is empty (tax-free)", engine: row.spendFromRoth }),
        step("Not covered by any account", "usd", p.unfunded, { formula: "what is still missing; the outside balance goes negative", engine: row.unfunded }),
        step("Outside account after covering the shortfall", "usd", before + (p.redirect + p.spendW) / (1 + pen) - p.coverTax + p.fromRoth, {
          formula: "amount above + (kept from conversion + extra withdrawal) ÷ (1 + penalty rate) − its tax + Roth withdrawal",
          work: `${$(before)} + (${$(p.redirect)} + ${$(p.spendW)}) ÷ ${X(1 + pen)} − ${$(p.coverTax)} + ${$(p.fromRoth)}`,
          engine: p.outsideNow,
        }),
      );
    }
    blocks.push({
      id: "cashflow",
      title: "Cash flow: living expenses and where the money comes from",
      explain:
        i.paymentMode === "unlimited"
          ? "All income comes into the outside account and living expenses and every tax are paid from it. In “unlimited” mode any shortfall is assumed to come from other savings, so the balance can go negative (extra funds needed)."
          : "All income comes into the outside account and living expenses and every tax are paid from it. When it runs out, money comes from this year's conversion first, then an extra (taxable) Traditional IRA withdrawal, then the Roth.",
      steps: cashSteps,
    });
  }

  const r = i.investmentReturn;
  const tradEnd = (p.pre.trad - rmd - conv - spendW) * (1 + r);
  const rothEnd = (p.pre.roth + converted - p.drawn - p.fromRoth) * (1 + r);
  const outsideNow = p.outsideNow;
  const ro = i.outsideReturn;
  const growth = outsideNow > 0 ? ro - i.outsideTaxDrag : ro;
  const outsideEnd = outsideNow * (1 + growth);
  const basisNext = Math.max(0, p.pre.basis - (rmd + conv + spendW) * (1 - share));
  const outsideNowIndependent = p.spend ? undefined : p.pre.outside + rmd - p.fromOutside - p.uncovered;
  blocks.push({
    id: "rollforward",
    title: "Account balances at the end of the year",
    explain: "The RMD and the conversion happen at the start of the year; then the IRAs grow for a year at your investment return and the outside account at its own return, less the tax drag you entered.",
    steps: [
      step("Traditional IRA at year end", "usd", tradEnd, {
        formula: spendW > 0 ? "(start − RMD − strategy amount − extra withdrawal for spending) × (1 + return)" : "(start − RMD − conversion) × (1 + return)",
        work: spendW > 0 ? `(${$(p.pre.trad)} − ${$(rmd)} − ${$(conv)} − ${$(spendW)}) × (1 + ${P(r)})` : `(${$(p.pre.trad)} − ${$(rmd)} − ${$(conv)}) × (1 + ${P(r)})`,
        engine: row.tradEnd,
        strong: true,
      }),
      step("Roth IRA at year end", "usd", rothEnd, {
        formula: p.fromRoth > 0 ? "(start + conversion − amount withheld − withdrawn for spending) × (1 + return)" : "(start + conversion − amount withheld) × (1 + return)",
        work: p.fromRoth > 0
          ? `(${$(p.pre.roth)} + ${$(converted)} − ${$(p.drawn)} − ${$(p.fromRoth)}) × (1 + ${P(r)})`
          : `(${$(p.pre.roth)} + ${$(converted)} − ${$(p.drawn)}) × (1 + ${P(r)})`,
        engine: row.rothEnd,
        strong: true,
      }),
      p.spend
        ? step("Outside account after this year's cash flows", "usd", outsideNow, { formula: "from the cash-flow step above" })
        : step("Outside account after this year's cash flows", "usd", outsideNowIndependent!, {
            formula: "start + RMD received − cost paid from it − shortfall not covered",
            work: `${$(p.pre.outside)} + ${$(rmd)} − ${$(p.fromOutside)} − ${$(p.uncovered)}`,
            engine: p.outsideNow,
          }),
      step("Outside account at year end", "usd", outsideEnd, {
        formula: "that amount × (1 + outside return − tax drag); a negative balance grows at the full outside return",
        work: `${$(outsideNow)} × (1 + ${P(growth)})`,
        engine: row.outsideEnd,
        strong: true,
      }),
      step("After-tax basis carried forward", "usd", basisNext, { formula: "basis − (RMD + conversion) × (1 − taxable share)" }),
      step(`MAGI carried to ${yd.year + 2} for IRMAA`, "usd", magi, { formula: "this year's MAGI sets Medicare premiums two years later" }),
    ],
  });

  return blocks;
}

/** What is left at the end of the plan, the heirs' tax, after-tax wealth and lifetime totals for one strategy. */
export function endBlocks(i: PlannerInputs, s: ScenarioResult, d: PlanDetail, none: ScenarioResult): Block[] {
  const r = i.investmentReturn;
  const h = d.heirs;
  const n = h.years;
  const payment = h.balance <= 0 ? 0 : r > 1e-9 ? (h.balance * r) / (1 - Math.pow(1 + r, -n)) : h.balance / n;
  const heirsPv = h.rows.reduce((a, x) => a + x.pv, 0);
  const legacy = d.roth + d.outside + d.trad - heirsPv;
  const deflator = Math.pow(1 + i.inflation, d.yearsToEnd);
  const sum = (get: (x: YearRow) => number) => d.rows.reduce((a, x) => a + get(x), 0);
  const fed = sum((x) => x.federalTax);
  const st = sum((x) => x.stateTax);
  const niit = sum((x) => x.niit);
  const irmaa = sum((x) => x.irmaa);
  const aca = sum((x) => x.acaSubsidyLost);
  const pen = sum((x) => x.penalty);
  const owner = fed + st + niit + irmaa + aca + pen;
  const lastYear = d.rows[d.rows.length - 1]?.year ?? 0;

  return [
    {
      id: "heirs",
      title: "Tax your heirs will pay on what is left in the Traditional IRA",
      explain: `Most non-spouse heirs must empty an inherited Traditional IRA within 10 years and pay income tax on it; a Roth passes tax-free. The planner assumes ${h.heirs} heir${h.heirs === 1 ? "" : "s"} split it evenly and withdraw it in equal yearly amounts, each taxed as a single filer with ${$(i.heirs.otherIncome)} of other income (today's dollars), plus a ${P(i.heirs.stateTaxRate)} state rate. Future tax is converted to its value in ${lastYear} by discounting at your investment return.`,
      table: h.rows.length
        ? {
            caption: "Year by year after the end of the plan",
            head: ["Year", "Heir's other income", "Standard deduction", "Federal tax without IRA", "Federal tax with IRA", "State tax per heir", "Tax, all heirs", "Discount factor", "Value in " + lastYear],
            rows: h.rows.map((x) => [String(x.year), $(x.otherIncome), $(x.standardDeduction), $(x.federalWithout), $(x.federalWith), $(x.statePerHeir), $(x.tax), X(x.discount), $(x.pv)]),
            foot: ["Total", "", "", "", "", "", $(h.rows.reduce((a, x) => a + x.tax, 0)), "", $(heirsPv)],
          }
        : undefined,
      steps: [
        step("Traditional IRA left", "usd", h.balance, { formula: `balance at the end of age ${i.lifespan}`, engine: s.tradEnd }),
        step("Equal yearly withdrawal", "usd", payment, {
          formula: "balance × return ÷ (1 − (1 + return) ^ −10): the amount that empties the account in 10 years while it keeps earning",
          work: h.balance > 0 ? `${$(h.balance)} × ${P(r)} ÷ (1 − (1 + ${P(r)}) ^ −10)` : "nothing left",
          engine: h.payment,
        }),
        step("Per heir", "usd", h.balance > 0 ? payment / h.heirs : 0, { formula: "withdrawal ÷ number of heirs", work: `${$(payment)} ÷ ${h.heirs}` }),
        step("Each year's tax", "text", "see table", {
          formula: "(federal tax with the inheritance − federal tax without it + state rate × inheritance) × number of heirs",
        }),
        step("Heirs' tax, valued in " + lastYear, "usd", heirsPv, { formula: "Σ each year's tax ÷ (1 + return) ^ years after death", engine: s.heirsTax, strong: true }),
      ],
      law: "SECURE Act 10-year rule for designated beneficiaries. Spouses, minor children and disabled heirs can have longer periods; that is not modeled.",
    },
    {
      id: "wealth",
      title: "After-tax wealth at the end of the plan",
      explain: "The single number every strategy is ranked by: what you (or your heirs) keep after all taxes, including the tax still owed on the Traditional IRA.",
      steps: [
        step("Roth IRA", "usd", d.roth, { engine: s.rothEnd }),
        step("Outside account", "usd", d.outside, { engine: s.outsideEnd }),
        step("Traditional IRA", "usd", d.trad, { engine: s.tradEnd }),
        step("After-tax wealth", "usd", legacy, {
          formula: "Roth + outside account + Traditional IRA − heirs' tax",
          work: `${$(d.roth)} + ${$(d.outside)} + ${$(d.trad)} − ${$(heirsPv)}`,
          engine: s.legacy,
          strong: true,
        }),
        step("In today's dollars", "usd", legacy / deflator, {
          formula: "after-tax wealth ÷ (1 + inflation) ^ years in the plan",
          work: `${$(legacy)} ÷ (1 + ${P(i.inflation)}) ^ ${d.yearsToEnd}`,
          engine: s.legacyReal,
        }),
        step("Compared with no conversions", "usd", legacy - none.legacy, {
          formula: "this strategy's after-tax wealth − the no-conversion strategy's",
          work: `${$(legacy)} − ${$(none.legacy)}`,
        }),
      ],
    },
    {
      id: "totals",
      title: "Lifetime totals",
      explain: "Sums of every year in this strategy, in the dollars of each year (the planner's “today's dollars” view divides each year's amount by that year's growth factor first).",
      steps: [
        step("Total converted to the Roth", "usd", sum((x) => x.conversion), { engine: s.totals.converted }),
        step("Total required distributions", "usd", sum((x) => x.rmd), { engine: s.totals.rmds }),
        step("Federal income tax", "usd", fed, { engine: s.totals.federalTax }),
        step("State income tax", "usd", st, { engine: s.totals.stateTax }),
        step("NIIT", "usd", niit, { engine: s.totals.niit }),
        step("Medicare IRMAA", "usd", irmaa, { engine: s.totals.irmaa }),
        step("ACA credit lost", "usd", aca, { engine: s.totals.acaSubsidyLost }),
        step("Early-withdrawal penalties", "usd", pen, { engine: s.totals.penalty }),
        ...(i.taxIncrease.enabled ? [step("  of the federal tax: what-if rate increase", "usd", sum((x) => x.taxIncrease), { engine: s.totals.taxIncrease })] : []),
        ...(s.totals.qbiDeduction > 0 ? [step("QBI deductions taken (reduce taxable income)", "usd", sum((x) => x.qbiDeduction), { engine: s.totals.qbiDeduction })] : []),
        step("Your lifetime taxes and costs", "usd", owner, { formula: "federal + state + NIIT + IRMAA + ACA credit lost + penalties", engine: s.ownerCost, strong: true }),
        step("Including your heirs' tax", "usd", owner + heirsPv, { formula: "your lifetime total + heirs' tax", work: `${$(owner)} + ${$(heirsPv)}`, strong: true }),
      ],
    },
  ];
}

/** Key values for every year of a strategy, to show how the numbers move over time. */
export function overTimeTable(d: PlanDetail): Table {
  const status = d.years[0]?.inputs.filingStatus ?? "single";
  return {
    head: [
      "Age", "Year", "Indexing factor", "Top of 12% bracket", "Top of 22% bracket", "Total deductions", "RMD divisor", "RMD", "Conversion",
      "Provisional income", "Taxable Social Security", "AGI", "Taxable income", "Bracket", "Federal tax", "IRMAA tier", "IRMAA", "Traditional IRA (end)", "Roth IRA (end)",
      "Outside account (end)",
    ],
    rows: d.years.map((p, n) => {
      const row = d.rows[n];
      const due = p.yd.age >= rmdStartAge(p.inputs.birthYear) && p.pre.trad > 0;
      return [
        String(p.yd.age), String(p.yd.year), X(p.yd.factor), $(bracketTop(0.12, status, p.yd.factor)), $(bracketTop(0.22, status, p.yd.factor)),
        $(p.f.deduction), due ? String(uniformDistributionPeriod(p.yd.age)) : "", $(p.rmd), $(p.conv), $(p.f.provisionalIncome), $(p.f.taxableSS), $(p.f.agi),
        $(p.f.taxableIncome), P(p.f.marginal, 0), $(p.f.tax), p.yd.medicare > 0 ? String(irmaaTier(p.lagMagi, status, p.yd.factor)) : "", $(p.irmaa), $(row.tradEnd), $(row.rothEnd),
        $(row.outsideEnd),
      ];
    }),
  };
}

/** The 2026 statutory figures, with the selected year's indexed values next to them. */
export function lawTables(i: PlannerInputs, year: number): { id: string; title: string; note?: string; table: Table }[] {
  const status = i.filingStatus;
  const factor = Math.pow(1 + i.inflation, Math.max(0, year - BASE_YEAR));
  const b = ORDINARY_BRACKETS[status];
  const ult = Object.entries(UNIFORM_LIFETIME).map(([a, v]) => [a, String(v)]);
  const third = Math.ceil(ult.length / 3);
  const ultRows = Array.from({ length: third }, (_, n) => [...(ult[n] ?? ["", ""]), ...(ult[n + third] ?? ["", ""]), ...(ult[n + 2 * third] ?? ["", ""])]);
  const idx = (n: number) => [$(n), $(n * factor)];
  return [
    {
      id: "law-brackets",
      title: `Ordinary income brackets (${status === "mfj" ? "married filing jointly" : "single"})`,
      table: {
        head: ["Rate", "Starts at (2026)", `Starts at (${year})`],
        rows: b.map((x) => [P(x.rate, 0), ...idx(x.from)]),
      },
    },
    {
      id: "law-deductions",
      title: "Deductions and capital-gain thresholds",
      table: {
        head: ["Item", "2026", String(year)],
        rows: [
          ["Standard deduction", ...idx(STANDARD_DEDUCTION[status])],
          ["Extra deduction per person 65+", ...idx(ADDITIONAL_STANDARD_DEDUCTION_65[status])],
          ["Senior deduction per person 65+ (2025–2028)", $(SENIOR_DEDUCTION.amount), year <= SENIOR_DEDUCTION.lastYear ? $(SENIOR_DEDUCTION.amount) : "expired"],
          ["Senior deduction phase-out starts (AGI, not indexed)", $(SENIOR_DEDUCTION.threshold[status]), $(SENIOR_DEDUCTION.threshold[status])],
          ["0% gains rate up to (taxable income)", ...idx(LTCG_THRESHOLDS[status].zeroTo)],
          ["15% gains rate up to", ...idx(LTCG_THRESHOLDS[status].fifteenTo)],
          ["NIIT threshold (MAGI, not indexed)", $(NIIT.threshold[status]), $(NIIT.threshold[status])],
          ["Social Security base amounts (not indexed)", `${$(SS_BASE[status].first)} / ${$(SS_BASE[status].second)}`, `${$(SS_BASE[status].first)} / ${$(SS_BASE[status].second)}`],
        ],
      },
    },
    {
      id: "law-irmaa",
      title: "Medicare IRMAA",
      note: "Thresholds apply to MAGI from two years before the premium year. Surcharges are per person on Medicare.",
      table: {
        head: ["Tier", "MAGI above (2026)", `MAGI above (${year})`, "Monthly surcharge (2026)"],
        rows: IRMAA.thresholds[status].map((t, n) => [String(n + 1), ...idx(t), $(IRMAA.monthlySurcharge[n])]),
      },
    },
    {
      id: "law-aca",
      title: "ACA premium tax credit",
      note: `Poverty line: ${$(ACA.fplBase)} for one person plus ${$(ACA.fplPerAdditional)} per additional person (2025 guideline, used for 2026 coverage). No credit above 400% of it.`,
      table: {
        head: ["Income (× poverty line) from", "Applicable % starts at", "Rises to"],
        rows: ACA.bands.map(([from, a, c]) => [X(from, 2), P(a), P(c)]),
      },
    },
    {
      id: "law-rmd",
      title: "IRS Uniform Lifetime Table",
      note: "RMD = start-of-year balance ÷ the divisor for your age.",
      table: { head: ["Age", "Divisor", "Age", "Divisor", "Age", "Divisor"], rows: ultRows },
    },
  ];
}

export interface StrategyRow {
  id: string;
  name: string;
  peakBracket: number;
  ownerCost: number;
  heirsTax: number;
  legacy: number;
}

export function strategyRanking(out: PlannerOutput): StrategyRow[] {
  return out.scenarios
    .slice()
    .sort((a, b) => b.legacy - a.legacy)
    .map((s) => ({ id: s.id, name: s.name, peakBracket: s.peakBracket, ownerCost: s.ownerCost, heirsTax: s.heirsTax, legacy: s.legacy }));
}
