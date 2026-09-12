"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createJob, listCases, listDevices, UnauthorizedError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import type { CaseSummary, DeviceOut, JobCreateIn } from "@/lib/types";

const SCAN_MODES = [
  { value: "quick", label: "Quick scan", detail: "Fast pass over accessible file structures." },
  { value: "deep", label: "Deep scan", detail: "Signature carving across the full image." },
  { value: "deleted", label: "Deleted files", detail: "Prioritise deleted and orphaned entries." },
  { value: "partition", label: "Partition scan", detail: "Inspect selected partition boundaries." },
  { value: "custom", label: "Custom scan", detail: "Use the selected evidence profile." },
] as const;

const FILE_TYPES = ["Documents", "Images", "Videos", "Audio", "Email", "Database"];

function StepRail({ step }: { step: number }) {
  const labels = ["Device", "Scan", "File types", "Review"];
  return (
    <ol className="grid grid-cols-4 gap-2">
      {labels.map((label, index) => {
        const number = index + 1;
        const active = number === step;
        const complete = number < step;
        return (
          <li key={label} className={`border-t-2 pt-2 ${active ? "border-govt-navy" : complete ? "border-govt-green" : "border-line"}`}>
            <div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${active ? "text-govt-navy" : "text-muted"}`}>
              0{number}
            </div>
            <div className={`mt-1 text-xs ${active ? "font-semibold text-main" : "text-muted"}`}>{label}</div>
          </li>
        );
      })}
    </ol>
  );
}

export default function RecoveryPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [devices, setDevices] = useState<DeviceOut[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [imagePath, setImagePath] = useState("D:\\Images\\evidence.dd");
  const [outputDir, setOutputDir] = useState("D:\\RecoveryOutput");
  const [scanMode, setScanMode] = useState<(typeof SCAN_MODES)[number]["value"]>("deep");
  const [fileTypes, setFileTypes] = useState<string[]>(FILE_TYPES);
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
        if (queryDevice && deviceRows.some((device) => device.id === queryDevice)) setDeviceId(queryDevice);
      })
      .catch((err) => {
        if (err instanceof UnauthorizedError) router.push("/login");
        else setError(err instanceof Error ? err.message : "Failed to load recovery context.");
      });
  }, [router]);

  const selectedDevice = useMemo(() => devices.find((device) => device.id === deviceId), [devices, deviceId]);
  const selectedScan = SCAN_MODES.find((mode) => mode.value === scanMode) ?? SCAN_MODES[1];

  function toggleFileType(type: string) {
    setFileTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  }

  async function startRecovery() {
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {
      image_path: imagePath.trim(),
      output_dir: outputDir.trim(),
      deep_scan: scanMode === "deep" || scanMode === "custom",
      scan_mode: scanMode,
      file_types: fileTypes,
      auto_execute: true,
    };
    const request: JobCreateIn = {
      operation_type: "RECOVERY",
      title: `Recovery · ${selectedDevice?.serial_number ?? "evidence image"}`,
      payload,
      case_id: caseId || null,
      device_id: deviceId || null,
    };
    try {
      const job = await createJob(request);
      router.push(`/dashboard/jobs/${job.id}`);
    } catch (err) {
      if (err instanceof UnauthorizedError) router.push("/login");
      else setError(err instanceof Error ? err.message : "Failed to create recovery job.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      eyebrow="Recovery Engine"
      title="Evidence Recovery Workflow"
      subtitle="Configure a case-linked recovery job, then hand execution to the existing recovery agent and live job monitor."
      actions={<Link href="/dashboard/jobs" className="fg-btn">Open task queue</Link>}
    >
      {error && <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
        <section className="fg-panel">
          <div className="border-b border-line p-5">
            <StepRail step={step} />
          </div>

          {step === 1 && (
            <div className="space-y-5 p-5">
              <div>
                <div className="fg-panel-title">Choose evidence source</div>
                <p className="mt-1 text-sm text-muted">Select an inventory device or work from a forensic image path.</p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="fg-label">Device</span>
                <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="fg-input">
                  <option value="">No registered device selected</option>
                  {devices.map((device) => <option key={device.id} value={device.id}>{device.serial_number} · {device.model || device.media_type}</option>)}
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Evidence image path</span><input value={imagePath} onChange={(event) => setImagePath(event.target.value)} className="fg-input" /></label>
                <label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Recovery output directory</span><input value={outputDir} onChange={(event) => setOutputDir(event.target.value)} className="fg-input" /></label>
              </div>
              <div className="flex justify-end"><button type="button" className="fg-btn-primary" onClick={() => setStep(2)} disabled={!imagePath.trim()}>Continue to scan profile →</button></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 p-5">
              <div><div className="fg-panel-title">Choose scan profile</div><p className="mt-1 text-sm text-muted">The selected profile is recorded in the job payload for the recovery agent.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SCAN_MODES.map((mode) => <button key={mode.value} type="button" onClick={() => setScanMode(mode.value)} className={`rounded-md border p-4 text-left ${scanMode === mode.value ? "border-govt-navy bg-govt-blueLight" : "border-line bg-panel hover:bg-field"}`}><div className="font-medium text-main">{mode.label}</div><div className="mt-1 text-xs leading-relaxed text-muted">{mode.detail}</div></button>)}
              </div>
              <div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(1)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => setStep(3)}>Continue to file types →</button></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 p-5">
              <div><div className="fg-panel-title">Choose file types</div><p className="mt-1 text-sm text-muted">Limit classification hints while preserving the agent's recovery behavior.</p></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FILE_TYPES.map((type) => <label key={type} className="flex cursor-pointer items-center gap-3 rounded-md border border-line bg-panel p-3 text-sm text-main hover:bg-field"><input type="checkbox" checked={fileTypes.includes(type)} onChange={() => toggleFileType(type)} className="h-4 w-4 accent-govt-navy" />{type}</label>)}
              </div>
              <div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(2)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => setStep(4)} disabled={!fileTypes.length}>Review recovery →</button></div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 p-5">
              <div><div className="fg-panel-title">Review and queue</div><p className="mt-1 text-sm text-muted">Confirm the read-only configuration before creating the recovery job.</p></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Source</div><div className="mt-1 break-all text-sm text-main">{selectedDevice?.serial_number ?? imagePath}</div></div>
                <div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Scan</div><div className="mt-1 text-sm text-main">{selectedScan.label}</div></div>
                <div className="rounded-md border border-line bg-field p-4"><div className="fg-label">File types</div><div className="mt-1 text-sm text-main">{fileTypes.join(", ")}</div></div>
                <label className="rounded-md border border-line bg-field p-4"><span className="fg-label">Case linkage</span><select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="fg-input mt-2"><option value="">No case selected</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.case_number} · {item.title}</option>)}</select></label>
              </div>
              <div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(3)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => void startRecovery()} disabled={submitting}>{submitting ? "Creating job..." : "Start recovery job"}</button></div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="fg-panel p-5"><div className="fg-label">Workflow status</div><div className="mt-2 font-display text-xl font-semibold text-main">{step < 4 ? `Configuration ${step}/3` : "Ready to queue"}</div><p className="mt-2 text-sm leading-relaxed text-muted">After submission, the existing agent workflow handles claiming, progress, evidence output, certificate creation, and ledger anchoring.</p></div>
          <div className="fg-panel p-5"><div className="fg-label">Safety boundary</div><p className="mt-2 text-sm leading-relaxed text-muted">This screen creates a job only. It does not execute recovery directly or modify the source evidence.</p></div>
        </aside>
      </div>
    </AppShell>
  );
}
