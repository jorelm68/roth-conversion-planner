import { describe, expect, it } from "vitest";
import { acaSubsidy, applicablePercentage, irmaaSurcharge, povertyLine } from "../health";
import { heirsTaxPV } from "../heirs";
import { requiredMinimumDistribution, rmdStartAge } from "../rmd";
import { bracketTax, bracketTop, computeFederal, marginalRate, taxableSocialSecurity } from "../tax";

const base = { status: "single" as const, year: 2026, factor: 1, seniors: 0, interest: 0, preferential: 0, taxExempt: 0, ss: 0 };

describe("ordinary brackets (2026)", () => {
  it("taxes $50,000 single taxable income", () => {
    expect(bracketTax(50_000, "single", 1)).toBeCloseTo(1240 + (50_000 - 12_400) * 0.12, 6);
  });
  it("taxes MFJ across the 10/12/22 brackets", () => {
    expect(bracketTax(150_000, "mfj", 1)).toBeCloseTo(2480 + (100_800 - 24_800) * 0.12 + (150_000 - 100_800) * 0.22, 6);
  });
  it("scales with inflation indexing", () => {
    expect(bracketTax(50_000 * 1.1, "single", 1.1)).toBeCloseTo(bracketTax(50_000, "single", 1) * 1.1, 6);
  });
  it("finds marginal rate and bracket tops", () => {
    expect(marginalRate(60_000, "single", 1)).toBe(0.22);
    expect(bracketTop(0.24, "single", 1)).toBe(201_775);
    expect(bracketTop(0.37, "single", 1)).toBe(Infinity);
  });
});

describe("Social Security taxation", () => {
  it("is zero below the first base amount", () => {
    expect(taxableSocialSecurity(30_000, 5_000, 0, "single")).toBe(0);
  });
  it("uses the 50% tier between base amounts", () => {
    // provisional = 20,000 + 7,500 = 27,500 -> 50% of the 2,500 excess
    expect(taxableSocialSecurity(15_000, 20_000, 0, "single")).toBeCloseTo(1_250, 6);
  });
  it("uses the 85% tier and caps at 85% of benefits", () => {
    expect(taxableSocialSecurity(30_000, 40_000, 0, "single")).toBeCloseTo(22_350, 6);
    expect(taxableSocialSecurity(30_000, 200_000, 0, "single")).toBeCloseTo(25_500, 6);
  });
  it("counts tax-exempt interest as provisional income", () => {
    expect(taxableSocialSecurity(30_000, 10_000, 30_000, "single")).toBeGreaterThan(taxableSocialSecurity(30_000, 10_000, 0, "single"));
  });
  it("creates the torpedo: marginal federal rate exceeds the bracket rate while SS is being phased in", () => {
    const at = (ord: number) => computeFederal({ ...base, seniors: 1, ordinary: ord, ss: 30_000 });
    const d = (at(31_000).tax - at(30_000).tax) / 1000;
    expect(d).toBeCloseTo(0.12 * 1.85, 2); // 22.2% instead of 12%
  });
});

describe("computeFederal", () => {
  it("matches the bracket schedule for a simple filer", () => {
    const r = computeFederal({ ...base, ordinary: 66_100 });
    expect(r.taxableIncome).toBe(50_000);
    expect(r.tax).toBeCloseTo(5_752, 6);
  });
  it("applies the standard, 65+ and senior deductions", () => {
    const r = computeFederal({ ...base, seniors: 1, ordinary: 70_000 });
    expect(r.deduction).toBe(16_100 + 2_050 + 6_000);
  });
  it("phases out the senior deduction above $75,000 MAGI and ends it after 2028", () => {
    expect(computeFederal({ ...base, seniors: 1, ordinary: 95_000 }).deduction).toBeCloseTo(16_100 + 2_050 + 6_000 - 0.06 * 20_000, 6);
    expect(computeFederal({ ...base, year: 2029, seniors: 1, ordinary: 10_000 }).deduction).toBe(16_100 + 2_050);
  });
  it("stacks long-term gains on ordinary income (0% then 15%)", () => {
    const r = computeFederal({ ...base, ordinary: 16_100 + 40_000, preferential: 20_000 });
    // ordinary taxable 40,000 -> 0% gains up to 49,450 (9,450), rest 10,550 at 15%
    expect(r.tax).toBeCloseTo(bracketTax(40_000, "single", 1) + 10_550 * 0.15, 4);
  });
  it("charges NIIT on investment income over the MAGI threshold", () => {
    const r = computeFederal({ ...base, ordinary: 250_000, interest: 30_000 });
    expect(r.niit).toBeCloseTo(0.038 * 30_000, 6);
  });
});

describe("RMDs", () => {
  it("uses SECURE 2.0 start ages", () => {
    expect(rmdStartAge(1950)).toBe(72);
    expect(rmdStartAge(1955)).toBe(73);
    expect(rmdStartAge(1960)).toBe(75);
  });
  it("divides by the Uniform Lifetime Table", () => {
    expect(requiredMinimumDistribution(246_000, 75, 1960)).toBeCloseTo(10_000, 6);
    expect(requiredMinimumDistribution(246_000, 74, 1960)).toBe(0);
    expect(requiredMinimumDistribution(265_000, 73, 1955)).toBeCloseTo(10_000, 6);
  });
});

describe("Medicare IRMAA", () => {
  it("has no surcharge at or below the first threshold", () => {
    expect(irmaaSurcharge(109_000, "single", 1, 1)).toBe(0);
  });
  it("charges tier 1 one dollar over, per enrollee", () => {
    expect(irmaaSurcharge(109_001, "single", 1, 1)).toBeCloseTo((81.2 + 14.5) * 12, 6);
    expect(irmaaSurcharge(218_001, "mfj", 1, 2)).toBeCloseTo((81.2 + 14.5) * 12 * 2, 6);
  });
  it("charges nothing before anyone is on Medicare", () => {
    expect(irmaaSurcharge(900_000, "single", 1, 0)).toBe(0);
  });
});

describe("ACA subsidy", () => {
  it("interpolates applicable percentages", () => {
    expect(applicablePercentage(1.2)).toBeCloseTo(0.021, 6);
    expect(applicablePercentage(3.5)).toBeCloseTo(0.0996, 6);
    expect(applicablePercentage(1.75)).toBeCloseTo((0.0419 + 0.066) / 2, 6);
  });
  it("falls off the cliff above 400% FPL", () => {
    const fpl = povertyLine(1, 1);
    expect(acaSubsidy(4 * fpl, 1, 1, 9_600)).toBeGreaterThan(0);
    expect(acaSubsidy(4 * fpl + 1, 1, 1, 9_600)).toBe(0);
  });
});

describe("heirs", () => {
  it("has no tax on a zero balance and a positive tax below the balance otherwise", () => {
    const h = { count: 1, otherIncome: 100_000, stateTaxRate: 0 };
    expect(heirsTaxPV(0, 2060, 0.05, 0.025, h)).toBe(0);
    const t = heirsTaxPV(1_000_000, 2060, 0.05, 0.025, h);
    expect(t).toBeGreaterThan(100_000);
    expect(t).toBeLessThan(500_000);
  });
  it("is lower when split among more heirs", () => {
    const one = heirsTaxPV(1_000_000, 2060, 0.05, 0.025, { count: 1, otherIncome: 100_000, stateTaxRate: 0 });
    const three = heirsTaxPV(1_000_000, 2060, 0.05, 0.025, { count: 3, otherIncome: 100_000, stateTaxRate: 0 });
    expect(three).toBeLessThan(one);
  });
});
