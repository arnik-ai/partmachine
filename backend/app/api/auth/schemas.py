from pydantic import EmailStr, Field

from app.core.schemas import CamelModel


class UserOut(CamelModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    company_name: str | None = None


class AuthTokens(CamelModel):
    access_token: str
    refresh_token: str


class AuthResponse(CamelModel):
    user: UserOut
    tokens: AuthTokens


class LoginInput(CamelModel):
    email: EmailStr
    password: str


class RegisterInput(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)
    role: str
    company_name: str | None = None


class RefreshInput(CamelModel):
    refresh_token: str
