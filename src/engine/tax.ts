import {
  ADDITIONAL_STANDARD_DEDUCTION_65,
  BASE_YEAR,
  LTCG_THRESHOLDS,
  NIIT,
  ORDINARY_BRACKETS,
  SENIOR_DEDUCTION,
  SS_BASE,
  STANDARD_DEDUCTION,
  type FilingStatus,
} from "./taxData";

export const inflationFactor = (year: number, inflation: number) => Math.pow(1 + inflation, Math.max(0, year - BASE_YEAR));

/** Tax on ordinary taxable income. */
export function bracketTax(taxable: number, status: FilingStatus, factor: number): number {
  if (taxable <= 0) return 0;
  const b = ORDINARY_BRACKETS[status];
  let tax = 0;
  for (let i = 0; i < b.length; i++) {
    const lo = b[i].from * factor;
    const hi = i + 1 < b.length ? b[i + 1].from * factor : Infinity;
    if (taxable <= lo) break;
    tax += (Math.min(taxable, hi) - lo) * b[i].rate;
  }
  return tax;
}

/** Marginal ordinary rate at the given ordinary taxable income (the bracket the next dollar lands in). */
export function marginalRate(taxable: number, status: FilingStatus, factor: number): number {
  const b = ORDINARY_BRACKETS[status];
  let rate = b[0].rate;
  for (let i = 0; i < b.length; i++) if (taxable >= b[i].from * factor) rate = b[i].rate;
  return rate;
}

/** Ordinary taxable income at which the bracket with `rate` is full. Infinity for the top bracket. */
export function bracketTop(rate: number, status: FilingStatus, factor: number): number {
  const b = ORDINARY_BRACKETS[status];
  const i = b.findIndex((x) => Math.abs(x.rate - rate) < 1e-9);
  if (i < 0 || i + 1 >= b.length) return Infinity;
  return b[i + 1].from * factor;
}

/** Portion of Social Security that is taxable (the "tax torpedo" formula). */
export function taxableSocialSecurity(ss: number, otherAgi: number, taxExempt: number, status: FilingStatus): number {
  if (ss <= 0) return 0;
  const { first, second } = SS_BASE[status];
  const provisional = otherAgi + taxExempt + 0.5 * ss;
  if (provisional <= first) return 0;
  if (provisional <= second) return Math.min(0.5 * (provisional - first), 0.5 * ss);
  const tier1 = Math.min(0.5 * ss, 0.5 * (second - first));
  return Math.min(0.85 * ss, 0.85 * (provisional - second) + tier1);
}

export interface FederalInput {
  status: FilingStatus;
  year: number;
  factor: number;
  /** Number of people (taxpayer/spouse) age 65+ by year end. */
  seniors: number;
  /** Ordinary income excluding Social Security (wages, pension, interest, taxable IRA distributions). */
  ordinary: number;
  /** Part of `ordinary` that is net investment income (interest). */
  interest: number;
  /** Long-term gains and qualified dividends. */
  preferential: number;
  taxExempt: number;
  ss: number;
}

export interface FederalResult {
  taxableSS: number;
  agi: number;
  /** MAGI for IRMAA and NIIT (AGI + tax-exempt interest). */
  magi: number;
  /** MAGI for ACA (adds untaxed Social Security). */
  acaMagi: number;
  deduction: number;
  taxableIncome: number;
  ordinaryTaxable: number;
  tax: number;
  niit: number;
  marginal: number;
}

export function computeFederal(i: FederalInput): FederalResult {
  const taxableSS = taxableSocialSecurity(i.ss, i.ordinary + i.preferential, i.taxExempt, i.status);
  const agi = i.ordinary + i.preferential + taxableSS;

  let deduction = (STANDARD_DEDUCTION[i.status] + ADDITIONAL_STANDARD_DEDUCTION_65[i.status] * i.seniors) * i.factor;
  if (i.seniors > 0 && i.year <= SENIOR_DEDUCTION.lastYear) {
    const over = Math.max(0, agi - SENIOR_DEDUCTION.threshold[i.status]);
    deduction += Math.max(0, SENIOR_DEDUCTION.amount * i.seniors - SENIOR_DEDUCTION.phaseoutRate * over);
  }

  const taxableIncome = Math.max(0, agi - deduction);
  const prefPart = Math.min(i.preferential, taxableIncome);
  const ordinaryTaxable = taxableIncome - prefPart;

  const ordTax = bracketTax(ordinaryTaxable, i.status, i.factor);
  const t = LTCG_THRESHOLDS[i.status];
  const zeroTo = t.zeroTo * i.factor;
  const fifteenTo = t.fifteenTo * i.factor;
  const top = ordinaryTaxable + prefPart;
  const at15 = Math.max(0, Math.min(top, fifteenTo) - Math.max(ordinaryTaxable, zeroTo));
  const at20 = Math.max(0, top - Math.max(ordinaryTaxable, fifteenTo));
  const tax = ordTax + at15 * 0.15 + at20 * 0.2;

  const magi = agi + i.taxExempt;
  const nii = i.interest + i.preferential;
  const niit = NIIT.rate * Math.max(0, Math.min(nii, magi - NIIT.threshold[i.status]));

  return {
    taxableSS,
    agi,
    magi,
    acaMagi: magi + (i.ss - taxableSS),
    deduction,
    taxableIncome,
    ordinaryTaxable,
    tax,
    niit,
    marginal: marginalRate(ordinaryTaxable, i.status, i.factor),
  };
}
