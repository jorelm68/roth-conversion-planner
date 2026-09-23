"use client";

import { useMemo, useState } from "react";
import type { PlannerInputs, PlannerOutput, ScenarioResult, YearRow } from "@/engine";
import { LineChart, StackedBars } from "./charts";
import { money, pct } from "./format";

interface Props {
  output: PlannerOutput;
  inputs: PlannerInputs;
}

interface View {
  federal: number;
  state: number;
  health: number; // IRMAA + lost ACA subsidy
  other: number; // NIIT + early-withdrawal penalty
  owner: number;
  heirs: number;
  allIn: number;
  converted: number;
  trad: number;
  roth: number;
  outside: number;
  legacy: number;
}

function viewOf(s: ScenarioResult, real: boolean, inflation: number): View {
  const d = (k: number) => (real ? 1 / Math.pow(1 + inflation, k) : 1);
  let federal = 0, state = 0, irmaa = 0, aca = 0, niit = 0, pen = 0, converted = 0;
  for (const r of s.rows) {
    const f = d(r.k);
    federal += r.federalTax * f;
    state += r.stateTax * f;
    irmaa += r.irmaa * f;
    aca += r.acaSubsidyLost * f;
    niit += r.niit * f;
    pen += r.penalty * f;
    converted += r.conversion * f;
  }
  const e = real ? 1 / s.inflationFactorAtEnd : 1;
  const owner = federal + state + irmaa + aca + niit + pen;
  const heirs = s.heirsTax * e;
  return {
    federal, state, health: irmaa + aca, other: niit + pen, owner, heirs, allIn: owner + heirs, converted,
    trad: s.tradEnd * e, roth: s.rothEnd * e, outside: s.outsideEnd * e, legacy: s.legacy * e,
  };
}

const bracketLabel = (s: ScenarioResult) => (s.peakBracket > 0 ? pct(s.peakBracket) : "—");

export function Results({ output, inputs }: Props) {
  const [real, setReal] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

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
        <label className="check">
          <input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} />
          <span>Show in today's dollars</span>
        </label>
      </div>
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
              <tr key={r.k} className={r.conversion > 0 ? "conv" : ""}>
                <td>{r.age}</td>
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
