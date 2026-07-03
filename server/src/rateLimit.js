import { query } from './db.js';
import { config } from './config.js';

const DAY_WINDOW = '24 hours';
const COOLDOWN_WINDOW = '10 minutes';

/**
 * Postgres-backed IP rate limiter for the public landing-page-audit
 * endpoints (POST /api/audit, POST /api/leads/audit). Both endpoints call
 * paid external APIs (Claude, Brevo, Google Sheets) and take no auth, so
 * they share one limiter/table keyed on IP:
 *   - max config.auditDayLimit audits per IP per rolling 24h (default 5)
 *   - max config.auditCooldownLimit audits per IP per rolling 10 min (default 1,
 *     i.e. a 10-min cooldown). Override via AUDIT_DAY_LIMIT / AUDIT_COOLDOWN_LIMIT
 *     env vars for temporary testing — no code change needed.
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
    if (dayRows[0].count >= config.auditDayLimit) {
      return res.status(429).json({
        error: 'Too many requests',
        detail: `Limit is ${config.auditDayLimit} audits per IP per day. Try again later.`,
      });
    }

    const { rows: cooldownRows } = await query(
      `SELECT count(*)::int AS count FROM audit_rate_limits
       WHERE ip = $1 AND created_at >= now() - interval '${COOLDOWN_WINDOW}'`,
      [ip]
    );
    if (cooldownRows[0].count >= config.auditCooldownLimit) {
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
