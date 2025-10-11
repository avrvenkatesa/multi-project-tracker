// Project Edit and Archive Management

// Edit Project
document.addEventListener('click', async (e) => {
  if (e.target.closest('.edit-project-btn')) {
    const projectId = e.target.closest('.edit-project-btn').dataset.projectId;
    await openEditProjectModal(projectId);
  }
  
  if (e.target.closest('.archive-project-btn')) {
    const projectId = e.target.closest('.archive-project-btn').dataset.projectId;
    await archiveProject(projectId);
  }
});

// Open Edit Project Modal
async function openEditProjectModal(projectId) {
  try {
    const response = await fetch('/api/projects', {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to fetch projects');
    
    const projects = await response.json();
    const project = projects.find(p => p.id === parseInt(projectId));
    
    if (!project) {
      alert('Project not found');
      return;
    }
    
    document.getElementById('editProjectId').value = project.id;
    document.getElementById('editProjectName').value = project.name || '';
    document.getElementById('editProjectDescription').value = project.description || '';
    document.getElementById('editProjectTemplate').value = project.template || 'generic';
    document.getElementById('editProjectStartDate').value = project.start_date ? project.start_date.split('T')[0] : '';
    document.getElementById('editProjectEndDate').value = project.end_date ? project.end_date.split('T')[0] : '';
    
    // Populate Teams integration fields
    document.getElementById('editTeamsNotificationsEnabled').checked = project.teams_notifications_enabled || false;
    document.getElementById('editTeamsWebhookUrl').value = project.teams_webhook_url || '';
    
    document.getElementById('editProjectModal').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error opening edit modal:', error);
    alert('Failed to load project details');
  }
}

// Handle Edit Project Form Submit
document.getElementById('editProjectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const projectId = document.getElementById('editProjectId').value;
  const name = document.getElementById('editProjectName').value;
  const description = document.getElementById('editProjectDescription').value;
  const template = document.getElementById('editProjectTemplate').value;
  const start_date = document.getElementById('editProjectStartDate').value || null;
  const end_date = document.getElementById('editProjectEndDate').value || null;
  const teams_notifications_enabled = document.getElementById('editTeamsNotificationsEnabled').checked;
  const teams_webhook_url = document.getElementById('editTeamsWebhookUrl').value || null;
  
  try {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        name, 
        description, 
        template, 
        start_date, 
        end_date,
        teams_notifications_enabled,
        teams_webhook_url
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update project');
    }
    
    alert('Project updated successfully!');
    document.getElementById('editProjectModal').classList.add('hidden');
    
    if (typeof loadProjects === 'function') {
      await loadProjects();
    } else {
      location.reload();
    }
    
  } catch (error) {
    console.error('Error updating project:', error);
    alert(error.message);
  }
});

// Close Edit Modal
document.getElementById('closeEditProjectModal').addEventListener('click', () => {
  document.getElementById('editProjectModal').classList.add('hidden');
});

document.getElementById('cancelEditProject').addEventListener('click', () => {
  document.getElementById('editProjectModal').classList.add('hidden');
});

// Archive Project
async function archiveProject(projectId) {
  if (!confirm('Are you sure you want to archive this project? It will be hidden from the main view but can be restored later.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${projectId}/archive`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to archive project');
    }
    
    alert('Project archived successfully!');
    
    if (typeof loadProjects === 'function') {
      await loadProjects();
    } else {
      location.reload();
    }
    
  } catch (error) {
    console.error('Error archiving project:', error);
    alert(error.message);
  }
}

// View Archived Projects
document.getElementById('viewArchivedBtn').addEventListener('click', async () => {
  await loadArchivedProjects();
  document.getElementById('archivedProjectsModal').classList.remove('hidden');
});

// Close Archived Projects Modal
document.getElementById('closeArchivedProjectsModal').addEventListener('click', () => {
  document.getElementById('archivedProjectsModal').classList.add('hidden');
});

// Load Archived Projects
async function loadArchivedProjects() {
  try {
    const response = await fetch('/api/projects/archived', {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to fetch archived projects');
    
    const data = await response.json();
    const projects = data.projects;
    
    const container = document.getElementById('archivedProjectsList');
    
    if (projects.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-8">No archived projects</p>';
      return;
    }
    
    container.innerHTML = projects.map(project => `
      <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1">
            <h3 class="font-semibold text-lg text-gray-800">${escapeHtml(project.name)}</h3>
            <p class="text-sm text-gray-600">${escapeHtml(project.description || 'No description')}</p>
          </div>
          <span class="px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-700">
            Archived
          </span>
        </div>
        
        <div class="text-xs text-gray-500 mb-3">
          Archived ${formatDate(project.archived_at)} by ${escapeHtml(project.archived_by_username || 'Unknown')}
        </div>
        
        <button 
          class="restore-project-btn bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
          data-project-id="${project.id}">
          🔄 Restore Project
        </button>
      </div>
    `).join('');
    
    document.querySelectorAll('.restore-project-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const projectId = e.target.dataset.projectId;
        await restoreProject(projectId);
      });
    });
    
  } catch (error) {
    console.error('Error loading archived projects:', error);
    document.getElementById('archivedProjectsList').innerHTML = 
      '<p class="text-red-500 text-center py-8">Failed to load archived projects</p>';
  }
}

// Restore Project
async function restoreProject(projectId) {
  if (!confirm('Are you sure you want to restore this project?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${projectId}/restore`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to restore project');
    }
    
    alert('Project restored successfully!');
    document.getElementById('archivedProjectsModal').classList.add('hidden');
    
    if (typeof loadProjects === 'function') {
      await loadProjects();
    } else {
      location.reload();
    }
    
  } catch (error) {
    console.error('Error restoring project:', error);
    alert(error.message);
  }
}

// Utility functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
