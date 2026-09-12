"""Background execution for dashboard-created local jobs.

The first worker uses the existing file/folder eraser implementation directly
so the dashboard can execute a real FILE_ERASE job without requiring a second
terminal. The eraser algorithm remains owned by file-folder-eraser/src.
"""
import asyncio
import importlib
import threading
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.crypto import sign_payload
from app.db.session import AsyncSessionLocal
from app.models.jobs import Job, TaskStatus
from app.models.operation_record import LedgerEntry, OperationRecord, OperationType
from app.services import ledger_service, notification_service
from app.services.ws_manager import manager


_REPO_ROOT = Path(__file__).resolve().parents[3]
_FILE_ERASER_ROOT = _REPO_ROOT / "file-folder-eraser"
_RECOVERY_ROOT = _REPO_ROOT / "recovery-engine"
_DRIVE_ERASER_ROOT = _REPO_ROOT / "drive-eraser-agent"
_AGENT_IMPORT_LOCK = threading.Lock()


@contextmanager
def _isolated_agent_imports(root: Path):
    """Temporarily load one CLI's ``src`` package without cross-module leaks."""
    previous = {name: module for name, module in sys.modules.items() if name == "src" or name.startswith("src.")}
    for name in previous:
        sys.modules.pop(name, None)
    old_path = list(sys.path)
    sys.path.insert(0, str(root))
    try:
        yield
    finally:
        for name in [name for name in sys.modules if name == "src" or name.startswith("src.")]:
            sys.modules.pop(name, None)
        sys.path[:] = old_path
        sys.modules.update(previous)


def _load_batch_runner():
    with _AGENT_IMPORT_LOCK, _isolated_agent_imports(_FILE_ERASER_ROOT):
        return importlib.import_module("src.batch_runner").run_batch


def _run_recovery(payload: dict) -> dict:
    with _AGENT_IMPORT_LOCK, _isolated_agent_imports(_RECOVERY_ROOT):
        run_recovery = importlib.import_module("src.recovery_engine").run_recovery
        started_at = datetime.now(timezone.utc)
        summary = run_recovery(str(payload["image_path"]), str(payload["output_dir"]))
        completed_at = datetime.now(timezone.utc)
        report = importlib.import_module("src.report_builder").build_report(
            summary, started_at, completed_at, "dashboard-worker"
        )
        return report


def _run_drive_erase(payload: dict) -> dict:
    with _AGENT_IMPORT_LOCK, _isolated_agent_imports(_DRIVE_ERASER_ROOT):
        main = importlib.import_module("src.main")
        method_selector = importlib.import_module("src.method_selector")
        verifier = importlib.import_module("src.verifier")
        report_builder = importlib.import_module("src.report_builder")
        target = str(payload["target"])
        real_device = bool(payload.get("real_device", False))
        if real_device:
            if sys.platform == "win32" and not target.isdigit():
                raise ValueError(
                    "Real-device mode requires a numeric Windows DeviceId "
                    "(for example '1'), not a filename. Set real_device=false "
                    "for test-file targets."
                )
            if sys.platform == "win32":
                from src.detectors.windows_block_device import WindowsBlockDeviceDetector

                detector = WindowsBlockDeviceDetector()
                wipe_target = main.windows_physical_drive_path(target)
            else:
                detector = importlib.import_module("src.detectors.linux_block_device").LinuxBlockDeviceDetector()
                wipe_target = target
        else:
            detector = importlib.import_module("src.detectors.file_target").FileTargetDetector()
            wipe_target = target
        device = detector.detect(target)
        wiper = method_selector.select_wiper(device.device_type, device.supports_encryption)
        samples = verifier.capture_pre_wipe_samples(wipe_target, device.size_bytes)
        started_at = datetime.now(timezone.utc)
        wipe_result = wiper.wipe(wipe_target, device.size_bytes)
        completed_at = datetime.now(timezone.utc)
        verification = verifier.verify_wipe(wipe_target, samples)
        return report_builder.build_report(
            device, wipe_result, started_at, completed_at, verification.passed, "dashboard-worker"
        )


async def _broadcast(job: Job, event_type: str) -> None:
    manager.broadcast_job_event(
        job.id,
        event_type,
        {
            "status": job.status.value,
            "progress_percent": job.progress_percent,
            "stage": job.stage,
            "message": job.message,
            "certificate_id": job.certificate_id,
        },
    )


async def _update_job(job_id: str, **values: object) -> Job | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if job is None:
            return None
        for key, value in values.items():
            setattr(job, key, value)
        await db.commit()
        await db.refresh(job)
        return job


async def _record_operation(job: Job, report: dict, operator_email: str) -> str:
    settings = get_settings()
    private_key_pem, _ = _signing_keys(settings)
    now = datetime.now(timezone.utc)
    record = OperationRecord(
        certificate_id=job.id,
        operation_type=OperationType(report["operation_type"]),
        target_description=report["target_description"],
        started_at=job.started_at or datetime.fromisoformat(report["started_at"].replace("Z", "+00:00")),
        completed_at=now,
        success=bool(report["success"]),
        operator=operator_email,
        details=report["details"],
        report_hash="",
        signature="",
    )
    report_hash, signature = sign_payload(record.to_signable_dict(), private_key_pem)
    record.report_hash = report_hash
    record.signature = signature
    async with AsyncSessionLocal() as db:
        db.add(record)
        await db.flush()
        entry = await ledger_service.append_to_ledger(db, record)
        await db.commit()
        await db.refresh(entry)
        await notification_service.notify_cert_generated(
            db, operator_user_id=job.created_by_user_id, certificate_id=record.certificate_id
        )
        return record.certificate_id


def _signing_keys(settings):
    from app.core.crypto import get_or_create_dev_keypair

    return get_or_create_dev_keypair()


async def execute_file_erase_job(job_id: str, operator_email: str) -> None:
    """Execute one FILE_ERASE job and publish real lifecycle events."""
    job = await _update_job(
        job_id,
        status=TaskStatus.CLAIMED,
        assigned_agent_id="file-folder-eraser",
        claimed_at=datetime.now(timezone.utc),
        stage="CLAIMED",
        message="File Eraser Agent claimed the job",
    )
    if job is None:
        return
    await _broadcast(job, "CLAIMED")

    try:
        job = await _update_job(
            job_id,
            status=TaskStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
            progress_percent=5,
            stage="OVERWRITING",
            message="Securely overwriting selected files",
        )
        if job is None:
            return
        await _broadcast(job, "PROGRESS")

        payload = job.payload or {}
        targets = payload.get("targets", [])
        if isinstance(targets, str):
            targets = [targets]
        if not targets:
            raise ValueError("FILE_ERASE job requires at least one target")

        run_batch = _load_batch_runner()
        result = await asyncio.to_thread(
            run_batch,
            [str(target) for target in targets],
            bool(payload.get("free_space_overwrite", False)),
            payload.get("freespace_max_bytes"),
        )
        report = {
            "operation_type": "FILE_ERASE",
            "target_description": f"{result.files_deleted} file(s) across {result.targets_requested} target(s)",
            "success": result.files_failed == 0 and result.files_deleted > 0,
            "details": {
                "targets_requested": result.targets_requested,
                "files_deleted": result.files_deleted,
                "files_failed": result.files_failed,
                "total_bytes_overwritten": result.total_bytes_overwritten,
                "metadata_scrubbed": result.metadata_scrubbed,
                "freespace_bytes_overwritten": result.freespace_bytes_overwritten,
                "failures": [
                    {"path": item.original_path, "error": item.error}
                    for item in result.per_file_results
                    if not item.success
                ],
            },
            "started_at": (job.started_at or datetime.now(timezone.utc)).isoformat(),
        }
        certificate_id = await _record_operation(job, report, operator_email)
        success = result.files_failed == 0 and result.files_deleted > 0
        final = await _update_job(
            job_id,
            status=TaskStatus.COMPLETED if success else TaskStatus.FAILED,
            progress_percent=100,
            stage="COMPLETED" if success else "FAILED",
            message=f"Deleted {result.files_deleted}; failed {result.files_failed}",
            error_message="" if success else "One or more targets could not be erased",
            completed_at=datetime.now(timezone.utc),
            certificate_id=certificate_id,
        )
        if final is not None:
            await _broadcast(final, "COMPLETED" if success else "FAILED")
    except Exception as exc:
        failed = await _update_job(
            job_id,
            status=TaskStatus.FAILED,
            stage="FAILED",
            message=str(exc),
            error_message=str(exc),
            completed_at=datetime.now(timezone.utc),
        )
        if failed is not None:
            await _broadcast(failed, "FAILED")


async def _execute_report_job(
    job_id: str,
    operator_email: str,
    agent_id: str,
    runner,
    stage: str,
) -> None:
    job = await _update_job(
        job_id,
        status=TaskStatus.CLAIMED,
        assigned_agent_id=agent_id,
        claimed_at=datetime.now(timezone.utc),
        stage="CLAIMED",
        message=f"{agent_id} claimed the job",
    )
    if job is None:
        return
    await _broadcast(job, "CLAIMED")
    try:
        job = await _update_job(
            job_id,
            status=TaskStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
            progress_percent=5,
            stage=stage,
            message=f"{agent_id} is executing the operation",
        )
        if job is None:
            return
        await _broadcast(job, "PROGRESS")
        report = await asyncio.to_thread(runner, job.payload or {})
        certificate_id = await _record_operation(job, report, operator_email)
        final = await _update_job(
            job_id,
            status=TaskStatus.COMPLETED if report["success"] else TaskStatus.FAILED,
            progress_percent=100,
            stage="COMPLETED" if report["success"] else "FAILED",
            message="Operation completed and certificate issued",
            error_message="" if report["success"] else "Operation completed without a successful verification result",
            completed_at=datetime.now(timezone.utc),
            certificate_id=certificate_id,
        )
        if final is not None:
            await _broadcast(final, "COMPLETED" if report["success"] else "FAILED")
    except Exception as exc:
        failed = await _update_job(
            job_id,
            status=TaskStatus.FAILED,
            stage="FAILED",
            message=str(exc),
            error_message=str(exc),
            completed_at=datetime.now(timezone.utc),
        )
        if failed is not None:
            await _broadcast(failed, "FAILED")


async def execute_recovery_job(job_id: str, operator_email: str) -> None:
    await _execute_report_job(job_id, operator_email, "recovery-engine", _run_recovery, "SCANNING")


async def execute_drive_erase_job(job_id: str, operator_email: str) -> None:
    await _execute_report_job(job_id, operator_email, "drive-eraser-agent", _run_drive_erase, "WIPING")
