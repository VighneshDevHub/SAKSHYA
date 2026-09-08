"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSettings, patchSettings, UnauthorizedError } from "@/lib/api";
import { getStoredRole, getToken } from "@/lib/auth";
import { useTheme } from "@/components/ThemeProvider";
import type { AppSettings, SettingsPatchIn } from "@/lib/types";
import { AppShell } from "@/components/AppShell";

export default function SettingsPage() {
  const router = useRouter();
  const role = getStoredRole();
  const isAdmin = role === "ADMINISTRATOR";
  const { theme, setTheme } = useTheme();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    if (!isAdmin) {
      setError("Access restricted to ADMINISTRATOR role.");
      return;
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const form = e.currentTarget.elements as typeof e.currentTarget.elements & {
        organization_name: HTMLInputElement;
        organization_logo_url: HTMLInputElement;
        organization_address: HTMLTextAreaElement;
        department_name: HTMLInputElement;
        department_code: HTMLInputElement;
        certificate_header_text: HTMLInputElement;
        certificate_footer_text: HTMLInputElement;
        compliance_statement: HTMLTextAreaElement;
        default_overwrite_passes: HTMLInputElement;
      };
      const passes = Number(form.default_overwrite_passes.value);
      const patch: SettingsPatchIn = {
        organization_name: form.organization_name.value.trim(),
        organization_logo_url: form.organization_logo_url.value.trim() || null,
        organization_address: form.organization_address.value.trim() || null,
        department_name: form.department_name.value.trim() || null,
        department_code: form.department_code.value.trim() || null,
        certificate_header_text: form.certificate_header_text.value.trim() || null,
        certificate_footer_text: form.certificate_footer_text.value.trim() || null,
        compliance_statement: form.compliance_statement.value.trim() || null,
        default_overwrite_passes: Number.isFinite(passes) && passes >= 1 ? passes : null,
      };
      const next = await patchSettings(patch);
      setSettings(next);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      eyebrow="Platform Configuration"
      title="Organization &amp; Compliance Settings"
      subtitle="Global platform configuration used by PDF certificate templates, default erase parameters, and organisation branding. Only ADMINISTRATOR accounts may modify these values. All writes use PATCH /api/v1/settings and are audit logged."
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {!isAdmin && !error && (
        <div className="fg-panel">
          <div className="p-10 text-center text-sm text-muted">
            Restricted configuration area. Contact an ADMINISTRATOR to request changes.
          </div>
        </div>
      )}

      {isAdmin && loading && !settings && (
        <div className="fg-panel">
          <div className="p-10 text-center text-sm text-muted">Loading platform settings…</div>
        </div>
      )}

      {isAdmin && settings && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ========================== ORGANIZATION ========================== */}
          <div className="fg-panel overflow-hidden">
            <div className="fg-panel-header">
              <div>
                <div className="fg-panel-title">1 · Organization</div>
                <p className="mt-0.5 text-xs text-muted">
                  Details printed on PDF certificates, header branding, and footer legal blocks.
                </p>
              </div>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Organization Name *">
                <input
                  required
                  name="organization_name"
                  defaultValue={settings.organization_name}
                  className="fg-input"
                />
              </Field>
              <Field label="Department Name">
                <input
                  name="department_name"
                  defaultValue={settings.department_name}
                  className="fg-input"
                />
              </Field>
              <Field label="Department Code">
                <input
                  name="department_code"
                  defaultValue={settings.department_code}
                  className="fg-input font-mono"
                />
              </Field>
              <Field label="Organization Logo URL (public)">
                <input
                  name="organization_logo_url"
                  type="url"
                  defaultValue={settings.organization_logo_url}
                  placeholder="https://…/logo.png"
                  className="fg-input"
                />
              </Field>
              <Field label="Organization / Unit Address" className="md:col-span-2">
                <textarea
                  name="organization_address"
                  rows={3}
                  defaultValue={settings.organization_address}
                  className="fg-input"
                />
              </Field>
            </div>
          </div>

          {/* ========================== CERTIFICATE TEMPLATE ========================== */}
          <div className="fg-panel overflow-hidden">
            <div className="fg-panel-header">
              <div>
                <div className="fg-panel-title">2 · Certificate Template</div>
                <p className="mt-0.5 text-xs text-muted">
                  Header / footer text printed inside the signed PDF erasure &amp; recovery certificates.
                </p>
              </div>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Certificate Header Text">
                <input
                  name="certificate_header_text"
                  defaultValue={settings.certificate_header_text}
                  className="fg-input"
                />
              </Field>
              <Field label="Certificate Footer Text">
                <input
                  name="certificate_footer_text"
                  defaultValue={settings.certificate_footer_text}
                  className="fg-input"
                />
              </Field>
              <Field label="Compliance Statement" className="md:col-span-2">
                <textarea
                  name="compliance_statement"
                  rows={3}
                  defaultValue={settings.compliance_statement}
                  className="fg-input"
                />
              </Field>
              <Field label="Displayed Hash Algorithm">
                <input
                  disabled
                  value={settings.hash_algorithm_display}
                  className="fg-input !bg-field/70 !text-muted font-mono"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Cryptographic choice is locked to the platform trust layer and cannot be changed here.
                </p>
              </Field>
              <Field label="Default Overwrite Passes (≥ 1)">
                <input
                  name="default_overwrite_passes"
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  defaultValue={settings.default_overwrite_passes}
                  className="fg-input font-mono"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Applied by CLI agents when a job does not explicitly specify overwrite passes.
                </p>
              </Field>
            </div>
          </div>

          {/* ========================== APPEARANCE ========================== */}
          <div className="fg-panel overflow-hidden">
            <div className="fg-panel-header">
              <div>
                <div className="fg-panel-title">3 · Appearance &amp; Accessibility</div>
                <p className="mt-0.5 text-xs text-muted">
                  Theme preferences are stored per-browser in localStorage.
                </p>
              </div>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-3">
              <Field label="UI Theme">
                <div className="flex gap-2">
                  {(["govt-light", "govt-dark"] as const).map((t) => {
                    const active = theme === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTheme(t)}
                        className={
                          "flex-1 rounded-sm border px-3 py-2 text-sm transition-colors " +
                          (active
                            ? "border-govt-navy bg-govt-navy text-white"
                            : "border-line bg-panel text-main hover:border-govt-blueRing")
                        }
                      >
                        {t === "govt-light" ? "Government Light" : "Government Dark"}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          </div>

          {/* ========================== ACTION BAR ========================== */}
          <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-end gap-2 rounded-md border border-govt-blueRing bg-panel p-3 shadow-card-md">
            <div className="mr-auto font-mono text-[11px] text-muted">
              {savedAt && <span className="fg-badge fg-badge--green">Saved · {savedAt}</span>}
              {"  "}PATCH /api/v1/settings
            </div>
            <button
              type="button"
              onClick={() => reload()}
              className="fg-btn"
              disabled={loading || saving}
            >
              Discard Changes
            </button>
            <button
              type="submit"
              className="fg-btn-primary"
              disabled={saving || loading}
            >
              {saving ? "Persisting…" : "Save Settings"}
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="fg-label">{label}</span>
      {children}
    </label>
  );
}
