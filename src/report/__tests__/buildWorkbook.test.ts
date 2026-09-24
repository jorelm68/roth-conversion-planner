import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { defaultInputs, runPlanner, type PlannerInputs } from "@/engine";
import { buildWorkbook } from "../buildWorkbook";

const inputs: PlannerInputs = {
  ...defaultInputs(),
  birthYear: 1964,
  currentAge: 62,
  incomeStreams: [{ id: "p", label: "Pension", kind: "ordinary", annualAmount: 20_000, startAge: 65, endAge: 95, inflationAdjusted: false }],
};

describe("Excel report", () => {
  it("writes a workbook that can be read back with the expected sheets and values", async () => {
    const out = runPlanner(inputs);
    const wb = buildWorkbook(new ExcelJS.Workbook(), inputs, out);
    const buf = await wb.xlsx.writeBuffer();

    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const names = back.worksheets.map((w) => w.name);
    for (const n of ["Summary", "Inputs", "Comparison", "Calculation detail", "Assumptions"]) expect(names).toContain(n);
    expect(names.length).toBe(5 + out.scenarios.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length <= 31)).toBe(true);

    // Inputs sheet echoes what the user typed.
    const inp = back.getWorksheet("Inputs")!;
    const flat = inp.getSheetValues().flat().map(String);
    expect(flat).toContain("Pension");
    expect(flat.some((v) => v.includes("Traditional IRA balance"))).toBe(true);

    // Comparison sheet: after-tax wealth row matches the engine.
    const cmp = back.getWorksheet("Comparison")!;
    let found = false;
    cmp.eachRow((row) => {
      if (!found && String(row.getCell(1).value).startsWith("After-tax wealth")) {
        const best = out.scenarios.find((s) => s.id === out.recommendedId)!;
        expect(row.getCell(2).value as number).toBeCloseTo(best.legacy, 2);
        found = true;
      }
    });
    expect(found).toBe(true);

    // Scenario sheet: total-cost cell is a live formula with the engine value cached.
    const rec = out.scenarios.find((s) => s.id === out.recommendedId)!;
    const sheet = back.worksheets.find((w) => w.getCell("A1").value === rec.name)!;
    const cell = sheet.getCell(5, 16);
    expect(typeof cell.value === "object" && cell.value !== null && "formula" in cell.value).toBe(true);
    expect((cell.value as { result: number }).result).toBeCloseTo(rec.rows[0].totalCost, 2);

    // Calculation detail contains the step-by-step lines.
    const det = back.getWorksheet("Calculation detail")!;
    expect(det.rowCount).toBeGreaterThan(out.scenarios.length * 20 * 50);
  });
});
