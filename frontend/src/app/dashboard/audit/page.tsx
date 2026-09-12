"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getCertificateReportPdfUrl, listAuditReport, UnauthorizedError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { ReportCertificateRow } from "@/lib/types";
import { AppShell } from "@/components/AppShell";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function outcome(success: boolean): string {
  return success ? "fg-badge fg-badge--green" : "fg-badge fg-badge--red";
}

export default function AuditPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReportCertificateRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [operator, setOperator] = useState("");
  const [success, setSuccess] = useState<"all" | "success" | "fail">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAudit() {
    setLoading(true);
    setError(null);
    try {
      const report = await listAuditReport({
        from: fromDate || undefined,
        to: toDate || undefined,
        operator_email: operator || undefined,
        success: success === "all" ? undefined : success === "success",
        limit: 500,
      });
      setRows(report.items);
      setTotal(report.total);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load audit records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadAudit();
  }

  return (
    <AppShell
      eyebrow="Forensics / Auditability"
      title="Audit Log"
      subtitle="Review signed operation records and their ledger references. Filters are evaluated by the backend audit report service."
      actions={
        <button type="button" onClick={() => void loadAudit()} className="fg-btn" disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Audit"}
        </button>
      }
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      <section className="fg-panel mb-6 overflow-hidden">
        <div className="fg-panel-header">
          <div>
            <div className="fg-panel-title">Audit Register</div>
            <p className="mt-1 text-xs text-muted">Filter by time window, operator, or operation outcome.</p>
          </div>
          <span className="font-mono text-[11px] text-muted">{rows ? `${total} records` : "-"}</span>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 p-5 md:grid-cols-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="fg-label">From date</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="fg-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="fg-label">To date</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="fg-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="fg-label">Operator</span>
            <input type="text" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Email contains..." className="fg-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="fg-label">Outcome</span>
            <select value={success} onChange={(e) => setSuccess(e.target.value as typeof success)} className="fg-input">
              <option value="all">All records</option>
              <option value="success">Success only</option>
              <option value="fail">Failures only</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="fg-btn-primary w-full" disabled={loading}>
              {loading ? "Loading..." : "Apply filters"}
            </button>
          </div>
        </form>
      </section>

      <section className="fg-panel overflow-hidden">
        {!rows && <div className="p-10 text-center text-sm text-muted">Loading audit register...</div>}
        {rows && rows.length === 0 && <div className="p-10 text-center text-sm text-muted">No audit records matched the current filters.</div>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="fg-table min-w-[1100px]">
              <thead>
                <tr>
                  <th>Certificate</th>
                  <th>Operation</th>
                  <th>Target</th>
                  <th>Operator</th>
                  <th>Completed</th>
                  <th>Ledger</th>
                  <th>Outcome</th>
                  <th className="text-right">Record</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.certificate_id}>
                    <td className="max-w-[190px] break-all font-mono text-[11px] text-govt-blue">{row.certificate_id}</td>
                    <td><span className="fg-badge">{String(row.operation_type).replaceAll("_", " ")}</span></td>
                    <td className="min-w-[220px] text-sm text-main">{row.target_description}</td>
                    <td className="font-mono text-[11px] text-main">{row.operator}</td>
                    <td className="text-xs text-muted">{formatDate(row.completed_at)}</td>
                    <td className="font-mono text-xs text-main">#{row.ledger_sequence_number}</td>
                    <td><span className={outcome(row.success)}>{row.success ? "Verified" : "Failed"}</span></td>
                    <td className="text-right">
                      <a href={getCertificateReportPdfUrl(row.certificate_id)} target="_blank" rel="noreferrer noopener" className="fg-btn-primary !px-2.5 !py-1 text-[11px]">
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
