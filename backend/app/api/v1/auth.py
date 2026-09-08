import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.logging import system_log_buffer
from app.core.security import create_access_token, hash_password, verify_password
from app.models.system_log import LogCategory, LogLevel
from app.models.user import User
from app.schemas.auth import TokenResponse, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)) -> UserOut:
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Identical error for "no such user" and "wrong password" — don't
    # leak which one it was (account-enumeration hole).
    if user is None or not verify_password(payload.password, user.hashed_password):
        asyncio.create_task(
            system_log_buffer.log(
                LogLevel.SECURITY,
                LogCategory.SECURITY,
                "Failed login attempt",
                {"email": payload.email},
                source="auth.login",
            )
        )
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(subject=user.id)
    # role and user_id added ADDITIVELY — old clients ignore extra fields.
    return TokenResponse(access_token=token, role=user.role, user_id=user.id)
