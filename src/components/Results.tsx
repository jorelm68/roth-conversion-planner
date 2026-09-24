"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { explainYear, type PlannerInputs, type PlannerOutput, type ScenarioResult, type TraceLine, type YearRow } from "@/engine";
import { downloadExcelReport } from "@/report/downloadReport";
import { LineChart, StackedBars } from "./charts";
import { money, pct } from "./format";
import { viewOf, type View } from "@/report/metrics";

interface Props {
  output: PlannerOutput;
  inputs: PlannerInputs;
}

const bracketLabel = (s: ScenarioResult) => (s.peakBracket > 0 ? pct(s.peakBracket) : "—");

export function Results({ output, inputs }: Props) {
  const [real, setReal] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const onExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadExcelReport(inputs, output);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const sorted = useMemo(() => output.scenarios.slice().sort((a, b) => b.legacy - a.legacy), [output]);
  const views = useMemo(() => new Map(sorted.map((s) => [s.id, viewOf(s, real, inflationOf(inputs))])), [sorted, real, inputs]);
  const none = sorted.find((s) => s.id === "none")!;
  const rec = sorted.find((s) => s.id === output.recommendedId)!;
  const detail = sorted.find((s) => s.id === (selected ?? output.recommendedId)) ?? rec;
  const vNone = views.get(none.id)!;
  const vRec = views.get(rec.id)!;
  const endAge = inputs.lifespan;
  const unit = real ? "today's dollars" : "future dollars";

  const rows: { label: string; hint?: string; get: (v: View, s: ScenarioResult) => string; strong?: boolean }[] = [
    { label: "Highest tax bracket reached", hint: "Marginal ordinary bracket in any year", get: (_v, s) => bracketLabel(s) },
    { label: "Total converted to Roth", get: (v) => money(v.converted) },
    { label: "Federal income tax", get: (v) => money(v.federal) },
    { label: "State income tax", get: (v) => money(v.state) },
    { label: "Medicare IRMAA + lost ACA subsidy", get: (v) => money(v.health) },
    { label: "NIIT + early-withdrawal penalty", get: (v) => money(v.other) },
    { label: "Total lifetime taxes & costs (you)", get: (v) => money(v.owner), strong: true },
    { label: "Tax your heirs pay on remaining IRA", hint: "Present value at your death (10-year rule)", get: (v) => money(v.heirs) },
    { label: "Total incl. heirs", get: (v) => money(v.allIn), strong: true },
    { label: `Roth IRA at ${endAge}`, get: (v) => money(v.roth) },
    { label: `Traditional IRA at ${endAge}`, get: (v) => money(v.trad) },
    { label: `Outside account at ${endAge}`, hint: "Negative = extra savings needed for taxes", get: (v) => money(v.outside) },
    { label: `After-tax wealth at ${endAge}`, hint: "Roth + outside + Traditional net of heirs' tax", get: (v) => money(v.legacy), strong: true },
    { label: "Difference vs. no conversions", get: (v) => signed(v.legacy - vNone.legacy), strong: true },
  ];

  return (
    <div className="results">
      <div className="hero">
        <div>
          <p className="eyebrow">Recommended strategy</p>
          <h2>{rec.name}</h2>
          <p className="muted">{rec.description}</p>
        </div>
        <dl className="hero-stats">
          <div>
            <dt>After-tax wealth at {endAge}</dt>
            <dd>{money(vRec.legacy)}</dd>
          </div>
          <div>
            <dt>vs. no conversions</dt>
            <dd className={vRec.legacy - vNone.legacy >= 0 ? "good" : "bad"}>{signed(vRec.legacy - vNone.legacy)}</dd>
          </div>
          <div>
            <dt>Lifetime taxes &amp; costs (you + heirs)</dt>
            <dd>{money(vRec.allIn)}</dd>
            <dd className="sub">vs. {money(vNone.allIn)} with no conversions</dd>
          </div>
          <div>
            <dt>Highest bracket</dt>
            <dd>{bracketLabel(rec)}</dd>
          </div>
        </dl>
      </div>

      {output.warnings.map((w) => (
        <p className="warn" key={w}>{w}</p>
      ))}

      <div className="toolbar">
        <h2>Strategies side by side</h2>
        <div className="toolbar-actions">
          <label className="check">
            <input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} />
            <span>Show in today's dollars</span>
          </label>
          <button type="button" className="btn" disabled={exporting} onClick={onExport}>
            {exporting ? "Building report…" : "Download Excel report"}
          </button>
        </div>
      </div>
      {exportError && <p className="warn">Could not build the report: {exportError}</p>}
      <p className="muted small">
        The report is built in your browser and saved to your device; nothing is uploaded. It contains your personal financial details, so store it accordingly.
      </p>
      <p className="muted small">All amounts in {unit}. Click a column heading to see its year-by-year schedule below.</p>
      <div className="table-scroll">
        <table className="compare">
          <thead>
            <tr>
              <th />
              {sorted.map((s) => (
                <th key={s.id} className={s.id === detail.id ? "sel" : ""}>
                  <button type="button" onClick={() => setSelected(s.id)}>
                    {s.id === output.recommendedId && <span className="badge">Best</span>}
                    {s.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.strong ? "strong" : ""}>
                <th scope="row">
                  {r.label}
                  {r.hint && <span className="hint">{r.hint}</span>}
                </th>
                {sorted.map((s) => (
                  <td key={s.id} className={s.id === detail.id ? "sel" : ""}>{r.get(views.get(s.id)!, s)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Detail s={detail} real={real} inputs={inputs} />
    </div>
  );
}

const inflationOf = (i: PlannerInputs) => i.inflation;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

function Detail({ s, real, inputs }: { s: ScenarioResult; real: boolean; inputs: PlannerInputs }) {
  const [openK, setOpenK] = useState<number | null>(null);
  useEffect(() => setOpenK(null), [s.id]);
  const f = (r: YearRow, v: number) => (real ? v / Math.pow(1 + inputs.inflation, r.k) : v);
  const bars = s.rows.map((r) => ({
    x: r.age,
    parts: [
      { value: f(r, r.rmd), color: "var(--c-rmd)", label: "RMD" },
      { value: f(r, r.conversion), color: "var(--c-conv)", label: "Roth conversion" },
    ],
  }));
  const lines = [
    { name: "Traditional IRA", color: "var(--c-conv)", points: s.rows.map((r) => ({ x: r.age, y: f(r, r.tradEnd) })) },
    { name: "Roth IRA", color: "var(--c-roth)", points: s.rows.map((r) => ({ x: r.age, y: f(r, r.rothEnd) })) },
  ];
  const taxBars = s.rows.map((r) => ({
    x: r.age,
    parts: [
      { value: f(r, r.federalTax), color: "var(--c-fed)", label: "Federal tax" },
      { value: f(r, r.stateTax + r.niit + r.penalty), color: "var(--c-state)", label: "State/NIIT/penalty" },
      { value: f(r, r.irmaa + r.acaSubsidyLost), color: "var(--c-health)", label: "IRMAA + lost ACA subsidy" },
    ],
  }));

  return (
    <section className="detail">
      <h2>{s.name}: year by year</h2>
      <p className="muted">{s.description}</p>
      <div className="charts">
        <div>
          <h3>Distributions per year</h3>
          <StackedBars data={bars} legend={[{ name: "Required distribution (RMD)", color: "var(--c-rmd)" }, { name: "Roth conversion", color: "var(--c-conv)" }]} />
        </div>
        <div>
          <h3>Account balances</h3>
          <LineChart series={lines} />
        </div>
        <div>
          <h3>Taxes and costs per year</h3>
          <StackedBars
            data={taxBars}
            legend={[
              { name: "Federal income tax", color: "var(--c-fed)" },
              { name: "State, NIIT, penalty", color: "var(--c-state)" },
              { name: "IRMAA + lost ACA subsidy", color: "var(--c-health)" },
            ]}
          />
        </div>
      </div>

      <p className="muted small">Click any year to see the full step-by-step calculation behind it.</p>
      {openK !== null && s.rows.some((r) => r.k === openK) && (
        <YearTraceView inputs={inputs} scenario={s} k={openK} onClose={() => setOpenK(null)} onMove={setOpenK} />
      )}
      <div className="table-scroll">
        <table className="years">
          <thead>
            <tr>
              <th>Age</th>
              <th>Year</th>
              <th>RMD</th>
              <th>Roth conversion</th>
              <th>Taxable SS</th>
              <th>Taxable income</th>
              <th>Bracket</th>
              <th title="Federal + state + Social Security torpedo + NIIT on the next dollar of IRA income">All-in marginal rate</th>
              <th>Federal tax</th>
              <th>State tax</th>
              <th>IRMAA</th>
              <th>ACA subsidy lost</th>
              <th>Traditional IRA</th>
              <th>Roth IRA</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.k} className={`${r.conversion > 0 ? "conv" : ""} ${r.k === openK ? "open" : ""}`} onClick={() => setOpenK(r.k)}>
                <td>
                  <button type="button" className="link year-link" onClick={() => setOpenK(r.k)} aria-label={`Show the calculation for age ${r.age}`}>
                    {r.age}
                  </button>
                </td>
                <td>{r.year}</td>
                <td>{money(f(r, r.rmd))}</td>
                <td>{money(f(r, r.conversion))}</td>
                <td>{money(f(r, r.taxableSocialSecurity))}</td>
                <td>{money(f(r, r.taxableIncome))}</td>
                <td>{pct(r.marginalBracket)}</td>
                <td className={r.marginalAllIn > r.marginalBracket + 0.03 ? "torpedo" : ""}>{pct(r.marginalAllIn, 1)}</td>
                <td>{money(f(r, r.federalTax))}</td>
                <td>{money(f(r, r.stateTax))}</td>
                <td>{money(f(r, r.irmaa))}</td>
                <td>{money(f(r, r.acaSubsidyLost))}</td>
                <td>{money(f(r, r.tradEnd))}</td>
                <td>{money(f(r, r.rothEnd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function fmtLine(l: TraceLine): string {
  if (l.fmt === "text") return String(l.value);
  const v = l.value as number;
  if (l.fmt === "usd") return money(v);
  if (l.fmt === "pct") return pct(v, 2);
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

const KEY_LINES = new Set(["federalTax", "agi", "conversion", "rmd", "taxableIncome", "totalCost"]);

function YearTraceView({ inputs, scenario, k, onClose, onMove }: { inputs: PlannerInputs; scenario: ScenarioResult; k: number; onClose: () => void; onMove: (k: number) => void }) {
  const sections = useMemo(() => explainYear(inputs, scenario.plan, k), [inputs, scenario, k]);
  const row = scenario.rows.find((r) => r.k === k)!;
  const ks = scenario.rows.map((r) => r.k);
  const idx = ks.indexOf(k);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [k]);

  return (
    <section className="trace" ref={ref} aria-label={`Calculation for age ${row.age}`}>
      <div className="trace-head">
        <div>
          <h3>
            Age {row.age} · tax year {row.year} · {scenario.name}
          </h3>
          <p className="muted small">Every step below is computed by the same engine that produced the table. Amounts are in {row.year} dollars.</p>
        </div>
        <div className="trace-nav">
          <button type="button" className="btn secondary" disabled={idx <= 0} onClick={() => onMove(ks[idx - 1])}>← Previous year</button>
          <button type="button" className="btn secondary" disabled={idx >= ks.length - 1} onClick={() => onMove(ks[idx + 1])}>Next year →</button>
          <button type="button" className="btn secondary" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="trace-sections">
        {sections.map((sec) => (
          <table key={sec.title} className="trace-table">
            <caption>{sec.title}</caption>
            <tbody>
              {sec.lines.map((l, i) => (
                <tr key={i} className={l.key && KEY_LINES.has(l.key) ? "key" : ""}>
                  <th scope="row">{l.label}</th>
                  <td>{fmtLine(l)}</td>
                  <td className="how">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
