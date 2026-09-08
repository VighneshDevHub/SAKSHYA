from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.core.crypto import sha256_hex
from app.models.operation_record import LedgerEntry, OperationRecord
from app.models.user import UserRole
from app.services.ledger_service import GENESIS_HASH

router = APIRouter(prefix="/ledger", tags=["ledger"])

_ALL_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)


@router.get("/chain")
async def get_ledger_chain(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    from_seq: int = Query(default=1, ge=1),
    to_seq: int = Query(default=100, ge=1),
) -> list[dict]:
    if from_seq > to_seq:
        raise HTTPException(status_code=400, detail="from_seq must be <= to_seq")

    stmt = (
        select(
            LedgerEntry.sequence_number,
            OperationRecord.operation_type,
            OperationRecord.certificate_id,
            OperationRecord.target_description,
            OperationRecord.success,
            LedgerEntry.report_hash,
            LedgerEntry.previous_hash,
            LedgerEntry.entry_hash,
            LedgerEntry.created_at,
        )
        .outerjoin(OperationRecord, OperationRecord.id == LedgerEntry.operation_record_id)
        .where(
            and_(
                LedgerEntry.sequence_number >= from_seq,
                LedgerEntry.sequence_number <= to_seq,
            )
        )
        .order_by(LedgerEntry.sequence_number.asc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        {
            "sequence_number": r.sequence_number,
            "operation_type": r.operation_type.value if r.operation_type else None,
            "certificate_id": r.certificate_id,
            "target_description": r.target_description,
            "success": r.success,
            "report_hash": r.report_hash,
            "previous_hash": r.previous_hash,
            "entry_hash": r.entry_hash,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/chain/verify")
async def verify_chain_up_to_seq(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    seq: int = Query(default=1, ge=1),
) -> dict:
    stmt = (
        select(LedgerEntry)
        .where(LedgerEntry.sequence_number <= seq)
        .order_by(LedgerEntry.sequence_number.asc())
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()

    if not entries:
        raise HTTPException(status_code=404, detail="No ledger entries found up to given seq")

    target = entries[-1]
    if target.sequence_number < seq:
        raise HTTPException(status_code=404, detail=f"Ledger entry at sequence {seq} not found")

    expected_previous = GENESIS_HASH
    computed_entry_hash = ""
    for entry in entries:
        if entry.sequence_number == seq:
            computed_entry_hash = sha256_hex(
                (entry.previous_hash + entry.report_hash).encode()
            )
            valid = (entry.previous_hash == expected_previous) and (
                computed_entry_hash == entry.entry_hash
            )
            return {
                "valid": valid,
                "sequence_number": seq,
                "computed_entry_hash": computed_entry_hash,
                "stored_entry_hash": entry.entry_hash,
                "previous_hash": entry.previous_hash,
                "report_hash": entry.report_hash,
            }
        recomputed = sha256_hex((entry.previous_hash + entry.report_hash).encode())
        if recomputed != entry.entry_hash or entry.previous_hash != expected_previous:
            computed_entry_hash = sha256_hex(
                (target.previous_hash + target.report_hash).encode()
            )
            return {
                "valid": False,
                "sequence_number": seq,
                "computed_entry_hash": computed_entry_hash,
                "stored_entry_hash": target.entry_hash,
                "previous_hash": target.previous_hash,
                "report_hash": target.report_hash,
                "broken_at_sequence": entry.sequence_number,
            }
        expected_previous = entry.entry_hash

    computed_entry_hash = sha256_hex((target.previous_hash + target.report_hash).encode())
    return {
        "valid": computed_entry_hash == target.entry_hash
        and target.previous_hash == expected_previous,
        "sequence_number": seq,
        "computed_entry_hash": computed_entry_hash,
        "stored_entry_hash": target.entry_hash,
        "previous_hash": target.previous_hash,
        "report_hash": target.report_hash,
    }
