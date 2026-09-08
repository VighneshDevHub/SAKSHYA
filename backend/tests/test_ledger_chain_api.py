import pytest

from app.models.operation_record import OperationType
from tests.test_jobs_api import _auth_header, _register_and_login


INV_EMAIL, INV_PW = "ld-inv@fg.example", "supersecret123"


@pytest.mark.asyncio
async def test_tr10_1_chain_returns_entries_with_operation_fields(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)

    certs = []
    for i in range(3):
        op = await client.post(
            "/api/v1/operations",
            json={
                "operation_type": OperationType.RECOVERY.value
                if i < 2
                else OperationType.DRIVE_ERASE.value,
                "target_description": f"device-ledger-{i}",
                "started_at": "2026-09-05T10:00:00Z",
                "completed_at": "2026-09-05T10:10:00Z",
                "success": True,
                "operator": "ignored",
                "details": {},
            },
            headers=_auth_header(inv_token),
        )
        assert op.status_code == 201, op.text
        certs.append(op.json()["certificate_id"])

    chain = await client.get(
        "/api/v1/ledger/chain?from_seq=1&to_seq=10",
        headers=_auth_header(inv_token),
    )
    assert chain.status_code == 200, chain.text
    body = chain.json()
    assert len(body) >= 3
    for idx, entry in enumerate(body[:3]):
        for key in (
            "sequence_number",
            "operation_type",
            "certificate_id",
            "target_description",
            "success",
            "report_hash",
            "previous_hash",
            "entry_hash",
            "created_at",
        ):
            assert key in entry, f"Missing key {key} at idx {idx}"
        assert entry["sequence_number"] == idx + 1
        assert entry["certificate_id"] == certs[idx]

    partial = await client.get(
        "/api/v1/ledger/chain?from_seq=2&to_seq=2",
        headers=_auth_header(inv_token),
    )
    assert partial.status_code == 200
    assert len(partial.json()) == 1
    assert partial.json()[0]["sequence_number"] == 2


@pytest.mark.asyncio
async def test_tr10_2_verify_returns_valid_flag_for_genuine_chain(client):
    inv_token = await _register_and_login(client, "ld2-inv@fg.example", "supersecret123")

    for i in range(2):
        op = await client.post(
            "/api/v1/operations",
            json={
                "operation_type": OperationType.FILE_ERASE.value,
                "target_description": f"erase-{i}",
                "started_at": "2026-09-05T11:00:00Z",
                "completed_at": "2026-09-05T11:02:00Z",
                "success": True,
                "operator": "ignored",
                "details": {},
            },
            headers=_auth_header(inv_token),
        )
        assert op.status_code == 201

    verify = await client.get(
        "/api/v1/ledger/chain/verify?seq=2",
        headers=_auth_header(inv_token),
    )
    assert verify.status_code == 200, verify.text
    body = verify.json()
    assert body["valid"] is True
    assert body["computed_entry_hash"] == body["stored_entry_hash"]
    assert "previous_hash" in body
    assert "report_hash" in body
    assert "sequence_number" in body

    bad = await client.get(
        "/api/v1/ledger/chain/verify?seq=999999",
        headers=_auth_header(inv_token),
    )
    assert bad.status_code == 404
