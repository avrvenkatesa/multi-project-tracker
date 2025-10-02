const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { neon, Pool, neonConfig } = require("@neondatabase/serverless");
const ws = require("ws");
const multer = require('multer');
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');

// Configure WebSocket for Node.js < v22
neonConfig.webSocketConstructor = ws;

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRY = "7d";

if (JWT_SECRET === "your-secret-key-change-in-production") {
  console.warn("⚠️  WARNING: Using default JWT secret. Set JWT_SECRET environment variable in production!");
}

// Database connection
const sql = neon(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Initialize OpenAI with GPT-3.5-Turbo (cost-effective)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .txt files allowed'));
    }
  }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.tailwindcss.com"],
        connectSrc: ["'self'", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
);

const allowedOrigins = new Set([
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Trust proxy (required for Replit environment)
app.set('trust proxy', true);

// Rate limiting (configured for proxied environment)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // Skip validation warnings in proxied environment
  validate: {trustProxy: false}
});
app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const cookieParser = require("cookie-parser");
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
  'System Administrator': 5,
  'Project Manager': 4,
  'Team Lead': 3,
  'Team Member': 2,
  'Stakeholder': 1,
  'External Viewer': 0
};

// JWT Authentication Middleware
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

// Role-based access control middleware
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

// ============= AI ANALYSIS PERMISSION FUNCTIONS =============

/**
 * Check if user can upload transcripts to a project
 */
async function canUploadTranscript(userId, projectId) {
  const result = await pool.query(`
    SELECT 
      u.role,
      pm.role as project_role
    FROM users u
    LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $2
    WHERE u.id = $1
  `, [userId, projectId]);
  
  if (result.rows.length === 0) return false;
  
  const user = result.rows[0];
  
  // System Administrators can always upload
  if (user.role === 'System Administrator') return true;
  
  // Project Admins and Managers can upload to their projects
  if (user.project_role === 'Admin' || user.project_role === 'Manager') return true;
  
  // Regular team members cannot upload
  return false;
}

/**
 * Check if user can view a transcript
 */
async function canViewTranscript(userId, transcript) {
  const result = await pool.query(`
    SELECT 
      u.role,
      pm.role as project_role
    FROM users u
    LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $2
    WHERE u.id = $1
  `, [userId, transcript.project_id]);
  
  if (result.rows.length === 0) return false;
  
  const user = result.rows[0];
  
  // System Administrators can view all transcripts
  if (user.role === 'System Administrator') return true;
  
  // Check visibility settings
  switch (transcript.visibility) {
    case 'all':
      // Anyone in the project can view
      return user.project_role !== null;
      
    case 'project_managers':
      // Only managers and admins
      return user.project_role === 'Manager' || user.project_role === 'Admin';
      
    case 'specific_users':
      // Check if user is in allowed list - ensure type compatibility
      if (!transcript.can_view_users || !Array.isArray(transcript.can_view_users)) return false;
      return transcript.can_view_users.includes(parseInt(userId));
      
    case 'uploader_only':
      // Only the uploader
      return parseInt(transcript.uploaded_by) === parseInt(userId);
      
    default:
      return false;
  }
}

/**
 * Check if user can create items from AI analysis
 * Same permissions as manual item creation (Team Member or higher)
 */
async function canCreateItemsFromAI(userId, projectId) {
  const result = await pool.query(`
    SELECT 
      u.role,
      pm.role as project_role
    FROM users u
    LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $2
    WHERE u.id = $1
  `, [userId, projectId]);
  
  if (result.rows.length === 0) return false;
  
  const user = result.rows[0];
  
  // System Administrators can always create
  if (user.role === 'System Administrator') return true;
  
  // Project members with Member role or higher can create (not Viewer)
  if (user.project_role === 'Admin' || 
      user.project_role === 'Manager' ||
      user.project_role === 'Member') {
    return true;
  }
  
  return false;
}

/**
 * Check if user can assign tasks to a specific assignee
 */
async function canAssignTo(userId, assigneeName, projectId) {
  const userResult = await pool.query(`
    SELECT u.role, u.username, pm.role as project_role
    FROM users u
    LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $2
    WHERE u.id = $1
  `, [userId, projectId]);
  
  if (userResult.rows.length === 0) {
    return { allowed: false, reason: 'User not in project' };
  }
  
  const user = userResult.rows[0];
  
  // System Administrators, Project Admins and Managers can assign to anyone
  if (user.role === 'System Administrator' || 
      user.project_role === 'Admin' || 
      user.project_role === 'Manager') {
    return { allowed: true };
  }
  
  // Team members can only assign to themselves - check if assignee name matches their username
  if (user.username && assigneeName && 
      user.username.toLowerCase() === assigneeName.toLowerCase()) {
    return { allowed: true };
  }
  
  return { 
    allowed: false, 
    reason: 'Insufficient permissions to assign to others',
    suggestedAction: 'assign_to_self',
    selfUsername: user.username
  };
}

/**
 * Check if user can update an existing item's status
 */
async function canUpdateItemStatus(userId, item) {
  const result = await pool.query(`
    SELECT 
      u.role,
      u.username,
      pm.role as project_role
    FROM users u
    LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $2
    WHERE u.id = $1
  `, [userId, item.project_id]);
  
  if (result.rows.length === 0) return false;
  
  const user = result.rows[0];
  
  // System Administrators, Project Admins and Managers can update any item
  if (user.role === 'System Administrator') return true;
  if (user.project_role === 'Admin' || user.project_role === 'Manager') return true;
  
  // Team members can update their own items
  // Check by exact username match (case-insensitive) or created_by ID
  if (item.assignee && user.username) {
    const assigneeLower = item.assignee.toLowerCase().trim();
    const usernameLower = user.username.toLowerCase().trim();
    if (assigneeLower === usernameLower) return true;
  }
  
  // Check if user created this item (normalize to int for comparison)
  if (item.created_by && parseInt(item.created_by) === parseInt(userId)) return true;
  
  return false;
}

/**
 * Audit AI analysis action
 */
async function auditAIAction(transcriptId, userId, action, details = {}) {
  try {
    await pool.query(`
      INSERT INTO ai_analysis_audit (
        transcript_id, user_id, action, item_type, item_id, details
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      transcriptId,
      userId,
      action,
      details.itemType || null,
      details.itemId || null,
      JSON.stringify(details)
    ]);
  } catch (error) {
    console.error('Audit logging failed:', error);
    // Don't fail the operation if audit fails
  }
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Multi-Project Tracker API is running",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    features: [
      "JWT Authentication",
      "Role-Based Access Control",
      "PostgreSQL Database",
      "Multi-project support",
      "Issue tracking",
      "Action item management",
    ],
  });
});

// ============= AUTHENTICATION ROUTES =============

// Register new user
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const [existingUser] = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [newUser] = await sql`
      INSERT INTO users (username, email, password, role)
      VALUES (${username}, ${email}, ${hashedPassword}, 'Team Member')
      RETURNING id, username, email, role, created_at
    `;

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [user] = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logout successful' });
});

// Get current user
app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role
  });
});

// ============= USER MANAGEMENT ROUTES (Admin Only) =============

// Get all users
app.get("/api/users", authenticateToken, requireRole('System Administrator'), async (req, res) => {
  try {
    const users = await sql`
      SELECT id, username, email, role, created_at 
      FROM users 
      ORDER BY created_at DESC
    `;
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user role (admin only)
app.patch("/api/users/:id/role", authenticateToken, requireRole('System Administrator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    const validRoles = Object.keys(ROLE_HIERARCHY);
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role',
        validRoles 
      });
    }
    
    if (parseInt(id) === req.user.id && role !== 'System Administrator') {
      return res.status(400).json({ 
        error: 'Cannot change your own admin role' 
      });
    }
    
    const [updatedUser] = await sql`
      UPDATE users 
      SET role = ${role}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, username, email, role
    `;
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// ============= PROJECTS ROUTES =============

// Get all projects
app.get("/api/projects", authenticateToken, async (req, res) => {
  try {
    const projects = await sql`
      SELECT * FROM projects 
      ORDER BY created_at DESC
    `;
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create project (PM or higher)
app.post("/api/projects", authenticateToken, requireRole('Project Manager'), async (req, res) => {
  try {
    const { name, description, template } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const [newProject] = await sql`
      INSERT INTO projects (name, description, template, created_by)
      VALUES (
        ${name}, 
        ${description || ''}, 
        ${template || 'generic'},
        ${req.user.id.toString()}
      )
      RETURNING *
    `;

    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Delete project (Admin only)
app.delete("/api/projects/:id", authenticateToken, requireRole('System Administrator'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deleted] = await sql`
      DELETE FROM projects 
      WHERE id = ${id}
      RETURNING id
    `;
    
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Get project team members
app.get('/api/projects/:projectId/team', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    console.log('Team endpoint called for project:', projectId);
    console.log('User:', req.user);
    
    const result = await pool.query(`
      SELECT 
        pm.id,
        pm.user_id,
        u.username as name,
        u.email,
        pm.role,
        pm.joined_at,
        pm.status
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = $1 AND pm.status = 'active'
      ORDER BY pm.role, pm.joined_at
    `, [projectId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Team endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= ISSUES ROUTES =============

// Get issues with filtering and search
app.get('/api/issues', authenticateToken, async (req, res) => {
  try {
    const { projectId, status, priority, assignee, category, search } = req.query;
    
    // Build dynamic WHERE conditions
    let conditions = [];
    let params = [];
    
    if (projectId) {
      conditions.push(`project_id = $${params.length + 1}`);
      params.push(parseInt(projectId));
    }
    
    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (priority) {
      conditions.push(`priority = $${params.length + 1}`);
      params.push(priority);
    }
    
    if (assignee) {
      conditions.push(`assignee = $${params.length + 1}`);
      params.push(assignee);
    }
    
    if (category) {
      conditions.push(`category = $${params.length + 1}`);
      params.push(category);
    }
    
    if (search) {
      conditions.push(`(title ILIKE $${params.length + 1} OR description ILIKE $${params.length + 2})`);
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }
    
    // Build final query
    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';
    
    const query = `SELECT * FROM issues ${whereClause} ORDER BY created_at DESC`;
    
    // Execute using pool.query() for dynamic SQL
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// Get single issue by ID
app.get('/api/issues/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM issues WHERE id = $1',
      [parseInt(id)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching issue:', error);
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// Create issue (Team Member or higher)
app.post('/api/issues', authenticateToken, requireRole('Team Member'), async (req, res) => {
  const { 
    title, 
    description, 
    priority, 
    category, 
    assignee, 
    dueDate, 
    projectId,
    // AI-related fields
    createdByAI = false,
    aiConfidence = null,
    aiAnalysisId = null
  } = req.body;
  
  if (!title || !projectId) {
    return res.status(400).json({ 
      error: 'Title and Project ID are required' 
    });
  }
  
  try {
    const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
    if (!project) {
      return res.status(404).json({ 
        error: 'Project not found' 
      });
    }
    
    const [newIssue] = await sql`
      INSERT INTO issues (
        title, description, priority, category, assignee, 
        due_date, project_id, status, created_by,
        created_by_ai, ai_confidence, ai_analysis_id
      ) VALUES (
        ${title.trim()}, 
        ${description?.trim() || ''}, 
        ${priority || 'medium'}, 
        ${category || 'General'}, 
        ${assignee || ''}, 
        ${dueDate || null}, 
        ${parseInt(projectId)}, 
        'To Do',
        ${req.user.id.toString()},
        ${createdByAI},
        ${aiConfidence},
        ${aiAnalysisId}
      ) RETURNING *
    `;
    
    res.status(201).json(newIssue);
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

// Update issue (Owner or Team Lead+)
app.patch('/api/issues/:id', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const [issue] = await sql`SELECT * FROM issues WHERE id = ${id}`;
    
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const isOwner = issue.created_by === req.user.id.toString();
    
    if (userRoleLevel < ROLE_HIERARCHY['Team Lead'] && !isOwner) {
      return res.status(403).json({ error: 'Can only edit your own issues' });
    }
    
    const [updatedIssue] = await sql`
      UPDATE issues 
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;
    
    res.json(updatedIssue);
  } catch (error) {
    console.error('Error updating issue:', error);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

// Delete issue (Team Lead or higher)
app.delete('/api/issues/:id', authenticateToken, requireRole('Team Lead'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const [deleted] = await sql`
      DELETE FROM issues 
      WHERE id = ${id}
      RETURNING id
    `;
    
    if (!deleted) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    res.json({ message: 'Issue deleted successfully' });
  } catch (error) {
    console.error('Error deleting issue:', error);
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

// ============= ACTION ITEMS ROUTES =============

// Get action items with filtering and search
app.get("/api/action-items", authenticateToken, async (req, res) => {
  try {
    const { projectId, status, priority, assignee, search } = req.query;
    
    // Build dynamic WHERE conditions
    let conditions = [];
    let params = [];
    
    if (projectId) {
      conditions.push(`project_id = $${params.length + 1}`);
      params.push(parseInt(projectId));
    }
    
    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (priority) {
      conditions.push(`priority = $${params.length + 1}`);
      params.push(priority);
    }
    
    if (assignee) {
      conditions.push(`assignee = $${params.length + 1}`);
      params.push(assignee);
    }
    
    if (search) {
      conditions.push(`(title ILIKE $${params.length + 1} OR description ILIKE $${params.length + 2})`);
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }
    
    // Build final query
    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';
    
    const query = `SELECT * FROM action_items ${whereClause} ORDER BY created_at DESC`;
    
    // Execute using pool.query() for dynamic SQL
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching action items:', error);
    res.status(500).json({ error: 'Failed to fetch action items' });
  }
});

// Get single action item by ID
app.get('/api/action-items/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM action_items WHERE id = $1',
      [parseInt(id)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching action item:', error);
    res.status(500).json({ error: 'Failed to fetch action item' });
  }
});

// Create action item (Team Member or higher)
app.post("/api/action-items", authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { 
      title, 
      description, 
      projectId, 
      priority, 
      assignee, 
      dueDate,
      // AI-related fields
      createdByAI = false,
      aiConfidence = null,
      aiAnalysisId = null
    } = req.body;
    
    if (!title || !projectId) {
      return res.status(400).json({ error: 'Title and Project ID are required' });
    }
    
    const [newItem] = await sql`
      INSERT INTO action_items (
        title, description, project_id, priority, assignee, 
        due_date, status, created_by,
        created_by_ai, ai_confidence, ai_analysis_id
      ) VALUES (
        ${title.trim()}, 
        ${description?.trim() || ''}, 
        ${parseInt(projectId)}, 
        ${priority || 'medium'}, 
        ${assignee || ''}, 
        ${dueDate || null}, 
        'To Do',
        ${req.user.id.toString()},
        ${createdByAI},
        ${aiConfidence},
        ${aiAnalysisId}
      ) RETURNING *
    `;
    
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating action item:', error);
    res.status(500).json({ error: 'Failed to create action item' });
  }
});

// Update action item status (Owner or Team Lead+)
app.patch('/api/action-items/:id', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const [item] = await sql`SELECT * FROM action_items WHERE id = ${id}`;
    
    if (!item) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const isOwner = item.created_by === req.user.id.toString();
    
    if (userRoleLevel < ROLE_HIERARCHY['Team Lead'] && !isOwner) {
      return res.status(403).json({ error: 'Can only edit your own action items' });
    }
    
    const [updatedItem] = await sql`
      UPDATE action_items 
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating action item:', error);
    res.status(500).json({ error: 'Failed to update action item' });
  }
});

// ============= RELATIONSHIP ROUTES =============

// Get relationships for an item
app.get('/api/:itemType/:id/relationships', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const type = itemType === 'issues' ? 'issue' : 'action-item';
    
    // Get relationships where this item is the source
    const outgoingQuery = `
      SELECT r.*, 
             CASE 
               WHEN r.target_type = 'issue' THEN i.title
               ELSE ai.title
             END as target_title,
             CASE 
               WHEN r.target_type = 'issue' THEN i.status
               ELSE ai.status
             END as target_status,
             CASE 
               WHEN r.target_type = 'issue' THEN i.assignee
               ELSE ai.assignee
             END as target_assignee,
             mt.title as transcript_title
      FROM issue_relationships r
      LEFT JOIN issues i ON r.target_type = 'issue' AND r.target_id = i.id
      LEFT JOIN action_items ai ON r.target_type = 'action-item' AND r.target_id = ai.id
      LEFT JOIN meeting_transcripts mt ON r.transcript_id = mt.id
      WHERE r.source_id = $1 AND r.source_type = $2
      ORDER BY r.created_at DESC
    `;
    
    // Get relationships where this item is the target
    const incomingQuery = `
      SELECT r.*, 
             CASE 
               WHEN r.source_type = 'issue' THEN i.title
               ELSE ai.title
             END as source_title,
             CASE 
               WHEN r.source_type = 'issue' THEN i.status
               ELSE ai.status
             END as source_status,
             CASE 
               WHEN r.source_type = 'issue' THEN i.assignee
               ELSE ai.assignee
             END as source_assignee,
             mt.title as transcript_title
      FROM issue_relationships r
      LEFT JOIN issues i ON r.source_type = 'issue' AND r.source_id = i.id
      LEFT JOIN action_items ai ON r.source_type = 'action-item' AND r.source_id = ai.id
      LEFT JOIN meeting_transcripts mt ON r.transcript_id = mt.id
      WHERE r.target_id = $1 AND r.target_type = $2
      ORDER BY r.created_at DESC
    `;
    
    const [outgoingResult, incomingResult] = await Promise.all([
      pool.query(outgoingQuery, [parseInt(id), type]),
      pool.query(incomingQuery, [parseInt(id), type])
    ]);
    
    res.json({ outgoing: outgoingResult.rows, incoming: incomingResult.rows });
  } catch (error) {
    console.error('Error getting relationships:', error);
    res.status(500).json({ error: 'Failed to get relationships' });
  }
});

// Create a relationship
app.post('/api/:itemType/:id/relationships', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const { targetId, targetType, relationshipType } = req.body;
    const sourceType = itemType === 'issues' ? 'issue' : 'action-item';
    
    // Validate inputs
    if (!targetId || !targetType || !relationshipType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check for circular dependency
    if (parseInt(id) === parseInt(targetId) && sourceType === targetType) {
      return res.status(400).json({ error: 'Cannot create relationship to self' });
    }
    
    // Check if relationship already exists
    const existingQuery = `
      SELECT id FROM issue_relationships
      WHERE source_id = $1 
        AND source_type = $2
        AND target_id = $3
        AND target_type = $4
        AND relationship_type = $5
    `;
    const existingResult = await pool.query(existingQuery, [
      parseInt(id), sourceType, parseInt(targetId), targetType, relationshipType
    ]);
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Relationship already exists' });
    }
    
    // Create relationship
    const insertQuery = `
      INSERT INTO issue_relationships 
        (source_id, source_type, target_id, target_type, relationship_type, created_by)
      VALUES 
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [
      parseInt(id), sourceType, parseInt(targetId), targetType, relationshipType, req.user.id
    ]);
    
    const relationship = result.rows[0];
    
    // Create reciprocal relationship if needed
    if (relationshipType === 'blocks') {
      const reciprocalQuery = `
        INSERT INTO issue_relationships 
          (source_id, source_type, target_id, target_type, relationship_type, created_by)
        VALUES 
          ($1, $2, $3, $4, 'blocked_by', $5)
        ON CONFLICT DO NOTHING
      `;
      await pool.query(reciprocalQuery, [
        parseInt(targetId), targetType, parseInt(id), sourceType, req.user.id
      ]);
    }
    
    if (relationshipType === 'parent_of') {
      const reciprocalQuery = `
        INSERT INTO issue_relationships 
          (source_id, source_type, target_id, target_type, relationship_type, created_by)
        VALUES 
          ($1, $2, $3, $4, 'child_of', $5)
        ON CONFLICT DO NOTHING
      `;
      await pool.query(reciprocalQuery, [
        parseInt(targetId), targetType, parseInt(id), sourceType, req.user.id
      ]);
    }
    
    res.status(201).json(relationship);
  } catch (error) {
    console.error('Error creating relationship:', error);
    res.status(500).json({ error: 'Failed to create relationship' });
  }
});

// Delete a relationship
app.delete('/api/:itemType/:id/relationships/:relationshipId', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { relationshipId } = req.params;
    
    // Get the relationship to find reciprocal
    const selectQuery = `SELECT * FROM issue_relationships WHERE id = $1`;
    const selectResult = await pool.query(selectQuery, [parseInt(relationshipId)]);
    
    if (selectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Relationship not found' });
    }
    
    const relationship = selectResult.rows[0];
    
    // Delete the relationship
    const deleteQuery = `DELETE FROM issue_relationships WHERE id = $1`;
    await pool.query(deleteQuery, [parseInt(relationshipId)]);
    
    // Delete reciprocal relationship if exists
    if (relationship.relationship_type === 'blocks') {
      const deleteReciprocalQuery = `
        DELETE FROM issue_relationships
        WHERE source_id = $1
          AND source_type = $2
          AND target_id = $3
          AND target_type = $4
          AND relationship_type = 'blocked_by'
      `;
      await pool.query(deleteReciprocalQuery, [
        relationship.target_id, relationship.target_type,
        relationship.source_id, relationship.source_type
      ]);
    }
    
    if (relationship.relationship_type === 'parent_of') {
      const deleteReciprocalQuery = `
        DELETE FROM issue_relationships
        WHERE source_id = $1
          AND source_type = $2
          AND target_id = $3
          AND target_type = $4
          AND relationship_type = 'child_of'
      `;
      await pool.query(deleteReciprocalQuery, [
        relationship.target_id, relationship.target_type,
        relationship.source_id, relationship.source_type
      ]);
    }
    
    res.json({ message: 'Relationship deleted' });
  } catch (error) {
    console.error('Error deleting relationship:', error);
    res.status(500).json({ error: 'Failed to delete relationship' });
  }
});

// Helper function to calculate average confidence
function calculateAvgConfidence(aiResults) {
  const allItems = [
    ...(aiResults.actionItems || []),
    ...(aiResults.issues || [])
  ];
  
  if (allItems.length === 0) return null;
  
  const totalConfidence = allItems.reduce((sum, item) => sum + (item.confidence || 0), 0);
  return (totalConfidence / allItems.length).toFixed(2);
}

async function processStatusUpdates(statusUpdates, projectId, userId, transcriptId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = {
      matched: [],
      unmatched: [],
      errors: []
    };
    
    for (const update of statusUpdates) {
      try {
        const itemType = update.itemDescription.toLowerCase().includes('issue') || 
                        update.itemDescription.toLowerCase().includes('risk') || 
                        update.itemDescription.toLowerCase().includes('problem')
                        ? 'issue' : 'actionItem';
        
        const table = itemType === 'issue' ? 'issues' : 'action_items';
        
        const searchQuery = `
          SELECT id, title, description, status, assignee, priority
          FROM ${table}
          WHERE project_id = $1
          AND status != 'Done'
          AND status != 'Cancelled'
          ${update.assignee ? 'AND assignee ILIKE $2' : ''}
          ORDER BY created_at DESC
          LIMIT 20
        `;
        
        const searchParams = update.assignee 
          ? [projectId, `%${update.assignee}%`] 
          : [projectId];
        
        const existingItems = await client.query(searchQuery, searchParams);
        
        if (existingItems.rows.length === 0) {
          results.unmatched.push({
            update: update,
            reason: 'No matching items found in project'
          });
          continue;
        }
        
        const existingTitles = existingItems.rows.map(item => item.title);
        const matches = stringSimilarity.findBestMatch(update.itemDescription, existingTitles);
        const bestMatchIndex = matches.bestMatchIndex;
        const matchConfidence = matches.bestMatch.rating * 100;
        
        if (matchConfidence < 60) {
          results.unmatched.push({
            update: update,
            reason: `Low similarity match: ${matchConfidence.toFixed(0)}%`,
            closestMatch: existingItems.rows[bestMatchIndex].title
          });
          continue;
        }
        
        const matchedItem = existingItems.rows[bestMatchIndex];
        
        // PERMISSION CHECK: Can user update this item's status?
        const canUpdate = await canUpdateItemStatus(userId, {
          ...matchedItem,
          project_id: projectId
        });
        
        if (!canUpdate) {
          results.unmatched.push({
            update: update,
            reason: 'Insufficient permissions to update this item',
            matchedItem: matchedItem.title,
            action: 'permission_denied'
          });
          continue;
        }
        
        let newStatus = matchedItem.status;
        if (update.statusChange === 'Done') {
          newStatus = 'Done';
        } else if (update.statusChange === 'In Progress') {
          newStatus = 'In Progress';
        } else if (update.statusChange === 'Blocked') {
          newStatus = 'Blocked';
        }
        
        const updateQuery = `
          UPDATE ${table}
          SET status = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `;
        
        await client.query(updateQuery, [newStatus, matchedItem.id]);
        
        // Audit the status update
        await auditAIAction(transcriptId, userId, 'update_status', {
          itemType: itemType === 'issue' ? 'issue' : 'action_item',
          itemId: matchedItem.id,
          oldStatus: matchedItem.status,
          newStatus: newStatus,
          title: matchedItem.title
        });
        
        const commentTable = itemType === 'issue' ? 'issue_comments' : 'action_item_comments';
        const foreignKey = itemType === 'issue' ? 'issue_id' : 'action_item_id';
        
        await client.query(`
          INSERT INTO ${commentTable} (${foreignKey}, user_id, comment, created_at)
          VALUES ($1, $2, $3, NOW())
        `, [
          matchedItem.id,
          userId,
          `🤖 Status updated via AI Analysis (Transcript ID: ${transcriptId})\n\n` +
          `**Evidence:** "${update.evidence}"\n\n` +
          `**Status:** ${matchedItem.status} → ${newStatus}\n\n` +
          (update.progressDetails ? `**Details:** ${update.progressDetails}\n\n` : '') +
          `**Confidence:** ${update.confidence}%`
        ]);
        
        results.matched.push({
          itemId: matchedItem.id,
          itemTitle: matchedItem.title,
          itemType: itemType,
          oldStatus: matchedItem.status,
          newStatus: newStatus,
          matchConfidence: matchConfidence.toFixed(0),
          aiConfidence: update.confidence,
          evidence: update.evidence
        });
        
      } catch (error) {
        console.error('Error processing status update:', error);
        results.errors.push({
          update: update,
          error: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    return results;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to get inverse relationship type
function getInverseRelationship(relationshipType) {
  const inverseMap = {
    'blocks': 'blocked_by',
    'blocked_by': 'blocks',
    'parent_of': 'child_of',
    'child_of': 'parent_of',
    'depends_on': 'depended_by',
    'depended_by': 'depends_on',
    'relates_to': 'relates_to' // symmetric relationship
  };
  return inverseMap[relationshipType] || null;
}

// Helper function to find items by description
async function findItemByDescription(description, assignee, projectId, client) {
  try {
    // Try to match both action items and issues
    const searchThreshold = 60; // 60% similarity threshold
    
    // Search action items
    let searchQuery = `
      SELECT id, title, description, assignee, 'action_item' as type
      FROM action_items
      WHERE project_id = $1
      AND status != 'Done'
      AND status != 'Cancelled'
      ${assignee ? 'AND assignee ILIKE $2' : ''}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    let searchParams = assignee ? [projectId, `%${assignee}%`] : [projectId];
    const actionItems = await client.query(searchQuery, searchParams);
    
    // Search issues
    searchQuery = `
      SELECT id, title, description, assignee, 'issue' as type
      FROM issues
      WHERE project_id = $1
      AND status != 'Done'
      AND status != 'Closed'
      ${assignee ? 'AND assignee ILIKE $2' : ''}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    const issues = await client.query(searchQuery, searchParams);
    
    // Combine all items
    const allItems = [...actionItems.rows, ...issues.rows];
    
    if (allItems.length === 0) {
      return { found: false, reason: 'No items found in project' };
    }
    
    // Find best match using string similarity
    const itemTitles = allItems.map(item => item.title);
    const matches = stringSimilarity.findBestMatch(description, itemTitles);
    const bestMatchIndex = matches.bestMatchIndex;
    const matchConfidence = matches.bestMatch.rating * 100;
    
    if (matchConfidence < searchThreshold) {
      return { 
        found: false, 
        reason: `Low similarity: ${matchConfidence.toFixed(0)}%`,
        closestMatch: allItems[bestMatchIndex].title
      };
    }
    
    const matchedItem = allItems[bestMatchIndex];
    
    return {
      found: true,
      id: matchedItem.id,
      type: matchedItem.type,
      title: matchedItem.title,
      assignee: matchedItem.assignee,
      matchConfidence: matchConfidence
    };
    
  } catch (error) {
    console.error('Error finding item by description:', error);
    return { found: false, reason: error.message };
  }
}

// Process relationships detected by AI
async function processRelationships(relationships, projectId, userId, transcriptId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = {
      created: [],
      failed: [],
      alreadyExists: []
    };
    
    // Server-side confidence threshold
    const CONFIDENCE_THRESHOLD = 75;
    
    for (const rel of relationships) {
      // Skip low-confidence relationships
      if (rel.confidence < CONFIDENCE_THRESHOLD) {
        results.failed.push({
          relationship: rel,
          reason: `Confidence ${rel.confidence}% below threshold (${CONFIDENCE_THRESHOLD}%)`
        });
        continue;
      }
      try {
        // Find source item
        const sourceMatch = await findItemByDescription(
          rel.sourceItem, 
          rel.sourceAssignee, 
          projectId, 
          client
        );
        
        if (!sourceMatch.found) {
          results.failed.push({
            relationship: rel,
            reason: `Source item not found: "${rel.sourceItem}" - ${sourceMatch.reason}`
          });
          continue;
        }
        
        // Find target item
        const targetMatch = await findItemByDescription(
          rel.targetItem, 
          rel.targetAssignee, 
          projectId, 
          client
        );
        
        if (!targetMatch.found) {
          results.failed.push({
            relationship: rel,
            reason: `Target item not found: "${rel.targetItem}" - ${targetMatch.reason}`
          });
          continue;
        }
        
        // Prevent self-relationship
        if (sourceMatch.id === targetMatch.id && sourceMatch.type === targetMatch.type) {
          results.failed.push({
            relationship: rel,
            reason: 'Source and target are the same item'
          });
          continue;
        }
        
        // Check if relationship already exists
        const existingCheck = await client.query(`
          SELECT id FROM issue_relationships
          WHERE source_id = $1 
            AND source_type = $2 
            AND target_id = $3 
            AND target_type = $4
            AND relationship_type = $5
        `, [sourceMatch.id, sourceMatch.type, targetMatch.id, targetMatch.type, rel.relationshipType]);
        
        if (existingCheck.rows.length > 0) {
          results.alreadyExists.push({
            relationship: rel,
            existingId: existingCheck.rows[0].id
          });
          continue;
        }
        
        // Create relationship
        const insertResult = await client.query(`
          INSERT INTO issue_relationships (
            source_id, source_type, target_id, target_type, relationship_type,
            created_by, created_by_ai, ai_confidence, transcript_id, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9)
          RETURNING id
        `, [
          sourceMatch.id,
          sourceMatch.type,
          targetMatch.id,
          targetMatch.type,
          rel.relationshipType,
          userId,
          rel.confidence,
          transcriptId,
          `Evidence: "${rel.evidence}"`
        ]);
        
        const relationshipId = insertResult.rows[0].id;
        
        // Create inverse relationship if applicable
        const inverseType = getInverseRelationship(rel.relationshipType);
        if (inverseType && inverseType !== rel.relationshipType) {
          await client.query(`
            INSERT INTO issue_relationships (
              source_id, source_type, target_id, target_type, relationship_type,
              created_by, created_by_ai, ai_confidence, transcript_id, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9)
            ON CONFLICT DO NOTHING
          `, [
            targetMatch.id,
            targetMatch.type,
            sourceMatch.id,
            sourceMatch.type,
            inverseType,
            userId,
            rel.confidence,
            transcriptId,
            `Inverse of: "${rel.evidence}"`
          ]);
        }
        
        results.created.push({
          relationshipId: relationshipId,
          sourceItem: sourceMatch.title,
          sourceType: sourceMatch.type,
          targetItem: targetMatch.title,
          targetType: targetMatch.type,
          relationshipType: rel.relationshipType,
          confidence: rel.confidence,
          evidence: rel.evidence,
          matchConfidence: {
            source: sourceMatch.matchConfidence,
            target: targetMatch.matchConfidence
          }
        });
        
      } catch (error) {
        console.error('Error processing relationship:', error);
        results.failed.push({
          relationship: rel,
          reason: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    return results;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to find potential duplicate items using string similarity
async function findPotentialDuplicate(newItem, projectId, itemType = 'action_item') {
  const similarityThreshold = 0.75; // 75% similarity threshold
  
  try {
    const table = itemType === 'action_item' ? 'action_items' : 'issues';
    const query = `
      SELECT * FROM ${table}
      WHERE project_id = $1
        AND status != 'Done'
        AND status != 'Closed'
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const result = await pool.query(query, [projectId]);
    const existingItems = result.rows;
    
    // Find the most similar item
    let bestMatch = null;
    let bestScore = 0;
    
    for (const existingItem of existingItems) {
      // Compare titles
      const titleScore = stringSimilarity.compareTwoStrings(
        newItem.title.toLowerCase(),
        existingItem.title.toLowerCase()
      );
      
      // Compare descriptions if available
      const descScore = (newItem.description && existingItem.description)
        ? stringSimilarity.compareTwoStrings(
            newItem.description.toLowerCase(),
            existingItem.description.toLowerCase()
          )
        : 0;
      
      // Weighted average (title is more important)
      const combinedScore = (titleScore * 0.7) + (descScore * 0.3);
      
      if (combinedScore > bestScore && combinedScore >= similarityThreshold) {
        bestScore = combinedScore;
        bestMatch = {
          item: existingItem,
          similarity: combinedScore
        };
      }
    }
    
    return bestMatch;
  } catch (error) {
    console.error('Error finding duplicate:', error);
    return null;
  }
}

// Helper function to update existing item with new information
async function updateExistingItem(existingItem, newItem, itemType = 'action_item') {
  try {
    const table = itemType === 'action_item' ? 'action_items' : 'issues';
    
    // Merge descriptions
    const updatedDescription = existingItem.description 
      ? `${existingItem.description}\n\n[Updated from transcript]: ${newItem.description}`
      : newItem.description;
    
    // Update priority if new one is higher
    const priorityRank = { low: 1, medium: 2, high: 3, critical: 4 };
    const updatedPriority = priorityRank[newItem.priority] > priorityRank[existingItem.priority]
      ? newItem.priority
      : existingItem.priority;
    
    // Update assignee if new one is provided and old one is empty
    const updatedAssignee = (!existingItem.assignee || existingItem.assignee === '') && newItem.assignee
      ? newItem.assignee
      : existingItem.assignee;
    
    // Update due date if new one is provided and old one is null
    const updatedDueDate = !existingItem.due_date && newItem.dueDate
      ? newItem.dueDate
      : existingItem.due_date;
    
    if (itemType === 'action_item') {
      const updateQuery = `
        UPDATE action_items
        SET 
          description = $1,
          priority = $2,
          assignee = $3,
          due_date = $4,
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `;
      
      const result = await pool.query(updateQuery, [
        updatedDescription,
        updatedPriority,
        updatedAssignee,
        updatedDueDate,
        existingItem.id
      ]);
      
      return result.rows[0];
    } else {
      const updateQuery = `
        UPDATE issues
        SET 
          description = $1,
          priority = $2,
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      
      const result = await pool.query(updateQuery, [
        updatedDescription,
        updatedPriority,
        existingItem.id
      ]);
      
      return result.rows[0];
    }
  } catch (error) {
    console.error('Error updating existing item:', error);
    return null;
  }
}

// Upload and analyze meeting transcript (with transcript storage)
app.post('/api/meetings/analyze', 
  authenticateToken, 
  requireRole('Team Member'),
  upload.single('transcript'), 
  async (req, res) => {
    const startTime = Date.now();
    const analysisId = uuidv4();
    let transcriptId = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { projectId, meetingDate, title, visibility } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: 'Project ID required' });
      }

      // PERMISSION CHECK: Can user upload transcripts to this project?
      const canUpload = await canUploadTranscript(req.user.id, parseInt(projectId));
      if (!canUpload) {
        await fs.unlink(req.file.path); // Clean up uploaded file
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          message: 'Only Project Managers and System Administrators can upload transcripts and run AI analysis'
        });
      }

      // Read uploaded file
      const filePath = req.file.path;
      const transcriptText = await fs.readFile(filePath, 'utf8');

      // Validate transcript length (GPT-3.5 has 16K context window)
      const estimatedTokens = Math.ceil(transcriptText.length / 4);
      if (estimatedTokens > 12000) {
        await fs.unlink(filePath);
        return res.status(400).json({ 
          error: 'Transcript too long. Please limit to ~10,000 words (48,000 characters)' 
        });
      }

      // Get project context for better AI results
      const project = await sql`SELECT * FROM projects WHERE id = ${parseInt(projectId)}`;
      if (!project || project.length === 0) {
        await fs.unlink(filePath);
        return res.status(404).json({ error: 'Project not found' });
      }

      // STEP 1: Store transcript in database FIRST
      const transcriptResult = await pool.query(`
        INSERT INTO meeting_transcripts (
          project_id, title, meeting_date, uploaded_by,
          original_filename, file_size, transcript_text,
          analysis_id, status, visibility
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9)
        RETURNING id
      `, [
        parseInt(projectId),
        title || `Meeting ${new Date().toLocaleDateString()}`,
        meetingDate || new Date().toISOString().split('T')[0],
        req.user.id,
        req.file.originalname,
        req.file.size,
        transcriptText,
        analysisId,
        visibility || 'project_managers' // Default: only managers can view
      ]);
      
      transcriptId = transcriptResult.rows[0].id;

      // Audit the upload action
      await auditAIAction(transcriptId, req.user.id, 'upload', { 
        projectId: parseInt(projectId), 
        filename: req.file.originalname,
        visibility: visibility || 'project_managers'
      });

      // Clean up uploaded file
      await fs.unlink(filePath);

      console.log(`Analyzing transcript (${estimatedTokens} tokens) with GPT-3.5-Turbo...`);
      
      // STEP 2: Call AI for analysis
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: [
          {
            role: "system",
            content: `You are an expert AI assistant that analyzes meeting transcripts to:
1. Extract NEW action items and issues
2. Detect STATUS UPDATES for existing work

# PHASE 1: NEW ITEM EXTRACTION

ACTION ITEMS - Extract when you see:
1. Direct assignments: "David, can you...", "Lisa will...", "James should..."
2. Commitments: "I'll do X by Y date"
3. Soft assignments: "Can you check...", "Would you mind..."
4. Recurring tasks: "Send updates every Friday", "Weekly reports"
5. Implied tasks from decisions: If someone says "we need X", extract as action item

ISSUES/RISKS - Extract when you see:
1. Problems mentioned: "we've identified an issue with..."
2. Blockers: "this won't work because..."
3. Risks: "I'm concerned about...", "potential problem with..."
4. Technical debt: "legacy system", "deprecated", "end-of-life"
5. Timeline concerns: "might delay", "at risk", "needs extension"

ASSIGNEE EXTRACTION:
- Direct: "David will do X" → David
- Implied: "David, can you do X?" → David
- Multiple: "Lisa and James will..." → "Lisa Martinez and James Wilson"
- Unassigned: If no clear owner mentioned → null

DUE DATE EXTRACTION:
- Specific dates: "by October 15th" → 2025-10-15
- Relative dates: "next Friday" → calculate based on meeting date
- Vague dates: "next week", "soon" → null (let user assign)
- Recurring: "every Friday" → extract as recurring pattern

PRIORITY ASSESSMENT:
- Critical: "critical", "urgent", "blocker", "must have", "non-negotiable"
- High: "important", "high priority", "need soon", "before migration"
- Medium: "should do", "would be good", "nice to have"
- Low: "if time permits", "future consideration"

CONFIDENCE SCORING:
- 90-100%: Explicit assignment with specific due date
- 80-89%: Clear assignment but vague due date, or specific date but unclear owner
- 70-79%: Implied assignment or implied timeline
- <70%: Ambiguous - flag for human review

# PHASE 2: STATUS UPDATE DETECTION

Scan the transcript for statements indicating work status changes:

## COMPLETION INDICATORS:
- "finished", "completed", "done", "wrapped up"
- "I finished X", "X is complete", "completed the X"
- Past tense: "I created", "I documented", "I analyzed"
- Confirmation: "that task is done", "all set on X"

## IN PROGRESS INDICATORS:
- "working on", "in progress", "currently doing"
- Percentage complete: "75% done", "about halfway through"
- "I've started X", "making progress on X"
- "almost done", "nearly finished"

## BLOCKED INDICATORS:
- "blocked by", "waiting on", "can't proceed until"
- "stuck on", "need help with", "impediment"
- "waiting for access", "pending approval"

## EXTRACTION FORMAT:

For each status update detected, provide:
- **itemDescription**: Brief description of the work being referenced
- **assignee**: Person who provided the update
- **statusChange**: "Done" | "In Progress" | "Blocked"
- **evidence**: Direct quote from transcript showing the status
- **progressDetails**: Specific details if mentioned (e.g., "completed firewall review")
- **confidence**: 0-100 based on clarity of status indicator

## STATUS UPDATE RULES:

1. Only detect status updates for work items, not general discussions
2. Status must be explicitly stated or strongly implied
3. Match assignee names carefully
4. Include specific progress details when mentioned (percentages, sub-tasks completed)
5. High confidence (90+) for explicit statements, lower for implied
6. If work is mentioned but no status change indicated, don't include it

# PHASE 3: RELATIONSHIP DETECTION

Scan the transcript for statements indicating relationships between work items:

## DEPENDENCY RELATIONSHIPS (BLOCKING):

**Patterns to detect:**
- "X is blocked by Y"
- "can't start X until Y is done"
- "X depends on Y"
- "waiting for Y before X"
- "Y needs to be completed before X"
- "X is waiting on Y"

**Example:**
"We can't start the migration testing until the security audit is completed"
→ Relationship: "Migration testing" BLOCKED_BY "Security audit"

## PARENT-CHILD RELATIONSHIPS (HIERARCHY):

**Patterns to detect:**
- "X is part of Y"
- "X is a subtask of Y"
- "Y includes X"
- "break down X into Y and Z"
- "X consists of Y"
- "Y is a component of X"

**Example:**
"The database migration is part of the overall Pathfinder migration project"
→ Relationship: "Database migration" CHILD_OF "Pathfinder migration"

## RELATED RELATIONSHIPS (ASSOCIATION):

**Patterns to detect:**
- "X relates to Y"
- "X and Y are connected"
- "similar to X"
- "X impacts Y"
- "coordinate X with Y"
- "X and Y should be aligned"

**Example:**
"The network configuration should be coordinated with the security settings"
→ Relationship: "Network configuration" RELATES_TO "Security settings"

## RELATIONSHIP EXTRACTION RULES:

1. **Be specific**: Extract actual work item titles/descriptions, not vague references
2. **Directional**: Note the direction (A blocks B vs B blocked by A)
3. **High confidence only**: Only extract relationships explicitly stated (confidence >75%)
4. **Context matters**: Consider the full sentence context
5. **Multiple relationships**: One item can have multiple relationships
6. **Both items must be clear**: Only extract when both source and target items are identifiable

## CONFIDENCE SCORING FOR RELATIONSHIPS:

- 90-100%: Explicit blocking/dependency statement with clear items
- 80-89%: Clear relationship but one item description is somewhat vague
- 75-79%: Implied relationship with reasonable certainty
- <75%: Don't extract (too ambiguous)

PROJECT CONTEXT:
- Name: ${project[0].name}
- Type: ${project[0].template}
- Categories: ${project[0].categories?.join(', ') || 'General'}

CURRENT MEETING DATE: ${meetingDate || new Date().toISOString().split('T')[0]}

Respond with a JSON object in this exact format:
{
  "actionItems": [
    {
      "title": "Brief action (5-8 words)",
      "description": "Detailed description including context",
      "assignee": "Full Name or null",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "critical|high|medium|low",
      "confidence": 85
    }
  ],
  "issues": [
    {
      "title": "Brief issue title (5-8 words)",
      "description": "Detailed description of the problem",
      "category": "Technical|Process|Risk|Communication|Resource|External Dependency",
      "priority": "critical|high|medium|low",
      "confidence": 90
    }
  ],
  "statusUpdates": [
    {
      "itemDescription": "VM inventory creation",
      "assignee": "David Thompson",
      "statusChange": "Done",
      "evidence": "I finished the VM inventory yesterday",
      "progressDetails": "47 VMs documented with full configurations",
      "confidence": 95
    }
  ],
  "relationships": [
    {
      "sourceItem": "Migration testing",
      "targetItem": "Security audit",
      "relationshipType": "blocked_by",
      "evidence": "We can't start the migration testing until the security audit is completed",
      "sourceAssignee": "Michael Rodriguez",
      "targetAssignee": "Lisa Martinez",
      "confidence": 95
    }
  ]
}

RELATIONSHIP TYPES TO USE:
- **blocked_by**: Source cannot proceed until target is complete
- **blocks**: Source prevents target from proceeding (inverse of blocked_by)
- **child_of**: Source is a subtask/component of target
- **parent_of**: Source contains target as subtask (inverse of child_of)
- **relates_to**: Source and target are associated/connected
- **depends_on**: Source requires target (similar to blocked_by but softer)

IMPORTANT: Extract ALL action items, issues, status updates, and relationships. Be comprehensive.`
          },
          {
            role: "user",
            content: `Analyze this meeting transcript:\n\n${transcriptText}`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
        max_tokens: 3000
      });

      const aiResponse = completion.choices[0].message.content;
      const parsedResponse = JSON.parse(aiResponse);
      const processingTime = Date.now() - startTime;

      // Calculate costs
      const inputTokens = completion.usage.prompt_tokens;
      const outputTokens = completion.usage.completion_tokens;
      const totalTokens = completion.usage.total_tokens;
      const estimatedCost = (inputTokens * 0.0005 / 1000) + (outputTokens * 0.0015 / 1000);

      // STEP 2.5: Process Status Updates
      let statusUpdateResults = null;
      if (parsedResponse.statusUpdates && parsedResponse.statusUpdates.length > 0) {
        console.log(`Processing ${parsedResponse.statusUpdates.length} status updates...`);
        statusUpdateResults = await processStatusUpdates(
          parsedResponse.statusUpdates, 
          parseInt(projectId), 
          req.user.id, 
          transcriptId
        );
        console.log(`Status updates: ${statusUpdateResults.matched.length} matched, ${statusUpdateResults.unmatched.length} unmatched`);
      }

      // STEP 2.6: Process Relationships (NEW)
      let relationshipResults = null;
      if (parsedResponse.relationships && parsedResponse.relationships.length > 0) {
        console.log(`Processing ${parsedResponse.relationships.length} relationships...`);
        relationshipResults = await processRelationships(
          parsedResponse.relationships,
          parseInt(projectId),
          req.user.id,
          transcriptId
        );
        console.log(`Relationships: ${relationshipResults.created.length} created, ${relationshipResults.failed.length} failed, ${relationshipResults.alreadyExists.length} already exist`);
      }

      // STEP 3: Update transcript with analysis results
      await pool.query(`
        UPDATE meeting_transcripts
        SET 
          status = 'processed',
          processing_time_ms = $1,
          total_tokens = $2,
          estimated_cost = $3,
          action_items_extracted = $4,
          issues_extracted = $5,
          avg_confidence = $6
        WHERE id = $7
      `, [
        processingTime,
        totalTokens,
        estimatedCost,
        parsedResponse.actionItems?.length || 0,
        parsedResponse.issues?.length || 0,
        calculateAvgConfidence(parsedResponse),
        transcriptId
      ]);

      console.log(`Analysis complete: ${parsedResponse.actionItems?.length || 0} action items, ${parsedResponse.issues?.length || 0} issues`);
      console.log(`Tokens used: ${totalTokens}, Cost: ~$${estimatedCost.toFixed(4)}`);

      // STEP 4: Return results with transcript ID, status updates, and relationships
      res.json({
        success: true,
        analysisId: analysisId,
        transcriptId: transcriptId,
        ...parsedResponse,
        statusUpdateResults: statusUpdateResults,
        relationshipResults: relationshipResults,
        metadata: {
          projectId: parseInt(projectId),
          analyzedAt: new Date().toISOString(),
          analyzedBy: req.user.id,
          transcriptLength: transcriptText.length,
          model: "gpt-3.5-turbo-1106",
          tokensUsed: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens
          },
          estimatedCost: `$${estimatedCost.toFixed(4)}`,
          processingTime: `${processingTime}ms`
        }
      });

    } catch (error) {
      console.error('Error analyzing transcript:', error);
      
      // Update transcript status to failed if it was created
      if (transcriptId) {
        await pool.query(`
          UPDATE meeting_transcripts
          SET status = 'failed', error_message = $1
          WHERE id = $2
        `, [error.message, transcriptId]).catch(() => {});
      }
      
      // Clean up file if it still exists
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          // Ignore cleanup errors
        }
      }

      if (error.message?.includes('API key')) {
        return res.status(500).json({ 
          error: 'OpenAI API not configured. Please add OPENAI_API_KEY to Replit Secrets.' 
        });
      }

      if (error.code === 'insufficient_quota') {
        return res.status(500).json({ 
          error: 'OpenAI API quota exceeded. Please check your OpenAI account.' 
        });
      }

      res.status(500).json({ 
        error: 'Failed to analyze transcript',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
});

// Batch create items from AI suggestions (with transcript linking)
app.post('/api/meetings/create-items', 
  authenticateToken,
  requireRole('Team Member'),
  async (req, res) => {
    try {
      const { projectId, transcriptId, analysisId, actionItems, issues } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: 'Project ID required' });
      }

      const created = {
        actionItems: [],
        issues: []
      };

      // Use provided analysis ID or generate one
      const finalAnalysisId = analysisId || `ai-analysis-${Date.now()}-${req.user.id}`;

      // Helper function to validate and sanitize due dates
      const sanitizeDueDate = (dateStr) => {
        if (!dateStr) return null;
        
        // Check if it's a valid date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateStr)) {
          // Invalid format (e.g., "Recurring: every Friday"), return null
          return null;
        }
        
        // Verify it's a valid date
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return null;
        }
        
        return dateStr;
      };

      // Create action items
      if (actionItems && actionItems.length > 0) {
        for (const item of actionItems) {
          const newItem = await sql`
            INSERT INTO action_items (
              title, description, project_id, priority, assignee, 
              due_date, status, created_by,
              created_by_ai, ai_confidence, ai_analysis_id, transcript_id
            ) VALUES (
              ${item.title.substring(0, 200)},
              ${item.description?.substring(0, 1000) || ''},
              ${parseInt(projectId)},
              ${item.priority || 'medium'},
              ${item.assignee || ''},
              ${sanitizeDueDate(item.dueDate)},
              'To Do',
              ${req.user.id},
              ${true},
              ${item.confidence || null},
              ${finalAnalysisId},
              ${transcriptId || null}
            ) RETURNING *
          `;
          created.actionItems.push(newItem[0]);
        }
      }

      // Create issues
      if (issues && issues.length > 0) {
        for (const issue of issues) {
          const newIssue = await sql`
            INSERT INTO issues (
              title, description, project_id, priority, category,
              status, created_by,
              created_by_ai, ai_confidence, ai_analysis_id, transcript_id
            ) VALUES (
              ${issue.title.substring(0, 200)},
              ${issue.description?.substring(0, 1000) || ''},
              ${parseInt(projectId)},
              ${issue.priority || 'medium'},
              ${issue.category || 'General'},
              'To Do',
              ${req.user.id},
              ${true},
              ${issue.confidence || null},
              ${finalAnalysisId},
              ${transcriptId || null}
            ) RETURNING *
          `;
          created.issues.push(newIssue[0]);
        }
      }

      console.log(`Created ${created.actionItems.length} action items and ${created.issues.length} issues from AI analysis`);
      res.json(created);

    } catch (error) {
      console.error('Error creating items from AI suggestions:', error);
      res.status(500).json({ error: 'Failed to create items' });
    }
});

// Smart create items with duplicate detection (Story 2.2.1)
app.post('/api/meetings/create-items-smart', 
  authenticateToken,
  requireRole('Team Member'),
  async (req, res) => {
    try {
      const { projectId, transcriptId, analysisId, actionItems, issues } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: 'Project ID required' });
      }

      // PERMISSION CHECK: Can user create items from AI analysis?
      const canCreate = await canCreateItemsFromAI(req.user.id, parseInt(projectId));
      if (!canCreate) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          message: 'Only Project Managers and System Administrators can create items from AI analysis'
        });
      }

      const results = {
        actionItems: {
          created: [],
          updated: [],
          duplicates: [],
          permissionDenied: []
        },
        issues: {
          created: [],
          updated: [],
          duplicates: [],
          permissionDenied: []
        }
      };

      // Use provided analysis ID or generate one
      const finalAnalysisId = analysisId || `ai-analysis-${Date.now()}-${req.user.id}`;

      // Helper function to validate and sanitize due dates
      const sanitizeDueDate = (dateStr) => {
        if (!dateStr) return null;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateStr)) return null;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return dateStr;
      };

      // Process action items with duplicate detection
      if (actionItems && actionItems.length > 0) {
        for (const item of actionItems) {
          // PERMISSION CHECK: Validate assignment permissions
          let finalAssignee = item.assignee || '';
          if (item.assignee) {
            const assignCheck = await canAssignTo(req.user.id, item.assignee, parseInt(projectId));
            if (!assignCheck.allowed) {
              if (assignCheck.suggestedAction === 'assign_to_self' && assignCheck.selfUsername) {
                // Reassign to self if user can't assign to others
                finalAssignee = assignCheck.selfUsername;
                results.actionItems.permissionDenied.push({
                  title: item.title,
                  originalAssignee: item.assignee,
                  reassignedTo: finalAssignee,
                  reason: 'Insufficient permissions to assign to others - reassigned to self'
                });
                
                // Audit the permission override
                await auditAIAction(transcriptId, req.user.id, 'modify', {
                  itemType: 'action_item',
                  title: item.title,
                  action: 'assignment_override',
                  originalAssignee: item.assignee,
                  newAssignee: finalAssignee
                });
              } else {
                // Skip this item if can't assign
                results.actionItems.permissionDenied.push({
                  title: item.title,
                  originalAssignee: item.assignee,
                  reason: assignCheck.reason,
                  action: 'skipped'
                });
                continue;
              }
            }
          }

          // Check for potential duplicate
          const duplicate = await findPotentialDuplicate(item, parseInt(projectId), 'action_item');
          
          if (duplicate) {
            // Update existing item
            const updated = await updateExistingItem(duplicate.item, item, 'action_item');
            if (updated) {
              results.actionItems.updated.push(updated);
              results.actionItems.duplicates.push({
                existingId: duplicate.item.id,
                existingTitle: duplicate.item.title,
                similarity: Math.round(duplicate.similarity * 100),
                action: 'updated'
              });
            }
          } else {
            // Create new item
            const newItem = await sql`
              INSERT INTO action_items (
                title, description, project_id, priority, assignee, 
                due_date, status, created_by,
                created_by_ai, ai_confidence, ai_analysis_id, transcript_id, created_via_ai_by
              ) VALUES (
                ${item.title.substring(0, 200)},
                ${item.description?.substring(0, 1000) || ''},
                ${parseInt(projectId)},
                ${item.priority || 'medium'},
                ${finalAssignee},
                ${sanitizeDueDate(item.dueDate)},
                'To Do',
                ${req.user.id},
                ${true},
                ${item.confidence || null},
                ${finalAnalysisId},
                ${transcriptId || null},
                ${req.user.id}
              ) RETURNING *
            `;
            results.actionItems.created.push(newItem[0]);
            
            // Audit item creation
            await auditAIAction(transcriptId, req.user.id, 'create_items', {
              itemType: 'action_item',
              itemId: newItem[0].id,
              title: item.title
            });
          }
        }
      }

      // Process issues with duplicate detection
      if (issues && issues.length > 0) {
        for (const issue of issues) {
          // Check for potential duplicate
          const duplicate = await findPotentialDuplicate(issue, parseInt(projectId), 'issue');
          
          if (duplicate) {
            // Update existing item
            const updated = await updateExistingItem(duplicate.item, issue, 'issue');
            if (updated) {
              results.issues.updated.push(updated);
              results.issues.duplicates.push({
                existingId: duplicate.item.id,
                existingTitle: duplicate.item.title,
                similarity: Math.round(duplicate.similarity * 100),
                action: 'updated'
              });
            }
          } else {
            // Create new issue
            const newIssue = await sql`
              INSERT INTO issues (
                title, description, project_id, priority, category,
                status, created_by,
                created_by_ai, ai_confidence, ai_analysis_id, transcript_id, created_via_ai_by
              ) VALUES (
                ${issue.title.substring(0, 200)},
                ${issue.description?.substring(0, 1000) || ''},
                ${parseInt(projectId)},
                ${issue.priority || 'medium'},
                ${issue.category || 'General'},
                'To Do',
                ${req.user.id},
                ${true},
                ${issue.confidence || null},
                ${finalAnalysisId},
                ${transcriptId || null},
                ${req.user.id}
              ) RETURNING *
            `;
            results.issues.created.push(newIssue[0]);
            
            // Audit item creation
            await auditAIAction(transcriptId, req.user.id, 'create_items', {
              itemType: 'issue',
              itemId: newIssue[0].id,
              title: issue.title
            });
          }
        }
      }

      const totalCreated = results.actionItems.created.length + results.issues.created.length;
      const totalUpdated = results.actionItems.updated.length + results.issues.updated.length;
      
      console.log(`Smart create: ${totalCreated} new items, ${totalUpdated} updated items`);
      res.json(results);

    } catch (error) {
      console.error('Error creating items with duplicate detection:', error);
      res.status(500).json({ error: 'Failed to create items' });
    }
});

// GET all transcripts for a project
app.get('/api/transcripts',
  authenticateToken,
  requireRole('Stakeholder'),
  async (req, res) => {
    try {
      const { projectId } = req.query;
      
      if (!projectId) {
        return res.status(400).json({ error: 'Project ID required' });
      }
      
      const query = `
        SELECT 
          id, project_id, title, meeting_date, uploaded_by, uploaded_at,
          original_filename, file_size, status, 
          action_items_extracted, issues_extracted, avg_confidence,
          total_tokens, estimated_cost, processing_time_ms, error_message
        FROM meeting_transcripts
        WHERE project_id = $1
        ORDER BY uploaded_at DESC
      `;
      
      const result = await pool.query(query, [parseInt(projectId)]);
      res.json(result.rows);
      
    } catch (error) {
      console.error('Error fetching transcripts:', error);
      res.status(500).json({ error: 'Failed to fetch transcripts' });
    }
});

// GET single transcript with full text
app.get('/api/transcripts/:id',
  authenticateToken,
  requireRole('Stakeholder'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT * FROM meeting_transcripts
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [parseInt(id)]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Transcript not found' });
      }
      
      res.json(result.rows[0]);
      
    } catch (error) {
      console.error('Error fetching transcript:', error);
      res.status(500).json({ error: 'Failed to fetch transcript' });
    }
});

// DELETE transcript (soft delete by marking items)
app.delete('/api/transcripts/:id',
  authenticateToken,
  requireRole('Project Manager'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if transcript exists
      const checkQuery = `SELECT id FROM meeting_transcripts WHERE id = $1`;
      const checkResult = await pool.query(checkQuery, [parseInt(id)]);
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Transcript not found' });
      }
      
      // Delete the transcript
      const deleteQuery = `DELETE FROM meeting_transcripts WHERE id = $1`;
      await pool.query(deleteQuery, [parseInt(id)]);
      
      // Note: Items created from this transcript remain but transcript_id will be null
      // due to ON DELETE SET NULL constraint
      
      console.log(`Transcript ${id} deleted`);
      res.json({ message: 'Transcript deleted successfully' });
      
    } catch (error) {
      console.error('Error deleting transcript:', error);
      res.status(500).json({ error: 'Failed to delete transcript' });
    }
});

// Review Queue API Endpoints

// Save unmatched status update to review queue
app.post('/api/review-queue',
  authenticateToken,
  requireRole('Team Member'),
  async (req, res) => {
    try {
      const { projectId, transcriptId, unmatchedUpdate } = req.body;
      
      const result = await pool.query(`
        INSERT INTO status_update_review_queue (
          project_id, transcript_id, item_description, assignee,
          status_change, evidence, progress_details, ai_confidence,
          unmatched_reason, closest_match, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        projectId,
        transcriptId || null,
        unmatchedUpdate.update.itemDescription,
        unmatchedUpdate.update.assignee || null,
        unmatchedUpdate.update.statusChange,
        unmatchedUpdate.update.evidence,
        unmatchedUpdate.update.progressDetails || null,
        unmatchedUpdate.update.confidence || null,
        unmatchedUpdate.reason,
        unmatchedUpdate.closestMatch || null,
        req.user.id
      ]);
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error saving to review queue:', error);
      res.status(500).json({ error: 'Failed to save to review queue' });
    }
});

// Get all unresolved review queue items for a project
app.get('/api/review-queue',
  authenticateToken,
  requireRole('Stakeholder'),
  async (req, res) => {
    try {
      const { projectId } = req.query;
      
      if (!projectId) {
        return res.status(400).json({ error: 'Project ID required' });
      }
      
      const result = await pool.query(`
        SELECT * FROM status_update_review_queue
        WHERE project_id = $1 AND resolved = FALSE
        ORDER BY created_at DESC
      `, [parseInt(projectId)]);
      
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching review queue:', error);
      res.status(500).json({ error: 'Failed to fetch review queue' });
    }
});

// Search existing items (for in-modal search)
app.get('/api/search-items',
  authenticateToken,
  requireRole('Stakeholder'),
  async (req, res) => {
    try {
      const { projectId, query } = req.query;
      
      if (!projectId || !query) {
        return res.status(400).json({ error: 'Project ID and query required' });
      }
      
      const searchQuery = `%${query}%`;
      
      const actionItems = await pool.query(`
        SELECT id, title, description, status, assignee, 'action' as type
        FROM action_items
        WHERE project_id = $1 
        AND (title ILIKE $2 OR description ILIKE $2)
        AND status != 'Done' AND status != 'Cancelled'
        ORDER BY created_at DESC
        LIMIT 10
      `, [parseInt(projectId), searchQuery]);
      
      const issues = await pool.query(`
        SELECT id, title, description, status, assignee, 'issue' as type
        FROM issues
        WHERE project_id = $1 
        AND (title ILIKE $2 OR description ILIKE $2)
        AND status != 'Done' AND status != 'Cancelled'
        ORDER BY created_at DESC
        LIMIT 10
      `, [parseInt(projectId), searchQuery]);
      
      res.json({
        items: [...actionItems.rows, ...issues.rows]
      });
    } catch (error) {
      console.error('Error searching items:', error);
      res.status(500).json({ error: 'Failed to search items' });
    }
});

// Match review queue item to existing item and update status
app.post('/api/review-queue/:id/match',
  authenticateToken,
  requireRole('Team Member'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { itemId, itemType } = req.body;
      
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Get queue item details
        const queueItem = await client.query(`
          SELECT * FROM status_update_review_queue WHERE id = $1
        `, [parseInt(id)]);
        
        if (queueItem.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Queue item not found' });
        }
        
        const item = queueItem.rows[0];
        const table = itemType === 'issue' ? 'issues' : 'action_items';
        const commentTable = itemType === 'issue' ? 'issue_comments' : 'action_item_comments';
        const foreignKey = itemType === 'issue' ? 'issue_id' : 'action_item_id';
        
        // Get current item status
        const currentItem = await client.query(`
          SELECT status FROM ${table} WHERE id = $1
        `, [parseInt(itemId)]);
        
        if (currentItem.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Item not found' });
        }
        
        const oldStatus = currentItem.rows[0].status;
        
        // Update item status
        await client.query(`
          UPDATE ${table}
          SET status = $1, updated_at = NOW()
          WHERE id = $2
        `, [item.status_change, parseInt(itemId)]);
        
        // Add comment with evidence
        await client.query(`
          INSERT INTO ${commentTable} (${foreignKey}, user_id, comment, created_at)
          VALUES ($1, $2, $3, NOW())
        `, [
          parseInt(itemId),
          req.user.id,
          `🔄 Status updated via Review Queue\n\n` +
          `**Evidence:** "${item.evidence}"\n\n` +
          `**Status:** ${oldStatus} → ${item.status_change}\n\n` +
          (item.progress_details ? `**Details:** ${item.progress_details}\n\n` : '') +
          `**AI Confidence:** ${item.ai_confidence}%`
        ]);
        
        // Mark queue item as resolved
        await client.query(`
          UPDATE status_update_review_queue
          SET resolved = TRUE, resolved_at = NOW(), resolved_by = $1
          WHERE id = $2
        `, [req.user.id, parseInt(id)]);
        
        await client.query('COMMIT');
        
        res.json({ 
          message: 'Item matched and updated successfully',
          oldStatus,
          newStatus: item.status_change
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error matching queue item:', error);
      res.status(500).json({ error: 'Failed to match queue item' });
    }
});

// Dismiss/delete review queue item
app.delete('/api/review-queue/:id',
  authenticateToken,
  requireRole('Team Member'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      await pool.query(`
        UPDATE status_update_review_queue
        SET resolved = TRUE, resolved_at = NOW(), resolved_by = $1
        WHERE id = $2
      `, [req.user.id, parseInt(id)]);
      
      res.json({ message: 'Queue item dismissed' });
    } catch (error) {
      console.error('Error dismissing queue item:', error);
      res.status(500).json({ error: 'Failed to dismiss queue item' });
    }
});

// ==================== COMMENT ENDPOINTS ====================

app.get('/api/issues/:issueId/comments', authenticateToken, async (req, res) => {
  try {
    const { issueId } = req.params;
    
    const issueCheck = await pool.query(`
      SELECT i.project_id 
      FROM issues i
      WHERE i.id = $1
    `, [issueId]);
    
    if (issueCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const result = await pool.query(`
      SELECT 
        ic.*,
        u.username,
        u.email,
        COALESCE(
          (SELECT json_agg(json_build_object('id', um.id, 'username', um.username))
           FROM unnest(ic.mentions) AS mention_id
           JOIN users um ON um.id = mention_id),
          '[]'::json
        ) as mentioned_users
      FROM issue_comments ic
      JOIN users u ON ic.user_id = u.id
      WHERE ic.issue_id = $1
      ORDER BY ic.created_at ASC
    `, [issueId]);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/issues/:issueId/comments', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { issueId } = req.params;
    const { comment, parentCommentId } = req.body;
    
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }
    
    const issueCheck = await client.query(`
      SELECT i.*
      FROM issues i
      WHERE i.id = $1
    `, [issueId]);
    
    if (issueCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const issue = issueCheck.rows[0];
    
    await client.query('BEGIN');
    
    const mentionPattern = /@(\w+(?:\s+\w+)*)/g;
    const mentionMatches = [...comment.matchAll(mentionPattern)];
    const mentionedUsernames = mentionMatches.map(m => m[1]);
    
    let mentionedUserIds = [];
    if (mentionedUsernames.length > 0) {
      const allUsers = await client.query(`SELECT id, username FROM users`);
      const userMap = new Map(allUsers.rows.map(u => [
        u.username.toLowerCase().replace(/\s+/g, ''), 
        u
      ]));
      
      for (const mentioned of mentionedUsernames) {
        const words = mentioned.split(/\s+/);
        let matchedUser = null;
        
        for (let i = words.length; i >= 1; i--) {
          const candidate = words.slice(0, i).join(' ');
          const normalized = candidate.toLowerCase().replace(/\s+/g, '');
          
          if (userMap.has(normalized)) {
            matchedUser = userMap.get(normalized);
            break;
          }
        }
        
        if (matchedUser && !mentionedUserIds.includes(matchedUser.id)) {
          mentionedUserIds.push(matchedUser.id);
        }
      }
    }
    
    const commentResult = await client.query(`
      INSERT INTO issue_comments (
        issue_id, user_id, comment, parent_comment_id, mentions
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [issueId, req.user.id, comment, parentCommentId || null, mentionedUserIds]);
    
    const newComment = commentResult.rows[0];
    
    for (const mentionedUserId of mentionedUserIds) {
      if (mentionedUserId !== req.user.id) {
        await client.query(`
          INSERT INTO mention_notifications (
            user_id, comment_type, comment_id, item_id, item_title,
            mentioned_by
          )
          VALUES ($1, 'issue', $2, $3, $4, $5)
        `, [mentionedUserId, newComment.id, issueId, issue.title, req.user.id]);
      }
    }
    
    await client.query('COMMIT');
    
    const fullComment = await client.query(`
      SELECT 
        ic.*,
        u.username,
        u.email
      FROM issue_comments ic
      JOIN users u ON ic.user_id = u.id
      WHERE ic.id = $1
    `, [newComment.id]);
    
    res.status(201).json(fullComment.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  } finally {
    client.release();
  }
});

app.put('/api/issues/:issueId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { comment } = req.body;
    
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }
    
    const ownerCheck = await pool.query(
      'SELECT user_id FROM issue_comments WHERE id = $1',
      [commentId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only edit your own comments' });
    }
    
    const mentionPattern = /@(\w+(?:\s+\w+)*)/g;
    const mentionMatches = [...comment.matchAll(mentionPattern)];
    const mentionedUsernames = mentionMatches.map(m => m[1]);
    
    let mentionedUserIds = [];
    if (mentionedUsernames.length > 0) {
      const allUsers = await pool.query(`SELECT id, username FROM users`);
      const userMap = new Map(allUsers.rows.map(u => [
        u.username.toLowerCase().replace(/\s+/g, ''), 
        u
      ]));
      
      for (const mentioned of mentionedUsernames) {
        const words = mentioned.split(/\s+/);
        let matchedUser = null;
        
        for (let i = words.length; i >= 1; i--) {
          const candidate = words.slice(0, i).join(' ');
          const normalized = candidate.toLowerCase().replace(/\s+/g, '');
          
          if (userMap.has(normalized)) {
            matchedUser = userMap.get(normalized);
            break;
          }
        }
        
        if (matchedUser && !mentionedUserIds.includes(matchedUser.id)) {
          mentionedUserIds.push(matchedUser.id);
        }
      }
    }
    
    const result = await pool.query(`
      UPDATE issue_comments
      SET comment = $1, updated_at = NOW(), edited = TRUE, mentions = $2
      WHERE id = $3
      RETURNING *
    `, [comment, mentionedUserIds, commentId]);
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

app.delete('/api/issues/:issueId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { issueId, commentId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        ic.user_id as comment_owner
      FROM issue_comments ic
      WHERE ic.id = $1 AND ic.issue_id = $2
    `, [commentId, issueId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const { comment_owner } = result.rows[0];
    
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const canDelete = comment_owner === req.user.id || userRoleLevel >= ROLE_HIERARCHY['Project Manager'];
    
    if (!canDelete) {
      return res.status(403).json({ 
        error: 'Can only delete your own comments unless you are a manager' 
      });
    }
    
    await pool.query('DELETE FROM issue_comments WHERE id = $1', [commentId]);
    
    res.json({ success: true, message: 'Comment deleted' });
    
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

app.get('/api/action-items/:itemId/comments', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const issueCheck = await pool.query(`
      SELECT ai.project_id 
      FROM action_items ai
      WHERE ai.id = $1
    `, [itemId]);
    
    if (issueCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const result = await pool.query(`
      SELECT 
        aic.*,
        u.username,
        u.email,
        COALESCE(
          (SELECT json_agg(json_build_object('id', um.id, 'username', um.username))
           FROM unnest(aic.mentions) AS mention_id
           JOIN users um ON um.id = mention_id),
          '[]'::json
        ) as mentioned_users
      FROM action_item_comments aic
      JOIN users u ON aic.user_id = u.id
      WHERE aic.action_item_id = $1
      ORDER BY aic.created_at ASC
    `, [itemId]);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/action-items/:itemId/comments', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { itemId } = req.params;
    const { comment, parentCommentId } = req.body;
    
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }
    
    const itemCheck = await client.query(`
      SELECT ai.*
      FROM action_items ai
      WHERE ai.id = $1
    `, [itemId]);
    
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const item = itemCheck.rows[0];
    
    await client.query('BEGIN');
    
    const mentionPattern = /@(\w+(?:\s+\w+)*)/g;
    const mentionMatches = [...comment.matchAll(mentionPattern)];
    const mentionedUsernames = mentionMatches.map(m => m[1]);
    
    let mentionedUserIds = [];
    if (mentionedUsernames.length > 0) {
      const allUsers = await client.query(`SELECT id, username FROM users`);
      const userMap = new Map(allUsers.rows.map(u => [
        u.username.toLowerCase().replace(/\s+/g, ''), 
        u
      ]));
      
      for (const mentioned of mentionedUsernames) {
        const words = mentioned.split(/\s+/);
        let matchedUser = null;
        
        for (let i = words.length; i >= 1; i--) {
          const candidate = words.slice(0, i).join(' ');
          const normalized = candidate.toLowerCase().replace(/\s+/g, '');
          
          if (userMap.has(normalized)) {
            matchedUser = userMap.get(normalized);
            break;
          }
        }
        
        if (matchedUser && !mentionedUserIds.includes(matchedUser.id)) {
          mentionedUserIds.push(matchedUser.id);
        }
      }
    }
    
    const commentResult = await client.query(`
      INSERT INTO action_item_comments (
        action_item_id, user_id, comment, parent_comment_id, mentions
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [itemId, req.user.id, comment, parentCommentId || null, mentionedUserIds]);
    
    const newComment = commentResult.rows[0];
    
    for (const mentionedUserId of mentionedUserIds) {
      if (mentionedUserId !== req.user.id) {
        await client.query(`
          INSERT INTO mention_notifications (
            user_id, comment_type, comment_id, item_id, item_title,
            mentioned_by
          )
          VALUES ($1, 'action_item', $2, $3, $4, $5)
        `, [mentionedUserId, newComment.id, itemId, item.title, req.user.id]);
      }
    }
    
    await client.query('COMMIT');
    
    const fullComment = await client.query(`
      SELECT 
        aic.*,
        u.username,
        u.email
      FROM action_item_comments aic
      JOIN users u ON aic.user_id = u.id
      WHERE aic.id = $1
    `, [newComment.id]);
    
    res.status(201).json(fullComment.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  } finally {
    client.release();
  }
});

app.put('/api/action-items/:itemId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { comment } = req.body;
    
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }
    
    const ownerCheck = await pool.query(
      'SELECT user_id FROM action_item_comments WHERE id = $1',
      [commentId]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only edit your own comments' });
    }
    
    const mentionPattern = /@(\w+(?:\s+\w+)*)/g;
    const mentionMatches = [...comment.matchAll(mentionPattern)];
    const mentionedUsernames = mentionMatches.map(m => m[1]);
    
    let mentionedUserIds = [];
    if (mentionedUsernames.length > 0) {
      const allUsers = await pool.query(`SELECT id, username FROM users`);
      const userMap = new Map(allUsers.rows.map(u => [
        u.username.toLowerCase().replace(/\s+/g, ''), 
        u
      ]));
      
      for (const mentioned of mentionedUsernames) {
        const words = mentioned.split(/\s+/);
        let matchedUser = null;
        
        for (let i = words.length; i >= 1; i--) {
          const candidate = words.slice(0, i).join(' ');
          const normalized = candidate.toLowerCase().replace(/\s+/g, '');
          
          if (userMap.has(normalized)) {
            matchedUser = userMap.get(normalized);
            break;
          }
        }
        
        if (matchedUser && !mentionedUserIds.includes(matchedUser.id)) {
          mentionedUserIds.push(matchedUser.id);
        }
      }
    }
    
    const result = await pool.query(`
      UPDATE action_item_comments
      SET comment = $1, updated_at = NOW(), edited = TRUE, mentions = $2
      WHERE id = $3
      RETURNING *
    `, [comment, mentionedUserIds, commentId]);
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

app.delete('/api/action-items/:itemId/comments/:commentId', authenticateToken, async (req, res) => {
  try {
    const { itemId, commentId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        aic.user_id as comment_owner
      FROM action_item_comments aic
      WHERE aic.id = $1 AND aic.action_item_id = $2
    `, [commentId, itemId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const { comment_owner } = result.rows[0];
    
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const canDelete = comment_owner === req.user.id || userRoleLevel >= ROLE_HIERARCHY['Project Manager'];
    
    if (!canDelete) {
      return res.status(403).json({ 
        error: 'Can only delete your own comments unless you are a manager' 
      });
    }
    
    await pool.query('DELETE FROM action_item_comments WHERE id = $1', [commentId]);
    
    res.json({ success: true, message: 'Comment deleted' });
    
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ==================== MENTION NOTIFICATIONS ====================

app.get('/api/mentions', authenticateToken, async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    
    let query = `
      SELECT 
        mn.*,
        u.username as mentioned_by_username
      FROM mention_notifications mn
      JOIN users u ON mn.mentioned_by = u.id
      WHERE mn.user_id = $1
    `;
    
    if (unreadOnly === 'true') {
      query += ' AND mn.read = FALSE';
    }
    
    query += ' ORDER BY mn.created_at DESC LIMIT 50';
    
    const result = await pool.query(query, [req.user.id]);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching mentions:', error);
    res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

app.put('/api/mentions/:mentionId/read', authenticateToken, async (req, res) => {
  try {
    const { mentionId } = req.params;
    
    const result = await pool.query(`
      UPDATE mention_notifications
      SET read = TRUE, read_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [mentionId, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mention not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error marking mention as read:', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

app.put('/api/mentions/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(`
      UPDATE mention_notifications
      SET read = TRUE, read_at = NOW()
      WHERE user_id = $1 AND read = FALSE
    `, [req.user.id]);
    
    res.json({ success: true, message: 'All mentions marked as read' });
    
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

app.get('/api/mentions/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM mention_notifications
      WHERE user_id = $1 AND read = FALSE
    `, [req.user.id]);
    
    res.json({ count: parseInt(result.rows[0].count) });
    
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get count' });
  }
});

app.get('/api/projects/:projectId/members', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Verify project exists
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Return all users (for @mentions) with their global role
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role
      FROM users u
      ORDER BY u.username ASC
    `);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Serve frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "production" ? {} : err.message,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Multi-Project Tracker running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📋 API Endpoints:`);
  console.log(`   POST /api/auth/register`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/auth/logout`);
  console.log(`   GET  /api/auth/me`);
  console.log(`   GET  /api/projects`);
  console.log(`   POST /api/projects`);
  console.log(`   GET  /api/issues`);
  console.log(`   POST /api/issues`);
  console.log(`   GET  /api/action-items`);
  console.log(`   POST /api/action-items`);
  console.log(`   GET  /api/users`);
});
