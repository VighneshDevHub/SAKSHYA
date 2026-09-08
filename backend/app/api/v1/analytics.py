from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.models.user import UserRole
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])

_ALL_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)


@router.get("/summary")
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
) -> dict:
    return await analytics_service.get_summary(db)


@router.get("/timeseries")
async def get_timeseries(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    metric: str = Query(default="operations", max_length=32),
    range: str = Query(default="30d"),
) -> list[dict]:
    range_days = 30
    raw = range.strip().lower()
    if raw.endswith("d"):
        try:
            range_days = max(1, min(365, int(raw[:-1])))
        except ValueError:
            range_days = 30
    return await analytics_service.get_timeseries(db, metric=metric, range_days=range_days)
