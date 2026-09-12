from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    analytics,
    auth,
    cases,
    devices,
    evidence,
    jobs,
    ledger,
    notifications,
    operations,
    public,
    reports,
    search,
    settings as settings_router,
    system_logs,
    users,
    verify,
    ws,
)
from app.core.config import get_settings
from app.core.logging import system_log_buffer
from app.db.session import init_models

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_models()
    system_log_buffer.start()
    yield
    await system_log_buffer.stop()


app = FastAPI(title=settings.APP_NAME, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # In development OR when PUBLIC_BASE_URL is not set → allow all origins.
    # In production set PUBLIC_BASE_URL to the Railway frontend URL and
    # EXTRA_CORS_ORIGINS to any additional allowed origins (comma-separated).
    allow_origins=["*"] if settings.ENVIRONMENT == "development" else settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(operations.router, prefix="/api/v1")
app.include_router(verify.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(cases.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(devices.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(ws.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(public.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(evidence.router, prefix="/api/v1")
app.include_router(ledger.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(system_logs.router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}
