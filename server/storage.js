const { db } = require("./db");
const { projects, issues, actionItems, users } = require("../shared/schema");
const { eq, desc } = require("drizzle-orm");

class DatabaseStorage {
  // Users
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Projects
  async getProjects() {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async createProject(insertProject) {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  // Issues
  async getIssues(projectId) {
    if (projectId) {
      return await db.select().from(issues).where(eq(issues.projectId, projectId)).orderBy(desc(issues.createdAt));
    }
    return await db.select().from(issues).orderBy(desc(issues.createdAt));
  }

  async getIssue(id) {
    const [issue] = await db.select().from(issues).where(eq(issues.id, id));
    return issue || undefined;
  }

  async createIssue(insertIssue) {
    const [issue] = await db.insert(issues).values({
      ...insertIssue,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return issue;
  }

  async updateIssue(id, updates) {
    const [issue] = await db.update(issues)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(issues.id, id))
      .returning();
    return issue || undefined;
  }

  // Action Items
  async getActionItems(projectId) {
    if (projectId) {
      return await db.select().from(actionItems).where(eq(actionItems.projectId, projectId)).orderBy(desc(actionItems.createdAt));
    }
    return await db.select().from(actionItems).orderBy(desc(actionItems.createdAt));
  }

  async getActionItem(id) {
    const [actionItem] = await db.select().from(actionItems).where(eq(actionItems.id, id));
    return actionItem || undefined;
  }

  async createActionItem(insertActionItem) {
    const [actionItem] = await db.insert(actionItems).values({
      ...insertActionItem,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return actionItem;
  }

  async updateActionItem(id, updates) {
    const [actionItem] = await db.update(actionItems)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(actionItems.id, id))
      .returning();
    return actionItem || undefined;
  }
}

const storage = new DatabaseStorage();

module.exports = { storage, DatabaseStorage };