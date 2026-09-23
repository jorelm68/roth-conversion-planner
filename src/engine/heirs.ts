import { bracketTax } from "./tax";
import { BASE_YEAR, STANDARD_DEDUCTION } from "./taxData";

export interface HeirParams {
  count: number;
  otherIncome: number; // today's dollars per heir per year
  stateTaxRate: number;
}

/**
 * Present value (at the year of death) of the tax heirs pay on an inherited Traditional IRA that must be
 * emptied within 10 years (SECURE Act). Assumes level annual withdrawals split evenly among heirs, each heir a
 * single filer with `otherIncome` of other taxable income. Roth balances pass tax-free and are not counted here.
 */
export function heirsTaxPV(balance: number, deathYear: number, r: number, inflation: number, h: HeirParams): number {
  if (balance <= 0) return 0;
  const n = 10;
  const payment = r > 1e-9 ? (balance * r) / (1 - Math.pow(1 + r, -n)) : balance / n;
  const heirs = Math.max(1, h.count);
  const perHeir = payment / heirs;
  let pv = 0;
  for (let j = 1; j <= n; j++) {
    const factor = Math.pow(1 + inflation, Math.max(0, deathYear + j - BASE_YEAR));
    const std = STANDARD_DEDUCTION.single * factor;
    const other = h.otherIncome * factor;
    const without = bracketTax(other - std, "single", factor);
    const withIra = bracketTax(other + perHeir - std, "single", factor);
    const tax = (withIra - without + perHeir * h.stateTaxRate) * heirs;
    pv += tax / Math.pow(1 + r, j);
  }
  return pv;
}
