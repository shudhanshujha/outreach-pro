# OutreachPro Dashboard — Status & Known Issues

## What It Does

A cold-email outreach tool. You load Gmail accounts (with App Passwords), upload recipient lists, write email templates with `{{placeholder}}` variables, and the backend sends them one-by-one with random delays — tracking opens via a pixel and handling follow-ups automatically.

---

## Architecture

```
Browser (React/Vite on Vercel)
       │
       │ HTTPS
       ▼
Express backend (Node.js on Render)
       │
       ├── Supabase PostgreSQL (via REST API over HTTPS)
       │     └── accounts, campaigns, recipients, sent_emails, follow_ups, scheduled_emails
       │
       ├── Gmail SMTP (smtp.gmail.com) — ❌ BLOCKED from Render
       │
       └── IMAP (imap.gmail.com) — for inbox reading
```

### Frontend
- **Hosting**: Vercel — `https://outreach-dashboard-blond-tau.vercel.app`
- **API URL env var**: `VITE_API_URL=https://outreach-pro-0fip.onrender.com`
- **Cache**: Accounts cached in `localStorage` (`outreach_accounts_cache`)

### Backend
- **Hosting**: Render — `https://outreach-pro-0fip.onrender.com`
- **Runtime**: Node.js, Express 5, CommonJS
- **Database**: Supabase PostgreSQL (switched from SQLite on 21-Jun-2026)
- **Auth**: Gmail App Passwords (not OAuth2)
- **Email transport**: Nodemailer to `smtp.gmail.com:587` / `:465`
- **IMAP**: `imapflow` library for inbox reading
- **Tracking**: Pixel (`/api/t/:id.png`) + auto follow-up scheduling
- **Unsubscribe**: `/api/unsubscribe/:email` endpoint
- **Background worker**: Runs every 60s, sends scheduled follow-ups

---

## Known Issues

### 1. Gmail SMTP is unreachable from Render ❌ (BLOCKER)

**Diagnosis** confirmed via `/api/diagnostics` endpoint:

| Test | Result |
|------|--------|
| DNS (IPv4) | `173.194.43.109` — resolves ✅ |
| Raw TCP port 465 (IPv4) | Timeout after 10s ❌ |
| Raw TCP port 587 (IPv4) | Timeout after 10s ❌ |
| Nodemailer verify | `ENETUNREACH` (tries IPv6, but IPv4 also blocked) ❌ |

**Root cause**: Render's network cannot reach Gmail's SMTP servers on any port. Neither Render blocks the ports nor Gmail blocks Render's IP range — the connection simply never completes.

**Impact**: Campaigns fail immediately — every email gets `Connection timeout` or `ENETUNREACH`.

**Possible fixes** (from best to worst):

| Option | Effort | Cost | Notes |
|--------|--------|------|-------|
| **SendGrid SMTP** | Small code change | Free (100/day) | Replace SMTP host/port/credentials. "From" address can still be your Gmail. Requires SendGrid signup + API key. |
| **Mailgun SMTP** | Small code change | Free (100/day) | Same approach as SendGrid. |
| **AWS SES SMTP** | Small code change | Free (62k/mo) | Same approach, but may need domain verification. |
| **Gmail API OAuth** | Large rewrite | Free | You chose App Passwords to avoid OAuth. |
| **SMTP proxy on VPS** | Complex | ~$5/mo VPS | Runs a TCP relay on a server that CAN reach Gmail SMTP. |

### 2. `"running"` double-quote SQL bug (now fixed)

The old SQLite code used `"running"` (double quotes) instead of `'running'` (single quotes) for string literals. SQLite 3.27+ rejects this. **Fixed** by migrating to Supabase REST API where all values are parameterized.

### 3. Data lost on every Render deploy (now fixed)

SQLite database file was stored on Render's ephemeral filesystem — wiped on every deploy. **Fixed** by migrating to Supabase PostgreSQL (external, persists across deploys).

### 4. OAuth token expiry (now fixed)

Original code used Google OAuth2 with 7-day refresh token expiry. **Fixed** by switching to Gmail App Passwords + SMTP.

### 5. IPv6 routing to Supabase (now fixed)

Render cannot reach IPv6 addresses. Supabase's `db.*.supabase.co` resolves to IPv6 only. **Fixed** by switching from direct `pg` connection to Supabase REST API (which uses IPv4 HTTPS on port 443).

---

## Quick Start for Developers

```bash
git clone https://github.com/shudhanshujha/outreach-pro.git
cd outreach-pro

# Install backend deps
cd api && npm install
cd ../server && npm install
cd ..

# Set env vars
set SUPABASE_URL=https://usycsxknizcjbuftuzqr.supabase.co
set SUPABASE_KEY=sb_publishable_ftNO2ex_Yhp3YuLV8AvAWQ_QMtbIxeb
set BACKEND_URL=http://localhost:3001

# Run backend
node api/index.js

# Run frontend (separate terminal)
npm run dev
```

---

## Files of Interest

| File | Purpose |
|------|---------|
| `api/index.js` | Main Express app — all routes, SMTP, IMAP |
| `api/db.js` | Supabase REST API client (using `@supabase/supabase-js`) |
| `api/package.json` | Backend dependencies |
| `server/index.js` | Render wrapper — sets `NODE_PATH` for module resolution |
| `server/package.json` | Render's install target (must mirror `api/package.json`) |
| `credentials.txt` | All 5 Gmail addresses + App Passwords |
| `.env` / `.env.example` | Environment variable templates |
