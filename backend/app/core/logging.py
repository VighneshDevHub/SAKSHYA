import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from app.db.session import AsyncSessionLocal
from app.models.system_log import LogCategory, LogLevel, SystemLog


def _uuid_str() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AsyncLogBuffer:
    def __init__(self) -> None:
        self._buffer: list[dict[str, Any]] = []
        self._flush_lock = asyncio.Lock()
        self.flush_every_n: int = 50
        self.flush_every_s: float = 1.0
        self._stop_flag: asyncio.Event = asyncio.Event()
        self._bg_task: asyncio.Task | None = None
        self._started = False

    async def log(
        self,
        level: LogLevel,
        category: LogCategory,
        message: str,
        details: dict[str, Any] | None = None,
        source: str = "",
    ) -> None:
        entry = {
            "_id": _uuid_str(),
            "_created_at": _utcnow(),
            "level": level,
            "category": category,
            "message": message,
            "details": details or {},
            "source": source,
        }
        self._buffer.append(entry)
        if len(self._buffer) >= self.flush_every_n:
            asyncio.create_task(self.flush())

    async def flush(self) -> int:
        if not self._buffer:
            return 0
        async with self._flush_lock:
            if not self._buffer:
                return 0
            batch = list(self._buffer)
            self._buffer.clear()

        rows = [
            SystemLog(
                id=e["_id"],
                level=e["level"],
                category=e["category"],
                message=e["message"],
                details=e["details"],
                source=e["source"],
                created_at=e["_created_at"],
            )
            for e in batch
        ]
        try:
            async with AsyncSessionLocal() as session:
                session.add_all(rows)
                await session.commit()
        except Exception:
            async with self._flush_lock:
                self._buffer = batch + self._buffer
            return 0
        return len(batch)

    async def _background_flusher(self) -> None:
        while not self._stop_flag.is_set():
            try:
                await asyncio.sleep(self.flush_every_s)
                await self.flush()
            except asyncio.CancelledError:
                break
            except Exception:
                pass

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._stop_flag.clear()
        self._bg_task = asyncio.create_task(self._background_flusher())

    async def stop(self) -> None:
        self._stop_flag.set()
        if self._bg_task is not None and not self._bg_task.done():
            self._bg_task.cancel()
            try:
                await self._bg_task
            except (asyncio.CancelledError, Exception):
                pass
        await self.flush()

    def pending_count(self) -> int:
        return len(self._buffer)


system_log_buffer = AsyncLogBuffer()
