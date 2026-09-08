"use client";

import Link from "next/link";
import { OperationTypeTag } from "@/components/OperationBadges";
import type { JobOut, TaskStatus } from "@/lib/types";

export const JOB_STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Pending",
  CLAIMED: "Claimed",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const JOB_STATUS_CLASS: Record<TaskStatus, string> = {
  PENDING: "fg-badge fg-badge--gold",
  CLAIMED: "fg-badge fg-badge--blue",
  RUNNING: "fg-badge fg-badge--navy",
  COMPLETED: "fg-badge fg-badge--green",
  FAILED: "fg-badge fg-badge--red",
  CANCELLED: "fg-badge",
};

export const JOB_FILTERS: Array<{ label: string; value: TaskStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Claimed", value: "CLAIMED" },
  { label: "Running", value: "RUNNING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export const JOB_PAYLOAD_TEMPLATES: Record<string, string> = {
  DRIVE_ERASE: JSON.stringify(
    {
      target: "\\\\.\\PhysicalDrive2",
      method: "PURGE",
      verification: true,
    },
    null,
    2,
  ),
  FILE_ERASE: JSON.stringify(
    {
      targets: ["C:\\Evidence\\to-delete"],
      metadata_scrub: true,
      free_space_overwrite: true,
    },
    null,
    2,
  ),
  RECOVERY: JSON.stringify(
    {
      image_path: "D:\\Images\\evidence.dd",
      output_dir: "D:\\RecoveryOutput",
      deep_scan: true,
    },
    null,
    2,
  ),
};

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export function JobStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={JOB_STATUS_CLASS[status]}>{JOB_STATUS_LABEL[status]}</span>;
}

export function JobProgressBar({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{label ?? "Progress"}</span>
        <span className="font-mono text-xs text-main">{width}%</span>
      </div>
      <div className="fg-progress-track">
        <div className="fg-progress-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function JobRow({
  job,
  onCancel,
  onRetry,
  busyAction,
}: {
  job: JobOut;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  busyAction: string | null;
}) {
  const canCancel = job.status === "PENDING" || job.status === "CLAIMED" || job.status === "RUNNING";
  const canRetry = job.status === "FAILED" || job.status === "CANCELLED";

  return (
    <tr>
      <td>
        <div className="font-mono text-[11px] text-typeblue">{job.job_number}</div>
        <div className="mt-1 text-sm font-medium text-main">{job.title || `${job.operation_type} job`}</div>
      </td>
      <td>
        <OperationTypeTag type={job.operation_type} />
      </td>
      <td>
        <JobStatusBadge status={job.status} />
      </td>
      <td className="min-w-[180px]">
        <JobProgressBar value={job.progress_percent} label={job.stage || "Queued"} />
      </td>
      <td>
        <div className="max-w-[260px] truncate text-sm text-main">{job.stage || "-"}</div>
        <div className="mt-1 max-w-[260px] truncate text-xs text-muted">
          {job.message || job.error_message || "-"}
        </div>
      </td>
      <td>
        <div className="font-mono text-[11px] text-muted">{formatDateTime(job.created_at)}</div>
      </td>
      <td>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/jobs/${job.id}`} className="fg-btn !px-2.5 !py-1.5 text-xs">
            View
          </Link>
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(job.id)}
              disabled={busyAction === job.id}
              className="fg-btn !px-2.5 !py-1.5 text-xs"
            >
              Cancel
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={() => onRetry(job.id)}
              disabled={busyAction === job.id}
              className="fg-btn-primary !px-2.5 !py-1.5 text-xs"
            >
              Retry
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
