/**
 * Shared Loading Component
 * Provides consistent loading indicators across all pages
 * Usage: import and call LoadingSpinner methods
 */

const LoadingSpinner = {
  /**
   * Creates a loading spinner element
   * @param {Object} options - Spinner configuration
   * @param {string} options.size - Size: 'sm', 'md', 'lg', 'xl'
   * @param {string} options.text - Loading text to display
   * @param {string} options.color - Color: 'blue', 'gray', 'white'
   * @returns {HTMLElement} Spinner element
   */
  create(options = {}) {
    const {
      size = 'md',
      text = 'Loading...',
      color = 'blue'
    } = options;

    const sizeClasses = {
      sm: 'w-4 h-4',
      md: 'w-8 h-8',
      lg: 'w-12 h-12',
      xl: 'w-16 h-16'
    };

    const colorClasses = {
      blue: { spinner: 'border-blue-600', text: 'text-gray-600' },
      gray: { spinner: 'border-gray-600', text: 'text-gray-600' },
      white: { spinner: 'border-white', text: 'text-white' }
    };

    const colorSet = colorClasses[color] || colorClasses.blue;

    const spinner = document.createElement('div');
    spinner.className = 'flex flex-col items-center justify-center py-8';
    spinner.setAttribute('role', 'status');
    spinner.setAttribute('aria-live', 'polite');
    
    spinner.innerHTML = `
      <div class="${sizeClasses[size] || sizeClasses.md} border-4 ${colorSet.spinner} border-t-transparent rounded-full animate-spin"></div>
      ${text ? `<p class="mt-3 text-sm ${colorSet.text}">${text}</p>` : ''}
      <span class="sr-only">${text || 'Loading'}</span>
    `;

    return spinner;
  },

  /**
   * Shows loading spinner in a container
   * @param {string} selector - Container selector
   * @param {Object} options - Spinner options
   */
  show(selector, options = {}) {
    const container = document.querySelector(selector);
    if (!container) {
      console.error(`LoadingSpinner: Container not found: ${selector}`);
      return;
    }

    const spinner = this.create(options);
    container.innerHTML = '';
    container.appendChild(spinner);
  },

  /**
   * Shows loading overlay on entire page
   * @param {Object} options - Spinner options
   */
  showOverlay(options = {}) {
    const existingOverlay = document.getElementById('loading-overlay');
    if (existingOverlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', options.text || 'Loading');

    const spinnerContainer = document.createElement('div');
    spinnerContainer.className = 'bg-white rounded-lg p-6 shadow-xl';
    
    const spinner = this.create({
      ...options,
      color: options.color || 'blue'
    });
    
    spinnerContainer.appendChild(spinner);
    overlay.appendChild(spinnerContainer);
    document.body.appendChild(overlay);
  },

  /**
   * Hides loading overlay
   */
  hideOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  },

  /**
   * Creates inline loading text
   * @param {string} text - Loading text
   * @param {string} color - Color: 'blue', 'gray', 'white'
   * @returns {HTMLElement} Loading text element
   */
  inline(text = 'Loading...', color = 'blue') {
    const colorMap = {
      blue: { spinner: 'border-blue-600', text: 'text-gray-600' },
      gray: { spinner: 'border-gray-600', text: 'text-gray-600' },
      white: { spinner: 'border-white', text: 'text-white' }
    };

    const colors = colorMap[color] || colorMap.blue;

    const element = document.createElement('div');
    element.className = `flex items-center text-sm ${colors.text}`;
    element.setAttribute('role', 'status');
    element.innerHTML = `
      <div class="w-4 h-4 border-2 ${colors.spinner} border-t-transparent rounded-full animate-spin mr-2"></div>
      <span>${text}</span>
      <span class="sr-only">${text}</span>
    `;
    return element;
  },

  /**
   * Shows button loading state
   * @param {HTMLButtonElement} button - Button element
   * @param {string} loadingText - Text to show during loading
   */
  buttonLoading(button, loadingText = 'Loading...') {
    if (!button) return;
    
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.classList.add('is-loading');
    button.innerHTML = `
      <span class="flex items-center justify-center">
        <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
        ${loadingText}
      </span>
    `;
  },

  /**
   * Restores button from loading state
   * @param {HTMLButtonElement} button - Button element
   */
  buttonRestore(button) {
    if (!button) return;
    
    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoadingSpinner;
}
