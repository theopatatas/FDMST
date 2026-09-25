# FDMST

Flores-Dizon Dental Clinic Management System. The repository contains a React/Vite frontend and an Express/MongoDB backend with Socket.IO messaging.

## Requirements

- Node.js 20.19 or newer (Node 22 LTS recommended)
- npm 10 or newer
- MongoDB
- Supabase Storage buckets for public clinic images and private clinical/chat files

## Local Development

```bash
npm ci
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev
```

The frontend runs on `http://localhost:5173` and the API defaults to `http://127.0.0.1:5050/api` in development.

## Verification

```bash
npm run check
```

This runs frontend linting, backend tests, and the production frontend build.

## Production Deployment

The recommended single-service deployment uses the root `Dockerfile`. It builds the Vite app and serves it through the Express server, including SPA route fallback and Socket.IO on the same public domain.

```bash
docker build -t fdmst .
docker run --env-file backend/.env -p 5050:5050 fdmst
```

For a split deployment, host `frontend/dist` on a static host and set `VITE_API_URL` at build time to the public backend URL ending in `/api`. Add the frontend origin to `CLIENT_URL` or `CORS_ORIGINS` on the backend.

### Required Production Variables

- `NODE_ENV=production`
- `PORT` and optionally `HOST=0.0.0.0`
- `MONGO_URI`
- `JWT_SECRET` with at least 32 random characters
- `APP_URL`, `CLIENT_URL`, or `CORS_ORIGINS` containing the public frontend origin
- `MAIL_API_URL`, `MAIL_API_KEY`, and `MAIL_FROM_NAME`
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET`
- `SUPABASE_CLINICAL_STORAGE_BUCKET` and `SUPABASE_CHAT_STORAGE_BUCKET`
- `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL` for AI forecast wording

`ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` are optional. Configure both only for the first deployment if an administrator does not already exist, then remove them after the account is created. The bootstrap password must contain at least 12 characters and should be changed immediately.

### Storage Setup

Create the Supabase buckets named by the storage variables before deployment. The main image bucket must permit the intended public image access. Clinical and chat buckets should remain private because the API creates expiring signed URLs for those files.

### Health Checks

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready` (returns HTTP 503 until MongoDB is connected)

### Release Checklist

1. Rotate any credentials that have ever been shared, logged, or committed.
2. Restrict MongoDB network access to the deployment provider where possible.
3. Set exact HTTPS origins in `APP_URL`, `CLIENT_URL`, or `CORS_ORIGINS`; do not use `*`.
4. Confirm Supabase bucket policies and keep the secret key backend-only.
5. Run `npm run check` and test registration OTP, login, uploads, appointments, notifications, and real-time chat in staging.
6. Configure the platform health check to `/api/ready` and enable automatic restart.
7. Back up MongoDB before the first production release and before schema-changing releases.

The appointment and promotion expiry jobs run inside the API process. Deploy one API instance unless those jobs are moved to a dedicated worker or protected by a distributed lock.
