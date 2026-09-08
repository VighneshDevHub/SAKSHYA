# PRAMAAN — Deployment Guide

> **प्रमाण** · SIH 2026 · Problem ID 26149  
> Complete deployment guide for all environments: local dev, Docker demo, and production.

---

## Table of Contents

1. [Deployment Options at a Glance](#1-deployment-options-at-a-glance)
2. [Local Development (No Docker)](#2-local-development-no-docker)
3. [Docker — Demo / Hackathon Deployment](#3-docker--demo--hackathon-deployment)
4. [Production Deployment Checklist](#4-production-deployment-checklist)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [Nginx Reverse Proxy (Production)](#6-nginx-reverse-proxy-production)
7. [PostgreSQL Setup](#7-postgresql-setup)
8. [ECDSA Signing Keys](#8-ecdsa-signing-keys)
9. [First-Run Bootstrap (Admin Account)](#9-first-run-bootstrap-admin-account)
10. [Running the CLI Agents Against Any Environment](#10-running-the-cli-agents-against-any-environment)
11. [Updating / Redeploying](#11-updating--redeploying)
12. [Troubleshooting](#12-troubleshooting)
13. [Architecture Ports Reference](#13-architecture-ports-reference)

---

## 1. Deployment Options at a Glance

| Mode | Who it's for | Time to start | Persistence |
|---|---|---|---|
| **Local Dev** (no Docker) | Developer, SIH demo on laptop | 2 min | SQLite file |
| **Docker Compose** | SIH demo, judges, quick showcase | 5 min | Docker volumes |
| **Production** | Real deployment, govt infra | 30 min | PostgreSQL + secrets manager |

---

## 2. Local Development (No Docker)

The simplest setup. Uses SQLite — zero external dependencies.

### Prerequisites

```
Python 3.11+     →  python --version
Node.js 18+      →  node --version
npm 9+           →  npm --version
```

### Step 1 — Python virtual environment

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
python -m venv .venv
.venv\Scripts\activate
```

### Step 2 — Install backend dependencies

```cmd
cd backend
pip install -r requirements.txt
```

### Step 3 — Start backend

```cmd
uvicorn app.main:app --reload --port 8000
```

On first start:
- `backend/forensicguard.db` (SQLite) is auto-created
- All 13 tables are created via `create_all()`
- An ECDSA keypair is auto-generated to `backend/keys/`
- Log: `Application startup complete.`

**URLs:**
| Service | URL |
|---|---|
| API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

### Step 4 — Install and start frontend

Open a **second terminal**:

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\frontend"
npm install
npm run dev
```

**URL:** http://localhost:3000

### Step 5 — Install agent dependencies (optional, third terminal)

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
.venv\Scripts\activate
pip install -r drive-eraser-agent/requirements.txt
pip install -r recovery-engine/requirements.txt
pip install -r file-folder-eraser/requirements.txt
```

### Stopping

```
Ctrl+C  in each terminal
```

### Resetting (fresh database)

```cmd
del "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend\forensicguard.db"
```

Restart the backend — tables are recreated automatically.

---

## 3. Docker — Demo / Hackathon Deployment

Runs the full stack (PostgreSQL + Backend + Frontend) in three containers with a single command. Best for demos where you want judges to see the app running without local Python/Node setup.

### Prerequisites

- **Docker Desktop** installed and running
- At least **4 GB RAM** allocated to Docker

### Step 1 — Create your `.env` file

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
copy .env.example .env
```

Open `.env` and fill in at minimum:

```env
# Generate a real secret:
#   python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET_KEY=your-real-64-char-random-secret-here

POSTGRES_USER=forensicguard
POSTGRES_PASSWORD=choose-a-strong-password
POSTGRES_DB=forensicguard

# These must be what the BROWSER reaches (not Docker internal hostnames)
PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> ⚠️ **Never commit `.env` to git.** It's already in `.gitignore`.

### Step 2 — Build and start all containers

```cmd
docker compose up --build -d
```

This will:
1. Pull `postgres:16-alpine` from Docker Hub
2. Build the backend image (Python 3.12-slim + pip install)
3. Build the frontend image (Node 20 multi-stage, Next.js production build)
4. Start all three containers
5. Wait for PostgreSQL to be healthy before starting the backend

First build takes **3–5 minutes** (downloading base images + installing deps).  
Subsequent starts take **under 30 seconds**.

### Step 3 — Check all containers are running

```cmd
docker compose ps
```

Expected output:
```
NAME                    STATUS          PORTS
sakshya-postgres-1      running (healthy)   0.0.0.0:5432->5432/tcp
sakshya-backend-1       running             0.0.0.0:8000->8000/tcp
sakshya-frontend-1      running             0.0.0.0:3000->3000/tcp
```

### Step 4 — Verify

```cmd
curl http://localhost:8000/health
```
Expected: `{"status":"ok","environment":"production"}`

Open: http://localhost:3000 → PRAMAAN landing page

### Viewing logs

```cmd
docker compose logs -f              # all containers, follow
docker compose logs -f backend      # backend only
docker compose logs -f frontend     # frontend only
docker compose logs -f postgres     # database only
```

### Stopping

```cmd
docker compose down          # stop containers, KEEP volumes (data preserved)
docker compose down -v       # stop AND delete ALL data (destructive — fresh start)
```

### Rebuilding after code changes

```cmd
docker compose up --build -d
```

Only changed layers are rebuilt. Backend changes rebuild in ~30s, frontend in ~60s.

---

## 4. Production Deployment Checklist

Use this before any real/government deployment.

### Security

- [ ] `JWT_SECRET_KEY` is a cryptographically random 48-byte string (not the example value)
- [ ] `POSTGRES_PASSWORD` is a strong password (≥16 chars, mixed case + symbols)
- [ ] `SIGNING_PRIVATE_KEY_PEM` is injected from a secrets manager (not left blank for auto-generate)
- [ ] `ENVIRONMENT=production` is set (enables strict CORS)
- [ ] `PUBLIC_BASE_URL` is set to your actual domain (e.g. `https://pramaan.ntro.gov.in`)
- [ ] HTTPS is enforced — TLS certificate on Nginx (see section 6)
- [ ] `allow_origins=["*"]` in `backend/app/main.py` is replaced with your domain
- [ ] Rate limiting is added to `/api/v1/auth/login` and `/api/v1/auth/register`
- [ ] Database is not exposed on a public port (remove `5432:5432` port mapping)

### Infrastructure

- [ ] PostgreSQL is running on a dedicated server or managed service (RDS, Cloud SQL)
- [ ] Docker volumes are backed up (`postgres_data`, `keys_data`)
- [ ] Nginx reverse proxy is in front (see section 6)
- [ ] SSL/TLS certificate is installed (Let's Encrypt or govt CA)
- [ ] Firewall rules: only ports 80 and 443 exposed externally
- [ ] Health check monitoring on `/health` endpoint

### Application

- [ ] First admin account created and role promoted (see section 9)
- [ ] Org settings configured (Settings page — org name, department, certificate header)
- [ ] All three CLI agents tested end-to-end with the deployed backend URL

---

## 5. Environment Variables Reference

All variables for `.env` (root) or Docker compose environment:

### Required in Production

| Variable | Example | Description |
|---|---|---|
| `JWT_SECRET_KEY` | `x9k2mP...` (48 chars) | JWT signing secret — must be random |
| `POSTGRES_PASSWORD` | `Str0ng!Pass#2026` | PostgreSQL password |
| `PUBLIC_BASE_URL` | `https://pramaan.ntro.gov.in` | Frontend URL shown in CORS + certificates |
| `NEXT_PUBLIC_API_URL` | `https://pramaan.ntro.gov.in/api` | Backend URL baked into frontend bundle |

### Optional but Recommended in Production

| Variable | Default | Description |
|---|---|---|
| `SIGNING_PRIVATE_KEY_PEM` | auto-generated | ECDSA P-256 private key (PEM, `\n` escaped) |
| `SIGNING_PUBLIC_KEY_PEM` | auto-generated | ECDSA P-256 public key (PEM, `\n` escaped) |
| `ENVIRONMENT` | `development` | Set to `production` to restrict CORS |

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./forensicguard.db` | Full DB connection string |
| `POSTGRES_USER` | `forensicguard` | PostgreSQL username |
| `POSTGRES_DB` | `forensicguard` | PostgreSQL database name |

### JWT

| Variable | Default | Description |
|---|---|---|
| `JWT_ALGORITHM` | `HS256` | JWT algorithm (do not change) |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Token lifetime in minutes |

### Generating Secrets

```cmd
REM Generate JWT_SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(48))"

REM Generate ECDSA keypair (run from backend directory with .venv active)
python -c "
from app.core.crypto import generate_keypair
priv, pub = generate_keypair()
print('SIGNING_PRIVATE_KEY_PEM=' + priv.replace(chr(10), '\\n'))
print('SIGNING_PUBLIC_KEY_PEM=' + pub.replace(chr(10), '\\n'))
"
```

Paste the output directly into your `.env` file.

---

## 6. Nginx Reverse Proxy (Production)

In production, Nginx sits in front of both backend and frontend. It handles TLS, compression, and routes traffic.

### Nginx Config

Create `/etc/nginx/sites-available/pramaan`:

```nginx
# PRAMAAN — Nginx reverse proxy config
# Replace pramaan.example.gov.in with your actual domain

server {
    listen 80;
    server_name pramaan.example.gov.in;

    # Redirect all HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pramaan.example.gov.in;

    # TLS — use your certificate paths
    ssl_certificate     /etc/letsencrypt/live/pramaan.example.gov.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pramaan.example.gov.in/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

    # --- Frontend (Next.js) ---
    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # --- Backend API ---
    location /api/ {
        proxy_pass         http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # --- WebSocket (job progress + live logs) ---
    location /api/v1/ws/ {
        proxy_pass         http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "Upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 86400s;   # keep WS connections alive
    }

    # --- Health check (no auth, for load balancer probes) ---
    location /health {
        proxy_pass http://localhost:8000/health;
    }
}
```

### Enable and test

```bash
sudo ln -s /etc/nginx/sites-available/pramaan /etc/nginx/sites-enabled/
sudo nginx -t          # test config syntax
sudo systemctl reload nginx
```

### TLS with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d pramaan.example.gov.in
# Certbot auto-edits your nginx config with certificate paths
# Auto-renewal is set up automatically via systemd timer
```

### docker-compose.yml change for production

When Nginx is in front, remove the direct port mappings for backend and frontend so they're not exposed externally:

```yaml
services:
  backend:
    ports: []          # remove 8000:8000 — Nginx proxies internally
  frontend:
    ports: []          # remove 3000:3000 — Nginx proxies internally
  postgres:
    ports: []          # NEVER expose 5432 externally in production
```

---

## 7. PostgreSQL Setup

### Docker (already handled by `docker-compose.yml`)

The compose file provisions PostgreSQL automatically. Tables are created by the backend on first start via SQLAlchemy `create_all()`. No manual SQL needed.

### Managed PostgreSQL (RDS / Cloud SQL / Supabase)

If using a managed database instead of the Docker container:

1. Create a database named `forensicguard` (or your chosen name)
2. Create a user with full privileges on that database
3. Set the `DATABASE_URL` env var:

```env
DATABASE_URL=postgresql+asyncpg://forensicguard:your_password@your-db-host:5432/forensicguard
```

4. Remove the `postgres` service from `docker-compose.yml`
5. Remove the `depends_on: postgres` condition from the `backend` service

### Backup

```bash
# Backup
docker compose exec postgres pg_dump -U forensicguard forensicguard > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U forensicguard forensicguard < backup_20260908.sql
```

### Connection pooling (production)

For high traffic, add PgBouncer in transaction pooling mode between the backend and PostgreSQL.

---

## 8. ECDSA Signing Keys

### Why this matters

The signing keypair is the root of trust for every certificate PRAMAAN issues. If the private key is lost or replaced, all previously issued certificates will **fail signature verification** — they're permanently invalidated.

### Three key storage strategies

```
┌──────────────────────────────────────────────────────────┐
│  STRATEGY 1: Auto-generate (Dev / Demo / Docker)         │
│                                                          │
│  Leave SIGNING_PRIVATE_KEY_PEM blank in .env             │
│  → backend auto-generates on first start                 │
│  → persisted to keys_data Docker volume                  │
│  → survives docker compose down && up                    │
│  → LOST if volume is deleted (docker compose down -v)    │
│                                                          │
│  ✓ Zero setup    ✗ Not suitable for real deployment      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  STRATEGY 2: Env vars (Staging / Production)             │
│                                                          │
│  Generate keypair once:                                  │
│    cd backend && python -c "                             │
│    from app.core.crypto import generate_keypair          │
│    priv, pub = generate_keypair()                        │
│    print('PRIV:', priv)                                  │
│    print('PUB:', pub)"                                   │
│                                                          │
│  Store in .env or secrets manager                        │
│  Inject via SIGNING_PRIVATE_KEY_PEM env var              │
│                                                          │
│  ✓ Survives container recreation                         │
│  ✓ Key rotation is explicit                              │
│  ✗ Private key in env var (ok for staging, not ideal)    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  STRATEGY 3: Secrets Manager (Production / Govt)         │
│                                                          │
│  Store in: AWS Secrets Manager / HashiCorp Vault /       │
│            Azure Key Vault / GCP Secret Manager          │
│  Inject at container startup via entrypoint script       │
│                                                          │
│  ✓ Most secure   ✓ Auditable rotation   ✓ Zero secrets   │
│    in code or env files                                  │
└──────────────────────────────────────────────────────────┘
```

### Generating the keypair manually

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\\.venv\Scripts\activate
python -c "
from app.core.crypto import generate_keypair
priv, pub = generate_keypair()
print('SIGNING_PRIVATE_KEY_PEM=' + priv.replace(chr(10), '\\\\n'))
print()
print('SIGNING_PUBLIC_KEY_PEM=' + pub.replace(chr(10), '\\\\n'))
"
```

Copy both lines into your `.env` file. The `\n` escape is needed because `.env` files don't support real multiline values.

### Key rotation

If you must rotate the key (e.g., key compromise):

1. Generate a new keypair
2. Update `SIGNING_PRIVATE_KEY_PEM` + `SIGNING_PUBLIC_KEY_PEM` in your secrets store
3. Redeploy the backend
4. **Important**: All certificates issued under the old key will now show `signature_valid: false` during verification. Document this in your audit log and retain the old public key for historical verification if needed.

---

## 9. First-Run Bootstrap (Admin Account)

After first deploy, no admin exists. You must create one.

### Step 1 — Register via API

```cmd
curl -X POST http://localhost:8000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@pramaan.gov.in\",\"password\":\"Admin@SIH2026!\",\"full_name\":\"System Administrator\"}"
```

### Step 2 — Promote to Administrator

New accounts default to `INVESTIGATOR` role. Promote via Python shell:

**Local dev:**
```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\\.venv\Scripts\activate
python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from sqlalchemy import select

async def promote():
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.email == 'admin@pramaan.gov.in'))
        u = r.scalar_one()
        u.role = UserRole.ADMINISTRATOR
        await db.commit()
        print('Promoted:', u.email)

asyncio.run(promote())
"
```

**Docker (runs inside the backend container):**
```cmd
docker compose exec backend python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from sqlalchemy import select

async def promote():
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.email == 'admin@pramaan.gov.in'))
        u = r.scalar_one()
        u.role = UserRole.ADMINISTRATOR
        await db.commit()
        print('Promoted:', u.email)

asyncio.run(promote())
"
```

### Step 3 — Verify login

```cmd
curl -X POST http://localhost:8000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@pramaan.gov.in\",\"password\":\"Admin@SIH2026!\"}"
```

Response should include `"role": "ADMINISTRATOR"`.

### Step 4 — Configure org settings

Login to http://localhost:3000 as admin → **Settings** → Set:
- Organisation Name
- Department
- Certificate Header Text

These appear on every PDF certificate issued by the platform.

---

## 10. Running the CLI Agents Against Any Environment

The three CLI agents point to any backend URL via `--api-url`.

### Against local dev

```cmd
python -m drive-eraser-agent.src.main ^
  --target test_volume.img ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword ^
  --api-url http://localhost:8000
```

### Against Docker (same machine)

```cmd
python -m drive-eraser-agent.src.main ^
  --target test_volume.img ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword ^
  --api-url http://localhost:8000
```

(Same URL — Docker maps port 8000 to localhost.)

### Against production server

```cmd
python -m drive-eraser-agent.src.main ^
  --target test_volume.img ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword ^
  --api-url https://pramaan.example.gov.in
```

### Recovery engine

```cmd
python -m recovery-engine.src.main ^
  --image seized_drive.dd ^
  --output-dir C:\Recovered\Case-001 ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword ^
  --api-url https://pramaan.example.gov.in
```

### File eraser

```cmd
python -m file-folder-eraser.src.main ^
  --target C:\Evidence\WorkingCopies ^
  --email investigator@pramaan.gov.in ^
  --password YourPassword ^
  --api-url https://pramaan.example.gov.in
```

---

## 11. Updating / Redeploying

### Local dev — pull and restart

```cmd
git pull
cd backend
pip install -r requirements.txt   # pick up any new deps
cd ..
uvicorn app.main:app --reload --port 8000   # restart backend
```

Frontend auto-reloads with `--reload` / `npm run dev`.

### Docker — rebuild and restart

```cmd
git pull
docker compose up --build -d
```

Only changed layers rebuild. Data in volumes is preserved.

### Check nothing is broken after update

```cmd
cd backend
pytest -v --tb=short
```

---

## 12. Troubleshooting

### Backend won't start

```
ERROR: address already in use
```
Port 8000 is occupied. Find and kill:
```cmd
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

---

```
sqlalchemy.exc.OperationalError: no such table
```
Database file exists but tables are missing. Delete and restart:
```cmd
del backend\forensicguard.db
```

---

```
cryptography.exceptions.UnsupportedAlgorithm
```
`cryptography` package version issue. Reinstall:
```cmd
pip install --force-reinstall cryptography==43.0.3
```

---

### Docker issues

```
Error: JWT_SECRET_KEY is required
```
`.env` file is missing or `JWT_SECRET_KEY` is not set. Check:
```cmd
type .env
```

---

```
backend exited with code 1
```
View the error:
```cmd
docker compose logs backend
```

---

```
frontend exited (unhealthy)
```
Usually a build failure. Check:
```cmd
docker compose logs frontend
```
Common cause: `NEXT_PUBLIC_API_URL` is wrong — it must be reachable from the browser, not from inside Docker.

---

### WebSocket not connecting

Symptoms: job progress bar doesn't update, live logs don't stream.

1. Check browser DevTools → Network → WS tab — is the WebSocket request being made?
2. Check the URL — it must use `ws://` not `http://`
3. If behind Nginx, confirm the `Upgrade` header is being forwarded (see section 6)
4. Check JWT is not expired (tokens expire in 30 min — log out and back in)

---

### Certificate verification fails after redeploy

```json
{ "signature_valid": false, "overall": false }
```

This means the signing keypair changed between deploys. See [section 8](#8-ecdsa-signing-keys) for key persistence strategies.

**Fix for Docker**: Ensure `keys_data` volume exists and is mounted. Never run `docker compose down -v` unless you intentionally want a fresh start.

---

### Agents can't reach the backend

```
httpx.ConnectError: [Errno 111] Connection refused
```

1. Confirm backend is running: `curl http://localhost:8000/health`
2. If using Docker — the agent runs on your host, not inside the container. Use `http://localhost:8000` not `http://backend:8000`
3. If backend is on a remote server, confirm firewall allows port 8000 (or 443 if behind Nginx)

---

## 13. Architecture Ports Reference

```
┌─────────────────────────────────────────────────────┐
│                    BROWSER / AGENT                  │
└──────────┬──────────────────────────┬───────────────┘
           │ :443 (prod HTTPS)        │ :443 (prod HTTPS)
           │ :3000 (dev/docker)       │ :8000 (dev/docker)
           ▼                          ▼
┌──────────────────┐      ┌───────────────────────────┐
│   Nginx :443     │      │  Direct (dev / demo)      │
│  (production)    │      │                           │
│  TLS termination │      │                           │
└────────┬─────────┘      └───────────────────────────┘
         │
    ┌────┴──────────────────────┐
    │ /        → :3000 (Next.js)│
    │ /api/    → :8000 (FastAPI)│
    │ /api/v1/ws/ → :8000 (WS) │
    └───────────────────────────┘

Internal Docker network (not exposed externally in prod):
  backend:8000   ← FastAPI
  frontend:3000  ← Next.js
  postgres:5432  ← PostgreSQL  (NEVER expose externally)
```

### Port summary

| Service | Dev Port | Docker Internal | Expose in Prod? |
|---|---|---|---|
| Frontend (Next.js) | 3000 | 3000 | Via Nginx only |
| Backend (FastAPI) | 8000 | 8000 | Via Nginx only |
| PostgreSQL | 5432 | 5432 | ❌ Never |
| Nginx | — | — | 80 + 443 only |

---

## Quick Reference Card

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRAMAAN — Quick Deploy Reference
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LOCAL DEV
  Backend:   cd backend && uvicorn app.main:app --reload --port 8000
  Frontend:  cd frontend && npm run dev
  DB:        SQLite → backend/forensicguard.db (auto-created)
  Keys:      backend/keys/ (auto-generated)

DOCKER DEMO
  Setup:     copy .env.example .env  →  edit JWT_SECRET_KEY
  Start:     docker compose up --build -d
  Stop:      docker compose down
  Logs:      docker compose logs -f backend
  Reset:     docker compose down -v  (⚠ deletes all data)

FIRST ADMIN
  Register:  POST /api/v1/auth/register
  Promote:   docker compose exec backend python -c "..."
             (see section 9)

AGENTS
  Drive:     python -m drive-eraser-agent.src.main --target FILE --email E --password P
  Recovery:  python -m recovery-engine.src.main --image IMG --output-dir DIR --email E --password P
  Files:     python -m file-folder-eraser.src.main --target PATH --email E --password P

URLS
  Landing:   http://localhost:3000
  Dashboard: http://localhost:3000/dashboard
  Swagger:   http://localhost:8000/docs
  Health:    http://localhost:8000/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*PRAMAAN · SIH 2026 · Problem ID 26149 · Ministry of Home Affairs / NTRO*  
*Deployment Guide v1.0 · September 2026*
