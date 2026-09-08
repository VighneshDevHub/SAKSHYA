from collections.abc import Iterable

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import get_or_create_dev_keypair
from app.core.security import decode_access_token
from app.db.session import get_db  # re-exported
from app.models.user import User, UserRole

_cached_keys: tuple[str, str] | None = None


def get_signing_keys() -> tuple[str, str]:
    global _cached_keys
    if _cached_keys is None:
        _cached_keys = get_or_create_dev_keypair()
    return _cached_keys


_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Protects operation-submission endpoints. Requires a valid,
    unexpired JWT issued by POST /auth/login."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists")

    return user


def _role_names(roles: Iterable[UserRole]) -> list[str]:
    return sorted(r.value for r in roles)


def require_roles(*allowed: UserRole):
    """Return a FastAPI Depends factory that gates an endpoint to an
    allowed set of roles. Must be composed AFTER `get_current_user`.

    Usage:
        @router.get("/admin-only")
        async def admin_only(
            user: User = Depends(get_current_user),
            _roles: None = Depends(require_roles(UserRole.ADMINISTRATOR)),
        ): ...

    Returns 403 Forbidden if the authenticated user's role is not in
    `allowed`. Never silently upgrades permissions.
    """
    allowed_set = frozenset(allowed)

    async def _check(
        user: User = Depends(get_current_user),
    ) -> User:
        if user.role not in allowed_set:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Role {user.role.value} is not authorized. "
                    f"Required one of: {', '.join(_role_names(allowed_set))}"
                ),
            )
        return user

    return _check


__all__ = ["get_db", "get_signing_keys", "get_current_user", "require_roles"]
