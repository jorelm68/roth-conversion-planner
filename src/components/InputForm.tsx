"use client";

import { rmdStartAge, type IncomeKind, type IncomeStream, type PlannerInputs, type TaxPaymentMode } from "@/engine";
import { Card, NumField } from "./Field";

interface Props {
  inputs: PlannerInputs;
  onChange: (patch: Partial<PlannerInputs>) => void;
  onReset: () => void;
}

const KIND_LABELS: Record<IncomeKind, string> = {
  ordinary: "Ordinary (pension, wages, rental, annuity)",
  interest: "Interest / non-qualified dividends",
  qualified: "Capital gains / qualified dividends",
  taxExempt: "Tax-exempt interest (munis)",
};

const PAYMENT_MODES: { id: TaxPaymentMode; label: string; hint: string }[] = [
  { id: "unlimited", label: "I can pay conversion taxes from other savings", hint: "Assumes you have enough outside funds. The tax is not taken out of the IRA." },
  { id: "limited", label: "Pay from my outside account balance, then from the IRA", hint: "Uses the outside balance above; once it runs out, tax is withheld from the converted amount." },
  { id: "fromIra", label: "I cannot pay from outside funds", hint: "Tax is withheld from the IRA. Before age 59½ the withheld amount also incurs the 10% early-withdrawal penalty." },
];

let counter = 0;
const newId = () => `s${Date.now()}-${counter++}`;

export function InputForm({ inputs, onChange, onReset }: Props) {
  const i = inputs;
  const startYear = i.birthYear + i.currentAge;
  const setStream = (id: string, patch: Partial<IncomeStream>) =>
    onChange({ incomeStreams: i.incomeStreams.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <div className="form-grid">
      <Card title="About you" note={`Plan starts in tax year ${startYear}. Required minimum distributions begin at age ${rmdStartAge(i.birthYear)} for your birth year.`}>
        <NumField label="Birth year" value={i.birthYear} onChange={(v) => onChange({ birthYear: v ?? i.birthYear })} />
        <NumField label="Current age" value={i.currentAge} onChange={(v) => onChange({ currentAge: v ?? i.currentAge })} />
        <label className="field">
          <span className="field-label">Filing status</span>
          <select value={i.filingStatus} onChange={(e) => onChange({ filingStatus: e.target.value as PlannerInputs["filingStatus"] })}>
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
          </select>
        </label>
        {i.filingStatus === "mfj" && (
          <NumField label="Spouse birth year" value={i.spouseBirthYear} onChange={(v) => onChange({ spouseBirthYear: v ?? i.spouseBirthYear })} hint="Drives the spouse's 65+ deductions and Medicare IRMAA." />
        )}
        <NumField label="State income tax rate" value={i.stateTaxRate} percent suffix="%" step={0.1} onChange={(v) => onChange({ stateTaxRate: v ?? 0 })} hint="Effective rate on income other than Social Security. 0% for states with no income tax." />
      </Card>

      <Card title="Accounts today">
        <NumField label="Traditional IRA balance" value={i.tradIraBalance} prefix="$" onChange={(v) => onChange({ tradIraBalance: v ?? 0 })} />
        <NumField label="After-tax basis in Traditional IRAs" value={i.tradIraBasis} prefix="$" onChange={(v) => onChange({ tradIraBasis: v ?? 0 })} hint="Form 8606 basis. Makes part of each distribution/conversion tax-free (pro-rata rule). Usually $0." />
        <NumField label="Roth IRA balance" value={i.rothBalance} prefix="$" onChange={(v) => onChange({ rothBalance: v ?? 0 })} />
        <NumField label="Outside (taxable) account balance" value={i.outsideBalance} prefix="$" onChange={(v) => onChange({ outsideBalance: v ?? 0 })} hint="Cash / brokerage funds available to pay taxes." />
        <div className="field wide">
          <span className="field-label">How will conversion taxes be paid?</span>
          {PAYMENT_MODES.map((m) => (
            <label key={m.id} className="radio">
              <input type="radio" name="pay" checked={i.paymentMode === m.id} onChange={() => onChange({ paymentMode: m.id })} />
              <span>
                <strong>{m.label}</strong>
                <span className="hint">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Work &amp; Social Security">
        <NumField label="Current annual wages" value={i.wagesAnnual} prefix="$" onChange={(v) => onChange({ wagesAnnual: v ?? 0 })} hint="Today's dollars. Enter 0 if you are already retired." />
        <NumField label="Retirement age" value={i.retirementAge} onChange={(v) => onChange({ retirementAge: v ?? i.retirementAge })} hint="Wages stop at this age." />
        <NumField label="Social Security (household, per year)" value={i.socialSecurityAnnual} prefix="$" onChange={(v) => onChange({ socialSecurityAnnual: v ?? 0 })} hint="Today's dollars at your claiming age; adjusted for inflation." />
        <NumField label="Social Security start age" value={i.socialSecurityStartAge} onChange={(v) => onChange({ socialSecurityStartAge: v ?? 67 })} hint="Conversions make more of your benefit taxable (the “tax torpedo”); the model accounts for it." />
      </Card>

      <Card title="Timeline">
        <NumField label="Start converting at age" value={i.conversionStartAge} onChange={(v) => onChange({ conversionStartAge: v ?? i.currentAge })} />
        <NumField label="Last conversion age" value={i.lastConversionAge} onChange={(v) => onChange({ lastConversionAge: v ?? i.lastConversionAge })} hint="Conversions above your RMD are allowed until this age." />
        <NumField label="Estimated lifespan (evaluate wealth at age)" value={i.lifespan} onChange={(v) => onChange({ lifespan: v ?? 90 })} hint="The plan maximizes after-tax wealth at the end of this age, including the tax your heirs will owe." />
      </Card>

      <Card title="Investment assumptions">
        <NumField label="Assumed investment return (nominal)" value={i.investmentReturn} percent suffix="%" step={0.1} onChange={(v) => onChange({ investmentReturn: v ?? 0 })} />
        <NumField label="Inflation" value={i.inflation} percent suffix="%" step={0.1} onChange={(v) => onChange({ inflation: v ?? 0 })} hint="Also indexes tax brackets, deductions, IRMAA tiers, and inflation-adjusted income." />
        <NumField label="Tax drag on outside account" value={i.outsideTaxDrag} percent suffix="%" step={0.1} onChange={(v) => onChange({ outsideTaxDrag: v ?? 0 })} hint="Annual return lost to taxes on the outside account." />
      </Card>

      <Card title="Health insurance" note="Medicare IRMAA is always modeled from age 65 (based on income two years earlier).">
        <label className="field wide check">
          <input type="checkbox" checked={i.aca.enabled} onChange={(e) => onChange({ aca: { ...i.aca, enabled: e.target.checked } })} />
          <span>I buy ACA marketplace insurance before Medicare (premium tax credit)</span>
        </label>
        {i.aca.enabled && (
          <>
            <NumField label="Benchmark (2nd-lowest silver) premium / year" value={i.aca.benchmarkPremium} prefix="$" onChange={(v) => onChange({ aca: { ...i.aca, benchmarkPremium: v ?? 0 } })} hint="For your household, today's dollars. Original ACA rules: subsidy vanishes above 400% of the poverty line." />
            <NumField label="Premium growth" value={i.aca.premiumGrowth} percent suffix="%" step={0.1} onChange={(v) => onChange({ aca: { ...i.aca, premiumGrowth: v ?? 0 } })} />
          </>
        )}
        <NumField label="MAGI last year (optional)" value={i.priorMagi1} nullable prefix="$" onChange={(v) => onChange({ priorMagi1: v })} hint="For the Medicare 2-year look-back. Blank = estimate." />
        <NumField label="MAGI two years ago (optional)" value={i.priorMagi2} nullable prefix="$" onChange={(v) => onChange({ priorMagi2: v })} />
      </Card>

      <Card title="Heirs" note="Any Traditional IRA left at the end of your lifespan must be emptied by heirs within 10 years, taxed at their rates. Roth balances pass tax-free.">
        <NumField label="Number of heirs" value={i.heirs.count} onChange={(v) => onChange({ heirs: { ...i.heirs, count: Math.max(1, Math.round(v ?? 1)) } })} />
        <NumField label="Each heir's other taxable income / year" value={i.heirs.otherIncome} prefix="$" onChange={(v) => onChange({ heirs: { ...i.heirs, otherIncome: v ?? 0 } })} hint="Today's dollars; heirs are modeled as single filers." />
        <NumField label="Heirs' state tax rate" value={i.heirs.stateTaxRate} percent suffix="%" step={0.1} onChange={(v) => onChange({ heirs: { ...i.heirs, stateTaxRate: v ?? 0 } })} />
      </Card>

      <section className="card streams">
        <h2>Other income</h2>
        <p className="note">Pensions, rental income, interest, dividends, gains, etc. that affect your bracket. Social Security and wages are entered above.</p>
        {i.incomeStreams.length === 0 && <p className="hint">No other income added.</p>}
        {i.incomeStreams.map((s) => (
          <div className="stream" key={s.id}>
            <label className="field">
              <span className="field-label">Description</span>
              <input type="text" autoComplete="off" spellCheck={false} value={s.label} onChange={(e) => setStream(s.id, { label: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Type</span>
              <select value={s.kind} onChange={(e) => setStream(s.id, { kind: e.target.value as IncomeKind })}>
                {Object.entries(KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </label>
            <NumField label="Annual amount" value={s.annualAmount} prefix="$" onChange={(v) => setStream(s.id, { annualAmount: v ?? 0 })} />
            <NumField label="From age" value={s.startAge} onChange={(v) => setStream(s.id, { startAge: v ?? s.startAge })} />
            <NumField label="Through age" value={s.endAge} onChange={(v) => setStream(s.id, { endAge: v ?? s.endAge })} />
            <label className="field check">
              <input type="checkbox" checked={s.inflationAdjusted} onChange={(e) => setStream(s.id, { inflationAdjusted: e.target.checked })} />
              <span>Inflation-adjusted</span>
            </label>
            <button type="button" className="link danger" onClick={() => onChange({ incomeStreams: i.incomeStreams.filter((x) => x.id !== s.id) })}>Remove</button>
          </div>
        ))}
        <button
          type="button"
          className="btn secondary"
          onClick={() =>
            onChange({
              incomeStreams: [
                ...i.incomeStreams,
                { id: newId(), label: "Pension", kind: "ordinary", annualAmount: 20_000, startAge: Math.max(i.currentAge, 65), endAge: i.lifespan, inflationAdjusted: false },
              ],
            })
          }
        >
          + Add income
        </button>
      </section>

      <div className="form-actions">
        <button type="button" className="btn secondary" onClick={onReset}>Reset to example values</button>
      </div>
    </div>
  );
}
