const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { storage } = require("./server/storage");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy setting for Replit environment (more secure configuration)
app.set('trust proxy', 1);

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

// Database storage replaces in-memory arrays
// Using storage layer for persistent data

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
app.get("/api/projects", async (req, res) => {
  try {
    const allProjects = await storage.getProjects();
    res.json(allProjects);
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const { name, description, template } = req.body;
    const newProject = await storage.createProject({
      name,
      description,
      template: template || "generic",
      createdBy: "Demo User"
    });
    
    // Add derived fields for compatibility
    newProject.status = "active";
    newProject.categories = getDefaultCategories(template);
    newProject.phases = getDefaultPhases(template);
    newProject.components = getDefaultComponents(template);
    
    res.status(201).json(newProject);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Issues API
app.get('/api/issues', async (req, res) => {
  try {
    const { projectId, status, priority, assignee, category } = req.query;
    
    // Get issues from database (filtered by projectId if provided)
    let filteredIssues = await storage.getIssues(projectId ? parseInt(projectId) : undefined);
    
    // Apply additional filters
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
  } catch (error) {
    console.error('Error getting issues:', error);
    res.status(500).json({ error: 'Failed to get issues' });
  }
});

app.post('/api/issues', async (req, res) => {
  try {
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
    
    const newIssue = await storage.createIssue({
      title: title.trim(),
      description: description?.trim() || '',
      priority: priority || 'medium',
      category: category || 'Technical',
      phase: phase || 'Assessment',
      component: component || 'Application',
      assignee: assignee || '',
      dueDate: dueDate ? new Date(dueDate) : null,
      projectId: parseInt(projectId),
      type,
      status: 'To Do',
      createdBy: 'Demo User'
    });
    
    res.status(201).json(newIssue);
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ error: 'Failed to create issue' });
  }
});

// Action Items API
app.get('/api/action-items', async (req, res) => {
  try {
    const { projectId, status, assignee, isDeliverable } = req.query;
    
    // Get action items from database (filtered by projectId if provided)
    let filtered = await storage.getActionItems(projectId ? parseInt(projectId) : undefined);
    
    // Apply additional filters
    if (status) {
      filtered = filtered.filter(item => item.status === status);
    }
    
    if (assignee) {
      filtered = filtered.filter(item => item.assignee === assignee);
    }
    
    if (isDeliverable === 'true') {
      filtered = filtered.filter(item => item.isDeliverable === true);
    }
    
    res.json(filtered);
  } catch (error) {
    console.error('Error getting action items:', error);
    res.status(500).json({ error: 'Failed to get action items' });
  }
});

app.post('/api/action-items', async (req, res) => {
  try {
    const { 
      title, 
      description, 
      priority, 
      category, 
      phase, 
      component, 
      assignee, 
      dueDate, 
      progress = 0,
      milestone,
      isDeliverable = false,
      projectId
    } = req.body;
    
    // Validation
    if (!title || !projectId) {
      return res.status(400).json({ 
        error: 'Title and Project ID are required' 
      });
    }
    
    // Validate progress
    const validProgress = Math.max(0, Math.min(100, parseInt(progress) || 0));
    
    const newActionItem = await storage.createActionItem({
      title: title.trim(),
      description: description?.trim() || '',
      priority: priority || 'medium',
      assignee: assignee || '',
      dueDate: dueDate ? new Date(dueDate) : null,
      progress: validProgress,
      milestone: milestone?.trim() || '',
      isDeliverable: Boolean(isDeliverable),
      projectId: parseInt(projectId),
      type: 'action-item',
      status: validProgress === 100 ? 'Done' : (validProgress > 0 ? 'In Progress' : 'To Do'),
      createdBy: 'Demo User'
    });
    
    res.status(201).json(newActionItem);
  } catch (error) {
    console.error('Error creating action item:', error);
    res.status(500).json({ error: 'Failed to create action item' });
  }
});

// Update action item progress
// Update issue status
app.patch('/api/issues/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log(`[PATCH /api/issues/${id}] Request received:`, { id, status, body: req.body });
    
    const issue = await storage.getIssue(parseInt(id));
    
    if (!issue) {
      console.log(`[PATCH /api/issues/${id}] Issue not found`);
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    console.log(`[PATCH /api/issues/${id}] Found issue:`, { title: issue.title, currentStatus: issue.status });
    
    // Validate status
    const validStatuses = ['To Do', 'In Progress', 'Blocked', 'Done'];
    if (status && !validStatuses.includes(status)) {
      console.log(`[PATCH /api/issues/${id}] Invalid status:`, status);
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Update status
    if (status) {
      const updatedIssue = await storage.updateIssue(parseInt(id), { status });
      console.log(`[PATCH /api/issues/${id}] Updated issue status to:`, status);
      res.json(updatedIssue);
    } else {
      res.json(issue);
    }
  } catch (error) {
    console.error(`[PATCH /api/issues/${req.params.id}] Error:`, error);
    res.status(500).json({ error: 'Failed to update issue' });
  }
});

// Update action item status
app.patch('/api/action-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, progress } = req.body;
    
    console.log(`[PATCH /api/action-items/${id}] Request received:`, { id, status, progress, body: req.body });
    
    const actionItem = await storage.getActionItem(parseInt(id));
    
    if (!actionItem) {
      console.log(`[PATCH /api/action-items/${id}] Action item not found`);
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    console.log(`[PATCH /api/action-items/${id}] Found action item:`, { title: actionItem.title, currentStatus: actionItem.status, currentProgress: actionItem.progress });
    
    // Prepare updates
    const updates = {};
    
    // Validate and update status
    const validStatuses = ['To Do', 'In Progress', 'Blocked', 'Done'];
    if (status && !validStatuses.includes(status)) {
      console.log(`[PATCH /api/action-items/${id}] Invalid status:`, status);
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    if (status) {
      updates.status = status;
      console.log(`[PATCH /api/action-items/${id}] Updated status to:`, status);
      
      // Auto-update progress based on status
      if (status === 'Done' && actionItem.progress < 100) {
        updates.progress = 100;
        console.log(`[PATCH /api/action-items/${id}] Auto-updated progress to 100% (Done status)`);
      } else if (status === 'To Do' && actionItem.progress > 0) {
        updates.progress = 0;
        console.log(`[PATCH /api/action-items/${id}] Auto-updated progress to 0% (To Do status)`);
      }
    }
    
    // Update progress if provided
    if (progress !== undefined) {
      const validProgress = Math.max(0, Math.min(100, parseInt(progress) || 0));
      updates.progress = validProgress;
      console.log(`[PATCH /api/action-items/${id}] Updated progress to:`, validProgress);
      
      // Auto-update status based on progress
      if (validProgress === 100) {
        updates.status = 'Done';
      } else if (validProgress > 0) {
        updates.status = 'In Progress';
      } else {
        updates.status = 'To Do';
      }
    }
    
    // Save to database
    const updatedActionItem = await storage.updateActionItem(parseInt(id), updates);
    console.log(`[PATCH /api/action-items/${id}] Final result:`, { status: updatedActionItem.status, progress: updatedActionItem.progress });
    
    res.json(updatedActionItem);
  } catch (error) {
    console.error(`[PATCH /api/action-items/${req.params.id}] Error:`, error);
    res.status(500).json({ error: 'Failed to update action item' });
  }
});

app.patch('/api/action-items/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    const { progress } = req.body;
    
    const actionItem = await storage.getActionItem(parseInt(id));
    
    if (!actionItem) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    
    // Validate and update progress
    const validProgress = Math.max(0, Math.min(100, parseInt(progress) || 0));
    
    // Prepare updates
    const updates = { progress: validProgress };
    
    // Auto-update status based on progress
    if (validProgress === 100) {
      updates.status = 'Done';
    } else if (validProgress > 0) {
      updates.status = 'In Progress';
    } else {
      updates.status = 'To Do';
    }
    
    const updatedActionItem = await storage.updateActionItem(parseInt(id), updates);
    res.json(updatedActionItem);
  } catch (error) {
    console.error(`[PATCH /api/action-items/${req.params.id}/progress] Error:`, error);
    res.status(500).json({ error: 'Failed to update action item progress' });
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
  console.log(`   GET  /api/projects`);
  console.log(`   POST /api/projects`);
  console.log(`   GET  /api/issues`);
  console.log(`   POST /api/issues`);
  console.log(`   PATCH /api/issues/:id`);
  console.log(`   GET  /api/action-items`);
  console.log(`   POST /api/action-items`);
  console.log(`   PATCH /api/action-items/:id`);
  console.log(`   PATCH /api/action-items/:id/progress`);
  console.log(`   GET  /api/users`);
});
