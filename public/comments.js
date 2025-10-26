// ==================== COMMENT FUNCTIONALITY ====================

let currentItemId = null;
let currentItemType = null;
let projectMembers = [];
let mentionDropdownVisible = false;

async function loadComments(itemId, itemType) {
  try {
    currentItemId = itemId;
    currentItemType = itemType;
    
    const endpoint = itemType === 'issue' 
      ? `/api/issues/${itemId}/comments`
      : `/api/action-items/${itemId}/comments`;
    
    const response = await axios.get(endpoint, { withCredentials: true });
    const comments = response.data;
    
    const countElement = document.getElementById(`${itemType.replace('_', '-')}-comment-count`);
    if (countElement) {
      countElement.textContent = `(${comments.length})`;
    }
    
    renderComments(comments, itemType);
    
  } catch (error) {
    console.error('Error loading comments:', error);
  }
}

function renderComments(comments, itemType) {
  const listId = `${itemType.replace('_', '-')}-comments-list`;
  const container = document.getElementById(listId);
  
  if (!container) return;
  
  if (comments.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        <p>No comments yet. Be the first to comment!</p>
      </div>
    `;
    return;
  }
  
  comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  container.innerHTML = comments.map(comment => renderComment(comment, itemType)).join('');
  
  // Add event listeners for edit/delete buttons
  container.querySelectorAll('.edit-comment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const commentId = parseInt(btn.dataset.commentId);
      const itemType = btn.dataset.itemType;
      editComment(commentId, itemType);
    });
  });
  
  container.querySelectorAll('.delete-comment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const commentId = parseInt(btn.dataset.commentId);
      const itemType = btn.dataset.itemType;
      deleteComment(commentId, itemType);
    });
  });
}

function renderComment(comment, itemType) {
  const isOwn = comment.user_id === AuthManager.currentUser?.id;
  const canEdit = isOwn;
  const canDelete = isOwn || AuthManager.hasRole('Project Manager');
  
  const commentText = formatCommentText(comment.comment);
  const timeAgo = getTimeAgo(comment.created_at);
  const username = escapeHtml(comment.username);
  
  return `
    <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition" data-comment-id="${comment.id}">
      <div class="flex justify-between items-start mb-2">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-gray-900">${username}</span>
          <span class="text-xs text-gray-500">${timeAgo}</span>
          ${comment.edited ? '<span class="text-xs text-gray-400 italic">(edited)</span>' : ''}
        </div>
        
        ${canEdit || canDelete ? `
          <div class="flex gap-1">
            ${canEdit ? `
              <button 
                class="edit-comment-btn text-gray-600 hover:text-indigo-600 p-1 rounded"
                data-comment-id="${comment.id}"
                data-item-type="${itemType}"
                title="Edit">
                ✏️
              </button>
            ` : ''}
            ${canDelete ? `
              <button 
                class="delete-comment-btn text-gray-600 hover:text-red-600 p-1 rounded"
                data-comment-id="${comment.id}"
                data-item-type="${itemType}"
                title="Delete">
                🗑️
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
      
      <div class="text-gray-700 whitespace-pre-wrap comment-content" id="comment-text-${comment.id}">
        ${commentText}
      </div>
      
      ${comment.mentioned_users && comment.mentioned_users.length > 0 ? `
        <div class="mt-2 flex flex-wrap gap-1">
          ${comment.mentioned_users.map(u => `
            <span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
              @${escapeHtml(u.username)}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
    }
  } catch (e) {
  }
  return '';
}

function formatCommentText(text) {
  text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  text = text.replace(/`(.+?)`/g, '<code class="bg-gray-200 px-1 py-0.5 rounded text-sm">$1</code>');
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, (match, linkText, url) => {
    const sanitized = sanitizeUrl(url);
    if (!sanitized) return linkText;
    return `<a href="${sanitized}" class="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });
  text = text.replace(/@(\w+)/g, '<span class="text-indigo-600 font-medium">@$1</span>');
  return text;
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diff = Math.floor((now - then) / 1000);
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  
  return then.toLocaleDateString();
}

async function addComment(itemType) {
  try {
    const textareaId = `${itemType.replace('_', '-')}-new-comment`;
    const textarea = document.getElementById(textareaId);
    const comment = textarea.value.trim();
    
    if (!comment) {
      AuthManager.showNotification('Please enter a comment', 'warning');
      return;
    }
    
    const endpoint = itemType === 'issue'
      ? `/api/issues/${currentItemId}/comments`
      : `/api/action-items/${currentItemId}/comments`;
    
    await axios.post(endpoint, { comment }, { withCredentials: true });
    
    textarea.value = '';
    await loadComments(currentItemId, itemType);
    AuthManager.showNotification('Comment added successfully', 'success');
    await loadUnreadMentionCount();
    
  } catch (error) {
    console.error('Error adding comment:', error);
    AuthManager.showNotification('Failed to add comment', 'error');
  }
}

async function editComment(commentId, itemType) {
  try {
    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    const textElement = commentElement.querySelector(`#comment-text-${commentId}`);
    const originalHTML = textElement.innerHTML;
    const originalText = textElement.textContent.trim();
    
    const textarea = document.createElement('textarea');
    textarea.className = 'w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none';
    textarea.rows = 3;
    textarea.value = originalText;
    
    textElement.dataset.originalHtml = originalHTML;
    textElement.innerHTML = '';
    textElement.appendChild(textarea);
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'flex gap-2 mt-2';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => saveCommentEdit(commentId, itemType));
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded text-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelCommentEdit(commentId));
    
    buttonContainer.appendChild(saveBtn);
    buttonContainer.appendChild(cancelBtn);
    textElement.appendChild(buttonContainer);
    textarea.focus();
    
  } catch (error) {
    console.error('Error editing comment:', error);
  }
}

async function saveCommentEdit(commentId, itemType) {
  try {
    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    const textarea = commentElement.querySelector('textarea');
    const newComment = textarea.value.trim();
    
    if (!newComment) {
      AuthManager.showNotification('Comment cannot be empty', 'warning');
      return;
    }
    
    const endpoint = itemType === 'issue'
      ? `/api/issues/${currentItemId}/comments/${commentId}`
      : `/api/action-items/${currentItemId}/comments/${commentId}`;
    
    await axios.put(endpoint, { comment: newComment }, { withCredentials: true });
    await loadComments(currentItemId, itemType);
    AuthManager.showNotification('Comment updated successfully', 'success');
    
  } catch (error) {
    console.error('Error saving comment:', error);
    AuthManager.showNotification('Failed to update comment', 'error');
  }
}

function cancelCommentEdit(commentId) {
  const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
  const textElement = commentElement.querySelector(`#comment-text-${commentId}`);
  const originalHTML = textElement.dataset.originalHtml;
  textElement.innerHTML = originalHTML;
  delete textElement.dataset.originalHtml;
}

async function deleteComment(commentId, itemType) {
  if (!confirm('Are you sure you want to delete this comment?')) {
    return;
  }
  
  try {
    const endpoint = itemType === 'issue'
      ? `/api/issues/${currentItemId}/comments/${commentId}`
      : `/api/action-items/${currentItemId}/comments/${commentId}`;
    
    await axios.delete(endpoint, { withCredentials: true });
    await loadComments(currentItemId, itemType);
    AuthManager.showNotification('Comment deleted successfully', 'success');
    
  } catch (error) {
    console.error('Error deleting comment:', error);
    AuthManager.showNotification('Failed to delete comment', 'error');
  }
}

// ==================== MENTION AUTOCOMPLETE ====================

async function loadProjectMembers(projectId) {
  try {
    const response = await axios.get(`/api/projects/${projectId}/team`, { withCredentials: true });
    projectMembers = response.data;
  } catch (error) {
    console.error('Error loading project members:', error);
    projectMembers = [];
  }
}

function setupMentionAutocomplete(textareaId, dropdownId) {
  const textarea = document.getElementById(textareaId);
  const dropdown = document.getElementById(dropdownId);
  
  if (!textarea || !dropdown) return;
  
  textarea.addEventListener('input', () => {
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtSymbol !== -1 && cursorPos - lastAtSymbol > 0) {
      const searchTerm = textBeforeCursor.substring(lastAtSymbol + 1).toLowerCase();
      
      if (searchTerm.length > 0 && !searchTerm.includes(' ')) {
        const matches = projectMembers.filter(m => 
          m.name.toLowerCase().startsWith(searchTerm)
        );
        
        if (matches.length > 0) {
          showMentionDropdown(dropdown, matches, textarea, lastAtSymbol);
          return;
        }
      }
    }
    
    hideMentionDropdown(dropdown);
  });
  
  textarea.addEventListener('blur', () => {
    setTimeout(() => hideMentionDropdown(dropdown), 200);
  });
}

function showMentionDropdown(dropdown, matches, textarea, atPosition) {
  if (!dropdown) return;
  
  dropdown.innerHTML = matches.map(member => {
    const username = escapeHtml(member.name);
    const email = escapeHtml(member.email);
    return `
      <div 
        class="mention-item px-4 py-2 hover:bg-indigo-50 cursor-pointer"
        data-username="${username}"
        data-textarea-id="${textarea.id}"
        data-dropdown-id="${dropdown.id}"
        data-at-position="${atPosition}">
        <div class="font-medium">${username}</div>
        <div class="text-xs text-gray-500">${email}</div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to mention items
  dropdown.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('click', () => {
      const username = item.dataset.username;
      const textareaId = item.dataset.textareaId;
      const dropdownId = item.dataset.dropdownId;
      const atPos = parseInt(item.dataset.atPosition);
      insertMention(username, textareaId, dropdownId, atPos);
    });
  });
  
  dropdown.style.display = 'block';
}

function hideMentionDropdown(dropdown) {
  if (!dropdown) return;
  dropdown.style.display = 'none';
}

function insertMention(username, textareaId, dropdownId, atPosition) {
  const textarea = document.getElementById(textareaId);
  const dropdown = document.getElementById(dropdownId);
  const text = textarea.value;
  const beforeAt = text.substring(0, atPosition);
  const afterCursor = text.substring(textarea.selectionStart);
  
  textarea.value = `${beforeAt}@${username} ${afterCursor}`;
  textarea.focus();
  const newCursorPos = atPosition + username.length + 2;
  textarea.setSelectionRange(newCursorPos, newCursorPos);
  
  hideMentionDropdown(dropdown);
}

// ==================== MENTION NOTIFICATIONS ====================

async function loadUnreadMentionCount() {
  try {
    const response = await axios.get('/api/mentions/unread-count', { withCredentials: true });
    const count = response.data.count;
    
    const badge = document.getElementById('mention-count-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Error loading mention count:', error);
  }
}

async function toggleMentionNotifications() {
  const dropdown = document.getElementById('mention-notifications-dropdown');
  if (!dropdown) return;
  
  if (dropdown.classList.contains('hidden')) {
    await loadMentionNotifications();
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}

async function loadMentionNotifications() {
  try {
    const response = await axios.get('/api/mentions', { withCredentials: true });
    const mentions = response.data;
    
    const container = document.getElementById('mention-notifications-list');
    if (!container) return;
    
    if (mentions.length === 0) {
      container.innerHTML = `
        <div class="p-4 text-center text-gray-500">
          No mentions yet
        </div>
      `;
      return;
    }
    
    container.innerHTML = mentions.map(mention => `
      <div class="mention-item cursor-pointer p-4 border-b hover:bg-gray-50 ${mention.read ? 'opacity-60' : 'bg-indigo-50'}"
           data-item-id="${mention.item_id}"
           data-comment-type="${mention.comment_type}"
           data-mention-id="${mention.id}">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-900">
              @${escapeHtml(mention.mentioned_by_username)} mentioned you
            </p>
            <p class="text-sm text-gray-600 mt-1">${escapeHtml(mention.item_title)}</p>
            <p class="text-xs text-gray-500 mt-1">${getTimeAgo(mention.created_at)}</p>
          </div>
          ${!mention.read ? '<div class="w-2 h-2 bg-indigo-600 rounded-full"></div>' : ''}
        </div>
      </div>
    `).join('');
    
    // Add event listeners for mention items
    container.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => {
        const itemId = parseInt(item.dataset.itemId);
        const commentType = item.dataset.commentType;
        const mentionId = parseInt(item.dataset.mentionId);
        goToMention(itemId, commentType, mentionId);
      });
    });
    
  } catch (error) {
    console.error('Error loading mentions:', error);
  }
}

async function goToMention(itemId, commentType, mentionId) {
  try {
    await axios.put(`/api/mentions/${mentionId}/read`, {}, { withCredentials: true });
    
    const dropdown = document.getElementById('mention-notifications-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    
    await loadUnreadMentionCount();
    
    AuthManager.showNotification(`Opening ${commentType === 'issue' ? 'issue' : 'action item'}...`, 'info');
    
    await openItemDetailModal(itemId, commentType === 'issue' ? 'issue' : 'action-item');
    
  } catch (error) {
    console.error('Error marking mention as read:', error);
  }
}

async function markAllMentionsRead() {
  try {
    await axios.put('/api/mentions/read-all', {}, { withCredentials: true });
    await loadUnreadMentionCount();
    await loadMentionNotifications();
    AuthManager.showNotification('All mentions marked as read', 'success');
  } catch (error) {
    console.error('Error marking all mentions as read:', error);
  }
}

// ==================== ITEM DETAIL MODAL ====================

// Create due date badge with color coding
function createDueDateBadge(dueDate) {
  if (!dueDate) {
    return `<div class="due-date-badge none">
      <i class="fas fa-calendar-times"></i>
      <span>No due date</span>
    </div>`;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let badgeClass, icon, text;
  
  if (diffDays < 0) {
    // Overdue
    badgeClass = 'overdue';
    icon = 'fa-exclamation-circle';
    text = Math.abs(diffDays) === 1 ? '1 day overdue' : `${Math.abs(diffDays)} days overdue`;
  } else if (diffDays === 0) {
    // Due today
    badgeClass = 'today';
    icon = 'fa-calendar-day';
    text = 'Due today';
  } else if (diffDays === 1) {
    // Due tomorrow
    badgeClass = 'soon';
    icon = 'fa-clock';
    text = 'Due tomorrow';
  } else if (diffDays <= 3) {
    // Due soon (2-3 days)
    badgeClass = 'soon';
    icon = 'fa-clock';
    text = `Due in ${diffDays} days`;
  } else {
    // Future
    badgeClass = 'future';
    icon = 'fa-calendar';
    text = `Due in ${diffDays} days`;
  }
  
  return `<div class="due-date-badge ${badgeClass}">
    <i class="fas ${icon}"></i>
    <span>${text}</span>
  </div>`;
}

async function openItemDetailModal(itemId, itemType) {
  try {
    currentItemId = itemId;
    currentItemType = itemType;
    
    const modal = document.getElementById('item-detail-modal');
    const title = document.getElementById('item-detail-title');
    const info = document.getElementById('item-detail-info');
    
    const endpoint = itemType === 'issue' 
      ? `/api/issues/${itemId}`
      : `/api/action-items/${itemId}`;
    
    const response = await axios.get(endpoint, { withCredentials: true });
    const item = response.data;
    
    // Set global state for relationship buttons
    currentDetailItem = { id: itemId, type: itemType, title: item.title };
    
    title.textContent = item.title;
    
    info.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div class="text-sm text-gray-500">Status</div>
          <div class="font-medium">${item.status}</div>
        </div>
        <div>
          <div class="text-sm text-gray-500">Priority</div>
          <div class="font-medium">${item.priority || 'N/A'}</div>
        </div>
        <div>
          <div class="text-sm text-gray-500">Assigned To</div>
          <div class="font-medium">${item.assignee || 'Unassigned'}</div>
        </div>
        <div>
          <div class="text-sm text-gray-500">Created</div>
          <div class="font-medium">${new Date(item.created_at).toLocaleDateString()}</div>
        </div>
      </div>
      <div class="mt-4">
        <div class="text-sm text-gray-500 mb-2">Due Date</div>
        ${createDueDateBadge(item.due_date)}
      </div>
      ${item.description ? `<div class="mt-4"><div class="text-sm text-gray-500">Description</div><div class="mt-1">${item.description}</div></div>` : ''}
    `;
    
    modal.classList.remove('hidden');
    
    // Reset to details tab
    switchItemDetailTab('details');
    
    // Setup tabs
    setupItemDetailTabs();
    
    // Check permissions for edit/delete buttons
    const currentUser = AuthManager.currentUser;
    const isOwner = currentUser && parseInt(item.created_by, 10) === parseInt(currentUser.id, 10);
    const isAssignee = currentUser && item.assignee === currentUser.username;
    
    const roleHierarchy = {
      'System Administrator': 5,
      'Project Manager': 4,
      'Team Lead': 3,
      'Team Member': 2,
      'Stakeholder': 1,
      'External Viewer': 0
    };
    const userRoleLevel = currentUser ? (roleHierarchy[currentUser.role] || 0) : 0;
    const isTeamLeadOrAbove = userRoleLevel >= roleHierarchy['Team Lead'];
    
    const canEdit = isOwner || isAssignee || isTeamLeadOrAbove;
    const canDelete = isTeamLeadOrAbove;
    
    // Set global permission flag for effort estimates tab
    if (typeof currentUserCanEdit !== 'undefined') {
      currentUserCanEdit = canEdit;
    }
    
    // Show/hide edit and delete buttons based on permissions
    const editBtn = document.getElementById('item-detail-edit-btn');
    const deleteBtn = document.getElementById('item-detail-delete-btn');
    const generateBtn = document.getElementById('item-detail-generate-btn');
    
    if (editBtn) {
      editBtn.style.display = canEdit ? 'flex' : 'none';
      editBtn.dataset.itemId = itemId;
      editBtn.dataset.itemType = itemType;
    }
    if (deleteBtn) {
      deleteBtn.style.display = canDelete ? 'flex' : 'none';
      deleteBtn.dataset.itemId = itemId;
      deleteBtn.dataset.itemType = itemType;
    }
    if (generateBtn) {
      generateBtn.dataset.itemId = itemId;
      generateBtn.dataset.itemType = itemType;
      generateBtn.dataset.itemTitle = item.title || '';
    }
    
    if (currentProject) {
      await loadProjectMembers(currentProject.id);
    }
    
    setupMentionAutocomplete('item-detail-new-comment', 'item-detail-mention-dropdown');
    
    await loadItemDetailComments();
    await loadItemDetailAttachments();
    await loadChecklistCount();
    
  } catch (error) {
    console.error('Error opening item detail:', error);
    AuthManager.showNotification('Failed to load item details', 'error');
  }
}

function closeItemDetailModal() {
  const modal = document.getElementById('item-detail-modal');
  modal.classList.add('hidden');
  currentItemId = null;
  currentItemType = null;
  currentDetailItem = null;
}

async function loadItemDetailComments() {
  try {
    const endpoint = currentItemType === 'issue' 
      ? `/api/issues/${currentItemId}/comments`
      : `/api/action-items/${currentItemId}/comments`;
    
    const response = await axios.get(endpoint, { withCredentials: true });
    const comments = response.data;
    
    const countElement = document.getElementById('item-detail-comment-count');
    if (countElement) {
      countElement.textContent = `(${comments.length})`;
    }
    
    const container = document.getElementById('item-detail-comments-list');
    if (!container) return;
    
    if (comments.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <p>No comments yet. Be the first to comment!</p>
        </div>
      `;
      return;
    }
    
    comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    container.innerHTML = comments.map(comment => renderComment(comment, currentItemType)).join('');
    
    // Add event listeners for edit/delete buttons
    container.querySelectorAll('.edit-comment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = parseInt(btn.dataset.commentId);
        const itemType = btn.dataset.itemType;
        editComment(commentId, itemType);
      });
    });
    
    container.querySelectorAll('.delete-comment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = parseInt(btn.dataset.commentId);
        const itemType = btn.dataset.itemType;
        deleteComment(commentId, itemType);
      });
    });
    
  } catch (error) {
    console.error('Error loading comments:', error);
  }
}

async function addItemDetailComment() {
  try {
    const textarea = document.getElementById('item-detail-new-comment');
    const comment = textarea.value.trim();
    
    if (!comment) {
      AuthManager.showNotification('Please enter a comment', 'warning');
      return;
    }
    
    const endpoint = currentItemType === 'issue'
      ? `/api/issues/${currentItemId}/comments`
      : `/api/action-items/${currentItemId}/comments`;
    
    await axios.post(endpoint, { comment }, { withCredentials: true });
    
    textarea.value = '';
    await loadItemDetailComments();
    AuthManager.showNotification('Comment added successfully', 'success');
    await loadUnreadMentionCount();
    
  } catch (error) {
    console.error('Error adding comment:', error);
    AuthManager.showNotification('Failed to add comment', 'error');
  }
}

// ==================== ATTACHMENTS ====================

async function loadItemDetailAttachments() {
  try {
    const entityType = currentItemType === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(`/api/${entityType}/${currentItemId}/attachments`, {
      withCredentials: true
    });
    
    const attachments = response.data;
    
    const countElement = document.getElementById('item-detail-attachment-count');
    if (countElement) {
      countElement.textContent = `(${attachments.length})`;
    }
    
    const container = document.getElementById('item-detail-attachments-list');
    if (!container) return;
    
    if (attachments.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-400">
          <svg class="mx-auto h-12 w-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p>No attachments yet</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="space-y-2">
        ${attachments.map(att => renderAttachment(att)).join('')}
      </div>
    `;
    
    // Add event listeners for delete buttons
    container.querySelectorAll('.delete-attachment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const attachmentId = btn.dataset.attachmentId;
        deleteAttachment(attachmentId);
      });
    });
    
  } catch (error) {
    console.error('Error loading attachments:', error);
  }
}

function renderAttachment(attachment) {
  const uploadedAt = new Date(attachment.uploaded_at).toLocaleDateString();
  const fileSize = formatFileSize(attachment.file_size);
  const fileIcon = getFileIcon(attachment.file_type);
  
  return `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <div class="text-2xl">${fileIcon}</div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm truncate">${attachment.original_name}</div>
          <div class="text-xs text-gray-500">
            ${fileSize} • Uploaded by ${attachment.uploader_name || 'Unknown'} on ${uploadedAt}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 ml-2">
        <a href="/api/attachments/${attachment.id}/download" 
           class="text-indigo-600 hover:text-indigo-700 p-2"
           title="Download">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
        <button class="delete-attachment-btn text-red-600 hover:text-red-700 p-2"
                data-attachment-id="${attachment.id}"
                title="Delete">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  `;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('zip')) return '📦';
  if (mimeType.includes('text')) return '📃';
  return '📎';
}

async function deleteAttachment(attachmentId) {
  if (!confirm('Are you sure you want to delete this attachment?')) {
    return;
  }
  
  try {
    await axios.delete(`/api/attachments/${attachmentId}`, {
      withCredentials: true
    });
    
    AuthManager.showNotification('Attachment deleted successfully', 'success');
    await loadItemDetailAttachments();
    
  } catch (error) {
    console.error('Error deleting attachment:', error);
    AuthManager.showNotification(error.response?.data?.error || 'Failed to delete attachment', 'error');
  }
}

async function uploadItemDetailAttachment() {
  const fileInput = document.getElementById('item-detail-attachment-upload');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    return;
  }
  
  const formData = new FormData();
  for (let i = 0; i < fileInput.files.length; i++) {
    formData.append('files', fileInput.files[i]);
  }
  
  try {
    const entityType = currentItemType === 'issue' ? 'issues' : 'action-items';
    await axios.post(`/api/${entityType}/${currentItemId}/attachments`, formData, {
      withCredentials: true,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    AuthManager.showNotification(`${fileInput.files.length} file(s) uploaded successfully`, 'success');
    fileInput.value = '';
    await loadItemDetailAttachments();
    
  } catch (error) {
    console.error('Error uploading attachments:', error);
    AuthManager.showNotification(error.response?.data?.error || 'Failed to upload attachments', 'error');
  }
}

// ==================== TAB MANAGEMENT ====================

function setupItemDetailTabs() {
  const tabButtons = document.querySelectorAll('.item-detail-tab-btn');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      switchItemDetailTab(tabName);
    });
  });
}

function switchItemDetailTab(tabName) {
  const tabButtons = document.querySelectorAll('.item-detail-tab-btn');
  const tabPanels = document.querySelectorAll('.item-detail-tab-panel');
  
  // Update active button
  tabButtons.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.remove('border-transparent', 'text-gray-600');
      btn.classList.add('border-blue-500', 'text-blue-600', 'font-medium');
    } else {
      btn.classList.remove('border-blue-500', 'text-blue-600', 'font-medium');
      btn.classList.add('border-transparent', 'text-gray-600');
    }
  });
  
  // Show/hide panels
  tabPanels.forEach(panel => {
    if (panel.id === `${tabName}-tab`) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  });
  
  // Load content for specific tabs
  if (tabName === 'checklists' && currentItemId && currentItemType) {
    loadLinkedChecklists();
  }
  
  if (tabName === 'effort-estimates' && currentItemId && currentItemType) {
    loadEffortEstimatesTab();
  }
}

// ==================== CHECKLISTS TAB ====================

async function loadChecklistCount() {
  try {
    const endpoint = currentItemType === 'issue' 
      ? `/api/issues/${currentItemId}/checklists`
      : `/api/action-items/${currentItemId}/checklists`;
    
    const response = await axios.get(endpoint, { withCredentials: true });
    const data = response.data;
    
    // Update count badges
    const countElement = document.getElementById('item-detail-checklist-count');
    const countTabElement = document.getElementById('item-detail-checklist-count-tab');
    if (countElement) countElement.textContent = `(${data.count})`;
    if (countTabElement) countTabElement.textContent = `(${data.count})`;
    
  } catch (error) {
    console.error('Error loading checklist count:', error);
  }
}

async function loadLinkedChecklists() {
  const container = document.getElementById('linked-checklists-container');
  if (!container) return;
  
  container.innerHTML = '<div class="text-center py-8 text-gray-500">Loading checklists...</div>';
  
  try {
    const endpoint = currentItemType === 'issue' 
      ? `/api/issues/${currentItemId}/checklists`
      : `/api/action-items/${currentItemId}/checklists`;
    
    const response = await axios.get(endpoint, { withCredentials: true });
    const data = response.data;
    
    // Update count badges
    const countElement = document.getElementById('item-detail-checklist-count');
    const countTabElement = document.getElementById('item-detail-checklist-count-tab');
    if (countElement) countElement.textContent = `(${data.count})`;
    if (countTabElement) countTabElement.textContent = `(${data.count})`;
    
    if (data.checklists.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p class="mb-2">No checklists linked to this ${currentItemType}</p>
          <p class="text-sm">Checklists can be created from the Generate Checklist button on the card</p>
        </div>
      `;
      return;
    }
    
    // Render checklists
    container.innerHTML = data.checklists.map(checklist => `
      <div class="checklist-item p-4 border rounded-lg hover:bg-gray-50 transition-colors">
        <div class="flex justify-between items-start mb-3">
          <div class="flex-1">
            <h4 class="font-semibold text-gray-900">${escapeHtml(checklist.title)}</h4>
            ${checklist.template_name ? `<p class="text-sm text-gray-600 mt-1">Template: ${escapeHtml(checklist.template_name)}</p>` : ''}
            ${checklist.description ? `<p class="text-sm text-gray-500 mt-1">${escapeHtml(checklist.description)}</p>` : ''}
          </div>
          <span class="text-sm px-2.5 py-1 rounded-full font-medium ${
            checklist.completion.percentage === 100 
              ? 'bg-green-100 text-green-800' 
              : checklist.completion.percentage > 0 
                ? 'bg-blue-100 text-blue-800' 
                : 'bg-gray-100 text-gray-600'
          }">
            ${checklist.completion.percentage}%
          </span>
        </div>
        
        <!-- Progress Bar -->
        <div class="mb-3">
          <div class="flex justify-between text-xs text-gray-600 mb-1.5">
            <span>${checklist.completion.completed} of ${checklist.completion.total} items completed</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              class="h-2.5 rounded-full transition-all ${
                checklist.completion.percentage === 100 
                  ? 'bg-green-500' 
                  : 'bg-blue-500'
              }" 
              style="width: ${checklist.completion.percentage}%"
            ></div>
          </div>
        </div>
        
        <!-- Actions -->
        <div class="flex gap-2">
          <a 
            href="checklist-fill.html?id=${checklist.id}"
            target="_blank"
            class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            View Checklist →
          </a>
          <button 
            class="unlink-checklist-btn text-sm px-3 py-1.5 bg-white text-gray-800 border border-gray-300 rounded hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer"
            data-checklist-id="${checklist.id}"
          >
            Unlink
          </button>
        </div>
      </div>
    `).join('');
    
    // Add event listeners for unlink buttons (CSP-compliant)
    container.querySelectorAll('.unlink-checklist-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const checklistId = parseInt(btn.dataset.checklistId);
        unlinkChecklist(checklistId);
      });
    });
    
  } catch (error) {
    console.error('Error loading checklists:', error);
    container.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load checklists</div>';
  }
}

async function unlinkChecklist(checklistId) {
  if (!confirm('Unlink this checklist? The checklist will not be deleted, just unlinked from this item.')) {
    return;
  }
  
  try {
    await axios.delete(`/api/checklists/${checklistId}/link`, {
      withCredentials: true
    });
    
    AuthManager.showNotification('Checklist unlinked successfully', 'success');
    
    // Reload checklists
    await loadLinkedChecklists();
    
  } catch (error) {
    console.error('Error unlinking checklist:', error);
    AuthManager.showNotification(error.response?.data?.error || 'Failed to unlink checklist', 'error');
  }
}

// Make unlinkChecklist available globally
window.unlinkChecklist = unlinkChecklist;

// ==================== RELATIONSHIPS PLACEHOLDER ====================

function addRelationship(type) {
  AuthManager.showNotification(
    `Relationship management is coming soon! This will allow you to add ${type} relationships.`,
    'info'
  );
}

// Make addRelationship available globally
window.addRelationship = addRelationship;

// ==================== DOM READY ====================

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners for notification bell and modal buttons
    const bellBtn = document.getElementById('mention-bell-btn');
    if (bellBtn) {
      bellBtn.addEventListener('click', toggleMentionNotifications);
    }
    
    const markAllReadBtn = document.getElementById('mark-all-read-btn');
    if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', markAllMentionsRead);
    }
    
    const closeModalBtn = document.getElementById('close-item-detail-btn');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', closeItemDetailModal);
    }
    
    const addCommentBtn = document.getElementById('add-item-detail-comment-btn');
    if (addCommentBtn) {
      addCommentBtn.addEventListener('click', addItemDetailComment);
    }
    
    const attachmentUploadInput = document.getElementById('item-detail-attachment-upload');
    if (attachmentUploadInput) {
      attachmentUploadInput.addEventListener('change', uploadItemDetailAttachment);
    }
    
    const editBtn = document.getElementById('item-detail-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', handleEditItemFromModal);
    }
    
    const deleteBtn = document.getElementById('item-detail-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', handleDeleteItemFromModal);
    }
    
    const generateBtn = document.getElementById('item-detail-generate-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', handleGenerateFromDocument);
    }
    
    if (AuthManager.isAuthenticated) {
      loadUnreadMentionCount();
      setInterval(loadUnreadMentionCount, 30000);
    }
  });
}

// ==================== EDIT & DELETE FROM MODAL ====================

function handleEditItemFromModal(e) {
  const btn = e.currentTarget;
  const itemId = parseInt(btn.dataset.itemId);
  const itemType = btn.dataset.itemType;
  
  if (!itemId || !itemType) {
    console.error('Missing item ID or type');
    return;
  }
  
  // Store the return state for when edit modal closes
  window.returnToDetailModal = {
    itemId: itemId,
    itemType: itemType
  };
  
  // Close the modal
  closeItemDetailModal();
  
  // Open the edit modal (this function should exist in app.js)
  if (typeof openEditModal === 'function') {
    openEditModal(itemId, itemType);
  } else {
    console.error('openEditModal function not found');
  }
}

async function handleDeleteItemFromModal(e) {
  const btn = e.currentTarget;
  const itemId = parseInt(btn.dataset.itemId);
  const itemType = btn.dataset.itemType;
  
  if (!itemId || !itemType) {
    console.error('Missing item ID or type');
    return;
  }
  
  if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
    return;
  }
  
  try {
    const endpoint = itemType === 'issue' 
      ? `/api/issues/${itemId}`
      : `/api/action-items/${itemId}`;
    
    await axios.delete(endpoint, { withCredentials: true });
    
    AuthManager.showNotification('Item deleted successfully', 'success');
    
    // Close modal
    closeItemDetailModal();
    
    // Reload the board (this function should exist in app.js)
    if (typeof loadKanbanBoard === 'function') {
      loadKanbanBoard();
    } else if (typeof loadActionItems === 'function') {
      loadActionItems();
    }
    
  } catch (error) {
    console.error('Error deleting item:', error);
    AuthManager.showNotification(error.response?.data?.error || 'Failed to delete item', 'error');
  }
}

function handleGenerateFromDocument(e) {
  const btn = e.currentTarget;
  const itemId = parseInt(btn.dataset.itemId);
  const itemType = btn.dataset.itemType;
  const itemTitle = btn.dataset.itemTitle || '';
  
  if (!itemId || !itemType) {
    console.error('Missing item ID or type');
    return;
  }
  
  // Close the detail modal
  closeItemDetailModal();
  
  // Open the AI checklist modal (this function should exist in app.js)
  if (typeof openAIChecklistModal === 'function') {
    openAIChecklistModal(itemId, itemType, itemTitle);
  } else {
    console.error('openAIChecklistModal function not found');
  }
}
