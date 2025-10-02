const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fs = require('fs');

class CSVExportService {
  
  async exportIssues(projectId) {
    const result = await pool.query(`
      SELECT 
        i.id, 
        i.title, 
        i.description, 
        i.status, 
        i.priority,
        i.category, 
        i.phase, 
        i.component,
        i.assignee,
        i.due_date, 
        i.created_at, 
        i.updated_at,
        u.username as created_by_username
      FROM issues i
      LEFT JOIN users u ON i.created_by::integer = u.id
      WHERE i.project_id = $1
      ORDER BY i.created_at DESC
    `, [projectId]);
    
    const filename = `issues-${projectId}-${Date.now()}.csv`;
    const filepath = path.join('/tmp', filename);
    
    const csvWriter = createCsvWriter({
      path: filepath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'title', title: 'Title' },
        { id: 'description', title: 'Description' },
        { id: 'status', title: 'Status' },
        { id: 'priority', title: 'Priority' },
        { id: 'category', title: 'Category' },
        { id: 'phase', title: 'Phase' },
        { id: 'component', title: 'Component' },
        { id: 'assignee', title: 'Assigned To' },
        { id: 'due_date', title: 'Due Date' },
        { id: 'created_by_username', title: 'Created By' },
        { id: 'created_at', title: 'Created At' },
        { id: 'updated_at', title: 'Updated At' }
      ]
    });
    
    await csvWriter.writeRecords(result.rows);
    return { filename, filepath };
  }

  async exportActionItems(projectId) {
    const result = await pool.query(`
      SELECT 
        ai.id, 
        ai.title, 
        ai.description, 
        ai.status, 
        ai.priority,
        ai.assignee,
        ai.due_date, 
        ai.created_at, 
        ai.updated_at,
        u.username as created_by_username
      FROM action_items ai
      LEFT JOIN users u ON ai.created_by::integer = u.id
      WHERE ai.project_id = $1
      ORDER BY ai.created_at DESC
    `, [projectId]);
    
    const filename = `action-items-${projectId}-${Date.now()}.csv`;
    const filepath = path.join('/tmp', filename);
    
    const csvWriter = createCsvWriter({
      path: filepath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'title', title: 'Title' },
        { id: 'description', title: 'Description' },
        { id: 'status', title: 'Status' },
        { id: 'priority', title: 'Priority' },
        { id: 'assignee', title: 'Assigned To' },
        { id: 'due_date', title: 'Due Date' },
        { id: 'created_by_username', title: 'Created By' },
        { id: 'created_at', title: 'Created At' },
        { id: 'updated_at', title: 'Updated At' }
      ]
    });
    
    await csvWriter.writeRecords(result.rows);
    return { filename, filepath };
  }

  async exportFullProject(projectId) {
    // Fetch both issues and action items
    const issuesQuery = await pool.query(`
      SELECT 
        i.id,
        'Issue' as type,
        i.title,
        i.description,
        i.status,
        i.priority,
        i.category,
        i.phase,
        i.component,
        i.assignee,
        i.due_date,
        i.created_at,
        i.updated_at,
        u.username as created_by_username
      FROM issues i
      LEFT JOIN users u ON i.created_by::integer = u.id
      WHERE i.project_id = $1
    `, [projectId]);
    
    const actionItemsQuery = await pool.query(`
      SELECT 
        ai.id,
        'Action Item' as type,
        ai.title,
        ai.description,
        ai.status,
        ai.priority,
        '' as category,
        '' as phase,
        '' as component,
        ai.assignee,
        ai.due_date,
        ai.created_at,
        ai.updated_at,
        u.username as created_by_username
      FROM action_items ai
      LEFT JOIN users u ON ai.created_by::integer = u.id
      WHERE ai.project_id = $1
    `, [projectId]);
    
    // Combine both datasets
    const combinedData = [
      ...issuesQuery.rows,
      ...actionItemsQuery.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    const filename = `full-project-${projectId}-${Date.now()}.csv`;
    const filepath = path.join('/tmp', filename);
    
    const csvWriter = createCsvWriter({
      path: filepath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'type', title: 'Type' },
        { id: 'title', title: 'Title' },
        { id: 'description', title: 'Description' },
        { id: 'status', title: 'Status' },
        { id: 'priority', title: 'Priority' },
        { id: 'category', title: 'Category' },
        { id: 'phase', title: 'Phase' },
        { id: 'component', title: 'Component' },
        { id: 'assignee', title: 'Assigned To' },
        { id: 'due_date', title: 'Due Date' },
        { id: 'created_by_username', title: 'Created By' },
        { id: 'created_at', title: 'Created At' },
        { id: 'updated_at', title: 'Updated At' }
      ]
    });
    
    await csvWriter.writeRecords(combinedData);
    return { filename, filepath };
  }
}

module.exports = new CSVExportService();
