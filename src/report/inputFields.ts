import type { FilingStatus, IncomeKind, PlannerInputs, TaxIncreaseMode, TaxPaymentMode } from "@/engine";

/**
 * Single source of truth for the "Inputs" sheet of the Excel report. The writer and the importer both use
 * this list, so a settings file exported today can always be read back. Keep `key`s stable: they are
 * written into the workbook and old files depend on them. Labels are also matched (for reports exported
 * before the Field ID column existed), so avoid renaming them too.
 */
export type FieldKind = "year" | "age" | "count" | "usd" | "usdOrBlank" | "pct" | "filing" | "payment" | "yesno" | "hikeMode";
export type FieldValue = number | boolean | null | FilingStatus | TaxPaymentMode | TaxIncreaseMode;

export interface InputField {
  key: string;
  label: string;
  kind: FieldKind;
  note: string;
  get: (i: PlannerInputs) => FieldValue;
  set: (i: PlannerInputs, v: FieldValue) => void;
  /**
   * For settings added after the first reports were exported: the value to use when a file does not contain the
   * setting, chosen so an older report is recalculated the way it was originally (given the other imported values).
   */
  legacy?: (i: PlannerInputs) => FieldValue;
}

export const FILING_LABELS: Record<FilingStatus, string> = { single: "Single", mfj: "Married filing jointly" };

// No commas: these double as Excel drop-down lists, which are comma-separated.
export const PAYMENT_LABELS: Record<TaxPaymentMode, string> = {
  unlimited: "Other savings (unlimited)",
  limited: "Outside account then IRA",
  fromIra: "From the IRA (no outside funds)",
};

export const KIND_LABELS: Record<IncomeKind, string> = {
  ordinary: "Ordinary (pension/wages/rental)",
  interest: "Interest / non-qualified dividends",
  qualified: "Qualified dividends / LT gains",
  taxExempt: "Tax-exempt interest",
};

export const HIKE_LABELS: Record<TaxIncreaseMode, string> = {
  relative: "Percent of each rate",
  points: "Percentage points",
};

export const YES_NO = ["Yes", "No"];

const PCT_NOTE = "Percent, e.g. 6%";

export const INPUT_FIELDS: InputField[] = [
  { key: "birthYear", label: "Birth year", kind: "year", note: "Four-digit year", get: (i) => i.birthYear, set: (i, v) => { i.birthYear = v as number; } },
  { key: "currentAge", label: "Current age", kind: "age", note: "The plan starts in birth year + current age", get: (i) => i.currentAge, set: (i, v) => { i.currentAge = v as number; } },
  { key: "filingStatus", label: "Filing status", kind: "filing", note: "Single or Married filing jointly", get: (i) => i.filingStatus, set: (i, v) => { i.filingStatus = v as FilingStatus; } },
  { key: "spouseBirthYear", label: "Spouse birth year", kind: "year", note: "Used only for Married filing jointly", get: (i) => i.spouseBirthYear, set: (i, v) => { i.spouseBirthYear = v as number; } },
  { key: "stateTaxRate", label: "State income tax rate", kind: "pct", note: `${PCT_NOTE}; effective rate, 0% if no state income tax`, get: (i) => i.stateTaxRate, set: (i, v) => { i.stateTaxRate = v as number; } },
  { key: "tradIraBalance", label: "Traditional IRA balance", kind: "usd", note: "Dollars", get: (i) => i.tradIraBalance, set: (i, v) => { i.tradIraBalance = v as number; } },
  { key: "tradIraBasis", label: "After-tax basis in Traditional IRAs", kind: "usd", note: "Form 8606 basis; usually 0", get: (i) => i.tradIraBasis, set: (i, v) => { i.tradIraBasis = v as number; } },
  { key: "rothBalance", label: "Roth IRA balance", kind: "usd", note: "Dollars", get: (i) => i.rothBalance, set: (i, v) => { i.rothBalance = v as number; } },
  { key: "outsideBalance", label: "Outside (taxable) account balance", kind: "usd", note: "Funds available to pay taxes", get: (i) => i.outsideBalance, set: (i, v) => { i.outsideBalance = v as number; } },
  { key: "paymentMode", label: "How conversion taxes are paid", kind: "payment", note: "Other savings (unlimited) / Outside account then IRA / From the IRA (no outside funds)", get: (i) => i.paymentMode, set: (i, v) => { i.paymentMode = v as TaxPaymentMode; } },
  { key: "wagesAnnual", label: "Annual wages (today's $)", kind: "usd", note: "0 if already retired", get: (i) => i.wagesAnnual, set: (i, v) => { i.wagesAnnual = v as number; } },
  { key: "retirementAge", label: "Retirement age", kind: "age", note: "Wages stop at this age", get: (i) => i.retirementAge, set: (i, v) => { i.retirementAge = v as number; } },
  { key: "socialSecurityAnnual", label: "Social Security, household per year (today's $)", kind: "usd", note: "At your claiming age", get: (i) => i.socialSecurityAnnual, set: (i, v) => { i.socialSecurityAnnual = v as number; } },
  { key: "socialSecurityStartAge", label: "Social Security start age", kind: "age", note: "", get: (i) => i.socialSecurityStartAge, set: (i, v) => { i.socialSecurityStartAge = v as number; } },
  { key: "conversionStartAge", label: "Start converting at age", kind: "age", note: "", get: (i) => i.conversionStartAge, set: (i, v) => { i.conversionStartAge = v as number; } },
  { key: "lastConversionAge", label: "Last conversion age", kind: "age", note: "", get: (i) => i.lastConversionAge, set: (i, v) => { i.lastConversionAge = v as number; } },
  { key: "lifespan", label: "Estimated lifespan (wealth evaluated at age)", kind: "age", note: "", get: (i) => i.lifespan, set: (i, v) => { i.lifespan = v as number; } },
  { key: "investmentReturn", label: "Investment return (nominal)", kind: "pct", note: PCT_NOTE, get: (i) => i.investmentReturn, set: (i, v) => { i.investmentReturn = v as number; } },
  { key: "inflation", label: "Inflation", kind: "pct", note: PCT_NOTE, get: (i) => i.inflation, set: (i, v) => { i.inflation = v as number; } },
  { key: "outsideReturn", label: "Outside account return (nominal)", kind: "pct", note: `${PCT_NOTE}; before tax drag`, get: (i) => i.outsideReturn, set: (i, v) => { i.outsideReturn = v as number; }, legacy: (i) => i.investmentReturn },
  { key: "outsideTaxDrag", label: "Tax drag on outside account", kind: "pct", note: PCT_NOTE, get: (i) => i.outsideTaxDrag, set: (i, v) => { i.outsideTaxDrag = v as number; } },
  { key: "expenses.enabled", label: "Model living expenses", kind: "yesno", note: "Yes or No. No = other income covers spending and its own taxes", get: (i) => i.expenses.enabled, set: (i, v) => { i.expenses.enabled = v as boolean; }, legacy: () => false },
  { key: "expenses.monthly", label: "Monthly living expenses (today's $)", kind: "usd", note: "Excluding income taxes; grows with inflation. Used only when living expenses is Yes", get: (i) => i.expenses.monthly, set: (i, v) => { i.expenses.monthly = v as number; } },
  { key: "taxIncrease.enabled", label: "Model a future tax-rate increase", kind: "yesno", note: "Yes or No", get: (i) => i.taxIncrease.enabled, set: (i, v) => { i.taxIncrease.enabled = v as boolean; }, legacy: () => false },
  { key: "taxIncrease.startYear", label: "Higher rates start in tax year", kind: "year", note: "Used only when the tax-rate increase is Yes", get: (i) => i.taxIncrease.startYear, set: (i, v) => { i.taxIncrease.startYear = v as number; } },
  { key: "taxIncrease.amount", label: "Tax-rate increase", kind: "pct", note: "e.g. 20% (percent of each rate) or 5% (percentage points)", get: (i) => i.taxIncrease.amount, set: (i, v) => { i.taxIncrease.amount = v as number; } },
  { key: "taxIncrease.mode", label: "Tax-rate increase measured as", kind: "hikeMode", note: "Percent of each rate / Percentage points", get: (i) => i.taxIncrease.mode, set: (i, v) => { i.taxIncrease.mode = v as TaxIncreaseMode; } },
  { key: "taxIncrease.threshold", label: "Tax-rate increase applies above taxable income of", kind: "usd", note: "Ordinary taxable income in 2026 dollars; indexed like the brackets", get: (i) => i.taxIncrease.threshold, set: (i, v) => { i.taxIncrease.threshold = v as number; } },
  { key: "aca.enabled", label: "ACA marketplace insurance before Medicare", kind: "yesno", note: "Yes or No", get: (i) => i.aca.enabled, set: (i, v) => { i.aca.enabled = v as boolean; } },
  { key: "aca.benchmarkPremium", label: "ACA benchmark premium per year (today's $)", kind: "usd", note: "Used only when ACA is Yes", get: (i) => i.aca.benchmarkPremium, set: (i, v) => { i.aca.benchmarkPremium = v as number; } },
  { key: "aca.premiumGrowth", label: "ACA premium growth", kind: "pct", note: `${PCT_NOTE}; used only when ACA is Yes`, get: (i) => i.aca.premiumGrowth, set: (i, v) => { i.aca.premiumGrowth = v as number; } },
  { key: "priorMagi1", label: "MAGI last year (IRMAA look-back)", kind: "usdOrBlank", note: "Leave blank to let the planner estimate", get: (i) => i.priorMagi1, set: (i, v) => { i.priorMagi1 = v as number | null; } },
  { key: "priorMagi2", label: "MAGI two years ago (IRMAA look-back)", kind: "usdOrBlank", note: "Leave blank to let the planner estimate", get: (i) => i.priorMagi2, set: (i, v) => { i.priorMagi2 = v as number | null; } },
  { key: "heirs.count", label: "Number of heirs", kind: "count", note: "Whole number, at least 1", get: (i) => i.heirs.count, set: (i, v) => { i.heirs.count = Math.max(1, v as number); } },
  { key: "heirs.otherIncome", label: "Each heir's other taxable income (today's $)", kind: "usd", note: "Per heir, per year", get: (i) => i.heirs.otherIncome, set: (i, v) => { i.heirs.otherIncome = v as number; } },
  { key: "heirs.stateTaxRate", label: "Heirs' state tax rate", kind: "pct", note: PCT_NOTE, get: (i) => i.heirs.stateTaxRate, set: (i, v) => { i.heirs.stateTaxRate = v as number; } },
];

/** Fields that do not matter for the given inputs (not reported as missing when absent from a file). */
export function irrelevantFields(i: PlannerInputs): Set<string> {
  const out = new Set<string>();
  if (i.filingStatus !== "mfj") out.add("spouseBirthYear");
  if (!i.aca.enabled) {
    out.add("aca.benchmarkPremium");
    out.add("aca.premiumGrowth");
  }
  if (!i.expenses.enabled) out.add("expenses.monthly");
  if (!i.taxIncrease.enabled) for (const k of ["startYear", "amount", "mode", "threshold"]) out.add(`taxIncrease.${k}`);
  return out;
}
