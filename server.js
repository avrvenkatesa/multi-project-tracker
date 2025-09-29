const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// Database helper functions using raw SQL
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

// Helper functions for project metadata
function getDefaultCategories(template) {
  const categories = {
    'web-development': ['Frontend', 'Backend', 'Database', 'API', 'UI/UX', 'Testing'],
    'mobile-app': ['iOS', 'Android', 'Cross-Platform', 'Backend', 'API', 'Testing'],
    'data-science': ['Data Collection', 'Data Processing', 'Analysis', 'Modeling', 'Visualization', 'Deployment'],
    'marketing': ['Campaign', 'Content', 'Social Media', 'Analytics', 'Design', 'Research'],
    'generic': ['Technical', 'Process', 'Communication', 'Resource', 'Risk', 'Documentation']
  };
  return categories[template] || categories['generic'];
}

function getDefaultPhases(template) {
  const phases = {
    'web-development': ['Planning', 'Design', 'Development', 'Testing', 'Deployment', 'Maintenance'],
    'mobile-app': ['Concept', 'Design', 'Development', 'Testing', 'App Store', 'Support'],
    'data-science': ['Discovery', 'Preparation', 'Modeling', 'Evaluation', 'Deployment', 'Monitoring'],
    'marketing': ['Research', 'Strategy', 'Creative', 'Execution', 'Analysis', 'Optimization'],
    'generic': ['Planning', 'Execution', 'Testing', 'Deployment', 'Closure']
  };
  return phases[template] || phases['generic'];
}

function getDefaultComponents(template) {
  const components = {
    'web-development': ['Frontend App', 'Backend API', 'Database', 'Authentication', 'Integration', 'Documentation'],
    'mobile-app': ['Mobile App', 'Backend Service', 'Database', 'Push Notifications', 'Analytics', 'Store Listing'],
    'data-science': ['Data Pipeline', 'ML Model', 'Feature Engineering', 'Model Training', 'API Service', 'Dashboard'],
    'marketing': ['Creative Assets', 'Landing Pages', 'Email Campaign', 'Social Content', 'Analytics', 'A/B Tests'],
    'generic': ['Component A', 'Component B', 'Component C', 'Integration', 'Documentation']
  };
  return components[template] || components['generic'];
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.tailwindcss.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Authentication Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Optional authentication (doesn't fail if no token)
function optionalAuth(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Invalid token, but continue anyway
      req.user = null;
    }
  } else {
    req.user = null;
  }
  
  next();
}

// ==================== AUTH ENDPOINTS ====================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Check if user already exists
    const existingUser = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`;
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const [newUser] = await sql`
      INSERT INTO users (username, email, password, role)
      VALUES (${name.trim()}, ${email.toLowerCase()}, ${hashedPassword}, ${role || 'Team Member'})
      RETURNING id, username, email, role, created_at
    `;
    
    // Generate token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    res.status(201).json({
      user: newUser,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user by email
    const [user] = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

// ==================== EXISTING ENDPOINTS ====================

// API Routes
app.get("/api/health", optionalAuth, (req, res) => {
  res.json({
    status: "OK",
    message: "Multi-Project Tracker API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    user: req.user ? req.user.username : 'Not authenticated',
    features: [
      "Multi-project support",
      "Issue tracking",
      "Action item management",
      "User authentication",
      "Drag-and-drop Kanban",
      "AI integration ready",
    ],
  });
});

// Projects API - Get projects (optional auth to show user context)
app.get("/api/projects", optionalAuth, async (req, res) => {
  try {
    const allProjects = await sql`SELECT * FROM projects ORDER BY created_at DESC`;
    
    // Add derived fields for each project (categories, phases, components)
    const projectsWithMetadata = allProjects.map(project => ({
      ...project,
      status: project.status || "active",
      categories: getDefaultCategories(project.template || 'generic'),
      phases: getDefaultPhases(project.template || 'generic'),
      components: getDefaultComponents(project.template || 'generic')
    }));
    
    res.json(projectsWithMetadata);
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

app.post("/api/projects", authenticateToken, async (req, res) => {
  try {
    const { name, description, template } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    const [newProject] = await sql`
      INSERT INTO projects (name, description, template, created_by)
      VALUES (${name}, ${description || ''}, ${template || 'generic'}, ${req.user.username})
      RETURNING *
    `;
    
    // Add derived fields for compatibility
    const projectWithMetadata = {
      ...newProject,
      status: newProject.status || "active",
      categories: getDefaultCategories(newProject.template),
      phases: getDefaultPhases(newProject.template),
      components: getDefaultComponents(newProject.template)
    };
    
    res.status(201).json(projectWithMetadata);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Issues API - Get issues (optional auth)
app.get('/api/issues', optionalAuth, async (req, res) => {
  try {
    const { projectId, status, priority, assignee, category } = req.query;
    
    let query;
    if (projectId) {
      query = sql`SELECT * FROM issues WHERE project_id = ${projectId}`;
    } else {
      query = sql`SELECT * FROM issues`;
    }
    
    const issues = await query;
    res.json(issues);
  } catch (error) {
    console.error('Error getting issues:', error);
    res.status(500).json({ error: 'Failed to get issues' });
  }
});

app.post('/api/issues', authenticateToken, async (req, res) => {
  const { 
    title, 
    description, 
    priority, 
    category, 
    phase, 
    component, 
    assignee, 
    dueDate, 
    projectId,
    type = 'issue'
  } = req.body;
  
  // Validation
  if (!title || !projectId) {
    return res.status(400).json({ 
      error: 'Title and Project ID are required' 
    });
  }
  
  try {
    // Verify project exists
    const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
    if (!project) {
      return res.status(404).json({ 
        error: 'Project not found' 
      });
    }
    
    // Create issue in database
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
        ${req.user.id}
      ) RETURNING *
    `;
    
    res.status(201).json(newIssue);
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

// Action Items API
app.get("/api/action-items", optionalAuth, async (req, res) => {
  try {
    const { projectId } = req.query;
    let query;
    if (projectId) {
      query = sql`SELECT * FROM action_items WHERE project_id = ${projectId}`;
    } else {
      query = sql`SELECT * FROM action_items`;
    }
    const actionItems = await query;
    res.json(actionItems);
  } catch (error) {
    console.error('Error getting action items:', error);
    res.status(500).json({ error: 'Failed to get action items' });
  }
});

app.post("/api/action-items", authenticateToken, async (req, res) => {
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
        ${req.user.id}
      ) RETURNING *
    `;
    
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating action item:', error);
    res.status(500).json({ error: 'Failed to create action item' });
  }
});

// Users API
app.get("/api/users", (req, res) => {
  res.json(users);
});

// Helper functions for default project configurations
function getDefaultCategories(template) {
  const templates = {
    "cloud-migration": [
      "Technical",
      "Security",
      "Network",
      "Data Migration",
      "Testing",
      "Documentation",
    ],
    "software-development": [
      "Bug",
      "Feature",
      "Enhancement",
      "Documentation",
      "Testing",
      "DevOps",
    ],
    infrastructure: [
      "Hardware",
      "Network",
      "Security",
      "Monitoring",
      "Backup",
      "Maintenance",
    ],
    generic: [
      "Technical",
      "Process",
      "Communication",
      "Resource",
      "Risk",
      "Documentation",
    ],
  };
  return templates[template] || templates["generic"];
}

function getDefaultPhases(template) {
  const templates = {
    "cloud-migration": [
      "Assessment",
      "Planning",
      "Migration",
      "Testing",
      "Optimization",
      "Hypercare",
    ],
    "software-development": [
      "Requirements",
      "Design",
      "Development",
      "Testing",
      "Deployment",
      "Maintenance",
    ],
    infrastructure: [
      "Planning",
      "Procurement",
      "Installation",
      "Configuration",
      "Testing",
      "Production",
    ],
    generic: ["Planning", "Execution", "Testing", "Deployment", "Closure"],
  };
  return templates[template] || templates["generic"];
}

function getDefaultComponents(template) {
  const templates = {
    "cloud-migration": [
      "Application",
      "Database",
      "Storage",
      "Network",
      "Security",
      "Monitoring",
    ],
    "software-development": [
      "Frontend",
      "Backend",
      "Database",
      "API",
      "UI/UX",
      "Testing",
    ],
    infrastructure: [
      "Servers",
      "Network",
      "Storage",
      "Security",
      "Monitoring",
      "Backup",
    ],
    generic: [
      "Component A",
      "Component B",
      "Component C",
      "Integration",
      "Documentation",
    ],
  };
  return templates[template] || templates["generic"];
}

// Serve React app (when built)
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
