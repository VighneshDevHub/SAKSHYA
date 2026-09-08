from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.jobs import Job, TaskStatus


async def claim_next_pending(
    db: AsyncSession,
    *,
    assigned_agent_id: str,
    operation_type: str | None = None,
) -> Job | None:
    """Atomically claim the oldest PENDING job for an agent.

    Uses SELECT ... FOR UPDATE SKIP LOCKED on PostgreSQL; falls back to a
    best-effort single-row update on SQLite (which lacks SKIP LOCKED).
    SQLite is only used in tests; in production, Postgres provides a real
    concurrent-safe claim."""

    stmt = select(Job).where(Job.status == TaskStatus.PENDING).order_by(Job.created_at.asc()).limit(1)
    if operation_type:
        stmt = stmt.where(Job.operation_type == operation_type)

    dialect_name = ""
    try:
        if db.bind is not None:
            dialect_name = db.bind.dialect.name
    except Exception:
        dialect_name = ""

    use_for_update = dialect_name == "postgresql"
    stmt_for_update = stmt
    if use_for_update:
        try:
            stmt_for_update = stmt.with_for_update(skip_locked=True, of=Job)
        except TypeError:
            stmt_for_update = stmt

    now = datetime.now(timezone.utc)
    async with db.begin_nested():
        try:
            result = await db.execute(stmt_for_update)
        except OperationalError:
            result = await db.execute(stmt)
        job = result.scalar_one_or_none()
        if job is None:
            return None

        job.status = TaskStatus.CLAIMED
        job.assigned_agent_id = assigned_agent_id
        job.claimed_at = now
        job.stage = "CLAIMED"
        job.message = f"Claimed by agent {assigned_agent_id}"
    await db.flush()
    return job
