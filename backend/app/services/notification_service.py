from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notifications import Notification, NotificationType


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def create_notification(
    db: AsyncSession,
    *,
    user_id: str | None,
    type: NotificationType,
    title: str,
    message: str,
    payload: dict[str, Any] | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        payload=payload or {},
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)
    return notif


async def notify_cert_generated(
    db: AsyncSession,
    *,
    operator_user_id: str,
    certificate_id: str,
) -> Notification:
    return await create_notification(
        db,
        user_id=operator_user_id,
        type=NotificationType.CERT_GENERATED,
        title="Certificate Generated",
        message=f"A new operation certificate has been issued: {certificate_id}",
        payload={"certificate_id": certificate_id},
    )


async def notify_tamper_detected_broadcast(
    db: AsyncSession,
    *,
    detail_str: str,
) -> Notification:
    return await create_notification(
        db,
        user_id=None,
        type=NotificationType.TAMPER_DETECTED,
        title="Tampering Detected",
        message=f"Chain integrity check failed: {detail_str}",
        payload={"detail": detail_str},
    )


async def notify_job_failed(
    db: AsyncSession,
    *,
    operator_user_id: str,
    job_id: str,
    error_msg: str,
) -> Notification:
    return await create_notification(
        db,
        user_id=operator_user_id,
        type=NotificationType.JOB_FAILED,
        title="Job Failed",
        message=f"Job {job_id} failed: {error_msg}",
        payload={"job_id": job_id, "error_message": error_msg},
    )


async def list_user_notifications(
    db: AsyncSession,
    *,
    user_id: str,
    user_role: Any,
    unread_only: bool = False,
    limit: int = 100,
) -> tuple[list[Notification], int]:
    from app.models.user import UserRole

    base_stmt = select(Notification)

    if user_role == UserRole.INVESTIGATOR:
        base_stmt = base_stmt.where(Notification.user_id == user_id)
    else:
        base_stmt = base_stmt.where(
            or_(
                Notification.user_id == user_id,
                Notification.user_id.is_(None),
            )
        )

    if unread_only:
        base_stmt = base_stmt.where(Notification.read_at.is_(None))

    count_stmt = select(func.count()).select_from(base_stmt.subquery())

    list_stmt = base_stmt.order_by(Notification.created_at.desc()).limit(limit)

    count_result = await db.execute(count_stmt)
    total_unread = count_result.scalar_one()

    result = await db.execute(list_stmt)
    items = list(result.scalars().all())

    if unread_only:
        unread_count = total_unread
    else:
        unread_stmt = select(func.count()).select_from(
            select(Notification)
            .where(
                or_(
                    Notification.user_id == user_id,
                    Notification.user_id.is_(None),
                )
            )
            .where(Notification.read_at.is_(None))
            .subquery()
        )
        if user_role == UserRole.INVESTIGATOR:
            unread_stmt = select(func.count()).select_from(
                select(Notification)
                .where(Notification.user_id == user_id)
                .where(Notification.read_at.is_(None))
                .subquery()
            )
        unread_result = await db.execute(unread_stmt)
        unread_count = unread_result.scalar_one()

    return items, unread_count


async def mark_read(
    db: AsyncSession,
    *,
    notification_id: str,
    user_id: str,
    user_role: Any,
) -> Notification | None:
    from app.models.user import UserRole

    stmt = select(Notification).where(Notification.id == notification_id)
    result = await db.execute(stmt)
    notif = result.scalar_one_or_none()
    if notif is None:
        return None

    if notif.user_id is not None and notif.user_id != user_id:
        return None
    if notif.user_id is None and user_role == UserRole.INVESTIGATOR:
        return None

    notif.read_at = _utcnow()
    await db.commit()
    await db.refresh(notif)
    return notif


async def mark_all_read(
    db: AsyncSession,
    *,
    user_id: str,
    user_role: Any,
) -> int:
    from app.models.user import UserRole
    from sqlalchemy import update

    if user_role == UserRole.INVESTIGATOR:
        stmt = (
            update(Notification)
            .where(Notification.user_id == user_id)
            .where(Notification.read_at.is_(None))
            .values(read_at=_utcnow())
        )
    else:
        stmt = (
            update(Notification)
            .where(
                or_(
                    Notification.user_id == user_id,
                    Notification.user_id.is_(None),
                )
            )
            .where(Notification.read_at.is_(None))
            .values(read_at=_utcnow())
        )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount or 0
