"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCertificatesCsvDownloadUrl,
  getCertificateReportPdfUrl,
  listAuditReport,
  listCertificatesReport,
  listMonthlyReport,
  listRecoveryReport,
  UnauthorizedError,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  MonthlyReportBucket,
  MonthlyReportOut,
  ReportCertificateRow,
  ReportListOut,
} from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { StatusStamp } from "@/components/OperationBadges";

type ReportTab = "certificates" | "recovery" | "audit" | "monthly";

const TABS: { key: ReportTab; label: string; glyph: string }[] = [
  { key: "certificates", label: "Certificates", glyph: "▦" },
  { key: "recovery", label: "Recovery Reports", glyph: "▣" },
  { key: "audit", label: "Audit Reports", glyph: "▤" },
  { key: "monthly", label: "Monthly Reports", glyph: "▥" },
];

function fmt(ts: string | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function ReportCenterPage() {
  const router = useRouter();
  const [tab, setTab] = useState<ReportTab>("certificates");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // filter params
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [operator, setOperator] = useState("");
  const [success, setSuccess] = useState<"all" | "success" | "fail">("all");

  // monthly filter
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));

  // state per tab
  const [certList, setCertList] = useState<ReportListOut | null>(null);
  const [recList, setRecList] = useState<ReportListOut | null>(null);
  const [audList, setAudList] = useState<ReportListOut | null>(null);
  const [monthly, setMonthly] = useState<MonthlyReportOut | null>(null);

  async function reloadCertificates() {
    setLoading(true);
    setError(null);
    try {
      const r = await listCertificatesReport({
        from: fromDate || undefined,
        to: toDate || undefined,
        operator_email: operator || undefined,
        success: success === "all" ? undefined : success === "success",
        limit: 200,
      });
      setCertList(r);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load certificates report");
    } finally {
      setLoading(false);
    }
  }

  async function reloadRecovery() {
    setLoading(true);
    setError(null);
    try {
      const r = await listRecoveryReport({
        from: fromDate || undefined,
        to: toDate || undefined,
        operator_email: operator || undefined,
        success: success === "all" ? undefined : success === "success",
        limit: 200,
      });
      setRecList(r);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load recovery report");
    } finally {
      setLoading(false);
    }
  }

  async function reloadAudit() {
    setLoading(true);
    setError(null);
    try {
      const r = await listAuditReport({
        from: fromDate || undefined,
        to: toDate || undefined,
        operator_email: operator || undefined,
        success: success === "all" ? undefined : success === "success",
        limit: 200,
      });
      setAudList(r);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load audit report");
    } finally {
      setLoading(false);
    }
  }

  async function reloadMonthly() {
    setLoading(true);
    setError(null);
    try {
      const r = await listMonthlyReport({
        year: Number(year) || undefined,
        month: Number(month) || undefined,
      });
      setMonthly(r);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load monthly report");
    } finally {
      setLoading(false);
    }
  }

  function runTab() {
    if (tab === "certificates") void reloadCertificates();
    else if (tab === "recovery") void reloadRecovery();
    else if (tab === "audit") void reloadAudit();
    else void reloadMonthly();
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!getToken()) return;
    runTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function downloadCsv() {
    const url = getCertificatesCsvDownloadUrl({
      from: fromDate || undefined,
      to: toDate || undefined,
      operator_email: operator || undefined,
      success: success === "all" ? undefined : success === "success",
    });
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.click();
  }

  return (
    <AppShell
      eyebrow="Reporting & Compliance"
      title="Report Center"
      subtitle="Signed PDF certificates, recovery reports, audit trails, and monthly operational summaries. All reports are generated from the PostgreSQL operation ledger via the /api/v1/reports endpoints."
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {/* ============== TABS ============== */}
      <div className="fg-panel mb-6 overflow-hidden">
        <div className="flex flex-wrap border-b border-line">
          {TABS.map((t) => {
            const active = tab === t.key;
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

        {/* ============== FILTERS (certificates / recovery / audit) ============== */}
        {tab !== "monthly" && (
          <form
            className="grid gap-4 border-b border-line p-5 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              runTab();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">From Date (inclusive)</span>
              <input type="date" className="fg-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">To Date (inclusive)</span>
              <input type="date" className="fg-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">Operator Email (contains)</span>
              <input
                type="text"
                className="fg-input"
                placeholder="officer@ntro.gov.in"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
              />
            </label>
            <div className="flex flex-col gap-1.5 justify-end text-sm">
              <span className="fg-label">Outcome</span>
              <div className="flex items-end gap-2">
                <select
                  className="fg-input flex-1"
                  value={success}
                  onChange={(e) => setSuccess(e.target.value as typeof success)}
                >
                  <option value="all">All Records</option>
                  <option value="success">Success Only</option>
                  <option value="fail">Failures Only</option>
                </select>
                <button type="submit" className="fg-btn-primary" disabled={loading}>
                  {loading ? "…" : "Run"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ============== FILTERS (monthly) ============== */}
        {tab === "monthly" && (
          <form
            className="grid gap-4 border-b border-line p-5 md:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              void reloadMonthly();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">Year</span>
              <input
                type="number"
                min={2020}
                max={2100}
                className="fg-input font-mono"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="fg-label">Month (1–12, empty = full year)</span>
              <input
                type="number"
                min={1}
                max={12}
                className="fg-input font-mono"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className="fg-btn-primary flex-1" disabled={loading}>
                {loading ? "…" : "Generate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setYear(String(new Date().getFullYear()));
                  setMonth(String(new Date().getMonth() + 1).padStart(2, "0"));
                  setTimeout(() => reloadMonthly(), 0);
                }}
                className="fg-btn flex-1"
                disabled={loading}
              >
                Current Month
              </button>
            </div>
          </form>
        )}

        {/* ============== TAB ACTION BAR ============== */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-field/40">
          <div className="font-mono text-[11px] text-muted">
            {tab === "certificates" && certList && `Total: ${certList.total} records`}
            {tab === "recovery" && recList && `Total: ${recList.total} records`}
            {tab === "audit" && audList && `Total: ${audList.total} records`}
            {tab === "monthly" && monthly && `Buckets: ${monthly.count}`}
            {loading && !certList && !recList && !audList && !monthly && "Loading…"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab === "certificates" && (
              <button type="button" onClick={downloadCsv} className="fg-btn !py-1.5 !px-3 text-xs">
                ⤓ Download CSV
              </button>
            )}
            <Link href="/dashboard/ledger" className="fg-btn !py-1.5 !px-3 text-xs">
              Chain Ledger
            </Link>
            <Link href="/dashboard/audit" className="fg-btn-primary !py-1.5 !px-3 text-xs">
              Audit Log
            </Link>
          </div>
        </div>

        {/* ============== CERTIFICATES / RECOVERY / AUDIT TABLES ============== */}
        {tab !== "monthly" && (
          <ReportTable
            loading={loading}
            rows={
              tab === "certificates"
                ? certList?.items
                : tab === "recovery"
                  ? recList?.items
                  : audList?.items
            }
          />
        )}

        {/* ============== MONTHLY ============== */}
        {tab === "monthly" && <MonthlyView buckets={monthly?.buckets ?? []} />}
      </div>
    </AppShell>
  );
}

function ReportTable({
  rows,
  loading,
}: {
  rows: ReportCertificateRow[] | undefined;
  loading: boolean;
}) {
  if (loading && !rows) {
    return <div className="p-10 text-center text-sm text-muted">Loading report…</div>;
  }
  if (!rows || rows.length === 0) {
    return <div className="p-10 text-center text-sm text-muted">No records matched the filters.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="fg-table min-w-[1000px]">
        <thead>
          <tr>
            <th>Certificate</th>
            <th>Operation Type</th>
            <th>Target</th>
            <th>Operator</th>
            <th>Window</th>
            <th>Ledger Seq</th>
            <th>Outcome</th>
            <th className="text-right">PDF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.certificate_id}>
              <td className="font-mono text-[11px] text-govt-blue break-all">
                {r.certificate_id}
              </td>
              <td><span className="fg-badge">{String(r.operation_type).replaceAll("_", " ")}</span></td>
              <td className="text-sm text-main min-w-[200px]">{r.target_description}</td>
              <td className="font-mono text-[11px] text-main">{r.operator}</td>
              <td className="text-xs text-muted">
                <div>{fmt(r.started_at)}</div>
                <div>→ {fmt(r.completed_at)}</div>
              </td>
              <td className="text-center font-mono text-xs text-main">
                {r.ledger_sequence_number}
              </td>
              <td><StatusStamp success={r.success} /></td>
              <td className="text-right">
                <a
                  href={getCertificateReportPdfUrl(r.certificate_id)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="fg-btn-primary !px-2.5 !py-1 text-[11px]"
                >
                  PDF ↓
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyView({ buckets }: { buckets: MonthlyReportBucket[] }) {
  if (buckets.length === 0) {
    return <div className="p-10 text-center text-sm text-muted">No monthly buckets — try a wider range.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="fg-table min-w-[720px]">
        <thead>
          <tr>
            <th>Period</th>
            <th className="text-center">Total Ops</th>
            <th className="text-center">Drive Erase</th>
            <th className="text-center">File Erase</th>
            <th className="text-center">Recoveries</th>
            <th className="text-center">Success</th>
            <th className="text-center">Failures</th>
            <th className="text-right">Success Rate</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => {
            const rate = b.operations_total
              ? Math.round((b.successes / b.operations_total) * 10000) / 100
              : 0;
            return (
              <tr key={`${b.year}-${b.month}`}>
                <td className="font-mono text-xs text-govt-navy">
                  {b.year}-{String(b.month).padStart(2, "0")}
                </td>
                <td className="text-center font-mono text-xs text-main">{b.operations_total}</td>
                <td className="text-center font-mono text-xs text-main">{b.drive_erases}</td>
                <td className="text-center font-mono text-xs text-main">{b.file_erases}</td>
                <td className="text-center font-mono text-xs text-main">{b.recoveries}</td>
                <td className="text-center">
                  <span className="fg-badge fg-badge--green">{b.successes}</span>
                </td>
                <td className="text-center">
                  <span className="fg-badge fg-badge--red">{b.failures}</span>
                </td>
                <td className="text-right font-mono text-xs text-main">{rate}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
