const jwt = require('jsonwebtoken');
const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

if (JWT_SECRET === "your-secret-key-change-in-production" && process.env.NODE_ENV === 'production') {
  console.error('CRITICAL SECURITY ERROR: Using default JWT secret in production! Set JWT_SECRET environment variable.');
  throw new Error('JWT_SECRET must be configured in production');
}

const ROLE_HIERARCHY = {
  'System Administrator': 5,
  'Project Manager': 4,
  'Team Lead': 3,
  'Team Member': 2,
  'Stakeholder': 1,
  'External Viewer': 0
};

function authenticateToken(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'System Administrator') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredRoleLevel = ROLE_HIERARCHY[minimumRole] || 0;
    
    if (userRoleLevel < requiredRoleLevel) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: minimumRole,
        current: req.user.role 
      });
    }
    
    next();
  };
}

async function checkProjectAccess(req, res, next) {
  const projectId = req.params.projectId;
  const userId = req.user.userId || req.user.id;
  const userRole = req.user.role;

  if (userRole === 'System Administrator') {
    return next();
  }

  try {
    const result = await pool.query(`
      SELECT * FROM project_members 
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [userId, projectId]);
    
    if (result.rows.length > 0) {
      return next();
    }

    return res.status(403).json({ error: 'Access denied to this project' });
  } catch (error) {
    console.error('Error checking project access:', error);
    return res.status(500).json({ error: 'Error checking project access' });
  }
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireRole,
  checkProjectAccess,
  ROLE_HIERARCHY
};
