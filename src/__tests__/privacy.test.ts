import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the privacy promise: user input never leaves the browser and is never persisted.
 * If one of these tests fails, a change would have introduced a way for personal data to be sent or stored.
 * Read docs/PRIVACY.md before relaxing anything here.
 */

const root = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.(ts|tsx|css)$/.test(name) ? [p] : [];
  });
}

const files = sourceFiles(join(root, "src"));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, "network request (fetch)"],
  [/XMLHttpRequest/, "network request (XMLHttpRequest)"],
  [/sendBeacon/, "beacon upload"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/localStorage/, "localStorage"],
  [/sessionStorage/, "sessionStorage"],
  [/indexedDB/, "IndexedDB"],
  [/document\.cookie/, "cookies"],
  [/caches\.open|serviceWorker/, "cache / service worker"],
  [/history\.(push|replace)State|location\.(search|hash|href)\s*=/, "writing input into the URL"],
  [/https?:\/\//, "an external URL"],
  [/navigator\.(clipboard|share)/, "clipboard / share APIs"],
];

describe("privacy guarantees", () => {
  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const [pattern, what] of FORBIDDEN) {
    it(`source code contains no ${what}`, () => {
      const offenders = files.filter((f) => pattern.test(stripComments(readFileSync(f, "utf8"))));
      expect(offenders).toEqual([]);
    });
  }

  it("has no analytics, telemetry or error-reporting dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const banned = /analytics|speed-insights|posthog|sentry|mixpanel|segment|amplitude|hotjar|datadog|logrocket|fullstory|bugsnag|rollbar|gtag|plausible|clarity/i;
    expect(deps.filter((d) => banned.test(d))).toEqual([]);
  });

  it("ships a Content-Security-Policy that blocks all network connections", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    const csp: string = vercel.headers.flatMap((h: { headers: { key: string; value: string }[] }) => h.headers).find((h: { key: string }) => h.key === "Content-Security-Policy").value;
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("is a static export (no server code that could receive data)", () => {
    const cfg = readFileSync(join(root, "next.config.ts"), "utf8");
    expect(cfg).toMatch(/output:\s*"export"/);
  });
});
