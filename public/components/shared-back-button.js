/**
 * Shared Back Button Component
 * Provides consistent back navigation across all pages using design tokens
 * Usage: SharedBackButton.create(options) or SharedBackButton.mount(selector, options)
 * Dependencies: design-tokens.css, buttons.css
 */

const SharedBackButton = {
  /**
   * Creates a standardized back button/link element
   * @param {Object} options - Button configuration
   * @param {string} options.href - Destination URL (if provided, creates <a> tag)
   * @param {string} options.text - Button text (default: 'Back to Projects')
   * @param {Function} options.onClick - Optional custom click handler (creates <button> tag)
   * @param {string} options.variant - Button style: 'secondary' | 'link' | 'ghost' (default: 'secondary')
   * @param {boolean} options.useHistory - Use browser history.back() instead of href
   * @returns {HTMLAnchorElement|HTMLButtonElement}
   */
  create(options = {}) {
    const {
      href = 'index.html',
      text = 'Back to Projects',
      onClick = null,
      variant = 'secondary',
      useHistory = false
    } = options;

    // Determine element type based on usage
    const isLink = href && !onClick && !useHistory;
    const element = document.createElement(isLink ? 'a' : 'button');
    
    // Set common attributes
    element.setAttribute('aria-label', text);
    
    // Apply design system classes based on variant
    let btnClass = 'btn ';
    switch (variant) {
      case 'link':
        btnClass += 'btn-link';
        break;
      case 'ghost':
        btnClass += 'btn-ghost';
        break;
      case 'secondary':
      default:
        btnClass += 'btn-secondary';
        break;
    }
    
    element.className = btnClass;
    element.innerHTML = `
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <span>${text}</span>
    `;
    
    // Configure behavior
    if (isLink) {
      element.href = href;
    } else {
      element.type = 'button';
      
      // Add click handler
      if (onClick) {
        element.addEventListener('click', onClick);
      } else if (useHistory) {
        element.addEventListener('click', () => window.history.back());
      } else {
        element.addEventListener('click', () => window.location.href = href);
      }
    }
    
    return element;
  },

  /**
   * Mounts a back button into a container
   * @param {string} selector - Container selector
   * @param {Object} options - Button configuration (same as create())
   */
  mount(selector, options) {
    const container = document.querySelector(selector);
    if (!container) {
      console.error(`SharedBackButton: Container not found: ${selector}`);
      return;
    }

    const button = this.create(options);
    container.innerHTML = '';
    container.appendChild(button);
  },

  /**
   * Replaces an existing button with standardized version
   * @param {string} selector - Existing button selector
   * @param {Object} options - Button configuration
   */
  replace(selector, options) {
    const existing = document.querySelector(selector);
    if (!existing) {
      console.warn(`SharedBackButton: Element not found: ${selector}`);
      return;
    }

    const button = this.create(options);
    existing.replaceWith(button);
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SharedBackButton;
}
