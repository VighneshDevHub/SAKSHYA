"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getJob as getJobApi,
  listJobs,
  UnauthorizedError,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import type {
  AnalyticsSummary,
  JobOut,
  TaskStatus,
  TimeseriesPoint,
  TopInvestigator,
} from "@/lib/types";
import { useJobSocket } from "@/lib/ws";

// ---- helpers ---------------------------------------------------------------

function bytesHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return "0.00%";
  return `${n.toFixed(2)}%`;
}

function statusBadge(s: TaskStatus): { label: string; cls: string } {
  switch (s) {
    case "PENDING":
      return { label: "Pending", cls: "fg-badge fg-badge--gold" };
    case "CLAIMED":
      return { label: "Claimed", cls: "fg-badge fg-badge--blue" };
    case "RUNNING":
      return { label: "Running", cls: "fg-badge fg-badge--navy" };
    case "COMPLETED":
      return { label: "Completed", cls: "fg-badge fg-badge--green" };
    case "FAILED":
      return { label: "Failed", cls: "fg-badge fg-badge--red" };
    case "CANCELLED":
      return { label: "Cancelled", cls: "fg-badge" };
    default:
      return { label: s, cls: "fg-badge" };
  }
}

// ---- Stat cards ------------------------------------------------------------

type StatCardDef = {
  label: string;
  value: string;
  hint?: string;
  accent: "navy" | "green" | "red" | "gold" | "blue";
};

const ACCENT_HEADER: Record<StatCardDef["accent"], string> = {
  navy: "bg-govt-navy text-white",
  green: "bg-govt-green text-white",
  red: "bg-govt-red text-white",
  gold: "bg-govt-goldDark text-white",
  blue: "bg-govt-blue text-white",
};

function StatCard({ card }: { card: StatCardDef }) {
  return (
    <div className="fg-panel overflow-hidden">
      <div className={`px-5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] ${ACCENT_HEADER[card.accent]}`}>
        {card.label}
      </div>
      <div className="px-5 py-4">
        <div className="font-display text-3xl font-semibold tracking-tight text-main">
          {card.value}
        </div>
        {card.hint && (
          <div className="mt-1 text-xs text-muted">{card.hint}</div>
        )}
      </div>
    </div>
  );
}

// ---- SVG line chart (zero deps, government style — solid stroke, no gradients)

function LineChart({
  data,
  title,
}: {
  data: TimeseriesPoint[];
  title: string;
}) {
  const width = 720;
  const height = 260;
  const padding = { l: 44, r: 16, t: 22, b: 30 };
  const innerW = width - padding.l - padding.r;
  const innerH = height - padding.t - padding.b;

  const values = data.map((d) => Number(d.value ?? 0));
  const maxV = Math.max(1, ...values);

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padding.l + stepX * i;
    const y = padding.t + innerH - (values[i] / maxV) * innerH;
    return { x, y, label: d.date, value: values[i] };
  });

  const path = points.length
    ? points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")
    : "";

  const area = points.length > 1
    ? `${path} L${points[points.length - 1].x.toFixed(2)},${(padding.t + innerH).toFixed(2)} L${points[0].x.toFixed(2)},${(padding.t + innerH).toFixed(2)} Z`
    : "";

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = (maxV * i) / yTicks;
    return { v, y: padding.t + innerH - (i / yTicks) * innerH };
  });

  const xLabelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="fg-panel">
      <div className="fg-panel-header">
        <div className="fg-panel-title">{title}</div>
        <div className="text-xs text-muted">
          Rolling {data.length}d · {new Date().toLocaleDateString()}
        </div>
      </div>
      <div className="p-4 md:p-5">
        {!data.length ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted">
            No activity recorded yet.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[260px] w-full"
            role="img"
            aria-label={`${title} line chart`}
          >
            {/* gridlines */}
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={padding.l}
                  x2={padding.l + innerW}
                  y1={t.y}
                  y2={t.y}
                  stroke="rgb(var(--fg-line))"
                  strokeDasharray={i === yTicks ? "" : "3 5"}
                />
                <text
                  x={padding.l - 8}
                  y={t.y + 3}
                  textAnchor="end"
                  className="fill-muted"
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                >
                  {t.v.toFixed(0)}
                </text>
              </g>
            ))}
            {/* area fill (very subtle) */}
            {area && (
              <path d={area} fill="rgb(var(--fg-royal))" fillOpacity={0.08} />
            )}
            {/* line */}
            {path && (
              <path
                d={path}
                fill="none"
                stroke="rgb(var(--fg-royal))"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {/* points */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={points.length <= 30 ? 2 : 1.6}
                fill="rgb(var(--fg-royal))"
              >
                <title>
                  {p.label}: {p.value}
                </title>
              </circle>
            ))}
            {/* x-axis labels */}
            {points.map((p, i) =>
              i % xLabelEvery === 0 || i === points.length - 1 ? (
                <text
                  key={i}
                  x={p.x}
                  y={padding.t + innerH + 18}
                  textAnchor="middle"
                  className="fill-muted"
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                >
                  {p.label.slice(5)}
                </text>
              ) : null,
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

// ---- Top investigators + recent jobs ---------------------------------------

function TopInvestigators({ items }: { items: TopInvestigator[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="fg-panel">
      <div className="fg-panel-header">
        <div className="fg-panel-title">Top Investigators</div>
        <div className="text-xs text-muted">By operations completed</div>
      </div>
      <div className="divide-y divide-line">
        {items.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            No investigators have recorded operations yet.
          </div>
        ) : (
          items.map((inv, idx) => (
            <div
              key={inv.email}
              className="grid grid-cols-[minmax(0,1fr)_60px] items-center gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-govt-blueLight text-[10px] font-bold text-govt-navy">
                    {idx + 1}
                  </span>
                  <div className="truncate font-mono text-xs text-main">
                    {inv.email}
                  </div>
                </div>
                <div className="mt-1.5 fg-progress-track h-1.5">
                  <div
                    className="fg-progress-fill"
                    style={{ width: `${(inv.count / max) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-right font-mono text-sm text-main">
                {inv.count}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RecentJobsList({ jobs: initialJobs }: { jobs: JobOut[] }) {
  const [jobs, setJobs] = useState<JobOut[]>(initialJobs);

  // Apply live WS updates to the first job we have (if any) so the
  // dashboard shows real-time progress for the most recent one.
  const latestId = jobs[0]?.id ?? null;
  const { lastEvent } = useJobSocket(latestId);

  useEffect(() => {
    if (!lastEvent || !latestId) return;
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== latestId) return j;
        return {
          ...j,
          status: (lastEvent.status as TaskStatus) ?? j.status,
          progress_percent: lastEvent.progress_percent ?? j.progress_percent,
          stage: lastEvent.stage ?? j.stage,
          message: lastEvent.message ?? j.message,
          error_message: lastEvent.error_message ?? j.error_message,
          certificate_id: lastEvent.certificate_id ?? j.certificate_id,
        };
      }),
    );
  }, [lastEvent, latestId]);

  return (
    <div className="fg-panel">
      <div className="fg-panel-header">
        <div className="fg-panel-title">Recent Jobs</div>
        <Link href="/dashboard/jobs" className="text-xs font-medium text-govt-blue hover:underline">
          View all →
        </Link>
      </div>
      {jobs.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted">
          No jobs have been scheduled yet.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {jobs.slice(0, 8).map((j) => {
            const badge = statusBadge(j.status);
            return (
              <Link
                key={j.id}
                href={`/dashboard/jobs/${j.id}`}
                className="block px-5 py-3 hover:bg-field/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`${badge.cls}`}>{badge.label}</span>
                      <span className="truncate font-mono text-[11px] text-muted">
                        {j.job_number}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm text-main">
                      {j.title || `${j.operation_type} job`}
                    </div>
                    <div className="mt-1 line-clamp-1 font-mono text-[11px] text-muted">
                      {j.stage || j.message || new Date(j.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="w-32 shrink-0 text-right">
                    <div className="font-mono text-xs text-main">
                      {j.progress_percent}%
                    </div>
                    <div className="mt-1 fg-progress-track h-1.5">
                      <div
                        className="fg-progress-fill"
                        style={{ width: `${j.progress_percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Page ------------------------------------------------------------------

export default function DashboardHome() {
  const router = useRouter();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [jobs, setJobs] = useState<JobOut[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<"operations" | "successes" | "failures" | "recoveries" | "erases">("operations");

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void (async () => {
      try {
        const [s, t, j] = await Promise.all([
          getAnalyticsSummary(),
          getAnalyticsTimeseries({ metric, range: "30d" }),
          listJobs({ limit: 20 }),
        ]);
        setSummary(s);
        setTimeseries(t);
        setJobs(j);
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          router.push("/login");
          return;
        }
        setErr(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
  }, [router, metric]);

  const statCards = useMemo<StatCardDef[]>(() => {
    const s = summary;
    if (!s) {
      return [
        { label: "Recovered files", value: "—", accent: "navy" },
        { label: "Recovered data", value: "—", accent: "blue" },
        { label: "Today's operations", value: "—", accent: "gold" },
        { label: "Total devices", value: "—", accent: "navy" },
        { label: "Success rate", value: "—", accent: "green" },
        { label: "Failure rate", value: "—", accent: "red" },
        { label: "Storage sanitized", value: "—", accent: "navy" },
      ];
    }
    return [
      { label: "Recovered files", value: s.recovered_files_count.toLocaleString(), accent: "navy" },
      {
        label: "Recovered data",
        value: bytesHuman(s.recovered_data_size_bytes),
        accent: "blue",
      },
      {
        label: "Today's operations",
        value: s.operations_today_count.toLocaleString(),
        hint: "UTC day boundary",
        accent: "gold",
      },
      {
        label: "Total devices",
        value: s.devices_total.toLocaleString(),
        hint: "Inventory tracked",
        accent: "navy",
      },
      {
        label: "Success rate",
        value: pct(s.success_rate_pct),
        accent: "green",
      },
      {
        label: "Failure rate",
        value: pct(s.failure_rate_pct),
        accent: "red",
      },
      {
        label: "Storage sanitized",
        value: bytesHuman(s.storage_sanitized_bytes),
        hint: "Drive erase modules",
        accent: "navy",
      },
    ];
  }, [summary]);

  return (
    <AppShell
      eyebrow="Command Console"
      title="Dashboard"
      subtitle="Platform operations summary, real-time task queue activity, investigator performance, and forensic integrity health."
    >
      {err && (
        <div className="mb-6 rounded-md border border-govt-red/30 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {err}
        </div>
      )}

      {/* Stat cards */}
      <section aria-labelledby="stats-heading" className="mb-6">
        <h2 id="stats-heading" className="sr-only">
          Key statistics
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {statCards.map((c) => (
            <StatCard key={c.label} card={c} />
          ))}
        </div>
      </section>

      {/* Chart + quick actions */}
      <section className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { k: "operations", l: "All operations" },
                  { k: "successes", l: "Successes" },
                  { k: "failures", l: "Failures" },
                  { k: "recoveries", l: "Recoveries" },
                  { k: "erases", l: "Erasures" },
                ] as const
              ).map((opt) => {
                const active = metric === opt.k;
                return (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => setMetric(opt.k)}
                    className={
                      "text-xs px-2.5 py-1 rounded-sm border " +
                      (active
                        ? "border-govt-navy bg-govt-navy text-white"
                        : "border-line bg-panel text-muted hover:text-main")
                    }
                  >
                    {opt.l}
                  </button>
                );
              })}
            </div>
          </div>
          <LineChart
            data={timeseries}
            title="Operations trend — previous 30 days"
          />
        </div>

        <TopInvestigators items={summary?.top_investigators_by_ops ?? []} />
      </section>

      {/* Recent jobs */}
      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading" className="sr-only">
          Recent task queue jobs
        </h2>
        <RecentJobsList jobs={jobs} />
      </section>
    </AppShell>
  );
}
