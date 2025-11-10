/**
 * Shared Empty State Component
 * Provides consistent empty state displays across all pages
 * 
 * DEPENDENCIES:
 * - Tailwind CSS for utility classes
 * - Font Awesome for icons
 * - /css/buttons.css for .btn classes
 * 
 * Usage: import and call EmptyState methods
 */

const EmptyState = {
  _uniqueId: 0,
  /**
   * Creates an empty state element
   * @param {Object} options - Empty state configuration
   * @param {string} options.icon - Font Awesome icon class (e.g., 'fa-inbox')
   * @param {string} options.title - Empty state title
   * @param {string} options.message - Empty state message
   * @param {Object} options.action - Action button {text, onClick, variant}
   * @returns {HTMLElement} Empty state element
   */
  create(options = {}) {
    const {
      icon = 'fa-inbox',
      title = 'No items found',
      message = 'There are no items to display.',
      action = null
    } = options;

    const uniqueId = `empty-state-action-${this._uniqueId++}`;

    const container = document.createElement('div');
    container.className = 'flex flex-col items-center justify-center py-12 px-4';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    
    container.innerHTML = `
      <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4" aria-hidden="true">
        <i class="fas ${icon} text-3xl text-gray-400"></i>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-2">${title}</h3>
      <p class="text-sm text-gray-600 text-center max-w-md mb-6">${message}</p>
      ${action ? `
        <button id="${uniqueId}" 
                class="inline-flex items-center justify-center gap-2 px-4 py-2 font-medium text-sm rounded transition-all
                       ${action.variant === 'primary' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                       ${action.variant === 'secondary' ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : ''}
                       ${action.variant === 'danger' ? 'bg-red-100 hover:bg-red-200 text-red-800' : ''}
                       ${!action.variant ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}"
                aria-label="${action.text}">
          ${action.icon ? `<i class="fas ${action.icon}" aria-hidden="true"></i>` : ''}
          <span>${action.text}</span>
        </button>
      ` : ''}
    `;

    if (action && action.onClick) {
      const actionBtn = container.querySelector(`#${uniqueId}`);
      if (actionBtn) {
        actionBtn.addEventListener('click', action.onClick);
      }
    }

    return container;
  },

  /**
   * Shows empty state in a container
   * @param {string} selector - Container selector
   * @param {Object} options - Empty state options
   */
  show(selector, options = {}) {
    const container = document.querySelector(selector);
    if (!container) {
      console.error(`EmptyState: Container not found: ${selector}`);
      return;
    }

    const emptyState = this.create(options);
    container.innerHTML = '';
    container.appendChild(emptyState);
  },

  /**
   * Pre-configured empty states for common scenarios
   */
  templates: {
    noProjects: {
      icon: 'fa-folder-open',
      title: 'No projects yet',
      message: 'Create your first project to get started with tracking issues and action items.',
      action: {
        text: 'Create Project',
        icon: 'fa-plus',
        variant: 'primary'
      }
    },
    
    noIssues: {
      icon: 'fa-clipboard-list',
      title: 'No issues found',
      message: 'There are no issues matching your current filters. Try adjusting your search or create a new issue.',
      action: {
        text: 'Create Issue',
        icon: 'fa-plus',
        variant: 'primary'
      }
    },
    
    noActionItems: {
      icon: 'fa-tasks',
      title: 'No action items',
      message: 'All clear! There are no action items to display.',
      action: {
        text: 'Add Action Item',
        icon: 'fa-plus',
        variant: 'primary'
      }
    },
    
    noChecklists: {
      icon: 'fa-list-check',
      title: 'No checklists available',
      message: 'Create checklists to track detailed task progress and requirements.',
      action: {
        text: 'Create Checklist',
        icon: 'fa-plus',
        variant: 'primary'
      }
    },
    
    noSchedules: {
      icon: 'fa-calendar-alt',
      title: 'No schedules created',
      message: 'Create a project schedule to visualize timelines and manage dependencies.',
      action: {
        text: 'Create Schedule',
        icon: 'fa-plus',
        variant: 'primary'
      }
    },
    
    noResults: {
      icon: 'fa-search',
      title: 'No results found',
      message: 'We couldn\'t find anything matching your search. Try different keywords or filters.'
    },
    
    noData: {
      icon: 'fa-database',
      title: 'No data available',
      message: 'There is no data to display at this time.'
    },
    
    error: {
      icon: 'fa-exclamation-triangle',
      title: 'Something went wrong',
      message: 'We encountered an error loading this data. Please try again later.'
    }
  },

  /**
   * Shows a pre-configured template
   * @param {string} selector - Container selector
   * @param {string} templateName - Template name from templates object
   * @param {Function} actionHandler - Optional action button handler
   */
  showTemplate(selector, templateName, actionHandler = null) {
    const template = this.templates[templateName];
    if (!template) {
      console.error(`EmptyState: Template not found: ${templateName}`);
      return;
    }

    const options = { ...template };
    if (actionHandler && options.action) {
      options.action.onClick = actionHandler;
    }

    this.show(selector, options);
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmptyState;
}
