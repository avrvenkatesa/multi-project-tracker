const pool = require('../config/database');

/**
 * Role Permission Service
 * Handles all role-based permission checks and authority level logic
 */
class RolePermissionService {
  /**
   * Get user's role for a specific project
   */
  async getUserRole(userId, projectId) {
    const result = await pool.query(`
      SELECT
        ur.id as assignment_id,
        ur.is_primary,
        r.id as role_id,
        r.role_name,
        r.role_code,
        r.role_category,
        r.authority_level,
        r.reports_to_role_id,
        r.icon,
        r.color
      FROM user_role_assignments ur
      JOIN custom_roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
        AND ur.project_id = $2
        AND r.is_active = true
        AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
      ORDER BY ur.is_primary DESC, r.authority_level DESC
      LIMIT 1
    `, [userId, projectId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get permission for a specific role and entity type
   */
  async getPermission(roleId, entityType) {
    const result = await pool.query(`
      SELECT * FROM role_permissions
      WHERE role_id = $1 AND entity_type = $2
    `, [roleId, entityType]);

    if (result.rows.length === 0) {
      return {
        can_create: false,
        can_read: true,
        can_update: false,
        can_delete: false,
        auto_create_enabled: false,
        requires_approval: true,
        can_capture_thoughts: true,
        can_record_meetings: false
      };
    }

    return result.rows[0];
  }

  /**
   * Check if user can auto-create an entity
   * Core decision logic based on authority level and confidence
   */
  async canAutoCreate(userId, projectId, entityType, entityData) {
    const userRole = await this.getUserRole(userId, projectId);
    if (!userRole) {
      return { allowed: false, reason: 'User has no role in this project' };
    }

    const permission = await this.getPermission(userRole.role_id, entityType);

    if (!permission.auto_create_enabled) {
      return {
        allowed: false,
        reason: 'Role does not have auto-create permission',
        requiresApproval: permission.requires_approval,
        approvalFromRoleId: permission.approval_from_role_id
      };
    }

    const impactLevel = entityData.impact || entityData.impact_level || 'medium';
    const requiredAuthority = this.getRequiredAuthorityForImpact(impactLevel);

    if (userRole.authority_level < requiredAuthority) {
      return {
        allowed: false,
        reason: `Authority level ${userRole.authority_level} insufficient for ${impactLevel} impact (requires ${requiredAuthority})`,
        requiresApproval: true,
        approvalFromRoleId: permission.approval_from_role_id
      };
    }

    const confidence = entityData.confidence || 1.0;
    if (confidence < permission.auto_create_threshold) {
      return {
        allowed: false,
        reason: `Confidence ${confidence} below threshold ${permission.auto_create_threshold}`,
        requiresApproval: true,
        approvalFromRoleId: permission.approval_from_role_id
      };
    }

    return {
      allowed: true,
      reason: 'All checks passed'
    };
  }

  /**
   * Get required authority level for impact level
   */
  getRequiredAuthorityForImpact(impactLevel) {
    const impactMap = {
      'low': 2,
      'medium': 3,
      'high': 4,
      'critical': 5
    };
    return impactMap[impactLevel] || 3;
  }

  /**
   * Get approver role for a user's role
   * Follows reports_to hierarchy
   */
  async getApproverRole(roleId) {
    const result = await pool.query(`
      SELECT
        r.id as role_id,
        r.role_name,
        r.role_code,
        r.authority_level
      FROM custom_roles r
      WHERE r.id = (
        SELECT reports_to_role_id
        FROM custom_roles
        WHERE id = $1
      )
      AND r.is_active = true
    `, [roleId]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    const fallback = await pool.query(`
      SELECT
        r.id as role_id,
        r.role_name,
        r.role_code,
        r.authority_level
      FROM custom_roles r
      WHERE r.project_id = (SELECT project_id FROM custom_roles WHERE id = $1)
        AND r.authority_level > (SELECT authority_level FROM custom_roles WHERE id = $1)
        AND r.is_active = true
      ORDER BY r.authority_level ASC
      LIMIT 1
    `, [roleId]);

    return fallback.rows.length > 0 ? fallback.rows[0] : null;
  }

  /**
   * Get all roles for a project (for hierarchy display)
   */
  async getProjectRoles(projectId) {
    const result = await pool.query(`
      SELECT
        r.id,
        r.role_name,
        r.role_code,
        r.role_category,
        r.authority_level,
        r.reports_to_role_id,
        r.icon,
        r.color,
        r.is_system_role,
        COUNT(ur.id) as user_count
      FROM custom_roles r
      LEFT JOIN user_role_assignments ur ON r.id = ur.role_id
        AND ur.project_id = $1
        AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
      WHERE r.project_id = $1 AND r.is_active = true
      GROUP BY r.id
      ORDER BY r.authority_level DESC, r.role_name
    `, [projectId]);

    return result.rows;
  }

  /**
   * Build role hierarchy tree
   */
  buildRoleHierarchy(roles) {
    const roleMap = {};
    const rootRoles = [];

    roles.forEach(role => {
      roleMap[role.id] = { ...role, children: [] };
    });

    roles.forEach(role => {
      if (role.reports_to_role_id && roleMap[role.reports_to_role_id]) {
        roleMap[role.reports_to_role_id].children.push(roleMap[role.id]);
      } else {
        rootRoles.push(roleMap[role.id]);
      }
    });

    return rootRoles;
  }

  /**
   * Assign role to user
   */
  async assignRole(userId, projectId, roleId, assignedBy, isPrimary = true) {
    if (isPrimary) {
      await pool.query(`
        UPDATE user_role_assignments
        SET is_primary = false
        WHERE user_id = $1 AND project_id = $2
      `, [userId, projectId]);
    }

    const result = await pool.query(`
      INSERT INTO user_role_assignments (
        user_id, project_id, role_id, assigned_by, is_primary
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, project_id, role_id, valid_from)
      DO UPDATE SET is_primary = $5, assigned_by = $4, assigned_at = NOW()
      RETURNING *
    `, [userId, projectId, roleId, assignedBy, isPrimary]);

    return result.rows[0];
  }

  /**
   * Check if user has permission to perform action
   */
  async hasPermission(userId, projectId, entityType, action) {
    const userRole = await this.getUserRole(userId, projectId);
    if (!userRole) return false;

    const permission = await this.getPermission(userRole.role_id, entityType);

    switch (action) {
      case 'create': return permission.can_create;
      case 'read': return permission.can_read;
      case 'update': return permission.can_update;
      case 'delete': return permission.can_delete;
      case 'capture_thoughts': return permission.can_capture_thoughts;
      case 'record_meetings': return permission.can_record_meetings;
      default: return false;
    }
  }
}

module.exports = new RolePermissionService();
