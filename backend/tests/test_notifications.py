import pytest
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.notifications import Notification, NotificationType
from app.models.user import UserRole
from tests.test_jobs_api import _auth_header, _register, _register_and_login, _set_user_role


async def _get_db():
    async with AsyncSessionLocal() as session:
        yield session


INV_EMAIL, INV_PW = "notif-inv@fg.example", "supersecret123"
ADMIN_EMAIL, ADMIN_PW = "notif-admin@fg.example", "supersecret123"


@pytest.mark.asyncio
async def test_tr5_1_notifications_create_and_list_scoped(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)
    await _register(client, ADMIN_EMAIL, ADMIN_PW)
    await _set_user_role(ADMIN_EMAIL, UserRole.ADMINISTRATOR)
    admin_token = await client.post(
        "/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}
    )
    assert admin_token.status_code == 200
    admin_token = admin_token.json()["access_token"]

    async with AsyncSessionLocal() as db:
        from app.models.user import User
        r = await db.execute(select(User).where(User.email == INV_EMAIL))
        inv_user = r.scalar_one()
        r2 = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        admin_user = r2.scalar_one()

        n1 = Notification(
            user_id=inv_user.id,
            type=NotificationType.JOB_FAILED,
            title="Job Failed",
            message="Job 1 failed",
            payload={"job_id": "j1"},
        )
        n2 = Notification(
            user_id=None,
            type=NotificationType.TAMPER_DETECTED,
            title="Tamper",
            message="Tamper detected",
            payload={},
        )
        n3 = Notification(
            user_id=admin_user.id,
            type=NotificationType.CERT_GENERATED,
            title="Cert",
            message="New cert",
            payload={"certificate_id": "c1"},
        )
        db.add_all([n1, n2, n3])
        await db.commit()

    inv_list = await client.get(
        "/api/v1/notifications?unread_only=false", headers=_auth_header(inv_token)
    )
    assert inv_list.status_code == 200
    inv_body = inv_list.json()
    inv_ids = [n["id"] for n in inv_body["items"]]
    assert n1.id in inv_ids
    assert n2.id not in inv_ids, "INVESTIGATOR should NOT see broadcast notifications"
    assert n3.id not in inv_ids

    admin_list = await client.get(
        "/api/v1/notifications?unread_only=false", headers=_auth_header(admin_token)
    )
    assert admin_list.status_code == 200
    admin_body = admin_list.json()
    admin_ids = [n["id"] for n in admin_body["items"]]
    assert n3.id in admin_ids
    assert n2.id in admin_ids, "ADMIN should see broadcast notifications"


@pytest.mark.asyncio
async def test_tr5_2_mark_single_and_all_read(client):
    inv_token = await _register_and_login(client, "read-inv@fg.example", "supersecret123")

    async with AsyncSessionLocal() as db:
        from app.models.user import User
        r = await db.execute(select(User).where(User.email == "read-inv@fg.example"))
        user = r.scalar_one()

        for i in range(5):
            db.add(Notification(
                user_id=user.id,
                type=NotificationType.JOB_FAILED,
                title=f"Job {i}",
                message=f"Message {i}",
                payload={"idx": i},
            ))
        await db.commit()

    listed = await client.get(
        "/api/v1/notifications?unread_only=true", headers=_auth_header(inv_token)
    )
    assert listed.status_code == 200
    body = listed.json()
    assert body["unread_count"] == 5
    first_id = body["items"][0]["id"]

    marked = await client.patch(
        f"/api/v1/notifications/{first_id}/read", headers=_auth_header(inv_token)
    )
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None

    listed2 = await client.get(
        "/api/v1/notifications?unread_only=true", headers=_auth_header(inv_token)
    )
    assert listed2.json()["unread_count"] == 4

    marked_all = await client.post(
        "/api/v1/notifications/read-all", headers=_auth_header(inv_token)
    )
    assert marked_all.status_code == 200
    assert marked_all.json()["marked_read"] == 4

    listed3 = await client.get(
        "/api/v1/notifications?unread_only=true", headers=_auth_header(inv_token)
    )
    assert listed3.json()["unread_count"] == 0


@pytest.mark.asyncio
async def test_tr5_3_notification_ownership_check(client):
    inv1_token = await _register_and_login(client, "own1@fg.example", "pw123456")
    inv2_token = await _register_and_login(client, "own2@fg.example", "pw123456")

    async with AsyncSessionLocal() as db:
        from app.models.user import User
        r = await db.execute(select(User).where(User.email == "own1@fg.example"))
        user1 = r.scalar_one()

        n = Notification(
            user_id=user1.id,
            type=NotificationType.ROLE_CHANGED,
            title="Role changed",
            message="Your role was updated",
            payload={},
        )
        db.add(n)
        await db.commit()
        notif_id = n.id

    blocked = await client.patch(
        f"/api/v1/notifications/{notif_id}/read", headers=_auth_header(inv2_token)
    )
    assert blocked.status_code == 404

    ok = await client.patch(
        f"/api/v1/notifications/{notif_id}/read", headers=_auth_header(inv1_token)
    )
    assert ok.status_code == 200
