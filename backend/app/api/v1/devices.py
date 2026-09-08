from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_current_user, get_db, require_roles
from app.models.devices import Device
from app.models.user import User, UserRole
from app.schemas.device import DeviceCreateIn, DeviceOut, DeviceUpdateIn
from app.services.device_service import list_devices

router = APIRouter(prefix="/devices", tags=["devices"])

_WRITE_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.SUPERVISOR)
_READ_ROLES = (
    UserRole.ADMINISTRATOR,
    UserRole.INVESTIGATOR,
    UserRole.AUDITOR,
    UserRole.SUPERVISOR,
)


@router.get("", response_model=list[DeviceOut])
async def list_devices_endpoint(
    db: AsyncSession = Depends(get_db),
    _reader: User = Depends(require_roles(*_READ_ROLES)),
    connection_type: str | None = Query(default=None, max_length=32),
    status: str | None = Query(default=None, max_length=32),
    media_type: str | None = Query(default=None, max_length=32),
    serial_contains: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[DeviceOut]:
    rows = await list_devices(
        db,
        connection_type=connection_type,
        status=status,
        media_type=media_type,
        serial_contains=serial_contains,
        limit=limit,
        offset=offset,
    )
    return [DeviceOut.model_validate(r) for r in rows]


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _reader: User = Depends(require_roles(*_READ_ROLES)),
) -> DeviceOut:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return DeviceOut.model_validate(device)


@router.post("", response_model=DeviceOut, status_code=201)
async def create_device(
    payload: DeviceCreateIn,
    db: AsyncSession = Depends(get_db),
    _writer: User = Depends(require_roles(*_WRITE_ROLES)),
) -> DeviceOut:
    device = Device(**payload.model_dump())
    db.add(device)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "ix_devices_serial_number" in str(exc) or "UNIQUE" in str(exc).upper() or "devices.serial_number" in str(exc):
            raise HTTPException(status_code=409, detail="A device with that serial number already exists") from exc
        raise
    await db.refresh(device)
    return DeviceOut.model_validate(device)


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: str,
    payload: DeviceUpdateIn,
    db: AsyncSession = Depends(get_db),
    _writer: User = Depends(require_roles(*_WRITE_ROLES)),
) -> DeviceOut:
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(device, field, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Could not apply update due to constraint violation") from exc

    await db.refresh(device)
    return DeviceOut.model_validate(device)
