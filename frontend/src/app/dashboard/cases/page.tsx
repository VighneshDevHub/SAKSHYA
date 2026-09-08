"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createCase, listCases, UnauthorizedError } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { CaseStatus, CaseSummary } from "@/lib/types";
import { AppShell } from "@/components/AppShell";

const STATUS_VARIANT: Record<CaseStatus, string> = {
  OPEN: "fg-badge fg-badge--blue",
  IN_PROGRESS: "fg-badge fg-badge--gold",
  UNDER_REVIEW: "fg-badge fg-badge--navy",
  CLOSED: "fg-badge fg-badge--green",
};

function StatusBadge({ status }: { status: CaseSummary["status"] }) {
  return (
    <span className={STATUS_VARIANT[status] ?? "fg-badge"}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const router = useRouter();

  async function loadCases() {
    try {
      setCases(await listCases());
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load cases");
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void loadCases();
  }, [router]);

  async function handleCreateCase(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const created = await createCase({ title, description });
      setTitle("");
      setDescription("");
      router.push(`/dashboard/cases/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create case");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell
      eyebrow="Case Management"
      title="Investigation Cases"
      subtitle="Create government-style case files and attach evidence, investigators, and certificates."
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.1fr,1.6fr]">
        {/* ---- Create case panel ---- */}
        <div className="fg-panel">
          <div className="fg-panel-header">
            <div className="fg-panel-title">Create Case</div>
            <div className="text-xs text-muted">Register new investigation</div>
          </div>
          <form className="space-y-4 p-5" onSubmit={handleCreateCase}>
            <div>
              <label className="fg-label" htmlFor="case-title">
                Case Title
              </label>
              <input
                id="case-title"
                type="text"
                required
                minLength={3}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. FIR-2026-0014 USB Media Recovery"
                className="fg-input"
              />
            </div>
            <div>
              <label className="fg-label" htmlFor="case-desc">
                Description / Scope
              </label>
              <textarea
                id="case-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Investigation scope, source of evidence, legal authorisation notes…"
                rows={5}
                className="fg-input"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="fg-btn-primary w-full"
            >
              {creating ? "Registering case…" : "Register Case"}
            </button>
            <p className="text-xs text-muted">
              A case number is assigned automatically upon creation and is
              used for all linked evidence, jobs, and certificates.
            </p>
          </form>
        </div>

        {/* ---- Case register table ---- */}
        <div className="fg-panel overflow-hidden">
          <div className="fg-panel-header">
            <div>
              <div className="fg-panel-title">Case Register</div>
              <p className="mt-1 text-xs text-muted">
                Active and closed investigation files with summary counts.
              </p>
            </div>
            <div className="font-mono text-[11px] text-muted">
              {cases !== null ? `${cases.length} files` : "—"}
            </div>
          </div>

          {cases === null && !error && (
            <div className="p-10 text-center text-sm text-muted">
              Loading case register…
            </div>
          )}

          {cases !== null && cases.length === 0 && (
            <div className="p-10 text-center text-sm text-muted">
              No cases registered yet. Use the form to open the first file.
            </div>
          )}

          {cases !== null && cases.length > 0 && (
            <div className="overflow-x-auto">
              <table className="fg-table min-w-[780px]">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Status</th>
                    <th>Lead Investigator</th>
                    <th className="text-center">Evidence</th>
                    <th className="text-center">Certificates</th>
                    <th className="text-right">Workspace</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-mono text-[11px] text-govt-blue">
                          {item.case_number}
                        </div>
                        <div className="mt-0.5 text-sm font-medium text-main">
                          {item.title}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="text-sm text-main">
                        {item.lead_investigator_email ? (
                          <span className="font-mono text-xs">
                            {item.lead_investigator_email}
                          </span>
                        ) : (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="text-center font-mono text-xs text-main">
                        {item.evidence_count}
                      </td>
                      <td className="text-center font-mono text-xs text-main">
                        {item.linked_operation_count}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/dashboard/cases/${item.id}`}
                          className="fg-btn !px-2.5 !py-1.5 text-xs"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
