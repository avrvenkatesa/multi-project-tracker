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
  let token = req.cookies.token;
  console.log('[AUTH] Cookie token:', token ? 'present' : 'missing');

  if (!token) {
    const authHeader = req.headers['authorization'];
    console.log('[AUTH] Authorization header:', authHeader);
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('[AUTH] Extracted Bearer token:', token ? token.substring(0, 20) + '...' : 'none');
    }
  }

  if (!token) {
    console.log('[AUTH] No token found, rejecting request');
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('[AUTH] Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    console.log('[AUTH] Token verified successfully for user:', user.email);
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

async function requireAuthority(minLevel) {
  return async (req, res, next) => {
    if (req.user.role === 'System Administrator') {
      return next();
    }

    const projectId = req.params.projectId || req.params.resolvedProjectId;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required for authority check' });
    }

    try {
      const result = await pool.query(`
        SELECT r.authority_level
        FROM user_role_assignments ur
        JOIN custom_roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1 AND ur.project_id = $2
        ORDER BY r.authority_level DESC
        LIMIT 1
      `, [req.user.userId || req.user.id, projectId]);

      if (result.rows.length === 0 || result.rows[0].authority_level < minLevel) {
        return res.status(403).json({ 
          error: `Requires authority level ${minLevel} or higher`,
          current: result.rows.length > 0 ? result.rows[0].authority_level : 0
        });
      }

      next();
    } catch (error) {
      console.error('Error checking authority:', error);
      return res.status(500).json({ error: 'Error checking authority' });
    }
  };
}

async function checkResourceProjectAccess(resourceQuery) {
  return async (req, res, next) => {
    if (req.user.role === 'System Administrator') {
      return next();
    }

    try {
      const result = await pool.query(resourceQuery.sql, resourceQuery.params(req));
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: resourceQuery.notFoundMessage || 'Resource not found' });
      }

      const projectId = result.rows[0].project_id;
      const userId = req.user.userId || req.user.id;

      const access = await pool.query(`
        SELECT * FROM project_members 
        WHERE user_id = $1 AND project_id = $2 AND status = 'active'
      `, [userId, projectId]);

      if (access.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }

      req.params.resolvedProjectId = projectId;
      next();
    } catch (error) {
      console.error('Error checking resource project access:', error);
      return res.status(500).json({ error: 'Error checking access' });
    }
  };
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireRole,
  checkProjectAccess,
  requireAuthority,
  checkResourceProjectAccess,
  ROLE_HIERARCHY
};
