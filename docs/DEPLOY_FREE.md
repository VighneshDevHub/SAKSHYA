# PRAMAAN — Free Deployment Guide
### Get a Live Link in ~10 Minutes

> **GitHub repo**: `https://github.com/VighneshDevHub/NTRO`  
> **Stack**: FastAPI backend · Next.js 14 frontend · PostgreSQL  
> **Platform**: Railway (free tier — no credit card needed for hobby plan)

---

## Why Railway?

| Platform | Backend | Frontend | PostgreSQL | Free Tier | WebSocket |
|---|---|---|---|---|---|
| **Railway** ✅ | ✅ Docker | ✅ Docker | ✅ Built-in | ✅ $5 credit/month | ✅ Yes |
| Vercel + Render | ✅ | ✅ | ❌ Extra | Partial | ❌ Vercel blocks WS |
| Render only | ✅ | ✅ | ✅ | ✅ Slow cold start | ✅ Yes |
| Fly.io | ✅ | ✅ | ✅ | ✅ | ✅ Yes |

Railway gives you **3 services in one project** (backend + frontend + postgres), each gets its own live HTTPS URL, no credit card for the free $5/month credit which covers small demo traffic easily.

---

## Overview — What You'll Deploy

```
Railway Project: PRAMAAN
│
├── Service 1: pramaan-backend
│   └── Docker → backend/
│   └── URL: https://pramaan-backend-xxxx.up.railway.app
│   └── Env: DATABASE_URL, JWT_SECRET_KEY, SIGNING_PRIVATE_KEY_PEM ...
│
├── Service 2: pramaan-frontend
│   └── Docker → frontend/
│   └── URL: https://pramaan-frontend-xxxx.up.railway.app
│   └── Env: NEXT_PUBLIC_API_URL = backend URL above
│
└── Service 3: PostgreSQL
    └── Managed by Railway
    └── URL injected automatically into backend as DATABASE_URL
```

---

## Step 0 — Prerequisites (5 minutes, one-time)

### 0.1 Push latest code to GitHub

Open a terminal in the project root and run:

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"

git add -A
git commit -m "deploy: add Railway config and production fixes"
git push origin main
```

Verify at: https://github.com/VighneshDevHub/NTRO — all files should be there.

### 0.2 Create Railway account

1. Go to **https://railway.app**
2. Click **"Login"** → **"Login with GitHub"**
3. Authorise Railway to access your GitHub
4. That's it — no credit card needed for the free tier

---

## Step 1 — Create a New Railway Project

1. On Railway dashboard click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Find and select **`VighneshDevHub/NTRO`**
4. Railway will ask which folder to deploy — click **"Add service"** but **do NOT deploy yet** — you'll configure it first

> Alternatively click **"Empty Project"** and add services manually (more control).

---

## Step 2 — Add PostgreSQL Database

This must be done **first** so the backend can connect to it.

1. Inside your Railway project, click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway instantly creates a managed Postgres 16 instance
3. Click on the PostgreSQL service → **"Variables"** tab
4. You'll see `DATABASE_URL` — **copy this value**, you'll need it in Step 3

```
postgresql://postgres:xxxxxxxx@roundhouse.proxy.rlwy.net:12345/railway
```

> Railway also provides `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` individually — any works.

---

## Step 3 — Deploy the Backend

### 3.1 Add backend service

1. Click **"+ New"** → **"GitHub Repo"** → select **`VighneshDevHub/NTRO`**
2. Railway detects the Dockerfile — but you have TWO Dockerfiles (backend + frontend)
3. You need to tell Railway to use **only the `backend/` folder**:
   - Click on the new service → **"Settings"** tab
   - Under **"Source"** → **"Root Directory"** → type: `backend`
   - Railway will now use `backend/Dockerfile`
4. Name the service: **`pramaan-backend`**
5. **Don't deploy yet** — set env vars first

### 3.2 Set backend environment variables

Click the backend service → **"Variables"** tab → **"RAW Editor"** → paste this entire block (fill in the values marked `CHANGE_ME`):

```env
# --- Database ---
# Paste the DATABASE_URL you copied from the PostgreSQL service
DATABASE_URL=postgresql+asyncpg://postgres:CHANGE_ME@roundhouse.proxy.rlwy.net:PORT/railway

# --- Auth ---
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET_KEY=CHANGE_ME_48_CHAR_RANDOM_STRING
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

# --- Environment ---
ENVIRONMENT=production

# --- CORS (fill in AFTER frontend is deployed — see Step 4) ---
# Leave as placeholder for now, update after you get the frontend URL
PUBLIC_BASE_URL=https://placeholder.up.railway.app
EXTRA_CORS_ORIGINS=https://placeholder.up.railway.app

# --- Signing keys (leave blank = auto-generate, fine for demo) ---
SIGNING_PRIVATE_KEY_PEM=
SIGNING_PUBLIC_KEY_PEM=
```

> **Important about DATABASE_URL**: Railway's default URL uses `postgresql://` — the backend needs `postgresql+asyncpg://`. Just replace the prefix.  
> Example: `postgresql://postgres:abc@host:1234/railway` → `postgresql+asyncpg://postgres:abc@host:1234/railway`

### 3.3 Generate JWT secret right now

Open a terminal on your machine:

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA"
.venv\Scripts\activate
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copy the output → paste as the value of `JWT_SECRET_KEY` in Railway.

### 3.4 Deploy the backend

Click **"Deploy"** (or it may auto-deploy when you set vars).

Watch the build logs — takes **2–3 minutes** first time.

✅ **Success** when you see:
```
INFO:     Application startup complete.
```

Your backend URL will be something like:  
`https://pramaan-backend-production-xxxx.up.railway.app`

### 3.5 Verify backend is live

Open in browser:
```
https://YOUR-BACKEND-URL.up.railway.app/health
```
Expected response: `{"status":"ok","environment":"production"}`

Also check:
```
https://YOUR-BACKEND-URL.up.railway.app/docs
```
Should show the Swagger UI with all 40+ endpoints.

---

## Step 4 — Deploy the Frontend

### 4.1 Add frontend service

1. Click **"+ New"** → **"GitHub Repo"** → select **`VighneshDevHub/NTRO`** again
2. Click on the service → **"Settings"** → **"Root Directory"** → type: `frontend`
3. Name the service: **`pramaan-frontend`**
4. **Don't deploy yet** — set env vars first

### 4.2 Set frontend environment variables

Click the frontend service → **"Variables"** → **"RAW Editor"**:

```env
# The backend URL from Step 3 — MUST be the public HTTPS URL, not internal
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND-URL.up.railway.app
```

Replace `YOUR-BACKEND-URL` with the actual URL you got in Step 3.5.

> ⚠️ **Critical**: `NEXT_PUBLIC_API_URL` is baked into the JS bundle at **build time**. You must set this BEFORE the first build. If you set it after, you need to **redeploy** the frontend.

### 4.3 Deploy the frontend

Click **"Deploy"** — takes **3–4 minutes** (Next.js production build).

✅ **Success** when build logs show:
```
Route (app)                              Size     First Load JS
┌ ○ /                                    ...
├ ○ /login                               ...
└ ... (all routes listed)
```

Your frontend URL:  
`https://pramaan-frontend-production-xxxx.up.railway.app`

### 4.4 Update backend CORS

Now go back to the **backend service** → **"Variables"** → update:

```env
PUBLIC_BASE_URL=https://pramaan-frontend-production-xxxx.up.railway.app
EXTRA_CORS_ORIGINS=https://pramaan-frontend-production-xxxx.up.railway.app
```

Replace with your **actual** frontend Railway URL.

Click **"Deploy"** on the backend to apply CORS changes.

---

## Step 5 — Create the Admin Account

The backend is live but has no users. Create the admin.

### Option A — Using curl (from your terminal)

```cmd
curl -X POST https://YOUR-BACKEND-URL.up.railway.app/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@pramaan.gov.in\",\"password\":\"Admin@SIH2026!\",\"full_name\":\"System Administrator\"}"
```

Expected: `{"id":"...","email":"admin@pramaan.gov.in","role":"INVESTIGATOR"}`

### Option B — Using Swagger UI

1. Open `https://YOUR-BACKEND-URL.up.railway.app/docs`
2. Go to **POST /api/v1/auth/register**
3. Click "Try it out" → fill in email, password, full_name → Execute

### Promote to Administrator

Run this from your local machine (with `.venv` active):

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
set DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@YOUR_HOST:PORT/railway
python -c "
import asyncio, os
from app.core.config import get_settings
from app.db.session import AsyncSessionLocal, init_models
from app.models.user import User, UserRole
from sqlalchemy import select

async def promote():
    await init_models()
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.email == 'admin@pramaan.gov.in'))
        u = r.scalar_one()
        u.role = UserRole.ADMINISTRATOR
        await db.commit()
        print('Promoted:', u.email, '->', u.role)

asyncio.run(promote())
"
```

**Or** — use the Railway shell directly (easier):

1. Railway dashboard → backend service → **"Shell"** tab (top right)
2. In the shell that opens, run:

```bash
python -c "
import asyncio
from app.db.session import AsyncSessionLocal, init_models
from app.models.user import User, UserRole
from sqlalchemy import select

async def promote():
    await init_models()
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(User).where(User.email == 'admin@pramaan.gov.in'))
        u = r.scalar_one()
        u.role = UserRole.ADMINISTRATOR
        await db.commit()
        print('Done:', u.email)

asyncio.run(promote())
"
```

---

## Step 6 — Test Your Live URLs

After all three services are running:

| What to test | URL |
|---|---|
| Landing page | `https://YOUR-FRONTEND-URL.up.railway.app` |
| Dashboard login | `https://YOUR-FRONTEND-URL.up.railway.app/login` |
| Backend health | `https://YOUR-BACKEND-URL.up.railway.app/health` |
| API explorer | `https://YOUR-BACKEND-URL.up.railway.app/docs` |
| Certificate verify | `https://YOUR-FRONTEND-URL.up.railway.app/verify/CERT-xxx` |

Login with `admin@pramaan.gov.in` / `Admin@SIH2026!`

---

## Step 7 — Run CLI Agents Against Live Backend

Point the agents at your Railway backend URL:

```cmd
REM Drive eraser
python -m drive-eraser-agent.src.main ^
  --target test_volume.img ^
  --email admin@pramaan.gov.in ^
  --password "Admin@SIH2026!" ^
  --api-url https://YOUR-BACKEND-URL.up.railway.app

REM Recovery engine
python -m recovery-engine.src.main ^
  --image recovery-engine/seized_drive.dd ^
  --output-dir recovered/ ^
  --email admin@pramaan.gov.in ^
  --password "Admin@SIH2026!" ^
  --api-url https://YOUR-BACKEND-URL.up.railway.app
```

Certificates appear on the live dashboard immediately.

---

## Custom Domain (Optional)

If you have a domain (e.g. `pramaan.ntro.gov.in`):

1. Railway service → **"Settings"** → **"Domains"** → **"Custom Domain"**
2. Add your domain
3. Railway gives you a CNAME record to add in your DNS provider
4. SSL certificate is auto-provisioned (Let's Encrypt)
5. Update `PUBLIC_BASE_URL` and `NEXT_PUBLIC_API_URL` to use the custom domain
6. Redeploy both services

---

## Keeping the Signing Key Persistent

By default Railway restarts containers occasionally. The auto-generated ECDSA key is stored in the container filesystem — it will be lost on redeploy, invalidating all certificates.

**Fix — generate a permanent key and store it as an env var:**

On your local machine:

```cmd
cd "C:\Users\vighn\Desktop\STAY-HARD\SIH 2026\SAKSHYA\backend"
..\\.venv\Scripts\activate
python -c "
from app.core.crypto import generate_keypair
priv, pub = generate_keypair()
print('=== COPY THE LINES BELOW INTO RAILWAY ENV VARS ===')
print()
print('SIGNING_PRIVATE_KEY_PEM=' + priv.replace(chr(10), '\\n'))
print()
print('SIGNING_PUBLIC_KEY_PEM=' + pub.replace(chr(10), '\\n'))
"
```

Copy both lines → paste into the backend Railway service **Variables** tab.  
Redeploy backend → all future certificates use this permanent key.

---

## Troubleshooting Railway Deployments

### Build fails — "Cannot find module" or pip error

Check the **"Root Directory"** is set correctly:
- Backend service → Settings → Root Directory = `backend`
- Frontend service → Settings → Root Directory = `frontend`

---

### Frontend loads but API calls fail (CORS error in browser)

1. Open browser DevTools → Console — look for `CORS policy` error
2. Check that `PUBLIC_BASE_URL` in backend env vars matches the frontend URL **exactly** (including `https://` and no trailing slash)
3. Redeploy backend after updating the env var

---

### `DATABASE_URL` error on backend

Railway injects `DATABASE_URL` as `postgresql://` — you need `postgresql+asyncpg://`.  
Update the variable in Railway:

```
postgresql+asyncpg://postgres:PASSWORD@HOST:PORT/railway
```

---

### WebSocket disconnects immediately

On Railway, WebSockets work fine. If they drop:
1. Check browser DevTools → Network → WS tab — look at the handshake response
2. Ensure the frontend `NEXT_PUBLIC_API_URL` uses `https://` not `http://` — the ws.ts hook auto-converts `https://` → `wss://`

---

### Frontend shows blank page / 500 error

The `NEXT_PUBLIC_API_URL` was wrong at build time. Fix:
1. Update the env var in Railway frontend service
2. Click **"Redeploy"** — this triggers a fresh Next.js build with the correct URL baked in

---

### Railway free tier limits

Railway's free hobby plan includes **$5 credit/month**. Approximate usage:
- PostgreSQL: ~$0.000231/GB-hour (nearly free for a demo DB)
- Backend (512MB RAM): ~$0.000463/GB-hour
- Frontend (512MB RAM): ~$0.000463/GB-hour

For a **demo running 8 hours/day** this is well under $5/month.

If you need the app up 24/7 for judges, sign up for the **Starter plan ($20/month)** and get unlimited usage.

---

## Full Deployment Checklist

```
PRE-DEPLOY
  [ ] git add -A && git commit -m "deploy" && git push origin main
  [ ] Railway account created (login with GitHub)

RAILWAY PROJECT
  [ ] New project created
  [ ] PostgreSQL service added
  [ ] DATABASE_URL noted (for backend)

BACKEND SERVICE
  [ ] Root Directory = "backend"
  [ ] DATABASE_URL set (postgresql+asyncpg://...)
  [ ] JWT_SECRET_KEY set (48-char random)
  [ ] ENVIRONMENT = production
  [ ] Deployed successfully — /health returns 200

FRONTEND SERVICE
  [ ] Root Directory = "frontend"
  [ ] NEXT_PUBLIC_API_URL = backend HTTPS URL
  [ ] Deployed successfully — landing page loads

BACKEND CORS UPDATE
  [ ] PUBLIC_BASE_URL = frontend HTTPS URL
  [ ] EXTRA_CORS_ORIGINS = frontend HTTPS URL
  [ ] Backend redeployed

SIGNING KEY (optional but recommended)
  [ ] SIGNING_PRIVATE_KEY_PEM generated and set
  [ ] SIGNING_PUBLIC_KEY_PEM generated and set
  [ ] Backend redeployed

ADMIN BOOTSTRAP
  [ ] Registered admin via /docs or curl
  [ ] Promoted to ADMINISTRATOR via Railway shell
  [ ] Login works at /dashboard

FINAL TESTS
  [ ] Landing page: live and loads stats
  [ ] Login: works with admin credentials
  [ ] Dashboard: shows analytics
  [ ] Run drive eraser agent with --api-url pointing to Railway backend
  [ ] Certificate issued and verifiable at /verify/CERT-xxx
  [ ] WebSocket: job progress updates in real time
```

---

## Quick Reference

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRAMAAN on Railway — Quick Reference
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GitHub Repo:  https://github.com/VighneshDevHub/NTRO
Railway URL:  https://railway.app

Backend service
  Root Dir:   backend
  Health:     GET /health
  Key vars:   DATABASE_URL (asyncpg), JWT_SECRET_KEY,
              ENVIRONMENT=production, PUBLIC_BASE_URL

Frontend service
  Root Dir:   frontend
  Key vars:   NEXT_PUBLIC_API_URL=<backend HTTPS URL>
  NOTE:       Redeploy if you change NEXT_PUBLIC_API_URL

PostgreSQL
  Managed by Railway, auto-injects DATABASE_URL
  Change prefix: postgresql:// → postgresql+asyncpg://

Promote admin via Railway Shell:
  python -c "import asyncio; from app.db.session import
  AsyncSessionLocal, init_models; ..."

CLI agents against live backend:
  --api-url https://YOUR-BACKEND.up.railway.app
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*PRAMAAN · SIH 2026 · Problem ID 26149*  
*Free Deployment Guide v1.0 · September 2026*
