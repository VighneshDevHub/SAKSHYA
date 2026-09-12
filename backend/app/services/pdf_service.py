"""
Certificate / forensic report PDF generation, covering all three
operation types with one shared layout engine. Each type gets:
- A different title ("Certificate of Secure Drive Erasure" vs.
  "Forensic Recovery Report", etc.) — because a recovery report and an
  erasure certificate are conceptually different documents even though
  they share the same trust mechanism underneath.
- Type-specific fields rendered from the record's `details` JSON.
- The same QR code + signature/hash footer, since the source of trust
  (live re-verification) is identical regardless of operation type.

As with TrustWipe's Phase 3: the PDF is a convenience artifact, not the
source of trust. Anyone could edit a PDF's printed text. The QR code
always points back to a live re-verification against the signed
database record — that's what actually can't be faked.
"""
import io

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.core.config import get_settings

settings = get_settings()

PAGE_WIDTH, PAGE_HEIGHT = A4

TITLES = {
    "DRIVE_ERASE": "CERTIFICATE OF SECURE DRIVE ERASURE",
    "FILE_ERASE": "CERTIFICATE OF SECURE FILE & FOLDER ERASURE",
    "RECOVERY": "FORENSIC FILE RECOVERY REPORT",
}


def _build_qr_image(verify_url: str) -> io.BytesIO:
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def _type_specific_rows(operation_type: str, details: dict) -> list[tuple[str, str]]:
    """Returns (label, value) pairs specific to this operation type,
    pulled from the flexible `details` JSON. Missing keys degrade
    gracefully to 'N/A' rather than crashing PDF generation."""
    if operation_type == "DRIVE_ERASE":
        return [
            ("Device Type", str(details.get("device_type", "N/A"))),
            ("Wipe Method", str(details.get("method", "N/A"))),
            ("Passes", str(details.get("passes", "N/A"))),
            ("Bytes Processed", str(details.get("bytes_processed", "N/A"))),
            ("Verification Passed", "YES" if details.get("verification_passed") else "NO"),
        ]
    if operation_type == "FILE_ERASE":
        return [
            ("Files Deleted", str(details.get("files_deleted", "N/A"))),
            ("Files Failed", str(details.get("files_failed", "N/A"))),
            ("Metadata Scrubbed", "YES" if details.get("metadata_scrubbed") else "NO"),
            ("Content Bytes Overwritten", str(details.get("total_bytes_overwritten", "N/A"))),
            ("Free Space Bytes Overwritten", str(details.get("freespace_bytes_overwritten", "N/A"))),
        ]
    if operation_type == "RECOVERY":
        return [
            ("Evidence Integrity Preserved", "YES" if details.get("evidence_integrity_preserved") else "NO"),
            ("Files Recovered", str(details.get("files_recovered", "N/A"))),
            ("Average Confidence", str(details.get("avg_confidence", "N/A"))),
            ("Classifications", str(details.get("classifications", "N/A"))),
        ]
    return []


def _draw_recovered_files_table(c: canvas.Canvas, details: dict, x: float, y: float) -> float:
    """RECOVERY reports get an extra per-file table. Caps displayed rows
    to keep the PDF a reasonable length — the full list is always
    available via the JSON API regardless of what's printed here."""
    files = details.get("files", [])
    if not files:
        return y

    MAX_ROWS = 15
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y, "Recovered Files (Type / Size / Confidence):")
    y -= 5 * mm

    c.setFont("Courier", 7.5)
    for f in files[:MAX_ROWS]:
        line = f"  {f.get('type', '?'):6s}  {f.get('size', 0):>10} bytes   confidence: {f.get('confidence', 0)}"
        c.drawString(x, y, line)
        y -= 4 * mm

    if len(files) > MAX_ROWS:
        c.setFont("Helvetica-Oblique", 7.5)
        c.drawString(x, y, f"... and {len(files) - MAX_ROWS} more (see full JSON record via API)")
        y -= 4 * mm

    return y


def generate_operation_pdf(record: dict, session=None) -> bytes:
    """`record` matches OperationRecordOut's shape (see
    app/schemas/operation.py). Returns raw PDF bytes.

    Accepts an optional async session; if provided, consults settings
    for certificate_header_text before falling back to the hardcoded
    default. Keeps the sync signature intact by never awaiting inside;
    the caller can resolve settings beforehand if needed, or we simply
    fall back when no DB session is attached (keeps legacy tests
    byte-exact).
    """
    operation_type = record["operation_type"]
    title = TITLES.get(operation_type, "OPERATION REPORT")
    verify_url = f"{settings.PUBLIC_BASE_URL}/verify/{record['certificate_id']}"
    qr_buffer = _build_qr_image(verify_url)

    header_subtitle = "Issued by PRAMAAN — NIST SP 800-88 Compliant Digital Forensics Platform"
    if session is not None:
        try:
            import asyncio
            from app.services import settings_service

            async def _resolve() -> str:
                try:
                    s = await settings_service.get_settings(session)
                    return s.certificate_header_text or header_subtitle
                except Exception:
                    return header_subtitle

            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    resolved = header_subtitle
                else:
                    resolved = loop.run_until_complete(_resolve())
            except Exception:
                resolved = header_subtitle
            if resolved and resolved.strip():
                header_subtitle = resolved
        except Exception:
            pass

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    margin = 20 * mm

    # --- Header ---
    c.setFillColor(colors.HexColor("#1a1a2e"))
    c.rect(0, PAGE_HEIGHT - 35 * mm, PAGE_WIDTH, 35 * mm, fill=True, stroke=False)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, PAGE_HEIGHT - 18 * mm, title)
    c.setFont("Helvetica", 10)
    c.drawString(
        margin, PAGE_HEIGHT - 26 * mm,
        header_subtitle,
    )

    y = PAGE_HEIGHT - 50 * mm
    c.setFillColor(colors.black)

    # --- Common fields ---
    common_rows = [
        ("Certificate ID", record["certificate_id"]),
        ("Operation Type", operation_type),
        ("Target", record["target_description"]),
        ("Started At (UTC)", str(record["started_at"])),
        ("Completed At (UTC)", str(record["completed_at"])),
        ("Success", "YES" if record["success"] else "NO"),
        ("Operator (Authenticated)", record["operator"]),
        ("Ledger Sequence #", str(record["ledger_sequence_number"])),
    ]

    label_x = margin
    value_x = margin + 60 * mm
    row_height = 8 * mm

    for label, value in common_rows:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(label_x, y, f"{label}:")
        c.setFont("Helvetica", 10)
        display_value = value if len(value) <= 55 else value[:52] + "..."
        c.drawString(value_x, y, display_value)
        y -= row_height

    # --- Type-specific fields ---
    y -= 3 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(label_x, y, f"{operation_type.replace('_', ' ').title()} Details:")
    y -= row_height

    for label, value in _type_specific_rows(operation_type, record.get("details", {})):
        c.setFont("Helvetica-Bold", 9)
        c.drawString(label_x, y, f"{label}:")
        c.setFont("Helvetica", 9)
        display_value = value if len(value) <= 55 else value[:52] + "..."
        c.drawString(value_x, y, display_value)
        y -= 6.5 * mm

    # --- Recovery-specific file table ---
    if operation_type == "RECOVERY":
        y -= 3 * mm
        y = _draw_recovered_files_table(c, record.get("details", {}), label_x, y)

    # --- Hash / signature ---
    y -= 5 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(label_x, y, "Report Hash (SHA-256):")
    y -= 5 * mm
    c.setFont("Courier", 8)
    c.drawString(label_x, y, record["report_hash"])

    y -= 8 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(label_x, y, "Digital Signature (ECDSA, truncated):")
    y -= 5 * mm
    c.setFont("Courier", 7)
    sig = record["signature"]
    c.drawString(label_x, y, sig[:80] + ("..." if len(sig) > 80 else ""))

    # --- QR code ---
    qr_size = 40 * mm
    qr_x = PAGE_WIDTH - margin - qr_size
    qr_y = 30 * mm
    c.drawImage(ImageReader(qr_buffer), qr_x, qr_y, width=qr_size, height=qr_size, preserveAspectRatio=True)
    c.setFont("Helvetica", 8)
    c.drawCentredString(qr_x + qr_size / 2, qr_y - 6 * mm, "Scan to verify authenticity")

    # --- Footer ---
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.grey)
    c.drawString(margin, 15 * mm, f"Verify independently at: {verify_url}")
    c.drawString(
        margin, 10 * mm,
        "This report is cryptographically signed. Any alteration to the underlying "
        "record will cause verification to fail.",
    )

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()
