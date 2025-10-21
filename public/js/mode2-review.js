// ==============================================
// Phase 4 Mode 2: Review Dashboard
// ==============================================

let currentProjectId = null;
let uploadedFile = null;
let documentText = null;
let workstreamsData = null;
let checklistsData = null;
let matchesData = null;
let selectedMatches = new Set();

// ==============================================
// Initialization
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadCurrentProject();
});

function initializeEventListeners() {
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    
    const handlers = {
      'back-to-checklists': () => window.location.href = '/checklists.html',
      'clear-file': clearFile,
      'start-analysis': startAnalysis,
      'select-all': selectAll,
      'accept-high-confidence': acceptHighConfidence,
      'approve-selected': approveSelected,
      'view-checklists': () => window.location.href = '/checklists.html',
      'reset-workflow': resetWorkflow
    };
    
    if (handlers[action]) {
      handlers[action](e);
    }
  });
  
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  
  dropZone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-blue-500', 'bg-blue-50');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });
}

async function loadCurrentProject() {
  try {
    const params = new URLSearchParams(window.location.search);
    currentProjectId = params.get('projectId');
    
    if (!currentProjectId) {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.ok) {
        const user = await response.json();
        currentProjectId = user.currentProjectId || 1;
      }
    }
  } catch (error) {
    console.error('Error loading current project:', error);
    currentProjectId = 1;
  }
}

// ==============================================
// File Upload & Handling
// ==============================================

function handleFile(file) {
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    showNotification('File too large. Maximum size is 10MB.', 'error');
    return;
  }
  
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|txt|docx)$/i)) {
    showNotification('Invalid file type. Please upload PDF, TXT, or DOCX.', 'error');
    return;
  }
  
  uploadedFile = file;
  
  document.getElementById('filePreview').classList.remove('hidden');
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatFileSize(file.size);
  document.getElementById('analyzeBtn').disabled = false;
}

function clearFile() {
  uploadedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreview').classList.add('hidden');
  document.getElementById('analyzeBtn').disabled = true;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ==============================================
// Workflow Steps
// ==============================================

async function startAnalysis() {
  if (!uploadedFile) {
    showNotification('Please select a file first', 'error');
    return;
  }
  
  try {
    showSection('processingSection');
    updateStepIndicator(2);
    
    updateProgress(1, 'processing', 'Extracting document text...');
    documentText = await extractDocumentText(uploadedFile);
    updateProgress(1, 'complete', 'Document text extracted ✓');
    
    updateProgress(2, 'processing', 'Detecting workstreams with AI...');
    workstreamsData = await detectWorkstreams(documentText);
    updateProgress(2, 'complete', `${workstreamsData.workstreams.length} workstreams detected ✓`);
    updateStepIndicator(3);
    
    updateProgress(3, 'processing', 'Generating checklists...');
    checklistsData = await generateChecklists(workstreamsData.workstreams, documentText);
    updateProgress(3, 'complete', `${checklistsData.count} checklists generated ✓`);
    updateStepIndicator(4);
    
    updateProgress(4, 'processing', 'Matching checklists to issues...');
    matchesData = await matchToIssues(checklistsData.checklists);
    updateProgress(4, 'complete', 'Matching complete ✓');
    updateStepIndicator(5);
    
    setTimeout(() => {
      showReviewSection();
    }, 500);
    
  } catch (error) {
    console.error('Analysis error:', error);
    showNotification('Analysis failed: ' + error.message, 'error');
    showSection('uploadSection');
    updateStepIndicator(1);
  }
}

async function extractDocumentText(file) {
  if (file.type === 'text/plain') {
    return await file.text();
  }
  
  const formData = new FormData();
  formData.append('document', file);
  
  const response = await fetch('/api/extract-document-text', {
    method: 'POST',
    credentials: 'include',
    body: formData
  });
  
  if (!response.ok) {
    throw new Error('Failed to extract document text');
  }
  
  const data = await response.json();
  return data.text;
}

async function detectWorkstreams(text) {
  const response = await fetch(`/api/projects/${currentProjectId}/analyze-workstreams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      documentText: text,
      filename: uploadedFile.name
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Workstream detection failed');
  }
  
  return await response.json();
}

async function generateChecklists(workstreams, text) {
  const response = await fetch(`/api/projects/${currentProjectId}/generate-workstream-checklists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      workstreams: workstreams,
      documentText: text
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Checklist generation failed');
  }
  
  return await response.json();
}

async function matchToIssues(checklists) {
  const response = await fetch(`/api/projects/${currentProjectId}/match-checklists-to-issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      checklists: checklists
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Issue matching failed');
  }
  
  return await response.json();
}

// ==============================================
// Review Section
// ==============================================

function showReviewSection() {
  showSection('reviewSection');
  
  document.getElementById('statWorkstreams').textContent = matchesData.summary.totalChecklists;
  document.getElementById('statMatched').textContent = matchesData.summary.matched;
  document.getElementById('statUnmatched').textContent = matchesData.summary.unmatched;
  document.getElementById('statItems').textContent = checklistsData.totalItems;
  document.getElementById('statConfidence').textContent = Math.round(matchesData.summary.averageConfidence) + '%';
  
  renderMatchCards();
}

function renderMatchCards() {
  const container = document.getElementById('matchesList');
  
  container.innerHTML = matchesData.matches.map((match, index) => {
    const itemCount = match.checklist.checklist.sections.reduce(
      (sum, s) => sum + (s.items?.length || 0), 0
    );
    
    const confidenceBadge = match.matchedIssue ? 
      (match.confidence >= 80 ? '🟢 High' : 
       match.confidence >= 50 ? '🟡 Medium' : '🟠 Low') : 
      '⚪ No Match';
    
    const confidenceColor = match.matchedIssue ?
      (match.confidence >= 80 ? 'bg-green-100 text-green-800' :
       match.confidence >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-orange-100 text-orange-800') :
      'bg-gray-100 text-gray-800';
    
    return `
      <div class="bg-white rounded-lg shadow-sm p-6 border-2 border-gray-200 hover:border-blue-300 transition-colors" data-match-index="${index}">
        
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-start gap-3 flex-1">
            <input 
              type="checkbox" 
              id="match-${index}"
              data-action="toggle-match"
              data-match-index="${index}"
              class="mt-1 w-5 h-5 text-blue-600"
            />
            <div class="flex-1">
              <h3 class="text-lg font-bold text-gray-900">${escapeHtml(match.checklist.workstreamName)}</h3>
              <p class="text-sm text-gray-600 mt-1">${escapeHtml(match.checklist.workstreamDescription)}</p>
              <div class="flex gap-3 mt-2 text-sm">
                <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded">📋 ${itemCount} items</span>
                <span class="px-2 py-1 bg-purple-100 text-purple-700 rounded">${match.checklist.estimatedComplexity} complexity</span>
                <span class="px-2 py-1 bg-indigo-100 text-indigo-700 rounded">${match.checklist.suggestedPhase}</span>
              </div>
            </div>
          </div>
          <span class="px-3 py-1 ${confidenceColor} rounded-full text-sm font-medium whitespace-nowrap">
            ${confidenceBadge}${match.matchedIssue ? ` ${match.confidence}%` : ''}
          </span>
        </div>

        ${match.matchedIssue ? `
          <div class="bg-blue-50 rounded-lg p-4 mb-4">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="text-sm text-gray-600 mb-1">Matched to:</div>
                <div class="font-medium text-gray-900">Issue #${match.matchedIssue.id}: ${escapeHtml(match.matchedIssue.title)}</div>
                <div class="text-sm text-gray-600 mt-1">
                  Type: ${match.matchedIssue.type} | Priority: ${match.matchedIssue.priority} | Status: ${match.matchedIssue.status}
                </div>
              </div>
              <button 
                data-action="change-issue"
                data-match-index="${index}"
                class="ml-4 px-3 py-1 text-sm bg-white text-blue-600 rounded hover:bg-blue-100"
              >
                Change
              </button>
            </div>
            <div class="mt-3 text-sm text-gray-700">
              <strong>Reasoning:</strong> ${escapeHtml(match.reasoning)}
            </div>
          </div>
        ` : `
          <div class="bg-yellow-50 rounded-lg p-4 mb-4">
            <div class="text-sm text-gray-600 mb-2">💡 Suggested: Create New Issue</div>
            <div class="font-medium text-gray-900 mb-1">${escapeHtml(match.suggestedNewIssue.title)}</div>
            <div class="text-sm text-gray-600 mb-2">
              Type: ${match.suggestedNewIssue.type} | Priority: ${match.suggestedNewIssue.priority}
            </div>
            <div class="text-sm text-gray-700 mb-3">
              <strong>Reasoning:</strong> ${escapeHtml(match.reasoning)}
            </div>
            <button 
              data-action="link-to-existing"
              data-match-index="${index}"
              class="px-3 py-1 text-sm bg-white text-blue-600 rounded hover:bg-blue-100 border border-blue-200"
            >
              Link to Existing Issue Instead
            </button>
          </div>
        `}

        <div class="flex gap-2 pt-4 border-t">
          <button 
            data-action="preview-checklist"
            data-match-index="${index}"
            class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            👁️ Preview Items
          </button>
          <button 
            data-action="remove-match"
            data-match-index="${index}"
            class="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            🗑️ Remove
          </button>
        </div>

      </div>
    `;
  }).join('');
  
  document.querySelectorAll('[data-action="toggle-match"]').forEach(checkbox => {
    const index = parseInt(checkbox.dataset.matchIndex);
    
    if (selectedMatches.has(index)) {
      checkbox.checked = true;
    }
    
    checkbox.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.matchIndex);
      if (e.target.checked) {
        selectedMatches.add(idx);
      } else {
        selectedMatches.delete(idx);
      }
    });
  });
  
  document.querySelectorAll('[data-action="change-issue"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-action]').dataset.matchIndex);
      changeIssue(index);
    });
  });
  
  document.querySelectorAll('[data-action="link-to-existing"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-action]').dataset.matchIndex);
      linkToExisting(index);
    });
  });
  
  document.querySelectorAll('[data-action="preview-checklist"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-action]').dataset.matchIndex);
      previewChecklist(index);
    });
  });
  
  document.querySelectorAll('[data-action="remove-match"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('[data-action]').dataset.matchIndex);
      removeMatch(index);
    });
  });
}

// ==============================================
// Match Actions
// ==============================================

function selectAll() {
  matchesData.matches.forEach((_, index) => {
    const checkbox = document.getElementById(`match-${index}`);
    if (checkbox) {
      checkbox.checked = true;
      selectedMatches.add(index);
    }
  });
  showNotification(`Selected all ${selectedMatches.size} checklists`, 'success');
}

function acceptHighConfidence() {
  matchesData.matches.forEach((match, index) => {
    if (match.confidence >= 80) {
      const checkbox = document.getElementById(`match-${index}`);
      if (checkbox) {
        checkbox.checked = true;
        selectedMatches.add(index);
      }
    }
  });
  showNotification(`Selected ${selectedMatches.size} high-confidence matches`, 'success');
}

async function changeIssue(index) {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/issues`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load issues');
    }
    
    const issues = await response.json();
    
    if (issues.length === 0) {
      showNotification('No issues available in this project', 'info');
      return;
    }
    
    showIssuePickerModal(issues, index, 'change');
  } catch (error) {
    console.error('Error loading issues:', error);
    showNotification('Failed to load issues', 'error');
  }
}

async function linkToExisting(index) {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/issues`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load issues');
    }
    
    const issues = await response.json();
    
    if (issues.length === 0) {
      showNotification('No issues available in this project', 'info');
      return;
    }
    
    showIssuePickerModal(issues, index, 'link');
  } catch (error) {
    console.error('Error loading issues:', error);
    showNotification('Failed to load issues', 'error');
  }
}

function showIssuePickerModal(issues, matchIndex, action) {
  const issuesList = issues.map(issue => `
    <div class="p-3 border rounded hover:bg-blue-50 cursor-pointer" data-action="select-issue" data-issue-id="${issue.id}" data-match-index="${matchIndex}">
      <div class="font-medium text-gray-900">#${issue.id}: ${escapeHtml(issue.title)}</div>
      <div class="text-sm text-gray-600 mt-1">
        Type: ${issue.type} | Priority: ${issue.priority} | Status: ${issue.status}
      </div>
    </div>
  `).join('');
  
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
      <div class="flex items-center justify-between p-6 border-b">
        <h2 class="text-xl font-bold">Select Issue</h2>
        <button data-action="close-modal" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      <div class="p-6 overflow-y-auto max-h-[70vh] space-y-2">
        ${issuesList}
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) {
      overlay.remove();
      return;
    }
    
    const selectBtn = e.target.closest('[data-action="select-issue"]');
    if (selectBtn) {
      const issueId = parseInt(selectBtn.dataset.issueId);
      const index = parseInt(selectBtn.dataset.matchIndex);
      const selectedIssue = issues.find(i => i.id === issueId);
      
      if (selectedIssue) {
        matchesData.matches[index].matchedIssue = selectedIssue;
        matchesData.matches[index].confidence = 75;
        matchesData.matches[index].reasoning = 'Manually selected by user';
        matchesData.matches[index].suggestedNewIssue = null;
        
        recalculateSummary();
        renderMatchCards();
        showNotification(`Linked to Issue #${issueId}`, 'success');
      }
      
      overlay.remove();
    }
  });
}

function previewChecklist(index) {
  const match = matchesData.matches[index];
  const checklist = match.checklist.checklist;
  
  let itemsHtml = '';
  checklist.sections.forEach(section => {
    itemsHtml += `
      <div class="mb-4">
        <div class="font-medium text-gray-900 mb-2">${escapeHtml(section.title)}</div>
        <ul class="space-y-1">
          ${section.items.map(item => `
            <li class="text-sm text-gray-700 flex items-start gap-2">
              <span class="text-blue-600">•</span>
              <span>${escapeHtml(item.text)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  });
  
  showModal(
    'Checklist Preview',
    `
      <h3 class="font-bold text-lg mb-4">${escapeHtml(checklist.title)}</h3>
      <p class="text-gray-600 mb-4">${escapeHtml(checklist.description)}</p>
      <div class="max-h-96 overflow-y-auto">
        ${itemsHtml}
      </div>
    `
  );
}

function removeMatch(index) {
  if (confirm('Remove this checklist from the batch?')) {
    matchesData.matches.splice(index, 1);
    
    rebuildSelectionState(index);
    recalculateSummary();
    renderMatchCards();
    showNotification('Checklist removed', 'info');
  }
}

function rebuildSelectionState(removedIndex) {
  const previouslySelected = Array.from(selectedMatches);
  selectedMatches.clear();
  
  previouslySelected.forEach(oldIndex => {
    if (oldIndex === removedIndex) {
      return;
    }
    
    if (oldIndex > removedIndex) {
      selectedMatches.add(oldIndex - 1);
    } else {
      selectedMatches.add(oldIndex);
    }
  });
}

function recalculateSummary() {
  let matched = 0;
  let unmatched = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;
  
  matchesData.matches.forEach(match => {
    if (match.matchedIssue) {
      matched++;
      totalConfidence += match.confidence;
      confidenceCount++;
    } else {
      unmatched++;
    }
  });
  
  matchesData.summary = {
    totalChecklists: matchesData.matches.length,
    matched: matched,
    unmatched: unmatched,
    averageConfidence: confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : 0,
    highConfidence: matchesData.matches.filter(m => m.confidence >= 80).length,
    mediumConfidence: matchesData.matches.filter(m => m.confidence >= 50 && m.confidence < 80).length,
    lowConfidence: matchesData.matches.filter(m => m.confidence >= 40 && m.confidence < 50).length
  };
  
  document.getElementById('statWorkstreams').textContent = matchesData.summary.totalChecklists;
  document.getElementById('statMatched').textContent = matchesData.summary.matched;
  document.getElementById('statUnmatched').textContent = matchesData.summary.unmatched;
  document.getElementById('statConfidence').textContent = matchesData.summary.averageConfidence + '%';
}

// ==============================================
// Approve and Create
// ==============================================

async function approveSelected() {
  if (selectedMatches.size === 0) {
    showNotification('Please select at least one checklist', 'error');
    return;
  }
  
  if (!confirm(`Create ${selectedMatches.size} checklists?`)) {
    return;
  }
  
  try {
    showNotification('Creating checklists...', 'info');
    
    const approvedMatches = Array.from(selectedMatches).map(index => {
      const match = matchesData.matches[index];
      return {
        checklist: match.checklist,
        issueId: match.matchedIssue?.id || null,
        createNewIssue: match.matchedIssue === null,
        suggestedNewIssue: match.suggestedNewIssue
      };
    });
    
    const response = await fetch(`/api/projects/${currentProjectId}/create-matched-checklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        approvedMatches: approvedMatches
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checklists');
    }
    
    const result = await response.json();
    
    showSuccessSection(result);
    
  } catch (error) {
    console.error('Creation error:', error);
    showNotification('Failed to create checklists: ' + error.message, 'error');
  }
}

function showSuccessSection(result) {
  showSection('successSection');
  
  document.getElementById('successMessage').textContent = 
    `Successfully created ${result.created} checklist${result.created !== 1 ? 's' : ''}!`;
  
  let details = [];
  if (result.issuesCreated > 0) {
    details.push(`${result.issuesCreated} new issue${result.issuesCreated !== 1 ? 's' : ''} created`);
  }
  if (result.failed > 0) {
    details.push(`${result.failed} failed`);
  }
  
  document.getElementById('successDetails').textContent = details.join(' • ');
}

// ==============================================
// UI Helpers
// ==============================================

function showSection(sectionId) {
  const sections = ['uploadSection', 'processingSection', 'reviewSection', 'successSection'];
  sections.forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(sectionId).classList.remove('hidden');
}

function updateStepIndicator(step) {
  for (let i = 1; i <= 5; i++) {
    const stepEl = document.getElementById(`step${i}`);
    if (i < step) {
      stepEl.classList.add('completed');
      stepEl.classList.remove('active');
    } else if (i === step) {
      stepEl.classList.add('active');
      stepEl.classList.remove('completed');
    } else {
      stepEl.classList.remove('active', 'completed');
    }
  }
}

function updateProgress(progressNum, status, message) {
  const progressEl = document.getElementById(`progress${progressNum}`);
  const icon = progressEl.querySelector('.w-6');
  const text = progressEl.querySelector('span:last-child');
  
  if (status === 'processing') {
    icon.innerHTML = '<span class="text-xs animate-spin">⏳</span>';
    icon.className = 'w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center';
  } else if (status === 'complete') {
    icon.innerHTML = '<span class="text-xs">✓</span>';
    icon.className = 'w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white';
  }
  
  text.textContent = message;
}

function resetWorkflow() {
  uploadedFile = null;
  documentText = null;
  workstreamsData = null;
  checklistsData = null;
  matchesData = null;
  selectedMatches.clear();
  
  clearFile();
  showSection('uploadSection');
  updateStepIndicator(1);
}

function showModal(title, content) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
      <div class="flex items-center justify-between p-6 border-b">
        <h2 class="text-xl font-bold">${escapeHtml(title)}</h2>
        <button data-action="close-modal" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      <div class="p-6 overflow-y-auto max-h-[70vh]">
        ${content}
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) {
      overlay.remove();
    }
  });
}

function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  };
  
  const notif = document.createElement('div');
  notif.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 max-w-md`;
  notif.textContent = message;
  
  document.body.appendChild(notif);
  
  setTimeout(() => {
    notif.classList.add('opacity-0', 'transition-opacity');
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
