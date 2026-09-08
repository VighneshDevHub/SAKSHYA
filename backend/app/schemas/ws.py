from datetime import datetime
from typing import Any

from pydantic import BaseModel


class WSJobEvent(BaseModel):
    type: str
    job_id: str
    ts: datetime
    status: str | None = None
    progress_percent: int | None = None
    stage: str | None = None
    message: str | None = None
    error_message: str | None = None
    certificate_id: str | None = None


class WSUserEvent(BaseModel):
    type: str
    user_id: str
    ts: datetime
    notification_id: str | None = None
    payload: dict[str, Any] | None = None


class WSLogEvent(BaseModel):
    type: str
    ts: datetime
    level: str
    category: str
    message: str
    details: dict[str, Any] | None = None
