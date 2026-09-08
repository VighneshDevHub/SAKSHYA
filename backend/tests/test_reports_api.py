import pytest

from app.models.operation_record import OperationType
from tests.test_jobs_api import _auth_header, _register_and_login


INV_EMAIL, INV_PW = "rp-inv@fg.example", "supersecret123"


@pytest.mark.asyncio
async def test_tr11_1_csv_returns_text_csv_content_type(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)

    await client.post(
        "/api/v1/operations",
        json={
            "operation_type": OperationType.RECOVERY.value,
            "target_description": "report-disk-1",
            "started_at": "2026-09-01T00:00:00Z",
            "completed_at": "2026-09-01T00:10:00Z",
            "success": True,
            "operator": "ignored",
            "details": {},
        },
        headers=_auth_header(inv_token),
    )

    csv_resp = await client.get(
        "/api/v1/reports/certificates/download.csv",
        headers=_auth_header(inv_token),
    )
    assert csv_resp.status_code == 200, csv_resp.text
    content_type = csv_resp.headers.get("content-type", "")
    assert "text/csv" in content_type.lower(), f"Expected text/csv, got {content_type}"
    body = csv_resp.text
    lines = body.strip().split("\n")
    assert len(lines) >= 2
    header = lines[0]
    assert "certificate_id" in header
    assert "report_hash" in header
    assert "operator" in header


@pytest.mark.asyncio
async def test_tr11_2_single_cert_pdf_redirects_307(client):
    inv_token = await _register_and_login(client, "rp2-inv@fg.example", "supersecret123")

    op = await client.post(
        "/api/v1/operations",
        json={
            "operation_type": OperationType.DRIVE_ERASE.value,
            "target_description": "redirect-test-disk",
            "started_at": "2026-09-02T00:00:00Z",
            "completed_at": "2026-09-02T00:10:00Z",
            "success": True,
            "operator": "ignored",
            "details": {},
        },
        headers=_auth_header(inv_token),
    )
    cert_id = op.json()["certificate_id"]

    resp = await client.get(
        f"/api/v1/reports/certificates/{cert_id}/pdf",
        headers=_auth_header(inv_token),
        follow_redirects=False,
    )
    assert resp.status_code in (307, 308), f"Expected 307 redirect, got {resp.status_code}"
    location = resp.headers.get("location", "")
    assert f"/operations/{cert_id}/pdf" in location or f"operations/{cert_id}/pdf" in location
