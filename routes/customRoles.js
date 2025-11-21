const express = require('express');
const router = express.Router();
const customRolesService = require('../services/customRoles');
const { authenticateToken, checkProjectAccess } = require('../middleware/auth');

router.get('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const roles = await customRolesService.getRolesByProject(parseInt(projectId));
    res.json({ roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/projects/:projectId/hierarchy', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const hierarchy = await customRolesService.getRoleHierarchy(parseInt(projectId));
    res.json({ hierarchy });
  } catch (error) {
    console.error('Error fetching role hierarchy:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/role/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const role = await customRolesService.getRoleById(parseInt(roleId));
    res.json({ role });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(404).json({ error: error.message });
  }
});

router.post('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      roleName,
      roleCode,
      roleDescription,
      roleCategory,
      icon,
      color,
      reportsToRoleId,
      authorityLevel,
      permissions
    } = req.body;

    const role = await customRolesService.createRole({
      projectId: parseInt(projectId),
      roleName,
      roleCode,
      roleDescription,
      roleCategory,
      icon,
      color,
      reportsToRoleId: reportsToRoleId ? parseInt(reportsToRoleId) : null,
      authorityLevel: authorityLevel || 1,
      permissions: permissions || []
    });

    res.status(201).json({ role });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(400).json({ error: error.message });
  }
});

router.put('/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const updates = req.body;

    const role = await customRolesService.updateRole(parseInt(roleId), updates);
    res.json({ role });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:roleId', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const result = await customRolesService.deleteRole(parseInt(roleId));
    res.json(result);
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(400).json({ error: error.message });
  }
});

router.put('/:roleId/permissions/:entityType', authenticateToken, async (req, res) => {
  try {
    const { roleId, entityType } = req.params;
    const permissions = req.body;

    const role = await customRolesService.updateRolePermissions(
      parseInt(roleId),
      entityType,
      permissions
    );
    res.json({ role });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/:roleId/assign', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const { userId, projectId, isPrimary, validFrom, validTo } = req.body;

    const assignment = await customRolesService.assignRoleToUser({
      userId: parseInt(userId),
      projectId: parseInt(projectId),
      roleId: parseInt(roleId),
      assignedBy: req.user.userId,
      isPrimary: isPrimary !== undefined ? isPrimary : false,
      validFrom,
      validTo
    });

    res.status(201).json({ assignment });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:roleId/unassign', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const { userId, projectId } = req.body;

    await customRolesService.removeRoleFromUser(
      parseInt(userId),
      parseInt(projectId),
      parseInt(roleId)
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing role assignment:', error);
    res.status(400).json({ error: error.message });
  }
});

router.get('/projects/:projectId/users/:userId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const roles = await customRolesService.getUserRoles(parseInt(userId), parseInt(projectId));
    res.json({ roles });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:roleId/users', authenticateToken, async (req, res) => {
  try {
    const { roleId } = req.params;
    const users = await customRolesService.getUsersByRole(parseInt(roleId));
    res.json({ users });
  } catch (error) {
    console.error('Error fetching role users:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/check-permission', authenticateToken, async (req, res) => {
  try {
    const { userId, projectId, entityType, action } = req.body;

    const permission = await customRolesService.checkPermission(
      parseInt(userId || req.user.userId),
      parseInt(projectId),
      entityType,
      action
    );

    res.json(permission);
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
