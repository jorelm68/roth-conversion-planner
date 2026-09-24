import { acaSubsidy, irmaaSurcharge, irmaaThreshold, povertyLine } from "./health";
import { heirsTaxPV } from "./heirs";
import { requiredMinimumDistribution } from "./rmd";
import { bracketTop, computeFederal, inflationFactor, type FederalResult } from "./tax";
import { EARLY_WITHDRAWAL_PENALTY, MEDICARE_AGE, PENALTY_FREE_AGE } from "./taxData";
import { buildYearTrace, type TraceParams } from "./trace";
import type { PlannerInputs, Plan, Target, TraceSection, YearRow } from "./types";

/** Scenario-independent facts about each year. */
export interface YearData {
  k: number;
  year: number;
  age: number;
  /** Tax-law indexing factor relative to 2026. */
  factor: number;
  /** Growth factor for inputs stated in today's dollars. */
  real: number;
  seniors: number;
  medicare: number;
  acaOn: boolean;
  householdSize: number;
  benchmark: number;
  ordinary: number;
  interest: number;
  preferential: number;
  taxExempt: number;
  ss: number;
}

export interface Baseline {
  years: YearData[];
  /** Cost and MAGI if there were no IRA distributions at all (the reference for "extra" costs). */
  cost: number[];
  acaSubsidy: number[];
  prior1: number;
  prior2: number;
}

export interface SimState {
  trad: number;
  basis: number;
  roth: number;
  outside: number;
  m1: number;
  m2: number;
  fed: number;
  st: number;
  niit: number;
  irm: number;
  aca: number;
  pen: number;
  conv: number;
  rmds: number;
  peak: number;
  peakConv: number;
}

export interface SimOptions {
  detail?: boolean;
  fromK?: number;
  state?: SimState;
  /** If given, receives a copy of the state at the start of each year (used by the optimizer). */
  snapshots?: SimState[];
  /** If set, the outcome includes a full calculation trace for this year index. */
  traceK?: number;
  /** If given, receives every year's intermediate values (index = year of the plan). */
  collect?: TraceParams[];
}

export interface SimOutcome {
  state: SimState;
  heirsTax: number;
  legacy: number;
  rows: YearRow[];
  trace?: TraceSection[];
}

export const cloneState = (s: SimState): SimState => ({ ...s });

export function initialState(inputs: PlannerInputs, base: Baseline): SimState {
  return {
    trad: inputs.tradIraBalance,
    basis: Math.min(inputs.tradIraBasis, inputs.tradIraBalance),
    roth: inputs.rothBalance,
    outside: inputs.outsideBalance,
    m1: base.prior1,
    m2: base.prior2,
    fed: 0, st: 0, niit: 0, irm: 0, aca: 0, pen: 0, conv: 0, rmds: 0, peak: 0, peakConv: 0,
  };
}

export function buildYears(inputs: PlannerInputs): YearData[] {
  const startYear = inputs.birthYear + inputs.currentAge;
  const mfj = inputs.filingStatus === "mfj";
  const years: YearData[] = [];
  for (let k = 0; inputs.currentAge + k <= inputs.lifespan; k++) {
    const age = inputs.currentAge + k;
    const year = startYear + k;
    const real = Math.pow(1 + inputs.inflation, k);
    const spouseAge = mfj ? year - inputs.spouseBirthYear : -1;
    let ordinary = age < inputs.retirementAge ? inputs.wagesAnnual * real : 0;
    let interest = 0;
    let preferential = 0;
    let taxExempt = 0;
    for (const s of inputs.incomeStreams) {
      if (age < s.startAge || age > s.endAge) continue;
      const amt = s.annualAmount * (s.inflationAdjusted ? real : 1);
      if (s.kind === "ordinary") ordinary += amt;
      else if (s.kind === "interest") { ordinary += amt; interest += amt; }
      else if (s.kind === "qualified") preferential += amt;
      else taxExempt += amt;
    }
    const ss = age >= inputs.socialSecurityStartAge ? inputs.socialSecurityAnnual * real : 0;
    years.push({
      k, year, age,
      factor: inflationFactor(year, inputs.inflation),
      real,
      seniors: (age >= 65 ? 1 : 0) + (mfj && spouseAge >= 65 ? 1 : 0),
      medicare: (age >= MEDICARE_AGE ? 1 : 0) + (mfj && spouseAge >= MEDICARE_AGE ? 1 : 0),
      acaOn: inputs.aca.enabled && age < MEDICARE_AGE,
      householdSize: mfj ? 2 : 1,
      benchmark: inputs.aca.benchmarkPremium * Math.pow(1 + inputs.aca.premiumGrowth, k),
      ordinary, interest, preferential, taxExempt, ss,
    });
  }
  return years;
}

const stateTax = (inputs: PlannerInputs, f: FederalResult) => inputs.stateTaxRate * Math.max(0, f.agi - f.taxableSS);

export function buildBaseline(inputs: PlannerInputs): Baseline {
  const years = buildYears(inputs);
  const fedFor = (y: YearData) =>
    computeFederal({
      status: inputs.filingStatus, year: y.year, factor: y.factor, seniors: y.seniors,
      ordinary: y.ordinary, interest: y.interest, preferential: y.preferential, taxExempt: y.taxExempt, ss: y.ss,
    });
  const feds = years.map(fedFor);
  const first = feds[0]?.magi ?? 0;
  const prior1 = inputs.priorMagi1 ?? first;
  const prior2 = inputs.priorMagi2 ?? first;
  const cost: number[] = [];
  const subsidy: number[] = [];
  years.forEach((y, k) => {
    const f = feds[k];
    const lag = k >= 2 ? feds[k - 2].magi : k === 0 ? prior2 : prior1;
    const irm = irmaaSurcharge(lag, inputs.filingStatus, y.factor, y.medicare);
    cost.push(f.tax + f.niit + stateTax(inputs, f) + irm);
    subsidy.push(y.acaOn ? acaSubsidy(f.acaMagi, y.householdSize, y.factor, y.benchmark) : 0);
  });
  return { years, cost, acaSubsidy: subsidy, prior1, prior2 };
}

/** Largest x in [0, hi] with metric(x) <= limit, assuming metric is non-decreasing. */
function solveMax(metric: (c: number) => number, limit: number, hi: number): number {
  if (hi <= 0) return 0;
  if (metric(0) > limit) return 0;
  if (metric(hi) <= limit) return hi;
  let lo = 0;
  let up = hi;
  for (let i = 0; i < 30 && up - lo > 0.5; i++) {
    const mid = (lo + up) / 2;
    if (metric(mid) <= limit) lo = mid;
    else up = mid;
  }
  return lo;
}

interface Resolve {
  inputs: PlannerInputs;
  yd: YearData;
  fraction: number;
  ordBase: number;
  maxC: number;
  fed: (c: number) => FederalResult;
  windowYearsLeft: number;
}

function resolveConversion(target: Target, cap: number, r: Resolve): number {
  const { inputs, yd, maxC, fed, fraction } = r;
  if (target.kind === "none" || maxC <= 1) return 0;
  const ordMetric = (c: number) => fed(c).ordinaryTaxable;

  let c: number;
  switch (target.kind) {
    case "all":
      c = maxC;
      break;
    case "even":
      c = maxC / Math.max(1, r.windowYearsLeft);
      break;
    case "amount":
      c = Math.min(maxC, target.value);
      break;
    case "bracket": {
      const rate = Math.min(target.rate, cap);
      const top = bracketTop(rate, inputs.filingStatus, yd.factor);
      c = Number.isFinite(top) ? solveMax(ordMetric, top, maxC) : maxC;
      break;
    }
    case "irmaa": {
      const limit = irmaaThreshold(target.tier, inputs.filingStatus, inflationFactor(yd.year + 2, inputs.inflation));
      c = solveMax((x) => fed(x).magi, limit, maxC);
      break;
    }
    case "aca": {
      if (!yd.acaOn) return 0;
      c = solveMax((x) => fed(x).acaMagi, target.ratio * povertyLine(yd.householdSize, yd.factor), maxC);
      break;
    }
  }
  if (cap < 0.37 - 1e-9 && target.kind !== "bracket") {
    const top = bracketTop(cap, inputs.filingStatus, yd.factor);
    if (Number.isFinite(top)) c = Math.min(c, solveMax(ordMetric, top, maxC));
  }
  void fraction;
  return Math.max(0, c);
}

/** Advance one year, mutating `s`. Returns a detail row when requested. */
function stepYear(
  s: SimState, yd: YearData, target: Target, cap: number, inputs: PlannerInputs, base: Baseline, detail: boolean,
  sink?: { params?: TraceParams },
): YearRow | null {
  const { age, k } = yd;
  const status = inputs.filingStatus;
  const pre = sink ? { trad: s.trad, basis: s.basis, roth: s.roth, outside: s.outside } : null;
  const fraction = s.trad > 0 ? Math.min(1, Math.max(0, 1 - s.basis / s.trad)) : 0;
  const rmd = requiredMinimumDistribution(s.trad, age, inputs.birthYear);
  const ordBase = yd.ordinary + rmd * fraction;
  const maxC = Math.max(0, s.trad - rmd);

  const fedAt = (c: number) =>
    computeFederal({
      status, year: yd.year, factor: yd.factor, seniors: yd.seniors,
      ordinary: ordBase + c * fraction, interest: yd.interest, preferential: yd.preferential,
      taxExempt: yd.taxExempt, ss: yd.ss,
    });

  const inWindow = age >= inputs.conversionStartAge && age <= inputs.lastConversionAge;
  const conv = inWindow
    ? resolveConversion(target, cap, {
        inputs, yd, fraction, ordBase, maxC, fed: fedAt,
        windowYearsLeft: inputs.lastConversionAge - age + 1,
      })
    : 0;

  const f = fedAt(conv);
  const st = stateTax(inputs, f);
  const irm = irmaaSurcharge(s.m2, status, yd.factor, yd.medicare);
  const subsidy = yd.acaOn ? acaSubsidy(f.acaMagi, yd.householdSize, yd.factor, yd.benchmark) : 0;
  const acaLost = yd.acaOn ? Math.max(0, base.acaSubsidy[k] - subsidy) : 0;
  const extra = f.tax + st + f.niit + irm + acaLost - base.cost[k];

  // Funding the extra cost of IRA distributions.
  const mode = inputs.paymentMode;
  const avail = mode === "unlimited" ? Infinity : mode === "limited" ? Math.max(0, s.outside) + rmd : rmd;
  const fromOutside = extra > 0 ? Math.min(extra, avail) : extra;
  const shortfall = Math.max(0, extra - fromOutside);
  const pen = age < PENALTY_FREE_AGE ? EARLY_WITHDRAWAL_PENALTY : 0;
  const drawn = Math.min(conv, shortfall * (1 + pen));
  const withheldTax = drawn / (1 + pen);
  const penalty = pen * withheldTax;
  const uncovered = Math.max(0, shortfall - withheldTax);

  const r = inputs.investmentReturn;
  const outsideNow = s.outside + rmd - fromOutside - uncovered;
  const totalCost = f.tax + st + f.niit + irm + acaLost + penalty;

  let row: YearRow | null = null;
  const tradNew = (s.trad - rmd - conv) * (1 + r);
  const rothNew = (s.roth + conv - drawn) * (1 + r);
  const outsideNew = outsideNow * (1 + (outsideNow > 0 ? r - inputs.outsideTaxDrag : r));

  if (detail) {
    const bump = 1000;
    const f2 = computeFederal({
      status, year: yd.year, factor: yd.factor, seniors: yd.seniors,
      ordinary: ordBase + conv * fraction + bump, interest: yd.interest, preferential: yd.preferential,
      taxExempt: yd.taxExempt, ss: yd.ss,
    });
    const marginalAllIn = (f2.tax + f2.niit - f.tax - f.niit + inputs.stateTaxRate * ((f2.agi - f2.taxableSS) - (f.agi - f.taxableSS))) / bump;
    row = {
      k, year: yd.year, age, rmd, conversion: conv, taxableConversion: conv * fraction,
      wagesAndOther: yd.ordinary + yd.preferential + yd.taxExempt, socialSecurity: yd.ss,
      taxableSocialSecurity: f.taxableSS, agi: f.agi, magi: f.magi, taxableIncome: f.taxableIncome,
      marginalBracket: f.marginal, marginalAllIn,
      federalTax: f.tax, stateTax: st, niit: f.niit, irmaa: irm, acaSubsidyLost: acaLost, penalty, totalCost,
      tradEnd: tradNew, rothEnd: rothNew, outsideEnd: outsideNew, withheld: drawn,
    };
  }

  if (sink && pre && row) {
    sink.params = {
      inputs, yd, pre, target, cap, inWindow, windowYearsLeft: inputs.lastConversionAge - age + 1,
      fraction, rmd, maxC, conv, f, stateTax: st, irmaa: irm, lagMagi: s.m2,
      subsidy, subsidyBase: base.acaSubsidy[k], acaLost, baseCost: base.cost[k], extra,
      fromOutside, shortfall, drawn, withheldTax, penalty, uncovered, outsideNow,
      post: { trad: tradNew, roth: rothNew, outside: outsideNew },
      outsideGrowth: outsideNow > 0 ? r - inputs.outsideTaxDrag : r,
      totalCost, marginalAllIn: row.marginalAllIn,
    };
  }

  s.basis = Math.max(0, s.basis - (rmd + conv) * (1 - fraction));
  s.trad = tradNew;
  s.roth = rothNew;
  s.outside = outsideNew;
  s.m2 = s.m1;
  s.m1 = f.magi;
  s.fed += f.tax; s.st += st; s.niit += f.niit; s.irm += irm; s.aca += acaLost; s.pen += penalty;
  s.conv += conv; s.rmds += rmd;
  s.peak = Math.max(s.peak, f.marginal);
  if (conv > 1) s.peakConv = Math.max(s.peakConv, f.marginal);
  return row;
}

export function simulate(inputs: PlannerInputs, base: Baseline, plan: Plan, opts: SimOptions = {}): SimOutcome {
  const s = opts.state ? cloneState(opts.state) : initialState(inputs, base);
  const rows: YearRow[] = [];
  let trace: TraceSection[] | undefined;
  const none: Target = { kind: "none" };
  for (let k = opts.fromK ?? 0; k < base.years.length; k++) {
    if (opts.snapshots) opts.snapshots[k] = cloneState(s);
    const tracing = opts.traceK === k;
    const sink = tracing || opts.collect ? {} as { params?: TraceParams } : undefined;
    const row = stepYear(s, base.years[k], plan.targets[k] ?? none, plan.cap, inputs, base, !!opts.detail || !!sink, sink);
    if (row) rows.push(row);
    if (sink?.params) {
      if (tracing) trace = buildYearTrace(sink.params);
      if (opts.collect) opts.collect[k] = sink.params;
    }
  }
  const last = base.years[base.years.length - 1];
  const heirsTax = heirsTaxPV(s.trad, last.year, inputs.investmentReturn, inputs.inflation, inputs.heirs);
  return { state: s, heirsTax, legacy: s.roth + s.outside + s.trad - heirsTax, rows, trace };
}
