"use client";

import { useEffect, useState } from "react";
import { getOperation, getOperationPdfUrl, NotFoundError, verifyOperation } from "@/lib/api";
import type { OperationRecord, VerificationResult } from "@/lib/types";
import { OperationDetails, OperationTypeTag } from "@/components/OperationBadges";

type PageState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "loaded"; record: OperationRecord; result: VerificationResult };

export default function VerifyPage({ params }: { params: { certId: string } }) {
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const [record, result] = await Promise.all([
          getOperation(params.certId),
          verifyOperation(params.certId),
        ]);
        if (!cancelled) setState({ status: "loaded", record, result });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof NotFoundError) {
          setState({ status: "not_found" });
        } else {
          setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [params.certId]);

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted">
            Independent Verification
          </p>
          <h1 className="text-2xl font-bold text-white">PRAMAAN</h1>
        </div>

        {state.status === "loading" && (
          <div className="border border-line p-8 text-center font-mono text-sm text-muted">
            Checking signature and ledger chain…
          </div>
        )}

        {state.status === "not_found" && (
          <div className="border-l-2 border-alert bg-alert-dim p-6 text-center">
            <h2 className="text-lg font-bold text-alert">Record not found</h2>
            <p className="mt-2 text-sm text-gray-300">
              No record exists with this certificate ID.
            </p>
          </div>
        )}

        {state.status === "error" && (
          <div className="border-l-2 border-amber bg-panel p-6 text-center">
            <h2 className="text-lg font-bold text-amber">Couldn&apos;t reach the verification service</h2>
            <p className="mt-2 text-sm text-gray-300">{state.message}</p>
          </div>
        )}

        {state.status === "loaded" && (
          <>
            {/* Verification stamp */}
            <div
              className={`border-2 p-8 text-center ${
                state.result.overall_verified
                  ? "border-teal bg-teal-dim"
                  : "border-alert bg-alert-dim"
              }`}
            >
              <p
                className={`font-mono text-3xl font-bold tracking-widest ${
                  state.result.overall_verified ? "text-teal" : "text-alert"
                }`}
              >
                {state.result.overall_verified ? "VERIFIED" : "TAMPERED"}
              </p>
              <p className="mt-3 text-sm text-gray-300">{state.result.detail}</p>
              <div className="mt-5 flex justify-center gap-6 border-t border-line pt-4 text-xs text-muted">
                <span>
                  Signature —{" "}
                  <span className={state.result.signature_valid ? "text-teal" : "text-alert"}>
                    {state.result.signature_valid ? "valid" : "invalid"}
                  </span>
                </span>
                <span>
                  Ledger chain —{" "}
                  <span className={state.result.chain_intact ? "text-teal" : "text-alert"}>
                    {state.result.chain_intact ? "intact" : "broken"}
                  </span>
                </span>
              </div>
            </div>

            {/* Record details */}
            <div className="mt-6 border border-line bg-panel p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted">
                  Record Details
                </h3>
                <OperationTypeTag type={state.record.operation_type} />
              </div>
              <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm">
                <span className="text-muted">Target</span>
                <span className="max-w-[60%] break-all text-right font-mono text-xs text-gray-100">
                  {state.record.target_description}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm">
                <span className="text-muted">Operator</span>
                <span className="font-medium text-gray-100">{state.record.operator}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm">
                <span className="text-muted">Ledger sequence</span>
                <span className="font-mono text-xs text-gray-100">
                  {state.record.ledger_sequence_number}
                </span>
              </div>
              <OperationDetails record={state.record} />
            </div>

            <div className="mt-6 text-center">
              <a
                href={getOperationPdfUrl(state.record.certificate_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-amber px-5 py-2.5 text-sm font-medium text-ink hover:bg-amber-light"
              >
                Download report PDF
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
