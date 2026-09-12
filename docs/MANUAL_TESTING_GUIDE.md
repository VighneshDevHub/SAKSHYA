# SAKSHYA / ForensicGuard — Manual Testing Guide

> **Platform**: Windows 11 · Backend: FastAPI + SQLite (dev) · Frontend: Next.js 14  
> **Last updated**: September 2026

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Setup — First Time Only](#2-project-setup--first-time-only)
3. [Start Everything](#3-start-everything)
4. [Test Flow 1 — Landing Page & Public Stats](#4-test-flow-1--landing-page--public-stats)
5. [Test Flow 2 — Auth & Role-Based Access](#5-test-flow-2--auth--role-based-access)
6. [Test Flow 3 — Device Detection & Inventory](#6-test-flow-3--device-detection--inventory)
7. [Test Flow 4 — Recovery Module](#7-test-flow-4--recovery-module)
8. [Test Flow 5 — Secure Drive Erase](#8-test-flow-5--secure-drive-erase)
9. [Test Flow 6 — Secure File & Folder Erase](#9-test-flow-6--secure-file--folder-erase)
10. [Test Flow 7 — Task Queue (Dashboard-Driven Jobs)](#10-test-flow-7--task-queue-dashboard-driven-jobs)
11. [Test Flow 8 — Hash Chain Ledger & Certificate Verify](#11-test-flow-8--hash-chain-ledger--certificate-verify)
12. [Test Flow 9 — Cases, Timeline & Evidence Explorer](#12-test-flow-9--cases-timeline--evidence-explorer)
13. [Test Flow 10 — Reports, System Logs & Settings](#13-test-flow-10--reports-system-logs--settings)
14. [Test Flow 11 — WebSocket Live Progress](#14-test-flow-11--websocket-live-progress)
15. [Test Flow 12 — Advanced Search](#15-test-flow-12--advanced-search)
16. [Run Automated Tests](#16-run-automated-tests)
17. [Known Gaps & What to Expect](#17-known-gaps--what-to-expect)
18. [Quick API Reference (curl / browser)](#18-quick-api-reference-curl--browser)

---

## 1. Prerequisites

Make sure you have these installed before starting:

| Tool | Minimum Version | Check Command |
|---|---|---|
| Python | 3.11+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | any | `git --version` |
| Docker Desktop | optional (for Postgres mode) | `docker --version` |

> For the demo, **Docker is NOT required**. The backend defaults to a local SQLite file (`backend/forensicguard.db`). No Postgres setup needed.

---

## 2. Project Setup — First Time Only

Open **three separate terminals** side-by-side (backend, frontend, agents).

### Terminal A — Backend

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
python -m venv .venv
.venv\Scripts\activate
cd backend
pip install -r requirements.txt
```

### Terminal B — Frontend

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\frontend"
npm install
```

### Terminal C — Agents (shared venv)

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
.venv\Scripts\activate
pip install -r drive-eraser-agent/requirements.txt
pip install -r recovery-engine/requirements.txt
pip install -r file-folder-eraser/requirements.txt
```

---

## 3. Start Everything

### Step 1 — Start the Backend (Terminal A)

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\\.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Wait for:
```
INFO:     Application startup complete.
```

The SQLite DB file `backend/forensicguard.db` is auto-created. Tables are created on first run — no migration needed.

### Step 2 — Start the Frontend (Terminal B)

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\frontend"
npm run dev
```

Wait for:
```
▲ Next.js 14.x.x
- Local: http://localhost:3000
```

### Step 3 — Verify Both Are Running

Open your browser and visit:
- Backend health: http://localhost:8000/health → should return `{"status":"ok","environment":"development"}`
- Frontend: http://localhost:3000 → should show the ForensicGuard landing page
- API Docs (Swagger): http://localhost:8000/docs → interactive API explorer

---

## 4. Test Flow 1 — Landing Page & Public Stats

**Goal**: Confirm the public landing page loads with live statistics.

1. Open http://localhost:3000
2. You should see all **9 sections** without logging in:
   - ✅ Hero banner with "ForensicGuard" heading
   - ✅ Live stats bar (operations count, certificates issued — will be 0 initially)
   - ✅ Features grid (6 feature cards)
   - ✅ Architecture diagram (SVG)
   - ✅ Security Standards badges (NIST SP 800-88, SHA-256, ECDSA P-256)
   - ✅ Workflow steps
   - ✅ FAQ accordion (click to expand)
   - ✅ Contact block
   - ✅ Footer

3. Click **"Sign In"** — should route to `/login`
4. Click **"Verify Certificate"** — should open the `/verify` page

**Expected**: All sections visible, no errors, stats are 0 until you create operations.

---

## 5. Test Flow 2 — Auth & Role-Based Access

**Goal**: Register accounts for all 4 roles and confirm access control.

### 5.1 Register an Administrator

Using the Swagger UI at http://localhost:8000/docs:

1. Go to **POST /api/v1/auth/register**
2. Click "Try it out" → Enter:
```json
{
   "email": "admin@ntro.gov.in",
  "password": "Admin@1234",
  "full_name": "System Administrator"
}
```
3. Click Execute → expect `201 Created`

> **Note**: The first registered user defaults to `INVESTIGATOR` role. You need to promote them to `ADMINISTRATOR` via the users endpoint. Since there's no admin yet, do this directly:

4. Login first — **POST /api/v1/auth/login**:
```json
{
   "email": "admin@ntro.gov.in",
  "password": "Admin@1234"
}
```
Copy the `access_token` from the response.

5. Click **Authorize** (padlock icon, top right in Swagger) → paste the token.

6. Go to **GET /api/v1/users** → you'll get a 403 (not admin yet — expected).

7. To self-promote, use **PATCH /api/v1/users/{user_id}/role** — but this also requires ADMIN. 
   **Workaround for first-time setup**: Delete `backend/forensicguard.db`, stop the backend, edit `backend/app/models/user.py` and temporarily change the default role to `ADMINISTRATOR`, restart, register, then revert. 
   
   **OR** (easier) — use the backend shell:

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\\.venv\Scripts\activate
python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from sqlalchemy import select, update

async def promote():
    async with AsyncSessionLocal() as db:
      result = await db.execute(select(User).where(User.email == 'admin@ntro.gov.in'))
        user = result.scalar_one()
        user.role = UserRole.ADMINISTRATOR
        await db.commit()
        print(f'Promoted {user.email} to ADMINISTRATOR')

asyncio.run(promote())
"
```

### 5.2 Register Other Role Accounts

Register these via Swagger POST /api/v1/auth/register (or the login page):

```
investigator@ntro.gov.in  / Invest@1234
auditor@ntro.gov.in       / Audit@1234
supervisor@ntro.gov.in    / Super@1234
```

Then use the admin token to promote them:

**PATCH /api/v1/users/{user_id}/role**
```json
{ "role": "AUDITOR" }
```

### 5.3 Test Login in the UI

1. Go to http://localhost:3000/login
2. Login as `admin@ntro.gov.in` / `Admin@1234`
3. You should land on the **Dashboard** at `/dashboard`
4. Check the sidebar — you should see: Dashboard, Task Queue, Device Inventory, Cases, Hash Chain Ledger, Report Center, Audit Log, **Operators**, **System Logs**, **Settings** (Admin-only items visible)
5. Sign out, login as `auditor@ntro.gov.in`
6. Sidebar should **NOT** show Operators or Settings — only read-only sections

---

## 6. Test Flow 3 — Device Detection & Inventory

**Goal**: Register a device, filter it, and verify metadata is stored correctly.

### 6.1 Manual Device Registration (UI)

1. Login as `admin@ntro.gov.in`
2. Navigate to **Device Inventory** in the sidebar
3. Click **"Register Device"**
4. Fill in:
   - Serial Number: `SN-TEST-001`
   - Manufacturer: `Samsung`
   - Model: `870 EVO 500GB`
   - Connection Type: `SATA`
   - Media Type: `SSD`
   - Capacity (bytes): `500107862016` (≈ 500 GB)
   - Health: `GOOD`
   - Status: `CONNECTED`
   - Notes: `Test evidence drive — chain of custody tag #001`
5. Click **"Register Device"** → table should refresh and show the new row

### 6.2 Add More Devices for Filter Testing

Register 2 more devices:
- Serial: `USB-KINGSTON-002`, Connection: `USB`, Media: `USB_FLASH`, Status: `CONNECTED`
- Serial: `NVME-WD-003`, Connection: `NVMe`, Media: `NVME_SSD`, Status: `DISCONNECTED`

### 6.3 Test Filters

- Filter by **Connection Type: USB** → only `USB-KINGSTON-002` shown
- Filter by **Status: DISCONNECTED** → only `NVME-WD-003` shown
- Filter by **Serial contains: "001"** → only `SN-TEST-001` shown
- Click **Reset** → all 3 devices shown

### 6.4 Edit a Device

1. Click **Edit** on `SN-TEST-001`
2. Change Status to `IN_USE`
3. Save → badge in table should change to `IN USE`

### 6.5 Auto-Detection via Agent (CLI)

The drive-eraser-agent also auto-detects and can register devices. See Flow 5 for that.

---

## 7. Test Flow 4 — Recovery Module

**Goal**: Run the recovery agent on a test image, verify recovered files appear in the evidence explorer.

### 7.1 Create a Test Evidence Image

In Terminal C:

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
.venv\Scripts\activate

python -c "
import os, struct, random

# Create a 5MB fake disk image with embedded JPEG and PDF signatures
with open('test_evidence.img', 'wb') as f:
    f.write(b'\x00' * 1024 * 512)  # 512 KB empty space

    # Embed fake JPEG (starts at offset 512KB)
    f.write(b'\xFF\xD8\xFF\xE0')  # JPEG header
    f.write(b'FAKE JPEG CONTENT FOR TESTING ' * 200)
    f.write(b'\xFF\xD9')  # JPEG footer

    # Embed fake PDF (starts at offset ~600KB)
    f.write(b'\x00' * (100 * 1024))
    f.write(b'%PDF-1.4')
    f.write(b'FAKE PDF CONTENT FOR FORENSICGUARD TEST ' * 200)
    f.write(b'%%EOF')

    # Pad to 5MB
    current = f.tell()
    f.write(b'\x00' * (5 * 1024 * 1024 - current))

print('Created test_evidence.img (5 MB)')
"
```

### 7.2 Create an Output Directory

```cmd
mkdir recovered_output
```

### 7.3 Run the Recovery Engine

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
python -m recovery-engine.src.main ^
  --image test_evidence.img ^
  --output-dir recovered_output ^
  --api-url http://localhost:8000 ^
   --email investigator@ntro.gov.in ^
  --password Invest@1234
```

> On Windows CMD, use `^` for line continuation. In PowerShell use `` ` ``.

**Expected output**:
```
[recovery] Reading evidence image (read-only): test_evidence.img
[recovery] Evidence integrity preserved: True
[recovery] Files recovered: 2
[recovery] Average confidence: 0.82
[recovery] Classifications: {'image': 1, 'document': 1}
  [✓] jpeg @ offset 524288, ... bytes, confidence 0.9
  [~] pdf  @ offset 626688, ... bytes, confidence 0.75
[report] Certificate issued: CERT-...
[report] Ledger sequence number: 1
```

### 7.4 Verify in the UI

1. Open http://localhost:3000/dashboard
2. Dashboard stats should now show **1 operation**, **1 certificate**
3. Navigate to **Cases** → Create a case (name: `Test Recovery Case`, status: `ACTIVE`)
4. Open the case → Go to **Evidence** tab → Link the newly created operation
5. The **Evidence Explorer** tab should show the 2 recovered files categorised as `image` and `document`

---

## 8. Test Flow 5 — Secure Drive Erase

**Goal**: Run the drive eraser in safe file-target (demo) mode and verify the certificate is generated.

### 8.1 Create a Test Target File

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
python -c "
with open('test_wipe_target.img', 'wb') as f:
    f.write(b'SENSITIVE DATA THAT MUST BE WIPED ' * 10000)
print('Created test_wipe_target.img (~340 KB)')
"
```

### 8.2 Dry Run First (Always Do This)

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
python -m drive-eraser-agent.src.main ^
  --target test_wipe_target.img ^
   --email investigator@ntro.gov.in ^
  --password Invest@1234 ^
  --dry-run
```

**Expected**: Prints device info, then `[dry-run] Stopping here — no data was touched.`

### 8.3 Run the Actual Wipe

```cmd
python -m drive-eraser-agent.src.main ^
  --target test_wipe_target.img ^
   --email investigator@ntro.gov.in ^
  --password Invest@1234
```

**Expected output**:
```
[detect]  FILE — FileTarget (serial: FILE-...)
[select]  Method: NIST_CLEAR (or CRYPTO_ERASE)
[wipe]    Starting...
[wipe]    Done — 3 pass(es), ... bytes processed.
[verify]  10/10 sampled regions confirmed wiped.
[report]  Certificate issued: CERT-...
[report]  Ledger sequence number: 2
```

### 8.4 Verify the Digital Certificate

1. Copy the `CERT-...` value from the output
2. Open http://localhost:3000/verify/CERT-xxxxx  
   OR go to http://localhost:3000 and click **Verify Certificate**, paste the ID
3. You should see the full certificate:
   - Operator name (your authenticated email)
   - Operation type: DRIVE_ERASE
   - Sanitization method
   - SHA-256 hash
   - ECDSA digital signature → **VALID ✓**
   - QR code

### 8.5 Test Tamper Detection

1. In the Swagger UI, go to **GET /api/v1/operations** (with your JWT)
2. Find the latest operation record ID
3. Go to **POST /api/v1/verify** and verify it — should show `overall: true`
4. Now manually edit `backend/forensicguard.db` using DB Browser for SQLite  
   (download from https://sqlitebrowser.org — free)
5. Change any field in `operation_records` table (e.g. change `operator` text)
6. Re-verify the same certificate → should now show `overall: false`, tampered field highlighted

---

## 9. Test Flow 6 — Secure File & Folder Erase

**Goal**: Erase specific files/folders and get an audit certificate.

### 9.1 Create Test Files

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
mkdir test_erase_folder
echo Sensitive document content > test_erase_folder\document1.txt
echo Another sensitive file     > test_erase_folder\document2.txt
echo Case evidence notes        > test_erase_folder\notes.txt
```

### 9.2 Run the File Eraser

```cmd
python -m file-folder-eraser.src.main ^
  --target test_erase_folder ^
   --email investigator@ntro.gov.in ^
  --password Invest@1234 ^
  --api-url http://localhost:8000
```

> If the agent requires `--path` instead of `--target`, check:
```cmd
python -m file-folder-eraser.src.main --help
```

**Expected**: Files overwritten, metadata scrubbed, operation report submitted, certificate issued.

### 9.3 Verify in Dashboard

1. Go to http://localhost:3000/dashboard
2. Operations count should increase by 1
3. Navigate to **Report Center** → **Certificates** tab
4. The new FILE_ERASE certificate should appear with download option

---

## 10. Test Flow 7 — Task Queue (Dashboard-Driven Jobs)

**Goal**: Create a job from the dashboard and track its lifecycle.

### 10.1 Create a Job

1. Login as `investigator@ntro.gov.in`
2. Navigate to **Task Queue** in the sidebar
3. Click **"Create Job"**
4. Fill in:
   - Operation Type: `DRIVE_ERASE`
   - Payload: the form will auto-fill a template — keep defaults
   - Case ID: leave blank (optional)
5. Submit → job appears in **Pending** tab with a `JOB-xxxxx` number

### 10.2 Lifecycle — Claim → Progress → Complete

Using Swagger (http://localhost:8000/docs) with a JWT:

1. **POST /api/v1/jobs/{job_id}/claim** → status changes to `CLAIMED`
2. **PATCH /api/v1/jobs/{job_id}/progress**:
```json
{ "percent": 33, "stage": "scanning", "message": "Scanning device sectors..." }
```
3. **PATCH /api/v1/jobs/{job_id}/progress**:
```json
{ "percent": 66, "stage": "wiping", "message": "Overwriting with NIST Clear pattern..." }
```
4. **PATCH /api/v1/jobs/{job_id}/progress**:
```json
{ "percent": 100, "stage": "verifying", "message": "Read-back verification complete." }
```
5. **POST /api/v1/jobs/{job_id}/complete**:
```json
{ "success": true }
```

### 10.3 Verify in UI

- In the Task Queue page, click the job → detail page shows the full timeline
- Progress bar should be at 100%
- Status badge: `COMPLETED`

### 10.4 Test Cancel & Retry

1. Create another job → Pending
2. Click **Cancel** in the UI → status becomes `CANCELLED`
3. Click **Retry** → a NEW job is created (same payload, `retries_count: 1`, linked `parent_job_id`)

### 10.5 Test Failed Job

1. Claim a job, then call **POST /api/v1/jobs/{id}/fail**:
```json
{ "error_message": "Device not accessible — I/O error at sector 512" }
```
2. Job shows in **Failed** tab with the error message

---

## 11. Test Flow 8 — Hash Chain Ledger & Certificate Verify

**Goal**: Browse the immutable ledger and verify chain integrity.

### 11.1 View the Ledger

1. Navigate to **Hash Chain Ledger** in the sidebar
2. After running at least 2 operations, you'll see block cards
3. Each block shows:
   - Sequence number (1, 2, 3...)
   - Operation type
   - Operator
   - `prev_hash` → `record_hash` chain
4. Click **Expand** on a block to see full SHA-256 hashes
5. Click **Verify Block** on any block → response shows `chain_valid: true`

### 11.2 Verify the Chain is Linked

Check that block N's `prev_hash` equals block N-1's `record_hash`. This is the cryptographic chain.

### 11.3 Tamper Test (Optional)

Repeat the tamper test from Flow 5 Step 8.5 — the ledger verify endpoint will detect it.

---

## 12. Test Flow 9 — Cases, Timeline & Evidence Explorer

**Goal**: Full investigation case lifecycle.

### 12.1 Create a Case

1. Navigate to **Cases** → **New Case**
2. Fill in:
   - Title: `Cyber Fraud Investigation 2026-001`
   - Description: `Suspected data exfiltration from server SRV-DC-01`
   - Status: `ACTIVE`
3. Submit

### 12.2 Assign an Investigator

1. Open the case
2. In the **Investigators** panel → click **Assign Investigator**
3. Select `investigator@ntro.gov.in`
4. The **Investigation Timeline** should auto-add an event: `INVESTIGATOR_ASSIGNED`

### 12.3 Link an Operation

1. In the **Operations** panel → click **Link Operation**
2. Select an operation from the dropdown (from your previous erase/recovery runs)
3. Timeline should add: `OPERATION_LINKED`

### 12.4 Add a Manual Timeline Note

1. In the Timeline section, type in the note box:  
   `Confirmed chain of custody for seized SSD — sealed and tagged #2026-001-A`
2. Click **Add Note** → appears at top of timeline with your name and timestamp

### 12.5 Evidence Explorer

1. Click the **Evidence Explorer** tab on the case
2. You should see the recovered files from Flow 4 (if linked)
3. Filter by type: **image** → shows only JPEG files
4. Filter by type: **document** → shows PDF files
5. Each row shows: filename, size, confidence score, SHA-256 hash, recovery offset

### 12.6 Close a Case

1. Only SUPERVISOR or ADMINISTRATOR can close a case
2. Login as `admin@ntro.gov.in`
3. Open the case → **Close Case** button
4. Timeline adds: `CASE_CLOSED`

---

## 13. Test Flow 10 — Reports, System Logs & Settings

### 13.1 Report Center

1. Navigate to **Report Center**
2. **Certificates tab**: Should list all DRIVE_ERASE and FILE_ERASE operations with certificate IDs
3. Click **Open PDF** on any row → opens the signed PDF certificate in a new tab
4. Click **Download CSV** → downloads a CSV file of the filtered rows
5. **Recovery tab**: Shows RECOVERY operations with file counts
6. **Audit tab**: All operations in audit format
7. **Monthly tab**: Bucketed by calendar month

Filter test:
- Set date range to today → only today's operations
- Filter by operator: `investigator@ntro.gov.in` → only that user's ops

### 13.2 System Logs

> Requires ADMINISTRATOR, AUDITOR, or SUPERVISOR role

1. Navigate to **System Logs**
2. **Live Stream tab**: Should show real-time events — trigger a login or job creation to see entries appear
3. Click **Pause** → stream stops updating
4. Click **Resume** → stream continues
5. Switch to **Backend Logs** tab → persisted logs from the DB
6. Switch to **Security Logs** → failed logins, auth events
7. Filter by **Level: ERROR** → only error-level entries

### 13.3 Settings (Admin Only)

1. Login as `admin@ntro.gov.in`
2. Navigate to **Settings**
3. Update:
   - Organization Name: `National Technical Research Organisation`
   - Department: `Digital Forensics Unit`
   - Certificate Header Text: `MINISTRY OF HOME AFFAIRS — FORENSIC DIVISION`
4. Save → success toast
5. Now generate a new certificate (run a wipe) → the PDF certificate header should reflect the new org name

---

## 14. Test Flow 11 — WebSocket Live Progress

**Goal**: Watch real-time job progress update in the browser without refreshing.

### 14.1 Setup

1. Open http://localhost:3000/dashboard/jobs
2. Create a new job (type: RECOVERY, any payload)
3. Click on the new job to open the job detail page  
   URL: `/dashboard/jobs/{jobId}`
4. The page subscribes to `ws://localhost:8000/api/v1/ws/jobs/{jobId}` automatically

### 14.2 Trigger Progress Updates

Keep the job detail tab open. In another tab or Swagger:

```
PATCH /api/v1/jobs/{jobId}/progress
{ "percent": 25, "stage": "reading", "message": "Reading image sectors..." }
```

**Expected**: The progress bar in the browser updates to 25% in real time without a page refresh.

```
PATCH /api/v1/jobs/{jobId}/progress  
{ "percent": 75, "stage": "carving", "message": "File signature carving in progress..." }
```

Progress bar jumps to 75%.

```
POST /api/v1/jobs/{jobId}/complete
{ "success": true }
```

Status badge changes to `COMPLETED`, progress bar fills to 100%.

### 14.3 Check WebSocket Connection State

The job detail page shows a connection indicator:
- `●` green = WebSocket OPEN
- `●` amber = reconnecting
- `●` grey = closed / fallback to poll

---

## 15. Test Flow 12 — Advanced Search

**Goal**: Search across the platform (certificates, cases, devices, operations).

### 15.1 Using the Global Search Bar

1. In the AppShell top bar, type: `Samsung`
2. Press Enter → lands on `/dashboard/search?q=Samsung`
3. Should show Device results: the Samsung SSD registered in Flow 3

### 15.2 Search Types

| Query | Expected results |
|---|---|
| `SN-TEST-001` | Device Inventory hit |
| `Cyber Fraud` | Case hit |
| `CERT-` (partial cert ID) | Certificate/operation hit |
| `investigator@ntro.gov.in` | Operator/user hit |
| Full SHA-256 hash (copy from ledger) | Exact hash match → operation |

### 15.3 Filter Chips

On the search results page:
- Click **Device** chip → only device results
- Click **Case** chip → only case results  
- Set **Date range** → only records created in that window
- Paste a hash in the **Hash** field → exact hash match search

---

## 16. Run Automated Tests

> Do this in Terminal A (backend running on port 8000 is NOT needed — tests use an in-memory DB).

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\\.venv\Scripts\activate
pytest -v
```

**Expected**: All tests pass. Look for the count at the end:
```
===================== XX passed in X.XXs =====================
```

Run specific test files:

```cmd
pytest tests/test_rbac.py -v
pytest tests/test_devices_api.py -v
pytest tests/test_jobs_api.py -v
pytest tests/test_ledger_chain_api.py -v
pytest tests/test_websocket_progress.py -v
pytest tests/test_notifications.py -v
pytest tests/test_analytics_api.py -v
```

---

## 17. Known Gaps & What to Expect

| # | Item | Status | What to Do |
|---|---|---|---|
| 1 | `/dashboard/audit` nav link | ⚠️ Page doesn't exist yet | The link appears in sidebar under "Forensics → Audit Log" but leads to a 404. Ignore for now or create a stub page. |
| 2 | CLI agent `--job-id` worker mode | ❌ Not implemented | Agents (drive-eraser, recovery, file-eraser) can't claim and execute dashboard jobs autonomously yet. You must run them manually via CLI. |
| 3 | Notification hooks in operations | ⚠️ Unverified | CERT_GENERATED and TAMPER_DETECTED notifications may not auto-fire. Test manually: trigger an operation and check the bell icon for a new notification. |
| 4 | First admin bootstrap | ⚠️ No UI for self-promotion | Use the Python shell command in Flow 2 to promote the first admin. Subsequent role changes work in the UI. |
| 5 | `tasks.md` shows Tasks 4–20 as `pending` | ⚠️ Spec is out of date | The code is far more complete than the spec tracks. Most features work. |
| 6 | JWT token expires in 30 min | ℹ️ By design | If API calls start returning 401, log out and log back in. |

---

## 18. Quick API Reference (curl / browser)

Replace `TOKEN` with your JWT from the login response.

### Auth

```cmd
REM Register
curl -X POST http://localhost:8000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"test@test.com\",\"password\":\"Test@1234\",\"full_name\":\"Tester\"}"

REM Login
curl -X POST http://localhost:8000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"test@test.com\",\"password\":\"Test@1234\"}"
```

### Devices

```cmd
REM List all devices
curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/v1/devices

REM Create device
curl -X POST http://localhost:8000/api/v1/devices ^
  -H "Authorization: Bearer TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"serial_number\":\"TEST-001\",\"media_type\":\"SSD\",\"connection_type\":\"SATA\"}"
```

### Jobs

```cmd
REM Create job
curl -X POST http://localhost:8000/api/v1/jobs ^
  -H "Authorization: Bearer TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"operation_type\":\"DRIVE_ERASE\",\"payload\":{\"method\":\"NIST_CLEAR\"}}"

REM List pending jobs
curl -H "Authorization: Bearer TOKEN" "http://localhost:8000/api/v1/jobs?status=PENDING"
```

### Analytics

```cmd
REM Summary stats (authenticated)
curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/v1/analytics/summary

REM Public stats (no auth needed)
curl http://localhost:8000/api/v1/public/stats
```

### Verify Certificate (no auth)

```cmd
curl http://localhost:8000/api/v1/verify/CERT-your-cert-id-here
```

---

## Full Demo Sequence (SIH Presentation Order)

For a clean end-to-end demo, run these in order:

1. Open http://localhost:3000 → show landing page with live stats = 0
2. Register + login as admin, show RBAC sidebar differences
3. Register 3 devices → show Device Inventory with filters
4. Run recovery agent on test image → show certificate + evidence explorer
5. Run drive eraser on test file → show certificate + tamper detection
6. Show Hash Chain Ledger → verify a block → demonstrate chain integrity
7. Create a Case → assign investigator → link operations → show timeline
8. Open Report Center → download PDF cert → show CSV export
9. Open System Logs → show live stream as you trigger an action
10. Show Task Queue → create job → manually drive progress via Swagger → watch WS update live
11. Run global search → show typed results

---

*Built for SIH 2026 Grand Finale — Problem ID 26149*  
*Stack: FastAPI · Next.js 14 · SQLite/PostgreSQL · ECDSA P-256 · SHA-256 · NIST SP 800-88*



