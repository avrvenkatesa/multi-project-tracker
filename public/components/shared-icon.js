/**
 * Shared Icon Factory
 * Centralized icon rendering utility using Font Awesome
 * Replaces emoji usage with accessible, consistent icons
 */

window.IconFactory = (() => {
  // Icon mapping table: emoji/key → Font Awesome class
  const ICON_MAP = {
    check: 'fa-check-circle',
    times: 'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    lightbulb: 'fa-lightbulb',
    clipboard: 'fa-clipboard-list',
    star: 'fa-star',
    starOutline: 'fa-star',
    chart: 'fa-chart-bar',
    eye: 'fa-eye',
    trash: 'fa-trash-alt',
    info: 'fa-info-circle',
    plus: 'fa-plus-circle',
    edit: 'fa-edit',
    save: 'fa-save',
    download: 'fa-download',
    upload: 'fa-upload',
    clock: 'fa-clock',
    link: 'fa-link',
    file: 'fa-file-alt',
    user: 'fa-user',
    calendar: 'fa-calendar-alt',
    folder: 'fa-folder',
    target: 'fa-bullseye',
    tag: 'fa-tag',
    hourglass: 'fa-hourglass-half'
  };

  // Color tone mapping to design token classes
  const TONE_MAP = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
    primary: 'text-blue-600',
    muted: 'text-gray-500'
  };

  // Icon style variants
  const STYLE_MAP = {
    solid: 'fas',
    regular: 'far',
    light: 'fal',
    duotone: 'fad'
  };

  /**
   * Render icon as HTML string for template literals
   * @param {string} iconKey - Icon key from ICON_MAP
   * @param {Object} options - Configuration options
   * @param {string} options.tone - Color tone (success, error, warning, info, primary, muted)
   * @param {string} options.size - Size class (text-sm, text-lg, text-xl, text-2xl, etc.)
   * @param {string} options.style - Icon style (solid, regular, light, duotone)
   * @param {string} options.assistiveText - Screen reader text (if not decorative)
   * @param {string} options.customClass - Additional CSS classes
   * @returns {string} HTML string
   */
  function renderInline(iconKey, options = {}) {
    const {
      tone = null,
      size = null,
      style = 'solid',
      assistiveText = null,
      customClass = ''
    } = options;

    const iconClass = ICON_MAP[iconKey];
    if (!iconClass) {
      console.warn(`IconFactory: Unknown icon key "${iconKey}"`);
      return '';
    }

    const stylePrefix = STYLE_MAP[style] || 'fas';
    const classes = [stylePrefix, iconClass];

    if (tone && TONE_MAP[tone]) {
      classes.push(TONE_MAP[tone]);
    }
    if (size) {
      classes.push(size);
    }
    if (customClass) {
      classes.push(customClass);
    }

    const classAttr = classes.join(' ');
    const ariaAttr = assistiveText 
      ? `role="img" aria-label="${assistiveText}"` 
      : 'aria-hidden="true"';

    return `<i class="${classAttr}" ${ariaAttr}></i>`;
  }

  /**
   * Render icon as DOM element for direct attachment
   * @param {string} iconKey - Icon key from ICON_MAP
   * @param {Object} options - Same as renderInline
   * @returns {HTMLElement} Icon element
   */
  function attachInline(iconKey, options = {}) {
    const htmlString = renderInline(iconKey, options);
    const temp = document.createElement('div');
    temp.innerHTML = htmlString;
    return temp.firstElementChild;
  }

  /**
   * Render star rating with filled and empty stars
   * @param {number} rating - Rating value (0-5)
   * @param {Object} config - Configuration
   * @param {number} config.maxStars - Maximum number of stars (default: 5)
   * @param {string} config.size - Size class (default: null)
   * @param {string} config.tone - Color for filled stars (default: 'warning' for yellow)
   * @param {boolean} config.showEmpty - Show empty stars (default: true)
   * @returns {string} HTML string with stars
   */
  function renderStarRating(rating, config = {}) {
    const {
      maxStars = 5,
      size = null,
      tone = 'warning',
      showEmpty = true
    } = config;

    const filledCount = Math.round(rating);
    const emptyCount = maxStars - filledCount;

    let stars = '';

    // Filled stars
    for (let i = 0; i < filledCount; i++) {
      stars += renderInline('star', { 
        tone, 
        size, 
        style: 'solid',
        assistiveText: i === 0 ? `Rating: ${rating} out of ${maxStars}` : null
      });
    }

    // Empty stars
    if (showEmpty) {
      for (let i = 0; i < emptyCount; i++) {
        stars += renderInline('starOutline', { 
          tone: 'muted', 
          size, 
          style: 'regular',
          assistiveText: null
        });
      }
    }

    return `<span class="inline-flex items-center gap-0.5">${stars}</span>`;
  }

  /**
   * Render status icon based on validation state
   * @param {boolean} isValid - Validation state
   * @param {Object} options - Configuration
   * @returns {string} HTML string
   */
  function renderStatusIcon(isValid, options = {}) {
    const iconKey = isValid ? 'check' : 'times';
    const tone = isValid ? 'success' : 'error';
    const assistiveText = isValid ? 'Valid' : 'Invalid';

    return renderInline(iconKey, {
      tone,
      assistiveText,
      ...options
    });
  }

  // Public API
  return {
    renderInline,
    attachInline,
    renderStarRating,
    renderStatusIcon,
    ICON_MAP,
    TONE_MAP
  };
})();
