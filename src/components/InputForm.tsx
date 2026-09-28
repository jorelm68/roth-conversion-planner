"use client";

import { rmdStartAge, type IncomeKind, type IncomeStream, type PlannerInputs, type TaxIncreaseMode, type TaxPaymentMode } from "@/engine";
import { QBI } from "@/engine/taxData";
import { Card, NumField } from "./Field";
import { money } from "./format";

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
  {
    id: "unlimited",
    label: "I can pay conversion taxes from other savings",
    hint: "Assumes you have enough outside funds. The tax is not taken out of the IRA. If the outside balance runs out it goes negative (extra funds needed), including for living expenses.",
  },
  {
    id: "limited",
    label: "Pay from my outside account balance, then from the IRA",
    hint: "Uses the outside balance above; once it runs out, tax is withheld from the converted amount. With living expenses on, spending is then drawn from the Traditional IRA (taxable), then the Roth.",
  },
  {
    id: "fromIra",
    label: "I cannot pay from outside funds",
    hint: "Conversion tax is withheld from the IRA. Before age 59½ the withheld amount also incurs the 10% early-withdrawal penalty. The outside account is used only for living expenses.",
  },
];

const HIKE_MODES: { id: TaxIncreaseMode; label: string }[] = [
  { id: "relative", label: "% of each rate (20% turns 24% into 28.8%)" },
  { id: "points", label: "Percentage points (5 turns 24% into 29%)" },
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
        <NumField label="Outside (taxable) account balance" value={i.outsideBalance} prefix="$" onChange={(v) => onChange({ outsideBalance: v ?? 0 })} hint="Cash / brokerage funds available to pay taxes (and living expenses, if modeled)." />
        <NumField label="Outside account return (nominal)" value={i.outsideReturn} percent suffix="%" step={0.1} onChange={(v) => onChange({ outsideReturn: v ?? 0 })} hint="Usually lower than the long-term market return used for the IRAs (e.g. cash or bonds). Tax drag is subtracted from it." />
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
        <NumField label="Assumed investment return (nominal)" value={i.investmentReturn} percent suffix="%" step={0.1} onChange={(v) => onChange({ investmentReturn: v ?? 0 })} hint="Traditional and Roth IRAs. The outside account has its own return (Accounts today)." />
        <NumField label="Inflation" value={i.inflation} percent suffix="%" step={0.1} onChange={(v) => onChange({ inflation: v ?? 0 })} hint="Also indexes tax brackets, deductions, IRMAA tiers, and inflation-adjusted income." />
        <NumField label="Tax drag on outside account" value={i.outsideTaxDrag} percent suffix="%" step={0.1} onChange={(v) => onChange({ outsideTaxDrag: v ?? 0 })} hint="Annual return lost to taxes on the outside account." />
      </Card>

      <Card
        title="Living expenses"
        note={
          i.expenses.enabled
            ? "All income goes into the outside account, and living expenses and every tax are paid from it. When it runs out, the payment choice under Accounts today decides what happens."
            : "Off: your other income is assumed to cover your living costs and its own taxes, so the outside account only receives RMDs and pays the extra tax on IRA money. That is why it can keep growing."
        }
      >
        <label className="field wide check">
          <input type="checkbox" checked={i.expenses.enabled} onChange={(e) => onChange({ expenses: { ...i.expenses, enabled: e.target.checked } })} />
          <span>Model my living expenses</span>
        </label>
        {i.expenses.enabled && (
          <NumField
            label="Monthly living expenses"
            value={i.expenses.monthly}
            prefix="$"
            onChange={(v) => onChange({ expenses: { ...i.expenses, monthly: v ?? 0 } })}
            hint={`Today's dollars, excluding income taxes (they are calculated). Grows with inflation: ${money(i.expenses.monthly * 12)} a year now.`}
          />
        )}
      </Card>

      <Card
        title="Future tax rates (what if)"
        note="Test a tax increase: ordinary income tax rates go up from a chosen year on income above a level you set. Applies to you and to your heirs."
      >
        <label className="field wide check">
          <input type="checkbox" checked={i.taxIncrease.enabled} onChange={(e) => onChange({ taxIncrease: { ...i.taxIncrease, enabled: e.target.checked } })} />
          <span>Model a future tax-rate increase</span>
        </label>
        {i.taxIncrease.enabled && (
          <>
            <NumField label="Higher rates start in tax year" value={i.taxIncrease.startYear} onChange={(v) => onChange({ taxIncrease: { ...i.taxIncrease, startYear: v ?? i.taxIncrease.startYear } })} />
            <NumField
              label="Rate increase"
              value={i.taxIncrease.amount}
              percent
              suffix={i.taxIncrease.mode === "points" ? "pts" : "%"}
              step={0.1}
              onChange={(v) => onChange({ taxIncrease: { ...i.taxIncrease, amount: v ?? 0 } })}
            />
            <label className="field wide">
              <span className="field-label">Increase is measured as</span>
              <select value={i.taxIncrease.mode} onChange={(e) => onChange({ taxIncrease: { ...i.taxIncrease, mode: e.target.value as TaxIncreaseMode } })}>
                {HIKE_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
            <NumField
              label="For taxable income above"
              value={i.taxIncrease.threshold}
              prefix="$"
              onChange={(v) => onChange({ taxIncrease: { ...i.taxIncrease, threshold: v ?? 0 } })}
              hint="Ordinary taxable income, 2026 dollars; indexed for inflation like the brackets. $0 raises every bracket."
            />
          </>
        )}
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
        <p className="note">
          Pensions, rental income, interest, dividends, gains, etc. that affect your bracket. Social Security and wages are entered above. Tick <strong>QBI (§199A)</strong> for
          ordinary income that is qualified business income (for example some retired-partner payments): it earns a deduction of 20% of that income, phased out as
          taxable income rises from {money(QBI.threshold[i.filingStatus])} to {money(QBI.threshold[i.filingStatus] + QBI.phaseIn[i.filingStatus])} (2026, {i.filingStatus === "mfj" ? "married filing jointly" : "single"}).
        </p>
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
            <label className="field check" title={s.kind === "ordinary" ? "Qualifies for the 20% qualified business income deduction (IRC §199A)" : "Only ordinary income can be qualified business income"}>
              <input type="checkbox" disabled={s.kind !== "ordinary"} checked={s.kind === "ordinary" && !!s.qbi} onChange={(e) => setStream(s.id, { qbi: e.target.checked })} />
              <span>QBI (§199A)</span>
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
