let currentGanttInstance = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('projectId');

  await checkAuth();
  setupEventListeners();

  if (projectId) {
    await loadGanttChart(projectId);
  } else {
    document.getElementById('gantt').innerHTML = `
      <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <i class="fas fa-exclamation-triangle text-yellow-600 text-3xl mb-3"></i>
        <p class="text-yellow-800 font-semibold">No project selected.</p>
        <p class="text-yellow-700 text-sm mt-2">Please select a project from the dashboard.</p>
      </div>
    `;
  }
});

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = await response.json();
    document.getElementById('user-display').textContent = currentUser.name || currentUser.username;
  } catch (error) {
    console.error('Authentication check failed:', error);
    window.location.href = '/login.html';
  }
}

function setupEventListeners() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', (e) => {
      const viewMode = e.target.getAttribute('data-view');
      changeView(viewMode);
      
      document.querySelectorAll('[data-view]').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-700');
      });
      e.target.classList.remove('bg-gray-200', 'text-gray-700');
      e.target.classList.add('bg-blue-600', 'text-white');
    });
  });
}

async function loadGanttChart(projectId) {
  try {
    showLoadingSpinner();

    const response = await fetch(`/api/projects/${projectId}/gantt-data`, {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token')
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load Gantt data');
    }

    const ganttData = await response.json();
    
    // Update project name in header
    if (ganttData.projectName) {
      document.getElementById('project-name').textContent = ganttData.projectName;
    }

    if (!ganttData.tasks || ganttData.tasks.length === 0) {
      document.getElementById('gantt').innerHTML = `
        <div class="text-center py-12">
          <i class="fas fa-calendar-times text-gray-300 text-6xl mb-4"></i>
          <p class="text-gray-500 text-lg mb-2">No timeline data available.</p>
          <p class="text-sm text-gray-400">Upload documents or create issues with start/end dates to generate a project schedule.</p>
        </div>
      `;
      hideLoadingSpinner();
      return;
    }

    currentGanttInstance = new Gantt('#gantt', ganttData.tasks, {
      view_mode: 'Week',
      date_format: 'YYYY-MM-DD',
      bar_height: 45,
      bar_corner_radius: 3,
      arrow_curve: 5,
      padding: 20,
      view_modes: ['Quarter Day', 'Half Day', 'Day', 'Week', 'Month'],
      custom_popup_html: function(task) {
        const startDate = new Date(task.start).toLocaleDateString();
        const endDate = new Date(task.end).toLocaleDateString();
        return `
          <div class="details-container" style="padding: 12px;">
            <h5 style="margin: 0 0 8px 0; font-weight: 600;">${task.name}</h5>
            <p style="margin: 4px 0;"><strong>Start:</strong> ${startDate}</p>
            <p style="margin: 4px 0;"><strong>End:</strong> ${endDate}</p>
            <p style="margin: 4px 0;"><strong>Progress:</strong> ${task.progress}%</p>
            ${task.dependencies ? `<p style="margin: 4px 0;"><strong>Dependencies:</strong> ${task.dependencies}</p>` : ''}
          </div>
        `;
      },
      on_click: function(task) {
        console.log('Task clicked:', task);
      },
      on_date_change: async function(task, start, end) {
        console.log('Task dates changed:', task, start, end);
        await updateTaskDates(task.id, start, end);
      },
      on_progress_change: async function(task, progress) {
        console.log('Task progress changed:', task, progress);
        await updateTaskProgress(task.id, progress);
      }
    });

    // Enhance text visibility by adding dark backgrounds behind labels
    enhanceTextVisibility();

    document.getElementById('view-controls').classList.remove('hidden');
    console.log('✅ Gantt chart rendered successfully');
    hideLoadingSpinner();
  } catch (error) {
    console.error('Error loading Gantt chart:', error);
    document.getElementById('gantt').innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-6">
        <i class="fas fa-exclamation-circle text-red-600 text-2xl mb-3"></i>
        <p class="text-red-800 font-semibold">Error loading Gantt chart</p>
        <p class="text-red-700 text-sm mt-2">${error.message}</p>
      </div>
    `;
    hideLoadingSpinner();
  }
}

async function updateTaskDates(issueId, startDate, endDate) {
  try {
    const response = await fetch(`/api/issues/${issueId}/dates`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('token')
      },
      body: JSON.stringify({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update task dates');
    }

    showNotification('Task dates updated successfully', 'success');
  } catch (error) {
    console.error('Error updating task dates:', error);
    showNotification('Failed to update task dates', 'error');
  }
}

async function updateTaskProgress(issueId, progress) {
  try {
    const response = await fetch(`/api/issues/${issueId}/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('token')
      },
      body: JSON.stringify({ progress })
    });

    if (!response.ok) {
      throw new Error('Failed to update task progress');
    }

    showNotification('Task progress updated successfully', 'success');
  } catch (error) {
    console.error('Error updating task progress:', error);
    showNotification('Failed to update task progress', 'error');
  }
}

function changeView(viewMode) {
  if (currentGanttInstance) {
    currentGanttInstance.change_view_mode(viewMode);
    // Re-enhance text visibility after view change
    requestAnimationFrame(() => {
      setTimeout(() => enhanceTextVisibility(), 50);
    });
  }
}

function enhanceTextVisibility() {
  // Add semi-transparent dark backgrounds behind all bar labels for better visibility
  const barGroups = document.querySelectorAll('.gantt .bar-group');
  
  barGroups.forEach(group => {
    const labels = group.querySelectorAll('text.bar-label');
    
    labels.forEach(label => {
      // Skip if already enhanced in this render cycle
      if (label.dataset.enhanced === 'true') return;
      
      try {
        const bbox = label.getBBox();
        
        // Only add background if label has content
        if (bbox.width === 0 || bbox.height === 0) return;
        
        const padding = 4;
        
        // Remove old background if exists
        const oldBg = group.querySelector('.label-bg');
        if (oldBg) oldBg.remove();
        
        // Create background rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', bbox.x - padding);
        rect.setAttribute('y', bbox.y - padding);
        rect.setAttribute('width', bbox.width + (padding * 2));
        rect.setAttribute('height', bbox.height + (padding * 2));
        rect.setAttribute('rx', '3');
        rect.setAttribute('ry', '3');
        rect.classList.add('label-bg');
        
        // Insert background before the label
        group.insertBefore(rect, label);
        label.dataset.enhanced = 'true';
        
        // Ensure text is white and bold
        label.setAttribute('fill', '#ffffff');
        label.style.fontWeight = '700';
        label.style.fontSize = '14px';
      } catch (error) {
        // Silently handle getBBox errors (can occur mid-transition)
        console.debug('Could not enhance label:', error);
      }
    });
  });
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  
  const bgColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500'
  };
  
  notification.className = `fixed top-4 right-4 ${bgColors[type] || bgColors.info} text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity duration-300`;
  notification.style.opacity = '0';
  notification.innerHTML = `
    <div class="flex items-center space-x-2">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

function showLoadingSpinner() {
  const ganttContainer = document.getElementById('gantt');
  const spinner = document.createElement('div');
  spinner.id = 'gantt-loading';
  spinner.className = 'text-center py-12';
  spinner.innerHTML = `
    <i class="fas fa-spinner fa-spin text-5xl text-blue-600 mb-4"></i>
    <p class="text-gray-600 text-lg">Loading timeline...</p>
  `;
  ganttContainer.innerHTML = '';
  ganttContainer.appendChild(spinner);
}

function hideLoadingSpinner() {
  const spinner = document.getElementById('gantt-loading');
  if (spinner) spinner.remove();
}
