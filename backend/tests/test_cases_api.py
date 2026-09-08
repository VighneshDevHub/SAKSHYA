import pytest

from app.models import case_management  # noqa: F401 - ensures metadata registration for tests


DRIVE_ERASE_REPORT = {
    "operation_type": "DRIVE_ERASE",
    "target_description": "USB-CASE-DEVICE-01",
    "started_at": "2026-09-06T09:00:00Z",
    "completed_at": "2026-09-06T09:01:00Z",
    "success": True,
    "operator": "ignored-client-value",
    "details": {"method": "Clear", "device_type": "USB"},
}


async def _auth_headers(client, email: str) -> dict:
    await client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret123"})
    login_resp = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret123"})
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_case_auto_assigns_creator_as_lead_investigator(client):
    headers = await _auth_headers(client, "lead@forensicguard.example")

    resp = await client.post(
        "/api/v1/cases",
        json={"title": "NTRO Seized Drive A", "description": "Initial acquisition and sanitization review"},
        headers=headers,
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["case_number"].startswith("FG-")
    assert body["status"] == "OPEN"
    assert body["lead_investigator_email"] == "lead@forensicguard.example"
    assert body["investigator_count"] == 1
    assert body["linked_operation_count"] == 0


@pytest.mark.asyncio
async def test_case_supports_assignment_evidence_and_operation_linking(client):
    headers = await _auth_headers(client, "lead@forensicguard.example")
    await _auth_headers(client, "investigator@forensicguard.example")

    case_resp = await client.post(
        "/api/v1/cases",
        json={"title": "SSD Recovery Review", "description": "Recover files and preserve chain of custody"},
        headers=headers,
    )
    case_id = case_resp.json()["id"]

    assign_resp = await client.post(
        f"/api/v1/cases/{case_id}/assign",
        json={"investigator_email": "investigator@forensicguard.example", "set_as_lead": True},
        headers=headers,
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["lead_investigator_email"] == "investigator@forensicguard.example"

    evidence_resp = await client.post(
        f"/api/v1/cases/{case_id}/evidence",
        json={
            "evidence_label": "Seized NVMe",
            "evidence_reference": "NVME-SN-7788",
            "evidence_type": "DEVICE",
            "details": {"capacity_gb": 512, "connection_type": "PCIe"},
        },
        headers=headers,
    )
    assert evidence_resp.status_code == 200
    assert evidence_resp.json()["evidence_count"] == 1

    op_resp = await client.post("/api/v1/operations", json=DRIVE_ERASE_REPORT, headers=headers)
    cert_id = op_resp.json()["certificate_id"]

    link_resp = await client.post(
        f"/api/v1/cases/{case_id}/operations",
        json={"certificate_id": cert_id},
        headers=headers,
    )
    assert link_resp.status_code == 200
    body = link_resp.json()
    assert body["linked_operation_count"] == 1
    assert body["linked_operations"][0]["certificate_id"] == cert_id


@pytest.mark.asyncio
async def test_list_cases_and_update_status(client):
    headers = await _auth_headers(client, "supervisor@forensicguard.example")

    create_resp = await client.post(
        "/api/v1/cases",
        json={"title": "Archive Media Review", "description": "Queued for evidence handling"},
        headers=headers,
    )
    case_id = create_resp.json()["id"]

    status_resp = await client.post(
        f"/api/v1/cases/{case_id}/status",
        json={"status": "UNDER_REVIEW"},
        headers=headers,
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "UNDER_REVIEW"

    list_resp = await client.get("/api/v1/cases", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
    assert list_resp.json()[0]["case_number"] == create_resp.json()["case_number"]


@pytest.mark.asyncio
async def test_linking_same_certificate_twice_returns_conflict(client):
    headers = await _auth_headers(client, "operator@forensicguard.example")
    case_resp = await client.post(
        "/api/v1/cases",
        json={"title": "Duplicate Link Guard", "description": ""},
        headers=headers,
    )
    case_id = case_resp.json()["id"]

    op_resp = await client.post("/api/v1/operations", json=DRIVE_ERASE_REPORT, headers=headers)
    cert_id = op_resp.json()["certificate_id"]

    first = await client.post(
        f"/api/v1/cases/{case_id}/operations",
        json={"certificate_id": cert_id},
        headers=headers,
    )
    second = await client.post(
        f"/api/v1/cases/{case_id}/operations",
        json={"certificate_id": cert_id},
        headers=headers,
    )

    assert first.status_code == 200
    assert second.status_code == 409
