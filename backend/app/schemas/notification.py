from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.notifications import NotificationType


class NotificationOut(BaseModel):
    id: str
    user_id: str | None
    type: NotificationType
    title: str
    message: str
    payload: dict[str, Any]
    read_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationMarkReadIn(BaseModel):
    pass


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    unread_count: int | None = None
