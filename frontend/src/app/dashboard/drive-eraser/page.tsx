"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createJob, listCases, listDevices, UnauthorizedError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import type { CaseSummary, DeviceOut, JobCreateIn } from "@/lib/types";

const METHODS = [
  { value: "CLEAR", label: "Clear", detail: "Standard overwrite path for supported targets." },
  { value: "PURGE", label: "Purge", detail: "Device-aware purge profile for HDD workflows." },
  { value: "CRYPTO_ERASE", label: "Crypto-Erase", detail: "Encryption-backed sanitization for compatible SSD/NVMe media." },
  { value: "NIST_CLEAR", label: "NIST Clear", detail: "Explicit NIST-style clear profile for a controlled demo target." },
] as const;

const STEPS = ["Drive", "Health", "Method", "Confirm"];

function StepRail({ step }: { step: number }) {
  return <ol className="grid grid-cols-4 gap-2">{STEPS.map((label, index) => { const number = index + 1; const active = number === step; const complete = number < step; return <li key={label} className={`border-t-2 pt-2 ${active ? "border-typeblue" : complete ? "border-govt-green" : "border-line"}`}><div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${active ? "text-typeblue" : "text-muted"}`}>0{number}</div><div className={`mt-1 text-xs ${active ? "font-semibold text-main" : "text-muted"}`}>{label}</div></li>; })}</ol>;
}

export default function DriveEraserPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [devices, setDevices] = useState<DeviceOut[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [target, setTarget] = useState("test_wipe_target.img");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("CLEAR");
  const [verification, setVerification] = useState(true);
  const [realDevice, setRealDevice] = useState(false);
  const [caseId, setCaseId] = useState("");
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
      .then(([deviceRows, caseRows]) => { setDevices(deviceRows); setCases(caseRows); })
      .catch((err) => { if (err instanceof UnauthorizedError) router.push("/login"); else setError(err instanceof Error ? err.message : "Failed to load drive context."); });
  }, [router]);

  const selectedDevice = devices.find((device) => device.id === deviceId);
  const selectedMethod = METHODS.find((item) => item.value === method) ?? METHODS[0];

  async function startErase() {
    const trimmedTarget = target.trim();
    if (realDevice && !/^\d+$/.test(trimmedTarget)) {
      setError("Real-device mode requires a numeric Windows DeviceId such as 1. Use a filename only for a test-file job.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {
      target: trimmedTarget,
      method,
      verification,
      real_device: realDevice,
      auto_execute: true,
    };
    const request: JobCreateIn = { operation_type: "DRIVE_ERASE", title: `Drive erase · ${selectedDevice?.serial_number ?? trimmedTarget}`, payload, case_id: caseId || null, device_id: deviceId || null };
    try {
      const job = await createJob(request);
      router.push(`/dashboard/jobs/${job.id}`);
    } catch (err) {
      if (err instanceof UnauthorizedError) router.push("/login");
      else setError(err instanceof Error ? err.message : "Failed to create drive erase job.");
    } finally { setSubmitting(false); }
  }

  return <AppShell eyebrow="Drive Eraser" title="Secure Drive Sanitization" subtitle="Select a target, review its reported health, choose an erase plan, and queue the existing Drive Eraser agent for execution." actions={<Link href="/dashboard/jobs" className="fg-btn">Open task queue</Link>}>
    {error && <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
      <section className="fg-panel">
        <div className="border-b border-line p-5"><StepRail step={step} /></div>
        {step === 1 && <div className="space-y-5 p-5"><div><div className="fg-panel-title">Choose drive</div><p className="mt-1 text-sm text-muted">Select an inventory device or use a safe file target for a demonstration.</p></div><label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Registered drive</span><select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="fg-input"><option value="">No registered drive</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.serial_number} · {device.media_type} · {device.status}</option>)}</select></label><label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Target path or device identifier</span><input value={target} onChange={(event) => setTarget(event.target.value)} className="fg-input font-mono text-xs" /></label><div className="rounded-md border border-govt-gold/40 bg-govt-gold/10 p-4 text-sm text-main">Use a test file target for demonstrations. Real device mode is intentionally marked as a dangerous operator action.</div><div className="flex justify-end"><button type="button" className="fg-btn-primary" onClick={() => setStep(2)} disabled={!target.trim()}>Continue to health →</button></div></div>}
        {step === 2 && <div className="space-y-5 p-5"><div><div className="fg-panel-title">Health analysis</div><p className="mt-1 text-sm text-muted">Review the inventory data available before selecting a wipe plan.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Media</div><div className="mt-1 text-main">{selectedDevice?.media_type?.replaceAll("_", " ") ?? "File target"}</div></div><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Capacity</div><div className="mt-1 font-mono text-sm text-main">{selectedDevice?.capacity_bytes ? `${(selectedDevice.capacity_bytes / 1073741824).toFixed(2)} GB` : "Detected by agent"}</div></div><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Health</div><div className="mt-1 text-main">{selectedDevice?.health ?? "Agent detection required"}</div></div><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Connection</div><div className="mt-1 text-main">{selectedDevice?.connection_type ?? "Local file"}</div></div></div><div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(1)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => setStep(3)}>Choose erase method →</button></div></div>}
        {step === 3 && <div className="space-y-5 p-5"><div><div className="fg-panel-title">Choose erase method</div><p className="mt-1 text-sm text-muted">The agent remains authoritative for hardware compatibility and method selection.</p></div><div className="grid gap-3 sm:grid-cols-2">{METHODS.map((item) => <button key={item.value} type="button" onClick={() => setMethod(item.value)} className={`rounded-md border p-4 text-left ${method === item.value ? "border-typeblue bg-typeblue-dim" : "border-line bg-panel hover:bg-field"}`}><div className="font-medium text-main">{item.label}</div><div className="mt-1 text-xs leading-relaxed text-muted">{item.detail}</div></button>)}</div><label className="flex items-center gap-3 rounded-md border border-line bg-field p-4 text-sm text-main"><input type="checkbox" checked={verification} onChange={(event) => setVerification(event.target.checked)} className="h-4 w-4 accent-govt-blue" />Require read-back verification</label><div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(2)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => setStep(4)}>Review confirmation →</button></div></div>}
        {step === 4 && <div className="space-y-5 p-5"><div><div className="fg-panel-title">Confirm destructive operation</div><p className="mt-1 text-sm text-muted">This screen queues a job; actual execution remains with the existing agent.</p></div><div className="rounded-md border border-govt-red/30 bg-govt-redLight p-4 text-sm text-govt-red"><div className="font-semibold">Final confirmation required</div><p className="mt-1">Drive sanitization is irreversible when the agent starts. Confirm only an approved target.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Target</div><div className="mt-1 break-all font-mono text-xs text-main">{selectedDevice?.serial_number ?? target}</div></div><div className="rounded-md border border-line bg-field p-4"><div className="fg-label">Plan</div><div className="mt-1 text-sm text-main">{selectedMethod.label} · {verification ? "verified" : "unverified"}</div></div></div><label className="flex items-start gap-3 rounded-md border border-govt-red/25 p-4 text-sm text-main"><input type="checkbox" checked={realDevice} onChange={(event) => setRealDevice(event.target.checked)} className="mt-0.5 h-4 w-4 accent-govt-red" /><span><span className="font-semibold">Mark as real-device operation</span><span className="mt-1 block text-xs text-muted">Leave disabled for test files and UI demonstrations.</span></span></label><label className="flex flex-col gap-1.5 text-sm"><span className="fg-label">Case linkage</span><select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="fg-input"><option value="">No case selected</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.case_number} · {item.title}</option>)}</select></label><div className="flex justify-between"><button type="button" className="fg-btn" onClick={() => setStep(3)}>← Back</button><button type="button" className="fg-btn-primary" onClick={() => void startErase()} disabled={submitting}>{submitting ? "Creating job..." : "Queue drive erase"}</button></div></div>}
      </section>
      <aside className="space-y-4"><div className="fg-panel p-5"><div className="fg-label">Agent boundary</div><p className="mt-2 text-sm leading-relaxed text-muted">The Drive Eraser CLI detects the target, selects compatible wiping logic, performs the wipe, verifies samples, and submits the signed report.</p></div><div className="fg-panel p-5"><div className="fg-label">After queueing</div><p className="mt-2 text-sm leading-relaxed text-muted">Follow progress, current stage, agent assignment, errors, and certificate linkage from the live job detail page.</p></div></aside>
    </div>
  </AppShell>;
}
