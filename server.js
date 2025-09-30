const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { neon, Pool } = require("@neondatabase/serverless");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRY = "7d";

// Database connection
const sql = neon(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

app.use(cors({
  origin: true,
  credentials: true
}));

// Trust proxy (required for Replit environment)
app.set('trust proxy', true);

// Rate limiting (configured for proxied environment)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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
      INSERT INTO projects (name, description, template, created_by, status)
      VALUES (
        ${name}, 
        ${description || ''}, 
        ${template || 'generic'},
        ${req.user.id.toString()},
        'active'
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

// Create issue (Team Member or higher)
app.post('/api/issues', authenticateToken, requireRole('Team Member'), async (req, res) => {
  const { 
    title, 
    description, 
    priority, 
    category, 
    assignee, 
    dueDate, 
    projectId
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
        due_date, project_id, status, created_by
      ) VALUES (
        ${title.trim()}, 
        ${description?.trim() || ''}, 
        ${priority || 'medium'}, 
        ${category || 'General'}, 
        ${assignee || ''}, 
        ${dueDate || null}, 
        ${parseInt(projectId)}, 
        'To Do',
        ${req.user.id.toString()}
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

// Create action item (Team Member or higher)
app.post("/api/action-items", authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { title, description, projectId, priority, assignee, dueDate } = req.body;
    
    if (!title || !projectId) {
      return res.status(400).json({ error: 'Title and Project ID are required' });
    }
    
    const [newItem] = await sql`
      INSERT INTO action_items (
        title, description, project_id, priority, assignee, 
        due_date, status, created_by
      ) VALUES (
        ${title.trim()}, 
        ${description?.trim() || ''}, 
        ${parseInt(projectId)}, 
        ${priority || 'medium'}, 
        ${assignee || ''}, 
        ${dueDate || null}, 
        'To Do',
        ${req.user.id.toString()}
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
