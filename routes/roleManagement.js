const express = require('express');
const router = express.Router();
const { Pool } = require('@neondatabase/serverless');
const rolePermissionService = require('../services/rolePermissionService');
const { authenticateToken } = require('../middleware/auth');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/projects/:projectId/roles', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const roles = await rolePermissionService.getProjectRoles(parseInt(projectId));

    res.json({
      success: true,
      roles: roles
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to fetch roles', details: error.message });
  }
});

router.get('/projects/:projectId/roles/hierarchy', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const roles = await rolePermissionService.getProjectRoles(parseInt(projectId));
    const hierarchy = rolePermissionService.buildRoleHierarchy(roles);

    res.json({
      success: true,
      hierarchy: hierarchy
    });
  } catch (error) {
    console.error('Get role hierarchy error:', error);
    res.status(500).json({ error: 'Failed to fetch role hierarchy', details: error.message });
  }
});

router.post('/projects/:projectId/roles', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      roleName,
      roleCode,
      roleDescription,
      roleCategory,
      authorityLevel,
      reportsToRoleId,
      icon,
      color
    } = req.body;

    if (!roleName || !roleCode) {
      return res.status(400).json({ error: 'Role name and code are required' });
    }

    if (authorityLevel && (authorityLevel < 1 || authorityLevel > 5)) {
      return res.status(400).json({ error: 'Authority level must be between 1 and 5' });
    }

    const existing = await pool.query(
      'SELECT id FROM custom_roles WHERE project_id = $1 AND role_code = $2',
      [projectId, roleCode]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Role code already exists for this project' });
    }

    const result = await pool.query(`
      INSERT INTO custom_roles (
        project_id, role_name, role_code, role_description,
        role_category, authority_level, reports_to_role_id,
        icon, color, is_system_role
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
      RETURNING *
    `, [
      projectId, roleName, roleCode, roleDescription,
      roleCategory, authorityLevel || 1, reportsToRoleId,
      icon || 'user', color || '#6B7280'
    ]);

    res.json({
      success: true,
      role: result.rows[0]
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Failed to create role', details: error.message });
  }
});

router.put('/roles/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const {
      roleName,
      roleDescription,
      roleCategory,
      authorityLevel,
      reportsToRoleId,
      icon,
      color,
      isActive
    } = req.body;

    const roleCheck = await pool.query(
      'SELECT is_system_role FROM custom_roles WHERE id = $1',
      [roleId]
    );

    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    if (roleCheck.rows[0].is_system_role) {
      return res.status(400).json({ error: 'Cannot modify system roles' });
    }

    const result = await pool.query(`
      UPDATE custom_roles
      SET
        role_name = COALESCE($1, role_name),
        role_description = COALESCE($2, role_description),
        role_category = COALESCE($3, role_category),
        authority_level = COALESCE($4, authority_level),
        reports_to_role_id = $5,
        icon = COALESCE($6, icon),
        color = COALESCE($7, color),
        is_active = COALESCE($8, is_active),
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      roleName, roleDescription, roleCategory, authorityLevel,
      reportsToRoleId, icon, color, isActive, roleId
    ]);

    res.json({
      success: true,
      role: result.rows[0]
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role', details: error.message });
  }
});

router.delete('/roles/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;

    const roleCheck = await pool.query(
      'SELECT is_system_role FROM custom_roles WHERE id = $1',
      [roleId]
    );

    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    if (roleCheck.rows[0].is_system_role) {
      return res.status(400).json({ error: 'Cannot delete system roles' });
    }

    await pool.query(
      'UPDATE custom_roles SET is_active = false, updated_at = NOW() WHERE id = $1',
      [roleId]
    );

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role', details: error.message });
  }
});

router.get('/roles/:roleId/permissions', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;

    const result = await pool.query(
      'SELECT * FROM role_permissions WHERE role_id = $1 ORDER BY entity_type',
      [roleId]
    );

    res.json({
      success: true,
      permissions: result.rows
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Failed to fetch permissions', details: error.message });
  }
});

router.post('/roles/:roleId/permissions', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const {
      entityType,
      canCreate,
      canRead,
      canUpdate,
      canDelete,
      autoCreateEnabled,
      autoCreateThreshold,
      requiresApproval,
      approvalFromRoleId,
      notifyOnCreate,
      notifyRoleIds,
      canCaptureThoughts,
      canRecordMeetings
    } = req.body;

    if (!entityType) {
      return res.status(400).json({ error: 'Entity type is required' });
    }

    const result = await pool.query(`
      INSERT INTO role_permissions (
        role_id, entity_type, can_create, can_read, can_update, can_delete,
        auto_create_enabled, auto_create_threshold, requires_approval,
        approval_from_role_id, notify_on_create, notify_role_ids,
        can_capture_thoughts, can_record_meetings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (role_id, entity_type)
      DO UPDATE SET
        can_create = $3,
        can_read = $4,
        can_update = $5,
        can_delete = $6,
        auto_create_enabled = $7,
        auto_create_threshold = $8,
        requires_approval = $9,
        approval_from_role_id = $10,
        notify_on_create = $11,
        notify_role_ids = $12,
        can_capture_thoughts = $13,
        can_record_meetings = $14
      RETURNING *
    `, [
      roleId, entityType, canCreate, canRead, canUpdate, canDelete,
      autoCreateEnabled, autoCreateThreshold || 0.9, requiresApproval,
      approvalFromRoleId, notifyOnCreate, notifyRoleIds,
      canCaptureThoughts, canRecordMeetings
    ]);

    res.json({
      success: true,
      permission: result.rows[0]
    });
  } catch (error) {
    console.error('Create/update permission error:', error);
    res.status(500).json({ error: 'Failed to save permission', details: error.message });
  }
});

router.post('/projects/:projectId/users/:userId/assign-role', authenticateToken, async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const { roleId, isPrimary } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: 'Role ID is required' });
    }

    const assignment = await rolePermissionService.assignRole(
      parseInt(userId),
      parseInt(projectId),
      parseInt(roleId),
      req.user.id,
      isPrimary !== false
    );

    res.json({
      success: true,
      assignment: assignment
    });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ error: 'Failed to assign role', details: error.message });
  }
});

router.get('/projects/:projectId/users/:userId/role', authenticateToken, async (req, res) => {
  try {
    const { projectId, userId } = req.params;

    const userRole = await rolePermissionService.getUserRole(
      parseInt(userId),
      parseInt(projectId)
    );

    if (!userRole) {
      return res.status(404).json({ error: 'User has no role in this project' });
    }

    res.json({
      success: true,
      role: userRole
    });
  } catch (error) {
    console.error('Get user role error:', error);
    res.status(500).json({ error: 'Failed to fetch user role', details: error.message });
  }
});

module.exports = router;
