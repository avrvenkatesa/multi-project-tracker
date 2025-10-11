// Tags Management
let currentProjectId = null;
let currentProject = null;
let allTags = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  currentProjectId = params.get('projectId');
  
  if (!currentProjectId) {
    alert('No project selected');
    window.location.href = 'index.html';
    return;
  }
  
  await loadProject();
  await loadTags();
});

// Load project details
async function loadProject() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load project');
    }
    
    currentProject = await response.json();
    document.getElementById('project-name').textContent = currentProject.name;
  } catch (error) {
    console.error('Error loading project:', error);
    alert('Error loading project');
  }
}

// Load all tags from issues and action items
async function loadTags() {
  try {
    // Fetch issues and action items
    const [issuesRes, actionItemsRes] = await Promise.all([
      fetch(`/api/projects/${currentProjectId}/issues`, {
        credentials: 'include'
      }),
      fetch(`/api/projects/${currentProjectId}/action-items`, {
        credentials: 'include'
      })
    ]);
    
    if (!issuesRes.ok || !actionItemsRes.ok) {
      throw new Error('Failed to load data');
    }
    
    const issues = await issuesRes.json();
    const actionItems = await actionItemsRes.json();
    
    // Extract and count tags
    const tagMap = new Map();
    
    // Process issues
    issues.forEach(issue => {
      if (issue.tags && Array.isArray(issue.tags)) {
        issue.tags.forEach(tag => {
          if (tag && tag.trim()) {
            const key = tag.toLowerCase().trim();
            if (!tagMap.has(key)) {
              tagMap.set(key, {
                name: tag.trim(),
                issueCount: 0,
                actionItemCount: 0,
                items: []
              });
            }
            const tagData = tagMap.get(key);
            tagData.issueCount++;
            tagData.items.push({ type: 'issue', id: issue.id, title: issue.title });
          }
        });
      }
    });
    
    // Process action items (if they have tags)
    actionItems.forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
          if (tag && tag.trim()) {
            const key = tag.toLowerCase().trim();
            if (!tagMap.has(key)) {
              tagMap.set(key, {
                name: tag.trim(),
                issueCount: 0,
                actionItemCount: 0,
                items: []
              });
            }
            const tagData = tagMap.get(key);
            tagData.actionItemCount++;
            tagData.items.push({ type: 'action-item', id: item.id, title: item.title });
          }
        });
      }
    });
    
    allTags = Array.from(tagMap.values()).sort((a, b) => {
      const totalA = a.issueCount + a.actionItemCount;
      const totalB = b.issueCount + b.actionItemCount;
      return totalB - totalA;
    });
    
    renderTags();
    updateStats();
  } catch (error) {
    console.error('Error loading tags:', error);
    alert('Error loading tags');
  }
}

// Render tags
function renderTags() {
  const container = document.getElementById('tags-list');
  const emptyState = document.getElementById('empty-state');
  
  if (allTags.length === 0) {
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  emptyState.classList.add('hidden');
  
  container.innerHTML = allTags.map(tag => {
    const total = tag.issueCount + tag.actionItemCount;
    const color = getTagColor(total);
    
    return `
      <div class="tag-card bg-white border border-gray-200 rounded-lg p-4 cursor-pointer" onclick="filterByTag('${escapeHtml(tag.name)}')">
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-${color}-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
            </svg>
            <span class="font-semibold text-gray-800">${escapeHtml(tag.name)}</span>
          </div>
          <span class="text-sm font-medium text-${color}-600 bg-${color}-50 px-2 py-1 rounded">${total}</span>
        </div>
        <div class="flex gap-4 text-sm text-gray-600">
          <div>
            <span class="text-green-600 font-medium">${tag.issueCount}</span> Issues
          </div>
          <div>
            <span class="text-purple-600 font-medium">${tag.actionItemCount}</span> Action Items
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Update statistics
function updateStats() {
  const totalTags = allTags.length;
  const tagsOnIssues = allTags.filter(t => t.issueCount > 0).length;
  const tagsOnActions = allTags.filter(t => t.actionItemCount > 0).length;
  
  document.getElementById('total-tags').textContent = totalTags;
  document.getElementById('issue-tags').textContent = tagsOnIssues;
  document.getElementById('action-tags').textContent = tagsOnActions;
}

// Get tag color based on count
function getTagColor(count) {
  if (count >= 10) return 'blue';
  if (count >= 5) return 'green';
  if (count >= 2) return 'yellow';
  return 'gray';
}

// Filter by tag (go back to project with tag filter)
function filterByTag(tagName) {
  window.location.href = `index.html?project=${currentProjectId}&tag=${encodeURIComponent(tagName)}`;
}

// Go back to project
function goBackToProject() {
  window.location.href = `index.html?project=${currentProjectId}`;
}

// Utility function
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
