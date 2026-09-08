# PRAMAAN — Drive Eraser Agent

> Python 3.12 · NIST SP 800-88 Rev.1 · ECDSA-signed certificates  
> Secure drive sanitisation CLI agent for the PRAMAAN digital forensics platform.

---

## Overview

The Drive Eraser Agent is a command-line tool that sanitises physical drives and file targets according to NIST SP 800-88 Rev.1. After wiping, it submits a signed operation report to the PRAMAAN backend, which issues a tamper-evident digital certificate.

**Supports:**
- Windows physical disks (`Get-PhysicalDisk` DeviceId)
- Linux block devices (`/dev/sdb`, etc.)
- File targets (`.img`, `.bin`) — safe demo mode, no real hardware required

**Standards implemented:**
- NIST Clear (multi-pass byte overwrite — all media types)
- NIST Purge (ATA Secure Erase command — SSD/NVMe, if supported)
- Crypto Erase (encrypt-then-discard — self-encrypting drives)

---

## Directory Structure

```
drive-eraser-agent/
├── src/
│   ├── main.py                   CLI entry point, orchestrator
│   ├── api_client.py             PRAMAAN backend HTTP client
│   ├── method_selector.py        Auto-select wipe method from device capabilities
│   ├── report_builder.py         Build operation report dict for submission
│   ├── verifier.py               Pre/post wipe sampling + read-back verification
│   ├── detectors/
│   │   ├── base.py               DetectedDevice dataclass
│   │   ├── file_target.py        Safe demo mode (file as virtual device)
│   │   ├── linux_block_device.py Linux /dev/sdX detection via /proc/partitions
│   │   └── windows_block_device.py Windows Get-PhysicalDisk via WMI/PowerShell
│   └── wipers/
│       ├── base.py               WipeResult dataclass, BaseWiper ABC
│       ├── clear.py              NIST Clear — multi-pass overwrite (0x00, 0xFF, random)
│       ├── purge.py              NIST Purge — ATA Secure Erase command
│       └── crypto_erase.py       Crypto Erase — overwrite encryption key
├── tests/
│   ├── test_detectors.py
│   ├── test_wipers.py
│   ├── test_verifier.py
│   ├── test_report_builder.py
│   ├── test_windows_block_device.py
│   └── test_main_windows_path.py
└── requirements.txt
```

---

## Installation

```bash
# From project root (shared venv)
pip install -r drive-eraser-agent/requirements.txt
```

Requirements: `httpx>=0.27`, `pytest>=8.3`

---

## Usage

### Safe Demo Mode (Recommended for Testing)

Wipes a regular file. No real hardware accessed. Safe on any OS.

```bash
# Windows CMD
python -m drive-eraser-agent.src.main ^
  --target test_volume.img ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword

# macOS / Linux
python -m drive-eraser-agent.src.main \
  --target test_volume.img \
  --email investigator@pramaan.gov.in \
  --password YourPassword
```

### Dry Run (Detect Only — Never Wipes)

```bash
python -m drive-eraser-agent.src.main \
  --target test_volume.img \
  --email investigator@pramaan.gov.in \
  --password YourPassword \
  --dry-run
```

Output shows device metadata only. Nothing is touched.

### Real Device — Windows

```powershell
# Step 1: Find the disk DeviceId
Get-PhysicalDisk | Select DeviceId, FriendlyName, SerialNumber, MediaType, BusType, Size

# Step 2: Dry run first (ALWAYS)
python -m drive-eraser-agent.src.main `
  --target 1 `
  --email investigator@pramaan.gov.in `
  --password YourPassword `
  --real-device `
  --dry-run

# Step 3: Real wipe (IRREVERSIBLE)
python -m drive-eraser-agent.src.main `
  --target 1 `
  --email investigator@pramaan.gov.in `
  --password YourPassword `
  --real-device
```

> ⚠️ `--target` is the **DeviceId** (e.g. `1`), NOT a drive letter.

### Real Device — Linux

```bash
# Step 1: Identify disk
lsblk

# Step 2: Dry run (ALWAYS)
python -m drive-eraser-agent.src.main \
  --target /dev/sdb \
  --email investigator@pramaan.gov.in \
  --password YourPassword \
  --real-device \
  --dry-run

# Step 3: Real wipe (IRREVERSIBLE — requires root/sudo)
sudo python -m drive-eraser-agent.src.main \
  --target /dev/sdb \
  --email investigator@pramaan.gov.in \
  --password YourPassword \
  --real-device
```

### CLI Arguments

| Argument | Required | Description |
|---|---|---|
| `--target` | Yes | File path, Linux block device, or Windows DeviceId |
| `--email` | Yes | PRAMAAN operator email (used for JWT auth) |
| `--password` | Yes | PRAMAAN operator password |
| `--api-url` | No | Backend URL (default: `http://localhost:8000`) |
| `--real-device` | No | Treat `--target` as a real hardware device |
| `--dry-run` | No | Detect and print info only — never wipes |

---

## Internal Flow

```
main.py
    │
    ├── 1. Select detector (FileTargetDetector / WindowsBlockDeviceDetector / LinuxBlockDeviceDetector)
    │
    ├── 2. detector.detect(target)
    │         └── Returns: DetectedDevice { device_type, serial, model, size_bytes,
    │                                        supports_encryption, firmware }
    │
    ├── 3. select_wiper(device_type, supports_encryption)
    │         └── Returns: BaseWiper instance (ClearWiper / PurgeWiper / CryptoEraseWiper)
    │
    ├── 4. verifier.capture_pre_wipe_samples(target, size_bytes)
    │         └── Returns: list of (offset, bytes) tuples from random locations
    │
    ├── 5. wiper.wipe(target, size_bytes)
    │         └── Returns: WipeResult { passes, bytes_processed, method_name }
    │
    ├── 6. verifier.verify_wipe(target, pre_wipe_samples)
    │         └── Returns: VerificationResult { passed, samples_checked, samples_changed }
    │
    ├── 7. report_builder.build_report(...)
    │         └── Returns: dict with all fields for OperationReportIn schema
    │
    └── 8. ApiClient.submit_operation_report(report)
              └── POST /api/v1/operations (authenticated with JWT)
              └── Returns: { certificate_id, ledger_sequence_number, ... }
```

---

## Wipe Methods

### NIST Clear

Multi-pass overwrite. Suitable for all media types.

| Pass | Pattern |
|---|---|
| 1 | 0x00 (all zeros) |
| 2 | 0xFF (all ones) |
| 3 | Random bytes |

Compliant with NIST SP 800-88 Rev.1 §2.4 (Clear).

### NIST Purge

Issues the ATA Secure Erase command directly to the drive controller. The drive firmware erases all cells including HPA (Host Protected Area). More thorough than overwrite for SSDs due to wear levelling.

Requires kernel-level access. Falls back to NIST Clear if the command is unsupported.

### Crypto Erase

For Self-Encrypting Drives (SED). Replaces the internal media encryption key, rendering all data cryptographically inaccessible. Near-instantaneous.

Compliant with NIST SP 800-88 Rev.1 §2.6 (Cryptographic Erase).

---

## Verification

After wiping, `verifier.py` samples `N` random byte regions:
- **Before wipe**: captures raw bytes at random offsets
- **After wipe**: reads the same offsets
- **Result**: `samples_changed / samples_checked` — all should be overwritten

The verification result is included in the operation report and the issued certificate.

---

## Output Certificate

After a successful wipe, the agent prints:

```
[report] Certificate issued: CERT-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
[report] Recorded operator (authenticated): investigator@pramaan.gov.in
[report] Ledger sequence number: 7
```

Verify at: `http://localhost:3000/verify/CERT-<id>`  
Download PDF: `http://localhost:8000/api/v1/operations/CERT-<id>/pdf`

---

## Running Tests

```bash
cd drive-eraser-agent
pytest tests/ -v
```

Tests use only file-based targets. No hardware required. All tests run on Windows, Linux, and macOS.

---

## Security Notes

- The `operator` field in the submitted report is ignored by the backend — it always uses the authenticated user's email from the JWT. This prevents impersonation.
- Never run with `--real-device` on your OS boot disk or any disk you need.
- The `--dry-run` flag is a hard stop before any write operation. Always use it first.
- The private signing key is never held by the agent — signing happens server-side.

---

## Suggested Improvements

1. Add `--job-id` flag to claim and complete a PRAMAAN task queue job autonomously
2. Add `--method` flag to override auto-selected wipe method
3. Support DoD 5220.22-M (7-pass) as an additional wipe option
4. Add HPA (Host Protected Area) detection and erasure on Linux
5. Add DCO (Device Configuration Overlay) removal on supported drives
6. Generate a local PDF certificate even if the backend is unreachable (offline mode)
