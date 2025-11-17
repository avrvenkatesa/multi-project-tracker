class HierarchicalGanttEnhancer {
  constructor(ganttInstance, options = {}) {
    this.gantt = ganttInstance;
    this.container = ganttInstance.$svg;
    this.tasks = [];
    this.expanded = new Set();
    this.expandCollapseHandler = null; // Store handler reference
    this.options = {
      showEpicBadges: options.showEpicBadges !== undefined ? options.showEpicBadges : true,
      showTreeLines: options.showTreeLines !== undefined ? options.showTreeLines : true,
      indentWidth: options.indentWidth || 20,
      allowCollapse: options.allowCollapse !== undefined ? options.allowCollapse : true
    };
    
    this.loadState();
  }

  // Helper to get task name (handles both 'name' and 'title' fields)
  getTaskName(task) {
    return task.name || task.title || 'Unnamed Task';
  }

  // Helper to get task ID
  getTaskId(task) {
    return task.id || `${task.item_type}-${task.item_id}`;
  }

  normalizeTasks(tasks) {
    // Ensure all tasks have is_epic and issue_type fields
    // BUT: Only add missing fields, don't override existing correct data
    return tasks.map(task => {
      // ✅ ONLY set is_epic if it's truly missing (undefined/null)
      // Don't override false values!
      if (task.is_epic === undefined || task.is_epic === null) {
        task.is_epic = task.hierarchy_level === 0;
        console.log(`⚠️ Inferred is_epic=${task.is_epic} for "${task.name}" (level ${task.hierarchy_level})`);
      } else if (typeof task.is_epic === 'string') {
        // Handle PostgreSQL 't'/'f' strings
        const oldValue = task.is_epic;
        task.is_epic = task.is_epic === 't' || task.is_epic === 'true' || task.is_epic === '1';
        console.log(`🔄 Converted is_epic from "${oldValue}" to ${task.is_epic} for "${task.name}"`);
      } else if (typeof task.is_epic === 'number') {
        task.is_epic = task.is_epic === 1;
      }
      // Otherwise keep the boolean value as-is

      // ✅ ONLY set issue_type if missing
      if (!task.issue_type) {
        if (task.hierarchy_level === 0 || task.is_epic) {
          task.issue_type = 'epic';
        } else if (task.hierarchy_level === 1) {
          task.issue_type = 'task';
        } else if (task.hierarchy_level === 2) {
          task.issue_type = 'subtask';
        } else {
          task.issue_type = 'task';
        }
      }

      return task;
    });
  }

  enhance(tasks) {
    console.log('📥 Raw tasks received (BEFORE normalization):', tasks.length);
    console.table(tasks.slice(0, 3).map(t => ({
      name: t.name,
      hierarchy_level: t.hierarchy_level,
      is_epic: t.is_epic,
      parent_issue_id: t.parent_issue_id
    })));

    // Normalize tasks
    this.tasks = this.normalizeTasks(tasks);

    console.log('📋 After normalization:', this.tasks.length);
    const epicCount = this.tasks.filter(t => t.is_epic === true).length;
    const level0Count = this.tasks.filter(t => t.hierarchy_level === 0).length;
    const level1Count = this.tasks.filter(t => t.hierarchy_level === 1).length;
    const level2Count = this.tasks.filter(t => t.hierarchy_level === 2).length;

    console.log('👑 Epics (is_epic=true):', epicCount);
    console.log('📊 Distribution: Level 0:', level0Count, '| Level 1:', level1Count, '| Level 2:', level2Count);

    if (epicCount !== level0Count) {
      console.error('❌ MISMATCH! Epic count should equal Level 0 count!');
      console.log('Tasks marked as epic but not level 0:');
      this.tasks.filter(t => t.is_epic && t.hierarchy_level !== 0).forEach(t => {
        console.log(`  - ${t.name}: is_epic=${t.is_epic}, level=${t.hierarchy_level}`);
      });
    }

    this.tasks.filter(t => t.is_epic).forEach(epic => {
      console.log(`  👑 ${this.getTaskName(epic)} (level ${epic.hierarchy_level})`);
    });
    
    const hierarchyTree = this.buildHierarchyTree(this.tasks);
    
    const visibleTasks = this.getVisibleTasks(hierarchyTree);
    
    setTimeout(() => {
      if (this.options.showEpicBadges) {
        this.addEpicBadges();
      }
      
      if (this.options.allowCollapse) {
        this.addExpandCollapseButtons();
      }
      
      if (this.options.showTreeLines) {
        this.addIndentationMarkers();
      }
      
      // Remove old event listener
      if (this.expandCollapseHandler) {
        this.container.removeEventListener('click', this.expandCollapseHandler);
        console.log('🗑️ Removed old event handler');
      }
      
      // Verify container
      console.log('📍 Container element:', this.container);
      console.log('📍 Container tag:', this.container?.tagName);
      
      // Event delegation for expand/collapse buttons (SVG-compatible)
      this.expandCollapseHandler = (e) => {
        console.log('🖱️ Click detected!', e.target.tagName, e.target.classList ? Array.from(e.target.classList) : 'no classes');
        
        // For SVG, we need to check the target and its parents manually
        let element = e.target;
        let expandBtn = null;
        let attempts = 0;
        
        // Walk up the DOM tree looking for .gantt-expand-btn
        while (element && attempts < 5) {
          console.log(`  Checking element ${attempts}:`, element.tagName, element.classList ? Array.from(element.classList) : 'no classes');
          
          if (element.classList && element.classList.contains('gantt-expand-btn')) {
            expandBtn = element;
            console.log('  ✅ Found it at this element!');
            break;
          }
          
          // Also check parent's classList
          if (element.parentElement) {
            if (element.parentElement.classList && 
                element.parentElement.classList.contains('gantt-expand-btn')) {
              expandBtn = element.parentElement;
              console.log('  ✅ Found it at parent element!');
              break;
            }
          }
          
          element = element.parentElement;
          attempts++;
        }
        
        console.log('🔍 Found expand button:', expandBtn);
        
        if (expandBtn) {
          e.stopPropagation();
          e.preventDefault();
          const taskId = expandBtn.getAttribute('data-task-id');
          const task = this.tasks.find(t => this.getTaskId(t) === taskId);
          console.log(`✅ Chevron clicked for task: ${this.getTaskName(task)} (${taskId})`);
          this.toggleExpand(taskId);
        }
      };
      
      this.container.addEventListener('click', this.expandCollapseHandler, true);
      console.log('✅ Event delegation attached for expand/collapse');
      
      // Test if event listener was added
      setTimeout(() => {
        console.log('🧪 Testing event listener setup...');
        const buttons = this.container.querySelectorAll('.gantt-expand-btn');
        console.log(`Found ${buttons.length} chevron buttons in DOM`);
        buttons.forEach((btn, i) => {
          const taskId = btn.getAttribute('data-task-id');
          const task = this.tasks.find(t => this.getTaskId(t) === taskId);
          console.log(`  Button ${i + 1}: ${this.getTaskName(task)} (${taskId})`);
        });
      }, 200);
    }, 100);
    
    return visibleTasks;
  }

  buildHierarchyTree(tasks) {
    const taskMap = new Map();
    const roots = [];
    
    tasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      taskMap.set(taskId, {
        ...task,
        id: taskId,
        children: [],
        hierarchy_level: 0
      });
    });
    
    tasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      const node = taskMap.get(taskId);
      
      if (task.parent_issue_id && task.item_type === 'issue') {
        const parentId = `issue-${task.parent_issue_id}`;
        const parent = taskMap.get(parentId);
        
        if (parent) {
          parent.children.push(node);
          node.hierarchy_level = parent.hierarchy_level + 1;
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });
    
    const calculateLevels = (node, level = 0) => {
      node.hierarchy_level = level;
      node.children.forEach(child => calculateLevels(child, level + 1));
    };
    
    roots.forEach(root => calculateLevels(root));
    
    return roots;
  }

  getVisibleTasks(hierarchyTree) {
    const visible = [];
    
    const traverse = (node, parentExpanded = true) => {
      if (!parentExpanded) return;
      
      visible.push({
        ...node,
        _hasChildren: node.children.length > 0,
        _isExpanded: this.expanded.has(node.id),
        _hierarchyLevel: node.hierarchy_level
      });
      
      if (this.expanded.has(node.id) || node.children.length === 0) {
        node.children.forEach(child => traverse(child, this.expanded.has(node.id)));
      }
    };
    
    hierarchyTree.forEach(root => traverse(root, true));
    
    return visible;
  }

  filterCollapsedTasks(tasks) {
    const tree = this.buildHierarchyTree(tasks);
    return this.getVisibleTasks(tree);
  }

  addEpicBadges() {
    console.log('🏷️ Adding epic badges...');
    const epicTasks = this.tasks.filter(t => t.is_epic);
    console.log(`Found ${epicTasks.length} epic tasks:`, epicTasks.map(t => this.getTaskName(t)));

    epicTasks.forEach(task => {
      // ✅ Use correct ID format: item_type-item_id
      const taskId = `${task.item_type}-${task.item_id}`;
      const barWrapper = this.container.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
      console.log(`Looking for bar-wrapper with data-id="${taskId}":`, barWrapper ? '✅ Found' : '❌ Not found');

      if (!barWrapper) {
        console.warn(`⚠️ No bar wrapper found for epic task: ${this.getTaskName(task)} (${taskId})`);
        return;
      }

      const bar = barWrapper.querySelector('.bar');
      if (bar) {
        bar.classList.add('bar-epic');
        console.log(`✅ Added .bar-epic class to ${this.getTaskName(task)}`);
      }

      // Remove existing badge if present
      const existingBadge = barWrapper.querySelector('.gantt-epic-badge-group');
      if (existingBadge) {
        existingBadge.remove();
      }

      // Get bar dimensions
      const barRect = bar.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();

      const x = parseFloat(bar.getAttribute('x')) || 0;
      const y = parseFloat(bar.getAttribute('y')) || 0;
      const height = parseFloat(bar.getAttribute('height')) || 30;

      // Create badge group
      const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      badgeGroup.classList.add('gantt-epic-badge-group');
      badgeGroup.setAttribute('data-task-id', taskId);

      // Background rectangle
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.classList.add('epic-badge-rect');
      rect.setAttribute('x', x + 2);
      rect.setAttribute('y', y + 2);
      rect.setAttribute('width', '36');
      rect.setAttribute('height', height - 4);
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', '#6366f1');

      // Text label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.classList.add('gantt-epic-badge');
      text.setAttribute('x', x + 20);
      text.setAttribute('y', y + height / 2 + 3);
      text.setAttribute('fill', 'white');
      text.setAttribute('font-size', '9');
      text.setAttribute('font-weight', '600');
      text.setAttribute('text-anchor', 'middle');
      text.textContent = 'EPIC';

      badgeGroup.appendChild(rect);
      badgeGroup.appendChild(text);
      barWrapper.appendChild(badgeGroup);

      console.log(`✅ Epic badge added for ${this.getTaskName(task)} at x=${x}, y=${y}`);
    });
  }

  addExpandCollapseButtons() {
    console.log('🔘 Adding expand/collapse buttons...');
    
    if (!this.container) return;
    
    const svg = this.container;
    const parentTasks = this.tasks.filter(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      const children = this.tasks.filter(t => 
        t.parent_issue_id === task.item_id && t.item_type === 'issue'
      );
      if (children.length > 0) {
        console.log(`  📁 ${this.getTaskName(task)} has ${children.length} children`);
      }
      return children.length > 0;
    });
    
    console.log(`Found ${parentTasks.length} parent tasks with children`);
    
    parentTasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      const barWrapper = svg.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
      if (!barWrapper) {
        console.warn(`⚠️ No bar wrapper found for parent task: ${this.getTaskName(task)}`);
        return;
      }
      
      const bar = barWrapper.querySelector('.bar');
      if (!bar) return;
      
      const barBox = bar.getBBox();
      const isExpanded = this.expanded.has(taskId);
      
      // Remove old button if exists
      const oldButton = barWrapper.querySelector('.gantt-expand-btn');
      if (oldButton) {
        oldButton.remove();
      }
      
      // Create button group
      const buttonGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      buttonGroup.classList.add('gantt-expand-btn');
      buttonGroup.setAttribute('data-task-id', taskId); // Important for delegation
      buttonGroup.style.cursor = 'pointer';
      buttonGroup.style.pointerEvents = 'all'; // Allow clicking
      
      // Create circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', barBox.x - 15);
      circle.setAttribute('cy', barBox.y + barBox.height / 2);
      circle.setAttribute('r', this.options.allowCollapse ? 8 : 8);
      circle.setAttribute('fill', 'white');
      circle.setAttribute('stroke', '#e1e4e8');
      circle.setAttribute('stroke-width', '2');
      circle.style.pointerEvents = 'none'; // Let parent handle events
      
      // Create chevron icon
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      chevron.setAttribute('x', barBox.x - 15);
      chevron.setAttribute('y', barBox.y + barBox.height / 2 + 3.5);
      chevron.setAttribute('text-anchor', 'middle');
      chevron.setAttribute('font-family', 'Font Awesome 6 Free');
      chevron.setAttribute('font-weight', '900');
      chevron.setAttribute('font-size', '8');
      chevron.setAttribute('fill', '#6366f1');
      chevron.classList.add('gantt-expand-icon');
      chevron.classList.add(isExpanded ? 'expanded' : 'collapsed');
      chevron.textContent = isExpanded ? '\uf078' : '\uf054';
      chevron.style.pointerEvents = 'none'; // Let parent handle events
      
      buttonGroup.appendChild(circle);
      buttonGroup.appendChild(chevron);
      barWrapper.appendChild(buttonGroup);
      
      console.log(`  ✅ Added ${isExpanded ? 'expanded' : 'collapsed'} button for ${this.getTaskName(task)}`);
    });
  }

  addIndentationMarkers() {
    if (!this.container) return;
    
    const svg = this.container;
    
    let treeLineGroup = svg.querySelector('.gantt-tree-lines-group');
    if (!treeLineGroup) {
      treeLineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      treeLineGroup.setAttribute('class', 'gantt-tree-lines-group');
      svg.insertBefore(treeLineGroup, svg.firstChild);
    } else {
      treeLineGroup.innerHTML = '';
    }
    
    this.tasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      const level = this.getHierarchyLevel(task);
      
      const barWrapper = svg.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
      if (barWrapper) {
        barWrapper.classList.add(`gantt-level-${Math.min(level, 3)}`);
        barWrapper.setAttribute('data-indent-level', level);
      }
      
      if (level === 0) return;
      
      if (!barWrapper) return;
      
      const bar = barWrapper.querySelector('.bar');
      if (!bar) return;
      
      const bbox = bar.getBBox();
      const indentOffset = level * this.options.indentWidth;
      
      const horizontalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horizontalLine.setAttribute('class', 'gantt-tree-line gantt-tree-line-horizontal');
      horizontalLine.setAttribute('x1', bbox.x - indentOffset);
      horizontalLine.setAttribute('y1', bbox.y + bbox.height / 2);
      horizontalLine.setAttribute('x2', bbox.x - 4);
      horizontalLine.setAttribute('y2', bbox.y + bbox.height / 2);
      treeLineGroup.appendChild(horizontalLine);
      
      if (task.parent_issue_id) {
        const parentId = `issue-${task.parent_issue_id}`;
        const parentWrapper = svg.querySelector(`.bar-wrapper[data-id="${parentId}"]`);
        
        if (parentWrapper) {
          const parentBar = parentWrapper.querySelector('.bar');
          if (parentBar) {
            const parentBbox = parentBar.getBBox();
            
            const verticalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            verticalLine.setAttribute('class', 'gantt-tree-line gantt-tree-line-vertical');
            verticalLine.setAttribute('x1', bbox.x - indentOffset);
            verticalLine.setAttribute('y1', parentBbox.y + parentBbox.height / 2);
            verticalLine.setAttribute('x2', bbox.x - indentOffset);
            verticalLine.setAttribute('y2', bbox.y + bbox.height / 2);
            treeLineGroup.appendChild(verticalLine);
          }
        }
      }
    });
  }

  getHierarchyLevel(task) {
    let level = 0;
    let currentTask = task;
    
    while (currentTask.parent_issue_id && currentTask.item_type === 'issue') {
      level++;
      currentTask = this.tasks.find(t => 
        t.item_id === currentTask.parent_issue_id && t.item_type === 'issue'
      );
      
      if (!currentTask) break;
    }
    
    return level;
  }

  toggleExpand(taskId) {
    const task = this.tasks.find(t => this.getTaskId(t) === taskId);
    const taskName = task ? this.getTaskName(task) : taskId;
    
    console.log(`🔄 Toggle expand for task: ${taskName} (${taskId})`);
    
    if (this.expanded.has(taskId)) {
      this.expanded.delete(taskId);
      console.log(`  ➡️ Collapsed ${taskName}`);
    } else {
      this.expanded.add(taskId);
      console.log(`  ⬇️ Expanded ${taskName}`);
    }
    
    this.saveState();
    
    // ✅ CRITICAL: Re-render the Gantt chart to show/hide children
    console.log('🔄 Re-rendering Gantt chart after toggle...');
    const visibleTasks = this.enhance(this.tasks);
    
    // Refresh the Gantt chart with new visible tasks
    if (this.gantt && this.gantt.refresh) {
      this.gantt.refresh(visibleTasks);
      console.log(`✅ Gantt chart refreshed with ${visibleTasks.length} visible tasks`);
    }
    
    if (this.options.onToggle) {
      this.options.onToggle(taskId, this.expanded.has(taskId));
    }
  }

  saveState() {
    try {
      const state = {
        expanded: Array.from(this.expanded)
      };
      localStorage.setItem('gantt-hierarchy-state', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save Gantt hierarchy state:', error);
    }
  }

  loadState() {
    try {
      const stored = localStorage.getItem('gantt-hierarchy-state');
      if (stored) {
        const state = JSON.parse(stored);
        this.expanded = new Set(state.expanded || []);
      } else {
        const allTaskIds = this.tasks.map(t => `${t.item_type}-${t.item_id}`);
        this.expanded = new Set(allTaskIds);
      }
    } catch (error) {
      console.warn('Failed to load Gantt hierarchy state:', error);
      this.expanded = new Set();
    }
  }

  expandAll() {
    console.log('📂 Expanding all parent tasks');
    
    // Find all parent tasks
    const parentTasks = this.tasks.filter(task => {
      const hasChildren = this.tasks.some(t => 
        t.parent_issue_id === task.item_id && t.item_type === 'issue'
      );
      return hasChildren;
    });
    
    console.log('Found', parentTasks.length, 'parent tasks');
    
    // Add all to expanded Set
    parentTasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      this.expanded.add(taskId);
    });
    
    console.log('Expanded Set size:', this.expanded.size);
    
    // Re-render
    const visibleTasks = this.enhance(this.tasks);
    if (this.gantt && this.gantt.refresh) {
      this.gantt.refresh(visibleTasks);
    }
    this.saveState();
  }

  collapseAll() {
    console.log('📁 Collapsing all parent tasks');
    this.expanded.clear();
    const visibleTasks = this.enhance(this.tasks);
    if (this.gantt && this.gantt.refresh) {
      this.gantt.refresh(visibleTasks);
    }
    this.saveState();
  }
  
  destroy() {
    console.log('🧹 Cleaning up hierarchy enhancer');
    
    // Clear expanded Set
    this.expanded.clear();
    
    console.log('Expanded Set size:', this.expanded.size);
    
    // Re-render
    this.enhance(this.tasks);
    this.saveState();
  }

  getExpandedCount() {
    return this.expanded.size;
  }

  getCollapsedCount() {
    const allParentIds = this.tasks
      .filter(task => this.tasks.some(t => 
        t.parent_issue_id === task.item_id && t.item_type === 'issue'
      ))
      .map(task => `${task.item_type}-${task.item_id}`);
    
    return allParentIds.filter(id => !this.expanded.has(id)).length;
  }

  destroy() {
    // Remove event listener
    if (this.expandCollapseHandler) {
      this.container.removeEventListener('click', this.expandCollapseHandler);
      this.expandCollapseHandler = null;
    }
    
    if (this.container) {
      const elementsToRemove = this.container.querySelectorAll(
        '.gantt-hierarchy-controls, .gantt-expand-btn, .gantt-tree-lines-group'
      );
      elementsToRemove.forEach(el => el.remove());
      
      const barWrappers = this.container.querySelectorAll('.bar-wrapper');
      barWrappers.forEach(wrapper => {
        wrapper.classList.remove('bar-epic', 'gantt-level-0', 'gantt-level-1', 'gantt-level-2', 'gantt-level-3');
        wrapper.removeAttribute('data-indent-level');
      });
    }
  }
}

if (typeof window !== 'undefined') {
  window.HierarchicalGanttEnhancer = HierarchicalGanttEnhancer;
}
