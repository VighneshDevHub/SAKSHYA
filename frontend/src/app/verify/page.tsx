"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyLookupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [certificateId, setCertificateId] = useState(searchParams.get("certificate_id") ?? "");

  useEffect(() => {
    const existing = searchParams.get("certificate_id");
    if (existing) router.replace(`/verify/${encodeURIComponent(existing)}`);
  }, [router, searchParams]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = certificateId.trim();
    if (value) router.push(`/verify/${encodeURIComponent(value)}`);
  }

  return (
    <main className="min-h-screen bg-page text-main">
      <div aria-hidden><div className="h-1.5 bg-govt-navy" /><div className="h-0.5 bg-govt-gold" /></div>
      <div className="mx-auto flex min-h-[calc(100vh-0.5rem)] max-w-5xl items-center justify-center px-5 py-12">
        <div className="w-full max-w-xl">
          <header className="mb-8 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 text-govt-navy">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-govt-navy text-white">PR</span>
              <span>
                <span className="block font-display text-lg font-bold">PRAMAAN</span>
                <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-muted">NTRO verification portal</span>
              </span>
            </Link>
            <Link href="/login" className="fg-btn !py-1.5 !px-3 text-xs">Operator sign in</Link>
          </header>

          <section className="fg-panel overflow-hidden">
            <div className="fg-hero-band border-b border-govt-navy px-6 py-7 md:px-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-govt-goldLight">Independent verification</p>
              <h1 className="mt-2 font-display text-2xl font-semibold text-white">Verify Certificate</h1>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Check the operator signature and SHA-256 ledger chain for a PRAMAAN operation certificate.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5 p-6 md:p-8">
              <label className="block text-sm">
                <span className="fg-label">Certificate ID</span>
                <input
                  autoFocus
                  required
                  value={certificateId}
                  onChange={(event) => setCertificateId(event.target.value)}
                  placeholder="Paste certificate ID"
                  className="fg-input font-mono"
                />
              </label>
              <button type="submit" className="fg-btn-primary w-full !py-3">Verify Certificate</button>
              <p className="text-center text-xs leading-relaxed text-muted">
                No operator account is required. The portal validates the signed record against the immutable ledger.
              </p>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function VerifyLookupPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-page p-8 text-sm text-muted">Loading verification portal...</main>}>
      <VerifyLookupContent />
    </Suspense>
  );
}
