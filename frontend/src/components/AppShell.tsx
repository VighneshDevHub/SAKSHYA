"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredEmail, getStoredRole, logout, getToken } from "@/lib/auth";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import type { NotificationListOut, NotificationOut, UserRole } from "@/lib/types";

type NavSection = {
  heading: string;
  items: {
    href: string;
    label: string;
    icon: React.ReactNode;
    matchPrefix?: boolean;
    /** Restrict to these roles — undefined = all roles visible. */
    roles?: UserRole[];
  }[];
};

// --- Inline SVG icons (no external icon lib — zero dep, govt-style solid)
const I = {
  Dashboard: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  Clipboard: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="4" width="10" height="4" rx="1" />
      <rect x="5" y="6" width="14" height="15" rx="1.5" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  ),
  Folder: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  ),
  Drive: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  ),
  Users: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20c.7-3.3 3.6-5 6.5-5s5.8 1.7 6.5 5" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M15.5 15c2.6 0 4.6 1.3 5.5 4" />
    </svg>
  ),
  Chain: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7 0l2.5-2.5a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2.5 2.5a5 5 0 0 0 7 7l1-1" />
    </svg>
  ),
  FileText: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  Cog: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  ListLogs: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16M4 12h16M4 19h10" />
      <circle cx="5" cy="5" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  ),
  Bell: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 6 3 7 3 7H3s3-1 3-7" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  ),
  Search: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  Sun: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  Moon: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  Shield: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Book: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z" />
      <path d="M4 5.5V22M8 7h8M8 11h8" />
    </svg>
  ),
};

// -- Role label helpers -------------------------------------------------

const ROLE_LABEL: Record<UserRole, string> = {
  ADMINISTRATOR: "Administrator",
  INVESTIGATOR: "Investigator",
  AUDITOR: "Auditor",
  SUPERVISOR: "Supervisor",
};

const ROLE_VARIANT: Record<UserRole, string> = {
  ADMINISTRATOR: "fg-badge--red",
  INVESTIGATOR: "fg-badge--navy",
  AUDITOR: "fg-badge--green",
  SUPERVISOR: "fg-badge--gold",
};

function RoleBadge({ role }: { role: UserRole | string }) {
  const r = role as UserRole;
  const variant = ROLE_VARIANT[r] ?? "";
  const label = ROLE_LABEL[r] ?? role;
  return (
    <span className={`fg-badge ${variant}`}>
      <span className="fg-badge-dot" />
      {label}
    </span>
  );
}

// --- Notification item --------------------------------------------------

function NotificationRow({
  item,
  onRead,
}: {
  item: NotificationOut;
  onRead: (id: string) => void;
}) {
  const unread = !item.read_at;
  return (
    <button
      type="button"
      onClick={() => onRead(item.id)}
      className={`block w-full border-b border-line px-4 py-3 text-left last:border-b-0 ${
        unread ? "bg-typeblue-dim/40 hover:bg-typeblue-dim/70" : "hover:bg-field"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            unread ? "bg-govt-blue" : "bg-transparent"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-sm ${unread ? "font-semibold text-main" : "text-main"}`}>
              {item.title}
            </p>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.message}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </button>
  );
}

// --- The shell ----------------------------------------------------------

export function AppShell({
  eyebrow,
  title,
  subtitle,
  children,
  actions,
  /** Optional role to display in the user pill. Undefined hides the pill. */
  userRole,
  /** Optional user id for ws user channel subscriptions. */
  userId,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  userRole?: UserRole | string;
  userId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [notif, setNotif] = useState<NotificationListOut | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [storedRole, setStoredRole] = useState<UserRole | string | undefined>(undefined);

  useEffect(() => {
    setStoredEmail(getStoredEmail());
    setStoredRole(getStoredRole() ?? undefined);
  }, [userId]);

  const sessionRole = userRole ?? storedRole;

  // Pull notifications once on mount and keep state local.
  useEffect(() => {
    if (!getToken()) return;
    listNotifications({ unread_only: false, limit: 50 })
      .then(setNotif)
      .catch(() => { /* Swallow: notif UX is additive only */ });
  }, [userId]);

  const unreadCount = notif?.unread_count ?? 0;

  async function handleMarkRead(id: string) {
    try {
      const updated = await markNotificationRead(id);
      setNotif((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          unread_count: Math.max(0, (prev.unread_count ?? 1) - 1),
          items: prev.items.map((it) => (it.id === id ? updated : it)),
        };
      });
    } catch { /* ignore */ }
  }

  async function handleMarkAllRead() {
    try {
      const res = await markAllNotificationsRead();
      setNotif((prev) => {
        if (!prev) return prev;
        return {
          unread_count: 0,
          items: prev.items.map((it) =>
            it.read_at ? it : { ...it, read_at: new Date().toISOString() },
          ),
        };
      });
    } catch { /* ignore */ }
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const params = new URLSearchParams({ q: searchQuery.trim() });
    router.push(`/dashboard/search?${params.toString()}`);
  }

  const nav = useMemo<NavSection[]>(() => [
    {
      heading: "Operations",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: I.Dashboard },
        { href: "/dashboard/recovery", label: "Recovery Engine", icon: I.Folder, matchPrefix: false, roles: ["ADMINISTRATOR", "INVESTIGATOR", "SUPERVISOR"] },
        { href: "/dashboard/file-eraser", label: "File / Folder Eraser", icon: I.FileText, matchPrefix: false, roles: ["ADMINISTRATOR", "INVESTIGATOR", "SUPERVISOR"] },
        { href: "/dashboard/drive-eraser", label: "Drive Eraser", icon: I.Drive, matchPrefix: false, roles: ["ADMINISTRATOR", "INVESTIGATOR", "SUPERVISOR"] },
        { href: "/dashboard/jobs", label: "Task Queue", icon: I.Clipboard, roles: ["ADMINISTRATOR", "INVESTIGATOR", "SUPERVISOR", "AUDITOR"] },
        { href: "/dashboard/devices", label: "Device Inventory", icon: I.Drive },
        { href: "/dashboard/cases", label: "Cases", icon: I.Folder },
        { href: "/dashboard/manual", label: "User Manual", icon: I.Book },
      ],
    },
    {
      heading: "Forensics",
      items: [
        { href: "/dashboard/ledger", label: "Hash Chain Ledger", icon: I.Chain },
        { href: "/dashboard/reports", label: "Report Center", icon: I.FileText },
        { href: "/dashboard/audit", label: "Audit Log", icon: I.ListLogs },
      ],
    },
    {
      heading: "Administration",
      items: [
        { href: "/dashboard/users", label: "Operators", icon: I.Users, roles: ["ADMINISTRATOR"] },
        { href: "/dashboard/system-logs", label: "System Logs", icon: I.ListLogs, roles: ["ADMINISTRATOR", "AUDITOR", "SUPERVISOR"] },
        { href: "/dashboard/settings", label: "Settings", icon: I.Cog, roles: ["ADMINISTRATOR"] },
      ],
    },
  ], []);

  function isVisible(roles?: UserRole[]): boolean {
    if (!roles) return true;
    if (!sessionRole) return true; // Keep legacy sessions usable until re-login.
    return roles.includes(sessionRole as UserRole);
  }

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const email = storedEmail;

  return (
    <div className="flex min-h-screen flex-col bg-page">
      {/* =========== TOP BAR =========== */}
      <header className="fg-topbar">
        <div className="flex items-center gap-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-label="Toggle navigation"
            className="fg-btn-ghost !p-2"
          >
            {I.Clipboard}
          </button>
        </div>

        {/* Brand block */}
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 text-govt-navy"
            aria-label="PRAMAAN home"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-sm bg-white shadow-card">
            <img src="/pramaan-logo.svg" alt="PRAMAAN logo" className="h-full w-full object-cover" />
          </span>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight">
              PRAMAAN
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              NTRO · Digital Forensics Platform
            </div>
          </div>
        </Link>

        {/* Search (desktop) */}
        <form
          onSubmit={onSearchSubmit}
          className="ml-2 hidden w-full max-w-xl md:block"
        >
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              {I.Search}
            </span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cases, devices, certificates, officers, hashes…"
              className="fg-input pl-9"
              aria-label="Platform-wide search"
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="fg-btn-ghost !p-2"
            aria-label={theme === "govt-light" ? "Switch to dark mode" : "Switch to light mode"}
            title={theme === "govt-light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "govt-light" ? I.Moon : I.Sun}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-expanded={notifOpen}
              aria-haspopup="menu"
              aria-label={`Notifications${unreadCount ? ` · ${unreadCount} unread` : ""}`}
              className="relative fg-btn-ghost !p-2"
            >
              {I.Bell}
              {unreadCount > 0 && (
                <span
                  className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-govt-red px-1 font-mono text-[10px] font-semibold leading-none text-white"
                  aria-hidden="true"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setNotifOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 z-20 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-md border border-line bg-panel shadow-card-md">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                      <p className="font-display text-sm font-semibold">
                        Notifications
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        {unreadCount} unread
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      disabled={unreadCount === 0}
                      className="fg-btn !py-1.5 !px-2.5 text-xs"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {!notif || notif.items.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted">
                        No notifications yet.
                      </div>
                    ) : (
                      notif.items.map((n) => (
                        <NotificationRow
                          key={n.id}
                          item={n}
                          onRead={handleMarkRead}
                        />
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User pill */}
          <div className="ml-1 hidden items-center gap-2 rounded-md border border-line px-2 py-1 md:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-govt-blueLight text-xs font-bold text-govt-navy">
              {(email ?? "O").charAt(0).toUpperCase()}
            </div>
            <div className="leading-tight">
              <div className="text-xs font-medium">{email ?? "Operator"}</div>
              {sessionRole && <div className="mt-0.5"><RoleBadge role={sessionRole} /></div>}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="fg-btn !py-1 !px-2 text-xs"
              title="Sign out"
            >
              Sign out
            </button>
          </div>

          {/* Mobile sign-out */}
          <button
            type="button"
            onClick={handleLogout}
            className="fg-btn !py-1.5 !px-2.5 text-xs md:hidden"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Mobile search */}
      <form
        onSubmit={onSearchSubmit}
        className="border-b border-line bg-panel px-4 py-2 md:hidden"
      >
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {I.Search}
          </span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search…"
            className="fg-input pl-9"
          />
        </label>
      </form>

      {/* =========== SIDEBAR + MAIN =========== */}
      <div className="flex flex-1">
        {/* ---- SIDEBAR ---- */}
        <aside
          className={`fg-sidebar ${mobileNavOpen ? "!flex fixed inset-y-0 left-0 top-14 z-40 max-h-[calc(100vh-3.5rem)]" : ""}`}
          aria-label="Primary"
        >
          <div className="flex-1 overflow-y-auto pb-6">
            <div className="px-2 pb-4 pt-1">
              <p className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                PRAMAAN Console
              </p>
            </div>
            <nav>
              {nav.map((section) => (
                <div key={section.heading} className="mb-4">
                  <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {section.heading}
                  </p>
                  <ul className="space-y-0.5">
                    {section.items.filter((it) => isVisible(it.roles)).map((it) => (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          className="fg-nav-item"
                          data-active={isActive(it.href)}
                          onClick={() => setMobileNavOpen(false)}
                        >
                          <span aria-hidden="true">{it.icon}</span>
                          <span>{it.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-auto border-t border-line pt-3">
            <div className="rounded-sm border border-line bg-field p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Integrity
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-govt-green" aria-hidden="true" />
                Chain is cryptographically anchored
              </p>
              <p className="mt-1 text-xs text-muted">
                SHA-256 · ECDSA P-256 · NIST SP 800-88
              </p>
            </div>
          </div>
        </aside>

        {/* ---- MAIN ---- */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
            {/* Page header */}
            <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
              <div className="min-w-0">
                <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                  {eyebrow}
                </p>
                <h1 className="text-2xl font-semibold text-main md:text-[28px]">
                  {title}
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">{actions}</div>
            </header>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
