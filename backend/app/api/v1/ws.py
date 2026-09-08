from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.services.ws_manager import manager

router = APIRouter(prefix="/ws")


async def _get_user_from_token(token: str | None) -> User | None:
    if not token:
        return None
    user_id = decode_access_token(token)
    if user_id is None:
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


def _extract_token_from_ws(websocket: WebSocket, query_token: str | None) -> str | None:
    if query_token:
        return query_token
    protocols = websocket.headers.get("Sec-WebSocket-Protocol", "")
    if protocols:
        for proto in protocols.split(","):
            proto = proto.strip()
            if proto.startswith("access_token.") or len(proto) > 20:
                if proto.startswith("access_token."):
                    return proto[len("access_token."):]
                return proto
    return None


@router.websocket("/jobs/{job_id}")
async def websocket_jobs(
    websocket: WebSocket,
    job_id: str,
    token: str | None = Query(default=None),
) -> None:
    raw_token = _extract_token_from_ws(websocket, token)
    user = await _get_user_from_token(raw_token)
    if user is None:
        await websocket.close(code=403, reason="Invalid or missing authentication token")
        return

    await websocket.accept()
    manager.connect(websocket, channel="job", key=job_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/user/{user_id}")
async def websocket_user(
    websocket: WebSocket,
    user_id: str,
    token: str | None = Query(default=None),
) -> None:
    raw_token = _extract_token_from_ws(websocket, token)
    user = await _get_user_from_token(raw_token)
    if user is None:
        await websocket.close(code=403, reason="Invalid or missing authentication token")
        return

    if user.role != UserRole.ADMINISTRATOR and user.id != user_id:
        await websocket.close(code=403, reason="Not authorized to subscribe to this user channel")
        return

    await websocket.accept()
    manager.connect(websocket, channel="user", key=user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/logs")
async def websocket_logs(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    raw_token = _extract_token_from_ws(websocket, token)
    user = await _get_user_from_token(raw_token)
    if user is None:
        await websocket.close(code=403, reason="Invalid or missing authentication token")
        return

    allowed = (UserRole.ADMINISTRATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)
    if user.role not in allowed:
        await websocket.close(code=403, reason="Not authorized to subscribe to logs channel")
        return

    await websocket.accept()
    manager.connect(websocket, channel="logs")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
