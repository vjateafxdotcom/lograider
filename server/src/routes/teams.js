const express = require('express');
const { v4: uuidv4 } = require('../utils/uuid');
const { teamAdminMiddleware } = require('../middleware/auth');

module.exports = (db) => {
  const router = express.Router();

  // POST /api/teams
  router.post('/', async (req, res) => {
    try {
      const { teamId, name } = req.body;

      if (!teamId || !name) {
        return res.status(400).json({ error: 'Team ID and name are required' });
      }

      // Check if teamId already exists
      const existing = await db.query('SELECT id FROM teams WHERE team_id = $1', [teamId]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Team ID already taken' });
      }

      const id = uuidv4();

      await db.query(
        `INSERT INTO teams (id, team_id, name, owner_id)
         VALUES ($1, $2, $3, $4)`,
        [id, teamId, name, req.user.id]
      );

      // Add owner as TeamAdmin
      await db.query(
        `INSERT INTO team_memberships (team_id, user_id, role, status, invited_by)
         VALUES ($1, $2, 'TeamAdmin', 'active', $2)`,
        [id, req.user.id]
      );

      res.status(201).json({ message: 'Team created successfully', teamId });
    } catch (err) {
      console.error('Create team error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/teams/:id/members
  router.get('/:id/members', teamAdminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const access = await req.checkTeamAccess(db);
      if (!access) {
        return res.status(403).json({ error: 'Not a team member' });
      }

      const result = await db.query(
        `SELECT u.id, u.username, u.email, tm.role, tm.status, tm.invited_at, tm.joined_at
         FROM team_memberships tm
         JOIN users u ON tm.user_id = u.id
         WHERE tm.team_id = $1
         ORDER BY tm.invited_at DESC`,
        [id]
      );

      res.json({ members: result.rows });
    } catch (err) {
      console.error('Get members error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/teams/:id/invite
  router.post('/:id/invite', teamAdminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { email, role = 'TeamUser' } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      if (!['TeamAdmin', 'TeamUser'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const access = await req.checkTeamAccess(db);
      if (!access) {
        return res.status(403).json({ error: 'Not a team admin' });
      }

      const token = uuidv4().replace(/-/g, '').substring(0, 32);
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await db.query(
        `INSERT INTO invite_tokens (team_id, email, role, token, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, email, role, token, req.user.id, expiresAt]
      );

      res.json({
        message: 'Invite sent',
        token,
        expiresAt: expiresAt.toISOString(),
        inviteUrl: `${process.env.FRONTEND_URL || ''}/join/${token}`,
      });
    } catch (err) {
      console.error('Invite error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/teams/:teamId/members/:userId/role
  router.patch('/:teamId/members/:userId/role', teamAdminMiddleware, async (req, res) => {
    try {
      const { teamId, userId } = req.params;
      const { role } = req.body;

      if (!['TeamAdmin', 'TeamUser'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const access = await req.checkTeamAccess(db);
      if (!access) {
        return res.status(403).json({ error: 'Not a team admin' });
      }

      const result = await db.query(
        `UPDATE team_memberships
         SET role = $1, updated_at = NOW()
         WHERE team_id = $2 AND user_id = $3
         RETURNING team_id, user_id, role`,
        [role, teamId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Membership not found' });
      }

      res.json({ message: 'Role updated', member: result.rows[0] });
    } catch (err) {
      console.error('Update role error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
