/// <reference lib="webworker" />
import { runPlanner } from "./planner";
import type { PlannerInputs } from "./types";
import type { WorkerMessage } from "./workerTypes";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<PlannerInputs>) => {
  try {
    const output = runPlanner(e.data, (fraction, label) => ctx.postMessage({ type: "progress", fraction, label } satisfies WorkerMessage));
    ctx.postMessage({ type: "done", output } satisfies WorkerMessage);
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) } satisfies WorkerMessage);
  }
};
