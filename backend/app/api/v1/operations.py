import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_signing_keys
from app.core.crypto import sign_payload
from app.models.operation_record import LedgerEntry, OperationRecord
from app.models.user import User
from app.schemas.operation import OperationRecordOut, OperationReportIn
from app.services import ledger_service, notification_service
from app.services.pdf_service import generate_operation_pdf

router = APIRouter(prefix="/operations", tags=["operations"])


def _to_out(record: OperationRecord, sequence_number: int) -> OperationRecordOut:
    return OperationRecordOut(
        certificate_id=record.certificate_id,
        operation_type=record.operation_type,
        target_description=record.target_description,
        started_at=record.started_at,
        completed_at=record.completed_at,
        success=record.success,
        operator=record.operator,
        details=record.details,
        report_hash=record.report_hash,
        signature=record.signature,
        ledger_sequence_number=sequence_number,
        created_at=record.created_at,
    )


@router.post("", response_model=OperationRecordOut, status_code=201)
async def submit_operation_report(
    report: OperationReportIn,
    db: AsyncSession = Depends(get_db),
    signing_keys: tuple[str, str] = Depends(get_signing_keys),
    current_user: User = Depends(get_current_user),
) -> OperationRecordOut:
    """Shared entry point for ALL THREE modules — now requires an
    authenticated operator. A drive-eraser agent, a file-eraser service,
    and a recovery engine all POST here with a different
    `operation_type` and their own module-specific `details` payload —
    the signing and ledger logic underneath is identical.

    SECURITY NOTE: the `operator` field is NOT taken from the client's
    request body — it is always set to the authenticated user's email.
    Previously (pre-Phase-5) `operator` was arbitrary self-reported text
    with no verification, meaning anyone could submit a record claiming
    to be any operator they liked. Now it is cryptographically tied to
    a real login, which is what makes it meaningful in an audit log.
    """
    private_key_pem, _public_key_pem = signing_keys

    # certificate_id generated explicitly (not via column default) —
    # signing must happen against the FINAL value, not one assigned
    # later at flush time. See TrustWipe Phase 1 postmortem.
    record = OperationRecord(
        certificate_id=str(uuid.uuid4()),
        operation_type=report.operation_type,
        target_description=report.target_description,
        started_at=report.started_at,
        completed_at=report.completed_at,
        success=report.success,
        operator=current_user.email,  # authoritative — never trust client-claimed operator
        details=report.details,
        report_hash="",
        signature="",
    )

    report_hash, signature = sign_payload(record.to_signable_dict(), private_key_pem)
    record.report_hash = report_hash
    record.signature = signature

    db.add(record)
    await db.flush()

    ledger_entry = await ledger_service.append_to_ledger(db, record)
    await db.commit()
    await db.refresh(record)
    await db.refresh(ledger_entry)

    await notification_service.notify_cert_generated(
        db,
        operator_user_id=current_user.id,
        certificate_id=record.certificate_id,
    )

    return _to_out(record, ledger_entry.sequence_number)


@router.get("", response_model=list[OperationRecordOut])
async def list_operations(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    limit: int = 100,
    offset: int = 0,
) -> list[OperationRecordOut]:
    """Powers the unified dashboard's audit table — shows records from
    ALL THREE modules together, newest first. Protected: this is the
    full operational history, distinct from single-certificate lookup
    (which stays public for independent verification)."""
    result = await db.execute(
        select(OperationRecord, LedgerEntry)
        .join(LedgerEntry, LedgerEntry.operation_record_id == OperationRecord.id)
        .order_by(desc(LedgerEntry.sequence_number))
        .limit(limit)
        .offset(offset)
    )
    rows = result.all()
    return [_to_out(record, ledger_entry.sequence_number) for record, ledger_entry in rows]


@router.get("/{certificate_id}", response_model=OperationRecordOut)
async def get_operation(
    certificate_id: str, db: AsyncSession = Depends(get_db)
) -> OperationRecordOut:
    result = await db.execute(
        select(OperationRecord, LedgerEntry)
        .join(LedgerEntry, LedgerEntry.operation_record_id == OperationRecord.id)
        .where(OperationRecord.certificate_id == certificate_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Operation record not found")

    record, ledger_entry = row
    return _to_out(record, ledger_entry.sequence_number)


@router.get("/{certificate_id}/pdf")
async def get_operation_pdf(
    certificate_id: str, db: AsyncSession = Depends(get_db)
) -> Response:
    """Public — same reasoning as the JSON GET endpoint and the live
    verify endpoint: anyone who has the certificate ID should be able
    to retrieve the report without needing an account. The PDF's
    trustworthiness comes from its embedded QR code re-verifying live,
    not from requiring login to view it."""
    result = await db.execute(
        select(OperationRecord, LedgerEntry)
        .join(LedgerEntry, LedgerEntry.operation_record_id == OperationRecord.id)
        .where(OperationRecord.certificate_id == certificate_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Operation record not found")

    record, ledger_entry = row
    out = _to_out(record, ledger_entry.sequence_number)
    pdf_bytes = generate_operation_pdf(out.model_dump(mode="json"))

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="report_{certificate_id}.pdf"'},
    )
