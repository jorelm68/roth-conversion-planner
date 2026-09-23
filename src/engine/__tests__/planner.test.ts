import { describe, expect, it } from "vitest";
import { defaultInputs, runPlanner, validateInputs, type PlannerInputs } from "../index";

const inputs = (over: Partial<PlannerInputs> = {}): PlannerInputs => ({
  ...defaultInputs(),
  birthYear: 1964,
  currentAge: 62,
  ...over,
});

describe("planner", () => {
  it("rejects invalid inputs", () => {
    expect(validateInputs(inputs({ lifespan: 50 })).length).toBeGreaterThan(0);
    expect(() => runPlanner(inputs({ lifespan: 50 }))).toThrow();
  });

  it("no-conversion scenario converts nothing and pays RMDs from 75 (born 1964)", () => {
    const out = runPlanner(inputs());
    const none = out.scenarios.find((s) => s.id === "none")!;
    expect(none.totals.converted).toBe(0);
    expect(none.rows.find((r) => r.age === 74)!.rmd).toBe(0);
    expect(none.rows.find((r) => r.age === 75)!.rmd).toBeGreaterThan(0);
  });

  it("optimized scenarios are at least as good as every fixed strategy and no-conversion", () => {
    const out = runPlanner(inputs());
    const opt = out.scenarios.find((s) => s.id === "opt-max")!;
    for (const s of out.scenarios) expect(opt.legacy).toBeGreaterThanOrEqual(s.legacy - 1);
    const rec = out.scenarios.find((s) => s.id === out.recommendedId)!;
    expect(rec.legacy).toBeGreaterThanOrEqual(opt.legacy - 1);
  });

  it("respects bracket caps", () => {
    const out = runPlanner(inputs());
    const capped = out.scenarios.filter((s) => s.id.startsWith("opt-") && s.cap < 0.37);
    expect(capped.length).toBeGreaterThan(0);
    for (const c of capped) {
      for (const r of c.rows) if (r.conversion > 0) expect(r.marginalBracket).toBeLessThanOrEqual(c.cap + 1e-9);
    }
  });

  it("conserves money: Traditional balance never goes negative and conversions never exceed it", () => {
    const out = runPlanner(inputs());
    for (const s of out.scenarios) for (const r of s.rows) {
      expect(r.tradEnd).toBeGreaterThanOrEqual(-1e-6);
      expect(r.conversion).toBeGreaterThanOrEqual(0);
    }
  });

  it("with zero taxes-of-consequence assumptions conversions help: Roth ends higher than no-conversion", () => {
    const out = runPlanner(inputs());
    const none = out.scenarios.find((s) => s.id === "none")!;
    const best = out.scenarios.find((s) => s.id === out.recommendedId)!;
    expect(best.rothEnd).toBeGreaterThan(none.rothEnd);
    expect(best.legacy).toBeGreaterThanOrEqual(none.legacy);
  });

  it("paying tax from the IRA before 59.5 triggers the penalty; paying from outside funds does not", () => {
    const young = { currentAge: 50, birthYear: 1976, conversionStartAge: 50, retirementAge: 50 };
    const fromIra = runPlanner(inputs({ ...young, paymentMode: "fromIra" })).scenarios.find((s) => s.id === "fill-22")!;
    const outside = runPlanner(inputs({ ...young, paymentMode: "unlimited" })).scenarios.find((s) => s.id === "fill-22")!;
    expect(fromIra.totals.penalty).toBeGreaterThan(0);
    expect(outside.totals.penalty).toBe(0);
    expect(fromIra.rothEnd).toBeLessThan(outside.rothEnd);
  });

  it("models IRMAA and ACA when applicable", () => {
    const out = runPlanner(inputs({ currentAge: 63, birthYear: 1963, conversionStartAge: 63, retirementAge: 63, aca: { enabled: true, benchmarkPremium: 12_000, premiumGrowth: 0.04 } }));
    const big = out.scenarios.find((s) => s.id === "all-now")!;
    expect(big.totals.acaSubsidyLost).toBeGreaterThan(0);
    expect(big.totals.irmaa).toBeGreaterThan(0);
    expect(out.scenarios.find((s) => s.id === "none")!.totals.acaSubsidyLost).toBe(0);
  });

  it("supports married filing jointly with a younger spouse", () => {
    const out = runPlanner(inputs({ filingStatus: "mfj", spouseBirthYear: 1968 }));
    expect(out.scenarios.length).toBeGreaterThan(5);
  });

  it("runs the full default search in a reasonable time", () => {
    const t = Date.now();
    runPlanner(inputs());
    const ms = Date.now() - t;
    console.log(`full planner run: ${ms} ms`);
    expect(ms).toBeLessThan(30_000);
  });
});
