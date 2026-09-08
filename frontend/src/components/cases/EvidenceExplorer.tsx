"use client";

import { useEffect, useMemo, useState } from "react";
import { listEvidenceFiles } from "@/lib/api";
import type {
  CaseEvidenceItem,
  EvidenceFileItem,
  EvidenceFileListOut,
} from "@/lib/types";

const TABS: Array<{
  value: "all" | "image" | "video" | "document" | "archive";
  label: string;
  glyph: string;
}> = [
  { value: "all", label: "All Files", glyph: "▦" },
  { value: "image", label: "Images", glyph: "▣" },
  { value: "video", label: "Videos", glyph: "▶" },
  { value: "document", label: "Documents", glyph: "▤" },
  { value: "archive", label: "Archives", glyph: "▥" },
];

function bytesHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
}

function confidenceBadge(c: unknown): { cls: string; label: string } {
  const n = typeof c === "number" ? c : typeof c === "string" ? Number(c) : NaN;
  if (!Number.isFinite(n)) return { cls: "fg-badge", label: "N/A" };
  if (n >= 0.9) return { cls: "fg-badge fg-badge--green", label: `High · ${Math.round(n * 100)}%` };
  if (n >= 0.6) return { cls: "fg-badge fg-badge--gold", label: `Medium · ${Math.round(n * 100)}%` };
  return { cls: "fg-badge fg-badge--red", label: `Low · ${Math.round(n * 100)}%` };
}

function shortenHash(hash: string): string {
  if (!hash || hash.length < 16) return hash ?? "-";
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

export function EvidenceExplorer({
  evidenceItems,
}: {
  evidenceItems: CaseEvidenceItem[];
}) {
  const recoveryEvidence = useMemo(
    () =>
      evidenceItems.filter((e) =>
        e.evidence_type?.toUpperCase().includes("RECOVERY") ||
        e.evidence_type === "IMAGE" ||
        e.evidence_type === "ARCHIVE" ||
        (Array.isArray((e.details as { recovered_files?: unknown[] })?.recovered_files) &&
          (e.details as { recovered_files: unknown[] }).recovered_files.length > 0),
      ),
    [evidenceItems],
  );

  return (
    <div className="space-y-4">
      {recoveryEvidence.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted">
          No recovery-linked evidence on this case yet. Attach a recovery
          evidence item above to enable the recovered-files explorer.
        </div>
      ) : (
        recoveryEvidence.map((e) => (
          <EvidenceTabs key={e.id} evidence={e} />
        ))
      )}
    </div>
  );
}

function EvidenceTabs({ evidence }: { evidence: CaseEvidenceItem }) {
  const [tab, setTab] =
    useState<"all" | "image" | "video" | "document" | "archive">("all");
  const [result, setResult] = useState<EvidenceFileListOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const r = await listEvidenceFiles(evidence.id, tab);
        setResult(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load recovered files");
      } finally {
        setLoading(false);
      }
    })();
  }, [evidence.id, tab]);

  return (
    <div className="rounded-md border border-line bg-field/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="fg-badge">{evidence.evidence_type}</span>
            <span className="text-sm font-medium text-main truncate">
              {evidence.evidence_label}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-muted truncate">
            ref: {evidence.evidence_reference}
          </div>
        </div>
        <div className="font-mono text-[11px] text-muted">
          {result ? `${result.count} file${result.count === 1 ? "" : "s"}` : "—"}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line bg-panel/60 px-3 py-2">
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={
                "rounded-sm border px-2.5 py-1 text-xs " +
                (active
                  ? "border-govt-navy bg-govt-navy text-white"
                  : "border-line bg-panel text-muted hover:text-main")
              }
            >
              <span className="mr-1 opacity-70">{t.glyph}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {err && (
        <div className="mx-4 my-3 rounded-md border border-govt-red/25 bg-govt-redLight px-3 py-2 text-xs text-govt-red">
          {err}
        </div>
      )}

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-muted">
          Loading file manifest…
        </div>
      ) : !result || result.files.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted">
          No recovered files of type <span className="font-medium text-main">{tab}</span> for this evidence.
        </div>
      ) : (
        <FileTable rows={result.files} />
      )}
    </div>
  );
}

function FileTable({ rows }: { rows: EvidenceFileItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="fg-table">
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th>Filename</th>
            <th>Size</th>
            <th>Confidence</th>
            <th>SHA-256</th>
          </tr>
        </thead>
        {rows.map((f, idx) => {
          const key = `${f.filename}-${idx}`;
          const isOpen = expanded === key;
          const conf = confidenceBadge(f.confidence);
          return (
            /* Explicit React.Fragment with key is required here since each
               logical row expands into two <tr> siblings (the manifest row
               plus the metadata row).  Shorthand `<>…</>` cannot carry a
               key and would produce a React key warning + broken expansion. */
            <tbody key={key}>
              <tr>
                <td className="w-9 text-center">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="text-govt-blue text-xs"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                </td>
                <td className="text-sm text-main">{f.filename}</td>
                <td className="font-mono text-xs text-main">
                  {bytesHuman(f.size_bytes)}
                </td>
                <td>
                  <span className={conf.cls}>{conf.label}</span>
                </td>
                <td className="font-mono text-[11px] text-muted">
                  {shortenHash(f.sha256)}
                </td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={5} className="bg-field/60">
                    <pre className="mx-3 my-3 overflow-x-auto rounded-md border border-line bg-panel p-3 text-[11px] text-main">
                      <code>{JSON.stringify(f.metadata ?? {}, null, 2)}</code>
                    </pre>
                    <div className="mx-3 mb-3">
                      <div className="fg-label">Full SHA-256</div>
                      <div className="font-mono text-[11px] break-all text-main">
                        {f.sha256 || "-"}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
