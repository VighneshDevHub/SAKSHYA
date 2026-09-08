from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_db
from app.models.case_management import (
    CaseEvidenceItem,
    CaseInvestigator,
    CaseOperationLink,
    CaseRecord,
)
from app.models.operation_record import OperationRecord
from app.models.timeline import TimelineEvent, TimelineEventType
from app.models.user import User
from app.schemas.case import (
    CaseAssignInvestigatorIn,
    CaseCreateIn,
    CaseDetailOut,
    CaseEvidenceItemIn,
    CaseEvidenceItemOut,
    CaseInvestigatorOut,
    CaseLinkedOperationOut,
    CaseOperationLinkIn,
    CaseStatusUpdateIn,
    CaseSummaryOut,
)
from app.schemas.timeline import TimelineEventOut, TimelineNoteCreateIn
from app.services.case_service import generate_case_number

router = APIRouter(prefix="/cases", tags=["cases"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_summary(case: CaseRecord) -> CaseSummaryOut:
    return CaseSummaryOut(
        id=case.id,
        case_number=case.case_number,
        title=case.title,
        description=case.description,
        status=case.status,
        lead_investigator_email=case.lead_investigator.email if case.lead_investigator else None,
        created_by_email=case.created_by.email,
        investigator_count=len(case.investigators),
        evidence_count=len(case.evidence_items),
        linked_operation_count=len(case.operation_links),
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def _to_detail(case: CaseRecord) -> CaseDetailOut:
    investigators = sorted(
        (
            CaseInvestigatorOut(
                email=assignment.user.email,
                is_lead=assignment.is_lead,
                assigned_at=assignment.assigned_at,
            )
            for assignment in case.investigators
        ),
        key=lambda item: (not item.is_lead, item.email),
    )
    evidence_items = [
        CaseEvidenceItemOut.model_validate(item) for item in sorted(case.evidence_items, key=lambda x: x.created_at)
    ]
    linked_operations = sorted(
        (
            CaseLinkedOperationOut(
                certificate_id=link.operation_record.certificate_id,
                operation_type=link.operation_record.operation_type,
                target_description=link.operation_record.target_description,
                completed_at=link.operation_record.completed_at,
                success=link.operation_record.success,
                linked_at=link.linked_at,
            )
            for link in case.operation_links
        ),
        key=lambda item: item.linked_at,
        reverse=True,
    )

    return CaseDetailOut(
        **_to_summary(case).model_dump(),
        investigators=investigators,
        evidence_items=evidence_items,
        linked_operations=linked_operations,
    )


async def _get_case_or_404(db: AsyncSession, case_id: str) -> CaseRecord:
    result = await db.execute(
        select(CaseRecord)
        .where(CaseRecord.id == case_id)
        .execution_options(populate_existing=True)
        .options(
            selectinload(CaseRecord.created_by),
            selectinload(CaseRecord.lead_investigator),
            selectinload(CaseRecord.investigators).selectinload(CaseInvestigator.user),
            selectinload(CaseRecord.evidence_items),
            selectinload(CaseRecord.operation_links).selectinload(CaseOperationLink.operation_record),
        )
    )
    case = result.scalar_one_or_none()
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.post("", response_model=CaseDetailOut, status_code=201)
async def create_case(
    payload: CaseCreateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseDetailOut:
    case = CaseRecord(
        case_number=await generate_case_number(db),
        title=payload.title,
        description=payload.description,
        status=payload.status,
        created_by_user_id=current_user.id,
        lead_investigator_user_id=current_user.id,
    )
    db.add(case)
    await db.flush()

    db.add(
        CaseInvestigator(
            case_id=case.id,
            user_id=current_user.id,
            is_lead=True,
        )
    )
    await db.commit()
    return _to_detail(await _get_case_or_404(db, case.id))


@router.get("", response_model=list[CaseSummaryOut])
async def list_cases(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    limit: int = 100,
    offset: int = 0,
) -> list[CaseSummaryOut]:
    result = await db.execute(
        select(CaseRecord)
        .options(
            selectinload(CaseRecord.created_by),
            selectinload(CaseRecord.lead_investigator),
            selectinload(CaseRecord.investigators),
            selectinload(CaseRecord.evidence_items),
            selectinload(CaseRecord.operation_links),
        )
        .order_by(desc(CaseRecord.created_at))
        .limit(limit)
        .offset(offset)
    )
    return [_to_summary(case) for case in result.scalars().all()]


@router.get("/{case_id}", response_model=CaseDetailOut)
async def get_case(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> CaseDetailOut:
    return _to_detail(await _get_case_or_404(db, case_id))


@router.get("/{case_id}/timeline", response_model=list[TimelineEventOut])
async def get_case_timeline(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[TimelineEventOut]:
    case = await _get_case_or_404(db, case_id)
    result = await db.execute(
        select(TimelineEvent)
        .where(TimelineEvent.case_id == case.id)
        .order_by(asc(TimelineEvent.event_at))
    )
    return [TimelineEventOut.model_validate(e) for e in result.scalars().all()]


@router.post("/{case_id}/timeline", response_model=TimelineEventOut, status_code=201)
async def create_case_timeline_note(
    case_id: str,
    payload: TimelineNoteCreateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TimelineEventOut:
    case = await _get_case_or_404(db, case_id)
    ev = TimelineEvent(
        case_id=case.id,
        event_type=TimelineEventType.NOTE,
        actor_email=current_user.email,
        description=payload.description,
        event_metadata=payload.event_metadata,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return TimelineEventOut.model_validate(ev)


@router.post("/{case_id}/assign", response_model=CaseDetailOut)
async def assign_investigator(
    case_id: str,
    payload: CaseAssignInvestigatorIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseDetailOut:
    case = await _get_case_or_404(db, case_id)

    user_result = await db.execute(select(User).where(User.email == payload.investigator_email))
    investigator = user_result.scalar_one_or_none()
    if investigator is None:
        raise HTTPException(status_code=404, detail="Investigator account not found")

    existing = next((item for item in case.investigators if item.user_id == investigator.id), None)
    if existing is None:
        db.add(
            CaseInvestigator(
                case_id=case.id,
                user_id=investigator.id,
                is_lead=payload.set_as_lead,
            )
        )
    elif payload.set_as_lead:
        existing.is_lead = True

    if payload.set_as_lead:
        case.lead_investigator_user_id = investigator.id
        for assignment in case.investigators:
            if assignment.user_id != investigator.id:
                assignment.is_lead = False

    await db.commit()

    db.add(TimelineEvent(
        case_id=case.id,
        event_type=TimelineEventType.INVESTIGATOR_ASSIGNED,
        event_at=_utcnow(),
        actor_email=current_user.email,
        description=f"Assigned investigator {investigator.email}"
        + (" as lead" if payload.set_as_lead else ""),
        event_metadata={
            "investigator_user_id": investigator.id,
            "investigator_email": investigator.email,
            "set_as_lead": payload.set_as_lead,
        },
    ))
    await db.commit()

    return _to_detail(await _get_case_or_404(db, case_id))


@router.post("/{case_id}/evidence", response_model=CaseDetailOut)
async def add_case_evidence(
    case_id: str,
    payload: CaseEvidenceItemIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseDetailOut:
    case = await _get_case_or_404(db, case_id)
    db.add(
        CaseEvidenceItem(
            case_id=case.id,
            evidence_label=payload.evidence_label,
            evidence_reference=payload.evidence_reference,
            evidence_type=payload.evidence_type,
            details=payload.details,
        )
    )
    await db.commit()

    db.add(TimelineEvent(
        case_id=case.id,
        event_type=TimelineEventType.EVIDENCE_ADDED,
        event_at=_utcnow(),
        actor_email=current_user.email,
        description=f"Added evidence: {payload.evidence_label}",
        event_metadata={
            "evidence_label": payload.evidence_label,
            "evidence_reference": payload.evidence_reference,
            "evidence_type": payload.evidence_type,
        },
    ))
    await db.commit()

    return _to_detail(await _get_case_or_404(db, case_id))


@router.post("/{case_id}/operations", response_model=CaseDetailOut)
async def link_case_operation(
    case_id: str,
    payload: CaseOperationLinkIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseDetailOut:
    case = await _get_case_or_404(db, case_id)

    result = await db.execute(
        select(OperationRecord).where(OperationRecord.certificate_id == payload.certificate_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Certificate not found")

    if any(link.operation_record_id == record.id for link in case.operation_links):
        raise HTTPException(status_code=409, detail="Operation already linked to this case")

    db.add(CaseOperationLink(case_id=case.id, operation_record_id=record.id))
    await db.commit()

    db.add(TimelineEvent(
        case_id=case.id,
        event_type=TimelineEventType.OPERATION_LINKED,
        event_at=_utcnow(),
        actor_email=current_user.email,
        description=f"Linked operation certificate {payload.certificate_id}",
        event_metadata={
            "certificate_id": payload.certificate_id,
            "operation_type": record.operation_type.value
            if hasattr(record.operation_type, "value")
            else str(record.operation_type),
        },
        operation_record_id=record.id,
    ))
    await db.commit()

    return _to_detail(await _get_case_or_404(db, case_id))


@router.post("/{case_id}/status", response_model=CaseDetailOut)
async def update_case_status(
    case_id: str,
    payload: CaseStatusUpdateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CaseDetailOut:
    case = await _get_case_or_404(db, case_id)
    old_status = case.status.value if hasattr(case.status, "value") else str(case.status)
    case.status = payload.status
    await db.commit()

    new_status = case.status.value if hasattr(case.status, "value") else str(case.status)
    db.add(TimelineEvent(
        case_id=case.id,
        event_type=TimelineEventType.STATUS_CHANGED,
        event_at=_utcnow(),
        actor_email=current_user.email,
        description=f"Case status changed from {old_status} to {new_status}",
        event_metadata={
            "old_status": old_status,
            "new_status": new_status,
        },
    ))
    await db.commit()

    return _to_detail(await _get_case_or_404(db, case_id))
