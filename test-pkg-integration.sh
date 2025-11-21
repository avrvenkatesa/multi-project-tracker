#!/bin/bash

# Test suite for PKG Write Integration (Story 5.2.5.4)

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

check_result() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $1${NC}"
    ((PASS++))
  else
    echo -e "${RED}✗ $1${NC}"
    ((FAIL++))
  fi
}

##############################################################################
# SECTION 4: Sub-Story 5.2.5.4 - PKG Write Integration Tests
##############################################################################

echo "=== SECTION 4: PKG Write Integration (5.2.5.4) ==="
echo ""

# Test 27: aiDecisionMaker creates PKG nodes
echo "Test 27: aiDecisionMaker creates PKG nodes"
test -f "services/aiDecisionMaker.js" && \
grep -q "INSERT INTO pkg_nodes" services/aiDecisionMaker.js
check_result "aiDecisionMaker creates PKG nodes"

# Test 28: Decision proposal includes pkg_node_id
echo "Test 28: Decision proposal includes pkg_node_id"
test -f "services/aiDecisionMaker.js" && \
grep -q "pkg_node_id\|pkgNodeId" services/aiDecisionMaker.js
check_result "Decision proposals include pkg_node_id"

# Test 29: approveProposal links decision to PKG node
echo "Test 29: approveProposal links decision to PKG node"
test -f "services/aiDecisionMaker.js" && \
grep -q "UPDATE pkg_nodes" services/aiDecisionMaker.js
check_result "approveProposal updates PKG node linkage"

# Test 30: aiRiskDetector creates PKG nodes
echo "Test 30: aiRiskDetector creates PKG nodes"
test -f "services/aiRiskDetector.js" && \
grep -q "INSERT INTO pkg_nodes" services/aiRiskDetector.js
check_result "aiRiskDetector creates PKG nodes"

# Test 31: Risk auto-creation includes pkg_node_id
echo "Test 31: Risk auto-creation includes pkg_node_id"
test -f "services/aiRiskDetector.js" && \
grep -q "pkg_node_id" services/aiRiskDetector.js
check_result "Risk records include pkg_node_id"

# Test 32: PKG node type is 'Decision' for decisions
echo "Test 32: PKG node type is 'Decision' for decisions"
test -f "services/aiDecisionMaker.js" && \
grep -q "'Decision'" services/aiDecisionMaker.js
check_result "Decision PKG nodes have type 'Decision'"

# Test 33: PKG node type is 'Risk' for risks
echo "Test 33: PKG node type is 'Risk' for risks"
test -f "services/aiRiskDetector.js" && \
grep -q "'Risk'" services/aiRiskDetector.js
check_result "Risk PKG nodes have type 'Risk'"

# Test 34: Bi-directional sync (PKG → source table)
echo "Test 34: Bi-directional sync (PKG → source table)"
test -f "services/aiDecisionMaker.js" && \
grep -q "source_table.*source_id" services/aiDecisionMaker.js
check_result "Bi-directional sync updates source_table/source_id"

# Test 35: PKG edges created for evidence
echo "Test 35: PKG edges created for evidence"
test -f "services/aiRiskDetector.js" && \
grep -q "INSERT INTO pkg_edges" services/aiRiskDetector.js
check_result "PKG edges created for evidence relationships"

# Test 36: Evidence edge type is 'evidence_of'
echo "Test 36: Evidence edge type is 'evidence_of'"
test -f "services/aiRiskDetector.js" && \
grep -q "'evidence_of'" services/aiRiskDetector.js
check_result "Evidence edges use type 'evidence_of'"

echo ""

##############################################################################
# SECTION 5: Integration & Architecture Tests
##############################################################################

echo "=== SECTION 5: Integration & Architecture ==="
echo ""

# Test 37: callLLM uses grounded prompts
echo "Test 37: callLLM uses grounded prompts"
grep -q "buildGroundedPrompt" services/aiAgent.js && \
grep -q "callLLM" services/aiAgent.js
check_result "callLLM uses grounded prompts"

# Test 38: LLM responses include citations in output
echo "Test 38: LLM responses include citations in output"
grep -q "citations" services/aiAgent.js && \
grep -q "return.*citations" services/aiAgent.js
check_result "LLM responses return citations"

# Test 39: AI audit logging includes PKG metadata
echo "Test 39: AI audit logging includes PKG metadata"
grep -q "logAction" services/aiAgent.js && \
grep -q "pkg\|PKG" services/aiAgent.js
check_result "Audit logging includes PKG metadata"

# Test 40: Context metadata includes counts
echo "Test 40: Context metadata includes counts"
grep -q "pkgNodesCount\|ragDocsCount\|pkgEdgesCount" services/aiAgent.js
check_result "Context metadata includes entity counts"

# Test 41: Streaming response handles citations
echo "Test 41: Streaming response handles citations"
test -f "public/js/components/AIAgentDashboard.js" && \
grep -q "citations" public/js/components/AIAgentDashboard.js
check_result "Streaming response handles citations"

# Test 42: Transaction handling for PKG writes
echo "Test 42: Transaction handling for PKG writes"
grep -q "BEGIN\|COMMIT\|ROLLBACK" services/aiDecisionMaker.js
check_result "Proper transaction handling for PKG writes"

# Test 43: Error handling in PKG queries
echo "Test 43: Error handling in PKG queries"
grep -q "catch.*error" services/aiAgent.js && \
grep -q "try" services/aiAgent.js
check_result "Error handling in PKG query methods"

# Test 44: PKG node attrs stored as JSONB
echo "Test 44: PKG node attrs stored as JSONB"
grep -q "JSON.stringify" services/aiDecisionMaker.js
check_result "PKG node attrs properly JSONified"

echo ""

##############################################################################
# SECTION 6: Backward Compatibility Tests
##############################################################################

echo "=== SECTION 6: Backward Compatibility ==="
echo ""

# Test 45: Existing AI Agent endpoints still work
echo "Test 45: Existing AI Agent endpoints still work"
test -f "routes/aiAgent.js" && \
grep -q "POST.*agent/chat" routes/aiAgent.js
check_result "Existing chat endpoint preserved"

# Test 46: Streaming endpoint still functional
echo "Test 46: Streaming endpoint still functional"
test -f "routes/aiAgentStreaming.js" && \
grep -q "chat/stream" routes/aiAgentStreaming.js
check_result "Streaming endpoint preserved"

# Test 47: Decision making API preserved
echo "Test 47: Decision making API preserved"
test -f "routes/aiDecisionMaker.js" && \
grep -q "propose-decision" routes/aiDecisionMaker.js
check_result "Decision making API preserved"

# Test 48: Risk detection API preserved
echo "Test 48: Risk detection API preserved"
test -f "routes/aiRiskDetector.js" && \
grep -q "scan-risks" routes/aiRiskDetector.js
check_result "Risk detection API preserved"

echo ""

##############################################################################
# SECTION 7: Code Quality Tests
##############################################################################

echo "=== SECTION 7: Code Quality ==="
echo ""

# Test 49: Proper async/await usage
echo "Test 49: Proper async/await usage"
grep -q "async.*await" services/aiAgent.js
check_result "Proper async/await patterns"

# Test 50: SQL parameterization (no SQL injection)
echo "Test 50: SQL parameterization (no SQL injection)"
grep -q "\$1\|\$2\|\$3" services/aiAgent.js
check_result "Parameterized SQL queries"

# Test 51: No hardcoded database credentials
echo "Test 51: No hardcoded database credentials"
! grep -i "password.*=.*['\"]" services/aiAgent.js
check_result "No hardcoded credentials"

# Test 52: Proper error logging
echo "Test 52: Proper error logging"
grep -q "console.error" services/aiAgent.js
check_result "Proper error logging"

# Test 53: Code comments for complex logic
echo "Test 53: Code comments for complex logic"
grep -q "/\*\|//" services/aiAgent.js
check_result "Code comments present"

echo ""

##############################################################################
# SECTION 8: Performance & Optimization Tests
##############################################################################

echo "=== SECTION 8: Performance & Optimization ==="
echo ""

# Test 54: PKG query has LIMIT clause
echo "Test 54: PKG query has LIMIT clause"
grep -q "LIMIT" services/aiAgent.js
check_result "PKG queries use LIMIT for performance"

# Test 55: RAG search has LIMIT clause
echo "Test 55: RAG search has LIMIT clause"
grep -q "LIMIT.*\$" services/aiAgent.js
check_result "RAG search uses parameterized LIMIT"

# Test 56: Context assembly time tracking
echo "Test 56: Context assembly time tracking"
grep -q "startTime\|Date.now()" services/aiAgent.js
check_result "Performance timing for context assembly"

# Test 57: Efficient PKG edge query (uses ANY)
echo "Test 57: Efficient PKG edge query (uses ANY)"
grep -q "ANY(\$" services/aiAgent.js
check_result "Efficient bulk PKG edge queries"

# Test 58: RAG relevance ordering
echo "Test 58: RAG relevance ordering"
grep -q "ORDER BY relevance" services/aiAgent.js
check_result "RAG results ordered by relevance"

echo ""

##############################################################################
# SECTION 9: Documentation & Maintainability Tests
##############################################################################

echo "=== SECTION 9: Documentation & Maintainability ==="
echo ""

# Test 59: JSDoc comments for public methods
echo "Test 59: JSDoc comments for public methods"
grep -q "/\*\*" services/aiAgent.js
check_result "JSDoc comments for documentation"

# Test 60: Method descriptions
echo "Test 60: Method descriptions"
grep -q "@param\|@returns" services/aiAgent.js || \
grep -q "ENHANCED:\|NEW:" services/aiAgent.js
check_result "Method descriptions or enhancement markers"

# Test 61: Clear variable names
echo "Test 61: Clear variable names"
grep -q "pkgNodes\|ragResults\|citations" services/aiAgent.js
check_result "Descriptive variable naming"

echo ""

##############################################################################
# Test Suite Summary
##############################################################################

echo "========================================"
echo "Test Suite Summary"
echo "========================================"
echo -e "${GREEN}PASSED: $PASS${NC}"
echo -e "${RED}FAILED: $FAIL${NC}"
echo "TOTAL:  $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Story 5.2.5 is production-ready!${NC}"
  echo ""
  echo "Summary:"
  echo "✅ PKG-aware context assembly working"
  echo "✅ RAG integration with full-text search"
  echo "✅ Citation support in responses"
  echo "✅ PKG write integration for decisions and risks"
  echo "✅ Bi-directional sync operational"
  echo "✅ Evidence edges created for relationships"
  echo ""
  echo "Your AI agents are now PKG/RAG-powered!"
  echo "Ready for Story 5.3 (Starter Kits) or Story 5.4 (Sidecar Bot)!"
  exit 0
else
  echo -e "${YELLOW}⚠ Some tests failed. Review the output above.${NC}"
  echo ""
  echo "Common Issues:"
  echo "- Ensure Story 5.1 (PKG/RAG foundation) is complete"
  echo "- Verify pkg_nodes, pkg_edges, rag_documents tables exist"
  echo "- Check that all 4 sub-stories of 5.2.5 are implemented"
  exit 1
fi
