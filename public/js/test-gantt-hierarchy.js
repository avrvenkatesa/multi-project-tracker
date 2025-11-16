// Sample hierarchical task data
const tasks = [
  // Epic 1: User Authentication
  {
    id: 'issue-1',
    name: 'User Authentication Module',
    start: '2025-01-15',
    end: '2025-02-15',
    progress: 35,
    is_epic: true,
    item_type: 'issue',
    item_id: 1,
    parent_issue_id: null,
    hierarchy_level: 0,
    custom_class: 'bar-epic'
  },
  {
    id: 'issue-2',
    name: 'Design Auth Flow',
    start: '2025-01-15',
    end: '2025-01-20',
    progress: 100,
    item_type: 'issue',
    item_id: 2,
    parent_issue_id: 1,
    hierarchy_level: 1
  },
  {
    id: 'issue-3',
    name: 'Backend API Development',
    start: '2025-01-21',
    end: '2025-01-31',
    progress: 60,
    item_type: 'issue',
    item_id: 3,
    parent_issue_id: 1,
    hierarchy_level: 1,
    dependencies: 'issue-2'
  },
  {
    id: 'issue-4',
    name: 'Frontend UI Components',
    start: '2025-02-01',
    end: '2025-02-09',
    progress: 20,
    item_type: 'issue',
    item_id: 4,
    parent_issue_id: 1,
    hierarchy_level: 1,
    dependencies: 'issue-3'
  },
  {
    id: 'issue-5',
    name: 'Integration Testing',
    start: '2025-02-10',
    end: '2025-02-15',
    progress: 0,
    item_type: 'issue',
    item_id: 5,
    parent_issue_id: 1,
    hierarchy_level: 1,
    dependencies: 'issue-4'
  },

  // Epic 2: Database Migration
  {
    id: 'issue-6',
    name: 'Database Migration Project',
    start: '2025-01-20',
    end: '2025-02-10',
    progress: 50,
    is_epic: true,
    item_type: 'issue',
    item_id: 6,
    parent_issue_id: null,
    hierarchy_level: 0,
    custom_class: 'bar-epic'
  },
  {
    id: 'issue-7',
    name: 'Schema Design',
    start: '2025-01-20',
    end: '2025-01-24',
    progress: 100,
    item_type: 'issue',
    item_id: 7,
    parent_issue_id: 6,
    hierarchy_level: 1
  },
  {
    id: 'issue-8',
    name: 'Write Migration Scripts',
    start: '2025-01-25',
    end: '2025-02-02',
    progress: 70,
    item_type: 'issue',
    item_id: 8,
    parent_issue_id: 6,
    hierarchy_level: 1,
    dependencies: 'issue-7'
  },
  {
    id: 'issue-9',
    name: 'Data Validation & Testing',
    start: '2025-02-03',
    end: '2025-02-10',
    progress: 10,
    item_type: 'issue',
    item_id: 9,
    parent_issue_id: 6,
    hierarchy_level: 1,
    dependencies: 'issue-8'
  },

  // Standalone task (no parent)
  {
    id: 'issue-10',
    name: 'Code Review & Documentation',
    start: '2025-02-11',
    end: '2025-02-14',
    progress: 0,
    item_type: 'issue',
    item_id: 10,
    parent_issue_id: null,
    hierarchy_level: 0,
    dependencies: 'issue-1,issue-6'
  }
];

let gantt, enhancer;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing Hierarchical Gantt Test');

  // Create Frappe Gantt instance
  gantt = new Gantt('#gantt-container', tasks, {
    view_mode: 'Day',
    bar_height: 30,
    padding: 12,
    date_format: 'YYYY-MM-DD',
    language: 'en',
    custom_popup_html: function(task) {
      return `
        <div class="details-container">
          <h5>${task.name}</h5>
          <p>Progress: ${task.progress}%</p>
          <p>${task.start} → ${task.end}</p>
          ${task.is_epic ? '<p><strong>📦 Epic</strong></p>' : ''}
          ${task.parent_issue_id ? '<p>Parent: ' + task.parent_issue_id + '</p>' : ''}
        </div>
      `;
    }
  });

  console.log('✅ Frappe Gantt created');

  // Add hierarchy enhancement
  if (window.HierarchicalGanttEnhancer) {
    enhancer = new HierarchicalGanttEnhancer(gantt, {
      showEpicBadges: true,
      showTreeLines: true,
      indentWidth: 20,
      allowCollapse: true
    });

    enhancer.enhance(tasks);
    console.log('✅ Hierarchy enhancer initialized');

    updateCounts();
  } else {
    console.error('❌ HierarchicalGanttEnhancer not found!');
  }

  // Wire up controls
  setupControls();
});

function setupControls() {
  document.getElementById('expand-all').addEventListener('click', () => {
    console.log('🔽 Expanding all tasks');
    enhancer.expandAll();
    updateCounts();
  });

  document.getElementById('collapse-all').addEventListener('click', () => {
    console.log('▶️  Collapsing all tasks');
    enhancer.collapseAll();
    updateCounts();
  });

  document.getElementById('toggle-tree-lines').addEventListener('click', () => {
    enhancer.options.showTreeLines = !enhancer.options.showTreeLines;
    console.log('🌳 Tree lines:', enhancer.options.showTreeLines ? 'ON' : 'OFF');
    enhancer.enhance(tasks);
  });

  document.getElementById('toggle-badges').addEventListener('click', () => {
    enhancer.options.showEpicBadges = !enhancer.options.showEpicBadges;
    console.log('🏷️  Epic badges:', enhancer.options.showEpicBadges ? 'ON' : 'OFF');
    enhancer.enhance(tasks);
  });

  document.getElementById('show-hierarchy').addEventListener('change', (e) => {
    if (e.target.checked) {
      console.log('✅ Hierarchy enabled');
      enhancer.enhance(tasks);
    } else {
      console.log('❌ Hierarchy disabled');
      enhancer.destroy();
    }
    updateCounts();
  });

  document.getElementById('reset').addEventListener('click', () => {
    console.log('🔄 Resetting state');
    localStorage.removeItem('gantt-hierarchy-expanded-state');
    location.reload();
  });
}

function updateCounts() {
  const expanded = enhancer.getExpandedCount ? enhancer.getExpandedCount() : 0;
  const collapsed = enhancer.getCollapsedCount ? enhancer.getCollapsedCount() : 0;
  const visible = tasks.filter(t => {
    if (!t.parent_issue_id) return true; // Root tasks always visible
    const parentId = `issue-${t.parent_issue_id}`;
    return enhancer.expanded.has(parentId);
  }).length;

  document.getElementById('expanded-count').textContent = `Expanded: ${expanded}`;
  document.getElementById('collapsed-count').textContent = `Collapsed: ${collapsed}`;
  document.getElementById('visible-count').textContent = `Visible Tasks: ${visible}`;
}
