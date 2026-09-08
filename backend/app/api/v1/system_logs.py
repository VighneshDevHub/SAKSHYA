from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.models.system_log import LogCategory, LogLevel, SystemLog
from app.models.user import UserRole

router = APIRouter(prefix="/system-logs", tags=["system-logs"])

_READ_ROLES = (UserRole.ADMINISTRATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)


@router.get("")
async def list_system_logs(
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_READ_ROLES)),
    category: str | None = Query(default=None, max_length=32),
    level: str | None = Query(default=None, max_length=16),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> dict:
    stmt = select(SystemLog)
    conditions = []
    if category:
        try:
            cat = LogCategory(category.upper())
            conditions.append(SystemLog.category == cat)
        except ValueError:
            pass
    if level:
        try:
            lvl = LogLevel(level.upper())
            conditions.append(SystemLog.level == lvl)
        except ValueError:
            pass
    if conditions:
        stmt = stmt.where(and_(*conditions))
    stmt = stmt.order_by(desc(SystemLog.created_at)).limit(limit).offset(offset)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return {
        "limit": limit,
        "offset": offset,
        "count": len(rows),
        "items": [
            {
                "id": r.id,
                "level": r.level,
                "category": r.category,
                "message": r.message,
                "details": r.details,
                "source": r.source,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }
