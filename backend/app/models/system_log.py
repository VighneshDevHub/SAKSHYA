import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LogLevel(str, enum.Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    SECURITY = "SECURITY"


class LogCategory(str, enum.Enum):
    LIVE = "LIVE"
    DEVICE = "DEVICE"
    BACKEND = "BACKEND"
    SECURITY = "SECURITY"


class SystemLog(Base):
    __tablename__ = "system_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    level: Mapped[LogLevel] = mapped_column(
        SAEnum(LogLevel), index=True, nullable=False
    )
    category: Mapped[LogCategory] = mapped_column(
        SAEnum(LogCategory), index=True, nullable=False
    )
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    source: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=_utcnow, nullable=False, index=True
    )
