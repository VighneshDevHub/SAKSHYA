import pytest
from sqlalchemy import text

from app.db.session import engine
from app.models.user import UserRole
from tests.test_jobs_api import _auth_header, _login, _register


ADMIN_EMAIL, ADMIN_PW = "st-admin@fg.example", "supersecret123"
INV_EMAIL, INV_PW = "st-inv@fg.example", "supersecret123"


async def _set_user_role(email: str, role: UserRole) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = :role WHERE email = :email"),
            {"role": role.value, "email": email},
        )


@pytest.mark.asyncio
async def test_tr12_1_settings_admin_only_and_defaults(client):
    await _register(client, ADMIN_EMAIL, ADMIN_PW)
    await _set_user_role(ADMIN_EMAIL, UserRole.ADMINISTRATOR)
    admin_token = await _login(client, ADMIN_EMAIL, ADMIN_PW)

    await _register(client, INV_EMAIL, INV_PW)
    inv_token = await _login(client, INV_EMAIL, INV_PW)

    blocked = await client.get(
        "/api/v1/settings", headers=_auth_header(inv_token)
    )
    assert blocked.status_code == 403

    ok = await client.get(
        "/api/v1/settings", headers=_auth_header(admin_token)
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["organization_name"] in ("PRAMAAN", "ForensicGuard")
    assert body["default_overwrite_passes"] == 3
    assert body["hash_algorithm_display"] == "SHA-256"
    assert "certificate_header_text" in body


@pytest.mark.asyncio
async def test_tr12_2_patch_settings_roundtrips_and_clears_cache(client):
    await _register(client, "st2-admin@fg.example", ADMIN_PW)
    await _set_user_role("st2-admin@fg.example", UserRole.ADMINISTRATOR)
    admin_token = await _login(client, "st2-admin@fg.example", ADMIN_PW)

    patch = await client.patch(
        "/api/v1/settings",
        json={
            "organization_name": "Metro City Police",
            "department_name": "Cyber Crime Unit",
            "default_overwrite_passes": 5,
            "certificate_header_text": "MCPD — Digital Forensics Division",
        },
        headers=_auth_header(admin_token),
    )
    assert patch.status_code == 200, patch.text
    body = patch.json()
    assert body["organization_name"] == "Metro City Police"
    assert body["department_name"] == "Cyber Crime Unit"
    assert body["default_overwrite_passes"] == 5
    assert body["certificate_header_text"] == "MCPD — Digital Forensics Division"

    get_again = await client.get(
        "/api/v1/settings", headers=_auth_header(admin_token)
    )
    assert get_again.status_code == 200
    g = get_again.json()
    assert g["organization_name"] == "Metro City Police"
    assert g["default_overwrite_passes"] == 5
    assert g["hash_algorithm_display"] == "SHA-256", "hash_algorithm_display must be read-only"
