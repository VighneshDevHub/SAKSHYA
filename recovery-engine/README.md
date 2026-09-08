# PRAMAAN — Recovery Engine

> Python 3.12 · Signature-based file carving · AI classification · Read-only forensic imaging  
> Deleted file recovery CLI agent for the PRAMAAN digital forensics platform.

---

## Overview

The Recovery Engine recovers deleted files from seized disk images using signature-based file carving. It is forensically sound:

- **Read-only** — the source evidence image is never modified
- **Integrity-verified** — SHA-256 hash of the source is checked before and after recovery (any change = critical failure)
- **Confidence-scored** — every recovered file gets a 0.0–1.0 confidence score
- **AI-classified** — files are categorised by type (image, document, video, archive, etc.)
- **Certified** — submits a signed operation report to PRAMAAN backend, issues a tamper-evident certificate

---

## Directory Structure

```
recovery-engine/
├── src/
│   ├── main.py                   CLI entry point, orchestrator
│   ├── api_client.py             PRAMAAN backend HTTP client
│   ├── recovery_engine.py        Top-level pipeline: read → carve → classify → score → write
│   ├── image_reader.py           Read-only evidence image access + SHA-256 integrity check
│   ├── carver.py                 Signature-based file carving (scan header/footer pairs)
│   ├── signatures.py             File signature database (header + footer bytes for 12+ types)
│   ├── classifier.py             AI-assisted file type classification from raw bytes
│   ├── confidence_scorer.py      Score each recovered file: 0.0 (poor) to 1.0 (excellent)
│   └── report_builder.py         Build operation report dict for submission
├── tests/
│   ├── conftest.py               pytest fixtures (synthetic test images)
│   ├── test_carver.py
│   ├── test_classifier.py
│   ├── test_confidence_scorer.py
│   ├── test_recovery_engine.py
│   └── test_report_builder.py
├── make_test_evidence.py         Script to generate a synthetic test evidence image
├── recovered/                    Default output directory (auto-created)
└── requirements.txt
```

---

## Installation

```bash
pip install -r recovery-engine/requirements.txt
```

Requirements: `httpx>=0.27`, `pytest>=8.3`, `Pillow>=10.4`

---

## Usage

### Basic Recovery

```bash
# Windows CMD
python -m recovery-engine.src.main ^
  --image C:\ForensicImages\seized_drive.dd ^
  --output-dir C:\Recovered\Case-2026-001 ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword

# macOS / Linux
python -m recovery-engine.src.main \
  --image /evidence/seized_drive.dd \
  --output-dir /recovered/case-2026-001 \
  --email investigator@pramaan.gov.in \
  --password YourPassword
```

### Generate a Test Evidence Image

```bash
cd recovery-engine
python make_test_evidence.py
# Creates: seized_drive.dd (synthetic image with embedded JPEG, PDF, ZIP)
```

Then run recovery:

```bash
python -m recovery-engine.src.main \
  --image recovery-engine/seized_drive.dd \
  --output-dir recovery-engine/recovered \
  --email investigator@pramaan.gov.in \
  --password YourPassword
```

### CLI Arguments

| Argument | Required | Description |
|---|---|---|
| `--image` | Yes | Path to the evidence disk image (read-only) |
| `--output-dir` | Yes | Directory to write recovered files to |
| `--email` | Yes | PRAMAAN operator email |
| `--password` | Yes | PRAMAAN operator password |
| `--api-url` | No | Backend URL (default: `http://localhost:8000`) |

---

## Internal Pipeline

```
main.py
    │
    ├── 1. image_reader.open(image_path)
    │         └── Open in READ-ONLY binary mode
    │         └── Compute source SHA-256 BEFORE any operation
    │
    ├── 2. carver.carve(image_reader, signatures)
    │         └── Stream the image in chunks
    │         └── For each signature (header bytes):
    │               ├── Scan for header match at current offset
    │               └── If found: scan forward for footer match
    │                     └── Extract bytes between header and footer
    │                           → CarvingResult { offset, size, file_type, raw_bytes }
    │
    ├── 3. classifier.classify(carving_result)
    │         └── Examine raw bytes for deeper type hints
    │         └── Returns: { category: "image"|"document"|"video"|"archive"|"unknown" }
    │
    ├── 4. confidence_scorer.score(carving_result)
    │         └── Factors: header valid, footer found, file size plausible, 
    │                       internal structure valid (e.g. JPEG entropy check)
    │         └── Returns: float 0.0–1.0
    │
    ├── 5. Write recovered files to output_dir
    │         └── Filename: recovered_{seq:04d}_{file_type}.{ext}
    │
    ├── 6. Compute source SHA-256 AFTER recovery
    │         └── Assert source_hash_before == source_hash_after
    │         └── If not equal: CRITICAL error — evidence integrity violated
    │
    ├── 7. report_builder.build_report(recovery_summary, ...)
    │
    └── 8. ApiClient.submit_operation_report(report)
              └── POST /api/v1/operations → Certificate issued
```

---

## File Signatures Supported

`signatures.py` contains header/footer byte patterns for the following file types:

| File Type | Header (hex) | Footer (hex) | Notes |
|---|---|---|---|
| JPEG | `FF D8 FF` | `FF D9` | Most common image format |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `AE 42 60 82` | Lossless image |
| PDF | `25 50 44 46` (`%PDF`) | `25 25 45 4F 46` (`%%EOF`) | Document |
| ZIP | `50 4B 03 04` | `50 4B 05 06` | Archive, DOCX, XLSX container |
| GIF | `47 49 46 38` (`GIF8`) | `00 3B` | Animated/static image |
| BMP | `42 4D` | _(size-based)_ | Windows bitmap |
| MP4 | `66 74 79 70` at offset 4 | _(size-based)_ | Video |
| AVI | `52 49 46 46` (`RIFF`) | _(size-based)_ | Video |
| MP3 | `FF FB` or `49 44 33` (`ID3`) | _(size-based)_ | Audio |
| DOCX | _(ZIP container)_ | — | MS Word (ZIP-based) |
| XLSX | _(ZIP container)_ | — | MS Excel (ZIP-based) |
| SQLite | `53 51 4C 69 74 65` | _(size-based)_ | SQLite database |

New signatures can be added to `signatures.py` without modifying any other file.

---

## Confidence Scoring

The confidence scorer evaluates each carved file on multiple dimensions:

| Check | Weight | Description |
|---|---|---|
| Header match | 0.4 | Exact header bytes matched (required) |
| Footer match | 0.3 | Closing footer bytes found |
| Size plausible | 0.15 | File size within type-specific expected range |
| Internal structure | 0.15 | First N bytes pass a quick structure validation |

```
Score 0.90–1.00: High confidence — likely complete, valid file
Score 0.70–0.89: Good confidence — probably usable
Score 0.50–0.69: Fair — may be truncated or corrupted
Score 0.00–0.49: Low confidence — fragment only, likely unusable
```

---

## Evidence Integrity Guarantee

The recovery engine computes SHA-256 of the source evidence image at two points:

```
source_hash_before = SHA-256(image_path)  ← before any carving
... carving happens (read-only) ...
source_hash_after  = SHA-256(image_path)  ← after carving complete

if source_hash_before != source_hash_after:
    CRITICAL: "source hash changed — evidence integrity violated"
```

Both hashes are included in the operation report and the certificate. This proves to a court that the forensic investigation did not alter the evidence.

---

## Operation Report

```json
{
  "operation_type": "RECOVERY",
  "target_description": "seized_drive.dd",
  "started_at": "2026-09-08T10:00:00Z",
  "completed_at": "2026-09-08T10:01:47Z",
  "success": true,
  "details": {
    "files_recovered": 8,
    "avg_confidence": 0.81,
    "classifications": {
      "image": 4,
      "document": 2,
      "archive": 1,
      "unknown": 1
    },
    "source_hash_before": "a3f2c1...",
    "source_hash_after": "a3f2c1...",
    "integrity_preserved": true
  }
}
```

---

## Running Tests

```bash
cd recovery-engine
pytest tests/ -v
```

Tests use synthetic in-memory images generated by `conftest.py`. No real disk images required. Cross-platform.

---

## Output Files

Recovered files are written to the `--output-dir`:

```
recovered/
├── recovered_0000_jpeg.jpg      confidence: 0.92
├── recovered_0001_pdf.pdf       confidence: 0.85
├── recovered_0002_zip.zip       confidence: 0.78
├── recovered_0003_jpeg.jpg      confidence: 0.71
└── ...
```

These files are then viewable in the PRAMAAN Evidence Explorer (case detail page → Evidence Explorer tab), categorised by type.

---

## Forensic Compliance

This tool is designed to comply with:

- **ISO/IEC 27037:2012** — Guidelines for identification, collection, acquisition and preservation of digital evidence
- **SWGDE Best Practices for Computer Forensics** — read-only acquisition principle
- **Indian IT (Amendment) Act 2008** — admissibility requirements for electronic evidence
- **Indian Evidence Act 2023** (Section 63) — electronic records as evidence

The SHA-256 source integrity check and the ECDSA-signed certificate together create an auditable, tamper-evident record suitable for court submission.

---

## Security Notes

- The evidence image is **never opened with write permissions**. `image_reader.py` uses `open(path, 'rb')`.
- The `operator` field in the report is always overridden by the authenticated email on the server — cannot be impersonated.
- Recovered files are written to `--output-dir` (a different location) — the source image is untouched.
- The signing private key is never held by this agent.

---

## Suggested Improvements

1. Add `--min-confidence FLOAT` flag to filter out low-confidence recoveries
2. Add `--types JPEG,PDF` flag to carve specific file types only
3. Add `--job-id` flag to claim and complete a PRAMAAN task queue job autonomously
4. Add NTFS MFT ($MFT) parsing for metadata-assisted recovery (higher accuracy)
5. Add EXT4 journal parsing for Linux disk images
6. Add AI model (ResNet/MobileNet) for image content classification (weapons, documents, currency)
7. Support split evidence images (E01/EWF format) via `libewf` bindings
8. Add parallel carving for large images using Python `multiprocessing`
9. Generate per-file hashes (MD5 + SHA-256) for each recovered file in the report
