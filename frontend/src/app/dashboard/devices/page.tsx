"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createDevice,
  detectDevices,
  listDevices,
  UnauthorizedError,
  updateDevice,
} from "@/lib/api";
import { getStoredRole, getToken } from "@/lib/auth";
import type {
  DeviceConnectionType,
  DeviceCreateIn,
  DeviceHealth,
  DeviceMediaType,
  DeviceOut,
  DeviceStatus,
  DeviceUpdateIn,
} from "@/lib/types";
import { AppShell } from "@/components/AppShell";

// ------------------------------------------------------------------ helpers
function bytesHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

const STATUS_VARIANT: Record<DeviceStatus, string> = {
  CONNECTED: "fg-badge fg-badge--green",
  DISCONNECTED: "fg-badge",
  IN_USE: "fg-badge fg-badge--navy",
  ERRORED: "fg-badge fg-badge--red",
  QUARANTINED: "fg-badge fg-badge--gold",
  SANITIZED: "fg-badge fg-badge--blue",
  DECOMMISSIONED: "fg-badge",
};

const HEALTH_VARIANT: Record<DeviceHealth, string> = {
  EXCELLENT: "fg-badge fg-badge--green",
  GOOD: "fg-badge fg-badge--green",
  FAIR: "fg-badge fg-badge--gold",
  POOR: "fg-badge fg-badge--red",
  CRITICAL: "fg-badge fg-badge--red",
  UNKNOWN: "fg-badge",
};

const MEDIA_OPTIONS: DeviceMediaType[] = [
  "SSD", "HDD", "USB_FLASH", "SD_CARD", "NVME_SSD", "OPTICAL", "TAPE", "OTHER",
];
const CONN_OPTIONS: DeviceConnectionType[] = [
  "USB", "SATA", "NVMe", "PCIe", "SAS", "SD", "NETWORK", "UNKNOWN",
];
const STATUS_OPTIONS: DeviceStatus[] = [
  "CONNECTED", "DISCONNECTED", "IN_USE", "ERRORED", "QUARANTINED", "SANITIZED", "DECOMMISSIONED",
];
const HEALTH_OPTIONS: DeviceHealth[] = [
  "EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL", "UNKNOWN",
];

// ================================================================ page
export default function DeviceInventoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<DeviceOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [monitoring, setMonitoring] = useState(false);

  // filters
  const [fStatus, setFStatus] = useState<string>("");
  const [fConn, setFConn] = useState<string>("");
  const [fMedia, setFMedia] = useState<string>("");
  const [fSerial, setFSerial] = useState<string>("");

  // create/edit modal state
  const [editing, setEditing] = useState<DeviceOut | "NEW" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const next = await listDevices({
        connection_type: fConn || undefined,
        status: fStatus || undefined,
        media_type: fMedia || undefined,
        serial_contains: fSerial || undefined,
      });
      setRows(next);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!getToken()) return;

    const role = getStoredRole();
    const canDetect = role === "ADMINISTRATOR" || role === "INVESTIGATOR" || role === "SUPERVISOR";
    let active = true;

    async function monitorHost() {
      if (!active) return;
      setMonitoring(true);
      try {
        if (canDetect) {
          await detectDevices();
        }
        await reload();
      } catch {
        // Monitoring is best-effort; the manual controls continue to expose errors.
      } finally {
        if (active) setMonitoring(false);
      }
    }

    const interval = window.setInterval(() => void monitorHost(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const form = e.currentTarget.elements as typeof e.currentTarget.elements & {
        serial_number: HTMLInputElement;
        manufacturer: HTMLInputElement;
        model: HTMLInputElement;
        connection_type: HTMLSelectElement;
        media_type: HTMLSelectElement;
        capacity_bytes: HTMLInputElement;
        health: HTMLSelectElement;
        status: HTMLSelectElement;
        firmware_version: HTMLInputElement;
        notes: HTMLTextAreaElement;
      };
      const cap = Number(form.capacity_bytes.value);
      const base: DeviceCreateIn = {
        serial_number: form.serial_number.value.trim(),
        manufacturer: form.manufacturer.value.trim() || undefined,
        model: form.model.value.trim() || undefined,
        connection_type: (form.connection_type.value as DeviceConnectionType) || undefined,
        media_type: (form.media_type.value as DeviceMediaType) || undefined,
        capacity_bytes: Number.isFinite(cap) && cap > 0 ? cap : undefined,
        health: (form.health.value as DeviceHealth) || undefined,
        status: (form.status.value as DeviceStatus) || undefined,
        firmware_version: form.firmware_version.value.trim() || undefined,
        notes: form.notes.value.trim() || undefined,
      };
      if (editing === "NEW") {
        await createDevice(base);
      } else if (editing) {
        const payload: DeviceUpdateIn = base;
        await updateDevice(editing.id, payload);
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save device");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    setDetectionMessage(null);
    setError(null);
    try {
      const result = await detectDevices();
      setDetectionMessage(`${result.detected_count} host device${result.detected_count === 1 ? "" : "s"} detected and synchronized.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Automatic device detection failed");
    } finally {
      setDetecting(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void handleDetect()}
        className="fg-btn !py-1.5 !px-3 text-xs"
        disabled={detecting}
      >
        {detecting ? "Detecting..." : "Detect Host Devices"}
      </button>
      <button
        type="button"
        onClick={() => reload()}
        className="fg-btn !py-1.5 !px-3 text-xs"
      >
        ↻ Refresh
      </button>
      <button
        type="button"
        onClick={() => setEditing("NEW")}
        className="fg-btn-primary !py-1.5 !px-3 text-xs"
      >
        + Register Device
      </button>
    </div>
  );

  return (
    <AppShell
      eyebrow="Asset Management"
      title="Device Inventory"
      subtitle="Enumeration and lifecycle management of all storage media processed through the Digital Forensics Unit. Data is pulled in real time from /api/v1/devices."
      actions={actions}
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {detectionMessage && (
        <div className="mb-6 rounded-md border border-govt-green/25 bg-govt-greenLight px-4 py-3 text-sm text-govt-green">
          {detectionMessage}
        </div>
      )}

      {/* ========== FILTER STRIP ========== */}
      <div className="fg-panel mb-6 overflow-hidden">
        <div className="fg-panel-header">
          <div className="fg-panel-title">Filter Inventory</div>
          <div className="font-mono text-[11px] text-muted">
            {rows ? `${rows.length} devices` : "—"}
          </div>
        </div>
        <div className="flex items-center gap-2 border-b border-line bg-field/40 px-5 py-2.5 text-xs text-muted">
          <span
            className={`h-2 w-2 rounded-full ${monitoring ? "bg-govt-gold animate-pulse" : "bg-govt-green"}`}
            aria-hidden="true"
          />
          Automatic host monitoring active · checks every 5 seconds
        </div>
        <form
          className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            void reload();
          }}
        >
          <Field label="Serial contains">
            <input
              type="text"
              value={fSerial}
              onChange={(e) => setFSerial(e.target.value)}
              placeholder="e.g. 0418"
              className="fg-input"
            />
          </Field>
          <Field label="Connection Type">
            <select value={fConn} onChange={(e) => setFConn(e.target.value)} className="fg-input">
              <option value="">All</option>
              {CONN_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Media Type">
            <select value={fMedia} onChange={(e) => setFMedia(e.target.value)} className="fg-input">
              <option value="">All</option>
              {MEDIA_OPTIONS.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="fg-input">
              <option value="">All</option>
              {STATUS_OPTIONS.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button type="submit" className="fg-btn-primary flex-1" disabled={loading}>
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setFConn("");
                setFMedia("");
                setFStatus("");
                setFSerial("");
                void reload();
              }}
              className="fg-btn flex-1"
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {rows && rows.length > 0 && (
        <section aria-labelledby="connected-devices-heading" className="mb-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">Connected Devices</div>
              <h2 id="connected-devices-heading" className="mt-1 font-display text-2xl font-semibold text-main">
                Device command surface
              </h2>
            </div>
            <span className="font-mono text-xs text-muted">{rows.length} detected</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {rows.map((device) => <DeviceCard key={device.id} device={device} />)}
          </div>
        </section>
      )}

      {/* ========== TABLE ========== */}
      <div className="fg-panel overflow-hidden">
        {loading && !rows && (
          <div className="p-10 text-center text-sm text-muted">Loading device inventory…</div>
        )}
        {!loading && rows && rows.length === 0 && (
          <div className="p-10 text-center text-sm text-muted">
            No devices found matching the current filters. Click “Register Device” to add a new entry.
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="fg-table min-w-[1100px]">
              <thead>
                <tr>
                  <th>Serial / Model</th>
                  <th>Manufacturer</th>
                  <th>Media / Connection</th>
                  <th className="text-right">Capacity</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>Last Operation</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="font-mono text-[11px] text-govt-blue">{d.serial_number}</div>
                      <div className="text-sm text-main">{d.model || "-"}</div>
                    </td>
                    <td className="text-sm text-main">{d.manufacturer || "-"}</td>
                    <td>
                      <span className="fg-badge mr-1.5">{d.media_type.replace("_", " ")}</span>
                      <span className="fg-badge fg-badge--navy">{d.connection_type}</span>
                    </td>
                    <td className="text-right font-mono text-xs text-main">
                      {bytesHuman(d.capacity_bytes)}
                    </td>
                    <td>
                      <span className={HEALTH_VARIANT[d.health]}>{d.health}</span>
                    </td>
                    <td>
                      <span className={STATUS_VARIANT[d.status]}>
                        {d.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      {d.last_operation_at ? (
                        <div>
                          <div className="text-xs text-main">{fmt(d.last_operation_at)}</div>
                          <div className="font-mono text-[10px] text-muted truncate max-w-[180px]">
                            {d.last_operation_record_id ?? ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted text-xs">No prior ops</span>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(d)}
                        className="fg-btn !px-2.5 !py-1 text-[11px]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========== CREATE / EDIT MODAL ========== */}
      {editing && (
        <DeviceForm
          initial={editing === "NEW" ? null : editing}
          submitting={submitting}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="fg-label">{label}</span>
      {children}
    </label>
  );
}

function DeviceCard({ device }: { device: DeviceOut }) {
  const query = (operation: string) => operation === "RECOVERY"
    ? `/dashboard/recovery?device=${encodeURIComponent(device.id)}`
    : operation === "FILE_ERASE"
      ? `/dashboard/file-eraser?device=${encodeURIComponent(device.id)}`
      : `/dashboard/drive-eraser?device=${encodeURIComponent(device.id)}`;

  return (
    <article className="fg-panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] text-govt-blue">{device.serial_number}</div>
          <h3 className="mt-1 truncate font-display text-lg font-semibold text-main">
            {device.model || device.manufacturer || "Unidentified device"}
          </h3>
        </div>
        <span className={STATUS_VARIANT[device.status]}>{device.status.replaceAll("_", " ")}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
        <div>
          <div className="fg-label">Media</div>
          <div className="mt-1 text-main">{device.media_type.replaceAll("_", " ")}</div>
        </div>
        <div>
          <div className="fg-label">Capacity</div>
          <div className="mt-1 font-mono text-xs text-main">{bytesHuman(device.capacity_bytes)}</div>
        </div>
        <div>
          <div className="fg-label">Connection</div>
          <div className="mt-1 text-main">{device.connection_type}</div>
        </div>
        <div>
          <div className="fg-label">Health</div>
          <div className="mt-1"><span className={HEALTH_VARIANT[device.health]}>{device.health}</span></div>
        </div>
      </div>
      <div className="border-t border-line bg-field/40 px-5 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
          Available actions
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={query("RECOVERY")} className="fg-btn !px-2.5 !py-1 text-[11px]">Recover</Link>
          <Link href={query("FILE_ERASE")} className="fg-btn !px-2.5 !py-1 text-[11px]">Erase folder</Link>
          <Link href={query("DRIVE_ERASE")} className="fg-btn-primary !px-2.5 !py-1 text-[11px]">Erase drive</Link>
          <button type="button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })} className="fg-btn !px-2.5 !py-1 text-[11px]">
            Timeline
          </button>
        </div>
      </div>
    </article>
  );
}

function DeviceForm({
  initial,
  submitting,
  onClose,
  onSubmit,
}: {
  initial: DeviceOut | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void> | void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-md border border-govt-blueRing bg-panel shadow-card-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="fg-panel-title">{initial ? "Edit Device Record" : "Register New Device"}</div>
            <p className="mt-0.5 text-xs text-muted">
              Data is persisted to the PostgreSQL devices table via{" "}
              <code className="fg-badge !py-0">POST /api/v1/devices</code>
              {initial && <> or PATCH /api/v1/devices/{initial.id.slice(0, 8)}…</>}.
            </p>
          </div>
          <button type="button" onClick={onClose} className="fg-btn !px-2.5 !py-1 text-xs">
            Close
          </button>
        </div>
        <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Serial Number *">
            <input
              required
              defaultValue={initial?.serial_number ?? ""}
              name="serial_number"
              className="fg-input font-mono"
            />
          </Field>
          <Field label="Manufacturer">
            <input defaultValue={initial?.manufacturer ?? ""} name="manufacturer" className="fg-input" />
          </Field>
          <Field label="Model">
            <input defaultValue={initial?.model ?? ""} name="model" className="fg-input" />
          </Field>
          <Field label="Firmware Version">
            <input defaultValue={initial?.firmware_version ?? ""} name="firmware_version" className="fg-input" />
          </Field>
          <Field label="Connection Type">
            <select defaultValue={initial?.connection_type ?? ""} name="connection_type" className="fg-input">
              <option value="">— Unspecified —</option>
              {CONN_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Media Type">
            <select defaultValue={initial?.media_type ?? ""} name="media_type" className="fg-input">
              <option value="">— Unspecified —</option>
              {MEDIA_OPTIONS.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Capacity (bytes, numeric)">
            <input
              type="number"
              min={0}
              step="1"
              name="capacity_bytes"
              defaultValue={initial?.capacity_bytes ?? ""}
              className="fg-input font-mono"
            />
          </Field>
          <Field label="Health">
            <select defaultValue={initial?.health ?? ""} name="health" className="fg-input">
              <option value="">— Unknown —</option>
              {HEALTH_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select defaultValue={initial?.status ?? "CONNECTED"} name="status" className="fg-input">
              {STATUS_OPTIONS.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes / Chain of Custody">
              <textarea name="notes" defaultValue={initial?.notes ?? ""} rows={3} className="fg-input" />
            </Field>
          </div>
          <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="fg-btn" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="fg-btn-primary" disabled={submitting}>
              {submitting ? "Saving…" : initial ? "Save Changes" : "Register Device"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
