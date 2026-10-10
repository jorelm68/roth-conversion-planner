"use client";

import { HowItWorksView } from "@/components/HowItWorksView";
import { ImportSettings } from "@/components/ImportSettings";
import { InputForm } from "@/components/InputForm";
import { Results } from "@/components/Results";
import { usePlannerContext } from "@/components/PlannerProvider";
import { HOW_HASH, useHashView } from "@/components/useHashView";

export default function Home() {
  const { inputs, patch, replace, reset, output, running, progress, label, errors } = usePlannerContext();
  const { view } = useHashView();

  return (
    <>
    {/* The planner stays mounted while the formulas view is open, so everything is as you left it when you return. */}
    <main hidden={view !== "planner"}>
      <header className="top">
        <h1 className="brand">
          <img src="/logo.svg" alt="" width={40} height={40} />
          Tax Conversion Planner
        </h1>
        <p>
          Finds the year-by-year Traditional → Roth IRA conversion schedule that maximizes your after-tax wealth, weighing brackets, the Social Security tax
          torpedo, Medicare IRMAA, ACA subsidies, RMDs and what your heirs will owe. <strong>Everything runs in your browser. Nothing is sent or stored.</strong>
        </p>
      </header>

      <ImportSettings current={inputs} onImport={replace} />

      <InputForm inputs={inputs} onChange={patch} onReset={reset} />

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
          For education only, not tax or investment advice. Assumes 2026 federal tax law, indexed for inflation, and that today&apos;s rules stay in place. See{" "}
          <a href={HOW_HASH}>How it&apos;s calculated</a> for every formula with your numbers. Confirm any plan with a CPA or fiduciary advisor.
        </p>
      </footer>
    </main>
    {view === "how" && <HowItWorksView />}
    </>
  );
}
