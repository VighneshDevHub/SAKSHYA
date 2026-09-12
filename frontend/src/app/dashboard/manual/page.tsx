"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";

const sections = [
  {
    title: "1. Start a case",
    body: "Create an investigation file before attaching devices, evidence, or operations. The platform assigns a government-style case number and keeps linked activity in one workspace.",
    href: "/dashboard/cases",
    action: "Open Case Management",
  },
  {
    title: "2. Monitor storage devices",
    body: "Keep Device Inventory open while a USB pen drive, external HDD, SSD, or SD reader is connected to the Windows host running the backend. The inventory checks automatically and records connection status, serial, capacity, media type, and last operation.",
    href: "/dashboard/devices",
    action: "Open Device Inventory",
  },
  {
    title: "3. Queue an operation",
    body: "Create a Recovery, File Erase, or Drive Erase job from Task Queue. Link it to the active case and device, then follow progress as the agent claims and updates the job.",
    href: "/dashboard/jobs",
    action: "Open Task Queue",
  },
  {
    title: "4. Review evidence",
    body: "Open a case workspace to inspect evidence manifests, recovered filenames, file sizes, confidence, metadata, and SHA-256 values. Add an audited timeline note for each custody hand-off.",
    href: "/dashboard/cases",
    action: "Open Evidence Workspace",
  },
  {
    title: "5. Verify and report",
    body: "Use Report Center for signed certificates and PDFs, Audit Log for operation history, and Hash Chain Ledger to inspect and verify the tamper-evident sequence.",
    href: "/dashboard/reports",
    action: "Open Report Center",
  },
];

const roles = [
  ["Administrator", "Full console access, settings, operator roles, audit and system monitoring."],
  ["Supervisor", "Operational supervision, cases, jobs, devices, reports and system logs."],
  ["Investigator", "Case work, evidence, device inventory, task queue and forensic operations."],
  ["Auditor", "Read-only review of cases, devices, reports, audit records and ledger integrity."],
];

export default function UserManualPage() {
  return (
    <AppShell
      eyebrow="Help &amp; Procedures"
      title="PRAMAAN User Manual"
      subtitle="Operational guidance for the NTRO Digital Forensics and Secure Data Sanitisation Platform."
      actions={
        <Link href="/dashboard" className="fg-btn-primary !py-1.5 !px-3 text-xs">
          Return to Dashboard
        </Link>
      }
    >
      <div className="space-y-6">
        <section className="fg-hero-band overflow-hidden rounded-md border border-govt-navy p-6 shadow-card md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-govt-goldLight">Official operator guidance</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-white md:text-3xl">Mission-critical evidence handling</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/75">
                Work from a case, preserve chain of custody, use disposable media for demonstrations, and verify every signed result before presenting it as evidence.
              </p>
            </div>
            <div className="border-l border-white/20 pl-5 text-xs text-white/75">
              <div className="font-mono text-[10px] uppercase tracking-wider text-govt-goldLight">Platform trust</div>
              <div className="mt-2">SHA-256 hash chain</div>
              <div>ECDSA P-256 signatures</div>
              <div>NIST SP 800-88 workflow</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <article key={section.title} className="fg-panel p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-govt-blueRing bg-govt-blueLight font-mono text-xs font-semibold text-govt-navy">
                  {section.title.slice(0, 1)}
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-main">{section.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{section.body}</p>
                  <Link href={section.href} className="mt-4 inline-flex text-xs font-semibold text-govt-blue hover:underline">
                    {section.action} &rarr;
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="fg-panel overflow-hidden">
          <div className="fg-panel-header">
            <div>
              <div className="fg-panel-title">Role Access Matrix</div>
              <p className="mt-1 text-xs text-muted">Permissions are enforced by the backend and reflected in the console navigation.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="fg-table min-w-[720px]">
              <thead><tr><th>Designation</th><th>Operational scope</th></tr></thead>
              <tbody>
                {roles.map(([role, scope]) => <tr key={role}><td className="font-semibold text-main">{role}</td><td className="text-sm text-muted">{scope}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="fg-panel p-5">
            <div className="fg-panel-title">Safe demonstration protocol</div>
            <ol className="mt-4 space-y-3 text-sm text-muted">
              <li><span className="font-mono text-govt-blue">01</span> Use a disposable USB drive or test file only.</li>
              <li><span className="font-mono text-govt-blue">02</span> Never run real-device erase against production media.</li>
              <li><span className="font-mono text-govt-blue">03</span> Confirm the case, device, operator, and certificate before reporting.</li>
              <li><span className="font-mono text-govt-blue">04</span> Verify the certificate and ledger chain after completion.</li>
            </ol>
          </div>
          <div className="fg-panel p-5">
            <div className="fg-panel-title">Need the full test flow?</div>
            <p className="mt-3 text-sm leading-relaxed text-muted">The repository guide covers startup, role testing, automatic device monitoring, task queue progress, safe overwrite, recovery, reports, notifications, and acceptance checks.</p>
            <p className="mt-4 font-mono text-xs text-govt-blue">DEMO_JUDGE_GUIDE.md · END_TO_END_TESTING_GUIDE.md</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
