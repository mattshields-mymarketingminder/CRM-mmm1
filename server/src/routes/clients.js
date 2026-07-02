import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { config } from '../config.js';

export const clientsRouter = Router();

clientsRouter.use(requireAuth, requireAdmin);

const withWebhookUrl = (client) => ({
  ...client,
  webhook_url: `${config.publicUrl}/api/ingest/${client.api_key}`,
});

clientsRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.*,
              count(l.id)::int AS lead_count,
              count(l.id) FILTER (WHERE l.status = 'sold')::int AS sold_count
       FROM clients c
       LEFT JOIN leads l ON l.client_id = c.id
       GROUP BY c.id
       ORDER BY c.company_name`
    );
    res.json({ clients: rows.map(withWebhookUrl) });
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/', async (req, res, next) => {
  try {
    const { company_name, logo_url } = req.body || {};
    if (!company_name?.trim()) {
      return res.status(400).json({ error: 'company_name is required' });
    }
    const apiKey = randomBytes(24).toString('hex');
    const { rows } = await query(
      'INSERT INTO clients (company_name, api_key, logo_url) VALUES ($1, $2, $3) RETURNING *',
      [company_name.trim(), apiKey, logo_url || null]
    );
    res.status(201).json({ client: withWebhookUrl(rows[0]) });
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/users', async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const client = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (!client.rows[0]) return res.status(404).json({ error: 'Client not found' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name, role, client_id)
       VALUES ($1, $2, $3, 'client', $4)
       RETURNING id, email, name, role, client_id`,
      [email.toLowerCase().trim(), hash, name || '', clientId]
    );
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    next(err);
  }
});
