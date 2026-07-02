import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { resetDb, makeApp, createClient, createUser, login, pool } from './helpers.js';
import { query } from '../src/db.js';
import { attributeSource } from '../src/attribution.js';

let app;
let clientA, clientB, adminToken, tokenA, tokenB;

before(async () => {
  app = makeApp();
});

after(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  clientA = await createClient('Client A Ltd');
  clientB = await createClient('Client B Ltd');
  await createUser({ email: 'admin@mmm.test', role: 'admin' });
  await createUser({ email: 'a@client.test', clientId: clientA.id });
  await createUser({ email: 'b@client.test', clientId: clientB.id });
  adminToken = await login(app, request, 'admin@mmm.test');
  tokenA = await login(app, request, 'a@client.test');
  tokenB = await login(app, request, 'b@client.test');
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// ---------- Auth ----------

test('login rejects bad credentials', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'a@client.test', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('login returns token and user profile', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'a@client.test', password: 'password123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.role, 'client');
  assert.equal(res.body.user.client_id, clientA.id);
});

test('protected routes require a token', async () => {
  const res = await request(app).get('/api/leads');
  assert.equal(res.status, 401);
});

// ---------- Multi-tenancy isolation ----------

test('client A cannot see client B leads in list', async () => {
  await request(app).post('/api/leads').set(auth(tokenA)).send({ name: 'Lead A' });
  await request(app).post('/api/leads').set(auth(tokenB)).send({ name: 'Lead B' });

  const res = await request(app).get('/api/leads').set(auth(tokenA));
  assert.equal(res.status, 200);
  assert.equal(res.body.leads.length, 1);
  assert.equal(res.body.leads[0].name, 'Lead A');
});

test('client A cannot read, update, or delete client B lead by id', async () => {
  const created = await request(app).post('/api/leads').set(auth(tokenB)).send({ name: 'Secret B' });
  const id = created.body.lead.id;

  assert.equal((await request(app).get(`/api/leads/${id}`).set(auth(tokenA))).status, 404);
  assert.equal(
    (await request(app).patch(`/api/leads/${id}`).set(auth(tokenA)).send({ status: 'sold' })).status,
    404
  );
  assert.equal((await request(app).delete(`/api/leads/${id}`).set(auth(tokenA))).status, 404);
});

test('client users cannot create leads for another client', async () => {
  const res = await request(app)
    .post('/api/leads')
    .set(auth(tokenA))
    .send({ name: 'Sneaky', client_id: clientB.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.lead.client_id, clientA.id); // forced to own tenant
});

test('admin sees all leads across clients', async () => {
  await request(app).post('/api/leads').set(auth(tokenA)).send({ name: 'Lead A' });
  await request(app).post('/api/leads').set(auth(tokenB)).send({ name: 'Lead B' });

  const all = await request(app).get('/api/leads').set(auth(adminToken));
  assert.equal(all.body.leads.length, 2);

  const scoped = await request(app)
    .get(`/api/leads?client_id=${clientA.id}`)
    .set(auth(adminToken));
  assert.equal(scoped.body.leads.length, 1);
});

test('client users cannot access admin client management', async () => {
  const res = await request(app).get('/api/clients').set(auth(tokenA));
  assert.equal(res.status, 403);
});

// ---------- Lead CRUD + activity log ----------

test('lead lifecycle: create, update status, note, timeline, delete', async () => {
  const created = await request(app)
    .post('/api/leads')
    .set(auth(tokenA))
    .send({ name: 'Jo Bloggs', email: 'jo@x.test', source: 'referral', value_gbp: 500 });
  assert.equal(created.status, 201);
  const id = created.body.lead.id;
  assert.equal(created.body.lead.status, 'new');

  const updated = await request(app)
    .patch(`/api/leads/${id}`)
    .set(auth(tokenA))
    .send({ status: 'contacted' });
  assert.equal(updated.body.lead.status, 'contacted');

  const bad = await request(app)
    .patch(`/api/leads/${id}`)
    .set(auth(tokenA))
    .send({ status: 'imaginary' });
  assert.equal(bad.status, 400);

  await request(app).post(`/api/leads/${id}/notes`).set(auth(tokenA)).send({ text: 'Called, LM' });

  const detail = await request(app).get(`/api/leads/${id}`).set(auth(tokenA));
  const types = detail.body.activities.map((a) => a.type).sort();
  assert.deepEqual(types, ['created', 'note', 'status_change']);

  const del = await request(app).delete(`/api/leads/${id}`).set(auth(tokenA));
  assert.equal(del.status, 200);
  assert.equal((await request(app).get(`/api/leads/${id}`).set(auth(tokenA))).status, 404);
});

test('lead list filters by status and source', async () => {
  await request(app).post('/api/leads').set(auth(tokenA)).send({ name: 'L1', source: 'referral' });
  await request(app).post('/api/leads').set(auth(tokenA)).send({ name: 'L2', source: 'manual', status: 'sold' });

  const byStatus = await request(app).get('/api/leads?status=sold').set(auth(tokenA));
  assert.equal(byStatus.body.leads.length, 1);
  assert.equal(byStatus.body.leads[0].name, 'L2');

  const bySource = await request(app).get('/api/leads?source=referral').set(auth(tokenA));
  assert.equal(bySource.body.leads.length, 1);
  assert.equal(bySource.body.leads[0].name, 'L1');
});

// ---------- Webhook ingestion + UTM attribution ----------

test('webhook creates a lead with UTM auto-attribution', async () => {
  const res = await request(app).post(`/api/ingest/${clientA.api_key}`).send({
    name: 'Web Lead',
    email: 'web@x.test',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'summer',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.source, 'google_ads');

  const list = await request(app).get('/api/leads').set(auth(tokenA));
  assert.equal(list.body.leads[0].utm_campaign, 'summer');
});

test('webhook accepts form-encoded submissions and rejects unknown keys', async () => {
  const ok = await request(app)
    .post(`/api/ingest/${clientA.api_key}`)
    .type('form')
    .send('name=Form Lead&email=f@x.test&utm_source=facebook&utm_medium=paid');
  assert.equal(ok.status, 201);
  assert.equal(ok.body.source, 'meta_ads');

  const bad = await request(app).post('/api/ingest/not-a-real-key').send({ name: 'X' });
  assert.equal(bad.status, 404);

  const empty = await request(app).post(`/api/ingest/${clientA.api_key}`).send({});
  assert.equal(empty.status, 400);
});

test('attributeSource maps UTMs to sources', () => {
  assert.equal(attributeSource({ utm_source: 'google', utm_medium: 'cpc' }), 'google_ads');
  assert.equal(attributeSource({ utm_source: 'google', utm_medium: 'organic' }), 'organic');
  assert.equal(attributeSource({ utm_source: 'instagram', utm_medium: 'paid' }), 'meta_ads');
  assert.equal(attributeSource({ utm_source: 'newsletter', utm_medium: 'email' }), 'other');
  assert.equal(attributeSource({}), 'website_form');
});

// ---------- Attribution report ----------

test('attribution report counts, conversion rate, and date filter', async () => {
  const mk = (body) => request(app).post('/api/leads').set(auth(tokenA)).send(body);
  await mk({ name: 'G1', source: 'google_ads', status: 'sold', value_gbp: 1000 });
  await mk({ name: 'G2', source: 'google_ads', status: 'lost' });
  await mk({ name: 'R1', source: 'referral', status: 'sold', value_gbp: 250 });
  // Lead for client B must not leak into A's report.
  await request(app).post('/api/leads').set(auth(tokenB)).send({ name: 'B1', source: 'google_ads', status: 'sold' });

  const res = await request(app).get('/api/reports/attribution').set(auth(tokenA));
  assert.equal(res.status, 200);
  const google = res.body.report.find((r) => r.source === 'google_ads');
  assert.equal(google.lead_count, 2);
  assert.equal(google.sold_count, 1);
  assert.equal(google.conversion_rate, 0.5);
  assert.equal(google.sold_value_gbp, 1000);
  assert.equal(res.body.totals.lead_count, 3);
  assert.equal(res.body.totals.sold_value_gbp, 1250);

  // Date range excluding everything → empty report.
  const past = await request(app)
    .get('/api/reports/attribution?from=2000-01-01&to=2000-01-02')
    .set(auth(tokenA));
  assert.equal(past.body.totals.lead_count, 0);
});

// ---------- Admin client management ----------

test('admin can create a client and its login; webhook URL exposed', async () => {
  const created = await request(app)
    .post('/api/clients')
    .set(auth(adminToken))
    .send({ company_name: 'New Co' });
  assert.equal(created.status, 201);
  assert.match(created.body.client.webhook_url, /\/api\/ingest\/[0-9a-f]+$/);

  const user = await request(app)
    .post(`/api/clients/${created.body.client.id}/users`)
    .set(auth(adminToken))
    .send({ email: 'new@co.test', password: 'longenough1' });
  assert.equal(user.status, 201);

  const token = await login(app, request, 'new@co.test', 'longenough1');
  const me = await request(app).get('/api/auth/me').set(auth(token));
  assert.equal(me.body.user.company_name, 'New Co');
});
