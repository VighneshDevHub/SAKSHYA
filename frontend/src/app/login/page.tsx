"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthError, getToken, login, register } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMINISTRATOR" | "INVESTIGATOR" | "AUDITOR" | "SUPERVISOR">("INVESTIGATOR");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const reservedDomain = /@(test|example|invalid|localhost)$/i.test(normalizedEmail);
      if (!normalizedEmail || !normalizedEmail.includes("@") || reservedDomain || password.length < 8) {
        throw new AuthError(
          "Enter a valid email address using a real domain, such as user@ntro.gov.in, and a password of at least 8 characters.",
        );
      }
      if (mode === "register") {
        await register(normalizedEmail, password, role);
      }
      await login(normalizedEmail, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const orgName = "National Technical Research Organisation";
  const deptName = "Digital Forensics Unit";
  const deptCode = "DFU / NTRO · 2025–26";
  const compliance =
    "NIST SP 800-88 Rev. 1 · DoD 5220.22-M · MeitY GSR 2025 · ISO 27001";

  return (
    <div className="relative flex min-h-screen flex-col bg-page overflow-hidden">
      {/* ---- Government ornamental bands (top/bottom) ---- */}
      <div aria-hidden className="relative">
        <div className="h-1.5 bg-govt-navy" />
        <div className="h-0.5 bg-govt-gold" />
      </div>

      {/* ---- Subtle crest watermark ---- */}
      <svg
        aria-hidden="true"
        viewBox="0 0 512 512"
        className="pointer-events-none absolute -right-32 -top-32 opacity-[0.05] text-govt-navy"
        width="640"
        height="640"
      >
        <g fill="currentColor">
          <circle cx="256" cy="256" r="220" fill="none" stroke="currentColor" strokeWidth="6" />
          <circle cx="256" cy="256" r="180" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M256 80c97 0 176 79 176 176 0 97-79 176-176 176S80 353 80 256 159 80 256 80zm0 56a120 120 0 1 0 0 240 120 120 0 0 0 0-240z" />
          <circle cx="256" cy="256" r="44" />
        </g>
      </svg>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-8 md:px-10 md:py-12">
        {/* ---- Top crest / brand strip ---- */}
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-4">
            {/* Ashoka-style crest block */}
            <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-sm border border-govt-blueRing bg-gradient-to-br from-govt-blue to-govt-navy text-white shadow-card">
              <svg
                viewBox="0 0 24 24"
                width="26"
                height="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span className="absolute inset-x-1 bottom-1 h-0.5 bg-govt-gold" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-xl font-bold tracking-tight text-govt-navy">
                PRAMAAN
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
                Secure Erasure · Digital Forensics · Chain Ledger
              </span>
            </span>
          </Link>

          <div className="hidden text-right md:block">
            <div className="font-display text-sm font-semibold text-govt-navy">{orgName}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              {deptCode}
            </div>
          </div>
        </header>

        {/* ---- Main 2-column block ---- */}
        <main className="grid flex-1 items-center gap-10 lg:grid-cols-[1.05fr,0.95fr]">
          {/* ---- LEFT: institutional panel ---- */}
          <section className="hidden lg:block">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-govt-blueRing/60" />
              <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-govt-navy">
                {deptName}
              </span>
              <span className="h-px flex-1 bg-govt-blueRing/60" />
            </div>

            <h1 className="font-display text-[38px] leading-[1.08] font-semibold text-govt-navy md:text-[46px]">
              Integrated Secure Data Sanitisation &amp; Forensic Recovery Platform
            </h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
              PRAMAAN provides NTRO and allied agencies with a single
              tamper-resistant workspace for storage sanitisation, evidence
              recovery, and cryptographically anchored reporting. All
              operations are independently verifiable via an immutable
              SHA-256 hash chain and ECDSA P-256 operator signatures.
            </p>

            {/* Capability list — government-style numbered list */}
            <ol className="mt-9 divide-y divide-govt-blueRing/60 border-y border-govt-blueRing/60">
              {[
                ["Secure Drive Eraser", "HDD · SSD · NVMe · USB · SD · Clear / Purge / Crypto-Erase with Read-back Verification"],
                ["File & Folder Eraser", "Content overwrite · Metadata scrubbing · Free-space cleansing · Batch workflow"],
                ["Advanced File Recovery", "Signature carving · Structural validation · Confidence scoring · Evidence integrity seal"],
                ["Verification & Audit", "Signed PDF certificates · QR verification portal · Immutable hash-chain ledger"],
              ].map(([t, b], i) => (
                <li key={t} className="grid grid-cols-[44px,1fr] gap-4 py-4">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-govt-blueRing bg-govt-blueLight font-mono text-[13px] font-semibold text-govt-navy">
                    0{i + 1}
                  </span>
                  <div>
                    <div className="font-display text-[15px] font-semibold text-govt-navy">{t}</div>
                    <div className="mt-1 text-[13px] leading-relaxed text-muted">{b}</div>
                  </div>
                </li>
              ))}
            </ol>

            <footer className="mt-9 grid grid-cols-3 gap-3 text-center">
              {[
                ["SHA-256", "Chain Integrity"],
                ["ECDSA P-256", "Operator Signing"],
                ["NIST 800-88", "Sanitisation"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-sm border border-govt-blueRing bg-govt-blueLight/50 py-3"
                >
                  <div className="font-mono text-[11px] font-semibold text-govt-navy">{k}</div>
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                    {v}
                  </div>
                </div>
              ))}
            </footer>

            <p className="mt-9 font-mono text-[10px] uppercase tracking-[0.28em] text-muted">
              {compliance}
            </p>
          </section>

          {/* ---- RIGHT: auth card ---- */}
          <section className="w-full">
            <div className="relative overflow-hidden rounded-sm border border-govt-blueRing bg-panel shadow-card-md">
              {/* Government header strip */}
              <div
                aria-hidden="true"
                className="h-14 bg-gradient-to-r from-govt-navy via-[#1d4e91] to-govt-blue"
              >
                <div className="flex h-full items-center justify-between px-6 text-white">
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    <span className="font-mono text-[11px] uppercase tracking-[0.25em]">
                      Secure Operator Access
                    </span>
                  </div>
                  <div className="hidden items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest md:flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-govt-green" />
                    Chain Anchored
                  </div>
                </div>
              </div>
              <div aria-hidden="true" className="h-0.5 bg-govt-gold" />

              <div className="px-6 py-6 md:px-8 md:py-7">
                <div className="mb-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-govt-blue">
                    {mode === "login" ? "Sign-In" : "New Operator Registration"}
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-govt-navy">
                    {mode === "login" ? "Access Operator Console" : "Register New Officer"}
                  </h2>
                  <p className="mt-1.5 text-[13px] text-muted">
                    {mode === "login"
                      ? "Authenticate using your issued credentials to access the digital forensics workspace."
                      : "Self-register an operator account. All actions are audit logged and cryptographically signed."}
                  </p>
                </div>

                {error && (
                  <div className="mb-5 rounded-md border border-govt-red/40 bg-govt-redLight px-4 py-3 text-[13px] text-govt-red">
                    {error}
                  </div>
                )}

                {/* Mode tabs (government-style — underline nav) */}
                <div className="mb-5 flex gap-6 border-b border-line text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
                      mode === "login"
                        ? "border-govt-blue text-govt-navy"
                        : "border-transparent text-muted hover:text-main"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setError(null);
                    }}
                    className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
                      mode === "register"
                        ? "border-govt-blue text-govt-navy"
                        : "border-transparent text-muted hover:text-main"
                    }`}
                  >
                    Register
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="fg-label">Official Email Address</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="first.last@ntro.gov.in"
                      autoComplete="email"
                      className="fg-input"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="fg-label">Password</span>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      className="fg-input"
                    />
                  </label>

                  {mode === "register" && (
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="fg-label">Select Role</span>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as typeof role)}
                        className="fg-input"
                      >
                        <option value="INVESTIGATOR">Investigator</option>
                        <option value="AUDITOR">Auditor</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="ADMINISTRATOR">Administrator</option>
                      </select>
                      <span className="text-[11px] text-muted">
                        Temporary demo mode: role is assigned during public registration.
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-1 fg-btn-primary w-full !py-3 text-[14px] font-semibold disabled:opacity-60"
                  >
                    {submitting
                      ? "Processing…"
                      : mode === "login"
                        ? "Sign In to Console"
                        : "Register and Sign In"}
                  </button>
                </form>

                <p className="mt-5 text-[12px] text-muted">
                  Every record you submit is cryptographically tied to this
                  operator account — the author field cannot be spoofed by
                  client input.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              <span>© {new Date().getFullYear()} {orgName}</span>
              <span>Restricted · Authorised Use Only · Audit Logged</span>
            </div>
          </section>
        </main>
      </div>

      {/* ---- Footer ornamental band ---- */}
      <div aria-hidden className="relative mt-6">
        <div className="h-0.5 bg-govt-gold" />
        <div className="h-1.5 bg-govt-navy" />
      </div>
    </div>
  );
}
