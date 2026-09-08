import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CaseStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    UNDER_REVIEW = "UNDER_REVIEW"
    CLOSED = "CLOSED"


class CaseRecord(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    case_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[CaseStatus] = mapped_column(Enum(CaseStatus), default=CaseStatus.OPEN, index=True)

    created_by_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    lead_investigator_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    created_by = relationship("User", foreign_keys=[created_by_user_id])
    lead_investigator = relationship("User", foreign_keys=[lead_investigator_user_id])
    investigators: Mapped[list["CaseInvestigator"]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )
    evidence_items: Mapped[list["CaseEvidenceItem"]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )
    operation_links: Mapped[list["CaseOperationLink"]] = relationship(
        back_populates="case", cascade="all, delete-orphan"
    )


class CaseInvestigator(Base):
    __tablename__ = "case_investigators"
    __table_args__ = (UniqueConstraint("case_id", "user_id", name="uq_case_investigator"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    case: Mapped["CaseRecord"] = relationship(back_populates="investigators")
    user = relationship("User")


class CaseEvidenceItem(Base):
    __tablename__ = "case_evidence_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), index=True)
    evidence_label: Mapped[str] = mapped_column(String(160))
    evidence_reference: Mapped[str] = mapped_column(String(255))
    evidence_type: Mapped[str] = mapped_column(String(64), default="GENERAL")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    case: Mapped["CaseRecord"] = relationship(back_populates="evidence_items")


class CaseOperationLink(Base):
    __tablename__ = "case_operation_links"
    __table_args__ = (UniqueConstraint("case_id", "operation_record_id", name="uq_case_operation_link"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id"), index=True)
    operation_record_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("operation_records.id"), index=True
    )
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    case: Mapped["CaseRecord"] = relationship(back_populates="operation_links")
    operation_record = relationship("OperationRecord")
