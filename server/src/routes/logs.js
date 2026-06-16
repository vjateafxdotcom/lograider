const express = require('express');
const { v4: uuidv4 } = require('../utils/uuid');
const { teamAdminMiddleware } = require('../middleware/auth');

module.exports = (db) => {
  const router = express.Router();

  // GET /api/logs
  router.get('/', async (req, res) => {
    try {
      const { teamId, level, source, search, startDate, endDate, page = 1, limit = 100 } = req.query;
      const offset = (page - 1) * limit;

      let query = `SELECT le.*, u.username as author
                   FROM log_entries le
                   JOIN users u ON le.created_by = u.id`;
      const conditions = [];
      const params = [];

      if (teamId) {
        conditions.push(`le.team_id = $${conditions.length + 1}`);
        params.push(teamId);
      }

      if (level) {
        conditions.push(`le.level = $${conditions.length + 1}`);
        params.push(level);
      }

      if (source) {
        conditions.push(`le.source = $${conditions.length + 1}`);
        params.push(source);
      }

      if (search) {
        conditions.push(`(le.message ILIKE $${conditions.length + 1} OR le.source ILIKE $${conditions.length + 1})`);
        params.push(`%${search}%`);
      }

      if (startDate) {
        conditions.push(`le.timestamp >= $${conditions.length + 1}`);
        params.push(startDate);
      }

      if (endDate) {
        conditions.push(`le.timestamp <= $${conditions.length + 1}`);
        params.push(endDate);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY le.timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(parseInt(limit, 10), parseInt(offset, 10));

      const result = await db.query(query, params);

      res.json({ logs: result.rows });
    } catch (err) {
      console.error('Get logs error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/logs - TeamAdmin only
  router.post('/', teamAdminMiddleware, async (req, res) => {
    try {
      const { teamId, level = 'info', source = 'manual', message, metadata, timestamp } = req.body;

      if (!teamId || !message) {
        return res.status(400).json({ error: 'Team ID and message are required' });
      }

      const access = await req.checkTeamAccess(db);
      if (!access) {
        return res.status(403).json({ error: 'Not a team admin' });
      }

      const id = uuidv4();
      const ts = timestamp || new Date().toISOString();

      const result = await db.query(
        `INSERT INTO log_entries (id, team_id, created_by, level, source, message, metadata, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [id, teamId, req.user.id, level, source, message, JSON.stringify(metadata || {}), ts]
      );

      res.status(201).json({ message: 'Log entry created', log: result.rows[0] });
    } catch (err) {
      console.error('Create log error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/logs/:id - TeamAdmin only
  router.put('/:id', teamAdminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { level, source, message, metadata } = req.body;

      const result = await db.query(
        `UPDATE log_entries
         SET level = COALESCE($1, level),
             source = COALESCE($2, source),
             message = COALESCE($3, message),
             metadata = COALESCE($4, metadata),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [level, source, message, JSON.stringify(metadata), id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Log entry not found' });
      }

      res.json({ message: 'Log entry updated', log: result.rows[0] });
    } catch (err) {
      console.error('Update log error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/logs/:id - TeamAdmin only
  router.delete('/:id', teamAdminMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.query(
        'DELETE FROM log_entries WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Log entry not found' });
      }

      res.json({ message: 'Log entry deleted', log: result.rows[0] });
    } catch (err) {
      console.error('Delete log error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
