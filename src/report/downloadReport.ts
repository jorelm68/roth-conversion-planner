import type { PlannerInputs, PlannerOutput } from "@/engine";

/**
 * Builds the Excel report entirely in the browser and hands it to the user as a file download.
 * The workbook is created in memory from a Blob; nothing is uploaded anywhere.
 */
export async function downloadExcelReport(inputs: PlannerInputs, output: PlannerOutput): Promise<void> {
  const [{ default: ExcelJS }, { buildWorkbook }] = await Promise.all([import("exceljs"), import("./buildWorkbook")]);
  const wb = buildWorkbook(new ExcelJS.Workbook(), inputs, output);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "roth-conversion-plan.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
