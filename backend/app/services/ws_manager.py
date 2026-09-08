import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._job_subscribers: dict[str, set[WebSocket]] = {}
        self._user_subscribers: dict[str, set[WebSocket]] = {}
        self._log_subscribers: set[WebSocket] = set()
        self._all_sockets: set[WebSocket] = set()

    def connect(self, websocket: WebSocket, channel: str, key: str | None = None) -> None:
        self._all_sockets.add(websocket)
        if channel == "job" and key is not None:
            if key not in self._job_subscribers:
                self._job_subscribers[key] = set()
            self._job_subscribers[key].add(websocket)
        elif channel == "user" and key is not None:
            if key not in self._user_subscribers:
                self._user_subscribers[key] = set()
            self._user_subscribers[key].add(websocket)
        elif channel == "logs":
            self._log_subscribers.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._all_sockets.discard(websocket)
        for subscribers in self._job_subscribers.values():
            subscribers.discard(websocket)
        for subscribers in self._user_subscribers.values():
            subscribers.discard(websocket)
        self._log_subscribers.discard(websocket)

    async def broadcast(self, channel: str, key: str | None, message_dict: dict[str, Any]) -> None:
        targets: set[WebSocket] = set()
        if channel == "job" and key is not None:
            targets = self._job_subscribers.get(key, set()).copy()
        elif channel == "user" and key is not None:
            targets = self._user_subscribers.get(key, set()).copy()
        elif channel == "logs":
            targets = self._log_subscribers.copy()

        if not targets:
            return

        payload = json.dumps(message_dict, default=str)

        async def _send(sock: WebSocket) -> None:
            try:
                await sock.send_text(payload)
            except Exception:
                self.disconnect(sock)

        tasks = [asyncio.create_task(_send(s)) for s in targets]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def broadcast_job_event(self, job_id: str, event_type: str, data_dict: dict[str, Any]) -> None:
        targets = self._job_subscribers.get(job_id, set())
        if not targets:
            return
        message = {
            "type": event_type,
            "job_id": job_id,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        message.update(data_dict)
        asyncio.create_task(self.broadcast("job", job_id, message))

    def get_job_subscriber_count(self, job_id: str) -> int:
        return len(self._job_subscribers.get(job_id, set()))

    def get_user_subscriber_count(self, user_id: str) -> int:
        return len(self._user_subscribers.get(user_id, set()))

    def get_log_subscriber_count(self) -> int:
        return len(self._log_subscribers)

    def get_total_connections(self) -> int:
        return len(self._all_sockets)


manager = ConnectionManager()
