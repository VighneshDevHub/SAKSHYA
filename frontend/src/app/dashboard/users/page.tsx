"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listUsers,
  UnauthorizedError,
  updateUserRole,
} from "@/lib/api";
import { getStoredRole, getToken } from "@/lib/auth";
import type { UserRole, UserSummaryOut } from "@/lib/types";
import { AppShell } from "@/components/AppShell";

const ROLE_OPTIONS: UserRole[] = [
  "ADMINISTRATOR",
  "INVESTIGATOR",
  "AUDITOR",
  "SUPERVISOR",
];

const ROLE_LABEL: Record<UserRole, string> = {
  ADMINISTRATOR: "Administrator",
  INVESTIGATOR: "Investigator",
  AUDITOR: "Auditor",
  SUPERVISOR: "Supervisor",
};

const ROLE_VARIANT: Record<UserRole, string> = {
  ADMINISTRATOR: "fg-badge fg-badge--red",
  INVESTIGATOR: "fg-badge fg-badge--navy",
  AUDITOR: "fg-badge fg-badge--green",
  SUPERVISOR: "fg-badge fg-badge--gold",
};

function fmt(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function OperatorsAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<UserSummaryOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [patching, setPatching] = useState<string | null>(null);

  const currentRole = getStoredRole();
  const canManage = currentRole === "ADMINISTRATOR" || currentRole === "SUPERVISOR";
  const canPromoteToAdmin = currentRole === "ADMINISTRATOR";

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const users = await listUsers();
      setRows(users);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load operators");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    if (!canManage) {
      // Non-admin users should not land here — nav already gates, but keep
      // a safety check at the data layer too.
      setError("Access restricted to ADMINISTRATOR and SUPERVISOR roles.");
      return;
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleRoleChange(userId: string, newRole: UserRole) {
    if (newRole === "ADMINISTRATOR" && !canPromoteToAdmin) return;
    setPatching(userId);
    setError(null);
    try {
      const updated = await updateUserRole(userId, newRole);
      setRows((prev) =>
        prev ? prev.map((u) => (u.id === userId ? updated : u)) : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
      await reload();
    } finally {
      setPatching(null);
    }
  }

  const counts = (rows ?? []).reduce(
    (acc, u) => {
      acc.total++;
      acc[u.role] = (acc[u.role] ?? 0) + 1;
      return acc;
    },
    { total: 0 } as Record<string, number>,
  );

  return (
    <AppShell
      eyebrow="Platform Administration"
      title="Operators & Role Based Access"
      subtitle="Manage platform operators and assign duty roles. Only ADMINISTRATOR and SUPERVISOR accounts may view or modify this page."
      actions={
        <button type="button" onClick={() => reload()} className="fg-btn !py-1.5 !px-3 text-xs">
          ↻ Refresh
        </button>
      }
    >
      {error && (
        <div className="mb-6 rounded-md border border-govt-red/25 bg-govt-redLight px-4 py-3 text-sm text-govt-red">
          {error}
        </div>
      )}

      {/* ========= Summary cards ========= */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <CountCard label="Total Operators" value={counts.total} variant="navy" />
        <CountCard label="Administrator" value={counts.ADMINISTRATOR ?? 0} variant="red" />
        <CountCard label="Supervisor" value={counts.SUPERVISOR ?? 0} variant="gold" />
        <CountCard label="Investigator" value={counts.INVESTIGATOR ?? 0} variant="navy" />
        <CountCard label="Auditor" value={counts.AUDITOR ?? 0} variant="green" />
      </div>

      {/* ========= Operators table ========= */}
      <div className="fg-panel overflow-hidden">
        <div className="fg-panel-header">
          <div className="fg-panel-title">Operator Directory</div>
          <div className="font-mono text-[11px] text-muted">
            Source: <code className="fg-badge !py-0">GET /api/v1/users</code>
          </div>
        </div>

        {loading && !rows && (
          <div className="p-10 text-center text-sm text-muted">Loading operator directory…</div>
        )}

        {!canManage && !error && (
          <div className="p-10 text-center text-sm text-muted">
            Insufficient permissions. Contact an Administrator to request access.
          </div>
        )}

        {canManage && rows && rows.length === 0 && (
          <div className="p-10 text-center text-sm text-muted">
            No operator records. Register users via the standard Sign Up flow first.
          </div>
        )}

        {canManage && rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="fg-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Current Role</th>
                  <th>Reassign Role</th>
                  <th className="text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const isLocked =
                    u.role === "ADMINISTRATOR" && !canPromoteToAdmin;
                  const busy = patching === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-govt-blueLight text-xs font-bold text-govt-navy">
                            {u.email.charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <div className="font-mono text-xs text-main break-all">{u.email}</div>
                            <div className="font-mono text-[10px] text-muted truncate max-w-[240px]">
                              id: {u.id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={ROLE_VARIANT[u.role]}>
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td>
                        <select
                          value={u.role}
                          disabled={busy || isLocked}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="fg-input !py-1.5 !text-xs"
                          title={isLocked ? "Only ADMINISTRATORs may change ADMINISTRATOR role" : ""}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option
                              key={r}
                              value={r}
                              disabled={r === "ADMINISTRATOR" && !canPromoteToAdmin}
                            >
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right text-xs text-muted">
                        {busy ? <span className="fg-badge fg-badge--gold">Saving…</span> : fmt(u.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function CountCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "navy" | "red" | "gold" | "green" | "blue";
}) {
  const accent =
    variant === "red"
      ? "text-govt-red border-govt-red/30"
      : variant === "gold"
        ? "text-govt-gold border-govt-gold/50"
        : variant === "green"
          ? "text-govt-green border-govt-green/40"
          : variant === "blue"
            ? "text-govt-blue border-govt-blueRing"
            : "text-govt-navy border-govt-blueRing";
  return (
    <div className={`rounded-sm border bg-panel px-4 py-3 ${accent}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
