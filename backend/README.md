# PRAMAAN — Backend API

> FastAPI · Python 3.12 · SQLAlchemy 2.0 · SQLite (dev) / PostgreSQL (prod)  
> The cryptographic trust core of the PRAMAAN digital forensics platform.

---

## Overview

The backend is the authoritative hub of PRAMAAN. It handles:

- **Authentication** — JWT HS256 issuance, bcrypt password hashing, RBAC enforcement
- **Operation Trust Layer** — ECDSA P-256 signing, SHA-256 hash-chain ledger
- **Case Management** — full investigation lifecycle with evidence catalogue and timeline
- **Device Inventory** — forensic asset tracking with health and status metadata
- **Task Queue** — dashboard-driven job orchestration with WebSocket live progress
- **Analytics & Reporting** — KPI aggregates, PDF certificate generation, CSV exports
- **Notifications** — real-time in-app alerts for certificate issuance and tamper events
- **System Logging** — structured async log buffer with live WebSocket tail

---

## Directory Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py               ← get_db, get_current_user, require_roles, get_signing_keys
│   │   └── v1/
│   │       ├── auth.py           register · login · me
│   │       ├── operations.py     submit · list · get · pdf
│   │       ├── verify.py         tamper verification (public)
│   │       ├── cases.py          case CRUD + team + evidence + timeline
│   │       ├── devices.py        device inventory CRUD
│   │       ├── jobs.py           task queue (9 endpoints, skip-locked claim)
│   │       ├── ws.py             WebSocket: jobs / user / logs
│   │       ├── notifications.py  notification inbox
│   │       ├── analytics.py      summary + timeseries
│   │       ├── public.py         unauthenticated stats (landing page)
│   │       ├── search.py         cross-entity search
│   │       ├── evidence.py       recovered file explorer
│   │       ├── ledger.py         hash chain API + verify
│   │       ├── reports.py        certificate · recovery · audit · monthly
│   │       ├── settings.py       org settings (ADMIN only)
│   │       ├── system_logs.py    structured log query
│   │       └── users.py          operator list + role patch
│   ├── core/
│   │   ├── config.py             pydantic-settings env config
│   │   ├── crypto.py             ECDSA P-256 sign/verify/keypair
│   │   ├── security.py           JWT + bcrypt (separate from crypto.py)
│   │   └── logging.py            AsyncLogBuffer singleton
│   ├── db/
│   │   └── session.py            async engine + Base + AsyncSessionLocal
│   ├── models/                   SQLAlchemy ORM (13 tables)
│   ├── schemas/                  Pydantic v2 schemas
│   ├── services/                 Business logic layer (10 modules)
│   └── main.py                   App factory, CORS, lifespan
├── keys/                         Auto-generated ECDSA keypair (gitignored)
├── tests/                        pytest + pytest-asyncio test suite
├── requirements.txt
├── Dockerfile
└── pytest.ini
```

---

## Setup & Running

### Local (SQLite — zero config)

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

On first start, `forensicguard.db` is auto-created in the `backend/` directory. All tables are created via `Base.metadata.create_all()` in the lifespan handler.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./forensicguard.db` | DB connection string |
| `JWT_SECRET_KEY` | `change-me-...` | Must change in production |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Token lifetime |
| `SIGNING_PRIVATE_KEY_PEM` | auto-generated | ECDSA private key |
| `SIGNING_PUBLIC_KEY_PEM` | auto-generated | ECDSA public key |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Frontend origin (CORS) |

For PostgreSQL: `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname`

---

## Core: Trust Layer

The trust layer is the most critical module. It is deliberately isolated in `app/core/crypto.py` and called only from `app/api/v1/operations.py`.

### Signing Process

```python
# 1. Build the signable dict (stable, sorted keys)
signable = record.to_signable_dict()

# 2. Canonical JSON — deterministic regardless of upstream formatting
payload_bytes = json.dumps(signable, sort_keys=True, separators=(",", ":")).encode()

# 3. SHA-256 hash
report_hash = hashlib.sha256(payload_bytes).hexdigest()

# 4. ECDSA P-256 signature
signature = private_key.sign(payload_bytes, ec.ECDSA(hashes.SHA256()))
```

### Signable Fields (stable — never change without invalidating all past sigs)

```python
{
    "certificate_id": str,
    "operation_type": str,      # "DRIVE_ERASE" | "FILE_ERASE" | "RECOVERY"
    "target_description": str,
    "started_at": str,          # UTC ISO 8601
    "completed_at": str,        # UTC ISO 8601
    "success": bool,
    "operator": str,            # authenticated email — NOT client claim
    "details": dict,            # module-specific payload
}
```

### Key Persistence

1. Env vars (`SIGNING_PRIVATE_KEY_PEM`) → production / secrets manager
2. `backend/keys/private.pem` → auto-loaded if file exists (dev persistence)
3. Auto-generate + write to `backend/keys/` → first-run self-healing

The Docker volume `keys_data` mounts at `/app/keys` so the auto-generated key persists across container restarts and `docker compose down && up` cycles.

---

## Core: Ledger Service

Located at `app/services/ledger_service.py`.

```
Entry N:
    previous_hash = entry_(N-1).entry_hash   [or GENESIS_HASH for N=1]
    entry_hash    = SHA-256( previous_hash + operation_record.report_hash )
```

- GENESIS_HASH = `"0" * 64` (publicly known, deterministic)
- `append_to_ledger()` is called inside the same DB transaction as the record insert — atomic
- `verify_chain_integrity()` is O(n) — walks from genesis, recomputes every `entry_hash`

---

## Services

| Service | Key Responsibility |
|---|---|
| `ledger_service` | Append-only hash chain, chain integrity verification |
| `case_service` | Case number generation (`FG-{year}-{seq:06d}`) |
| `device_service` | Filtered device listing |
| `job_service` | Atomic job claim with `FOR UPDATE SKIP LOCKED` |
| `notification_service` | Create notifications, hook points for cert/tamper events |
| `analytics_service` | SQL aggregate queries for KPIs and timeseries |
| `settings_service` | Cached settings read/write |
| `pdf_service` | reportlab PDF generation with embedded QR code |
| `ws_manager` | WebSocket connection registry (job/user/logs channels) |
| `logging` (core) | Async log buffer with background flush task |

---

## Database Models

```
users              — email, hashed_password, role (ADMIN/INVESTIGATOR/AUDITOR/SUPERVISOR)
operation_records  — certificate_id, operation_type, details JSON, report_hash, signature
ledger_entries     — sequence_number, previous_hash, entry_hash (append-only)
cases              — case_number (FG-2026-000001), status, lead_investigator
case_investigators — case_id × user_id × is_lead
case_evidence_items— case_id × evidence_type × details JSON
case_operation_links — case_id × operation_record_id (many-to-many)
devices            — serial_number (unique), media_type, connection_type, health, status
jobs               — job_number (FGJ-2026-0000001), operation_type, payload, status, progress%
notifications      — user_id (nullable broadcast), type, read_at
timeline_events    — case_id, event_type, actor_user_id, payload JSON
settings           — setting_key (unique), setting_value
system_logs        — level, category, source, message, details JSON
```

---

## API Dependency Chain

```python
# All protected endpoints follow this pattern:
@router.post("/...")
async def my_endpoint(
    db: AsyncSession = Depends(get_db),                    # DB session
    current_user: User = Depends(get_current_user),        # JWT → User
    _admin: User = Depends(require_roles(UserRole.ADMINISTRATOR)),  # RBAC
):
    ...

# require_roles is a factory:
def require_roles(*roles: UserRole):
    async def check(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return check
```

---

## Running Tests

```bash
# All tests (uses in-memory SQLite, no server needed)
pytest -v

# With coverage
pytest --tb=short -q

# Single module
pytest tests/test_ledger_chain_api.py -v
pytest tests/test_jobs_api.py -v
pytest tests/test_rbac.py -v
```

All tests use `pytest-asyncio` with an in-memory SQLite database provisioned fresh per test session via the `conftest.py` fixtures. No external services required.

---

## Dockerfile

```dockerfile
# Multi-stage build — see backend/Dockerfile
# Exposes port 8000
# CMD: uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## Production Checklist

- [ ] Set `JWT_SECRET_KEY` to a cryptographically random 48-byte value
- [ ] Inject `SIGNING_PRIVATE_KEY_PEM` / `SIGNING_PUBLIC_KEY_PEM` from a secrets manager
- [ ] Switch `DATABASE_URL` to PostgreSQL
- [ ] Set `ENVIRONMENT=production` (restricts CORS to `PUBLIC_BASE_URL`)
- [ ] Mount `keys_data` volume (Docker) or use env-var keys
- [ ] Add rate limiting middleware on `/auth/login` and `/auth/register`
- [ ] Set up Alembic migrations before first production deploy
- [ ] Enable PostgreSQL connection pooling (PgBouncer)
- [ ] Rotate signing keypair periodically and store rotation date in audit log
