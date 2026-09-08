import pytest
from sqlalchemy import text

from app.db.session import engine
from app.models.devices import (
    DeviceConnectionType,
    DeviceHealth,
    DeviceMediaType,
    DeviceStatus,
)
from app.models.user import UserRole


CREDENTIALS = {
    UserRole.ADMINISTRATOR: ("admin-dev@fg.example", "supersecret123"),
    UserRole.INVESTIGATOR: ("inv-dev@fg.example", "supersecret123"),
    UserRole.AUDITOR: ("aud-dev@fg.example", "supersecret123"),
    UserRole.SUPERVISOR: ("sup-dev@fg.example", "supersecret123"),
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
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET role = :role WHERE email = :email"),
            {"role": role.value, "email": email},
        )


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _device_payload(serial: str = "SAMPLE-SERIAL-001", **overrides):
    base = {
        "serial_number": serial,
        "manufacturer": "Samsung",
        "model": "PM9A1 NVMe 512GB",
        "connection_type": DeviceConnectionType.NVME.value,
        "media_type": DeviceMediaType.NVME_SSD.value,
        "capacity_bytes": 512_000_000_000,
        "health": DeviceHealth.GOOD.value,
        "status": DeviceStatus.CONNECTED.value,
        "firmware_version": "3B2QEXM7",
        "notes": "Seized at checkpoint Alpha",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_device_requires_write_role(client):
    aud_email, aud_pw = CREDENTIALS[UserRole.AUDITOR]
    await _register(client, aud_email, aud_pw)
    await _set_user_role(aud_email, UserRole.AUDITOR)
    token = await _login(client, aud_email, aud_pw)

    resp = await client.post(
        "/api/v1/devices",
        json=_device_payload("RBAC-TEST-001"),
        headers=_auth_header(token),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_device_succeeds_for_investigator(client):
    token = await _register_and_login(client, *CREDENTIALS[UserRole.INVESTIGATOR])
    create = await client.post(
        "/api/v1/devices",
        json=_device_payload("INV-TEST-001"),
        headers=_auth_header(token),
    )
    assert create.status_code == 201
    body = create.json()
    assert body["serial_number"] == "INV-TEST-001"
    assert body["manufacturer"] == "Samsung"
    assert body["connection_type"] == DeviceConnectionType.NVME.value
    assert "id" in body


@pytest.mark.asyncio
async def test_duplicate_serial_returns_409(client):
    token = await _register_and_login(client, "inv2-dev@fg.example", "supersecret123")
    first = await client.post(
        "/api/v1/devices",
        json=_device_payload("DUP-SERIAL-999"),
        headers=_auth_header(token),
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/v1/devices",
        json=_device_payload("DUP-SERIAL-999"),
        headers=_auth_header(token),
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_list_and_patch_devices_end_to_end(client):
    inv_email, inv_pw = "inv3-dev@fg.example", "supersecret123"
    inv_token = await _register_and_login(client, inv_email, inv_pw)

    aud_email, aud_pw = "aud2-dev@fg.example", "supersecret123"
    await _register(client, aud_email, aud_pw)
    await _set_user_role(aud_email, UserRole.AUDITOR)
    aud_token = await _login(client, aud_email, aud_pw)

    # Create a device.
    c = await client.post(
        "/api/v1/devices",
        json=_device_payload("E2E-USB-001",
                             manufacturer="Kingston",
                             connection_type=DeviceConnectionType.USB.value,
                             media_type=DeviceMediaType.USB_FLASH.value,
                             capacity_bytes=32_000_000_000,
                             status=DeviceStatus.CONNECTED.value),
        headers=_auth_header(inv_token),
    )
    assert c.status_code == 201
    device_id = c.json()["id"]

    # Auditor can list.
    listed = await client.get("/api/v1/devices", headers=_auth_header(aud_token))
    assert listed.status_code == 200
    assert any(r["id"] == device_id for r in listed.json())

    # List filters by connection_type.
    filtered = await client.get("/api/v1/devices?connection_type=USB", headers=_auth_header(aud_token))
    assert filtered.status_code == 200
    rows = filtered.json()
    assert len(rows) >= 1 and all(r["connection_type"] == "USB" for r in rows)

    # List filters by serial_contains.
    by_serial = await client.get("/api/v1/devices?serial_contains=E2E-USB", headers=_auth_header(aud_token))
    assert by_serial.status_code == 200
    assert len(by_serial.json()) == 1 and by_serial.json()[0]["serial_number"] == "E2E-USB-001"

    # Auditor cannot PATCH.
    blocked = await client.patch(
        f"/api/v1/devices/{device_id}",
        json={"status": DeviceStatus.QUARANTINED.value},
        headers=_auth_header(aud_token),
    )
    assert blocked.status_code == 403

    # Investigator PATCHes status + notes.
    patched = await client.patch(
        f"/api/v1/devices/{device_id}",
        json={"status": DeviceStatus.QUARANTINED.value, "notes": "Patrolled notes."},
        headers=_auth_header(inv_token),
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == DeviceStatus.QUARANTINED.value
    assert patched.json()["notes"] == "Patrolled notes."

    # GET by id returns updated state.
    fetched = await client.get(f"/api/v1/devices/{device_id}", headers=_auth_header(aud_token))
    assert fetched.status_code == 200
    assert fetched.json()["status"] == DeviceStatus.QUARANTINED.value


@pytest.mark.asyncio
async def test_update_unknown_device_returns_404(client):
    token = await _register_and_login(client, "inv4-dev@fg.example", "supersecret123")
    resp = await client.patch(
        "/api/v1/devices/00000000-0000-0000-0000-000000000000",
        json={"status": DeviceStatus.DISCONNECTED.value},
        headers=_auth_header(token),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_unknown_device_returns_404(client):
    aud_email, aud_pw = CREDENTIALS[UserRole.AUDITOR]
    await _register(client, aud_email, aud_pw)
    await _set_user_role(aud_email, UserRole.AUDITOR)
    token = await _login(client, aud_email, aud_pw)
    resp = await client.get("/api/v1/devices/does-not-exist", headers=_auth_header(token))
    assert resp.status_code == 404
