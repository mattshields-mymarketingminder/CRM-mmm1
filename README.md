# My Marketing Minder — Client CRM & Lead Attribution

Multi-tenant CRM for MMM clients. Each client logs in and sees only their own
leads; leads arrive via website-form webhooks (with UTM auto-attribution) or
manual entry, move through a kanban pipeline, and roll up into a per-source
attribution report. The agency admin login sees every client.

**Production domain:** `https://crm.mymarketingminder.com`

## Stack

- **Frontend** — React 18 + Vite, PWA-capable (installable on mobile), `client/`
- **Backend** — Node 22 + Express REST API, `server/`
- **Database** — PostgreSQL 14+
- **Auth** — JWT sessions, bcrypt password hashing

## Features (MVP)

| Area | What's included |
| --- | --- |
| Auth & tenancy | Email/password login; client users locked to their own data; agency admin sees all clients and can filter by client anywhere |
| Lead ingestion | Per-client webhook `POST /api/ingest/<api_key>` (JSON or form-encoded), UTM capture with auto-attribution, manual entry in the dashboard |
| Pipeline | Kanban board with drag & drop (plus a dropdown fallback that works on touch), quick status change from the list view, notes + activity timeline per lead |
| Attribution | Leads by source with conversion-rate-to-Sold and revenue won, date-range + client filters |
| Branding | MMM yellow `#EBC522` / charcoal `#2C2406` on the agency admin view; client dashboards stay neutral/white-label |

Default pipeline: **New → Contacted → Qualified → Not Qualified → Sold → Lost**.
Sources: Google Ads, Meta Ads, Organic/SEO, Referral, Website Form, Manual, Other.

## Local development

```bash
# 1. PostgreSQL: create role + databases (once)
sudo -u postgres psql -c "CREATE ROLE mmm WITH LOGIN PASSWORD 'mmm_dev_pw' CREATEDB;"
sudo -u postgres createdb -O mmm mmm_crm
sudo -u postgres createdb -O mmm mmm_crm_test   # used by the test suite

# 2. Install deps
npm run install:all

# 3. Apply schema + seed demo data (creates the admin login)
ADMIN_EMAIL=you@agency.com ADMIN_PASSWORD=choose-one npm run seed

# 4. Run
npm run dev:server   # API on :4000
npm run dev:client   # Vite dev server on :5173 (proxies /api to :4000)
```

Or build once and let the API serve the app: `npm run build && npm start` → http://localhost:4000.

### Tests

```bash
npm test
```

Runs the API suite (auth, tenancy isolation, lead CRUD + activity log, webhook
ingestion, UTM attribution, reporting) against `mmm_crm_test`.

## Environment variables (production)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Long random string — **required in production** |
| `PUBLIC_URL` | `https://crm.mymarketingminder.com` (used in webhook URLs shown to clients) |
| `PORT` | Default `4000` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used by `npm run seed` to create the master login |
| `ANTHROPIC_API_KEY` | Claude API key — powers `POST /api/audit` |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-5` |
| `BREVO_API_KEY` | Sends the audit report email from `POST /api/leads/audit` |
| `BREVO_SENDER_EMAIL` / `BREVO_REPLY_EMAIL` | From/reply-to addresses for that email |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Full service-account JSON, minified to one line (not a file path) |
| `GOOGLE_AUDIT_SHEET_ID` | Spreadsheet ID that audit leads get appended to (sheet/tab named `Leads`) |

For local dev, copy `server/.env.example` to `server/.env` — `npm run dev:server` / `npm start` load it automatically via Node's `--env-file-if-exists` flag.

## Landing-page auditor (public tool)

Two unauthenticated endpoints back a public "audit my landing page" tool (a
separate marketing-site frontend, not part of `client/`):

- `POST /api/audit` — `{ url, pageType }` → fetches the page, asks Claude to
  score 8 conversion factors, returns the scored JSON straight through (not
  persisted).
- `POST /api/leads/audit` — `{ name, businessName, website, email, phone,
  pageType, auditResults, timestamp }` → saves the prospect to the
  `audit_leads` table (source of truth), then best-effort emails the report
  via Brevo and best-effort appends a row to a Google Sheet. Brevo/Sheet
  failures are logged but never fail the save.

These prospects are agency leads, not tied to any CRM client tenant, so they
live in their own `audit_leads` table rather than the multi-tenant `leads`
table. If the audit tool's frontend runs on a different origin, add that
origin to `CORS_ORIGINS`.

## Deploying to crm.mymarketingminder.com

The included `Dockerfile` builds the React app and serves everything (app +
API) from one container — works as-is on Render, Railway, Fly.io, or any VPS.

1. **Render/Railway**: create a service from this repo (Docker), attach a
   managed Postgres, set the env vars above.
2. **DNS**: add a CNAME for `crm` on `mymarketingminder.com` pointing at the
   host (e.g. `your-app.onrender.com`). Both platforms issue the TLS
   certificate automatically once the domain is verified.
3. **First boot**: schema is applied automatically; run `npm run seed` once
   (Render shell / `railway run`) to create your admin login.

On a plain VPS: run the container (or `npm start`) behind Caddy/nginx with a
reverse proxy to port 4000; Caddy line: `crm.mymarketingminder.com { reverse_proxy localhost:4000 }`.

## Pointing a client's website form at the CRM

Each client's webhook URL is on the admin **Clients** page. Example snippet:

```html
<script>
  document.querySelector('#contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const params = new URLSearchParams(location.search);
    fetch('https://crm.mymarketingminder.com/api/ingest/CLIENT_API_KEY', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: e.target.name.value,
        email: e.target.email.value,
        phone: e.target.phone.value,
        message: e.target.message.value,
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
      }),
    }).then(() => (location.href = '/thanks'));
  });
</script>
```

Attribution rules: `google + cpc → Google Ads`, `facebook/instagram/meta +
paid → Meta Ads`, organic mediums → Organic/SEO, `referral → Referral`,
no UTMs → Website Form. An explicit `source` field in the payload overrides.

## Phase 2 (not built yet, by design)

- Google Ads / Meta lead-form API integrations
- AI weekly narrative summaries (Claude Haiku)
- Magic-link / OAuth login, custom status labels per client
