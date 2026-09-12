import functools
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import Setting


_DEFAULT_HEADER = "Issued by PRAMAAN — NIST SP 800-88 Compliant Digital Forensics Platform"

_SETTINGS_CACHE: dict[str, Any] = {"_cached": None, "_ts": 0.0}


class AppSettings(BaseModel):
    organization_name: str = Field(default="PRAMAAN")
    organization_logo_url: str = Field(default="")
    organization_address: str = Field(default="")
    department_name: str = Field(default="Digital Forensics Unit")
    department_code: str = Field(default="DFU-001")
    certificate_header_text: str = Field(default=_DEFAULT_HEADER)
    certificate_footer_text: str = Field(default="")
    compliance_statement: str = Field(
        default="This report is cryptographically signed. Any alteration to the underlying record will cause verification to fail."
    )
    default_overwrite_passes: int = Field(default=3, ge=1, le=35)
    hash_algorithm_display: str = Field(default="SHA-256")


_KNOWN_KEYS = {
    "organization_name",
    "organization_logo_url",
    "organization_address",
    "department_name",
    "department_code",
    "certificate_header_text",
    "certificate_footer_text",
    "compliance_statement",
    "default_overwrite_passes",
}


@functools.lru_cache(maxsize=1, typed=False)
def _cached_defaults() -> AppSettings:
    return AppSettings()


def _clear_settings_cache() -> None:
    _SETTINGS_CACHE["_cached"] = None
    _SETTINGS_CACHE["_ts"] = 0.0


def _to_py_value(key: str, stored_value: Any) -> Any:
    defaults = _cached_defaults().model_dump()
    default = defaults.get(key)
    raw = stored_value
    if isinstance(raw, dict) and "value" in raw:
        raw = raw["value"]
    if isinstance(default, bool):
        return bool(raw)
    if isinstance(default, int):
        try:
            return int(raw)
        except (TypeError, ValueError):
            return default
    if isinstance(default, str):
        return str(raw) if raw is not None else default
    return raw if raw is not None else default


async def get_settings(db: AsyncSession) -> AppSettings:
    cached = _SETTINGS_CACHE.get("_cached")
    if cached is not None:
        return cached
    defaults = _cached_defaults().model_dump()
    result = await db.execute(select(Setting))
    rows = result.scalars().all()
    for row in rows:
        if row.setting_key in _KNOWN_KEYS:
            defaults[row.setting_key] = _to_py_value(
                row.setting_key, row.setting_value
            )
    loaded = AppSettings(**defaults)
    _SETTINGS_CACHE["_cached"] = loaded
    return loaded


async def patch_settings(
    db: AsyncSession,
    updates: dict[str, Any],
    user_id: str,
) -> AppSettings:
    now = datetime.now(timezone.utc)
    for key, value in updates.items():
        if key not in _KNOWN_KEYS:
            continue
        if key == "hash_algorithm_display":
            continue
        stmt = select(Setting).where(Setting.setting_key == key)
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row is None:
            row = Setting(
                setting_key=key,
                setting_value={"value": value},
                updated_at=now,
                updated_by_user_id=user_id,
            )
            db.add(row)
        else:
            row.setting_value = {"value": value}
            row.updated_at = now
            row.updated_by_user_id = user_id

    await db.commit()
    _clear_settings_cache()
    return await get_settings(db)
