import pytest
from sqlalchemy import text

from app.db.session import engine
from app.models.jobs import TaskStatus
from app.models.operation_record import OperationType
from app.models.user import UserRole


async def _register(client, email: str, password: str) -> None:
    await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
    )


async def _login(client, email: str, password: str) -> str:
    resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def _register_and_login(client, email: str, password: str) -> str:
    await _register(client, email, password)
    return await _login(client, email, password)


async def _set_user_role(email: str, role: UserRole) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = :role WHERE email = :email"),
            {"role": role.value, "email": email},
        )


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


INV_EMAIL, INV_PW = "jobs-inv@fg.example", "supersecret123"
AUD_EMAIL, AUD_PW = "jobs-aud@fg.example", "supersecret123"
AGENT_ID = "drive-agent-node-01"


def _job_payload(**overrides):
    base = {
        "operation_type": OperationType.RECOVERY.value,
        "title": "Recovery job for USB-01",
        "payload": {"target_device_serial": "USB-01", "passes": 1},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_and_list_jobs_rbac_and_default_status(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)
    await _register(client, AUD_EMAIL, AUD_PW)
    await _set_user_role(AUD_EMAIL, UserRole.AUDITOR)
    aud_token = await _login(client, AUD_EMAIL, AUD_PW)

    # Auditor cannot create.
    blocked = await client.post(
        "/api/v1/jobs", json=_job_payload(), headers=_auth_header(aud_token)
    )
    assert blocked.status_code == 403

    # Investigator creates.
    c = await client.post(
        "/api/v1/jobs", json=_job_payload(), headers=_auth_header(inv_token)
    )
    assert c.status_code == 201
    body = c.json()
    assert body["status"] == TaskStatus.PENDING.value
    assert body["progress_percent"] == 0
    assert body["retries_count"] == 0
    assert body["job_number"].startswith("FGJ-")
    job_id = body["id"]

    # Auditor can list + see the job.
    listed = await client.get("/api/v1/jobs", headers=_auth_header(aud_token))
    assert listed.status_code == 200
    assert any(r["id"] == job_id for r in listed.json())

    # Status filter returns it for PENDING, not for COMPLETED.
    pending = await client.get("/api/v1/jobs?status=PENDING", headers=_auth_header(aud_token))
    assert pending.status_code == 200 and len(pending.json()) >= 1
    completed = await client.get("/api/v1/jobs?status=COMPLETED", headers=_auth_header(aud_token))
    assert completed.status_code == 200 and len(completed.json()) == 0


@pytest.mark.asyncio
async def test_lifecycle_claim_progress_complete_cancel_retry(client):
    inv_token = await _register_and_login(client, "lifecycle-inv@fg.example", "supersecret123")

    # Create job.
    c = await client.post(
        "/api/v1/jobs",
        json=_job_payload(operation_type=OperationType.DRIVE_ERASE.value),
        headers=_auth_header(inv_token),
    )
    assert c.status_code == 201
    job_id = c.json()["id"]

    # Agent claims it via POST /claim.
    claim = await client.post(
        "/api/v1/jobs/claim",
        json={"assigned_agent_id": AGENT_ID},
        headers=_auth_header(inv_token),
    )
    assert claim.status_code == 200 and claim.json() is not None
    assert claim.json()["status"] == TaskStatus.CLAIMED.value
    assert claim.json()["assigned_agent_id"] == AGENT_ID

    # If no PENDING jobs remain, /claim returns null.
    empty = await client.post(
        "/api/v1/jobs/claim",
        json={"assigned_agent_id": "some-other-agent"},
        headers=_auth_header(inv_token),
    )
    assert empty.status_code == 200
    assert empty.json() is None

    # POST progress → auto-transition CLAIMED → RUNNING.
    progress = await client.patch(
        f"/api/v1/jobs/{job_id}/progress",
        json={"progress_percent": 42, "stage": "Overwriting", "message": "42% done"},
        headers=_auth_header(inv_token),
    )
    assert progress.status_code == 200
    assert progress.json()["status"] == TaskStatus.RUNNING.value
    assert progress.json()["progress_percent"] == 42
    assert progress.json()["started_at"] is not None

    # CANCEL while running is allowed by SUPERVISOR/INV/ADMIN.
    cancel = await client.post(f"/api/v1/jobs/{job_id}/cancel", headers=_auth_header(inv_token))
    assert cancel.status_code == 200
    assert cancel.json()["status"] == TaskStatus.CANCELLED.value
    assert cancel.json()["cancelled_at"] is not None

    # CANCEL twice fails (terminal state guard).
    re_cancel = await client.post(f"/api/v1/jobs/{job_id}/cancel", headers=_auth_header(inv_token))
    assert re_cancel.status_code == 409

    # Retry → new PENDING job with retries_count = 1.
    retry = await client.post(f"/api/v1/jobs/{job_id}/retry", headers=_auth_header(inv_token))
    assert retry.status_code == 201
    body = retry.json()
    assert body["status"] == TaskStatus.PENDING.value
    assert body["retries_count"] == 1
    assert body["parent_job_id"] == job_id
    assert body["operation_type"] == OperationType.DRIVE_ERASE.value

    # Retry of a PENDING job → 409 (must be FAILED/CANCELLED to retry).
    bad_retry = await client.post(f"/api/v1/jobs/{body['id']}/retry", headers=_auth_header(inv_token))
    assert bad_retry.status_code == 409

    # Complete retry job via POST /fail → terminal FAILED.
    retry_id = body["id"]
    # First claim it so it's not PENDING.
    claim2 = await client.post(
        "/api/v1/jobs/claim", json={"assigned_agent_id": AGENT_ID}, headers=_auth_header(inv_token)
    )
    assert claim2.status_code == 200 and claim2.json() is not None
    fail = await client.post(
        f"/api/v1/jobs/{retry_id}/fail",
        json={"error_message": "Drive I/O error at sector 12345"},
        headers=_auth_header(inv_token),
    )
    assert fail.status_code == 200
    assert fail.json()["status"] == TaskStatus.FAILED.value
    assert "Drive I/O" in fail.json()["error_message"]

    # Progress on a COMPLETED/FAILED job returns 409.
    blocked_progress = await client.patch(
        f"/api/v1/jobs/{retry_id}/progress",
        json={"progress_percent": 99},
        headers=_auth_header(inv_token),
    )
    assert blocked_progress.status_code == 409

    # Fetch by id returns FAILED.
    get_failed = await client.get(f"/api/v1/jobs/{retry_id}", headers=_auth_header(inv_token))
    assert get_failed.status_code == 200
    assert get_failed.json()["status"] == TaskStatus.FAILED.value


@pytest.mark.asyncio
async def test_complete_flow_with_certificate_link(client):
    inv_token = await _register_and_login(client, "certlink-inv@fg.example", "supersecret123")

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(operation_type=OperationType.FILE_ERASE.value),
        headers=_auth_header(inv_token),
    )
    job_id = create.json()["id"]

    # Claim.
    claim = await client.post(
        "/api/v1/jobs/claim",
        json={"assigned_agent_id": "file-erase-agent"},
        headers=_auth_header(inv_token),
    )
    assert claim.json()["status"] == TaskStatus.CLAIMED.value

    # Progress 50 → 100%.
    p = await client.patch(
        f"/api/v1/jobs/{job_id}/progress",
        json={"progress_percent": 50, "stage": "Overwriting", "message": "Overwriting"},
        headers=_auth_header(inv_token),
    )
    assert p.status_code == 200

    # Submit a real operation to get a real certificate_id to link.
    op = await client.post(
        "/api/v1/operations",
        json={
            "operation_type": OperationType.FILE_ERASE.value,
            "target_description": "/work",
            "started_at": "2026-08-30T10:00:00Z",
            "completed_at": "2026-08-30T10:02:00Z",
            "success": True,
            "operator": "ignored",
            "details": {"files_deleted": 3},
        },
        headers=_auth_header(inv_token),
    )
    assert op.status_code == 201
    cert_id = op.json()["certificate_id"]

    complete = await client.post(
        f"/api/v1/jobs/{job_id}/complete",
        json={"certificate_id": cert_id, "success": True, "message": "Erasure complete"},
        headers=_auth_header(inv_token),
    )
    assert complete.status_code == 200
    assert complete.json()["status"] == TaskStatus.COMPLETED.value
    assert complete.json()["progress_percent"] == 100
    assert complete.json()["certificate_id"] == cert_id
    assert complete.json()["completed_at"] is not None


@pytest.mark.asyncio
async def test_audit_role_can_never_claim_progress_or_complete(client):
    inv_email, inv_pw = "rbac2-inv@fg.example", "supersecret123"
    inv_token = await _register_and_login(client, inv_email, inv_pw)
    aud_email, aud_pw = "rbac2-aud@fg.example", "supersecret123"
    await _register(client, aud_email, aud_pw)
    await _set_user_role(aud_email, UserRole.AUDITOR)
    aud_token = await _login(client, aud_email, aud_pw)

    # First, inv creates a job.
    c = await client.post(
        "/api/v1/jobs", json=_job_payload(), headers=_auth_header(inv_token)
    )
    assert c.status_code == 201
    job_id = c.json()["id"]

    # Auditor claims → 403.
    claim = await client.post(
        "/api/v1/jobs/claim",
        json={"assigned_agent_id": AGENT_ID},
        headers=_auth_header(aud_token),
    )
    assert claim.status_code == 403

    # Auditor progress → 403.
    progress = await client.patch(
        f"/api/v1/jobs/{job_id}/progress",
        json={"progress_percent": 10},
        headers=_auth_header(aud_token),
    )
    assert progress.status_code == 403

    # Auditor complete / fail / cancel / retry → 403.
    for path, method in [
        (f"/api/v1/jobs/{job_id}/complete", "POST"),
        (f"/api/v1/jobs/{job_id}/fail", "POST"),
        (f"/api/v1/jobs/{job_id}/cancel", "POST"),
        (f"/api/v1/jobs/{job_id}/retry", "POST"),
    ]:
        if method == "POST":
            resp = await client.post(path, json={}, headers=_auth_header(aud_token))
        else:
            resp = await client.patch(path, json={}, headers=_auth_header(aud_token))
        assert resp.status_code == 403, f"{path} should return 403 for Auditor, got {resp.status_code}"
