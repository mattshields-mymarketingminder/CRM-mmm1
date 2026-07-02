// Seeds an agency admin plus two demo clients with sample leads.
// Usage: ADMIN_EMAIL=you@agency.com ADMIN_PASSWORD=... npm run seed
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { pool, query } from './db.js';
import { migrate } from './migrate.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'matt.shields@live.co.uk';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mmm-admin-2026';

async function upsertUser(email, password, role, clientId, name) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role, client_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email.toLowerCase(), hash, name, role, clientId]
  );
  return rows[0].id;
}

async function ensureClient(companyName) {
  const existing = await query('SELECT * FROM clients WHERE company_name = $1', [companyName]);
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await query(
    'INSERT INTO clients (company_name, api_key) VALUES ($1, $2) RETURNING *',
    [companyName, randomBytes(24).toString('hex')]
  );
  return rows[0];
}

const SAMPLE_LEADS = [
  { name: 'Sarah Whitfield', email: 'sarah@example.com', phone: '07700 900101', source: 'google_ads', status: 'sold', value_gbp: 2400, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand-search' },
  { name: 'James Okafor', email: 'james.o@example.com', phone: '07700 900102', source: 'google_ads', status: 'qualified', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'services' },
  { name: 'Priya Nair', email: 'priya@example.com', source: 'meta_ads', status: 'contacted', utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'spring-offer' },
  { name: 'Tom Hendricks', email: 'tom.h@example.com', source: 'meta_ads', status: 'sold', value_gbp: 1150, utm_source: 'instagram', utm_medium: 'paid', utm_campaign: 'spring-offer' },
  { name: 'Ellie Marsh', email: 'ellie@example.com', source: 'organic', status: 'new', utm_source: 'google', utm_medium: 'organic' },
  { name: 'Derek Boone', phone: '07700 900105', source: 'referral', status: 'sold', value_gbp: 3800 },
  { name: 'Hannah Cole', email: 'hannah@example.com', source: 'website_form', status: 'not_qualified' },
  { name: 'Marcus Reid', phone: '07700 900107', source: 'manual', status: 'lost', notes: 'Walk-in enquiry, went with competitor' },
  { name: 'Aisha Bello', email: 'aisha@example.com', source: 'google_ads', status: 'new', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'services' },
  { name: 'Owen Price', email: 'owen@example.com', source: 'organic', status: 'contacted' },
];

async function seed() {
  await migrate();

  const adminId = await upsertUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'admin', null, 'MMM Admin');
  console.log(`Admin user ready: ${ADMIN_EMAIL} (id ${adminId})`);

  const acme = await ensureClient('Acme Plumbing Ltd');
  const bright = await ensureClient('Brightside Dental');
  await upsertUser('owner@acmeplumbing.example', 'acme-demo-2026', 'client', acme.id, 'Alan Acme');
  await upsertUser('reception@brightsidedental.example', 'bright-demo-2026', 'client', bright.id, 'Bella Bright');

  const { rows: existing } = await query('SELECT count(*)::int AS n FROM leads');
  if (existing[0].n === 0) {
    for (const [i, lead] of SAMPLE_LEADS.entries()) {
      const clientId = i < 7 ? acme.id : bright.id;
      const createdAt = new Date(Date.now() - (SAMPLE_LEADS.length - i) * 86400000 * 2);
      const { rows } = await query(
        `INSERT INTO leads (client_id, name, email, phone, notes, source, status, value_gbp,
                            utm_source, utm_medium, utm_campaign, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id`,
        [clientId, lead.name, lead.email || null, lead.phone || null, lead.notes || null,
         lead.source, lead.status, lead.value_gbp || null,
         lead.utm_source || null, lead.utm_medium || null, lead.utm_campaign || null, createdAt]
      );
      await query(
        `INSERT INTO activities (lead_id, type, detail, created_at) VALUES ($1, 'created', $2, $3)`,
        [rows[0].id, `Lead created (source: ${lead.source})`, createdAt]
      );
    }
    console.log(`Seeded ${SAMPLE_LEADS.length} sample leads.`);
  } else {
    console.log('Leads already present; skipping sample data.');
  }

  console.log('\nDemo logins:');
  console.log(`  Agency admin : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log('  Client demo  : owner@acmeplumbing.example / acme-demo-2026');
  console.log('  Client demo  : reception@brightsidedental.example / bright-demo-2026');
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
