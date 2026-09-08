import csv
import io
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.models.operation_record import LedgerEntry, OperationRecord, OperationType
from app.models.user import UserRole

router = APIRouter(prefix="/reports", tags=["reports"])

_ALL_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _apply_common_filters(
    stmt,
    from_: datetime | None,
    to: datetime | None,
    operator_email: str | None,
    success: bool | None,
):
    if from_ is not None:
        stmt = stmt.where(OperationRecord.completed_at >= from_)
    if to is not None:
        stmt = stmt.where(OperationRecord.completed_at <= to)
    if operator_email:
        stmt = stmt.where(OperationRecord.operator.ilike(f"%{operator_email}%"))
    if success is not None:
        stmt = stmt.where(OperationRecord.success == success)
    return stmt


@router.get("/certificates")
async def list_certificates_report(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    operator_email: str | None = Query(default=None, max_length=255),
    success: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    from_dt = _parse_dt(from_)
    to_dt = _parse_dt(to)

    base = select(OperationRecord, LedgerEntry).join(
        LedgerEntry, LedgerEntry.operation_record_id == OperationRecord.id
    )
    base = _apply_common_filters(base, from_dt, to_dt, operator_email, success)

    count_stmt = select(func.count()).select_from(
        base.options().order_by(None).subquery()
    )
    total = (await db.execute(count_stmt)).scalar_one()

    list_stmt = base.order_by(desc(LedgerEntry.sequence_number)).limit(limit).offset(offset)
    rows = (await db.execute(list_stmt)).all()

    results = []
    for rec, le in rows:
        results.append({
            "certificate_id": rec.certificate_id,
            "operation_type": rec.operation_type,
            "target_description": rec.target_description,
            "started_at": rec.started_at,
            "completed_at": rec.completed_at,
            "success": rec.success,
            "operator": rec.operator,
            "details": rec.details,
            "report_hash": rec.report_hash,
            "signature": rec.signature,
            "ledger_sequence_number": le.sequence_number,
            "created_at": rec.created_at,
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": results,
    }


@router.get("/certificates/{certificate_id}/pdf", status_code=307)
async def redirect_certificate_pdf(certificate_id: str) -> RedirectResponse:
    return RedirectResponse(
        url=f"/api/v1/operations/{certificate_id}/pdf", status_code=307
    )


@router.get("/certificates/download.csv")
async def download_certificates_csv(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    operator_email: str | None = Query(default=None, max_length=255),
    success: bool | None = Query(default=None),
) -> StreamingResponse:
    from_dt = _parse_dt(from_)
    to_dt = _parse_dt(to)

    stmt = select(OperationRecord, LedgerEntry).join(
        LedgerEntry, LedgerEntry.operation_record_id == OperationRecord.id
    )
    stmt = _apply_common_filters(stmt, from_dt, to_dt, operator_email, success)
    stmt = stmt.order_by(LedgerEntry.sequence_number.asc()).limit(10000)

    rows = (await db.execute(stmt)).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "certificate_id",
        "operation_type",
        "target_description",
        "started_at",
        "completed_at",
        "success",
        "operator",
        "report_hash",
    ])
    for rec, _le in rows:
        writer.writerow([
            rec.certificate_id,
            rec.operation_type.value if hasattr(rec.operation_type, "value") else rec.operation_type,
            rec.target_description,
            rec.started_at.isoformat() if rec.started_at else "",
            rec.completed_at.isoformat() if rec.completed_at else "",
            "TRUE" if rec.success else "FALSE",
            rec.operator,
            rec.report_hash,
        ])
    buf.seek(0)
    data = buf.getvalue().encode("utf-8-sig")

    def _iter():
        yield data

    return StreamingResponse(
        _iter(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="certificates.csv"'
        },
    )


@router.get("/audit")
async def audit_report(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    operator_email: str | None = Query(default=None, max_length=255),
    success: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    return await list_certificates_report(
        db=db,
        _user=_user,
        from_=from_,
        to=to,
        operator_email=operator_email,
        success=success,
        limit=limit,
        offset=offset,
    )


@router.get("/recovery")
async def recovery_report(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    operator_email: str | None = Query(default=None, max_length=255),
    success: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    from_dt = _parse_dt(from_)
    to_dt = _parse_dt(to)

    base = (
        select(OperationRecord, LedgerEntry)
        .join(LedgerEntry, LedgerEntry.operation_record_id == OperationRecord.id)
        .where(OperationRecord.operation_type == OperationType.RECOVERY)
    )
    base = _apply_common_filters(base, from_dt, to_dt, operator_email, success)

    count_stmt = select(func.count()).select_from(
        base.options().order_by(None).subquery()
    )
    total = (await db.execute(count_stmt)).scalar_one()

    list_stmt = base.order_by(desc(LedgerEntry.sequence_number)).limit(limit).offset(offset)
    rows = (await db.execute(list_stmt)).all()

    results = []
    for rec, le in rows:
        results.append({
            "certificate_id": rec.certificate_id,
            "operation_type": rec.operation_type,
            "target_description": rec.target_description,
            "started_at": rec.started_at,
            "completed_at": rec.completed_at,
            "success": rec.success,
            "operator": rec.operator,
            "details": rec.details,
            "report_hash": rec.report_hash,
            "ledger_sequence_number": le.sequence_number,
            "created_at": rec.created_at,
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": results,
    }


@router.get("/monthly")
async def monthly_report(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
) -> dict[str, Any]:
    stmt = select(OperationRecord)
    rows = (await db.execute(stmt)).scalars().all()

    buckets: dict[str, dict[str, Any]] = {}
    for rec in rows:
        d = rec.completed_at or rec.created_at
        if d is None:
            continue
        if hasattr(d, "year") and hasattr(d, "month"):
            y = d.year
            m = d.month
        else:
            continue
        key = f"{y:04d}-{m:02d}"
        if key not in buckets:
            buckets[key] = {
                "year": y,
                "month": m,
                "operations_total": 0,
                "recoveries": 0,
                "drive_erases": 0,
                "file_erases": 0,
                "successes": 0,
                "failures": 0,
            }
        b = buckets[key]
        b["operations_total"] += 1
        if rec.operation_type == OperationType.RECOVERY:
            b["recoveries"] += 1
        elif rec.operation_type == OperationType.DRIVE_ERASE:
            b["drive_erases"] += 1
        elif rec.operation_type == OperationType.FILE_ERASE:
            b["file_erases"] += 1
        if rec.success:
            b["successes"] += 1
        else:
            b["failures"] += 1

    result = sorted(buckets.values(), key=lambda x: (x["year"], x["month"]), reverse=True)

    if year is not None:
        result = [r for r in result if r["year"] == year]
    if month is not None:
        result = [r for r in result if r["month"] == month]

    return {
        "count": len(result),
        "buckets": result,
    }
