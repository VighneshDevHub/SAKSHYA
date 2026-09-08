import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    desc,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.operation_record import OperationType


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    CLAIMED = "CLAIMED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Job(Base):
    """A single unit of orchestrated work scheduled from the Dashboard.

    Lifecycle:
        PENDING → CLAIMED → RUNNING → COMPLETED / FAILED
                                        ↘ CANCELLED (from PENDING/CLAIMED/RUNNING)
    FAILED can be → retry → new PENDING sibling cloned with retries_count+1.

    CLI agents continue to POST their final OperationRecord to
    /api/v1/operations as before; the jobs subsystem adds a DASHBOARD →
    Task Queue → agent execute → backend receipt flow ON TOP of the
    existing CLI path. Therefore no existing API changes."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    job_number: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    operation_type: Mapped[OperationType] = mapped_column(
        SAEnum(OperationType), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    case_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("cases.id", name="fk_jobs_case", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    device_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("devices.id", name="fk_jobs_device", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", name="fk_jobs_created_by", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_agent_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(TaskStatus), default=TaskStatus.PENDING, index=True, nullable=False
    )
    progress_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stage: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)

    retries_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    parent_job_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("jobs.id", name="fk_jobs_parent", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    certificate_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("operation_records.certificate_id", name="fk_jobs_certificate", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    error_message: Mapped[str] = mapped_column(Text, default="", nullable=False)

    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=_utcnow, onupdate=_utcnow, nullable=False
    )


async def generate_job_number(db: AsyncSession) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"FGJ-{year}-"
    result = await db.execute(
        select(Job.job_number)
        .where(Job.job_number.like(f"{prefix}%"))
        .order_by(desc(Job.job_number))
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    next_seq = 1 if latest is None else int(latest.rsplit("-", 1)[1]) + 1
    return f"{prefix}{next_seq:07d}"
