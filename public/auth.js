// Authentication Manager
const AuthManager = {
  isAuthenticated: false,
  currentUser: null,
  roleHierarchy: {
    'System Administrator': 5,
    'Project Manager': 4,
    'Team Lead': 3,
    'Team Member': 2,
    'Stakeholder': 1,
    'External Viewer': 0
  },

  async init() {
    console.log('AuthManager initializing...');
    await this.checkAuthStatus();
  },

  async checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        this.currentUser = await response.json();
        this.isAuthenticated = true;
        console.log('User authenticated:', this.currentUser);
        console.log('User role:', this.currentUser.role);
      } else {
        this.isAuthenticated = false;
        this.currentUser = null;
        console.log('User not authenticated');
      }
    } catch (error) {
      console.error('Auth check error:', error);
      this.isAuthenticated = false;
      this.currentUser = null;
    }
    
    this.updateUI();
  },

  async register(username, email, password) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.updateUI();
        this.showNotification('Registration successful!', 'success');
        return true;
      } else {
        this.showNotification(data.error || 'Registration failed', 'error');
        return false;
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.showNotification('Registration failed', 'error');
      return false;
    }
  },

  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.updateUI();
        this.showNotification('Login successful!', 'success');
        return true;
      } else {
        this.showNotification(data.error || 'Login failed', 'error');
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showNotification('Login failed', 'error');
      return false;
    }
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      this.currentUser = null;
      this.isAuthenticated = false;
      this.updateUI();
      this.showNotification('Logged out successfully', 'success');
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  hasRole(minimumRole) {
    if (!this.isAuthenticated || !this.currentUser) return false;
    
    const userLevel = this.roleHierarchy[this.currentUser.role] || 0;
    const requiredLevel = this.roleHierarchy[minimumRole] || 0;
    
    return userLevel >= requiredLevel;
  },

  canCreateProject() {
    return this.hasRole('Project Manager');
  },

  canEditAnyIssue() {
    return this.hasRole('Team Lead');
  },

  canManageUsers() {
    return this.hasRole('System Administrator');
  },

  canDeleteProject() {
    return this.hasRole('System Administrator');
  },

  canUploadTranscript() {
    return this.hasRole('Project Manager');
  },

  isReadOnly() {
    return this.currentUser && 
           (this.currentUser.role === 'Stakeholder' || 
            this.currentUser.role === 'External Viewer');
  },

  updateUI() {
    console.log('Updating UI, isAuthenticated:', this.isAuthenticated);
    const loggedInState = document.getElementById('loggedInState');
    const loggedOutState = document.getElementById('loggedOutState');

    if (this.isAuthenticated && this.currentUser) {
      loggedInState?.classList.remove('hidden');
      loggedInState?.classList.add('flex');
      loggedOutState?.classList.add('hidden');

      const userNameEl = document.getElementById('userName');
      const userEmailEl = document.getElementById('userEmail');
      const userRoleEl = document.getElementById('userRole');

      if (userNameEl) userNameEl.textContent = this.currentUser.username;
      if (userEmailEl) userEmailEl.textContent = this.currentUser.email;
      
      if (userRoleEl) {
        userRoleEl.textContent = this.currentUser.role;
        userRoleEl.className = this.getRoleBadgeClass(this.currentUser.role);
      }
    } else {
      loggedInState?.classList.add('hidden');
      loggedOutState?.classList.remove('hidden');
      loggedOutState?.classList.add('flex');
    }
    
    this.updateRoleBasedUI();
    this.reattachEventListeners();
  },
  
  reattachEventListeners() {
    document.getElementById('login-btn')?.addEventListener('click', () => window.showLogin());
    document.getElementById('register-btn')?.addEventListener('click', () => window.showRegister());
    document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
    document.getElementById('user-management-link')?.addEventListener('click', () => window.showUserManagement());
  },

  getRoleBadgeClass(role) {
    const badgeClasses = {
      'System Administrator': 'px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800',
      'Project Manager': 'px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800',
      'Team Lead': 'px-2 py-1 text-xs font-semibold rounded bg-purple-100 text-purple-800',
      'Team Member': 'px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800',
      'Stakeholder': 'px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800',
      'External Viewer': 'px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-600'
    };
    return badgeClasses[role] || badgeClasses['Team Member'];
  },

  updateRoleBasedUI() {
    const createProjectBtn = document.querySelector('[data-create-project]');
    if (createProjectBtn) {
      if (this.canCreateProject()) {
        createProjectBtn.classList.remove('hidden');
      } else {
        createProjectBtn.classList.add('hidden');
      }
    }
    
    if (this.isReadOnly()) {
      const createButtons = document.querySelectorAll('[data-requires-write]');
      createButtons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.title = 'Read-only access - cannot create items';
      });
    }
    
    // Hide AI Analysis button for users who cannot upload transcripts
    const aiAnalysisBtn = document.getElementById('ai-analysis-btn');
    if (aiAnalysisBtn) {
      if (this.canUploadTranscript()) {
        aiAnalysisBtn.classList.remove('hidden');
      } else {
        aiAnalysisBtn.classList.add('hidden');
      }
    }
    
    // Hide View Transcripts button for users who cannot upload transcripts
    const viewTranscriptsBtn = document.getElementById('view-transcripts-btn');
    if (viewTranscriptsBtn) {
      if (this.canUploadTranscript()) {
        viewTranscriptsBtn.classList.remove('hidden');
      } else {
        viewTranscriptsBtn.classList.add('hidden');
      }
    }
    
    const userManagementLink = document.getElementById('user-management-link');
    if (userManagementLink) {
      if (this.canManageUsers()) {
        userManagementLink.classList.remove('hidden');
      } else {
        userManagementLink.classList.add('hidden');
      }
    }
  },

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      info: 'bg-blue-500',
      warning: 'bg-yellow-500'
    };

    notification.className = `fixed top-4 right-4 ${bgColors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
};
