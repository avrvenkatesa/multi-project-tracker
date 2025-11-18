#!/usr/bin/env node
/**
 * Create Test Project with Hierarchical Tasks
 * Story 4.6 - Testing script for hierarchical Gantt chart
 */

const fs = require('fs');
const path = require('path');

// Document content
const epic1Content = `# User Authentication Module

## Overview
Complete user authentication system with OAuth2 and JWT support.

## Tasks

### 1. Design Authentication Flow
- Duration: 5 days
- Priority: High
- Assignee: Sarah Chen
- Description: Design the complete authentication flow including login, signup, and password reset
- Dependencies: None

### 2. Backend API Development
- Duration: 10 days
- Priority: High
- Assignee: Mike Johnson
- Description: Implement RESTful API endpoints for authentication
- Dependencies: Design Authentication Flow

#### 2.1 User Model Implementation
- Duration: 3 days
- Priority: High
- Assignee: Mike Johnson
- Description: Create database schema and user model with password hashing

#### 2.2 JWT Token Service
- Duration: 4 days
- Priority: High
- Assignee: Mike Johnson
- Description: Implement JWT generation, validation, and refresh logic

#### 2.3 API Route Configuration
- Duration: 3 days
- Priority: Medium
- Assignee: Mike Johnson
- Description: Set up Express routes for auth endpoints

### 3. Frontend UI Components
- Duration: 8 days
- Priority: Medium
- Assignee: Emily Rodriguez
- Description: Build login, signup, and profile pages
- Dependencies: Backend API Development

### 4. Integration Testing
- Duration: 7 days
- Priority: High
- Assignee: David Park
- Description: E2E testing of authentication flows
- Dependencies: Frontend UI Components`;

const epic2Content = `# Database Migration Project

## Overview
Migrate legacy database to new schema with zero downtime.

## Tasks

### 1. Schema Design
- Duration: 4 days
- Priority: High
- Assignee: Sarah Chen
- Description: Design new database schema with proper indexes and relationships
- Dependencies: None

### 2. Migration Script Development
- Duration: 8 days
- Priority: High
- Assignee: Mike Johnson
- Description: Write migration scripts with rollback capability
- Dependencies: Schema Design

#### 2.1 Data Extraction Scripts
- Duration: 3 days
- Priority: High
- Assignee: Mike Johnson
- Description: Extract data from legacy tables

#### 2.2 Transformation Logic
- Duration: 3 days
- Priority: High
- Assignee: Mike Johnson
- Description: Transform data to match new schema

#### 2.3 Load and Validation
- Duration: 2 days
- Priority: Medium
- Assignee: Mike Johnson
- Description: Load transformed data and validate integrity

### 3. Data Validation & Testing
- Duration: 8 days
- Priority: High
- Assignee: David Park
- Description: Comprehensive validation of migrated data
- Dependencies: Migration Script Development`;

const standaloneContent = `# Standalone Tasks

## Code Review & Documentation
- Duration: 4 days
- Priority: Medium
- Assignee: Emily Rodriguez
- Description: Review all authentication and migration code, update documentation
- Dependencies: Integration Testing, Data Validation & Testing

## Performance Optimization
- Duration: 5 days
- Priority: Low
- Assignee: David Park
- Description: Optimize database queries and API response times
- Dependencies: Code Review & Documentation`;

async function createTestProject() {
  const baseURL = process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 'http://localhost:5000';
  
  console.log('🚀 Creating Test Project with Hierarchical Tasks\n');
  console.log(`Base URL: ${baseURL}\n`);
  
  try {
    // Step 1: Create project
    console.log('📋 Step 1: Creating new project...');
    const projectResponse = await fetch(`${baseURL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': process.env.AUTH_COOKIE || ''
      },
      credentials: 'include',
      body: JSON.stringify({
        name: 'Test Project - Hierarchical Gantt',
        description: 'Test project for Story 4.6 with hierarchical tasks',
        status: 'Active'
      })
    });
    
    if (!projectResponse.ok) {
      const error = await projectResponse.text();
      throw new Error(`Failed to create project: ${projectResponse.status} - ${error}`);
    }
    
    const project = await projectResponse.json();
    const projectId = project.id;
    console.log(`✅ Project created: ID ${projectId} - "${project.name}"\n`);
    
    // Step 2: Analyze documents with multi-document analyzer
    console.log('🤖 Step 2: Analyzing documents with AI hierarchy extraction...');
    const analyzeResponse = await fetch(`${baseURL}/api/projects/${projectId}/analyze-documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': process.env.AUTH_COOKIE || ''
      },
      credentials: 'include',
      body: JSON.stringify({
        documents: [
          { text: epic1Content, name: 'epic1-user-authentication.md' },
          { text: epic2Content, name: 'epic2-database-migration.md' },
          { text: standaloneContent, name: 'standalone-tasks.md' }
        ],
        options: {
          includeEffort: true,
          projectContext: 'Test project for hierarchical Gantt chart validation'
        }
      })
    });
    
    if (!analyzeResponse.ok) {
      const error = await analyzeResponse.text();
      throw new Error(`Failed to analyze documents: ${analyzeResponse.status} - ${error}`);
    }
    
    const analysisResult = await analyzeResponse.json();
    console.log(`✅ Documents analyzed successfully!`);
    console.log(`   - Issues created: ${analysisResult.issues?.length || 0}`);
    console.log(`   - AI cost: $${analysisResult.aiCost?.toFixed(4) || 'N/A'}\n`);
    
    // Step 3: Verify hierarchy
    console.log('🔍 Step 3: Verifying hierarchical structure...');
    const hierarchyResponse = await fetch(`${baseURL}/api/projects/${projectId}/hierarchy`, {
      method: 'GET',
      headers: {
        'Cookie': process.env.AUTH_COOKIE || ''
      },
      credentials: 'include'
    });
    
    if (!hierarchyResponse.ok) {
      throw new Error(`Failed to fetch hierarchy: ${hierarchyResponse.status}`);
    }
    
    const hierarchyData = await hierarchyResponse.json();
    
    // Analyze hierarchy
    const epics = hierarchyData.filter(item => item.is_epic && !item.parent_issue_id);
    const tasks = hierarchyData.filter(item => item.parent_issue_id && !hierarchyData.some(h => h.parent_issue_id === item.item_id));
    const subtasks = hierarchyData.filter(item => {
      if (!item.parent_issue_id) return false;
      const parent = hierarchyData.find(h => h.item_id === item.parent_issue_id);
      return parent && parent.parent_issue_id;
    });
    const standalone = hierarchyData.filter(item => !item.is_epic && !item.parent_issue_id);
    
    console.log('✅ Hierarchy verified:\n');
    console.log(`   📊 Total issues: ${hierarchyData.length}`);
    console.log(`   📁 Epics: ${epics.length}`);
    console.log(`   📋 Tasks: ${tasks.length}`);
    console.log(`   📌 Subtasks: ${subtasks.length}`);
    console.log(`   ⭐ Standalone: ${standalone.length}\n`);
    
    // Display hierarchy tree
    console.log('🌳 Hierarchy Tree:\n');
    epics.forEach(epic => {
      console.log(`📁 ${epic.title} (Epic)`);
      const epicTasks = hierarchyData.filter(t => t.parent_issue_id === epic.item_id);
      epicTasks.forEach(task => {
        console.log(`  ├─ 📋 ${task.title}`);
        const taskSubtasks = hierarchyData.filter(st => st.parent_issue_id === task.item_id);
        taskSubtasks.forEach((subtask, idx) => {
          const isLast = idx === taskSubtasks.length - 1;
          console.log(`  │  ${isLast ? '└─' : '├─'} 📌 ${subtask.title}`);
        });
      });
    });
    
    if (standalone.length > 0) {
      console.log('\n⭐ Standalone Tasks:');
      standalone.forEach(task => {
        console.log(`  ├─ 📋 ${task.title}`);
      });
    }
    
    console.log('\n✅ Test project created successfully!');
    console.log(`\n🔗 View project: ${baseURL}/dashboard.html?projectId=${projectId}`);
    console.log(`🔗 View schedules: ${baseURL}/schedules.html?projectId=${projectId}`);
    console.log(`\nProject ID: ${projectId}\n`);
    
    // Save project ID to file for easy reference
    fs.writeFileSync('.test-project-id', projectId.toString());
    console.log('💾 Project ID saved to .test-project-id\n');
    
    return projectId;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
createTestProject();
