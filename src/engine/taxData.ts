/**
 * Federal tax parameters for tax year 2026 (post One Big Beautiful Bill Act, Rev. Proc. 2025-32 etc.).
 * Everything that the law indexes to inflation is scaled by (1 + inflation)^(year - BASE_YEAR)
 * in the engine; values flagged "not indexed" are fixed in statute.
 */
export const BASE_YEAR = 2026;

export type FilingStatus = "single" | "mfj";

export interface Bracket {
  /** Marginal rate. */
  rate: number;
  /** Taxable-income floor of this bracket (2026 dollars). */
  from: number;
}

export const ORDINARY_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { rate: 0.1, from: 0 },
    { rate: 0.12, from: 12_400 },
    { rate: 0.22, from: 50_400 },
    { rate: 0.24, from: 105_700 },
    { rate: 0.32, from: 201_775 },
    { rate: 0.35, from: 256_225 },
    { rate: 0.37, from: 640_600 },
  ],
  mfj: [
    { rate: 0.1, from: 0 },
    { rate: 0.12, from: 24_800 },
    { rate: 0.22, from: 100_800 },
    { rate: 0.24, from: 211_400 },
    { rate: 0.32, from: 403_550 },
    { rate: 0.35, from: 512_450 },
    { rate: 0.37, from: 768_700 },
  ],
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = { single: 16_100, mfj: 32_200 };
/** Additional standard deduction per person aged 65+. */
export const ADDITIONAL_STANDARD_DEDUCTION_65: Record<FilingStatus, number> = { single: 2_050, mfj: 1_650 };

/** OBBBA "senior deduction": $6,000 per person 65+, tax years 2025-2028, phased out at 6% of MAGI over threshold. Thresholds not indexed. */
export const SENIOR_DEDUCTION = {
  amount: 6_000,
  lastYear: 2028,
  phaseoutRate: 0.06,
  threshold: { single: 75_000, mfj: 150_000 } as Record<FilingStatus, number>,
};

/** Long-term capital gain / qualified dividend 0% and 15% ceilings (taxable income), 2026. */
export const LTCG_THRESHOLDS: Record<FilingStatus, { zeroTo: number; fifteenTo: number }> = {
  single: { zeroTo: 49_450, fifteenTo: 545_500 },
  mfj: { zeroTo: 98_900, fifteenTo: 613_700 },
};

/**
 * Qualified business income deduction (IRC §199A), 2026. 20% of QBI, limited to 20% of taxable income (before this
 * deduction) minus net capital gain. Thresholds indexed (Rev. Proc. 2025-32); the phase-in ranges ($75k / $150k since
 * OBBBA) are not. Above the threshold the planner applies the specified-service (SSTB) rule: the QBI counted shrinks
 * in a straight line to zero across the phase-in range. (Non-SSTB businesses are limited by W-2 wages / property
 * instead, which is not modeled.)
 */
export const QBI = {
  rate: 0.2,
  threshold: { single: 201_750, mfj: 403_500 } as Record<FilingStatus, number>,
  phaseIn: { single: 75_000, mfj: 150_000 } as Record<FilingStatus, number>,
};

/** Net Investment Income Tax. Threshold is NOT indexed. */
export const NIIT = { rate: 0.038, threshold: { single: 200_000, mfj: 250_000 } as Record<FilingStatus, number> };

/** Social Security benefit taxation base amounts. NOT indexed. */
export const SS_BASE: Record<FilingStatus, { first: number; second: number }> = {
  single: { first: 25_000, second: 34_000 },
  mfj: { first: 32_000, second: 44_000 },
};

/**
 * Medicare IRMAA (2026 premium year, based on 2024 MAGI). Thresholds are "greater than".
 * Surcharge = Part B + Part D monthly IRMAA, per Medicare enrollee.
 */
export const IRMAA = {
  thresholds: {
    single: [109_000, 137_000, 171_000, 205_000, 500_000],
    mfj: [218_000, 274_000, 342_000, 410_000, 750_000],
  } as Record<FilingStatus, number[]>,
  /** Monthly surcharge per person for tiers 1..5 (Part B + Part D). */
  monthlySurcharge: [81.2 + 14.5, 202.9 + 37.5, 324.6 + 60.4, 446.3 + 83.3, 487.0 + 91.0],
};

/** ACA premium tax credit (original ACA schedule; enhanced credits expired after 2025). */
export const ACA = {
  /** 2025 HHS poverty guideline, used for 2026 coverage. */
  fplBase: 15_650,
  fplPerAdditional: 5_500,
  cliffRatio: 4.0,
  /** [fplRatioFrom, initialPct, finalPct] bands, percentages of income. */
  bands: [
    [0, 0.021, 0.021],
    [1.33, 0.0314, 0.0419],
    [1.5, 0.0419, 0.066],
    [2.0, 0.066, 0.0844],
    [2.5, 0.0844, 0.0996],
    [3.0, 0.0996, 0.0996],
  ] as [number, number, number][],
};

export const EARLY_WITHDRAWAL_PENALTY = 0.1;
export const PENALTY_FREE_AGE = 60; // 59½ -> first full year of eligibility
export const MEDICARE_AGE = 65;

/** IRS Uniform Lifetime Table (effective 2022), distribution period by age. */
export const UNIFORM_LIFETIME: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
  100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9,
  109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7,
  118: 2.5, 119: 2.3, 120: 2.0,
};
