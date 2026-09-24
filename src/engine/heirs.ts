import { bracketTax } from "./tax";
import { BASE_YEAR, STANDARD_DEDUCTION } from "./taxData";

export interface HeirParams {
  count: number;
  otherIncome: number; // today's dollars per heir per year
  stateTaxRate: number;
}

export interface HeirYear {
  /** Years after death (1-10). */
  j: number;
  year: number;
  factor: number;
  /** Each heir's other income and standard deduction that year. */
  otherIncome: number;
  standardDeduction: number;
  federalWithout: number;
  federalWith: number;
  statePerHeir: number;
  /** Tax for all heirs combined that year. */
  tax: number;
  discount: number;
  pv: number;
}

export interface HeirSchedule {
  balance: number;
  years: number;
  heirs: number;
  /** Level annual withdrawal that empties the account in 10 years while it keeps earning r. */
  payment: number;
  perHeir: number;
  rows: HeirYear[];
  total: number;
}

/**
 * Tax heirs pay on an inherited Traditional IRA that must be emptied within 10 years (SECURE Act), year by year.
 * Assumes level annual withdrawals split evenly among heirs, each heir a single filer with `otherIncome` of other
 * taxable income. `total` is the present value at the year of death, discounted at r.
 */
export function heirsTaxSchedule(balance: number, deathYear: number, r: number, inflation: number, h: HeirParams): HeirSchedule {
  const n = 10;
  const heirs = Math.max(1, h.count);
  if (balance <= 0) return { balance, years: n, heirs, payment: 0, perHeir: 0, rows: [], total: 0 };
  const payment = r > 1e-9 ? (balance * r) / (1 - Math.pow(1 + r, -n)) : balance / n;
  const perHeir = payment / heirs;
  const rows: HeirYear[] = [];
  let total = 0;
  for (let j = 1; j <= n; j++) {
    const factor = Math.pow(1 + inflation, Math.max(0, deathYear + j - BASE_YEAR));
    const std = STANDARD_DEDUCTION.single * factor;
    const other = h.otherIncome * factor;
    const without = bracketTax(other - std, "single", factor);
    const withIra = bracketTax(other + perHeir - std, "single", factor);
    const statePerHeir = perHeir * h.stateTaxRate;
    const tax = (withIra - without + statePerHeir) * heirs;
    const discount = 1 / Math.pow(1 + r, j);
    total += tax * discount;
    rows.push({ j, year: deathYear + j, factor, otherIncome: other, standardDeduction: std, federalWithout: without, federalWith: withIra, statePerHeir, tax, discount, pv: tax * discount });
  }
  return { balance, years: n, heirs, payment, perHeir, rows, total };
}

/** Present value at the year of death of the heirs' tax on an inherited Traditional IRA (see heirsTaxSchedule). */
export function heirsTaxPV(balance: number, deathYear: number, r: number, inflation: number, h: HeirParams): number {
  return heirsTaxSchedule(balance, deathYear, r, inflation, h).total;
}
