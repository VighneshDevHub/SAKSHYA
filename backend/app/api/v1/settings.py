from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_roles
from app.models.user import User, UserRole
from app.services import settings_service
from app.services.settings_service import AppSettings

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsPatchIn(BaseModel):
    organization_name: str | None = Field(default=None, max_length=200)
    organization_logo_url: str | None = Field(default=None, max_length=500)
    organization_address: str | None = Field(default=None, max_length=500)
    department_name: str | None = Field(default=None, max_length=200)
    department_code: str | None = Field(default=None, max_length=64)
    certificate_header_text: str | None = Field(default=None, max_length=500)
    certificate_footer_text: str | None = Field(default=None, max_length=500)
    compliance_statement: str | None = Field(default=None, max_length=2000)
    default_overwrite_passes: int | None = Field(default=None, ge=1, le=35)


@router.get("", response_model=AppSettings)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_roles(UserRole.ADMINISTRATOR)),
) -> AppSettings:
    return await settings_service.get_settings(db)


@router.patch("", response_model=AppSettings)
async def patch_settings(
    payload: SettingsPatchIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMINISTRATOR)),
) -> AppSettings:
    updates: dict[str, Any] = {}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            updates[k] = v
    return await settings_service.patch_settings(db, updates, current_user.id)
