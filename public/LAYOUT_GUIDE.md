# Layout & Spacing Guidelines

## Purpose
This document establishes consistent layout patterns and spacing for the Multi-Project Tracker. All pages should follow these guidelines to ensure a cohesive user experience.

## Page Layout Patterns

### Dashboard/List Views (Wide Layout)
**Use for:** Project lists, dashboards, Gantt charts, risk registers, schedules
- Container: `max-w-7xl mx-auto`
- Padding: `px-4 sm:px-6 lg:px-8` (responsive)
- Vertical spacing: `py-8`

**Example:**
```html
<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Dashboard content -->
</main>
```

### Forms/Detail Views (Medium Layout)
**Use for:** Create/edit forms, detail modals, settings pages
- Container: `max-w-4xl mx-auto`
- Padding: `px-4 sm:px-6`
- Vertical spacing: `py-6`

**Example:**
```html
<main class="max-w-4xl mx-auto px-4 sm:px-6 py-6">
  <!-- Form content -->
</main>
```

### Full-Width Views
**Use for:** Login/register pages, help documentation
- Container: No max-width constraint
- Padding: `px-6`
- Vertical spacing: `py-8`

## Spacing Tokens

Use design tokens from `design-tokens.css`:

| Token | Value | Use Case |
|-------|-------|----------|
| `--spacing-xs` | 4px | Tight icon spacing, badges |
| `--spacing-sm` | 8px | Related elements, inline gaps |
| `--spacing-md` | 12px | Card padding, form field spacing |
| `--spacing-lg` | 16px | Section gaps, button groups |
| `--spacing-xl` | 24px | Page padding, major element separation |
| `--spacing-2xl` | 32px | Major sections, modal padding |
| `--spacing-3xl` | 48px | Hero sections, page headers |

### Application Examples

**Card Spacing:**
```css
padding: var(--spacing-2xl); /* 32px */
margin-bottom: var(--spacing-xl); /* 24px between cards */
```

**Section Gaps:**
```css
gap: var(--spacing-lg); /* 16px between related items */
```

**Form Fields:**
```css
margin-bottom: var(--spacing-md); /* 12px between fields */
```

## Consistency Checklist

When updating a page, verify:
- [ ] Correct max-width container for page type
- [ ] Consistent padding using design tokens
- [ ] Proper vertical spacing between sections
- [ ] Responsive padding (sm:px-6 lg:px-8)
- [ ] Use of spacing variables instead of hard-coded values

## Migration Strategy

1. **Identify page type** (dashboard, form, or full-width)
2. **Apply appropriate container** class
3. **Replace hard-coded spacing** with design tokens
4. **Test responsive behavior** at different screen sizes
5. **Verify visual alignment** with other pages

## Examples

### Before (Inconsistent):
```html
<div style="max-width: 1200px; padding: 20px;">
  <div style="margin-bottom: 15px;">Content</div>
</div>
```

### After (Consistent):
```html
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div style="margin-bottom: var(--spacing-lg);">Content</div>
</div>
```

## Related Files

- `/css/design-tokens.css` - Spacing token definitions
- `/css/buttons.css` - Button component spacing
- `/components/shared-header.js` - Header layout pattern
