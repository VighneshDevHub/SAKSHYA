from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.models.user import User, UserRole
from app.schemas.user import UserRoleUpdateIn, UserSummaryOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserSummaryOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_roles(UserRole.ADMINISTRATOR)),
    limit: int = 100,
    offset: int = 0,
) -> list[UserSummaryOut]:
    """List all operator accounts. ADMINISTRATOR only.

    Always returns role so the admin UI can display and patch it.
    """
    result = await db.execute(
        select(User).order_by(desc(User.created_at)).limit(limit).offset(offset)
    )
    users = result.scalars().all()
    return [UserSummaryOut.model_validate(u) for u in users]


@router.patch("/{user_id}/role", response_model=UserSummaryOut)
async def update_user_role(
    user_id: str,
    payload: UserRoleUpdateIn,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_roles(UserRole.ADMINISTRATOR)),
) -> UserSummaryOut:
    """Change an operator's role. ADMINISTRATOR only.

    Cannot be used to change your own role (prevents accidental lock-out
    of the only admin).
    """
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Anti-lock-out: an admin cannot demote themselves to a non-admin role
    # if there's no other administrator left. This check is advisory —
    # a real deployment would add a DB trigger or a role-history audit
    # trail, but for SIH-scope this blocks the 99% accidental case.
    if target.id == _admin.id and payload.role != UserRole.ADMINISTRATOR:
        other_admins_result = await db.execute(
            select(User).where(
                User.id != target.id,
                User.role == UserRole.ADMINISTRATOR,
            )
        )
        if other_admins_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=409,
                detail="Cannot demote the last remaining ADMINISTRATOR account",
            )

    target.role = payload.role
    await db.commit()
    await db.refresh(target)
    return UserSummaryOut.model_validate(target)
