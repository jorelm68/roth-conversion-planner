import type { ScenarioResult } from "@/engine";

export interface View {
  federal: number;
  state: number;
  health: number; // IRMAA + lost ACA subsidy
  other: number; // NIIT + early-withdrawal penalty
  owner: number;
  heirs: number;
  allIn: number;
  converted: number;
  /** QBI deductions taken (reduce taxable income; not a cost). */
  qbi: number;
  /** Part of the federal tax caused by the what-if rate increase. */
  taxIncrease: number;
  /** Living expenses paid over the plan. */
  expenses: number;
  /** Traditional + Roth money withdrawn for living expenses. */
  spendFromIras: number;
  trad: number;
  roth: number;
  outside: number;
  legacy: number;
}

export function viewOf(s: ScenarioResult, real: boolean, inflation: number): View {
  const d = (k: number) => (real ? 1 / Math.pow(1 + inflation, k) : 1);
  let federal = 0, state = 0, irmaa = 0, aca = 0, niit = 0, pen = 0, converted = 0, qbi = 0, taxIncrease = 0, expenses = 0, spendFromIras = 0;
  for (const r of s.rows) {
    const f = d(r.k);
    federal += r.federalTax * f;
    state += r.stateTax * f;
    irmaa += r.irmaa * f;
    aca += r.acaSubsidyLost * f;
    niit += r.niit * f;
    pen += r.penalty * f;
    converted += r.conversion * f;
    qbi += r.qbiDeduction * f;
    taxIncrease += r.taxIncrease * f;
    expenses += r.expenses * f;
    spendFromIras += (r.spendFromTrad + r.spendFromRoth) * f;
  }
  const e = real ? 1 / s.inflationFactorAtEnd : 1;
  const owner = federal + state + irmaa + aca + niit + pen;
  const heirs = s.heirsTax * e;
  return {
    federal, state, health: irmaa + aca, other: niit + pen, owner, heirs, allIn: owner + heirs, converted, qbi, taxIncrease, expenses, spendFromIras,
    trad: s.tradEnd * e, roth: s.rothEnd * e, outside: s.outsideEnd * e, legacy: s.legacy * e,
  };
}
