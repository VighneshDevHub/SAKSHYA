import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimelineEventType(str, enum.Enum):
    DEVICE_CONNECTED = "DEVICE_CONNECTED"
    RECOVERY_STARTED = "RECOVERY_STARTED"
    FILES_RECOVERED = "FILES_RECOVERED"
    VERIFICATION = "VERIFICATION"
    DRIVE_ERASED = "DRIVE_ERASED"
    CERT_GENERATED = "CERT_GENERATED"
    EVIDENCE_ADDED = "EVIDENCE_ADDED"
    INVESTIGATOR_ASSIGNED = "INVESTIGATOR_ASSIGNED"
    STATUS_CHANGED = "STATUS_CHANGED"
    OPERATION_LINKED = "OPERATION_LINKED"
    NOTE = "NOTE"


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("cases.id", name="fk_timeline_case", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    event_type: Mapped[TimelineEventType] = mapped_column(
        SAEnum(TimelineEventType), index=True, nullable=False
    )
    event_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=_utcnow, nullable=False, index=True
    )
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    operation_record_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("operation_records.id", name="fk_timeline_operation", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
