from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.jobs import TaskStatus
from app.models.operation_record import OperationType


class JobCreateIn(BaseModel):
    operation_type: OperationType
    title: str = Field(default="", max_length=200)
    payload: dict[str, Any] = Field(default_factory=dict)
    case_id: str | None = Field(default=None, max_length=36)
    device_id: str | None = Field(default=None, max_length=36)


class JobUpdateIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    payload: dict[str, Any] | None = None
    status: TaskStatus | None = None


class JobClaimIn(BaseModel):
    assigned_agent_id: str = Field(min_length=1, max_length=128)


class JobProgressIn(BaseModel):
    progress_percent: int = Field(ge=0, le=100)
    stage: str = Field(default="", max_length=64)
    message: str = Field(default="", max_length=4000)


class JobCompleteIn(BaseModel):
    certificate_id: str | None = Field(default=None, max_length=36)
    success: bool = True
    message: str = Field(default="", max_length=4000)


class JobFailIn(BaseModel):
    error_message: str = Field(min_length=1, max_length=4000)


class JobOut(BaseModel):
    id: str
    job_number: str
    operation_type: OperationType
    title: str
    payload: dict[str, Any]
    case_id: str | None
    device_id: str | None
    created_by_user_id: str
    assigned_agent_id: str | None
    status: TaskStatus
    progress_percent: int
    stage: str
    message: str
    retries_count: int
    parent_job_id: str | None
    certificate_id: str | None
    error_message: str
    claimed_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
