/**
 * AuthManager - Singleton for handling user authentication
 * Manages login/register/logout flow with JWT cookies
 */
const AuthManager = {
  currentUser: null,
  isAuthenticated: false,

  /**
   * Initialize authentication system
   * Check if user is already logged in via cookie
   */
  async init() {
    console.log('AuthManager: Initializing...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Check if user is already authenticated
    await this.checkAuthStatus();
    
    // Update UI based on auth state
    this.updateUI();
    
    console.log('AuthManager: Initialized', { 
      authenticated: this.isAuthenticated, 
      user: this.currentUser?.username 
    });
  },

  /**
   * Set up event listeners for authentication UI
   */
  setupEventListeners() {
    // Login button in header
    document.getElementById('login-btn')?.addEventListener('click', () => {
      this.showAuthModal('login');
    });

    // Register button in header
    document.getElementById('register-btn')?.addEventListener('click', () => {
      this.showAuthModal('register');
    });

    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      this.logout();
    });

    // Modal close button
    document.getElementById('auth-modal-close')?.addEventListener('click', () => {
      this.hideAuthModal();
    });

    // Modal backdrop click
    document.getElementById('auth-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'auth-modal') {
        this.hideAuthModal();
      }
    });

    // Toggle between login/register
    document.getElementById('auth-toggle-btn')?.addEventListener('click', () => {
      this.toggleAuthMode();
    });

    // Form submissions
    document.getElementById('login-form')?.addEventListener('submit', (e) => {
      this.handleLogin(e);
    });

    document.getElementById('register-form')?.addEventListener('submit', (e) => {
      this.handleRegister(e);
    });

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('auth-modal').classList.contains('hidden')) {
        this.hideAuthModal();
      }
    });
  },

  /**
   * Check current authentication status with server
   */
  async checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        this.currentUser = await response.json();
        this.isAuthenticated = true;
        console.log('AuthManager: User authenticated', this.currentUser);
      } else {
        this.currentUser = null;
        this.isAuthenticated = false;
        console.log('AuthManager: User not authenticated');
      }
    } catch (error) {
      console.error('AuthManager: Error checking auth status', error);
      this.currentUser = null;
      this.isAuthenticated = false;
    }
  },

  /**
   * Show authentication modal
   * @param {string} mode - 'login' or 'register'
   */
  showAuthModal(mode = 'login') {
    const modal = document.getElementById('auth-modal');
    const title = document.getElementById('auth-modal-title');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleBtn = document.getElementById('auth-toggle-btn');

    // Clear any previous errors
    this.hideError();

    if (mode === 'login') {
      title.textContent = 'Login';
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      toggleText.textContent = "Don't have an account?";
      toggleBtn.textContent = 'Sign up';
      toggleBtn.dataset.mode = 'register';
    } else {
      title.textContent = 'Register';
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
      toggleText.textContent = 'Already have an account?';
      toggleBtn.textContent = 'Sign in';
      toggleBtn.dataset.mode = 'login';
    }

    modal.classList.remove('hidden');
    
    // Focus on first input
    setTimeout(() => {
      if (mode === 'login') {
        document.getElementById('login-email').focus();
      } else {
        document.getElementById('register-name').focus();
      }
    }, 100);
  },

  /**
   * Hide authentication modal
   */
  hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    modal.classList.add('hidden');
    
    // Clear forms
    document.getElementById('login-form').reset();
    document.getElementById('register-form').reset();
    
    // Hide any errors
    this.hideError();
  },

  /**
   * Toggle between login and register modes
   */
  toggleAuthMode() {
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const currentMode = toggleBtn.dataset.mode || 'register';
    this.showAuthModal(currentMode);
  },

  /**
   * Handle login form submission
   */
  async handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      this.showError('Please fill in all fields');
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.hideAuthModal();
        this.updateUI();
        this.showNotification(`Welcome back, ${this.currentUser.username}!`, 'success');
        console.log('AuthManager: Login successful', this.currentUser);
      } else {
        this.showError(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('AuthManager: Login error', error);
      this.showError('Network error. Please try again.');
    }
  },

  /**
   * Handle register form submission
   */
  async handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const role = document.getElementById('register-role').value;

    if (!name || !email || !password) {
      this.showError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      this.showError('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ name, email, password, role })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.hideAuthModal();
        this.updateUI();
        this.showNotification(`Welcome, ${this.currentUser.username}!`, 'success');
        console.log('AuthManager: Registration successful', this.currentUser);
      } else {
        this.showError(data.error || 'Registration failed');
      }
    } catch (error) {
      console.error('AuthManager: Registration error', error);
      this.showError('Network error. Please try again.');
    }
  },

  /**
   * Logout user
   */
  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      this.currentUser = null;
      this.isAuthenticated = false;
      this.updateUI();
      this.showNotification('You have been logged out', 'info');
      console.log('AuthManager: Logout successful');
    } catch (error) {
      console.error('AuthManager: Logout error', error);
      // Even if the request fails, clear local state
      this.currentUser = null;
      this.isAuthenticated = false;
      this.updateUI();
    }
  },

  /**
   * Update UI based on authentication state
   */
  updateUI() {
    const userInfo = document.getElementById('user-info');
    const authButtons = document.getElementById('auth-buttons');
    const userName = document.getElementById('user-name');

    if (this.isAuthenticated && this.currentUser) {
      // Show user info, hide login buttons
      userInfo.classList.remove('hidden');
      authButtons.classList.add('hidden');
      userName.textContent = this.currentUser.username;

      // Show/enable all elements that require auth
      document.querySelectorAll('[data-requires-auth]').forEach(element => {
        element.disabled = false;
        element.classList.remove('opacity-50', 'cursor-not-allowed');
      });
    } else {
      // Hide user info, show login buttons
      userInfo.classList.add('hidden');
      authButtons.classList.remove('hidden');

      // Disable elements that require auth
      document.querySelectorAll('[data-requires-auth]').forEach(element => {
        element.disabled = true;
        element.classList.add('opacity-50', 'cursor-not-allowed');
      });
    }
  },

  /**
   * Require authentication for an action
   * @param {Function} callback - Action to execute if authenticated
   * @param {string} message - Custom message to show if not authenticated
   */
  requireAuth(callback, message = 'Please login to perform this action') {
    if (this.isAuthenticated) {
      callback();
    } else {
      this.showNotification(message, 'warning');
      this.showAuthModal('login');
    }
  },

  /**
   * Show error message in auth modal
   */
  showError(message) {
    const errorDiv = document.getElementById('auth-error');
    const errorText = document.getElementById('auth-error-text');
    
    errorText.textContent = message;
    errorDiv.classList.remove('hidden');
  },

  /**
   * Hide error message in auth modal
   */
  hideError() {
    const errorDiv = document.getElementById('auth-error');
    errorDiv.classList.add('hidden');
  },

  /**
   * Show notification message
   */
  showNotification(message, type = 'info') {
    // Use existing notification system if available, or create simple alert
    if (window.showSuccessMessage && type === 'success') {
      window.showSuccessMessage(message);
    } else if (window.showErrorMessage && type === 'error') {
      window.showErrorMessage(message);
    } else {
      // Fallback to console for now - could be enhanced with toast notifications
      console.log(`Notification (${type}): ${message}`);
      
      // Simple toast notification
      const toast = document.createElement('div');
      toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg text-white z-50 ${
        type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' : 
        type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600'
      }`;
      toast.textContent = message;
      
      document.body.appendChild(toast);
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 3000);
    }
  },

  /**
   * Get current user object
   */
  getUser() {
    return this.currentUser;
  },

  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    return this.isAuthenticated;
  },

  /**
   * Generate user initials for avatar
   */
  getUserInitials() {
    if (!this.currentUser || !this.currentUser.username) return '??';
    
    const names = this.currentUser.username.trim().split(' ');
    if (names.length === 1) {
      return names[0].substring(0, 2).toUpperCase();
    }
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  }
};

// Initialize AuthManager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  AuthManager.init();
});

// Export for use in other files
window.AuthManager = AuthManager;