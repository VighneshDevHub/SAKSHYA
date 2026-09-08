from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field

from app.models.case_management import CaseStatus
from app.models.operation_record import OperationType


class CaseCreateIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=4000)
    status: CaseStatus = CaseStatus.OPEN


class CaseAssignInvestigatorIn(BaseModel):
    investigator_email: EmailStr
    set_as_lead: bool = True


class CaseEvidenceItemIn(BaseModel):
    evidence_label: str = Field(min_length=1, max_length=160)
    evidence_reference: str = Field(min_length=1, max_length=255)
    evidence_type: str = Field(default="GENERAL", min_length=1, max_length=64)
    details: dict[str, Any] = Field(default_factory=dict)


class CaseOperationLinkIn(BaseModel):
    certificate_id: str = Field(min_length=1, max_length=36)


class CaseStatusUpdateIn(BaseModel):
    status: CaseStatus


class CaseInvestigatorOut(BaseModel):
    email: str
    is_lead: bool
    assigned_at: datetime


class CaseEvidenceItemOut(BaseModel):
    id: str
    evidence_label: str
    evidence_reference: str
    evidence_type: str
    details: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class CaseLinkedOperationOut(BaseModel):
    certificate_id: str
    operation_type: OperationType
    target_description: str
    completed_at: datetime
    success: bool
    linked_at: datetime


class CaseSummaryOut(BaseModel):
    id: str
    case_number: str
    title: str
    description: str
    status: CaseStatus
    lead_investigator_email: str | None
    created_by_email: str
    investigator_count: int
    evidence_count: int
    linked_operation_count: int
    created_at: datetime
    updated_at: datetime


class CaseDetailOut(CaseSummaryOut):
    investigators: list[CaseInvestigatorOut]
    evidence_items: list[CaseEvidenceItemOut]
    linked_operations: list[CaseLinkedOperationOut]
