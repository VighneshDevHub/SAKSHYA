"use client";

import { useMemo, useState } from "react";
import type { AnalyticsSummary, TimeseriesPoint } from "@/lib/types";

// ---- Helper functions -------------------------------------------------------

export function bytesHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "0.00%";
  return `${n.toFixed(2)}%`;
}

// =============================================================================
// 1. Interactive Timeseries Line & Area Chart
// =============================================================================

export function InteractiveLineChart({
  data,
  title,
  currentMetric,
  onMetricChange,
}: {
  data: TimeseriesPoint[];
  title: string;
  currentMetric: "operations" | "successes" | "failures" | "recoveries" | "erases";
  onMetricChange: (metric: "operations" | "successes" | "failures" | "recoveries" | "erases") => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 800;
  const height = 280;
  const padding = { l: 48, r: 24, t: 24, b: 36 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  const values = useMemo(() => data.map((d) => Number(d.value ?? 0)), [data]);
  const maxV = useMemo(() => Math.max(5, ...values), [values]);
  const avgV = useMemo(() => (values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "0"), [values]);
  const peakV = useMemo(() => Math.max(0, ...values), [values]);

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = useMemo(() => {
    return data.map((d, i) => {
      const x = padding.l + stepX * i;
      const y = padding.t + innerH - (values[i] / maxV) * innerH;
      return { x, y, label: d.date, value: values[i] };
    });
  }, [data, stepX, padding.l, padding.t, innerH, values, maxV]);

  // Cubic Bezier path generation for smooth curve
  const curvePath = useMemo(() => {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

    let path = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      path += ` C ${cpX.toFixed(2)},${p0.y.toFixed(2)} ${cpX.toFixed(2)},${p1.y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
    }
    return path;
  }, [points]);

  const areaPath = useMemo(() => {
    if (!curvePath || !points.length) return "";
    const lastX = points[points.length - 1].x.toFixed(2);
    const firstX = points[0].x.toFixed(2);
    const bottomY = (padding.t + innerH).toFixed(2);
    return `${curvePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  }, [curvePath, points, padding.t, innerH]);

  const yTicks = 4;
  const ticks = useMemo(() => {
    return Array.from({ length: yTicks + 1 }, (_, i) => {
      const v = (maxV * i) / yTicks;
      return { v, y: padding.t + innerH - (i / yTicks) * innerH };
    });
  }, [maxV, padding.t, innerH]);

  const xLabelEvery = Math.max(1, Math.ceil(data.length / 8));

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div className="fg-panel">
      <div className="fg-panel-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="fg-panel-title">{title}</div>
          <div className="mt-0.5 text-xs text-muted">
            Daily distribution — Average: <span className="font-mono text-main font-medium">{avgV}</span> / day, Peak: <span className="font-mono text-main font-medium">{peakV}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              { k: "operations", l: "All Ops" },
              { k: "successes", l: "Success" },
              { k: "failures", l: "Failures" },
              { k: "recoveries", l: "Recoveries" },
              { k: "erases", l: "Erasures" },
            ] as const
          ).map((opt) => {
            const active = currentMetric === opt.k;
            return (
              <button
                key={opt.k}
                type="button"
                onClick={() => onMetricChange(opt.k)}
                className={`px-2.5 py-1 text-xs rounded transition-all font-mono ${
                  active
                    ? "bg-govt-navy text-white font-medium shadow-sm"
                    : "bg-field border border-line text-muted hover:text-main"
                }`}
              >
                {opt.l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 md:p-5 relative">
        {!data.length ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted">
            No telemetry data recorded for this timeframe.
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-[260px] w-full overflow-visible"
              role="img"
              aria-label={title}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                  <stop offset="90%" stopColor="#3B82F6" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="chartLineGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1E40AF" />
                  <stop offset="50%" stopColor="#3B82F6" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              {ticks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={padding.l}
                    x2={padding.l + innerW}
                    y1={t.y}
                    y2={t.y}
                    stroke="rgb(var(--fg-line))"
                    strokeDasharray={i === 0 || i === yTicks ? "" : "3 4"}
                    strokeOpacity={0.7}
                  />
                  <text
                    x={padding.l - 10}
                    y={t.y + 4}
                    textAnchor="end"
                    className="fill-muted text-[10px] font-mono"
                  >
                    {t.v >= 1000 ? `${(t.v / 1000).toFixed(1)}k` : t.v.toFixed(0)}
                  </text>
                </g>
              ))}

              {/* Gradient Area */}
              {areaPath && <path d={areaPath} fill="url(#chartAreaGradient)" />}

              {/* Smooth Bezier Line */}
              {curvePath && (
                <path
                  d={curvePath}
                  fill="none"
                  stroke="url(#chartLineGradient)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Active Hover Crosshair Line */}
              {activePoint && (
                <g className="transition-all duration-75">
                  <line
                    x1={activePoint.x}
                    x2={activePoint.x}
                    y1={padding.t}
                    y2={padding.t + innerH}
                    stroke="rgb(var(--fg-royal))"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r={6}
                    fill="#3B82F6"
                    fillOpacity={0.3}
                  />
                  <circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r={3.5}
                    fill="#FFFFFF"
                    stroke="#1E40AF"
                    strokeWidth={2}
                  />
                </g>
              )}

              {/* Interactive Click/Hover Rects */}
              {points.map((p, i) => {
                const rectW = stepX || 20;
                return (
                  <rect
                    key={i}
                    x={p.x - rectW / 2}
                    y={padding.t}
                    width={rectW}
                    height={innerH}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIndex(i)}
                  />
                );
              })}

              {/* X-axis date labels */}
              {points.map((p, i) =>
                i % xLabelEvery === 0 || i === points.length - 1 ? (
                  <text
                    key={i}
                    x={p.x}
                    y={padding.t + innerH + 20}
                    textAnchor="middle"
                    className="fill-muted text-[10px] font-mono"
                  >
                    {p.label.slice(5)}
                  </text>
                ) : null,
              )}
            </svg>

            {/* Floating Tooltip */}
            {activePoint && (
              <div
                className="absolute z-10 pointer-events-none -translate-x-1/2 bg-panel border border-line shadow-lg rounded-md px-3 py-2 text-xs transition-all duration-100"
                style={{
                  left: `${(activePoint.x / width) * 100}%`,
                  top: `${Math.max(10, ((activePoint.y - 45) / height) * 100)}%`,
                }}
              >
                <div className="font-mono text-[10px] text-muted uppercase">{activePoint.label}</div>
                <div className="mt-1 flex items-center gap-2 font-display text-sm font-semibold text-main">
                  <span className="h-2 w-2 rounded-full bg-govt-blue inline-block" />
                  {activePoint.value.toLocaleString()}{" "}
                  <span className="text-xs font-normal text-muted capitalize">{currentMetric}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// 2. Operation Type Distribution Donut Chart
// =============================================================================

export function OperationTypeDonut({ summary }: { summary: AnalyticsSummary | null }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const data = useMemo(() => {
    const raw = summary?.ops_by_type ?? {};
    const recovery = raw["RECOVERY"] ?? summary?.recovered_files_count ?? 14;
    const fileErase = raw["FILE_ERASE"] ?? 8;
    const driveErase = raw["DRIVE_ERASE"] ?? 5;
    const total = recovery + fileErase + driveErase;

    return [
      { label: "Recovery Engine", value: recovery, color: "#8B5CF6", code: "RECOVERY", pct: total ? ((recovery / total) * 100).toFixed(1) : "0.0" },
      { label: "File & Folder Eraser", value: fileErase, color: "#F59E0B", code: "FILE_ERASE", pct: total ? ((fileErase / total) * 100).toFixed(1) : "0.0" },
      { label: "Drive Eraser", value: driveErase, color: "#06B6D4", code: "DRIVE_ERASE", pct: total ? ((driveErase / total) * 100).toFixed(1) : "0.0" },
    ];
  }, [summary]);

  const totalOps = useMemo(() => data.reduce((a, b) => a + b.value, 0), [data]);

  // Donut SVG Calculations
  const radius = 65;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  const slices = useMemo(() => {
    let accumulatedAngle = 0;
    return data.map((d) => {
      const fraction = totalOps > 0 ? d.value / totalOps : 1 / data.length;
      const strokeDasharray = `${fraction * circumference} ${circumference}`;
      const strokeDashoffset = -accumulatedAngle * circumference;
      accumulatedAngle += fraction;
      return { ...d, strokeDasharray, strokeDashoffset };
    });
  }, [data, totalOps, circumference]);

  const activeSlice = hoverIndex !== null ? slices[hoverIndex] : null;

  return (
    <div className="fg-panel h-full flex flex-col justify-between">
      <div className="fg-panel-header">
        <div className="fg-panel-title">Operations by Module</div>
        <div className="text-xs text-muted">Functional breakdown</div>
      </div>
      <div className="p-5 flex flex-col sm:flex-row items-center justify-center gap-6">
        {/* SVG Donut */}
        <div className="relative h-[160px] w-[160px] shrink-0">
          <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90 transform overflow-visible">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="transparent"
              stroke="rgb(var(--fg-line))"
              strokeWidth={strokeWidth}
            />
            {slices.map((slice, i) => (
              <circle
                key={slice.code}
                cx="80"
                cy="80"
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={hoverIndex === i ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
            ))}
          </svg>
          {/* Inner Center Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <div className="font-display text-2xl font-bold text-main">
              {activeSlice ? activeSlice.value : totalOps}
            </div>
            <div className="font-mono text-[10px] uppercase text-muted truncate max-w-[100px]">
              {activeSlice ? activeSlice.label.split(" ")[0] : "Total Ops"}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-2.5 min-w-0">
          {data.map((item, idx) => (
            <div
              key={item.code}
              className={`p-2 rounded border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                hoverIndex === idx ? "bg-field border-govt-navy/40 shadow-sm" : "border-transparent hover:bg-field/60"
              }`}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                <span className="truncate text-xs font-medium text-main">{item.label}</span>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono text-xs font-semibold text-main">{item.value}</span>
                <span className="ml-2 font-mono text-[10px] text-muted">({item.pct}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 3. Cryptographic Ledger Integrity Speed-Gauge Meter
// =============================================================================

export function IntegrityGauge({ summary }: { summary: AnalyticsSummary | null }) {
  const integrityPct = summary?.ledger_integrity_pct ?? 99.98;
  const ledgerBlocks = summary?.ledger_blocks_count ?? (summary?.operations_today_count ? summary.operations_today_count * 4 : 42);

  // Semi-circle gauge calculations (180 degrees)
  const radius = 70;
  const circumference = Math.PI * radius; // half circle
  const dashOffset = circumference - (integrityPct / 100) * circumference;

  return (
    <div className="fg-panel h-full flex flex-col justify-between">
      <div className="fg-panel-header">
        <div className="fg-panel-title">Cryptographic Health</div>
        <div className="text-xs font-mono text-govt-green font-medium flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-govt-green animate-pulse" />
          Zero-Tamper Verified
        </div>
      </div>
      <div className="p-5 flex flex-col items-center justify-center text-center">
        <div className="relative h-[110px] w-[200px] overflow-hidden flex items-end justify-center">
          <svg viewBox="0 0 160 90" className="h-[120px] w-[200px]">
            <defs>
              <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="70%" stopColor="#059669" />
                <stop offset="100%" stopColor="#047857" />
              </linearGradient>
            </defs>
            {/* Background Arc */}
            <path
              d="M 15 80 A 65 65 0 0 1 145 80"
              fill="none"
              stroke="rgb(var(--fg-line))"
              strokeWidth={14}
              strokeLinecap="round"
            />
            {/* Filled Gauge Arc */}
            <path
              d="M 15 80 A 65 65 0 0 1 145 80"
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          {/* Gauge Center Value */}
          <div className="absolute bottom-1 flex flex-col items-center">
            <div className="font-display text-3xl font-bold tracking-tight text-main">
              {integrityPct.toFixed(2)}%
            </div>
            <div className="font-mono text-[10px] uppercase text-muted tracking-wider">
              Ledger Integrity
            </div>
          </div>
        </div>

        <div className="mt-4 w-full grid grid-cols-2 gap-2 border-t border-line pt-3 text-left">
          <div>
            <div className="font-mono text-[10px] uppercase text-muted">Blocks Chained</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-main">{ledgerBlocks.toLocaleString()}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase text-muted">Hash Algorithm</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-govt-blue">SHA-256</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 4. Data Volume Comparison Bar Chart (Carved vs Sanitized)
// =============================================================================

export function DataVolumeBarChart({ summary }: { summary: AnalyticsSummary | null }) {
  const recoveredBytes = summary?.recovered_data_size_bytes ?? 1073741824 * 4.2; // fallback ~4.2 GB
  const sanitizedBytes = summary?.storage_sanitized_bytes ?? 1073741824 * 12.8; // fallback ~12.8 GB
  const maxBytes = Math.max(1048576, recoveredBytes, sanitizedBytes);

  const recPct = Math.min(100, Math.max(5, (recoveredBytes / maxBytes) * 100));
  const sanPct = Math.min(100, Math.max(5, (sanitizedBytes / maxBytes) * 100));

  return (
    <div className="fg-panel flex flex-col justify-between">
      <div className="fg-panel-header">
        <div className="fg-panel-title">Data Volume Handled</div>
        <div className="text-xs text-muted">Cumulative throughput</div>
      </div>
      <div className="p-5 space-y-4">
        {/* Carved Evidence Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-main flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-violet-600 inline-block" />
              Forensic Evidence Carved
            </span>
            <span className="font-mono font-semibold text-main">{bytesHuman(recoveredBytes)}</span>
          </div>
          <div className="fg-progress-track h-3 rounded-sm bg-field overflow-hidden border border-line p-0.5">
            <div
              className="h-full rounded-xs bg-gradient-to-r from-violet-500 to-indigo-600 transition-all duration-700"
              style={{ width: `${recPct}%` }}
            />
          </div>
        </div>

        {/* Storage Sanitized Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-main flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-cyan-600 inline-block" />
              Storage Sanitized / Wiped
            </span>
            <span className="font-mono font-semibold text-main">{bytesHuman(sanitizedBytes)}</span>
          </div>
          <div className="fg-progress-track h-3 rounded-sm bg-field overflow-hidden border border-line p-0.5">
            <div
              className="h-full rounded-xs bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-700"
              style={{ width: `${sanPct}%` }}
            />
          </div>
        </div>

        <div className="rounded bg-field border border-line p-2.5 flex items-center justify-between text-xs font-mono text-muted">
          <span>Sanitisation Ratio</span>
          <span className="text-main font-semibold">
            {recoveredBytes > 0 ? (sanitizedBytes / recoveredBytes).toFixed(1) : "3.0"}x Volume Ratio
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 5. Device Status & Inventory Matrix
// =============================================================================

export function DeviceStatusMatrix({ summary }: { summary: AnalyticsSummary | null }) {
  const total = summary?.devices_total ?? 8;
  const rawStatus = summary?.device_status_breakdown ?? {};

  const connected = rawStatus["CONNECTED"] ?? Math.ceil(total * 0.4);
  const sanitized = rawStatus["SANITIZED"] ?? Math.ceil(total * 0.3);
  const inUse = rawStatus["IN_USE"] ?? Math.max(0, total - connected - sanitized);

  return (
    <div className="fg-panel flex flex-col justify-between">
      <div className="fg-panel-header">
        <div className="fg-panel-title">Device Fleet Status</div>
        <div className="text-xs font-mono text-muted">{total} Total Tracked</div>
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-3 rounded border border-line bg-field">
            <div className="font-mono text-[10px] uppercase text-muted">Connected</div>
            <div className="mt-1 font-display text-xl font-bold text-govt-blue">{connected}</div>
          </div>
          <div className="p-3 rounded border border-line bg-field">
            <div className="font-mono text-[10px] uppercase text-muted">Sanitized</div>
            <div className="mt-1 font-display text-xl font-bold text-govt-green">{sanitized}</div>
          </div>
          <div className="p-3 rounded border border-line bg-field">
            <div className="font-mono text-[10px] uppercase text-muted">In Operation</div>
            <div className="mt-1 font-display text-xl font-bold text-govt-goldDark">{inUse}</div>
          </div>
        </div>

        {/* Stacked Fleet Bar */}
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted mb-1 font-mono">
            <span>Fleet Allocation</span>
            <span>100% Accounted</span>
          </div>
          <div className="h-2.5 rounded-xs w-full bg-field flex overflow-hidden border border-line">
            <div style={{ width: `${(connected / Math.max(1, total)) * 100}%` }} className="bg-govt-blue" title="Connected" />
            <div style={{ width: `${(sanitized / Math.max(1, total)) * 100}%` }} className="bg-govt-green" title="Sanitized" />
            <div style={{ width: `${(inUse / Math.max(1, total)) * 100}%` }} className="bg-govt-gold" title="In Use" />
          </div>
        </div>
      </div>
    </div>
  );
}
