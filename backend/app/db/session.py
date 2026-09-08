from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.ENVIRONMENT == "development"),
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def _ensure_user_role_column() -> None:
    """Add `users.role` column to pre-existing databases if missing.

    ``Base.metadata.create_all`` only creates missing *tables*, never
    mutates existing columns.  Older persistent databases (created before
    the RBAC column was introduced) therefore lack this column and fail
    every login SELECT.  We run a dialect-compatible pragma-based probe
    followed by a plain ``ALTER TABLE ... ADD COLUMN`` which is supported
    by SQLite 3.35+ and every version of PostgreSQL.
    """
    dialect_name = engine.dialect.name
    async with engine.begin() as conn:
        if dialect_name == "sqlite":
            probe = await conn.execute(text("PRAGMA table_info(users)"))
            rows = probe.fetchall()
            existing = {row[1] for row in rows} if rows else set()
        else:
            probe = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'users' AND table_schema = CURRENT_SCHEMA"
            ))
            existing = {row[0] for row in probe.fetchall()}

        if "role" not in existing:
            if dialect_name == "sqlite":
                await conn.execute(text(
                    "ALTER TABLE users ADD COLUMN role VARCHAR(13) NOT NULL DEFAULT 'INVESTIGATOR'"
                ))
            else:
                await conn.execute(text(
                    "ALTER TABLE users ADD COLUMN role VARCHAR(13) NOT NULL DEFAULT 'INVESTIGATOR'"
                ))
            try:
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_users_role ON users(role)"
                ))
            except Exception:
                pass


async def init_models() -> None:
    """Create tables if they don't exist. Fine for dev; production should
    use Alembic migrations instead."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _ensure_user_role_column()
