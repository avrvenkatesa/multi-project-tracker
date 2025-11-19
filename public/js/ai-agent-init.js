/**
 * AI Agent Dashboard Initialization
 */

// Create global instance immediately (before DOMContentLoaded)
// This ensures the dashboard can be referenced if needed
window.aiDashboard = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const projectId = new URLSearchParams(window.location.search).get('projectId') || 1;
  window.aiDashboard = new AIAgentDashboard('ai-agent-container');
  window.aiDashboard.initialize(projectId);
});
