let mismatches = [];
let validUsernames = [];
let selectedUpdates = {};

async function loadData() {
  try {
    const [mismatchesRes, usernamesRes] = await Promise.all([
      fetch('/api/admin/assignee-mismatches'),
      fetch('/api/admin/valid-usernames')
    ]);

    if (!mismatchesRes.ok || !usernamesRes.ok) {
      throw new Error('Failed to load data');
    }

    mismatches = await mismatchesRes.json();
    validUsernames = await usernamesRes.json();

    renderTable();
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading data:', error);
    document.getElementById('loading').classList.add('hidden');
    const errorDiv = document.getElementById('error');
    errorDiv.querySelector('p').textContent = 'Failed to load assignee data. Please try again.';
    errorDiv.classList.remove('hidden');
  }
}

function renderTable() {
  const tbody = document.getElementById('assignee-list');
  tbody.innerHTML = '';

  mismatches.forEach((item, index) => {
    const row = document.createElement('tr');
    row.className = item.is_mismatch ? 'bg-yellow-50' : '';
    
    row.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        ${escapeHtml(item.assignee_name)}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        ${item.issue_count}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        ${item.action_count}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
        ${item.total_count}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm">
        ${item.is_mismatch 
          ? '<span class="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">Mismatch</span>'
          : '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">OK</span>'
        }
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm">
        ${item.is_mismatch 
          ? `<select id="select-${index}" data-old-name="${item.assignee_name.replace(/"/g, '&quot;')}" data-index="${index}"
              class="assignee-select block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
              <option value="">-- Select Correct Username --</option>
              ${validUsernames.map(u => `<option value="${escapeHtml(u.username)}">${escapeHtml(u.username)} (${escapeHtml(u.email)})</option>`).join('')}
            </select>`
          : `<span class="text-gray-400">${escapeHtml(item.matched_username || 'N/A')}</span>`
        }
      </td>
    `;
    
    tbody.appendChild(row);
  });
}

function updateSelection(oldName, newName, index) {
  if (newName) {
    selectedUpdates[oldName] = newName;
    document.getElementById(`select-${index}`).classList.add('border-green-500', 'bg-green-50');
  } else {
    delete selectedUpdates[oldName];
    document.getElementById(`select-${index}`).classList.remove('border-green-500', 'bg-green-50');
  }

  const applyBtn = document.getElementById('apply-btn');
  applyBtn.disabled = Object.keys(selectedUpdates).length === 0;
}

function resetSelections() {
  selectedUpdates = {};
  renderTable();
  document.getElementById('apply-btn').disabled = true;
}

async function applyUpdates() {
  if (Object.keys(selectedUpdates).length === 0) {
    return;
  }

  const updates = Object.entries(selectedUpdates).map(([oldName, newName]) => ({
    oldName,
    newName
  }));

  console.log('Sending updates:', updates);

  try {
    const response = await fetch('/api/admin/update-assignees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ updates })
    });

    if (!response.ok) {
      throw new Error('Failed to update assignees');
    }

    const result = await response.json();
    
    const successDiv = document.getElementById('success');
    successDiv.querySelector('p').innerHTML = `
      <strong>Success!</strong> Updated ${result.totalUpdated} items 
      (${result.issuesUpdated} issues, ${result.actionsUpdated} action items)
    `;
    successDiv.classList.remove('hidden');

    selectedUpdates = {};
    await loadData();

    setTimeout(() => {
      successDiv.classList.add('hidden');
    }, 5000);
  } catch (error) {
    console.error('Error applying updates:', error);
    const errorDiv = document.getElementById('error');
    errorDiv.querySelector('p').textContent = 'Failed to apply updates. Please try again.';
    errorDiv.classList.remove('hidden');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '/';
  });

  document.getElementById('reset-btn').addEventListener('click', resetSelections);
  
  document.getElementById('apply-btn').addEventListener('click', applyUpdates);

  document.getElementById('assignee-list').addEventListener('change', (e) => {
    if (e.target.classList.contains('assignee-select')) {
      const oldName = e.target.dataset.oldName;
      const newName = e.target.value;
      const index = e.target.dataset.index;
      console.log('Dropdown changed:', { oldName, newName, index });
      updateSelection(oldName, newName, index);
    }
  });

  loadData();
});
