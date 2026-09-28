import type { FilingStatus } from "./taxData";

export type { FilingStatus };

/** How an extra income stream is taxed. */
export type IncomeKind =
  | "ordinary" // wages, pension, rental, annuity: ordinary income
  | "interest" // interest / non-qualified dividends: ordinary income AND subject to NIIT
  | "qualified" // long-term gains / qualified dividends: preferential rates AND subject to NIIT
  | "taxExempt"; // muni interest: not in taxable income, but counts for SS taxation, IRMAA, ACA

export interface IncomeStream {
  id: string;
  label: string;
  kind: IncomeKind;
  /** Annual amount in today's dollars. */
  annualAmount: number;
  startAge: number;
  endAge: number;
  /** If true the amount grows with inflation; otherwise it is a fixed nominal amount. */
  inflationAdjusted: boolean;
  /** Qualified business income (IRC §199A). Only counts for "ordinary" streams. */
  qbi?: boolean;
}

/**
 * unlimited: conversion tax (and, with living expenses on, any spending shortfall) is paid from other savings
 *            (the outside balance may go "negative" = extra funds needed, charged at the outside-account return).
 * limited:   paid from the outside account until it runs out, then withheld from the IRA. With living expenses on,
 *            a spending shortfall is then withdrawn from the Traditional IRA, then the Roth.
 * fromIra:   conversion tax is withheld from the converted amount (10% penalty before 59.5); the outside account
 *            is used only for living expenses.
 */
export type TaxPaymentMode = "unlimited" | "limited" | "fromIra";

export interface PlannerInputs {
  birthYear: number;
  currentAge: number;
  filingStatus: FilingStatus;
  /** Only used for MFJ. */
  spouseBirthYear: number;

  tradIraBalance: number;
  /** After-tax basis in Traditional IRAs (Form 8606). */
  tradIraBasis: number;
  rothBalance: number;
  /** Taxable/other account used to pay taxes. */
  outsideBalance: number;

  /** Wages in today's dollars, paid until retirementAge (exclusive). 0 if retired. */
  wagesAnnual: number;
  retirementAge: number;
  incomeStreams: IncomeStream[];
  /** Household Social Security benefit, today's dollars, at claiming. */
  socialSecurityAnnual: number;
  socialSecurityStartAge: number;

  /** Effective state income tax rate on income other than Social Security (fraction). */
  stateTaxRate: number;

  investmentReturn: number; // nominal, fraction (IRAs)
  /** Nominal return on the outside (taxable) account, before tax drag. Usually lower than the IRA return. */
  outsideReturn: number;
  inflation: number; // fraction
  outsideTaxDrag: number; // annual tax drag on the outside account, fraction

  /**
   * Living expenses. When enabled, all income, taxes and spending flow through the outside account and a
   * shortfall is covered according to `paymentMode`. When disabled, other income is assumed to cover living
   * costs and its own taxes (only IRA-related cash flows touch the outside account).
   */
  expenses: {
    enabled: boolean;
    /** Monthly living expenses in today's dollars; grow with inflation. */
    monthly: number;
  };

  /** "What if" tax-rate increase on ordinary income from a future year (also applied to heirs). */
  taxIncrease: TaxIncrease;

  paymentMode: TaxPaymentMode;

  conversionStartAge: number;
  lastConversionAge: number;
  /** Age at death / evaluation age. */
  lifespan: number;

  aca: {
    enabled: boolean;
    /** Second-lowest-cost silver premium for the household, annual, today's dollars. */
    benchmarkPremium: number;
    premiumGrowth: number; // fraction
  };
  /** Optional MAGI for IRMAA look-back years before the plan starts. null = estimate. */
  priorMagi1: number | null; // last year
  priorMagi2: number | null; // two years ago

  heirs: {
    count: number;
    /** Each heir's other taxable income, today's dollars per year (single filer). */
    otherIncome: number;
    stateTaxRate: number;
  };
}

export type TaxIncreaseMode = "relative" | "points";

export interface TaxIncrease {
  enabled: boolean;
  /** First tax year with the higher rates. */
  startYear: number;
  /** relative: each bracket rate × (1 + amount). points: each bracket rate + amount. */
  mode: TaxIncreaseMode;
  amount: number;
  /** Applies to ordinary taxable income above this amount (2026 dollars, indexed like the brackets). */
  threshold: number;
}

/** Symbolic conversion target, resolved each year into a dollar amount. */
export type Target =
  | { kind: "none" }
  | { kind: "all" }
  | { kind: "even" }
  | { kind: "amount"; value: number }
  | { kind: "bracket"; rate: number } // fill ordinary taxable income to the top of this bracket
  | { kind: "irmaa"; tier: number } // keep MAGI at/below IRMAA threshold #tier (0-based) of the premium year (+2)
  | { kind: "aca"; ratio: number }; // keep MAGI at/below ratio x FPL

export interface Plan {
  /** Index = years since plan start. Missing entries mean "no conversion". */
  targets: Target[];
  /** Highest marginal ordinary bracket the plan is allowed to enter (0.37 = no cap). */
  cap: number;
}

export interface YearRow {
  k: number;
  year: number;
  age: number;
  rmd: number;
  conversion: number;
  taxableConversion: number;
  wagesAndOther: number;
  socialSecurity: number;
  taxableSocialSecurity: number;
  agi: number;
  magi: number;
  taxableIncome: number;
  marginalBracket: number;
  /** Combined marginal rate on the next dollar of IRA income (federal + state + SS torpedo + NIIT). */
  marginalAllIn: number;
  federalTax: number;
  stateTax: number;
  niit: number;
  irmaa: number;
  acaSubsidyLost: number;
  penalty: number;
  totalCost: number;
  tradEnd: number;
  rothEnd: number;
  outsideEnd: number;
  /** Portion of tax paid by withholding from the conversion. */
  withheld: number;
  /** Qualified business income deduction (§199A). */
  qbiDeduction: number;
  /** Extra federal tax from the "what if" rate increase. */
  taxIncrease: number;
  /** Cash received this year: wages, other income and Social Security (not IRA money). */
  cashIncome: number;
  /** Living expenses this year (0 when living expenses are not modeled). */
  expenses: number;
  /** Traditional IRA money withdrawn to pay living expenses (not converted). */
  spendFromTrad: number;
  /** Roth IRA money withdrawn to pay living expenses. */
  spendFromRoth: number;
  /** Outside account at the start of the year. */
  outsideStart: number;
  /** Investment growth credited to (or, if negative, charged on) the outside account. */
  outsideGrowth: number;
  /** Spending the accounts could not cover (all accounts empty; limited / fromIra modes only). */
  unfunded: number;
}

export interface Totals {
  federalTax: number;
  stateTax: number;
  niit: number;
  irmaa: number;
  acaSubsidyLost: number;
  penalty: number;
  converted: number;
  rmds: number;
  qbiDeduction: number;
  taxIncrease: number;
  spendFromTrad: number;
  spendFromRoth: number;
}

export interface ScenarioResult {
  id: string;
  name: string;
  description: string;
  cap: number;
  totals: Totals;
  /** Sum of all owner-side costs (federal, state, NIIT, IRMAA, penalty, lost ACA subsidy). */
  ownerCost: number;
  peakBracket: number;
  /** Highest bracket used in a year in which a conversion was made (0 if none). */
  peakConversionBracket: number;
  heirsTax: number;
  tradEnd: number;
  rothEnd: number;
  outsideEnd: number;
  /** Roth + outside + Traditional IRA net of heirs' tax, in nominal dollars at end of lifespan year. */
  legacy: number;
  /** legacy in today's dollars. */
  legacyReal: number;
  inflationFactorAtEnd: number;
  /** First age at which the outside account is negative (extra funds needed or spending unfunded), or null. */
  outsideNegativeAge: number | null;
  /** The conversion plan that produced this result (lets the UI re-run any year with a full calculation trace). */
  plan: Plan;
  rows: YearRow[];
}

/** One line of a year's calculation walk-through. */
export interface TraceLine {
  /** Stable identifier used by tests and exports (e.g. "agi", "federalTax"). */
  key?: string;
  label: string;
  value: number | string;
  fmt: "usd" | "pct" | "num" | "text";
  /** Formula or explanation, in words. */
  note?: string;
}

export interface TraceSection {
  title: string;
  lines: TraceLine[];
}
