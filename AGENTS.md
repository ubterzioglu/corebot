# AGENTS.md — corteqs_wabot

## What this is

Single-file Express 5 WhatsApp Business API webhook bot (`index.js`). Turkish-language conversational onboarding flow. Menu-driven, multi-path flow with 4 routes. CommonJS, no build step.

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
- Link vars: `WA_CHANNEL_LINK`, `DETAILED_FORM_LINK`, `HUMAN_CONTACT_LINK` (default: `https://wa.me/491739569429`), `WEBSITE_URL` (default: `https://corteqs.net/`)
- `.secret` is **tracked in git** and contains live credentials. Do not add new secrets there — use `.env` (gitignored) instead.

## Architecture

- **Entry point:** `index.js` — everything is in this one file.
- **Webhook:** `GET /webhook` (verification), `POST /webhook` (incoming messages), `GET /` (health check)
- **State machine:** User records in Supabase `wa_users` table. Steps: `WELCOME` → `MENU` → then one of 4 routes:
  - **Route 1 (Hızlı yönlendirme):** `REDIRECT` → `REFERRAL_ASK` → `DONE`
  - **Route 2 (Kayıt):** `ASK_NAME` → `ASK_LOCATION` → `ASK_CATEGORY` → `ASK_NOTE` → `REDIRECT` → `REFERRAL_ASK` → `DONE`
  - **Route 3 (Detaylı form):** Shows form link → `REFERRAL_ASK` → `DONE`
  - **Route 4 (İnsanla görüş):** Shows contact link → `DONE`
- **Supabase tables:** `wa_users`, `wa_messages`, `wa_tasks`, `submissions`
- **Category system:** 7 categories: `career`, `networking`, `relocation`, `consulting`, `partnership`, `monetization`, `other`
- **Global commands:** "menü"/"menu"/"reset" returns to MENU from any step. "geç"/"skip" skips optional steps.
- **Graceful degradation:** If Supabase vars are missing, DB writes are skipped but the bot still responds.
- **Form submission processing:** Realtime subscription on `submissions` table sends WhatsApp welcome messages for new entries with `whatsapp_interest=true`.

## Gotchas

- Express **5.x** (not 4) — async error handling differences apply if adding error middleware.
- `NIXPACKS_NODE_VERSION=22` is set in `.secret` (deployment target: likely Railway/Nixpacks).
- Meta access token expiry (error subcode 463) is handled with a specific error message but no auto-refresh.
