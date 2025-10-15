/**
 * Checklist Validation Functions
 */

let currentValidation = null;

/**
 * Run validation on checklist
 */
async function runValidation(checklistId) {
  try {
    // Show loading
    const validateBtn = document.getElementById('validateBtn');
    const originalText = validateBtn.innerHTML;
    validateBtn.disabled = true;
    validateBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Validating...';
    
    // Run validation
    const response = await fetch(`/api/checklists/${checklistId}/validate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validation_type: 'manual' })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Validation failed');
    }
    
    currentValidation = await response.json();
    
    // Show results
    displayValidationResults(currentValidation);
    
    // Restore button
    validateBtn.disabled = false;
    validateBtn.innerHTML = originalText;
    
    showToast('Validation complete!', 'success');
    
  } catch (error) {
    console.error('Validation error:', error);
    showToast(`Validation failed: ${error.message}`, 'error');
    
    const validateBtn = document.getElementById('validateBtn');
    if (validateBtn) {
      validateBtn.disabled = false;
      validateBtn.innerHTML = '<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg> Validate Quality';
    }
  }
}

/**
 * Display validation results
 */
function displayValidationResults(validation) {
  // Create or get validation panel
  let panel = document.getElementById('validationPanel');
  
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'validationPanel';
    panel.className = 'bg-white rounded-lg shadow-lg border border-gray-200 p-6 mb-6';
    
    // Insert after progress section (before checklist sections)
    const progressSection = document.querySelector('.progress-summary');
    const sectionsContainer = document.getElementById('checklistSections');
    
    if (progressSection && sectionsContainer) {
      // Insert between progress and sections
      progressSection.after(panel);
    } else if (sectionsContainer) {
      // Fallback: insert before sections
      sectionsContainer.before(panel);
    } else {
      // Last resort: append to main content
      const mainContent = document.querySelector('.main-content') || document.querySelector('main');
      if (mainContent) {
        mainContent.insertBefore(panel, mainContent.firstChild);
      }
    }
  }
  
  // Score color
  const scoreColor = getScoreColor(validation.quality_score);
  const scoreTextClass = getScoreTextClass(validation.quality_score);
  const statusIcon = validation.is_valid ? '✅' : '❌';
  const statusText = validation.is_valid ? 'Passed' : 'Failed';
  const statusClass = validation.is_valid ? 'text-green-600' : 'text-red-600';
  
  panel.innerHTML = `
    <div class="flex items-start justify-between mb-6">
      <div class="flex items-center space-x-6">
        <div class="text-center">
          <div class="w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center cursor-help" 
               style="border-color: ${scoreColor};"
               title="Quality Score Calculation:
(Completeness ${validation.completeness_score}% × 50%) + (Consistency ${validation.consistency_score}% × 30%) + (Quality ${validation.quality_rating}% × 20%)
= (${Math.round(validation.completeness_score * 0.5)} + ${Math.round(validation.consistency_score * 0.3)} + ${Math.round(validation.quality_rating * 0.2)})
= ${validation.quality_score} points">
            <span class="text-3xl font-bold ${scoreTextClass}">${validation.quality_score}</span>
            <span class="text-xs text-gray-500 mt-1">Quality Score</span>
          </div>
        </div>
        <div>
          <h3 class="text-xl font-semibold ${statusClass} mb-2">${statusIcon} Validation ${statusText}</h3>
          <div class="space-y-1 text-sm">
            <div class="flex items-center space-x-3 cursor-help" 
                 title="Completeness Score (50% weight):
Based on required items completion
• Required items completed / Total required items × 100
• If no required items, uses overall completion rate">
              <span class="text-gray-600 w-28">Completeness:</span>
              <span class="font-semibold">${validation.completeness_score}%</span>
              <span class="text-gray-400">ℹ️</span>
            </div>
            <div class="flex items-center space-x-3 cursor-help"
                 title="Consistency Score (30% weight):
Starts at 100%, then deducts:
• -10 points per error
• -3 points per warning
Current: 100 - (${validation.error_count} errors × 10) - (${validation.warning_count} warnings × 3) = ${validation.consistency_score}%">
              <span class="text-gray-600 w-28">Consistency:</span>
              <span class="font-semibold">${validation.consistency_score}%</span>
              <span class="text-gray-400">ℹ️</span>
            </div>
            <div class="flex items-center space-x-3 cursor-help"
                 title="Quality Rating (20% weight):
Base score: 50 points
• +2 points per item with comments (max +20)
• +3 points per detailed response >50 chars (max +15)
• -5 points per placeholder text
Range: 0-100 points">
              <span class="text-gray-600 w-28">Quality:</span>
              <span class="font-semibold">${validation.quality_rating}%</span>
              <span class="text-gray-400">ℹ️</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="flex space-x-4">
        <div class="text-center px-4 py-2 ${validation.error_count > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'} rounded-lg">
          <div class="text-2xl mb-1">${validation.error_count > 0 ? '❌' : '✅'}</div>
          <div class="text-xl font-bold ${validation.error_count > 0 ? 'text-red-600' : 'text-gray-600'}">${validation.error_count}</div>
          <div class="text-xs text-gray-600">Errors</div>
        </div>
        <div class="text-center px-4 py-2 ${validation.warning_count > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'} rounded-lg">
          <div class="text-2xl mb-1">${validation.warning_count > 0 ? '⚠️' : '✅'}</div>
          <div class="text-xl font-bold ${validation.warning_count > 0 ? 'text-yellow-600' : 'text-gray-600'}">${validation.warning_count}</div>
          <div class="text-xs text-gray-600">Warnings</div>
        </div>
        <div class="text-center px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="text-2xl mb-1">💡</div>
          <div class="text-xl font-bold text-blue-600">${validation.recommendations.length}</div>
          <div class="text-xs text-gray-600">Tips</div>
        </div>
      </div>
    </div>
    
    ${validation.error_count > 0 ? `
      <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <h4 class="font-semibold text-red-800 mb-3">❌ Errors (Must Fix)</h4>
        <div class="space-y-2">
          ${validation.errors.map(error => `
            <div class="bg-white p-3 rounded border border-red-200">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="font-semibold text-red-900">${error.section}</div>
                  ${error.item ? `<div class="text-sm text-gray-700 mt-1">${error.item}</div>` : ''}
                  <div class="text-sm text-red-700 mt-1">${error.message}</div>
                  <div class="text-sm text-blue-600 mt-1">💡 ${error.suggestion}</div>
                </div>
                ${error.item_id ? `
                  <button class="jump-to-item text-blue-600 hover:text-blue-800 text-sm font-medium ml-2" data-item-id="${error.item_id}">
                    Jump →
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    ${validation.warning_count > 0 ? `
      <div class="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 class="font-semibold text-yellow-800 mb-3">⚠️ Warnings (Should Review)</h4>
        <div class="space-y-2">
          ${validation.warnings.map(warning => `
            <div class="bg-white p-3 rounded border border-yellow-200">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="font-semibold text-yellow-900">${warning.section}</div>
                  ${warning.item ? `<div class="text-sm text-gray-700 mt-1">${warning.item}</div>` : ''}
                  <div class="text-sm text-yellow-700 mt-1">${warning.message}</div>
                  <div class="text-sm text-blue-600 mt-1">💡 ${warning.suggestion}</div>
                </div>
                ${warning.item_id ? `
                  <button class="jump-to-item text-blue-600 hover:text-blue-800 text-sm font-medium ml-2" data-item-id="${warning.item_id}">
                    Jump →
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    ${validation.recommendations.length > 0 ? `
      <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 class="font-semibold text-blue-800 mb-3">💡 Recommendations</h4>
        <ul class="space-y-1 text-sm text-gray-700">
          ${validation.recommendations.map(rec => `
            <li class="flex items-start">
              <span class="text-blue-600 mr-2">•</span>
              <span>${rec}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}
    
    ${!validation.is_valid ? `
      <div class="mt-4 p-4 bg-red-100 border border-red-300 rounded-lg">
        <p class="text-red-800 font-medium">
          ❌ Cannot submit for approval. Quality score must be at least 60 and all errors must be fixed.
        </p>
      </div>
    ` : validation.quality_score < 80 ? `
      <div class="mt-4 p-4 bg-yellow-100 border border-yellow-300 rounded-lg">
        <p class="text-yellow-800 font-medium">
          ⚠️ Checklist can be submitted but consider addressing warnings for higher quality.
        </p>
      </div>
    ` : `
      <div class="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
        <p class="text-green-800 font-medium">
          ✅ Excellent! Checklist is ready for approval.
        </p>
      </div>
    `}
  `;
  
  // Show panel
  panel.style.display = 'block';
  
  // Add event delegation for jump buttons
  panel.querySelectorAll('.jump-to-item').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const itemId = this.getAttribute('data-item-id');
      if (itemId) {
        jumpToItem(parseInt(itemId));
      }
    });
  });
  
  // Scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Jump to specific item in checklist
 */
function jumpToItem(itemId) {
  // Search specifically for checklist items, not buttons
  const itemElement = document.querySelector(`.checklist-item[data-template-item-id="${itemId}"]`) || 
                      document.querySelector(`.checklist-item[data-item-id="${itemId}"]`);
  
  if (itemElement) {
    itemElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add highlight animation
    itemElement.classList.add('ring-4', 'ring-yellow-400', 'transition-all', 'duration-500');
    
    setTimeout(() => {
      itemElement.classList.remove('ring-4', 'ring-yellow-400');
    }, 3000);
  }
}

/**
 * Update quality badge in header
 */
function updateQualityBadge(score) {
  let badge = document.getElementById('qualityBadge');
  
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'qualityBadge';
    badge.className = 'flex items-center space-x-2 px-3 py-1 rounded-full border';
    
    const exportBtn = document.getElementById('exportPdfBtn');
    if (exportBtn) {
      exportBtn.before(badge);
    }
  }
  
  const color = getScoreColor(score);
  const textClass = getScoreTextClass(score);
  const label = getScoreLabel(score);
  
  badge.className = `flex items-center space-x-2 px-3 py-1 rounded-full border ${getBadgeBgClass(score)}`;
  
  badge.innerHTML = `
    <span class="text-lg font-bold ${textClass}">${score}</span>
    <span class="text-sm font-medium ${textClass}">${label}</span>
  `;
}

/**
 * Get color for score
 */
function getScoreColor(score) {
  if (score >= 80) return '#10b981'; // Green
  if (score >= 60) return '#f59e0b'; // Yellow
  return '#ef4444'; // Red
}

/**
 * Get text class for score
 */
function getScoreTextClass(score) {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Get badge background class
 */
function getBadgeBgClass(score) {
  if (score >= 80) return 'bg-green-50 border-green-300';
  if (score >= 60) return 'bg-yellow-50 border-yellow-300';
  return 'bg-red-50 border-red-300';
}

/**
 * Get label for score
 */
function getScoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Fair';
  if (score >= 60) return 'Acceptable';
  return 'Needs Work';
}

/**
 * Load quality score on page load
 */
async function loadQualityScore(checklistId) {
  try {
    const response = await fetch(`/api/checklists/${checklistId}/validation/latest`, {
      credentials: 'include'
    });
    
    if (!response.ok) return;
    
    const validation = await response.json();
    
  } catch (error) {
    console.error('Failed to load quality score:', error);
  }
}
