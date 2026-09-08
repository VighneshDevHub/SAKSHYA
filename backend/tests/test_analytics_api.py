from datetime import datetime, timezone

import pytest

from app.db.session import AsyncSessionLocal
from app.models.operation_record import OperationRecord, OperationType
from app.models.user import UserRole
from tests.test_jobs_api import _auth_header, _register_and_login


INV_EMAIL, INV_PW = "an-inv@fg.example", "supersecret123"


@pytest.mark.asyncio
async def test_tr7_1_summary_endpoint_returns_all_keys(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)

    async with AsyncSessionLocal() as db:
        for i in range(4):
            op = OperationRecord(
                operation_type=OperationType.RECOVERY if i < 2 else OperationType.DRIVE_ERASE,
                target_description=f"device-{i}",
                started_at=datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc),
                completed_at=datetime(2026, 9, 1, 10, i + 1, tzinfo=timezone.utc),
                success=(i != 3),
                operator=INV_EMAIL,
                details={
                    "files_recovered": 10 if i < 2 else 0,
                    "data_size": 1048576 if i < 2 else 0,
                    "bytes_processed": 2097152 if i >= 2 else 0,
                },
                report_hash=f"aa{i}",
                signature="sig",
            )
            db.add(op)
        await db.commit()

    summary = await client.get(
        "/api/v1/analytics/summary", headers=_auth_header(inv_token)
    )
    assert summary.status_code == 200, summary.text
    body = summary.json()
    for key in (
        "recovered_files_count",
        "recovered_data_size_bytes",
        "operations_today_count",
        "devices_total",
        "success_rate_pct",
        "failure_rate_pct",
        "storage_sanitized_bytes",
        "top_investigators_by_ops",
    ):
        assert key in body, f"Missing key {key}"
    assert body["recovered_files_count"] == 20
    assert body["storage_sanitized_bytes"] == 2 * 2097152
    assert body["success_rate_pct"] == 75.0
    assert body["failure_rate_pct"] == 25.0
    assert len(body["top_investigators_by_ops"]) >= 1
    assert body["top_investigators_by_ops"][0]["email"] == INV_EMAIL


@pytest.mark.asyncio
async def test_tr7_2_public_stats_requires_no_auth(client):
    await _register_and_login(client, "pub-inv@fg.example", "supersecret123")

    public = await client.get("/api/v1/public/stats")
    assert public.status_code == 200, public.text
    body = public.json()
    for key in ("operations_count", "devices_count", "cases_count", "chain_verification_pct"):
        assert key in body
    assert body["chain_verification_pct"] == 99.9


@pytest.mark.asyncio
async def test_tr7_3_timeseries_returns_correct_bucket_shape(client):
    inv_token = await _register_and_login(client, "ts-inv@fg.example", "supersecret123")

    ts = await client.get(
        "/api/v1/analytics/timeseries?metric=operations&range=7d",
        headers=_auth_header(inv_token),
    )
    assert ts.status_code == 200
    buckets = ts.json()
    assert len(buckets) == 7
    for b in buckets:
        assert "date" in b
        assert "value" in b
        assert isinstance(b["value"], int)
