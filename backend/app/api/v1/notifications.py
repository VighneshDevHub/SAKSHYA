from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_roles
from app.models.user import User, UserRole
from app.schemas.notification import NotificationListOut, NotificationOut
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])

_ALL_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*_ALL_ROLES)),
    unread_only: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
) -> NotificationListOut:
    items, unread_count = await notification_service.list_user_notifications(
        db,
        user_id=current_user.id,
        user_role=current_user.role,
        unread_only=unread_only,
        limit=limit,
    )
    return NotificationListOut(
        items=[NotificationOut.model_validate(i) for i in items],
        unread_count=unread_count,
    )


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*_ALL_ROLES)),
) -> NotificationOut:
    notif = await notification_service.mark_read(
        db,
        notification_id=notification_id,
        user_id=current_user.id,
        user_role=current_user.role,
    )
    if notif is None:
        raise HTTPException(status_code=404, detail="Notification not found or not authorized")
    return NotificationOut.model_validate(notif)


@router.post("/read-all", status_code=200)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*_ALL_ROLES)),
) -> dict:
    count = await notification_service.mark_all_read(
        db,
        user_id=current_user.id,
        user_role=current_user.role,
    )
    return {"marked_read": count}
