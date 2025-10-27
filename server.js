const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { neon, Pool, neonConfig } = require("@neondatabase/serverless");
const ws = require("ws");
const multer = require('multer');
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const notificationService = require('./services/notificationService');
const reportService = require('./services/reportService');
const teamsNotifications = require('./services/teamsNotifications');
const { generateChecklistFromIssue, generateChecklistFromActionItem, generateMultipleChecklists, checkRateLimit } = require('./services/ai-service');
const { 
  saveChecklistAsTemplate, 
  getTemplateLibrary, 
  getTemplateDetails, 
  updateTemplateMetadata, 
  deactivateTemplate, 
  rateTemplate, 
  toggleFeatured, 
  applyTemplate,
  getTemplateCategories,
  getActionItemCategories,
  getIssueTypeTemplateMappings,
  getActionCategoryTemplateMappings,
  saveIssueTypeTemplateMapping,
  saveActionCategoryTemplateMapping,
  autoCreateChecklistForIssue,
  autoCreateChecklistForActionItem
} = require('./services/template-service');
const {
  generateEffortEstimate,
  generateEstimateFromItem,
  getEstimateBreakdown,
  getEstimateHistory
} = require('./services/effort-estimation-service');
const {
  validateStatusChange,
  quickLogTime,
  logTimeWithStatusChange,
  getTimeTrackingHistory,
  getTimeTrackingSummary
} = require('./services/time-tracking-service');
const timeEntriesService = require('./services/time-entries-service');
const { rateLimitMiddleware, getUsageStats } = require('./middleware/ai-rate-limiter');
const { analyzeDocumentForWorkstreams } = require('./services/document-analyzer');
const { extractTextFromFile } = require('./services/file-processor');
const { initializeDailyJobs } = require('./jobs/dailyNotifications');
const { generateChecklistPDF } = require('./services/pdf-service');
const { validateChecklist, getValidationStatus } = require('./services/validation-service');
const dependencyService = require('./services/dependency-service');
const documentService = require('./services/document-service');
const { calculateProjectSchedule } = require('./services/schedule-calculation-service');
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;

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

// Configure multer for transcript uploads
const transcriptUpload = multer({ 
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

// Configure file attachment storage system
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/zip'
];

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

ensureUploadDir();

// Configure multer for file attachments
const attachmentStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5 // Max 5 files per upload
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_ATTACHMENT_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  }
});

// Configure multer for document extraction (Phase 3b Feature 6)
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, and TXT files are allowed'));
    }
  }
});

// =====================================================
// ATTACHMENT UTILITY FUNCTIONS
// =====================================================

/**
 * Get human-readable file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Sanitize filename for safe storage
 */
function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Check if user can delete attachment
 */
function canDeleteAttachment(user, attachment) {
  return parseInt(user.id, 10) === parseInt(attachment.uploaded_by, 10) ||
         user.role === 'System Administrator' ||
         user.role === 'Project Manager';
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
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
// High limit for production since all users come through Replit proxy
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000, // Increased for production proxy environment
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

// Serve static files with no-cache for JS files to prevent browser caching issues
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    // Force no-cache on JavaScript files
    if (filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

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

// Admin Authorization Middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'System Administrator') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
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
    const { username, email, password, invitationToken } = req.body;

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
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    // If invitation token provided, store it in a separate cookie
    if (invitationToken) {
      res.cookie('pendingInvitation', invitationToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
        path: '/'
      });
    }

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      },
      hasPendingInvitation: !!invitationToken
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password, invitationToken } = req.body;

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
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    // If invitation token provided, store it in a separate cookie
    if (invitationToken) {
      res.cookie('pendingInvitation', invitationToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
        path: '/'
      });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      hasPendingInvitation: !!invitationToken
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

// ============= NOTIFICATION PREFERENCES ROUTES =============

// ============= RISK REGISTER UTILITY FUNCTIONS =============
// RISK REGISTER UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if user has access to a project
 */
async function checkProjectAccess(userId, projectId, userRole = null) {
  // System Administrators have access to all projects
  if (userRole === 'System Administrator') {
    return true;
  }
  
  const result = await pool.query(`
    SELECT * FROM project_members 
    WHERE user_id = $1 AND project_id = $2 AND status = 'active'
  `, [userId, projectId]);
  
  return result.rows.length > 0;
}

/**
 * Generate unique risk ID for a project
 * Format: RISK-001, RISK-002, etc.
 */
async function generateRiskId(projectId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM risks WHERE project_id = $1',
    [projectId]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `RISK-${count.toString().padStart(3, '0')}`;
}

/**
 * Calculate risk score and level from probability and impact
 */
function calculateRiskScore(probability, impact) {
  const score = probability * impact;
  let level, color;
  
  if (score <= 6) {
    level = 'Low';
    color = '#10b981';
  } else if (score <= 12) {
    level = 'Medium';
    color = '#f59e0b';
  } else if (score <= 20) {
    level = 'High';
    color = '#f97316';
  } else {
    level = 'Critical';
    color = '#ef4444';
  }
  
  return { score, level, color };
}

/**
 * Check if user can perform risk action
 */
function canPerformRiskAction(user, action, risk = null) {
  const permissions = {
    VIEW_RISKS: ['System Administrator', 'Project Manager', 'Team Lead', 'Team Member', 'Stakeholder'],
    CREATE_RISK: ['System Administrator', 'Project Manager', 'Team Lead'],
    EDIT_ANY_RISK: ['System Administrator', 'Project Manager'],
    EDIT_OWN_RISK: ['System Administrator', 'Project Manager', 'Team Lead', 'Team Member'],
    DELETE_RISK: ['System Administrator', 'Project Manager']
  };
  
  const allowedRoles = permissions[action];
  if (!allowedRoles) return false;
  
  // Check global role
  if (allowedRoles.includes(user.role)) {
    // For edit own risk - verify user is the risk owner
    if (action === 'EDIT_OWN_RISK' && risk && user.id === risk.risk_owner_id) {
      return true;
    }
    // For other actions, role check is sufficient
    if (action !== 'EDIT_OWN_RISK') {
      return true;
    }
  }
  
  return false;
}

// =====================================================
// CHECKLIST UTILITY FUNCTIONS
// =====================================================

/**
 * Generate unique checklist ID
 */
function generateChecklistId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `CHK-${timestamp}-${random}`;
}

/**
 * Get user's accessible projects for permission checking
 */
async function getUserProjectIds(userId) {
  const result = await pool.query(
    `SELECT project_id FROM project_members WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  return result.rows.map(row => row.project_id);
}

/**
 * Check if user has access to checklist
 */
async function canAccessChecklist(userId, checklistId) {
  const result = await pool.query(
    `SELECT c.id 
     FROM checklists c
     INNER JOIN project_members pm ON c.project_id = pm.project_id
     WHERE c.id = $1 AND pm.user_id = $2 AND pm.status = 'active'`,
    [checklistId, userId]
  );
  return result.rows.length > 0;
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Multi-Project Tracker API is running"
  });
});

// Get user notification preferences
app.get('/api/notifications/preferences', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_notification_preferences WHERE user_id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        mentions_enabled: true,
        assignments_enabled: true,
        status_changes_enabled: true,
        invitations_enabled: true,
        email_frequency: 'immediate'
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update notification preferences
app.put('/api/notifications/preferences', authenticateToken, async (req, res) => {
  try {
    const { mentions_enabled, assignments_enabled, status_changes_enabled, invitations_enabled, email_frequency } = req.body;
    
    await pool.query(`
      INSERT INTO user_notification_preferences 
      (user_id, mentions_enabled, assignments_enabled, status_changes_enabled, invitations_enabled, email_frequency)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        mentions_enabled = $2,
        assignments_enabled = $3,
        status_changes_enabled = $4,
        invitations_enabled = $5,
        email_frequency = $6,
        updated_at = CURRENT_TIMESTAMP
    `, [req.user.id, mentions_enabled, assignments_enabled, status_changes_enabled, invitations_enabled, email_frequency]);
    
    res.json({ success: true, message: 'Preferences updated' });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Send test email
app.post('/api/notifications/test-email', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const appUrl = getAppUrl();
    
    await sendEmail({
      to: user.email,
      subject: 'Test Email from Multi-Project Tracker',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Test Email Successful!</h2>
          <p>Hello ${escapeHtml(user.username || user.email)},</p>
          <p>This is a test email from the Multi-Project Tracker notification system.</p>
          <p>If you're receiving this email, your notification settings are working correctly!</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            <a href="${appUrl}/notification-settings.html" style="color: #2563eb;">Manage your notification settings</a>
          </p>
        </div>
      `,
      text: `Test Email Successful!\n\nHello ${user.username || user.email},\n\nThis is a test email from the Multi-Project Tracker notification system.\n\nIf you're receiving this email, your notification settings are working correctly!\n\nManage your notification settings: ${appUrl}/notification-settings.html`
    });

    console.log(`📧 Test email sent to ${user.email}`);
    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Unsubscribe from all notifications
app.get('/api/notifications/unsubscribe/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const result = await pool.query(
      'SELECT user_id FROM unsubscribe_tokens WHERE token = $1 AND used_at IS NULL',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unsubscribe</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Invalid Link</h1>
          <p>This unsubscribe link is invalid or has already been used.</p>
        </body>
        </html>
      `);
    }
    
    const userId = result.rows[0].user_id;
    
    // Disable all notifications
    await pool.query(`
      INSERT INTO user_notification_preferences 
      (user_id, mentions_enabled, assignments_enabled, status_changes_enabled, invitations_enabled)
      VALUES ($1, false, false, false, false)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        mentions_enabled = false,
        assignments_enabled = false,
        status_changes_enabled = false,
        invitations_enabled = false,
        updated_at = CURRENT_TIMESTAMP
    `, [userId]);
    
    // Mark token as used
    await pool.query(
      'UPDATE unsubscribe_tokens SET used_at = CURRENT_TIMESTAMP WHERE token = $1',
      [token]
    );
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f3f4f6; }
          .container { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          h1 { color: #2563eb; }
          p { color: #4b5563; line-height: 1.6; }
          a { color: #2563eb; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✓ Unsubscribed Successfully</h1>
          <p>You have been unsubscribed from all email notifications.</p>
          <p>You can re-enable notifications anytime in your <a href="/notification-settings.html">notification settings</a>.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).send('Failed to unsubscribe');
  }
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
      SET role = ${role}
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

// Get all projects (exclude archived)
app.get("/api/projects", authenticateToken, async (req, res) => {
  try {
    const projects = await sql`
      SELECT * FROM projects 
      WHERE (archived = FALSE OR archived IS NULL)
      ORDER BY created_at DESC
    `;
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get single project by ID
app.get("/api/projects/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user has access to this project
    const hasAccess = await checkProjectAccess(req.user.id, id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    
    const [project] = await sql`
      SELECT * FROM projects 
      WHERE id = ${id}
    `;
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
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

    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${newProject.id}, ${req.user.id}, 'Admin')
    `;

    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project details
app.put("/api/projects/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, template, start_date, end_date, teams_webhook_url, teams_notifications_enabled, checklist_completion_enabled } = req.body;
    
    const [membership] = await sql`
      SELECT role FROM project_members 
      WHERE project_id = ${id} AND user_id = ${req.user.id}
    `;
    
    const isAdmin = req.user.role === 'System Administrator';
    const isProjectAdmin = membership && (membership.role === 'Admin' || membership.role === 'Manager');
    
    if (!isAdmin && !isProjectAdmin) {
      return res.status(403).json({ error: 'Only project admins can edit project details' });
    }
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    // Get current project to preserve existing values
    const [currentProject] = await sql`SELECT * FROM projects WHERE id = ${id}`;
    
    if (!currentProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Determine final values with proper handling
    const finalWebhookUrl = teams_webhook_url !== undefined ? teams_webhook_url : currentProject.teams_webhook_url;
    const finalNotificationsEnabled = teams_notifications_enabled !== undefined ? teams_notifications_enabled : (currentProject.teams_notifications_enabled !== undefined ? currentProject.teams_notifications_enabled : true);
    const finalChecklistCompletionEnabled = checklist_completion_enabled !== undefined ? checklist_completion_enabled : (currentProject.checklist_completion_enabled !== undefined ? currentProject.checklist_completion_enabled : true);
    
    const [updatedProject] = await sql`
      UPDATE projects 
      SET 
        name = ${name},
        description = ${description || null},
        template = ${template || 'generic'},
        start_date = ${start_date || null},
        end_date = ${end_date || null},
        teams_webhook_url = ${finalWebhookUrl || null},
        teams_notifications_enabled = ${finalNotificationsEnabled},
        checklist_completion_enabled = ${finalChecklistCompletionEnabled},
        updated_by = ${req.user.id}
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (!updatedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({
      message: 'Project updated successfully',
      project: updatedProject
    });
    
  } catch (error) {
    console.error('Update project error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      projectId: req.params.id,
      updateData: req.body
    });
    res.status(500).json({ error: 'Failed to update project', details: error.message });
  }
});

// Archive project
app.post("/api/projects/:id/archive", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [membership] = await sql`
      SELECT role FROM project_members 
      WHERE project_id = ${id} AND user_id = ${req.user.id}
    `;
    
    const isAdmin = req.user.role === 'System Administrator';
    const isProjectAdmin = membership && membership.role === 'Admin';
    
    if (!isAdmin && !isProjectAdmin) {
      return res.status(403).json({ error: 'Only project admins can archive projects' });
    }
    
    const [archivedProject] = await sql`
      UPDATE projects 
      SET 
        archived = TRUE,
        archived_at = NOW(),
        archived_by = ${req.user.id}
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (!archivedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({
      message: 'Project archived successfully',
      project: archivedProject
    });
    
  } catch (error) {
    console.error('Archive project error:', error);
    res.status(500).json({ error: 'Failed to archive project' });
  }
});

// Restore archived project
app.post("/api/projects/:id/restore", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [membership] = await sql`
      SELECT role FROM project_members 
      WHERE project_id = ${id} AND user_id = ${req.user.id}
    `;
    
    const isAdmin = req.user.role === 'System Administrator';
    const isProjectAdmin = membership && membership.role === 'Admin';
    
    if (!isAdmin && !isProjectAdmin) {
      return res.status(403).json({ error: 'Only project admins can restore projects' });
    }
    
    const [restoredProject] = await sql`
      UPDATE projects 
      SET 
        archived = FALSE,
        archived_at = NULL,
        archived_by = NULL
      WHERE id = ${id}
      RETURNING *
    `;
    
    if (!restoredProject) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({
      message: 'Project restored successfully',
      project: restoredProject
    });
    
  } catch (error) {
    console.error('Restore project error:', error);
    res.status(500).json({ error: 'Failed to restore project' });
  }
});

// Get archived projects
app.get("/api/projects/archived", authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'System Administrator';
    
    let archivedProjects;
    
    if (isAdmin) {
      archivedProjects = await sql`
        SELECT 
          p.*,
          u.username as archived_by_username
        FROM projects p
        LEFT JOIN users u ON p.archived_by = u.id
        WHERE p.archived = TRUE
        ORDER BY p.archived_at DESC
      `;
    } else {
      archivedProjects = await sql`
        SELECT 
          p.*,
          u.username as archived_by_username,
          pm.role as user_role
        FROM projects p
        INNER JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN users u ON p.archived_by = u.id
        WHERE p.archived = TRUE AND pm.user_id = ${req.user.id}
        ORDER BY p.archived_at DESC
      `;
    }
    
    res.json({ projects: archivedProjects });
    
  } catch (error) {
    console.error('Get archived projects error:', error);
    res.status(500).json({ error: 'Failed to fetch archived projects' });
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
      SELECT * FROM (
        SELECT DISTINCT ON (u.id)
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
        ORDER BY u.id, pm.joined_at DESC
      ) unique_members
      ORDER BY role, joined_at
    `, [projectId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Team endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to check if user is Manager+ in a project
async function isProjectManager(userId, projectId) {
  const result = await pool.query(`
    SELECT role FROM project_members 
    WHERE user_id = $1 AND project_id = $2 AND status = 'active'
  `, [userId, projectId]);
  
  if (result.rows.length === 0) return false;
  
  const role = result.rows[0].role;
  return role === 'Admin' || role === 'Manager';
}

// 1. POST /api/projects/:projectId/team/invite - Send team invitation
app.post('/api/projects/:projectId/team/invite', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, role, message } = req.body;
    
    console.log(`[INVITE] User ${req.user.id} inviting ${email} to project ${projectId} as ${role}`);
    
    // Check if user is Manager+ in this project OR is a System Administrator
    const isSystemAdmin = req.user.role === 'System Administrator';
    const isManager = await isProjectManager(req.user.id, projectId);
    
    if (!isSystemAdmin && !isManager) {
      return res.status(403).json({ error: 'Only project Managers, Admins, or System Administrators can invite members' });
    }
    
    // Validate role
    const validRoles = ['Admin', 'Manager', 'Member', 'Viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be Admin, Manager, Member, or Viewer' });
    }
    
    // Check if email is already a member
    const existingMember = await pool.query(`
      SELECT pm.id FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = $1 AND u.email = $2 AND pm.status = 'active'
    `, [projectId, email]);
    
    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }
    
    // Check if there's already a pending invitation
    const existingInvitation = await pool.query(`
      SELECT id FROM project_invitations
      WHERE project_id = $1 AND invitee_email = $2 AND status = 'pending' AND expires_at > NOW()
    `, [projectId, email]);
    
    if (existingInvitation.rows.length > 0) {
      return res.status(400).json({ error: 'A pending invitation already exists for this email' });
    }
    
    // Generate unique invitation token
    const invitationToken = crypto.randomBytes(32).toString('hex');
    
    // Set expiry to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    // Check if user exists with this email
    const userResult = await pool.query(`
      SELECT id FROM users WHERE email = $1
    `, [email]);
    
    const inviteeUserId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
    
    // Insert invitation
    const result = await pool.query(`
      INSERT INTO project_invitations (
        project_id, inviter_id, invitee_email, invitee_user_id, role, 
        invitation_token, message, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [projectId, req.user.id, email, inviteeUserId, role, invitationToken, message, expiresAt]);
    
    console.log(`[INVITE] Created invitation ${result.rows[0].id} with token ${invitationToken}`);
    
    // Get project name for email
    const projectResult = await pool.query('SELECT name FROM projects WHERE id = $1', [projectId]);
    const projectName = projectResult.rows[0]?.name || 'Project';
    
    // Send invitation email
    notificationService.sendInvitationNotification({
      inviteeEmail: email,
      inviterName: req.user.username,
      projectName,
      role,
      invitationToken,
      message
    }).catch(err => console.error('Error sending invitation email:', err));
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[INVITE] Error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// GET /api/invitations/pending - Check for pending invitation in cookie
app.get('/api/invitations/pending', authenticateToken, async (req, res) => {
  try {
    const pendingToken = req.cookies?.pendingInvitation;
    
    if (!pendingToken) {
      return res.json({ hasPending: false });
    }
    
    // Check if invitation is still valid
    const result = await pool.query(`
      SELECT pi.*, p.name as project_name
      FROM project_invitations pi
      JOIN projects p ON pi.project_id = p.id
      WHERE pi.invitation_token = $1 AND pi.status = 'pending' AND pi.expires_at > NOW()
    `, [pendingToken]);
    
    if (result.rows.length === 0) {
      // Invalid or expired - clear the cookie
      res.clearCookie('pendingInvitation');
      return res.json({ hasPending: false });
    }
    
    const invitation = result.rows[0];
    
    // Verify email matches
    if (invitation.invitee_email !== req.user.email) {
      res.clearCookie('pendingInvitation');
      return res.json({ hasPending: false, error: 'Email mismatch' });
    }
    
    res.json({
      hasPending: true,
      token: pendingToken,
      projectName: invitation.project_name,
      role: invitation.role
    });
  } catch (error) {
    console.error('Check pending invitation error:', error);
    res.status(500).json({ error: 'Failed to check pending invitation' });
  }
});

// GET /api/invitations/:token/preview - Preview invitation details (before auth)
app.get('/api/invitations/:token/preview', async (req, res) => {
  try {
    const { token } = req.params;
    
    const result = await pool.query(`
      SELECT pi.*, p.name as project_name, u.username as inviter_name
      FROM project_invitations pi
      JOIN projects p ON pi.project_id = p.id
      JOIN users u ON pi.inviter_id = u.id
      WHERE pi.invitation_token = $1 AND pi.status = 'pending' AND pi.expires_at > NOW()
    `, [token]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }
    
    const invitation = result.rows[0];
    
    res.json({
      projectName: invitation.project_name,
      inviterName: invitation.inviter_name,
      role: invitation.role,
      inviteeEmail: invitation.invitee_email,
      message: invitation.message
    });
  } catch (error) {
    console.error('Preview invitation error:', error);
    res.status(500).json({ error: 'Failed to load invitation' });
  }
});

// 2a. GET /api/invitations/:token/accept - Accept invitation from email link
app.get('/api/invitations/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Check if user is logged in
    const authHeader = req.headers.authorization || req.cookies?.token;
    if (!authHeader) {
      // Not logged in - redirect to login page with return URL
      return res.redirect(`/index.html?action=accept&token=${encodeURIComponent(token)}`);
    }
    
    // Verify token
    let user;
    try {
      user = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    } catch (err) {
      return res.redirect(`/index.html?action=accept&token=${encodeURIComponent(token)}`);
    }
    
    console.log(`[ACCEPT_GET] User ${user.id} accepting invitation with token ${token}`);
    
    // Get invitation
    const invitationResult = await pool.query(`
      SELECT pi.*, p.name as project_name
      FROM project_invitations pi
      JOIN projects p ON pi.project_id = p.id
      WHERE pi.invitation_token = $1 AND pi.expires_at > NOW()
    `, [token]);
    
    if (invitationResult.rows.length === 0) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Invitation - Multi-Project Tracker</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50">
          <div class="min-h-screen flex items-center justify-center p-4">
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
              <div class="text-red-500 text-5xl mb-4">⚠️</div>
              <h1 class="text-2xl font-bold text-gray-800 mb-4">Invalid or Expired Invitation</h1>
              <p class="text-gray-600 mb-6">This invitation link is invalid or has expired. Please contact the project manager for a new invitation.</p>
              <a href="/index.html" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                Go to Home
              </a>
            </div>
          </div>
        </body>
        </html>
      `);
    }
    
    const invitation = invitationResult.rows[0];
    
    // Verify email matches logged-in user
    if (invitation.invitee_email !== user.email) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Wrong Account - Multi-Project Tracker</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50">
          <div class="min-h-screen flex items-center justify-center p-4">
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
              <div class="text-yellow-500 text-5xl mb-4">⚠️</div>
              <h1 class="text-2xl font-bold text-gray-800 mb-4">Wrong Account</h1>
              <p class="text-gray-600 mb-2">This invitation is for <strong>${escapeHtml(invitation.invitee_email)}</strong></p>
              <p class="text-gray-600 mb-6">You are logged in as <strong>${escapeHtml(user.email)}</strong></p>
              <p class="text-gray-600 mb-6">Please log out and log in with the correct account to accept this invitation.</p>
              <a href="/index.html" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                Go to Home
              </a>
            </div>
          </div>
        </body>
        </html>
      `);
    }
    
    // Check if already a member or invitation already processed
    if (invitation.status !== 'pending') {
      const statusMessage = invitation.status === 'accepted' 
        ? 'You have already accepted this invitation.' 
        : 'This invitation has been declined.';
      
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invitation Already Processed - Multi-Project Tracker</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50">
          <div class="min-h-screen flex items-center justify-center p-4">
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
              <div class="text-blue-500 text-5xl mb-4">ℹ️</div>
              <h1 class="text-2xl font-bold text-gray-800 mb-4">Already Processed</h1>
              <p class="text-gray-600 mb-6">${statusMessage}</p>
              <a href="/index.html" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                Go to Projects
              </a>
            </div>
          </div>
        </body>
        </html>
      `);
    }
    
    const existingMember = await pool.query(`
      SELECT id FROM project_members
      WHERE project_id = $1 AND user_id = $2 AND status = 'active'
    `, [invitation.project_id, user.id]);
    
    if (existingMember.rows.length > 0) {
      // Already a member - mark invitation as accepted and redirect
      await pool.query(`
        UPDATE project_invitations
        SET status = 'accepted', responded_at = NOW()
        WHERE id = $1
      `, [invitation.id]);
      
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already a Member - Multi-Project Tracker</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-50">
          <div class="min-h-screen flex items-center justify-center p-4">
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
              <div class="text-green-500 text-5xl mb-4">✓</div>
              <h1 class="text-2xl font-bold text-gray-800 mb-4">Already a Member!</h1>
              <p class="text-gray-600 mb-2">You're already a member of</p>
              <p class="text-xl font-semibold text-blue-600 mb-6">${escapeHtml(invitation.project_name)}</p>
              <a href="/index.html" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                View Your Projects
              </a>
            </div>
          </div>
        </body>
        </html>
      `);
    }
    
    // Begin transaction
    await pool.query('BEGIN');
    
    try {
      // Insert into project_members
      await pool.query(`
        INSERT INTO project_members (
          project_id, user_id, role, invited_by, status
        )
        VALUES ($1, $2, $3, $4, 'active')
      `, [invitation.project_id, user.id, invitation.role, invitation.inviter_id]);
      
      // Update invitation status
      await pool.query(`
        UPDATE project_invitations
        SET status = 'accepted', responded_at = NOW()
        WHERE id = $1
      `, [invitation.id]);
      
      await pool.query('COMMIT');
      
      console.log(`[ACCEPT_GET] User ${user.id} joined project ${invitation.project_id} as ${invitation.role}`);
      
      // Success page with redirect
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invitation Accepted - Multi-Project Tracker</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <script src="https://cdn.tailwindcss.com"></script>
          <meta http-equiv="refresh" content="3;url=/index.html">
        </head>
        <body class="bg-gray-50">
          <div class="min-h-screen flex items-center justify-center p-4">
            <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
              <div class="text-green-500 text-5xl mb-4">🎉</div>
              <h1 class="text-2xl font-bold text-gray-800 mb-4">Invitation Accepted!</h1>
              <p class="text-gray-600 mb-2">You've successfully joined</p>
              <p class="text-xl font-semibold text-blue-600 mb-2">${escapeHtml(invitation.project_name)}</p>
              <p class="text-gray-600 mb-6">as a <span class="font-medium">${escapeHtml(invitation.role)}</span></p>
              <p class="text-sm text-gray-500 mb-4">Redirecting to your projects...</p>
              <a href="/index.html" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                Go to Projects Now
              </a>
            </div>
          </div>
        </body>
        </html>
      `);
    } catch (txError) {
      await pool.query('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('[ACCEPT_GET] Error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - Multi-Project Tracker</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-50">
        <div class="min-h-screen flex items-center justify-center p-4">
          <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
            <div class="text-red-500 text-5xl mb-4">❌</div>
            <h1 class="text-2xl font-bold text-gray-800 mb-4">Something Went Wrong</h1>
            <p class="text-gray-600 mb-6">We couldn't process your invitation. Please try again or contact support.</p>
            <a href="/index.html" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
              Go to Home
            </a>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// 2b. POST /api/invitations/:token/accept - Accept team invitation (API)
app.post('/api/invitations/:token/accept', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log(`[ACCEPT] User ${req.user.id} accepting invitation with token ${token}`);
    
    // Get invitation
    const invitationResult = await pool.query(`
      SELECT * FROM project_invitations
      WHERE invitation_token = $1 AND status = 'pending' AND expires_at > NOW()
    `, [token]);
    
    if (invitationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }
    
    const invitation = invitationResult.rows[0];
    
    // Verify email matches logged-in user
    if (invitation.invitee_email !== req.user.email) {
      return res.status(403).json({ error: 'This invitation is for a different email address' });
    }
    
    // Check if user has any existing record (active or removed)
    const existingMember = await pool.query(`
      SELECT id, status FROM project_members
      WHERE project_id = $1 AND user_id = $2
    `, [invitation.project_id, req.user.id]);
    
    // Begin transaction
    await pool.query('BEGIN');
    
    try {
      if (existingMember.rows.length > 0) {
        const member = existingMember.rows[0];
        
        if (member.status === 'active') {
          // Already an active member - just update invitation and return
          await pool.query(`
            UPDATE project_invitations
            SET status = 'accepted', responded_at = NOW()
            WHERE id = $1
          `, [invitation.id]);
          
          await pool.query('COMMIT');
          
          console.log(`[ACCEPT] User ${req.user.id} already active member of project ${invitation.project_id}`);
          
          return res.json({ 
            message: 'You are already a member of this project',
            projectId: invitation.project_id,
            role: invitation.role,
            alreadyMember: true
          });
        } else {
          // Was removed, now re-joining - update existing record
          await pool.query(`
            UPDATE project_members
            SET status = 'active', 
                role = $1, 
                joined_at = NOW(), 
                invited_by = $2,
                removed_at = NULL,
                removed_by = NULL,
                last_active = NOW()
            WHERE id = $3
          `, [invitation.role, invitation.inviter_id, member.id]);
          
          console.log(`[ACCEPT] User ${req.user.id} re-joined project ${invitation.project_id} (was previously removed)`);
        }
      } else {
        // New member - insert new record
        await pool.query(`
          INSERT INTO project_members (
            project_id, user_id, role, invited_by, status
          )
          VALUES ($1, $2, $3, $4, 'active')
        `, [invitation.project_id, req.user.id, invitation.role, invitation.inviter_id]);
        
        console.log(`[ACCEPT] User ${req.user.id} joined project ${invitation.project_id} as new member`);
      }
      
      // Update invitation status
      await pool.query(`
        UPDATE project_invitations
        SET status = 'accepted', responded_at = NOW()
        WHERE id = $1
      `, [invitation.id]);
      
      await pool.query('COMMIT');
      
      console.log(`[ACCEPT] User ${req.user.id} joined project ${invitation.project_id} as ${invitation.role}`);
      
      // Clear the pending invitation cookie if it exists
      res.clearCookie('pendingInvitation');
      
      res.json({ 
        message: 'Invitation accepted successfully',
        projectId: invitation.project_id,
        role: invitation.role
      });
    } catch (txError) {
      await pool.query('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('[ACCEPT] Error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// 3. POST /api/invitations/:token/decline - Decline team invitation
app.post('/api/invitations/:token/decline', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log(`[DECLINE] User ${req.user.id} declining invitation with token ${token}`);
    
    // Get invitation
    const invitationResult = await pool.query(`
      SELECT * FROM project_invitations
      WHERE invitation_token = $1 AND status = 'pending' AND expires_at > NOW()
    `, [token]);
    
    if (invitationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }
    
    // Update invitation status
    await pool.query(`
      UPDATE project_invitations
      SET status = 'declined', responded_at = NOW()
      WHERE invitation_token = $1
    `, [token]);
    
    console.log(`[DECLINE] Invitation declined successfully`);
    
    res.json({ message: 'Invitation declined successfully' });
  } catch (error) {
    console.error('[DECLINE] Error:', error);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

// 4. PATCH /api/projects/:projectId/team/:memberId/role - Update member role
app.patch('/api/projects/:projectId/team/:memberId/role', authenticateToken, async (req, res) => {
  try {
    const { projectId, memberId } = req.params;
    const { role: newRole } = req.body;
    
    console.log(`[UPDATE_ROLE] User ${req.user.id} updating member ${memberId} in project ${projectId} to ${newRole}`);
    
    // Validate new role
    const validRoles = ['Admin', 'Manager', 'Member', 'Viewer'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be Admin, Manager, Member, or Viewer' });
    }
    
    // Check if user is Manager+ in this project OR is a System Administrator
    const isSystemAdmin = req.user.role === 'System Administrator';
    const isManager = await isProjectManager(req.user.id, projectId);
    
    if (!isSystemAdmin && !isManager) {
      return res.status(403).json({ error: 'Only project Managers, Admins, or System Administrators can update member roles' });
    }
    
    // Get current user's project membership
    const currentUserResult = await pool.query(`
      SELECT id, role FROM project_members
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);
    
    // Prevent changing own role
    if (currentUserResult.rows.length > 0 && currentUserResult.rows[0].id === parseInt(memberId)) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }
    
    // Get target member
    const targetMemberResult = await pool.query(`
      SELECT pm.*, u.username, u.email FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.id = $1 AND pm.project_id = $2 AND pm.status = 'active'
    `, [memberId, projectId]);
    
    if (targetMemberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in this project' });
    }
    
    const targetMember = targetMemberResult.rows[0];
    
    // Update role
    const result = await pool.query(`
      UPDATE project_members
      SET role = $1
      WHERE id = $2
      RETURNING *
    `, [newRole, memberId]);
    
    console.log(`[UPDATE_ROLE] Member ${memberId} role updated to ${newRole}`);
    
    res.json({
      ...result.rows[0],
      username: targetMember.username,
      email: targetMember.email
    });
  } catch (error) {
    console.error('[UPDATE_ROLE] Error:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// 5. DELETE /api/projects/:projectId/team/:memberId - Remove team member
app.delete('/api/projects/:projectId/team/:memberId', authenticateToken, async (req, res) => {
  try {
    const { projectId, memberId } = req.params;
    
    console.log(`[REMOVE_MEMBER] User ${req.user.id} removing member ${memberId} from project ${projectId}`);
    
    // Check if user is Manager+ in this project OR is a System Administrator
    const isSystemAdmin = req.user.role === 'System Administrator';
    const isManager = await isProjectManager(req.user.id, projectId);
    
    if (!isSystemAdmin && !isManager) {
      return res.status(403).json({ error: 'Only project Managers, Admins, or System Administrators can remove members' });
    }
    
    // Get current user's project membership
    const currentUserResult = await pool.query(`
      SELECT id FROM project_members
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);
    
    // Prevent removing self
    if (currentUserResult.rows.length > 0 && currentUserResult.rows[0].id === parseInt(memberId)) {
      return res.status(400).json({ error: 'Cannot remove yourself from the project' });
    }
    
    // Update member status to removed
    const result = await pool.query(`
      UPDATE project_members
      SET status = 'removed', removed_at = NOW(), removed_by = $1
      WHERE id = $2 AND project_id = $3 AND status = 'active'
      RETURNING *
    `, [req.user.id, memberId, projectId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found in this project' });
    }
    
    console.log(`[REMOVE_MEMBER] Member ${memberId} removed from project ${projectId}`);
    
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('[REMOVE_MEMBER] Error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// 6. GET /api/invitations/me - Get current user's pending invitations
app.get('/api/invitations/me', authenticateToken, async (req, res) => {
  try {
    console.log(`[MY_INVITATIONS] Getting invitations for user ${req.user.id} (${req.user.email})`);
    
    const result = await pool.query(`
      SELECT 
        pi.*,
        p.name as project_name,
        p.description as project_description,
        u.username as inviter_name,
        u.email as inviter_email
      FROM project_invitations pi
      JOIN projects p ON pi.project_id = p.id
      JOIN users u ON pi.inviter_id = u.id
      WHERE pi.invitee_email = $1 
        AND pi.status = 'pending' 
        AND pi.expires_at > NOW()
      ORDER BY pi.created_at DESC
    `, [req.user.email]);
    
    console.log(`[MY_INVITATIONS] Found ${result.rows.length} pending invitations`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('[MY_INVITATIONS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// 7. GET /api/projects/:projectId/invitations - Get project's pending invitations
app.get('/api/projects/:projectId/invitations', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    console.log(`[PROJECT_INVITATIONS] User ${req.user.id} getting invitations for project ${projectId}`);
    
    // Check if user is Manager+ in this project
    const isManager = await isProjectManager(req.user.id, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project Managers and Admins can view invitations' });
    }
    
    const result = await pool.query(`
      SELECT 
        pi.*,
        u.username as inviter_name,
        u.email as inviter_email
      FROM project_invitations pi
      JOIN users u ON pi.inviter_id = u.id
      WHERE pi.project_id = $1 
        AND pi.status = 'pending' 
        AND pi.expires_at > NOW()
      ORDER BY pi.created_at DESC
    `, [projectId]);
    
    console.log(`[PROJECT_INVITATIONS] Found ${result.rows.length} pending invitations`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('[PROJECT_INVITATIONS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch project invitations' });
  }
});

// 8. DELETE /api/projects/:projectId/invitations/:invitationId - Cancel pending invitation
app.delete('/api/projects/:projectId/invitations/:invitationId', authenticateToken, async (req, res) => {
  try {
    const { projectId, invitationId } = req.params;
    
    console.log(`[CANCEL_INVITATION] User ${req.user.id} canceling invitation ${invitationId} for project ${projectId}`);
    
    // Check if user is Manager+ in this project
    const isManager = await isProjectManager(req.user.id, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project Managers and Admins can cancel invitations' });
    }
    
    // Verify the invitation belongs to this project and is still pending
    const invitationCheck = await pool.query(`
      SELECT * FROM project_invitations
      WHERE id = $1 AND project_id = $2 AND status = 'pending'
    `, [invitationId, projectId]);
    
    if (invitationCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found or already processed' });
    }
    
    // Delete the invitation
    await pool.query(`
      DELETE FROM project_invitations
      WHERE id = $1
    `, [invitationId]);
    
    console.log(`[CANCEL_INVITATION] Invitation ${invitationId} canceled successfully`);
    
    res.json({ message: 'Invitation canceled successfully' });
  } catch (error) {
    console.error('[CANCEL_INVITATION] Error:', error);
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

// ============= DASHBOARD ROUTES =============

// 1. GET /api/projects/:projectId/dashboard/stats - Get project statistics
app.get('/api/projects/:projectId/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    console.log(`[DASHBOARD_STATS] User ${req.user.id} getting stats for project ${projectId}`);
    
    // Verify user is a project member
    const memberCheck = await pool.query(`
      SELECT * FROM project_members
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this project.' });
    }
    
    // Get total counts
    const totalIssuesResult = await pool.query(`
      SELECT COUNT(*) as count FROM issues WHERE project_id = $1
    `, [projectId]);
    
    const totalActionItemsResult = await pool.query(`
      SELECT COUNT(*) as count FROM action_items WHERE project_id = $1
    `, [projectId]);
    
    // Get issues by status
    const issuesByStatusResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM issues
      WHERE project_id = $1
      GROUP BY status
    `, [projectId]);
    
    const issuesByStatus = {};
    issuesByStatusResult.rows.forEach(row => {
      issuesByStatus[row.status] = parseInt(row.count);
    });
    
    // Get issues by priority
    const issuesByPriorityResult = await pool.query(`
      SELECT priority, COUNT(*) as count
      FROM issues
      WHERE project_id = $1
      GROUP BY priority
    `, [projectId]);
    
    const issuesByPriority = {};
    issuesByPriorityResult.rows.forEach(row => {
      issuesByPriority[row.priority] = parseInt(row.count);
    });
    
    // Get action items by status
    const actionItemsByStatusResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM action_items
      WHERE project_id = $1
      GROUP BY status
    `, [projectId]);
    
    const actionItemsByStatus = {};
    actionItemsByStatusResult.rows.forEach(row => {
      actionItemsByStatus[row.status] = parseInt(row.count);
    });
    
    // Get action items by priority
    const actionItemsByPriorityResult = await pool.query(`
      SELECT priority, COUNT(*) as count
      FROM action_items
      WHERE project_id = $1
      GROUP BY priority
    `, [projectId]);
    
    const actionItemsByPriority = {};
    actionItemsByPriorityResult.rows.forEach(row => {
      actionItemsByPriority[row.priority] = parseInt(row.count);
    });
    
    // Calculate completion rate
    const completedIssues = issuesByStatus['Done'] || 0;
    const completedActionItems = actionItemsByStatus['Done'] || 0;
    const totalIssues = parseInt(totalIssuesResult.rows[0].count);
    const totalActionItems = parseInt(totalActionItemsResult.rows[0].count);
    const totalItems = totalIssues + totalActionItems;
    const completedItems = completedIssues + completedActionItems;
    const completionRate = totalItems > 0 ? completedItems / totalItems : 0;
    
    // Get overdue count
    const overdueResult = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT id FROM issues WHERE project_id = $1 AND due_date < NOW() AND status != 'Done'
        UNION ALL
        SELECT id FROM action_items WHERE project_id = $2 AND due_date < NOW() AND status != 'Done'
      ) as overdue_items
    `, [projectId, projectId]);
    
    // Get upcoming deadlines (next 5)
    const upcomingResult = await pool.query(`
      SELECT id, title, due_date, 'issue' as type FROM issues
      WHERE project_id = $1 AND due_date > NOW() AND status != 'Done'
      UNION ALL
      SELECT id, title, due_date, 'action_item' as type FROM action_items
      WHERE project_id = $2 AND due_date > NOW() AND status != 'Done'
      ORDER BY due_date ASC
      LIMIT 5
    `, [projectId, projectId]);
    
    // Get AI statistics
    const transcriptsResult = await pool.query(`
      SELECT COUNT(*) as count FROM meeting_transcripts WHERE project_id = $1
    `, [projectId]);
    
    const aiItemsResult = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT id FROM issues WHERE project_id = $1 AND created_via_ai_by IS NOT NULL
        UNION ALL
        SELECT id FROM action_items WHERE project_id = $2 AND created_via_ai_by IS NOT NULL
      ) as ai_items
    `, [projectId, projectId]);
    
    // Get total comments
    const commentsResult = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT ic.id FROM issue_comments ic
        JOIN issues i ON ic.issue_id = i.id
        WHERE i.project_id = $1
        UNION ALL
        SELECT aic.id FROM action_item_comments aic
        JOIN action_items ai ON aic.action_item_id = ai.id
        WHERE ai.project_id = $2
      ) as all_comments
    `, [projectId, projectId]);
    
    const stats = {
      totalIssues,
      totalActionItems,
      issuesByStatus,
      issuesByPriority,
      actionItemsByStatus,
      actionItemsByPriority,
      completionRate: parseFloat(completionRate.toFixed(2)),
      overdueCount: parseInt(overdueResult.rows[0].count),
      upcomingDeadlines: upcomingResult.rows,
      transcriptsAnalyzed: parseInt(transcriptsResult.rows[0].count),
      aiItemsCreated: parseInt(aiItemsResult.rows[0].count),
      totalComments: parseInt(commentsResult.rows[0].count)
    };
    
    console.log(`[DASHBOARD_STATS] Stats retrieved for project ${projectId}`);
    
    res.json(stats);
  } catch (error) {
    console.error('[DASHBOARD_STATS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// 2. GET /api/projects/:projectId/dashboard/activity - Get recent activity
app.get('/api/projects/:projectId/dashboard/activity', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    
    console.log(`[DASHBOARD_ACTIVITY] User ${req.user.id} getting activity for project ${projectId}`);
    
    // Verify user is a project member
    const memberCheck = await pool.query(`
      SELECT * FROM project_members
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this project.' });
    }
    
    // Get recent activity from multiple sources
    const activityResult = await pool.query(`
      SELECT * FROM (
        SELECT 
          i.id,
          'issue_created' as type,
          i.id as item_id,
          i.title as item_title,
          u.username as user_name,
          i.created_at as timestamp,
          'Created issue' as details
        FROM issues i
        JOIN users u ON i.created_by = CAST(u.id AS TEXT)
        WHERE i.project_id = $1
        
        UNION ALL
        
        SELECT 
          ai.id,
          'action_item_created' as type,
          ai.id as item_id,
          ai.title as item_title,
          u.username as user_name,
          ai.created_at as timestamp,
          'Created action item' as details
        FROM action_items ai
        JOIN users u ON ai.created_by = CAST(u.id AS TEXT)
        WHERE ai.project_id = $2
        
        UNION ALL
        
        SELECT 
          ic.id,
          'comment_added' as type,
          i.id as item_id,
          i.title as item_title,
          u.username as user_name,
          ic.created_at as timestamp,
          'Added comment on issue' as details
        FROM issue_comments ic
        JOIN issues i ON ic.issue_id = i.id
        JOIN users u ON ic.user_id = u.id
        WHERE i.project_id = $3
        
        UNION ALL
        
        SELECT 
          aic.id,
          'comment_added' as type,
          ai.id as item_id,
          ai.title as item_title,
          u.username as user_name,
          aic.created_at as timestamp,
          'Added comment on action item' as details
        FROM action_item_comments aic
        JOIN action_items ai ON aic.action_item_id = ai.id
        JOIN users u ON aic.user_id = u.id
        WHERE ai.project_id = $4
        
        UNION ALL
        
        SELECT 
          mt.id,
          'transcript_uploaded' as type,
          mt.id as item_id,
          mt.title as item_title,
          u.username as user_name,
          mt.uploaded_at as timestamp,
          'Uploaded meeting transcript' as details
        FROM meeting_transcripts mt
        JOIN users u ON mt.uploaded_by = u.id
        WHERE mt.project_id = $5
      ) as all_activity
      ORDER BY timestamp DESC
      LIMIT $6
    `, [projectId, projectId, projectId, projectId, projectId, limit]);
    
    console.log(`[DASHBOARD_ACTIVITY] Retrieved ${activityResult.rows.length} activities`);
    
    res.json(activityResult.rows);
  } catch (error) {
    console.error('[DASHBOARD_ACTIVITY] Error:', error);
    console.error('[DASHBOARD_ACTIVITY] Error detail:', error.detail);
    console.error('[DASHBOARD_ACTIVITY] Error hint:', error.hint);
    console.error('[DASHBOARD_ACTIVITY] Error position:', error.position);
    res.status(500).json({ error: 'Failed to fetch dashboard activity' });
  }
});

// 3. GET /api/projects/:projectId/dashboard/team-metrics - Get team member metrics
app.get('/api/projects/:projectId/dashboard/team-metrics', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    console.log(`[DASHBOARD_TEAM] User ${req.user.id} getting team metrics for project ${projectId}`);
    
    // Verify user is a project member
    const memberCheck = await pool.query(`
      SELECT * FROM project_members
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this project.' });
    }
    
    // Get team metrics
    const teamResult = await pool.query(`
      SELECT 
        pm.user_id,
        COALESCE(actual_name.assignee_name, u.username) as user_name,
        u.email as user_email,
        pm.role,
        COALESCE(issues_assigned.count, 0) as issues_assigned,
        COALESCE(issues_completed.count, 0) as issues_completed,
        COALESCE(actions_assigned.count, 0) as action_items_assigned,
        COALESCE(actions_completed.count, 0) as action_items_completed,
        COALESCE(comments.count, 0) as comments_count,
        GREATEST(
          COALESCE(last_issue.last_created, pm.joined_at),
          COALESCE(last_action.last_created, pm.joined_at),
          COALESCE(last_comment.last_created, pm.joined_at)
        ) as last_active
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      LEFT JOIN (
        SELECT DISTINCT ON (LOWER(TRIM(assignee))) 
          assignee as assignee_name,
          LOWER(TRIM(assignee)) as assignee_lower
        FROM (
          SELECT assignee FROM issues WHERE project_id = $1 AND assignee IS NOT NULL
          UNION
          SELECT assignee FROM action_items WHERE project_id = $1 AND assignee IS NOT NULL
        ) all_assignees
      ) actual_name ON (
        LOWER(TRIM(actual_name.assignee_lower)) = LOWER(TRIM(u.username))
        OR LOWER(TRIM(actual_name.assignee_lower)) LIKE LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(actual_name.assignee_lower)) LIKE '% ' || LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(actual_name.assignee_lower)) LIKE '% ' || LOWER(TRIM(u.username))
      )
      LEFT JOIN (
        SELECT assignee, COUNT(*) as count
        FROM issues
        WHERE project_id = $2
        GROUP BY assignee
      ) issues_assigned ON (
        LOWER(TRIM(issues_assigned.assignee)) = LOWER(TRIM(u.username))
        OR LOWER(TRIM(issues_assigned.assignee)) LIKE LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(issues_assigned.assignee)) LIKE '% ' || LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(issues_assigned.assignee)) LIKE '% ' || LOWER(TRIM(u.username))
      )
      LEFT JOIN (
        SELECT assignee, COUNT(*) as count
        FROM issues
        WHERE project_id = $3 AND status = 'Done'
        GROUP BY assignee
      ) issues_completed ON (
        LOWER(TRIM(issues_completed.assignee)) = LOWER(TRIM(u.username))
        OR LOWER(TRIM(issues_completed.assignee)) LIKE LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(issues_completed.assignee)) LIKE '% ' || LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(issues_completed.assignee)) LIKE '% ' || LOWER(TRIM(u.username))
      )
      LEFT JOIN (
        SELECT assignee, COUNT(*) as count
        FROM action_items
        WHERE project_id = $4
        GROUP BY assignee
      ) actions_assigned ON (
        LOWER(TRIM(actions_assigned.assignee)) = LOWER(TRIM(u.username))
        OR LOWER(TRIM(actions_assigned.assignee)) LIKE LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(actions_assigned.assignee)) LIKE '% ' || LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(actions_assigned.assignee)) LIKE '% ' || LOWER(TRIM(u.username))
      )
      LEFT JOIN (
        SELECT assignee, COUNT(*) as count
        FROM action_items
        WHERE project_id = $5 AND status = 'Done'
        GROUP BY assignee
      ) actions_completed ON (
        LOWER(TRIM(actions_completed.assignee)) = LOWER(TRIM(u.username))
        OR LOWER(TRIM(actions_completed.assignee)) LIKE LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(actions_completed.assignee)) LIKE '% ' || LOWER(TRIM(u.username)) || ' %'
        OR LOWER(TRIM(actions_completed.assignee)) LIKE '% ' || LOWER(TRIM(u.username))
      )
      LEFT JOIN (
        SELECT user_id, COUNT(*) as count
        FROM (
          SELECT ic.user_id
          FROM issue_comments ic
          JOIN issues i ON ic.issue_id = i.id
          WHERE i.project_id = $6
          UNION ALL
          SELECT aic.user_id
          FROM action_item_comments aic
          JOIN action_items ai ON aic.action_item_id = ai.id
          WHERE ai.project_id = $7
        ) all_comments
        GROUP BY user_id
      ) comments ON comments.user_id = pm.user_id
      LEFT JOIN (
        SELECT created_by, MAX(created_at) as last_created
        FROM issues
        WHERE project_id = $8
        GROUP BY created_by
      ) last_issue ON last_issue.created_by = CAST(pm.user_id AS TEXT)
      LEFT JOIN (
        SELECT created_by, MAX(created_at) as last_created
        FROM action_items
        WHERE project_id = $9
        GROUP BY created_by
      ) last_action ON last_action.created_by = CAST(pm.user_id AS TEXT)
      LEFT JOIN (
        SELECT user_id, MAX(created_at) as last_created
        FROM (
          SELECT ic.user_id, ic.created_at
          FROM issue_comments ic
          JOIN issues i ON ic.issue_id = i.id
          WHERE i.project_id = $10
          UNION ALL
          SELECT aic.user_id, aic.created_at
          FROM action_item_comments aic
          JOIN action_items ai ON aic.action_item_id = ai.id
          WHERE ai.project_id = $11
        ) all_comments
        GROUP BY user_id
      ) last_comment ON last_comment.user_id = pm.user_id
      WHERE pm.project_id = $12 AND pm.status = 'active'
      ORDER BY (COALESCE(issues_completed.count, 0) + COALESCE(actions_completed.count, 0)) DESC
    `, [projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId, projectId]);
    
    console.log(`[DASHBOARD_TEAM] Retrieved metrics for ${teamResult.rows.length} team members`);
    
    res.json(teamResult.rows);
  } catch (error) {
    console.error('[DASHBOARD_TEAM] Error:', error);
    console.error('[DASHBOARD_TEAM] Error detail:', error.detail);
    console.error('[DASHBOARD_TEAM] Error hint:', error.hint);
    console.error('[DASHBOARD_TEAM] Error position:', error.position);
    res.status(500).json({ error: 'Failed to fetch team metrics' });
  }
});

// 4. GET /api/projects/:projectId/dashboard/trends - Get time-series trends
app.get('/api/projects/:projectId/dashboard/trends', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    
    console.log(`[DASHBOARD_TRENDS] User ${req.user.id} getting trends for project ${projectId} (${days} days)`);
    
    // Verify user is a project member
    const memberCheck = await pool.query(`
      SELECT * FROM project_members
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this project.' });
    }
    
    // Get issues trend
    const issuesTrendResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as created,
        COUNT(CASE WHEN status = 'Done' THEN 1 END) as completed
      FROM issues
      WHERE project_id = $1 
        AND created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [projectId, days]);
    
    // Get action items trend
    const actionsTrendResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as created,
        COUNT(CASE WHEN status = 'Done' THEN 1 END) as completed
      FROM action_items
      WHERE project_id = $1 
        AND created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [projectId, days]);
    
    // Get activity trend with breakdown by type
    const activityTrendResult = await pool.query(`
      SELECT 
        DATE(activity_date) as date, 
        activity_type,
        COUNT(*) as count
      FROM (
        SELECT created_at as activity_date, 'issue_created' as activity_type FROM issues WHERE project_id = $1
        UNION ALL
        SELECT created_at, 'action_created' FROM action_items WHERE project_id = $2
        UNION ALL
        SELECT ic.created_at, 'issue_comment'
        FROM issue_comments ic
        JOIN issues i ON ic.issue_id = i.id
        WHERE i.project_id = $3
        UNION ALL
        SELECT aic.created_at, 'action_comment'
        FROM action_item_comments aic
        JOIN action_items ai ON aic.action_item_id = ai.id
        WHERE ai.project_id = $4
      ) all_activity
      WHERE activity_date >= NOW() - ($5 || ' days')::INTERVAL
      GROUP BY DATE(activity_date), activity_type
      ORDER BY date ASC, activity_type
    `, [projectId, projectId, projectId, projectId, days]);
    
    // Get velocity trends (status transitions)
    const velocityTrendResult = await pool.query(`
      SELECT 
        DATE(changed_at) as date,
        to_status,
        COUNT(*) as count
      FROM status_history
      WHERE project_id = $1 
        AND changed_at >= NOW() - ($2 || ' days')::INTERVAL
        AND to_status IN ('To Do', 'In Progress', 'Done')
      GROUP BY DATE(changed_at), to_status
      ORDER BY date ASC, to_status
    `, [projectId, days]);
    
    const trends = {
      issuesTrend: issuesTrendResult.rows,
      actionItemsTrend: actionsTrendResult.rows,
      activityTrend: activityTrendResult.rows,
      velocityTrend: velocityTrendResult.rows
    };
    
    console.log(`[DASHBOARD_TRENDS] Retrieved trends for ${days} days`);
    
    res.json(trends);
  } catch (error) {
    console.error('[DASHBOARD_TRENDS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard trends' });
  }
});

// ============= REPORTING ROUTES =============

// Generate PDF report
app.post('/api/projects/:projectId/reports/generate', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { reportType, dateRange } = req.body;
    
    // Normalize dateRange - if it's 'all' or empty, set to null
    const normalizedDateRange = (dateRange === 'all' || !dateRange) ? null : dateRange;
    
    console.log('[REPORT_GENERATE] projectId:', projectId, 'Type:', typeof projectId);
    console.log('[REPORT_GENERATE] dateRange:', normalizedDateRange);
    
    // Check if user has access to this project
    const memberCheck = await pool.query(`
      SELECT * FROM project_members 
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);
    
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this project.' });
    }
    
    let pdfBuffer;
    
    switch (reportType) {
      case 'executive':
        console.log('[REPORT_GENERATE] Generating executive summary...');
        pdfBuffer = await reportService.generateExecutiveSummary(projectId, normalizedDateRange);
        console.log('[REPORT_GENERATE] Executive summary buffer size:', pdfBuffer?.length);
        break;
      case 'detailed':
        console.log('[REPORT_GENERATE] Generating detailed report...');
        pdfBuffer = await reportService.generateDetailedReport(projectId, normalizedDateRange);
        console.log('[REPORT_GENERATE] Detailed report buffer size:', pdfBuffer?.length);
        break;
      case 'team':
        console.log('[REPORT_GENERATE] Generating team performance report...');
        pdfBuffer = await reportService.generateTeamPerformanceReport(projectId, normalizedDateRange);
        console.log('[REPORT_GENERATE] Team report buffer size:', pdfBuffer?.length);
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }
    
    if (!pdfBuffer) {
      console.error('[REPORT_GENERATE] PDF buffer is null/undefined for report type:', reportType);
      return res.status(500).json({ error: 'Failed to generate PDF buffer' });
    }
    
    const filename = `${reportType}-report-${projectId}-${Date.now()}.pdf`;
    
    console.log('[REPORT_GENERATE] Sending PDF:', filename, 'Size:', pdfBuffer.length);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('[REPORT_GENERATE] Report generation error:', error);
    console.error('[REPORT_GENERATE] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

// ============= TAG MANAGEMENT ROUTES =============

// Get all tags for project (with usage count)
app.get('/api/projects/:projectId/tags', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    const result = await pool.query(
      `SELECT 
        t.*,
        (SELECT COUNT(*) FROM issue_tags WHERE tag_id = t.id) +
        (SELECT COUNT(*) FROM action_item_tags WHERE tag_id = t.id) as usage_count
      FROM tags t
      WHERE t.project_id = $1
      ORDER BY t.name`,
      [projectId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Create new tag
app.post('/api/projects/:projectId/tags', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { name, color, description } = req.body;
    const result = await pool.query(
      `INSERT INTO tags (project_id, name, color, description, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [req.params.projectId, name, color, description || null, req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Tag name already exists in this project' });
    } else {
      console.error('Error creating tag:', error);
      res.status(500).json({ error: 'Failed to create tag' });
    }
  }
});

// Update tag
app.patch('/api/tags/:tagId', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { name, color, description } = req.body;
    const result = await pool.query(
      `UPDATE tags 
       SET name = COALESCE($1, name),
           color = COALESCE($2, color),
           description = COALESCE($3, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [name, color, description, req.params.tagId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Tag name already exists in this project' });
    } else {
      console.error('Error updating tag:', error);
      res.status(500).json({ error: 'Failed to update tag' });
    }
  }
});

// Delete tag (only if not in use)
app.delete('/api/tags/:tagId', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    // Check usage count
    const usageResult = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM issue_tags WHERE tag_id = $1) +
        (SELECT COUNT(*) FROM action_item_tags WHERE tag_id = $1) as count`,
      [req.params.tagId]
    );
    
    const usageCount = parseInt(usageResult.rows[0].count);
    
    if (usageCount > 0) {
      return res.status(409).json({ 
        error: `Cannot delete tag. It is used by ${usageCount} item(s)`,
        usageCount
      });
    }
    
    await pool.query('DELETE FROM tags WHERE id = $1', [req.params.tagId]);
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Get issue tags
app.get('/api/issues/:issueId/tags', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.* FROM tags t
       JOIN issue_tags it ON t.id = it.tag_id
       WHERE it.issue_id = $1
       ORDER BY t.name`,
      [req.params.issueId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching issue tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Add tag to issue
app.post('/api/issues/:issueId/tags', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { tag_id } = req.body;
    await pool.query(
      `INSERT INTO issue_tags (issue_id, tag_id, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (issue_id, tag_id) DO NOTHING`,
      [req.params.issueId, tag_id]
    );
    res.status(201).json({ message: 'Tag added to issue' });
  } catch (error) {
    console.error('Error adding tag to issue:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// Remove tag from issue
app.delete('/api/issues/:issueId/tags/:tagId', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM issue_tags WHERE issue_id = $1 AND tag_id = $2',
      [req.params.issueId, req.params.tagId]
    );
    res.json({ message: 'Tag removed from issue' });
  } catch (error) {
    console.error('Error removing tag from issue:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// Update all tags for an issue (replaces existing tags)
app.put('/api/issues/:issueId/tags', authenticateToken, requireRole('Team Member'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { issueId } = req.params;
    const { tagIds } = req.body; // Array of tag IDs
    
    // Validate tagIds is an array
    if (tagIds !== undefined && tagIds !== null && !Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'tagIds must be an array' });
    }
    
    // Verify issue exists and get project_id for authorization
    const issueResult = await pool.query('SELECT project_id FROM issues WHERE id = $1', [issueId]);
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const projectId = issueResult.rows[0].project_id;
    
    // Check project access
    const hasAccess = await checkProjectAccess(req.user.id, projectId, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    
    // Validate that all tags belong to the same project and are appropriate type
    if (tagIds && tagIds.length > 0) {
      const tagsResult = await pool.query(
        `SELECT id, tag_type FROM tags 
         WHERE id = ANY($1) AND project_id = $2`,
        [tagIds, projectId]
      );
      
      if (tagsResult.rows.length !== tagIds.length) {
        return res.status(400).json({ error: 'Some tags do not belong to this project' });
      }
      
      // Verify all tags are either 'issue_action' or 'both'
      const invalidTags = tagsResult.rows.filter(t => t.tag_type !== 'issue_action' && t.tag_type !== 'both');
      if (invalidTags.length > 0) {
        return res.status(400).json({ error: 'Only issue/action tags can be assigned to issues' });
      }
    }
    
    // Use transaction on dedicated client to replace tags atomically
    await client.query('BEGIN');
    
    try {
      // Remove all existing tags
      await client.query('DELETE FROM issue_tags WHERE issue_id = $1', [issueId]);
      
      // Add new tags
      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await client.query(
            `INSERT INTO issue_tags (issue_id, tag_id, created_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)`,
            [issueId, tagId]
          );
        }
      }
      
      await client.query('COMMIT');
      res.json({ message: 'Issue tags updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating issue tags:', error);
    res.status(500).json({ error: 'Failed to update issue tags' });
  } finally {
    client.release();
  }
});

// Get action item tags
app.get('/api/action-items/:actionItemId/tags', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.* FROM tags t
       JOIN action_item_tags ait ON t.id = ait.tag_id
       WHERE ait.action_item_id = $1
       ORDER BY t.name`,
      [req.params.actionItemId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching action item tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Add tag to action item
app.post('/api/action-items/:actionItemId/tags', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { tag_id } = req.body;
    await pool.query(
      `INSERT INTO action_item_tags (action_item_id, tag_id, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (action_item_id, tag_id) DO NOTHING`,
      [req.params.actionItemId, tag_id]
    );
    res.status(201).json({ message: 'Tag added to action item' });
  } catch (error) {
    console.error('Error adding tag to action item:', error);
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

// Remove tag from action item
app.delete('/api/action-items/:actionItemId/tags/:tagId', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM action_item_tags WHERE action_item_id = $1 AND tag_id = $2',
      [req.params.actionItemId, req.params.tagId]
    );
    res.json({ message: 'Tag removed from action item' });
  } catch (error) {
    console.error('Error removing tag from action item:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// Update all tags for an action item (replaces existing tags)
app.put('/api/action-items/:actionItemId/tags', authenticateToken, requireRole('Team Member'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { actionItemId } = req.params;
    const { tagIds } = req.body; // Array of tag IDs
    
    // Validate tagIds is an array
    if (tagIds !== undefined && tagIds !== null && !Array.isArray(tagIds)) {
      return res.status(400).json({ error: 'tagIds must be an array' });
    }
    
    // Verify action item exists and get project_id for authorization
    const actionItemResult = await pool.query('SELECT project_id FROM action_items WHERE id = $1', [actionItemId]);
    if (actionItemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const projectId = actionItemResult.rows[0].project_id;
    
    // Check project access
    const hasAccess = await checkProjectAccess(req.user.id, projectId, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    
    // Validate that all tags belong to the same project and are appropriate type
    if (tagIds && tagIds.length > 0) {
      const tagsResult = await pool.query(
        `SELECT id, tag_type FROM tags 
         WHERE id = ANY($1) AND project_id = $2`,
        [tagIds, projectId]
      );
      
      if (tagsResult.rows.length !== tagIds.length) {
        return res.status(400).json({ error: 'Some tags do not belong to this project' });
      }
      
      // Verify all tags are either 'issue_action' or 'both'
      const invalidTags = tagsResult.rows.filter(t => t.tag_type !== 'issue_action' && t.tag_type !== 'both');
      if (invalidTags.length > 0) {
        return res.status(400).json({ error: 'Only issue/action tags can be assigned to action items' });
      }
    }
    
    // Use transaction on dedicated client to replace tags atomically
    await client.query('BEGIN');
    
    try {
      // Remove all existing tags
      await client.query('DELETE FROM action_item_tags WHERE action_item_id = $1', [actionItemId]);
      
      // Add new tags
      if (tagIds && tagIds.length > 0) {
        for (const tagId of tagIds) {
          await client.query(
            `INSERT INTO action_item_tags (action_item_id, tag_id, created_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)`,
            [actionItemId, tagId]
          );
        }
      }
      
      await client.query('COMMIT');
      res.json({ message: 'Action item tags updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating action item tags:', error);
    res.status(500).json({ error: 'Failed to update action item tags' });
  } finally {
    client.release();
  }
});

// ============= ISSUES ROUTES =============

// Get issues with filtering and search
app.get('/api/issues', authenticateToken, async (req, res) => {
  try {
    const { projectId, status, priority, assignee, category, tag, search } = req.query;
    
    // Build dynamic WHERE conditions
    let conditions = [];
    let params = [];
    
    if (projectId) {
      conditions.push(`i.project_id = $${params.length + 1}`);
      params.push(parseInt(projectId));
    }
    
    if (status) {
      conditions.push(`i.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (priority) {
      conditions.push(`i.priority = $${params.length + 1}`);
      params.push(priority);
    }
    
    if (assignee) {
      conditions.push(`i.assignee = $${params.length + 1}`);
      params.push(assignee);
    }
    
    if (category) {
      conditions.push(`i.category = $${params.length + 1}`);
      params.push(category);
    }
    
    if (tag) {
      conditions.push(`t.id = $${params.length + 1}`);
      params.push(parseInt(tag));
    }
    
    if (search) {
      conditions.push(`(i.title ILIKE $${params.length + 1} OR i.description ILIKE $${params.length + 2})`);
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }
    
    // Build final query
    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';
    
    const query = `
      SELECT 
        i.*,
        u.username as creator_username,
        u.email as creator_email,
        sh.changed_at as completed_at,
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'name', t.name, 'color', t.color)
            ORDER BY t.name
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) as tags
      FROM issues i
      LEFT JOIN users u ON i.created_by = u.id::text
      LEFT JOIN issue_tags it ON i.id = it.issue_id
      LEFT JOIN tags t ON it.tag_id = t.id
      LEFT JOIN LATERAL (
        SELECT changed_at 
        FROM status_history 
        WHERE item_type = 'issue' 
          AND item_id = i.id 
          AND to_status = 'Done'
        ORDER BY changed_at DESC 
        LIMIT 1
      ) sh ON true
      ${whereClause} 
      GROUP BY i.id, u.username, u.email, sh.changed_at
      ORDER BY i.created_at DESC
    `;
    
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
      `SELECT i.*, 
        eeh.hybrid_estimate_data
      FROM issues i
      LEFT JOIN LATERAL (
        SELECT hybrid_estimate_data
        FROM effort_estimate_history
        WHERE item_id = i.id 
          AND item_type = 'issue'
          AND source = 'hybrid'
        ORDER BY created_at DESC
        LIMIT 1
      ) eeh ON true
      WHERE i.id = $1`,
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

// Get effort estimate version history for an issue
app.get('/api/issues/:id/effort-estimate-history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const issueResult = await pool.query('SELECT id, ai_estimate_version, planning_estimate_source FROM issues WHERE id = $1', [parseInt(id)]);
    
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const issue = issueResult.rows[0];
    
    const historyResult = await pool.query(
      `SELECT 
        version,
        source,
        estimate_hours,
        confidence,
        breakdown,
        reasoning,
        hybrid_estimate_data,
        created_at,
        created_by
      FROM effort_estimate_history
      WHERE item_id = $1 AND item_type = 'issue'
      ORDER BY 
        CASE WHEN version = $2 THEN 0 ELSE 1 END,
        version DESC`,
      [parseInt(id), issue.ai_estimate_version]
    );
    
    res.json({
      currentVersion: issue.ai_estimate_version,
      planningSource: issue.planning_estimate_source,
      history: historyResult.rows
    });
  } catch (error) {
    console.error('Error fetching effort estimate history:', error);
    res.status(500).json({ error: 'Failed to fetch effort estimate history' });
  }
});

// Generate AI effort estimate for an issue
app.post('/api/issues/:id/effort-estimate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { model = 'gpt-4o' } = req.body;
    
    const issueResult = await pool.query(
      'SELECT id, title, description, type, category FROM issues WHERE id = $1',
      [parseInt(id)]
    );
    
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const issue = issueResult.rows[0];
    
    const prompt = `Analyze this task and provide an effort estimate in hours:

Title: ${issue.title}
Description: ${issue.description || 'No description provided'}
Type: ${issue.type || 'Not specified'}
Category: ${issue.category || 'Not specified'}

Provide:
1. Total estimated hours (be realistic, consider complexity)
2. Confidence level (low/medium/high)
3. Brief reasoning for the estimate

Response format (JSON):
{
  "hours": <number>,
  "confidence": "<low|medium|high>",
  "reasoning": "<brief explanation>"
}`;

    const response = await openai.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    await pool.query(
      `UPDATE issues 
       SET ai_effort_estimate_hours = $1,
           ai_estimate_confidence = $2,
           ai_estimate_last_updated = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [result.hours, result.confidence, parseInt(id)]
    );
    
    res.json({
      hours: result.hours,
      confidence: result.confidence,
      reasoning: result.reasoning
    });
    
  } catch (error) {
    console.error('Error generating AI effort estimate:', error);
    res.status(500).json({ error: 'Failed to generate AI effort estimate' });
  }
});

// Generate hybrid effort estimate for an issue
app.post('/api/issues/:id/hybrid-estimate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const issueResult = await pool.query(
      'SELECT ai_effort_estimate_hours, estimated_effort_hours FROM issues WHERE id = $1',
      [parseInt(id)]
    );
    
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const issue = issueResult.rows[0];
    const aiEstimate = parseFloat(issue.ai_effort_estimate_hours) || 0;
    const manualEstimate = parseFloat(issue.estimated_effort_hours) || 0;
    
    const hybridHours = aiEstimate > 0 && manualEstimate > 0 
      ? (aiEstimate + manualEstimate) / 2
      : (aiEstimate || manualEstimate);
    
    await pool.query(
      `UPDATE issues 
       SET hybrid_effort_estimate_hours = $1
       WHERE id = $2`,
      [hybridHours, parseInt(id)]
    );
    
    res.json({ hours: hybridHours });
    
  } catch (error) {
    console.error('Error generating hybrid effort estimate:', error);
    res.status(500).json({ error: 'Failed to generate hybrid effort estimate' });
  }
});

// Create issue (Team Member or higher)
app.post('/api/issues', authenticateToken, requireRole('Team Member'), async (req, res) => {
  const { 
    title, 
    description, 
    type,
    priority, 
    category, 
    assignee, 
    dueDate, 
    projectId,
    progress = 0,
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
        title, description, type, priority, category, assignee, 
        due_date, project_id, status, progress, created_by,
        created_by_ai, ai_confidence, ai_analysis_id
      ) VALUES (
        ${title.trim()}, 
        ${description?.trim() || ''}, 
        ${type || 'Task'},
        ${priority || 'medium'}, 
        ${category || 'General'}, 
        ${assignee || ''}, 
        ${dueDate || null}, 
        ${parseInt(projectId)}, 
        'To Do',
        ${progress || 0},
        ${req.user.id.toString()},
        ${createdByAI},
        ${aiConfidence},
        ${aiAnalysisId}
      ) RETURNING *
    `;
    
    // Fetch the complete issue with creator info
    const [issueWithCreator] = await sql`
      SELECT 
        i.*,
        u.username as creator_username,
        u.email as creator_email
      FROM issues i
      LEFT JOIN users u ON i.created_by = u.id::text
      WHERE i.id = ${newIssue.id}
    `;
    
    // Send Teams notification if enabled (non-blocking)
    if (project.teams_notifications_enabled && project.teams_webhook_url) {
      teamsNotifications.notifyNewIssue(
        project.teams_webhook_url,
        newIssue,
        req.user,
        project
      ).catch(err => console.error('Error sending Teams notification:', err));
    }
    
    // Send assignment notification if assignee is set (non-blocking)
    if (assignee && assignee.trim() !== '') {
      try {
        const assigneeUser = await pool.query(
          'SELECT id FROM users WHERE username = $1',
          [assignee]
        );
        
        if (assigneeUser.rows.length > 0) {
          // Fire and forget - don't await to avoid blocking issue creation
          notificationService.sendAssignmentNotification({
            assignedUserId: assigneeUser.rows[0].id,
            assignerName: req.user.username,
            itemTitle: title,
            itemType: 'issue',
            itemId: newIssue.id,
            projectId: parseInt(projectId),
            dueDate: dueDate,
            priority: priority || 'medium'
          }).catch(err => {
            console.error('Error sending assignment notification:', err);
          });
        } else {
          console.warn(`Assignee not found: ${assignee}`);
        }
      } catch (err) {
        console.error('Error looking up assignee for notification:', err);
      }
    }
    
    // Auto-create checklist if template mapping exists for this issue type
    let checklist = null;
    if (newIssue.type && newIssue.project_id) {
      console.log(`🔍 Attempting auto-checklist for issue type: "${newIssue.type}", project: ${newIssue.project_id}`);
      
      try {
        checklist = await autoCreateChecklistForIssue(
          newIssue.id,
          newIssue.type,
          newIssue.project_id,
          req.user.id
        );
        
        if (checklist) {
          console.log(`✅ Auto-created checklist ${checklist.id} for issue ${newIssue.id} (type: ${newIssue.type})`);
        } else {
          console.log(`ℹ️ No template mapping found for issue type: "${newIssue.type}" in project ${newIssue.project_id}`);
        }
      } catch (autoChecklistError) {
        console.error('❌ Failed to auto-create checklist for issue:', autoChecklistError);
        // Continue - don't fail issue creation if checklist fails
      }
    } else {
      console.log('⚠️ Skipping auto-checklist: missing type or project_id', {
        type: newIssue.type,
        project_id: newIssue.project_id
      });
    }
    
    res.status(201).json({
      ...issueWithCreator,
      auto_checklist_created: !!checklist,
      checklist_id: checklist?.id || null
    });
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

// Update issue (Owner or Team Lead+) - Full edit capability
app.patch('/api/issues/:id', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      assignee, 
      due_date, 
      priority, 
      status, 
      category, 
      progress,
      estimated_effort_hours,
      hybrid_effort_estimate_hours,
      planning_estimate_source,
      actual_hours_added,  // NEW: Hours to add during status change
      completion_percentage  // NEW: Manual completion percentage
    } = req.body;
    
    console.log('PATCH /api/issues/:id - Request body:', req.body);
    console.log('Issue ID:', id);
    
    const [issue] = await sql`SELECT * FROM issues WHERE id = ${id}`;
    
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const isOwner = parseInt(issue.created_by, 10) === parseInt(req.user.id, 10);
    const isAssignee = issue.assignee === req.user.username;
    
    console.log('Permission check:', {
      userRole: req.user.role,
      userRoleLevel,
      userId: req.user.id,
      issueCreatedBy: issue.created_by,
      isOwner,
      isAssignee,
      canEdit: userRoleLevel >= ROLE_HIERARCHY['Team Lead'] || isOwner || isAssignee
    });
    
    if (userRoleLevel < ROLE_HIERARCHY['Team Lead'] && !isOwner && !isAssignee) {
      return res.status(403).json({ error: 'Only the owner, assignee, or Team Lead+ can edit this issue' });
    }
    
    // Handle time tracking for status changes
    let timeTrackingResult = null;
    if (status !== undefined && status !== issue.status) {
      console.log(`Status changing from "${issue.status}" to "${status}"`);
      
      timeTrackingResult = await logTimeWithStatusChange(
        'issue',
        parseInt(id),
        issue.status,
        status,
        actual_hours_added,
        completion_percentage,
        req.user.id,
        `Status changed from ${issue.status} to ${status}`
      );
      
      if (!timeTrackingResult.valid) {
        return res.status(400).json({
          error: timeTrackingResult.error,
          message: timeTrackingResult.message,
          requiresHours: timeTrackingResult.requiresHours
        });
      }
      
      console.log('Time tracking result:', timeTrackingResult);
    }
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let valueIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${valueIndex++}`);
      values.push(title.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${valueIndex++}`);
      values.push(description?.trim() || '');
    }
    if (assignee !== undefined) {
      updates.push(`assignee = $${valueIndex++}`);
      values.push(assignee || '');
    }
    if (due_date !== undefined) {
      updates.push(`due_date = $${valueIndex++}`);
      values.push(due_date || null);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${valueIndex++}`);
      values.push(priority);
    }
    if (status !== undefined) {
      updates.push(`status = $${valueIndex++}`);
      values.push(status);
    }
    if (category !== undefined) {
      updates.push(`category = $${valueIndex++}`);
      values.push(category || '');
    }
    if (progress !== undefined) {
      updates.push(`progress = $${valueIndex++}`);
      values.push(progress || 0);
    }
    if (estimated_effort_hours !== undefined) {
      updates.push(`estimated_effort_hours = $${valueIndex++}`);
      values.push(estimated_effort_hours || null);
    }
    if (hybrid_effort_estimate_hours !== undefined) {
      updates.push(`hybrid_effort_estimate_hours = $${valueIndex++}`);
      values.push(hybrid_effort_estimate_hours || null);
    }
    if (planning_estimate_source !== undefined) {
      updates.push(`planning_estimate_source = $${valueIndex++}`);
      values.push(planning_estimate_source || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(parseInt(id));
    
    const query = `
      UPDATE issues 
      SET ${updates.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `;
    
    console.log('Update query:', query);
    console.log('Values array:', values);
    console.log('Expected parameter count: $' + valueIndex);
    
    const result = await pool.query(query, values);
    console.log('Query executed successfully. Rows returned:', result.rows.length);
    
    let updatedIssue = result.rows[0];
    
    if (!updatedIssue) {
      console.error('No issue was updated - issue might not exist');
      return res.status(404).json({ error: 'Issue not found or not updated' });
    }
    
    // If time tracking was performed, refetch the item to get updated time tracking fields
    if (timeTrackingResult && !timeTrackingResult.skipTimeTracking) {
      const [refreshedIssue] = await sql`SELECT * FROM issues WHERE id = ${id}`;
      if (refreshedIssue) {
        updatedIssue = refreshedIssue;
      }
    }
    
    console.log('Updated issue:', updatedIssue);
    
    // Handle effort estimate updates
    if (estimated_effort_hours !== undefined || planning_estimate_source !== undefined) {
      // Determine if we need to create a history entry
      const estimateChanged = estimated_effort_hours !== undefined && estimated_effort_hours !== issue.estimated_effort_hours;
      const planningSourceChanged = planning_estimate_source !== undefined && planning_estimate_source !== issue.planning_estimate_source;
      
      // Priority logic: If planning source changed to AI/Hybrid, that takes precedence over manual edits
      // This prevents duplicate versions when user changes both at once
      if (planningSourceChanged && (planning_estimate_source === 'ai' || planning_estimate_source === 'hybrid')) {
        // Planning source changed to AI or Hybrid - copy the selected estimate into planning estimate AND create version
        console.log('Planning source changed to:', planning_estimate_source);
        
        // Copy the selected estimate hours into estimated_effort_hours for calculations
        let selectedEstimate = null;
        if (planning_estimate_source === 'ai') {
          selectedEstimate = parseFloat(issue.ai_effort_estimate_hours) || null;
        } else if (planning_estimate_source === 'hybrid') {
          selectedEstimate = parseFloat(issue.hybrid_effort_estimate_hours) || null;
        }
        
        if (selectedEstimate !== null) {
          // Create version history entry when switching to AI/Hybrid estimate
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            
            // Read current version with row lock
            const versionResult = await client.query(
              `SELECT ai_estimate_version FROM issues WHERE id = $1 FOR UPDATE`,
              [parseInt(id)]
            );
            const currentVersion = versionResult.rows[0]?.ai_estimate_version || 0;
            const newVersion = currentVersion + 1;
            
            // Update both estimated_effort_hours and version
            await client.query(
              `UPDATE issues SET estimated_effort_hours = $1, ai_estimate_version = $2 WHERE id = $3`,
              [selectedEstimate, newVersion, parseInt(id)]
            );
            
            // Create history entry with hybrid source
            await client.query(
              `INSERT INTO effort_estimate_history 
               (item_type, item_id, estimate_hours, version, source, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              ['issue', parseInt(id), selectedEstimate, newVersion, 'hybrid', req.user.id]
            );
            
            await client.query('COMMIT');
            console.log(`Created version ${newVersion} for ${planning_estimate_source} estimate selection (${selectedEstimate}h)`);
          } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error creating version for planning source change:', err);
            throw err;
          } finally {
            client.release();
          }
        }
      } else if (estimateChanged && !planningSourceChanged) {
        // ONLY manual estimate changed (no planning source change) - create a manual_edit history entry
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          // Read current version with row lock to prevent race conditions
          const versionResult = await client.query(
            `SELECT ai_estimate_version FROM issues WHERE id = $1 FOR UPDATE`,
            [parseInt(id)]
          );
          const currentVersion = versionResult.rows[0]?.ai_estimate_version || 0;
          const newVersion = currentVersion + 1;
          
          await client.query(
            `UPDATE issues SET ai_estimate_version = $1 WHERE id = $2`,
            [newVersion, parseInt(id)]
          );
          
          await client.query(
            `INSERT INTO effort_estimate_history 
             (item_type, item_id, estimate_hours, version, source, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['issue', parseInt(id), estimated_effort_hours, newVersion, 'manual_edit', req.user.id]
          );
          
          await client.query('COMMIT');
          console.log(`Created version ${newVersion} for manual estimate edit (${estimated_effort_hours}h)`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('Error creating effort estimate history:', err);
          throw err; // Propagate error to caller
        } finally {
          client.release();
        }
      }
    }
    
    // Log status change to history table
    if (status !== undefined && issue.status !== status) {
      try {
        await pool.query(`
          INSERT INTO status_history (item_type, item_id, project_id, from_status, to_status, changed_by)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['issue', updatedIssue.id, updatedIssue.project_id, issue.status, status, req.user.id]);
        console.log('Status change logged to history:', { from: issue.status, to: status });
      } catch (err) {
        console.error('Error logging status change to history:', err);
      }
    }
    
    // Send status change notification if status changed
    if (status !== undefined && issue.status !== status && updatedIssue.assignee && updatedIssue.assignee.trim() !== '') {
      try {
        const assigneeUser = await pool.query(
          'SELECT id FROM users WHERE username = $1',
          [updatedIssue.assignee]
        );
        
        if (assigneeUser.rows.length > 0) {
          notificationService.sendStatusChangeNotification({
            assignedUserId: assigneeUser.rows[0].id,
            itemTitle: updatedIssue.title,
            itemType: 'issue',
            itemId: updatedIssue.id,
            oldStatus: issue.status,
            newStatus: status,
            changedByName: req.user.username,
            projectId: updatedIssue.project_id
          }).catch(err => {
            console.error('Error sending status change notification:', err);
          });
        }
      } catch (err) {
        console.error('Error looking up assignee for status change notification:', err);
      }
    }
    
    // Send completion notification to creator if status changed to Done
    if (status === 'Done' && issue.status !== 'Done') {
      try {
        const creatorUser = await pool.query(
          'SELECT id, username, email FROM users WHERE id = $1',
          [parseInt(issue.created_by)]
        );
        
        if (creatorUser.rows.length > 0) {
          const creator = creatorUser.rows[0];
          notificationService.sendCompletionNotification({
            creatorUserId: creator.id,
            creatorEmail: creator.email,
            creatorName: creator.username,
            itemType: 'issue',
            itemTitle: updatedIssue.title,
            itemId: updatedIssue.id,
            priority: updatedIssue.priority,
            completedByName: req.user.username,
            projectId: updatedIssue.project_id
          }).catch(err => {
            console.error('Error sending completion notification:', err);
          });
        }
      } catch (err) {
        console.error('Error looking up creator for completion notification:', err);
      }
      
      // Send Teams completion notification if enabled
      try {
        const [project] = await sql`SELECT * FROM projects WHERE id = ${updatedIssue.project_id}`;
        if (project && project.teams_notifications_enabled && project.teams_webhook_url) {
          teamsNotifications.notifyIssueCompleted(
            project.teams_webhook_url,
            updatedIssue,
            req.user,
            project
          ).catch(err => console.error('Error sending Teams completion notification:', err));
        }
      } catch (err) {
        console.error('Error sending Teams completion notification:', err);
      }
    }
    
    // Send assignment notification if assignee changed
    if (assignee !== undefined && issue.assignee !== assignee && assignee && assignee.trim() !== '') {
      try {
        const assigneeUser = await pool.query(
          'SELECT id FROM users WHERE username = $1',
          [assignee]
        );
        
        if (assigneeUser.rows.length > 0) {
          notificationService.sendAssignmentNotification({
            assignedUserId: assigneeUser.rows[0].id,
            assignerName: req.user.username,
            itemTitle: updatedIssue.title,
            itemType: 'issue',
            itemId: updatedIssue.id,
            projectId: updatedIssue.project_id,
            dueDate: updatedIssue.due_date,
            priority: updatedIssue.priority
          }).catch(err => {
            console.error('Error sending assignment notification:', err);
          });
        }
      } catch (err) {
        console.error('Error looking up assignee for assignment notification:', err);
      }
    }
    
    // Include time tracking info in response if status changed
    const response = {
      ...updatedIssue,
      timeTracking: timeTrackingResult ? {
        actualHours: timeTrackingResult.actualHours,
        completionPercent: timeTrackingResult.completionPercent,
        variance: timeTrackingResult.variance,
        variancePercent: timeTrackingResult.variancePercent,
        isExceeding: timeTrackingResult.isExceeding,
        warning: timeTrackingResult.warning
      } : undefined
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error updating issue:', error);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

// Quick Log Time endpoint - log hours without status change
app.post('/api/:itemType/:id/log-time', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const { hours, notes, completion_percentage, work_date } = req.body;
    
    // Validate item type
    const type = itemType === 'issues' ? 'issue' : itemType === 'action-items' ? 'action-item' : null;
    if (!type) {
      return res.status(400).json({ error: 'Invalid item type. Use "issues" or "action-items"' });
    }
    
    // Validate hours
    if (!hours || hours <= 0) {
      return res.status(400).json({ error: 'Hours must be greater than 0' });
    }
    
    console.log(`Quick log time: ${hours}h for ${type} #${id}${work_date ? ` (work date: ${work_date})` : ''}`);
    
    // Log the time
    const result = await quickLogTime(
      type,
      parseInt(id),
      parseFloat(hours),
      req.user.id,
      notes,
      completion_percentage,
      work_date
    );
    
    console.log('Quick log result:', result);
    
    res.json({
      success: true,
      actualHours: result.actualHours,
      completionPercent: result.completionPercent,
      timeLogCount: result.timeLogCount,
      variance: result.variance,
      variancePercent: result.variancePercent,
      isExceeding: result.isExceeding,
      warning: result.warning
    });
    
  } catch (error) {
    console.error('Error logging time:', error);
    res.status(500).json({ error: error.message || 'Failed to log time' });
  }
});

// Get time tracking history for an item
app.get('/api/:itemType/:id/time-history', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const type = itemType === 'issues' ? 'issue' : itemType === 'action-items' ? 'action-item' : null;
    
    if (!type) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    const summary = await getTimeTrackingSummary(type, parseInt(id));
    res.json(summary);
    
  } catch (error) {
    console.error('Error getting time tracking history:', error);
    res.status(500).json({ error: 'Failed to get time tracking history' });
  }
});

// ============= TIME ENTRIES API (Incremental Logging) =============

// Log time entry (quick log without status change)
app.post('/api/:itemType/:id/time-entries', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const { hours, notes, work_date } = req.body;
    
    // Validate item type
    const type = itemType === 'issues' ? 'issue' : itemType === 'action-items' ? 'action-item' : null;
    if (!type) {
      return res.status(400).json({ error: 'Invalid item type. Use "issues" or "action-items"' });
    }
    
    // Get project ID for authorization
    const tableName = type === 'issue' ? 'issues' : 'action_items';
    const itemResult = await pool.query(`SELECT project_id FROM ${tableName} WHERE id = $1`, [parseInt(id)]);
    
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const projectId = itemResult.rows[0].project_id;
    
    // Check project access
    const hasAccess = await checkProjectAccess(req.user.id, projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Not authorized to access this project' });
    }
    
    // Log the time
    const result = await timeEntriesService.logTime({
      itemType: type,
      itemId: parseInt(id),
      projectId,
      hoursLogged: parseFloat(hours),
      loggedBy: req.user.id,
      notes,
      workDate: work_date
    });
    
    // Log with status change info if applicable
    if (result.statusChanged) {
      console.log(`✅ Logged ${hours}h for ${type} #${id}. Total: ${result.totalHours}h (${result.completionPercentage}%). Status: ${result.oldStatus} → ${result.newStatus}`);
    } else {
      console.log(`✅ Logged ${hours}h for ${type} #${id}. Total: ${result.totalHours}h (${result.completionPercentage}%)`);
    }
    
    res.json({
      success: true,
      data: {
        entry: result.entry,
        totalHours: result.totalHours,
        completionPercentage: result.completionPercentage,
        statusChanged: result.statusChanged || false,
        oldStatus: result.oldStatus,
        newStatus: result.newStatus
      }
    });
    
  } catch (error) {
    console.error('Error logging time entry:', error);
    res.status(500).json({ error: error.message || 'Failed to log time' });
  }
});

// Get all time entries for an item
app.get('/api/:itemType/:id/time-entries', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    
    // Validate item type
    const type = itemType === 'issues' ? 'issue' : itemType === 'action-items' ? 'action-item' : null;
    if (!type) {
      return res.status(400).json({ error: 'Invalid item type' });
    }
    
    // Get entries
    const entries = await timeEntriesService.getTimeEntries(type, parseInt(id));
    const totalHours = await timeEntriesService.getTotalHours(type, parseInt(id));
    
    res.json({
      entries,
      totalHours
    });
    
  } catch (error) {
    console.error('Error getting time entries:', error);
    res.status(500).json({ error: 'Failed to get time entries' });
  }
});

// Delete a time entry
app.delete('/api/time-entries/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Only the user who logged it or admins can delete
    const entryResult = await pool.query('SELECT logged_by FROM time_entries WHERE id = $1', [parseInt(id)]);
    
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    
    const entry = entryResult.rows[0];
    
    // Check permission (owner or admin)
    if (entry.logged_by !== req.user.id && req.user.role < 3) { // 3 = Team Lead
      return res.status(403).json({ error: 'Not authorized to delete this time entry' });
    }
    
    const result = await timeEntriesService.deleteTimeEntry(parseInt(id), req.user.id);
    
    res.json({
      success: true,
      totalHours: result.totalHours,
      completionPercentage: result.completionPercentage
    });
    
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ error: error.message || 'Failed to delete time entry' });
  }
});

// Delete issue (creator OR Team Lead or higher)
app.delete('/api/issues/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the issue to check permissions
    const [issue] = await sql`
      SELECT created_by, project_id 
      FROM issues 
      WHERE id = ${id}
    `;
    
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    // Check permissions: creator OR Team Lead+
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const isCreator = parseInt(issue.created_by) === parseInt(req.user.id);
    const hasRolePermission = userRoleLevel >= ROLE_HIERARCHY['Team Lead'];
    
    if (!isCreator && !hasRolePermission) {
      return res.status(403).json({ 
        error: 'Only the creator or Team Lead+ can delete this issue' 
      });
    }
    
    // Delete related data first (no FK constraint exists for attachments)
    await sql`
      DELETE FROM attachments 
      WHERE entity_type = 'issue' AND entity_id = ${id}
    `;
    
    // Delete related checklists (must be done before deleting the issue)
    await sql`
      DELETE FROM checklists 
      WHERE related_issue_id = ${id}
    `;
    
    // Delete the issue (comments will cascade automatically)
    const [deleted] = await sql`
      DELETE FROM issues 
      WHERE id = ${id}
      RETURNING id
    `;
    
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
    const { projectId, status, priority, assignee, tag, search } = req.query;
    
    // Build dynamic WHERE conditions
    let conditions = [];
    let params = [];
    
    if (projectId) {
      conditions.push(`a.project_id = $${params.length + 1}`);
      params.push(parseInt(projectId));
    }
    
    if (status) {
      conditions.push(`a.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (priority) {
      conditions.push(`a.priority = $${params.length + 1}`);
      params.push(priority);
    }
    
    if (assignee) {
      conditions.push(`a.assignee = $${params.length + 1}`);
      params.push(assignee);
    }
    
    if (tag) {
      conditions.push(`t.id = $${params.length + 1}`);
      params.push(parseInt(tag));
    }
    
    if (search) {
      conditions.push(`(a.title ILIKE $${params.length + 1} OR a.description ILIKE $${params.length + 2})`);
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }
    
    // Build final query
    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';
    
    const query = `
      SELECT 
        a.*,
        u.username as creator_username,
        u.email as creator_email,
        sh.changed_at as completed_at,
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'name', t.name, 'color', t.color)
            ORDER BY t.name
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) as tags
      FROM action_items a
      LEFT JOIN users u ON a.created_by = u.id::text
      LEFT JOIN action_item_tags ait ON a.id = ait.action_item_id
      LEFT JOIN tags t ON ait.tag_id = t.id
      LEFT JOIN LATERAL (
        SELECT changed_at 
        FROM status_history 
        WHERE item_type = 'action_item' 
          AND item_id = a.id 
          AND to_status = 'Done'
        ORDER BY changed_at DESC 
        LIMIT 1
      ) sh ON true
      ${whereClause} 
      GROUP BY a.id, u.username, u.email, sh.changed_at
      ORDER BY a.created_at DESC
    `;
    
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
      `SELECT a.*, 
        eeh.hybrid_estimate_data
      FROM action_items a
      LEFT JOIN LATERAL (
        SELECT hybrid_estimate_data
        FROM effort_estimate_history
        WHERE item_id = a.id 
          AND item_type = 'action-item'
          AND source = 'hybrid'
        ORDER BY created_at DESC
        LIMIT 1
      ) eeh ON true
      WHERE a.id = $1`,
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

// Get effort estimate version history for an action item
app.get('/api/action-items/:id/effort-estimate-history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const actionItemResult = await pool.query('SELECT id, ai_estimate_version, planning_estimate_source FROM action_items WHERE id = $1', [parseInt(id)]);
    
    if (actionItemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const actionItem = actionItemResult.rows[0];
    
    const historyResult = await pool.query(
      `SELECT 
        version,
        source,
        estimate_hours,
        confidence,
        breakdown,
        reasoning,
        hybrid_estimate_data,
        created_at,
        created_by
      FROM effort_estimate_history
      WHERE item_id = $1 AND item_type = 'action-item'
      ORDER BY 
        CASE WHEN version = $2 THEN 0 ELSE 1 END,
        version DESC`,
      [parseInt(id), actionItem.ai_estimate_version]
    );
    
    res.json({
      currentVersion: actionItem.ai_estimate_version,
      planningSource: actionItem.planning_estimate_source,
      history: historyResult.rows
    });
  } catch (error) {
    console.error('Error fetching effort estimate history:', error);
    res.status(500).json({ error: 'Failed to fetch effort estimate history' });
  }
});

// Generate AI effort estimate for an action item
app.post('/api/action-items/:id/effort-estimate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { model = 'gpt-4o' } = req.body;
    
    const actionItemResult = await pool.query(
      'SELECT id, title, description FROM action_items WHERE id = $1',
      [parseInt(id)]
    );
    
    if (actionItemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const actionItem = actionItemResult.rows[0];
    
    const prompt = `Analyze this task and provide an effort estimate in hours:

Title: ${actionItem.title}
Description: ${actionItem.description || 'No description provided'}

Provide:
1. Total estimated hours (be realistic, consider complexity)
2. Confidence level (low/medium/high)
3. Brief reasoning for the estimate

Response format (JSON):
{
  "hours": <number>,
  "confidence": "<low|medium|high>",
  "reasoning": "<brief explanation>"
}`;

    const response = await openai.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    
    await pool.query(
      `UPDATE action_items 
       SET ai_effort_estimate_hours = $1,
           ai_estimate_confidence = $2,
           ai_estimate_last_updated = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [result.hours, result.confidence, parseInt(id)]
    );
    
    res.json({
      hours: result.hours,
      confidence: result.confidence,
      reasoning: result.reasoning
    });
    
  } catch (error) {
    console.error('Error generating AI effort estimate:', error);
    res.status(500).json({ error: 'Failed to generate AI effort estimate' });
  }
});

// Generate hybrid effort estimate for an action item
app.post('/api/action-items/:id/hybrid-estimate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const actionItemResult = await pool.query(
      'SELECT ai_effort_estimate_hours, estimated_effort_hours FROM action_items WHERE id = $1',
      [parseInt(id)]
    );
    
    if (actionItemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const actionItem = actionItemResult.rows[0];
    const aiEstimate = parseFloat(actionItem.ai_effort_estimate_hours) || 0;
    const manualEstimate = parseFloat(actionItem.estimated_effort_hours) || 0;
    
    const hybridHours = aiEstimate > 0 && manualEstimate > 0 
      ? (aiEstimate + manualEstimate) / 2
      : (aiEstimate || manualEstimate);
    
    await pool.query(
      `UPDATE action_items 
       SET hybrid_effort_estimate_hours = $1
       WHERE id = $2`,
      [hybridHours, parseInt(id)]
    );
    
    res.json({ hours: hybridHours });
    
  } catch (error) {
    console.error('Error generating hybrid effort estimate:', error);
    res.status(500).json({ error: 'Failed to generate hybrid effort estimate' });
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
      categoryId,
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
        due_date, status, created_by, category_id,
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
        ${categoryId ? parseInt(categoryId) : null},
        ${createdByAI},
        ${aiConfidence},
        ${aiAnalysisId}
      ) RETURNING *
    `;
    
    // Fetch the complete action item with creator info
    const [actionItemWithCreator] = await sql`
      SELECT 
        a.*,
        u.username as creator_username,
        u.email as creator_email
      FROM action_items a
      LEFT JOIN users u ON a.created_by = u.id::text
      WHERE a.id = ${newItem.id}
    `;
    
    // Send Teams notification if enabled (non-blocking)
    try {
      const [project] = await sql`SELECT * FROM projects WHERE id = ${parseInt(projectId)}`;
      if (project && project.teams_notifications_enabled && project.teams_webhook_url) {
        teamsNotifications.notifyNewAction(
          project.teams_webhook_url,
          newItem,
          req.user,
          project
        ).catch(err => console.error('Error sending Teams notification:', err));
      }
    } catch (err) {
      console.error('Error sending Teams notification:', err);
    }
    
    // Send assignment notification if assignee is set (non-blocking)
    if (assignee && assignee.trim() !== '') {
      try {
        const assigneeUser = await pool.query(
          'SELECT id FROM users WHERE username = $1',
          [assignee]
        );
        
        if (assigneeUser.rows.length > 0) {
          // Fire and forget - don't await to avoid blocking action item creation
          notificationService.sendAssignmentNotification({
            assignedUserId: assigneeUser.rows[0].id,
            assignerName: req.user.username,
            itemTitle: title,
            itemType: 'action item',
            itemId: newItem.id,
            projectId: parseInt(projectId),
            dueDate: dueDate,
            priority: priority || 'medium'
          }).catch(err => {
            console.error('Error sending assignment notification:', err);
          });
        } else {
          console.warn(`Assignee not found: ${assignee}`);
        }
      } catch (err) {
        console.error('Error looking up assignee for notification:', err);
      }
    }
    
    // Auto-create checklist if template mapping exists for this action item category
    let checklist = null;
    if (newItem.category_id && newItem.project_id) {
      console.log(`🔍 Attempting auto-checklist for action item category: ${newItem.category_id}, project: ${newItem.project_id}`);
      
      try {
        checklist = await autoCreateChecklistForActionItem(
          newItem.id,
          newItem.category_id,
          newItem.project_id,
          req.user.id
        );
        
        if (checklist) {
          console.log(`✅ Auto-created checklist ${checklist.id} for action item ${newItem.id} (category: ${newItem.category_id})`);
        } else {
          console.log(`ℹ️ No template mapping found for action item category ${newItem.category_id} in project ${newItem.project_id}`);
        }
      } catch (autoChecklistError) {
        console.error('❌ Failed to auto-create checklist for action item:', autoChecklistError);
        // Continue - don't fail action item creation if checklist fails
      }
    } else {
      console.log('⚠️ Skipping auto-checklist: missing category_id or project_id', {
        category_id: newItem.category_id,
        project_id: newItem.project_id
      });
    }
    
    res.status(201).json({
      ...actionItemWithCreator,
      auto_checklist_created: !!checklist,
      checklist_id: checklist?.id || null
    });
  } catch (error) {
    console.error('Error creating action item:', error);
    res.status(500).json({ error: 'Failed to create action item' });
  }
});

// Update action item (Owner or Team Lead+) - Full edit capability
app.patch('/api/action-items/:id', authenticateToken, requireRole('Team Member'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      assignee, 
      due_date, 
      priority, 
      status, 
      progress,
      estimated_effort_hours,
      hybrid_effort_estimate_hours,
      planning_estimate_source,
      actual_hours_added,  // NEW: Hours to add during status change
      completion_percentage  // NEW: Manual completion percentage
    } = req.body;
    
    console.log('PATCH /api/action-items/:id - Request body:', req.body);
    console.log('Action item ID:', id);
    
    const [item] = await sql`SELECT * FROM action_items WHERE id = ${id}`;
    
    if (!item) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const isOwner = parseInt(item.created_by, 10) === parseInt(req.user.id, 10);
    const isAssignee = item.assignee === req.user.username;
    
    console.log('Permission check:', {
      userRole: req.user.role,
      userRoleLevel,
      userId: req.user.id,
      itemCreatedBy: item.created_by,
      isOwner,
      isAssignee,
      canEdit: userRoleLevel >= ROLE_HIERARCHY['Team Lead'] || isOwner || isAssignee
    });
    
    if (userRoleLevel < ROLE_HIERARCHY['Team Lead'] && !isOwner && !isAssignee) {
      return res.status(403).json({ error: 'Only the owner, assignee, or Team Lead+ can edit this action item' });
    }
    
    // Handle time tracking for status changes
    let timeTrackingResult = null;
    if (status !== undefined && status !== item.status) {
      console.log(`Status changing from "${item.status}" to "${status}"`);
      
      timeTrackingResult = await logTimeWithStatusChange(
        'action-item',
        parseInt(id),
        item.status,
        status,
        actual_hours_added,
        completion_percentage,
        req.user.id,
        `Status changed from ${item.status} to ${status}`
      );
      
      if (!timeTrackingResult.valid) {
        return res.status(400).json({
          error: timeTrackingResult.error,
          message: timeTrackingResult.message,
          requiresHours: timeTrackingResult.requiresHours
        });
      }
      
      console.log('Time tracking result:', timeTrackingResult);
    }
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let valueIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${valueIndex++}`);
      values.push(title.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${valueIndex++}`);
      values.push(description?.trim() || '');
    }
    if (assignee !== undefined) {
      updates.push(`assignee = $${valueIndex++}`);
      values.push(assignee || '');
    }
    if (due_date !== undefined) {
      updates.push(`due_date = $${valueIndex++}`);
      values.push(due_date || null);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${valueIndex++}`);
      values.push(priority);
    }
    if (status !== undefined) {
      updates.push(`status = $${valueIndex++}`);
      values.push(status);
    }
    if (progress !== undefined) {
      updates.push(`progress = $${valueIndex++}`);
      values.push(progress || 0);
    }
    if (estimated_effort_hours !== undefined) {
      updates.push(`estimated_effort_hours = $${valueIndex++}`);
      values.push(estimated_effort_hours || null);
    }
    if (hybrid_effort_estimate_hours !== undefined) {
      updates.push(`hybrid_effort_estimate_hours = $${valueIndex++}`);
      values.push(hybrid_effort_estimate_hours || null);
    }
    if (planning_estimate_source !== undefined) {
      updates.push(`planning_estimate_source = $${valueIndex++}`);
      values.push(planning_estimate_source || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(parseInt(id));
    
    const query = `
      UPDATE action_items 
      SET ${updates.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `;
    
    console.log('Update query:', query);
    console.log('Values array:', values);
    console.log('Expected parameter count: $' + valueIndex);
    
    const result = await pool.query(query, values);
    let updatedItem = result.rows[0];
    
    // If time tracking was performed, refetch the item to get updated time tracking fields
    if (timeTrackingResult && !timeTrackingResult.skipTimeTracking) {
      const [refreshedItem] = await sql`SELECT * FROM action_items WHERE id = ${id}`;
      if (refreshedItem) {
        updatedItem = refreshedItem;
      }
    }
    
    // Handle effort estimate updates
    if (estimated_effort_hours !== undefined || planning_estimate_source !== undefined) {
      // Determine if we need to create a history entry
      const estimateChanged = estimated_effort_hours !== undefined && estimated_effort_hours !== item.estimated_effort_hours;
      const planningSourceChanged = planning_estimate_source !== undefined && planning_estimate_source !== item.planning_estimate_source;
      
      // Priority logic: If planning source changed to AI/Hybrid, that takes precedence over manual edits
      // This prevents duplicate versions when user changes both at once
      if (planningSourceChanged && (planning_estimate_source === 'ai' || planning_estimate_source === 'hybrid')) {
        // Planning source changed to AI or Hybrid - copy the selected estimate into planning estimate AND create version
        console.log('Planning source changed to:', planning_estimate_source);
        
        // Copy the selected estimate hours into estimated_effort_hours for calculations
        let selectedEstimate = null;
        if (planning_estimate_source === 'ai') {
          selectedEstimate = parseFloat(item.ai_effort_estimate_hours) || null;
        } else if (planning_estimate_source === 'hybrid') {
          selectedEstimate = parseFloat(item.hybrid_effort_estimate_hours) || null;
        }
        
        if (selectedEstimate !== null) {
          // Create version history entry when switching to AI/Hybrid estimate
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            
            // Read current version with row lock
            const versionResult = await client.query(
              `SELECT ai_estimate_version FROM action_items WHERE id = $1 FOR UPDATE`,
              [parseInt(id)]
            );
            const currentVersion = versionResult.rows[0]?.ai_estimate_version || 0;
            const newVersion = currentVersion + 1;
            
            // Update both estimated_effort_hours and version
            await client.query(
              `UPDATE action_items SET estimated_effort_hours = $1, ai_estimate_version = $2 WHERE id = $3`,
              [selectedEstimate, newVersion, parseInt(id)]
            );
            
            // Create history entry with hybrid source
            await client.query(
              `INSERT INTO effort_estimate_history 
               (item_type, item_id, estimate_hours, version, source, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              ['action-item', parseInt(id), selectedEstimate, newVersion, 'hybrid', req.user.id]
            );
            
            await client.query('COMMIT');
            console.log(`Created version ${newVersion} for ${planning_estimate_source} estimate selection (${selectedEstimate}h)`);
          } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error creating version for planning source change:', err);
            throw err;
          } finally {
            client.release();
          }
        }
      } else if (estimateChanged && !planningSourceChanged) {
        // ONLY manual estimate changed (no planning source change) - create a manual_edit history entry
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          // Read current version with row lock to prevent race conditions
          const versionResult = await client.query(
            `SELECT ai_estimate_version FROM action_items WHERE id = $1 FOR UPDATE`,
            [parseInt(id)]
          );
          const currentVersion = versionResult.rows[0]?.ai_estimate_version || 0;
          const newVersion = currentVersion + 1;
          
          await client.query(
            `UPDATE action_items SET ai_estimate_version = $1 WHERE id = $2`,
            [newVersion, parseInt(id)]
          );
          
          await client.query(
            `INSERT INTO effort_estimate_history 
             (item_type, item_id, estimate_hours, version, source, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['action-item', parseInt(id), estimated_effort_hours, newVersion, 'manual_edit', req.user.id]
          );
          
          await client.query('COMMIT');
          console.log(`Created version ${newVersion} for manual estimate edit (${estimated_effort_hours}h)`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('Error creating effort estimate history:', err);
          throw err; // Propagate error to caller
        } finally {
          client.release();
        }
      }
    }
    
    // Log status change to history table
    if (status !== undefined && item.status !== status) {
      try {
        await pool.query(`
          INSERT INTO status_history (item_type, item_id, project_id, from_status, to_status, changed_by)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['action_item', updatedItem.id, updatedItem.project_id, item.status, status, req.user.id]);
        console.log('Status change logged to history:', { from: item.status, to: status });
      } catch (err) {
        console.error('Error logging status change to history:', err);
      }
    }
    
    // Send status change notification if status changed
    if (status !== undefined && item.status !== status && updatedItem.assignee && updatedItem.assignee.trim() !== '') {
      try {
        const assigneeUser = await pool.query(
          'SELECT id FROM users WHERE username = $1',
          [updatedItem.assignee]
        );
        
        if (assigneeUser.rows.length > 0) {
          notificationService.sendStatusChangeNotification({
            assignedUserId: assigneeUser.rows[0].id,
            itemTitle: updatedItem.title,
            itemType: 'action item',
            itemId: updatedItem.id,
            oldStatus: item.status,
            newStatus: status,
            changedByName: req.user.username,
            projectId: updatedItem.project_id
          }).catch(err => {
            console.error('Error sending status change notification:', err);
          });
        }
      } catch (err) {
        console.error('Error looking up assignee for status change notification:', err);
      }
    }
    
    // Send completion notification to creator if status changed to Done
    if (status === 'Done' && item.status !== 'Done') {
      try {
        const creatorUser = await pool.query(
          'SELECT id, username, email FROM users WHERE id = $1',
          [parseInt(item.created_by)]
        );
        
        if (creatorUser.rows.length > 0) {
          const creator = creatorUser.rows[0];
          notificationService.sendCompletionNotification({
            creatorUserId: creator.id,
            creatorEmail: creator.email,
            creatorName: creator.username,
            itemType: 'action item',
            itemTitle: updatedItem.title,
            itemId: updatedItem.id,
            priority: updatedItem.priority,
            completedByName: req.user.username,
            projectId: updatedItem.project_id
          }).catch(err => {
            console.error('Error sending completion notification:', err);
          });
        }
      } catch (err) {
        console.error('Error looking up creator for completion notification:', err);
      }
      
      // Send Teams completion notification if enabled
      try {
        const [project] = await sql`SELECT * FROM projects WHERE id = ${updatedItem.project_id}`;
        if (project && project.teams_notifications_enabled && project.teams_webhook_url) {
          teamsNotifications.notifyActionCompleted(
            project.teams_webhook_url,
            updatedItem,
            req.user,
            project
          ).catch(err => console.error('Error sending Teams completion notification:', err));
        }
      } catch (err) {
        console.error('Error sending Teams completion notification:', err);
      }
    }
    
    // Send assignment notification if assignee changed
    if (assignee !== undefined && item.assignee !== assignee && assignee && assignee.trim() !== '') {
      try {
        const assigneeUser = await pool.query(
          'SELECT id FROM users WHERE username = $1',
          [assignee]
        );
        
        if (assigneeUser.rows.length > 0) {
          notificationService.sendAssignmentNotification({
            assignedUserId: assigneeUser.rows[0].id,
            assignerName: req.user.username,
            itemTitle: updatedItem.title,
            itemType: 'action item',
            itemId: updatedItem.id,
            projectId: updatedItem.project_id,
            dueDate: updatedItem.due_date,
            priority: updatedItem.priority
          }).catch(err => {
            console.error('Error sending assignment notification:', err);
          });
        }
      } catch (err) {
        console.error('Error looking up assignee for assignment notification:', err);
      }
    }
    
    // Include time tracking info in response if status changed
    const response = {
      ...updatedItem,
      timeTracking: timeTrackingResult ? {
        actualHours: timeTrackingResult.actualHours,
        completionPercent: timeTrackingResult.completionPercent,
        variance: timeTrackingResult.variance,
        variancePercent: timeTrackingResult.variancePercent,
        isExceeding: timeTrackingResult.isExceeding,
        warning: timeTrackingResult.warning
      } : undefined
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error updating action item:', error);
    res.status(500).json({ error: 'Failed to update action item' });
  }
});

// Delete action item (creator OR Team Lead or higher)
app.delete('/api/action-items/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the action item to check permissions
    const [item] = await sql`
      SELECT created_by, project_id 
      FROM action_items 
      WHERE id = ${id}
    `;
    
    if (!item) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    // Check permissions: creator OR Team Lead+
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const isCreator = parseInt(item.created_by) === parseInt(req.user.id);
    const hasRolePermission = userRoleLevel >= ROLE_HIERARCHY['Team Lead'];
    
    if (!isCreator && !hasRolePermission) {
      return res.status(403).json({ 
        error: 'Only the creator or Team Lead+ can delete this action item' 
      });
    }
    
    // Delete related data first (no FK constraint exists for attachments)
    await sql`
      DELETE FROM attachments 
      WHERE entity_type = 'action-item' AND entity_id = ${id}
    `;
    
    // Delete related checklists (must be done before deleting the action item)
    await sql`
      DELETE FROM checklists 
      WHERE related_action_id = ${id}
    `;
    
    // Delete the action item (comments will cascade automatically)
    const [deleted] = await sql`
      DELETE FROM action_items 
      WHERE id = ${id}
      RETURNING id
    `;
    
    res.json({ message: 'Action item deleted successfully' });
  } catch (error) {
    console.error('Error deleting action item:', error);
    res.status(500).json({ error: 'Failed to delete action item' });
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
  transcriptUpload.single('transcript'), 
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
          
          // Send assignment notification if assignee is set (non-blocking)
          if (item.assignee && item.assignee.trim() !== '') {
            try {
              const assigneeUser = await pool.query(
                'SELECT id FROM users WHERE username = $1',
                [item.assignee]
              );
              
              if (assigneeUser.rows.length > 0) {
                // Fire and forget - don't await to avoid blocking creation
                notificationService.sendAssignmentNotification({
                  assignedUserId: assigneeUser.rows[0].id,
                  assignerName: req.user.username,
                  itemTitle: item.title.substring(0, 200),
                  itemType: 'action item',
                  itemId: newItem[0].id,
                  projectId: parseInt(projectId),
                  dueDate: sanitizeDueDate(item.dueDate),
                  priority: item.priority || 'medium'
                }).catch(err => {
                  console.error('Error sending AI assignment notification:', err);
                });
              }
            } catch (err) {
              console.error('Error looking up assignee for AI notification:', err);
            }
          }
        }
      }

      // Create issues
      if (issues && issues.length > 0) {
        for (const issue of issues) {
          const newIssue = await sql`
            INSERT INTO issues (
              title, description, project_id, priority, category, assignee,
              status, created_by,
              created_by_ai, ai_confidence, ai_analysis_id, transcript_id
            ) VALUES (
              ${issue.title.substring(0, 200)},
              ${issue.description?.substring(0, 1000) || ''},
              ${parseInt(projectId)},
              ${issue.priority || 'medium'},
              ${issue.category || 'General'},
              ${issue.assignee || ''},
              'To Do',
              ${req.user.id},
              ${true},
              ${issue.confidence || null},
              ${finalAnalysisId},
              ${transcriptId || null}
            ) RETURNING *
          `;
          created.issues.push(newIssue[0]);
          
          // Send assignment notification if assignee is set (non-blocking)
          if (issue.assignee && issue.assignee.trim() !== '') {
            try {
              const assigneeUser = await pool.query(
                'SELECT id FROM users WHERE username = $1',
                [issue.assignee]
              );
              
              if (assigneeUser.rows.length > 0) {
                // Fire and forget - don't await to avoid blocking creation
                notificationService.sendAssignmentNotification({
                  assignedUserId: assigneeUser.rows[0].id,
                  assignerName: req.user.username,
                  itemTitle: issue.title.substring(0, 200),
                  itemType: 'issue',
                  itemId: newIssue[0].id,
                  projectId: parseInt(projectId),
                  dueDate: null,
                  priority: issue.priority || 'medium'
                }).catch(err => {
                  console.error('Error sending AI assignment notification:', err);
                });
              }
            } catch (err) {
              console.error('Error looking up assignee for AI notification:', err);
            }
          }
        }
      }

      const totalNotifications = 
        (actionItems?.filter(item => item.assignee && item.assignee.trim() !== '').length || 0) +
        (issues?.filter(issue => issue.assignee && issue.assignee.trim() !== '').length || 0);
        
      console.log(`✅ Created ${created.actionItems.length} action items and ${created.issues.length} issues from AI analysis`);
      if (totalNotifications > 0) {
        console.log(`📧 Sent ${totalNotifications} assignment notifications`);
      }
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
            
            // Send assignment notification if assignee is set (non-blocking)
            if (finalAssignee && finalAssignee.trim() !== '') {
              try {
                const assigneeUser = await pool.query(
                  'SELECT id FROM users WHERE username = $1',
                  [finalAssignee]
                );
                
                if (assigneeUser.rows.length > 0) {
                  // Fire and forget - don't await to avoid blocking creation
                  notificationService.sendAssignmentNotification({
                    assignedUserId: assigneeUser.rows[0].id,
                    assignerName: req.user.username,
                    itemTitle: item.title.substring(0, 200),
                    itemType: 'action item',
                    itemId: newItem[0].id,
                    projectId: parseInt(projectId),
                    dueDate: sanitizeDueDate(item.dueDate),
                    priority: item.priority || 'medium'
                  }).catch(err => {
                    console.error('Error sending AI assignment notification:', err);
                  });
                }
              } catch (err) {
                console.error('Error looking up assignee for AI notification:', err);
              }
            }
            
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
          // PERMISSION CHECK: Validate assignment permissions
          let finalAssignee = issue.assignee || '';
          if (issue.assignee) {
            const assignCheck = await canAssignTo(req.user.id, issue.assignee, parseInt(projectId));
            if (!assignCheck.allowed) {
              if (assignCheck.suggestedAction === 'assign_to_self' && assignCheck.selfUsername) {
                // Reassign to self if user can't assign to others
                finalAssignee = assignCheck.selfUsername;
                results.issues.permissionDenied.push({
                  title: issue.title,
                  originalAssignee: issue.assignee,
                  reassignedTo: finalAssignee,
                  reason: 'Insufficient permissions to assign to others - reassigned to self'
                });
                
                // Audit the permission override
                await auditAIAction(transcriptId, req.user.id, 'modify', {
                  itemType: 'issue',
                  title: issue.title,
                  action: 'assignment_override',
                  originalAssignee: issue.assignee,
                  newAssignee: finalAssignee
                });
              } else {
                // Skip this item if can't assign
                results.issues.permissionDenied.push({
                  title: issue.title,
                  originalAssignee: issue.assignee,
                  reason: assignCheck.reason,
                  action: 'skipped'
                });
                continue;
              }
            }
          }
          
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
                title, description, project_id, priority, category, assignee,
                status, created_by,
                created_by_ai, ai_confidence, ai_analysis_id, transcript_id, created_via_ai_by
              ) VALUES (
                ${issue.title.substring(0, 200)},
                ${issue.description?.substring(0, 1000) || ''},
                ${parseInt(projectId)},
                ${issue.priority || 'medium'},
                ${issue.category || 'General'},
                ${finalAssignee},
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
            
            // Send assignment notification if assignee is set (non-blocking)
            if (finalAssignee && finalAssignee.trim() !== '') {
              try {
                const assigneeUser = await pool.query(
                  'SELECT id FROM users WHERE username = $1',
                  [finalAssignee]
                );
                
                if (assigneeUser.rows.length > 0) {
                  // Fire and forget - don't await to avoid blocking creation
                  notificationService.sendAssignmentNotification({
                    assignedUserId: assigneeUser.rows[0].id,
                    assignerName: req.user.username,
                    itemTitle: issue.title.substring(0, 200),
                    itemType: 'issue',
                    itemId: newIssue[0].id,
                    projectId: parseInt(projectId),
                    dueDate: null,
                    priority: issue.priority || 'medium'
                  }).catch(err => {
                    console.error('Error sending AI assignment notification:', err);
                  });
                }
              } catch (err) {
                console.error('Error looking up assignee for AI notification:', err);
              }
            }
            
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
      const totalNotifications = 
        results.actionItems.created.filter(item => item.assignee && item.assignee.trim() !== '').length +
        results.issues.created.filter(issue => issue.assignee && issue.assignee.trim() !== '').length;
      
      console.log(`✅ Smart create: ${totalCreated} new items, ${totalUpdated} updated items`);
      if (totalNotifications > 0) {
        console.log(`📧 Sent ${totalNotifications} assignment notifications`);
      }
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
        
        notificationService.sendMentionNotification({
          mentionedUserId,
          mentionerName: req.user.username,
          itemTitle: issue.title,
          itemType: 'issue',
          itemId: issueId,
          projectId: issue.project_id,
          commentPreview: comment
        }).catch(err => console.error('Error sending mention email:', err));
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
        
        notificationService.sendMentionNotification({
          mentionedUserId,
          mentionerName: req.user.username,
          itemTitle: item.title,
          itemType: 'action item',
          itemId: itemId,
          projectId: item.project_id,
          commentPreview: comment
        }).catch(err => console.error('Error sending mention email:', err));
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

// =====================================================
// ATTACHMENT API ENDPOINTS
// =====================================================

// -----------------------------------------------------
// POST /api/:entityType/:entityId/attachments
// Upload attachments to an issue or action item
// -----------------------------------------------------
app.post('/api/:entityType/:entityId/attachments', 
  authenticateToken, 
  attachmentUpload.array('files', 5), 
  async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      
      // Validate entity type
      if (!['issues', 'action-items'].includes(entityType)) {
        return res.status(400).json({ error: 'Invalid entity type' });
      }
      
      // Normalize entity type for database
      const dbEntityType = entityType === 'issues' ? 'issue' : 'action_item';
      const tableName = entityType === 'issues' ? 'issues' : 'action_items';
      
      // Check if entity exists
      const entityCheck = await pool.query(
        `SELECT id FROM ${tableName} WHERE id = $1`,
        [entityId]
      );
      
      if (entityCheck.rows.length === 0) {
        // Clean up uploaded files
        if (req.files) {
          for (const file of req.files) {
            await fs.unlink(file.path).catch(() => {});
          }
        }
        return res.status(404).json({ error: `${entityType} not found` });
      }
      
      // Check if files were uploaded
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
      
      // Save attachment records to database
      const attachments = [];
      
      for (const file of req.files) {
        const result = await pool.query(
          `INSERT INTO attachments 
           (entity_type, entity_id, file_name, original_name, file_path, file_size, file_type, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            dbEntityType,
            entityId,
            file.filename,
            file.originalname,
            file.path,
            file.size,
            file.mimetype,
            req.user.id
          ]
        );
        
        attachments.push(result.rows[0]);
      }
      
      res.status(201).json({
        message: `${attachments.length} file(s) uploaded successfully`,
        attachments: attachments
      });
    } catch (error) {
      console.error('Error uploading attachments:', error);
      
      // Clean up uploaded files on error
      if (req.files) {
        for (const file of req.files) {
          await fs.unlink(file.path).catch(() => {});
        }
      }
      
      res.status(500).json({ 
        error: 'Failed to upload attachments',
        details: error.message 
      });
    }
  }
);

// -----------------------------------------------------
// GET /api/:entityType/:entityId/attachments
// Get all attachments for an issue or action item
// -----------------------------------------------------
app.get('/api/:entityType/:entityId/attachments', authenticateToken, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    
    // Validate entity type
    if (!['issues', 'action-items'].includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }
    
    // Normalize entity type for database
    const dbEntityType = entityType === 'issues' ? 'issue' : 'action_item';
    
    // Get attachments with uploader information
    const result = await pool.query(
      `SELECT a.*, u.username as uploader_name, u.email as uploader_email
       FROM attachments a
       LEFT JOIN users u ON a.uploaded_by = u.id
       WHERE a.entity_type = $1 AND a.entity_id = $2
       ORDER BY a.uploaded_at DESC`,
      [dbEntityType, entityId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// -----------------------------------------------------
// GET /api/attachments/:attachmentId/download
// Download a specific attachment
// -----------------------------------------------------
app.get('/api/attachments/:attachmentId/download', authenticateToken, async (req, res) => {
  try {
    const { attachmentId } = req.params;
    
    // Get attachment info
    const result = await pool.query(
      'SELECT * FROM attachments WHERE id = $1',
      [attachmentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = result.rows[0];
    
    // Check if file exists
    try {
      await fs.access(attachment.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    // Set headers for download
    res.setHeader('Content-Type', attachment.file_type);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
    res.setHeader('Content-Length', attachment.file_size);
    
    // Stream file to response
    const fileStream = require('fs').createReadStream(attachment.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// -----------------------------------------------------
// DELETE /api/attachments/:attachmentId
// Delete an attachment
// -----------------------------------------------------
app.delete('/api/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const { attachmentId } = req.params;
    
    // Get attachment info
    const result = await pool.query(
      'SELECT * FROM attachments WHERE id = $1',
      [attachmentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = result.rows[0];
    
    // Check permissions
    if (!canDeleteAttachment(req.user, attachment)) {
      return res.status(403).json({ error: 'Insufficient permissions to delete this attachment' });
    }
    
    // Delete file from filesystem
    try {
      await fs.unlink(attachment.file_path);
    } catch (error) {
      console.error('Error deleting file:', error);
      // Continue even if file doesn't exist
    }
    
    // Delete from database (trigger will update attachment_count)
    await pool.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
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

// ============= ADMIN TOOLS =============

// ============= RISK REGISTER API ENDPOINTS =============
// RISK REGISTER API ENDPOINTS
// ============================================================================

// Get risk categories for a project
app.get('/api/projects/:projectId/risk-categories', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Check project access
    const hasAccess = await checkProjectAccess(req.user.id, projectId, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get default categories + project-specific categories
    const result = await pool.query(
      `SELECT * FROM risk_categories 
       WHERE project_id IS NULL OR project_id = $1
       ORDER BY display_order, name`,
      [projectId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching risk categories:', error);
    res.status(500).json({ error: 'Failed to fetch risk categories' });
  }
});

// Create new risk
app.post('/api/projects/:projectId/risks', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    
    // Check permissions
    const hasAccess = await checkProjectAccess(userId, projectId, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!canPerformRiskAction(req.user, 'CREATE_RISK')) {
      return res.status(403).json({ error: 'Insufficient permissions to create risks' });
    }
    
    const {
      title,
      description,
      category,
      risk_source,
      tags,
      probability,
      impact,
      response_strategy,
      mitigation_plan,
      contingency_plan,
      cost_currency,
      mitigation_cost,
      mitigation_effort_hours,
      risk_owner_id,
      target_resolution_date,
      review_date,
      status
    } = req.body;
    
    // Validate required fields
    if (!title || !category) {
      return res.status(400).json({ error: 'Title and category are required' });
    }
    
    // Generate risk ID
    const riskId = await generateRiskId(projectId);
    
    // Insert risk
    const result = await pool.query(
      `INSERT INTO risks (
        risk_id, project_id, title, description, category, risk_source, tags,
        probability, impact, response_strategy, mitigation_plan, contingency_plan,
        cost_currency, mitigation_cost, mitigation_effort_hours, risk_owner_id, 
        target_resolution_date, review_date, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        riskId, projectId, title, description, category, risk_source, tags,
        probability, impact, response_strategy, mitigation_plan, contingency_plan,
        cost_currency || 'USD', mitigation_cost, mitigation_effort_hours, risk_owner_id,
        target_resolution_date, review_date, status || 'identified', userId
      ]
    );
    
    const risk = result.rows[0];
    
    // Create initial assessment record if probability and impact provided
    if (probability && impact) {
      const { score, level } = calculateRiskScore(probability, impact);
      await pool.query(
        `INSERT INTO risk_assessments (risk_id, probability, impact, risk_score, risk_level, assessed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [risk.id, probability, impact, score, level, userId]
      );
    }
    
    // Log creation
    await pool.query(
      `INSERT INTO risk_updates (risk_id, update_type, notes, created_by)
       VALUES ($1, $2, $3, $4)`,
      [risk.id, 'note', `Risk created: ${title}`, userId]
    );
    
    res.status(201).json(risk);
  } catch (error) {
    console.error('Error creating risk:', error);
    res.status(500).json({ error: 'Failed to create risk' });
  }
});

// Get risks for a project (with filters)
app.get('/api/projects/:projectId/risks', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, category, level, owner, sort = 'score_desc' } = req.query;
    
    // Check access
    const hasAccess = await checkProjectAccess(req.user.id, projectId, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!canPerformRiskAction(req.user, 'VIEW_RISKS')) {
      return res.status(403).json({ error: 'Insufficient permissions to view risks' });
    }
    
    // Build query
    let query = `
      SELECT r.*, u.username as owner_name, u.email as owner_email
      FROM risks r
      LEFT JOIN users u ON r.risk_owner_id = u.id
      WHERE r.project_id = $1
    `;
    const params = [projectId];
    let paramCount = 1;
    
    // Add filters
    if (status) {
      paramCount++;
      query += ` AND r.status = $${paramCount}`;
      params.push(status);
    }
    
    if (category) {
      paramCount++;
      query += ` AND r.category = $${paramCount}`;
      params.push(category);
    }
    
    if (level) {
      paramCount++;
      query += ` AND r.risk_level = $${paramCount}`;
      params.push(level);
    }
    
    if (owner) {
      paramCount++;
      query += ` AND r.risk_owner_id = $${paramCount}`;
      params.push(owner);
    }
    
    // Add sorting
    switch (sort) {
      case 'score_desc':
        query += ' ORDER BY r.risk_score DESC NULLS LAST, r.created_at DESC';
        break;
      case 'score_asc':
        query += ' ORDER BY r.risk_score ASC NULLS LAST, r.created_at DESC';
        break;
      case 'date_desc':
        query += ' ORDER BY r.created_at DESC';
        break;
      case 'date_asc':
        query += ' ORDER BY r.created_at ASC';
        break;
      case 'title_asc':
        query += ' ORDER BY r.title ASC';
        break;
      case 'title_desc':
        query += ' ORDER BY r.title DESC';
        break;
      default:
        query += ' ORDER BY r.risk_score DESC NULLS LAST, r.created_at DESC';
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching risks:', error);
    res.status(500).json({ error: 'Failed to fetch risks' });
  }
});

// Get single risk
app.get('/api/risks/:riskId', authenticateToken, async (req, res) => {
  try {
    const { riskId } = req.params;
    
    const result = await pool.query(
      `SELECT r.*, u.username as owner_name, u.email as owner_email,
              c.username as created_by_name
       FROM risks r
       LEFT JOIN users u ON r.risk_owner_id = u.id
       LEFT JOIN users c ON r.created_by = c.id
       WHERE r.id = $1`,
      [riskId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }
    
    const risk = result.rows[0];
    
    // Check access
    const hasAccess = await checkProjectAccess(req.user.id, risk.project_id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(risk);
  } catch (error) {
    console.error('Error fetching risk:', error);
    res.status(500).json({ error: 'Failed to fetch risk' });
  }
});

// Get tags for a specific risk
app.get("/api/risks/:riskId/tags", authenticateToken, async (req, res) => {
  try {
    const { riskId } = req.params;
    
    // Get risk and verify access
    const risk = await pool.query('SELECT project_id FROM risks WHERE id = $1', [riskId]);
    if (risk.rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }
    
    const hasAccess = await checkProjectAccess(req.user.id, risk.rows[0].project_id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const tags = await pool.query(
      `SELECT t.* FROM tags t
       JOIN risk_tags rt ON t.id = rt.tag_id
       WHERE rt.risk_id = $1
       ORDER BY t.name ASC`,
      [riskId]
    );
    
    res.json(tags.rows);
  } catch (error) {
    console.error('Error fetching risk tags:', error);
    res.status(500).json({ error: 'Failed to fetch risk tags' });
  }
});

// Assign tags to a risk
app.put("/api/risks/:riskId/tags", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { riskId } = req.params;
    const { tagIds } = req.body;
    
    // Get risk and verify access
    const risk = await client.query('SELECT project_id FROM risks WHERE id = $1', [riskId]);
    if (risk.rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }
    
    const hasAccess = await checkProjectAccess(req.user.id, risk.rows[0].project_id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validate tags belong to same project and have correct type
    if (tagIds && tagIds.length > 0) {
      const tagCheck = await client.query(
        `SELECT id FROM tags 
         WHERE id = ANY($1) 
         AND project_id = $2 
         AND tag_type IN ('risk', 'both')`,
        [tagIds, risk.rows[0].project_id]
      );
      
      if (tagCheck.rows.length !== tagIds.length) {
        return res.status(400).json({ error: 'Invalid tags or tag types for risk' });
      }
    }
    
    await client.query('BEGIN');
    
    // Delete existing tags
    await client.query(`DELETE FROM risk_tags WHERE risk_id = $1`, [riskId]);
    
    // Insert new tags
    if (tagIds && tagIds.length > 0) {
      const values = tagIds.map((tagId, index) => 
        `($1, $${index + 2})`
      ).join(', ');
      
      await client.query(
        `INSERT INTO risk_tags (risk_id, tag_id) VALUES ${values}`,
        [riskId, ...tagIds]
      );
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Tags updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating risk tags:', error);
    res.status(500).json({ error: 'Failed to update risk tags' });
  } finally {
    client.release();
  }
});

// Update risk
app.patch('/api/risks/:riskId', authenticateToken, async (req, res) => {
  try {
    const { riskId } = req.params;
    const userId = req.user.id;
    
    // Get existing risk
    const existing = await pool.query('SELECT * FROM risks WHERE id = $1', [riskId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }
    
    const risk = existing.rows[0];
    
    // Check access
    const hasAccess = await checkProjectAccess(userId, risk.project_id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check permissions
    const canEditAny = canPerformRiskAction(req.user, 'EDIT_ANY_RISK');
    const canEditOwn = canPerformRiskAction(req.user, 'EDIT_OWN_RISK', risk);
    
    if (!canEditAny && !canEditOwn) {
      return res.status(403).json({ error: 'Insufficient permissions to edit this risk' });
    }
    
    const updates = req.body;
    const allowedFields = [
      'title', 'description', 'category', 'risk_source', 'tags',
      'probability', 'impact', 'response_strategy', 'mitigation_plan',
      'contingency_plan', 'cost_currency', 'mitigation_cost', 'mitigation_effort_hours',
      'risk_owner_id', 'target_resolution_date', 'review_date', 'status',
      'residual_probability', 'residual_impact'
    ];
    
    const updateFields = [];
    const values = [];
    let paramCount = 0;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        paramCount++;
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Add updated_at
    paramCount++;
    updateFields.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    
    // Add risk ID
    paramCount++;
    values.push(riskId);
    
    const query = `
      UPDATE risks 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    const updatedRisk = result.rows[0];
    
    // Log update
    await pool.query(
      `INSERT INTO risk_updates (risk_id, update_type, notes, created_by)
       VALUES ($1, $2, $3, $4)`,
      [riskId, 'note', `Risk updated: ${Object.keys(updates).join(', ')}`, userId]
    );
    
    // If probability or impact changed, create new assessment
    if (updates.probability || updates.impact) {
      const prob = updates.probability || risk.probability;
      const imp = updates.impact || risk.impact;
      const { score, level } = calculateRiskScore(prob, imp);
      
      await pool.query(
        `INSERT INTO risk_assessments (risk_id, probability, impact, risk_score, risk_level, assessed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [riskId, prob, imp, score, level, userId]
      );
    }
    
    res.json(updatedRisk);
  } catch (error) {
    console.error('Error updating risk:', error);
    res.status(500).json({ error: 'Failed to update risk' });
  }
});

// Delete risk
app.delete('/api/risks/:riskId', authenticateToken, async (req, res) => {
  try {
    const { riskId } = req.params;
    
    // Get risk
    const existing = await pool.query('SELECT * FROM risks WHERE id = $1', [riskId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Risk not found' });
    }
    
    const risk = existing.rows[0];
    
    // Check access
    const hasAccess = await checkProjectAccess(req.user.id, risk.project_id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check permissions
    if (!canPerformRiskAction(req.user, 'DELETE_RISK')) {
      return res.status(403).json({ error: 'Insufficient permissions to delete risks' });
    }
    
    // Delete risk (cascade will handle related records)
    await pool.query('DELETE FROM risks WHERE id = $1', [riskId]);
    
    res.json({ message: 'Risk deleted successfully' });
  } catch (error) {
    console.error('Error deleting risk:', error);
    res.status(500).json({ error: 'Failed to delete risk' });
  }
});

// ========================================
// CHECKLIST API ENDPOINTS
// ========================================

// GET /api/checklist-templates - List all checklist templates
app.get('/api/checklist-templates', authenticateToken, async (req, res) => {
  try {
    const { include_ai_generated } = req.query;
    
    let query = `
      SELECT 
        ct.id, 
        ct.name, 
        ct.description, 
        ct.icon, 
        ct.category, 
        ct.created_at,
        ct.is_reusable,
        u.username as created_by_name,
        COUNT(DISTINCT c.id) as usage_count
      FROM checklist_templates ct
      LEFT JOIN users u ON ct.created_by = u.id
      LEFT JOIN checklists c ON ct.id = c.template_id
      WHERE ct.is_active = true
    `;
    
    // By default, hide AI-generated non-reusable templates
    if (include_ai_generated !== 'true') {
      query += ` AND ct.is_reusable = true`;
    }
    
    query += `
      GROUP BY ct.id, u.username
      ORDER BY ct.is_system DESC, ct.name ASC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching checklist templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// GET /api/checklists - List all checklists with filtering
app.get('/api/checklists', authenticateToken, async (req, res) => {
  try {
    const { project_id, status, template_id, assigned_to } = req.query;
    const userId = req.user.id;
    
    // Get user's accessible projects
    const projectIds = await getUserProjectIds(userId);
    
    if (projectIds.length === 0) {
      return res.json([]);
    }
    
    // Build query with filters (LEFT JOIN for template to support standalone checklists)
    let query = `
      SELECT 
        c.*,
        ct.name as template_name,
        ct.icon as template_icon,
        p.name as project_name,
        u.username as assigned_to_name,
        creator.username as created_by_name
      FROM checklists c
      LEFT JOIN checklist_templates ct ON c.template_id = ct.id
      INNER JOIN projects p ON c.project_id = p.id
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN users creator ON c.created_by = creator.id
      WHERE c.project_id = ANY($1)
    `;
    
    const params = [projectIds];
    let paramIndex = 2;
    
    if (project_id) {
      query += ` AND c.project_id = $${paramIndex}`;
      params.push(project_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (template_id) {
      query += ` AND c.template_id = $${paramIndex}`;
      params.push(template_id);
      paramIndex++;
    }
    
    if (assigned_to) {
      query += ` AND c.assigned_to = $${paramIndex}`;
      params.push(assigned_to);
      paramIndex++;
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching checklists:', error);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

// GET /api/checklists/:id - Get checklist details with responses
app.get('/api/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    
    // Check access
    const hasAccess = await canAccessChecklist(userId, checklistId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get checklist details (LEFT JOIN for template to support standalone checklists)
    const checklistResult = await pool.query(
      `SELECT 
        c.*,
        ct.name as template_name,
        ct.icon as template_icon,
        ct.category as template_category,
        p.name as project_name,
        u.username as assigned_to_name,
        creator.username as created_by_name
      FROM checklists c
      LEFT JOIN checklist_templates ct ON c.template_id = ct.id
      INNER JOIN projects p ON c.project_id = p.id
      LEFT JOIN users u ON c.assigned_to = u.id
      LEFT JOIN users creator ON c.created_by = creator.id
      WHERE c.id = $1`,
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    const checklist = checklistResult.rows[0];
    
    // Handle standalone checklists (no template)
    if (checklist.is_standalone || !checklist.template_id) {
      // Get sections
      const sectionsResult = await pool.query(
        `SELECT 
          id,
          title,
          description,
          display_order
        FROM checklist_sections
        WHERE checklist_id = $1
        ORDER BY display_order`,
        [checklistId]
      );
      
      // Get items directly from checklist_responses
      const itemsResult = await pool.query(
        `SELECT 
          id as response_id,
          checklist_id,
          section_id,
          item_text,
          notes,
          is_completed,
          completed_by,
          completed_at,
          response_date,
          response_boolean,
          display_order
        FROM checklist_responses
        WHERE checklist_id = $1
        ORDER BY section_id, display_order`,
        [checklistId]
      );
      
      // Organize items by section
      const sections = sectionsResult.rows.map(section => ({
        ...section,
        items: itemsResult.rows
          .filter(item => item.section_id === section.id)
          .map(item => ({
            ...item,
            id: item.response_id,
            field_type: 'checkbox'
          }))
      }));
      
      // Return standalone checklist format
      return res.json({
        ...checklist,
        is_standalone: true,
        sections
      });
    }
    
    // Get template structure with responses
    const sectionsResult = await pool.query(
      `SELECT 
        cts.id,
        cts.title,
        cts.description,
        cts.section_number,
        cts.display_order,
        cts.parent_section_id
      FROM checklist_template_sections cts
      WHERE cts.template_id = $1
      ORDER BY cts.display_order`,
      [checklist.template_id]
    );
    
    // Get items with responses
    const itemsResult = await pool.query(
      `SELECT 
        cti.id,
        cti.id as item_id,
        cti.id as template_item_id,
        cti.section_id,
        cti.item_text,
        cti.field_type,
        cti.field_options,
        cti.is_required,
        cti.help_text,
        cti.display_order,
        cr.id as response_id,
        cr.checklist_id,
        cr.response_value,
        cr.response_date,
        cr.response_boolean,
        cr.notes,
        cr.is_completed,
        cr.completed_by,
        cr.completed_at
      FROM checklist_template_items cti
      LEFT JOIN checklist_responses cr ON (
        cti.id = cr.template_item_id AND cr.checklist_id = $1
      )
      WHERE cti.section_id IN (
        SELECT id FROM checklist_template_sections WHERE template_id = $2
      )
      ORDER BY cti.display_order`,
      [checklistId, checklist.template_id]
    );
    
    // Organize data
    const sections = sectionsResult.rows.map(section => ({
      ...section,
      items: itemsResult.rows.filter(item => item.section_id === section.id)
    }));
    
    // Get comments
    const commentsResult = await pool.query(
      `SELECT 
        cc.*,
        u.username as commenter_name
      FROM checklist_comments cc
      LEFT JOIN users u ON cc.created_by = u.id
      WHERE cc.checklist_id = $1
      ORDER BY cc.created_at DESC`,
      [checklistId]
    );
    
    // Get signoffs
    const signoffsResult = await pool.query(
      `SELECT 
        cs.*,
        u.username as signer_name
      FROM checklist_signoffs cs
      LEFT JOIN users u ON cs.signed_by = u.id
      WHERE cs.checklist_id = $1
      ORDER BY cs.created_at`,
      [checklistId]
    );
    
    res.json({
      ...checklist,
      sections,
      comments: commentsResult.rows,
      signoffs: signoffsResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching checklist details:', error);
    res.status(500).json({ error: 'Failed to fetch checklist details' });
  }
});

// POST /api/checklists - Create new checklist from template
app.post('/api/checklists', authenticateToken, async (req, res) => {
  try {
    const {
      template_id,
      project_id,
      title,
      description,
      assigned_to,
      due_date
    } = req.body;
    
    const userId = req.user.id;
    
    // Check project access
    const projectIds = await getUserProjectIds(userId);
    console.log('[CHECKLIST_CREATE] User ID:', userId);
    console.log('[CHECKLIST_CREATE] Accessible project IDs:', projectIds);
    console.log('[CHECKLIST_CREATE] Requested project ID:', project_id, 'Type:', typeof project_id);
    console.log('[CHECKLIST_CREATE] Parsed project ID:', parseInt(project_id));
    console.log('[CHECKLIST_CREATE] Includes check:', projectIds.includes(parseInt(project_id)));
    
    if (!projectIds.includes(parseInt(project_id))) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    
    // Get template to calculate total items
    const itemsCount = await pool.query(
      `SELECT COUNT(*) as count
       FROM checklist_template_items cti
       INNER JOIN checklist_template_sections cts ON cti.section_id = cts.id
       WHERE cts.template_id = $1`,
      [template_id]
    );
    
    const totalItems = parseInt(itemsCount.rows[0].count);
    const checklistId = generateChecklistId();
    
    // Create checklist
    const result = await pool.query(
      `INSERT INTO checklists (
        checklist_id, template_id, project_id, title, description,
        assigned_to, due_date, total_items, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        checklistId,
        template_id,
        project_id,
        title,
        description,
        assigned_to || null,
        due_date || null,
        totalItems,
        userId
      ]
    );
    
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error('Error creating checklist:', error);
    res.status(500).json({ error: 'Failed to create checklist' });
  }
});

// PUT /api/checklists/:id - Update checklist metadata
app.put('/api/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    
    // Check access
    const hasAccess = await canAccessChecklist(userId, checklistId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const {
      title,
      description,
      status,
      assigned_to,
      due_date
    } = req.body;
    
    const result = await pool.query(
      `UPDATE checklists
       SET 
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         status = COALESCE($3, status),
         assigned_to = COALESCE($4, assigned_to),
         due_date = COALESCE($5, due_date),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [title, description, status, assigned_to, due_date, checklistId]
    );
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error updating checklist:', error);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
});

// PATCH /api/checklists/:id/feedback - Save user feedback (thumbs up/down)
app.patch('/api/checklists/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    const { feedback } = req.body; // 'positive', 'negative', or null
    
    // Validate feedback value
    if (feedback && !['positive', 'negative'].includes(feedback)) {
      return res.status(400).json({ error: 'Invalid feedback value. Must be "positive" or "negative"' });
    }
    
    // Check access
    const hasAccess = await canAccessChecklist(userId, checklistId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await pool.query(
      `UPDATE checklists
       SET user_feedback = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [feedback, checklistId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    res.json({ 
      success: true, 
      feedback: result.rows[0].user_feedback,
      message: feedback ? 'Feedback saved successfully' : 'Feedback cleared'
    });
    
  } catch (error) {
    console.error('Error saving checklist feedback:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// POST /api/checklists/:id/responses - Save checklist responses
app.post('/api/checklists/:id/responses', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    const { responses } = req.body; // Array of {template_item_id OR item_id, value, type, notes, is_completed}
    
    // Check access
    const hasAccess = await canAccessChecklist(userId, checklistId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update responses in transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const response of responses) {
        // Accept multiple field names for compatibility: template_item_id, item_id, or id
        const templateItemId = response.template_item_id || response.item_id || response.id;
        const { value, type, notes, is_completed } = response;
        
        if (!templateItemId) {
          throw new Error('Missing required field: template_item_id, item_id, or id');
        }
        
        // Phase 3b Feature 5: Check if item is blocked by dependencies before allowing completion
        if (is_completed) {
          // Get the response ID for this item
          const itemResult = await client.query(
            `SELECT id FROM checklist_responses 
             WHERE checklist_id = $1 AND template_item_id = $2`,
            [checklistId, templateItemId]
          );
          
          if (itemResult.rows.length > 0) {
            const itemId = itemResult.rows[0].id;
            const blockStatus = await dependencyService.checkIfItemBlocked(itemId);
            
            if (blockStatus.isBlocked) {
              console.log(`⚠️ Item ${itemId} is blocked by ${blockStatus.blockedBy.length} incomplete dependencies`);
              await client.query('ROLLBACK');
              return res.status(400).json({
                error: 'Cannot complete item',
                message: 'This item has incomplete dependencies',
                blockedBy: blockStatus.blockedBy,
                totalDependencies: blockStatus.totalDependencies,
                completedDependencies: blockStatus.completedDependencies
              });
            }
          }
        }
        
        // Determine which field to use based on type
        let responseValue = null;
        let responseDate = null;
        let responseBoolean = null;
        
        if (type === 'checkbox' || type === 'radio') {
          responseBoolean = value === true || value === 'true';
        } else if (type === 'date') {
          responseDate = value;
        } else {
          responseValue = value;
        }
        
        // Get existing item_text and section_id if this is an update
        const existingItem = await client.query(
          `SELECT item_text, section_id, display_order 
           FROM checklist_responses 
           WHERE checklist_id = $1 AND template_item_id = $2`,
          [checklistId, templateItemId]
        );
        
        // Use provided values or preserve existing ones
        const itemText = response.item_text !== undefined ? response.item_text : 
                        (existingItem.rows.length > 0 ? existingItem.rows[0].item_text : null);
        const sectionId = response.section_id !== undefined ? response.section_id :
                         (existingItem.rows.length > 0 ? existingItem.rows[0].section_id : null);
        const displayOrder = response.display_order !== undefined ? response.display_order :
                            (existingItem.rows.length > 0 ? existingItem.rows[0].display_order : null);
        
        await client.query(
          `INSERT INTO checklist_responses (
            checklist_id, template_item_id, response_value, response_date,
            response_boolean, notes, is_completed, completed_by, completed_at,
            item_text, section_id, display_order, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
          ON CONFLICT (checklist_id, template_item_id)
          DO UPDATE SET
            response_value = EXCLUDED.response_value,
            response_date = EXCLUDED.response_date,
            response_boolean = EXCLUDED.response_boolean,
            notes = EXCLUDED.notes,
            is_completed = EXCLUDED.is_completed,
            completed_by = EXCLUDED.completed_by,
            completed_at = EXCLUDED.completed_at,
            item_text = EXCLUDED.item_text,
            section_id = EXCLUDED.section_id,
            display_order = EXCLUDED.display_order,
            updated_at = CURRENT_TIMESTAMP`,
          [
            checklistId,
            templateItemId,
            responseValue,
            responseDate,
            responseBoolean,
            notes || null,
            is_completed || false,
            userId,
            is_completed ? new Date() : null,
            itemText,
            sectionId,
            displayOrder
          ]
        );
      }
      
      // Update completed_items AND total_items counts to ensure data integrity
      const countsResult = await client.query(
        `SELECT 
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE is_completed = true) as completed_count
         FROM checklist_responses
         WHERE checklist_id = $1`,
        [checklistId]
      );
      
      const totalCount = parseInt(countsResult.rows[0].total_count);
      const completedCount = parseInt(countsResult.rows[0].completed_count);
      
      await client.query(
        `UPDATE checklists
         SET 
           total_items = $1,
           completed_items = $2,
           updated_at = CURRENT_TIMESTAMP,
           status = CASE 
             WHEN $2 = 0 THEN 'not-started'
             WHEN $2 = $1 AND $1 > 0 THEN 'completed'
             ELSE 'in-progress'
           END
         WHERE id = $3`,
        [totalCount, completedCount, checklistId]
      );
      
      await client.query('COMMIT');
      
      // Get updated checklist data
      const updatedChecklist = await client.query(
        `SELECT * FROM checklists WHERE id = $1`,
        [checklistId]
      );
      
      // Phase 3b Feature 2: Check and apply completion actions
      // Trigger auto-status update for linked issues/action items
      const completionService = require('./services/completion-service');
      
      // Run completion check asynchronously (don't block response)
      completionService.checkAndApplyCompletionAction(checklistId)
        .then(result => {
          if (result) {
            console.log(`✅ Auto-updated ${result.entityType} ${result.entityId}: ${result.oldStatus} → ${result.newStatus}`);
          }
        })
        .catch(error => {
          console.error('❌ Error in completion action:', error);
          // Don't fail the request if completion check fails
        });
      
      res.json({ 
        success: true,
        completed_items: parseInt(completedCount.rows[0].count),
        checklist: updatedChecklist.rows[0]
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error saving responses:', error);
    res.status(500).json({ error: 'Failed to save responses' });
  }
});

// POST /api/checklists/:id/comments - Add comment to checklist
app.post('/api/checklists/:id/comments', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const { comment } = req.body;
    const userId = req.user.id;
    
    // Check access
    const hasAccess = await canAccessChecklist(userId, checklistId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Add comment
    const result = await pool.query(
      `INSERT INTO checklist_comments (checklist_id, created_by, comment)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [checklistId, userId, comment]
    );
    
    res.status(201).json(result.rows[0]);
    
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// DELETE /api/checklists/:id - Delete checklist
app.delete('/api/checklists/:id', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    
    // Check access
    const hasAccess = await canAccessChecklist(userId, checklistId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete (cascades to responses, comments, signoffs)
    await pool.query('DELETE FROM checklists WHERE id = $1', [checklistId]);
    
    res.json({ success: true, message: 'Checklist deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting checklist:', error);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

// ========================================
// AI CHECKLIST GENERATION ENDPOINTS
// ========================================

// POST /api/checklists/generate-from-issue
app.post('/api/checklists/generate-from-issue', authenticateToken, async (req, res) => {
  try {
    const { issue_id, attachment_ids = [], use_description = true } = req.body;
    const userId = req.user.id;
    
    // Rate limiting
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: `Maximum 10 generations per hour. Try again in ${rateLimit.minutesUntilReset} minutes.`
      });
    }
    
    // Get issue details
    const issueResult = await pool.query(
      `SELECT 
        i.*,
        p.id as project_id,
        p.name as project_name,
        u.username as creator_name,
        COALESCE(
          (SELECT json_agg(json_build_object('name', t.name, 'color', t.color))
           FROM issue_tags it
           JOIN tags t ON it.tag_id = t.id
           WHERE it.issue_id = i.id), '[]'::json
        ) as tags
      FROM issues i
      INNER JOIN projects p ON i.project_id = p.id
      LEFT JOIN users u ON i.created_by::integer = u.id
      WHERE i.id = $1`,
      [issue_id]
    );
    
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const issue = issueResult.rows[0];
    
    // Check user has access to this project
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [issue.project_id, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    
    // Format tags for AI
    issue.tags = Array.isArray(issue.tags) ? issue.tags.map(t => t.name).join(', ') : '';
    
    // Generate checklist using AI
    console.log(`✨ Generating checklist from issue ${issue_id} with ${attachment_ids.length} attachments...`);
    const checklistPreview = await generateChecklistFromIssue(issue, attachment_ids, use_description);
    
    // Add metadata
    checklistPreview.issue_id = issue_id;
    checklistPreview.project_id = issue.project_id;
    checklistPreview.project_name = issue.project_name;
    checklistPreview.source_type = 'issue';
    checklistPreview.source_title = issue.title;
    checklistPreview.generated_at = new Date().toISOString();
    checklistPreview.rate_limit_remaining = rateLimit.remaining;
    
    res.json(checklistPreview);
    
  } catch (error) {
    console.error('Error generating checklist from issue:', error);
    res.status(500).json({ 
      error: 'Failed to generate checklist',
      message: error.message 
    });
  }
});

// POST /api/checklists/generate-from-action
app.post('/api/checklists/generate-from-action', authenticateToken, async (req, res) => {
  try {
    const { action_id, attachment_ids = [], use_description = true } = req.body;
    const userId = req.user.id;
    
    // Rate limiting
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: `Maximum 10 generations per hour. Try again in ${rateLimit.minutesUntilReset} minutes.`
      });
    }
    
    // Get action item details
    const actionResult = await pool.query(
      `SELECT 
        ai.*,
        p.id as project_id,
        p.name as project_name,
        ai.assignee as assigned_to_name
      FROM action_items ai
      INNER JOIN projects p ON ai.project_id = p.id
      WHERE ai.id = $1`,
      [action_id]
    );
    
    if (actionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    const actionItem = actionResult.rows[0];
    
    // Check user has access to this project
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [actionItem.project_id, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    
    // Generate checklist using AI
    console.log(`✨ Generating checklist from action item ${action_id} with ${attachment_ids.length} attachments...`);
    const checklistPreview = await generateChecklistFromActionItem(actionItem, attachment_ids, use_description);
    
    // Add metadata
    checklistPreview.action_id = action_id;
    checklistPreview.project_id = actionItem.project_id;
    checklistPreview.project_name = actionItem.project_name;
    checklistPreview.source_type = 'action-item';
    checklistPreview.source_title = actionItem.title;
    checklistPreview.generated_at = new Date().toISOString();
    checklistPreview.rate_limit_remaining = rateLimit.remaining;
    
    res.json(checklistPreview);
    
  } catch (error) {
    console.error('Error generating checklist from action:', error);
    res.status(500).json({ 
      error: 'Failed to generate checklist',
      message: error.message 
    });
  }
});

// POST /api/checklists/confirm-generated - Create checklist from preview
app.post('/api/checklists/confirm-generated', authenticateToken, async (req, res) => {
  try {
    const { preview, source_id, source_type, project_id, attachment_ids = [], use_description = true } = req.body;
    const userId = req.user.id;
    
    // Verify access
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [project_id, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let templateId = preview.template_id;
      let totalItems = 0;
      
      // HYBRID APPROACH: Create template (marked as non-reusable if AI-generated)
      if (!preview.use_template || !templateId) {
        // Create AI-generated template (non-reusable by default)
        const templateResult = await client.query(
          `INSERT INTO checklist_templates (
            name, description, category, icon, is_system, is_reusable, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id`,
          [
            preview.title,
            preview.description || 'AI-generated checklist template',
            'ai-generated',
            '✨',
            false,
            false,  // NOT REUSABLE - hidden from main template list
            userId
          ]
        );
        
        templateId = templateResult.rows[0].id;
        
        // Create sections and items
        for (let i = 0; i < preview.sections.length; i++) {
          const section = preview.sections[i];
          
          const sectionResult = await client.query(
            `INSERT INTO checklist_template_sections (
              template_id, title, description, section_number, display_order
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id`,
            [templateId, section.title, section.description || '', `${i + 1}`, i]
          );
          
          const sectionId = sectionResult.rows[0].id;
          
          // Create items
          for (let j = 0; j < section.items.length; j++) {
            const item = section.items[j];
            
            await client.query(
              `INSERT INTO checklist_template_items (
                section_id, item_text, field_type, field_options, 
                is_required, help_text, display_order
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                sectionId,
                item.text,
                item.field_type,
                item.field_options ? JSON.stringify(item.field_options) : null,
                item.is_required || false,
                item.help_text || null,
                j
              ]
            );
            
            totalItems++;
          }
        }
      } else {
        // Using existing template - get item count
        const countResult = await client.query(
          `SELECT COUNT(*) as count
           FROM checklist_template_items cti
           INNER JOIN checklist_template_sections cts ON cti.section_id = cts.id
           WHERE cts.template_id = $1`,
          [templateId]
        );
        totalItems = parseInt(countResult.rows[0].count);
      }
      
      // Determine which foreign key to set
      const relatedIssueId = source_type === 'issue' ? source_id : null;
      const relatedActionId = source_type === 'action-item' ? source_id : null;
      
      const checklistResult = await client.query(
        `INSERT INTO checklists (
          template_id, project_id, title, description,
          related_issue_id, related_action_id, 
          is_ai_generated, generation_source,
          total_items, created_by, used_attachments, used_description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          templateId,
          project_id,
          preview.title,
          preview.description || `AI-generated from ${source_type}`,
          relatedIssueId,
          relatedActionId,
          true,  // is_ai_generated
          source_type,  // 'issue' or 'action-item'
          totalItems,
          userId,
          attachment_ids,  // used_attachments
          use_description  // used_description
        ]
      );
      
      // Track generation sources
      let descriptionText = null;
      if (use_description && source_type === 'issue') {
        const issueData = await client.query('SELECT title, description FROM issues WHERE id = $1', [source_id]);
        if (issueData.rows.length > 0) {
          descriptionText = `${issueData.rows[0].title}\n${issueData.rows[0].description || ''}`;
        }
      } else if (use_description && source_type === 'action-item') {
        const actionData = await client.query('SELECT title, description FROM action_items WHERE id = $1', [source_id]);
        if (actionData.rows.length > 0) {
          descriptionText = `${actionData.rows[0].title}\n${actionData.rows[0].description || ''}`;
        }
      }
      
      await client.query(
        `INSERT INTO checklist_generation_sources (
          checklist_id, used_description, description_text, attachment_ids
        ) VALUES ($1, $2, $3, $4)`,
        [checklistResult.rows[0].id, use_description, descriptionText, attachment_ids]
      );
      
      // Log success (notifications table doesn't exist, so we just log)
      console.log(`✅ Checklist generated for ${source_type} #${source_id} by user ${userId} with ${attachment_ids.length} attachments`);
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        checklist: checklistResult.rows[0],
        template_id: templateId,
        is_new_template: !preview.use_template,
        message: 'Checklist created successfully'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error confirming checklist:', error);
    res.status(500).json({ 
      error: 'Failed to create checklist',
      message: error.message 
    });
  }
});

// POST /api/checklists/analyze-document - Analyze document for workstreams
app.post('/api/checklists/analyze-document', authenticateToken, async (req, res) => {
  try {
    const { source_type, source_id, attachment_ids } = req.body;
    const userId = req.user.id;
    
    if (!attachment_ids || attachment_ids.length === 0) {
      return res.status(400).json({ error: 'At least one attachment required for analysis' });
    }
    
    // Get attachment content
    const result = await pool.query(
      `SELECT id, original_name, file_path, file_type, extracted_text, file_size
       FROM attachments 
       WHERE id = ANY($1)
       ORDER BY file_size DESC`,
      [attachment_ids]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachments not found' });
    }
    
    // Extract text from largest attachment (most content)
    const attachment = result.rows[0];
    let documentText = attachment.extracted_text;
    
    console.log(`Selected attachment for analysis: ${attachment.original_name} (ID: ${attachment.id}, Size: ${attachment.file_size} bytes)`);
    console.log(`Attachment IDs requested: ${attachment_ids.join(', ')}`);
    
    if (!documentText) {
      documentText = await extractTextFromFile(attachment.file_path, attachment.file_type);
    }
    
    // Analyze for workstreams
    console.log(`Analyzing ${attachment.original_name} for workstreams (${documentText.length} characters)...`);
    const analysis = await analyzeDocumentForWorkstreams(documentText, attachment.original_name);
    
    res.json(analysis);
    
  } catch (error) {
    console.error('Document analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze document',
      message: error.message 
    });
  }
});

// POST /api/checklists/generate-batch - Generate multiple checklists
app.post('/api/checklists/generate-batch', authenticateToken, async (req, res) => {
  try {
    const { 
      source_type, 
      source_id, 
      attachment_ids,
      workstreams,
      use_description 
    } = req.body;
    const userId = req.user.id;
    
    // Validation
    if (!workstreams || workstreams.length === 0) {
      return res.status(400).json({ error: 'Workstreams required' });
    }
    
    if (workstreams.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 checklists per batch' });
    }
    
    // Rate limiting - count as N generations
    const rateLimit = checkRateLimit(userId, workstreams.length);
    if (!rateLimit.allowed) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: `This would exceed your limit. Try again in ${rateLimit.minutesUntilReset} minutes.`
      });
    }
    
    // Get source data
    let sourceData;
    if (source_type === 'issue') {
      const result = await pool.query(
        `SELECT i.*, p.id as project_id, p.name as project_name
         FROM issues i
         INNER JOIN projects p ON i.project_id = p.id
         WHERE i.id = $1`,
        [source_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Issue not found' });
      }
      sourceData = result.rows[0];
    } else {
      const result = await pool.query(
        `SELECT ai.*, p.id as project_id, p.name as project_name
         FROM action_items ai
         INNER JOIN projects p ON ai.project_id = p.id
         WHERE ai.id = $1`,
        [source_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Action item not found' });
      }
      sourceData = result.rows[0];
    }
    
    sourceData.use_description = use_description;
    
    // Generate multiple checklists
    console.log(`[BATCH] Starting batch generation: ${workstreams.length} checklists for ${source_type} #${source_id}`);
    console.log(`[BATCH] Attachment IDs: ${attachment_ids?.join(', ') || 'none'}`);
    console.log(`[BATCH] Use description: ${use_description}`);
    
    const results = await generateMultipleChecklists(
      source_type,
      sourceData,
      attachment_ids,
      workstreams
    );
    
    console.log(`[BATCH] Batch generation complete: ${results.filter(r => r.success).length} succeeded, ${results.filter(r => !r.success).length} failed`);
    
    // Add metadata
    const response = {
      source_id,
      source_type,
      project_id: sourceData.project_id,
      workstreams_requested: workstreams.length,
      checklists_generated: results.filter(r => r.success).length,
      checklists_failed: results.filter(r => !r.success).length,
      results: results,
      rate_limit_remaining: rateLimit.remaining
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Batch generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate checklists',
      message: error.message 
    });
  }
});

// POST /api/checklists/confirm-batch - Create multiple checklists from previews
app.post('/api/checklists/confirm-batch', authenticateToken, async (req, res) => {
  try {
    const { previews, source_id, source_type, project_id, attachment_ids, use_description } = req.body;
    const userId = req.user.id;
    
    if (!previews || !Array.isArray(previews) || previews.length === 0) {
      return res.status(400).json({ error: 'Checklist previews required' });
    }
    
    const client = await pool.connect();
    const createdChecklists = [];
    const newTemplateIds = []; // Track new templates for promotion
    
    try {
      await client.query('BEGIN');
      
      // Create all checklists
      for (const preview of previews) {
        // Create template if needed
        let templateId = null;
        let isNewTemplate = false;
        if (!preview.use_template) {
          const templateResult = await client.query(
            `INSERT INTO checklist_templates (
              name, description, category, created_by, is_reusable
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id`,
            [
              preview.title,
              preview.description,
              'AI Generated',
              userId,
              false
            ]
          );
          templateId = templateResult.rows[0].id;
          isNewTemplate = true;
          newTemplateIds.push(templateId);
          
          // Create template sections and items
          for (const section of preview.sections) {
            const sectionResult = await client.query(
              `INSERT INTO checklist_template_sections (
                template_id, title, description, display_order
              ) VALUES ($1, $2, $3, $4)
              RETURNING id`,
              [templateId, section.title, section.description, section.display_order || 0]
            );
            
            for (let i = 0; i < section.items.length; i++) {
              const item = section.items[i];
              await client.query(
                `INSERT INTO checklist_template_items (
                  section_id, item_text, field_type, field_options, is_required, 
                  help_text, display_order
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  sectionResult.rows[0].id,
                  item.text,
                  item.field_type || 'checkbox',
                  item.field_options ? JSON.stringify(item.field_options) : null,
                  item.is_required || false,
                  item.help_text || null,
                  i
                ]
              );
            }
          }
        }
        
        // Create checklist instance
        const checklistResult = await client.query(
          `INSERT INTO checklists (
            title, description, project_id, template_id, 
            related_issue_id, related_action_id, created_by,
            is_ai_generated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            preview.title,
            preview.description,
            project_id,
            templateId,
            source_type === 'issue' ? source_id : null,
            source_type === 'action-item' ? source_id : null,
            userId,
            true
          ]
        );
        
        // Record generation sources
        let descriptionText = null;
        if (use_description && source_type === 'issue') {
          const issueData = await client.query('SELECT title, description FROM issues WHERE id = $1', [source_id]);
          if (issueData.rows.length > 0) {
            descriptionText = `${issueData.rows[0].title}\n${issueData.rows[0].description || ''}`;
          }
        } else if (use_description && source_type === 'action-item') {
          const actionData = await client.query('SELECT title, description FROM action_items WHERE id = $1', [source_id]);
          if (actionData.rows.length > 0) {
            descriptionText = `${actionData.rows[0].title}\n${actionData.rows[0].description || ''}`;
          }
        }
        
        await client.query(
          `INSERT INTO checklist_generation_sources (
            checklist_id, used_description, description_text, attachment_ids
          ) VALUES ($1, $2, $3, $4)`,
          [checklistResult.rows[0].id, use_description, descriptionText, attachment_ids || []]
        );
        
        createdChecklists.push(checklistResult.rows[0]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        success: true,
        checklists: createdChecklists,
        count: createdChecklists.length,
        new_template_ids: newTemplateIds,
        has_new_templates: newTemplateIds.length > 0,
        message: `Successfully created ${createdChecklists.length} checklists`
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Batch confirm error:', error);
    res.status(500).json({ 
      error: 'Failed to create checklists',
      message: error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE LIBRARY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/templates/categories - Get template categories
app.get('/api/templates/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await getTemplateCategories();
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to get categories', message: error.message });
  }
});

// GET /api/templates - Get template library with filters
app.get('/api/templates', authenticateToken, async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      tags: req.query.tags ? req.query.tags.split(',') : null,
      search: req.query.search,
      is_public: req.query.is_public !== 'false',
      sort_by: req.query.sort_by || 'usage',
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      created_by: req.query.my_templates === 'true' ? req.user.id : null
    };
    
    const result = await getTemplateLibrary(filters);
    res.json(result);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get templates', message: error.message });
  }
});

// GET /api/templates/issue-type-mappings - Get issue type template mappings (must be before :id route)
app.get('/api/templates/issue-type-mappings', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;
    const parsedProjectId = projectId && projectId !== '' ? parseInt(projectId) : null;
    const mappings = await getIssueTypeTemplateMappings(parsedProjectId);
    res.json(mappings);
  } catch (error) {
    console.error('Error fetching issue type mappings:', error);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

// GET /api/templates/action-category-mappings - Get action category template mappings (must be before :id route)
app.get('/api/templates/action-category-mappings', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;
    const parsedProjectId = projectId && projectId !== '' ? parseInt(projectId) : null;
    const mappings = await getActionCategoryTemplateMappings(parsedProjectId);
    res.json(mappings);
  } catch (error) {
    console.error('Error fetching action category mappings:', error);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

// GET /api/templates/:id - Get template details
app.get('/api/templates/:id', authenticateToken, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    
    // Validate templateId is a valid number
    if (isNaN(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    
    const template = await getTemplateDetails(templateId, req.user.id);
    res.json(template);
  } catch (error) {
    console.error('Get template details error:', error);
    res.status(404).json({ error: error.message });
  }
});

// POST /api/templates - Save checklist as template
app.post('/api/templates', authenticateToken, async (req, res) => {
  try {
    const { checklist_id, name, description, category, tags, is_public } = req.body;
    
    if (!checklist_id) {
      return res.status(400).json({ error: 'Checklist ID is required' });
    }
    
    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    const templateData = {
      name,
      description,
      category: category || 'General',
      tags: tags || [],
      is_public: is_public || false
    };
    
    const template = await saveChecklistAsTemplate(checklist_id, req.user.id, templateData);
    
    res.status(201).json({
      success: true,
      template,
      message: 'Template created successfully'
    });
  } catch (error) {
    console.error('Save template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/templates/:id - Update template metadata
app.put('/api/templates/:id', authenticateToken, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { name, description, category, tags, is_public } = req.body;
    
    const template = await updateTemplateMetadata(templateId, req.user.id, {
      name,
      description,
      category,
      tags,
      is_public
    });
    
    res.json({
      success: true,
      template,
      message: 'Template updated successfully'
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/templates/:id - Soft delete template
app.delete('/api/templates/:id', authenticateToken, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const result = await deactivateTemplate(templateId, req.user.id, req.user.role);
    res.json(result);
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/templates/:id/rate - Rate template
app.post('/api/templates/:id/rate', authenticateToken, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { rating, review } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    const result = await rateTemplate(templateId, req.user.id, rating, review);
    res.json(result);
  } catch (error) {
    console.error('Rate template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/templates/:id/feature - Feature/unfeature template (admin only)
app.post('/api/templates/:id/feature', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { is_featured } = req.body;
    
    const result = await toggleFeatured(templateId, is_featured);
    res.json(result);
  } catch (error) {
    console.error('Feature template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/templates/:id/apply - Create checklist from template
app.post('/api/templates/:id/apply', authenticateToken, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { project_id, title, description, assigned_to } = req.body;
    
    if (!project_id) {
      return res.status(400).json({ error: 'Project ID is required' });
    }
    
    const checklistData = {
      title,
      description,
      assigned_to
    };
    
    const checklist = await applyTemplate(templateId, req.user.id, project_id, checklistData);
    
    res.status(201).json({
      success: true,
      checklist,
      message: 'Checklist created from template successfully'
    });
  } catch (error) {
    console.error('Apply template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/templates/:id/promote - Promote AI template to reusable
app.post('/api/templates/:id/promote', authenticateToken, async (req, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user.id;
    
    // Verify template exists and user is creator or has appropriate role
    const templateCheck = await pool.query(
      'SELECT * FROM checklist_templates WHERE id = $1',
      [templateId]
    );
    
    if (templateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = templateCheck.rows[0];
    
    // Check permission - must be creator or Team Lead+
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const isTeamLeadOrAbove = userRoleLevel >= ROLE_HIERARCHY['Team Lead'];
    const isCreator = template.created_by === userId;
    
    if (!isCreator && !isTeamLeadOrAbove) {
      return res.status(403).json({ error: 'Only the template creator or Team Lead+ can promote templates' });
    }
    
    // Promote template: make it reusable and update category
    await pool.query(
      `UPDATE checklist_templates 
       SET is_reusable = true,
           category = CASE 
             WHEN category = 'ai-generated' THEN 'custom'
             ELSE category
           END
       WHERE id = $1`,
      [templateId]
    );
    
    res.json({
      success: true,
      message: 'Template promoted to reusable successfully'
    });
    
  } catch (error) {
    console.error('Error promoting template:', error);
    res.status(500).json({ 
      error: 'Failed to promote template',
      message: error.message 
    });
  }
});

// ============================================
// Phase 3b Feature 3: Bulk Apply Template
// ============================================

/**
 * Bulk apply template to multiple issues or action items
 * POST /api/templates/bulk-apply
 * Body: {
 *   templateId: number,
 *   entityType: 'issue' or 'action_item',
 *   entityIds: number[],
 *   projectId: number
 * }
 */
app.post('/api/templates/bulk-apply', authenticateToken, async (req, res) => {
  try {
    const templateService = require('./services/template-service.js');
    
    const { templateId, entityType, entityIds, projectId } = req.body;
    
    // Validation
    if (!templateId || !entityType || !entityIds || !Array.isArray(entityIds)) {
      return res.status(400).json({ 
        error: 'Missing required fields: templateId, entityType, entityIds (array)' 
      });
    }
    
    if (!['issue', 'action_item'].includes(entityType)) {
      return res.status(400).json({ 
        error: 'Invalid entityType. Must be "issue" or "action_item"' 
      });
    }
    
    if (entityIds.length === 0) {
      return res.status(400).json({ 
        error: 'entityIds array cannot be empty' 
      });
    }
    
    if (entityIds.length > 100) {
      return res.status(400).json({ 
        error: 'Cannot bulk apply to more than 100 entities at once' 
      });
    }
    
    if (!projectId) {
      return res.status(400).json({ 
        error: 'projectId is required' 
      });
    }
    
    const userId = req.user?.id || 1;
    
    console.log(`📋 Bulk apply request: template ${templateId} to ${entityIds.length} ${entityType}s`);
    
    // Execute bulk apply
    const results = await templateService.bulkApplyTemplate(
      parseInt(templateId),
      entityType,
      entityIds.map(id => parseInt(id)),
      parseInt(projectId),
      userId
    );
    
    // Return results with appropriate status code
    const statusCode = results.failed.length === 0 ? 200 : 207; // 207 = Multi-Status
    
    res.status(statusCode).json({
      success: true,
      message: `Applied template to ${results.successful.length} of ${results.total} ${entityType}s`,
      results: {
        total: results.total,
        successful: results.successful.length,
        failed: results.failed.length,
        details: results
      }
    });
    
  } catch (error) {
    console.error('Error in bulk apply:', error);
    res.status(500).json({ 
      error: 'Failed to bulk apply template',
      details: error.message 
    });
  }
});

// ============================================
// Phase 3b Feature 4: Improved Linking UI
// ============================================

/**
 * Get all checklists linked to a specific issue
 * GET /api/issues/:id/checklists
 */
app.get('/api/issues/:id/checklists', async (req, res) => {
  try {
    const { id } = req.params;
    const completionService = require('./services/completion-service.js');
    
    // Get all checklists linked to this issue
    const checklistsResult = await pool.query(
      `SELECT 
        c.id,
        c.title,
        c.description,
        c.template_id,
        c.project_id,
        c.related_issue_id,
        c.status,
        c.created_at,
        c.updated_at,
        ct.name as template_name
      FROM checklists c
      LEFT JOIN checklist_templates ct ON c.template_id = ct.id
      WHERE c.related_issue_id = $1
      ORDER BY c.created_at DESC`,
      [id]
    );
    
    const checklists = checklistsResult.rows;
    
    // Calculate completion stats for each checklist
    const checklistsWithStats = await Promise.all(
      checklists.map(async (checklist) => {
        const completion = await completionService.calculateChecklistCompletion(checklist.id);
        
        return {
          ...checklist,
          completion: {
            total: completion.total,
            completed: completion.completed,
            percentage: completion.percentage
          }
        };
      })
    );
    
    res.json({
      issueId: parseInt(id),
      count: checklistsWithStats.length,
      checklists: checklistsWithStats
    });
    
  } catch (error) {
    console.error('Error fetching issue checklists:', error);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

/**
 * Get all checklists linked to a specific action item
 * GET /api/action-items/:id/checklists
 */
app.get('/api/action-items/:id/checklists', async (req, res) => {
  try {
    const { id } = req.params;
    const completionService = require('./services/completion-service.js');
    
    // Get all checklists linked to this action item
    const checklistsResult = await pool.query(
      `SELECT 
        c.id,
        c.title,
        c.description,
        c.template_id,
        c.project_id,
        c.related_action_id,
        c.status,
        c.created_at,
        c.updated_at,
        ct.name as template_name
      FROM checklists c
      LEFT JOIN checklist_templates ct ON c.template_id = ct.id
      WHERE c.related_action_id = $1
      ORDER BY c.created_at DESC`,
      [id]
    );
    
    const checklists = checklistsResult.rows;
    
    // Calculate completion stats for each checklist
    const checklistsWithStats = await Promise.all(
      checklists.map(async (checklist) => {
        const completion = await completionService.calculateChecklistCompletion(checklist.id);
        
        return {
          ...checklist,
          completion: {
            total: completion.total,
            completed: completion.completed,
            percentage: completion.percentage
          }
        };
      })
    );
    
    res.json({
      actionItemId: parseInt(id),
      count: checklistsWithStats.length,
      checklists: checklistsWithStats
    });
    
  } catch (error) {
    console.error('Error fetching action item checklists:', error);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

/**
 * Unlink a checklist from its issue or action item
 * DELETE /api/checklists/:id/link
 */
app.delete('/api/checklists/:id/link', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Unlink by setting related_issue_id and related_action_id to NULL
    const result = await pool.query(
      `UPDATE checklists 
       SET related_issue_id = NULL, 
           related_action_id = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    res.json({
      success: true,
      message: 'Checklist unlinked',
      checklist: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error unlinking checklist:', error);
    res.status(500).json({ error: 'Failed to unlink checklist' });
  }
});

// ============================================
// Phase 3b Feature 5: Checklist Dependencies API
// ============================================

/**
 * Add a dependency between checklist items
 * POST /api/checklist-items/:itemId/dependencies
 * Body: { dependsOnItemId: number }
 */
app.post('/api/checklist-items/:itemId/dependencies', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { dependsOnItemId } = req.body;
    const userId = req.user?.id || 1;
    
    if (!dependsOnItemId) {
      return res.status(400).json({ 
        error: 'dependsOnItemId is required' 
      });
    }
    
    const dependency = await dependencyService.addDependency(
      parseInt(itemId),
      parseInt(dependsOnItemId),
      userId
    );
    
    if (!dependency) {
      return res.status(200).json({
        message: 'Dependency already exists',
        existed: true
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Dependency created',
      dependency
    });
    
  } catch (error) {
    console.error('Error adding dependency:', error);
    
    if (error.message.includes('circular dependency')) {
      return res.status(400).json({ 
        error: 'Circular dependency detected',
        message: error.message
      });
    }
    
    if (error.message.includes('same checklist')) {
      return res.status(400).json({ 
        error: 'Items must be in the same checklist',
        message: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to add dependency',
      message: error.message
    });
  }
});

/**
 * Remove a dependency
 * DELETE /api/dependencies/:dependencyId
 */
app.delete('/api/dependencies/:dependencyId', authenticateToken, async (req, res) => {
  try {
    const { dependencyId } = req.params;
    
    const dependency = await dependencyService.removeDependency(
      parseInt(dependencyId)
    );
    
    res.json({
      success: true,
      message: 'Dependency removed',
      dependency
    });
    
  } catch (error) {
    console.error('Error removing dependency:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        error: 'Dependency not found'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to remove dependency',
      message: error.message
    });
  }
});

/**
 * Get all dependencies for a checklist item
 * GET /api/checklist-items/:itemId/dependencies
 */
app.get('/api/checklist-items/:itemId/dependencies', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const dependencies = await dependencyService.getItemDependencies(
      parseInt(itemId)
    );
    
    res.json({
      itemId: parseInt(itemId),
      count: dependencies.length,
      dependencies
    });
    
  } catch (error) {
    console.error('Error getting dependencies:', error);
    res.status(500).json({ 
      error: 'Failed to get dependencies',
      message: error.message
    });
  }
});

/**
 * Check if an item is blocked by dependencies
 * GET /api/checklist-items/:itemId/blocking-status
 */
app.get('/api/checklist-items/:itemId/blocking-status', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const status = await dependencyService.checkIfItemBlocked(
      parseInt(itemId)
    );
    
    res.json({
      itemId: parseInt(itemId),
      ...status
    });
    
  } catch (error) {
    console.error('Error checking blocking status:', error);
    res.status(500).json({ 
      error: 'Failed to check blocking status',
      message: error.message
    });
  }
});

/**
 * Get items that depend on a specific item
 * GET /api/checklist-items/:itemId/dependent-items
 */
app.get('/api/checklist-items/:itemId/dependent-items', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    const dependentItems = await dependencyService.getItemsDependingOn(
      parseInt(itemId)
    );
    
    res.json({
      itemId: parseInt(itemId),
      count: dependentItems.length,
      dependentItems
    });
    
  } catch (error) {
    console.error('Error getting dependent items:', error);
    res.status(500).json({ 
      error: 'Failed to get dependent items',
      message: error.message
    });
  }
});

// ============================================
// Phase 3b Feature 6: Document Upload + AI Generation
// ============================================

/**
 * Upload document and extract text
 * POST /api/documents/extract
 */
app.post('/api/documents/extract', authenticateToken, documentUpload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        message: 'Please select a document to upload'
      });
    }
    
    console.log(`📤 Document uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
    
    documentService.validateDocumentFile(req.file);
    
    const extracted = await documentService.extractTextFromDocument(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );
    
    console.log(`✅ Text extracted: ${extracted.text.length} characters`);
    
    res.json({
      success: true,
      filename: req.file.originalname,
      fileSize: req.file.size,
      extractedText: extracted.text,
      pageCount: extracted.pageCount,
      characterCount: extracted.text.length,
      metadata: extracted.metadata
    });
    
  } catch (error) {
    console.error('Error processing document:', error);
    
    if (error.message.includes('Unsupported') || error.message.includes('Invalid') || error.message.includes('too large')) {
      return res.status(400).json({
        error: 'Invalid file',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to process document',
      message: error.message
    });
  }
});

// ============================================
// Phase 4 Mode 3: Standalone Document Processing
// ============================================

const standaloneChecklistService = require('./services/standalone-checklist-service.js');

/**
 * Get standalone checklists for a project
 * GET /api/projects/:projectId/standalone-checklists
 */
app.get('/api/projects/:projectId/standalone-checklists', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const result = await standaloneChecklistService.getStandaloneChecklists(
      parseInt(projectId)
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Error fetching standalone checklists:', error);
    res.status(500).json({
      error: 'Failed to fetch standalone checklists',
      message: error.message
    });
  }
});

/**
 * Upload document and generate standalone checklists
 * POST /api/projects/:projectId/upload-and-generate-standalone
 */
app.post('/api/projects/:projectId/upload-and-generate-standalone', 
  authenticateToken,
  documentUpload.single('document'), 
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user?.id || 1;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      console.log(`📤 Standalone upload for project ${projectId}: ${req.file.originalname}`);
      
      // Extract text
      documentService.validateDocumentFile(req.file);
      
      const extracted = await documentService.extractTextFromDocument(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
      
      console.log(`✅ Text extracted: ${extracted.text.length} characters`);
      
      // Record upload
      const uploadRecord = await standaloneChecklistService.recordDocumentUpload({
        projectId: parseInt(projectId),
        filename: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: userId,
        extractedTextLength: extracted.text.length
      });
      
      // Generate checklists with AI (project context, not issue-specific)
      const aiService = require('./services/ai-service.js');
      
      const context = {
        projectId: parseInt(projectId),
        documentFilename: req.file.originalname,
        mode: 'standalone'
      };
      
      const generatedChecklists = await aiService.generateChecklistFromDocument(
        extracted.text,
        context
      );
      
      // Count sections and items
      let sectionCount = 0;
      let itemCount = 0;
      
      if (Array.isArray(generatedChecklists)) {
        sectionCount = generatedChecklists.length;
        // Count items across all sections in all checklists
        for (const checklist of generatedChecklists) {
          if (checklist.sections && Array.isArray(checklist.sections)) {
            for (const section of checklist.sections) {
              itemCount += section.items?.length || 0;
            }
          }
        }
      } else if (generatedChecklists.sections) {
        sectionCount = generatedChecklists.sections.length;
        itemCount = generatedChecklists.sections.reduce(
          (sum, s) => sum + (s.items?.length || 0), 0
        );
      }
      
      // Update upload record
      await standaloneChecklistService.updateDocumentUploadStatus(
        uploadRecord.upload.id,
        {
          status: 'completed',
          checklistsGenerated: sectionCount,
          itemsGenerated: itemCount
        }
      );
      
      console.log(`✅ Generated ${sectionCount} checklists with ${itemCount} items`);
      
      res.json({
        success: true,
        preview: {
          checklists: generatedChecklists,
          sourceDocument: req.file.originalname,
          uploadId: uploadRecord.upload.id,
          metadata: {
            sectionCount,
            itemCount
          }
        }
      });
      
    } catch (error) {
      console.error('Upload-and-generate standalone error:', error);
      res.status(500).json({
        error: 'Failed to generate standalone checklists',
        message: error.message
      });
    }
  }
);

/**
 * Save standalone checklists from AI generation
 * POST /api/projects/:projectId/save-standalone-checklists
 */
app.post('/api/projects/:projectId/save-standalone-checklists', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { checklists, sourceDocument } = req.body;
    const userId = req.user?.id || 1;
    
    if (!checklists || !Array.isArray(checklists)) {
      return res.status(400).json({ error: 'Invalid checklists data' });
    }
    
    const createdChecklists = [];
    
    // Create each checklist
    for (const checklistData of checklists) {
      // Flatten sections into items array
      let items = [];
      if (checklistData.sections && Array.isArray(checklistData.sections)) {
        for (const section of checklistData.sections) {
          if (section.items && Array.isArray(section.items)) {
            items.push(...section.items);
          }
        }
      } else if (checklistData.items) {
        items = checklistData.items;
      }
      
      const result = await standaloneChecklistService.createStandaloneChecklist(
        {
          ...checklistData,
          items: items
        },
        parseInt(projectId),
        userId,
        sourceDocument
      );
      createdChecklists.push(result.checklist);
    }
    
    console.log(`✅ Saved ${createdChecklists.length} standalone checklists`);
    
    res.json({
      success: true,
      message: `${createdChecklists.length} standalone checklist(s) created`,
      checklists: createdChecklists
    });
    
  } catch (error) {
    console.error('Save standalone checklists error:', error);
    res.status(500).json({
      error: 'Failed to save standalone checklists',
      message: error.message
    });
  }
});

/**
 * Link standalone checklist to issue
 * POST /api/checklists/:checklistId/link-to-issue
 */
app.post('/api/checklists/:checklistId/link-to-issue', authenticateToken, async (req, res) => {
  try {
    const { checklistId } = req.params;
    const { issueId, keepStandalone } = req.body;
    const userId = req.user?.id || 1;
    
    if (!issueId) {
      return res.status(400).json({ error: 'Issue ID required' });
    }
    
    const result = await standaloneChecklistService.linkChecklistToIssue(
      parseInt(checklistId),
      parseInt(issueId),
      userId,
      keepStandalone || false
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Link to issue error:', error);
    res.status(500).json({
      error: 'Failed to link checklist',
      message: error.message
    });
  }
});

/**
 * Link standalone checklist to action item
 * POST /api/checklists/:checklistId/link-to-action
 */
app.post('/api/checklists/:checklistId/link-to-action', authenticateToken, async (req, res) => {
  try {
    const { checklistId } = req.params;
    const { actionId, keepStandalone } = req.body;
    const userId = req.user?.id || 1;
    
    if (!actionId) {
      return res.status(400).json({ error: 'Action ID required' });
    }
    
    const result = await standaloneChecklistService.linkChecklistToAction(
      parseInt(checklistId),
      parseInt(actionId),
      userId,
      keepStandalone || false
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Link to action error:', error);
    res.status(500).json({
      error: 'Failed to link checklist',
      message: error.message
    });
  }
});

/**
 * Delete standalone checklist
 * DELETE /api/checklists/:checklistId/standalone
 */
app.delete('/api/checklists/:checklistId/standalone', authenticateToken, async (req, res) => {
  try {
    const { checklistId } = req.params;
    
    const result = await standaloneChecklistService.deleteStandaloneChecklist(
      parseInt(checklistId)
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Delete standalone checklist error:', error);
    res.status(500).json({
      error: 'Failed to delete checklist',
      message: error.message
    });
  }
});

// ============================================
// Phase 4 Mode 2: Workstream Detection & Multi-Checklist Generation
// ============================================

const workstreamDetector = require('./services/workstream-detector.js');

/**
 * Analyze document and detect workstreams
 * POST /api/projects/:projectId/analyze-workstreams
 * Body: { documentText: string, filename: string }
 */
app.post('/api/projects/:projectId/analyze-workstreams', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { documentText, filename } = req.body;
    
    if (!documentText) {
      return res.status(400).json({ 
        error: 'Document text required',
        message: 'Please provide documentText in request body'
      });
    }
    
    const projectResult = await pool.query(
      'SELECT id, name, description FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = projectResult.rows[0];
    
    console.log(`🔍 Analyzing workstreams for project: ${project.name}`);
    
    const result = await workstreamDetector.detectWorkstreams(documentText, {
      projectId: parseInt(projectId),
      projectName: project.name,
      projectDescription: project.description,
      documentFilename: filename
    });
    
    res.json({
      success: true,
      workstreams: result.workstreams,
      summary: result.summary,
      metadata: {
        documentLength: result.documentLength,
        tokensUsed: result.tokensUsed,
        workstreamCount: result.workstreams.length
      }
    });
    
  } catch (error) {
    console.error('Workstream detection error:', error);
    
    if (error.message.includes('Insufficient workstreams detected')) {
      return res.status(400).json({
        error: 'Insufficient workstreams',
        message: error.message,
        suggestion: 'Try providing a more comprehensive document with multiple distinct sections, phases, or work areas.'
      });
    }
    
    if (error.message.includes('invalid JSON') || error.message.includes('Failed to parse')) {
      return res.status(502).json({
        error: 'AI response parsing failed',
        message: 'The AI returned an invalid response format. Please try again.',
        details: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to detect workstreams',
      message: error.message
    });
  }
});

/**
 * Generate checklists for detected workstreams
 * POST /api/projects/:projectId/generate-workstream-checklists
 * Body: { workstreams: array, documentText: string }
 */
app.post('/api/projects/:projectId/generate-workstream-checklists', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { workstreams, documentText } = req.body;
    
    if (!workstreams || !Array.isArray(workstreams)) {
      return res.status(400).json({ 
        error: 'Workstreams array required',
        message: 'Please provide workstreams array in request body'
      });
    }
    
    if (!documentText) {
      return res.status(400).json({
        error: 'Document text required',
        message: 'Please provide documentText for context'
      });
    }
    
    console.log(`📋 Generating checklists for ${workstreams.length} workstreams`);
    
    const checklists = await workstreamDetector.generateChecklistsForWorkstreams(
      workstreams,
      documentText
    );
    
    res.json({
      success: true,
      checklists: checklists,
      count: checklists.length,
      totalItems: checklists.reduce((sum, c) => {
        return sum + (c.checklist.sections?.reduce(
          (s, sec) => s + (sec.items?.length || 0), 0
        ) || 0);
      }, 0)
    });
    
  } catch (error) {
    console.error('Checklist generation error:', error);
    res.status(500).json({
      error: 'Failed to generate checklists',
      message: error.message
    });
  }
});

// ============================================
// Phase 4 Mode 2: Issue Matching
// ============================================

const checklistMatcher = require('./services/checklist-matcher.js');

/**
 * Match generated checklists to existing issues
 * POST /api/projects/:projectId/match-checklists-to-issues
 * Body: { checklists: array }
 */
app.post('/api/projects/:projectId/match-checklists-to-issues', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { checklists } = req.body;
    
    if (!checklists || !Array.isArray(checklists)) {
      return res.status(400).json({
        error: 'Checklists array required',
        message: 'Please provide checklists array in request body'
      });
    }
    
    console.log(`🔗 Matching ${checklists.length} checklists to issues in project ${projectId}`);
    
    const results = await checklistMatcher.matchChecklistsToIssues(
      checklists,
      parseInt(projectId),
      pool
    );
    
    res.json({
      success: true,
      matches: results.matches,
      summary: results.summary
    });
    
  } catch (error) {
    console.error('Matching error:', error);
    res.status(500).json({
      error: 'Failed to match checklists',
      message: error.message
    });
  }
});

/**
 * Create matched checklists (batch operation)
 * POST /api/projects/:projectId/create-matched-checklists
 * Body: { approvedMatches: array }
 */
app.post('/api/projects/:projectId/create-matched-checklists', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { approvedMatches } = req.body;
    const userId = req.user?.id || 1;
    
    if (!approvedMatches || !Array.isArray(approvedMatches)) {
      return res.status(400).json({
        error: 'Approved matches array required',
        message: 'Please provide approvedMatches array in request body'
      });
    }
    
    console.log(`📦 Creating ${approvedMatches.length} matched checklists`);
    
    const results = await checklistMatcher.createMatchedChecklists(
      approvedMatches,
      parseInt(projectId),
      userId,
      pool
    );
    
    res.json({
      success: true,
      created: results.created.length,
      failed: results.failed.length,
      issuesCreated: results.issuesCreated,
      details: results
    });
    
  } catch (error) {
    console.error('Batch creation error:', error);
    res.status(500).json({
      error: 'Failed to create checklists',
      message: error.message
    });
  }
});

// ============================================
// Phase 3b Feature 1: Auto-Create Checklist APIs
// ============================================

// GET /api/action-item-categories - Get all action item categories
app.get('/api/action-item-categories', async (req, res) => {
  try {
    const categories = await getActionItemCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching action item categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/templates/issue-type-mappings - Save issue type template mapping
app.post('/api/templates/issue-type-mappings', authenticateToken, async (req, res) => {
  try {
    const { issueType, templateId, projectId } = req.body;
    
    // Validation
    if (!issueType || !templateId) {
      return res.status(400).json({ error: 'issueType and templateId are required' });
    }
    
    const userId = req.user.id;
    
    const mapping = await saveIssueTypeTemplateMapping(
      issueType,
      parseInt(templateId),
      projectId ? parseInt(projectId) : null,
      userId
    );
    
    res.json(mapping);
  } catch (error) {
    console.error('Error saving issue type mapping:', error);
    res.status(500).json({ error: 'Failed to save mapping' });
  }
});

// POST /api/templates/action-category-mappings - Save action category template mapping
app.post('/api/templates/action-category-mappings', authenticateToken, async (req, res) => {
  try {
    const { categoryId, templateId, projectId } = req.body;
    
    // Validation
    if (!categoryId || !templateId) {
      return res.status(400).json({ error: 'categoryId and templateId are required' });
    }
    
    const userId = req.user.id;
    
    const mapping = await saveActionCategoryTemplateMapping(
      parseInt(categoryId),
      parseInt(templateId),
      projectId ? parseInt(projectId) : null,
      userId
    );
    
    res.json(mapping);
  } catch (error) {
    console.error('Error saving action category mapping:', error);
    res.status(500).json({ error: 'Failed to save mapping' });
  }
});

// DELETE /api/templates/issue-type-mappings/:id - Delete (deactivate) issue type mapping
app.delete('/api/templates/issue-type-mappings/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      `UPDATE issue_type_templates 
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    
    res.json({ success: true, message: 'Mapping deactivated' });
  } catch (error) {
    console.error('Error deleting issue type mapping:', error);
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
});

// DELETE /api/templates/action-category-mappings/:id - Delete (deactivate) action category mapping
app.delete('/api/templates/action-category-mappings/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      `UPDATE action_item_category_templates 
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    
    res.json({ success: true, message: 'Mapping deactivated' });
  } catch (error) {
    console.error('Error deleting action category mapping:', error);
    res.status(500).json({ error: 'Failed to delete mapping' });
  }
});

// ========================================
// PDF EXPORT ENDPOINT
// ========================================

// GET /api/checklists/:id/export/pdf - Export checklist as PDF
app.get('/api/checklists/:id/export/pdf', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    
    const {
      format = 'full',              // 'full', 'summary', 'completed-only'
      include_comments = 'true',
      include_charts = 'true',
      include_metadata = 'true'
    } = req.query;
    
    // Get complete checklist data
    const checklistResult = await pool.query(
      `SELECT 
        c.*,
        ct.name as template_name,
        p.name as project_name,
        u.username as created_by_name,
        (SELECT COUNT(*) FROM checklist_responses cr
         WHERE cr.checklist_id = c.id AND cr.is_completed = true) as completed_items
      FROM checklists c
      LEFT JOIN checklist_templates ct ON c.template_id = ct.id
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = $1`,
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    const checklist = checklistResult.rows[0];
    
    // Check access
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [checklist.project_id, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Calculate completion percentage
    checklist.completion_percentage = checklist.total_items > 0 
      ? Math.round((checklist.completed_items / checklist.total_items) * 100)
      : 0;
    
    // Get all items with responses
    const itemsResult = await pool.query(
      `SELECT 
        cti.id,
        cti.item_text,
        cti.field_type,
        cts.title as section_title,
        cts.section_number,
        cti.display_order,
        cr.response_value,
        cr.response_boolean,
        cr.response_date,
        cr.is_completed,
        cr.notes,
        cr.updated_at,
        cr.id as response_id,
        (SELECT json_agg(json_build_object(
          'user', u.username,
          'comment', cc.comment,
          'created_at', cc.created_at
        ))
        FROM checklist_comments cc
        LEFT JOIN users u ON cc.created_by = u.id
        WHERE cc.checklist_id = $1 AND cc.response_id = cr.id) as comments
      FROM checklist_template_items cti
      INNER JOIN checklist_template_sections cts ON cti.section_id = cts.id
      LEFT JOIN checklist_responses cr ON cr.template_item_id = cti.id AND cr.checklist_id = $1
      WHERE cts.template_id = $2
      ORDER BY cts.display_order, cti.display_order`,
      [checklistId, checklist.template_id]
    );
    
    checklist.items = itemsResult.rows;
    
    // Get sign-offs
    const signoffsResult = await pool.query(
      `SELECT 
        cs.*,
        u.username as signed_by_name
      FROM checklist_signoffs cs
      LEFT JOIN users u ON cs.signed_by = u.id
      WHERE cs.checklist_id = $1
      ORDER BY cs.signed_at DESC`,
      [checklistId]
    );
    
    checklist.signoffs = signoffsResult.rows;
    
    // Get source information if AI-generated
    if (checklist.is_ai_generated) {
      if (checklist.generation_source === 'issue' && checklist.related_issue_id) {
        const issueResult = await pool.query(
          'SELECT title FROM issues WHERE id = $1',
          [checklist.related_issue_id]
        );
        if (issueResult.rows.length > 0) {
          checklist.source_title = issueResult.rows[0].title;
        }
      } else if (checklist.generation_source === 'action-item' && checklist.related_action_id) {
        const actionResult = await pool.query(
          'SELECT title FROM action_items WHERE id = $1',
          [checklist.related_action_id]
        );
        if (actionResult.rows.length > 0) {
          checklist.source_title = actionResult.rows[0].title;
        }
      }
    }
    
    // Generate PDF
    const pdfBuffer = await generateChecklistPDF(checklist, {
      format,
      include_comments: include_comments === 'true',
      include_charts: include_charts === 'true',
      include_metadata: include_metadata === 'true'
    });
    
    // Validate PDF structure
    if (!pdfBuffer || pdfBuffer.length < 100) {
      throw new Error('Generated PDF is too small or empty');
    }
    
    // Check PDF magic bytes (should start with %PDF-)
    const header = pdfBuffer.toString('utf-8', 0, 5);
    if (!header.startsWith('%PDF-')) {
      throw new Error('Generated file is not a valid PDF');
    }
    
    // Check PDF trailer exists
    const trailer = pdfBuffer.toString('utf-8', Math.max(0, pdfBuffer.length - 200));
    if (!trailer.includes('%%EOF')) {
      throw new Error('PDF structure is incomplete');
    }
    
    // Use same simple filename pattern as dashboard reports
    const filename = `checklist-report-${checklistId}-${Date.now()}.pdf`;
    
    // Use exact same headers as dashboard reports (minimal, proven to work)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
    
    // Log export
    console.log(`📄 PDF exported: ${filename} by user ${userId}`);
    
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message 
    });
  }
});

// GET /api/projects/:projectId/export/csv - Export Kanban data as CSV
app.get('/api/projects/:projectId/export/csv', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const userId = req.user.id;
    
    // Check project access
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Build query params with filters (same as Kanban board)
    const filters = {
      status: req.query.status,
      priority: req.query.priority,
      assignee: req.query.assignee,
      category: req.query.category,
      search: req.query.search,
      tag: req.query.tag
    };
    
    // Base queries with separate parameter indices
    let issuesQuery = 'SELECT * FROM issues WHERE project_id = $1';
    let actionsQuery = 'SELECT * FROM action_items WHERE project_id = $1';
    const issuesParams = [projectId];
    const actionsParams = [projectId];
    
    // Apply filters with independent parameter tracking
    if (filters.status) {
      issuesQuery += ` AND LOWER(status) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.status);
      actionsQuery += ` AND LOWER(status) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.status);
    }
    
    if (filters.priority) {
      issuesQuery += ` AND LOWER(priority) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.priority);
      actionsQuery += ` AND LOWER(priority) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.priority);
    }
    
    if (filters.assignee) {
      issuesQuery += ` AND LOWER(assignee) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.assignee);
      actionsQuery += ` AND LOWER(assignee) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.assignee);
    }
    
    if (filters.category) {
      // Category only applies to action items
      actionsQuery += ` AND LOWER(category) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.category);
    }
    
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      const issuesSearchIndex = issuesParams.length + 1;
      issuesQuery += ` AND (LOWER(title) LIKE LOWER($${issuesSearchIndex}) OR LOWER(description) LIKE LOWER($${issuesSearchIndex}))`;
      issuesParams.push(searchPattern);
      const actionsSearchIndex = actionsParams.length + 1;
      actionsQuery += ` AND (LOWER(title) LIKE LOWER($${actionsSearchIndex}) OR LOWER(description) LIKE LOWER($${actionsSearchIndex}))`;
      actionsParams.push(searchPattern);
    }
    
    if (filters.tag) {
      issuesQuery += ` AND $${issuesParams.length + 1} = ANY(tags)`;
      issuesParams.push(filters.tag);
      actionsQuery += ` AND $${actionsParams.length + 1} = ANY(tags)`;
      actionsParams.push(filters.tag);
    }
    
    // Fetch data
    const [issuesResult, actionsResult] = await Promise.all([
      pool.query(issuesQuery, issuesParams),
      pool.query(actionsQuery, actionsParams)
    ]);
    
    // Combine and format data for CSV
    const csvData = [];
    
    // Add issues
    issuesResult.rows.forEach(issue => {
      csvData.push({
        type: 'Issue',
        title: issue.title || '',
        assignee: issue.assignee || 'Unassigned',
        priority: issue.priority || 'medium',
        dueDate: issue.due_date ? new Date(issue.due_date).toLocaleDateString() : '',
        status: issue.status || 'To Do'
      });
    });
    
    // Add action items
    actionsResult.rows.forEach(action => {
      csvData.push({
        type: 'Action Item',
        title: action.title || '',
        assignee: action.assignee || 'Unassigned',
        priority: action.priority || 'medium',
        dueDate: action.due_date ? new Date(action.due_date).toLocaleDateString() : '',
        status: action.status || 'To Do'
      });
    });
    
    // Manual CSV generation (more reliable and virus-safe)
    const filename = `project-${projectId}-export.csv`;
    
    // Build CSV manually with proper escaping and CSV injection prevention
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      let str = String(value).trim();
      
      // Prevent CSV injection: remove or escape dangerous characters at start
      // Characters that can trigger formulas: = + - @ \t \r
      const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
      if (dangerousChars.some(char => str.startsWith(char))) {
        str = "'" + str; // Prefix with single quote to treat as text
      }
      
      // Remove any control characters that might trigger AV
      str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    
    // Create CSV rows
    const rows = [];
    rows.push('Item Type,Item Title,Assignee,Priority,Due Date,Status'); // Header
    
    csvData.forEach(item => {
      const row = [
        escapeCSV(item.type),
        escapeCSV(item.title),
        escapeCSV(item.assignee),
        escapeCSV(item.priority),
        escapeCSV(item.dueDate),
        escapeCSV(item.status)
      ].join(',');
      rows.push(row);
    });
    
    // Join with CRLF (Windows line endings) for better compatibility
    const csvContent = rows.join('\r\n');
    
    // Create buffer with UTF-8 BOM
    const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
    const content = Buffer.from(csvContent, 'utf8');
    const finalBuffer = Buffer.concat([BOM, content]);
    
    // Set comprehensive headers to prevent virus flagging
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', finalBuffer.length);
    res.setHeader('Content-Transfer-Encoding', 'binary');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    res.send(finalBuffer);
    
    console.log(`📊 CSV exported: ${filename} by user ${userId} (${csvData.length} items)`);
    
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ 
      error: 'Failed to generate CSV',
      message: error.message 
    });
  }
});

// GET /api/projects/:projectId/export/txt - Export Kanban data as plain text (TSV)
app.get('/api/projects/:projectId/export/txt', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const userId = req.user.id;
    
    // Check project access
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Build query params with filters (same as CSV export)
    const filters = {
      status: req.query.status,
      priority: req.query.priority,
      assignee: req.query.assignee,
      category: req.query.category,
      search: req.query.search,
      tag: req.query.tag
    };
    
    // Base queries with separate parameter indices
    let issuesQuery = 'SELECT * FROM issues WHERE project_id = $1';
    let actionsQuery = 'SELECT * FROM action_items WHERE project_id = $1';
    const issuesParams = [projectId];
    const actionsParams = [projectId];
    
    // Apply filters with independent parameter tracking
    if (filters.status) {
      issuesQuery += ` AND LOWER(status) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.status);
      actionsQuery += ` AND LOWER(status) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.status);
    }
    
    if (filters.priority) {
      issuesQuery += ` AND LOWER(priority) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.priority);
      actionsQuery += ` AND LOWER(priority) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.priority);
    }
    
    if (filters.assignee) {
      issuesQuery += ` AND LOWER(assignee) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.assignee);
      actionsQuery += ` AND LOWER(assignee) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.assignee);
    }
    
    if (filters.category) {
      actionsQuery += ` AND LOWER(category) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.category);
    }
    
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      const issuesSearchIndex = issuesParams.length + 1;
      issuesQuery += ` AND (LOWER(title) LIKE LOWER($${issuesSearchIndex}) OR LOWER(description) LIKE LOWER($${issuesSearchIndex}))`;
      issuesParams.push(searchPattern);
      const actionsSearchIndex = actionsParams.length + 1;
      actionsQuery += ` AND (LOWER(title) LIKE LOWER($${actionsSearchIndex}) OR LOWER(description) LIKE LOWER($${actionsSearchIndex}))`;
      actionsParams.push(searchPattern);
    }
    
    if (filters.tag) {
      issuesQuery += ` AND $${issuesParams.length + 1} = ANY(tags)`;
      issuesParams.push(filters.tag);
      actionsQuery += ` AND $${actionsParams.length + 1} = ANY(tags)`;
      actionsParams.push(filters.tag);
    }
    
    // Fetch data
    const [issuesResult, actionsResult] = await Promise.all([
      pool.query(issuesQuery, issuesParams),
      pool.query(actionsQuery, actionsParams)
    ]);
    
    // Combine and format data for TSV
    const rows = [];
    
    // Header row with tabs
    rows.push('Item Type\tItem Title\tAssignee\tPriority\tDue Date\tStatus');
    
    // Add issues
    issuesResult.rows.forEach(issue => {
      const row = [
        'Issue',
        (issue.title || '').replace(/[\t\n\r]/g, ' '),
        issue.assignee || 'Unassigned',
        issue.priority || 'medium',
        issue.due_date ? new Date(issue.due_date).toLocaleDateString() : '',
        issue.status || 'To Do'
      ].join('\t');
      rows.push(row);
    });
    
    // Add action items
    actionsResult.rows.forEach(action => {
      const row = [
        'Action Item',
        (action.title || '').replace(/[\t\n\r]/g, ' '),
        action.assignee || 'Unassigned',
        action.priority || 'medium',
        action.due_date ? new Date(action.due_date).toLocaleDateString() : '',
        action.status || 'To Do'
      ].join('\t');
      rows.push(row);
    });
    
    // Join with newlines
    const textContent = rows.join('\n');
    
    // Set headers for plain text
    const filename = `project-${projectId}-export.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    
    res.send(textContent);
    
    const itemCount = issuesResult.rows.length + actionsResult.rows.length;
    console.log(`📄 TXT exported: ${filename} by user ${userId} (${itemCount} items)`);
    
  } catch (error) {
    console.error('TXT export error:', error);
    res.status(500).json({ 
      error: 'Failed to generate text export',
      message: error.message 
    });
  }
});

// GET /api/projects/:projectId/export/clipboard - Get data for clipboard copy
app.get('/api/projects/:projectId/export/clipboard', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const userId = req.user.id;
    
    // Check project access
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Build query params with filters (same as CSV export)
    const filters = {
      status: req.query.status,
      priority: req.query.priority,
      assignee: req.query.assignee,
      category: req.query.category,
      search: req.query.search,
      tag: req.query.tag
    };
    
    // Base queries with separate parameter indices
    let issuesQuery = 'SELECT * FROM issues WHERE project_id = $1';
    let actionsQuery = 'SELECT * FROM action_items WHERE project_id = $1';
    const issuesParams = [projectId];
    const actionsParams = [projectId];
    
    // Apply filters with independent parameter tracking
    if (filters.status) {
      issuesQuery += ` AND LOWER(status) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.status);
      actionsQuery += ` AND LOWER(status) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.status);
    }
    
    if (filters.priority) {
      issuesQuery += ` AND LOWER(priority) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.priority);
      actionsQuery += ` AND LOWER(priority) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.priority);
    }
    
    if (filters.assignee) {
      issuesQuery += ` AND LOWER(assignee) = LOWER($${issuesParams.length + 1})`;
      issuesParams.push(filters.assignee);
      actionsQuery += ` AND LOWER(assignee) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.assignee);
    }
    
    if (filters.category) {
      actionsQuery += ` AND LOWER(category) = LOWER($${actionsParams.length + 1})`;
      actionsParams.push(filters.category);
    }
    
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      const issuesSearchIndex = issuesParams.length + 1;
      issuesQuery += ` AND (LOWER(title) LIKE LOWER($${issuesSearchIndex}) OR LOWER(description) LIKE LOWER($${issuesSearchIndex}))`;
      issuesParams.push(searchPattern);
      const actionsSearchIndex = actionsParams.length + 1;
      actionsQuery += ` AND (LOWER(title) LIKE LOWER($${actionsSearchIndex}) OR LOWER(description) LIKE LOWER($${actionsSearchIndex}))`;
      actionsParams.push(searchPattern);
    }
    
    if (filters.tag) {
      issuesQuery += ` AND $${issuesParams.length + 1} = ANY(tags)`;
      issuesParams.push(filters.tag);
      actionsQuery += ` AND $${actionsParams.length + 1} = ANY(tags)`;
      actionsParams.push(filters.tag);
    }
    
    // Fetch data
    const [issuesResult, actionsResult] = await Promise.all([
      pool.query(issuesQuery, issuesParams),
      pool.query(actionsQuery, actionsParams)
    ]);
    
    // Format data for clipboard (tab-separated for Excel paste compatibility)
    const rows = [];
    
    // Header row
    rows.push({
      type: 'Item Type',
      title: 'Item Title',
      assignee: 'Assignee',
      priority: 'Priority',
      dueDate: 'Due Date',
      status: 'Status'
    });
    
    // Add issues
    issuesResult.rows.forEach(issue => {
      rows.push({
        type: 'Issue',
        title: issue.title || '',
        assignee: issue.assignee || 'Unassigned',
        priority: issue.priority || 'medium',
        dueDate: issue.due_date ? new Date(issue.due_date).toLocaleDateString() : '',
        status: issue.status || 'To Do'
      });
    });
    
    // Add action items
    actionsResult.rows.forEach(action => {
      rows.push({
        type: 'Action Item',
        title: action.title || '',
        assignee: action.assignee || 'Unassigned',
        priority: action.priority || 'medium',
        dueDate: action.due_date ? new Date(action.due_date).toLocaleDateString() : '',
        status: action.status || 'To Do'
      });
    });
    
    // Return as JSON for client-side clipboard handling
    res.json({ 
      success: true,
      data: rows,
      count: rows.length - 1 // Exclude header
    });
    
    const itemCount = issuesResult.rows.length + actionsResult.rows.length;
    console.log(`📋 Clipboard data prepared for user ${userId} (${itemCount} items)`);
    
  } catch (error) {
    console.error('Clipboard data error:', error);
    res.status(500).json({ 
      error: 'Failed to prepare clipboard data',
      message: error.message 
    });
  }
});

// ========================================
// VALIDATION ENDPOINTS
// ========================================

// POST /api/checklists/:id/validate - Run validation
app.post('/api/checklists/:id/validate', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    const { validation_type = 'manual' } = req.body;
    
    // Get checklist with all items and responses
    const checklistResult = await pool.query(
      `SELECT 
        c.*,
        ct.name as template_name
      FROM checklists c
      LEFT JOIN checklist_templates ct ON c.template_id = ct.id
      WHERE c.id = $1`,
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    const checklist = checklistResult.rows[0];
    
    // Check access
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [checklist.project_id, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get all items with responses
    const itemsResult = await pool.query(
      `SELECT 
        cti.id,
        cti.item_text,
        cti.field_type,
        cti.is_required,
        cts.title as section_title,
        cts.section_number,
        cr.response_value,
        cr.response_date,
        cr.response_boolean,
        cr.is_completed,
        cr.notes,
        (SELECT json_agg(json_build_object(
          'user', u.username,
          'comment', cc.comment
        ))
        FROM checklist_comments cc
        LEFT JOIN users u ON cc.created_by = u.id
        WHERE cc.checklist_id = $1 AND cc.response_id = cr.id) as comments
      FROM checklist_template_items cti
      INNER JOIN checklist_template_sections cts ON cti.section_id = cts.id
      LEFT JOIN checklist_responses cr ON cr.template_item_id = cti.id AND cr.checklist_id = $1
      WHERE cts.template_id = $2
      ORDER BY cts.display_order, cti.display_order`,
      [checklistId, checklist.template_id]
    );
    
    checklist.items = itemsResult.rows;
    
    // Run validation
    const validationResult = await validateChecklist(checklist);
    
    // Save validation to database
    const validationStatus = getValidationStatus(validationResult.quality_score, validationResult.error_count);
    
    const insertResult = await pool.query(
      `INSERT INTO checklist_validations (
        checklist_id, is_valid, quality_score, completeness_score,
        consistency_score, quality_rating, error_count, warning_count,
        errors, warnings, recommendations, validated_by, validation_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        checklistId,
        validationResult.is_valid,
        validationResult.quality_score,
        validationResult.completeness_score,
        validationResult.consistency_score,
        validationResult.quality_rating,
        validationResult.error_count,
        validationResult.warning_count,
        JSON.stringify(validationResult.errors),
        JSON.stringify(validationResult.warnings),
        validationResult.recommendations,
        userId,
        validation_type
      ]
    );
    
    // Update checklist validation status
    await pool.query(
      `UPDATE checklists 
       SET 
         last_validation_score = $1,
         last_validated_at = CURRENT_TIMESTAMP,
         validation_status = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [validationResult.quality_score, validationStatus, checklistId]
    );
    
    res.json({
      validation_id: insertResult.rows[0].id,
      ...validationResult,
      validation_status: validationStatus
    });
    
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ 
      error: 'Failed to validate checklist',
      message: error.message 
    });
  }
});

// GET /api/checklists/:id/validations - Get validation history
app.get('/api/checklists/:id/validations', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    
    // Check access
    const checklistResult = await pool.query(
      'SELECT project_id FROM checklists WHERE id = $1',
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [checklistResult.rows[0].project_id, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get validation history
    const validations = await pool.query(
      `SELECT 
        v.*,
        u.username as validated_by_name
      FROM checklist_validations v
      LEFT JOIN users u ON v.validated_by = u.id
      WHERE v.checklist_id = $1
      ORDER BY v.validated_at DESC
      LIMIT 10`,
      [checklistId]
    );
    
    res.json(validations.rows);
    
  } catch (error) {
    console.error('Error fetching validations:', error);
    res.status(500).json({ error: 'Failed to fetch validations' });
  }
});

// GET /api/checklists/:id/validation/latest - Get latest validation
app.get('/api/checklists/:id/validation/latest', authenticateToken, async (req, res) => {
  try {
    const checklistId = req.params.id;
    const userId = req.user.id;
    
    // Check access
    const checklistResult = await pool.query(
      'SELECT project_id FROM checklists WHERE id = $1',
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    
    const accessCheck = await pool.query(
      'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
      [checklistResult.rows[0].project_id, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get latest validation
    const validation = await pool.query(
      `SELECT 
        v.*,
        u.username as validated_by_name
      FROM checklist_validations v
      LEFT JOIN users u ON v.validated_by = u.id
      WHERE v.checklist_id = $1
      ORDER BY v.validated_at DESC
      LIMIT 1`,
      [checklistId]
    );
    
    if (validation.rows.length === 0) {
      return res.status(404).json({ error: 'No validation found' });
    }
    
    res.json(validation.rows[0]);
    
  } catch (error) {
    console.error('Error fetching latest validation:', error);
    res.status(500).json({ error: 'Failed to fetch latest validation' });
  }
});

// ============================================
// Checklist Completion Validation
// ============================================

/**
 * Get checklist completion status for an issue
 * GET /api/issues/:issueId/checklist-status
 * Returns: { hasChecklist, total, completed, percentage }
 */
app.get('/api/issues/:issueId/checklist-status', authenticateToken, async (req, res) => {
  try {
    const { issueId } = req.params;
    
    // Get individual checklists with their details
    const individualChecklistsResult = await pool.query(
      `SELECT 
        id,
        title as name,
        COALESCE(total_items, 0) as total,
        COALESCE(completed_items, 0) as completed
       FROM checklists 
       WHERE related_issue_id = $1 
         AND (is_standalone = false OR is_standalone IS NULL)
       ORDER BY created_at`,
      [issueId]
    );
    
    // Get aggregate totals
    const checklistsResult = await pool.query(
      `SELECT 
        SUM(COALESCE(total_items, 0)) as total,
        SUM(COALESCE(completed_items, 0)) as completed
       FROM checklists 
       WHERE related_issue_id = $1 
         AND (is_standalone = false OR is_standalone IS NULL)`,
      [issueId]
    );
    
    const total = parseInt(checklistsResult.rows[0].total) || 0;
    const completed = parseInt(checklistsResult.rows[0].completed) || 0;
    
    if (total === 0) {
      return res.json({ 
        hasChecklist: false,
        total: 0,
        completed: 0,
        percentage: 0,
        checklists: []
      });
    }
    
    const percentage = Math.round((completed / total) * 100);
    
    // Format individual checklists data
    const checklists = individualChecklistsResult.rows.map(cl => ({
      id: cl.id,
      name: cl.name,
      total: parseInt(cl.total),
      completed: parseInt(cl.completed),
      percentage: cl.total > 0 ? Math.round((parseInt(cl.completed) / parseInt(cl.total)) * 100) : 0
    }));
    
    res.json({
      hasChecklist: true,
      total: total,
      completed: completed,
      percentage: percentage,
      checklists: checklists
    });
    
  } catch (error) {
    console.error('Error getting checklist status:', error);
    res.status(500).json({ 
      error: 'Failed to get checklist status',
      hasChecklist: false 
    });
  }
});

/**
 * Get incomplete checklist items for an issue
 * GET /api/issues/:issueId/incomplete-checklist-items
 * Returns: Array of { text } for incomplete items
 */
app.get('/api/issues/:issueId/incomplete-checklist-items', authenticateToken, async (req, res) => {
  try {
    const { issueId } = req.params;
    
    const result = await pool.query(
      `SELECT cr.item_text as text
       FROM checklist_responses cr
       JOIN checklist_sections cs ON cr.section_id = cs.id
       JOIN checklists c ON cs.checklist_id = c.id
       WHERE c.related_issue_id = $1 
         AND (c.is_standalone = false OR c.is_standalone IS NULL)
         AND cr.is_completed = false
       ORDER BY cs.display_order, cr.display_order
       LIMIT 10`,
      [issueId]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error getting incomplete items:', error);
    res.status(500).json({ 
      error: 'Failed to get incomplete items',
      items: [] 
    });
  }
});

/**
 * Get checklist completion status for an action item
 * GET /api/action-items/:actionId/checklist-status
 * Returns: { hasChecklist, total, completed, percentage }
 */
app.get('/api/action-items/:actionId/checklist-status', authenticateToken, async (req, res) => {
  try {
    const { actionId } = req.params;
    
    // Get individual checklists with their details
    const individualChecklistsResult = await pool.query(
      `SELECT 
        id,
        title as name,
        COALESCE(total_items, 0) as total,
        COALESCE(completed_items, 0) as completed
       FROM checklists 
       WHERE related_action_id = $1 
         AND (is_standalone = false OR is_standalone IS NULL)
       ORDER BY created_at`,
      [actionId]
    );
    
    // Get aggregate totals
    const checklistsResult = await pool.query(
      `SELECT 
        SUM(COALESCE(total_items, 0)) as total,
        SUM(COALESCE(completed_items, 0)) as completed
       FROM checklists 
       WHERE related_action_id = $1 
         AND (is_standalone = false OR is_standalone IS NULL)`,
      [actionId]
    );
    
    const total = parseInt(checklistsResult.rows[0].total) || 0;
    const completed = parseInt(checklistsResult.rows[0].completed) || 0;
    
    if (total === 0) {
      return res.json({ 
        hasChecklist: false,
        total: 0,
        completed: 0,
        percentage: 0,
        checklists: []
      });
    }
    
    const percentage = Math.round((completed / total) * 100);
    
    // Format individual checklists data
    const checklists = individualChecklistsResult.rows.map(cl => ({
      id: cl.id,
      name: cl.name,
      total: parseInt(cl.total),
      completed: parseInt(cl.completed),
      percentage: cl.total > 0 ? Math.round((parseInt(cl.completed) / parseInt(cl.total)) * 100) : 0
    }));
    
    res.json({
      hasChecklist: true,
      total: total,
      completed: completed,
      percentage: percentage,
      checklists: checklists
    });
    
  } catch (error) {
    console.error('Error getting action item checklist status:', error);
    res.status(500).json({ 
      error: 'Failed to get checklist status',
      hasChecklist: false 
    });
  }
});

/**
 * Get incomplete checklist items for an action item
 * GET /api/action-items/:actionId/incomplete-checklist-items
 * Returns: Array of { text } for incomplete items
 */
app.get('/api/action-items/:actionId/incomplete-checklist-items', authenticateToken, async (req, res) => {
  try {
    const { actionId } = req.params;
    
    const result = await pool.query(
      `SELECT cr.item_text as text
       FROM checklist_responses cr
       JOIN checklist_sections cs ON cr.section_id = cs.id
       JOIN checklists c ON cs.checklist_id = c.id
       WHERE c.related_action_id = $1 
         AND (c.is_standalone = false OR c.is_standalone IS NULL)
         AND cr.is_completed = false
       ORDER BY cs.display_order, cr.display_order
       LIMIT 10`,
      [actionId]
    );
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('Error getting incomplete items:', error);
    res.status(500).json({ 
      error: 'Failed to get incomplete items',
      items: [] 
    });
  }
});

// Get mismatched assignee names
app.get('/api/admin/assignee-mismatches', authenticateToken, async (req, res) => {
  try {
    // Check admin permission
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    if (userRoleLevel < ROLE_HIERARCHY['System Administrator']) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get all unique assignees from both issues and action_items
    const result = await pool.query(`
      WITH all_assignees AS (
        SELECT DISTINCT 
          TRIM(assignee) as assignee_name,
          'issue' as source_type
        FROM issues 
        WHERE assignee IS NOT NULL AND assignee <> ''
        UNION
        SELECT DISTINCT 
          TRIM(assignee) as assignee_name,
          'action_item' as source_type
        FROM action_items 
        WHERE assignee IS NOT NULL AND assignee <> ''
      ),
      assignee_counts AS (
        SELECT 
          aa.assignee_name,
          COALESCE(i.issue_count, 0) as issue_count,
          COALESCE(a.action_count, 0) as action_count,
          CASE 
            WHEN u.username IS NOT NULL THEN u.username
            ELSE NULL
          END as matched_username,
          CASE 
            WHEN u.username IS NULL THEN true
            WHEN LOWER(TRIM(aa.assignee_name)) <> LOWER(u.username) THEN true
            ELSE false
          END as is_mismatch
        FROM (SELECT DISTINCT assignee_name FROM all_assignees) aa
        LEFT JOIN users u ON LOWER(TRIM(aa.assignee_name)) = LOWER(u.username)
        LEFT JOIN (
          SELECT TRIM(assignee) as name, COUNT(*) as issue_count 
          FROM issues 
          WHERE assignee IS NOT NULL AND assignee <> '' 
          GROUP BY TRIM(assignee)
        ) i ON i.name = aa.assignee_name
        LEFT JOIN (
          SELECT TRIM(assignee) as name, COUNT(*) as action_count 
          FROM action_items 
          WHERE assignee IS NOT NULL AND assignee <> '' 
          GROUP BY TRIM(assignee)
        ) a ON a.name = aa.assignee_name
      )
      SELECT 
        assignee_name,
        issue_count,
        action_count,
        (issue_count + action_count) as total_count,
        matched_username,
        is_mismatch
      FROM assignee_counts
      ORDER BY is_mismatch DESC, total_count DESC, assignee_name
    `);
    
    console.log(`[ADMIN MISMATCHES] Found ${result.rows.length} unique assignees`);
    console.log(`[ADMIN MISMATCHES] Mismatches:`, result.rows.filter(r => r.is_mismatch).map(r => ({ name: r.assignee_name, total: r.total_count })));
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching assignee mismatches:', error);
    res.status(500).json({ error: 'Failed to fetch mismatches' });
  }
});

// Bulk update assignee names
app.post('/api/admin/update-assignees', authenticateToken, async (req, res) => {
  try {
    // Check admin permission
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    if (userRoleLevel < ROLE_HIERARCHY['System Administrator']) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { updates } = req.body; // Array of {oldName, newName}
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array required' });
    }
    
    let issuesUpdated = 0;
    let actionsUpdated = 0;
    let usersUpdated = 0;
    
    // Update each assignee name
    for (const update of updates) {
      const { oldName, newName } = update;
      
      if (!oldName || !newName) {
        continue;
      }
      
      console.log(`[ADMIN UPDATE] Updating assignee: "${oldName}" -> "${newName}"`);
      
      // Update issues - use case-insensitive matching
      const issueResult = await pool.query(
        'UPDATE issues SET assignee = $1 WHERE LOWER(TRIM(assignee)) = LOWER($2)',
        [newName, oldName.trim()]
      );
      console.log(`[ADMIN UPDATE]   Issues updated: ${issueResult.rowCount || 0}`);
      issuesUpdated += issueResult.rowCount || 0;
      
      // Update action items - use case-insensitive matching
      const actionResult = await pool.query(
        'UPDATE action_items SET assignee = $1 WHERE LOWER(TRIM(assignee)) = LOWER($2)',
        [newName, oldName.trim()]
      );
      console.log(`[ADMIN UPDATE]   Action items updated: ${actionResult.rowCount || 0}`);
      actionsUpdated += actionResult.rowCount || 0;
      
      // Update users table - only safe to update if no conflict exists
      // Use case-insensitive matching to handle variations like "gajalakshmi" vs "Gajalakshmi"
      // Skip users that would conflict with existing usernames (including case variants)
      const userResult = await pool.query(
        `UPDATE users u1 SET username = $1 
         WHERE LOWER(TRIM(u1.username)) = LOWER($2)
         AND NOT EXISTS (
           SELECT 1 FROM users u2
           WHERE LOWER(TRIM(u2.username)) = LOWER($1) 
           AND u2.id != u1.id
         )`,
        [newName, oldName.trim()]
      );
      console.log(`[ADMIN UPDATE]   Users updated: ${userResult.rowCount || 0}`);
      usersUpdated += userResult.rowCount || 0;
    }
    
    res.json({
      success: true,
      updatesApplied: updates.length,
      issuesUpdated,
      actionsUpdated,
      usersUpdated,
      totalUpdated: issuesUpdated + actionsUpdated + usersUpdated,
      message: usersUpdated === 0 && (issuesUpdated > 0 || actionsUpdated > 0) ? 
        'Assignee names updated in issues/action items. If old names still appear in dropdowns, manually update user profiles or remove inactive users from projects.' : 
        'Assignee consolidation completed successfully.'
    });
  } catch (error) {
    console.error('Error updating assignees:', error);
    res.status(500).json({ error: 'Failed to update assignees' });
  }
});

// ==================== BULK METADATA ENDPOINT (PERFORMANCE OPTIMIZATION) ====================

/**
 * Get bulk metadata for all items in a project
 * Returns relationships, comments, and checklist status for all issues and action items
 * This replaces hundreds of individual API calls with a single bulk request
 */
app.get('/api/projects/:projectId/items-metadata', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Verify project access
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get all relationship counts for issues and action items in this project
    const relationshipsResult = await pool.query(`
      WITH project_items AS (
        SELECT id, 'issue' as type FROM issues WHERE project_id = $1
        UNION ALL
        SELECT id, 'action-item' as type FROM action_items WHERE project_id = $1
      ),
      outgoing_counts AS (
        SELECT source_id, source_type, COUNT(*) as count
        FROM issue_relationships r
        INNER JOIN project_items pi ON r.source_id = pi.id AND r.source_type = pi.type
        GROUP BY source_id, source_type
      ),
      incoming_counts AS (
        SELECT target_id, target_type, COUNT(*) as count
        FROM issue_relationships r
        INNER JOIN project_items pi ON r.target_id = pi.id AND r.target_type = pi.type
        GROUP BY target_id, target_type
      )
      SELECT 
        COALESCE(o.source_id, i.target_id) as item_id,
        COALESCE(o.source_type, i.target_type) as item_type,
        COALESCE(o.count, 0) + COALESCE(i.count, 0) as total_count
      FROM outgoing_counts o
      FULL OUTER JOIN incoming_counts i 
        ON o.source_id = i.target_id AND o.source_type = i.target_type
    `, [projectId]);
    
    // Get all comment counts
    const commentsResult = await pool.query(`
      SELECT issue_id as item_id, 'issue' as item_type, COUNT(*) as count
      FROM issue_comments ic
      WHERE issue_id IN (SELECT id FROM issues WHERE project_id = $1)
      GROUP BY issue_id
      UNION ALL
      SELECT action_item_id as item_id, 'action-item' as item_type, COUNT(*) as count
      FROM action_item_comments ac
      WHERE action_item_id IN (SELECT id FROM action_items WHERE project_id = $1)
      GROUP BY action_item_id
    `, [projectId]);
    
    // Get all checklist statuses for issues
    const issueChecklistsResult = await pool.query(`
      SELECT 
        related_issue_id as item_id,
        'issue' as item_type,
        ARRAY_AGG(json_build_object(
          'id', id,
          'name', title,
          'total', COALESCE(total_items, 0),
          'completed', COALESCE(completed_items, 0)
        ) ORDER BY created_at) as checklists,
        SUM(COALESCE(total_items, 0)) as total,
        SUM(COALESCE(completed_items, 0)) as completed
      FROM checklists 
      WHERE related_issue_id IN (SELECT id FROM issues WHERE project_id = $1)
        AND (is_standalone = false OR is_standalone IS NULL)
      GROUP BY related_issue_id
    `, [projectId]);
    
    // Get all checklist statuses for action items
    const actionChecklistsResult = await pool.query(`
      SELECT 
        related_action_id as item_id,
        'action-item' as item_type,
        ARRAY_AGG(json_build_object(
          'id', id,
          'name', title,
          'total', COALESCE(total_items, 0),
          'completed', COALESCE(completed_items, 0)
        ) ORDER BY created_at) as checklists,
        SUM(COALESCE(total_items, 0)) as total,
        SUM(COALESCE(completed_items, 0)) as completed
      FROM checklists 
      WHERE related_action_id IN (SELECT id FROM action_items WHERE project_id = $1)
        AND (is_standalone = false OR is_standalone IS NULL)
      GROUP BY related_action_id
    `, [projectId]);
    
    // Build response object with all metadata
    const metadata = {
      relationships: {},
      comments: {},
      checklists: {}
    };
    
    // Process relationships
    relationshipsResult.rows.forEach(row => {
      const key = `${row.item_type}-${row.item_id}`;
      metadata.relationships[key] = parseInt(row.total_count);
    });
    
    // Process comments
    commentsResult.rows.forEach(row => {
      const key = `${row.item_type}-${row.item_id}`;
      metadata.comments[key] = parseInt(row.count);
    });
    
    // Process issue checklists
    issueChecklistsResult.rows.forEach(row => {
      const key = `issue-${row.item_id}`;
      const total = parseInt(row.total) || 0;
      const completed = parseInt(row.completed) || 0;
      metadata.checklists[key] = {
        hasChecklist: true,
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        checklists: row.checklists || []
      };
    });
    
    // Process action item checklists
    actionChecklistsResult.rows.forEach(row => {
      const key = `action-item-${row.item_id}`;
      const total = parseInt(row.total) || 0;
      const completed = parseInt(row.completed) || 0;
      metadata.checklists[key] = {
        hasChecklist: true,
        total,
        completed,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        checklists: row.checklists || []
      };
    });
    
    res.json(metadata);
  } catch (error) {
    console.error('Error fetching bulk metadata:', error);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

// ==================== EFFORT ESTIMATION ENDPOINTS (PHASE 1) ====================

/**
 * Generate AI effort estimate for an issue or action item
 * POST /api/:itemType/:id/estimate
 * Body: { model: 'gpt-4o' | 'gpt-3.5-turbo' } (optional)
 */
app.post('/api/:itemType/:id/estimate', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const { model = 'gpt-4o' } = req.body;
    const userId = req.user.id;

    // Validate item type
    if (!['issues', 'action-items'].includes(itemType)) {
      return res.status(400).json({ error: 'Invalid item type' });
    }

    const actualItemType = itemType === 'issues' ? 'issue' : 'action-item';
    
    // CRITICAL FIX: Fetch projectId before rate limiting check
    const tableName = itemType === 'issues' ? 'issues' : 'action_items';
    const projectResult = await pool.query(`SELECT project_id FROM ${tableName} WHERE id = $1`, [id]);
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const projectId = projectResult.rows[0].project_id;
    
    // Check rate limits with actual projectId
    const { checkRateLimit } = require('./middleware/ai-rate-limiter');
    const rateLimitStatus = await checkRateLimit(pool, userId, projectId, 'effort_estimation');
    
    if (!rateLimitStatus.allowed) {
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: rateLimitStatus.message,
        limits: rateLimitStatus.limits,
        retryAfter: rateLimitStatus.limits.user.exceeded 
          ? Math.ceil((rateLimitStatus.limits.user.resetAt - Date.now()) / 1000)
          : Math.ceil((rateLimitStatus.limits.project.resetAt - Date.now()) / 1000)
      });
    }

    // Generate estimate
    const result = await generateEstimateFromItem(pool, actualItemType, id, {
      userId,
      model,
      source: 'manual_regenerate'
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        message: result.message
      });
    }

    // Return estimate with rate limit warnings
    const response = {
      success: true,
      estimate: {
        hours: result.totalHours,
        confidence: result.confidence,
        version: result.version
      },
      rateLimitStatus
    };

    // Add warning if approaching rate limit
    if (rateLimitStatus?.limits?.user?.warning) {
      response.warning = {
        type: 'rate_limit_warning',
        message: `You have ${rateLimitStatus.limits.user.remaining} AI estimates remaining this hour.`
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Error generating estimate:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      error: 'Failed to generate estimate',
      details: error.message 
    });
  }
});

/**
 * Get estimate breakdown (detailed tasks)
 * GET /api/:itemType/:id/estimate/breakdown?version=N&type=ai|hybrid
 */
app.get('/api/:itemType/:id/estimate/breakdown', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const { version, type = 'ai' } = req.query;

    const actualItemType = itemType === 'issues' ? 'issue' : 'action-item';

    // If requesting hybrid breakdown
    if (type === 'hybrid') {
      console.log('Fetching hybrid breakdown:', { actualItemType, id });
      
      // First, get the current hybrid hours from the main table
      const tableName = actualItemType === 'issue' ? 'issues' : 'action_items';
      const currentHybridQuery = `
        SELECT hybrid_effort_estimate_hours
        FROM ${tableName}
        WHERE id = $1
      `;
      const currentHybridResult = await pool.query(currentHybridQuery, [id]);
      
      if (currentHybridResult.rows.length === 0 || !currentHybridResult.rows[0].hybrid_effort_estimate_hours) {
        console.warn('No current hybrid estimate found for:', { actualItemType, id });
        return res.status(404).json({ error: 'No hybrid estimate found for this item' });
      }
      
      const currentHybridHours = currentHybridResult.rows[0].hybrid_effort_estimate_hours;
      
      // Now fetch the matching hybrid from history that matches these hours
      const hybridQuery = `
        SELECT hybrid_estimate_data, estimate_hours, version, created_at
        FROM effort_estimate_history
        WHERE item_type = $1 AND item_id = $2 
          AND hybrid_estimate_data IS NOT NULL
          AND ABS(estimate_hours - $3) < 0.1
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const hybridResult = await pool.query(hybridQuery, [actualItemType, id, currentHybridHours]);
      
      console.log('Hybrid query result:', {
        rowCount: hybridResult.rows.length,
        hasData: hybridResult.rows.length > 0,
        currentHybridHours
      });
      
      if (hybridResult.rows.length === 0) {
        console.warn('No matching hybrid estimate found in history for:', { actualItemType, id, currentHybridHours });
        return res.status(404).json({ error: 'No hybrid estimate found for this item' });
      }

      const hybridData = hybridResult.rows[0].hybrid_estimate_data;
      
      // Convert totalHours from string to number
      const totalHours = parseFloat(hybridResult.rows[0].estimate_hours);
      
      console.log('Returning hybrid data:', {
        totalHours: totalHours,
        tasksCount: hybridData.selectedTasks?.length
      });
      
      return res.json({
        type: 'hybrid',
        totalHours: totalHours,
        version: hybridResult.rows[0].version,
        selectedTasks: hybridData.selectedTasks || [],
        timestamp: hybridResult.rows[0].created_at
      });
    }

    // Otherwise, get AI breakdown
    const breakdown = await getEstimateBreakdown(pool, actualItemType, id, version ? parseInt(version) : null);

    if (!breakdown) {
      return res.status(404).json({ error: 'No estimate found for this item' });
    }

    const breakdownData = breakdown.breakdown || {};
    
    const response = {
      type: 'ai',
      totalHours: breakdown.estimateHours,
      confidence: breakdown.confidence,
      version: breakdown.version,
      tasks: breakdownData.tasks || [],
      assumptions: breakdownData.assumptions || [],
      timestamp: breakdown.createdAt,
      source: breakdown.source
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch breakdown' });
  }
});

/**
 * Get estimate history (all versions)
 * GET /api/:itemType/:id/estimate/history
 */
app.get('/api/:itemType/:id/estimate/history', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const actualItemType = itemType === 'issues' ? 'issue' : 'action-item';

    const history = await getEstimateHistory(pool, actualItemType, id);

    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * Update manual estimate
 * PATCH /api/:itemType/:id/estimate/manual
 * Body: { estimatedHours: number, actualHours: number (optional), planningSource: 'manual'|'ai'|'hybrid' }
 */
app.patch('/api/:itemType/:id/estimate/manual', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const { estimatedHours, actualHours, planningSource } = req.body;

    const tableName = itemType === 'issues' ? 'issues' : 'action_items';

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (estimatedHours !== undefined) {
      updates.push(`estimated_effort_hours = $${paramIndex}`);
      params.push(estimatedHours);
      paramIndex++;
    }

    if (actualHours !== undefined) {
      updates.push(`actual_effort_hours = $${paramIndex}`);
      params.push(actualHours);
      paramIndex++;
    }

    if (planningSource !== undefined) {
      updates.push(`planning_estimate_source = $${paramIndex}`);
      params.push(planningSource);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);

    params.push(id);
    const query = `UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({
      success: true,
      estimatedHours: result.rows[0].estimated_effort_hours,
      actualHours: result.rows[0].actual_effort_hours,
      planningSource: result.rows[0].planning_estimate_source
    });
  } catch (error) {
    console.error('Error updating manual estimate:', error);
    res.status(500).json({ error: 'Failed to update estimate' });
  }
});

/**
 * Save hybrid estimate (selected AI tasks)
 * POST /api/:itemType/:id/estimate/hybrid
 * Body: { selectedTasks: [{task, hours, originalHours, complexity, category, selected}], totalHours: number }
 */
app.post('/api/:itemType/:id/estimate/hybrid', authenticateToken, async (req, res) => {
  try {
    const { itemType, id } = req.params;
    const { selectedTasks, totalHours } = req.body;

    if (!selectedTasks || !Array.isArray(selectedTasks)) {
      return res.status(400).json({ error: 'selectedTasks array is required' });
    }

    if (totalHours === undefined || totalHours < 0) {
      return res.status(400).json({ error: 'totalHours is required and must be non-negative' });
    }

    const tableName = itemType === 'issues' ? 'issues' : 'action_items';
    const actualItemType = itemType === 'issues' ? 'issue' : 'action-item';

    // Prepare hybrid estimate data
    const hybridData = {
      selectedTasks: selectedTasks.filter(t => t.selected),
      totalHours,
      totalTasks: selectedTasks.length,
      createdAt: new Date().toISOString()
    };

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update item with hybrid hours
      const updateQuery = `
        UPDATE ${tableName} 
        SET hybrid_effort_estimate_hours = $1, 
            planning_estimate_source = 'hybrid',
            updated_at = NOW() 
        WHERE id = $2 
        RETURNING *
      `;
      const updateResult = await client.query(updateQuery, [totalHours, id]);

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found' });
      }

      // Get current AI estimate version for this item and increment it
      // Use row-level locking to prevent race conditions
      const versionQuery = `
        SELECT version
        FROM effort_estimate_history
        WHERE item_type = $1 AND item_id = $2
        ORDER BY version DESC
        LIMIT 1
        FOR UPDATE
      `;
      const versionResult = await client.query(versionQuery, [actualItemType, id]);
      const currentVersion = versionResult.rows.length > 0 ? versionResult.rows[0].version : 0;
      const newVersion = currentVersion + 1;

      // Update the item's AI estimate version
      const updateVersionQuery = `
        UPDATE ${tableName} 
        SET ai_estimate_version = $1
        WHERE id = $2
      `;
      await client.query(updateVersionQuery, [newVersion, id]);

      // Save to history table
      const historyQuery = `
        INSERT INTO effort_estimate_history 
        (item_type, item_id, estimate_hours, version, hybrid_estimate_data, source, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const historyResult = await client.query(historyQuery, [
        actualItemType,
        id,
        totalHours,
        newVersion, // Increment version for hybrid selection
        JSON.stringify(hybridData),
        'hybrid',
        req.user.id
      ]);

      await client.query('COMMIT');

      res.json({
        success: true,
        hybridHours: totalHours,
        selectedTasksCount: hybridData.selectedTasks.length,
        totalTasksCount: selectedTasks.length,
        historyId: historyResult.rows[0].id
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error saving hybrid estimate:', error);
    res.status(500).json({ error: 'Failed to save hybrid estimate' });
  }
});

/**
 * Get AI usage statistics
 * GET /api/ai-usage/stats?userId=N&projectId=N&timeRange=day|week|month
 */
app.get('/api/ai-usage/stats', authenticateToken, async (req, res) => {
  try {
    const { userId, projectId, timeRange = 'month' } = req.query;

    // Non-admins can only view their own stats
    const requestUserId = parseInt(userId) || req.user.id;
    if (requestUserId !== req.user.id && !['System Administrator', 'Project Manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const stats = await getUsageStats(pool, {
      userId: requestUserId,
      projectId: projectId ? parseInt(projectId) : null,
      feature: 'effort_estimation',
      timeRange
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

/**
 * Get current rate limit status
 * GET /api/ai-usage/rate-limit
 */
app.get('/api/ai-usage/rate-limit', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;
    const { checkRateLimit } = require('./middleware/ai-rate-limiter');

    const status = await checkRateLimit(
      pool,
      req.user.id,
      projectId ? parseInt(projectId) : null,
      'effort_estimation'
    );

    res.json(status);
  } catch (error) {
    console.error('Error checking rate limit:', error);
    res.status(500).json({ error: 'Failed to check rate limit' });
  }
});

// ============================================
// PROJECT SCHEDULING ENDPOINTS (Phase 1)
// ============================================

/**
 * Create new project schedule
 * POST /api/projects/:projectId/schedules
 * Body: { name, startDate, hoursPerDay, includeWeekends, selectedItems, notes }
 */
app.post('/api/projects/:projectId/schedules', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, startDate, hoursPerDay = 8, includeWeekends = false, selectedItems, notes } = req.body;
    const userId = req.user.id;

    // Validation
    if (!name || !startDate || !selectedItems || !Array.isArray(selectedItems)) {
      return res.status(400).json({ error: 'name, startDate, and selectedItems are required' });
    }

    if (selectedItems.length === 0) {
      return res.status(400).json({ error: 'At least one item must be selected' });
    }

    // Check project access
    const projectCheck = await pool.query(
      `SELECT p.id, p.name, pm.role 
       FROM projects p
       LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       WHERE p.id = $2`,
      [userId, projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Load item details with estimates
    const items = [];
    for (const item of selectedItems) {
      const tableName = item.type === 'issue' ? 'issues' : 'action_items';
      const userSelectedSource = item.estimateSource || 'planning'; // Use user's selection or default to planning
      
      const result = await pool.query(
        `SELECT id, title, assignee, 
         estimated_effort_hours,
         ai_effort_estimate_hours,
         hybrid_effort_estimate_hours,
         planning_estimate_source,
         due_date
         FROM ${tableName}
         WHERE id = $1`,
        [item.id]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        
        // Determine which estimate to use based on user's selection
        let selectedEstimate = 0;
        if (userSelectedSource === 'planning') {
          // Use the planning estimate source
          selectedEstimate = row.planning_estimate_source === 'manual' ? row.estimated_effort_hours :
                            row.planning_estimate_source === 'ai' ? row.ai_effort_estimate_hours :
                            row.planning_estimate_source === 'hybrid' ? row.hybrid_effort_estimate_hours :
                            row.estimated_effort_hours;
        } else if (userSelectedSource === 'ai') {
          selectedEstimate = row.ai_effort_estimate_hours;
        } else if (userSelectedSource === 'manual') {
          selectedEstimate = row.estimated_effort_hours;
        } else if (userSelectedSource === 'hybrid') {
          selectedEstimate = row.hybrid_effort_estimate_hours;
        }
        
        items.push({
          type: item.type,
          id: item.id,
          title: row.title,
          assignee: row.assignee,
          estimate: parseFloat(selectedEstimate) || 0,
          estimateSource: userSelectedSource,
          dueDate: row.due_date
        });
      }
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'No valid items found' });
    }

    // Calculate schedule
    const scheduleResult = await calculateProjectSchedule({
      items,
      startDate,
      hoursPerDay,
      includeWeekends
    });

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert schedule
      const scheduleInsert = await client.query(
        `INSERT INTO project_schedules 
         (project_id, name, version, start_date, end_date, hours_per_day, include_weekends,
          total_tasks, total_hours, critical_path_tasks, critical_path_hours, risks_count,
          is_active, is_published, created_by, notes)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, FALSE, $12, $13)
         RETURNING id`,
        [
          projectId,
          name,
          scheduleResult.summary.startDate,
          scheduleResult.summary.endDate,
          hoursPerDay,
          includeWeekends,
          scheduleResult.summary.totalTasks,
          scheduleResult.summary.totalHours,
          scheduleResult.summary.criticalPathTasks,
          scheduleResult.summary.criticalPathHours,
          scheduleResult.summary.risksCount,
          userId,
          notes || null
        ]
      );

      const scheduleId = scheduleInsert.rows[0].id;

      // Insert schedule items
      for (const item of items) {
        await client.query(
          `INSERT INTO schedule_items (schedule_id, item_type, item_id)
           VALUES ($1, $2, $3)`,
          [scheduleId, item.type, item.id]
        );
      }

      // Insert task schedules
      for (const task of scheduleResult.tasks) {
        await client.query(
          `INSERT INTO task_schedules 
           (schedule_id, item_type, item_id, assignee, estimated_hours, estimate_source,
            scheduled_start, scheduled_end, duration_days, due_date,
            is_critical_path, has_risk, risk_reason, days_late, dependencies)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            scheduleId,
            task.itemType,
            task.itemId,
            task.assignee,
            task.estimatedHours,
            task.estimateSource,
            task.scheduledStart,
            task.scheduledEnd,
            task.durationDays,
            task.dueDate,
            task.isCriticalPath,
            task.hasRisk,
            task.riskReason,
            task.daysLate,
            JSON.stringify(task.dependencies)
          ]
        );
      }

      await client.query('COMMIT');

      res.json({
        scheduleId,
        version: 1,
        ...scheduleResult.summary,
        message: 'Schedule created successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: error.message || 'Failed to create schedule' });
  }
});

/**
 * Get all schedules for a project
 * GET /api/projects/:projectId/schedules
 */
app.get('/api/projects/:projectId/schedules', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Check project access
    const projectCheck = await pool.query(
      `SELECT p.id FROM projects p
       LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       WHERE p.id = $2`,
      [userId, projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Get all schedules
    const schedules = await pool.query(
      `SELECT ps.*,
        u.username as created_by_username
       FROM project_schedules ps
       LEFT JOIN users u ON ps.created_by = u.id
       WHERE ps.project_id = $1
       ORDER BY ps.created_at DESC`,
      [projectId]
    );

    res.json(schedules.rows);

  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * Get specific schedule with full details
 * GET /api/schedules/:scheduleId
 */
app.get('/api/schedules/:scheduleId', authenticateToken, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const userId = req.user.id;

    // Get schedule with access check
    const scheduleResult = await pool.query(
      `SELECT ps.*, u.username as created_by_username
       FROM project_schedules ps
       LEFT JOIN users u ON ps.created_by = u.id
       LEFT JOIN projects p ON ps.project_id = p.id
       LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       WHERE ps.id = $2`,
      [userId, scheduleId]
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found or access denied' });
    }

    const schedule = scheduleResult.rows[0];

    // Get task schedules
    const tasks = await pool.query(
      `SELECT ts.*,
        CASE 
          WHEN ts.item_type = 'issue' THEN i.title
          ELSE ai.title
        END as title,
        CASE 
          WHEN ts.item_type = 'issue' THEN i.status
          ELSE ai.status
        END as status
       FROM task_schedules ts
       LEFT JOIN issues i ON ts.item_type = 'issue' AND ts.item_id = i.id
       LEFT JOIN action_items ai ON ts.item_type = 'action-item' AND ts.item_id = ai.id
       WHERE ts.schedule_id = $1
       ORDER BY ts.scheduled_start`,
      [scheduleId]
    );

    res.json({
      schedule,
      tasks: tasks.rows
    });

  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

/**
 * Delete schedule
 * DELETE /api/schedules/:scheduleId
 */
app.delete('/api/schedules/:scheduleId', authenticateToken, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const userId = req.user.id;

    // Check access (only creator or admin can delete)
    const scheduleCheck = await pool.query(
      `SELECT ps.id, ps.created_by, pm.role
       FROM project_schedules ps
       LEFT JOIN projects p ON ps.project_id = p.id
       LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $1
       WHERE ps.id = $2`,
      [userId, scheduleId]
    );

    if (scheduleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found or access denied' });
    }

    const schedule = scheduleCheck.rows[0];
    const userRoleLevel = ROLE_HIERARCHY[scheduleCheck.rows[0].role] || 0;
    const canDelete = schedule.created_by === userId || userRoleLevel >= ROLE_HIERARCHY['Team Lead'];

    if (!canDelete) {
      return res.status(403).json({ error: 'Only the schedule creator or team lead+ can delete schedules' });
    }

    // Delete schedule (CASCADE will handle related records)
    await pool.query('DELETE FROM project_schedules WHERE id = $1', [scheduleId]);

    res.json({ message: 'Schedule deleted successfully' });

  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// ============================================
// BATCH ESTIMATION ENDPOINTS (Phase 2)
// ============================================

// In-memory batch job storage (can be replaced with Redis/DB later)
const batchJobs = new Map();

/**
 * Start batch estimation for multiple items
 * POST /api/estimates/batch
 * Body: { items: [{id, type}], projectId }
 */
app.post('/api/estimates/batch', authenticateToken, async (req, res) => {
  try {
    const { items, projectId } = req.body;
    const userId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    if (items.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 items per batch' });
    }

    // Generate job ID
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job status
    const job = {
      id: jobId,
      userId,
      projectId,
      items,
      total: items.length,
      completed: 0,
      successful: 0,
      failed: 0,
      status: 'processing',
      results: [],
      startedAt: new Date(),
      completedAt: null,
      currentItem: null
    };

    batchJobs.set(jobId, job);

    // Start processing asynchronously (don't await)
    processBatchEstimation(jobId, items, userId, projectId).catch(err => {
      console.error(`Batch job ${jobId} failed:`, err);
      const job = batchJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.error = err.message;
      }
    });

    res.json({
      jobId,
      total: items.length,
      message: 'Batch estimation started'
    });

  } catch (error) {
    console.error('Error starting batch estimation:', error);
    res.status(500).json({ error: 'Failed to start batch estimation' });
  }
});

/**
 * Get batch job progress
 * GET /api/estimates/batch/:jobId
 */
app.get('/api/estimates/batch/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = batchJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Batch job not found' });
    }

    // Only allow access to own jobs
    if (job.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(job);

  } catch (error) {
    console.error('Error fetching batch job:', error);
    res.status(500).json({ error: 'Failed to fetch batch job status' });
  }
});

/**
 * Process batch estimation asynchronously
 */
async function processBatchEstimation(jobId, items, userId, projectId) {
  const job = batchJobs.get(jobId);
  if (!job) return;

  const { checkRateLimit } = require('./middleware/ai-rate-limiter');

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    job.currentItem = `${item.type} #${item.id}`;

    try {
      // Check rate limit before each estimation
      const rateLimit = await checkRateLimit(pool, userId, projectId, 'effort_estimation');
      
      if (!rateLimit.allowed) {
        job.results.push({
          itemId: item.id,
          itemType: item.type,
          success: false,
          error: 'Rate limit exceeded',
          title: item.title || `${item.type} #${item.id}`
        });
        job.failed++;
        job.completed++;
        continue;
      }

      // Fetch item details
      const tableName = item.type === 'issue' ? 'issues' : 'action_items';
      const itemResult = await pool.query(
        `SELECT id, title, description, ai_estimate_version FROM ${tableName} WHERE id = $1`,
        [item.id]
      );

      if (itemResult.rows.length === 0) {
        job.results.push({
          itemId: item.id,
          itemType: item.type,
          success: false,
          error: 'Item not found',
          title: `${item.type} #${item.id}`
        });
        job.failed++;
        job.completed++;
        continue;
      }

      const itemData = itemResult.rows[0];

      // Generate estimate using AI
      const estimate = await generateEffortEstimate({
        title: itemData.title,
        description: itemData.description,
        itemType: item.type,
        model: 'gpt-4o',
        userId: userId,
        projectId: projectId
      });

      if (!estimate.success) {
        job.results.push({
          itemId: item.id,
          itemType: item.type,
          success: false,
          error: estimate.message || estimate.error,
          title: itemData.title
        });
        job.failed++;
        job.completed++;
        continue;
      }

      // Increment version
      const newVersion = (itemData.ai_estimate_version || 0) + 1;

      // Use transaction to ensure atomicity
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Update item with estimate
        await client.query(
          `UPDATE ${tableName} 
           SET ai_effort_estimate_hours = $1,
               ai_estimate_confidence = $2,
               ai_estimate_version = $3,
               ai_estimate_last_updated = NOW()
           WHERE id = $4`,
          [estimate.totalHours, estimate.confidence, newVersion, item.id]
        );

        // Save to history (normalize item type to match database constraint)
        const normalizedItemType = item.type === 'issue' ? 'issue' : 'action-item';
        await client.query(
          `INSERT INTO effort_estimate_history 
           (item_type, item_id, estimate_hours, version, confidence, breakdown, reasoning, source, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            normalizedItemType,
            item.id,
            estimate.totalHours,
            newVersion,
            estimate.confidence,
            JSON.stringify({
              tasks: estimate.breakdown,
              assumptions: estimate.assumptions,
              risks: estimate.risks
            }),
            estimate.confidenceReasoning,
            'manual_regenerate',
            userId
          ]
        );

        // Track AI usage
        await client.query(
          `INSERT INTO ai_usage_tracking 
           (user_id, project_id, feature, operation_type, tokens_used, cost_usd)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            userId,
            projectId,
            'effort_estimation',
            'batch_generate',
            estimate.metadata.totalTokens.total,
            estimate.metadata.totalCost
          ]
        );

        await client.query('COMMIT');
      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }

      job.results.push({
        itemId: item.id,
        itemType: item.type,
        success: true,
        title: itemData.title,
        hours: estimate.totalHours,
        confidence: estimate.confidence,
        taskCount: estimate.breakdown.length
      });
      job.successful++;

    } catch (error) {
      console.error(`Error estimating ${item.type} ${item.id}:`, error);
      job.results.push({
        itemId: item.id,
        itemType: item.type,
        success: false,
        error: error.message,
        title: item.title || `${item.type} #${item.id}`
      });
      job.failed++;
    }

    job.completed++;
  }

  job.status = 'completed';
  job.completedAt = new Date();
  job.currentItem = null;

  console.log(`Batch job ${jobId} completed: ${job.successful} successful, ${job.failed} failed`);
}

// Get all valid usernames for dropdown (includes users AND all assignee names)
app.get('/api/admin/valid-usernames', authenticateToken, async (req, res) => {
  try {
    // Check admin permission
    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
    if (userRoleLevel < ROLE_HIERARCHY['System Administrator']) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get all users plus all unique assignee names from issues and action items
    const result = await pool.query(`
      WITH all_names AS (
        SELECT username as name, email, role FROM users
        UNION
        SELECT DISTINCT TRIM(assignee) as name, NULL as email, NULL as role 
        FROM issues 
        WHERE assignee IS NOT NULL AND assignee <> ''
        UNION
        SELECT DISTINCT TRIM(assignee) as name, NULL as email, NULL as role 
        FROM action_items 
        WHERE assignee IS NOT NULL AND assignee <> ''
      )
      SELECT DISTINCT 
        name as username, 
        email, 
        role,
        CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END as is_user
      FROM all_names
      WHERE name IS NOT NULL AND name <> ''
      ORDER BY is_user DESC, name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching valid usernames:', error);
    res.status(500).json({ error: 'Failed to fetch usernames' });
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
  
  // Initialize daily notification jobs
  initializeDailyJobs();
});
