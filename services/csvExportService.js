const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fs = require('fs');

class CSVExportService {
  
  addMetadataHeader(filepath, exportType, projectId, recordCount) {
    const timestamp = new Date().toISOString();
    const metadata = [
      '# Multi-Project Tracker - Data Export',
      `# Export Type: ${exportType}`,
      `# Project ID: ${projectId}`,
      `# Generated: ${timestamp}`,
      `# Total Records: ${recordCount}`,
      `# Format: CSV (Comma-Separated Values)`,
      `# Encoding: UTF-8`,
      `# Application: Multi-Project Tracker v1.0`,
      `# Copyright: © ${new Date().getFullYear()} Multi-Project Tracker. All rights reserved.`,
      '# CONFIDENTIAL: This file contains proprietary project data.',
      '# This export is intended for authorized personnel only.',
      '# Do not distribute without proper authorization.',
      '#',
      `# Export Details:`,
      `# - Source: Multi-Project Tracker Database`,
      `# - Timestamp: ${new Date().toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' })}`,
      `# - User Agent: Multi-Project Tracker Export Service`,
      `# - File Format Version: 1.0`,
      '#',
      '# Instructions for Use:',
      '# 1. Open this file in Microsoft Excel, Google Sheets, or compatible spreadsheet software',
      '# 2. Verify all data is properly formatted and complete',
      '# 3. Use filtering and sorting features to analyze the data',
      '# 4. For support, contact your system administrator',
      '#',
      '# Data Integrity Notice:',
      '# This file has been automatically generated from the source database.',
      '# All timestamps are in UTC format.',
      '# Empty fields are represented as blank cells.',
      '#',
      '# ================================================================================',
      '#',
      ''
    ].join('\n');
    
    const existingContent = fs.readFileSync(filepath, 'utf8');
    const enhancedContent = '\ufeff' + metadata + existingContent;
    fs.writeFileSync(filepath, enhancedContent, 'utf8');
  }
  
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
    
    const filename = `issues-export-${projectId}-${Date.now()}.csv`;
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
    this.addMetadataHeader(filepath, 'Issues Export', projectId, result.rows.length);
    
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
    
    const filename = `actions-export-${projectId}-${Date.now()}.csv`;
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
    this.addMetadataHeader(filepath, 'Action Items Export', projectId, result.rows.length);
    
    return { filename, filepath };
  }

  async exportFullProject(projectId) {
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
    
    const combinedData = [
      ...issuesQuery.rows,
      ...actionItemsQuery.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    const filename = `full-export-${projectId}-${Date.now()}.csv`;
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
    this.addMetadataHeader(filepath, 'Full Project Export', projectId, combinedData.length);
    
    return { filename, filepath };
  }
}

module.exports = new CSVExportService();
