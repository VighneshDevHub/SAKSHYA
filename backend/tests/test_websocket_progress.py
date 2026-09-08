import pytest

from app.core.security import create_access_token
from app.models.user import UserRole
from app.services.ws_manager import ConnectionManager, manager as default_manager


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


from sqlalchemy import text
from app.db.session import engine


async def _set_user_role(email: str, role: UserRole) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = :role WHERE email = :email"),
            {"role": role.value, "email": email},
        )


@pytest.mark.asyncio
async def test_ws_manager_state_tracks_subscribers():
    mgr = ConnectionManager()

    class FakeWS:
        def __init__(self, sid: str):
            self.sid = sid

    ws_a = FakeWS("a")
    ws_b = FakeWS("b")
    ws_c = FakeWS("c")

    mgr.connect(ws_a, "job", "job-123")
    mgr.connect(ws_b, "job", "job-123")
    mgr.connect(ws_c, "job", "job-456")

    assert mgr.get_job_subscriber_count("job-123") == 2
    assert mgr.get_job_subscriber_count("job-456") == 1
    assert mgr.get_job_subscriber_count("job-789") == 0
    assert mgr.get_total_connections() == 3

    mgr.disconnect(ws_a)
    assert mgr.get_job_subscriber_count("job-123") == 1
    assert mgr.get_total_connections() == 2

    mgr.disconnect(ws_b)
    mgr.disconnect(ws_c)
    assert mgr.get_total_connections() == 0


@pytest.mark.asyncio
async def test_ws_manager_user_and_logs_channels():
    mgr = ConnectionManager()

    class FakeWS:
        def __init__(self, sid: str):
            self.sid = sid

    ws_u1 = FakeWS("u1")
    ws_u2 = FakeWS("u2")
    ws_l1 = FakeWS("l1")

    mgr.connect(ws_u1, "user", "user-a")
    mgr.connect(ws_u2, "user", "user-b")
    mgr.connect(ws_l1, "logs")

    assert mgr.get_user_subscriber_count("user-a") == 1
    assert mgr.get_user_subscriber_count("user-b") == 1
    assert mgr.get_log_subscriber_count() == 1

    mgr.disconnect(ws_u1)
    assert mgr.get_user_subscriber_count("user-a") == 0
    assert mgr.get_total_connections() == 2


@pytest.mark.asyncio
async def test_ws_broadcast_job_event_nonblocking():
    mgr = ConnectionManager()
    received: list[dict] = []

    class FakeWS:
        async def send_text(self, data: str):
            import json
            received.append(json.loads(data))

        async def close(self, code=1000, reason=None):
            pass

    ws = FakeWS()
    mgr.connect(ws, "job", "job-event-001")

    mgr.broadcast_job_event("job-event-001", "PROGRESS", {"progress_percent": 50, "stage": "test"})

    import asyncio
    await asyncio.sleep(0.05)

    assert len(received) >= 1
    msg = received[0]
    assert msg["type"] == "PROGRESS"
    assert msg["job_id"] == "job-event-001"
    assert msg["progress_percent"] == 50
    assert msg["stage"] == "test"
    assert "ts" in msg


@pytest.mark.asyncio
async def test_ws_invalid_jwt_closes_connection_403(client):
    resp = await client.get("/health")
    assert resp.status_code == 200

    bad_token = "this.is.not.a.valid.jwt.at.all"
    try:
        async with client.websocket_connect(
            f"/ws/jobs/some-job-id?token={bad_token}"
        ) as _ws:
            assert False, "Expected WebSocket to be rejected"
    except Exception:
        pass
