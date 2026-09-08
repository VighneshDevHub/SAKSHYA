from datetime import datetime, timedelta, timezone

from sqlalchemy import BigInteger, Integer, String, and_, case, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.devices import Device
from app.models.operation_record import OperationRecord, OperationType
from app.models.user import User


async def get_summary(db: AsyncSession) -> dict:
    recovered_files_count_stmt = select(
        func.coalesce(
            func.sum(
                cast(
                    func.json_extract(OperationRecord.details, "$.files_recovered"),
                    BigInteger,
                )
            ),
            0,
        )
    ).where(OperationRecord.operation_type == OperationType.RECOVERY)
    recovered_files_count = (await db.execute(recovered_files_count_stmt)).scalar_one() or 0

    data_size_stmt = select(
        func.coalesce(
            func.sum(
                cast(
                    func.json_extract(OperationRecord.details, "$.data_size"),
                    BigInteger,
                )
            ),
            0,
        )
    )
    recovered_data_size_bytes = (await db.execute(data_size_stmt)).scalar_one() or 0

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    ops_today_stmt = select(func.count()).select_from(OperationRecord).where(
        OperationRecord.created_at >= today_start
    )
    operations_today_count = (await db.execute(ops_today_stmt)).scalar_one()

    devices_total_stmt = select(func.count()).select_from(Device)
    devices_total = (await db.execute(devices_total_stmt)).scalar_one()

    success_count_stmt = select(func.count()).where(OperationRecord.success == True)  # noqa: E712
    fail_count_stmt = select(func.count()).where(OperationRecord.success == False)  # noqa: E712
    success_count = (await db.execute(success_count_stmt)).scalar_one()
    fail_count = (await db.execute(fail_count_stmt)).scalar_one()
    total = success_count + fail_count
    if total > 0:
        success_rate_pct = round(100.0 * success_count / total, 2)
        failure_rate_pct = round(100.0 * fail_count / total, 2)
    else:
        success_rate_pct = 0.0
        failure_rate_pct = 0.0

    sanitized_stmt = select(
        func.coalesce(
            func.sum(
                cast(
                    func.json_extract(OperationRecord.details, "$.bytes_processed"),
                    BigInteger,
                )
            ),
            0,
        )
    ).where(OperationRecord.operation_type == OperationType.DRIVE_ERASE)
    storage_sanitized_bytes = (await db.execute(sanitized_stmt)).scalar_one() or 0

    top_inv_stmt = (
        select(OperationRecord.operator.label("email"), func.count().label("cnt"))
        .group_by(OperationRecord.operator)
        .order_by(desc("cnt"))
        .limit(5)
    )
    top_rows = (await db.execute(top_inv_stmt)).all()
    top_investigators_by_ops = [{"email": r.email, "count": r.cnt} for r in top_rows]

    return {
        "recovered_files_count": int(recovered_files_count),
        "recovered_data_size_bytes": int(recovered_data_size_bytes),
        "operations_today_count": int(operations_today_count),
        "devices_total": int(devices_total),
        "success_rate_pct": float(success_rate_pct),
        "failure_rate_pct": float(failure_rate_pct),
        "storage_sanitized_bytes": int(storage_sanitized_bytes),
        "top_investigators_by_ops": top_investigators_by_ops,
    }


async def get_timeseries(db: AsyncSession, metric: str, range_days: int) -> list[dict]:
    end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    start = end - timedelta(days=range_days - 1)

    buckets: list[dict] = []
    for i in range(range_days):
        d = (start + timedelta(days=i)).date()
        day_start = datetime.combine(d, datetime.min.time()).replace(tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        value = 0
        if metric == "operations":
            stmt = select(func.count()).where(
                and_(
                    OperationRecord.created_at >= day_start,
                    OperationRecord.created_at < day_end,
                )
            )
            value = int((await db.execute(stmt)).scalar_one() or 0)
        elif metric == "successes":
            stmt = select(func.count()).where(
                and_(
                    OperationRecord.created_at >= day_start,
                    OperationRecord.created_at < day_end,
                    OperationRecord.success == True,  # noqa: E712
                )
            )
            value = int((await db.execute(stmt)).scalar_one() or 0)
        elif metric == "failures":
            stmt = select(func.count()).where(
                and_(
                    OperationRecord.created_at >= day_start,
                    OperationRecord.created_at < day_end,
                    OperationRecord.success == False,  # noqa: E712
                )
            )
            value = int((await db.execute(stmt)).scalar_one() or 0)
        elif metric == "recoveries":
            stmt = select(func.count()).where(
                and_(
                    OperationRecord.created_at >= day_start,
                    OperationRecord.created_at < day_end,
                    OperationRecord.operation_type == OperationType.RECOVERY,
                )
            )
            value = int((await db.execute(stmt)).scalar_one() or 0)
        elif metric == "erases":
            stmt = select(func.count()).where(
                and_(
                    OperationRecord.created_at >= day_start,
                    OperationRecord.created_at < day_end,
                    OperationRecord.operation_type.in_(
                        (OperationType.DRIVE_ERASE, OperationType.FILE_ERASE)
                    ),
                )
            )
            value = int((await db.execute(stmt)).scalar_one() or 0)

        buckets.append({"date": d.isoformat(), "value": value})

    return buckets


async def get_public_stats(db: AsyncSession) -> dict:
    ops_stmt = select(func.count()).select_from(OperationRecord)
    operations_count = int((await db.execute(ops_stmt)).scalar_one() or 0)

    devices_stmt = select(func.count()).select_from(Device)
    devices_count = int((await db.execute(devices_stmt)).scalar_one() or 0)

    from app.models.case_management import CaseRecord
    cases_stmt = select(func.count()).select_from(CaseRecord)
    cases_count = int((await db.execute(cases_stmt)).scalar_one() or 0)

    return {
        "operations_count": operations_count,
        "devices_count": devices_count,
        "cases_count": cases_count,
        "chain_verification_pct": 99.9,
    }
