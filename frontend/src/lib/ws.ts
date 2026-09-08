"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "./auth";
import { API_BASE } from "./api";
import type { WSJobEvent, WSLogEvent, WSUserEvent } from "./types";

type WSReadyState = "connecting" | "open" | "closed" | "unauthenticated";

interface UseSocketBase {
  readyState: WSReadyState;
  close: () => void;
}

function wsHttpToWs(baseUrl: string): string {
  if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}`;
  if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}`;
  return baseUrl;
}

function buildSocket(path: string): WebSocket | null {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null;
  const base = wsHttpToWs(API_BASE);
  const url = `${base}/api/v1${path}?token=${encodeURIComponent(token)}`;
  return new WebSocket(url, ["access_token." + token]);
}

// ---------------- hooks ----------------

export function useJobSocket(jobId: string | null | undefined): UseSocketBase & {
  lastEvent: WSJobEvent | null;
} {
  const socketRef = useRef<WebSocket | null>(null);
  const [readyState, setReadyState] = useState<WSReadyState>("connecting");
  const [lastEvent, setLastEvent] = useState<WSJobEvent | null>(null);

  const close = useCallback(() => {
    if (socketRef.current) {
      try { socketRef.current.close(); } catch { /* ignore */ }
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setReadyState("closed");
      return;
    }
    const token = getToken();
    if (!token) {
      setReadyState("unauthenticated");
      return;
    }
    setReadyState("connecting");
    const ws = buildSocket(`/ws/jobs/${encodeURIComponent(jobId)}`);
    if (!ws) {
      setReadyState("closed");
      return;
    }
    socketRef.current = ws;
    let closed = false;

    ws.onopen = () => setReadyState("open");
    ws.onclose = () => {
      closed = true;
      setReadyState("closed");
    };
    ws.onerror = () => { /* onclose fires right after */ };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as WSJobEvent;
        setLastEvent(parsed);
      } catch {
        // Ignore malformed frames — the server only sends JSON.
      }
    };

    return () => {
      if (!closed) {
        try { ws.close(); } catch { /* ignore */ }
      }
      socketRef.current = null;
    };
  }, [jobId]);

  return { readyState, lastEvent, close };
}

export function useUserSocket(userId: string | null | undefined): UseSocketBase & {
  lastEvent: WSUserEvent | null;
} {
  const socketRef = useRef<WebSocket | null>(null);
  const [readyState, setReadyState] = useState<WSReadyState>("connecting");
  const [lastEvent, setLastEvent] = useState<WSUserEvent | null>(null);

  const close = useCallback(() => {
    if (socketRef.current) {
      try { socketRef.current.close(); } catch { /* ignore */ }
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setReadyState("closed");
      return;
    }
    const token = getToken();
    if (!token) {
      setReadyState("unauthenticated");
      return;
    }
    setReadyState("connecting");
    const ws = buildSocket(`/ws/user/${encodeURIComponent(userId)}`);
    if (!ws) {
      setReadyState("closed");
      return;
    }
    socketRef.current = ws;
    let closed = false;

    ws.onopen = () => setReadyState("open");
    ws.onclose = () => {
      closed = true;
      setReadyState("closed");
    };
    ws.onerror = () => { /* onclose fires right after */ };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as WSUserEvent;
        setLastEvent(parsed);
      } catch { /* ignore */ }
    };

    return () => {
      if (!closed) {
        try { ws.close(); } catch { /* ignore */ }
      }
      socketRef.current = null;
    };
  }, [userId]);

  return { readyState, lastEvent, close };
}

/** Alias used by the system-logs page */
export function useSystemLogStream(
  onEvent: (ev: WSLogEvent) => void,
): UseSocketBase {
  const { readyState, events, close } = useLogsSocket();
  // Forward new events to the callback. We track last-processed index to
  // avoid re-firing already-delivered events when the array grows.
  const lastLen = useRef(0);
  useEffect(() => {
    if (events.length > lastLen.current) {
      events.slice(lastLen.current).forEach(onEvent);
      lastLen.current = events.length;
    }
  }, [events, onEvent]);
  return { readyState, close };
}

export function useLogsSocket(): UseSocketBase & {
  events: WSLogEvent[];
} {
  const socketRef = useRef<WebSocket | null>(null);
  const [readyState, setReadyState] = useState<WSReadyState>("connecting");
  const [events, setEvents] = useState<WSLogEvent[]>([]);

  const close = useCallback(() => {
    if (socketRef.current) {
      try { socketRef.current.close(); } catch { /* ignore */ }
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setReadyState("unauthenticated");
      return;
    }
    setReadyState("connecting");
    const ws = buildSocket("/ws/logs");
    if (!ws) {
      setReadyState("closed");
      return;
    }
    socketRef.current = ws;
    let closed = false;

    ws.onopen = () => setReadyState("open");
    ws.onclose = () => {
      closed = true;
      setReadyState("closed");
    };
    ws.onerror = () => { /* onclose fires right after */ };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as WSLogEvent;
        setEvents((prev) => {
          const next = [...prev, parsed];
          // Keep bounded tail of 500 most recent events to bound memory
          // on long-lived tabs.
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
      } catch { /* ignore */ }
    };

    return () => {
      if (!closed) {
        try { ws.close(); } catch { /* ignore */ }
      }
      socketRef.current = null;
    };
  }, []);

  return { readyState, events, close };
}
