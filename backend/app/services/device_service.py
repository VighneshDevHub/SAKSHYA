from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.devices import Device


async def list_devices(
    db: AsyncSession,
    *,
    connection_type: str | None = None,
    status: str | None = None,
    media_type: str | None = None,
    serial_contains: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> Iterable[Device]:
    stmt = select(Device)
    if connection_type:
        stmt = stmt.where(Device.connection_type == connection_type)
    if status:
        stmt = stmt.where(Device.status == status)
    if media_type:
        stmt = stmt.where(Device.media_type == media_type)
    if serial_contains:
        stmt = stmt.where(Device.serial_number.ilike(f"%{serial_contains}%"))
    stmt = stmt.order_by(Device.detected_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()
