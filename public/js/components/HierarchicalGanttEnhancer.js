class HierarchicalGanttEnhancer {
  constructor(ganttInstance, options = {}) {
    this.gantt = ganttInstance;
    this.container = ganttInstance.$svg;
    this.tasks = [];
    this.expanded = new Set();
    this.options = {
      showEpicBadges: options.showEpicBadges !== undefined ? options.showEpicBadges : true,
      showTreeLines: options.showTreeLines !== undefined ? options.showTreeLines : true,
      indentWidth: options.indentWidth || 20,
      allowCollapse: options.allowCollapse !== undefined ? options.allowCollapse : true
    };
    
    this.loadState();
  }

  enhance(tasks) {
    this.tasks = tasks;
    
    const hierarchyTree = this.buildHierarchyTree(tasks);
    
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
    if (!this.container) return;
    
    const svg = this.container;
    
    this.tasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      const hasChildren = this.tasks.some(t => 
        t.parent_issue_id === task.item_id && t.item_type === 'issue'
      );
      
      if (!hasChildren) return;
      
      const barWrapper = svg.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
      if (!barWrapper) return;
      
      const bar = barWrapper.querySelector('.bar');
      if (!bar) return;
      
      const bbox = bar.getBBox();
      
      let badgeGroup = barWrapper.querySelector('.epic-badge-group');
      if (!badgeGroup) {
        badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        badgeGroup.setAttribute('class', 'epic-badge-group');
        barWrapper.appendChild(badgeGroup);
      } else {
        badgeGroup.innerHTML = '';
      }
      
      const badgeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      badgeRect.setAttribute('x', bbox.x + 4);
      badgeRect.setAttribute('y', bbox.y + 2);
      badgeRect.setAttribute('width', '36');
      badgeRect.setAttribute('height', bbox.height - 4);
      badgeRect.setAttribute('rx', '3');
      badgeRect.setAttribute('fill', '#6366f1');
      badgeRect.setAttribute('opacity', '0.9');
      badgeGroup.appendChild(badgeRect);
      
      const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badgeText.setAttribute('x', bbox.x + 22);
      badgeText.setAttribute('y', bbox.y + bbox.height / 2 + 3.5);
      badgeText.setAttribute('text-anchor', 'middle');
      badgeText.setAttribute('font-size', '9px');
      badgeText.setAttribute('font-weight', '700');
      badgeText.setAttribute('fill', '#ffffff');
      badgeText.setAttribute('pointer-events', 'none');
      badgeText.textContent = 'EPIC';
      badgeGroup.appendChild(badgeText);
      
      barWrapper.classList.add('gantt-epic-bar');
    });
  }

  addExpandCollapseButtons() {
    if (!this.container) return;
    
    const svg = this.container;
    
    this.tasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      const hasChildren = this.tasks.some(t => 
        t.parent_issue_id === task.item_id && t.item_type === 'issue'
      );
      
      if (!hasChildren) return;
      
      const barWrapper = svg.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
      if (!barWrapper) return;
      
      const bar = barWrapper.querySelector('.bar');
      if (!bar) return;
      
      const bbox = bar.getBBox();
      const isExpanded = this.expanded.has(taskId);
      
      let buttonGroup = barWrapper.querySelector('.expand-collapse-group');
      if (!buttonGroup) {
        buttonGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        buttonGroup.setAttribute('class', 'expand-collapse-group');
        buttonGroup.setAttribute('style', 'cursor: pointer;');
        barWrapper.appendChild(buttonGroup);
      } else {
        buttonGroup.innerHTML = '';
      }
      
      const buttonCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      buttonCircle.setAttribute('cx', bbox.x - 12);
      buttonCircle.setAttribute('cy', bbox.y + bbox.height / 2);
      buttonCircle.setAttribute('r', '8');
      buttonCircle.setAttribute('fill', '#ffffff');
      buttonCircle.setAttribute('stroke', '#6366f1');
      buttonCircle.setAttribute('stroke-width', '2');
      buttonGroup.appendChild(buttonCircle);
      
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      chevron.setAttribute('x', bbox.x - 12);
      chevron.setAttribute('y', bbox.y + bbox.height / 2 + 3.5);
      chevron.setAttribute('text-anchor', 'middle');
      chevron.setAttribute('font-family', 'Font Awesome 6 Free');
      chevron.setAttribute('font-weight', '900');
      chevron.setAttribute('font-size', '8px');
      chevron.setAttribute('fill', '#6366f1');
      chevron.setAttribute('pointer-events', 'none');
      chevron.textContent = isExpanded ? '\uf078' : '\uf054';
      buttonGroup.appendChild(chevron);
      
      buttonGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpand(taskId);
      });
    });
  }

  addIndentationMarkers() {
    if (!this.container) return;
    
    const svg = this.container;
    
    let treeLineGroup = svg.querySelector('.tree-line-group');
    if (!treeLineGroup) {
      treeLineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      treeLineGroup.setAttribute('class', 'tree-line-group');
      svg.insertBefore(treeLineGroup, svg.firstChild);
    } else {
      treeLineGroup.innerHTML = '';
    }
    
    this.tasks.forEach(task => {
      const taskId = `${task.item_type}-${task.item_id}`;
      const level = this.getHierarchyLevel(task);
      
      if (level === 0) return;
      
      const barWrapper = svg.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
      if (!barWrapper) return;
      
      const bar = barWrapper.querySelector('.bar');
      if (!bar) return;
      
      const bbox = bar.getBBox();
      const indentOffset = level * this.options.indentWidth;
      
      const horizontalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      horizontalLine.setAttribute('x1', bbox.x - indentOffset);
      horizontalLine.setAttribute('y1', bbox.y + bbox.height / 2);
      horizontalLine.setAttribute('x2', bbox.x - 4);
      horizontalLine.setAttribute('y2', bbox.y + bbox.height / 2);
      horizontalLine.setAttribute('stroke', 'var(--gantt-border, #e1e4e8)');
      horizontalLine.setAttribute('stroke-width', '1.5');
      horizontalLine.setAttribute('opacity', '0.6');
      treeLineGroup.appendChild(horizontalLine);
      
      if (task.parent_issue_id) {
        const parentId = `issue-${task.parent_issue_id}`;
        const parentWrapper = svg.querySelector(`.bar-wrapper[data-id="${parentId}"]`);
        
        if (parentWrapper) {
          const parentBar = parentWrapper.querySelector('.bar');
          if (parentBar) {
            const parentBbox = parentBar.getBBox();
            
            const verticalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            verticalLine.setAttribute('x1', bbox.x - indentOffset);
            verticalLine.setAttribute('y1', parentBbox.y + parentBbox.height / 2);
            verticalLine.setAttribute('x2', bbox.x - indentOffset);
            verticalLine.setAttribute('y2', bbox.y + bbox.height / 2);
            verticalLine.setAttribute('stroke', 'var(--gantt-border, #e1e4e8)');
            verticalLine.setAttribute('stroke-width', '1.5');
            verticalLine.setAttribute('opacity', '0.6');
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
    if (this.expanded.has(taskId)) {
      this.expanded.delete(taskId);
    } else {
      this.expanded.add(taskId);
    }
    
    this.saveState();
    
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
    const allParentIds = this.tasks
      .filter(task => this.tasks.some(t => 
        t.parent_issue_id === task.item_id && t.item_type === 'issue'
      ))
      .map(task => `${task.item_type}-${task.item_id}`);
    
    this.expanded = new Set(allParentIds);
    this.saveState();
  }

  collapseAll() {
    this.expanded.clear();
    this.saveState();
  }

  destroy() {
    if (this.container) {
      const elementsToRemove = this.container.querySelectorAll(
        '.epic-badge-group, .expand-collapse-group, .tree-line-group'
      );
      elementsToRemove.forEach(el => el.remove());
    }
  }
}

if (typeof window !== 'undefined') {
  window.HierarchicalGanttEnhancer = HierarchicalGanttEnhancer;
}
