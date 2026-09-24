import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The formulas view is chosen by the URL hash (see useHashView). Any in-page link inside it must start with
 * "#how", otherwise clicking it would switch back to the planner. "#planner" is the one intentional exit.
 */
describe("How it's calculated view", () => {
  it("keeps every in-page link inside the view", () => {
    const src = ["Methodology.tsx", "HowItWorksView.tsx"].map((f) => readFileSync(join(__dirname, "..", "components", f), "utf8")).join("\n");
    const hrefs = [...src.matchAll(/href="(#[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(5);
    expect(hrefs.filter((h) => !h.startsWith("#how") && h !== "#planner")).toEqual([]);
  });

  it("gives every section a matching #how id", () => {
    const src = readFileSync(join(__dirname, "..", "components", "Methodology.tsx"), "utf8");
    const targets = [...src.matchAll(/href="#(how-[^"]*)"/g)].map((m) => m[1]);
    for (const t of targets) expect(src).toContain(`id="${t}"`);
  });
});
