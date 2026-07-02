import { Router } from 'express';
import { query } from '../db.js';
import { attributeSource, SOURCES } from '../attribution.js';

export const ingestRouter = Router();

/**
 * Public webhook for client website forms. Clients point their form's action
 * (or a small fetch snippet) at:  POST /api/ingest/<api_key>
 * Accepts JSON or application/x-www-form-urlencoded. UTM params are captured
 * for auto-attribution; an explicit `source` field overrides it.
 */
ingestRouter.post('/:apiKey', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM clients WHERE api_key = $1', [req.params.apiKey]);
    const client = rows[0];
    if (!client) return res.status(404).json({ error: 'Unknown API key' });

    const b = req.body || {};
    const name = (b.name || [b.first_name, b.last_name].filter(Boolean).join(' ')).trim?.() || '';
    if (!name && !b.email && !b.phone) {
      return res.status(400).json({ error: 'Provide at least one of: name, email, phone' });
    }

    const utm = {
      utm_source: b.utm_source || null,
      utm_medium: b.utm_medium || null,
      utm_campaign: b.utm_campaign || null,
      utm_term: b.utm_term || null,
      utm_content: b.utm_content || null,
    };
    const source = SOURCES.includes(b.source) ? b.source : attributeSource(utm);

    const inserted = await query(
      `INSERT INTO leads (client_id, name, email, phone, notes, source,
                          utm_source, utm_medium, utm_campaign, utm_term, utm_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, source, status`,
      [
        client.id,
        name || b.email || b.phone,
        b.email || null,
        b.phone || null,
        b.message || b.notes || null,
        source,
        utm.utm_source,
        utm.utm_medium,
        utm.utm_campaign,
        utm.utm_term,
        utm.utm_content,
      ]
    );
    const lead = inserted.rows[0];
    await query(
      `INSERT INTO activities (lead_id, type, detail) VALUES ($1, 'created', $2)`,
      [lead.id, `Lead captured via web form (source: ${lead.source})`]
    );
    res.status(201).json({ ok: true, lead_id: lead.id, source: lead.source });
  } catch (err) {
    next(err);
  }
});
