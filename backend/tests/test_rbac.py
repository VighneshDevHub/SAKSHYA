import pytest
from sqlalchemy import text

from app.db.session import engine
from app.models.user import UserRole


CREDENTIALS = {
    UserRole.ADMINISTRATOR: ("admin@forensicguard.example", "supersecret123"),
    UserRole.INVESTIGATOR: ("inv@forensicguard.example", "supersecret123"),
    UserRole.AUDITOR: ("aud@forensicguard.example", "supersecret123"),
    UserRole.SUPERVISOR: ("sup@forensicguard.example", "supersecret123"),
}


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
    """Bypass HTTP API and set a user's role in the database directly.

    /auth/register deliberately creates every new user with
    INVESTIGATOR so that pre-RBAC accounts and all existing code paths
    keep working. Tests that need an ADMINISTRATOR / AUDITOR /
    SUPERVISOR account must therefore promote through the data layer
    rather than through the REST API (which itself requires an existing
    ADMINISTRATOR to call — bootstrap paradox)."""
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = :role WHERE email = :email"),
            {"role": role.value, "email": email},
        )


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_registered_user_defaults_to_investigator_role(client):
    """TR-1.1: Fresh users must default to INVESTIGATOR so every pre-RBAC
    account and existing insert path remains functional without edits."""
    email = "default.role@forensicguard.example"
    password = "abc123xyz"

    reg_resp = await client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
    )
    assert reg_resp.status_code == 201
    assert reg_resp.json()["role"] == UserRole.INVESTIGATOR.value

    login_resp = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    body = login_resp.json()
    assert "access_token" in body
    assert body["role"] == UserRole.INVESTIGATOR.value


@pytest.mark.asyncio
async def test_list_users_requires_admin_role_403_for_everyone_else(client):
    """TR-1.2: AUDITOR / INVESTIGATOR / SUPERVISOR must all be denied
    GET /users with a 403."""
    for role in (UserRole.AUDITOR, UserRole.INVESTIGATOR, UserRole.SUPERVISOR):
        email, password = CREDENTIALS[role]
        token = await _register_and_login(client, email, password)
        resp = await client.get("/api/v1/users", headers=_auth_header(token))
        assert resp.status_code == 403, f"Expected 403 for role {role.value}"


@pytest.mark.asyncio
async def test_list_users_200_for_administrator(client):
    """TR-1.3: A promoted ADMINISTRATOR sees every account in /users."""
    admin_email, admin_pw = CREDENTIALS[UserRole.ADMINISTRATOR]
    inv_email, inv_pw = CREDENTIALS[UserRole.INVESTIGATOR]

    await _register(client, admin_email, admin_pw)
    await _set_user_role(admin_email, UserRole.ADMINISTRATOR)
    admin_token = await _login(client, admin_email, admin_pw)

    await _register(client, inv_email, inv_pw)

    list_resp = await client.get("/api/v1/users", headers=_auth_header(admin_token))
    assert list_resp.status_code == 200, list_resp.text
    rows = list_resp.json()
    assert len(rows) == 2
    emails = sorted(r["email"] for r in rows)
    assert emails == sorted([admin_email, inv_email])
    for r in rows:
        assert "role" in r
        assert "hashed_password" not in r


@pytest.mark.asyncio
async def test_admin_can_promote_investigator_to_supervisor(client):
    admin_email, admin_pw = CREDENTIALS[UserRole.ADMINISTRATOR]
    inv_email, inv_pw = CREDENTIALS[UserRole.INVESTIGATOR]

    await _register(client, admin_email, admin_pw)
    await _set_user_role(admin_email, UserRole.ADMINISTRATOR)
    admin_token = await _login(client, admin_email, admin_pw)

    await _register(client, inv_email, inv_pw)

    list_resp = await client.get("/api/v1/users", headers=_auth_header(admin_token))
    inv_row = next(r for r in list_resp.json() if r["email"] == inv_email)

    patch_resp = await client.patch(
        f"/api/v1/users/{inv_row['id']}/role",
        json={"role": UserRole.SUPERVISOR.value},
        headers=_auth_header(admin_token),
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["role"] == UserRole.SUPERVISOR.value

    login_resp = await client.post(
        "/api/v1/auth/login", json={"email": inv_email, "password": inv_pw}
    )
    assert login_resp.json()["role"] == UserRole.SUPERVISOR.value


@pytest.mark.asyncio
async def test_patch_role_blocked_for_non_admin(client):
    inv_email, inv_pw = CREDENTIALS[UserRole.INVESTIGATOR]
    aud_email, aud_pw = CREDENTIALS[UserRole.AUDITOR]
    inv_token = await _register_and_login(client, inv_email, inv_pw)
    await _register(client, aud_email, aud_pw)

    admin_email, admin_pw = CREDENTIALS[UserRole.ADMINISTRATOR]
    await _register(client, admin_email, admin_pw)
    await _set_user_role(admin_email, UserRole.ADMINISTRATOR)
    admin_token = await _login(client, admin_email, admin_pw)

    list_resp = await client.get("/api/v1/users", headers=_auth_header(admin_token))
    aud_row = next(r for r in list_resp.json() if r["email"] == aud_email)

    patch = await client.patch(
        f"/api/v1/users/{aud_row['id']}/role",
        json={"role": UserRole.ADMINISTRATOR.value},
        headers=_auth_header(inv_token),
    )
    assert patch.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_demote_last_remaining_administrator(client):
    """Anti-lock-out guard: demoting the only ADMINISTRATOR returns 409."""
    admin_email, admin_pw = CREDENTIALS[UserRole.ADMINISTRATOR]
    await _register(client, admin_email, admin_pw)
    await _set_user_role(admin_email, UserRole.ADMINISTRATOR)
    admin_token = await _login(client, admin_email, admin_pw)

    list_resp = await client.get("/api/v1/users", headers=_auth_header(admin_token))
    rows = list_resp.json()
    only_admin = next(r for r in rows if r["email"] == admin_email)

    patch_resp = await client.patch(
        f"/api/v1/users/{only_admin['id']}/role",
        json={"role": UserRole.INVESTIGATOR.value},
        headers=_auth_header(admin_token),
    )
    assert patch_resp.status_code == 409


@pytest.mark.asyncio
async def test_admin_can_demote_self_after_promoting_another_admin(client):
    """Anti-lock-out guard still allows a graceful hand-off: promote a
    second admin, then demote yourself."""
    a1_email, a1_pw = "admin1@fg.example", "adminsupersecret1"
    a2_email, a2_pw = "admin2@fg.example", "adminsupersecret2"

    await _register(client, a1_email, a1_pw)
    await _set_user_role(a1_email, UserRole.ADMINISTRATOR)
    a1_token = await _login(client, a1_email, a1_pw)

    await _register(client, a2_email, a2_pw)

    # Promote a2 to ADMIN.
    list_resp = await client.get("/api/v1/users", headers=_auth_header(a1_token))
    a2_row = next(r for r in list_resp.json() if r["email"] == a2_email)
    promote = await client.patch(
        f"/api/v1/users/{a2_row['id']}/role",
        json={"role": UserRole.ADMINISTRATOR.value},
        headers=_auth_header(a1_token),
    )
    assert promote.status_code == 200

    # Now demote a1 to INVESTIGATOR.
    a1_row = next(r for r in list_resp.json() if r["email"] == a1_email)
    demote = await client.patch(
        f"/api/v1/users/{a1_row['id']}/role",
        json={"role": UserRole.INVESTIGATOR.value},
        headers=_auth_header(a1_token),
    )
    assert demote.status_code == 200
    assert demote.json()["role"] == UserRole.INVESTIGATOR.value


@pytest.mark.asyncio
async def test_backward_compat_register_response_shape_old_fields_still_present(client):
    """AC-17 subset: register response still carries id + email at the
    top level; role is a pure addition."""
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": "compat@forensicguard.example", "password": "supersecret123"},
    )
    assert reg.status_code == 201
    body = reg.json()
    assert "id" in body
    assert "email" in body
    assert "role" in body


@pytest.mark.asyncio
async def test_existing_auth_ops_flow_unbroken_by_role(client):
    """TR-1.4: the Phase 5 critical path (register → token → submit
    operation → verify) is 100% unaffected by the new role column."""
    token = await _register_and_login(client, "regression@example.com", "secretpass")
    submit = await client.post(
        "/api/v1/operations",
        json={
            "operation_type": "RECOVERY",
            "target_description": "regression.img",
            "started_at": "2026-09-01T00:00:00Z",
            "completed_at": "2026-09-01T00:05:00Z",
            "success": True,
            "operator": "ignored",
            "details": {"files_recovered": 1},
        },
        headers=_auth_header(token),
    )
    assert submit.status_code == 201
    cert = submit.json()["certificate_id"]
    verify = await client.get(f"/api/v1/verify/{cert}")
    assert verify.json()["overall_verified"] is True
