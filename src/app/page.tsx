"use client";

import { useCallback, useState } from "react";
import { defaultInputs, type PlannerInputs } from "@/engine";
import { ImportSettings } from "@/components/ImportSettings";
import { InputForm } from "@/components/InputForm";
import { Results } from "@/components/Results";
import { usePlanner } from "@/components/usePlanner";

export default function Home() {
  const [inputs, setInputs] = useState<PlannerInputs>(() => defaultInputs());
  const patch = useCallback((p: Partial<PlannerInputs>) => setInputs((prev) => ({ ...prev, ...p })), []);
  const { output, running, progress, label, errors } = usePlanner(inputs);

  return (
    <main>
      <header className="top">
        <h1>Roth Conversion Planner</h1>
        <p>
          Finds the year-by-year Traditional → Roth IRA conversion schedule that maximizes your after-tax wealth, weighing brackets, the Social Security tax
          torpedo, Medicare IRMAA, ACA subsidies, RMDs and what your heirs will owe. <strong>Everything runs in your browser. Nothing is sent or stored.</strong>
        </p>
      </header>

      <ImportSettings current={inputs} onImport={setInputs} />

      <InputForm inputs={inputs} onChange={patch} onReset={() => setInputs(defaultInputs())} />

      <div className="status" aria-live="polite">
        {errors.length > 0 && (
          <div className="error">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        {running && (
          <div className="progress">
            <div className="bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>Calculating… {label}</span>
          </div>
        )}
      </div>

      {output && errors.length === 0 && (
        <div className={running ? "stale" : ""}>
          <Results output={output} inputs={inputs} />
        </div>
      )}

      <footer>
        <p>
          For education only, not tax or investment advice. Uses 2026 federal law (brackets, standard and senior deductions, IRMAA, ACA subsidy schedule, Uniform
          Lifetime Table) indexed for inflation, and assumes today's rules stay in place. See <code>docs/ASSUMPTIONS.md</code> for every modeling assumption and <code>docs/PRIVACY.md</code> for how your data is handled. Confirm any plan with a CPA or fiduciary advisor.
        </p>
      </footer>
    </main>
  );
}
