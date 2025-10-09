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

  pendingInvitationToken: null,
  invitationPreview: null,

  async init() {
    console.log('AuthManager initializing...');
    
    // Check for invitation token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const invitationToken = urlParams.get('token');
    
    if (invitationToken) {
      this.pendingInvitationToken = invitationToken;
      await this.loadInvitationPreview(invitationToken);
    }
    
    await this.checkAuthStatus();
    
    // After auth check, try to auto-accept pending invitation
    if (this.isAuthenticated) {
      const accepted = await this.checkAndAcceptPendingInvitation();
      
      // If no cookie-based invitation but we have a URL token, accept it directly
      if (!accepted && this.pendingInvitationToken) {
        await this.acceptInvitation(this.pendingInvitationToken);
      }
    }
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
    
    // Load invitation count if authenticated
    if (this.isAuthenticated) {
      this.updateInvitationCount();
    }
  },

  async loadInvitationPreview(token) {
    try {
      const response = await fetch(`/api/invitations/${token}/preview`);
      if (response.ok) {
        this.invitationPreview = await response.json();
        this.showInvitationBanner();
      } else {
        this.invitationPreview = null;
        this.pendingInvitationToken = null;
      }
    } catch (error) {
      console.error('Error loading invitation preview:', error);
      this.invitationPreview = null;
    }
  },

  showInvitationBanner() {
    if (!this.invitationPreview) return;
    
    const banner = document.createElement('div');
    banner.className = 'fixed top-0 left-0 right-0 bg-blue-600 text-white px-4 py-3 shadow-lg z-50';
    banner.innerHTML = `
      <div class="max-w-6xl mx-auto flex items-center justify-between">
        <div>
          <strong>📧 Team Invitation:</strong> ${this.escapeHtml(this.invitationPreview.inviterName)} invited you to join 
          <strong>${this.escapeHtml(this.invitationPreview.projectName)}</strong> as ${this.escapeHtml(this.invitationPreview.role)}
        </div>
        ${!this.isAuthenticated ? '<span class="text-sm">Please log in or register to accept</span>' : ''}
      </div>
    `;
    document.body.prepend(banner);
    
    // Add padding to body to account for banner
    document.body.style.paddingTop = '60px';
  },

  async checkAndAcceptPendingInvitation() {
    try {
      const response = await fetch('/api/invitations/pending', {
        credentials: 'include'
      });
      
      if (!response.ok) return false;
      
      const data = await response.json();
      
      if (data.hasPending && data.token) {
        // Auto-accept the invitation
        await this.acceptInvitation(data.token);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking pending invitation:', error);
      return false;
    }
  },

  async acceptInvitation(token) {
    try {
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        this.showNotification(
          `Successfully joined ${data.alreadyMember ? '' : 'the project!'}`, 
          'success'
        );
        
        // Clean up URL and reload to show the new project
        const url = new URL(window.location);
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url);
        
        // Remove banner if it exists
        document.body.style.paddingTop = '';
        
        // Redirect to the project after a short delay
        setTimeout(() => {
          window.location.href = `/index.html?project=${data.projectId}`;
        }, 1000);
      } else {
        this.showNotification(data.error || 'Failed to accept invitation', 'error');
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      this.showNotification('Failed to accept invitation', 'error');
    }
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async register(username, email, password) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          username, 
          email, 
          password,
          invitationToken: this.pendingInvitationToken 
        })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.updateUI();
        this.updateInvitationCount();
        this.showNotification('Registration successful!', 'success');
        
        // Check and auto-accept pending invitation
        if (data.hasPendingInvitation) {
          await this.checkAndAcceptPendingInvitation();
        }
        
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
        body: JSON.stringify({ 
          email, 
          password,
          invitationToken: this.pendingInvitationToken 
        })
      });

      const data = await response.json();

      if (response.ok) {
        this.currentUser = data.user;
        this.isAuthenticated = true;
        this.updateUI();
        this.updateInvitationCount();
        this.showNotification('Login successful!', 'success');
        
        // Check and auto-accept pending invitation
        if (data.hasPendingInvitation) {
          await this.checkAndAcceptPendingInvitation();
        }
        
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
    
    // Show View Archived button for all authenticated users
    const viewArchivedBtn = document.getElementById('viewArchivedBtn');
    if (viewArchivedBtn) {
      if (this.isAuthenticated) {
        viewArchivedBtn.classList.remove('hidden');
      } else {
        viewArchivedBtn.classList.add('hidden');
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
    
    const adminToolsLink = document.getElementById('admin-tools-link');
    if (adminToolsLink) {
      if (this.canManageUsers()) {
        adminToolsLink.classList.remove('hidden');
      } else {
        adminToolsLink.classList.add('hidden');
      }
    }
  },

  async updateInvitationCount() {
    try {
      const response = await fetch('/api/invitations/me', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const invitations = await response.json();
        const count = invitations.length;
        
        const badge = document.getElementById('invitation-count-badge');
        if (badge) {
          if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
            badge.classList.add('flex');
          } else {
            badge.classList.add('hidden');
            badge.classList.remove('flex');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching invitation count:', error);
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
