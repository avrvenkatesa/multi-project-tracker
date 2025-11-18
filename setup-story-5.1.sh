#!/bin/bash

# Story 5.1: AIPM Foundation - Git Workflow Commands
# Execute these commands in sequence

echo "=== Story 5.1: AIPM Foundation Setup ==="
echo ""

# 1. Ensure you're on main and up-to-date
echo "Step 1: Update main branch..."
git checkout main
git pull origin main

# 2. Create feature branch
echo ""
echo "Step 2: Create feature branch..."
git checkout -b feature/story-5.1-aipm-foundation

# 3. Verify branch created
echo ""
echo "Step 3: Verify branch..."
git branch --show-current

echo ""
echo "✅ Feature branch created: feature/story-5.1-aipm-foundation"
echo ""
echo "Next steps:"
echo "  1. Implement Story 5.1.1 (Foundation Tables)"
echo "  2. Commit with: git add . && git commit -m 'feat: Story 5.1.1 - Add decisions, meetings, evidence tables'"
echo "  3. Push with: git push -u origin feature/story-5.1-aipm-foundation"
echo "  4. Continue with 5.1.2, 5.1.3, 5.1.4"
echo ""

# Optional: Create tracking file
cat > STORY-5.1-PROGRESS.md << 'EOF'
# Story 5.1 Progress Tracker

## Checklist

### Story 5.1.1: Foundation Tables (6-9 hours)
- [ ] Migration 022: Create decisions table
- [ ] Migration 022: Create meetings table
- [ ] Migration 022: Create evidence table
- [ ] Migration 023: Add foreign keys to existing tables
- [ ] API: POST /api/projects/:projectId/decisions
- [ ] API: GET /api/projects/:projectId/decisions
- [ ] API: GET /api/decisions/:id
- [ ] API: PATCH /api/decisions/:id
- [ ] API: POST /api/projects/:projectId/meetings
- [ ] API: GET /api/projects/:projectId/meetings
- [ ] API: POST /api/evidence
- [ ] API: GET /api/evidence
- [ ] UI: Decisions list page
- [ ] UI: Meeting history page
- [ ] UI: Evidence panel component
- [ ] Tests: decisions CRUD tests
- [ ] Tests: meetings CRUD tests
- [ ] Commit & Push

### Story 5.1.2: PKG Overlay (4-6 hours)
- [ ] Migration 024: Create pkg_nodes table
- [ ] Migration 024: Create pkg_edges table
- [ ] Migration 025: Seed PKG from existing data
- [ ] Migration 026: Create sync triggers
- [ ] API: GET /api/aipm/projects/:id/pkg
- [ ] API: POST /api/aipm/projects/:id/pkg/seed
- [ ] API: GET /api/aipm/pkg/query
- [ ] Tests: PKG sync tests
- [ ] Tests: PKG query tests
- [ ] Commit & Push

### Story 5.1.3: RAG Foundation (3-4 hours)
- [ ] Migration 027: Create rag_documents table
- [ ] Migration 028: Auto-index meetings trigger
- [ ] API: GET /api/aipm/projects/:id/rag/search
- [ ] API: POST /api/aipm/projects/:id/rag/docs
- [ ] Tests: RAG search tests
- [ ] Tests: Auto-indexing tests
- [ ] Commit & Push

### Story 5.1.4: Integration & Testing (4-5 hours)
- [ ] Integration test: Decision → PKG → RAG
- [ ] Integration test: Meeting → Evidence → PKG edges
- [ ] Smoke test script
- [ ] Performance test: PKG query on 10k nodes
- [ ] Documentation: API docs
- [ ] Documentation: PKG schema diagram
- [ ] Final commit & push
- [ ] Create Pull Request

## Commits Made
<!-- Track your commits here -->

EOF

echo "Created STORY-5.1-PROGRESS.md for tracking"
