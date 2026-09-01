# Deployment Guide

## Console (`forensic-console/`)

### Prerequisites
- Node 20+
- A Supabase project (free tier is fine)
- Vercel account (for hosted) OR just `next dev` (for local)

### Env vars (required)
| Name | Scope | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | Supabase anon key |
| `NEXT_PUBLIC_PROTOTYPE` | all | `true` (keeps red banner) |
| `SUPABASE_SECRET_KEY` | server | Service-role key (never `NEXT_PUBLIC_`) |
| `REDIS_URL` | optional | Only if using pairing-code cache |

### Local run
```
cd forensic-console
cp .env.example .env.local   # then fill in
npx next dev
```
Open http://localhost:3000.

### Vercel
- Root Directory: `forensic-console`
- Framework: Next.js
- Install: `npm install` (npm workspaces picks up `packages/*`)
- Build: `next build`
- Add env vars above in Project Settings → Environment Variables.

### Supabase setup
1. Create project. Grab URL + keys.
2. SQL Editor → run each file in `supabase/migrations/` in filename order.
3. Run `supabase/seed.sql`.
4. Auth → Users → create the auth users matching the seeded officers (dummy passwords).

Or CLI: `supabase link --project-ref <ref>` then `supabase db push` then `supabase db execute --file supabase/seed.sql`.

### First-run flow
- `/login` → dummy officer → `/onboarding/jurisdiction` → `/cases/new` → `/authorizations/new` → `/audit`.

## Android app (`SupervisedKeyboardApp/`)

### Build APK on GitHub
Push to `main` (or any branch touching `SupervisedKeyboardApp/**`) triggers `.github/workflows/build-supervised-keyboard-apk.yml`. APK appears under Actions → workflow run → Artifacts → `SupervisedKeyboardApp-debug-apk`.

### Build APK locally
```
cd SupervisedKeyboardApp
./gradlew assembleDebug
```
Output: `app/build/outputs/apk/debug/app-debug.apk`.

### Wire to backend
Set `BACKEND_URL` in `SupervisedKeyboardApp/app/build.gradle` `buildConfigField` to your deployed console URL, e.g. `https://sendwise-forensic.vercel.app`. Rebuild.

### Install
Sideload the APK to an Android device (API 26+). Enable it: Settings → System → Languages & input → Manage keyboards → SupervisedKeyboardApp.

## Endpoints the Android app hits
| Endpoint | Purpose |
|---|---|
| `POST /api/evidence/ingest` | Signed evidence batches (Active auth only) |
| `POST /api/evidence/tamper` | Uninstall / root / emulator events |

Both live under `forensic-console/app/api/evidence/`.

## Notes
- `NEXT_PUBLIC_PROTOTYPE=true` keeps the visible dummy pills. Never flip to false without replacing the dummy verification packages.
- The `p_append_audit` RPC is called from most mutating routes — service_role key required.
- RLS assumes JWT claims `role` and `officer_id`. See `supabase/migrations/20260831110906_rls_and_query_gates.sql` and consider a Supabase custom-access-token hook for real deployments.
