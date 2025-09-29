const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.tailwindcss.com"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
);

app.use(cors());

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

// In-memory data store (will replace with database later)
let projects = [];
let issues = [];
let actionItems = [];
let users = [
  {
    id: 1,
    name: "Demo User",
    email: "demo@example.com",
    role: "Project Manager",
  },
];

// API Routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Multi-Project Tracker API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    features: [
      "Multi-project support",
      "Issue tracking",
      "Action item management",
      "User management",
      "AI integration ready",
    ],
  });
});

// Projects API
app.get("/api/projects", (req, res) => {
  res.json(projects);
});

app.post("/api/projects", (req, res) => {
  const { name, description, template } = req.body;
  const newProject = {
    id: Date.now(),
    name,
    description,
    template: template || "generic",
    createdAt: new Date().toISOString(),
    status: "active",
    categories: getDefaultCategories(template),
    phases: getDefaultPhases(template),
    components: getDefaultComponents(template),
  };
  projects.push(newProject);
  res.status(201).json(newProject);
});

// Issues API
app.get('/api/issues', (req, res) => {
  const { projectId, status, priority, assignee, category } = req.query;
  
  let filteredIssues = [...issues];
  
  if (projectId) {
    filteredIssues = filteredIssues.filter(issue => issue.projectId == projectId);
  }
  
  if (status) {
    filteredIssues = filteredIssues.filter(issue => issue.status === status);
  }
  
  if (priority) {
    filteredIssues = filteredIssues.filter(issue => issue.priority === priority);
  }
  
  if (assignee) {
    filteredIssues = filteredIssues.filter(issue => issue.assignee === assignee);
  }
  
  if (category) {
    filteredIssues = filteredIssues.filter(issue => issue.category === category);
  }
  
  res.json(filteredIssues);
});

app.post('/api/issues', (req, res) => {
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
  
  // Verify project exists
  const project = projects.find(p => p.id == projectId);
  if (!project) {
    return res.status(404).json({ 
      error: 'Project not found' 
    });
  }
  
  const newIssue = {
    id: Date.now(),
    title: title.trim(),
    description: description?.trim() || '',
    priority: priority || 'medium',
    category: category || 'General',
    phase: phase || project.phases[0],
    component: component || project.components[0],
    assignee: assignee || '',
    dueDate: dueDate || null,
    projectId: parseInt(projectId),
    type,
    status: 'To Do',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'Demo User' // Will be replaced with actual user when auth is implemented
  };
  
  issues.push(newIssue);
  
  res.status(201).json(newIssue);
});

// Action Items API
app.get("/api/action-items", (req, res) => {
  const { projectId } = req.query;
  const filteredItems = projectId
    ? actionItems.filter((item) => item.projectId == projectId)
    : actionItems;
  res.json(filteredItems);
});

app.post("/api/action-items", (req, res) => {
  const newItem = {
    id: Date.now(),
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "To Do",
    progress: 0,
  };
  actionItems.push(newItem);
  res.status(201).json(newItem);
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
  console.log(`   GET  /api/projects`);
  console.log(`   POST /api/projects`);
  console.log(`   GET  /api/issues`);
  console.log(`   POST /api/issues`);
  console.log(`   GET  /api/action-items`);
  console.log(`   POST /api/action-items`);
  console.log(`   GET  /api/users`);
});
