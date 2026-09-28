"use client";

import { useRef, useState } from "react";
import type { PlannerInputs } from "@/engine";
import { importSettingsFile } from "@/report/importSettings";
import { ImportError, type ImportSummary } from "@/report/readInputs";

interface Props {
  current: PlannerInputs;
  onImport: (inputs: PlannerInputs) => void;
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ImportSettings({ current, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ file: string; summary: ImportSummary } | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const summary = await importSettingsFile(file, current);
      onImport(summary.inputs);
      setDone({ file: file.name, summary });
    } catch (e) {
      setError(e instanceof ImportError ? e.message : `The file could not be read (${e instanceof Error ? e.message : String(e)}).`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section
      className={`card import-bar ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void load(e.dataTransfer.files[0]);
      }}
    >
      <div className="import-row">
        <div>
          <h2>Continue from a previous report</h2>
          <p className="note">
            Load the settings saved in an Excel report from this planner, including any values you changed on its <strong>Inputs</strong> sheet. You can also drop the
            file here. It is read in your browser and never uploaded.
          </p>
        </div>
        <button type="button" className="btn secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Reading file…" : "Import settings from Excel"}
        </button>
        <input ref={fileRef} type="file" accept={`.xlsx,${XLSX_TYPE}`} hidden onChange={(e) => void load(e.target.files?.[0])} />
      </div>

      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {done && (
        <div className="import-result" role="status">
          <p>
            <strong>
              Loaded {done.summary.fieldsRead} of {done.summary.fieldsTotal} settings
              {done.summary.incomeStreams > 0 ? ` and ${done.summary.incomeStreams} other-income ${done.summary.incomeStreams === 1 ? "entry" : "entries"}` : ""}
            </strong>{" "}
            from {done.file}. Results below are recalculated with them.
          </p>
          {done.summary.missing.length > 0 && <p>Not found in the file, so kept as they were: {done.summary.missing.join(", ")}.</p>}
          {done.summary.defaulted.length > 0 && (
            <p>This report is from an earlier version, so these newer settings were set to match how it was calculated: {done.summary.defaulted.join(", ")}.</p>
          )}
          {done.summary.warnings.length > 0 && (
            <>
              <p>Please check:</p>
              <ul>
                {done.summary.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="link" onClick={() => setDone(null)}>
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
