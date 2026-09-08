import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DeviceStatus(str, enum.Enum):
    CONNECTED = "CONNECTED"
    DISCONNECTED = "DISCONNECTED"
    IN_USE = "IN_USE"
    ERRORED = "ERRORED"
    QUARANTINED = "QUARANTINED"
    SANITIZED = "SANITIZED"
    DECOMMISSIONED = "DECOMMISSIONED"


class DeviceConnectionType(str, enum.Enum):
    USB = "USB"
    SATA = "SATA"
    NVME = "NVMe"
    PCIE = "PCIe"
    SAS = "SAS"
    SD = "SD"
    NETWORK = "NETWORK"
    UNKNOWN = "UNKNOWN"


class DeviceMediaType(str, enum.Enum):
    SSD = "SSD"
    HDD = "HDD"
    USB_FLASH = "USB_FLASH"
    SD_CARD = "SD_CARD"
    NVME_SSD = "NVME_SSD"
    OPTICAL = "OPTICAL"
    TAPE = "TAPE"
    OTHER = "OTHER"


class DeviceHealth(str, enum.Enum):
    EXCELLENT = "EXCELLENT"
    GOOD = "GOOD"
    FAIR = "FAIR"
    POOR = "POOR"
    CRITICAL = "CRITICAL"
    UNKNOWN = "UNKNOWN"


class Device(Base):
    """Inventory record for a single physical storage device tracked by the
    platform.

    Created either automatically by the drive-eraser-agent on plug-in (POST
    /devices) or manually by an INVESTIGATOR. Used by Case Management
    (evidence list), Task Queue (device_id FK), and Analytics.

    Pure addition — no existing tables are modified. serial_number is
    business-unique so two agents reporting the same physical disk converge
    onto a single inventory row."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    serial_number: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    manufacturer: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    model: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    connection_type: Mapped[DeviceConnectionType] = mapped_column(
        SAEnum(DeviceConnectionType),
        default=DeviceConnectionType.UNKNOWN,
        index=True,
        nullable=False,
    )
    media_type: Mapped[DeviceMediaType] = mapped_column(
        SAEnum(DeviceMediaType),
        default=DeviceMediaType.OTHER,
        index=True,
        nullable=False,
    )
    capacity_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    health: Mapped[DeviceHealth] = mapped_column(
        SAEnum(DeviceHealth),
        default=DeviceHealth.UNKNOWN,
        index=True,
        nullable=False,
    )
    status: Mapped[DeviceStatus] = mapped_column(
        SAEnum(DeviceStatus),
        default=DeviceStatus.CONNECTED,
        index=True,
        nullable=False,
    )
    firmware_version: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    last_operation_record_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("operation_records.id", name="fk_devices_last_operation"),
        nullable=True,
        index=True,
    )
    last_operation_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=_utcnow, nullable=False, index=True
    )
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=_utcnow, onupdate=_utcnow, nullable=False
    )
