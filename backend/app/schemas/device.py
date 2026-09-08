from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.devices import (
    DeviceConnectionType,
    DeviceHealth,
    DeviceMediaType,
    DeviceStatus,
)


CAPACITY_GE_0 = Field(ge=0, description="Device storage in bytes. 0 = unknown.")
LONG_STRING_FIELD = Field(default="", max_length=2000)


class DeviceCreateIn(BaseModel):
    serial_number: str = Field(min_length=1, max_length=128)
    manufacturer: str = Field(default="", max_length=128)
    model: str = Field(default="", max_length=160)
    connection_type: DeviceConnectionType = DeviceConnectionType.UNKNOWN
    media_type: DeviceMediaType = DeviceMediaType.OTHER
    capacity_bytes: int = CAPACITY_GE_0
    health: DeviceHealth = DeviceHealth.UNKNOWN
    status: DeviceStatus = DeviceStatus.CONNECTED
    firmware_version: str = Field(default="", max_length=64)
    notes: str = LONG_STRING_FIELD


class DeviceUpdateIn(BaseModel):
    manufacturer: str | None = Field(default=None, max_length=128)
    model: str | None = Field(default=None, max_length=160)
    connection_type: DeviceConnectionType | None = None
    media_type: DeviceMediaType | None = None
    capacity_bytes: int | None = Field(default=None, ge=0)
    health: DeviceHealth | None = None
    status: DeviceStatus | None = None
    firmware_version: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)


class DeviceOut(BaseModel):
    id: str
    serial_number: str
    manufacturer: str
    model: str
    connection_type: DeviceConnectionType
    media_type: DeviceMediaType
    capacity_bytes: int
    health: DeviceHealth
    status: DeviceStatus
    firmware_version: str
    last_operation_record_id: str | None
    last_operation_at: datetime | None
    detected_at: datetime
    notes: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
