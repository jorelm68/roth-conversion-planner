import { describe, expect, it } from "vitest";
import { heirsTaxPV } from "../heirs";
import { defaultInputs, explainYear, runPlanner, type PlannerInputs } from "../index";
import { computeFederal, qbiDeduction, rateIncreaseTax, bracketTax } from "../tax";

const base = { status: "mfj" as const, year: 2026, factor: 1, seniors: 0, interest: 0, preferential: 0, taxExempt: 0, ss: 0 };
const inputs = (over: Partial<PlannerInputs> = {}): PlannerInputs => ({ ...defaultInputs(), birthYear: 1964, currentAge: 62, ...over });

/** A retiring partner: QBI retirement payments, $30k/month of spending, and savings that run out. */
const partner = (over: Partial<PlannerInputs> = {}): PlannerInputs =>
  inputs({
    filingStatus: "mfj",
    birthYear: 1961,
    currentAge: 65,
    spouseBirthYear: 1963,
    retirementAge: 65,
    conversionStartAge: 65,
    tradIraBalance: 3_000_000,
    rothBalance: 200_000,
    outsideBalance: 400_000,
    socialSecurityAnnual: 60_000,
    socialSecurityStartAge: 67,
    outsideReturn: 0.035,
    paymentMode: "limited",
    expenses: { enabled: true, monthly: 30_000 },
    taxIncrease: { enabled: true, startYear: 2029, mode: "relative", amount: 0.2, threshold: 400_000 },
    incomeStreams: [
      { id: "p", label: "Partner retirement payments", kind: "ordinary", annualAmount: 240_000, startAge: 65, endAge: 80, inflationAdjusted: false, qbi: true },
      { id: "d", label: "Dividends", kind: "qualified", annualAmount: 20_000, startAge: 65, endAge: 95, inflationAdjusted: true },
    ],
    ...over,
  });

describe("QBI deduction (§199A)", () => {
  it("is 20% of QBI below the threshold", () => {
    const r = computeFederal({ ...base, ordinary: 300_000, qbi: 200_000 });
    expect(r.qbiDeduction).toBeCloseTo(40_000, 6);
    expect(r.taxableIncome).toBeCloseTo(300_000 - 32_200 - 40_000, 6);
    expect(r.agi).toBe(300_000); // below the line: AGI and MAGI are unchanged
  });
  it("is capped at 20% of taxable income less capital gains", () => {
    const q = qbiDeduction(100_000, 60_000, 10_000, "mfj", 1);
    expect(q.deduction).toBeCloseTo(0.2 * 50_000, 6);
  });
  it("phases out in a straight line over $150,000 (MFJ) above $403,500", () => {
    expect(qbiDeduction(200_000, 403_500, 0, "mfj", 1).deduction).toBeCloseTo(40_000, 6);
    expect(qbiDeduction(200_000, 403_500 + 75_000, 0, "mfj", 1).deduction).toBeCloseTo(20_000, 6);
    expect(qbiDeduction(200_000, 403_500 + 150_000, 0, "mfj", 1).deduction).toBe(0);
    expect(qbiDeduction(100_000, 201_750 + 37_500, 0, "single", 1).share).toBeCloseTo(0.5, 9);
  });
  it("only counts ordinary income entries marked as QBI", () => {
    const i = partner({ expenses: { enabled: false, monthly: 0 }, taxIncrease: { ...partner().taxIncrease, enabled: false } });
    const none = runPlanner(i).scenarios.find((s) => s.id === "none")!;
    expect(none.rows[0].qbiDeduction).toBeGreaterThan(0);
    const off = runPlanner({ ...i, incomeStreams: i.incomeStreams.map((s) => ({ ...s, qbi: false })) }).scenarios.find((s) => s.id === "none")!;
    expect(off.totals.qbiDeduction).toBe(0);
    expect(off.totals.federalTax).toBeGreaterThan(none.totals.federalTax);
  });
  it("large conversions push the deduction into its phase-out", () => {
    const i = partner({ expenses: { enabled: false, monthly: 0 } });
    const out = runPlanner(i);
    const none = out.scenarios.find((s) => s.id === "none")!;
    const all = out.scenarios.find((s) => s.id === "all-now")!;
    expect(all.rows[0].qbiDeduction).toBeLessThan(none.rows[0].qbiDeduction);
    expect(all.rows[0].qbiDeduction).toBe(0);
  });
});

describe("what-if tax-rate increase", () => {
  const hike = { threshold: 400_000, mode: "relative" as const, amount: 0.2 };
  it("adds the increase only on ordinary taxable income above the threshold", () => {
    expect(rateIncreaseTax(399_000, "mfj", 1, hike)).toBe(0);
    // 400,000–403,550 is in the 24% bracket, 403,550–450,000 in the 32% bracket
    expect(rateIncreaseTax(450_000, "mfj", 1, hike)).toBeCloseTo(3_550 * 0.24 * 0.2 + 46_450 * 0.32 * 0.2, 6);
    expect(rateIncreaseTax(450_000, "mfj", 1, { ...hike, mode: "points", amount: 0.05 })).toBeCloseTo(50_000 * 0.05, 6);
    expect(rateIncreaseTax(100_000, "mfj", 1, { ...hike, threshold: 0 })).toBeCloseTo(bracketTax(100_000, "mfj", 1) * 0.2, 6);
  });
  it("applies from the start year onward, including to heirs", () => {
    const off = inputs({ tradIraBalance: 3_000_000 });
    const on = { ...off, taxIncrease: { enabled: true, startYear: 2030, mode: "relative" as const, amount: 0.2, threshold: 0 } };
    const a = runPlanner(off).scenarios.find((s) => s.id === "none")!;
    const b = runPlanner(on).scenarios.find((s) => s.id === "none")!;
    expect(b.rows.find((r) => r.year === 2029)!.federalTax).toBeCloseTo(a.rows.find((r) => r.year === 2029)!.federalTax, 6);
    expect(b.totals.taxIncrease).toBeGreaterThan(0);
    expect(b.heirsTax).toBeGreaterThan(a.heirsTax);
    const h = heirsTaxPV(1_000_000, 2060, 0.05, 0.025, { count: 1, otherIncome: 100_000, stateTaxRate: 0 }, () => ({ threshold: 0, mode: "relative", amount: 0.2 }));
    expect(h).toBeGreaterThan(heirsTaxPV(1_000_000, 2060, 0.05, 0.025, { count: 1, otherIncome: 100_000, stateTaxRate: 0 }));
  });
  it("makes converting before the increase more valuable", () => {
    const off = partner({ expenses: { enabled: false, monthly: 0 }, taxIncrease: { ...partner().taxIncrease, enabled: false } });
    const on = { ...off, taxIncrease: { enabled: true, startYear: 2029, mode: "relative" as const, amount: 0.3, threshold: 0 } };
    const gain = (i: PlannerInputs) => {
      const o = runPlanner(i);
      return o.scenarios.find((s) => s.id === "opt-max")!.legacy - o.scenarios.find((s) => s.id === "none")!.legacy;
    };
    expect(gain(on)).toBeGreaterThan(gain(off));
  });
});

describe("outside-account return", () => {
  it("grows a positive outside balance at its own return less tax drag", () => {
    const i = inputs({ outsideReturn: 0.03, outsideTaxDrag: 0.005 });
    const r = runPlanner(i).scenarios.find((s) => s.id === "none")!.rows[0];
    expect(r.outsideEnd).toBeCloseTo(300_000 * 1.025, 6);
    expect(r.outsideGrowth).toBeCloseTo(300_000 * 0.025, 6);
  });
});

describe("living expenses", () => {
  const identity = (i: PlannerInputs) => {
    const out = runPlanner(i);
    let n = 0;
    for (const s of out.scenarios)
      for (const r of s.rows) {
        // start + income + RMD + IRA money for spending − expenses − taxes paid in cash = balance before growth
        const before = r.outsideStart + r.cashIncome + r.rmd + r.spendFromTrad + r.spendFromRoth - r.expenses - (r.totalCost - r.withheld);
        expect(before).toBeCloseTo(r.outsideEnd - r.outsideGrowth, 2);
        expect(r.tradEnd).toBeGreaterThanOrEqual(-1e-6);
        expect(r.rothEnd).toBeGreaterThanOrEqual(-1e-6);
        n++;
      }
    return out;
  };

  it("grows expenses with inflation and pays them from the outside account", () => {
    const i = inputs({ expenses: { enabled: true, monthly: 4_000 } });
    const none = runPlanner(i).scenarios.find((s) => s.id === "none")!;
    expect(none.rows[0].expenses).toBeCloseTo(48_000, 6);
    expect(none.rows[4].expenses).toBeCloseTo(48_000 * 1.025 ** 4, 6);
    expect(none.rows[0].outsideEnd).toBeLessThan(i.outsideBalance);
    identity(i);
  });

  it("balances every year's cash flow in every payment mode", () => {
    for (const paymentMode of ["unlimited", "limited", "fromIra"] as const) identity(partner({ paymentMode }));
  });

  it("draws on the Traditional IRA, then the Roth, once the outside account runs out (limited mode)", () => {
    const out = identity(partner());
    const none = out.scenarios.find((s) => s.id === "none")!;
    const firstDraw = none.rows.find((r) => r.spendFromTrad > 0)!;
    expect(firstDraw).toBeDefined();
    expect(firstDraw.outsideEnd).toBeGreaterThanOrEqual(-1);
    // spending withdrawals are taxable income
    expect(firstDraw.agi).toBeGreaterThan(firstDraw.wagesAndOther + firstDraw.rmd);
    for (const r of none.rows) if (r.spendFromRoth > 0) expect(r.tradEnd).toBeLessThan(1);
  });

  it("lets the balance go negative in unlimited mode and warns about it", () => {
    const out = runPlanner(partner({ paymentMode: "unlimited" }));
    const none = out.scenarios.find((s) => s.id === "none")!;
    expect(none.totals.spendFromTrad).toBe(0);
    expect(Math.min(...none.rows.map((r) => r.outsideEnd))).toBeLessThan(0);
    const rec = out.scenarios.find((s) => s.id === out.recommendedId)!;
    if (rec.outsideNegativeAge !== null) expect(out.warnings.some((w) => w.includes("runs out"))).toBe(true);
  });

  it("reports unfunded spending when every account is empty", () => {
    const out = runPlanner(inputs({ tradIraBalance: 200_000, rothBalance: 0, outsideBalance: 50_000, paymentMode: "limited", expenses: { enabled: true, monthly: 8_000 } }));
    const none = out.scenarios.find((s) => s.id === "none")!;
    const broke = none.rows.find((r) => r.unfunded > 0)!;
    expect(broke).toBeDefined();
    expect(broke.tradEnd).toBeLessThan(1);
    expect(out.warnings.some((w) => w.includes("every account is empty"))).toBe(true);
  });

  it("explains the cash flow in the year-by-year trace", () => {
    const i = partner();
    const s = runPlanner(i).scenarios.find((x) => x.id === "none")!;
    const k = s.rows.findIndex((r) => r.spendFromTrad > 0);
    const t = explainYear(i, s.plan, k);
    const sec = t.find((x) => x.title.startsWith("11b"))!;
    expect(sec.lines.find((l) => l.key === "spendW")!.value as number).toBeCloseTo(s.rows[k].spendFromTrad, 2);
  });
});
