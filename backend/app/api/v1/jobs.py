import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_roles
from app.models.jobs import Job, TaskStatus, generate_job_number
from app.models.user import User, UserRole
from app.schemas.job import (
    JobClaimIn,
    JobCompleteIn,
    JobCreateIn,
    JobFailIn,
    JobOut,
    JobProgressIn,
    JobUpdateIn,
)
from app.services import notification_service
from app.services.job_service import claim_next_pending
from app.services.ws_manager import manager

router = APIRouter(prefix="/jobs", tags=["jobs"])

_READ_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)
_CREATE_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.SUPERVISOR)
_CANCEL_ROLES = _CREATE_ROLES
_AGENT_OP_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.SUPERVISOR)  # CLI agents = INV tokens


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _get_job_or_404(db: AsyncSession, job_id: str) -> Job:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("", response_model=JobOut, status_code=201)
async def create_job(
    payload: JobCreateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*_CREATE_ROLES)),
) -> JobOut:
    job = Job(
        job_number=await generate_job_number(db),
        operation_type=payload.operation_type,
        title=payload.title or f"{payload.operation_type.value} job",
        payload=payload.payload,
        case_id=payload.case_id,
        device_id=payload.device_id,
        created_by_user_id=current_user.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return JobOut.model_validate(job)


@router.get("", response_model=list[JobOut])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    _reader: User = Depends(require_roles(*_READ_ROLES)),
    status: TaskStatus | None = Query(default=None),
    operation_type: str | None = Query(default=None, max_length=16),
    case_id: str | None = Query(default=None, max_length=36),
    device_id: str | None = Query(default=None, max_length=36),
    created_by_user_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[JobOut]:
    stmt = select(Job)
    if status is not None:
        stmt = stmt.where(Job.status == status)
    if operation_type:
        stmt = stmt.where(Job.operation_type == operation_type)
    if case_id:
        stmt = stmt.where(Job.case_id == case_id)
    if device_id:
        stmt = stmt.where(Job.device_id == device_id)
    if created_by_user_id:
        stmt = stmt.where(Job.created_by_user_id == created_by_user_id)
    stmt = stmt.order_by(desc(Job.created_at)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return [JobOut.model_validate(j) for j in result.scalars().all()]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _reader: User = Depends(require_roles(*_READ_ROLES)),
) -> JobOut:
    return JobOut.model_validate(await _get_job_or_404(db, job_id))


@router.post("/claim", response_model=JobOut | None)
async def claim_pending_job(
    payload: JobClaimIn,
    db: AsyncSession = Depends(get_db),
    _agent: User = Depends(require_roles(*_AGENT_OP_ROLES)),
    operation_type: str | None = Query(default=None, max_length=16),
) -> JobOut | None:
    claimed = await claim_next_pending(
        db,
        assigned_agent_id=payload.assigned_agent_id,
        operation_type=operation_type,
    )
    if claimed is None:
        return None
    await db.commit()
    await db.refresh(claimed)
    manager.broadcast_job_event(
        claimed.id,
        "CLAIMED",
        {
            "status": TaskStatus.CLAIMED.value,
            "assigned_agent_id": claimed.assigned_agent_id,
            "stage": claimed.stage,
            "message": claimed.message,
        },
    )
    return JobOut.model_validate(claimed)


@router.patch("/{job_id}/progress", response_model=JobOut)
async def update_progress(
    job_id: str,
    payload: JobProgressIn,
    db: AsyncSession = Depends(get_db),
    _agent: User = Depends(require_roles(*_AGENT_OP_ROLES)),
) -> JobOut:
    job = await _get_job_or_404(db, job_id)
    if job.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
        raise HTTPException(status_code=409, detail=f"Cannot update progress on job in status {job.status.value}")

    job.progress_percent = payload.progress_percent
    job.stage = payload.stage
    job.message = payload.message
    if job.status == TaskStatus.CLAIMED:
        job.status = TaskStatus.RUNNING
        job.started_at = job.started_at or _utcnow()
    await db.commit()
    await db.refresh(job)
    manager.broadcast_job_event(
        job.id,
        "PROGRESS",
        {
            "status": job.status.value,
            "progress_percent": job.progress_percent,
            "stage": job.stage,
            "message": job.message,
        },
    )
    return JobOut.model_validate(job)


@router.post("/{job_id}/complete", response_model=JobOut)
async def complete_job(
    job_id: str,
    payload: JobCompleteIn,
    db: AsyncSession = Depends(get_db),
    _agent: User = Depends(require_roles(*_AGENT_OP_ROLES)),
) -> JobOut:
    job = await _get_job_or_404(db, job_id)
    if job.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
        raise HTTPException(status_code=409, detail=f"Job in status {job.status.value} cannot be marked complete")

    job.status = TaskStatus.COMPLETED
    job.progress_percent = 100
    job.stage = "COMPLETED"
    job.message = payload.message or job.message
    job.certificate_id = payload.certificate_id or job.certificate_id
    job.completed_at = _utcnow()
    await db.commit()
    await db.refresh(job)
    manager.broadcast_job_event(
        job.id,
        "COMPLETED",
        {
            "status": TaskStatus.COMPLETED.value,
            "progress_percent": 100,
            "stage": "COMPLETED",
            "certificate_id": job.certificate_id,
            "message": job.message,
        },
    )
    return JobOut.model_validate(job)


@router.post("/{job_id}/fail", response_model=JobOut)
async def fail_job(
    job_id: str,
    payload: JobFailIn,
    db: AsyncSession = Depends(get_db),
    _agent: User = Depends(require_roles(*_AGENT_OP_ROLES)),
) -> JobOut:
    job = await _get_job_or_404(db, job_id)
    if job.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
        raise HTTPException(status_code=409, detail=f"Job in status {job.status.value} cannot be marked failed")

    job.status = TaskStatus.FAILED
    job.stage = "FAILED"
    job.error_message = payload.error_message
    job.message = payload.error_message
    job.completed_at = _utcnow()
    await db.commit()
    await db.refresh(job)
    manager.broadcast_job_event(
        job.id,
        "FAILED",
        {
            "status": TaskStatus.FAILED.value,
            "stage": "FAILED",
            "error_message": job.error_message,
            "message": job.message,
        },
    )
    await notification_service.notify_job_failed(
        db,
        operator_user_id=job.created_by_user_id,
        job_id=job.id,
        error_msg=job.error_message,
    )
    return JobOut.model_validate(job)


@router.post("/{job_id}/cancel", response_model=JobOut)
async def cancel_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_roles(*_CANCEL_ROLES)),
) -> JobOut:
    job = await _get_job_or_404(db, job_id)
    if job.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
        raise HTTPException(status_code=409, detail=f"Cannot cancel job in status {job.status.value}")

    job.status = TaskStatus.CANCELLED
    job.cancelled_at = _utcnow()
    job.stage = "CANCELLED"
    job.message = "Cancelled by operator"
    await db.commit()
    await db.refresh(job)
    manager.broadcast_job_event(
        job.id,
        "CANCELLED",
        {
            "status": TaskStatus.CANCELLED.value,
            "stage": "CANCELLED",
            "message": job.message,
        },
    )
    return JobOut.model_validate(job)


@router.post("/{job_id}/retry", response_model=JobOut, status_code=201)
async def retry_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*_CREATE_ROLES)),
) -> JobOut:
    parent = await _get_job_or_404(db, job_id)
    if parent.status not in (TaskStatus.FAILED, TaskStatus.CANCELLED):
        raise HTTPException(status_code=409, detail="Only FAILED or CANCELLED jobs may be retried")

    clone = Job(
        job_number=await generate_job_number(db),
        operation_type=parent.operation_type,
        title=parent.title,
        payload=dict(parent.payload),
        case_id=parent.case_id,
        device_id=parent.device_id,
        created_by_user_id=current_user.id,
        retries_count=parent.retries_count + 1,
        parent_job_id=parent.id,
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    return JobOut.model_validate(clone)
