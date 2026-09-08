"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  cancelJob,
  ConflictError,
  getJob,
  retryJob,
  UnauthorizedError,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { OperationTypeTag } from "@/components/OperationBadges";
import {
  formatDateTime,
  JobProgressBar,
  JobStatusBadge,
} from "@/components/jobs/JobUI";
import { useJobSocket } from "@/lib/ws";
import type { JobOut } from "@/lib/types";

type Notice = { tone: "error" | "success"; text: string } | null;

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{label}</div>
      <div className={`mt-1 text-sm text-main ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</div>
    </div>
  );
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const { lastEvent, readyState } = useJobSocket(params.jobId);

  async function loadJob() {
    try {
      const row = await getJob(params.jobId);
      setJob(row);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to load job detail.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    if (params.jobId) {
      void loadJob();
    }
  }, [params.jobId, router]);

  useEffect(() => {
    if (!lastEvent) return;
    setJob((current) => {
      if (!current) return current;
      return {
        ...current,
        status: lastEvent.status ?? current.status,
        progress_percent: lastEvent.progress_percent ?? current.progress_percent,
        stage: lastEvent.stage ?? current.stage,
        message: lastEvent.message ?? current.message,
        error_message: lastEvent.error_message ?? current.error_message,
        certificate_id: lastEvent.certificate_id ?? current.certificate_id,
      };
    });
  }, [lastEvent]);

  const socketLabel = useMemo(() => {
    if (readyState === "open") return "Live";
    if (readyState === "connecting") return "Connecting";
    if (readyState === "unauthenticated") return "Auth required";
    return "Offline";
  }, [readyState]);

  async function handleCancel() {
    if (!job) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await cancelJob(job.id);
      setJob(updated);
      setNotice({ tone: "success", text: "Job cancelled successfully." });
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to cancel job.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (!job) return;
    setBusy(true);
    setNotice(null);
    try {
      const retried = await retryJob(job.id);
      setNotice({ tone: "success", text: `Retry job ${retried.job_number} created.` });
      router.push(`/dashboard/jobs/${retried.id}`);
    } catch (err) {
      const text =
        err instanceof ConflictError
          ? "This job cannot be retried in its current state."
          : err instanceof Error
            ? err.message
            : "Failed to retry job.";
      setNotice({ tone: "error", text });
    } finally {
      setBusy(false);
    }
  }

  const canCancel = job && (job.status === "PENDING" || job.status === "CLAIMED" || job.status === "RUNNING");
  const canRetry = job && (job.status === "FAILED" || job.status === "CANCELLED");

  return (
    <AppShell
      eyebrow="Task Queue Detail"
      title={job?.title || "Job Detail"}
      subtitle={job ? `${job.job_number} · live operational state, payload, identifiers, and completion linkage.` : "Loading job detail"}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/jobs" className="fg-btn">
            Back to Queue
          </Link>
          {canCancel && (
            <button type="button" onClick={() => void handleCancel()} disabled={busy} className="fg-btn">
              Cancel Job
            </button>
          )}
          {canRetry && (
            <button type="button" onClick={() => void handleRetry()} disabled={busy} className="fg-btn-primary">
              Retry Job
            </button>
          )}
        </div>
      }
    >
      {notice && (
        <div
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${
            notice.tone === "error"
              ? "border-govt-red/25 bg-govt-redLight text-govt-red"
              : "border-govt-green/25 bg-govt-greenLight text-govt-green"
          }`}
        >
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="fg-panel p-10 text-center text-sm text-muted">Loading job detail...</div>
      ) : !job ? (
        <div className="fg-panel p-10 text-center text-sm text-muted">Job not found or unavailable.</div>
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-6 lg:grid-cols-[1.2fr,0.9fr]">
            <div className="fg-panel">
              <div className="fg-panel-header">
                <div className="fg-panel-title">Execution Status</div>
                <div className="flex items-center gap-2">
                  <span className="fg-badge">
                    <span className={`fg-badge-dot ${readyState === "open" ? "!bg-govt-green" : "!bg-govt-goldDark"}`} />
                    {socketLabel}
                  </span>
                  <JobStatusBadge status={job.status} />
                </div>
              </div>
              <div className="space-y-5 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <OperationTypeTag type={job.operation_type} />
                  <span className="font-mono text-xs text-typeblue">{job.job_number}</span>
                  {job.certificate_id && (
                    <Link href={`/verify/${job.certificate_id}`} className="text-xs font-medium text-govt-blue hover:underline">
                      Verify Certificate
                    </Link>
                  )}
                </div>
                <JobProgressBar value={job.progress_percent} label={job.stage || "Queued"} />
                <div className="rounded-md border border-line bg-field p-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Current message</div>
                  <p className="mt-2 text-sm text-main">
                    {job.message || job.error_message || "No execution message has been recorded yet."}
                  </p>
                </div>
                {lastEvent && (
                  <div className="rounded-md border border-govt-blue/15 bg-govt-blueLight/40 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Latest event</div>
                    <div className="mt-2 text-sm text-main">
                      {lastEvent.type} · {lastEvent.stage || job.stage || "N/A"} · {formatDateTime(lastEvent.ts)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="fg-panel">
              <div className="fg-panel-header">
                <div className="fg-panel-title">Identifiers</div>
              </div>
              <div className="p-5">
                <DetailField label="Job ID" value={job.id} mono />
                <DetailField label="Created By User" value={job.created_by_user_id} mono />
                <DetailField label="Assigned Agent" value={job.assigned_agent_id || "-"} mono />
                <DetailField label="Case ID" value={job.case_id || "-"} mono />
                <DetailField label="Device ID" value={job.device_id || "-"} mono />
                <DetailField label="Parent Job" value={job.parent_job_id || "-"} mono />
                <DetailField label="Certificate ID" value={job.certificate_id || "-"} mono />
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr,1fr]">
            <div className="fg-panel">
              <div className="fg-panel-header">
                <div className="fg-panel-title">Lifecycle Timestamps</div>
              </div>
              <div className="p-5">
                <DetailField label="Created" value={formatDateTime(job.created_at)} />
                <DetailField label="Updated" value={formatDateTime(job.updated_at)} />
                <DetailField label="Claimed" value={formatDateTime(job.claimed_at)} />
                <DetailField label="Started" value={formatDateTime(job.started_at)} />
                <DetailField label="Completed" value={formatDateTime(job.completed_at)} />
                <DetailField label="Cancelled" value={formatDateTime(job.cancelled_at)} />
              </div>
            </div>

            <div className="fg-panel">
              <div className="fg-panel-header">
                <div className="fg-panel-title">Queue Metadata</div>
              </div>
              <div className="p-5">
                <DetailField label="Retries Count" value={String(job.retries_count)} />
                <DetailField label="Stage" value={job.stage || "-"} />
                <DetailField label="Error Message" value={job.error_message || "-"} />
              </div>
            </div>
          </section>

          <section className="fg-panel">
            <div className="fg-panel-header">
              <div className="fg-panel-title">Payload</div>
              <div className="text-xs text-muted">Immutable job request envelope</div>
            </div>
            <div className="p-5">
              <pre className="overflow-x-auto rounded-md border border-line bg-field p-4 text-xs text-main">
                <code>{JSON.stringify(job.payload, null, 2)}</code>
              </pre>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
