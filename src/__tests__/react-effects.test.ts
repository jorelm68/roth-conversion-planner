import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * React treats whatever an effect returns as its cleanup function. An expression-bodied arrow such as
 * `useEffect(() => el.scrollIntoView(...))` returns that call's result; scrollIntoView returns a Promise in
 * newer browsers, and React then crashed with "destroy is not a function" when the effect re-ran
 * (this broke "Next year" in the calculation panel). Effects must use a block body.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("React effects", () => {
  it("never use an expression-bodied arrow (its value would become the cleanup function)", () => {
    const offenders = files(join(__dirname, ".."))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, n) => ({ f, n: n + 1, line }))
          .filter(({ line }) => /use(Layout)?Effect\(\s*(async\s*)?\([^)]*\)\s*=>\s*[^{\s]/.test(line)),
      )
      .map(({ f, n, line }) => `${f}:${n}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });
});
