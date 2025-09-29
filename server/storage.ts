import { db } from "./db";
import { projects, issues, actionItems, users, type Project, type Issue, type ActionItem, type User, type InsertProject, type InsertIssue, type InsertActionItem, type InsertUser } from "../shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  
  // Projects
  getProjects(): Promise<Project[]>;
  createProject(insertProject: InsertProject): Promise<Project>;
  
  // Issues
  getIssues(projectId?: number): Promise<Issue[]>;
  getIssue(id: number): Promise<Issue | undefined>;
  createIssue(insertIssue: InsertIssue): Promise<Issue>;
  updateIssue(id: number, updates: Partial<Issue>): Promise<Issue | undefined>;
  
  // Action Items
  getActionItems(projectId?: number): Promise<ActionItem[]>;
  getActionItem(id: number): Promise<ActionItem | undefined>;
  createActionItem(insertActionItem: InsertActionItem): Promise<ActionItem>;
  updateActionItem(id: number, updates: Partial<ActionItem>): Promise<ActionItem | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  // Issues
  async getIssues(projectId?: number): Promise<Issue[]> {
    if (projectId) {
      return await db.select().from(issues).where(eq(issues.projectId, projectId)).orderBy(desc(issues.createdAt));
    }
    return await db.select().from(issues).orderBy(desc(issues.createdAt));
  }

  async getIssue(id: number): Promise<Issue | undefined> {
    const [issue] = await db.select().from(issues).where(eq(issues.id, id));
    return issue || undefined;
  }

  async createIssue(insertIssue: InsertIssue): Promise<Issue> {
    const [issue] = await db.insert(issues).values({
      ...insertIssue,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return issue;
  }

  async updateIssue(id: number, updates: Partial<Issue>): Promise<Issue | undefined> {
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
  async getActionItems(projectId?: number): Promise<ActionItem[]> {
    if (projectId) {
      return await db.select().from(actionItems).where(eq(actionItems.projectId, projectId)).orderBy(desc(actionItems.createdAt));
    }
    return await db.select().from(actionItems).orderBy(desc(actionItems.createdAt));
  }

  async getActionItem(id: number): Promise<ActionItem | undefined> {
    const [actionItem] = await db.select().from(actionItems).where(eq(actionItems.id, id));
    return actionItem || undefined;
  }

  async createActionItem(insertActionItem: InsertActionItem): Promise<ActionItem> {
    const [actionItem] = await db.insert(actionItems).values({
      ...insertActionItem,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return actionItem;
  }

  async updateActionItem(id: number, updates: Partial<ActionItem>): Promise<ActionItem | undefined> {
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

export const storage = new DatabaseStorage();