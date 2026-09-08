from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, computed_field

from app.models.timeline import TimelineEventType


class TimelineEventOut(BaseModel):
    id: str
    case_id: str
    event_type: TimelineEventType
    event_at: datetime
    actor_email: str
    description: str
    event_metadata: dict[str, Any]
    operation_record_id: str | None

    @computed_field
    @property
    def metadata(self) -> dict[str, Any]:
        return self.event_metadata

    model_config = {"from_attributes": True}


class TimelineNoteCreateIn(BaseModel):
    description: str = Field(min_length=1, max_length=4000)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def event_metadata(self) -> dict[str, Any]:
        return self.metadata
