"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addCaseEvidence,
  assignInvestigator,
  createCaseTimelineNote,
  getCase,
  getCaseTimeline,
  getCertificateReportPdfUrl,
  getOperationPdfUrl,
  linkCaseOperation,
  UnauthorizedError,
  updateCaseStatus,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  CaseDetail,
  CaseStatus,
  TimelineEventOut,
} from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { OperationTypeTag, StatusStamp } from "@/components/OperationBadges";
import { TimelineRail, TimelineNoteComposer } from "@/components/cases/TimelineRail";
import { EvidenceExplorer } from "@/components/cases/EvidenceExplorer";

const CASE_STATUSES: CaseStatus[] = ["OPEN", "IN_PROGRESS", "UNDER_REVIEW", "CLOSED"];

const STATUS_VARIANT: Record<CaseStatus, string> = {
  OPEN: "fg-badge fg-badge--blue",
  IN_PROGRESS: "fg-badge fg-badge--gold",
  UNDER_REVIEW: "fg-badge fg-badge--navy",
  CLOSED: "fg-badge fg-badge--green",
};

export default function CaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<CaseDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEventOut[] | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [investigatorEmail, setInvestigatorEmail] = useState("");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [evidenceType, setEvidenceType] = useState("DEVICE");
  const [certificateId, setCertificateId] = useState("");
  const [status, setStatus] = useState<CaseStatus>("OPEN");

  async function refreshCase() {
    try {
      const data = await getCase(params.caseId);
      setRecord(data);
      setStatus(data.status);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load case");
    }
  }

  async function refreshTimeline() {
    if (!params.caseId) return;
    setTimelineLoading(true);
    try {
      const events = await getCaseTimeline(params.caseId);
      setTimeline(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setTimelineLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    if (params.caseId) {
      void refreshCase();
      void refreshTimeline();
    }
  }, [params.caseId, router]);

  async function handleAssignInvestigator(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await assignInvestigator(params.caseId, investigatorEmail);
      setRecord(updated);
      setInvestigatorEmail("");
      void refreshTimeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign investigator");
    }
  }

  async function handleAddEvidence(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await addCaseEvidence(params.caseId, {
        evidence_label: evidenceLabel,
        evidence_reference: evidenceReference,
        evidence_type: evidenceType,
      });
      setRecord(updated);
      setEvidenceLabel("");
      setEvidenceReference("");
      setEvidenceType("DEVICE");
      void refreshTimeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add evidence");
    }
  }

  async function handleLinkCertificate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await linkCaseOperation(params.caseId, certificateId);
      setRecord(updated);
      setCertificateId("");
      void refreshTimeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link certificate");
    }
  }

  async function handleStatusChange(nextStatus: CaseStatus) {
    setStatus(nextStatus);
    setError(null);
    try {
      const updated = await updateCaseStatus(params.caseId, nextStatus);
      setRecord(updated);
      void refreshTimeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update case status");
    }
  }

  async function handleAppendNote(text: string) {
    setNoteSubmitting(true);
    try {
      const note = await createCaseTimelineNote(params.caseId, { description: text });
      setTimeline((current) => (current ? [note, ...current] : [note]));
    } finally {
      setNoteSubmitting(false);
    }
  }

  const actions = record ? (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/dashboard/jobs?case_id=${record.id}`} className="fg-btn !py-1.5 !px-3 text-xs">
        Queue Job
      </Link>
      <Link href="/dashboard/reports" className="fg-btn !py-1.5 !px-3 text-xs">
        Reports
      </Link>
    </div>
  ) : undefined;

  return (
    <AppShell
      eyebrow="Case File"
      title={record?.title ?? "Case"}
      subtitle={record ? `${record.case_number} · ${record.description || "Investigation workspace"}` : "Loading case detail"}
      actions={actions}
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {!record && !error && (
        <div className="p-10 text-center font-mono text-sm text-muted">Loading case file…</div>
      )}

      {record && (
        <div className="grid gap-6">
          {/* =========== HEADER / OVERVIEW + CONTROLS =========== */}
          <div className="grid gap-6 lg:grid-cols-[1.3fr,0.9fr]">
            <div className="fg-panel">
              <div className="fg-panel-header">
                <div className="fg-panel-title">Case Overview</div>
                <span className={STATUS_VARIANT[record.status]}>{record.status.replaceAll("_", " ")}</span>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-2">
                <div>
                  <div className="fg-label">Case Number</div>
                  <div className="mt-1 font-mono text-sm text-main">{record.case_number}</div>
                </div>
                <div>
                  <div className="fg-label">Lead Investigator</div>
                  <div className="mt-1 text-sm text-main">
                    {record.lead_investigator_email ? (
                      <span className="font-mono">{record.lead_investigator_email}</span>
                    ) : (
                      <span className="text-muted">Unassigned</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="fg-label">Opened By</div>
                  <div className="mt-1 font-mono text-sm text-main">{record.created_by_email}</div>
                </div>
                <div>
                  <div className="fg-label">File Status</div>
                  <select
                    value={status}
                    onChange={(e) => void handleStatusChange(e.target.value as CaseStatus)}
                    className="fg-input mt-1"
                  >
                    {CASE_STATUSES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <div className="fg-label">Description</div>
                  <p className="mt-1 text-sm text-main whitespace-pre-wrap min-h-[2em]">
                    {record.description || <span className="text-muted">No description provided.</span>}
                  </p>
                </div>
                <div className="sm:col-span-2 grid grid-cols-3 gap-3 border-t border-line pt-4">
                  <Stat label="Investigators" value={record.investigator_count} />
                  <Stat label="Evidence items" value={record.evidence_count} />
                  <Stat label="Certificates" value={record.linked_operation_count} />
                </div>
              </div>
            </div>

            <div className="fg-panel">
              <div className="fg-panel-header">
                <div>
                  <div className="fg-panel-title">Case Controls</div>
                  <p className="mt-1 text-xs text-muted">Assign officers, attach evidence, and link signed operations.</p>
                </div>
              </div>
              <div className="space-y-5 p-5">
                <form className="space-y-2" onSubmit={handleAssignInvestigator}>
                  <label className="fg-label" htmlFor="assign-email">Assign Investigator</label>
                  <input
                    id="assign-email"
                    type="email"
                    value={investigatorEmail}
                    onChange={(e) => setInvestigatorEmail(e.target.value)}
                    required
                    placeholder="officer@ntro.gov.in"
                    className="fg-input"
                  />
                  <button type="submit" className="fg-btn-primary w-full">
                    Assign as Lead
                  </button>
                </form>

                <div className="border-t border-line pt-5">
                  <form className="space-y-2" onSubmit={handleAddEvidence}>
                    <div className="fg-label">Add Evidence Item</div>
                    <input
                      type="text"
                      required
                      value={evidenceLabel}
                      onChange={(e) => setEvidenceLabel(e.target.value)}
                      placeholder="Label (e.g. Kingston USB 32GB — Ex. A)"
                      className="fg-input"
                    />
                    <input
                      type="text"
                      required
                      value={evidenceReference}
                      onChange={(e) => setEvidenceReference(e.target.value)}
                      placeholder="Serial / barcode / path"
                      className="fg-input"
                    />
                    <select
                      value={evidenceType}
                      onChange={(e) => setEvidenceType(e.target.value)}
                      className="fg-input"
                    >
                      <option value="DEVICE">DEVICE</option>
                      <option value="FILE">FILE</option>
                      <option value="FOLDER">FOLDER</option>
                      <option value="IMAGE">IMAGE</option>
                      <option value="ARCHIVE">ARCHIVE</option>
                      <option value="RECOVERY_BUNDLE">RECOVERY BUNDLE</option>
                    </select>
                    <button type="submit" className="fg-btn w-full">
                      Attach Evidence
                    </button>
                  </form>
                </div>

                <div className="border-t border-line pt-5">
                  <form className="space-y-2" onSubmit={handleLinkCertificate}>
                    <label className="fg-label" htmlFor="link-cert">Link Signed Certificate</label>
                    <input
                      id="link-cert"
                      type="text"
                      required
                      value={certificateId}
                      onChange={(e) => setCertificateId(e.target.value)}
                      placeholder="Certificate UUID"
                      className="fg-input font-mono"
                    />
                    <button type="submit" className="fg-btn w-full">
                      Link to Case File
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* =========== INVESTIGATORS + EVIDENCE REGISTER =========== */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
            <div className="fg-panel overflow-hidden">
              <div className="fg-panel-header">
                <div className="fg-panel-title">Investigators</div>
                <div className="font-mono text-[11px] text-muted">
                  {record.investigators.length} assigned
                </div>
              </div>
              <div className="p-4">
                {record.investigators.length === 0 && (
                  <p className="text-sm text-muted p-2 text-center">No investigators assigned.</p>
                )}
                <ul className="space-y-2">
                  {record.investigators.map((inv) => (
                    <li
                      key={`${inv.email}-${inv.assigned_at}`}
                      className="rounded-md border border-line bg-field flex items-center justify-between px-3 py-2"
                    >
                      <div>
                        <div className="font-mono text-xs text-main">{inv.email}</div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {new Date(inv.assigned_at).toLocaleString()}
                        </div>
                      </div>
                      {inv.is_lead && (
                        <span className="fg-badge fg-badge--gold">LEAD</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="fg-panel overflow-hidden">
              <div className="fg-panel-header">
                <div className="fg-panel-title">Evidence Register</div>
                <div className="font-mono text-[11px] text-muted">
                  {record.evidence_items.length} items
                </div>
              </div>
              {record.evidence_items.length === 0 && (
                <div className="p-6 text-center text-sm text-muted">
                  No evidence items registered. Use the Case Controls to add the first exhibit.
                </div>
              )}
              {record.evidence_items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="fg-table min-w-[620px]">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Type</th>
                        <th>Reference / Serial</th>
                        <th>Registered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.evidence_items.map((it) => (
                        <tr key={it.id}>
                          <td className="text-sm font-medium text-main">{it.evidence_label}</td>
                          <td><span className="fg-badge">{it.evidence_type}</span></td>
                          <td className="font-mono text-xs text-main">{it.evidence_reference}</td>
                          <td className="text-xs text-muted">
                            {new Date(it.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* =========== EVIDENCE EXPLORER (recovered files) =========== */}
          <div className="fg-panel overflow-hidden">
            <div className="fg-panel-header">
              <div>
                <div className="fg-panel-title">Evidence Explorer</div>
                <p className="mt-1 text-xs text-muted">
                  Recovered-files manifest per evidence item. Results come from
                  the recovery-engine catalog via <code className="fg-badge !py-0">/api/v1/evidence/&#123;id&#125;/files</code>.
                </p>
              </div>
              <div className="hidden items-center gap-3 text-[11px] text-muted md:flex">
                <span className="inline-flex items-center gap-1">▣ Images</span>
                <span className="inline-flex items-center gap-1">▶ Videos</span>
                <span className="inline-flex items-center gap-1">▤ Documents</span>
                <span className="inline-flex items-center gap-1">▥ Archives</span>
              </div>
            </div>
            <div className="p-5">
              <EvidenceExplorer evidenceItems={record.evidence_items} />
            </div>
          </div>

          {/* =========== OPERATION HISTORY (LINKED CERTIFICATES) =========== */}
          <div className="fg-panel overflow-hidden">
            <div className="fg-panel-header">
              <div>
                <div className="fg-panel-title">Operation History &amp; Linked Certificates</div>
                <p className="mt-1 text-xs text-muted">
                  Cryptographically signed operation records anchored to the hash-chain.
                  Each row links to the signed PDF certificate and its verification portal.
                </p>
              </div>
              <div className="font-mono text-[11px] text-muted">
                {record.linked_operations.length} records
              </div>
            </div>

            {record.linked_operations.length === 0 && (
              <div className="p-8 text-center text-sm text-muted">
                No certificates linked yet. Connect existing operation certificates
                from the Case Controls panel.
              </div>
            )}

            {record.linked_operations.length > 0 && (
              <div className="overflow-x-auto">
                <table className="fg-table min-w-[860px]">
                  <thead>
                    <tr>
                      <th>Operation Type</th>
                      <th>Certificate ID</th>
                      <th>Target / Device</th>
                      <th>Completed At</th>
                      <th>Verified</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.linked_operations.map((item) => (
                      <tr key={`${item.certificate_id}-${item.linked_at}`}>
                        <td>
                          <OperationTypeTag type={item.operation_type} />
                        </td>
                        <td className="font-mono text-[11px] text-govt-blue break-all">
                          {item.certificate_id}
                        </td>
                        <td className="text-sm text-main min-w-[180px]">{item.target_description}</td>
                        <td className="text-xs text-muted">
                          {new Date(item.completed_at).toLocaleString()}
                        </td>
                        <td>
                          <StatusStamp success={item.success} />
                        </td>
                        <td className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            <a
                              href={getCertificateReportPdfUrl(item.certificate_id)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="fg-btn !px-2.5 !py-1 text-[11px]"
                            >
                              PDF
                            </a>
                            <a
                              href={getOperationPdfUrl(item.certificate_id)}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="fg-btn !px-2.5 !py-1 text-[11px]"
                            >
                              Report
                            </a>
                            <Link
                              href={`/verify?certificate_id=${encodeURIComponent(item.certificate_id)}`}
                              className="fg-btn-primary !px-2.5 !py-1 text-[11px]"
                            >
                              Verify
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* =========== INVESTIGATION TIMELINE =========== */}
          <div className="fg-panel overflow-hidden">
            <div className="fg-panel-header">
              <div>
                <div className="fg-panel-title">Investigation Timeline</div>
                <p className="mt-1 text-xs text-muted">
                  Audited, immutable sequence of events for this case file.
                  Events are sourced from the backend endpoint{" "}
                  <code className="fg-badge !py-0">/api/v1/cases/&#123;id&#125;/timeline</code>.
                </p>
              </div>
              {timeline && (
                <div className="font-mono text-[11px] text-muted">
                  {timeline.length} events
                </div>
              )}
            </div>

            {timelineLoading && !timeline && (
              <div className="p-8 text-center text-sm text-muted">Loading timeline…</div>
            )}

            {timeline && <TimelineRail events={timeline} />}

            <TimelineNoteComposer onSubmit={handleAppendNote} submitting={noteSubmitting} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-line bg-field px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 font-display text-lg font-semibold text-main">{value}</div>
    </div>
  );
}
