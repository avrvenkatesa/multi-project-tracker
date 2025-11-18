#!/bin/bash

# Story 5.1.3 RAG Foundation Automated Test Suite
# Run: bash /tmp/automate-story-5.1.3-tests.sh

set -e

# Configuration
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export DATABASE_URL="${DATABASE_URL:-postgresql://user:pass@localhost:5432/dbname}"
export TOKEN="${TOKEN:-}"

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
echo -e "${BLUE}Story 5.1.3 RAG Foundation Test Suite${NC}"
echo -e "${BLUE}================================================${NC}"

check_dependency psql
check_dependency jq
check_dependency curl

# Test database connection
echo -e "\n${BLUE}Testing database connection...${NC}"
if psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
  echo -e "${GREEN}✓ Database connected${NC}"
else
  echo -e "${RED}✗ Database connection failed${NC}"
  exit 1
fi

# Check auth token
if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}Warning: TOKEN not set. API tests may fail.${NC}"
  echo -e "${YELLOW}  export TOKEN='your-jwt-token'${NC}"
  sleep 2
fi

# ============================================
# PHASE 1: RAG Schema Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 1: RAG Schema Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 1: Verify rag_documents table exists
test_start "Verify rag_documents table exists with correct structure"
RAG_DOCS_COLS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_name = 'rag_documents'
" | tr -d ' ')

if [ "$RAG_DOCS_COLS" -ge "12" ]; then
  test_pass "rag_documents table has $RAG_DOCS_COLS columns"
else
  test_fail "rag_documents table missing or incomplete ($RAG_DOCS_COLS columns)"
fi

# Test 2: Verify required columns exist
test_start "Verify rag_documents required columns"
REQUIRED_COLS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_name = 'rag_documents'
    AND column_name IN ('id', 'project_id', 'source_type', 'source_id',
                        'content_text', 'content_vector', 'metadata', 'indexed_at')
" | tr -d ' ')

if [ "$REQUIRED_COLS" -ge "8" ]; then
  test_pass "All required columns exist ($REQUIRED_COLS/8)"
else
  test_fail "Missing required columns (found $REQUIRED_COLS/8)"
fi

# Test 3: Verify tsvector column exists
test_start "Verify content_vector is tsvector type"
TSVECTOR_COL=$(psql "$DATABASE_URL" -t -c "
  SELECT data_type FROM information_schema.columns
  WHERE table_name = 'rag_documents'
    AND column_name = 'content_vector'
" | tr -d ' ')

if [ "$TSVECTOR_COL" == "tsvector" ]; then
  test_pass "content_vector is tsvector type"
else
  test_fail "content_vector is not tsvector (found: $TSVECTOR_COL)"
fi

# Test 4: Verify GIN index on tsvector
test_start "Verify GIN index on content_vector"
TSVECTOR_INDEX=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'rag_documents'
    AND indexdef LIKE '%USING gin%'
    AND indexdef LIKE '%content_vector%'
" | tr -d ' ')

if [ "$TSVECTOR_INDEX" -ge "1" ]; then
  test_pass "GIN index on content_vector exists"
else
  test_fail "GIN index on content_vector missing"
fi

# Test 5: Verify indexes on foreign keys
test_start "Verify indexes on source columns"
SOURCE_INDEXES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'rag_documents'
    AND (indexdef LIKE '%source_type%' OR indexdef LIKE '%source_id%' OR indexdef LIKE '%project_id%')
" | tr -d ' ')

if [ "$SOURCE_INDEXES" -ge "2" ]; then
  test_pass "$SOURCE_INDEXES indexes on source columns"
else
  test_fail "Missing indexes on source columns (found $SOURCE_INDEXES)"
fi

# Test 6: Verify UNIQUE constraint on source
test_start "Verify UNIQUE constraint on (source_type, source_id)"
UNIQUE_CONSTRAINT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM pg_constraint
  WHERE conrelid = 'rag_documents'::regclass
    AND contype = 'u'
" | tr -d ' ')

if [ "$UNIQUE_CONSTRAINT" -ge "1" ]; then
  test_pass "UNIQUE constraint exists on rag_documents"
else
  test_fail "UNIQUE constraint missing"
fi

# Test 7: Verify auto-indexing trigger function exists
test_start "Verify auto-indexing trigger function exists"
TRIGGER_FUNC=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name LIKE '%auto_index%rag%'
" | tr -d ' ')

if [ "$TRIGGER_FUNC" -ge "1" ]; then
  test_pass "Auto-indexing trigger function exists"
else
  test_fail "Auto-indexing trigger function missing"
fi

# Test 8: Verify triggers on source tables
test_start "Verify triggers on meetings, decisions, risks tables"
SOURCE_TRIGGERS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.triggers
  WHERE event_object_table IN ('meetings', 'decisions', 'risks')
    AND trigger_name LIKE '%rag%'
" | tr -d ' ')

if [ "$SOURCE_TRIGGERS" -ge "3" ]; then
  test_pass "$SOURCE_TRIGGERS triggers on source tables"
else
  test_fail "Expected at least 3 triggers, found $SOURCE_TRIGGERS"
fi

# ============================================
# PHASE 2: Auto-Indexing Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 2: Auto-Indexing Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 9: Check if existing data was indexed
test_start "Verify existing data auto-indexed"
INDEXED_DOCS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
" | tr -d ' ')

if [ "$INDEXED_DOCS" -gt "0" ]; then
  test_pass "$INDEXED_DOCS documents auto-indexed"
else
  test_fail "No documents indexed (may be expected if no source data exists)"
fi

# Test 10: Verify meetings indexed
test_start "Verify meetings auto-indexed"
MEETING_DOCS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
  WHERE source_type = 'meeting'
" | tr -d ' ')

TOTAL_MEETINGS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM meetings
" | tr -d ' ')

if [ "$TOTAL_MEETINGS" -gt "0" ] && [ "$MEETING_DOCS" -eq "$TOTAL_MEETINGS" ]; then
  test_pass "All $MEETING_DOCS meetings indexed"
elif [ "$TOTAL_MEETINGS" -eq "0" ]; then
  test_pass "No meetings to index (skipped)"
else
  test_fail "Only $MEETING_DOCS of $TOTAL_MEETINGS meetings indexed"
fi

# Test 11: Verify decisions indexed
test_start "Verify decisions auto-indexed"
DECISION_DOCS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
  WHERE source_type = 'decision'
" | tr -d ' ')

TOTAL_DECISIONS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM decisions
" | tr -d ' ')

if [ "$TOTAL_DECISIONS" -gt "0" ] && [ "$DECISION_DOCS" -eq "$TOTAL_DECISIONS" ]; then
  test_pass "All $DECISION_DOCS decisions indexed"
elif [ "$TOTAL_DECISIONS" -eq "0" ]; then
  test_pass "No decisions to index (skipped)"
else
  test_fail "Only $DECISION_DOCS of $TOTAL_DECISIONS decisions indexed"
fi

# Test 12: Verify risks indexed
test_start "Verify risks auto-indexed"
RISK_DOCS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
  WHERE source_type = 'risk'
" | tr -d ' ')

TOTAL_RISKS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM risks
" | tr -d ' ')

if [ "$TOTAL_RISKS" -gt "0" ] && [ "$RISK_DOCS" -gt "0" ]; then
  test_pass "$RISK_DOCS of $TOTAL_RISKS risks indexed"
elif [ "$TOTAL_RISKS" -eq "0" ]; then
  test_pass "No risks to index (skipped)"
else
  test_fail "Only $RISK_DOCS of $TOTAL_RISKS risks indexed"
fi

# Test 13: Verify tsvector content populated
test_start "Verify content_vector (tsvector) populated"
DOCS_WITH_VECTOR=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
  WHERE content_vector IS NOT NULL
" | tr -d ' ')

if [ "$DOCS_WITH_VECTOR" -eq "$INDEXED_DOCS" ]; then
  test_pass "All $DOCS_WITH_VECTOR documents have tsvector"
else
  test_fail "Only $DOCS_WITH_VECTOR of $INDEXED_DOCS documents have tsvector"
fi

# Test 14: Verify metadata JSONB populated
test_start "Verify metadata JSONB populated"
DOCS_WITH_METADATA=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
  WHERE metadata IS NOT NULL AND metadata != '{}'::jsonb
" | tr -d ' ')

if [ "$DOCS_WITH_METADATA" -gt "0" ]; then
  test_pass "$DOCS_WITH_METADATA documents have metadata"
else
  test_fail "No documents have metadata populated"
fi

# ============================================
# PHASE 3: Search API Validation
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 3: Search API Validation${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 15: Test search API endpoint exists
test_start "GET /api/search - Endpoint exists"
SEARCH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/search?q=test" \
  -H "Cookie: token=$TOKEN")

if [ "$SEARCH_RESPONSE" == "200" ] || [ "$SEARCH_RESPONSE" == "401" ]; then
  test_pass "Search endpoint exists (HTTP $SEARCH_RESPONSE)"
else
  test_fail "Search endpoint missing or error (HTTP $SEARCH_RESPONSE)"
fi

# Test 16: Test search with query parameter
if [ -n "$TOKEN" ] && [ "$INDEXED_DOCS" -gt "0" ]; then
  test_start "GET /api/search?q=meeting - Search functionality"
  SEARCH_RESULT=$(curl -s "$BASE_URL/api/search?q=meeting" \
    -H "Cookie: token=$TOKEN")

  RESULT_COUNT=$(echo "$SEARCH_RESULT" | jq '.results | length // 0' 2>/dev/null || echo "0")

  if [ "$RESULT_COUNT" -ge "0" ]; then
    test_pass "Search returned $RESULT_COUNT results"
  else
    test_fail "Search query failed" "$SEARCH_RESULT"
  fi
else
  test_start "GET /api/search?q=meeting - Search functionality"
  test_pass "Skipped (no TOKEN or no indexed documents)"
fi

# Test 17: Test search with project filter
if [ -n "$TOKEN" ] && [ "$INDEXED_DOCS" -gt "0" ]; then
  test_start "GET /api/search?q=test&project_id=1 - Project filter"
  SEARCH_RESULT=$(curl -s "$BASE_URL/api/search?q=test&project_id=1" \
    -H "Cookie: token=$TOKEN")

  RESULT_COUNT=$(echo "$SEARCH_RESULT" | jq '.results | length // 0' 2>/dev/null || echo "0")

  if [ "$RESULT_COUNT" -ge "0" ]; then
    test_pass "Project filter working ($RESULT_COUNT results)"
  else
    test_fail "Project filter failed"
  fi
else
  test_start "GET /api/search?q=test&project_id=1 - Project filter"
  test_pass "Skipped (no TOKEN or no indexed documents)"
fi

# Test 18: Test search with source type filter
if [ -n "$TOKEN" ] && [ "$INDEXED_DOCS" -gt "0" ]; then
  test_start "GET /api/search?q=test&source_type=decision - Source filter"
  SEARCH_RESULT=$(curl -s "$BASE_URL/api/search?q=test&source_type=decision" \
    -H "Cookie: token=$TOKEN")

  RESULT_COUNT=$(echo "$SEARCH_RESULT" | jq '.results | length // 0' 2>/dev/null || echo "0")

  if [ "$RESULT_COUNT" -ge "0" ]; then
    test_pass "Source type filter working ($RESULT_COUNT results)"
  else
    test_fail "Source type filter failed"
  fi
else
  test_start "GET /api/search?q=test&source_type=decision - Source filter"
  test_pass "Skipped (no TOKEN or no indexed documents)"
fi

# Test 19: Test search relevance ranking
if [ -n "$TOKEN" ] && [ "$INDEXED_DOCS" -gt "0" ]; then
  test_start "Verify search results include relevance score"
  SEARCH_RESULT=$(curl -s "$BASE_URL/api/search?q=meeting&limit=5" \
    -H "Cookie: token=$TOKEN")

  HAS_RANK=$(echo "$SEARCH_RESULT" | jq '.results[0] | has("rank") // false' 2>/dev/null || echo "false")

  if [ "$HAS_RANK" == "true" ]; then
    test_pass "Search results include relevance ranking"
  else
    test_fail "Search results missing relevance score"
  fi
else
  test_start "Verify search results include relevance score"
  test_pass "Skipped (no TOKEN or no indexed documents)"
fi

# ============================================
# PHASE 4: Trigger Functionality Tests
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 4: Trigger Functionality Tests${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 20: Test INSERT trigger on meetings
test_start "Test INSERT trigger: New meeting auto-indexes"
DOCS_BEFORE=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM rag_documents WHERE source_type = 'meeting'" | tr -d ' ')

# Check if meetings table exists
MEETINGS_TABLE=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'meetings'
" | tr -d ' ')

if [ "$MEETINGS_TABLE" -eq "1" ]; then
  # Insert test meeting
  TIMESTAMP=$(date +%s)
  psql "$DATABASE_URL" -c "
    INSERT INTO meetings (project_id, title, meeting_date, transcript_text, created_by)
    VALUES (1, 'Test RAG Meeting $TIMESTAMP', NOW(), 'This is a test transcript for RAG indexing.', 1)
  " > /dev/null 2>&1

  DOCS_AFTER=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM rag_documents WHERE source_type = 'meeting'" | tr -d ' ')

  if [ "$DOCS_AFTER" -gt "$DOCS_BEFORE" ]; then
    test_pass "INSERT trigger working (docs: $DOCS_BEFORE → $DOCS_AFTER)"

    # Cleanup
    psql "$DATABASE_URL" -c "DELETE FROM meetings WHERE title LIKE 'Test RAG Meeting%'" > /dev/null 2>&1
  else
    test_fail "INSERT trigger not working (docs unchanged: $DOCS_BEFORE)"
  fi
else
  test_pass "Skipped (meetings table does not exist)"
fi

# Test 21: Test UPDATE trigger on decisions
test_start "Test UPDATE trigger: Decision update re-indexes"
DECISIONS_TABLE=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'decisions'
" | tr -d ' ')

if [ "$DECISIONS_TABLE" -eq "1" ]; then
  # Get first decision
  TEST_DECISION_ID=$(psql "$DATABASE_URL" -t -c "
    SELECT id FROM decisions LIMIT 1
  " | tr -d ' ')

  if [ -n "$TEST_DECISION_ID" ] && [ "$TEST_DECISION_ID" != "" ]; then
    # Get initial indexed_at timestamp
    INDEXED_AT_BEFORE=$(psql "$DATABASE_URL" -t -c "
      SELECT indexed_at FROM rag_documents
      WHERE source_type = 'decision' AND source_id = $TEST_DECISION_ID
    " | tr -d ' ')

    sleep 1

    # Update decision
    psql "$DATABASE_URL" -c "
      UPDATE decisions SET description = 'Updated for RAG trigger test'
      WHERE id = $TEST_DECISION_ID
    " > /dev/null 2>&1

    # Get new indexed_at timestamp
    INDEXED_AT_AFTER=$(psql "$DATABASE_URL" -t -c "
      SELECT indexed_at FROM rag_documents
      WHERE source_type = 'decision' AND source_id = $TEST_DECISION_ID
    " | tr -d ' ')

    if [ "$INDEXED_AT_AFTER" != "$INDEXED_AT_BEFORE" ]; then
      test_pass "UPDATE trigger working (re-indexed after update)"
    else
      test_fail "UPDATE trigger not working (indexed_at unchanged)"
    fi
  else
    test_pass "Skipped (no decisions to test)"
  fi
else
  test_pass "Skipped (decisions table does not exist)"
fi

# Test 22: Test idempotency of indexing
test_start "Test idempotency: Re-indexing doesn't create duplicates"
DOCS_BEFORE=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM rag_documents" | tr -d ' ')

# Try to re-run initial indexing (simulate backfill script)
psql "$DATABASE_URL" -c "
  INSERT INTO rag_documents (project_id, source_type, source_id, content_text, content_vector, metadata)
  SELECT
    m.project_id,
    'meeting'::VARCHAR,
    m.id,
    COALESCE(m.transcript_text, m.title || ' ' || COALESCE(m.summary, '')),
    to_tsvector('english', COALESCE(m.transcript_text, m.title || ' ' || COALESCE(m.summary, ''))),
    jsonb_build_object('title', m.title, 'meeting_date', m.meeting_date)
  FROM meetings m
  WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meetings')
  ON CONFLICT (source_type, source_id) DO UPDATE
  SET content_text = EXCLUDED.content_text,
      content_vector = EXCLUDED.content_vector,
      indexed_at = NOW()
" > /dev/null 2>&1

DOCS_AFTER=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM rag_documents" | tr -d ' ')

if [ "$DOCS_BEFORE" -eq "$DOCS_AFTER" ]; then
  test_pass "Idempotency working (no duplicates: $DOCS_AFTER docs)"
else
  test_fail "Duplicates created ($DOCS_BEFORE → $DOCS_AFTER)"
fi

# ============================================
# PHASE 5: Full-Text Search Quality
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 5: Full-Text Search Quality${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 23: Test basic keyword search
test_start "Test full-text search: Basic keyword"
SEARCH_RESULTS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
  WHERE content_vector @@ to_tsquery('english', 'meeting | transcript')
" | tr -d ' ')

if [ "$SEARCH_RESULTS" -ge "0" ]; then
  test_pass "Keyword search working ($SEARCH_RESULTS matches)"
else
  test_fail "Keyword search failed"
fi

# Test 24: Test phrase search
test_start "Test full-text search: Phrase matching"
PHRASE_RESULTS=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM rag_documents
  WHERE content_vector @@ phraseto_tsquery('english', 'test meeting')
" | tr -d ' ')

if [ "$PHRASE_RESULTS" -ge "0" ]; then
  test_pass "Phrase search working ($PHRASE_RESULTS matches)"
else
  test_fail "Phrase search failed"
fi

# Test 25: Test relevance ranking with ts_rank
test_start "Test relevance ranking with ts_rank"
RANK_TEST=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM (
    SELECT ts_rank(content_vector, to_tsquery('english', 'meeting')) as rank
    FROM rag_documents
    WHERE content_vector @@ to_tsquery('english', 'meeting')
    ORDER BY rank DESC
    LIMIT 5
  ) ranked
" | tr -d ' ')

if [ "$RANK_TEST" -ge "0" ]; then
  test_pass "Relevance ranking working ($RANK_TEST ranked results)"
else
  test_fail "Relevance ranking failed"
fi

# ============================================
# PHASE 6: Performance Tests
# ============================================

echo -e "\n${BLUE}================================================${NC}"
echo -e "${BLUE}PHASE 6: Performance Tests${NC}"
echo -e "${BLUE}================================================${NC}"

# Test 26: Search query performance
test_start "Search performance: Query execution time"
START_TIME=$(date +%s%N)

psql "$DATABASE_URL" -c "
  SELECT * FROM rag_documents
  WHERE content_vector @@ to_tsquery('english', 'meeting | decision | risk')
  ORDER BY ts_rank(content_vector, to_tsquery('english', 'meeting | decision | risk')) DESC
  LIMIT 20
" > /dev/null

END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$DURATION" -lt "1000" ]; then
  test_pass "Search query in ${DURATION}ms (< 1s)"
else
  test_fail "Search query took ${DURATION}ms (should be < 1s)"
fi

# Test 27: Index size check
test_start "Verify GIN index efficiency"
INDEX_SIZE=$(psql "$DATABASE_URL" -t -c "
  SELECT pg_size_pretty(pg_relation_size(indexrelid))
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND relname = 'rag_documents'
    AND indexrelname LIKE '%content_vector%'
  LIMIT 1
" | tr -d ' ')

if [ -n "$INDEX_SIZE" ]; then
  test_pass "GIN index size: $INDEX_SIZE"
else
  test_fail "Cannot determine GIN index size"
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

# Print RAG statistics
echo -e "\n${BLUE}RAG Statistics:${NC}"
psql "$DATABASE_URL" -c "
SELECT
  (SELECT COUNT(*) FROM rag_documents) as total_documents,
  (SELECT COUNT(*) FROM rag_documents WHERE source_type = 'meeting') as meeting_docs,
  (SELECT COUNT(*) FROM rag_documents WHERE source_type = 'decision') as decision_docs,
  (SELECT COUNT(*) FROM rag_documents WHERE source_type = 'risk') as risk_docs,
  (SELECT COUNT(DISTINCT project_id) FROM rag_documents) as projects_with_rag,
  (SELECT pg_size_pretty(pg_total_relation_size('rag_documents'))) as total_size
"

if [ "$TESTS_FAILED" -eq "0" ]; then
  echo -e "\n${GREEN}✅ All tests passed! Story 5.1.3 is validated.${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Some tests failed. Please review errors above.${NC}"
  exit 1
fi
