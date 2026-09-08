import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.case_management import CaseRecord, CaseStatus
from app.models.operation_record import OperationType
from app.models.user import UserRole
from tests.test_jobs_api import _auth_header, _register_and_login


INV_EMAIL, INV_PW = "tl-inv@fg.example", "supersecret123"
INV2_EMAIL, INV2_PW = "tl-inv2@fg.example", "supersecret123"


@pytest.mark.asyncio
async def test_tr6_1_create_case_creates_timeline_events_for_lifecycle(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)
    await _register_and_login(client, INV2_EMAIL, INV2_PW)

    create_case = await client.post(
        "/api/v1/cases",
        json={
            "title": "Timeline Case 1",
            "description": "Test case for timeline",
            "status": CaseStatus.OPEN.value,
        },
        headers=_auth_header(inv_token),
    )
    assert create_case.status_code == 201, create_case.text
    case_id = create_case.json()["id"]

    assign = await client.post(
        f"/api/v1/cases/{case_id}/assign",
        json={"investigator_email": INV2_EMAIL, "set_as_lead": False},
        headers=_auth_header(inv_token),
    )
    assert assign.status_code == 200

    status_upd = await client.post(
        f"/api/v1/cases/{case_id}/status",
        json={"status": CaseStatus.IN_PROGRESS.value},
        headers=_auth_header(inv_token),
    )
    assert status_upd.status_code == 200

    tl = await client.get(
        f"/api/v1/cases/{case_id}/timeline", headers=_auth_header(inv_token)
    )
    assert tl.status_code == 200
    events = tl.json()
    types = [e["event_type"] for e in events]
    assert "INVESTIGATOR_ASSIGNED" in types
    assert "STATUS_CHANGED" in types

    for ev in events:
        assert "event_at" in ev
        assert "actor_email" in ev


@pytest.mark.asyncio
async def test_tr6_2_post_note_creates_timeline_event(client):
    inv_token = await _register_and_login(client, "note-inv@fg.example", "supersecret123")

    cc = await client.post(
        "/api/v1/cases",
        json={
            "title": "Note Case",
            "description": "For note",
            "status": CaseStatus.OPEN.value,
        },
        headers=_auth_header(inv_token),
    )
    case_id = cc.json()["id"]

    note = await client.post(
        f"/api/v1/cases/{case_id}/timeline",
        json={
            "description": "Manual investigation note: interviewed witness A",
            "metadata": {"source": "interview", "tag": "witness"},
        },
        headers=_auth_header(inv_token),
    )
    assert note.status_code == 201, note.text
    body = note.json()
    assert body["event_type"] == "NOTE"
    assert "witness A" in body["description"]
    assert body["metadata"]["tag"] == "witness"

    tl = await client.get(
        f"/api/v1/cases/{case_id}/timeline", headers=_auth_header(inv_token)
    )
    assert tl.status_code == 200
    assert any(e["event_type"] == "NOTE" for e in tl.json())


@pytest.mark.asyncio
async def test_tr6_3_link_operation_creates_timeline_event_with_fk(client):
    inv_token = await _register_and_login(client, "link-inv@fg.example", "supersecret123")

    cc = await client.post(
        "/api/v1/cases",
        json={
            "title": "Link Case",
            "description": "For operation link",
            "status": CaseStatus.OPEN.value,
        },
        headers=_auth_header(inv_token),
    )
    case_id = cc.json()["id"]

    op = await client.post(
        "/api/v1/operations",
        json={
            "operation_type": OperationType.RECOVERY.value,
            "target_description": "USB disk",
            "started_at": "2026-09-01T10:00:00Z",
            "completed_at": "2026-09-01T10:30:00Z",
            "success": True,
            "operator": "ignored",
            "details": {"files_recovered": 5},
        },
        headers=_auth_header(inv_token),
    )
    assert op.status_code == 201
    cert_id = op.json()["certificate_id"]

    link = await client.post(
        f"/api/v1/cases/{case_id}/operations",
        json={"certificate_id": cert_id},
        headers=_auth_header(inv_token),
    )
    assert link.status_code == 200

    tl = await client.get(
        f"/api/v1/cases/{case_id}/timeline", headers=_auth_header(inv_token)
    )
    assert tl.status_code == 200
    events = tl.json()
    link_events = [e for e in events if e["event_type"] == "OPERATION_LINKED"]
    assert len(link_events) >= 1
    assert link_events[0]["operation_record_id"] is not None
