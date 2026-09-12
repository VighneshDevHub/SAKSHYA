# ForensicGuard Judge Demonstration Guide

This guide describes the safest end-to-end demonstration using the current repository. It separates working capabilities from planned extensions so the demo remains technically accurate.

## 1. Current Capability Status

| Capability | Status | Current implementation |
|---|---|---|
| Automatic device monitoring | Implemented for Windows polling | Device Inventory checks the FastAPI host every 5 seconds. `Get-PhysicalDisk` discovers connected media; disks absent from the next scan become `DISCONNECTED`. |
| USB/SSD/HDD/NVMe classification | Implemented | Backend maps Windows bus and media values to inventory types. |
| Dashboard refresh | Implemented | Device rows refresh automatically while the page is open. |
| Raw recovery carving | Implemented | Recovery engine scans read-only evidence images by file signatures and writes recovered copies to a separate directory. |
| FAT32, NTFS, exFAT | Partial | Raw carving works when the image is supplied, even without filesystem metadata. Filesystem-aware directory recovery and deleted-entry parsing are not currently implemented. |
| Real secure overwrite | Implemented for safe file targets | Drive eraser performs actual overwrite/read-back verification for file targets. Never use a production disk. |
| ATA Secure Erase / NVMe Sanitize | Future integration | Hardware firmware commands are not invoked by the current agent. |
| Evidence manifest | Implemented | Evidence Explorer lists recovered filename, size, confidence, metadata, and SHA-256. |
| Evidence preview | Partial | The current explorer is a manifest/metadata view; binary PDF, DOCX, JPG, PNG, MP4, and TXT preview is not yet wired to a download/content endpoint. |
| Chain of custody | Partial | Case, investigator, evidence, timeline, certificate, ledger, and operation links exist. Per-file investigator/device/case display requires richer recovery evidence metadata. |
| AI assistant | Not implemented | Use universal search and evidence filters during the current demo. Natural-language assistant is a future extension. |
| Case timeline | Implemented | Case detail includes a visual timeline and audited notes. |
| Evidence search | Partial | Platform search covers cases, devices, certificates, operations, and officers. File-level filename/extension/hash/confidence/date search is limited to the evidence manifest. |
| Dashboard analytics | Implemented | Summary KPIs and operation timeseries are backend-backed. |
| Notifications | Implemented | Notification bell supports unread count, mark read, and mark all read. |
| Dark/light mode | Implemented | Header toggle and Settings theme controls are available. |

## 2. Prerequisites

- Windows 10/11 for automatic physical disk monitoring.
- Python 3.11+, Node.js 18+, PowerShell 5.1+.
- A disposable USB drive for the device demonstration.
- A disposable test file or image for secure erase. Do not use a production disk.
- Backend and frontend dependencies installed.

Start the services in separate PowerShell windows:

```powershell
# Terminal A
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

```powershell
# Terminal B
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\frontend"
npm run dev
```

Open `http://localhost:3000` and log in with a valid email domain, for example `investigator@ntro.gov.in`. Public registration currently allows selecting a role for demonstration purposes.

## 3. Ten-Minute Judge Flow

### Step 1: Login and show role access

1. Open `/login`.
2. Register or sign in as an Investigator or Administrator.
3. Show the role badge beside the operator email.
4. Explain that the sidebar is filtered from the JWT role and the backend still enforces every permission.

### Step 2: Demonstrate automatic device monitoring

1. Open `/dashboard/devices`.
2. Keep the page visible. The status strip should say `Automatic host monitoring active`.
3. Note the current device rows, serial, manufacturer, model, media type, connection, capacity, health, and status.
4. Safely insert the disposable USB drive.
5. Within approximately 5 seconds, the row should appear or change to `CONNECTED`.
6. Remove the disposable USB drive.
7. Within approximately 5 seconds, the existing row should change to `DISCONNECTED`.
8. Repeat with an SSD/HDD only if the test machine exposes them through Windows `Get-PhysicalDisk`.

Important: the browser does not scan hardware. The FastAPI process scans the machine where it is running. If the backend runs in Docker or on another host, detection applies to that host.

### Step 3: Create a case

1. Open `/dashboard/cases`.
2. Create `SIH Disposable USB Recovery Demonstration`.
3. Open the generated `FG-YYYY-XXXXXX` case.
4. Add evidence with a label such as `Demo USB Evidence` and reference `USB-SIH-DEMO-01`.
5. Add a timeline note: `Evidence sealed and received for controlled demonstration.`

### Step 4: Run safe recovery

Prepare a disposable evidence image containing test files. The recovery engine reads the image and writes results elsewhere:

```powershell
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\recovery-engine"
..\.venv\Scripts\python.exe -m pytest -q
```

For the live recovery demonstration, use the recovery engine's existing CLI help to identify the image and output arguments:

```powershell
..\.venv\Scripts\python.exe -m src.main --help
```

Explain accurately: the current engine performs signature carving for formats such as JPEG, PNG, PDF, GIF, and ZIP. It does not yet parse deleted directory entries separately for FAT32, NTFS, or exFAT.

### Step 5: Inspect evidence and timeline

1. Attach the recovery result as a case evidence item with recovered file details.
2. Open the Evidence Explorer section.
3. Filter Images, Videos, Documents, or Archives.
4. Expand a file row to show metadata and full SHA-256.
5. Open the Timeline section to show evidence added, notes, assignments, linked operations, and status changes.

The current Evidence Explorer is a manifest view. Do not promise binary in-browser preview until a content/download endpoint is added.

### Step 6: Run a real safe overwrite

Create a disposable file target outside the repository:

```powershell
Set-Location "$env:TEMP"
[IO.File]::WriteAllBytes("forensicguard-demo-target.bin", (0..1048575 | ForEach-Object { [byte]($_ % 251) }))
```

Run the drive eraser in its safe file-target mode and inspect `--help` first:

```powershell
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\drive-eraser-agent"
..\.venv\Scripts\python.exe -m src.main --help
```

Use the safe target path and do not pass any real-device flag. Demonstrate the output showing method selection, overwrite, read-back verification, certificate ID, and ledger sequence. Explain that ATA Secure Erase and NVMe Sanitize are future hardware integrations.

### Step 7: Verify trust and reporting

1. Open `/dashboard/reports` and show the operation certificate.
2. Open `/dashboard/audit` and show the signed audit record.
3. Open `/dashboard/ledger`, inspect the previous hash and entry hash.
4. Verify the certificate from `/verify`.
5. Show the notification bell for certificate generation or job failure.

### Step 8: Show analytics and accessibility

1. Return to `/dashboard`.
2. Show recovered file count, recovered data, today's operations, device total, success rate, failure rate, and storage sanitized.
3. Change the timeseries metric to Recoveries or Erasures.
4. Toggle the light/dark theme from the header.

## 4. What Not To Do During the Demo

- Do not use a production USB, SSD, HDD, or NVMe disk.
- Do not use `--real-device` unless a dedicated lab protocol and verified disposable disk are in place.
- Do not claim filesystem-aware recovery for FAT32/NTFS/exFAT; describe the current behavior as filesystem-independent raw carving.
- Do not claim AI classification or binary file preview as completed features; they are planned extensions.
- Do not run tamper tests against persistent production keys or a production database.

## 5. Automated Checks Before Presentation

```powershell
Set-Location "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\.venv\Scripts\python.exe -m pytest -q

Set-Location ..\drive-eraser-agent
..\.venv\Scripts\python.exe -m pytest -q

Set-Location ..\file-folder-eraser
..\.venv\Scripts\python.exe -m pytest -q

Set-Location ..\recovery-engine
..\.venv\Scripts\python.exe -m pytest -q

Set-Location ..\frontend
npx tsc --noEmit
npm run build
```

## 6. Recommended Next Implementation Order

1. Add a backend device-monitor worker and notification events for connect/remove transitions instead of relying only on browser polling.
2. Add a secure evidence content endpoint with authorization and preview metadata for PDF, DOCX, JPG, PNG, MP4, and TXT.
3. Extend recovery evidence details with case ID, device ID, investigator, recovery timestamp, and per-file verification status.
4. Add file-level evidence search and a constrained assistant that translates approved phrases into existing search filters.
5. Add filesystem-specific FAT32, NTFS, and exFAT deleted-entry adapters with fixture images and tests.
6. Add explicit hardware erase adapters for ATA/NVMe only after a dedicated lab safety review.
