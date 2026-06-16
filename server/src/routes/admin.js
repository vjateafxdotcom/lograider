const express = require('express');
const bcrypt = require('bcrypt');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'vj';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Raid#2026#Logger#889977';

module.exports = (db) => {
  const router = express.Router();

  // POST /api/admin/login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      // Check against database admin users
      const result = await db.query(
        'SELECT * FROM users WHERE username = $1 AND role = \'admin\' AND status = \'activated\'',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }

      const admin = result.rows[0];
      const validPassword = await bcrypt.compare(password, admin.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }

      // Generate JWT
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: process.env.JWT_EXPIRY || '7d' }
      );

      res.json({
        token,
        user: { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
      });
    } catch (err) {
      console.error('Admin login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/admin/users
  router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { status, search, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT id, username, email, status, role, activated_at, created_at FROM users';
      const conditions = [];
      const params = [];

      if (status) {
        conditions.push(`status = $${conditions.length + 1}`);
        params.push(status);
      }

      if (search) {
        conditions.push(`(username ILIKE $${conditions.length + 1} OR email ILIKE $${conditions.length + 1})`);
        params.push(`%${search}%`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit, 10), parseInt(offset, 10));

      const result = await db.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM users';
      if (conditions.length > 0) {
        countQuery += ' WHERE ' + conditions.join(' AND ');
      }
      const countResult = await db.query(countQuery, params.slice(0, -2));

      res.json({
        users: result.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });
    } catch (err) {
      console.error('Get users error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/admin/users/:id/activate
  router.post('/users/:id/activate', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.query(
        `UPDATE users
         SET status = 'activated', activated_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING id, username, email, status, activated_at`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pending user not found' });
      }

      // Audit log
      await db.query(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
         VALUES ($1, 'activate_user', 'user', $2, '{}')`,
        [req.user.id, id]
      );

      res.json({ message: 'User activated successfully', user: result.rows[0] });
    } catch (err) {
      console.error('Activate user error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/admin/users/:id/disable
  router.post('/users/:id/disable', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.query(
        `UPDATE users
         SET status = 'disabled', updated_at = NOW()
         WHERE id = $1 AND status != 'disabled'
         RETURNING id, username, email, status`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Active user not found' });
      }

      // Audit log
      await db.query(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
         VALUES ($1, 'disable_user', 'user', $2, '{}')`,
        [req.user.id, id]
      );

      res.json({ message: 'User disabled successfully', user: result.rows[0] });
    } catch (err) {
      console.error('Disable user error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/admin/teams
  router.get('/teams', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await db.query(
        `SELECT t.*,
                (SELECT COUNT(*) FROM team_memberships WHERE team_id = t.id AND status = 'active') as member_count,
                (SELECT COUNT(*) FROM log_entries WHERE team_id = t.id) as log_count
         FROM teams t
         ORDER BY t.created_at DESC`
      );

      res.json({ teams: result.rows });
    } catch (err) {
      console.error('Get teams error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/admin/teams/:id
  router.get('/teams/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const team = await db.query('SELECT * FROM teams WHERE id = $1', [id]);
      if (team.rows.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }

      const members = await db.query(
        `SELECT u.id, u.username, u.email, tm.role, tm.status, tm.invited_at, tm.joined_at
         FROM team_memberships tm
         JOIN users u ON tm.user_id = u.id
         WHERE tm.team_id = $1
         ORDER BY tm.invited_at DESC`,
        [id]
      );

      const logs = await db.query(
        `SELECT * FROM log_entries WHERE team_id = $1 ORDER BY timestamp DESC LIMIT 50`,
        [id]
      );

      res.json({
        team: team.rows[0],
        members: members.rows,
        logs: logs.rows,
      });
    } catch (err) {
      console.error('Get team detail error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/admin/verify - verify admin token
  router.get('/verify', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      res.json({ authenticated: true, user: req.user });
    } catch (err) {
      console.error('Verify error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
