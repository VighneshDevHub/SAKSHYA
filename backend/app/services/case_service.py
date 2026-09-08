from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case_management import CaseRecord


async def generate_case_number(db: AsyncSession) -> str:
    """Generate a government-style case number without altering any
    existing operation certificate flows."""
    year = datetime.now(timezone.utc).year
    prefix = f"FG-{year}-"

    result = await db.execute(
        select(CaseRecord.case_number)
        .where(CaseRecord.case_number.like(f"{prefix}%"))
        .order_by(desc(CaseRecord.case_number))
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    next_sequence = 1 if latest is None else int(latest.rsplit("-", 1)[1]) + 1
    return f"{prefix}{next_sequence:06d}"
