import asyncio
import json
import platform
import subprocess
from datetime import datetime, timezone
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.devices import (
    Device,
    DeviceConnectionType,
    DeviceHealth,
    DeviceMediaType,
    DeviceStatus,
)


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


def _classify_connection(bus_type: str) -> DeviceConnectionType:
    value = bus_type.strip().upper()
    mapping = {
        "USB": DeviceConnectionType.USB,
        "SATA": DeviceConnectionType.SATA,
        "NVME": DeviceConnectionType.NVME,
        "PCIE": DeviceConnectionType.PCIE,
        "SAS": DeviceConnectionType.SAS,
        "SD": DeviceConnectionType.SD,
    }
    return mapping.get(value, DeviceConnectionType.UNKNOWN)


def _classify_media(media_type: str, bus_type: str) -> DeviceMediaType:
    media = media_type.strip().upper()
    bus = bus_type.strip().upper()
    if bus == "NVME":
        return DeviceMediaType.NVME_SSD
    if bus == "USB":
        return DeviceMediaType.USB_FLASH if media != "HDD" else DeviceMediaType.HDD
    if media == "SSD":
        return DeviceMediaType.SSD
    if media == "HDD":
        return DeviceMediaType.HDD
    return DeviceMediaType.OTHER


def _read_windows_disks() -> list[dict[str, object]]:
    command = (
        "Get-PhysicalDisk | Select DeviceId,FriendlyName,SerialNumber,"
        "MediaType,BusType,Size | ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            check=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=503, detail=f"Host disk detection failed: {exc}") from exc
    if not result.stdout.strip():
        return []
    payload = json.loads(result.stdout)
    return payload if isinstance(payload, list) else [payload]


def _read_windows_portable_devices() -> list[dict[str, object]]:
    """Read present WPD/MTP devices, which are not physical disks.

    Android phones and iPhones commonly expose portable storage through the
    Windows Portable Devices class instead of Get-PhysicalDisk. ADB and USB
    composite interfaces are intentionally excluded because the WPD row is
    the user-facing device record.
    """
    command = (
        "Get-PnpDevice -PresentOnly | Where-Object { $_.Class -eq 'WPD' } | "
        "Select FriendlyName,InstanceId,Class | ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            check=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=503, detail=f"Portable device detection failed: {exc}") from exc
    if not result.stdout.strip():
        return []
    payload = json.loads(result.stdout)
    return payload if isinstance(payload, list) else [payload]


async def detect_host_devices(db: AsyncSession) -> list[Device]:
    if platform.system() != "Windows":
        raise HTTPException(
            status_code=501,
            detail="Automatic host device detection is currently supported on Windows only.",
        )

    raw_disks, raw_portable = await asyncio.gather(
        asyncio.to_thread(_read_windows_disks),
        asyncio.to_thread(_read_windows_portable_devices),
    )
    detected_at = datetime.now(timezone.utc).replace(tzinfo=None)
    devices: list[Device] = []
    detected_serials: set[str] = set()
    for raw in raw_disks:
        serial = str(raw.get("SerialNumber") or f"PHYSICALDISK-{raw.get('DeviceId', 'UNKNOWN')}").strip()
        if not serial:
            continue
        detected_serials.add(serial)
        result = await db.execute(select(Device).where(Device.serial_number == serial))
        device = result.scalar_one_or_none()
        bus_type = str(raw.get("BusType") or "")
        media_type = str(raw.get("MediaType") or "")
        friendly_name = str(raw.get("FriendlyName") or "Unknown storage device")
        values = {
            "model": friendly_name,
            "connection_type": _classify_connection(bus_type),
            "media_type": _classify_media(media_type, bus_type),
            "capacity_bytes": int(raw.get("Size") or 0),
            "status": DeviceStatus.CONNECTED,
            "detected_at": detected_at,
        }
        if device is None:
            device = Device(
                serial_number=serial,
                manufacturer=friendly_name.split(" ", 1)[0],
                health=DeviceHealth.UNKNOWN,
                **values,
            )
            db.add(device)
        else:
            for field, value in values.items():
                setattr(device, field, value)
        devices.append(device)

    for raw in raw_portable:
        serial = str(raw.get("InstanceId") or "").strip()
        if not serial:
            continue
        detected_serials.add(serial)
        result = await db.execute(select(Device).where(Device.serial_number == serial))
        device = result.scalar_one_or_none()
        friendly_name = str(raw.get("FriendlyName") or "Portable USB device").strip()
        values = {
            "model": friendly_name,
            "connection_type": DeviceConnectionType.USB,
            "media_type": DeviceMediaType.OTHER,
            "capacity_bytes": 0,
            "status": DeviceStatus.CONNECTED,
            "detected_at": detected_at,
            "notes": "Windows Portable Device (WPD/MTP); storage capacity is not exposed as a physical disk.",
        }
        if device is None:
            device = Device(
                serial_number=serial,
                manufacturer="Portable device",
                health=DeviceHealth.UNKNOWN,
                **values,
            )
            db.add(device)
        else:
            for field, value in values.items():
                setattr(device, field, value)
        devices.append(device)

    existing_result = await db.execute(select(Device).where(Device.status == DeviceStatus.CONNECTED))
    for existing in existing_result.scalars().all():
        if existing.serial_number not in detected_serials:
            existing.status = DeviceStatus.DISCONNECTED
            existing.updated_at = detected_at

    await db.commit()
    for device in devices:
        await db.refresh(device)
    return devices
