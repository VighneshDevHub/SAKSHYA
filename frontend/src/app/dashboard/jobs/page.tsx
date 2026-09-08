"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  cancelJob,
  ConflictError,
  createJob,
  listCases,
  listDevices,
  listJobs,
  retryJob,
  UnauthorizedError,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { CaseSummary, DeviceOut, JobOut, JobCreateIn, OperationType, TaskStatus } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import {
  JOB_FILTERS,
  JOB_PAYLOAD_TEMPLATES,
  JobRow,
} from "@/components/jobs/JobUI";

type Notice = { tone: "error" | "success"; text: string } | null;

const OPERATION_OPTIONS: Array<{ value: OperationType; label: string }> = [
  { value: "DRIVE_ERASE", label: "Drive Erase" },
  { value: "FILE_ERASE", label: "File / Folder Erase" },
  { value: "RECOVERY", label: "Recovery" },
];

function getDefaultTitle(operationType: OperationType): string {
  return OPERATION_OPTIONS.find((item) => item.value === operationType)?.label ?? operationType;
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobOut[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [devices, setDevices] = useState<DeviceOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | "ALL">("ALL");

  const [operationType, setOperationType] = useState<OperationType>("DRIVE_ERASE");
  const [title, setTitle] = useState(getDefaultTitle("DRIVE_ERASE"));
  const [caseId, setCaseId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [payloadText, setPayloadText] = useState(JOB_PAYLOAD_TEMPLATES.DRIVE_ERASE);

  async function loadData(nextStatus: TaskStatus | "ALL" = selectedStatus) {
    try {
      const [jobRows, caseRows, deviceRows] = await Promise.all([
        listJobs({ status: nextStatus === "ALL" ? undefined : nextStatus, limit: 100 }),
        listCases(),
        listDevices({ limit: 100 }),
      ]);
      setJobs(jobRows);
      setCases(caseRows);
      setDevices(deviceRows);
      setNotice(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to load task queue data.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void loadData();
  }, [router]);

  useEffect(() => {
    if (!loading) {
      setRefreshing(true);
      void loadData(selectedStatus);
    }
  }, [selectedStatus]);

  const pendingCount = useMemo(
    () => jobs.filter((job) => job.status === "PENDING" || job.status === "CLAIMED" || job.status === "RUNNING").length,
    [jobs],
  );

  async function handleCreateJob(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setNotice(null);
    try {
      const payloadJson = JSON.parse(payloadText) as Record<string, unknown>;
      const request: JobCreateIn = {
        operation_type: operationType,
        title: title.trim() || getDefaultTitle(operationType),
        payload: payloadJson,
        case_id: caseId || null,
        device_id: deviceId || null,
      };
      const created = await createJob(request);
      setNotice({ tone: "success", text: `Job ${created.job_number} created successfully.` });
      await loadData(selectedStatus);
      router.push(`/dashboard/jobs/${created.id}`);
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof SyntaxError
          ? "Payload must be valid JSON."
          : err instanceof Error
            ? err.message
            : "Failed to create job.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(jobId: string) {
    setBusyJobId(jobId);
    setNotice(null);
    try {
      await cancelJob(jobId);
      setNotice({ tone: "success", text: "Job cancelled successfully." });
      await loadData(selectedStatus);
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to cancel job.",
      });
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleRetry(jobId: string) {
    setBusyJobId(jobId);
    setNotice(null);
    try {
      const retried = await retryJob(jobId);
      setNotice({ tone: "success", text: `New retry job ${retried.job_number} created.` });
      await loadData(selectedStatus);
    } catch (err) {
      const text =
        err instanceof ConflictError
          ? "This job cannot be retried in its current state."
          : err instanceof Error
            ? err.message
            : "Failed to retry job.";
      setNotice({ tone: "error", text });
    } finally {
      setBusyJobId(null);
    }
  }

  function handleOperationChange(nextType: OperationType) {
    setOperationType(nextType);
    if (!title.trim() || title === getDefaultTitle(operationType)) {
      setTitle(getDefaultTitle(nextType));
    }
    setPayloadText(JOB_PAYLOAD_TEMPLATES[nextType]);
  }

  return (
    <AppShell
      eyebrow="Task Queue"
      title="Operational Job Orchestration"
      subtitle="Create, review, and supervise dashboard-driven forensic jobs while keeping the existing CLI execution model intact."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void loadData(selectedStatus);
            }}
            className="fg-btn"
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Queue"}
          </button>
          <Link href="/dashboard/devices" className="fg-btn">
            Device Inventory
          </Link>
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

      <section className="mb-6 grid gap-4 lg:grid-cols-[1.05fr,1.7fr]">
        <div className="fg-panel">
          <div className="fg-panel-header">
            <div className="fg-panel-title">Create Job</div>
            <div className="text-xs text-muted">Dashboard to queue</div>
          </div>
          <form className="space-y-4 p-5" onSubmit={handleCreateJob}>
            <div>
              <label className="fg-label" htmlFor="operation-type">Operation Type</label>
              <select
                id="operation-type"
                value={operationType}
                onChange={(e) => handleOperationChange(e.target.value as OperationType)}
                className="fg-input"
              >
                {OPERATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="fg-label" htmlFor="job-title">Job Title</label>
              <input
                id="job-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="fg-input"
                placeholder="Case-linked drive wipe"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="fg-label" htmlFor="job-case">Case</label>
                <select
                  id="job-case"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="fg-input"
                >
                  <option value="">No case linkage</option>
                  {cases.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.case_number} - {item.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="fg-label" htmlFor="job-device">Device</label>
                <select
                  id="job-device"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="fg-input"
                >
                  <option value="">No device linkage</option>
                  {devices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.serial_number} - {item.manufacturer} {item.model}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="fg-label !mb-0" htmlFor="payload-json">Payload JSON</label>
                <button
                  type="button"
                  onClick={() => setPayloadText(JOB_PAYLOAD_TEMPLATES[operationType])}
                  className="text-xs font-medium text-govt-blue hover:underline"
                >
                  Reset Template
                </button>
              </div>
              <textarea
                id="payload-json"
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                rows={10}
                spellCheck={false}
                className="fg-input min-h-[220px] font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="max-w-md text-xs text-muted">
                Queue records are orchestration metadata only. Existing CLI report submission and certificate signing remain unchanged.
              </p>
              <button type="submit" disabled={submitting} className="fg-btn-primary">
                {submitting ? "Creating..." : "Create Job"}
              </button>
            </div>
          </form>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="fg-panel p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Total Jobs</div>
            <div className="mt-2 text-3xl font-semibold text-main">{jobs.length}</div>
            <p className="mt-2 text-sm text-muted">Filtered queue rows visible to the current operator.</p>
          </div>
          <div className="fg-panel p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Active Pipeline</div>
            <div className="mt-2 text-3xl font-semibold text-main">{pendingCount}</div>
            <p className="mt-2 text-sm text-muted">Pending, claimed, and running work items that still require execution.</p>
          </div>
          <div className="fg-panel p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Linked Assets</div>
            <div className="mt-2 text-3xl font-semibold text-main">{cases.length + devices.length}</div>
            <p className="mt-2 text-sm text-muted">Cases and devices available for linkage when scheduling new work.</p>
          </div>
        </div>
      </section>

      <section className="fg-panel">
        <div className="fg-panel-header">
          <div>
            <div className="fg-panel-title">Queue Register</div>
            <p className="mt-1 text-xs text-muted">Operational state, progress, retry lineage, and live job entry points.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {JOB_FILTERS.map((filter) => {
              const active = selectedStatus === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setSelectedStatus(filter.value)}
                  className={
                    "rounded-sm border px-2.5 py-1 text-xs " +
                    (active
                      ? "border-govt-navy bg-govt-navy text-white"
                      : "border-line bg-panel text-muted hover:text-main")
                  }
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-muted">Loading job queue...</div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">
            No jobs found for the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="fg-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Operation</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Stage / Message</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onCancel={(jobId) => void handleCancel(jobId)}
                    onRetry={(jobId) => void handleRetry(jobId)}
                    busyAction={busyJobId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
