from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.models.case_management import CaseRecord
from app.models.devices import Device
from app.models.operation_record import OperationRecord, OperationType
from app.models.user import User, UserRole

router = APIRouter(prefix="/search", tags=["search"])

_ALL_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)

_VALID_TYPES = {"certificate", "case", "device", "operation", "officer"}


def _parse_types(raw: str | list[str] | None) -> set[str]:
    if raw is None:
        return _VALID_TYPES.copy()
    if isinstance(raw, list):
        items = raw
    else:
        items = [s.strip() for s in raw.split(",") if s.strip()]
    result: set[str] = set()
    for t in items:
        tl = t.lower()
        if tl in _VALID_TYPES:
            result.add(tl)
    return result or _VALID_TYPES.copy()


async def _search_operations(
    db: AsyncSession,
    q: str,
    from_dt: datetime | None,
    to_dt: datetime | None,
    hash_filter: str | None,
    cert_only: bool,
) -> list[dict[str, Any]]:
    stmt = select(OperationRecord)
    conditions = []
    if q:
        ilike = f"%{q}%"
        conditions.append(
            or_(
                OperationRecord.operator.ilike(ilike),
                OperationRecord.target_description.ilike(ilike),
                OperationRecord.certificate_id == q,
            )
        )
    if hash_filter:
        conditions.append(OperationRecord.report_hash == hash_filter)
    if from_dt is not None:
        conditions.append(OperationRecord.created_at >= from_dt)
    if to_dt is not None:
        conditions.append(OperationRecord.created_at <= to_dt)
    if cert_only:
        conditions.append(OperationRecord.success == True)  # noqa: E712
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(OperationRecord.created_at.desc()).limit(500)

    result = await db.execute(stmt)
    rows: list[dict[str, Any]] = []
    for op in result.scalars().all():
        match_field = "certificate_id" if q and q == op.certificate_id else "target_description"
        if hash_filter and op.report_hash == hash_filter:
            match_field = "report_hash"
        rows.append({
            "result_type": "certificate" if cert_only else "operation",
            "id": op.certificate_id,
            "title": f"{op.operation_type.value} — {op.target_description}",
            "subtitle": f"Operator: {op.operator} | Success: {op.success}",
            "match_field": match_field,
            "created_at": op.created_at,
        })
    return rows


async def _search_cases(
    db: AsyncSession,
    q: str,
    from_dt: datetime | None,
    to_dt: datetime | None,
) -> list[dict[str, Any]]:
    stmt = select(CaseRecord)
    conditions = []
    if q:
        ilike = f"%{q}%"
        conditions.append(
            or_(
                CaseRecord.case_number.ilike(ilike),
                CaseRecord.title.ilike(ilike),
            )
        )
    if from_dt is not None:
        conditions.append(CaseRecord.created_at >= from_dt)
    if to_dt is not None:
        conditions.append(CaseRecord.created_at <= to_dt)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(CaseRecord.created_at.desc()).limit(500)

    result = await db.execute(stmt)
    rows: list[dict[str, Any]] = []
    for case in result.scalars().all():
        match_field = "case_number" if q and q.lower() in case.case_number.lower() else "title"
        rows.append({
            "result_type": "case",
            "id": case.id,
            "title": f"{case.case_number} — {case.title}",
            "subtitle": f"Status: {case.status.value}",
            "match_field": match_field,
            "created_at": case.created_at,
        })
    return rows


async def _search_devices(
    db: AsyncSession,
    q: str,
    from_dt: datetime | None,
    to_dt: datetime | None,
) -> list[dict[str, Any]]:
    stmt = select(Device)
    conditions = []
    if q:
        ilike = f"%{q}%"
        conditions.append(
            or_(
                Device.serial_number.ilike(ilike),
                Device.model.ilike(ilike),
                Device.manufacturer.ilike(ilike),
            )
        )
    if from_dt is not None:
        conditions.append(Device.detected_at >= from_dt)
    if to_dt is not None:
        conditions.append(Device.detected_at <= to_dt)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(Device.detected_at.desc()).limit(500)

    result = await db.execute(stmt)
    rows: list[dict[str, Any]] = []
    for dev in result.scalars().all():
        rows.append({
            "result_type": "device",
            "id": dev.id,
            "title": f"{dev.manufacturer} {dev.model}",
            "subtitle": f"SN: {dev.serial_number} | Status: {dev.status.value}",
            "match_field": "serial_number",
            "created_at": dev.detected_at,
        })
    return rows


async def _search_officers(
    db: AsyncSession,
    q: str,
    from_dt: datetime | None,
    to_dt: datetime | None,
) -> list[dict[str, Any]]:
    stmt = select(User)
    conditions = []
    if q:
        ilike = f"%{q}%"
        conditions.append(User.email.ilike(ilike))
    if from_dt is not None:
        conditions.append(User.created_at >= from_dt)
    if to_dt is not None:
        conditions.append(User.created_at <= to_dt)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(User.created_at.desc()).limit(500)

    result = await db.execute(stmt)
    rows: list[dict[str, Any]] = []
    for user in result.scalars().all():
        rows.append({
            "result_type": "officer",
            "id": user.id,
            "title": user.email,
            "subtitle": f"Role: {user.role.value}",
            "match_field": "email",
            "created_at": user.created_at,
        })
    return rows


@router.get("")
async def universal_search(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    q: str | None = Query(default=None, max_length=512),
    types: str | None = Query(default=None),
    type: list[str] | None = Query(default=None),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    hash: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    chosen_types = _parse_types(types if types is not None else type)

    from_dt = None
    if from_:
        try:
            from_dt = datetime.fromisoformat(from_.replace("Z", "+00:00"))
        except ValueError:
            from_dt = None

    to_dt = None
    if to:
        try:
            to_dt = datetime.fromisoformat(to.replace("Z", "+00:00"))
        except ValueError:
            to_dt = None

    all_results: list[dict[str, Any]] = []

    if "operation" in chosen_types:
        all_results.extend(
            await _search_operations(db, q or "", from_dt, to_dt, hash, cert_only=False)
        )
    if "certificate" in chosen_types:
        all_results.extend(
            await _search_operations(db, q or "", from_dt, to_dt, hash, cert_only=True)
        )
    if "case" in chosen_types:
        all_results.extend(await _search_cases(db, q or "", from_dt, to_dt))
    if "device" in chosen_types:
        all_results.extend(await _search_devices(db, q or "", from_dt, to_dt))
    if "officer" in chosen_types:
        all_results.extend(await _search_officers(db, q or "", from_dt, to_dt))

    all_results.sort(key=lambda r: r["created_at"], reverse=True)

    total = len(all_results)
    page = all_results[offset:offset + limit]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "results": page,
    }
