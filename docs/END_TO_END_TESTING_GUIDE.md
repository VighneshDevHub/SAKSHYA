# ForensicGuard End-to-End Testing Guide

This guide validates the implemented FastAPI backend, Next.js frontend, CLI agents, task queue, device inventory, real-time progress, auditability, and role controls without touching real storage media.

For the short SIH judge demonstration, use [DEMO_JUDGE_GUIDE.md](DEMO_JUDGE_GUIDE.md). It includes the safe USB flow and clearly distinguishes implemented, partial, and future capabilities.

## 1. Safety and scope

- Use a disposable test database and test files only.
- Never run `--real-device` during this walkthrough.
- Automatic host detection reads physical disks on the machine running FastAPI. A browser cannot enumerate USB or NVMe devices by itself.
- The detection endpoint is Windows-only. On Linux or macOS, use manual registration or the safe file-target agent mode.

## 2. Prerequisites

- Python 3.11+
- Node.js 18+
- npm 9+
- PowerShell 5.1+ for Windows host detection
- Optional: Docker Desktop and PostgreSQL

Install dependencies from the repository root:

```powershell
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r drive-eraser-agent\requirements.txt
pip install -r file-folder-eraser\requirements.txt
pip install -r recovery-engine\requirements.txt
Set-Location frontend
npm install
Set-Location ..
```

## 3. Start the application

Terminal A, backend:

```powershell
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Terminal B, frontend:

```powershell
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\frontend"
npm run dev
```

Check:

- `http://localhost:8000/health` returns `{"status":"ok"}`.
- `http://localhost:8000/docs` opens Swagger.
- `http://localhost:3000` opens the landing page.
- The frontend API base is `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:8000`.

## 4. Create test users and roles

Register through `http://localhost:3000/login` or Swagger `POST /api/v1/auth/register`:

| Account | Password | Role |
|---|---|---|
| `admin@ntro.gov.in` | `Admin@1234` | Administrator |
| `investigator@ntro.gov.in` | `Invest@1234` | Investigator |
| `auditor@ntro.gov.in` | `Audit@1234` | Auditor |
| `supervisor@ntro.gov.in` | `Super@1234` | Supervisor |

The first account defaults to `INVESTIGATOR`. Promote it to `ADMINISTRATOR` using the documented bootstrap command in `MANUAL_TESTING_GUIDE.md`, then use `/dashboard/users` to assign the other roles.

Validate:

- Administrator sees Users, Settings, and System Logs.
- Auditor can read reports, cases, devices, and ledger but cannot create or update protected resources.
- Investigator can create cases, devices, and jobs.
- Supervisor has investigator capabilities plus supervisory case actions.

## 5. Device inventory and automatic detection

### 5.1 Automatic Windows detection

1. Sign in as Administrator, Investigator, or Supervisor.
2. Open `/dashboard/devices`.
3. Click **Detect Host Devices**.
4. Confirm a success message and rows for the disks visible to the backend host.
5. Verify serial, model, capacity, connection type, media type, status, detected time, and health are shown.
6. Click detection again. Existing serial numbers must be updated, not duplicated.
7. Filter by `USB`, `NVMe`, `SSD`, or `CONNECTED`.

The UI calls `POST /api/v1/devices/detect`, which invokes PowerShell `Get-PhysicalDisk` on the backend host. If PowerShell is unavailable, the UI reports an actionable error. If the backend is not Windows, the endpoint returns `501` and manual registration remains available.

### 5.2 Safe cross-platform/manual fallback

Use **Register Device** on the same page with a disposable record such as:

- Serial: `FG-DEMO-USB-001`
- Manufacturer: `Kingston`
- Model: `Demo Data Carrier`
- Connection: `USB`
- Media: `USB_FLASH`
- Capacity: `32000000000`
- Health: `GOOD`
- Status: `CONNECTED`

Edit its status to `IN_USE`, then `QUARANTINED`. Confirm duplicate serial registration returns a conflict.

## 6. Case, evidence, and timeline flow

1. Open `/dashboard/cases` and create `FG Demo Investigation`.
2. Open the generated case number.
3. Assign `investigator@ntro.gov.in`.
4. Add a device or recovery evidence item.
5. Add a timeline note describing chain-of-custody handling.
6. Confirm the investigator assignment, evidence addition, and note appear in chronological order.
7. Link a certificate after an agent operation completes.
8. Change status through `OPEN` -> `IN_PROGRESS` -> `UNDER_REVIEW` -> `CLOSED` using an authorized account.
9. In Evidence Explorer, open file categories and verify filename, size, confidence, metadata, and SHA-256 fields.

## 7. Dashboard-driven job flow

1. Open `/dashboard/jobs`.
2. Select `RECOVERY`, keep the safe demo payload, and associate the case/device.
3. Create the job and open its detail page.
4. Confirm the job starts as `PENDING`.
5. In Swagger, claim it with `POST /api/v1/jobs/{id}/claim`.
6. Send progress updates:

```json
{
  "progress_percent": 25,
  "stage": "SCANNING",
  "message": "Reading evidence image"
}
```

7. Send another update at 75% and complete it with a certificate ID.
8. Keep the job detail page open: its WebSocket status should show `Live` and the progress should update without a refresh.
9. Create a second job, cancel it, then retry it. Confirm the retry has a new ID, `PENDING` status, and `parent_job_id`.
10. Fail a third job and verify it appears under Failed with an error message.

## 8. Safe CLI operation flow

Create a disposable target:

```powershell
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026"
[IO.File]::WriteAllBytes("test_wipe_target.img", (1..65536 | ForEach-Object { [byte]($_ % 251) }))
```

Dry run first:

```powershell
python -m drive-eraser-agent.src.main --target test_wipe_target.img --email investigator@ntro.gov.in --password Invest@1234 --dry-run
```

Then run the safe file-target wipe without `--real-device`. Confirm the CLI prints detection, method selection, wipe, read-back verification, certificate ID, and ledger sequence. Do the equivalent safe recovery and file/folder erase flows with disposable test fixtures, then verify the new operations in the dashboard and Report Center.

## 9. Trust, reports, search, and logs

- `/dashboard/ledger`: expand blocks, inspect previous/entry/report hashes, and verify a sequence.
- `/verify`: look up a certificate and confirm signature and chain status.
- `/dashboard/reports`: filter certificates, recovery, audit, and monthly reports; open a PDF and download CSV.
- `/dashboard/audit`: open the dedicated audit register linked from the sidebar and Report Center; filter by date, operator, and outcome, then open a signed certificate PDF.
- `/dashboard/search`: search by case number, serial, certificate ID, operator, or SHA-256 hash.
- `/dashboard/system-logs`: inspect persisted categories and the live WebSocket stream.
- `/dashboard/settings`: as Administrator, update organization/template values and confirm they are returned by the settings API.
- Notification bell: create an operation or job failure, then confirm the notification appears and can be marked read.

## 9.1 Frontend route coverage

Use this route order for a browser-level smoke test. Every route below requires an authenticated session unless stated otherwise.

| Route | Backend data / capability | Expected UI check |
|---|---|---|
| `/` | Public landing and public statistics | Institutional landing page loads and statistics come from `/api/v1/public/stats`. |
| `/login` | JWT login and registration | Login stores token, email, user id, and role; the console opens after authentication. |
| `/dashboard` | Analytics summary, timeseries, jobs, job WebSocket | KPI cards, trend selector, investigator ranking, and recent job progress render. |
| `/dashboard/cases` and `/dashboard/cases/:id` | Cases, assignment, evidence, timeline, status, linked operations | Create a case, open its workspace, add evidence/note, assign investigator, and change status. |
| `/dashboard/jobs` and `/dashboard/jobs/:id` | Task queue lifecycle and job WebSocket | Create, cancel, retry, inspect progress, and confirm live status without refresh. |
| `/dashboard/devices` | Inventory and Windows host detection | Detect host disks, filter records, register a safe manual device, and edit status. |
| `/dashboard/reports` | Certificates, recovery, audit, monthly reports | Switch tabs, apply filters, open PDF, and download CSV. |
| `/dashboard/audit` | Dedicated audit report register | Confirm the sidebar and Report Center links resolve and signed records are listed. |
| `/dashboard/ledger` | Hash-chain blocks and sequence verification | Inspect chain links and verify a selected sequence. |
| `/dashboard/search` | Universal search | Search certificate, case, device, officer, and hash values. |
| `/dashboard/system-logs` | Persisted logs and live log WebSocket | Review each category and pause/resume the live stream. |
| `/dashboard/users` | Administrator role management | Confirm role badge is visible and Administrator can change roles. |
| `/dashboard/settings` | Organization and certificate settings | Confirm Administrator can load and save settings; non-admin sees a restriction message. |
| `/verify` | Public certificate verification | Verify a valid certificate and observe signature, chain, and overall status. |

The console header must show the authenticated operator email and role badge. The sidebar must hide Administrator-only pages for Investigator and Auditor accounts, while direct navigation must still show the backend's 403 response as a restricted state rather than exposing data.

## 10. Tamper and authorization checks

1. Verify a valid certificate and record the positive result.
2. In a disposable development database, change a non-key operation value.
3. Verify again and confirm `overall_verified` is false and a tamper notification is generated for authorized recipients.
4. As Auditor, attempt to create a device, patch a device, create a job, and change settings. Each protected write must return `403`.
5. As Administrator, confirm user role changes work and the last Administrator cannot accidentally demote itself.

Do not perform the tamper step against production data or persistent signing keys.

## 11. Automated validation

From the repository root:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
Set-Location ..\drive-eraser-agent
..\.venv\Scripts\python.exe -m pytest -q
Set-Location ..\file-folder-eraser
..\.venv\Scripts\python.exe -m pytest -q
Set-Location ..\recovery-engine
..\.venv\Scripts\python.exe -m pytest -q
Set-Location ..\frontend
npm run build
```

For the changed device slice, also run:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest tests/test_devices_api.py -q
```

Expected result: all existing suites pass, the frontend production build completes, and no existing test file is modified.

## 12. Acceptance checklist

- [ ] Landing page and login work.
- [ ] Four roles authenticate and receive expected access.
- [ ] Device detection or manual fallback populates inventory.
- [ ] Device filters, edit, duplicate protection, and status changes work.
- [ ] Case, evidence, assignment, status, and timeline flow works.
- [ ] Job create, claim, progress, complete, cancel, fail, and retry work.
- [ ] Job WebSocket updates without page refresh.
- [ ] Safe CLI operations produce certificates and ledger entries.
- [ ] Certificate verification and tamper detection work.
- [ ] Search, reports, analytics, notifications, settings, and logs load backend data.
- [ ] Every route in the frontend route coverage table loads or shows an intentional authorization/error state.
- [ ] The authenticated operator email and role badge are visible in the console header.
- [ ] The dedicated Audit Log navigation link resolves to `/dashboard/audit`.
- [ ] Backend and all agent tests pass.
- [ ] Frontend production build passes.

## 13. Known limitations

- Host detection scans the FastAPI host, not the user's browser machine.
- Physical disk enumeration is implemented for Windows; Linux/macOS use manual inventory or agent-specific detection.
- Existing CLI execution remains manual unless an agent worker is explicitly connected to the job queue.
- Development defaults use SQLite; production deployment should use PostgreSQL and persistent JWT/signing configuration.
