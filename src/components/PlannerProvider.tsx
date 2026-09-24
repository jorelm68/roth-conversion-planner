"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultInputs, type PlannerInputs } from "@/engine";
import { usePlanner, type PlannerState } from "./usePlanner";

/**
 * Holds the planner's inputs and results in memory for the whole app, so moving between the planner and the
 * "How it's calculated" page keeps your numbers without storing them anywhere (no URL, cookies or storage).
 * Reloading the page starts over from the example values.
 */
interface PlannerContextValue extends PlannerState {
  inputs: PlannerInputs;
  /** True until the user changes or imports anything (the page shows the example values). */
  isExample: boolean;
  patch: (p: Partial<PlannerInputs>) => void;
  replace: (i: PlannerInputs) => void;
  reset: () => void;
  /** Strategy and year the user is looking at, shared by both pages. */
  scenarioId: string | null;
  setScenarioId: (id: string | null) => void;
  focusK: number | null;
  setFocusK: (k: number | null) => void;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState<PlannerInputs>(() => defaultInputs());
  const [isExample, setIsExample] = useState(true);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [focusK, setFocusK] = useState<number | null>(null);
  const planner = usePlanner(inputs);

  const patch = useCallback((p: Partial<PlannerInputs>) => {
    setInputs((prev) => ({ ...prev, ...p }));
    setIsExample(false);
  }, []);
  const replace = useCallback((i: PlannerInputs) => {
    setInputs(i);
    setIsExample(false);
  }, []);
  const reset = useCallback(() => {
    setInputs(defaultInputs());
    setIsExample(true);
  }, []);

  const value = useMemo(
    () => ({ ...planner, inputs, isExample, patch, replace, reset, scenarioId, setScenarioId, focusK, setFocusK }),
    [planner, inputs, isExample, patch, replace, reset, scenarioId, focusK],
  );
  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlannerContext(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlannerContext must be used inside <PlannerProvider>");
  return ctx;
}
