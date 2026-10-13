# PartMachine — سند تحویل (Handoff) برای ادامه‌ی کار

> آخرین به‌روزرسانی: ۲۰۲۶/۰۶/۱۲ — وضعیت: وسط ساخت بک‌اند، ماژول auth ناتمام.

این فایل برای ایجنت بعدی است تا بدون شکستن چیزی، بک‌اند را تمام کند و فرانت را وصل کند.

---

## ۱) پروژه چیست
بازار صنعتی B2B (مثل دیوار، تخصصی قطعه‌سازی). Monorepo:
- `frontend/` — Next.js 16 + TS + Tailwind v4 + RTL فارسی. **کامل و آنلاین** (GitHub Pages).
- `backend/` — FastAPI + SQLAlchemy 2 async + Pydantic v2. **در حال ساخت (افزایش ۲).**
- `docs/` — ARCHITECTURE.md و IMPLEMENTATION_PLAN.md.

لینک‌ها:
- سایت زنده: https://arnik-ai.github.io/partmachine/
- ریپو: https://github.com/arnik-ai/partmachine (branch: master، auto-deploy روی push)

## ۲) قانون طلایی (مهم!)
- **هیچ کد فرانت نباید بشکند.** فرانت روی `withDemoFallback` کار می‌کند: اگر بک‌اند `NetworkError` بدهد، به داده‌ی Mock برمی‌گردد. پس اتصال به بک‌اند را با حفظ این fallback انجام بده.
- **قرارداد داده‌ی فرانت camelCase است** (`companyName`, `accessToken`, `totalPriceRials`). بک‌اند باید دقیقاً camelCase بدهد/بپذیرد — برای همین `app/core/schemas.py::CamelModel` ساخته شده (alias_generator=to_camel). همه‌ی schemaها باید از `CamelModel` ارث ببرند.
- بعد از هر تغییر مهم: `cd frontend && npm run build` باید سبز بماند.
- کامیت/پوش فقط وقتی build سبز است. پیام کامیت با: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## ۳) وضعیت فعلی بک‌اند — چه ساخته شده

ساختار موجود (`backend/`):
```
pyproject.toml, requirements.txt, .env.example
app/__init__.py
app/core/config.py      ← Settings (pydantic-settings)؛ DATABASE_URL پیش‌فرض SQLite، JWT، CORS
app/core/schemas.py     ← CamelModel (پایه‌ی همه‌ی schemaها)
app/core/security.py    ← Argon2 hash + JWT (create_access/refresh_token, decode_token)
app/db/base.py          ← Base, TimestampMixin, UUIDPrimaryKey
app/db/session.py       ← engine async, get_db(), init_db()
app/models.py           ← همه‌ی مدل‌ها: User, RefreshToken, Supplier, Rfq, Quotation
app/services/trust_score.py ← compute_trust_score() explainable (معادل فرانت)
app/services/pricing.py     ← estimate_price() + judge_quote_price() (معادل دقیق فرانت)
app/api/__init__.py
```

تنظیمات کلیدی:
- `config.py`: `api_v1_prefix="/api/v1"`، DB پیش‌فرض `sqlite+aiosqlite:///./partmachine.db` (برای توسعه بدون Postgres)، CORS شامل localhost:3000 و arnik-ai.github.io.
- `models.py`: فیلدهای JSON (capabilities, machines, certifications, gallery_titles, files) با `mapped_column(default=list)`. Supplier ورودی‌های خام Trust Score را دارد (quality_score, satisfaction_score, dispute_count). امتیاز در زمان پاسخ محاسبه می‌شود نه ذخیره.

## ۴) چه چیزی هنوز ساخته نشده — TODO به ترتیب

### الف) ماژول auth (در حال انجام — اول این)
بساز:
- `app/api/deps.py` — `get_current_user` (از HTTPBearer + decode_token، چک type=access، خواندن User از DB) و `require_roles(*roles)` برای RBAC. (محتوای آماده پایین در بخش ۶.)
- `app/api/auth/__init__.py` (خالی)
- `app/api/auth/schemas.py` — UserOut, AuthTokens, AuthResponse, LoginInput, RegisterInput, RefreshInput (همه CamelModel). (محتوای آماده پایین.)
- `app/api/auth/router.py` — مسیرها:
  - `POST /register` → ساخت User (hash_password)، اگر role در (supplier, qc) و companyName بود، رکورد Supplier پایه هم بساز؛ خروجی AuthResponse.
  - `POST /login` → verify_password، خروجی AuthResponse؛ refresh_token را در جدول RefreshToken ذخیره کن.
  - `POST /refresh` → اعتبارسنجی refresh، چرخش (revoke قبلی، صدور جدید).
  - `GET /me` → کاربر جاری (Depends get_current_user).
  - ایمیل تکراری → 409.

### ب) ماژول suppliers
- `app/api/suppliers/schemas.py` — SupplierOut با همه‌ی فیلدهای فرانت (types.ts فرانت را ببین) + `score: TrustScore`. ساختار TrustScore: trust, risk, reliability, quality, components[{key,label,value,weight,explanation}].
- `app/api/suppliers/router.py`:
  - `GET /suppliers?q=&capability=&city=` → لیست با فیلتر؛ score را با `compute_trust_score()` بساز.
  - `GET /suppliers/{id}` → یکی.
- مرجع شکل خروجی: `frontend/src/features/suppliers/mock.ts` و `types.ts`.

### ج) ماژول rfqs
- schemas: RfqOut, CreateRfqInput, RfqFile{name,size,kind,previewUrl?} — مطابق `frontend/src/features/rfq/types.ts`.
- router: `GET /rfqs/mine` (Depends user, نقش buyer/agent)، `POST /rfqs` (ساخت)، `GET /rfqs/{id}`.
- status پیش‌فرض "published". RfqStatus: draft|published|quoting|awarded|closed|cancelled.

### د) ماژول quotations
- schemas: QuotationOut مطابق `frontend/src/features/quotations/types.ts` (supplierName, supplierCity, supplierScore, verified, totalPriceRials, leadTimeDays, validUntil, note, submittedAt).
- router: `GET /rfqs/{rfqId}/quotations`، `POST /rfqs/{rfqId}/quotations` (نقش supplier)، `POST /quotations/{id}/award` (نقش buyer صاحب RFQ → is_awarded=True، rfq.status="awarded").

### ه) ماژول pricing
- schemas: EstimateInput{capability, material, quantity, complexity, kgPerPiece?}, PriceEstimate (مطابق engine فرانت).
- router: `POST /pricing/estimate` → `estimate_price(...)`. عمومی (بدون auth لازم).

### و) orders (اختیاری در این فاز — فرانت فعلاً Mock محلی دارد)
- اگر وقت بود: مدل Order + مراحل. فعلاً می‌تواند Mock فرانت بماند.

### ز) main.py + روتر اصلی
- `app/main.py` — FastAPI app، CORSMiddleware با `settings.cors_origin_list`، `lifespan` که `init_db()` صدا بزند، include همه‌ی routerها با prefix `settings.api_v1_prefix`، endpoint `/health`.
- `app/api/router.py` — APIRouter که زیرروترها را جمع کند.

### ح) seed + اجرا
- `app/seed.py` — داده‌ی نمونه (همان ۸ تأمین‌کننده‌ی mock فرانت + RFQ + quotationها) تا دمو واقعی شود.
- تست اجرا: `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/python -m uvicorn app.main:app --reload`. چک: http://localhost:8000/docs و /health.
- `docker-compose.yml` در ریشه (Postgres + Redis + backend + frontend) — اختیاری.

### ط) اتصال فرانت (آخرین قدم، با احتیاط)
- فرانت الان `NEXT_PUBLIC_API_URL` را از env می‌خواند (پیش‌فرض http://localhost:8000/api/v1). فایل `frontend/.env.local` بساز با همین مقدار.
- چون همه‌ی توابع api فرانت از `withDemoFallback` استفاده می‌کنند، اگر بک‌اند بالا باشد خودکار از آن می‌خواند؛ اگر نه، Mock. **نیازی به تغییر کد فرانت نیست** مگر اینکه قرارداد فرق کند.
- نکته: auth فرانت فعلاً NetworkError → دموی محلی. وقتی بک‌اند هست، login/register واقعی کار می‌کند چون مسیرها و شکل AuthResponse یکی است.
- بعد از اتصال: `npm run build` فرانت سبز بماند؛ یک login/register/list تست دستی.

## ۵) قراردادهای دقیق فرانت (منبع حقیقت)
این فایل‌ها شکل JSON مورد انتظار را تعریف می‌کنند — بک‌اند باید عیناً منطبق باشد:
- `frontend/src/features/auth/types.ts`
- `frontend/src/features/suppliers/types.ts` + `mock.ts`
- `frontend/src/features/rfq/types.ts` + `api.ts`
- `frontend/src/features/quotations/types.ts` + `mock.ts`
- `frontend/src/features/pricing/engine.ts` + `data.ts`
- `frontend/src/lib/api-client.ts` (مسیرها: /auth/login, /auth/register, /suppliers, /suppliers/{id}, /rfqs/mine, /rfqs, ...)

## ۶) محتوای آماده‌ی دو فایلی که هنگام خطا ساخته نشدند

### app/api/deps.py
```python
"""وابستگی‌های مشترک API: استخراج کاربر جاری از JWT و کنترل نقش (RBAC)."""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ACCESS_TOKEN_TYPE, decode_token
from app.db.session import get_db
from app.models import User

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="احراز هویت لازم است")
    payload = decode_token(creds.credentials)
    if payload is None or payload.get("type") != ACCESS_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="توکن نامعتبر است")
    user = await db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="کاربر یافت نشد")
    return user


def require_roles(*roles: str) -> Callable:
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="برای این عملیات دسترسی ندارید")
        return user
    return checker
```

### app/api/auth/schemas.py
```python
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
```

## ۷) نکات فنی محیط
- ویندوز + PowerShell. مسیر پروژه: `E:\ai_turbo\partmachine`.
- `gh` CLI نصب است در `C:\Users\user\AppData\Local\gh-cli\bin\gh.exe` و لاگین arnik-ai.
- Python باید 3.12+ باشد؛ اگر venv نبود بساز. SQLite برای توسعه کافی است (بدون نیاز به Postgres).
- پیش‌فرض RTL/فارسی، اعداد فارسی، فونت وزیرمتن.

## ۸) ماژول‌های فرانت که کامل‌اند (دست نزن مگر برای اتصال)
auth, suppliers (+ trust score ستاره‌ای + گالری), rfq (+ آپلود فایل با پیش‌نمایش), quotations (مقایسه + رتبه‌بندی AI + هشدار قیمت), orders (رهگیری ۷ مرحله), contracts (قرارداد ۱۱ ماده + امضا + PDF), agreements (قوانین/NDA), pricing (موتور برآورد), dashboard.
