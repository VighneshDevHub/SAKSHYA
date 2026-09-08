import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_signing_keys
from app.core.crypto import verify_signature
from app.models.operation_record import LedgerEntry, OperationRecord
from app.schemas.operation import VerificationResult
from app.services import ledger_service, notification_service

router = APIRouter(prefix="/verify", tags=["verify"])


@router.get("/{certificate_id}", response_model=VerificationResult)
async def verify_operation(
    certificate_id: str,
    db: AsyncSession = Depends(get_db),
    signing_keys: tuple[str, str] = Depends(get_signing_keys),
) -> VerificationResult:
    """Works identically regardless of whether this certificate came
    from the drive eraser, file eraser, or recovery module — the trust
    check doesn't care which module produced the record."""
    _private_key_pem, public_key_pem = signing_keys

    result = await db.execute(
        select(OperationRecord, LedgerEntry)
        .join(LedgerEntry, LedgerEntry.operation_record_id == OperationRecord.id)
        .where(OperationRecord.certificate_id == certificate_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Operation record not found")

    record, ledger_entry = row

    signature_valid = verify_signature(
        record.to_signable_dict(), record.signature, public_key_pem
    )
    chain_result = await ledger_service.verify_chain_integrity(
        db, up_to_sequence=ledger_entry.sequence_number
    )

    overall = signature_valid and chain_result.valid

    if overall:
        detail = "Record is authentic and has not been tampered with."
    elif not signature_valid:
        detail = "Signature mismatch — this record's data does not match its original signature."
    else:
        detail = (
            f"Ledger chain broken at sequence {chain_result.broken_at_sequence}: "
            f"{chain_result.reason}"
        )

    if not overall:
        await notification_service.notify_tamper_detected_broadcast(
            db,
            detail_str=detail,
        )

    return VerificationResult(
        certificate_id=certificate_id,
        signature_valid=signature_valid,
        chain_intact=chain_result.valid,
        overall_verified=overall,
        detail=detail,
    )
