const express = require('express');
const bcrypt = require('bcrypt');
const { generateToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('../utils/uuid');

module.exports = (db) => {
  const router = express.Router();

  // POST /api/auth/register
  router.post('/register', async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      // Check if username or email already exists
      const existing = await db.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existing.rows.length > 0) {
        const user = existing.rows[0];
        const checkUsername = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        const checkEmail = await db.query('SELECT id FROM users WHERE email = $2', [email]);

        if (checkUsername.rows.length > 0) {
          return res.status(409).json({ error: 'Username already taken' });
        }
        if (checkEmail.rows.length > 0) {
          return res.status(409).json({ error: 'Email already registered' });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const id = uuidv4();

      await db.query(
        `INSERT INTO users (id, username, email, password_hash, status, role)
         VALUES ($1, $2, $3, $4, 'pending', 'user')`,
        [id, username, email, passwordHash]
      );

      res.status(201).json({ message: 'Registration successful. Awaiting admin activation.' });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const result = await db.query(
        'SELECT * FROM users WHERE username = $1 AND status = \'activated\'',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials or account not activated' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = generateToken({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
      });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/auth/status
  router.get('/status', async (req, res) => {
    try {
      const { username } = req.query;

      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }

      const result = await db.query(
        'SELECT id, username, email, status, role, activated_at FROM users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result.rows[0];
      res.json({
        authenticated: user.status === 'activated',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          status: user.status,
          role: user.role,
        },
      });
    } catch (err) {
      console.error('Status check error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/auth/verify
  router.get('/verify', async (req, res) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { verifyToken } = require('../middleware/auth');
      const decoded = verifyToken(token);

      if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const result = await db.query(
        'SELECT id, username, email, status, role FROM users WHERE id = $1 AND status = \'activated\'',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'User not found or not activated' });
      }

      // Get user's teams
      const teams = await db.query(
        `SELECT t.*, tm.role as team_role
         FROM team_memberships tm
         JOIN teams t ON tm.team_id = t.id
         WHERE tm.user_id = $1 AND tm.status = 'active'`,
        [decoded.id]
      );

      res.json({
        authenticated: true,
        user: result.rows[0],
        teams: teams.rows,
      });
    } catch (err) {
      console.error('Verify error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
