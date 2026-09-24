import { describe, expect, it } from "vitest";
import { defaultInputs, explainYear, runPlanner, type PlannerInputs, type TraceSection } from "../index";

const inputs = (over: Partial<PlannerInputs> = {}): PlannerInputs => ({ ...defaultInputs(), birthYear: 1964, currentAge: 62, ...over });

const find = (t: TraceSection[], key: string): number => {
  for (const s of t) for (const l of s.lines) if (l.key === key) return l.value as number;
  throw new Error(`no trace line with key ${key}`);
};
const sumKeys = (t: TraceSection[], prefix: string): number =>
  t.flatMap((s) => s.lines).filter((l) => l.key?.startsWith(prefix)).reduce((a, l) => a + (l.value as number), 0);

function checkAgainstRows(i: PlannerInputs) {
  const out = runPlanner(i);
  let checked = 0;
  for (const s of out.scenarios) {
    for (const r of s.rows) {
      const t = explainYear(i, s.plan, r.k);
      const tol = 1e-6;
      expect(find(t, "rmd")).toBeCloseTo(r.rmd, 4);
      expect(find(t, "conversion")).toBeCloseTo(r.conversion, 4);
      expect(find(t, "agi")).toBeCloseTo(r.agi, 4);
      expect(find(t, "taxableIncome")).toBeCloseTo(r.taxableIncome, 4);
      expect(find(t, "federalTax")).toBeCloseTo(r.federalTax, 4);
      expect(find(t, "stateTax")).toBeCloseTo(r.stateTax, 4);
      expect(find(t, "irmaa")).toBeCloseTo(r.irmaa, 4);
      expect(find(t, "totalCost")).toBeCloseTo(r.totalCost, 4);
      expect(find(t, "tradEnd")).toBeCloseTo(r.tradEnd, 4);
      expect(find(t, "rothEnd")).toBeCloseTo(r.rothEnd, 4);
      expect(find(t, "outsideEnd")).toBeCloseTo(r.outsideEnd, 4);
      // the bracket lines must add up to the ordinary tax, and ordinary + preferential to the federal tax
      expect(sumKeys(t, "bracket")).toBeCloseTo(find(t, "ordinaryTax"), 4);
      expect(find(t, "ordinaryTax") + find(t, "preferentialTax")).toBeCloseTo(find(t, "federalTax"), 4);
      // deduction pieces add up
      expect(find(t, "taxableIncome")).toBeCloseTo(Math.max(0, find(t, "agi") - find(t, "deduction")), 4);
      expect(Math.abs(find(t, "year") - r.year)).toBeLessThan(tol);
      checked++;
    }
  }
  return checked;
}

describe("year-by-year calculation trace", () => {
  it("reproduces every simulated year of every scenario (default inputs)", () => {
    expect(checkAgainstRows(inputs())).toBeGreaterThan(200);
  });

  it("matches with married filing jointly, other income, ACA and Social Security", () => {
    const i = inputs({
      filingStatus: "mfj",
      spouseBirthYear: 1966,
      birthYear: 1963,
      currentAge: 63,
      conversionStartAge: 63,
      retirementAge: 63,
      aca: { enabled: true, benchmarkPremium: 14_000, premiumGrowth: 0.04 },
      incomeStreams: [
        { id: "a", label: "Pension", kind: "ordinary", annualAmount: 25_000, startAge: 65, endAge: 95, inflationAdjusted: false },
        { id: "b", label: "Dividends", kind: "qualified", annualAmount: 8_000, startAge: 63, endAge: 95, inflationAdjusted: true },
        { id: "c", label: "Munis", kind: "taxExempt", annualAmount: 5_000, startAge: 63, endAge: 95, inflationAdjusted: true },
      ],
    });
    expect(checkAgainstRows(i)).toBeGreaterThan(200);
  });

  it("matches when taxes are withheld from the IRA (penalty years)", () => {
    const i = inputs({ birthYear: 1976, currentAge: 50, conversionStartAge: 50, retirementAge: 50, paymentMode: "fromIra" });
    expect(checkAgainstRows(i)).toBeGreaterThan(200);
  });

  it("includes the ACA section only while pre-Medicare and ACA is on", () => {
    const i = inputs({ birthYear: 1963, currentAge: 63, conversionStartAge: 63, aca: { enabled: true, benchmarkPremium: 12_000, premiumGrowth: 0.04 } });
    const s = runPlanner(i).scenarios[0];
    expect(explainYear(i, s.plan, 0).some((x) => x.title.includes("ACA"))).toBe(true);
    expect(explainYear(i, s.plan, 5).some((x) => x.title.includes("ACA"))).toBe(false);
  });

  it("explains the Social Security torpedo with provisional income", () => {
    const i = inputs({ socialSecurityStartAge: 62 });
    const s = runPlanner(i).scenarios.find((x) => x.id === "fill-22")!;
    const t = explainYear(i, s.plan, 3);
    expect(find(t, "provisionalIncome")).toBeGreaterThan(0);
    expect(find(t, "taxableSS")).toBeGreaterThan(0);
  });
});
