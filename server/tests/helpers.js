import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { pool, query } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';

export { pool };

export async function resetDb() {
  await migrate();
  await query('TRUNCATE activities, leads, users, clients RESTART IDENTITY CASCADE');
}

export function makeApp() {
  return createApp();
}

export async function createClient(companyName = 'Test Co') {
  const { rows } = await query(
    'INSERT INTO clients (company_name, api_key) VALUES ($1, $2) RETURNING *',
    [companyName, randomBytes(16).toString('hex')]
  );
  return rows[0];
}

export async function createUser({ email, password = 'password123', role = 'client', clientId = null }) {
  const hash = await bcrypt.hash(password, 4);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role, client_id)
     VALUES ($1, $2, '', $3, $4) RETURNING *`,
    [email, hash, role, clientId]
  );
  return { ...rows[0], password };
}

export async function login(app, request, email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.text}`);
  return res.body.token;
}
