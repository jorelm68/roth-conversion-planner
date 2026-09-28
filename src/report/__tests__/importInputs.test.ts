import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { defaultInputs, runPlanner, type PlannerInputs } from "@/engine";
import { buildWorkbook } from "../buildWorkbook";
import { INPUT_FIELDS } from "../inputFields";
import { ImportError, readInputsSheet } from "../readInputs";

const custom: PlannerInputs = {
  ...defaultInputs(),
  birthYear: 1963,
  currentAge: 63,
  filingStatus: "mfj",
  spouseBirthYear: 1966,
  stateTaxRate: 0.0425,
  tradIraBalance: 1_234_567,
  tradIraBasis: 12_000,
  rothBalance: 250_000,
  outsideBalance: 400_000,
  paymentMode: "limited",
  wagesAnnual: 80_000,
  retirementAge: 65,
  socialSecurityAnnual: 48_000,
  socialSecurityStartAge: 68,
  conversionStartAge: 64,
  lastConversionAge: 80,
  lifespan: 92,
  investmentReturn: 0.055,
  outsideReturn: 0.035,
  inflation: 0.0275,
  outsideTaxDrag: 0.006,
  expenses: { enabled: true, monthly: 12_500 },
  taxIncrease: { enabled: true, startYear: 2030, mode: "points", amount: 0.03, threshold: 250_000 },
  aca: { enabled: true, benchmarkPremium: 15_500, premiumGrowth: 0.045 },
  priorMagi1: 150_000,
  priorMagi2: null,
  heirs: { count: 3, otherIncome: 120_000, stateTaxRate: 0.05 },
  incomeStreams: [
    { id: "a", label: "Pension", kind: "ordinary", annualAmount: 24_000, startAge: 65, endAge: 92, inflationAdjusted: false, qbi: true },
    { id: "b", label: "Brokerage dividends", kind: "qualified", annualAmount: 9_000, startAge: 63, endAge: 92, inflationAdjusted: true },
    { id: "c", label: "Munis", kind: "taxExempt", annualAmount: 4_000, startAge: 63, endAge: 80, inflationAdjusted: true },
  ],
};

const stripIds = (i: PlannerInputs) => ({ ...i, incomeStreams: i.incomeStreams.map(({ id: _id, ...rest }) => rest) });

async function exportReport(i: PlannerInputs): Promise<ExcelJS.Workbook> {
  const wb = buildWorkbook(new ExcelJS.Workbook(), i, runPlanner(i));
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return back;
}

async function saveAndReload(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const back = new ExcelJS.Workbook();
  await back.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return back;
}

/** Row number of a setting on the Inputs sheet, found by its Field ID. */
function rowOf(ws: ExcelJS.Worksheet, key: string): number {
  for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 4).value === key) return r;
  throw new Error(`no row for ${key}`);
}

function incomeHeaderRow(ws: ExcelJS.Worksheet): number {
  for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, 1).value ?? "").startsWith("Other income")) return r;
  throw new Error("no income header");
}

describe("importing settings from an Excel report", () => {
  it("round-trips every setting exactly", async () => {
    const wb = await exportReport(custom);
    const res = readInputsSheet(wb, defaultInputs());
    expect(stripIds(res.inputs)).toEqual(stripIds(custom));
    expect(res.fieldsRead).toBe(INPUT_FIELDS.length);
    expect(res.missing).toEqual([]);
    expect(res.defaulted).toEqual([]);
    expect(res.warnings).toEqual([]);
    expect(res.incomeStreams).toBe(3);
    expect(res.legacyFormat).toBe(false);
  });

  it("round-trips the default inputs (single filer, no other income, estimated MAGI)", async () => {
    const i = { ...defaultInputs(), birthYear: 1964, currentAge: 62 };
    const res = readInputsSheet(await exportReport(i), { ...custom });
    expect(stripIds(res.inputs)).toEqual(stripIds(i));
    expect(res.inputs.priorMagi1).toBeNull();
  });

  it("applies values edited in Excel, including loosely typed ones", async () => {
    const wb = await exportReport(custom);
    const ws = wb.getWorksheet("Inputs")!;
    ws.getCell(rowOf(ws, "tradIraBalance"), 2).value = "$1,500,000";
    ws.getCell(rowOf(ws, "investmentReturn"), 2).value = 7; // typed without a percent sign
    ws.getCell(rowOf(ws, "inflation"), 2).value = "3%";
    ws.getCell(rowOf(ws, "filingStatus"), 2).value = "Single";
    ws.getCell(rowOf(ws, "paymentMode"), 2).value = "From the IRA (no outside funds)";
    ws.getCell(rowOf(ws, "aca.enabled"), 2).value = "no";
    ws.getCell(rowOf(ws, "lifespan"), 2).value = { formula: "90+5", result: 95 };
    ws.getCell(rowOf(ws, "priorMagi1"), 2).value = null;
    ws.getCell(rowOf(ws, "priorMagi2"), 2).value = 175_000;
    ws.getCell(rowOf(ws, "taxIncrease.mode"), 2).value = "percent of each rate";
    ws.getCell(rowOf(ws, "expenses.monthly"), 2).value = "$20,000";
    // Edit one income row, remove one, add one in a spare row.
    const h = incomeHeaderRow(ws);
    ws.getCell(h + 1, 3).value = 30_000;
    for (let c = 1; c <= 6; c++) ws.getCell(h + 2, c).value = null;
    const add = h + 4;
    ["Rental", "Ordinary (pension/wages/rental)", 12_000, 70, 85, "Yes", "no"].forEach((v, c) => (ws.getCell(add, c + 1).value = v));

    const res = readInputsSheet(await saveAndReload(wb), defaultInputs());
    const i = res.inputs;
    expect(i.tradIraBalance).toBe(1_500_000);
    expect(i.investmentReturn).toBeCloseTo(0.07, 10);
    expect(i.inflation).toBeCloseTo(0.03, 10);
    expect(i.filingStatus).toBe("single");
    expect(i.paymentMode).toBe("fromIra");
    expect(i.aca.enabled).toBe(false);
    expect(i.lifespan).toBe(95);
    expect(i.priorMagi1).toBeNull();
    expect(i.priorMagi2).toBe(175_000);
    expect(i.taxIncrease.mode).toBe("relative");
    expect(i.expenses.monthly).toBe(20_000);
    expect(res.warnings.some((w) => w.includes("Investment return") && w.includes("7%"))).toBe(true);
    expect(i.incomeStreams.map((s) => [s.label, s.kind, s.annualAmount, s.startAge, s.endAge, s.inflationAdjusted])).toEqual([
      ["Pension", "ordinary", 30_000, 65, 92, false],
      ["Munis", "taxExempt", 4_000, 63, 80, true],
      ["Rental", "ordinary", 12_000, 70, 85, true],
    ]);
    expect(i.incomeStreams.map((s) => !!s.qbi)).toEqual([true, false, false]);
  });

  it("keeps current values for invalid or missing settings and says so", async () => {
    const wb = await exportReport(custom);
    const ws = wb.getWorksheet("Inputs")!;
    ws.getCell(rowOf(ws, "rothBalance"), 2).value = "lots";
    ws.getCell(rowOf(ws, "filingStatus"), 2).value = "Head of household";
    ws.spliceRows(rowOf(ws, "outsideBalance"), 1);
    ws.getCell(rowOf(ws, "wagesAnnual"), 2).value = null;
    const h = incomeHeaderRow(ws);
    ws.getCell(h + 1, 2).value = "Lottery";

    const base = { ...defaultInputs(), rothBalance: 11, outsideBalance: 22, wagesAnnual: 33 };
    const res = readInputsSheet(await saveAndReload(wb), base);
    expect(res.inputs.rothBalance).toBe(11);
    expect(res.inputs.outsideBalance).toBe(22);
    expect(res.inputs.wagesAnnual).toBe(33);
    expect(res.inputs.filingStatus).toBe(base.filingStatus);
    expect(res.missing).toEqual(expect.arrayContaining(["Outside (taxable) account balance", "Annual wages (today's $)"]));
    expect(res.missing).not.toContain("Roth IRA balance"); // reported as a warning instead
    expect(res.warnings.some((w) => w.startsWith("Roth IRA balance:") && w.includes('"lots"'))).toBe(true);
    expect(res.warnings.some((w) => w.startsWith("Filing status:"))).toBe(true);
    expect(res.warnings.some((w) => w.startsWith(`Other income, row ${h + 1}`))).toBe(true);
    expect(res.inputs.incomeStreams.map((s) => s.label)).toEqual(["Brokerage dividends", "Munis"]);
  });

  it("reads reports exported before the Field ID column existed", async () => {
    // Replica of the original Inputs sheet layout.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inputs");
    ws.addRow(["Input", "Value", "Notes"]);
    const rows: [string, string | number][] = [
      ["Birth year", 1963], ["Current age", 63], ["Plan starts in tax year", 2026], ["Filing status", "Married filing jointly"],
      ["Spouse birth year", 1966], ["State income tax rate", 0.0425], ["Traditional IRA balance", 1_234_567],
      ["After-tax basis in Traditional IRAs", 12_000], ["Roth IRA balance", 250_000], ["Outside (taxable) account balance", 400_000],
      ["How conversion taxes are paid", "From outside account, then from the IRA"], ["Annual wages (today's $)", 80_000], ["Retirement age", 65],
      ["Social Security, household per year (today's $)", 48_000], ["Social Security start age", 68], ["Start converting at age", 64],
      ["Last conversion age", 80], ["Estimated lifespan (wealth evaluated at age)", 92], ["Investment return (nominal)", 0.055],
      ["Inflation", 0.0275], ["Tax drag on outside account", 0.006], ["ACA marketplace insurance before Medicare", "Yes"],
      ["ACA benchmark premium per year (today's $)", 15_500], ["ACA premium growth", 0.045], ["MAGI last year (IRMAA look-back)", 150_000],
      ["MAGI two years ago (IRMAA look-back)", "estimated"], ["Number of heirs", 3], ["Each heir's other taxable income (today's $)", 120_000],
      ["Heirs' state tax rate", 0.05],
    ];
    for (const r of rows) ws.addRow(r);
    ws.addRow([]);
    ws.addRow(["Other income", "Amount / year", "Type · ages · inflation-adjusted"]);
    ws.addRow(["Pension", 24_000, "Ordinary · ages 65–92 · fixed"]);
    ws.addRow(["Brokerage dividends", 9_000, "Gains / qualified dividends · ages 63–92 · inflation-adjusted"]);
    ws.addRow(["Munis", 4_000, "Tax-exempt interest · ages 63–80 · inflation-adjusted"]);

    const res = readInputsSheet(await saveAndReload(wb), defaultInputs());
    expect(res.legacyFormat).toBe(true);
    // Settings added later are set so the old report is recalculated as it originally was.
    const asOriginally: PlannerInputs = {
      ...custom,
      outsideReturn: custom.investmentReturn,
      expenses: { ...defaultInputs().expenses, enabled: false },
      taxIncrease: { ...defaultInputs().taxIncrease, enabled: false },
      incomeStreams: custom.incomeStreams.map(({ qbi: _q, ...rest }) => rest),
    };
    expect(stripIds(res.inputs)).toEqual(stripIds(asOriginally));
    expect(res.defaulted).toEqual(expect.arrayContaining(["Outside account return (nominal)", "Model living expenses", "Model a future tax-rate increase"]));
    expect(res.missing).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it("rejects workbooks that are not planner reports", async () => {
    const none = new ExcelJS.Workbook();
    none.addWorksheet("Budget").addRow(["Rent", 2000]);
    expect(() => readInputsSheet(none, defaultInputs())).toThrow(ImportError);

    const wrong = new ExcelJS.Workbook();
    wrong.addWorksheet("Inputs").addRow(["Something else", 1]);
    expect(() => readInputsSheet(wrong, defaultInputs())).toThrow(/does not contain planner settings/);
  });

  it("reads a full default report quickly enough for the browser", async () => {
    const i = { ...defaultInputs(), birthYear: 1964, currentAge: 62 };
    const buf = await buildWorkbook(new ExcelJS.Workbook(), i, runPlanner(i)).xlsx.writeBuffer();
    const t = Date.now();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    readInputsSheet(wb, defaultInputs());
    const ms = Date.now() - t;
    console.log(`report ${Math.round((buf as ArrayBuffer).byteLength / 1024)} KB, load + parse ${ms} ms`);
    expect(ms).toBeLessThan(20_000);
  });
});
