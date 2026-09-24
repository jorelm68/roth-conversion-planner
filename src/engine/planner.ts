import { buildBaseline, simulate, type Baseline, type SimState } from "./simulate";
import type { PlannerInputs, Plan, ScenarioResult, Target, TraceSection } from "./types";

export type Progress = (fraction: number, label: string) => void;

export interface PlannerOutput {
  scenarios: ScenarioResult[];
  /** Id of the scenario with the highest after-tax legacy (ties broken by lowest peak bracket). */
  recommendedId: string;
  warnings: string[];
}

export function validateInputs(i: PlannerInputs): string[] {
  const errors: string[] = [];
  if (!(i.currentAge >= 18 && i.currentAge <= 110)) errors.push("Current age must be between 18 and 110.");
  if (i.lifespan <= i.currentAge) errors.push("Estimated lifespan must be greater than your current age.");
  if (i.lifespan > 120) errors.push("Lifespan above 120 is not supported.");
  if (i.birthYear < 1900 || i.birthYear > 2010) errors.push("Enter a valid birth year.");
  if (i.birthYear + i.currentAge < 2026) errors.push("The plan must start in 2026 or later (tax data is for 2026).");
  if (i.conversionStartAge > i.lastConversionAge) errors.push("Conversion start age must not be after the last conversion age.");
  if (i.tradIraBalance < 0 || i.rothBalance < 0) errors.push("Balances cannot be negative.");
  if (i.investmentReturn < -0.5 || i.investmentReturn > 0.5) errors.push("Investment return looks unrealistic.");
  return errors;
}

const convWindow = (i: PlannerInputs, base: Baseline): number[] =>
  base.years.filter((y) => y.age >= i.conversionStartAge && y.age <= i.lastConversionAge).map((y) => y.k);

function uniformPlan(i: PlannerInputs, base: Baseline, target: Target, cap = 0.37): Plan {
  const targets: Target[] = [];
  for (const k of convWindow(i, base)) targets[k] = target;
  return { targets, cap };
}

const BRACKET_RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35];

function candidates(i: PlannerInputs, acaOn: boolean, cap: number): Target[] {
  const out: Target[] = [{ kind: "none" }];
  for (const rate of BRACKET_RATES) if (rate <= cap + 1e-9) out.push({ kind: "bracket", rate });
  out.push({ kind: "all" });
  for (let tier = 0; tier < 4; tier++) out.push({ kind: "irmaa", tier });
  if (acaOn) for (const ratio of [1.5, 2, 2.5, 3, 4]) out.push({ kind: "aca", ratio });
  return out;
}

/** Coordinate-ascent search over per-year conversion targets, maximizing after-tax legacy. */
export function optimizePlan(i: PlannerInputs, base: Baseline, cap: number, onStep?: () => void): Plan {
  const ks = convWindow(i, base);
  // Seed with the best uniform "fill bracket X" strategy (or no conversion).
  let best: Plan = { targets: [], cap };
  let bestLegacy = simulate(i, base, best).legacy;
  for (const rate of BRACKET_RATES) {
    if (rate > cap + 1e-9) continue;
    const p = uniformPlan(i, base, { kind: "bracket", rate }, cap);
    const l = simulate(i, base, p).legacy;
    if (l > bestLegacy) { best = p; bestLegacy = l; }
  }

  const snapshots: SimState[] = [];
  simulate(i, base, best, { snapshots });

  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (const k of ks) {
      const cands = candidates(i, base.years[k].acaOn, cap);
      let bestT: Target | undefined;
      for (const t of cands) {
        const targets = best.targets.slice();
        targets[k] = t;
        const l = simulate(i, base, { targets, cap }, { fromK: k, state: snapshots[k] }).legacy;
        if (l > bestLegacy + 1) { bestLegacy = l; bestT = t; }
      }
      if (bestT) {
        const targets = best.targets.slice();
        targets[k] = bestT;
        best = { targets, cap };
        simulate(i, base, best, { fromK: k, state: snapshots[k], snapshots });
        improved = true;
      }
      onStep?.();
    }
    if (!improved) break;
  }
  return best;
}

function toResult(i: PlannerInputs, base: Baseline, id: string, name: string, description: string, plan: Plan): ScenarioResult {
  const o = simulate(i, base, plan, { detail: true });
  const s = o.state;
  const last = base.years[base.years.length - 1];
  const totals = { federalTax: s.fed, stateTax: s.st, niit: s.niit, irmaa: s.irm, acaSubsidyLost: s.aca, penalty: s.pen, converted: s.conv, rmds: s.rmds };
  return {
    id, name, description, cap: plan.cap, totals,
    ownerCost: s.fed + s.st + s.niit + s.irm + s.aca + s.pen,
    peakBracket: s.peak,
    peakConversionBracket: s.peakConv,
    heirsTax: o.heirsTax,
    tradEnd: s.trad, rothEnd: s.roth, outsideEnd: s.outside,
    legacy: o.legacy,
    legacyReal: o.legacy / Math.pow(1 + i.inflation, last.k),
    inflationFactorAtEnd: Math.pow(1 + i.inflation, last.k),
    plan,
    rows: o.rows,
  };
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

export function runPlanner(inputs: PlannerInputs, onProgress?: Progress): PlannerOutput {
  const errors = validateInputs(inputs);
  if (errors.length) throw new Error(errors.join(" "));
  const base = buildBaseline(inputs);
  const warnings: string[] = [];
  const acaAny = base.years.some((y) => y.acaOn);
  const w = convWindow(inputs, base);
  if (w.length === 0) warnings.push("The conversion window does not overlap your plan years, so only the no-conversion scenario is meaningful.");

  const fixed: { id: string; name: string; description: string; plan: Plan }[] = [
    { id: "none", name: "No conversions", description: "Take only required minimum distributions (RMDs).", plan: { targets: [], cap: 0.37 } },
  ];
  for (const rate of [0.12, 0.22, 0.24, 0.32]) {
    fixed.push({
      id: `fill-${Math.round(rate * 100)}`,
      name: `Fill the ${pct(rate)} bracket`,
      description: `Each year in the window, convert until ordinary taxable income reaches the top of the ${pct(rate)} bracket.`,
      plan: uniformPlan(inputs, base, { kind: "bracket", rate }),
    });
  }
  fixed.push({
    id: "irmaa",
    name: "Stay under first IRMAA tier",
    description: "Convert each year only up to the first Medicare IRMAA income threshold (avoids surcharges).",
    plan: uniformPlan(inputs, base, { kind: "irmaa", tier: 0 }),
  });
  fixed.push({
    id: "even",
    name: "Spread evenly over the window",
    description: "Convert an equal share of the remaining Traditional IRA each year until the last conversion age.",
    plan: uniformPlan(inputs, base, { kind: "even" }),
  });
  fixed.push({
    id: "all-now",
    name: "Convert everything now",
    description: "Convert the whole Traditional IRA in the first year of the window.",
    plan: (() => {
      const p: Plan = { targets: [], cap: 0.37 };
      if (w.length) p.targets[w[0]] = { kind: "all" };
      return p;
    })(),
  });
  if (acaAny) {
    const targets: Target[] = [];
    for (const k of w) targets[k] = base.years[k].acaOn ? { kind: "aca", ratio: 4 } : { kind: "bracket", rate: 0.22 };
    fixed.push({
      id: "aca-cliff",
      name: "Stay under ACA cliff, then fill 22%",
      description: "Before Medicare keep income under 400% of the poverty line to keep ACA subsidies; after 65 fill the 22% bracket.",
      plan: { targets, cap: 0.37 },
    });
  }

  const caps = [0.12, 0.22, 0.24, 0.32, 0.37];
  const total = fixed.length + caps.length;
  let done = 0;
  const scenarios: ScenarioResult[] = [];
  for (const f of fixed) {
    scenarios.push(toResult(inputs, base, f.id, f.name, f.description, f.plan));
    onProgress?.(++done / total, f.name);
  }
  const optimized: ScenarioResult[] = [];
  for (const cap of caps) {
    const label = cap >= 0.37 ? "Optimized: maximum wealth" : `Optimized: never above ${pct(cap)} bracket`;
    onProgress?.(done / total, `Searching: ${label}`);
    const plan = optimizePlan(inputs, base, cap);
    optimized.push(
      toResult(inputs, base, `opt-${Math.round(cap * 100)}`, label,
        `Best year-by-year schedule found that never goes above the ${pct(cap)} bracket.`, plan),
    );
    onProgress?.(++done / total, label);
  }
  // The best optimized schedule is "maximum wealth"; drop capped variants that reproduce an existing result.
  const bestOpt = optimized.reduce((a, b) => (b.legacy > a.legacy + 1 || (Math.abs(b.legacy - a.legacy) <= 1 && b.peakBracket < a.peakBracket) ? b : a));
  bestOpt.id = "opt-max";
  bestOpt.name = "Optimized: maximum wealth";
  bestOpt.description = "Year-by-year search for the conversion schedule that maximizes after-tax wealth at the end of your lifespan (including the tax your heirs will owe).";
  scenarios.push(bestOpt);
  for (const o of optimized) {
    if (o === bestOpt) continue;
    if (scenarios.some((x) => Math.abs(x.legacy - o.legacy) <= 1)) continue;
    scenarios.push(o);
  }

  const recommended = scenarios.slice().sort((a, b) => b.legacy - a.legacy || a.peakBracket - b.peakBracket)[0];
  return { scenarios, recommendedId: recommended.id, warnings };
}

/**
 * Re-runs a scenario and returns the full, step-by-step calculation for one plan year
 * (`k` = years since the plan started; 0 is the current year). For review and testing.
 */
export function explainYear(inputs: PlannerInputs, plan: Plan, k: number): TraceSection[] {
  const base = buildBaseline(inputs);
  return simulate(inputs, base, plan, { traceK: k }).trace ?? [];
}
