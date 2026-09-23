import { UNIFORM_LIFETIME } from "./taxData";

/** SECURE 2.0 required beginning age by birth year. */
export function rmdStartAge(birthYear: number): number {
  if (birthYear <= 1950) return 72;
  if (birthYear <= 1959) return 73;
  return 75;
}

export function uniformDistributionPeriod(age: number): number {
  if (age >= 120) return UNIFORM_LIFETIME[120];
  return UNIFORM_LIFETIME[age] ?? Infinity;
}

/** Required minimum distribution for the year, from the prior year-end balance. */
export function requiredMinimumDistribution(priorYearEndBalance: number, age: number, birthYear: number): number {
  if (age < rmdStartAge(birthYear) || priorYearEndBalance <= 0) return 0;
  const period = uniformDistributionPeriod(age);
  return Math.min(priorYearEndBalance, priorYearEndBalance / period);
}
