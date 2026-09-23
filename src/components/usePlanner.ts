"use client";

import { useEffect, useRef, useState } from "react";
import { runPlanner, validateInputs, type PlannerInputs } from "@/engine";
import type { PlannerOutput } from "@/engine";
import type { WorkerMessage } from "@/engine/workerTypes";

export interface PlannerState {
  output: PlannerOutput | null;
  running: boolean;
  progress: number;
  label: string;
  errors: string[];
}

/**
 * Runs the planner in a Web Worker (falling back to the main thread) whenever the inputs change.
 * Nothing leaves the browser: no network calls, no storage.
 */
export function usePlanner(inputs: PlannerInputs, debounceMs = 500): PlannerState {
  const [state, setState] = useState<PlannerState>({ output: null, running: false, progress: 0, label: "", errors: [] });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const errors = validateInputs(inputs);
    if (errors.length) {
      setState((s) => ({ ...s, running: false, errors }));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      workerRef.current?.terminate();
      setState((s) => ({ ...s, running: true, progress: 0, label: "Starting…", errors: [] }));

      const fallback = () => {
        setTimeout(() => {
          if (cancelled) return;
          try {
            const output = runPlanner(inputs);
            setState({ output, running: false, progress: 1, label: "", errors: [] });
          } catch (e) {
            setState((s) => ({ ...s, running: false, errors: [e instanceof Error ? e.message : String(e)] }));
          }
        }, 0);
      };

      try {
        const worker = new Worker(new URL("../engine/planner.worker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;
        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
          if (cancelled) return;
          const m = e.data;
          if (m.type === "progress") setState((s) => ({ ...s, progress: m.fraction, label: m.label }));
          else if (m.type === "done") {
            setState({ output: m.output, running: false, progress: 1, label: "", errors: [] });
            worker.terminate();
          } else {
            setState((s) => ({ ...s, running: false, errors: [m.message] }));
            worker.terminate();
          }
        };
        worker.onerror = () => {
          worker.terminate();
          fallback();
        };
        worker.postMessage(inputs);
      } catch {
        fallback();
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      workerRef.current?.terminate();
    };
  }, [inputs, debounceMs]);

  return state;
}
