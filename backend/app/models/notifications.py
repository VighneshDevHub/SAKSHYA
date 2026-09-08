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


class NotificationType(str, enum.Enum):
    CERT_GENERATED = "CERT_GENERATED"
    RECOVERY_DONE = "RECOVERY_DONE"
    TAMPER_DETECTED = "TAMPER_DETECTED"
    DEVICE_CONNECTED = "DEVICE_CONNECTED"
    DEVICE_REMOVED = "DEVICE_REMOVED"
    JOB_FAILED = "JOB_FAILED"
    ROLE_CHANGED = "ROLE_CHANGED"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", name="fk_notifications_user", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    type: Mapped[NotificationType] = mapped_column(
        SAEnum(NotificationType), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=_utcnow, nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=_utcnow, onupdate=_utcnow, nullable=False
    )
