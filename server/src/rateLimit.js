import { query } from './db.js';

const DAY_LIMIT = 5;
const DAY_WINDOW = '24 hours';
const COOLDOWN_LIMIT = 1;
const COOLDOWN_WINDOW = '10 minutes';

/**
 * Postgres-backed IP rate limiter for the public landing-page-audit
 * endpoints (POST /api/audit, POST /api/leads/audit). Both endpoints call
 * paid external APIs (Claude, Brevo, Google Sheets) and take no auth, so
 * they share one limiter/table keyed on IP:
 *   - max 5 audits per IP per rolling 24h
 *   - max 1 audit per IP per rolling 10 min (i.e. a 10-min cooldown)
 *
 * Backed by Postgres (not an in-memory store) so the limit survives
 * restarts/redeploys and works correctly if Render ever scales to more
 * than one instance. Requires `app.set('trust proxy', ...)` in app.js so
 * `req.ip` reflects the real client IP behind Render's proxy, not it.
 */
export async function auditRateLimiter(req, res, next) {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    const { rows: dayRows } = await query(
      `SELECT count(*)::int AS count FROM audit_rate_limits
       WHERE ip = $1 AND created_at >= now() - interval '${DAY_WINDOW}'`,
      [ip]
    );
    if (dayRows[0].count >= DAY_LIMIT) {
      return res.status(429).json({
        error: 'Too many requests',
        detail: `Limit is ${DAY_LIMIT} audits per IP per day. Try again later.`,
      });
    }

    const { rows: cooldownRows } = await query(
      `SELECT count(*)::int AS count FROM audit_rate_limits
       WHERE ip = $1 AND created_at >= now() - interval '${COOLDOWN_WINDOW}'`,
      [ip]
    );
    if (cooldownRows[0].count >= COOLDOWN_LIMIT) {
      return res.status(429).json({
        error: 'Too many requests',
        detail: 'Please wait 10 minutes between audits.',
      });
    }

    await query('INSERT INTO audit_rate_limits (ip, path) VALUES ($1, $2)', [ip, req.baseUrl]);
    next();
  } catch (err) {
    next(err);
  }
}
