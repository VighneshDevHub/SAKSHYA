"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listSystemLogs, UnauthorizedError } from "@/lib/api";
import { getStoredRole, getToken } from "@/lib/auth";
import { useSystemLogStream } from "@/lib/ws";
import type {
  LogCategory,
  LogLevel,
  SystemLogItem,
  SystemLogListOut,
} from "@/lib/types";
import { AppShell } from "@/components/AppShell";

type Tab = LogCategory;
const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: "LIVE", label: "Live Stream", glyph: "◉" },
  { key: "DEVICE", label: "Device Logs", glyph: "▤" },
  { key: "BACKEND", label: "Backend Logs", glyph: "▥" },
  { key: "SECURITY", label: "Security Logs", glyph: "▣" },
];

const LEVEL_BADGE: Record<LogLevel, string> = {
  DEBUG: "fg-badge",
  INFO: "fg-badge fg-badge--blue",
  WARN: "fg-badge fg-badge--gold",
  ERROR: "fg-badge fg-badge--red",
  SECURITY: "fg-badge fg-badge--navy",
};

function fmt(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

const CAN_VIEW: Record<LogCategory, boolean> = {
  LIVE: true,
  DEVICE: true,
  BACKEND: true,
  SECURITY: true, // RBAC gating by role is applied in the component below
};

export default function SystemLogsPage() {
  const router = useRouter();
  const role = getStoredRole();
  const canView = role === "ADMINISTRATOR" || role === "AUDITOR" || role === "SUPERVISOR";

  const [tab, setTab] = useState<Tab>("LIVE");
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<SystemLogListOut | null>(null);
  const [loading, setLoading] = useState(false);

  // filters
  const [level, setLevel] = useState<LogLevel | "ALL">("ALL");
  const [source, setSource] = useState("");
  const [live, setLive] = useState<SystemLogItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // ---- realtime WS subscription (mirrors the WS channel backend) ----
  const onStreamEvent = (ev: {
    level: LogLevel;
    category: LogCategory;
    message: string;
    details?: Record<string, unknown> | null;
    ts?: string;
    source?: string;
  }) => {
    if (tab !== "LIVE") return;
    if (paused) return;
    const item: SystemLogItem = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      level: ev.level,
      category: ev.category,
      message: ev.message,
      details: ev.details ?? {},
      source: ev.source ?? "websocket",
      created_at: ev.ts ?? new Date().toISOString(),
    };
    setLive((cur) => {
      const next = [item, ...cur];
      return next.slice(0, 500); // keep rolling window
    });
  };

  useSystemLogStream(onStreamEvent);

  async function reload() {
    if (tab === "LIVE") {
      setPage(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await listSystemLogs({
        category: tab,
        level: level === "ALL" ? undefined : level,
        limit: 200,
      });
      setPage(r);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load system logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    if (!canView) {
      setError("Access restricted to ADMINISTRATOR, AUDITOR, and SUPERVISOR roles.");
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!getToken() || !canView) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, level]);

  // auto-scroll live log
  useEffect(() => {
    if (tab !== "LIVE" || paused) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [live, tab, paused]);

  const LEVEL_OPTIONS: (LogLevel | "ALL")[] = ["ALL", "DEBUG", "INFO", "WARN", "ERROR", "SECURITY"];

  return (
    <AppShell
      eyebrow="Operations Monitoring"
      title="System Logs"
      subtitle="Live streaming telemetry (WebSocket), device events, backend service logs, and security events. Categories are pulled from the dedicated /api/v1/system-logs endpoint and mirrored over the authenticated WebSocket channel."
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {!canView && (
        <div className="fg-panel">
          <div className="p-10 text-center text-sm text-muted">
            Restricted module. Contact an Administrator or Supervisor for access.
          </div>
        </div>
      )}

      {canView && (
        <div className="fg-panel overflow-hidden">
          {/* Tabs */}
          <div className="flex flex-wrap border-b border-line">
            {TABS.map((t) => {
              const active = tab === t.key;
              const visible = CAN_VIEW[t.key];
              if (!visible) return null;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={
                    "flex items-center gap-2 border-b-2 px-5 py-3 text-sm transition-colors " +
                    (active
                      ? "border-govt-blue text-govt-navy font-semibold"
                      : "border-transparent text-muted hover:text-main")
                  }
                >
                  <span className="opacity-70">{t.glyph}</span>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Filter bar */}
          <form
            className="grid gap-4 border-b border-line p-5 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void reload();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">Log Level</span>
              <select className="fg-input" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
                {LEVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">Source (contains)</span>
              <input
                type="text"
                className="fg-input"
                value={source}
                placeholder="e.g. drive-eraser-agent, auth, recovery-engine"
                onChange={(e) => setSource(e.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className="fg-btn-primary flex-1" disabled={loading}>
                {tab === "LIVE" ? "Show Stream" : loading ? "Loading…" : "Filter"}
              </button>
              {tab === "LIVE" ? (
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  className="fg-btn flex-1"
                >
                  {paused ? "Resume Stream" : "Pause"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setLevel("ALL");
                    setSource("");
                    setTimeout(() => reload(), 0);
                  }}
                  className="fg-btn flex-1"
                  disabled={loading}
                >
                  Reset
                </button>
              )}
            </div>
          </form>

          {/* Status line */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-field/40 px-5 py-2.5">
            <div className="font-mono text-[11px] text-muted">
              {tab === "LIVE" && (
                <>
                  <span
                    className={
                      "mr-2 inline-block h-2 w-2 rounded-full " +
                      (paused ? "bg-govt-gold" : "bg-govt-green animate-pulse")
                    }
                    aria-hidden="true"
                  />
                  {paused ? "Stream PAUSED" : "WebSocket LIVE"} · {live.length} buffered records
                </>
              )}
              {tab !== "LIVE" && page && `Loaded ${page.items.length} of ${page.count} · limit ${page.limit}`}
              {tab !== "LIVE" && loading && "Loading persisted logs…"}
            </div>
            <div className="font-mono text-[11px] text-muted">
              Category: <span className="fg-badge">{tab}</span>
            </div>
          </div>

          {/* Live view */}
          {tab === "LIVE" && (
            <div
              ref={scrollRef}
              className="max-h-[60vh] overflow-y-auto"
            >
              {live.length === 0 && (
                <div className="p-8 text-center text-sm text-muted">
                  Awaiting real-time events. Trigger a job, device registration, or
                  login to see the live stream populate.
                </div>
              )}
              <div className="divide-y divide-line">
                {live.map((l) => (
                  <LogRow key={l.id} row={l} sourceFilter={source} />
                ))}
              </div>
            </div>
          )}

          {/* Persisted view */}
          {tab !== "LIVE" && (
            <div className="max-h-[60vh] overflow-y-auto">
              {loading && !page && (
                <div className="p-8 text-center text-sm text-muted">Loading persisted log page…</div>
              )}
              {!loading && page && page.items.length === 0 && (
                <div className="p-8 text-center text-sm text-muted">
                  No log entries in the current filter set.
                </div>
              )}
              {page && page.items.length > 0 && (
                <div className="divide-y divide-line">
                  {page.items.map((l) => (
                    <LogRow key={l.id} row={l} sourceFilter={source} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function LogRow({ row, sourceFilter }: { row: SystemLogItem; sourceFilter: string }) {
  if (sourceFilter && !row.source.toLowerCase().includes(sourceFilter.toLowerCase())) return null;
  return (
    <div className="grid gap-2 px-5 py-3 md:grid-cols-[170px,120px,160px,1fr] md:items-start">
      <div className="font-mono text-[11px] text-muted whitespace-nowrap">
        {fmt(row.created_at)}
      </div>
      <div className="flex items-center gap-2">
        <span className={LEVEL_BADGE[row.level]}>{row.level}</span>
      </div>
      <div className="font-mono text-[11px] text-main truncate">
        {row.source} · <span className="text-muted">{row.category}</span>
      </div>
      <div className="min-w-0">
        <div className="text-sm text-main break-words">{row.message}</div>
        {row.details && Object.keys(row.details).length > 0 && (
          <pre className="mt-2 overflow-x-auto rounded-sm border border-line bg-field p-2 font-mono text-[10px] text-muted break-all whitespace-pre-wrap">
            {JSON.stringify(row.details, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
