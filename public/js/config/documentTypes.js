/**
 * Document Type Configuration
 * Centralized mapping for icons, labels, and styles
 */
const DOCUMENT_TYPE_CONFIG = {
  'meeting_transcript': {
    icon: '🎙️',
    label: 'Meeting Transcript',
    badgeClass: 'badge-meeting',
    color: 'blue'
  },
  'ai_analysis_doc': {
    icon: '🤖',
    label: 'AI Analysis',
    badgeClass: 'badge-analysis',
    color: 'purple'
  },
  'uploaded_doc': {
    icon: '📄',
    label: 'Uploaded Document',
    badgeClass: 'badge-uploaded',
    color: 'gray'
  },
  'decision_doc': {
    icon: '⚖️',
    label: 'Decision Document',
    badgeClass: 'badge-decision',
    color: 'yellow'
  },
  'risk_assessment': {
    icon: '⚠️',
    label: 'Risk Assessment',
    badgeClass: 'badge-risk',
    color: 'red'
  }
};

/**
 * Helper Functions
 */
function getDocTypeIcon(sourceType) {
  return DOCUMENT_TYPE_CONFIG[sourceType]?.icon || '📄';
}

function getDocTypeLabel(sourceType) {
  return DOCUMENT_TYPE_CONFIG[sourceType]?.label || sourceType;
}

function getDocTypeBadgeClass(sourceType) {
  return DOCUMENT_TYPE_CONFIG[sourceType]?.badgeClass || 'badge-uploaded';
}

function getDocTypeColor(sourceType) {
  return DOCUMENT_TYPE_CONFIG[sourceType]?.color || 'gray';
}
