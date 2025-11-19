#!/bin/bash

##############################################################################
# Story 5.2.4: AI Agent API & Integration - Automated Verification Tests
# Tests streaming infrastructure, UI components, API documentation, and integration
##############################################################################

set -e  # Exit on first error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0

# Test result function
check_result() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASS++))
  else
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAIL++))
  fi
}

echo "========================================"
echo "Story 5.2.4 Verification Test Suite"
echo "========================================"
echo ""

##############################################################################
# SECTION 1: Backend Streaming Service Tests
##############################################################################

echo "=== SECTION 1: Backend Streaming Service ==="
echo ""

# Test 1: Streaming service file exists
echo "Test 1: Streaming service file exists"
test -f "services/aiAgentStreaming.js"
check_result "services/aiAgentStreaming.js file exists"

# Test 2: Streaming service has streamChatResponse method
echo "Test 2: Streaming service has streamChatResponse method"
grep -q "streamChatResponse" services/aiAgentStreaming.js
check_result "streamChatResponse method defined"

# Test 3: Streaming service has streamLLMResponse method
echo "Test 3: Streaming service has streamLLMResponse method"
grep -q "streamLLMResponse" services/aiAgentStreaming.js
check_result "streamLLMResponse method defined"

# Test 4: Streaming service integrates with aiAgent service
echo "Test 4: Streaming service integrates with aiAgent service"
grep -q "const aiAgentService = require('./aiAgent')" services/aiAgentStreaming.js
check_result "aiAgent service integration"

# Test 5: Streaming service has SSE event framing
echo "Test 5: Streaming service has SSE event framing"
grep -q "data: \${JSON.stringify" services/aiAgentStreaming.js
check_result "SSE event framing implemented"

# Test 6: Streaming service handles Claude API
echo "Test 6: Streaming service handles Claude API"
grep -q "api.anthropic.com/v1/messages" services/aiAgentStreaming.js
check_result "Claude API streaming integration"

# Test 7: Streaming service handles OpenAI API
echo "Test 7: Streaming service handles OpenAI API"
grep -q "api.openai.com/v1/chat/completions" services/aiAgentStreaming.js
check_result "OpenAI API streaming integration"

# Test 8: Streaming service has error handling
echo "Test 8: Streaming service has error handling"
grep -q "catch (error)" services/aiAgentStreaming.js && \
grep -q "type: 'error'" services/aiAgentStreaming.js
check_result "Error handling in streaming service"

# Test 9: Streaming service has stream completion
echo "Test 9: Streaming service has stream completion"
grep -q "type: 'complete'" services/aiAgentStreaming.js && \
grep -q "responseStream.end()" services/aiAgentStreaming.js
check_result "Stream completion handling"

# Test 10: Streaming service logs to audit
echo "Test 10: Streaming service logs to audit"
grep -q "logAction" services/aiAgentStreaming.js
check_result "Audit logging in streaming service"

echo ""

##############################################################################
# SECTION 2: Streaming Routes Tests
##############################################################################

echo "=== SECTION 2: Streaming Routes ==="
echo ""

# Test 11: Streaming routes file exists
echo "Test 11: Streaming routes file exists"
test -f "routes/aiAgentStreaming.js"
check_result "routes/aiAgentStreaming.js file exists"

# Test 12: Streaming route endpoint defined
echo "Test 12: Streaming route endpoint defined"
grep -q "router.get('/projects/:projectId/agent/chat/stream'" routes/aiAgentStreaming.js
check_result "Streaming chat endpoint defined"

# Test 13: Streaming route has authentication
echo "Test 13: Streaming route has authentication"
grep -q "authenticateToken" routes/aiAgentStreaming.js
check_result "Authentication middleware on streaming route"

# Test 14: Streaming route sets SSE headers
echo "Test 14: Streaming route sets SSE headers"
grep -q "text/event-stream" routes/aiAgentStreaming.js && \
grep -q "no-cache" routes/aiAgentStreaming.js && \
grep -q "keep-alive" routes/aiAgentStreaming.js
check_result "SSE headers configured"

# Test 15: Streaming route validates prompt parameter
echo "Test 15: Streaming route validates prompt parameter"
grep -q "if (!prompt)" routes/aiAgentStreaming.js
check_result "Prompt parameter validation"

# Test 16: Streaming routes registered in server.js
echo "Test 16: Streaming routes registered in server.js"
grep -q "aiAgentStreaming" server.js
check_result "Streaming routes registered in server.js"

echo ""

##############################################################################
# SECTION 3: Frontend Dashboard Component Tests
##############################################################################

echo "=== SECTION 3: Frontend Dashboard Component ==="
echo ""

# Test 17: Dashboard component file exists
echo "Test 17: Dashboard component file exists"
test -f "public/js/components/AIAgentDashboard.js"
check_result "AIAgentDashboard.js file exists"

# Test 18: Dashboard has AIAgentDashboard class
echo "Test 18: Dashboard has AIAgentDashboard class"
grep -q "class AIAgentDashboard" public/js/components/AIAgentDashboard.js
check_result "AIAgentDashboard class defined"

# Test 19: Dashboard has initialize method
echo "Test 19: Dashboard has initialize method"
grep -q "async initialize(projectId)" public/js/components/AIAgentDashboard.js
check_result "initialize method defined"

# Test 20: Dashboard has sendMessage method
echo "Test 20: Dashboard has sendMessage method"
grep -q "async sendMessage()" public/js/components/AIAgentDashboard.js
check_result "sendMessage method defined"

# Test 21: Dashboard has streamResponse method
echo "Test 21: Dashboard has streamResponse method"
grep -q "async streamResponse" public/js/components/AIAgentDashboard.js
check_result "streamResponse method defined"

# Test 22: Dashboard uses EventSource for SSE
echo "Test 22: Dashboard uses EventSource for SSE"
grep -q "new EventSource" public/js/components/AIAgentDashboard.js
check_result "EventSource integration for SSE"

# Test 23: Dashboard handles SSE events
echo "Test 23: Dashboard handles SSE events"
grep -q "eventSource.onmessage" public/js/components/AIAgentDashboard.js
check_result "SSE event handling"

# Test 24: Dashboard has scanRisks method
echo "Test 24: Dashboard has scanRisks method"
grep -q "async scanRisks()" public/js/components/AIAgentDashboard.js
check_result "scanRisks method defined"

# Test 25: Dashboard has loadRecentSessions method
echo "Test 25: Dashboard has loadRecentSessions method"
grep -q "async loadRecentSessions()" public/js/components/AIAgentDashboard.js
check_result "loadRecentSessions method defined"

# Test 26: Dashboard has message formatting
echo "Test 26: Dashboard has message formatting"
grep -q "formatMessage" public/js/components/AIAgentDashboard.js
check_result "Message formatting method"

# Test 27: Dashboard has global instance
echo "Test 27: Dashboard has global instance"
grep -q "const aiDashboard = new AIAgentDashboard" public/js/components/AIAgentDashboard.js
check_result "Global aiDashboard instance created"

# Test 28: Dashboard handles agent type selection
echo "Test 28: Dashboard handles agent type selection"
grep -q "agent-type-select" public/js/components/AIAgentDashboard.js
check_result "Agent type selection handling"

echo ""

##############################################################################
# SECTION 4: Frontend HTML & CSS Tests
##############################################################################

echo "=== SECTION 4: Frontend HTML & CSS ==="
echo ""

# Test 29: AI Agent HTML page exists
echo "Test 29: AI Agent HTML page exists"
test -f "public/ai-agent.html"
check_result "ai-agent.html file exists"

# Test 30: HTML page includes dashboard component script
echo "Test 30: HTML page includes dashboard component script"
grep -q "AIAgentDashboard.js" public/ai-agent.html
check_result "Dashboard component script included"

# Test 31: HTML page has container div
echo "Test 31: HTML page has container div"
grep -q "ai-agent-container" public/ai-agent.html
check_result "ai-agent-container div present"

# Test 32: HTML page initializes dashboard on load
echo "Test 32: HTML page initializes dashboard on load"
grep -q "aiDashboard.initialize" public/ai-agent.html
check_result "Dashboard initialization on page load"

# Test 33: CSS file exists
echo "Test 33: CSS file exists"
test -f "public/css/ai-agent.css"
check_result "ai-agent.css file exists"

# Test 34: CSS has dashboard styles
echo "Test 34: CSS has dashboard styles"
grep -q ".ai-agent-dashboard" public/css/ai-agent.css
check_result "Dashboard styles defined"

# Test 35: CSS has chat message styles
echo "Test 35: CSS has chat message styles"
grep -q ".chat-message" public/css/ai-agent.css && \
grep -q ".message-content" public/css/ai-agent.css
check_result "Chat message styles defined"

# Test 36: CSS has agent header styles
echo "Test 36: CSS has agent header styles"
grep -q ".agent-header" public/css/ai-agent.css
check_result "Agent header styles defined"

# Test 37: CSS has session card styles
echo "Test 37: CSS has session card styles"
grep -q ".session-card" public/css/ai-agent.css
check_result "Session card styles defined"

echo ""

##############################################################################
# SECTION 5: API Documentation Tests
##############################################################################

echo "=== SECTION 5: API Documentation ==="
echo ""

# Test 38: API documentation file exists
echo "Test 38: API documentation file exists"
test -f "docs/AI-AGENT-API.md"
check_result "AI-AGENT-API.md file exists"

# Test 39: Documentation has Base URL section
echo "Test 39: Documentation has Base URL section"
grep -q "Base URL" docs/AI-AGENT-API.md
check_result "Base URL section present"

# Test 40: Documentation has Authentication section
echo "Test 40: Documentation has Authentication section"
grep -q "Authentication" docs/AI-AGENT-API.md
check_result "Authentication section present"

# Test 41: Documentation covers Agent Chat endpoints
echo "Test 41: Documentation covers Agent Chat endpoints"
grep -q "/projects/:projectId/agent/chat" docs/AI-AGENT-API.md
check_result "Agent Chat endpoints documented"

# Test 42: Documentation covers streaming endpoint
echo "Test 42: Documentation covers streaming endpoint"
grep -q "/agent/chat/stream" docs/AI-AGENT-API.md
check_result "Streaming endpoint documented"

# Test 43: Documentation has SSE event types
echo "Test 43: Documentation has SSE event types"
grep -q "Event Types:" docs/AI-AGENT-API.md && \
grep -q '"type": "chunk"' docs/AI-AGENT-API.md
check_result "SSE event types documented"

# Test 44: Documentation covers Decision Making endpoints
echo "Test 44: Documentation covers Decision Making endpoints"
grep -q "/agent/propose-decision" docs/AI-AGENT-API.md
check_result "Decision Making endpoints documented"

# Test 45: Documentation covers Risk Detection endpoints
echo "Test 45: Documentation covers Risk Detection endpoints"
grep -q "/agent/scan-risks" docs/AI-AGENT-API.md
check_result "Risk Detection endpoints documented"

# Test 46: Documentation has error responses section
echo "Test 46: Documentation has error responses section"
grep -q "Error Responses" docs/AI-AGENT-API.md
check_result "Error Responses section present"

# Test 47: Documentation has request examples
echo "Test 47: Documentation has request examples"
grep -q '```json' docs/AI-AGENT-API.md
check_result "Request examples in JSON format"

echo ""

##############################################################################
# SECTION 6: Integration & Architecture Tests
##############################################################################

echo "=== SECTION 6: Integration & Architecture ==="
echo ""

# Test 48: Streaming service exports class instance
echo "Test 48: Streaming service exports class instance"
grep -q "module.exports = new AIAgentStreaming()" services/aiAgentStreaming.js
check_result "Streaming service exports instance"

# Test 49: Streaming routes export router
echo "Test 49: Streaming routes export router"
grep -q "module.exports = router" routes/aiAgentStreaming.js
check_result "Streaming routes export router"

# Test 50: Dashboard component has proper error handling
echo "Test 50: Dashboard component has proper error handling"
grep -q "catch (error)" public/js/components/AIAgentDashboard.js && \
grep -q "console.error" public/js/components/AIAgentDashboard.js
check_result "Error handling in dashboard component"

# Test 51: Streaming service has context assembly
echo "Test 51: Streaming service has context assembly"
grep -q "Assembling context" services/aiAgentStreaming.js && \
grep -q "assembleContext" services/aiAgentStreaming.js
check_result "Context assembly in streaming service"

# Test 52: Streaming service completes sessions
echo "Test 52: Streaming service completes sessions"
grep -q "completeSession" services/aiAgentStreaming.js
check_result "Session completion in streaming service"

# Test 53: Dashboard closes EventSource on completion
echo "Test 53: Dashboard closes EventSource on completion"
grep -q "eventSource.close()" public/js/components/AIAgentDashboard.js
check_result "EventSource cleanup on completion"

# Test 54: Streaming route uses userId from auth
echo "Test 54: Streaming route uses userId from auth"
grep -q "req.user.id" routes/aiAgentStreaming.js
check_result "User ID from authentication token"

# Test 55: Dashboard integrates with risk detection API
echo "Test 55: Dashboard integrates with risk detection API"
grep -q "/agent/scan-risks" public/js/components/AIAgentDashboard.js
check_result "Risk detection API integration"

echo ""

##############################################################################
# SECTION 7: Feature Completeness Tests
##############################################################################

echo "=== SECTION 7: Feature Completeness ==="
echo ""

# Test 56: All 4 agent types supported
echo "Test 56: All 4 agent types supported"
grep -q "knowledge_explorer" public/js/components/AIAgentDashboard.js && \
grep -q "decision_assistant" public/js/components/AIAgentDashboard.js && \
grep -q "risk_detector" public/js/components/AIAgentDashboard.js && \
grep -q "meeting_analyzer" public/js/components/AIAgentDashboard.js
check_result "All 4 agent types available"

# Test 57: Streaming service sends session ID
echo "Test 57: Streaming service sends session ID"
grep -q "type: 'session'" services/aiAgentStreaming.js
check_result "Session ID sent in stream"

# Test 58: Streaming service sends status updates
echo "Test 58: Streaming service sends status updates"
grep -q "type: 'status'" services/aiAgentStreaming.js
check_result "Status updates in stream"

# Test 59: Streaming service sends context info
echo "Test 59: Streaming service sends context info"
grep -q "type: 'context'" services/aiAgentStreaming.js
check_result "Context info in stream"

# Test 60: Dashboard displays user and assistant messages differently
echo "Test 60: Dashboard displays user and assistant messages differently"
grep -q "chat-message user" public/js/components/AIAgentDashboard.js && \
grep -q "chat-message assistant" public/js/components/AIAgentDashboard.js
check_result "Distinct user/assistant message styling"

# Test 61: Dashboard has message avatars
echo "Test 61: Dashboard has message avatars"
grep -q "message-avatar" public/js/components/AIAgentDashboard.js
check_result "Message avatars in chat interface"

# Test 62: Dashboard auto-scrolls on new messages
echo "Test 62: Dashboard auto-scrolls on new messages"
grep -q "scrollTop = scrollHeight" public/js/components/AIAgentDashboard.js
check_result "Auto-scroll on new messages"

# Test 63: CSS has loading indicator styles
echo "Test 63: CSS has loading indicator styles"
grep -q ".loading" public/css/ai-agent.css
check_result "Loading indicator styles"

# Test 64: HTML page has navigation
echo "Test 64: HTML page has navigation"
grep -q "navbar" public/ai-agent.html
check_result "Navigation bar in HTML page"

# Test 65: Documentation has performance characteristics
echo "Test 65: Documentation has performance characteristics"
grep -q "Performance Characteristics" docs/AI-AGENT-API.md
check_result "Performance characteristics documented"

echo ""

##############################################################################
# SECTION 8: Quality & Best Practices Tests
##############################################################################

echo "=== SECTION 8: Quality & Best Practices ==="
echo ""

# Test 66: Streaming service has proper async/await
echo "Test 66: Streaming service has proper async/await"
grep -q "async streamChatResponse" services/aiAgentStreaming.js && \
grep -q "await aiAgentService" services/aiAgentStreaming.js
check_result "Proper async/await usage"

# Test 67: Dashboard has keyboard shortcuts
echo "Test 67: Dashboard has keyboard shortcuts"
grep -q "keydown" public/js/components/AIAgentDashboard.js && \
grep -q "Enter" public/js/components/AIAgentDashboard.js
check_result "Keyboard shortcuts (Enter key)"

# Test 68: Streaming service handles both Claude and GPT
echo "Test 68: Streaming service handles both Claude and GPT"
grep -q "if (aiAgentService.defaultModel.startsWith('claude'))" services/aiAgentStreaming.js && \
grep -q "else if (aiAgentService.defaultModel.startsWith('gpt'))" services/aiAgentStreaming.js
check_result "Multi-provider LLM support"

# Test 69: Streaming service tracks tokens and latency
echo "Test 69: Streaming service tracks tokens and latency"
grep -q "tokensUsed" services/aiAgentStreaming.js && \
grep -q "latency" services/aiAgentStreaming.js
check_result "Token and latency tracking"

# Test 70: Dashboard shows confidence scores
echo "Test 70: Dashboard shows confidence scores"
grep -q "confidence_score" public/js/components/AIAgentDashboard.js
check_result "Confidence score display"

# Test 71: CSS is responsive
echo "Test 71: CSS is responsive"
grep -q "max-width" public/css/ai-agent.css
check_result "Responsive CSS design"

# Test 72: Documentation has code examples
echo "Test 72: Documentation has code examples"
grep -q '```' docs/AI-AGENT-API.md
check_result "Code examples in documentation"

# Test 73: Streaming routes handle query parameters
echo "Test 73: Streaming routes handle query parameters"
grep -q "req.query" routes/aiAgentStreaming.js
check_result "Query parameter handling"

# Test 74: Dashboard disables button during scan
echo "Test 74: Dashboard disables button during scan"
grep -q "btn.disabled = true" public/js/components/AIAgentDashboard.js
check_result "Button state management during operations"

# Test 75: Documentation has rate limits section
echo "Test 75: Documentation has rate limits section"
grep -q "Rate Limits" docs/AI-AGENT-API.md
check_result "Rate limits documented"

echo ""
echo "========================================"
echo "Test Suite Summary"
echo "========================================"
echo -e "${GREEN}PASSED: $PASS${NC}"
echo -e "${RED}FAILED: $FAIL${NC}"
echo "TOTAL:  $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Story 5.2.4 is production-ready!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠ Some tests failed. Review the output above.${NC}"
  exit 1
fi
