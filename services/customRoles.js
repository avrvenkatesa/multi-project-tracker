const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Custom Role Service
 * Manages custom roles, permissions, and user role assignments for projects
 */
class CustomRoleService {
  /**
   * Get all roles for a project with their permissions
   */
  async getRolesByProject(projectId) {
    const client = await pool.connect();
    try {
      const rolesResult = await client.query(`
        SELECT 
          r.*,
          parent.role_name as reports_to_name,
          (SELECT COUNT(*) FROM user_role_assignments WHERE role_id = r.id AND is_primary = true) as user_count
        FROM custom_roles r
        LEFT JOIN custom_roles parent ON r.reports_to_role_id = parent.id
        WHERE r.project_id = $1 AND r.is_active = true
        ORDER BY r.authority_level DESC, r.role_name ASC
      `, [projectId]);

      const roles = rolesResult.rows;

      for (const role of roles) {
        const permsResult = await client.query(`
          SELECT * FROM role_permissions
          WHERE role_id = $1
          ORDER BY entity_type ASC
        `, [role.id]);
        role.permissions = permsResult.rows;
      }

      return roles;
    } finally {
      client.release();
    }
  }

  /**
   * Get role by ID with permissions
   */
  async getRoleById(roleId) {
    const client = await pool.connect();
    try {
      const roleResult = await client.query(`
        SELECT 
          r.*,
          parent.role_name as reports_to_name
        FROM custom_roles r
        LEFT JOIN custom_roles parent ON r.reports_to_role_id = parent.id
        WHERE r.id = $1
      `, [roleId]);

      if (roleResult.rows.length === 0) {
        throw new Error('Role not found');
      }

      const role = roleResult.rows[0];

      const permsResult = await client.query(`
        SELECT * FROM role_permissions
        WHERE role_id = $1
        ORDER BY entity_type ASC
      `, [roleId]);

      role.permissions = permsResult.rows;

      return role;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new custom role
   */
  async createRole({ 
    projectId, 
    roleName, 
    roleCode, 
    roleDescription, 
    roleCategory, 
    icon, 
    color,
    reportsToRoleId,
    authorityLevel,
    permissions = []
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (!roleCode || roleCode.trim().length === 0) {
        throw new Error('Role code is required');
      }

      if (authorityLevel !== undefined && (authorityLevel < 0 || authorityLevel > 5)) {
        throw new Error('Authority level must be between 0 and 5');
      }

      const roleResult = await client.query(`
        INSERT INTO custom_roles (
          project_id, role_name, role_code, role_description, role_category,
          icon, color, reports_to_role_id, authority_level, is_system_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
        RETURNING *
      `, [projectId, roleName, roleCode, roleDescription, roleCategory, icon, color, reportsToRoleId, authorityLevel]);

      const role = roleResult.rows[0];

      if (permissions.length > 0) {
        for (const perm of permissions) {
          await this._createPermission(client, role.id, perm);
        }
      }

      await client.query('COMMIT');

      return await this.getRoleById(role.id);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[CustomRoles] Error creating role:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing role
   */
  async updateRole(roleId, updates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const role = await this.getRoleById(roleId);
      
      if (role.is_system_role && updates.roleCode) {
        throw new Error('Cannot change role code for system roles');
      }

      if (updates.authorityLevel !== undefined && (updates.authorityLevel < 0 || updates.authorityLevel > 5)) {
        throw new Error('Authority level must be between 0 and 5');
      }

      const setClauses = [];
      const values = [];
      let paramCount = 1;

      if (updates.roleName !== undefined) {
        setClauses.push(`role_name = $${paramCount++}`);
        values.push(updates.roleName);
      }
      if (updates.roleDescription !== undefined) {
        setClauses.push(`role_description = $${paramCount++}`);
        values.push(updates.roleDescription);
      }
      if (updates.roleCategory !== undefined) {
        setClauses.push(`role_category = $${paramCount++}`);
        values.push(updates.roleCategory);
      }
      if (updates.icon !== undefined) {
        setClauses.push(`icon = $${paramCount++}`);
        values.push(updates.icon);
      }
      if (updates.color !== undefined) {
        setClauses.push(`color = $${paramCount++}`);
        values.push(updates.color);
      }
      if (updates.reportsToRoleId !== undefined) {
        setClauses.push(`reports_to_role_id = $${paramCount++}`);
        values.push(updates.reportsToRoleId);
      }
      if (updates.authorityLevel !== undefined) {
        setClauses.push(`authority_level = $${paramCount++}`);
        values.push(updates.authorityLevel);
      }

      if (setClauses.length > 0) {
        setClauses.push(`updated_at = NOW()`);
        values.push(roleId);

        await client.query(`
          UPDATE custom_roles
          SET ${setClauses.join(', ')}
          WHERE id = $${paramCount}
        `, values);
      }

      await client.query('COMMIT');

      return await this.getRoleById(roleId);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[CustomRoles] Error updating role:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a role (soft delete by marking inactive)
   */
  async deleteRole(roleId) {
    const client = await pool.connect();
    try {
      const role = await this.getRoleById(roleId);
      
      if (role.is_system_role) {
        throw new Error('Cannot delete system roles');
      }

      const assignmentsResult = await client.query(`
        SELECT COUNT(*) as count FROM user_role_assignments
        WHERE role_id = $1
      `, [roleId]);

      if (parseInt(assignmentsResult.rows[0].count) > 0) {
        await client.query(`
          UPDATE custom_roles
          SET is_active = false, updated_at = NOW()
          WHERE id = $1
        `, [roleId]);
        return { deleted: false, deactivated: true };
      } else {
        await client.query(`
          DELETE FROM custom_roles WHERE id = $1
        `, [roleId]);
        return { deleted: true, deactivated: false };
      }
    } finally {
      client.release();
    }
  }

  /**
   * Update role permissions
   */
  async updateRolePermissions(roleId, entityType, permissions) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        DELETE FROM role_permissions
        WHERE role_id = $1 AND entity_type = $2
      `, [roleId, entityType]);

      await this._createPermission(client, roleId, { entityType, ...permissions });

      await client.query('COMMIT');

      return await this.getRoleById(roleId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser({ userId, projectId, roleId, assignedBy, isPrimary = false, validFrom, validTo }) {
    const result = await pool.query(`
      INSERT INTO user_role_assignments (
        user_id, project_id, role_id, assigned_by, is_primary, valid_from, valid_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, project_id, role_id, valid_from) 
      DO UPDATE SET is_primary = $5, valid_to = $7, assigned_at = NOW()
      RETURNING *
    `, [userId, projectId, roleId, assignedBy, isPrimary, validFrom || 'CURRENT_DATE', validTo]);

    return result.rows[0];
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId, projectId, roleId) {
    await pool.query(`
      DELETE FROM user_role_assignments
      WHERE user_id = $1 AND project_id = $2 AND role_id = $3
    `, [userId, projectId, roleId]);

    return { success: true };
  }

  /**
   * Get user's roles in a project
   */
  async getUserRoles(userId, projectId) {
    const result = await pool.query(`
      SELECT 
        r.*,
        ura.is_primary,
        ura.valid_from,
        ura.valid_to,
        ura.assigned_at
      FROM user_role_assignments ura
      JOIN custom_roles r ON ura.role_id = r.id
      WHERE ura.user_id = $1 
        AND ura.project_id = $2
        AND r.is_active = true
        AND (ura.valid_to IS NULL OR ura.valid_to >= CURRENT_DATE)
      ORDER BY ura.is_primary DESC, r.authority_level DESC
    `, [userId, projectId]);

    const roles = result.rows;

    for (const role of roles) {
      const permsResult = await pool.query(`
        SELECT * FROM role_permissions
        WHERE role_id = $1
        ORDER BY entity_type ASC
      `, [role.id]);
      role.permissions = permsResult.rows;
    }

    return roles;
  }

  /**
   * Check if user has permission for an action
   */
  async checkPermission(userId, projectId, entityType, action) {
    const roles = await this.getUserRoles(userId, projectId);
    
    for (const role of roles) {
      const perm = role.permissions.find(p => p.entity_type === entityType);
      if (perm) {
        const actionField = `can_${action}`;
        if (perm[actionField] === true) {
          return {
            allowed: true,
            role: role.role_name,
            requiresApproval: perm.requires_approval || false,
            approvalFromRoleId: perm.approval_from_role_id
          };
        }
      }
    }

    return { allowed: false };
  }

  /**
   * Get role hierarchy for a project
   */
  async getRoleHierarchy(projectId) {
    const roles = await this.getRolesByProject(projectId);
    
    const roleMap = new Map();
    roles.forEach(role => {
      roleMap.set(role.id, { ...role, children: [] });
    });

    const hierarchy = [];
    roleMap.forEach(role => {
      if (role.reports_to_role_id) {
        const parent = roleMap.get(role.reports_to_role_id);
        if (parent) {
          parent.children.push(role);
        } else {
          hierarchy.push(role);
        }
      } else {
        hierarchy.push(role);
      }
    });

    return hierarchy;
  }

  /**
   * Get users assigned to a role
   */
  async getUsersByRole(roleId) {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.full_name,
        ura.is_primary,
        ura.valid_from,
        ura.valid_to,
        ura.assigned_at
      FROM user_role_assignments ura
      JOIN users u ON ura.user_id = u.id
      WHERE ura.role_id = $1
        AND (ura.valid_to IS NULL OR ura.valid_to >= CURRENT_DATE)
      ORDER BY ura.is_primary DESC, u.full_name ASC
    `, [roleId]);

    return result.rows;
  }

  /**
   * Helper: Create permission record
   */
  async _createPermission(client, roleId, perm) {
    await client.query(`
      INSERT INTO role_permissions (
        role_id, entity_type, can_create, can_read, can_update, can_delete,
        auto_create_enabled, auto_create_threshold, requires_approval, 
        approval_from_role_id, notify_on_create, notify_role_ids,
        can_capture_thoughts, can_record_meetings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      roleId,
      perm.entityType,
      perm.canCreate || false,
      perm.canRead !== false,
      perm.canUpdate || false,
      perm.canDelete || false,
      perm.autoCreateEnabled || false,
      perm.autoCreateThreshold || 0.9,
      perm.requiresApproval || false,
      perm.approvalFromRoleId || null,
      perm.notifyOnCreate || false,
      perm.notifyRoleIds || null,
      perm.canCaptureThoughts !== false,
      perm.canRecordMeetings || false
    ]);
  }
}

module.exports = new CustomRoleService();
