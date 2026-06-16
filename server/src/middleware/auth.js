const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function teamAdminMiddleware(req, res, next) {
  if (req.user.role === 'admin') return next();

  const teamId = req.params.teamId || req.body.teamId;
  if (!teamId) {
    return res.status(400).json({ error: 'Team ID required' });
  }

  // Check if user is TeamAdmin on this team
  const query = `
    SELECT role FROM team_memberships
    WHERE team_id = $1 AND user_id = $2 AND status = 'active'
  `;

  // This will be implemented with actual DB call
  req.checkTeamAccess = async (db) => {
    const result = await db.query(query, [teamId, req.user.id]);
    if (result.rows.length > 0) {
      return result.rows[0].role;
    }
    return null;
  };

  next();
}

module.exports = { generateToken, verifyToken, authMiddleware, adminMiddleware, teamAdminMiddleware };
