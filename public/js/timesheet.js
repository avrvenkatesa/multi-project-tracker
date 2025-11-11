// ============= TIMESHEET & TIME ENTRIES FUNCTIONALITY =============

let currentTimesheetItemType = null;
let currentTimesheetItemId = null;

// Open timesheet modal
async function openTimesheetModal(itemType, itemId, itemTitle, itemCreatedAt = null) {
  currentTimesheetItemType = itemType;
  currentTimesheetItemId = itemId;
  
  // Update modal title
  const modalTitle = document.getElementById('timesheetModalTitle');
  modalTitle.innerHTML = `${IconFactory.renderInline('clock', { customClass: 'mr-2' })} Timesheet: ${escapeHtml(itemTitle)}`;
  
  // Clear form
  document.getElementById('quick-log-hours').value = '';
  document.getElementById('quick-log-notes').value = '';
  
  // Set up date field
  const dateInput = document.getElementById('quick-log-date');
  const today = new Date().toISOString().split('T')[0];
  
  // Set default to today
  dateInput.value = today;
  
  // Set min date (item creation date) and max date (today)
  if (itemCreatedAt) {
    const createdDate = new Date(itemCreatedAt).toISOString().split('T')[0];
    dateInput.min = createdDate;
  }
  dateInput.max = today;
  
  // Load entries
  await loadTimesheetEntries();
  
  // Show modal
  document.getElementById('timesheetModal').classList.remove('hidden');
}

// Load timesheet entries
async function loadTimesheetEntries() {
  try {
    const itemTypeUrl = currentTimesheetItemType === 'issue' ? 'issues' : 'action-items';
    const response = await fetch(`/api/${itemTypeUrl}/${currentTimesheetItemId}/time-entries`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load time entries');
    }
    
    const data = await response.json();
    
    // Populate table
    const tbody = document.getElementById('timesheet-entries-tbody');
    tbody.innerHTML = '';
    
    if (data.entries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-8 text-center text-gray-500">
            No time entries yet. Log your first entry above!
          </td>
        </tr>
      `;
    } else {
      data.entries.forEach(entry => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50';
        
        // Format work date
        const workDate = entry.work_date ? new Date(entry.work_date).toLocaleDateString() : 'N/A';
        const loggedAt = entry.logged_at ? new Date(entry.logged_at).toLocaleString() : 'N/A';
        
        row.innerHTML = `
          <td class="px-4 py-3">
            <div class="font-medium">${workDate}</div>
            <div class="text-xs text-gray-500" title="Logged at">${loggedAt}</div>
          </td>
          <td class="px-4 py-3">${entry.logged_by_name || entry.logged_by_username || 'Unknown'}</td>
          <td class="px-4 py-3 text-right font-medium">${parseFloat(entry.hours_logged).toFixed(2)}</td>
          <td class="px-4 py-3">${entry.notes || '<span class="text-gray-400">No notes</span>'}</td>
          <td class="px-4 py-3 text-center">
            <button onclick="deleteTimeEntry(${entry.id})" 
                    class="text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded hover:bg-red-50"
                    title="Delete entry"
                    aria-label="Delete time entry">
              ${IconFactory.renderInline('trash', { tone: 'error' })}
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });
    }
    
    // Update total
    document.getElementById('timesheet-total-hours').textContent = parseFloat(data.totalHours || 0).toFixed(2);
    
  } catch (error) {
    console.error('Error loading timesheet entries:', error);
    alert('Failed to load timesheet entries. Please try again.');
  }
}

// Quick log time (from timesheet modal)
async function quickLogTimeFromModal() {
  const hours = parseFloat(document.getElementById('quick-log-hours').value);
  const notes = document.getElementById('quick-log-notes').value.trim();
  const workDate = document.getElementById('quick-log-date').value;
  
  if (!hours || hours <= 0) {
    alert('Please enter a valid number of hours');
    return;
  }
  
  if (!workDate) {
    alert('Please select a date');
    return;
  }
  
  try {
    const itemTypeUrl = currentTimesheetItemType === 'issue' ? 'issues' : 'action-items';
    const response = await fetch(`/api/${itemTypeUrl}/${currentTimesheetItemId}/time-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ hours, notes, work_date: workDate })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to log time');
    }
    
    const result = await response.json();
    
    // Check if status was auto-changed
    const statusChanged = result.data?.statusChanged;
    const newStatus = result.data?.newStatus;
    
    // Show success message with status change notification
    if (statusChanged) {
      if (typeof showToast === 'function') {
        showToast(`Logged ${hours}h successfully! Item automatically moved to "${newStatus}"`, 'success');
      } else {
        alert(`Logged ${hours}h. Total: ${result.data.totalHours}h (${result.data.completionPercentage}%)\n\nItem automatically moved to "${newStatus}"`);
      }
    } else {
      console.log(`Logged ${hours}h. Total: ${result.data.totalHours}h (${result.data.completionPercentage}%)`);
    }
    
    // Clear form
    document.getElementById('quick-log-hours').value = '';
    document.getElementById('quick-log-notes').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('quick-log-date').value = today;
    
    // Reload entries
    await loadTimesheetEntries();
    
    // Update the Edit modal if open
    const actualHoursField = document.getElementById(`edit-${currentTimesheetItemType === 'issue' ? 'issue' : 'action-item'}-actual-hours`);
    const progressField = document.getElementById(`edit-${currentTimesheetItemType === 'issue' ? 'issue' : 'action-item'}-progress`);
    const statusField = document.getElementById(`edit-${currentTimesheetItemType === 'issue' ? 'issue' : 'action-item'}-status`);
    const timeCountBadge = document.getElementById(`edit-${currentTimesheetItemType === 'issue' ? 'issue' : 'action-item'}-time-count`);
    
    if (actualHoursField) {
      actualHoursField.value = parseFloat(result.data.totalHours).toFixed(2);
    }
    if (progressField) {
      progressField.value = result.data.completionPercentage || 0;
    }
    // Update status field if it changed
    if (statusChanged && statusField) {
      statusField.value = newStatus;
    }
    if (timeCountBadge) {
      // Update count from the entries length
      const entriesCount = document.getElementById('timesheet-entries-tbody').children.length;
      timeCountBadge.textContent = entriesCount === 1 && document.getElementById('timesheet-entries-tbody').children[0].children.length === 1
        ? '0 entries'
        : `${entriesCount} ${entriesCount === 1 ? 'entry' : 'entries'}`;
    }
    
    // Refresh kanban if viewing the project
    if (window.currentProject) {
      await loadIssuesAndActions(window.currentProject.id);
    }
    
  } catch (error) {
    console.error('Error logging time:', error);
    alert(error.message || 'Failed to log time. Please try again.');
  }
}

// Delete time entry
async function deleteTimeEntry(entryId) {
  if (!confirm('Are you sure you want to delete this time entry?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/time-entries/${entryId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete time entry');
    }
    
    const result = await response.json();
    
    // Reload entries
    await loadTimesheetEntries();
    
    // Update Edit modal if open
    const actualHoursField = document.getElementById(`edit-${currentTimesheetItemType === 'issue' ? 'issue' : 'action-item'}-actual-hours`);
    const progressField = document.getElementById(`edit-${currentTimesheetItemType === 'issue' ? 'issue' : 'action-item'}-progress`);
    
    if (actualHoursField) {
      actualHoursField.value = parseFloat(result.totalHours).toFixed(2);
    }
    if (progressField) {
      progressField.value = result.completionPercentage || 0;
    }
    
    // Refresh kanban
    if (window.currentProject) {
      await loadIssuesAndActions(window.currentProject.id);
    }
    
  } catch (error) {
    console.error('Error deleting time entry:', error);
    alert(error.message || 'Failed to delete time entry. Please try again.');
  }
}

// Quick log time from kanban card (without opening modal)
async function quickLogTimeFromCard(itemType, itemId) {
  const hours = prompt('How many hours did you work?', '2');
  
  if (!hours) {
    return; // User cancelled
  }
  
  const parsedHours = parseFloat(hours);
  if (isNaN(parsedHours) || parsedHours <= 0) {
    alert('Please enter a valid number of hours');
    return;
  }
  
  const notes = prompt('Notes (optional):', '');
  
  try {
    const itemTypeUrl = itemType === 'issue' ? 'issues' : 'action-items';
    const response = await fetch(`/api/${itemTypeUrl}/${itemId}/time-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ hours: parsedHours, notes: notes || null })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to log time');
    }
    
    const result = await response.json();
    
    // Show success notification
    alert(`Logged ${parsedHours}h\nTotal: ${result.totalHours}h (${result.completionPercentage}% complete)`);
    
    // Refresh kanban
    if (window.currentProject) {
      await loadIssuesAndActions(window.currentProject.id);
    }
    
  } catch (error) {
    console.error('Error logging time:', error);
    alert(error.message || 'Failed to log time. Please try again.');
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  // Close timesheet modal buttons
  const closeButtons = ['closeTimesheetModal', 'closeTimesheetModalBtn'];
  closeButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        document.getElementById('timesheetModal').classList.add('hidden');
      });
    }
  });
  
  // Submit quick log button
  const submitBtn = document.getElementById('submit-quick-log');
  if (submitBtn) {
    submitBtn.addEventListener('click', quickLogTimeFromModal);
  }
  
  // View timesheet buttons (for Edit modals)
  const viewTimesheetBtns = ['edit-issue-view-timesheet', 'edit-action-item-view-timesheet'];
  viewTimesheetBtns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', async () => {
        const isIssue = id.includes('issue');
        const itemId = parseInt(document.getElementById(isIssue ? 'edit-issue-id' : 'edit-action-item-id').value);
        const itemTitle = document.getElementById(isIssue ? 'edit-issue-title' : 'edit-action-item-title').value;
        const itemType = isIssue ? 'issue' : 'action-item';
        
        // Fetch item data to get created_at for date validation
        let itemCreatedAt = null;
        try {
          const itemTypeUrl = isIssue ? 'issues' : 'action-items';
          const response = await fetch(`/api/${itemTypeUrl}/${itemId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (response.ok) {
            const itemData = await response.json();
            itemCreatedAt = itemData.created_at;
          }
        } catch (error) {
          console.error('Error fetching item data:', error);
          // Continue without created_at - backend will still validate
        }
        
        await openTimesheetModal(itemType, itemId, itemTitle, itemCreatedAt);
      });
    }
  });
  
  // Allow Enter key to submit quick log
  const quickLogHours = document.getElementById('quick-log-hours');
  const quickLogNotes = document.getElementById('quick-log-notes');
  if (quickLogHours && quickLogNotes) {
    [quickLogHours, quickLogNotes].forEach(field => {
      field.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          quickLogTimeFromModal();
        }
      });
    });
  }
});
