"use client";

import { Methodology } from "./Methodology";
import { usePlannerContext } from "./PlannerProvider";
import { HOW_HASH } from "./useHashView";

/** The "How it's calculated" view: every formula, worked through with the numbers currently in the planner. */
export function HowItWorksView() {
  const { output, outputInputs, running, errors, isExample } = usePlannerContext();

  return (
    <main className="how" id={HOW_HASH.slice(1)}>
      <nav className="how-top no-print">
        <a href="#planner" className="link">
          ← Back to the planner
        </a>
        <button type="button" className="btn secondary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </nav>

      <header className="top">
        <h1>How the numbers are calculated</h1>
        <p>
          Every formula the planner uses, worked through with your numbers. Choose a strategy and a year to see each step from income to taxes to account
          balances, then how the end result is reached. <strong>This page runs in your browser like the planner. Nothing is sent or stored.</strong>
        </p>
      </header>

      {isExample && (
        <p className="warn">
          You are looking at the planner&apos;s <strong>example values</strong>. Enter or import your own numbers on the <a href="#planner">planner</a>, then come
          back here. Reloading the page also returns to the example values, because nothing is saved.
        </p>
      )}
      {errors.length > 0 && (
        <div className="error">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
          <p>
            Fix these on the <a href="#planner">planner</a> first.
          </p>
        </div>
      )}
      {running && output && <p className="muted small">Recalculating with your latest changes… The page below still shows the previous results.</p>}
      {!output || !outputInputs ? errors.length === 0 && <p className="muted">Calculating…</p> : <Methodology output={output} inputs={outputInputs} />}
    </main>
  );
}
