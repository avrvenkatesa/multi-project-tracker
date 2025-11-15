/**
 * KanbanCard - Hierarchical Kanban Card Component
 * 
 * A reusable component for rendering Kanban cards with hierarchical support,
 * including parent-child relationships, expandable/collapsible children,
 * and progress tracking for epics.
 */
class KanbanCard {
  /**
   * Create a KanbanCard instance
   * @param {Object} issue - Issue data
   * @param {number} issue.id - Issue ID
   * @param {string} issue.title - Issue title
   * @param {string} issue.description - Issue description
   * @param {string} issue.status - Issue status
   * @param {string} issue.priority - Issue priority
   * @param {number} issue.parent_issue_id - Parent issue ID
   * @param {number} issue.hierarchy_level - Hierarchy level
   * @param {boolean} issue.is_epic - Whether this is an epic
   * @param {number} issue.effort_hours - Effort hours
   * @param {string} issue.assignee - Assignee username
   * @param {Array} issue.children - Child issues
   * @param {Object} options - Configuration options
   * @param {boolean} options.showChildren - Whether to show children (default: true)
   * @param {number} options.indentLevel - Indentation level (default: 0)
   * @param {Function} options.onExpand - Callback when card is expanded
   * @param {Function} options.onCollapse - Callback when card is collapsed
   */
  constructor(issue, options = {}) {
    this.issue = issue;
    this.options = {
      showChildren: true,
      indentLevel: 0,
      onExpand: null,
      onCollapse: null,
      ...options
    };
    this.expanded = false;
  }

  /**
   * Escape HTML to prevent XSS attacks
   * @param {string} text - Text to escape
   * @returns {string} Sanitized text
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Calculate completion percentage from children
   * @returns {number} Percentage (0-100)
   */
  calculateChildProgress() {
    if (!this.issue.children || this.issue.children.length === 0) {
      return 0;
    }

    const completedChildren = this.issue.children.filter(
      child => child.status === 'Done'
    ).length;

    return Math.round((completedChildren / this.issue.children.length) * 100);
  }

  /**
   * Get priority badge class
   * @param {string} priority - Priority level
   * @returns {string} CSS class name
   */
  getPriorityClass(priority) {
    const priorityMap = {
      'Critical': 'badge-priority-critical',
      'High': 'badge-priority-high',
      'Medium': 'badge-priority-medium',
      'Low': 'badge-priority-low'
    };
    return priorityMap[priority] || 'badge-priority-medium';
  }

  /**
   * Render children recursively
   * @returns {string} HTML string of children
   */
  renderChildren() {
    if (!this.issue.children || this.issue.children.length === 0) {
      return '';
    }

    if (!this.options.showChildren || !this.expanded) {
      return '';
    }

    return this.issue.children.map(child => {
      const childCard = new KanbanCard(child, {
        ...this.options,
        indentLevel: this.options.indentLevel + 1
      });
      return childCard.render();
    }).join('');
  }

  /**
   * Render the card
   * @returns {string} HTML string
   */
  render() {
    const hasChildren = this.issue.children && this.issue.children.length > 0;
    const indentPx = this.options.indentLevel * 16;
    const childProgress = hasChildren ? this.calculateChildProgress() : 0;
    const priorityClass = this.getPriorityClass(this.issue.priority);

    const epicClass = this.issue.is_epic ? 'kanban-card-epic' : '';
    const expandIcon = this.expanded ? 'fa-chevron-down' : 'fa-chevron-right';

    return `
      <div class="kanban-card ${epicClass}" 
           data-issue-id="${this.issue.id}" 
           style="margin-left: ${indentPx}px">
        
        <!-- Card Header -->
        <div class="kanban-card-header">
          ${hasChildren ? `
            <button class="kanban-card-expand-btn" 
                    onclick="window.toggleKanbanCard(${this.issue.id})"
                    aria-label="${this.expanded ? 'Collapse' : 'Expand'} children">
              <i class="fas ${expandIcon}"></i>
            </button>
          ` : `
            <span class="kanban-card-expand-placeholder"></span>
          `}
          
          ${this.issue.is_epic ? `
            <span class="badge badge-epic">Epic</span>
          ` : ''}
          
          <span class="kanban-card-id">#${this.issue.id}</span>
        </div>

        <!-- Card Title -->
        <div class="kanban-card-title">
          ${this.escapeHtml(this.issue.title)}
        </div>

        <!-- Card Metadata -->
        <div class="kanban-card-meta">
          <span class="badge ${priorityClass}">
            ${this.escapeHtml(this.issue.priority || 'Medium')}
          </span>
          
          <span class="kanban-card-assignee">
            <i class="fas fa-user"></i>
            ${this.escapeHtml(this.issue.assignee || 'Unassigned')}
          </span>
          
          ${this.issue.effort_hours !== undefined && this.issue.effort_hours !== null ? `
            <span class="kanban-card-effort">
              <i class="fas fa-clock"></i>
              ${this.issue.effort_hours}h
            </span>
          ` : ''}
        </div>

        <!-- Epic Progress Bar -->
        ${this.issue.is_epic && hasChildren ? `
          <div class="kanban-card-progress">
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${childProgress}%"></div>
            </div>
            <div class="progress-bar-label">
              ${childProgress}% Complete (${this.issue.children.filter(c => c.status === 'Done').length}/${this.issue.children.length} tasks)
            </div>
          </div>
        ` : ''}

        <!-- Children Container -->
        ${hasChildren ? `
          <div class="kanban-card-children" 
               id="kanban-card-children-${this.issue.id}"
               style="display: ${this.expanded ? 'block' : 'none'}">
            ${this.renderChildren()}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Toggle expanded/collapsed state
   */
  toggle() {
    this.expanded = !this.expanded;

    const childrenContainer = document.getElementById(`kanban-card-children-${this.issue.id}`);
    if (childrenContainer) {
      childrenContainer.style.display = this.expanded ? 'block' : 'none';
    }

    // Update expand button icon
    const cardElement = document.querySelector(`.kanban-card[data-issue-id="${this.issue.id}"]`);
    if (cardElement) {
      const expandBtn = cardElement.querySelector('.kanban-card-expand-btn i');
      if (expandBtn) {
        expandBtn.className = this.expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
      }
    }

    // Call callbacks
    if (this.expanded && typeof this.options.onExpand === 'function') {
      this.options.onExpand(this.issue);
    } else if (!this.expanded && typeof this.options.onCollapse === 'function') {
      this.options.onCollapse(this.issue);
    }
  }
}

// Global toggle function for onclick handlers
window.toggleKanbanCard = function(issueId) {
  // Find the card instance (this requires maintaining a global registry)
  // For now, we'll trigger a custom event that can be handled externally
  const event = new CustomEvent('kanban-card-toggle', {
    detail: { issueId }
  });
  document.dispatchEvent(event);
};

// Make KanbanCard available globally
window.KanbanCard = KanbanCard;
