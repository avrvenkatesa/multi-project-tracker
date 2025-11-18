# Gantt Hierarchy CSS Reference

## Class Structure Overview

This document outlines all CSS classes used in the hierarchical Gantt chart feature and their integration with Frappe Gantt.

---

## 📊 **SVG Structure**

```xml
<svg>
  <defs>
    <linearGradient id="gantt-epic-gradient">...</linearGradient>
  </defs>
  
  <!-- Tree Lines (Behind bars) -->
  <g class="gantt-tree-lines-group">
    <line class="gantt-tree-line gantt-tree-line-horizontal" />
    <line class="gantt-tree-line gantt-tree-line-vertical" />
  </g>
  
  <!-- Frappe Gantt Elements -->
  <g class="grid">...</g>
  <g class="date">...</g>
  <g class="arrow">...</g>
  
  <!-- Task Bars with Hierarchy -->
  <g class="bar-wrapper bar-epic gantt-level-0" data-indent-level="0">
    <rect class="bar bar-epic" />
    <rect class="bar-progress" />
    <text class="bar-label" />
    
    <!-- Epic Badge -->
    <g class="gantt-hierarchy-controls">
      <rect class="epic-badge-rect" />
      <text class="epic-badge-text gantt-epic-badge">EPIC</text>
    </g>
    
    <!-- Expand/Collapse Button -->
    <g class="gantt-expand-btn">
      <circle />
      <text class="gantt-expand-icon expanded">▼</text>
    </g>
  </g>
  
  <!-- Child Task -->
  <g class="bar-wrapper gantt-level-1" data-indent-level="1">
    <rect class="bar" />
    <rect class="bar-progress" />
    <text class="bar-label" />
  </g>
  
  <!-- Existing Swim Lanes -->
  <g class="lane-overlays">...</g>
</svg>
```

---

## 🎨 **CSS Classes by Category**

### 1. Epic Badges

| Class | Element | Purpose |
|-------|---------|---------|
| `.gantt-hierarchy-controls` | SVG `<g>` | Container for badges and controls |
| `.epic-badge-rect` | SVG `<rect>` | Purple background rectangle |
| `.epic-badge-text` | SVG `<text>` | White "EPIC" text |
| `.gantt-epic-badge` | SVG `<text>` | Additional styling class |

**Visual Appearance:**
```
┌─────────────────────────────┐
│ 🟣 EPIC │ Task Name         │
└─────────────────────────────┘
```

**CSS Properties:**
- Background: `#6366f1` (indigo)
- Text: `#ffffff` (white), 9px, weight 700
- Size: 36px × (bar height - 4px)
- Position: 4px from bar start

---

### 2. Expand/Collapse Buttons

| Class | Element | Purpose |
|-------|---------|---------|
| `.gantt-expand-btn` | SVG `<g>` | Button container (clickable) |
| `.gantt-expand-btn circle` | SVG `<circle>` | White circle with border |
| `.gantt-expand-icon` | SVG `<text>` | Font Awesome chevron |
| `.gantt-expand-icon.expanded` | SVG `<text>` | Chevron down (▼) |
| `.gantt-expand-icon.collapsed` | SVG `<text>` | Chevron right (▶) |

**Visual Appearance:**
```
Expanded:   ⊙▼  [Epic Task Bar]
Collapsed:  ⊙▶  [Epic Task Bar]
```

**CSS Properties:**
- Circle radius: 8px (6px in compact view)
- Border: 2px solid `var(--gantt-border)`
- Fill: `#ffffff`, hover: `#f0f4ff`
- Hover effect: scale(1.1), shadow
- Position: 12px left of bar start

---

### 3. Tree Lines

| Class | Element | Purpose |
|-------|---------|---------|
| `.gantt-tree-lines-group` | SVG `<g>` | Container for all tree lines |
| `.gantt-tree-line` | SVG `<line>` | Base class for connection lines |
| `.gantt-tree-line-horizontal` | SVG `<line>` | Horizontal connector to bar |
| `.gantt-tree-line-vertical` | SVG `<line>` | Vertical line between siblings |

**Visual Appearance:**
```
Epic
 ├── Child 1
 │   └── Grandchild
 └── Child 2
```

**CSS Properties:**
- Stroke: `var(--gantt-border)` (#e0e0e0)
- Width: 1px (1.5px on hover)
- Style: dashed (2,2 pattern)
- Opacity: 0.6 (1.0 on hover)

---

### 4. Epic Bar Enhancements

| Class | Element | Purpose |
|-------|---------|---------|
| `.bar-epic` | Both wrapper & bar | Marks task as epic/parent |
| `.gantt .bar-epic` | SVG `<rect>` | Enhanced bar styling |

**CSS Properties:**
- Fill: `url(#gantt-epic-gradient)`
- Stroke: `#6366f1` (indigo), 2px
- Shadow: `drop-shadow(0 2px 4px rgba(99, 102, 241, 0.2))`
- Font-weight: 600

---

### 5. Hierarchy Level Indicators

| Class | Applies To | Purpose |
|-------|-----------|---------|
| `.gantt-level-0` | Root/Epic tasks | Level 0 styling |
| `.gantt-level-1` | Direct children | Level 1 styling |
| `.gantt-level-2` | Grandchildren | Level 2 styling |
| `.gantt-level-3` | Great-grandchildren | Level 3+ styling |

**Visual Hierarchy:**
```css
Level 0: height: 100%, font-weight: 600
Level 1: height: 90%,  opacity: 0.98
Level 2: height: 85%,  opacity: 0.96
Level 3: height: 80%,  opacity: 0.94
```

**Data Attributes:**
```html
<g class="bar-wrapper gantt-level-2" data-indent-level="2">
```

---

### 6. Collapsed State

| Class | Element | Purpose |
|-------|---------|---------|
| `.gantt-task-collapsed` | Bar wrapper | Marks collapsed task |
| `.gantt-child-count-badge` | SVG `<text>` | Shows child count |
| `.gantt-child-count-badge-bg` | SVG `<rect>` | Badge background |

**Visual Appearance:**
```
⊙▶ Epic (5 children hidden)
```

**CSS Properties:**
- Collapsed opacity: 0.7
- Badge: gray text on light gray background

---

## 🎯 **Integration with Existing Features**

### Swim Lanes Compatibility

```css
/* Z-index layering */
.gantt-tree-lines-group { z-index: 0; }  /* Behind bars */
.lane-overlays { z-index: 1; }            /* Frappe swim lanes */
.gantt-hierarchy-controls { z-index: 2; } /* Above bars */
```

### Dependency Highlighting

```css
/* Dim hierarchy when dependencies active */
.gantt-container:has(.dependency-source) .gantt-tree-line {
  opacity: 0.3;
}

/* Restore for highlighted tasks */
.bar-epic.dependency-highlighted ~ .gantt-tree-line {
  opacity: 0.6;
}
```

### Compact View

```css
/* Automatically adapts when .gantt-expanded class present */
.gantt-container.gantt-expanded .gantt-expand-btn circle {
  r: 6px;  /* Reduced from 8px */
}

.gantt-container.gantt-expanded .epic-badge-rect {
  width: 32px;  /* Reduced from 36px */
}
```

### Critical Path

```css
/* Epic + Critical = Red border */
.gantt .bar-wrapper.bar-critical.bar-epic .bar {
  stroke: #dc2626;
  stroke-width: 2.5px;
}
```

---

## 🎨 **Design Tokens Used**

```css
/* From design-tokens.css */
--gantt-border: #e1e4e8;
--gantt-bar-critical: #e8b4b8;
--gantt-text: #2c3e50;
--gantt-accent: #5b7c99;
```

### Custom Colors

```css
/* Indigo theme for hierarchy */
--hierarchy-primary: #6366f1;
--hierarchy-hover: #4f46e5;
--hierarchy-light: #f0f4ff;
--hierarchy-lighter: #e0e7ff;
```

---

## 📱 **Responsive Breakpoints**

### Mobile (≤768px)

```css
.epic-badge-rect { width: 28px; }
.epic-badge-text { font-size: 7px; }
.gantt-expand-btn circle { r: 7px; }
.gantt-tree-line { stroke-width: 0.75px; }
```

---

## 🖨️ **Print Styles**

```css
/* Optimized for printing */
.gantt-expand-btn { display: none; }
.gantt-tree-line { stroke: #000; stroke-width: 1px; }
.bar-epic { fill: #e0e7ff; stroke: #000; }
```

---

## ♿ **Accessibility**

### Focus States

```css
.gantt-expand-btn:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
  border-radius: 50%;
}
```

### High Contrast Mode

```css
@media (prefers-contrast: high) {
  .epic-badge-rect { stroke: #000; stroke-width: 1px; }
  .gantt-tree-line { stroke: #000; stroke-width: 2px; }
}
```

---

## 🎬 **Animations**

### Fade In (All hierarchy elements)

```css
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.gantt-epic-badge,
.gantt-expand-btn,
.gantt-tree-line {
  animation: fadeIn 0.2s ease-in-out;
}
```

### Hover Transitions

```css
.gantt-expand-btn {
  transition: all 0.2s ease-in-out;
}

.gantt-expand-icon {
  transition: transform 0.2s ease-in-out;
  transform-origin: center;
}
```

---

## 🔧 **JavaScript Usage**

### Adding Classes

```javascript
// Epic bars
barWrapper.classList.add('bar-epic');
bar.classList.add('bar-epic');

// Hierarchy levels
barWrapper.classList.add(`gantt-level-${level}`);
barWrapper.setAttribute('data-indent-level', level);
```

### Removing Classes (Cleanup)

```javascript
barWrapper.classList.remove(
  'bar-epic',
  'gantt-level-0',
  'gantt-level-1',
  'gantt-level-2',
  'gantt-level-3'
);
barWrapper.removeAttribute('data-indent-level');
```

---

## 📋 **Complete Class List**

**Primary Classes:**
- `.gantt-hierarchy-controls`
- `.gantt-expand-btn`
- `.gantt-tree-lines-group`
- `.bar-epic`
- `.gantt-level-0` through `.gantt-level-3`

**Badge Classes:**
- `.epic-badge-rect`
- `.epic-badge-text`
- `.gantt-epic-badge`

**Button Classes:**
- `.gantt-expand-icon`
- `.gantt-expand-icon.expanded`
- `.gantt-expand-icon.collapsed`

**Tree Line Classes:**
- `.gantt-tree-line`
- `.gantt-tree-line-horizontal`
- `.gantt-tree-line-vertical`

**State Classes:**
- `.gantt-task-collapsed`
- `.gantt-child-count-badge`
- `.gantt-child-count-badge-bg`

**Utility Classes:**
- `.gantt-bar-indented`
- `.gantt-sr-only`

---

## 🔗 **Integration Checklist**

✅ Works with Frappe Gantt v0.6.1
✅ Compatible with swim lanes
✅ Preserves dependency highlighting
✅ Adapts to compact view toggle
✅ Supports critical path highlighting
✅ Maintains view mode switching
✅ Accessible (keyboard, screen readers, high contrast)
✅ Responsive (mobile, tablet, desktop)
✅ Print-friendly
✅ Animated (smooth transitions)

---

## 📊 **Performance Considerations**

- **SVG groups**: Minimal DOM overhead
- **CSS animations**: Hardware-accelerated
- **Event delegation**: One listener per button
- **Class toggles**: Faster than inline styles
- **Z-index layering**: Proper stacking without conflicts

---

## 🐛 **Common Issues & Solutions**

### Tree lines misaligned
**Cause**: Parent bars not visible during getBBox()
**Solution**: Ensure all bars visible before measuring

### Badges not showing
**Cause**: Incorrect task data or timing
**Solution**: Use 100ms setTimeout for DOM readiness

### Classes not applying
**Cause**: Frappe Gantt recreates elements
**Solution**: Reapply after gantt.refresh()

### Compact view not working
**Cause**: Container missing .gantt-expanded class
**Solution**: Check compact toggle state management

---

## 📚 **Related Files**

- `/public/css/gantt-hierarchy.css` - This stylesheet
- `/public/js/components/HierarchicalGanttEnhancer.js` - JavaScript component
- `/public/css/design-tokens.css` - Color variables
- `/public/schedules.html` - Gantt container markup
- `/public/js/schedules.js` - Gantt rendering logic

---

**Last Updated**: Story 4.6 - Prompt 2
**Status**: ✅ Complete and tested
