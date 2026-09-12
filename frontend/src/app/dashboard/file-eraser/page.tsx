"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createJob, listCases, listDevices, UnauthorizedError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import type { CaseSummary, DeviceOut, JobCreateIn } from "@/lib/types";

const STANDARDS = [
  { value: "NIST_CLEAR", label: "NIST Clear", detail: "Single-pass sanitization for ordinary file targets." },
  { value: "DOD_5220_22_M", label: "DoD 5220.22-M", detail: "Multi-pass overwrite profile for demonstration workflows." },
  { value: "CUSTOM", label: "Custom passes", detail: "Keep the agent profile configurable through the payload." },
] as const;

const STEPS = ["Targets", "Standard", "Preview", "Review"];

function StepRail({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const active = number === step;
        const complete = number < step;
        return <li key={label} className={`border-t-2 pt-2 ${active ? "border-amber" : complete ? "border-govt-green" : "border-line"}`}><div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${active ? "text-amber" : "text-muted"}`}>0{number}</div><div className={`mt-1 text-xs ${active ? "font-semibold text-main" : "text-muted"}`}>{label}</div></li>;
      })}
    </ol>
  );
}

export default function FileEraserPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [targetsText, setTargetsText] = useState("C:\\Evidence\\to-delete");
  const [standard, setStandard] = useState<(typeof STANDARDS)[number]["value"]>("NIST_CLEAR");
  const [metadataScrub, setMetadataScrub] = useState(true);
  const [freeSpaceOverwrite, setFreeSpaceOverwrite] = useState(true);
  const [freeSpaceMaxMb, setFreeSpaceMaxMb] = useState("256");
  const [caseId, setCaseId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<DeviceOut[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    const queryDevice = new URLSearchParams(window.location.search).get("device");
    setDeviceId(queryDevice ?? "");
    void Promise.all([listDevices({ limit: 100 }), listCases()])
      .then(([deviceRows, caseRows]) => {
        setDevices(deviceRows);
        setCases(caseRows);
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) router.push("/login");
        else setError(err instanceof Error ? err.message : "Failed to load erase context.");
      });
  }, [router]);

  const targets = useMemo(() => targetsText.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean), [targetsText]);
  const selectedStandard = STANDARDS.find((item) => item.value === standard) ?? STANDARDS[0];
  const selectedDevice = devices.find((device) => device.id === deviceId);

  async function startErase() {
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {
      targets,
      method: standard,
      metadata_scrub: metadataScrub,
      free_space_overwrite: freeSpaceOverwrite,
      freespace_max_bytes: freeSpaceOverwrite ? Math.max(1, Number(freeSpaceMaxMb) || 256) * 1024 * 1024 : 0,
      simulation: false,
      auto_execute: true,
    };
    const request: JobCreateIn = {
      operation_type: "FILE_ERASE",
      title: `File erase · ${targets[0] ?? "selected targets"}`,
      payload,
      case_id: caseId || null,
      device_id: deviceId || null,
    };
    try {
      const job = await createJob(request);
      router.push(`/dashboard/jobs/${job.id}`);
    } catch (err) {
      if (err instanceof UnauthorizedError) router.push("/login");
      else setError(err instanceof Error ? err.message : "Failed to create file erase job.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell eyebrow="File & Folder Eraser" title="Selective Sanitization Workflow" subtitle="Prepare a case-linked file erasure job with an explicit preview and verification boundary. The existing eraser agent performs execution after the job is claimed." actions={<Link href="/dashboard/jobs" className="fg-btn">Open task queue</Link>}>
      {error && <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">{error}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
        <section className="fg-panel">
          <div className="border-b border-line p-5"><StepRail step={step} /></div>
          {step === 1 && <div className="space-y-5 p-5">
            <div><div className="fg-panel-title">Select folders or files</div><p className="mt-1 text-sm text-muted">Enter one path per line or separate targets with commas. Nothing is touched while configuring this job.</p></div>
            <label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Targets</span><textarea value={targetsText} onChange={(event) => setTargetsText(event.target.value)} rows={5} className="fg-input font-mono text-xs" placeholder={'C:\\Evidence\\to-delete\nC:\\Evidence\\old-notes.txt'} /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Registered device (optional)</span><select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="fg-input"><option value="">No device linkage</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.serial_number} · {device.model || device.media_type}</option>)}</select></label>
            <div className="flex justify-end"><button type="button" className="fg-btn-primary" onClick={() => setStep(2)} disabled={!targets.length}>Continue to standard →</button></div>
          </div>}
          {step === 2 && <div className="space-y-5 p-5">
            <div><div className="fg-panel-title">Select sanitization standard</div><p className="mt-1 text-sm text-muted">The selected method is recorded in the job payload and displayed in the execution view.</p></div>
            <div className="grid gap-3 sm:grid-cols-3">{STANDARDS.map((item) => <button key={item.value} type="button" onClick={() => setStandard(item.value)} className={`rounded-md border p-4 text-left ${standard === item.value ? "border-amber bg-amber/10" : "border-line bg-panel hover:bg-field"}`}><div className="font-medium text-main">{item.label}</div><div className="mt-1 text-xs leading-relaxed text-muted">{item.detail}</div></button>)}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-3 rounded-md border border-line bg-field p-4 text-sm text-main"><input type="checkbox" checked={metadataScrub} onChange={(event) => setMetadataScrub(event.target.checked)} className="h-4 w-4 accent-amber" />Scrub filesystem metadata</label><label className="flex items-center gap-3 rounded-md border border-line bg-field p-4 text-sm text-main"><input type="checkbox" checked={freeSpaceOverwrite} onChange={(event) => setFreeSpaceOverwrite(event.target.checked)} className="h-4 w-4 accent-amber" />Overwrite free space</label></div>
            {freeSpaceOverwrite && <label className="flex max-w-xs flex-col gap-1.5 text-sm"><span className="fg-label">Free-space test limit (MB)</span><input type="number" min="1" value={freeSpaceMaxMb} onChange={(event) => setFreeSpaceMaxMb(event.target.value)} className="fg-input" /><span className="text-xs text-muted">Use a limit for demonstrations; unlimited free-space wiping is intentionally not enabled here.</span></label>}
            <div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(1)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => setStep(3)}>Continue to preview →</button></div>
          </div>}
          {step === 3 && <div className="space-y-5 p-5">
            <div><div className="fg-panel-title">Preview operation</div><p className="mt-1 text-sm text-muted">Review the scope before queueing. The preview is informational and does not modify the filesystem.</p></div>
            <div className="rounded-md border border-amber/40 bg-amber/10 p-4 text-sm text-main"><div className="font-semibold">{targets.length} target{targets.length === 1 ? "" : "s"} selected</div><ul className="mt-2 space-y-1 font-mono text-xs text-muted">{targets.map((target) => <li key={target} className="break-all">{target}</li>)}</ul></div>
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Standard</div><div className="mt-1 text-sm text-main">{selectedStandard.label}</div></div><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Metadata</div><div className="mt-1 text-sm text-main">{metadataScrub ? "Enabled" : "Skipped"}</div></div><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Free space</div><div className="mt-1 text-sm text-main">{freeSpaceOverwrite ? "Enabled" : "Skipped"}</div></div></div>
            <div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(2)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => setStep(4)}>Continue to review →</button></div>
          </div>}
          {step === 4 && <div className="space-y-5 p-5">
            <div><div className="fg-panel-title">Review and queue</div><p className="mt-1 text-sm text-muted">Choose optional case linkage, then create the existing FILE_ERASE job.</p></div>
            <label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Case linkage</span><select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="fg-input"><option value="">No case selected</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.case_number} · {item.title}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Target device</div><div className="mt-1 text-sm text-main">{selectedDevice?.serial_number ?? "No device linkage"}</div></div><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Execution</div><div className="mt-1 text-sm text-main">Queued for File Eraser Agent</div></div></div>
            <div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(3)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => void startErase()} disabled={submitting}>{submitting ? "Creating job..." : "Queue file erase"}</button></div>
          </div>}
        </section>
        <aside className="space-y-4"><div className="fg-panel p-5"><div className="fg-label">Safety boundary</div><p className="mt-2 text-sm leading-relaxed text-muted">This wizard only creates a job. Actual overwrite, metadata scrubbing, free-space cleansing, and verification stay inside the existing CLI agent.</p></div><div className="fg-panel p-5"><div className="fg-label">After queueing</div><p className="mt-2 text-sm leading-relaxed text-muted">The job detail page provides live status, progress, cancellation, retry, and certificate linkage.</p></div></aside>
      </div>
    </AppShell>
  );
}
