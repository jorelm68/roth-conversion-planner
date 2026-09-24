import { ACA, IRMAA, type FilingStatus } from "./taxData";

/** IRMAA tier (0 = none, 1-5) for MAGI from two years before the premium year. */
export function irmaaTier(lagMagi: number, status: FilingStatus, factor: number): number {
  const th = IRMAA.thresholds[status];
  let tier = 0;
  for (let i = 0; i < th.length; i++) if (lagMagi > th[i] * factor) tier = i + 1;
  return tier;
}

/** Annual surcharge per Medicare enrollee for a tier. */
export const irmaaSurchargePerPerson = (tier: number, factor: number) =>
  tier === 0 ? 0 : IRMAA.monthlySurcharge[tier - 1] * 12 * factor;

/** Annual IRMAA surcharge for a premium year, given MAGI from two years earlier. */
export function irmaaSurcharge(lagMagi: number, status: FilingStatus, factor: number, enrollees: number): number {
  if (enrollees <= 0) return 0;
  return irmaaSurchargePerPerson(irmaaTier(lagMagi, status, factor), factor) * enrollees;
}

/** MAGI ceiling for IRMAA threshold #tier (0-based) in the premium year. */
export const irmaaThreshold = (tier: number, status: FilingStatus, factor: number) => IRMAA.thresholds[status][tier] * factor;

export const povertyLine = (householdSize: number, factor: number) =>
  (ACA.fplBase + ACA.fplPerAdditional * (householdSize - 1)) * factor;

/** Expected contribution as a share of income under the original ACA schedule. */
export function applicablePercentage(ratio: number): number {
  const bands = ACA.bands;
  let idx = 0;
  for (let i = 0; i < bands.length; i++) if (ratio >= bands[i][0]) idx = i;
  const [from, a, b] = bands[idx];
  const to = idx + 1 < bands.length ? bands[idx + 1][0] : from + 1;
  if (a === b) return a;
  return a + (b - a) * Math.min(1, (ratio - from) / (to - from));
}

/** Annual premium tax credit. Zero above 400% FPL (the subsidy cliff). */
export function acaSubsidy(acaMagi: number, householdSize: number, factor: number, benchmarkPremium: number): number {
  const fpl = povertyLine(householdSize, factor);
  const ratio = Math.max(acaMagi, fpl) / fpl; // below 100% FPL is Medicaid territory; treated as 100%
  if (ratio > ACA.cliffRatio) return 0;
  const contribution = applicablePercentage(ratio) * Math.max(acaMagi, fpl);
  return Math.max(0, benchmarkPremium - contribution);
}
