# ForensicGuard - SIH Grand Finale Enterprise Enhancements

## Product Requirements Document

### Overview

- **Summary**: Transform the existing ForensicGuard MVP (FastAPI + Next.js + PostgreSQL, JWT auth, ECDSA signing, SHA-256 hash chain, 3 CLI agents) into a production-ready Government Enterprise Platform for NTRO's Digital Forensics and Data Sanitization use case. Add 17 new integrated features ON TOP of the existing architecture without rewriting any existing module, API, database schema, cryptographic trust layer, or CLI logic.
- **Purpose**: Impress SIH 2026 Grand Finale judges, NTRO officials, and cybersecurity experts by demonstrating a scalable, spec-complete, enterprise-grade forensic platform — while preserving 100% backward compatibility and all existing passing tests (106+).
- **Target Users**: NTRO Administrators, Digital Forensic Investigators, Auditors, Supervising Officers, and independent third-party certificate verifiers.

---

## Goals

1. Deliver all 18 listed features (Case Management already exists; 17 net-new).
2. Keep 100% of existing APIs, models, crypto, auth, and CLI agents working exactly as before.
3. Every new feature integrates via additive extension — no rewrites, no renames, no breaking changes.
4. Government-style professional UI (Blue/White/Grey, minimal, no glassmorphism/no neon/no AI look).
5. Scale the data model to support millions of operations without schema rewrite.
6. Cover every new feature with typed schemas, pydantic models, async SQLAlchemy patterns mirroring existing code.
7. All new endpoints follow existing patterns (deps, routers, service layer separation).
8. Backward compatibility: existing `/api/v1/auth/*`, `/api/v1/cases/*`, `/api/v1/operations/*`, `/api/v1/verify/*` endpoints are **never** modified except to add OPTIONAL fields/parameters with sensible defaults.

---

## Non-Goals

1. Do NOT rewrite any of the 3 CLI agents (drive-eraser-agent, file-folder-eraser, recovery-engine). Their `run()` functions, `wipe()`, `run_batch()`, `run_recovery()` signatures remain untouched.
2. Do NOT modify the cryptographic trust layer: `app/core/crypto.py` (`sign_payload`, `verify_signature`, `to_signable_dict()` fields, `LedgerEntry` hash math, `GENESIS_HASH`) — all signature/ledger behavior frozen.
3. Do NOT change JWT format, `JWT_ALGORITHM`, password hashing (`bcrypt`), or `create_access_token`/`decode_access_token` behavior.
4. Do NOT replace FastAPI, Next.js, or PostgreSQL/Alembic.
5. Do NOT remove or rename existing columns on `users`, `operation_records`, `ledger_entries`, `cases`, `case_*` tables.
6. Do NOT change existing CLI module logic — add `--job-id` / orchestration support as OPTIONAL additional flags only.
7. Do NOT introduce ORM changes that require existing `OperationRecord.to_signable_dict()` output to differ.

---

## Background & Context

### Existing Architecture Inventory (Verified by Code Survey)

**Backend Stack**:
- FastAPI app in [main.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/main.py) — versioned at `/api/v1`, 4 routers: auth, cases, operations, verify.
- Async SQLAlchemy 2.0 + `DeclarativeBase` in [session.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/db/session.py) — `init_models()` uses `Base.metadata.create_all` (dev); production uses Alembic.
- 6 tables: `users`, `operation_records`, `ledger_entries`, `cases`, `case_investigators`, `case_evidence_items`, `case_operation_links`.

**Trust Layer (Immutable per Constraints)**:
- ECDSA P-256 signing in [crypto.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/core/crypto.py) — `canonical_json()`, `sha256_hex()`, persistent keypair resolution via env or `backend/keys/`.
- JWT (HS256) + bcrypt in [security.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/core/security.py) — 30-min tokens.
- Append-only hash chain in [ledger_service.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/services/ledger_service.py) — `GENESIS_HASH = "0"*64`, `entry_hash = sha256(previous_hash + report_hash)`.

**Case Management (ALREADY EXISTS — Feature 1 satisfied)**:
- Models in [case_management.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/models/case_management.py): `CaseRecord` (case_number auto `FG-YYYY-######` via [case_service.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/services/case_service.py)), `CaseInvestigator`, `CaseEvidenceItem`, `CaseOperationLink`.
- Full CRUD + assign + evidence + link-ops + status API in [cases.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/api/v1/cases.py).
- Frontend pages in [cases/page.tsx](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/frontend/src/app/dashboard/cases/page.tsx) and [cases/[caseId]/page.tsx](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/frontend/src/app/dashboard/cases/%5BcaseId%5D/page.tsx).

**CLI Agents**:
- Each has identical pattern: `main.py` argparse → `run()` → detector/engine work → `build_report()` → `ApiClient(base_url, email, password).submit_operation_report(report)` which auto-registers, logs in, POSTs `/api/v1/operations` with JWT.
- `OperationType` enum: `DRIVE_ERASE`, `FILE_ERASE`, `RECOVERY` — NOT modified.

**Frontend Stack**:
- Next.js 14.2 App Router, TypeScript, Tailwind. Dark "ink" theme (will be extended to add government light theme option).
- Auth client in [auth.ts](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/frontend/src/lib/auth.ts) — localStorage token/email.
- API wrapper in [api.ts](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/frontend/src/lib/api.ts) — `fetchJson<T>()` with `requireAuth: bool`.
- Types in [types.ts](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/frontend/src/lib/types.ts).
- Shell component: [AppShell.tsx](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/frontend/src/components/AppShell.tsx).

**Tests**: 8+ test files under `backend/tests/`, plus agent tests. ~106+ passing.

---

## Functional Requirements

### Already Satisfied (No Work Required)

- **FR-0 (Feature 1 — Case Management)**: Create Case, Assign Investigator, Case Number auto-gen, Evidence List, Operation History (Linked Operations), Case Status (OPEN/IN_PROGRESS/UNDER_REVIEW/CLOSED). — CODE ALREADY EXISTS; only need a timeline sub-feature (see FR-8).

### Net-New Features

- **FR-1 (Feature 2 — Dashboard-Driven Orchestration / Task Queue Foundation)**:
  Backend exposes new `/api/v1/jobs` endpoints to create a job. A job references an operation type + module-specific payload + optional case_id + optional device_id. Agents gain an OPTIONAL `--job-id` flag; when present the agent polls `/api/v1/jobs/{id}/claim` and PATCHes `/api/v1/jobs/{id}` with progress. Dashboard shows job creation form, queue status, and job detail views. Existing `--target` / `--image` / `--targets` CLI flows work unchanged.

- **FR-2 (Feature 3 — Device Inventory)**:
  New `devices` table + `/api/v1/devices` API (list/create/GET/PATCH). Attributes: device_serial (unique), manufacturer, model, connection_type (USB/SATA/NVMe/PCIe), media_type (SSD/HDD/USB), capacity_bytes, health_status, status, last_operation_at, detected_at. Agents may optionally POST device detection snapshot before a job runs; manual entry also allowed. Devices are linkable to evidence items (optional FK from case_evidence_items.device_id).

- **FR-3 (Feature 4 — Task Queue)**:
  Jobs have a `TaskStatus` enum: PENDING, CLAIMED, RUNNING, COMPLETED, FAILED, CANCELLED. Retry counter + endpoint `POST /api/v1/jobs/{id}/retry` duplicates a failed job as a new PENDING job with same payload + parent_job_id FK. Queue dashboard tab with filter pills per status. `GET /api/v1/jobs?status=PENDING&limit=50` for worker agents polling.

- **FR-4 (Feature 5 — Real-time Progress via WebSocket / SSE)**:
  FastAPI WebSocket endpoint `WS /api/v1/ws/jobs/{job_id}` and `WS /api/v1/ws/user/{user_id}`. Job events (QUEUED, RUNNING, PROGRESS {percent, stage, message}, COMPLETED, FAILED, CERT_ISSUED) broadcast to any client subscribed to that job_id or the user's own stream. Frontend uses React `useEffect` WebSocket hook with reconnect. Polling fallback for clients that can't upgrade.

- **FR-5 (Feature 6 — RBAC)**:
  Add role column to `users` table (enum: ADMINISTRATOR, INVESTIGATOR, AUDITOR, SUPERVISOR). New dependency `require_roles(*roles)` in deps. Permissions matrix enforced at endpoint level:
  - ADMINISTRATOR: all endpoints + user management + settings + system logs
  - INVESTIGATOR: submit operations, create cases, manage own case evidence/jobs
  - AUDITOR: read-only on operations/cases/reports, can download, no writes
  - SUPERVISOR: INVESTIGATOR + case status changes, assign investigators, approve case close
  Existing `get_current_user()` remains unchanged (returns any logged-in user). Role checks are ADDITIONAL decorators/deps applied only to new endpoints and select existing endpoints where needed (e.g., new `/api/v1/users` admin-only).

- **FR-6 (Feature 7 — Notification Center)**:
  `notifications` table: id, user_id (nullable = broadcast), type (CERT_GENERATED, RECOVERY_DONE, TAMPER_DETECTED, DEVICE_CONNECTED, DEVICE_REMOVED, JOB_FAILED, ROLE_CHANGED), title, message, payload JSON, read_at, created_at. POST from backend services when events occur (e.g., right after `submit_operation_report` returns success → enqueue CERT_GENERATED to operator + case investigators). GET `/api/v1/notifications?unread_only=true`, PATCH `/api/v1/notifications/{id}/read`. Frontend bell icon in AppShell header with unread badge, click opens tray with list + mark-all-read button.

- **FR-7 (Feature 8 — Investigation Timeline)**:
  `timeline_events` table: id, case_id FK, event_type (DEVICE_CONNECTED, RECOVERY_STARTED, FILES_RECOVERED, VERIFICATION, DRIVE_ERASED, CERT_GENERATED, EVIDENCE_ADDED, INVESTIGATOR_ASSIGNED, STATUS_CHANGED, NOTE), event_at, actor_email, description, metadata JSON, operation_record_id (nullable FK). Created automatically by hooks on existing endpoints (e.g., after `assign_investigator`, after `link_case_operation`, after case status change). Case detail page renders a vertical chronological timeline with icons per event type.

- **FR-8 (Feature 9 — Analytics Dashboard)**:
  GET `/api/v1/analytics/summary` returns aggregate metrics from operation_records + cases + devices + jobs: recovered_files_count, recovered_data_size_bytes, operations_today_count, devices_total, success_rate_pct, failure_rate_pct, storage_sanitized_bytes, top_investigators_by_ops[{email, count}]. GET `/api/v1/analytics/timeseries?metric=operations&range=30d` returns daily buckets for charting. Dashboard homepage shows 8 stat cards + line chart (use pure SVG + Tailwind; no new chart deps).

- **FR-9 (Feature 10 — Advanced Search)**:
  GET `/api/v1/search?q=...&types=certificate,case,device,operation,officer&from=YYYY-MM-DD&to=YYYY-MM-DD&hash=...` with `types` as multi-query-param. Searches certificate_id, case_number, device_serial, operator_email, report_hash, free-text in title/description. Returns paginated union of typed results with a discriminator `result_type`. Frontend adds a global search bar in the AppShell top nav with type filter dropdown + date range.

- **FR-10 (Feature 11 — Evidence Explorer)**:
  Extend existing `case_evidence_items.details` JSON schema for RECOVERY-linked evidence to include a `recovered_files[]` array mirroring what the recovery engine reports. GET `/api/v1/evidence/{evidence_id}/files?type=image|video|document|archive` (reuses the details JSON — no new table). Evidence Explorer UI tab on case detail, grouped by type, with columns: filename, size, sha256, confidence, metadata, and preview (images render thumbnails via data-uri placeholder; docs/archives show icons). Previews are renderable fallbacks, not full file content (avoids storing binary blobs in DB).

- **FR-11 (Feature 12 — Hash Chain Visualization)**:
  GET `/api/v1/ledger/chain?from_seq=1&to_seq=100` returns ledger entries with operation_type, certificate_id, report_hash, previous_hash, entry_hash, operation preview fields. Interactive timeline UI: each block shows op type badge + sequence + hash truncated, click expands to show full hashes + verify-button that rechecks that block's chain integrity. Scroll/navigate via arrow buttons or by seq number.

- **FR-12 (Feature 13 — Report Center)**:
  New page `/dashboard/reports` with 4 tabs: Certificates, Recovery Reports, Audit Reports, Monthly Reports. Each tab has filter controls + download buttons (PDF via existing pdf_service extended to handle lists; CSV via same pattern as dashboard export already does). GET `/api/v1/reports/certificates?from=&to=&operator=&success=` → list + pagination. GET `/api/v1/reports/certificates/{id}/pdf` redirects to existing `/operations/{id}/pdf` for single cert; bulk cert zip generated server-side on-demand.

- **FR-13 (Feature 14 — Settings)**:
  `settings` table with singleton row (setting_key PK → setting_value JSON) plus a typed backend `AppSettings` service that reads from DB (cached) and falls back to env vars. Settings page `/dashboard/settings` with sections:
  - Organization (name, logo_url placeholder, address)
  - Department (name, code)
  - Certificate Template (header_text, footer_text, compliance_statement — extend pdf_service to read these during render if present)
  - Overwrite Passes (default 3, per NIST SP 800-88 Rev 1) — affects the default drives agents recommend, not hard-coded behavior
  - Hash Algorithm Display (SHA-256 fixed; informational, since trust layer is immutable)
  - Dark Mode / Government Light Theme toggle — persisted in localStorage (client-side only for the UI)
  Endpoints: GET/PATCH `/api/v1/settings`, protected by `require_roles(ADMINISTRATOR)`.

- **FR-14 (Feature 15 — System Logs)**:
  `system_logs` table: id, level (DEBUG/INFO/WARN/ERROR/SECURITY), category (LIVE/DEVICE/BACKEND/SECURITY), message, details JSON, source, created_at. Backend adds a structured logger (`app/core/logging.py` using stdlib logging + JSON formatter) that writes BOTH stdout + inserts to this table via an async queue/background task (buffered, never blocks request path; uses `asyncio.create_task` + a size-limited buffer). Page `/dashboard/logs` has 4 tabs matching categories, auto-refresh toggle (live tab every 2s via SSE fallback WS `/api/v1/ws/logs`). Protected ADMINISTRATOR + AUDITOR + SUPERVISOR.

- **FR-15 (Feature 16 — Government Style UI Theme)**:
  New Tailwind `govt-blue` palette + `GovtShell` component variant OR extend AppShell with a theme context. Colors: Primary `#003366` (NIC-style deep blue), Secondary `#005BAC`, Accent `#D4AF37` (govt gold, replaces amber as the option), Success `#2E7D32`, Alert `#C62828`, Text `#212121`, Background `#F5F7FA`, Panel `#FFFFFF`, Line `#D9DDE3`. No glassmorphism, no neon, no flashy animations. Max 1 transition (<= 150ms) on hover only. Typography: Inter/System stack. Existing dark theme preserved and selectable via Settings Dark Mode toggle. AppShell, tables, buttons, forms, badges all get a `.govt` class or context swap.

- **FR-16 (Feature 17 — Landing Page)**:
  New route `/` (currently redirects to login/dashboard) becomes a public, unauthenticated Landing Page. Sections:
  1. Hero: Govt of India styled header, "ForensicGuard — Integrated Secure Data Erasure & Advanced File Recovery", sub "NIST SP 800-88 Compliant | Developed for NTRO". CTA buttons Sign In → `/login`, Learn More → `#features`.
  2. Features grid: 6 cards (Secure Drive Erasure, File/Folder Erasure, Forensic Recovery, Tamper-Proof Ledger, Case Management, PDF Certificates) with icons (unicode/svg inline, no icon lib).
  3. Architecture diagram: simple 3-row SVG (Agents → API Core + Trust Layer → PostgreSQL + Reports) with labels.
  4. Security Standards badges: NIST SP 800-88 Rev 1, ECDSA P-256, SHA-256 Hash Chain, JWT Auth, GDPR-aligned.
  5. Statistics: 4 counters placeholder (0+ Operations, 0+ Devices, 0 Cases, 99.9% Chain Verification) — values wired from new public `/api/v1/public/stats` endpoint.
  6. Workflow: 6-step horizontal flow (Detect → Acquire → Analyze → Recover → Sanitize → Certify).
  7. FAQ: 6 Q&A expandable sections (accordion).
  8. Contact: NTRO contact info block + form (display-only, no backend POST).
  9. Footer: Project credits, "Built for SIH 2026 Grand Finale", links to /verify (Certificate Lookup) and GitHub (if any).

- **FR-17 (Backward Compatibility — Meta)**:
  Every pre-existing pydantic schema field ordering preserved. Every pre-existing endpoint status code + response JSON shape unchanged when called with pre-existing parameter sets. Existing 106+ tests pass WITHOUT modification. Existing agents run against the new backend with zero CLI arg changes and produce identical operator-overridden certificate records, identical ledger positions, identical verification results.

---

## Non-Functional Requirements

- **NFR-1 (Security)**: Every new write endpoint is protected by auth + role checks. Role column is non-null default INVESTIGATOR. No new endpoint takes user-provided filenames that reach filesystem paths unsanitized. All new `details` JSON columns are treated as untrusted (never eval'd, never connected to DB dynamic SQL; ORM binds only). WebSocket connections require the same Bearer JWT via query param or `Sec-WebSocket-Protocol` (check signature before accepting).
- **NFR-2 (Scalability)**: New tables use indexed columns on every foreign key + every frequently queried enum/status field (jobs.status, jobs.operation_type, notifications.user_id, system_logs.level, system_logs.category, devices.serial unique, timeline_events.case_id + event_at). Analytics queries use `func.count()` / `func.sum()` SQL-side, never Python-side list iterates. Pagination: list endpoints accept `limit`/`offset` (max limit 100).
- **NFR-3 (Performance)**: WebSocket broadcasts don't block request handlers (use `asyncio.create_task` and a manager singleton with per-channel subscriber sets). System log writes use async buffered batched insert every 1s or N=50 entries, whichever first.
- **NFR-4 (Reliability)**: Polling fallback for WS, notification in-app tray is source-of-truth not WS-only. Retry endpoint clones job payload immutably. Job claim endpoint uses transaction + row-lock pattern (`select ... for update skip locked`) to prevent double-claim under concurrent workers (even with SQLite fallback using advisory-locks-adjacent pattern).
- **NFR-5 (Accessibility / UI)**: Government theme meets WCAG 2.1 AA contrast ratios. Text never below 12px. All interactive elements have focus-visible styles.
- **NFR-6 (Typing & Lint)**: 100% of new backend pydantic schemas and function signatures fully typed. 100% of new frontend TypeScript TSX/TS files strict typed. `// @ts-nocheck` never added.

---

## Constraints

### Technical (Hard Constraints — No Exceptions)

1. **NO EXISTING API CHANGES**: Existing response shapes of `/api/v1/auth/*`, `/api/v1/cases/*`, `/api/v1/operations/*`, `/api/v1/verify/*` are immutable. Only ADD new endpoints, ADD new optional query params with defaults, ADD new optional fields to response JSON (never remove, never rename, never change type of existing field).
2. **NO CRYPTO CHANGES**: `OperationRecord.to_signable_dict()`, `sign_payload`, `verify_signature`, `LedgerEntry` hash math, `GENESIS_HASH` — all completely frozen. If a new `OperationType` enum value is needed for task queue events, those events do NOT go into `operation_records`/`ledger_entries`; they live in their own tables.
3. **NO EXISTING MODEL COLUMN CHANGES**: No column removal, rename, type-change on `users`, `operation_records`, `ledger_entries`, `cases`, `case_investigators`, `case_evidence_items`, `case_operation_links`. Adding NEW nullable columns with defaults is permitted only if strictly required (e.g., `users.role`).
4. **NO CLI AGENT LOGIC CHANGES**: `wiper.wipe()`, `run_batch()`, `run_recovery()`, detector classes, report builders — unchanged. Only new optional flags/functions that coexist.
5. **NO STACK CHANGES**: Keep FastAPI, SQLAlchemy Async, PostgreSQL, JWT (python-jose + passlib), Next.js 14, TypeScript, Tailwind, reportlab, qrcode. New backend libraries permitted ONLY: `websockets` support ships with FastAPI natively (no new dep). `uvicorn` already provides. Any new dep MUST be listed with reasoning.

### Business Constraints

6. **Government NTRO Aesthetic Mandate**: Government UI theme = deep blue primary, white, slate grey, gold accent. No gradients, no blur, no glass, no neon, no AI-avatar imagery.
7. **Production Readiness**: SOLID, Clean Architecture (Routers → Services → Repos implicit via existing pattern), reusable components, error handling, logging.
8. **All 106+ Existing Tests Pass**: No modification to existing test files to make them pass. If a new feature would break, refactor the new feature's integration point instead.

### Dependencies

9. Backend requirements already include `alembic` (1.13), `sqlalchemy` (2.0). No new heavy DB dependencies.
10. Frontend package.json has no chart lib / UI lib; build charts from SVG + Tailwind. Avoid `recharts`, `chakra`, `mui`, etc.

---

## Assumptions

1. `init_models()` via `Base.metadata.create_all` is acceptable for dev / SIH demo environment; the spec also defines hand-written Alembic `upgrade`/`downgrade` stubs in a new `backend/alembic/versions/` folder as OPTIONAL deliverable docs, but primary table creation still works via the existing lifespan callback.
2. Agents already have access to the backend URL + credentials. The new job-polling flow is OPT-IN via `--job-id` and/or a separate `python -m src.worker --api-url --email --password` runner per agent; existing main.py stays intact.
3. For real-time progress, existing CLI agents won't be retrofitted with granular stage callbacks (that would be modifying module logic, forbidden). Instead, job records have `progress_percent int (0-100)`, `stage str`, `message str` fields, and the backend advances them via: (a) claim → 0%, QUEUED → RUNNING; (b) the agent can optionally call PATCH `/jobs/{id}/progress` at 25/50/75% after its major internal phases (added as OPTIONAL new api_client methods, not modifying core run flow); (c) upon successful operation submission, backend auto-sets 100% + CERT_ISSUED.
4. Evidence Explorer "preview" for images/videos is a placeholder icon + metadata display (since storing recovered file binary content in DB would require a blob/store subsystem not yet present and would violate "keep scope manageable"). If users want real previews, the evidence_reference can point to a file:// or network path and the UI renders as a link.
5. Landing page statistics are non-sensitive aggregates → public endpoint; no auth.
6. Dark mode toggle (Settings) toggles between the existing ink/dark theme and new government light theme. Default for NEW users: government light theme (landing page also uses light theme).

---

## Acceptance Criteria

### AC-0 — Case Management Already Functional (Baseline Confirmation)
- **Type**: `rule`
- **Given**: Backend is running with empty DB; frontend points to backend
- **When**: Register user → login → POST `/api/v1/cases` {title, description} → GET `/api/v1/cases/{id}` → POST assign → POST evidence → POST link operation (create one via recovery safe run) → PATCH status
- **Then**: Every existing case endpoint returns 2xx, the case object reflects investigators/evidence/linked_ops/status, and `test_cases_api.py` + all other pre-existing backend tests pass with 0 modifications
- **Pass Condition**: `pytest backend/tests/ -v` → 100% pass, no test files edited (verify via `git diff --name-only backend/tests/` = empty or only newly added test files)
- **Evidence**: pytest output capture; `git status` showing no edits to existing test files

---

### AC-1 — RBAC Roles & Permission Enforcement
- **Type**: `rule`
- **Given**: 4 users created with 4 distinct roles (ADMINISTRATOR, INVESTIGATOR, AUDITOR, SUPERVISOR); a protected admin-only endpoint exists (e.g., `GET /api/v1/users`)
- **When**: AUDITOR token calls GET /api/v1/users; ADMINISTRATOR token calls same; INVESTIGATOR calls GET /api/v1/settings (admin); SUPERVISOR tries to close a case
- **Then**: AUDITOR receives 403; ADMINISTRATOR receives 2xx + list of users; INVESTIGATOR 403 on settings; SUPERVISOR 2xx on case close
- **Pass Condition**: A pytest test (`test_rbac.py`) reproduces each case and asserts status codes; all pass
- **Evidence**: New `test_rbac.py` output; manual curl recordings (optional)

---

### AC-2 — Job Queue Lifecycle (Dashboard-Driven Orchestration)
- **Type**: `rule`
- **Given**: Backend running; investigator login token; a device in inventory; a case
- **When**: POST `/api/v1/jobs` {operation_type: "DRIVE_ERASE", payload: {...}, case_id, device_id} → GET `/api/v1/jobs?status=PENDING` → worker claims via POST `/api/v1/jobs/{id}/claim` → PATCH `/api/v1/jobs/{id}/progress` {percent:50, stage:"Wiping", message:"Pass 2 of 3"} → worker completes by POSTing to existing `/api/v1/operations` (as before) → then POSTs `/api/v1/jobs/{id}/complete` {certificate_id, success: true}
- **Then**: Job.status transitions PENDING → CLAIMED → RUNNING → COMPLETED; progress_percent becomes 50 then 100; linked certificate_id stored on job; GET `/api/v1/jobs/{id}` returns full history of transitions. Retry on a FAILED job clones payload into a NEW job row with status=PENDING and parent_job_id set.
- **Pass Condition**: New `test_jobs_api.py` covers lifecycle + retry; all pass
- **Evidence**: Test output

---

### AC-3 — Device Inventory CRUD + Detection Hook
- **Type**: `rule`
- **Given**: Empty devices table, auth token
- **When**: POST device {serial, manufacturer, model, connection_type:"USB", media_type:"SSD", capacity_bytes:512e9, health_status:"GOOD"} → GET list → GET by id → PATCH status=IN_USE → list filter connection_type=USB
- **Then**: All return 2xx; list with filter returns only USB rows; GET by id returns JSON matching spec schema; evidence item can be created with optional device_id FK without error
- **Pass Condition**: `test_devices_api.py` passes
- **Evidence**: Test output

---

### AC-4 — Real-time Progress WebSocket + Fallback
- **Type**: `rule`
- **Given**: Running backend, authenticated client, a job in RUNNING state
- **When**: Client opens `WS /api/v1/ws/jobs/{job_id}` with a valid JWT; backend emits PROGRESS event (simulated via test helper endpoint that triggers manager broadcast); backend emits COMPLETED
- **Then**: WS client receives both events with correct JSON schema {type, job_id, percent, stage, message, ts}; an HTTP-polling client calling GET `/api/v1/jobs/{id}` 1 second later sees matching progress_percent/stage fields
- **Pass Condition**: `test_websocket_progress.py` (httpx AsyncClient ws) passes; or if test harness complexity is too high, a manual documented test is acceptable as long as the client hook works in browser
- **Evidence**: Test output or browser screenshot of console events

---

### AC-5 — Notifications Center Triggered by Real Events
- **Type**: `rule`
- **Given**: Investigator user logged in; an operation report POSTed via existing `/api/v1/operations`
- **When**: The post-commit hook (service layer) fires
- **Then**: A CERT_GENERATED notification is created with user_id set to the authenticated operator; GET `/api/v1/notifications?unread_only=true` returns 1 row; PATCH `/api/v1/notifications/{id}/read` sets read_at; a second operator user does NOT see this notification (it's scoped to operator user_id). TAMPER_DETECTED notification is created when `verify_operation` returns overall_verified=false (hook added to verify endpoint on non-verified results).
- **Pass Condition**: `test_notifications.py` passes
- **Evidence**: Test output

---

### AC-6 — Investigation Timeline Auto-Created on Case Events
- **Type**: `rule`
- **Given**: A case exists
- **When**: Assign investigator → add evidence → link operation → change status → manual POST timeline note
- **Then**: timeline_events table contains exactly 4 rows (ASSIGNED, EVIDENCE_ADDED, OPERATION_LINKED, STATUS_CHANGED, NOTE) = 5; GET `/api/v1/cases/{id}/timeline` returns events ordered by event_at ASC; frontend renders 5 vertical nodes correctly
- **Pass Condition**: `test_case_timeline.py` passes; rendered DOM snapshot contains correct count
- **Evidence**: Test output + screenshot

---

### AC-7 — Analytics Summary + Top Investigators
- **Type**: `rule`
- **Given**: 2 operation records, 3 cases, 2 devices, 1 failed job
- **When**: GET `/api/v1/analytics/summary`
- **Then**: JSON includes `operations_today_count >= 2`, `success_rate_pct` = (success/(success+failed))*100, `top_investigators_by_ops` is an array sorted by count DESC, `storage_sanitized_bytes >= 0`
- **Pass Condition**: `test_analytics_api.py` passes with deterministic seed data
- **Evidence**: Test output

---

### AC-8 — Advanced Search Returns Typed Results
- **Type**: `rule`
- **Given**: A case with known case_number, an operation with known certificate_id and operator_email containing "ntro.gov.in", a device with known serial, all created today
- **When**: GET `/api/v1/search?q=FG-2026` + `?types=case`; GET `?q=ntro.gov.in&types=operation`; GET `?hash=<report_hash>&types=operation`; GET `?from=<today>&to=<today>&types=certificate`
- **Then**: Each search returns a list of `{result_type, id, title, subtitle, match_field, created_at}` with expected discriminators; pagination works
- **Pass Condition**: `test_search_api.py` passes
- **Evidence**: Test output

---

### AC-9 — Evidence Explorer Lists Recovered Files by Category
- **Type**: `rule`
- **Given**: A case with evidence_item whose details.files array contains 2 PNGs, 1 MP4, 2 PDFs, 1 ZIP
- **When**: GET `/api/v1/evidence/{id}/files?type=image` → `?type=video` → `?type=document` → `?type=archive`
- **Then**: Response counts are 2/1/2/1 respectively; each entry has {filename, size, sha256, confidence, metadata}
- **Pass Condition**: `test_evidence_explorer_api.py` passes; UI renders category tabs with counts
- **Evidence**: Test output + screenshot

---

### AC-10 — Hash Chain Visualization Recheck
- **Type**: `rule`
- **Given**: 3 sequential ledger entries exist from 3 successful operations
- **When**: GET `/api/v1/ledger/chain?from_seq=1&to_seq=3` → frontend renders blocks → user clicks block 2 → UI calls client-side (or server helper) integrity check for block 2
- **Then**: Response JSON has 3 entries in order, each with report_hash, previous_hash, entry_hash, sequence_number; the chain validates when recomputed in-browser from returned hashes (logic matches `verify_chain_integrity` algorithm); UI visually flags if invalid
- **Pass Condition**: `test_ledger_chain_api.py` passes; browser screenshot shows 3 blocks with verified icon
- **Evidence**: Test output + screenshot

---

### AC-11 — Report Center Downloads CSV + PDF Single
- **Type**: `rule`
- **Given**: 5 operation records across 2 months, 3 investigators
- **When**: Filter report center by operator, date range, success=true → click CSV download → click single cert PDF download
- **Then**: CSV rows count matches filter set; PDF opens and is byte-for-byte identical to existing `/operations/{id}/pdf` for single cert
- **Pass Condition**: Integration test checks Content-Type headers for downloads; manual QA verifies content
- **Evidence**: Test output + downloaded files sample

---

### AC-12 — Settings Persist & Affect PDF
- **Type**: `rule`
- **Given**: Admin user; default settings row
- **When**: PATCH `/api/v1/settings` {organization_name: "NTRO", department: "Cyber Security", certificate_header_text: "GOVERNMENT OF INDIA / NTRO CERTIFIED"} → GET settings → generate a certificate PDF
- **Then**: GET returns stored values; new rendered PDF has the custom header text instead of the default (pdf_service consults settings service with graceful fallback to old default if DB setting missing)
- **Pass Condition**: `test_settings_api.py` + updated `test_pdf_service.py` extension (new tests only; existing PDF tests unchanged since they use defaults)
- **Evidence**: Test output + sample PDF screenshot

---

### AC-13 — System Logs Buffered Without Blocking
- **Type**: `rule`
- **Given**: Backend with logging framework initialized; 200 rapid requests to a lightweight endpoint that logs each hit at INFO level
- **When**: All requests return 2xx; wait 2s after last request
- **Then**: system_logs table has 200 rows (or near; allow tolerance if buffer flushes scheduled per N seconds); no request's p95 latency increased by more than 2ms vs same endpoint with logging disabled (measured in test); SECURITY category events show for failed login attempts
- **Pass Condition**: `test_system_logs.py` passes
- **Evidence**: Test output

---

### AC-14 — Government UI Theme Applied & Contrast Passes
- **Type**: `rubric`
- **Dimension**: Government aesthetic fidelity + accessibility
- **Scale**: 1-5
- **Anchors**:
  - 1 = still looks like old ink dark theme, no blue-white-grey palette
  - 3 = palette applied but layout unchanged; minor contrast defects
  - 5 = Every major page (login, dashboard, cases, jobs, reports, settings, logs, verify) uses deep-blue header/nav, white panel, grey borders, gold accents; no neon/glow/gradient/glass; primary and text WCAG 2.1 AA contrast verified via browser devtools (4.5:1 minimum on all text); all buttons/forms/badges restyled; no flashy transitions
- **Pass Threshold**: >= 4
- **Evidence**: Full-page PNG screenshots of every page in government theme; devtools contrast audit log for representative text/background pairs

---

### AC-15 — Landing Page Sections Complete
- **Type**: `rule`
- **Given**: Running frontend, user NOT logged in
- **When**: Visit `/`
- **Then**: All 9 sections (Hero, Features, Architecture, Security, Statistics, Workflow, FAQ, Contact, Footer) rendered in DOM; Sign In button navigates to `/login`; Certificate Lookup shortcut input navigates to `/verify/{id}` on submit with a typed id; Statistics values come from `/api/v1/public/stats`
- **Pass Condition**: Screenshot of full page; navigation clicks working; `/api/v1/public/stats` returns correct aggregate counts
- **Evidence**: Screenshot + Network tab showing public/stats call

---

### AC-16 — 100% Backward Compatibility — All Existing Tests Pass
- **Type**: `rule`
- **Given**: Full codebase with all new features merged; clean SQLite test DB initialized by `conftest.py`
- **When**: `cd backend && pytest -v` + each agent's pytest suite `cd drive-eraser-agent && pytest -v` etc.
- **Then**: Every test that passed BEFORE still passes; NO existing test file modified; total pass count >= 106
- **Pass Condition**: All 4 pytest runs report 100% pass, no files in `**/tests/**` show git modification (new files are fine)
- **Evidence**: Full pytest console captures for all four projects; `git diff --stat` showing zero edits to existing test files

---

### AC-17 — Zero Breaking API Shape Changes
- **Type**: `rubric`
- **Dimension**: Backward compatibility discipline
- **Scale**: 1-5
- **Anchors**:
  - 1 = multiple existing route response shapes changed; existing frontend types.ts breaks without updates
  - 3 = mostly additive; 1 minor rename slipped requiring types.ts patching
  - 5 = Every existing endpoint response JSON shape byte-identical for the documented fields; existing frontend runs unchanged against new backend (types.ts additions are fine but no edits to existing type members); every pydantic Out schema in schemas/operation.py, auth.py, case.py unmodified except new optional fields appended
- **Pass Threshold**: >= 5 (must be perfect — this is a hard constraint graded as rubric because perfection is the standard)
- **Evidence**: `git diff` of `backend/app/schemas/*.py` + `backend/app/api/v1/*.py` shows only additions, no modifications of existing field names or return statement shapes

---

## Open Questions

- [ ] **Q1 (Low Risk)**: Landing page /api/v1/public/stats — should this have a very small cached TTL (10s) or be uncached? → Default plan: uncached, SQL aggregates each call; if page perf shows issues, add in-process 10s TTL dict cache.
- [ ] **Q2 (Medium)**: WS auth mechanism — query-param `?token=` (simple but token in URL = appears in logs / referer) vs `Sec-WebSocket-Protocol: <scheme> <token>` header (cleaner, more privacy). → Default plan: support BOTH with priority to header.
- [ ] **Q3 (Low)**: Evidence Explorer recovered files storage — store only metadata now (no file content) or also add a `recovered_files` table with a BLOB column? → Default: metadata-only (per FR-10).
- [ ] **Q4 (Low)**: Notifications — should AUDITOR users also receive TAMPER_DETECTED broadcast? → Default: YES, broadcast notifications (user_id=NULL) are sent to all ADMIN + AUDITOR + SUPERVISOR, rendered as "System Announcements" in the tray.

Answering these is NOT a prerequisite for implementation; defaults baked in, can be adjusted before final.
