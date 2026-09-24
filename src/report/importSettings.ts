import type { PlannerInputs } from "@/engine";
import { ImportError, readInputsSheet, type ImportSummary } from "./readInputs";

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/**
 * Reads planner settings from an Excel report the user picked. The file is read locally with the File API
 * and parsed in memory; it is never uploaded or stored.
 */
export async function importSettingsFile(file: File, base: PlannerInputs): Promise<ImportSummary> {
  if (!/\.xlsx$/i.test(file.name)) throw new ImportError("Please choose an .xlsx file: the Excel report downloaded from this planner.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("That file is too large to be a report from this planner.");
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new ImportError("The file could not be opened as an Excel workbook. If it is open in Excel, save and close it, then try again.");
  }
  return readInputsSheet(wb, base);
}
