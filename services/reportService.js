const PDFDocument = require('pdfkit');
const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fs = require('fs');
const path = require('path');

class ReportService {
  
  async generateExecutiveSummary(projectId, dateRange) {
    const stats = await this.getProjectStats(projectId, dateRange);
    const trends = await this.getProjectTrends(projectId, dateRange);
    const team = await this.getTeamMetrics(projectId, dateRange);
    
    return await this.createPDF('Executive Summary', projectId, (doc) => {
      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Executive Summary', 50, 50);
      doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, 50, 80);
      doc.moveDown(2);
      
      // Project Completion
      doc.fontSize(16).font('Helvetica-Bold').text('Project Completion', 50, 120);
      doc.fontSize(36).fillColor('#2563eb').text(`${stats.completionRate}%`, 50, 145);
      doc.fontSize(12).fillColor('#000000').text(`${stats.completedItems} of ${stats.totalItems} items completed`, 50, 190);
      doc.moveDown(2);
      
      // Status Breakdown
      doc.fontSize(16).font('Helvetica-Bold').text('Status Breakdown', 50, 230);
      doc.fontSize(12).font('Helvetica');
      doc.text(`To Do: ${stats.todoCount}`, 50, 260);
      doc.text(`In Progress: ${stats.inProgressCount}`, 200, 260);
      doc.text(`Done: ${stats.doneCount}`, 350, 260);
      doc.moveDown(2);
      
      // Issues & Action Items
      doc.fontSize(16).font('Helvetica-Bold').text('Items Overview', 50, 310);
      doc.fontSize(12).font('Helvetica');
      doc.text(`Total Issues: ${stats.totalIssues}`, 50, 340);
      doc.text(`Total Action Items: ${stats.totalActionItems}`, 200, 340);
      doc.text(`Total Comments: ${stats.totalComments}`, 350, 340);
      doc.moveDown(2);
      
      // Priority Distribution
      doc.fontSize(16).font('Helvetica-Bold').text('Priority Distribution', 50, 390);
      doc.fontSize(12).font('Helvetica');
      doc.text(`Critical: ${stats.criticalCount}`, 50, 420);
      doc.text(`High: ${stats.highCount}`, 150, 420);
      doc.text(`Medium: ${stats.mediumCount}`, 250, 420);
      doc.text(`Low: ${stats.lowCount}`, 350, 420);
      doc.moveDown(2);
      
      // Team Performance
      doc.fontSize(16).font('Helvetica-Bold').text('Team Performance', 50, 470);
      doc.fontSize(12).font('Helvetica');
      doc.text(`Team Members: ${team.memberCount}`, 50, 500);
      doc.text(`Active Contributors: ${team.activeContributors}`, 200, 500);
      doc.text(`Avg Completion Rate: ${team.avgCompletionRate}%`, 350, 500);
    });
  }

  async generateDetailedReport(projectId, dateRange) {
    const stats = await this.getProjectStats(projectId, dateRange);
    const recentIssues = await this.getRecentIssues(projectId, dateRange, 10);
    const recentActions = await this.getRecentActionItems(projectId, dateRange, 10);
    
    return await this.createPDF('Detailed Project Report', projectId, (doc) => {
      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Detailed Project Report', 50, 50);
      const dateRangeText = dateRange && dateRange.start && dateRange.end 
        ? `Date Range: ${dateRange.start} to ${dateRange.end}`
        : 'Date Range: All Time';
      doc.fontSize(12).font('Helvetica').text(dateRangeText, 50, 80);
      doc.moveDown(2);
      
      // Summary Stats
      doc.fontSize(16).font('Helvetica-Bold').text('Project Summary', 50, 120);
      doc.fontSize(12).font('Helvetica');
      doc.text(`Total Items: ${stats.totalItems}`, 50, 150);
      doc.text(`Completion Rate: ${stats.completionRate}%`, 200, 150);
      doc.text(`Issues: ${stats.totalIssues}`, 350, 150);
      doc.text(`Action Items: ${stats.totalActionItems}`, 450, 150);
      doc.moveDown(3);
      
      // Recent Issues
      let yPos = 210;
      doc.fontSize(16).font('Helvetica-Bold').text('Recent Issues', 50, yPos);
      yPos += 30;
      
      recentIssues.forEach((issue, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
        doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${issue.title}`, 50, yPos);
        yPos += 15;
        doc.fontSize(9).font('Helvetica').text(`Status: ${issue.status} | Priority: ${issue.priority}`, 60, yPos);
        yPos += 25;
      });
      
      // Recent Action Items
      if (yPos > 600) {
        doc.addPage();
        yPos = 50;
      } else {
        yPos += 20;
      }
      
      doc.fontSize(16).font('Helvetica-Bold').text('Recent Action Items', 50, yPos);
      yPos += 30;
      
      recentActions.forEach((action, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
        doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${action.title}`, 50, yPos);
        yPos += 15;
        doc.fontSize(9).font('Helvetica').text(`Status: ${action.status} | Priority: ${action.priority}`, 60, yPos);
        yPos += 25;
      });
    });
  }

  async generateTeamPerformanceReport(projectId, dateRange) {
    const team = await this.getTeamMetrics(projectId, dateRange);
    const memberDetails = await this.getMemberDetails(projectId, dateRange);
    
    return await this.createPDF('Team Performance Report', projectId, (doc) => {
      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('Team Performance Report', 50, 50);
      doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, 50, 80);
      doc.moveDown(2);
      
      // Team Overview
      doc.fontSize(16).font('Helvetica-Bold').text('Team Overview', 50, 120);
      doc.fontSize(12).font('Helvetica');
      doc.text(`Total Members: ${team.memberCount}`, 50, 150);
      doc.text(`Active Contributors: ${team.activeContributors}`, 200, 150);
      doc.text(`Avg Completion Rate: ${team.avgCompletionRate}%`, 350, 150);
      doc.moveDown(3);
      
      // Member Details
      let yPos = 210;
      doc.fontSize(16).font('Helvetica-Bold').text('Member Performance', 50, yPos);
      yPos += 30;
      
      memberDetails.forEach((member, index) => {
        if (yPos > 680) {
          doc.addPage();
          yPos = 50;
        }
        
        doc.fontSize(12).font('Helvetica-Bold').text(member.username, 50, yPos);
        yPos += 15;
        doc.fontSize(10).font('Helvetica');
        doc.text(`Assigned: ${member.assignedCount}`, 60, yPos);
        doc.text(`Completed: ${member.completedCount}`, 200, yPos);
        doc.text(`In Progress: ${member.inProgressCount}`, 340, yPos);
        yPos += 15;
        doc.text(`Completion Rate: ${member.completionRate}%`, 60, yPos);
        yPos += 30;
      });
    });
  }

  // Helper method to create PDF document
  async createPDF(title, projectId, contentCallback) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Apply content callback
      contentCallback(doc);
      
      // Footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(9).font('Helvetica')
           .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 50, { align: 'center' });
      }
      
      doc.end();
    });
  }

  // Data fetching methods
  async getProjectStats(projectId, dateRange) {
    const issuesQuery = dateRange ? 
      `SELECT * FROM issues WHERE project_id = $1 AND created_at BETWEEN $2 AND $3` :
      `SELECT * FROM issues WHERE project_id = $1`;
    
    const actionItemsQuery = dateRange ?
      `SELECT * FROM action_items WHERE project_id = $1 AND created_at BETWEEN $2 AND $3` :
      `SELECT * FROM action_items WHERE project_id = $1`;
    
    const params = dateRange ? [projectId, dateRange.start, dateRange.end] : [projectId];
    
    const [issuesResult, actionItemsResult] = await Promise.all([
      pool.query(issuesQuery, params),
      pool.query(actionItemsQuery, params)
    ]);
    
    const issues = issuesResult.rows;
    const actionItems = actionItemsResult.rows;
    const allItems = [...issues, ...actionItems];
    
    const totalItems = allItems.length;
    const completedItems = allItems.filter(item => item.status === 'Done').length;
    const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    
    const todoCount = allItems.filter(item => item.status === 'To Do').length;
    const inProgressCount = allItems.filter(item => item.status === 'In Progress').length;
    const doneCount = completedItems;
    
    const criticalCount = allItems.filter(item => item.priority === 'critical').length;
    const highCount = allItems.filter(item => item.priority === 'high').length;
    const mediumCount = allItems.filter(item => item.priority === 'medium').length;
    const lowCount = allItems.filter(item => item.priority === 'low').length;
    
    // Get comment count
    const commentsResult = await pool.query(
      `SELECT COUNT(*) as count FROM (
        SELECT id FROM issue_comments WHERE issue_id IN (SELECT id FROM issues WHERE project_id = $1)
        UNION ALL
        SELECT id FROM action_item_comments WHERE action_item_id IN (SELECT id FROM action_items WHERE project_id = $1)
      ) as all_comments`,
      [projectId]
    );
    
    return {
      totalItems,
      completedItems,
      completionRate,
      totalIssues: issues.length,
      totalActionItems: actionItems.length,
      todoCount,
      inProgressCount,
      doneCount,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      totalComments: parseInt(commentsResult.rows[0].count)
    };
  }

  async getProjectTrends(projectId, dateRange) {
    // Simplified trend data
    return {
      weeklyCompletion: 0,
      velocityTrend: 'stable'
    };
  }

  async getTeamMetrics(projectId, dateRange) {
    const teamResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM project_members WHERE project_id = $1 AND status = 'active'`,
      [projectId]
    );
    
    const memberDetails = await this.getMemberDetails(projectId, dateRange);
    const activeContributors = memberDetails.filter(m => m.assignedCount > 0).length;
    const totalCompletionRate = memberDetails.reduce((sum, m) => sum + m.completionRate, 0);
    const avgCompletionRate = memberDetails.length > 0 ? Math.round(totalCompletionRate / memberDetails.length) : 0;
    
    return {
      memberCount: parseInt(teamResult.rows[0].count),
      activeContributors,
      avgCompletionRate
    };
  }

  async getMemberDetails(projectId, dateRange) {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        COUNT(CASE WHEN i.assignee = u.username THEN 1 END) as issue_assigned,
        COUNT(CASE WHEN i.assignee = u.username AND i.status = 'Done' THEN 1 END) as issue_completed,
        COUNT(CASE WHEN i.assignee = u.username AND i.status = 'In Progress' THEN 1 END) as issue_in_progress,
        COUNT(CASE WHEN ai.assignee = u.username THEN 1 END) as action_assigned,
        COUNT(CASE WHEN ai.assignee = u.username AND ai.status = 'Done' THEN 1 END) as action_completed,
        COUNT(CASE WHEN ai.assignee = u.username AND ai.status = 'In Progress' THEN 1 END) as action_in_progress
      FROM users u
      INNER JOIN project_members pm ON u.id = pm.user_id
      LEFT JOIN issues i ON i.project_id = pm.project_id
      LEFT JOIN action_items ai ON ai.project_id = pm.project_id
      WHERE pm.project_id = $1 AND pm.status = 'active'
      GROUP BY u.id, u.username
      ORDER BY u.username
    `, [projectId]);
    
    return result.rows.map(row => {
      const assignedCount = parseInt(row.issue_assigned) + parseInt(row.action_assigned);
      const completedCount = parseInt(row.issue_completed) + parseInt(row.action_completed);
      const inProgressCount = parseInt(row.issue_in_progress) + parseInt(row.action_in_progress);
      const completionRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;
      
      return {
        username: row.username,
        assignedCount,
        completedCount,
        inProgressCount,
        completionRate
      };
    });
  }

  async getRecentIssues(projectId, dateRange, limit = 10) {
    const query = dateRange ?
      `SELECT * FROM issues WHERE project_id = $1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC LIMIT $4` :
      `SELECT * FROM issues WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`;
    
    const params = dateRange ? [projectId, dateRange.start, dateRange.end, limit] : [projectId, limit];
    const result = await pool.query(query, params);
    return result.rows;
  }

  async getRecentActionItems(projectId, dateRange, limit = 10) {
    const query = dateRange ?
      `SELECT * FROM action_items WHERE project_id = $1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC LIMIT $4` :
      `SELECT * FROM action_items WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`;
    
    const params = dateRange ? [projectId, dateRange.start, dateRange.end, limit] : [projectId, limit];
    const result = await pool.query(query, params);
    return result.rows;
  }
}

module.exports = new ReportService();
