import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, requireAuth } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const { rows } = await query(
      `SELECT u.*, c.company_name FROM users u
       LEFT JOIN clients c ON c.id = u.client_id
       WHERE lower(u.email) = lower($1)`,
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        client_id: user.client_id,
        company_name: user.company_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    let company_name = null;
    if (req.user.client_id) {
      const { rows } = await query('SELECT company_name FROM clients WHERE id = $1', [
        req.user.client_id,
      ]);
      company_name = rows[0]?.company_name || null;
    }
    res.json({ user: { ...req.user, company_name } });
  } catch (err) {
    next(err);
  }
});
