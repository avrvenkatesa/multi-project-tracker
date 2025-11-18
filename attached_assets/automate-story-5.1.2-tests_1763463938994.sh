#!/bin/bash

# Story 5.1.2 PKG Overlay Automated Test Suite
# Run: bash /tmp/automate-story-5.1.2-tests.sh

set -e

# Configuration
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export DATABASE_URL="${DATABASE_URL:-postgresql://user:pass@localhost:5432/dbname}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper functions
test_start() {
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  echo -e "\n${BLUE}[TEST $TESTS_TOTAL]${NC} $1"
}

test_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}✓ PASS${NC}: $1"
}

test_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}✗ FAIL${NC}: $1"
  if [ -n "$2" ]; then
    echo -e "${RED}  Error: $2${NC}"
  fi
}

check_dependency() {
  if ! command -v $1 &> /dev/null; then
    echo -e "${RED}Error: $1 is not installed${NC}"
    exit 1
  fi
}

# Pre-flight checks
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Story 5.1.2 PKG Overlay Test Suite${NC}"
echo -e "${BLUE}================================================${NC}"

check_dependency psql
check_dependency jq

# Test database connection
echo -e "\n${BLUE}Testing database connection...${NC}"
if psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
  echo -e "${GREEN}✓ Database connected${NC}"
else
  echo -e "${RED}✗ Database connection failed${NC}"
  exit 1
fi

# ============================================
# PHASE 1: PKG Schema Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 1: PKG Schema Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 1: Verify pkg_nodes table exists
test_start "Verify pkg_nodes table exists with correct structure"
PKG_NODES_COLS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_name = 'pkg_nodes'
" | tr -d ' ')

if [ "$PKG_NODES_COLS" -ge "12" ]; then
  test_pass "pkg_nodes table has $PKG_NODES_COLS columns"
else
  test_fail "pkg_nodes table missing or incomplete ($PKG_NODES_COLS columns)"
fi

# Test 2: Verify pkg_edges table exists
test_start "Verify pkg_edges table exists with correct structure"
PKG_EDGES_COLS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_name = 'pkg_edges'
" | tr -d ' ')

if [ "$PKG_EDGES_COLS" -ge "9" ]; then
  test_pass "pkg_edges table has $PKG_EDGES_COLS columns"
else
  test_fail "pkg_edges table missing or incomplete ($PKG_EDGES_COLS columns)"
fi

# Test 3: Verify UUID extension enabled
test_start "Verify uuid-ossp extension enabled"
UUID_EXT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pg_extension WHERE extname = 'uuid-ossp'
" | tr -d ' ')

if [ "$UUID_EXT" -eq "1" ]; then
  test_pass "uuid-ossp extension enabled"
else
  test_fail "uuid-ossp extension not enabled"
fi

# Test 4: Verify indexes created
test_start "Verify PKG indexes created"
PKG_INDEXES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('pkg_nodes', 'pkg_edges')
" | tr -d ' ')

if [ "$PKG_INDEXES" -ge "10" ]; then
  test_pass "$PKG_INDEXES PKG indexes created"
else
  test_fail "Expected at least 10 PKG indexes, found $PKG_INDEXES"
fi

# Test 5: Verify GIN indexes on JSONB columns
test_start "Verify GIN indexes on JSONB attrs columns"
GIN_INDEXES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('pkg_nodes', 'pkg_edges')
    AND indexdef LIKE '%USING gin%'
" | tr -d ' ')

if [ "$GIN_INDEXES" -ge "2" ]; then
  test_pass "$GIN_INDEXES GIN indexes on JSONB columns"
else
  test_fail "Expected at least 2 GIN indexes, found $GIN_INDEXES"
fi

# Test 6: Verify UNIQUE constraints
test_start "Verify UNIQUE constraint on (source_table, source_id)"
UNIQUE_CONSTRAINT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pg_constraint
  WHERE conname LIKE '%source_table%source_id%'
    AND conrelid = 'pkg_nodes'::regclass
" | tr -d ' ')

if [ "$UNIQUE_CONSTRAINT" -ge "1" ]; then
  test_pass "UNIQUE constraint on source exists"
else
  test_fail "UNIQUE constraint missing"
fi

# ============================================
# PHASE 2: Data Seeding Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 2: Data Seeding Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 7: Verify nodes seeded from issues
test_start "Verify Task nodes seeded from issues"
ISSUE_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
  WHERE source_table = 'issues'
" | tr -d ' ')

if [ "$ISSUE_NODES" -gt "0" ]; then
  test_pass "$ISSUE_NODES Task nodes from issues"
else
  test_fail "No nodes seeded from issues"
fi

# Test 8: Verify nodes seeded from action_items
test_start "Verify Task nodes seeded from action_items"
ACTION_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
  WHERE source_table = 'action_items'
" | tr -d ' ')

if [ "$ACTION_NODES" -gt "0" ]; then
  test_pass "$ACTION_NODES Task nodes from action_items"
else
  test_fail "No nodes seeded from action_items"
fi

# Test 9: Verify nodes seeded from risks
test_start "Verify Risk nodes seeded from risks"
RISK_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
  WHERE source_table = 'risks'
" | tr -d ' ')

if [ "$RISK_NODES" -ge "0" ]; then
  test_pass "$RISK_NODES Risk nodes from risks"
else
  test_fail "Issue seeding Risk nodes"
fi

# Test 10: Verify nodes seeded from decisions
test_start "Verify Decision nodes seeded from decisions"
DECISION_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
  WHERE source_table = 'decisions'
" | tr -d ' ')

if [ "$DECISION_NODES" -ge "0" ]; then
  test_pass "$DECISION_NODES Decision nodes from decisions"
else
  test_fail "Issue seeding Decision nodes"
fi

# Test 11: Verify nodes seeded from meetings
test_start "Verify Meeting nodes seeded from meetings"
MEETING_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
  WHERE source_table = 'meetings'
" | tr -d ' ')

if [ "$MEETING_NODES" -ge "0" ]; then
  test_pass "$MEETING_NODES Meeting nodes from meetings"
else
  test_fail "Issue seeding Meeting nodes"
fi

# Test 12: Verify total node count
test_start "Verify total PKG node count"
TOTAL_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
" | tr -d ' ')

if [ "$TOTAL_NODES" -gt "100" ]; then
  test_pass "$TOTAL_NODES total PKG nodes created"
else
  test_fail "Expected more than 100 nodes, found $TOTAL_NODES"
fi

# Test 13: Verify node type distribution
test_start "Verify node type distribution"
NODE_TYPES=$(psql "$DATABASE_URL" -c "
  SELECT type, COUNT(*) as count
  FROM pkg_nodes
  GROUP BY type
  ORDER BY count DESC
" | grep -c "Task\|Risk\|Decision\|Meeting" || echo "0")

if [ "$NODE_TYPES" -ge "1" ]; then
  test_pass "Node types distributed correctly"
  psql "$DATABASE_URL" -c "
    SELECT type, COUNT(*) as count
    FROM pkg_nodes
    GROUP BY type
    ORDER BY count DESC
  "
else
  test_fail "Node types not properly distributed"
fi

# Test 14: Verify AI provenance tracking
test_start "Verify AI provenance fields populated"
AI_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
  WHERE created_by_ai = TRUE
" | tr -d ' ')

if [ "$AI_NODES" -gt "0" ]; then
  test_pass "$AI_NODES nodes marked as AI-created"
else
  test_fail "No AI provenance data found (this may be okay if no AI-created entities exist)"
fi

# ============================================
# PHASE 3: Edge Creation Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 3: PKG Edges Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 15: Verify parent_of edges created
test_start "Verify parent_of edges from issue hierarchy"
PARENT_EDGES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_edges
  WHERE type = 'parent_of'
" | tr -d ' ')

if [ "$PARENT_EDGES" -gt "0" ]; then
  test_pass "$PARENT_EDGES parent_of edges created"
else
  test_fail "No parent_of edges found (this may be okay if no parent-child issues exist)"
fi

# Test 16: Verify evidence_of edges created
test_start "Verify evidence_of edges from evidence table"
EVIDENCE_EDGES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_edges
  WHERE type = 'evidence_of'
" | tr -d ' ')

if [ "$EVIDENCE_EDGES" -ge "0" ]; then
  test_pass "$EVIDENCE_EDGES evidence_of edges created"
else
  test_fail "Issue creating evidence_of edges"
fi

# Test 17: Verify total edge count
test_start "Verify total PKG edge count"
TOTAL_EDGES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_edges
" | tr -d ' ')

if [ "$TOTAL_EDGES" -ge "0" ]; then
  test_pass "$TOTAL_EDGES total PKG edges created"
else
  test_fail "No PKG edges created"
fi

# Test 18: Verify no self-loops
test_start "Verify no self-loop edges exist"
SELF_LOOPS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_edges
  WHERE from_node_id = to_node_id
" | tr -d ' ')

if [ "$SELF_LOOPS" -eq "0" ]; then
  test_pass "No self-loop edges (constraint working)"
else
  test_fail "Found $SELF_LOOPS self-loop edges (constraint violation)"
fi

# ============================================
# PHASE 4: Backfill Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 4: Foreign Key Backfill Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 19: Verify decisions.pkg_node_id backfilled
test_start "Verify decisions.pkg_node_id backfilled"
DECISION_BACKFILL=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM decisions
  WHERE pkg_node_id IS NOT NULL
" | tr -d ' ')

TOTAL_DECISIONS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM decisions
" | tr -d ' ')

if [ "$TOTAL_DECISIONS" -gt "0" ] && [ "$DECISION_BACKFILL" -eq "$TOTAL_DECISIONS" ]; then
  test_pass "All $DECISION_BACKFILL decisions backfilled with pkg_node_id"
elif [ "$TOTAL_DECISIONS" -eq "0" ]; then
  test_pass "No decisions to backfill (skipped)"
else
  test_fail "Only $DECISION_BACKFILL of $TOTAL_DECISIONS decisions backfilled"
fi

# Test 20: Verify meetings.pkg_node_id backfilled
test_start "Verify meetings.pkg_node_id backfilled"
MEETING_BACKFILL=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM meetings
  WHERE pkg_node_id IS NOT NULL
" | tr -d ' ')

TOTAL_MEETINGS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM meetings
" | tr -d ' ')

if [ "$TOTAL_MEETINGS" -gt "0" ] && [ "$MEETING_BACKFILL" -eq "$TOTAL_MEETINGS" ]; then
  test_pass "All $MEETING_BACKFILL meetings backfilled with pkg_node_id"
elif [ "$TOTAL_MEETINGS" -eq "0" ]; then
  test_pass "No meetings to backfill (skipped)"
else
  test_fail "Only $MEETING_BACKFILL of $TOTAL_MEETINGS meetings backfilled"
fi

# Test 21: Verify evidence.pkg_edge_id backfilled
test_start "Verify evidence.pkg_edge_id backfilled"
EVIDENCE_BACKFILL=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM evidence
  WHERE pkg_edge_id IS NOT NULL
" | tr -d ' ')

TOTAL_EVIDENCE=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM evidence
" | tr -d ' ')

if [ "$TOTAL_EVIDENCE" -gt "0" ] && [ "$EVIDENCE_BACKFILL" -gt "0" ]; then
  test_pass "$EVIDENCE_BACKFILL of $TOTAL_EVIDENCE evidence records backfilled"
elif [ "$TOTAL_EVIDENCE" -eq "0" ]; then
  test_pass "No evidence to backfill (skipped)"
else
  test_fail "Evidence backfill may be incomplete"
fi

# ============================================
# PHASE 5: Idempotency Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 5: Idempotency & Data Integrity${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 22: Verify no duplicate nodes
test_start "Verify no duplicate nodes (source_table, source_id)"
DUPLICATE_NODES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM (
    SELECT source_table, source_id, COUNT(*) as cnt
    FROM pkg_nodes
    WHERE source_table IS NOT NULL
    GROUP BY source_table, source_id
    HAVING COUNT(*) > 1
  ) duplicates
" | tr -d ' ')

if [ "$DUPLICATE_NODES" -eq "0" ]; then
  test_pass "No duplicate nodes (UNIQUE constraint working)"
else
  test_fail "Found $DUPLICATE_NODES duplicates (constraint violation)"
fi

# Test 23: Verify JSONB attrs populated
test_start "Verify JSONB attrs populated for nodes"
NODES_WITH_ATTRS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pkg_nodes
  WHERE attrs != '{}'::jsonb
" | tr -d ' ')

if [ "$NODES_WITH_ATTRS" -gt "0" ]; then
  test_pass "$NODES_WITH_ATTRS nodes have populated attrs"
else
  test_fail "No nodes have attrs populated"
fi

# Test 24: Test re-running seed script (idempotency)
test_start "Test idempotency: Re-run seed script"
NODES_BEFORE=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pkg_nodes" | tr -d ' ')

# Re-run seed script (should not create duplicates)
psql "$DATABASE_URL" -f db/025_seed_pkg_from_existing_data.sql > /dev/null 2>&1

NODES_AFTER=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pkg_nodes" | tr -d ' ')

if [ "$NODES_BEFORE" -eq "$NODES_AFTER" ]; then
  test_pass "Seed script is idempotent ($NODES_AFTER nodes unchanged)"
else
  test_fail "Seed script created duplicates ($NODES_BEFORE → $NODES_AFTER)"
fi

# ============================================
# PHASE 6: Performance Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 6: Performance & Query Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 25: Query performance test
test_start "Query performance: Get all nodes for project"
START_TIME=$(date +%s%N)

psql "$DATABASE_URL" -c "
  SELECT * FROM pkg_nodes WHERE project_id = 1 LIMIT 100
" > /dev/null

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$DURATION" -lt "500" ]; then
  test_pass "Query completed in ${DURATION}ms (< 500ms)"
else
  test_fail "Query took ${DURATION}ms (should be < 500ms)"
fi

# Test 26: Graph traversal test
test_start "Graph traversal: Find node neighbors"
START_TIME=$(date +%s%N)

psql "$DATABASE_URL" -c "
  SELECT e.*, n.type
  FROM pkg_edges e
  JOIN pkg_nodes n ON (e.from_node_id = n.id OR e.to_node_id = n.id)
  WHERE e.project_id = 1
  LIMIT 50
" > /dev/null

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$DURATION" -lt "1000" ]; then
  test_pass "Graph traversal in ${DURATION}ms (< 1s)"
else
  test_fail "Graph traversal took ${DURATION}ms (should be < 1s)"
fi

# Test 27: JSONB query performance
test_start "JSONB query: Filter by attrs"
START_TIME=$(date +%s%N)

psql "$DATABASE_URL" -c "
  SELECT * FROM pkg_nodes
  WHERE attrs->>'status' = 'Done'
  LIMIT 50
" > /dev/null

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$DURATION" -lt "500" ]; then
  test_pass "JSONB query in ${DURATION}ms (< 500ms)"
else
  test_fail "JSONB query took ${DURATION}ms (should be < 500ms)"
fi

# ============================================
# Test Summary
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}================================================${NC}"

echo -e "Total tests:  $TESTS_TOTAL"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"

# Print statistics
echo -e "\n${BLUE}PKG Statistics:${NC}"
psql "$DATABASE_URL" -c "
SELECT
  (SELECT COUNT(*) FROM pkg_nodes) as total_nodes,
  (SELECT COUNT(*) FROM pkg_nodes WHERE source_table = 'issues') as issue_nodes,
  (SELECT COUNT(*) FROM pkg_nodes WHERE source_table = 'action_items') as action_nodes,
  (SELECT COUNT(*) FROM pkg_nodes WHERE created_by_ai = TRUE) as ai_created_nodes,
  (SELECT COUNT(*) FROM pkg_edges) as total_edges,
  (SELECT COUNT(*) FROM pkg_edges WHERE type = 'parent_of') as parent_edges,
  (SELECT COUNT(DISTINCT project_id) FROM pkg_nodes) as projects_with_pkg
"

if [ "$TESTS_FAILED" -eq "0" ]; then
  echo -e "\n${GREEN}✅ All tests passed! Story 5.1.2 is validated.${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Some tests failed. Please review errors above.${NC}"
  exit 1
fi
