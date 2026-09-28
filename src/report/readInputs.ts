import type { CellValue, Workbook } from "exceljs";
import type { FilingStatus, IncomeKind, IncomeStream, PlannerInputs, TaxIncreaseMode, TaxPaymentMode } from "@/engine";
import { FILING_LABELS, HIKE_LABELS, INPUT_FIELDS, irrelevantFields, KIND_LABELS, PAYMENT_LABELS, type FieldValue, type InputField } from "./inputFields";

/** A problem that stops the whole import (wrong file, unreadable file). Shown to the user as-is. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

export interface ImportSummary {
  inputs: PlannerInputs;
  /** Number of settings read from the file. */
  fieldsRead: number;
  fieldsTotal: number;
  /** Labels of relevant settings not found (or blank) in the file; their current values were kept. */
  missing: string[];
  /** Labels of newer settings an older report did not contain, set so it is calculated as it originally was. */
  defaulted: string[];
  incomeStreams: number;
  /** Values that were adjusted, rejected, or rows that were skipped. */
  warnings: string[];
  /** True for reports exported before the Field ID column existed. */
  legacyFormat: boolean;
}

type Prim = string | number | boolean | Date | null;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** Reduces any ExcelJS cell value (formula, rich text, hyperlink, ...) to a plain value. */
export function cellPrimitive(v: CellValue | undefined): Prim {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o || "result" in o) return cellPrimitive(o.result as CellValue | undefined);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
    return null; // error values such as #REF!
  }
  return v;
}

const text = (p: Prim) => (p === null || p instanceof Date ? "" : String(p).trim());
const isBlank = (p: Prim) => p === null || (typeof p === "string" && p.trim() === "");
const shown = (p: Prim) => (p instanceof Date ? p.toDateString() : text(p));

function toNumber(p: Prim): { n: number; percent: boolean } | null {
  if (typeof p === "number") return Number.isFinite(p) ? { n: p, percent: false } : null;
  if (typeof p !== "string") return null;
  let s = p.trim().replace(/[$,\s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const percent = s.endsWith("%");
  if (percent) s = s.slice(0, -1);
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s) * (neg ? -1 : 1);
  if (!Number.isFinite(n)) return null;
  return { n: percent ? n / 100 : n, percent };
}

function toYesNo(p: Prim): boolean | null {
  if (typeof p === "boolean") return p;
  if (p === 1 || p === 0) return p === 1;
  const t = norm(text(p));
  if (["yes", "y", "true", "x"].includes(t)) return true;
  if (["no", "n", "false"].includes(t)) return false;
  return null;
}

function toFiling(p: Prim): FilingStatus | null {
  const t = norm(text(p));
  if (t === "single" || t === "s") return "single";
  if (/joint|married|mfj/.test(t)) return "mfj";
  return null;
}

const LEGACY_PAYMENT: Record<string, TaxPaymentMode> = {
  "from other savings (unlimited)": "unlimited",
  "from outside account, then from the ira": "limited",
  unlimited: "unlimited",
  limited: "limited",
  fromira: "fromIra",
};

function toPayment(p: Prim): TaxPaymentMode | null {
  const t = norm(text(p));
  if (!t) return null;
  for (const [mode, label] of Object.entries(PAYMENT_LABELS)) if (norm(label) === t) return mode as TaxPaymentMode;
  if (LEGACY_PAYMENT[t]) return LEGACY_PAYMENT[t];
  if (/then/.test(t)) return "limited";
  if (/unlimited|other savings/.test(t)) return "unlimited";
  if (/no outside|from the ira|^ira$/.test(t)) return "fromIra";
  return null;
}

function toHikeMode(p: Prim): TaxIncreaseMode | null {
  const t = norm(text(p));
  if (!t) return null;
  for (const [mode, label] of Object.entries(HIKE_LABELS)) if (norm(label) === t) return mode as TaxIncreaseMode;
  if (/point|pts|pp/.test(t)) return "points";
  if (/percent|relative|%|of each/.test(t)) return "relative";
  return null;
}

const LEGACY_KIND: Record<string, IncomeKind> = {
  ordinary: "ordinary",
  "interest / non-qualified dividends": "interest",
  "gains / qualified dividends": "qualified",
  "tax-exempt interest": "taxExempt",
  interest: "interest",
  qualified: "qualified",
  taxexempt: "taxExempt",
};

function toKind(p: Prim): IncomeKind | null {
  const t = norm(text(p));
  if (!t) return null;
  for (const [kind, label] of Object.entries(KIND_LABELS)) if (norm(label) === t) return kind as IncomeKind;
  if (LEGACY_KIND[t]) return LEGACY_KIND[t];
  if (/exempt|muni/.test(t)) return "taxExempt";
  if (/interest|non-?qualified/.test(t)) return "interest";
  if (/qualified|gain|dividend/.test(t)) return "qualified";
  if (/ordinary|pension|wage|rent|annuit/.test(t)) return "ordinary";
  return null;
}

type Parsed = { value: FieldValue } | { error: string };

function parseValue(f: InputField, p: Prim, warn: (m: string) => void): Parsed {
  switch (f.kind) {
    case "year":
    case "age":
    case "count": {
      const x = toNumber(p);
      if (!x || x.percent) return { error: `expected a whole number but found "${shown(p)}"` };
      return { value: Math.round(x.n) };
    }
    case "usd": {
      const x = toNumber(p);
      if (!x || x.percent) return { error: `expected a dollar amount but found "${shown(p)}"` };
      return { value: x.n };
    }
    case "usdOrBlank": {
      if (isBlank(p) || /^(estimat|n\/?a$|-$)/i.test(text(p))) return { value: null };
      const x = toNumber(p);
      if (!x || x.percent) return { error: `expected a dollar amount or a blank cell but found "${shown(p)}"` };
      return { value: x.n };
    }
    case "pct": {
      const x = toNumber(p);
      if (!x) return { error: `expected a percentage such as 6% but found "${shown(p)}"` };
      if (!x.percent && Math.abs(x.n) > 1) {
        warn(`${f.label}: read ${x.n} as ${x.n}%.`);
        return { value: x.n / 100 };
      }
      return { value: x.n };
    }
    case "filing": {
      const v = toFiling(p);
      return v ? { value: v } : { error: `expected "${FILING_LABELS.single}" or "${FILING_LABELS.mfj}" but found "${shown(p)}"` };
    }
    case "payment": {
      const v = toPayment(p);
      return v ? { value: v } : { error: `expected one of: ${Object.values(PAYMENT_LABELS).join(" / ")}; found "${shown(p)}"` };
    }
    case "yesno": {
      const v = toYesNo(p);
      return v === null ? { error: `expected Yes or No but found "${shown(p)}"` } : { value: v };
    }
    case "hikeMode": {
      const v = toHikeMode(p);
      return v ? { value: v } : { error: `expected one of: ${Object.values(HIKE_LABELS).join(" / ")}; found "${shown(p)}"` };
    }
  }
}

const LEGACY_STREAM = /^(.*?)\s*·\s*ages\s*(\d+)\s*[–-]\s*(\d+)\s*·\s*(inflation-adjusted|fixed)/i;

/**
 * Reads the settings from the "Inputs" sheet of an Excel report produced by this planner (current or older layout).
 * Settings missing from the file keep their values from `base`; the other-income list is replaced by the file's.
 * Pure: no I/O. Throws ImportError when the workbook is not a planner report.
 */
export function readInputsSheet(wb: Workbook, base: PlannerInputs): ImportSummary {
  const ws = wb.getWorksheet("Inputs") ?? wb.worksheets.find((w) => norm(w.name) === "inputs");
  if (!ws) throw new ImportError('This workbook has no "Inputs" sheet. Choose an Excel report that was downloaded from this planner.');

  const inputs = structuredClone(base);
  const warnings: string[] = [];
  const byKey = new Map(INPUT_FIELDS.map((f) => [f.key, f]));
  const byLabel = new Map(INPUT_FIELDS.map((f) => [norm(f.label), f]));
  const cell = (r: number, c: number) => cellPrimitive(ws.getCell(r, c).value);

  let incomeHeader = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    if (norm(text(cell(r, 1))).startsWith("other income")) {
      incomeHeader = r;
      break;
    }
  }

  const seen = new Set<string>();
  const applied = new Set<string>();
  let keyed = false;
  for (let r = 1; r < (incomeHeader || ws.rowCount + 1); r++) {
    const key = text(cell(r, 4));
    const byK = byKey.get(key);
    if (byK) keyed = true;
    const f = byK ?? byLabel.get(norm(text(cell(r, 1))));
    if (!f || seen.has(f.key)) continue;
    seen.add(f.key);
    const p = cell(r, 2);
    if (isBlank(p) && f.kind !== "usdOrBlank") continue;
    const parsed = parseValue(f, p, (m) => warnings.push(m));
    if ("error" in parsed) {
      warnings.push(`${f.label}: ${parsed.error}; kept the current value.`);
      continue;
    }
    f.set(inputs, parsed.value);
    applied.add(f.key);
  }

  if (applied.size < 5) {
    throw new ImportError("The Inputs sheet in this file does not contain planner settings. Choose an Excel report that was downloaded from this planner.");
  }

  // Settings the file predates: reproduce how the report was calculated at the time.
  const defaulted: string[] = [];
  for (const f of INPUT_FIELDS) {
    if (seen.has(f.key) || !f.legacy) continue;
    f.set(inputs, f.legacy(inputs));
    defaulted.push(f.label);
  }

  // Other income: the file's list replaces the current one.
  const streams: IncomeStream[] = [];
  if (incomeHeader) {
    const legacyIncome = norm(text(cell(incomeHeader, 3))).startsWith("type");
    for (let r = incomeHeader + 1; r <= ws.rowCount; r++) {
      const c = [1, 2, 3, 4, 5, 6, 7].map((n) => cell(r, n));
      if (c.every(isBlank)) continue;
      const skip = (why: string) => warnings.push(`Other income, row ${r}: ${why}; row skipped.`);
      const label = text(c[0]) || "Other income";
      let kind: IncomeKind | null;
      let amount: ReturnType<typeof toNumber>;
      let from: number | null;
      let through: number | null;
      let inflationAdjusted: boolean | null;
      let qbi: boolean | null = false;

      if (legacyIncome) {
        amount = toNumber(c[1]);
        const m = LEGACY_STREAM.exec(text(c[2]));
        if (!m) {
          skip(`could not read "${shown(c[2])}"`);
          continue;
        }
        kind = toKind(m[1]);
        from = Number(m[2]);
        through = Number(m[3]);
        inflationAdjusted = /inflation/i.test(m[4]);
      } else {
        kind = isBlank(c[1]) ? null : toKind(c[1]);
        amount = toNumber(c[2]);
        const age = (p: Prim, fallback: number) => {
          if (isBlank(p)) return fallback;
          const x = toNumber(p);
          return x && !x.percent ? Math.round(x.n) : null;
        };
        from = age(c[3], inputs.currentAge);
        through = age(c[4], inputs.lifespan);
        inflationAdjusted = isBlank(c[5]) ? false : toYesNo(c[5]);
        qbi = isBlank(c[6]) ? false : toYesNo(c[6]);
      }

      if (!kind) {
        skip(isBlank(c[1]) && !legacyIncome ? "the Type is blank" : "the Type was not recognized");
        continue;
      }
      if (!amount || amount.percent) {
        skip(`the amount "${shown(legacyIncome ? c[1] : c[2])}" is not a dollar amount`);
        continue;
      }
      if (from === null || through === null) {
        skip("the From/Through ages must be whole numbers");
        continue;
      }
      if (inflationAdjusted === null) {
        skip('"Inflation-adjusted?" must be Yes or No');
        continue;
      }
      if (qbi === null) {
        skip('"QBI (§199A)?" must be Yes or No');
        continue;
      }
      if (qbi && kind !== "ordinary") {
        warnings.push(`Other income, row ${r}: only ordinary income can be QBI; the QBI mark was ignored.`);
        qbi = false;
      }
      streams.push({ id: `import-${streams.length + 1}`, label, kind, annualAmount: amount.n, startAge: from, endAge: through, inflationAdjusted, ...(qbi ? { qbi: true } : {}) });
    }
  }
  inputs.incomeStreams = streams;

  const irrelevant = irrelevantFields(inputs);
  const failed = new Set(INPUT_FIELDS.filter((f) => seen.has(f.key) && !applied.has(f.key) && warnings.some((w) => w.startsWith(`${f.label}:`))).map((f) => f.key));
  const missing = INPUT_FIELDS.filter((f) => !applied.has(f.key) && !failed.has(f.key) && !irrelevant.has(f.key) && !defaulted.includes(f.label)).map((f) => f.label);

  return {
    inputs,
    fieldsRead: applied.size,
    fieldsTotal: INPUT_FIELDS.length,
    missing,
    defaulted,
    incomeStreams: streams.length,
    warnings,
    legacyFormat: !keyed,
  };
}
