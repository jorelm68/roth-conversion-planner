import type { PlannerInputs } from "./types";

/** Illustrative starting point only; every value is editable in the UI. */
export function defaultInputs(): PlannerInputs {
  const year = new Date().getFullYear();
  const birthYear = Math.max(1900, year - 62);
  return {
    birthYear,
    currentAge: 62,
    filingStatus: "single",
    spouseBirthYear: birthYear,
    tradIraBalance: 1_000_000,
    tradIraBasis: 0,
    rothBalance: 100_000,
    outsideBalance: 300_000,
    wagesAnnual: 0,
    retirementAge: 62,
    incomeStreams: [],
    socialSecurityAnnual: 36_000,
    socialSecurityStartAge: 67,
    stateTaxRate: 0.04,
    investmentReturn: 0.06,
    outsideReturn: 0.04,
    inflation: 0.025,
    outsideTaxDrag: 0.005,
    expenses: { enabled: false, monthly: 5_000 },
    taxIncrease: { enabled: false, startYear: 2029, mode: "relative", amount: 0.2, threshold: 400_000 },
    paymentMode: "unlimited",
    conversionStartAge: 62,
    lastConversionAge: 85,
    lifespan: 90,
    aca: { enabled: false, benchmarkPremium: 9_600, premiumGrowth: 0.04 },
    priorMagi1: null,
    priorMagi2: null,
    heirs: { count: 1, otherIncome: 100_000, stateTaxRate: 0.04 },
  };
}
