let currentPreferences = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize AuthManager
  await AuthManager.init();
  
  if (!AuthManager.isAuthenticated) {
    window.location.href = '/index.html';
    return;
  }
  
  // Update user info in header
  document.getElementById('userName').textContent = AuthManager.currentUser.username;
  document.getElementById('userRole').textContent = AuthManager.currentUser.role;
  document.getElementById('userEmail').textContent = AuthManager.currentUser.email;
  document.getElementById('loggedInState').classList.remove('hidden');
  
  // Setup logout
  document.getElementById('logout-btn').addEventListener('click', () => AuthManager.logout());
  
  loadPreferences();
  
  const saveBtn = document.getElementById('save-btn');
  saveBtn.addEventListener('click', savePreferences);
});

async function loadPreferences() {
  try {
    const response = await fetch('/api/notifications/preferences', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load preferences');
    }
    
    currentPreferences = await response.json();
    
    document.getElementById('mentions-enabled').checked = currentPreferences.mentions_enabled !== false;
    document.getElementById('assignments-enabled').checked = currentPreferences.assignments_enabled !== false;
    document.getElementById('status-changes-enabled').checked = currentPreferences.status_changes_enabled !== false;
    document.getElementById('invitations-enabled').checked = currentPreferences.invitations_enabled !== false;
    
    const frequency = currentPreferences.email_frequency || 'immediate';
    document.getElementById(`freq-${frequency.replace('_', '-')}`).checked = true;
    
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('settingsForm').classList.remove('hidden');
    
    checkEmailServiceStatus();
  } catch (error) {
    console.error('Error loading preferences:', error);
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = error.message;
  }
}

async function savePreferences() {
  const saveBtn = document.getElementById('save-btn');
  const saveStatus = document.getElementById('save-status');
  
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  saveStatus.textContent = '';
  saveStatus.className = 'text-sm';
  
  try {
    const preferences = {
      mentions_enabled: document.getElementById('mentions-enabled').checked,
      assignments_enabled: document.getElementById('assignments-enabled').checked,
      status_changes_enabled: document.getElementById('status-changes-enabled').checked,
      invitations_enabled: document.getElementById('invitations-enabled').checked,
      email_frequency: document.querySelector('input[name="email-frequency"]:checked').value
    };
    
    const response = await fetch('/api/notifications/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(preferences)
    });
    
    if (!response.ok) {
      throw new Error('Failed to save preferences');
    }
    
    saveStatus.textContent = '✓ Saved successfully!';
    saveStatus.className = 'text-sm text-green-600 font-semibold';
    
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 3000);
  } catch (error) {
    console.error('Error saving preferences:', error);
    saveStatus.textContent = '✗ Failed to save';
    saveStatus.className = 'text-sm text-red-600 font-semibold';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Preferences';
  }
}

async function checkEmailServiceStatus() {
  const statusEl = document.getElementById('email-service-status');
  
  try {
    const response = await fetch('/api/health', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    
    statusEl.innerHTML = `
      Your notification preferences are saved. Email notifications will be sent according to your settings above.
      <br><br>
      <strong>Note:</strong> The system administrator must configure email service (GMAIL_USER and GMAIL_APP_PASSWORD) for emails to be delivered.
      <br><br>
      <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" class="text-blue-700 underline">
        Learn how to create Gmail App Passwords →
      </a>
    `;
    statusEl.className = 'text-sm text-blue-800';
  } catch (error) {
    console.error('Error checking email service:', error);
    statusEl.textContent = 'Unable to verify email service status. Your preferences have been saved.';
    statusEl.className = 'text-sm text-gray-600';
  }
}
