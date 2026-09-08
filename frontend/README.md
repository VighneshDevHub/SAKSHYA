
# PRAMAAN — Frontend Dashboard

> Next.js 14 · TypeScript · Tailwind CSS · Government Design System  
> The operator-facing console for the PRAMAAN digital forensics platform.

---

## Overview

The PRAMAAN frontend is a government-grade, enterprise-quality dashboard built with Next.js 14 App Router. It provides the complete operator interface for:

- **Public Landing Page** — government presentation with live platform statistics
- **Certificate Verification** — public, no-login tamper verification with QR support
- **Authenticated Dashboard** — analytics, cases, devices, jobs, reports, settings
- **Real-time Updates** — WebSocket job progress and live system log streaming
- **Role-Aware UI** — navigation and actions adapt per user role (RBAC)

---

## Directory Structure

```
frontend/
├── src/
│   ├── app/                          ← Next.js App Router pages
│   │   ├── page.tsx                  Public landing page (9 sections)
│   │   ├── globals.css               Government CSS design tokens
│   │   ├── layout.tsx                Root layout with ThemeProvider
│   │   ├── login/
│   │   │   └── page.tsx              Login form with JWT storage
│   │   ├── verify/
│   │   │   └── [certId]/page.tsx     Public certificate verification
│   │   └── dashboard/                Protected — redirects to /login if no JWT
│   │       ├── page.tsx              Analytics: stat cards + SVG charts + top investigators
│   │       ├── cases/
│   │       │   ├── page.tsx          Case list + create form
│   │       │   └── [caseId]/page.tsx Case detail: overview + investigators + evidence + timeline
│   │       ├── devices/
│   │       │   └── page.tsx          Device inventory: filter bar + table + create/edit modal
│   │       ├── jobs/
│   │       │   ├── page.tsx          Task queue: status tabs + cancel/retry actions
│   │       │   └── [jobId]/page.tsx  Job detail: live WS progress bar + lifecycle timestamps
│   │       ├── ledger/
│   │       │   └── page.tsx          Hash chain visualizer: block cards + verify action
│   │       ├── reports/
│   │       │   └── page.tsx          4-tab report center: certs + recovery + audit + monthly
│   │       ├── search/
│   │       │   └── page.tsx          Global search results with typed filter chips
│   │       ├── settings/
│   │       │   └── page.tsx          Org settings form (ADMIN only)
│   │       ├── system-logs/
│   │       │   └── page.tsx          Live log stream + persisted category tabs
│   │       └── users/
│   │           └── page.tsx          Operator list + role management (ADMIN only)
│   ├── components/
│   │   ├── AppShell.tsx              Main layout: topbar + sidebar + notifications + search
│   │   ├── ThemeProvider.tsx         govt-light / govt-dark theme context
│   │   ├── OperationBadges.tsx       Operation type badges
│   │   ├── cases/
│   │   │   ├── TimelineRail.tsx      Investigation timeline with note composer
│   │   │   └── EvidenceExplorer.tsx  Recovered file browser by category
│   │   └── jobs/
│   │       └── JobUI.tsx             JobRow, JobProgressBar, JobStatusBadge, templates
│   └── lib/
│       ├── api.ts                    All API wrapper functions (fetch-based)
│       ├── types.ts                  TypeScript types mirroring all backend schemas
│       ├── auth.ts                   localStorage token/email/role helpers
│       └── ws.ts                     useJobSocket, useUserSocket, useLogsSocket, useSystemLogStream
├── package.json
├── tailwind.config.js                Government colour palette + custom tokens
├── tsconfig.json                     Strict TypeScript
└── next.config.js
```

---

## Setup & Running

### Development

```bash
npm install
npm run dev          # http://localhost:3000
```

### Production Build

```bash
npm run build        # creates .next/
npm run start        # serves production build
```

### Environment Variable

The only frontend env var needed:

```bash
# .env.local (or set in Docker build args)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Design System

The UI uses a **government enterprise design system** inspired by NIC/NTRO aesthetics. All design tokens are in `globals.css` and `tailwind.config.js`.

### Colour Palette

| Token | Value | Use |
|---|---|---|
| `govt-navy` | `#0f2d5e` | Primary headings, active nav, brand |
| `govt-blue` | `#1a56a0` | Buttons, links, active states |
| `govt-blueLight` | `#e8f0fb` | Hover backgrounds |
| `govt-green` | `#1a7a3e` | Success, connected, verified |
| `govt-red` | `#b91c1c` | Error, tamper detected, danger |
| `govt-gold` | `#a16207` | Warning, paused, fair health |
| `grey-*` | — | Borders, backgrounds, muted text |

### CSS Component Classes

```css
/* Buttons */
.fg-btn          /* secondary / outline */
.fg-btn-primary  /* filled navy blue */
.fg-btn-ghost    /* icon buttons, no border */

/* Cards / Panels */
.fg-panel        /* white card with border */
.fg-panel-header /* panel title row */

/* Navigation */
.fg-topbar       /* sticky header bar */
.fg-sidebar      /* left navigation rail */
.fg-nav-item     /* nav link (data-active="true" for highlight) */

/* Form */
.fg-input        /* text inputs, selects, textareas */
.fg-label        /* input labels */

/* Table */
.fg-table        /* data table with hover rows */

/* Badges */
.fg-badge               /* neutral */
.fg-badge--green        /* success */
.fg-badge--navy         /* info */
.fg-badge--gold         /* warning */
.fg-badge--red          /* danger */
.fg-badge--blue         /* info alt */
```

### Themes

Two themes are available via `ThemeProvider`:

| Theme | Class | Description |
|---|---|---|
| `govt-light` | Default | White panels, navy nav — NTRO standard |
| `govt-dark` | Toggle | Dark backgrounds, adapted for low-light ops |

---

## Key Pages

### Landing Page (`/`)

Public page. Sections:
1. **Hero** — tagline + sign-in + verify CTA
2. **Live Stats** — operations count, devices, cases, chain verification % (from `/api/v1/public/stats`)
3. **Features Grid** — 6 capability cards
4. **Architecture Diagram** — SVG system diagram
5. **Security Standards** — NIST SP 800-88, SHA-256, ECDSA P-256, ISO 27037 badges
6. **Workflow** — 6-step process steps
7. **FAQ Accordion** — common questions, click to expand
8. **Contact** — department contact block
9. **Footer** — ministry attribution

### Dashboard (`/dashboard`)

Requires JWT. Shows:
- 7 stat cards (operations today, total certs, recovered files, data sanitised, success rate, active cases, total devices)
- SVG line chart with 5 metric toggles (operations / successes / failures / recoveries / erases) over 30 days
- Top Investigators table
- Recent Jobs list with live WS badge updates

### Job Detail (`/dashboard/jobs/[jobId]`)

- Real-time WebSocket progress bar via `useJobSocket(jobId)`
- Status badge updates without page refresh
- Full lifecycle timestamps (claimed_at, started_at, completed_at)
- Cancel / Retry actions with role guards

### Certificate Verification (`/verify/[certId]`)

- Public — no login required
- Shows: operator, operation type, timestamps, SHA-256 hash, signature status, chain position
- Embedded QR code links back to this page

---

## WebSocket Hooks (`lib/ws.ts`)

```typescript
// Subscribe to live job progress
const { readyState, lastEvent } = useJobSocket(jobId);
// lastEvent: { type: "progress", percent: 45, stage: "carving", ... }

// Subscribe to user notifications
const { readyState, lastEvent } = useUserSocket(userId);

// Subscribe to live log stream
const { readyState, events } = useLogsSocket();
// events: WSLogEvent[] — bounded tail of 500 most recent

// System logs page hook (aliases useLogsSocket with callback pattern)
useSystemLogStream((event) => {
    // called for each new log event from the WebSocket stream
});
```

All hooks:
- Build `ws://` or `wss://` URL from the HTTP `API_BASE`
- Attach JWT as query param: `?token=<JWT>`
- Handle reconnect states: `"connecting" | "open" | "closed" | "unauthenticated"`
- Silently ignore malformed frames

---

## API Layer (`lib/api.ts`)

All API calls go through `lib/api.ts` wrappers. Pattern:

```typescript
export async function listDevices(params: DeviceListParams): Promise<DeviceOut[]> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    // ...
    const res = await authFetch(`/api/v1/devices?${qs}`);
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
```

`authFetch()` automatically attaches the JWT from `localStorage` via `getToken()`.

---

## Authentication Flow

```
User enters email + password
        │
        ▼
POST /api/v1/auth/login
        │
        ▼
{ access_token, token_type, role, user_id } stored in localStorage
        │
        ▼
All subsequent requests: Authorization: Bearer <token>
        │
        ▼
Token expiry (30 min): next API call returns 401
        │
        ▼
UnauthorizedError caught → router.push("/login")
```

---

## Role-Aware Navigation

`AppShell.tsx` shows/hides navigation items based on `userRole`:

```typescript
{ href: "/dashboard/users",       roles: ["ADMINISTRATOR", "SUPERVISOR"] }
{ href: "/dashboard/system-logs", roles: ["ADMINISTRATOR", "AUDITOR", "SUPERVISOR"] }
{ href: "/dashboard/settings",    roles: ["ADMINISTRATOR"] }
// No roles array = visible to all authenticated users
```

---

## Known Issues

| Issue | File | Fix |
|---|---|---|
| `/dashboard/audit` nav link leads to 404 | `AppShell.tsx` | Stub page or remove nav item |
| JWT not auto-refreshed on expiry | `auth.ts` | Add refresh token endpoint |

---

## Suggested Improvements

1. **Virtualized tables** — use `@tanstack/react-virtual` for large device/case lists
2. **Optimistic UI** — update job status immediately on cancel/retry, roll back on error
3. **Error boundaries** — wrap dashboard sections in React error boundaries
4. **Skeleton loading states** — replace plain "Loading..." text with shimmer skeletons
5. **Accessibility** — add `aria-live` regions for WebSocket updates; test with screen reader
6. **PWA support** — add service worker for offline certificate viewing
7. **i18n** — add Hindi language support (`hi-IN`) given the government context
8. **End-to-end tests** — add Playwright or Cypress tests for critical flows
