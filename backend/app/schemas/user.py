from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class UserRoleUpdateIn(BaseModel):
    role: UserRole


class UserSummaryOut(BaseModel):
    """Minimal user row returned by the admin /users listing endpoint.

    Excludes hashed_password for security.
    """

    id: str
    email: EmailStr
    role: UserRole
    created_at: datetime

    model_config = {"from_attributes": True}
