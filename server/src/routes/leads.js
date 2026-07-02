import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, scopeClientId } from '../auth.js';
import { STATUSES, SOURCES } from '../attribution.js';

export const leadsRouter = Router();

leadsRouter.use(requireAuth);

/** Load a lead only if the requester's tenancy scope allows it. */
async function findScopedLead(req, id) {
  const { rows } = await query('SELECT * FROM leads WHERE id = $1', [id]);
  const lead = rows[0];
  if (!lead) return null;
  if (req.user.role === 'client' && lead.client_id !== req.user.client_id) return null;
  return lead;
}

const logActivity = (leadId, userId, type, detail) =>
  query('INSERT INTO activities (lead_id, user_id, type, detail) VALUES ($1, $2, $3, $4)', [
    leadId,
    userId,
    type,
    detail,
  ]);

leadsRouter.get('/', async (req, res, next) => {
  try {
    const clientId = scopeClientId(req);
    const { status, source, q, from, to } = req.query;
    const where = [];
    const params = [];
    const add = (clause, value) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };
    if (clientId) add('l.client_id = ?', clientId);
    if (status && STATUSES.includes(status)) add('l.status = ?', status);
    if (source) add('l.source = ?', source);
    if (from) add('l.created_at >= ?', from);
    if (to) add('l.created_at < ?::date + 1', to);
    if (q) {
      params.push(`%${q}%`);
      where.push(`(l.name ILIKE $${params.length} OR l.email ILIKE $${params.length})`);
    }

    const sql = `
      SELECT l.*, c.company_name
      FROM leads l JOIN clients c ON c.id = l.client_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY l.created_at DESC
      LIMIT 500`;
    const { rows } = await query(sql, params);
    res.json({ leads: rows });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/', async (req, res, next) => {
  try {
    const { name, email, phone, notes, source, status, value_gbp } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const clientId =
      req.user.role === 'client' ? req.user.client_id : parseInt(req.body?.client_id, 10);
    if (!clientId) return res.status(400).json({ error: 'client_id is required for admin' });

    const leadSource = SOURCES.includes(source) ? source : 'manual';
    const leadStatus = STATUSES.includes(status) ? status : 'new';
    const { rows } = await query(
      `INSERT INTO leads (client_id, name, email, phone, notes, source, status, value_gbp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [clientId, name.trim(), email || null, phone || null, notes || null, leadSource, leadStatus, value_gbp || null]
    );
    await logActivity(rows[0].id, req.user.id, 'created', `Lead created (source: ${leadSource})`);
    res.status(201).json({ lead: rows[0] });
  } catch (err) {
    next(err);
  }
});

leadsRouter.get('/:id', async (req, res, next) => {
  try {
    const lead = await findScopedLead(req, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { rows: activities } = await query(
      `SELECT a.*, u.name AS user_name, u.email AS user_email
       FROM activities a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.lead_id = $1 ORDER BY a.created_at DESC`,
      [lead.id]
    );
    res.json({ lead, activities });
  } catch (err) {
    next(err);
  }
});

leadsRouter.patch('/:id', async (req, res, next) => {
  try {
    const lead = await findScopedLead(req, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const allowed = ['name', 'email', 'phone', 'notes', 'source', 'status', 'value_gbp'];
    const updates = {};
    for (const key of allowed) {
      if (key in (req.body || {})) updates[key] = req.body[key];
    }
    if ('status' in updates && !STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    if ('source' in updates && !SOURCES.includes(updates.source)) {
      return res.status(400).json({ error: `source must be one of: ${SOURCES.join(', ')}` });
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
    const { rows } = await query(
      `UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      [lead.id, ...Object.values(updates)]
    );

    if ('status' in updates && updates.status !== lead.status) {
      await logActivity(
        lead.id,
        req.user.id,
        'status_change',
        `Status changed: ${lead.status} → ${updates.status}`
      );
    }
    const otherFields = Object.keys(updates).filter((k) => k !== 'status');
    if (otherFields.length) {
      await logActivity(lead.id, req.user.id, 'updated', `Updated ${otherFields.join(', ')}`);
    }
    res.json({ lead: rows[0] });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/:id/notes', async (req, res, next) => {
  try {
    const lead = await findScopedLead(req, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { text } = req.body || {};
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    await logActivity(lead.id, req.user.id, 'note', text.trim());
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

leadsRouter.delete('/:id', async (req, res, next) => {
  try {
    const lead = await findScopedLead(req, req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await query('DELETE FROM leads WHERE id = $1', [lead.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
