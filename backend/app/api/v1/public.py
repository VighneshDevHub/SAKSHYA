from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services import analytics_service

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/stats")
async def get_public_stats(
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await analytics_service.get_public_stats(db)
