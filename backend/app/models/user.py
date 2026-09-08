import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    """RBAC roles for ForensicGuard operator accounts.

    INVESTIGATOR is the default so every account created before RBAC
    (including pre-existing accounts in a migrated DB) keeps its original
    capabilities — nothing is locked out by surprise. ADMINISTRATOR is
    elevated; AUDITOR is read-only; SUPERVISOR is investigator-plus-case
    governance.

    New columns only; no existing User fields altered.
    """

    ADMINISTRATOR = "ADMINISTRATOR"
    INVESTIGATOR = "INVESTIGATOR"
    AUDITOR = "AUDITOR"
    SUPERVISOR = "SUPERVISOR"


def _default_role() -> UserRole:
    return UserRole.INVESTIGATOR


class User(Base):
    """An authenticated operator (investigator, technician, etc.).

    Base fields (id/email/hashed_password/created_at) are unchanged from
    the pre-RBAC model. The new nullable-with-default `role` column is
    purely additive; a User with no explicit role INSERTed defaults to
    INVESTIGATOR, so old test fixtures and login flows work without any
    edits.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=_default_role, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
