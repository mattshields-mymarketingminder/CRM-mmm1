-- MMM CRM schema. Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS clients (
  id          SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  api_key     TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  client_id     INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_users_need_client CHECK (role = 'admin' OR client_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS leads (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  notes        TEXT,
  source       TEXT NOT NULL DEFAULT 'manual',
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_term     TEXT,
  utm_content  TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'contacted', 'qualified', 'not_qualified', 'sold', 'lost')),
  value_gbp    NUMERIC(12, 2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_client ON leads (client_id);
CREATE INDEX IF NOT EXISTS idx_leads_client_status ON leads (client_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_client_created ON leads (client_id, created_at);

CREATE TABLE IF NOT EXISTS activities (
  id         SERIAL PRIMARY KEY,
  lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL CHECK (type IN ('created', 'status_change', 'note', 'updated')),
  detail     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities (lead_id, created_at);

-- Landing-page auditor: public tool prospects (not tied to a client tenant,
-- unlike `leads`). Populated by POST /api/leads/audit.
CREATE TABLE IF NOT EXISTS audit_leads (
  id            SERIAL PRIMARY KEY,
  name          TEXT,
  business_name TEXT NOT NULL,
  website       TEXT,
  email         TEXT NOT NULL,
  phone         TEXT,
  page_type     TEXT,
  overall_score NUMERIC(5, 2),
  scores        JSONB,
  strengths     JSONB,
  improvements  JSONB,
  recommendation TEXT,
  brevo_sent    BOOLEAN NOT NULL DEFAULT false,
  sheet_synced  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after the initial rollout, so this must work against an
-- already-deployed table too (migrate() re-runs this whole file on every boot).
ALTER TABLE audit_leads ADD COLUMN IF NOT EXISTS manual_audit_needed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_audit_leads_email ON audit_leads (email);
CREATE INDEX IF NOT EXISTS idx_audit_leads_created ON audit_leads (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_leads_manual_audit_needed ON audit_leads (manual_audit_needed) WHERE manual_audit_needed;

-- Backs the shared rate limiter for the public audit endpoints
-- (POST /api/audit, POST /api/leads/audit): 5/IP/day, 1/IP/10min.
CREATE TABLE IF NOT EXISTS audit_rate_limits (
  id         SERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  path       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_rate_limits_ip_created ON audit_rate_limits (ip, created_at);
