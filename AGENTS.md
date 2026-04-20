# AGENTS.md — corteqs_wabot

## What this is

Single-file Express 5 WhatsApp Business API webhook bot (`index.js`). Turkish-language conversational onboarding flow. CommonJS, no build step.

## Commands

```bash
npm start          # node index.js (port 3000 by default)
npm test           # placeholder only, no tests exist
```

No linter, formatter, or typecheck is configured.

## Environment / secrets

- Custom env loader (no `dotenv` dependency). Reads `.env` then `.secret` at startup; **first value wins** per key.
- Required env vars: `VERIFY_TOKEN`, `ACCESS_TOKEN`, `PHONE_NUMBER_ID`
- Supabase vars: `SUPABASE_URL` (fallbacks: `VITE_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY` (fallbacks: `SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
- `.secret` is **tracked in git** and contains live credentials. Do not add new secrets there — use `.env` (gitignored) instead.

## Architecture

- **Entry point:** `index.js` — everything is in this one file.
- **Webhook:** `GET /webhook` (verification), `POST /webhook` (incoming messages), `GET /` (health check)
- **State machine:** User records in Supabase `wa_users` table. Steps: `ASK_INTENT` → `ASK_CITY` → `DONE`. User texts `reset` to restart.
- **Supabase tables:** `wa_users`, `wa_messages`, `wa_tasks`
- **Intent parsing:** `normalizeIntent()` maps Turkish keywords or digits 1–5 to intents: `advisor`, `events`, `business`, `ambassador`, `creator`.
- **Graceful degradation:** If Supabase vars are missing, DB writes are skipped but the bot still responds.

## Gotchas

- Express **5.x** (not 4) — async error handling differences apply if adding error middleware.
- `NIXPACKS_NODE_VERSION=22` is set in `.secret` (deployment target: likely Railway/Nixpacks).
- Meta access token expiry (error subcode 463) is handled with a specific error message but no auto-refresh.
