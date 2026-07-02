import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, scopeClientId } from '../auth.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

/**
 * Attribution report: leads by source with conversion rate to Sold,
 * optionally filtered by date range (?from=YYYY-MM-DD&to=YYYY-MM-DD).
 */
reportsRouter.get('/attribution', async (req, res, next) => {
  try {
    const clientId = scopeClientId(req);
    const { from, to } = req.query;
    const where = [];
    const params = [];
    if (clientId) {
      params.push(clientId);
      where.push(`client_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      where.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      where.push(`created_at < $${params.length}::date + 1`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT source,
              count(*)::int AS lead_count,
              count(*) FILTER (WHERE status = 'sold')::int AS sold_count,
              coalesce(sum(value_gbp) FILTER (WHERE status = 'sold'), 0)::float AS sold_value_gbp
       FROM leads ${whereSql}
       GROUP BY source
       ORDER BY lead_count DESC`,
      params
    );

    const report = rows.map((r) => ({
      ...r,
      conversion_rate: r.lead_count ? +(r.sold_count / r.lead_count).toFixed(4) : 0,
    }));
    const totals = {
      lead_count: report.reduce((s, r) => s + r.lead_count, 0),
      sold_count: report.reduce((s, r) => s + r.sold_count, 0),
      sold_value_gbp: +report.reduce((s, r) => s + r.sold_value_gbp, 0).toFixed(2),
    };
    totals.conversion_rate = totals.lead_count
      ? +(totals.sold_count / totals.lead_count).toFixed(4)
      : 0;

    res.json({ report, totals });
  } catch (err) {
    next(err);
  }
});
