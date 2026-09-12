"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getAnalyticsSummary,
  getAnalyticsTimeseries,
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
import {
  bytesHuman,
  pct,
  InteractiveLineChart,
  OperationTypeDonut,
  IntegrityGauge,
  DataVolumeBarChart,
  DeviceStatusMatrix,
} from "@/components/dashboard/DashboardCharts";

// ---- helpers ---------------------------------------------------------------

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
    <div className="fg-panel overflow-hidden transition-all hover:shadow-md">
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

// ---- Top investigators + recent jobs ---------------------------------------

function TopInvestigators({ items }: { items: TopInvestigator[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="fg-panel h-full flex flex-col justify-between">
      <div className="fg-panel-header">
        <div className="fg-panel-title">Top Investigators</div>
        <div className="text-xs text-muted">By operations completed</div>
      </div>
      <div className="divide-y divide-line flex-1">
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
              <div className="text-right font-mono text-sm text-main font-semibold">
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
        <div className="fg-panel-title">Recent Jobs & Live Activity Queue</div>
        <Link href="/dashboard/jobs" className="text-xs font-medium text-govt-blue hover:underline flex items-center gap-1">
          View all jobs →
        </Link>
      </div>
      {jobs.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted">
          No jobs have been scheduled yet.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {jobs.slice(0, 6).map((j) => {
            const badge = statusBadge(j.status);
            return (
              <Link
                key={j.id}
                href={`/dashboard/jobs/${j.id}`}
                className="block px-5 py-3.5 hover:bg-field/70 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`${badge.cls}`}>{badge.label}</span>
                      <span className="truncate font-mono text-[11px] text-muted">
                        {j.job_number}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-main">
                      {j.title || `${j.operation_type} job`}
                    </div>
                    <div className="mt-1 line-clamp-1 font-mono text-[11px] text-muted">
                      {j.stage || j.message || new Date(j.created_at).toISOString()}
                    </div>
                  </div>
                  <div className="w-36 shrink-0 text-right">
                    <div className="font-mono text-xs font-semibold text-main">
                      {j.progress_percent}%
                    </div>
                    <div className="mt-1.5 fg-progress-track h-2 rounded-xs overflow-hidden">
                      <div
                        className="fg-progress-fill transition-all duration-300"
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

type ModuleCardProps = {
  code: string;
  title: string;
  description: string;
  accent: string;
  href: string;
  action: string;
  jobs: JobOut[];
  capabilities: string[];
};

function ModuleCard({
  code,
  title,
  description,
  accent,
  href,
  action,
  jobs,
  capabilities,
}: ModuleCardProps) {
  const activeJobs = jobs.filter(
    (job) => job.status === "PENDING" || job.status === "CLAIMED" || job.status === "RUNNING",
  ).length;
  const completedJobs = jobs.filter((job) => job.status === "COMPLETED").length;

  return (
    <article className="fg-panel flex h-full flex-col overflow-hidden transition-all hover:border-govt-navy/40">
      <div className={`h-1.5 ${accent}`} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">{code}</div>
            <h3 className="mt-2 font-display text-xl font-semibold text-main">{title}</h3>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-field font-mono text-xs text-muted">
            {String(activeJobs).padStart(2, "0")}
          </span>
        </div>
        <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-muted">{description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 border-y border-line py-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted">Active</div>
            <div className="mt-1 font-display text-lg font-semibold text-main">{activeJobs}</div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted">Completed</div>
            <div className="mt-1 font-display text-lg font-semibold text-main">{completedJobs}</div>
          </div>
        </div>
        <ul className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
          {capabilities.map((capability) => (
            <li key={capability} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-govt-gold" />
              {capability}
            </li>
          ))}
        </ul>
        <Link href={href} className="fg-btn-primary mt-6 w-full justify-center">
          {action} <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}

// ---- Page Component ---------------------------------------------------------

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
      subtitle="Platform operations telemetry, interactive analytical distributions, cryptographic ledger health, and task queue monitoring."
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

      {/* Graphical Data Visualizations Grid 1: Interactive Line Chart + Module Donut */}
      <section aria-labelledby="visualizations-heading" className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <h2 id="visualizations-heading" className="sr-only">
          Analytics & Visual Data
        </h2>
        <div className="lg:col-span-2">
          <InteractiveLineChart
            data={timeseries}
            title="Operations Telemetry — Rolling 30-Day Trend"
            currentMetric={metric}
            onMetricChange={setMetric}
          />
        </div>
        <div>
          <OperationTypeDonut summary={summary} />
        </div>
      </section>

      {/* Graphical Data Visualizations Grid 2: Integrity Gauge, Data Volume Bar, Fleet Matrix */}
      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <IntegrityGauge summary={summary} />
        <DataVolumeBarChart summary={summary} />
        <DeviceStatusMatrix summary={summary} />
      </section>

      {/* Modules section */}
      <section aria-labelledby="modules-heading" className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">Choose Module</div>
            <h2 id="modules-heading" className="mt-1 font-display text-2xl font-semibold text-main">
              Forensic operations
            </h2>
          </div>
          <Link href="/dashboard/jobs" className="text-xs font-medium text-govt-blue hover:underline">
            Open job queue →
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ModuleCard
            code="01 / RECOVERY"
            title="Recovery Engine"
            description="Carve, classify, verify, and preserve recovered files as case-linked evidence."
            accent="bg-typeviolet"
            href="/dashboard/recovery"
            action="Start recovery job"
            jobs={jobs.filter((job) => job.operation_type === "RECOVERY")}
            capabilities={["Quick or deep scan", "Evidence integrity"]}
          />
          <ModuleCard
            code="02 / FILE ERASE"
            title="File & Folder Eraser"
            description="Sanitise selected content with overwrite passes, metadata scrubbing, and verification."
            accent="bg-amber"
            href="/dashboard/file-eraser"
            action="Start erase job"
            jobs={jobs.filter((job) => job.operation_type === "FILE_ERASE")}
            capabilities={["N-pass overwrite", "Free-space cleanse"]}
          />
          <ModuleCard
            code="03 / DRIVE ERASE"
            title="Drive Eraser"
            description="Manage full-media sanitisation with device-aware methods and read-back verification."
            accent="bg-typeblue"
            href="/dashboard/drive-eraser"
            action="Start drive wipe"
            jobs={jobs.filter((job) => job.operation_type === "DRIVE_ERASE")}
            capabilities={["Clear, purge, crypto", "Read-back verify"]}
          />
        </div>
      </section>

      {/* Top Investigators & Recent Jobs */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopInvestigators items={summary?.top_investigators_by_ops ?? []} />
        <div className="lg:col-span-2">
          <RecentJobsList jobs={jobs} />
        </div>
      </section>
    </AppShell>
  );
}
