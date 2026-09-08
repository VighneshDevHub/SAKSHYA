import asyncio
import time

import pytest
from sqlalchemy import select, text

from app.core.logging import system_log_buffer
from app.db.session import AsyncSessionLocal, engine
from app.models.system_log import LogCategory, LogLevel, SystemLog
from app.models.user import UserRole


async def _set_user_role(email: str, role: UserRole) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = :role WHERE email = :email"),
            {"role": role.value, "email": email},
        )


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


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_tr13_1_rapid_logs_flushed_within_two_seconds():
    old_n = system_log_buffer.flush_every_n
    old_s = system_log_buffer.flush_every_s
    system_log_buffer.flush_every_n = 25
    system_log_buffer.flush_every_s = 0.2
    try:
        system_log_buffer._buffer.clear()
        system_log_buffer.start()
        t0 = time.time()
        for i in range(200):
            await system_log_buffer.log(
                LogLevel.INFO,
                LogCategory.BACKEND,
                f"rapid log entry #{i}",
                details={"seq": i},
                source="test.tr13_1",
            )
        deadline = t0 + 2.0
        while time.time() < deadline:
            await asyncio.sleep(0.1)
            if system_log_buffer.pending_count() == 0:
                break

        async with AsyncSessionLocal() as db:
            stmt = select(func := SystemLog.id)
            from sqlalchemy import func as sqlfunc
            cnt = (await db.execute(select(sqlfunc.count()).select_from(SystemLog).where(SystemLog.source == "test.tr13_1"))).scalar_one()
            assert cnt >= 190, f"Expected >= 190 flushed logs, got {cnt}"
    finally:
        system_log_buffer.flush_every_n = old_n
        system_log_buffer.flush_every_s = old_s
        await system_log_buffer.flush()


@pytest.mark.asyncio
async def test_tr13_2_failed_login_creates_security_category_log(client):
    bad_email = "bad-login-tr13@fg.example"
    good_email = "good-login-tr13@fg.example"

    system_log_buffer.start()

    r1 = await client.post(
        "/api/v1/auth/login",
        json={"email": bad_email, "password": "wrongpw123"},
    )
    assert r1.status_code == 401

    r2 = await client.post(
        "/api/v1/auth/login",
        json={"email": bad_email, "password": "another-bad-pw"},
    )
    assert r2.status_code == 401

    await asyncio.sleep(0.5)
    await system_log_buffer.flush()

    async with AsyncSessionLocal() as db:
        from sqlalchemy import func as sqlfunc
        stmt = select(SystemLog).where(
            SystemLog.category == LogCategory.SECURITY,
            SystemLog.level == LogLevel.SECURITY,
        ).order_by(SystemLog.created_at.desc())
        rows = (await db.execute(stmt)).scalars().all()
        security_rows = [
            r
            for r in rows
            if r.details and r.details.get("email") == bad_email
        ]
        assert len(security_rows) >= 1, (
            f"Expected at least 1 SECURITY log for failed login, found details={[(r.category, r.level, r.details) for r in rows[:5]]}"
        )
        first = security_rows[0]
        assert "Failed login" in first.message

    await _register(client, good_email, "supersecret123")
    await _set_user_role(good_email, UserRole.AUDITOR)
    aud_token = await _login(client, good_email, "supersecret123")

    list_resp = await client.get(
        "/api/v1/system-logs?category=SECURITY&limit=50",
        headers=_auth_header(aud_token),
    )
    assert list_resp.status_code == 200
