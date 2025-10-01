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
}

function renderComment(comment, itemType) {
  const isOwn = comment.user_id === AuthManager.currentUser?.id;
  const canEdit = isOwn;
  const canDelete = isOwn || AuthManager.hasRole('Project Manager');
  
  const commentText = formatCommentText(comment.comment);
  const timeAgo = getTimeAgo(comment.created_at);
  
  return `
    <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition" data-comment-id="${comment.id}">
      <div class="flex justify-between items-start mb-2">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-gray-900">${comment.username}</span>
          <span class="text-xs text-gray-500">${timeAgo}</span>
          ${comment.edited ? '<span class="text-xs text-gray-400 italic">(edited)</span>' : ''}
        </div>
        
        ${canEdit || canDelete ? `
          <div class="flex gap-1">
            ${canEdit ? `
              <button 
                onclick="editComment(${comment.id}, '${itemType}')"
                class="text-gray-600 hover:text-indigo-600 p-1 rounded"
                title="Edit">
                ✏️
              </button>
            ` : ''}
            ${canDelete ? `
              <button 
                onclick="deleteComment(${comment.id}, '${itemType}')"
                class="text-gray-600 hover:text-red-600 p-1 rounded"
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
              @${u.username}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function formatCommentText(text) {
  text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');
  text = text.replace(/`(.+?)`/g, '<code class="bg-gray-200 px-1 py-0.5 rounded text-sm">$1</code>');
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-indigo-600 hover:underline" target="_blank">$1</a>');
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
    buttonContainer.innerHTML = `
      <button 
        onclick="saveCommentEdit(${commentId}, '${itemType}')"
        class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm">
        Save
      </button>
      <button 
        onclick="cancelCommentEdit(${commentId})"
        class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded text-sm">
        Cancel
      </button>
    `;
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
    const response = await axios.get(`/api/projects/${projectId}/members`, { withCredentials: true });
    projectMembers = response.data;
  } catch (error) {
    console.error('Error loading project members:', error);
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
          m.username.toLowerCase().startsWith(searchTerm)
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
  dropdown.innerHTML = matches.map(member => `
    <div 
      class="px-4 py-2 hover:bg-indigo-50 cursor-pointer"
      onclick="insertMention('${member.username}', '${textarea.id}', '${dropdown.id}', ${atPosition})">
      <div class="font-medium">${member.username}</div>
      <div class="text-xs text-gray-500">${member.email}</div>
    </div>
  `).join('');
  
  dropdown.classList.remove('hidden');
}

function hideMentionDropdown(dropdown) {
  dropdown.classList.add('hidden');
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
      <div class="p-4 border-b hover:bg-gray-50 ${mention.read ? 'opacity-60' : 'bg-indigo-50'}"
           onclick="goToMention(${mention.item_id}, '${mention.comment_type}', ${mention.id})">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <p class="text-sm font-medium text-gray-900">
              @${mention.mentioned_by_username} mentioned you
            </p>
            <p class="text-sm text-gray-600 mt-1">${mention.item_title}</p>
            <p class="text-xs text-gray-500 mt-1">${getTimeAgo(mention.created_at)}</p>
          </div>
          ${!mention.read ? '<div class="w-2 h-2 bg-indigo-600 rounded-full"></div>' : ''}
        </div>
      </div>
    `).join('');
    
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
      ${item.description ? `<div class="mt-4"><div class="text-sm text-gray-500">Description</div><div class="mt-1">${item.description}</div></div>` : ''}
    `;
    
    modal.classList.remove('hidden');
    
    if (currentProject) {
      await loadProjectMembers(currentProject.id);
    }
    
    setupMentionAutocomplete('item-detail-new-comment', 'item-detail-mention-dropdown');
    
    await loadItemDetailComments();
    
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

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (AuthManager.isAuthenticated) {
      loadUnreadMentionCount();
      setInterval(loadUnreadMentionCount, 30000);
    }
  });
}
