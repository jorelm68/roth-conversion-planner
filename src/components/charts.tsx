"use client";

import { moneyCompact } from "./format";

export interface Series {
  name: string;
  color: string;
  points: { x: number; y: number }[];
}

const W = 720;
const H = 280;
const M = { top: 12, right: 16, bottom: 28, left: 56 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Axes({ xMin, xMax, yMax, yMin = 0 }: { xMin: number; xMax: number; yMax: number; yMin?: number }) {
  const x = (v: number) => M.left + ((v - xMin) / Math.max(1, xMax - xMin)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - ((v - yMin) / (yMax - yMin || 1)) * (H - M.top - M.bottom);
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + ((yMax - yMin) * i) / 4);
  const step = Math.max(1, Math.ceil((xMax - xMin) / 8 / 5) * 5);
  const xTicks: number[] = [];
  for (let v = Math.ceil(xMin / step) * step; v <= xMax; v += step) xTicks.push(v);
  return (
    <g className="axes">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
          <text x={M.left - 6} y={y(t) + 4} textAnchor="end">{moneyCompact(t)}</text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={H - 8} textAnchor="middle">{t}</text>
      ))}
    </g>
  );
}

export function LineChart({ series }: { series: Series[] }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const yMax = niceMax(Math.max(...all.map((p) => p.y)));
  const yMin = Math.min(0, ...all.map((p) => p.y));
  const x = (v: number) => M.left + ((v - xMin) / Math.max(1, xMax - xMin)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - ((v - yMin) / (yMax - yMin || 1)) * (H - M.top - M.bottom);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <Axes xMin={xMin} xMax={xMax} yMax={yMax} yMin={yMin} />
        {series.map((s) => (
          <polyline key={s.name} fill="none" stroke={s.color} strokeWidth={2} points={s.points.map((p) => `${x(p.x)},${y(p.y)}`).join(" ")} />
        ))}
      </svg>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
    </figure>
  );
}

export interface BarDatum {
  x: number;
  parts: { value: number; color: string; label: string }[];
}

export function StackedBars({ data, legend }: { data: BarDatum[]; legend: { name: string; color: string }[] }) {
  if (data.length === 0) return null;
  const xMin = data[0].x;
  const xMax = data[data.length - 1].x;
  const yMax = niceMax(Math.max(...data.map((d) => d.parts.reduce((a, p) => a + p.value, 0))));
  const x = (v: number) => M.left + ((v - xMin) / Math.max(1, xMax - xMin)) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - (v / yMax) * (H - M.top - M.bottom);
  const bw = Math.max(2, ((W - M.left - M.right) / data.length) * 0.7);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        <Axes xMin={xMin} xMax={xMax} yMax={yMax} />
        {data.map((d) => {
          let acc = 0;
          return (
            <g key={d.x}>
              {d.parts.map((p, idx) => {
                const y0 = y(acc);
                acc += p.value;
                const y1 = y(acc);
                return (
                  <rect key={idx} x={x(d.x) - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1)} fill={p.color}>
                    <title>{`Age ${d.x}: ${p.label} ${moneyCompact(p.value)}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <Legend items={legend} />
    </figure>
  );
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <figcaption className="legend">
      {items.map((i) => (
        <span key={i.name}>
          <i style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </figcaption>
  );
}
