import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, client_id: user.client_id },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(
      'SELECT id, email, name, role, client_id FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows[0]) return res.status(401).json({ error: 'User no longer exists' });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Tenancy scope for the request. Client users are always locked to their own
 * client. Admins may target a specific client via ?client_id=, or all clients
 * (returns null = unscoped).
 */
export function scopeClientId(req) {
  if (req.user.role === 'client') return req.user.client_id;
  const q = req.query.client_id || req.body?.client_id;
  return q ? parseInt(q, 10) : null;
}
