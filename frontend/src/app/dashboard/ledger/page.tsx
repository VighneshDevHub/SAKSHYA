"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getLedgerChain,
  UnauthorizedError,
  verifyLedgerSeq,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  LedgerBlock,
  LedgerVerifyOut,
  OperationType,
} from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { OperationTypeTag, StatusStamp } from "@/components/OperationBadges";

function fmt(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function shortHash(h: string): string {
  if (!h || h.length < 16) return h ?? "-";
  return `${h.slice(0, 10)}…${h.slice(-10)}`;
}

export default function LedgerChainPage() {
  const router = useRouter();
  const [blocks, setBlocks] = useState<LedgerBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [fromSeq, setFromSeq] = useState<string>("");
  const [toSeq, setToSeq] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [verifySeq, setVerifySeq] = useState<number | null>(null);
  const [verifyResult, setVerifyResult] = useState<LedgerVerifyOut | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const fs = fromSeq ? Number(fromSeq) : undefined;
      const ts = toSeq ? Number(toSeq) : undefined;
      const chain = await getLedgerChain({
        from_seq: Number.isFinite(fs) ? fs : undefined,
        to_seq: Number.isFinite(ts) ? ts : undefined,
      });
      setBlocks(chain);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load ledger chain");
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

  async function runVerify(seq: number) {
    setVerifySeq(seq);
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const v = await verifyLedgerSeq(seq);
      setVerifyResult(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifyLoading(false);
    }
  }

  const summary = useMemo(() => {
    if (!blocks) return { count: 0, ops: 0, valid: 0, fails: 0 };
    const opBlocks = blocks.filter((b) => b.success !== null);
    return {
      count: blocks.length,
      ops: opBlocks.length,
      valid: opBlocks.filter((b) => b.success).length,
      fails: opBlocks.filter((b) => b.success === false).length,
    };
  }, [blocks]);

  return (
    <AppShell
      eyebrow="Integrity Subsystem"
      title="SHA-256 Hash Chain Ledger"
      subtitle="Interactive visualization of the immutable, append-only operation ledger. Each block carries its entry hash and chains to the previous hash; every signed certificate records a ledger sequence number for independent verification."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => reload()} className="fg-btn !py-1.5 !px-3 text-xs">
            ↻ Reload Chain
          </button>
          <button
            type="button"
            onClick={() => {
              if (blocks && blocks.length) runVerify(blocks[blocks.length - 1].sequence_number);
            }}
            className="fg-btn-primary !py-1.5 !px-3 text-xs"
          >
            Verify Tip
          </button>
        </div>
      }
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {/* ================= STATS ================ */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <ChainStat label="Blocks Loaded" value={summary.count} accent="navy" />
        <ChainStat label="Operations Logged" value={summary.ops} accent="blue" />
        <ChainStat label="Verified Success" value={summary.valid} accent="green" />
        <ChainStat label="Failed / Invalid" value={summary.fails} accent="red" />
      </div>

      {/* ================= FILTERS ================ */}
      <div className="fg-panel mb-6 overflow-hidden">
        <div className="fg-panel-header">
          <div className="fg-panel-title">Chain Window</div>
          <p className="mt-0.5 text-xs text-muted">
            The hash chain can grow to millions of blocks — narrow by sequence range if needed.
          </p>
        </div>
        <form
          className="grid gap-4 p-5 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void reload();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="fg-label">From Sequence # (inclusive)</span>
            <input
              type="number"
              min={1}
              className="fg-input font-mono"
              value={fromSeq}
              onChange={(e) => setFromSeq(e.target.value)}
              placeholder="e.g. 1"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="fg-label">To Sequence # (inclusive)</span>
            <input
              type="number"
              min={1}
              className="fg-input font-mono"
              value={toSeq}
              onChange={(e) => setToSeq(e.target.value)}
              placeholder="e.g. 1000"
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="fg-btn-primary flex-1" disabled={loading}>
              Apply Window
            </button>
            <button
              type="button"
              onClick={() => {
                setFromSeq("");
                setToSeq("");
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

      {/* ================= VERIFY PANEL ================ */}
      {(verifyLoading || verifyResult) && (
        <div className="fg-panel mb-6 overflow-hidden">
          <div className="fg-panel-header">
            <div className="fg-panel-title">
              Block Verification {verifySeq !== null && `· Seq #${verifySeq}`}
            </div>
          </div>
          <div className="space-y-2 p-5">
            {verifyLoading && <p className="text-sm text-muted">Running chain verification…</p>}
            {verifyResult && (
              <>
                <div className="flex items-center gap-3">
                  <StatusStamp success={verifyResult.valid} />
                  <div className="font-mono text-[11px] text-muted">
                    sequence = {verifyResult.sequence_number}
                  </div>
                </div>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <Row label="Stored Entry Hash" value={verifyResult.stored_entry_hash} />
                  <Row label="Recomputed Hash" value={verifyResult.computed_entry_hash} />
                  <Row label="Previous Hash" value={verifyResult.previous_hash} />
                  <Row label="Report Hash" value={verifyResult.report_hash} />
                  {verifyResult.broken_at_sequence !== undefined &&
                    verifyResult.broken_at_sequence !== null && (
                      <div className="sm:col-span-2">
                        <span className="fg-badge fg-badge--red">
                          BROKEN AT SEQ #{verifyResult.broken_at_sequence}
                        </span>
                      </div>
                    )}
                </dl>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================= CHAIN VISUALIZATION ================ */}
      <div className="fg-panel overflow-hidden">
        <div className="fg-panel-header">
          <div className="fg-panel-title">Chain Block Visualization</div>
          <div className="font-mono text-[11px] text-muted">
            Source: <code className="fg-badge !py-0">GET /api/v1/ledger/chain</code>
          </div>
        </div>

        {loading && !blocks && (
          <div className="p-10 text-center text-sm text-muted">Loading hash chain…</div>
        )}

        {!loading && blocks && blocks.length === 0 && (
          <div className="p-10 text-center text-sm text-muted">
            No ledger blocks exist yet in this window. Run an operation through the platform
            to create the first block.
          </div>
        )}

        {blocks && blocks.length > 0 && (
          <div className="relative">
            {/* Vertical chain spine */}
            <span
              aria-hidden="true"
              className="absolute left-[30px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-govt-blue via-govt-navy to-govt-blue"
            />
            <ol className="relative space-y-5 p-5">
              {blocks.map((b) => {
                const isOpen = expanded === b.sequence_number;
                const verifying = verifySeq === b.sequence_number && verifyLoading;
                return (
                  <li key={b.sequence_number} className="relative pl-16">
                    {/* Sequence node */}
                    <span className="absolute left-[14px] top-2 inline-flex h-8 w-8 items-center justify-center rounded-sm border border-govt-blueRing bg-gradient-to-br from-govt-blue to-govt-navy font-mono text-[11px] font-bold text-white shadow-card">
                      {b.sequence_number}
                    </span>

                    <div className="rounded-md border border-line bg-panel overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded(isOpen ? null : b.sequence_number)
                        }
                        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                      >
                        {b.operation_type ? (
                          <OperationTypeTag type={b.operation_type as OperationType} />
                        ) : (
                          <span className="fg-badge">GENESIS / ANCHOR</span>
                        )}
                        <span className="flex-1 min-w-0 text-sm text-main truncate">
                          {b.target_description || "Chain anchor block"}
                        </span>
                        {b.certificate_id && (
                          <span className="font-mono text-[10px] text-govt-blue truncate max-w-[180px]">
                            cert: {shortHash(b.certificate_id)}
                          </span>
                        )}
                        {b.success !== null && <StatusStamp success={b.success} />}
                        <span className="font-mono text-[10px] text-muted whitespace-nowrap">
                          {fmt(b.created_at)}
                        </span>
                        <span
                          className={
                            "ml-auto inline-block h-3 w-3 shrink-0 text-govt-navy transition-transform " +
                            (isOpen ? "rotate-180" : "")
                          }
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </button>

                      {/* Expanded content */}
                      {isOpen && (
                        <div className="border-t border-line bg-field/60 p-4 space-y-3">
                          <div className="grid gap-3 text-xs sm:grid-cols-2">
                            <Row label="Entry Hash (SHA-256)" value={b.entry_hash} mono />
                            <Row label="Previous Hash (chained)" value={b.previous_hash} mono />
                            <Row label="Report Hash" value={b.report_hash} mono />
                            {b.certificate_id && (
                              <Row label="Certificate ID" value={b.certificate_id} mono />
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                            <div className="font-mono text-[10px] text-muted">
                              Created: {fmt(b.created_at)}
                            </div>
                            <button
                              type="button"
                              onClick={() => runVerify(b.sequence_number)}
                              disabled={verifying}
                              className="fg-btn-primary !py-1.5 !px-3 text-xs"
                            >
                              {verifying ? "Verifying…" : `Verify Seq #${b.sequence_number}`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <div className="fg-label">{label}</div>
      <div
        className={
          "mt-1 break-all text-main " + (mono ? "font-mono text-[11px]" : "text-xs")
        }
      >
        {value || "-"}
      </div>
    </div>
  );
}

function ChainStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "navy" | "blue" | "green" | "red";
}) {
  const color =
    accent === "red"
      ? "text-govt-red border-govt-red/30"
      : accent === "green"
        ? "text-govt-green border-govt-green/40"
        : accent === "blue"
          ? "text-govt-blue border-govt-blueRing"
          : "text-govt-navy border-govt-blueRing";
  return (
    <div className={`rounded-sm border bg-panel px-4 py-3 ${color}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
