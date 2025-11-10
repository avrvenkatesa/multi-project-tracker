/**
 * Shared Header Component
 * Provides consistent navigation header across all pages
 * Usage: import and call renderHeader(options)
 */

const SharedHeader = {
  /**
   * Renders the navigation header
   * @param {Object} options - Header configuration
   * @param {string} options.title - Main title
   * @param {Array} options.breadcrumbs - Breadcrumb items [{text, href}]
   * @param {string} options.backLink - Back button link
   * @param {string} options.backText - Back button text
   * @param {Object} options.user - User object {name, username}
   * @param {Function} options.onLogout - Logout handler
   * @returns {HTMLElement} Header element
   */
  render(options = {}) {
    const {
      title = 'Multi-Project Tracker',
      breadcrumbs = [],
      backLink = null,
      backText = 'Back',
      user = null,
      onLogout = this.defaultLogout
    } = options;

    const header = document.createElement('nav');
    header.className = 'bg-blue-600 text-white shadow-lg';
    header.setAttribute('role', 'navigation');
    header.setAttribute('aria-label', 'Main navigation');
    
    const breadcrumbHtml = breadcrumbs.length > 0 
      ? `<nav aria-label="Breadcrumb" class="flex items-center space-x-2">` +
        breadcrumbs.map((item, index) => `
          <span class="text-blue-200" aria-hidden="true">/</span>
          ${item.href 
            ? `<a href="${item.href}" class="hover:text-blue-200 transition-colors">${item.text}</a>`
            : `<span class="text-white" aria-current="page">${item.text}</span>`
          }
        `).join('') + `</nav>`
      : '';

    header.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center space-x-4">
            <a href="/dashboard.html" class="flex items-center gap-2 hover:opacity-80 transition-opacity" aria-label="Go to dashboard">
              <i class="fas fa-home" aria-hidden="true"></i>
              <span class="text-xl font-bold">${title}</span>
            </a>
            ${breadcrumbHtml}
          </div>
          <div class="flex items-center space-x-4">
            ${backLink ? `
              <a href="${backLink}" class="text-sm hover:text-blue-200 transition-colors flex items-center" aria-label="${backText}">
                <i class="fas fa-arrow-left mr-2" aria-hidden="true"></i>${backText}
              </a>
            ` : ''}
            ${user ? `<span id="user-display" class="text-sm" aria-label="Current user: ${user.name || user.username}">${user.name || user.username}</span>` : ''}
            <button id="logout-btn" class="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded transition-colors text-sm font-medium" aria-label="Logout">
              <i class="fas fa-sign-out-alt mr-2" aria-hidden="true"></i>Logout
            </button>
          </div>
        </div>
      </div>
    `;

    const logoutBtn = header.querySelector('#logout-btn');
    if (logoutBtn && onLogout) {
      logoutBtn.addEventListener('click', onLogout);
    }

    return header;
  },

  /**
   * Replaces existing header with shared header
   * @param {string} selector - Selector for header container or header to replace
   * @param {Object} options - Header configuration
   */
  mount(selector, options) {
    const container = document.querySelector(selector);
    if (!container) {
      console.error(`SharedHeader: Container not found: ${selector}`);
      return;
    }

    const header = this.render(options);
    
    if (container.tagName === 'NAV') {
      container.replaceWith(header);
    } else {
      container.innerHTML = '';
      container.appendChild(header);
    }
  },

  /**
   * Default logout handler
   */
  async defaultLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/login.html';
    }
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SharedHeader;
}
