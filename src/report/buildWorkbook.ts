import type { Workbook, Worksheet } from "exceljs";
import { explainYear, type PlannerInputs, type PlannerOutput, type ScenarioResult } from "@/engine";
import { viewOf, type View } from "./metrics";

const USD = '"$"#,##0;[Red]-"$"#,##0';
const PCT = "0.0%";
const NUM = "#,##0.00";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } } as const;
const BAND_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } } as const;

function styleHeader(row: import("exceljs").Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
}

function sheetName(wb: Workbook, wanted: string): string {
  const base = wanted.replace(/[\\/?*[\]:]/g, "-").slice(0, 28) || "Sheet";
  let name = base;
  let n = 2;
  while (wb.getWorksheet(name)) name = `${base.slice(0, 26)} ${n++}`;
  return name;
}

const kindLabel = { ordinary: "Ordinary", interest: "Interest / non-qualified dividends", qualified: "Gains / qualified dividends", taxExempt: "Tax-exempt interest" } as const;
const payLabel = { unlimited: "From other savings (unlimited)", limited: "From outside account, then from the IRA", fromIra: "From the IRA (no outside funds)" } as const;

function addInputs(wb: Workbook, i: PlannerInputs) {
  const ws = wb.addWorksheet("Inputs");
  ws.columns = [{ width: 46 }, { width: 28 }, { width: 60 }];
  ws.addRow(["Input", "Value", "Notes"]);
  styleHeader(ws.getRow(1));
  const add = (label: string, value: string | number, fmt?: string, note = "") => {
    const r = ws.addRow([label, value, note]);
    if (fmt && typeof value === "number") r.getCell(2).numFmt = fmt;
    r.getCell(2).alignment = { horizontal: "right" };
  };
  add("Birth year", i.birthYear);
  add("Current age", i.currentAge);
  add("Plan starts in tax year", i.birthYear + i.currentAge);
  add("Filing status", i.filingStatus === "mfj" ? "Married filing jointly" : "Single");
  if (i.filingStatus === "mfj") add("Spouse birth year", i.spouseBirthYear);
  add("State income tax rate", i.stateTaxRate, PCT);
  add("Traditional IRA balance", i.tradIraBalance, USD);
  add("After-tax basis in Traditional IRAs", i.tradIraBasis, USD);
  add("Roth IRA balance", i.rothBalance, USD);
  add("Outside (taxable) account balance", i.outsideBalance, USD);
  add("How conversion taxes are paid", payLabel[i.paymentMode]);
  add("Annual wages (today's $)", i.wagesAnnual, USD);
  add("Retirement age", i.retirementAge);
  add("Social Security, household per year (today's $)", i.socialSecurityAnnual, USD);
  add("Social Security start age", i.socialSecurityStartAge);
  add("Start converting at age", i.conversionStartAge);
  add("Last conversion age", i.lastConversionAge);
  add("Estimated lifespan (wealth evaluated at age)", i.lifespan);
  add("Investment return (nominal)", i.investmentReturn, PCT);
  add("Inflation", i.inflation, PCT);
  add("Tax drag on outside account", i.outsideTaxDrag, PCT);
  add("ACA marketplace insurance before Medicare", i.aca.enabled ? "Yes" : "No");
  if (i.aca.enabled) {
    add("ACA benchmark premium per year (today's $)", i.aca.benchmarkPremium, USD);
    add("ACA premium growth", i.aca.premiumGrowth, PCT);
  }
  add("MAGI last year (IRMAA look-back)", i.priorMagi1 ?? "estimated", USD);
  add("MAGI two years ago (IRMAA look-back)", i.priorMagi2 ?? "estimated", USD);
  add("Number of heirs", i.heirs.count);
  add("Each heir's other taxable income (today's $)", i.heirs.otherIncome, USD);
  add("Heirs' state tax rate", i.heirs.stateTaxRate, PCT);

  if (i.incomeStreams.length) {
    ws.addRow([]);
    const h = ws.addRow(["Other income", "Amount / year", "Type · ages · inflation-adjusted"]);
    styleHeader(h);
    for (const s of i.incomeStreams) {
      const r = ws.addRow([s.label, s.annualAmount, `${kindLabel[s.kind]} · ages ${s.startAge}–${s.endAge} · ${s.inflationAdjusted ? "inflation-adjusted" : "fixed"}`]);
      r.getCell(2).numFmt = USD;
    }
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function comparisonBlock(ws: Worksheet, title: string, scenarios: ScenarioResult[], views: Map<string, View>, endAge: number, recId: string, startRow: number): number {
  let row = startRow;
  ws.getCell(row, 1).value = title;
  ws.getCell(row, 1).font = { bold: true, size: 13 };
  row++;
  const head = ws.getRow(row);
  head.getCell(1).value = "Metric";
  scenarios.forEach((s, idx) => (head.getCell(idx + 2).value = s.id === recId ? `${s.name} (best)` : s.name));
  styleHeader(head);
  head.height = 48;
  row++;
  const none = scenarios.find((s) => s.id === "none")!;
  const lines: { label: string; get: (v: View, s: ScenarioResult) => number; fmt: string; bold?: boolean }[] = [
    { label: "Highest tax bracket reached", get: (_v, s) => s.peakBracket, fmt: "0%" },
    { label: "Total converted to Roth", get: (v) => v.converted, fmt: USD },
    { label: "Federal income tax", get: (v) => v.federal, fmt: USD },
    { label: "State income tax", get: (v) => v.state, fmt: USD },
    { label: "Medicare IRMAA + lost ACA subsidy", get: (v) => v.health, fmt: USD },
    { label: "NIIT + early-withdrawal penalty", get: (v) => v.other, fmt: USD },
    { label: "Total lifetime taxes & costs (you)", get: (v) => v.owner, fmt: USD, bold: true },
    { label: "Tax your heirs pay on remaining IRA (PV)", get: (v) => v.heirs, fmt: USD },
    { label: "Total incl. heirs", get: (v) => v.allIn, fmt: USD, bold: true },
    { label: `Roth IRA at ${endAge}`, get: (v) => v.roth, fmt: USD },
    { label: `Traditional IRA at ${endAge}`, get: (v) => v.trad, fmt: USD },
    { label: `Outside account at ${endAge}`, get: (v) => v.outside, fmt: USD },
    { label: `After-tax wealth at ${endAge}`, get: (v) => v.legacy, fmt: USD, bold: true },
    { label: "Difference vs. no conversions", get: (v) => v.legacy - views.get(none.id)!.legacy, fmt: USD, bold: true },
  ];
  for (const l of lines) {
    const r = ws.getRow(row++);
    r.getCell(1).value = l.label;
    scenarios.forEach((s, idx) => {
      const c = r.getCell(idx + 2);
      c.value = l.get(views.get(s.id)!, s);
      c.numFmt = l.fmt;
    });
    if (l.bold) r.font = { bold: true };
  }
  return row + 1;
}

function addComparison(wb: Workbook, i: PlannerInputs, out: PlannerOutput) {
  const ws = wb.addWorksheet("Comparison");
  const scenarios = out.scenarios.slice().sort((a, b) => b.legacy - a.legacy);
  ws.getColumn(1).width = 44;
  scenarios.forEach((_s, idx) => (ws.getColumn(idx + 2).width = 20));
  const nominal = new Map(scenarios.map((s) => [s.id, viewOf(s, false, i.inflation)]));
  const real = new Map(scenarios.map((s) => [s.id, viewOf(s, true, i.inflation)]));
  let next = comparisonBlock(ws, "Future (nominal) dollars", scenarios, nominal, i.lifespan, out.recommendedId, 1);
  comparisonBlock(ws, "Today's dollars (deflated by your inflation assumption)", scenarios, real, i.lifespan, out.recommendedId, next);
  ws.views = [{ state: "frozen", xSplit: 1 }];
}

function addSummary(wb: Workbook, i: PlannerInputs, out: PlannerOutput) {
  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF1F3A5F" } } });
  ws.columns = [{ width: 44 }, { width: 22 }, { width: 22 }];
  const rec = out.scenarios.find((s) => s.id === out.recommendedId)!;
  const none = out.scenarios.find((s) => s.id === "none")!;
  const vr = viewOf(rec, false, i.inflation);
  const vn = viewOf(none, false, i.inflation);
  ws.addRow(["Roth Conversion Planner: report"]).font = { bold: true, size: 16 };
  ws.addRow([`Generated ${new Date().toLocaleString()} in your browser. No data was sent or stored by the website.`]).font = { italic: true, color: { argb: "FF5B6678" } };
  ws.addRow(["Confidential: this file contains personal financial information. Store or share it accordingly."]).font = { bold: true, color: { argb: "FFB42318" } };
  ws.addRow([]);
  ws.addRow(["Recommended strategy", rec.name]).font = { bold: true };
  ws.addRow(["", rec.description]);
  ws.addRow([]);
  const head = ws.addRow(["", "Recommended", "No conversions"]);
  styleHeader(head);
  const line = (label: string, a: number, b: number, fmt: string) => {
    const r = ws.addRow([label, a, b]);
    r.getCell(2).numFmt = fmt;
    r.getCell(3).numFmt = fmt;
  };
  line(`After-tax wealth at ${i.lifespan} (future $)`, vr.legacy, vn.legacy, USD);
  line("Lifetime taxes & costs, you (future $)", vr.owner, vn.owner, USD);
  line("Heirs' tax on remaining IRA (PV, future $)", vr.heirs, vn.heirs, USD);
  line("Total converted to Roth (future $)", vr.converted, vn.converted, USD);
  line("Highest bracket reached", rec.peakBracket, none.peakBracket, "0%");
  ws.addRow([]);
  ws.addRow(["Sheets in this workbook"]).font = { bold: true };
  for (const t of [
    "Inputs: every assumption you entered",
    "Comparison: all strategies side by side (future and today's dollars)",
    "One sheet per strategy: year-by-year results (Total cost column is a live formula)",
    "Calculation detail: the full step-by-step math for every year of every strategy, for review and testing",
    "Assumptions: modeling notes and limitations",
  ])
    ws.addRow([t]);
  if (out.warnings.length) {
    ws.addRow([]);
    for (const w of out.warnings) ws.addRow([`Warning: ${w}`]);
  }
}

const YEAR_COLS: { header: string; width: number; fmt?: string; get: (r: ScenarioResult["rows"][number]) => number }[] = [
  { header: "Age", width: 6, get: (r) => r.age },
  { header: "Year", width: 7, get: (r) => r.year },
  { header: "RMD", width: 13, fmt: USD, get: (r) => r.rmd },
  { header: "Roth conversion", width: 15, fmt: USD, get: (r) => r.conversion },
  { header: "Taxable Social Security", width: 15, fmt: USD, get: (r) => r.taxableSocialSecurity },
  { header: "AGI", width: 13, fmt: USD, get: (r) => r.agi },
  { header: "Taxable income", width: 14, fmt: USD, get: (r) => r.taxableIncome },
  { header: "Bracket", width: 9, fmt: "0%", get: (r) => r.marginalBracket },
  { header: "All-in marginal rate", width: 12, fmt: PCT, get: (r) => r.marginalAllIn },
  { header: "Federal tax", width: 13, fmt: USD, get: (r) => r.federalTax },
  { header: "State tax", width: 12, fmt: USD, get: (r) => r.stateTax },
  { header: "NIIT", width: 11, fmt: USD, get: (r) => r.niit },
  { header: "IRMAA", width: 11, fmt: USD, get: (r) => r.irmaa },
  { header: "ACA subsidy lost", width: 13, fmt: USD, get: (r) => r.acaSubsidyLost },
  { header: "Penalty", width: 11, fmt: USD, get: (r) => r.penalty },
  { header: "Total cost", width: 13, fmt: USD, get: (r) => r.totalCost },
  { header: "Traditional IRA (end)", width: 16, fmt: USD, get: (r) => r.tradEnd },
  { header: "Roth IRA (end)", width: 15, fmt: USD, get: (r) => r.rothEnd },
  { header: "Outside account (end)", width: 16, fmt: USD, get: (r) => r.outsideEnd },
];

const colLetter = (n: number) => {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function addScenarioSheet(wb: Workbook, s: ScenarioResult) {
  const ws = wb.addWorksheet(sheetName(wb, s.name.replace("Optimized: ", "Opt ")));
  ws.addRow([s.name]).font = { bold: true, size: 13 };
  ws.addRow([s.description]).font = { italic: true };
  ws.addRow([]);
  const headRow = ws.addRow(YEAR_COLS.map((c) => c.header));
  styleHeader(headRow);
  headRow.height = 44;
  YEAR_COLS.forEach((c, idx) => (ws.getColumn(idx + 1).width = c.width));
  const first = headRow.number + 1;
  const costIdx = YEAR_COLS.findIndex((c) => c.header === "Total cost") + 1;
  const fedIdx = YEAR_COLS.findIndex((c) => c.header === "Federal tax") + 1;
  const penIdx = YEAR_COLS.findIndex((c) => c.header === "Penalty") + 1;
  s.rows.forEach((r, n) => {
    const row = ws.addRow(YEAR_COLS.map((c) => c.get(r)));
    YEAR_COLS.forEach((c, idx) => c.fmt && (row.getCell(idx + 1).numFmt = c.fmt));
    const rn = first + n;
    // Live formula so reviewers can trace the sum; cached result is the engine's value.
    row.getCell(costIdx).value = { formula: `SUM(${colLetter(fedIdx)}${rn}:${colLetter(penIdx)}${rn})`, result: r.totalCost };
    if (r.conversion > 0) row.eachCell((c) => (c.fill = BAND_FILL));
  });
  const last = first + s.rows.length - 1;
  const tot = ws.addRow(YEAR_COLS.map((c, idx) => {
    if (idx === 0) return "Total";
    if (["RMD", "Roth conversion", "Federal tax", "State tax", "NIIT", "IRMAA", "ACA subsidy lost", "Penalty", "Total cost"].includes(c.header)) {
      const total = s.rows.reduce((a, r) => a + c.get(r), 0);
      return { formula: `SUM(${colLetter(idx + 1)}${first}:${colLetter(idx + 1)}${last})`, result: total };
    }
    return null;
  }));
  tot.font = { bold: true };
  YEAR_COLS.forEach((c, idx) => c.fmt && (tot.getCell(idx + 1).numFmt = c.fmt));
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: headRow.number }];
}

function addCalcDetail(wb: Workbook, i: PlannerInputs, out: PlannerOutput) {
  const ws = wb.addWorksheet("Calculation detail");
  ws.columns = [
    { header: "Strategy", width: 34 },
    { header: "Year", width: 7 },
    { header: "Age", width: 6 },
    { header: "Step", width: 44 },
    { header: "Line", width: 58 },
    { header: "Value", width: 18 },
    { header: "How it is calculated", width: 80 },
  ];
  styleHeader(ws.getRow(1));
  const fmts = { usd: USD, pct: "0.00%", num: NUM, text: "@" } as const;
  for (const s of out.scenarios) {
    for (const r of s.rows) {
      const trace = explainYear(i, s.plan, r.k);
      for (const sec of trace) {
        for (const line of sec.lines) {
          const row = ws.addRow([s.name, r.year, r.age, sec.title, line.label.trim(), line.value, line.note ?? ""]);
          row.getCell(6).numFmt = fmts[line.fmt];
          row.getCell(6).alignment = { horizontal: "right" };
        }
      }
    }
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "G1" };
}

const ASSUMPTIONS = [
  "Objective: after-tax wealth at the end of the lifespan year = Roth IRA + outside account + Traditional IRA − present value of the tax your heirs pay on the Traditional IRA.",
  "Law: 2026 federal brackets, standard/additional/senior deductions, capital-gain thresholds, NIIT, Social Security taxation, Medicare IRMAA, and the original ACA subsidy schedule, indexed by your inflation input; current law assumed to continue (the senior deduction ends after 2028).",
  "RMDs: SECURE 2.0 starting ages (72 / 73 / 75 by birth year) and the IRS Uniform Lifetime Table.",
  "Ages, RMDs and Medicare follow the primary owner; the spouse only affects 65+ deductions and IRMAA enrollee counts. No surviving-spouse filing change.",
  "There is no spending model: other income is assumed to cover living costs and its own taxes; after-tax RMDs are reinvested in the outside account.",
  "State tax is a flat effective rate on AGI excluding taxable Social Security.",
  "Heirs are modeled as single filers who split the inherited Traditional IRA and withdraw it in 10 level payments; Roth balances pass tax-free. No estate tax.",
  "Roth 5-year rules, AMT, itemized deductions, QBI, payroll taxes, QCDs and state-specific exclusions are not modeled.",
  "This report is for education only and is not tax or investment advice.",
];

function addAssumptions(wb: Workbook) {
  const ws = wb.addWorksheet("Assumptions");
  ws.getColumn(1).width = 140;
  ws.addRow(["Assumptions and limitations"]).font = { bold: true, size: 13 };
  for (const a of ASSUMPTIONS) {
    const r = ws.addRow([a]);
    r.alignment = { wrapText: true, vertical: "top" };
  }
}

/** Builds the full Excel report. Pure: no I/O. */
export function buildWorkbook(wb: Workbook, inputs: PlannerInputs, out: PlannerOutput): Workbook {
  wb.creator = "Roth Conversion Planner";
  wb.created = new Date();
  addSummary(wb, inputs, out);
  addInputs(wb, inputs);
  addComparison(wb, inputs, out);
  const ordered = out.scenarios.slice().sort((a, b) => b.legacy - a.legacy);
  for (const s of ordered) addScenarioSheet(wb, s);
  addCalcDetail(wb, inputs, out);
  addAssumptions(wb);
  return wb;
}
