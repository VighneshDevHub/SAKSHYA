"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { universalSearch, UnauthorizedError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { SearchOut, SearchResultType } from "@/lib/types";
import { AppShell } from "@/components/AppShell";

const TYPE_LABEL: Record<SearchResultType, string> = {
  certificate: "Certificate",
  case: "Case",
  device: "Device",
  operation: "Operation",
  officer: "Officer",
};

const TYPE_VARIANT: Record<SearchResultType, string> = {
  certificate: "fg-badge fg-badge--green",
  case: "fg-badge fg-badge--navy",
  device: "fg-badge fg-badge--blue",
  operation: "fg-badge fg-badge--navy",
  officer: "fg-badge fg-badge--gold",
};

const TYPE_OPTIONS: SearchResultType[] = [
  "certificate",
  "case",
  "device",
  "operation",
  "officer",
];

function fmt(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function hrefFor(r: { result_type: SearchResultType; id: string }): string {
  switch (r.result_type) {
    case "case":
      return `/dashboard/cases/${r.id}`;
    case "certificate":
    case "operation":
      return `/verify?certificate_id=${encodeURIComponent(r.id)}`;
    case "device":
      return `/dashboard/devices`;
    case "officer":
      return `/dashboard/users`;
    default:
      return "#";
  }
}

export default function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const initialTypes = params.get("types");
  const initialFrom = params.get("from") ?? "";
  const initialTo = params.get("to") ?? "";
  const initialHash = params.get("hash") ?? "";

  const [query, setQuery] = useState(q);
  const [types, setTypes] = useState<SearchResultType[]>(
    initialTypes ? (initialTypes.split(",") as SearchResultType[]) : [],
  );
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [hash, setHash] = useState(initialHash);
  const [result, setResult] = useState<SearchOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSearch(overrides?: {
    q?: string;
    types?: SearchResultType[];
    from?: string;
    to?: string;
    hash?: string;
  }) {
    const qq = overrides?.q ?? query;
    const tt = overrides?.types ?? types;
    const ff = overrides?.from ?? fromDate;
    const tto = overrides?.to ?? toDate;
    const hh = overrides?.hash ?? hash;
    if (!qq.trim() && !ff && !tto && !hh) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await universalSearch({
        q: qq.trim() || undefined,
        types: tt.length ? tt : undefined,
        from: ff || undefined,
        to: tto || undefined,
        hash: hh || undefined,
      });
      setResult(r);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void runSearch({ q, from: initialFrom, to: initialTo, hash: initialHash });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function toggleType(t: SearchResultType) {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  const breakdown = useMemo(() => {
    const acc: Record<SearchResultType, number> = {
      certificate: 0,
      case: 0,
      device: 0,
      operation: 0,
      officer: 0,
    };
    if (result) {
      for (const r of result.results) acc[r.result_type]++;
    }
    return acc;
  }, [result]);

  const eyebrow = q || initialFrom || initialTo || initialHash ? "Search Results" : "Platform-Wide Search";
  const title = q ? `“${q}”` : "Advanced Search";
  const subtitle =
    "Cross-module search across case files, devices, signed certificates, operations, and operators. Uses endpoint GET /api/v1/search.";

  return (
    <AppShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {/* =========== FILTER PANEL =========== */}
      <div className="fg-panel mb-6 overflow-hidden">
        <div className="fg-panel-header">
          <div className="fg-panel-title">Search Criteria</div>
          <div className="font-mono text-[11px] text-muted">
            {result ? `${result.total} hit${result.total === 1 ? "" : "s"}` : "—"}
          </div>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr,1fr]">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">Query (case id / device serial / certificate id / officer email / keywords)</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. USB, 0418, officer@ntro.gov.in, FIR-2026-0014…"
                className="fg-input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">From Date (inclusive)</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="fg-input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">To Date (inclusive)</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="fg-input"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="fg-label">Hash / Digest (SHA-256, partial OK)</span>
            <input
              type="text"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              className="fg-input font-mono"
              placeholder="e.g. 7f83b165…"
            />
          </label>

          <div>
            <div className="fg-label mb-2">Result Types (leave empty for all)</div>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => {
                const active = types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={
                      "rounded-sm border px-3 py-1.5 text-xs transition-colors " +
                      (active
                        ? "border-govt-navy bg-govt-navy text-white"
                        : "border-line bg-panel text-muted hover:text-main")
                    }
                  >
                    {TYPE_LABEL[t]} · {breakdown[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTypes([]);
                setFromDate("");
                setToDate("");
                setHash("");
                setResult(null);
              }}
              className="fg-btn"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => runSearch()}
              disabled={loading}
              className="fg-btn-primary"
            >
              {loading ? "Searching…" : "Run Search"}
            </button>
          </div>
        </div>
      </div>

      {/* =========== RESULTS =========== */}
      {!loading && !result && (
        <div className="fg-panel">
          <div className="p-10 text-center text-sm text-muted">
            Enter criteria above and click “Run Search” to query the platform database.
          </div>
        </div>
      )}

      {loading && (
        <div className="fg-panel">
          <div className="p-10 text-center text-sm text-muted">Running database query…</div>
        </div>
      )}

      {!loading && result && (
        <div className="fg-panel overflow-hidden">
          <div className="fg-panel-header">
            <div>
              <div className="fg-panel-title">Search Results</div>
              <p className="mt-1 text-xs text-muted">
                {result.total === 0
                  ? "No records matched the current criteria."
                  : `Showing ${result.offset + 1}–${result.offset + result.results.length} of ${result.total} record${result.total === 1 ? "" : "s"}.`}
              </p>
            </div>
          </div>

          {result.results.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">
              No records matched. Try broadening the filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="fg-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Match</th>
                    <th>Matched Field</th>
                    <th>Date</th>
                    <th className="text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, idx) => (
                    <tr key={`${r.id}-${r.result_type}-${idx}`}>
                      <td>
                        <span className={TYPE_VARIANT[r.result_type]}>
                          {TYPE_LABEL[r.result_type]}
                        </span>
                      </td>
                      <td>
                        <div className="text-sm font-medium text-main">{r.title}</div>
                        <div className="font-mono text-[11px] text-muted">{r.subtitle}</div>
                      </td>
                      <td><span className="fg-badge">{r.match_field}</span></td>
                      <td className="text-xs text-muted">{fmt(r.created_at)}</td>
                      <td className="text-right">
                        <Link href={hrefFor(r)} className="fg-btn !px-2.5 !py-1 text-[11px]">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
