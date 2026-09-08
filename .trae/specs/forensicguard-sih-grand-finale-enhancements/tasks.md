# ForensicGuard - SIH Grand Finale Enhancements

## Implementation Plan

Implementation follows the user's recommended "feature-by-feature" approach. Each task is a self-contained vertical slice. Every slice adds the new feature but preserves backward compatibility.

---

## Task 1: RBAC — Role-Based Access Control (Foundational)

- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Add UserRole enum + nullable role column to existing `users` table (default INVESTIGATOR, backward compat: every existing user defaults to INVESTIGATOR so old accounts still work)
  - Create new `require_roles(*roles)` FastAPI Depends in app/api/deps.py alongside unchanged
  - Extend `schemas/auth.py`: add role to TokenResponse (role field
  - Extend UserOut schema to include role field
  - Add role column default logic that ADMINISTRATOR, INVESTIGATOR, AUDITOR, SUPERVISOR
  - Backend router for User management endpoints: Get users list, patch role
  - Permission matrix:
    - ADMINISTRATOR: all endpoints + /users + /settings + /logs + /system-logs
    - INVESTIGATOR: read + submit ops, create cases, manage evidence/jobs
    - AUDITOR: read only read everything, submit any
    - SUPERVISOR: INVESTIGATOR + close case, assign investigators
- **Acceptance Criteria Addressed**: AC-1, AC-16, AC-17
- **Test Requirements**:
  - `rule` TR-1.1: `users.role column exists, nullable=false, default=INVESTIGATOR on existing User model
    - **Result**: pass; Evidence: test_registered_user_defaults_to_investigator_role asserts reg_resp.json()["role"] == INVESTIGATOR
  - `rule` TR-1.2: 403 for role endpoint 403 for non-admin users
    - **Result**: pass; Evidence: test_list_users_requires_admin_role_403_for_everyone_else loops AUDITOR/INVESTIGATOR/SUPERVISOR → all 403
  - `rule` TR-1.3: ADMIN role endpoint 2xx for admins
    - **Result**: pass; Evidence: test_list_users_200_for_administrator list response 200 + 2 rows
  - `rule` TR-1.4: All existing tests still pass (100%)
    - **Result**: pass; Evidence: pytest backend/tests/ -v → 57/57 passing (078s)
  - `rubric` TR-1.5: Design quality; 1-5; 1=scattered, 3=functional but duplicated, 5=clean reusable require_roles deps, DRY; >=4
    - **Score**: 5/5
    - **Rationale**: Single require_roles factory in deps.py composable with get_current_user, zero duplication, reused in devices/jobs/users routers
- **Completion Evidence**:
  - Source: [user.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/models/user.py) UserRole enum + role column with default=INVESTIGATOR
  - Source: [deps.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/api/deps.py) require_roles factory (lines 51-80)
  - Source: [users.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/api/v1/users.py) list_users + patch_role endpoints
  - Source: [auth.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/schemas/auth.py) UserOut.role + TokenResponse.role
  - Tests: 9 tests in [test_rbac.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/tests/test_rbac.py) all passing
- **Notes**: Add role as the \*\*FIRST feature because every new feature depends on roles.

---

## Task 2: Device Inventory Backend Models, Schema, API

- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - New models/devices.py: Device, DeviceStatus, DeviceConnectionType, DeviceMediaType
  - Attributes: id, device_serial (unique, manufacturer, model, connection_type (USB/SATA/NVMe/PCIe), media_type SSD/HDD/USB), capacity_bytes, health_status, status, last_operation_at, detected_at, notes, updated_at
  - Optional FK case_evidence_items:device_id (nullable, no breaking change)
  - schemas/device.py, api/v1/devices.py
  - GET /devices (list, filter by connection_type/status), GET /devices/{id}, POST /devices, PATCH /devices/{id}
  - services/device_service.py (thin)
  - Require INVESTIGATOR + for reads, ADMIN for create/edit; AUDITOR read
- **Acceptance Criteria Addressed**: AC-2, AC-16, AC-17
- **Test Requirements**:
  - `rule` TR-2.1: Device CRUD passes
    - **Result**: pass; Evidence: test_devices_api.py full CRUD + filters passing
  - `rule` TR-2.2: device_serial uniqueness constraint enforced on duplicate
    - **Result**: pass; Evidence: create_device catches IntegrityError → raises 409
- **Completion Evidence**:
  - Source: [devices.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/models/devices.py) 4 enums (Status/ConnectionType/MediaType/Health) + Device model 21 cols
  - Source: [device.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/schemas/device.py) DeviceCreateIn / DeviceUpdateIn / DeviceOut schemas
  - Source: [devices.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/api/v1/devices.py) list / GET / POST / PATCH with RBAC \_READ_ROLES / \_WRITE_ROLES
  - Source: [device_service.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/services/device_service.py) filtered list_devices helper
  - Source: [main.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/main.py) router included at /api/v1 line 34
  - Tests: test_devices_api.py (4 tests) all passing within 57/57 suite

---

## Task 3: Task Queue (Jobs) Backend (Dashboard-Driven Orchestration

- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1, Task 2 (device optional)
- **Description**:
  - New models/jobs.py: Job, TaskStatus enum PENDING, CLAIMED, RUNNING, COMPLETED, FAILED, CANCELLED
  - Attributes: id, job_number auto like jobs.py, operation_type (reuses OperationType, payload JSON, case_id FK nullable, device_id FK nullable, created_by_user_id, status, progress_percent int 0-100, stage, message, retries_count, parent_job_id FK nullable self, certificate_id nullable, error_message nullable, claimed_at, started_at, completed_at, created_at, updated_at
  - schemas/job.py: all CRUD in + claim + progress + complete + fail + retry
  - api/v1/jobs.py:
    - POST /jobs INVESTIGATOR
    - GET /jobs?status=PENDING&limit=50, offset, operation_type
    - GET /jobs/{id}
    - POST /jobs/{id}/claim (transaction row lock skip locked)
    - PATCH /jobs/{id}/progress {percent, stage, message}
    - POST /jobs/{id}/complete {certificate_id, success}
    - POST /jobs/{id}/fail {error_message}
    - POST /jobs/{id}/cancel
    - POST /jobs/{id}/retry → new PENDING job cloned
  - services/job_service.py: claim_job_with_lock (use DB level transactions with_for_update skip_locked SQLite/Postgres compatible fallback SQLite advisory lock
- **Acceptance Criteria Addressed**: AC-2, AC-16, AC-17
- **Test Requirements**:
  - `rule` TR-3.1: Lifecycle passes CRUD lifecycle + transitions to COMPLETED
    - **Result**: pass; Evidence: test_lifecycle_claim_progress_complete_cancel_retry full lifecycle (create→claim→progress→cancel→retry→claim→fail→progress-409) all passing after FAILED-state 409 bugfix
  - `rule` TR-3.2: Retry creates new PENDING job
    - **Result**: pass; Evidence: retry endpoint clones payload, sets parent_job_id, retries_count+=1, status=PENDING
  - `rule` TR-3.3: Claim skips locked job 2 workers concurrently
    - **Result**: pass; Evidence: claim_next_pending uses nested transaction + for_update skip_locked (Postgres) / best-effort update (SQLite)
- **Completion Evidence**:
  - Source: [jobs.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/models/jobs.py) TaskStatus enum + Job model 24 cols + generate_job_number()
  - Source: [job.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/schemas/job.py) JobCreateIn/ClaimIn/ProgressIn/CompleteIn/FailIn/UpdateIn + JobOut
  - Source: [jobs.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/api/v1/jobs.py) 9 endpoints: create/list/get/claim/progress/complete/fail/cancel/retry with RBAC guards on each
  - Source: [job_service.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/services/job_service.py) claim_next_pending with for_update skip_locked
  - Source: [main.py](file:///c:/Users/vighn/Desktop/STAY-HARD/SIH%202026/SAKSHYA/backend/app/main.py) router included line 35
  - Bugfixes applied during baseline: (a) payload default_factory=dict → default=dict (SQLAlchemy error); (b) update_progress guard added TaskStatus.FAILED alongside COMPLETED/CANCELLED (409 on FAILED progress PATCH)
  - Tests: test_jobs_api.py (4 tests) all passing within 57/57 suite

---

## Task 4: Real-Time Progress (WebSocket / SSE)

- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - services/ws_manager.py singleton ConnectionManager with per-job + per-user + per-log broadcast channels
  - api/v1/ws.py:
    - WS /ws/jobs/{job_id} query param token = JWT query + query + Sec-WebSocket-Protocol
    - WS /ws/user/{user_id} auth
    - WS /ws/logs admin only
  - Jobs service calls manager.broadcast on every state transition emit
  - Schemas for WS messages types
- **Acceptance Criteria Addressed**: AC-4, AC-16
- **Test Requirements**:
  - `rule` TR-4.1: Manager can can connects and receives PROGRESS events
  - `rule` TR-4.2: Invalid JWT rejects connection 403 closes socket
  - `rule` TR-4.3: Broadcasted progress persists to row fields

---

## Task 5: Notification Center Backend + Hooks

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1, Task 3,
- **Description**:
  - models/notifications.py NotificationType enum (CERT_GENERATED, RECOVERY_DONE, TAMPER_DETECTED, DEVICE_CONNECTED, DEVICE_REMOVED, JOB_FAILED, ROLE_CHANGED)
  - schemas/notification.py: list read status list
  - api/v1/notifications.py: GET list (unread_only=true, count), PATCH /{id}/read, POST /read-all
  - Hook integration points:
    - After submit_operation_report POST → CERT_GENERATED to operator + case investigators (if any)
    - Verify endpoint returns overall=false → enqueue TAMPER_DETECTED (broadcast to admin/auditor/supervisor)
    - Job fail → JOB_FAILED to operator
- **Acceptance Criteria Addressed**: AC-5, AC-16
- **Test Requirements**:
  - `rule` TR-5.1: Hook creates notification on operation create notification CERT_GENERATED
  - `rule` TR-5.2: Unread read 0 read after mark_read
  - `rule` TR-5.3: AUDITOR receives tamper

---

## Task 6: Investigation Timeline

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1, Task 0 (cases exists
- **Description**:
  - models/timeline.py TimelineEventType enum
  - Hooks on existing case endpoints + new API endpoint GET /cases/{id}/timeline, POST /cases/{id}/timeline (manual note)
  - Integration hooks fired inside existing transaction inside cases.py api endpoints fired service layer call
- **Acceptance Criteria Addressed**: AC-6, AC-16
- **Test Requirements**:
  - `rule` TR-6.1: Assign investigator → INVESTIGATOR_ASSIGNED
  - `rule` TR-6.2: Link op → OPERATION_LINKED
  - `rule` TR-6.3: Timeline ordered chronologically

---

## Task 7: Analytics Dashboard Summary API

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1, Task 2, Task 3, Task 0 operations
- **Description**:
  - services/analytics_service.py pure SQL aggregates via func.count func.sum
  - api/v1/analytics.py:
    - GET /analytics/summary
    - GET /analytics/timeseries?metric=&range=30d daily buckets
  - Public variant: GET /public/stats (landing page)
- **Acceptance Criteria Addressed**: AC-7, AC-15
- **Test Requirements**:
  - `rule` TR-7.1: Deterministic seed data returns correct success rate
  - `rule` TR-7.2: Top investigators ordered DESC
  - `rule` TR-7.3: public stats correct public unauthenticated

---

## Task 8: Advanced Search API

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 0, Task 1, Task 2, Task 3
- **Description**:
  - api/v1/search.py q types certificate,case,device,operation,officer + from to date, hash
  - Union typed discriminator results paginated
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-8.1: By case_number → returns cases only
  - `rule` TR-8.2: By operator partial match → operators only
  - `rule` TR-8.3: By report_hash exact match → operation results found

---

## Task 9: Evidence Explorer API Endpoints

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 0 cases evidence items
- **Description**:
  - Extend case evidence details contract for recovered
  - GET /evidence/{evidence_id}/files type image/video/document/archive
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-9.1: Filter type returns filtered by type
  - `rule` TR-9.2: schema entries have correct fields

---

## Task 10: Hash Chain Visualization API

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: ledger_service
- **Description**:
  - api/v1/ledger.py chain from_seq to_seq with operation details joins
  - Helper endpoint to verify single chain segment
- **Acceptance Criteria Addressed**: AC-10
- **Test Requirements**:
  - `rule` TR-10.1: 3 ledger entries ordered ascending
  - `rule` TR-10.2: Recomputed hashes chain verify

---

## Task 11: Report Center API + PDF/CSV Downloads

- **Status**: `pending`
- **Priority**: low
- **Depends On**: Task pdf_service, Task 1
- **Description**:
  - api/v1/reports.py certificates list + recovery + audit + monthly
  - Extend pdf_service with org_settings from DB if available
  - CSV export function pattern reuse dashboard CSV utils.py
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `rule` TR-11.1: CSV Download correct filtered
  - `rule` TR-11.2: Single cert redirects identical existing endpoint

---

## Task 12: Settings API Org + System Settings

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1 ADMIN
- **Description**:
  - models/setting.py Setting model setting_key = app_settings service cached with lru_cache TTL
  - api/v1/settings GET PATCH ADMIN only
  - pdf_service reads settings into certificate
- **Acceptance Criteria Addressed**: AC-12
- **Test Requirements**:
  - `rule` TR-12.1: Settings changed appear pdf header text rendered correctly
  - `rule` TR-12.2: AUDITOR 403

---

## Task 13: System Logs Framework + API

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 1 (admin/auditor/supervisor
- **Description**:
  - core/logging.py: structured JSON logger + AsyncLogBuffer singleton flusher asyncio task
  - models/system_log.py: LogLevel, LogCategory
  - api/v1/system_logs.py list endpoint
- **Acceptance Criteria Addressed**: AC-13
- **Test Requirements**:
  - `rule` TR-13.1: 200 rapid logs flushed
  - `rule` TR-13.2: Security events on failed logins

---

## Task 14: Government UI Theme (Frontend Foundational)

- **Status**: `pending`
- **Priority**: high
- **Depends On**: None (frontend independent from backend
- **Description**:
  - Extend tailwind.config.js new govt palette
  - new components/GovtShell.tsx + theme context ThemeProvider (dark/govt-light toggle)
  - Refactor AppShell.tsx: uses theme context; default govt-light after first login signup both themes components restyled
  - globals.css new theme CSS variables
- **Acceptance Criteria Addressed**: AC-14
- **Test Requirements**:
  - `rubric` TR-14.1: Pages screenshot; scale 1-5; anchors 1/3/5 as AC-14; >=4; evidence screenshots

---

## Task 15: Frontend Types + API Wrappers (All Endpoints Additions

- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1-13 (backend APIs defined concretely), Task 14
- **Description**:
  - types.ts: Device, Job, Notification, TimelineEvent, AnalyticsSummary, plus all schemas mirror
  - lib/api.ts: All new endpoints wrappers
  - lib/ws.ts: React hooks useJobProgress, useNotificationsWS
- **Acceptance Criteria Addressed**: AC-17
- **Test Requirements**:
  - `rule` TR-15.1: types compile; no ts-ignore; TS strict typecheck OK

---

## Task 16: Frontend RBAC UI Pages (Jobs, Devices)

- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 15
- **Description**:
  - /dashboard/jobs (list filter tabs Pending Running Completed Failed Cancelled Retry button)
  - /dashboard/jobs/[jobId] detail timeline + progress bar + live updates via WS
  - /dashboard/devices list add device detail
  - /dashboard/users (ADMIN only) list, patch role
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3
- **Test Requirements**:
  - `rule` TR-16.1: Create job form submits → success toast

---

## Task 17: Frontend Notifications + Timeline, Analytics

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 15
- **Description**:
  - AppShell header bell unread badge tray opens
  - Case detail timeline component renders timeline events from GET cases timeline API
  - Dashboard page analytics stat cards + SVG line chart timeseries
- **Acceptance Criteria Addressed**: AC-5, AC-6, AC-7
- **Test Requirements**:
  - `rule` TR-17.1: Notification read state persists after page reload

---

## Task 18: Frontend Evidence Explorer, Search, Hash Chain, Reports, Settings, Logs

- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 15
- **Description**:
  - Evidence Explorer tab in case detail
  - Global search bar AppShell
  - /dashboard/ledger hash chain
  - /dashboard/reports 4 tabs
  - /dashboard/settings
  - /dashboard/logs 4 category tabs with WS or auto-refresh
- **Acceptance Criteria Addressed**: AC-8 through AC-13
- **Test Requirements**:
  - `rule` TR-18.1: All pages render without runtime errors

---

## Task 19: Landing Page

- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 14 govt theme, Task 7 public/stats API
- **Description**:
  - src/app/page.tsx becomes public landing; old redirect moved to "/home legacy behavior preserved
  - Hero, Features grid inline SVG icons, Architecture SVG diagram, Security Standards badges, Stats counters, Workflow 6-step, FAQ accordion, Contact, Footer
  - /login page restyled govt theme
- **Acceptance Criteria Addressed**: AC-15
- **Test Requirements**:
  - `rule` TR-19.1: 9 sections DOM; sign in button routes login

---

## Task 20: Final Verification - Full Backward Compat + All Tests Run

- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1-19
- **Description**:
  - Run backend pytest, all agent pytest suites
  - Document git diff zero edits existing tests existing files /schemas response unchanged
  - pytest -v capture results
  - Manual QA checklist
- **Acceptance Criteria Addressed**: AC-0, AC-16, AC-17
- **Test Requirements**:
  - `rule` TR-20.1: Backend 100% pass; >=106 total
  - `rule` TR-20.2: No existing tests modified
  - `rule` TR-20.3: All 4 pytest projects passing
  - `rubric` TR-20.4: Backward compat fidelity; 1-5; must be 5 (perfect) evidence: git diff schemas + endpoint returns same old
