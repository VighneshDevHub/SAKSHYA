"use client";

import { useState } from "react";
import type { TimelineEventOut, TimelineEventType } from "@/lib/types";

const EVENT_ICON: Record<TimelineEventType, string> = {
  DEVICE_CONNECTED: "◉",
  RECOVERY_STARTED: "➜",
  FILES_RECOVERED: "▣",
  VERIFICATION: "✓",
  DRIVE_ERASED: "▤",
  CERT_GENERATED: "✦",
  EVIDENCE_ADDED: "▤",
  INVESTIGATOR_ASSIGNED: "◆",
  STATUS_CHANGED: "↻",
  OPERATION_LINKED: "⇌",
  NOTE: "✎",
};

const EVENT_VARIANT: Record<TimelineEventType, string> = {
  DEVICE_CONNECTED: "fg-badge fg-badge--blue",
  RECOVERY_STARTED: "fg-badge fg-badge--navy",
  FILES_RECOVERED: "fg-badge fg-badge--green",
  VERIFICATION: "fg-badge fg-badge--navy",
  DRIVE_ERASED: "fg-badge fg-badge--red",
  CERT_GENERATED: "fg-badge fg-badge--green",
  EVIDENCE_ADDED: "fg-badge fg-badge--blue",
  INVESTIGATOR_ASSIGNED: "fg-badge fg-badge--gold",
  STATUS_CHANGED: "fg-badge fg-badge--gold",
  OPERATION_LINKED: "fg-badge fg-badge--navy",
  NOTE: "fg-badge",
};

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export function TimelineRail({
  events,
  emptyLabel = "No timeline events recorded yet.",
}: {
  events: TimelineEventOut[];
  emptyLabel?: string;
}) {
  if (!events.length) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ol className="relative space-y-5 p-5">
      <span
        className="absolute left-6 top-5 bottom-5 w-px bg-line"
        aria-hidden="true"
      />
      {events.map((ev) => {
        const variant = EVENT_VARIANT[ev.event_type] ?? "fg-badge";
        const icon = EVENT_ICON[ev.event_type] ?? "•";
        return (
          <li key={ev.id} className="relative pl-12">
            <span
              className="absolute left-3 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-panel text-[12px] text-govt-navy shadow-card"
              aria-hidden="true"
            >
              {icon}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className={variant}>{ev.event_type.replaceAll("_", " ")}</span>
              <span className="font-mono text-[11px] text-muted">
                {formatTs(ev.event_at)}
              </span>
              <span className="font-mono text-[11px] text-muted">
                by {ev.actor_email}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-main">{ev.description}</p>
            {ev.operation_record_id && (
              <p className="mt-1 font-mono text-[11px] text-muted">
                op: {ev.operation_record_id.slice(0, 12)}…
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function TimelineNoteComposer({
  onSubmit,
  submitting,
}: {
  onSubmit: (text: string) => Promise<unknown> | unknown;
  submitting: boolean;
}) {
  const [text, setText] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    await onSubmit(value);
    setText("");
  }

  return (
    <form className="border-t border-line p-4" onSubmit={handleSubmit}>
      <label className="fg-label" htmlFor="case-note">
        Manual note
      </label>
      <textarea
        id="case-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Add an audited note to the investigation timeline…"
        className="fg-input"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Notes are appended immutably to the case timeline.
        </p>
        <button type="submit" disabled={submitting || !text.trim()} className="fg-btn-primary !py-1.5 !px-3 text-xs">
          {submitting ? "Saving…" : "Append Note"}
        </button>
      </div>
    </form>
  );
}
