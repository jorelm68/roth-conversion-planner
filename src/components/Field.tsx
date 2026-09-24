"use client";

import { useEffect, useState, type ReactNode } from "react";

interface NumFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  hint?: ReactNode;
  /** Value is a fraction shown as a percentage. */
  percent?: boolean;
  /** Empty input maps to null. */
  nullable?: boolean;
  disabled?: boolean;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function NumField({ label, value, onChange, prefix, suffix, step = 1, hint, percent, nullable, disabled }: NumFieldProps) {
  const shown = value === null ? "" : String(round(percent ? value * 100 : value));
  const [text, setText] = useState(shown);

  useEffect(() => {
    const n = parseFloat(text.replace(/,/g, ""));
    const current = Number.isNaN(n) ? null : n;
    const target = value === null ? null : round(percent ? value * 100 : value);
    if (current !== target) setText(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-wrap">
        {prefix && <span className="affix">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          value={text}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            if (raw.trim() === "") {
              if (nullable) onChange(null);
              return;
            }
            const n = parseFloat(raw.replace(/,/g, ""));
            if (!Number.isNaN(n)) onChange(percent ? n / 100 : n);
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Card({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {note && <p className="note">{note}</p>}
      <div className="fields">{children}</div>
    </section>
  );
}
