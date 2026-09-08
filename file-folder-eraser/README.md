# PRAMAAN — File & Folder Eraser Agent

> Python 3.12 · Multi-pass overwrite · Metadata scrubbing · ECDSA-signed certificates  
> Selective secure file and folder deletion CLI agent for the PRAMAAN platform.

---

## Overview

The File & Folder Eraser Agent securely deletes specific files and directory trees from a target system. Unlike drive-level erasure, this agent:

- Targets individual files or nested folders, not entire drives
- Overwrites file content multiple times before deletion (defeats undelete tools)
- Scrubs filesystem metadata — timestamps, extended attributes, file names
- Overwrites slack space left in recovered sectors
- Issues a signed PRAMAAN certificate for every erasure session

**Use cases:**
- Removing sensitive files from a seized device before return
- Sanitising evidence copies after case closure
- Secure deletion of temporary forensic work products
- Compliant deletion for data subject access requests

---

## Directory Structure

```
file-folder-eraser/
├── src/
│   ├── main.py                   CLI entry point
│   ├── api_client.py             PRAMAAN backend HTTP client
│   ├── batch_runner.py           Orchestrate multi-file erasure in order
│   ├── selective_deleter.py      Multi-pass overwrite + unlink per file
│   ├── metadata_scrubber.py      Zero timestamps, extended attrs, rename before delete
│   ├── freespace_overwriter.py   Fill free/slack space with random bytes post-deletion
│   └── report_builder.py         Build operation report dict for submission
├── tests/
│   ├── test_batch_runner.py
│   ├── test_selective_deleter.py
│   ├── test_metadata_scrubber.py
│   ├── test_freespace_overwriter.py
│   └── test_report_builder.py
└── requirements.txt
```

---

## Installation

```bash
pip install -r file-folder-eraser/requirements.txt
```

Requirements: `httpx>=0.27`, `pytest>=8.3`

---

## Usage

### Erase a Single File

```bash
# Windows CMD
python -m file-folder-eraser.src.main ^
  --target C:\Evidence\sensitive_document.docx ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword

# macOS / Linux
python -m file-folder-eraser.src.main \
  --target /evidence/sensitive_document.docx \
  --email investigator@pramaan.gov.in \
  --password YourPassword
```

### Erase an Entire Folder

```bash
python -m file-folder-eraser.src.main \
  --target /evidence/case-2026-001/working-copies \
  --email investigator@pramaan.gov.in \
  --password YourPassword
```

All files in the folder and subfolders are erased recursively.

### CLI Arguments

| Argument | Required | Description |
|---|---|---|
| `--target` | Yes | Path to file or directory to erase |
| `--email` | Yes | PRAMAAN operator email |
| `--password` | Yes | PRAMAAN operator password |
| `--api-url` | No | Backend URL (default: `http://localhost:8000`) |

---

## Internal Flow

```
main.py
    │
    ├── 1. batch_runner.build_file_list(target)
    │         └── Recursively enumerate all files under target path
    │
    ├── 2. For each file: selective_deleter.secure_delete(file_path)
    │         ├── Open file in write-binary mode
    │         ├── Pass 1: overwrite with 0x00 bytes (file size)
    │         ├── Pass 2: overwrite with 0xFF bytes
    │         ├── Pass 3: overwrite with random bytes (os.urandom)
    │         ├── Flush and fsync (force OS to write to storage)
    │         └── os.unlink(file_path)
    │
    ├── 3. metadata_scrubber.scrub(file_path)  (called before unlink)
    │         ├── os.utime(file_path, (0, 0)) — zero timestamps
    │         ├── Rename to random temp name (obscures original filename in journal)
    │         └── Remove extended attributes (xattr) if present
    │
    ├── 4. freespace_overwriter.overwrite_slack(target_directory)
    │         └── Write a large random-bytes file to fill free space,
    │             then delete it (overwrites any remnant sectors)
    │
    ├── 5. report_builder.build_report(file_list, started_at, completed_at, email)
    │         └── Returns: OperationReportIn compatible dict
    │
    └── 6. ApiClient.submit_operation_report(report)
              └── POST /api/v1/operations → Certificate issued
```

---

## Erasure Details

### selective_deleter.py

The core erasure loop per file:

```
File: sensitive.docx (12,043 bytes)
    Pass 1: write 12,043 × 0x00  → flush → fsync
    Pass 2: write 12,043 × 0xFF  → flush → fsync
    Pass 3: write 12,043 × random → flush → fsync
    Rename: sensitive.docx → tmpXXXXXX
    Delete: os.unlink(tmpXXXXXX)
```

The 3-pass pattern ensures overwriting even under OS write-ahead buffering.

### metadata_scrubber.py

Filesystem metadata that could reveal file existence or original name:

| Metadata | Action |
|---|---|
| atime (last access) | Zero'd via `os.utime` |
| mtime (last modified) | Zero'd via `os.utime` |
| ctime (change time) | Zeroed where platform permits |
| Filename | Renamed to random string before unlink |
| Extended attributes | Removed (Linux: `xattr`, Windows: ADS) |

### freespace_overwriter.py

After all files are deleted, slack space may still contain remnant data:

1. Write a large file (`freespace_fill_<random>.bin`) of random bytes
2. Size = 95% of available disk free space in the target directory
3. Force flush and fsync
4. Delete the fill file

This overwrites any sectors where deleted file fragments may still reside.

---

## Operation Report

The report submitted to the backend includes:

```json
{
  "operation_type": "FILE_ERASE",
  "target_description": "/evidence/case-2026-001/working-copies",
  "started_at": "2026-09-08T10:00:00Z",
  "completed_at": "2026-09-08T10:00:12Z",
  "success": true,
  "details": {
    "file_count": 47,
    "total_bytes_overwritten": 8832043,
    "passes": 3,
    "metadata_scrubbed": true,
    "freespace_overwrite": true
  }
}
```

---

## Running Tests

```bash
cd file-folder-eraser
pytest tests/ -v
```

All tests use temporary directories and files. No real data is touched. Cross-platform (Windows, Linux, macOS).

---

## Security Notes

- The `operator` field is always set to the authenticated user's email by the backend — cannot be faked by the client.
- `fsync()` is called after each pass to guarantee writes reach the storage medium, not just the OS cache.
- The rename-before-delete step confounds filesystem journal recovery (e.g. `$LogFile` on NTFS, `ext4` journal).
- Freespace overwriting is best-effort — on SSDs with wear levelling and over-provisioning, some data may survive in inaccessible sectors. Full NIST Purge/Crypto Erase via the drive eraser agent is recommended for SSD targets.

---

## Suggested Improvements

1. Add `--passes N` flag to control overwrite pass count (default 3)
2. Add `--algorithm` flag to select DoD 5220.22-M (7-pass), Gutmann (35-pass), or custom
3. Detect SSD vs HDD and warn if freespace overwrite is insufficient for SSD
4. Add `--dry-run` mode (list files that would be erased without touching them)
5. Add `--job-id` flag to claim and complete a PRAMAAN task queue job autonomously
6. Add resume support for large batch erasures (checkpoint file)
7. Windows Volume Shadow Copy (VSS) detection and warning
