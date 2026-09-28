"use client";

import { useEffect, useMemo, useState } from "react";
import { planDetail, type PlannerInputs, type PlannerOutput } from "@/engine";
import { endBlocks, lawTables, overTimeTable, strategyRanking, yearBlocks, type Block, type Step, type Table } from "@/methodology/buildMethodology";
import { FILING_LABELS, HIKE_LABELS, INPUT_FIELDS, KIND_LABELS, PAYMENT_LABELS, type InputField } from "@/report/inputFields";
import type { FilingStatus, TaxIncreaseMode, TaxPaymentMode } from "@/engine";
import { money, pct } from "./format";
import { usePlannerContext } from "./PlannerProvider";

const fmtValue = (s: Step): string => {
  if (s.fmt === "text" || typeof s.value === "string") return String(s.value);
  if (s.fmt === "usd") return money(s.value);
  if (s.fmt === "pct") return pct(s.value, 2);
  return s.value.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

const matches = (s: Step) => s.engine !== undefined && typeof s.value === "number" && Math.abs(s.value - s.engine) <= 1e-6 * Math.max(1, Math.abs(s.engine));

function inputDisplay(f: InputField, i: PlannerInputs): string {
  const v = f.get(i);
  switch (f.kind) {
    case "usd":
      return money(v as number);
    case "usdOrBlank":
      return v === null ? "left blank (estimated)" : money(v as number);
    case "pct":
      return pct(v as number, 2);
    case "filing":
      return FILING_LABELS[v as FilingStatus];
    case "payment":
      return PAYMENT_LABELS[v as TaxPaymentMode];
    case "yesno":
      return v ? "Yes" : "No";
    case "hikeMode":
      return HIKE_LABELS[v as TaxIncreaseMode];
    default:
      return String(v);
  }
}

function DataTable({ t, wide }: { t: Table; wide?: boolean }) {
  return (
    <div className={wide ? "table-scroll" : "table-scroll fit"}>
      <table className="m-data">
        {t.caption && <caption>{t.caption}</caption>}
        <thead>
          <tr>
            {t.head.map((h, n) => (
              <th key={n}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, n) => (
            <tr key={n} className={n === t.highlight ? "hl" : ""}>
              {r.map((c, m) => (
                <td key={m}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {t.foot && (
          <tfoot>
            <tr>
              {t.foot.map((c, n) => (
                <td key={n}>{c}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <table className="m-steps">
      <colgroup>
        <col className="c-step" />
        <col className="c-formula" />
        <col className="c-work" />
        <col className="c-result" />
      </colgroup>
      <thead>
        <tr>
          <th>Step</th>
          <th>Formula</th>
          <th>With your numbers</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((s, n) => (
          <tr key={n} className={s.strong ? "strong" : ""}>
            <th scope="row">{s.label.trim()}</th>
            <td className="formula">{s.formula}</td>
            <td className="work">{s.work}</td>
            <td className={typeof s.value === "string" ? "result text" : "result"}>
              {fmtValue(s)}
              {matches(s) && (
                <span className="check" title="Recomputed here from the formula; matches the planner's own result" aria-label="matches the planner">
                  {" "}✓
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlockView({ b, n }: { b: Block; n?: number }) {
  return (
    <section className="m-block" id={`how-b-${b.id}`}>
      <h3>
        {n !== undefined && <span className="m-num">{n}</span>}
        {b.title}
      </h3>
      <p className="m-explain">{b.explain}</p>
      {b.table && <DataTable t={b.table} wide={b.table.head.length > 6} />}
      <Steps steps={b.steps} />
      {b.law && <p className="m-law">Source: {b.law}</p>}
    </section>
  );
}

export function Methodology({ output, inputs }: { output: PlannerOutput; inputs: PlannerInputs }) {
  const { scenarioId, setScenarioId, focusK, setFocusK } = usePlannerContext();
  const ranking = useMemo(() => strategyRanking(output), [output]);
  const scenario = output.scenarios.find((s) => s.id === scenarioId) ?? output.scenarios.find((s) => s.id === output.recommendedId)!;
  const none = output.scenarios.find((s) => s.id === "none")!;
  const detail = useMemo(() => planDetail(inputs, scenario.plan), [inputs, scenario]);

  const firstConversion = Math.max(0, detail.rows.findIndex((r) => r.conversion > 0));
  const [k, setK] = useState(() => (focusK !== null && focusK < detail.rows.length ? focusK : firstConversion));
  useEffect(() => {
    if (k >= detail.rows.length) setK(firstConversion);
  }, [k, detail.rows.length, firstConversion]);
  const kk = Math.min(k, detail.rows.length - 1);
  const chooseYear = (n: number) => {
    setK(n);
    setFocusK(n);
  };

  const year = detail.years[kk];
  const row = detail.rows[kk];
  const blocks = useMemo(() => yearBlocks(year, row), [year, row]);
  const ends = useMemo(() => endBlocks(inputs, scenario, detail, none), [inputs, scenario, detail, none]);
  const overTime = useMemo(() => overTimeTable(detail), [detail]);
  const law = useMemo(() => lawTables(inputs, row.year), [inputs, row.year]);
  const recommended = output.scenarios.find((s) => s.id === output.recommendedId)!;

  return (
    <div className="methodology">
      <nav className="m-toc no-print" aria-label="Contents">
        <a href="#how-inputs">Your inputs</a>
        <a href="#how-overview">The big picture</a>
        <a href="#how-year">One year, step by step</a>
        <a href="#how-over-time">Year to year</a>
        <a href="#how-end">End of the plan</a>
        <a href="#how-choice">Choosing the strategy</a>
        <a href="#how-law">Tax-law figures</a>
      </nav>

      <section id="how-inputs" className="card m-section">
        <h2>1. The numbers you entered</h2>
        <p className="m-explain">These are the exact values used for everything on this page.</p>
        <div className="m-inputs">
          {INPUT_FIELDS.map((f) => (
            <div key={f.key} className="m-input">
              <span>{f.label}</span>
              <strong>{inputDisplay(f, inputs)}</strong>
            </div>
          ))}
        </div>
        <h3 className="m-sub">Other income</h3>
        {inputs.incomeStreams.length === 0 ? (
          <p className="muted small">None entered.</p>
        ) : (
          <DataTable
            t={{
              head: ["Description", "Type", "Amount per year", "Ages", "Grows with inflation", "QBI (§199A)"],
              rows: inputs.incomeStreams.map((s) => [
                s.label,
                KIND_LABELS[s.kind],
                money(s.annualAmount),
                `${s.startAge}–${s.endAge}`,
                s.inflationAdjusted ? "Yes" : "No",
                s.kind === "ordinary" && s.qbi ? "Yes" : "No",
              ]),
            }}
          />
        )}
      </section>

      <section id="how-overview" className="card m-section">
        <h2>2. The big picture</h2>
        <ol className="m-overview">
          <li>
            <strong>Build the years.</strong> One row per tax year from age {inputs.currentAge} to {inputs.lifespan}, with your wages, other income and Social Security
            for each year, and the 2026 tax figures scaled by your {pct(inputs.inflation, 2)} inflation assumption.
          </li>
          <li>
            <strong>Simulate each strategy year by year.</strong> Take any required minimum distribution, decide the Roth conversion, compute every tax and
            cost with the full rules (section 3), pay it{inputs.expenses.enabled ? " along with your living expenses" : ""}, and grow the IRAs at your {pct(inputs.investmentReturn, 2)} return and the
            outside account at {pct(inputs.outsideReturn, 2)}.
          </li>
          <li>
            <strong>Count what&apos;s left.</strong> At the end of age {inputs.lifespan}, subtract the tax your heirs would owe on the remaining Traditional IRA. That
            gives after-tax wealth (section 5).
          </li>
          <li>
            <strong>Search for the best schedule.</strong> Compare simple rules and a year-by-year search, and recommend the one with the most after-tax wealth
            (section 6).
          </li>
        </ol>
        <p className="muted small">
          A ✓ next to a result means this page recomputed it from the formula shown and it matches the planner&apos;s own number exactly.
        </p>
      </section>

      <section id="how-year" className="card m-section">
        <h2>3. One year, step by step</h2>
        <div className="m-controls no-print">
          <label className="field">
            <span className="field-label">Strategy</span>
            <select value={scenario.id} onChange={(e) => setScenarioId(e.target.value)}>
              {ranking.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === output.recommendedId ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Year</span>
            <select value={kk} onChange={(e) => chooseYear(Number(e.target.value))}>
              {detail.rows.map((r) => (
                <option key={r.k} value={r.k}>
                  Age {r.age} ({r.year}){r.conversion > 0 ? " · conversion" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="m-stepper">
            <button type="button" className="btn secondary" disabled={kk <= 0} onClick={() => chooseYear(kk - 1)}>
              ← Previous year
            </button>
            <button type="button" className="btn secondary" disabled={kk >= detail.rows.length - 1} onClick={() => chooseYear(kk + 1)}>
              Next year →
            </button>
          </div>
        </div>
        <p className="m-explain">
          <strong>
            {scenario.name}, age {row.age}, tax year {row.year}.
          </strong>{" "}
          Amounts are in {row.year} dollars.
        </p>
        {blocks.map((b, n) => (
          <BlockView key={b.id} b={b} n={n + 1} />
        ))}
      </section>

      <section id="how-over-time" className="card m-section">
        <h2>4. How the numbers change from year to year</h2>
        <p className="m-explain">
          The same calculation for every year of <strong>{scenario.name}</strong>. Thresholds grow with inflation, required distributions rise as the IRS divisor
          shrinks, and conversions move income between years. Click an age to walk through that year above.
        </p>
        <div className="table-scroll">
          <table className="m-data m-over">
            <thead>
              <tr>
                {overTime.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overTime.rows.map((r, n) => (
                <tr key={n} className={n === kk ? "hl" : ""}>
                  <td>
                    <a
                      href="#how-year"
                      className="link"
                      onClick={() => chooseYear(n)}
                      aria-label={`Show the step-by-step calculation for age ${r[0]}`}
                    >
                      {r[0]}
                    </a>
                  </td>
                  {r.slice(1).map((c, m) => (
                    <td key={m}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="how-end" className="card m-section">
        <h2>5. End of the plan: heirs, after-tax wealth and lifetime totals</h2>
        {ends.map((b) => (
          <BlockView key={b.id} b={b} />
        ))}
      </section>

      <section id="how-choice" className="card m-section">
        <h2>6. How the recommended strategy is chosen</h2>
        <p className="m-explain">
          Every strategy is run through the same year-by-year calculation and ranked by after-tax wealth at age {inputs.lifespan}. The planner tries:
        </p>
        <ul className="m-overview">
          <li>No conversions, taking only required distributions.</li>
          <li>Fixed rules: fill the 12%, 22%, 24% or 32% bracket each year; stay under the first IRMAA tier; spread evenly; convert everything in the first year.</li>
          <li>
            A year-by-year search. It starts from the best “fill a bracket” rule, then, for each year in your conversion window, tries every option (nothing, fill
            any bracket, stay under an IRMAA tier{inputs.aca.enabled ? ", stay under an ACA subsidy level" : ""}, or convert everything) and keeps whichever raises
            after-tax wealth. It repeats until no single-year change helps (up to 6 passes). It is a thorough search, but not a mathematical guarantee of the
            single best schedule.
          </li>
          <li>The same search again with a ceiling of the 12%, 22%, 24% or 32% bracket, to show what keeping your bracket low costs.</li>
        </ul>
        <DataTable
          t={{
            head: ["Strategy", "Highest bracket", "Your lifetime taxes and costs", "Heirs' tax", `After-tax wealth at ${inputs.lifespan}`],
            rows: ranking.map((s) => [
              `${s.name}${s.id === recommended.id ? " (recommended)" : ""}`,
              s.peakBracket > 0 ? pct(s.peakBracket, 0) : "—",
              money(s.ownerCost),
              money(s.heirsTax),
              money(s.legacy),
            ]),
            highlight: ranking.findIndex((s) => s.id === scenario.id),
          }}
        />
      </section>

      <section id="how-law" className="card m-section">
        <h2>7. Tax-law figures used</h2>
        <p className="m-explain">
          2026 federal figures, with the values indexed to {row.year} (the year selected above) using your inflation assumption. The planner assumes current law
          continues.
        </p>
        <div className="m-law-grid">
          {law.map((l) => (
            <div key={l.id}>
              <h3 className="m-sub">{l.title}</h3>
              {l.note && <p className="muted small">{l.note}</p>}
              <DataTable t={l.table} />
            </div>
          ))}
        </div>
      </section>

      <p className="muted small">
        For education only, not tax or investment advice. Simplifications (for example a flat state rate, no itemized deductions, and no surviving-spouse
        change) are listed in docs/ASSUMPTIONS.md in the project repository.
      </p>
    </div>
  );
}
