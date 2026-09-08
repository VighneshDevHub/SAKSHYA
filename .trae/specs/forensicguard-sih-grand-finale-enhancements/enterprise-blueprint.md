# ForensicGuard Enterprise Enhancement Blueprint

## Purpose

This document converts the SIH Grand Finale enhancement brief into an implementation blueprint that matches the current codebase. It preserves the existing FastAPI + Next.js + PostgreSQL architecture, keeps the cryptographic trust layer untouched, and focuses on additive enterprise features only.

## Current State Summary

- Backend status: Features 1 to 15 are largely implemented at API/service/model level.
- Frontend status: Government shell, theme foundation, notification tray, analytics dashboard home, and case pages exist; most enterprise pages are still pending.
- Agent status: Existing CLI workflows remain unchanged; dashboard-driven orchestration is ready on the backend but worker-side `job-id` / claim-progress integration is not yet present in agent repositories.
- Strategic gap: The project now needs frontend completion, operator workflows, and SIH demo polish more than backend redesign.

## Delivery Phases

1. Finish operator-facing frontend for jobs, devices, search, reports, settings, logs, ledger, and case enhancements.
2. Add optional worker/orchestrator support to CLI agents without changing current manual CLI flows.
3. Replace redirect home page with the public government landing page.
4. Run full regression across backend and all three agent repos.

---

## Feature 1: Case Management

1. Architecture: Keep existing case domain as the canonical investigation aggregate; extend the case detail UI with timeline, evidence explorer, certificates, and investigator workspace panels.
2. Folder Structure: Reuse `backend/app/models/case_management.py`, `backend/app/api/v1/cases.py`, `backend/app/services/case_service.py`, `frontend/src/app/dashboard/cases/`.
3. Files to Create: `frontend/src/components/cases/CaseTimeline.tsx`, `CaseEvidenceExplorer.tsx`, `CaseCertificatesTable.tsx`.
4. Files to Modify: `frontend/src/app/dashboard/cases/[caseId]/page.tsx`, optionally `frontend/src/lib/types.ts` only for view helpers.
5. API Changes: No new core case API required; consume existing `/api/v1/cases/*`, `/api/v1/cases/{id}/timeline`, `/api/v1/evidence/{id}/files`.
6. Database Changes: None required; existing case, investigator, evidence, link, and timeline tables are sufficient.
7. UI Components: Case overview card, investigator roster, evidence explorer tab, timeline rail, linked certificate table.
8. Backend Services: Continue using `case_service`; add only small formatter helpers if needed.
9. Security Considerations: Preserve current auth and role checks; ensure investigator assignment and case close remain role-restricted.
10. Scalability: Paginate linked operations and evidence lists if cases become large.
11. Testing Strategy: Add UI smoke coverage and keep existing `test_cases_api.py` and `test_case_timeline.py` passing unchanged.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): extend case workspace with timeline and evidence explorer`
14. Migration Plan: Frontend-only rollout; no DB migration needed.
15. Acceptance Criteria: Case detail shows timeline, evidence categories, linked certificates, and preserves all existing case CRUD behavior.

---

## Feature 2: Dashboard-Driven Architecture

1. Architecture: Use `jobs` as the orchestration boundary between dashboard requests and CLI agent execution; keep direct CLI submission path untouched.
2. Folder Structure: Reuse `backend/app/models/jobs.py`, `backend/app/api/v1/jobs.py`, `backend/app/services/job_service.py`; add agent worker helpers inside each CLI repo under an additive `worker` or `api_client` module.
3. Files to Create: `drive-eraser-agent/src/worker.py`, `file-folder-eraser/src/worker.py`, `recovery-engine/src/worker.py` or equivalent optional runner files.
4. Files to Modify: Existing agent `api_client` modules and argument parsing files only to add optional flags, never to replace existing run flow.
5. API Changes: No breaking changes; reuse existing `/api/v1/jobs`, `/api/v1/jobs/claim`, `/progress`, `/complete`, `/fail`.
6. Database Changes: None beyond existing `jobs` table.
7. UI Components: Create Job form, case-linked job launcher, device selector, queue overview.
8. Backend Services: `job_service` remains orchestration source; optionally add small worker heartbeat helper.
9. Security Considerations: Require JWT for job creation and agent claims; do not expose sensitive payload fields in public logs.
10. Scalability: Keep job claim transactional; later move worker execution to separate containers without changing API contracts.
11. Testing Strategy: Add CLI integration tests for claim-progress-complete flow while preserving legacy manual CLI tests.
12. Implementation Order: Phase 2 after frontend queue pages.
13. Git Commit Message: `feat(agents): add optional job worker mode for dashboard orchestration`
14. Migration Plan: Deploy backend and frontend first; enable worker mode per agent incrementally.
15. Acceptance Criteria: Investigator can create a job from dashboard, optional worker claims it, and legacy CLI execution still works exactly as before.

---

## Feature 3: Device Inventory

1. Architecture: Treat devices as first-class operational assets linked to jobs, cases, and evidence where available.
2. Folder Structure: Reuse `backend/app/models/devices.py`, `backend/app/api/v1/devices.py`, `backend/app/services/device_service.py`.
3. Files to Create: `frontend/src/app/dashboard/devices/page.tsx`, `frontend/src/components/devices/DeviceTable.tsx`, `DeviceForm.tsx`.
4. Files to Modify: `frontend/src/components/AppShell.tsx` navigation is already prepared; wire page routes and filters.
5. API Changes: No new backend routes needed; existing `/api/v1/devices` CRUD is sufficient.
6. Database Changes: None beyond current `devices` table and optional evidence linkage already planned.
7. UI Components: Inventory table, health badge, status badge, detail drawer, manual registration form.
8. Backend Services: Existing `device_service` is sufficient; optional agent detection hook can be added later.
9. Security Considerations: Restrict edits to operator roles; auditors remain read-only.
10. Scalability: Index serial number, status, and detection timestamps; server-side filtering only.
11. Testing Strategy: Preserve `test_devices_api.py`; add frontend list/create/edit smoke tests.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): add device inventory management screens`
14. Migration Plan: No schema change if current backend model is already applied; otherwise apply the existing device migration/create-all on deploy.
15. Acceptance Criteria: Operators can register, filter, update, and inspect devices without affecting existing evidence or operation flows.

---

## Feature 4: Task Queue

1. Architecture: Use the existing `jobs` entity as the queue record, with explicit state transitions and retry lineage.
2. Folder Structure: Reuse `backend/app/api/v1/jobs.py` and `backend/app/schemas/job.py`; add `frontend/src/app/dashboard/jobs/`.
3. Files to Create: `frontend/src/app/dashboard/jobs/page.tsx`, `frontend/src/app/dashboard/jobs/[jobId]/page.tsx`, `frontend/src/components/jobs/JobQueueTable.tsx`, `JobDetailPanel.tsx`.
4. Files to Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts` already support jobs; use them directly.
5. API Changes: None required; current endpoints already cover create, list, get, cancel, retry, claim, progress, complete, and fail.
6. Database Changes: None beyond current `jobs` table.
7. UI Components: Status tabs, filter bar, progress column, retry button, cancel action, job detail timeline.
8. Backend Services: Existing `job_service` claim logic remains authoritative.
9. Security Considerations: Prevent unauthorized cancellation and retries; surface only allowed actions per role.
10. Scalability: Paginate queue views and keep descending `created_at` index hot.
11. Testing Strategy: Preserve `test_jobs_api.py`; add frontend action tests for cancel and retry.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): add task queue list and job detail workflows`
14. Migration Plan: Frontend-only if backend table is already present.
15. Acceptance Criteria: Users can see pending/running/completed/failed/cancelled jobs, retry failed work, and inspect full job status from the dashboard.

---

## Feature 5: Real-Time Progress

1. Architecture: Keep WebSocket manager as the live event layer and use HTTP polling as fallback for resilience.
2. Folder Structure: Reuse `backend/app/api/v1/ws.py`, `backend/app/services/ws_manager.py`, `frontend/src/lib/ws.ts`.
3. Files to Create: `frontend/src/components/jobs/JobProgressStream.tsx`, optional `frontend/src/components/system/LiveStatusBadge.tsx`.
4. Files to Modify: `frontend/src/app/dashboard/jobs/[jobId]/page.tsx`, `frontend/src/app/dashboard/page.tsx`.
5. API Changes: None required; current WS endpoints are sufficient.
6. Database Changes: None required; progress is already stored on `jobs`.
7. UI Components: Live stage pill, progress bar, event feed, reconnect indicator.
8. Backend Services: Existing WS manager is sufficient; only add event typing helpers if useful.
9. Security Considerations: Keep JWT validation on socket connect and enforce per-user/per-role channel authorization.
10. Scalability: Use per-job channels and bounded client-side event buffers to avoid memory growth.
11. Testing Strategy: Preserve `test_websocket_progress.py`; add browser-level verification for reconnect and fallback polling.
12. Implementation Order: Phase 1 alongside jobs UI.
13. Git Commit Message: `feat(frontend): surface live job progress over websocket with polling fallback`
14. Migration Plan: No schema change; frontend deploy only.
15. Acceptance Criteria: Running jobs visibly update progress in near real time and remain viewable after refresh via stored job state.

---

## Feature 6: Role-Based Access Control

1. Architecture: Keep authentication unchanged and enforce authorization through additive role checks and role-aware UI visibility.
2. Folder Structure: Reuse `backend/app/models/user.py`, `backend/app/api/deps.py`, `backend/app/api/v1/users.py`.
3. Files to Create: `frontend/src/app/dashboard/users/page.tsx`, `frontend/src/components/users/UserRoleTable.tsx`.
4. Files to Modify: `frontend/src/components/AppShell.tsx`, login/session bootstrapping to load role consistently.
5. API Changes: No breaking changes; existing `/api/v1/users` and role update endpoint already support administration.
6. Database Changes: None beyond current `users.role`.
7. UI Components: User list, role selector, admin-only views, read-only guards for auditors.
8. Backend Services: No new service layer needed beyond current dependency guards.
9. Security Considerations: Never trust hidden UI alone; backend remains the enforcement point.
10. Scalability: Role checks remain O(1); no added query cost beyond current user load.
11. Testing Strategy: Preserve `test_rbac.py`; add frontend route-access checks.
12. Implementation Order: Phase 1 because all UI pages depend on it.
13. Git Commit Message: `feat(frontend): add operator administration and role-aware access control`
14. Migration Plan: None if role column is already present in deployed environments.
15. Acceptance Criteria: Users only see and access actions allowed for their role, while login and JWT behavior remain unchanged.

---

## Feature 7: Notification Center

1. Architecture: Keep notifications as additive event records generated by backend services and rendered in-app from the shell.
2. Folder Structure: Reuse `backend/app/models/notifications.py`, `backend/app/api/v1/notifications.py`, `backend/app/services/notification_service.py`.
3. Files to Create: Optional `frontend/src/components/notifications/NotificationDrawer.tsx` if you want to split the current shell implementation.
4. Files to Modify: `frontend/src/components/AppShell.tsx` is already partially implemented and should be refactored, not replaced.
5. API Changes: No new endpoints required.
6. Database Changes: None beyond current `notifications` table.
7. UI Components: Notification tray, unread badge, mark-all-read action, event-type badges.
8. Backend Services: Existing notification hooks are already the right pattern.
9. Security Considerations: Scope user-specific events carefully and use broadcast only for platform-wide security notices.
10. Scalability: Keep tray pagination and unread count aggregation server-side.
11. Testing Strategy: Preserve `test_notifications.py`; add shell interaction tests.
12. Implementation Order: Phase 1 cleanup.
13. Git Commit Message: `refactor(frontend): productionize notification center tray and unread state`
14. Migration Plan: No migration required if notification table is already deployed.
15. Acceptance Criteria: Users receive certificate, tamper, and job failure alerts with correct scoping and durable unread state.

---

## Feature 8: Investigation Timeline

1. Architecture: Use `timeline_events` as the immutable narrative of case activity generated from existing case and operation actions.
2. Folder Structure: Reuse `backend/app/models/timeline.py`, `backend/app/schemas/timeline.py`, existing case detail page.
3. Files to Create: `frontend/src/components/cases/TimelineRail.tsx`, `TimelineEventCard.tsx`.
4. Files to Modify: `frontend/src/app/dashboard/cases/[caseId]/page.tsx`.
5. API Changes: None required; current timeline endpoints are enough.
6. Database Changes: None beyond current timeline table.
7. UI Components: Chronological rail, event icons, actor labels, note composer.
8. Backend Services: Existing hooks remain; optional note formatting helper only.
9. Security Considerations: Manual note creation should remain authenticated and auditable.
10. Scalability: Render paged timeline chunks for very large cases.
11. Testing Strategy: Preserve `test_case_timeline.py`; add UI render tests for ordering and note creation.
12. Implementation Order: Phase 1 with case workspace enhancement.
13. Git Commit Message: `feat(frontend): add investigation timeline to case detail workspace`
14. Migration Plan: Frontend-only if backend timeline model is already live.
15. Acceptance Criteria: Case detail shows ordered investigation events and supports manual notes without affecting existing case operations.

---

## Feature 9: Analytics Dashboard

1. Architecture: Keep analytics fully aggregate-driven from backend SQL and expose them through the dashboard home.
2. Folder Structure: Reuse `backend/app/api/v1/analytics.py`, `backend/app/services/analytics_service.py`, `frontend/src/app/dashboard/page.tsx`.
3. Files to Create: Optional `frontend/src/components/dashboard/StatCard.tsx`, `LineChart.tsx`, `TopInvestigators.tsx` for reuse.
4. Files to Modify: `frontend/src/app/dashboard/page.tsx` to split current large file into enterprise components.
5. API Changes: No new backend changes required; public stats are already split into `/api/v1/public/stats`.
6. Database Changes: None.
7. UI Components: Stat cards, trend chart, top investigators, recent jobs pane.
8. Backend Services: Existing analytics service should remain SQL-only and read-only.
9. Security Considerations: Keep authenticated analytics separate from public landing page aggregates.
10. Scalability: Continue pushing counts and sums into SQL, never client aggregation over full datasets.
11. Testing Strategy: Preserve `test_analytics_api.py`; add frontend rendering tests for empty and populated states.
12. Implementation Order: Already partially complete; refine in Phase 1.
13. Git Commit Message: `refactor(frontend): componentize enterprise analytics dashboard`
14. Migration Plan: No migration required.
15. Acceptance Criteria: Dashboard shows accurate operational KPIs, recent jobs, and trends with no additional backend redesign.

---

## Feature 10: Advanced Search

1. Architecture: Keep search as a typed backend union endpoint and add a dedicated results page rather than overloading existing pages.
2. Folder Structure: Reuse `backend/app/api/v1/search.py`; add `frontend/src/app/dashboard/search/page.tsx`.
3. Files to Create: `frontend/src/app/dashboard/search/page.tsx`, `frontend/src/components/search/SearchResultsTable.tsx`, `SearchFilters.tsx`.
4. Files to Modify: `frontend/src/components/AppShell.tsx` already contains the global search input and can route into the new page.
5. API Changes: None required.
6. Database Changes: None required.
7. UI Components: Search results tabs, filter chips, date range controls, typed result cards.
8. Backend Services: Current search router is enough; only optimize query plans if needed later.
9. Security Considerations: Keep search authenticated and role-scoped; do not expose hidden admin-only records.
10. Scalability: Enforce server-side limit/offset and keep result payload minimal.
11. Testing Strategy: Preserve `test_search_api.py`; add UI tests for query and filter routing.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): add advanced platform search results page`
14. Migration Plan: Frontend-only.
15. Acceptance Criteria: Users can search certificates, cases, devices, hashes, and officers from the shell and land on typed results.

---

## Feature 11: Evidence Explorer

1. Architecture: Keep recovered file metadata inside evidence details and render explorer views without storing binary content.
2. Folder Structure: Reuse `backend/app/api/v1/evidence.py`, `frontend/src/app/dashboard/cases/[caseId]/page.tsx`.
3. Files to Create: `frontend/src/components/cases/EvidenceExplorerTabs.tsx`, `EvidenceFileTable.tsx`.
4. Files to Modify: Case detail page to add recovered file category tabs and counts.
5. API Changes: None required; existing `/api/v1/evidence/{id}/files` is sufficient.
6. Database Changes: None required.
7. UI Components: Category tabs, metadata table, confidence badge, preview placeholder, hash display.
8. Backend Services: Existing endpoint is enough.
9. Security Considerations: Treat evidence metadata as untrusted display data and sanitize any file/path labels before rendering.
10. Scalability: Paginate very large recovered file lists and lazy-load category views.
11. Testing Strategy: Preserve `test_evidence_explorer_api.py`; add frontend category filtering tests.
12. Implementation Order: Phase 1 with case detail enhancement.
13. Git Commit Message: `feat(frontend): add evidence explorer to recovery-linked case evidence`
14. Migration Plan: Frontend-only if current evidence schema is already deployed.
15. Acceptance Criteria: Investigators can inspect recovered file metadata by category without changing recovery engine core logic.

---

## Feature 12: Hash Chain Visualization

1. Architecture: Keep the trust layer immutable and visualize ledger blocks using read-only chain APIs only.
2. Folder Structure: Reuse `backend/app/api/v1/ledger.py`; add `frontend/src/app/dashboard/ledger/page.tsx`.
3. Files to Create: `frontend/src/app/dashboard/ledger/page.tsx`, `frontend/src/components/ledger/ChainTimeline.tsx`, `LedgerBlockCard.tsx`.
4. Files to Modify: `frontend/src/components/AppShell.tsx` navigation already exposes the route.
5. API Changes: None required.
6. Database Changes: None required.
7. UI Components: Sequence navigator, chain cards, expand/collapse hashes, verify action result panel.
8. Backend Services: Existing ledger verification endpoint remains authoritative.
9. Security Considerations: Never recompute or overwrite stored hashes server-side during visualization; keep it read-only.
10. Scalability: Load ledger in bounded windows by sequence range.
11. Testing Strategy: Preserve `test_ledger_chain_api.py` and existing ledger tests; add frontend rendering tests for invalid/valid states.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): add hash chain visualization and verification view`
14. Migration Plan: Frontend-only.
15. Acceptance Criteria: Users can browse chain entries, inspect hashes, and verify specific blocks without modifying ledger behavior.

---

## Feature 13: Report Center

1. Architecture: Keep reports as filtered read models over signed operations and expose them through dedicated dashboard pages.
2. Folder Structure: Reuse `backend/app/api/v1/reports.py`; add `frontend/src/app/dashboard/reports/page.tsx`.
3. Files to Create: `frontend/src/app/dashboard/reports/page.tsx`, `frontend/src/components/reports/ReportTabs.tsx`, `CertificateReportTable.tsx`.
4. Files to Modify: `frontend/src/lib/api.ts` already contains report wrappers; wire them into pages.
5. API Changes: None required.
6. Database Changes: None required.
7. UI Components: Tabbed report center, date/operator filters, CSV download, PDF open action.
8. Backend Services: Existing report router is sufficient.
9. Security Considerations: Keep report download access role-controlled and audit sensitive bulk exports in system logs.
10. Scalability: Use server-side pagination and streamed CSV downloads only.
11. Testing Strategy: Preserve `test_reports_api.py`; add UI tests for filters and download links.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): add enterprise report center with certificate and audit views`
14. Migration Plan: Frontend-only.
15. Acceptance Criteria: Users can filter certificates, recovery reports, audit reports, and monthly summaries from one dashboard module.

---

## Feature 14: Settings

1. Architecture: Keep backend settings as a typed singleton config store that augments, but does not replace, environment defaults.
2. Folder Structure: Reuse `backend/app/models/setting.py`, `backend/app/api/v1/settings.py`, `backend/app/services/settings_service.py`.
3. Files to Create: `frontend/src/app/dashboard/settings/page.tsx`, `frontend/src/components/settings/SettingsForm.tsx`.
4. Files to Modify: `frontend/src/components/ThemeProvider.tsx` only if you want DB-backed theme preference later; current local storage is acceptable.
5. API Changes: None required.
6. Database Changes: None beyond current settings storage.
7. UI Components: Organization form, department form, certificate template settings, overwrite default setting, theme toggle panel.
8. Backend Services: Existing settings service is sufficient.
9. Security Considerations: Admin-only access; validate all text inputs and preserve immutable trust-layer display values.
10. Scalability: Settings reads should stay cached server-side.
11. Testing Strategy: Preserve `test_settings_api.py`; add admin UI form tests.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): add administration settings workspace`
14. Migration Plan: No additional migration if settings table already exists.
15. Acceptance Criteria: Administrator can manage organization and certificate presentation settings without changing JWT, crypto, or core operation logic.

---

## Feature 15: System Logs

1. Architecture: Use the existing structured log buffer and live log stream as additive observability, never as a replacement for stdout or trust data.
2. Folder Structure: Reuse `backend/app/core/logging.py`, `backend/app/models/system_log.py`, `backend/app/api/v1/system_logs.py`.
3. Files to Create: `frontend/src/app/dashboard/system-logs/page.tsx`, `frontend/src/components/logs/SystemLogTable.tsx`, `LiveLogStream.tsx`.
4. Files to Modify: `frontend/src/lib/ws.ts` is already ready for log streaming; connect it to the page.
5. API Changes: None required.
6. Database Changes: None beyond current `system_logs` table.
7. UI Components: Category tabs, level filters, live tail, source column, details drawer.
8. Backend Services: Existing log buffer should remain asynchronous and non-blocking.
9. Security Considerations: Restrict logs to Administrator, Auditor, and Supervisor roles; redact secrets from any future log payload additions.
10. Scalability: Keep bounded live buffers in UI and index level/category/time in DB.
11. Testing Strategy: Preserve `test_system_logs.py`; add UI tests for category filtering and live feed.
12. Implementation Order: Phase 1.
13. Git Commit Message: `feat(frontend): add live system log console and filters`
14. Migration Plan: Frontend-only if backend logging tables are already in place.
15. Acceptance Criteria: Authorized users can inspect live and historical logs without impacting request latency or backend behavior.

---

## Feature 16: Government Style UI

1. Architecture: Treat the new government theme as a shell-and-token layer over existing pages, not a new frontend stack.
2. Folder Structure: Reuse `frontend/src/components/AppShell.tsx`, `ThemeProvider.tsx`, `frontend/src/app/globals.css`, `frontend/tailwind.config.js`.
3. Files to Create: `frontend/src/components/ui/Panel.tsx`, `Badge.tsx`, `Table.tsx`, `FormField.tsx` to standardize the enterprise look.
4. Files to Modify: Existing pages under `frontend/src/app/dashboard/` and `frontend/src/app/login/page.tsx`.
5. API Changes: None.
6. Database Changes: None.
7. UI Components: Government header, white panel system, blue nav, grey borders, restrained badges, minimal charts.
8. Backend Services: Not applicable.
9. Security Considerations: Maintain accessible focus states and do not hide critical warnings through styling choices.
10. Scalability: Shared components reduce duplication and keep future pages visually consistent.
11. Testing Strategy: Add screenshot/manual QA pass for dashboard, login, verify, cases, jobs, reports, logs, settings, and landing page.
12. Implementation Order: Start immediately and use as the baseline for all remaining pages.
13. Git Commit Message: `refactor(frontend): standardize government enterprise design system`
14. Migration Plan: Frontend-only progressive rollout page by page.
15. Acceptance Criteria: The application looks like an NTRO/NIC-grade platform with blue-white-grey discipline and no flashy effects.

---

## Feature 17: Landing Page

1. Architecture: Replace the current redirect-only `/` with a public presentation layer backed by the existing `/api/v1/public/stats` endpoint.
2. Folder Structure: Reuse `backend/app/api/v1/public.py`; modify `frontend/src/app/page.tsx`.
3. Files to Create: `frontend/src/components/landing/Hero.tsx`, `FeaturesGrid.tsx`, `ArchitectureDiagram.tsx`, `SecurityStandards.tsx`, `Workflow.tsx`, `Faq.tsx`, `ContactBlock.tsx`.
4. Files to Modify: `frontend/src/app/page.tsx`, optionally `frontend/src/app/login/page.tsx` for visual continuity.
5. API Changes: None required.
6. Database Changes: None required.
7. UI Components: Hero, stats, features, architecture SVG, standards badges, workflow steps, FAQ, contact, footer.
8. Backend Services: Existing public stats endpoint is enough.
9. Security Considerations: Keep the landing page public but never expose operationally sensitive data beyond safe aggregates.
10. Scalability: Static-first rendering with one small stats fetch is sufficient.
11. Testing Strategy: Add route rendering checks and manual review for all nine required sections.
12. Implementation Order: Phase 3 after internal dashboard pages.
13. Git Commit Message: `feat(frontend): add public government landing page for forensicguard`
14. Migration Plan: Frontend-only; preserve `/login` and `/dashboard` routes as-is.
15. Acceptance Criteria: Visiting `/` shows a polished NTRO-style product page with public metrics and clear sign-in and verification entry points.

---

## Feature 18: Keep Existing Logic

1. Architecture: This is a governance feature, not a UI feature; all enhancements must remain additive around the current trust, API, module, and database core.
2. Folder Structure: No new folder required; apply this rule across `backend/`, `frontend/`, and all three agent repos.
3. Files to Create: Optional `docs/architecture/compatibility-checklist.md` if you want formal reviewer sign-off.
4. Files to Modify: Only where additions are required; do not rewrite legacy modules.
5. API Changes: Additive only, never breaking.
6. Database Changes: Additive only, never destructive.
7. UI Components: Not applicable.
8. Backend Services: Not applicable beyond compatibility discipline.
9. Security Considerations: The immutable trust layer, JWT model, and operation signing flow must remain untouched.
10. Scalability: Preserving contracts now keeps future scale work manageable.
11. Testing Strategy: Full regression on backend plus all three agents before every demo milestone.
12. Implementation Order: Continuous rule enforced across all phases.
13. Git Commit Message: `docs: formalize backward compatibility guardrails for enterprise enhancements`
14. Migration Plan: No migration; this is a delivery constraint.
15. Acceptance Criteria: Existing APIs, crypto, hash chain, CLI behavior, and tests remain backward compatible while new enterprise features are added on top.

---

## Recommended Next Prompts

1. `Implement frontend Task Queue pages using the existing jobs API and AppShell.`
2. `Implement Device Inventory frontend using the existing devices API.`
3. `Enhance the Case Detail page with Investigation Timeline and Evidence Explorer.`
4. `Implement the Advanced Search results page using the current /api/v1/search endpoint.`
5. `Implement Report Center, Settings, System Logs, and Ledger pages with the government theme.`
6. `Replace the current redirect home page with the public government landing page using /api/v1/public/stats.`
7. `Add optional worker mode to the CLI agents using the existing jobs claim/progress/complete APIs without breaking manual CLI usage.`
