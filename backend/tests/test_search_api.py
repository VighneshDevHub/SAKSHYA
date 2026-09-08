import pytest

from app.db.session import AsyncSessionLocal
from app.models.operation_record import OperationType
from app.models.user import UserRole
from tests.test_jobs_api import _auth_header, _register_and_login


INV_EMAIL, INV_PW = "s-inv@fg.example", "supersecret123"


@pytest.mark.asyncio
async def test_tr8_1_search_operations_by_target_and_operator(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)

    op1 = await client.post(
        "/api/v1/operations",
        json={
            "operation_type": OperationType.RECOVERY.value,
            "target_description": "Rare Evidence USB Drive XKCD-42",
            "started_at": "2026-09-01T10:00:00Z",
            "completed_at": "2026-09-01T10:30:00Z",
            "success": True,
            "operator": "ignored",
            "details": {"files_recovered": 10},
        },
        headers=_auth_header(inv_token),
    )
    assert op1.status_code == 201
    cert_id = op1.json()["certificate_id"]

    for _ in range(2):
        await client.post(
            "/api/v1/operations",
            json={
                "operation_type": OperationType.DRIVE_ERASE.value,
                "target_description": "Unrelated disk",
                "started_at": "2026-09-02T10:00:00Z",
                "completed_at": "2026-09-02T10:05:00Z",
                "success": True,
                "operator": "ignored",
                "details": {},
            },
            headers=_auth_header(inv_token),
        )

    res = await client.get(
        f"/api/v1/search?q=XKCD-42&types=operation",
        headers=_auth_header(inv_token),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] >= 1
    assert any(r["id"] == cert_id for r in body["results"])


@pytest.mark.asyncio
async def test_tr8_2_search_cases_by_number_title_and_types_filter(client):
    inv_token = await _register_and_login(client, "s2-inv@fg.example", "supersecret123")

    c1 = await client.post(
        "/api/v1/cases",
        json={
            "title": "Alpha Case - Financial Investigation",
            "description": "for search",
            "status": "OPEN",
        },
        headers=_auth_header(inv_token),
    )
    assert c1.status_code == 201
    c1_body = c1.json()
    case_number = c1_body["case_number"]
    case_id = c1_body["id"]

    await client.post(
        "/api/v1/cases",
        json={
            "title": "Beta Case - HR",
            "description": "other",
            "status": "OPEN",
        },
        headers=_auth_header(inv_token),
    )

    by_title = await client.get(
        "/api/v1/search?q=Financial&types=case",
        headers=_auth_header(inv_token),
    )
    assert by_title.status_code == 200
    assert any(r["id"] == case_id for r in by_title.json()["results"])

    by_number = await client.get(
        f"/api/v1/search?q={case_number}&types=case",
        headers=_auth_header(inv_token),
    )
    assert by_number.status_code == 200
    assert by_number.json()["total"] >= 1

    ops_only = await client.get(
        "/api/v1/search?q=Financial&types=operation",
        headers=_auth_header(inv_token),
    )
    assert ops_only.status_code == 200
    assert all(r["result_type"] in ("operation", "certificate") for r in ops_only.json()["results"])


@pytest.mark.asyncio
async def test_tr8_3_search_pagination_and_device_serial(client):
    inv_token = await _register_and_login(client, "s3-inv@fg.example", "supersecret123")

    await client.post(
        "/api/v1/devices",
        json={
            "serial_number": "SEARCHME-SN-777",
            "manufacturer": "Samsung",
            "model": "SSD 990",
            "capacity_bytes": 1_000_000_000_000,
        },
        headers=_auth_header(inv_token),
    )

    r = await client.get(
        "/api/v1/search?q=SEARCHME-SN-777&limit=10",
        headers=_auth_header(inv_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["limit"] == 10
    assert body["offset"] == 0
    assert "total" in body
    assert isinstance(body["results"], list)

    pag = await client.get(
        "/api/v1/search?limit=2&offset=0&types=case",
        headers=_auth_header(inv_token),
    )
    assert pag.status_code == 200
    assert len(pag.json()["results"]) <= 2
