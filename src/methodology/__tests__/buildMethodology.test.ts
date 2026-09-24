import { describe, expect, it } from "vitest";
import { defaultInputs, planDetail, runPlanner, type PlannerInputs } from "@/engine";
import { endBlocks, lawTables, overTimeTable, yearBlocks, type Block } from "../buildMethodology";

const base = (over: Partial<PlannerInputs> = {}): PlannerInputs => ({ ...defaultInputs(), birthYear: 1964, currentAge: 62, ...over });

const CASES: [string, PlannerInputs][] = [
  ["single, defaults", base()],
  [
    "married, ACA, pension, dividends, munis, interest, basis, prior MAGI",
    base({
      filingStatus: "mfj",
      birthYear: 1963,
      currentAge: 63,
      spouseBirthYear: 1966,
      conversionStartAge: 63,
      retirementAge: 63,
      tradIraBasis: 40_000,
      priorMagi1: 180_000,
      priorMagi2: 240_000,
      paymentMode: "limited",
      outsideBalance: 60_000,
      aca: { enabled: true, benchmarkPremium: 16_000, premiumGrowth: 0.04 },
      incomeStreams: [
        { id: "a", label: "Pension", kind: "ordinary", annualAmount: 30_000, startAge: 65, endAge: 95, inflationAdjusted: false },
        { id: "b", label: "Dividends", kind: "qualified", annualAmount: 60_000, startAge: 63, endAge: 95, inflationAdjusted: true },
        { id: "c", label: "Munis", kind: "taxExempt", annualAmount: 8_000, startAge: 63, endAge: 95, inflationAdjusted: true },
        { id: "d", label: "CD interest", kind: "interest", annualAmount: 50_000, startAge: 63, endAge: 95, inflationAdjusted: true },
      ],
    }),
  ],
  ["young, tax withheld from the IRA (penalty years)", base({ birthYear: 1976, currentAge: 50, conversionStartAge: 50, retirementAge: 50, paymentMode: "fromIra", wagesAnnual: 0 })],
];

/** Every step whose planner value is known must equal the value recomputed from the displayed formula. */
function checkBlocks(blocks: Block[], where: string): number {
  let n = 0;
  for (const b of blocks)
    for (const s of b.steps) {
      if (s.engine === undefined) continue;
      expect(typeof s.value, `${where} / ${b.title} / ${s.label}`).toBe("number");
      const v = s.value as number;
      const tol = 1e-6 * Math.max(1, Math.abs(s.engine));
      expect(Math.abs(v - s.engine), `${where} / ${b.title} / ${s.label}: formula gives ${v}, planner has ${s.engine}`).toBeLessThanOrEqual(tol);
      n++;
    }
  return n;
}

describe("How-it's-calculated page content", () => {
  for (const [name, inputs] of CASES) {
    it(`every formula reproduces the planner's numbers: ${name}`, () => {
      const out = runPlanner(inputs);
      const none = out.scenarios.find((s) => s.id === "none")!;
      let checked = 0;
      for (const s of out.scenarios) {
        const d = planDetail(inputs, s.plan);
        expect(d.rows).toEqual(s.rows);
        expect(d.years.length).toBe(s.rows.length);
        for (let k = 0; k < d.years.length; k++) checked += checkBlocks(yearBlocks(d.years[k], d.rows[k]), `${s.name} age ${d.years[k].yd.age}`);
        checked += checkBlocks(endBlocks(inputs, s, d, none), `${s.name} end`);
        const t = overTimeTable(d);
        expect(t.rows.length).toBe(s.rows.length);
        expect(t.rows.every((r) => r.length === t.head.length)).toBe(true);
      }
      expect(checked).toBeGreaterThan(5_000);
    });
  }

  it("covers the ACA and penalty rules when they apply", () => {
    const [, married] = CASES[1];
    const s = runPlanner(married).scenarios.find((x) => x.id === "all-now")!;
    const d = planDetail(married, s.plan);
    const ids = yearBlocks(d.years[0], d.rows[0]).map((b) => b.id);
    expect(ids).toContain("aca");
    expect(yearBlocks(d.years[5], d.rows[5]).map((b) => b.id)).not.toContain("aca");

    const [, young] = CASES[2];
    const y = runPlanner(young).scenarios.find((x) => x.id === "fill-22")!;
    const yd = planDetail(young, y.plan);
    const pen = yearBlocks(yd.years[0], yd.rows[0]).find((b) => b.id === "cost")!.steps.find((st) => st.label === "Early-withdrawal penalty")!;
    expect(pen.value as number).toBeGreaterThan(0);
  });

  it("builds the tax-law reference tables", () => {
    const t = lawTables(base(), 2035);
    expect(t.map((x) => x.id)).toEqual(["law-brackets", "law-deductions", "law-irmaa", "law-aca", "law-rmd"]);
    expect(t[0].table.rows[1]).toEqual(["12%", "$12,400", expect.stringMatching(/^\$/)]);
  });
});
