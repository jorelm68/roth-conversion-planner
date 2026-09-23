import type { PlannerOutput } from "./planner";

export type WorkerMessage =
  | { type: "progress"; fraction: number; label: string }
  | { type: "done"; output: PlannerOutput }
  | { type: "error"; message: string };
