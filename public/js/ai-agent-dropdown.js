/**
 * AI Agent Dropdown Navigation
 */

// Initialize dropdown handlers
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('projectId');

  const viewDropdownBtn = document.getElementById('view-dropdown-btn');
  const viewDropdownMenu = document.getElementById('view-dropdown-menu');

  // Toggle dropdown
  viewDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    viewDropdownMenu.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    viewDropdownMenu?.classList.add('hidden');
  });

  // Dropdown navigation handlers
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    window.location.href = `/dashboard.html?projectId=${projectId}`;
  });

  document.getElementById('view-risks-btn')?.addEventListener('click', () => {
    window.location.href = `/risks.html?projectId=${projectId}`;
  });

  document.getElementById('view-proposals-btn')?.addEventListener('click', () => {
    window.location.href = `/proposals.html?projectId=${projectId}`;
  });
});
