# Manual Test Plan: Citation Display & Document Library

## Prerequisites
- Server running at your Replit URL
- At least one project created
- Test user account (any role)
- Sample documents/meetings in your project

---

## Story 5.2.5.3: Citation Display

### Test 1: AI Agent Shows Citations in Responses
**Steps:**
1. Navigate to the AI Agent page (View → AI Agent)
2. Select a project from the dropdown
3. Choose "Knowledge Explorer" agent type
4. Ask: "What decisions have been made in this project?"
5. Wait for the streaming response to complete

**Expected Results:**
- Response contains clickable `[Source: ...]` links in blue
- Citations appear inline within the response text
- Hovering over citation shows tooltip with source details
- A citation badge appears (e.g., "3 sources cited")

---

### Test 2: Citation Links Navigate Correctly
**Steps:**
1. Continue from Test 1
2. Click on a `[Source: Decision ABC]` citation link

**Expected Results:**
- Opens the decision detail page in a new tab
- URL is relative (starts with `/`)
- Link has `rel="noopener noreferrer"` for security
- Correct decision details are displayed

---

### Test 3: Citations for Different Entity Types
**Steps:**
1. In AI Agent, ask: "What are the main risks in this project?"
2. Wait for response
3. Click on a `[Source: RISK-###]` citation

**Expected Results:**
- Risk detail page opens
- Citation links work for: Decisions, Risks, Meetings, Documents

---

### Test 4: Historical Session Citations
**Steps:**
1. Complete a chat session with citations
2. Refresh the page or close/reopen AI Agent
3. Click on a recent session from the sidebar

**Expected Results:**
- Previous messages reload with their citations intact
- Citations are still clickable
- Citation badge shows correct count

---

### Test 5: No Citations Scenario
**Steps:**
1. Ask AI Agent: "What is project management?"
2. Wait for response

**Expected Results:**
- Response completes normally
- No citation badge appears
- No error messages
- Session actions (copy, feedback) still work

---

## Story 5.2.5.4: Document Library

### Test 6: Access Document Library
**Steps:**
1. Click "View" dropdown in top navigation
2. Select "Documents"

**Expected Results:**
- Document Library page loads
- Page shows project selector
- Document list container appears
- Filter controls are visible

---

### Test 7: View Document List
**Steps:**
1. Select a project from the dropdown
2. Observe the document list

**Expected Results:**
- Documents display with:
  - Icon (🎙️ for transcripts, 🤖 for AI analysis, 📄 for uploads)
  - Title
  - Preview (first 200 characters)
  - Uploader name and timestamp
  - Word count
  - Type badge

---

### Test 8: Filter by Document Type
**Steps:**
1. Click "Source Type" dropdown
2. Select "Meeting Transcript"
3. Observe filtered results

**Expected Results:**
- Only meeting transcripts (🎙️) appear
- Other document types are hidden
- Result count updates

---

### Test 9: Search Documents
**Steps:**
1. Clear any filters
2. In the search box, type "decision"
3. Wait for results to update

**Expected Results:**
- Documents containing "decision" appear
- Full-text search works across document content
- Search highlights or filters appropriately

---

### Test 10: Pagination
**Steps:**
1. Clear all filters
2. If you have >50 documents, navigate to page 2
3. Click "Next" button
4. Click "Previous" button

**Expected Results:**
- Next button loads documents 51-100
- Previous button returns to documents 1-50
- Current page number displays correctly
- Pagination controls disable appropriately (no Previous on page 1)

---

### Test 11: View Document Details
**Steps:**
1. Click "View" button on any document card

**Expected Results:**
- Document detail page/modal opens
- Shows full content (not just preview)
- Displays all metadata:
  - Title, source type, uploader
  - Created date, word count
  - Linked entities (if any)

---

### Test 12: Download Document
**Steps:**
1. Click "Download" button on a document card
2. Check browser downloads folder

**Expected Results:**
- Document downloads as text file
- Filename includes document title or ID
- File contains full document content

---

### Test 13: Delete Document (Admin/Manager Only)
**Steps:**
1. As an Admin or Manager, click "Delete" button
2. Confirm the deletion dialog

**Expected Results:**
- Document is removed from the list
- Evidence records linking to this document are deleted
- Success message appears
- If not Admin/Manager, delete button should be hidden or disabled

---

### Test 14: Delete Document RBAC (Regular User)
**Steps:**
1. Log in as a Viewer or Contributor
2. Navigate to Documents page
3. Look for delete buttons

**Expected Results:**
- Delete buttons are hidden for users without permission
- OR delete buttons show but return permission error
- Only document uploader or Admin/Manager can delete

---

### Test 15: Filter by Date Range
**Steps:**
1. Set "Start Date" to last week
2. Set "End Date" to today
3. Apply filters

**Expected Results:**
- Only documents created within date range appear
- Documents outside range are hidden

---

### Test 16: Filter by Uploader
**Steps:**
1. Click "Uploaded By" dropdown
2. Select a specific user
3. Observe results

**Expected Results:**
- Only documents uploaded by selected user appear
- Other documents are filtered out

---

### Test 17: Combine Multiple Filters
**Steps:**
1. Select Source Type: "AI Analysis"
2. Select an uploader
3. Add a search term
4. Observe results

**Expected Results:**
- All filters apply simultaneously (AND logic)
- Only documents matching ALL criteria appear
- Clear filters button resets all

---

### Test 18: Empty State
**Steps:**
1. Select a project with no documents
2. OR apply filters that match nothing

**Expected Results:**
- "No documents found" message appears
- Helpful suggestion to upload or change filters
- No error messages

---

### Test 19: Lazy Loading Performance
**Steps:**
1. Select project with many documents
2. Observe initial load time
3. Scroll through results

**Expected Results:**
- Page loads quickly (preview only, not full content)
- Scrolling is smooth
- Full content only loads on "View" click

---

### Test 20: AI Analysis Auto-Storage
**Steps:**
1. Navigate to a project
2. Upload a document for AI analysis (if feature exists)
3. Wait for analysis to complete
4. Navigate to Documents page

**Expected Results:**
- Uploaded document appears as "uploaded_doc" type
- AI analysis result appears as "ai_analysis_doc" type
- Both have correct metadata and linked entities

---

### Test 21: Navigation Integration
**Steps:**
1. From AI Agent page, click View → Documents
2. From Documents page, click View → AI Agent
3. From Documents page, click View → Dashboard

**Expected Results:**
- Navigation works smoothly between all pages
- Documents option appears in all View dropdowns
- No JavaScript errors in console

---

### Test 22: XSS Protection Test
**Steps:**
1. Create a document with title: `<script>alert('XSS')</script>`
2. View in Document Library

**Expected Results:**
- Script tag displays as plain text, does not execute
- HTML is properly escaped
- No alert popup appears

---

### Test 23: Citation Security Test
**Steps:**
1. In AI Agent, check citation URLs in browser DevTools
2. Verify citation links in DOM

**Expected Results:**
- All citation URLs are relative (start with `/`)
- Links have `rel="noopener noreferrer"` attribute
- No external or malicious URLs

---

## Success Criteria Summary

### Citation Display
- ✅ Citations appear inline in AI responses
- ✅ Citations are clickable and navigate correctly
- ✅ Works for all entity types (Decision, Risk, Meeting, Document)
- ✅ Historical sessions preserve citations
- ✅ No errors when citations are empty

### Document Library
- ✅ Document listing with filtering, search, pagination
- ✅ View, download, delete operations work
- ✅ RBAC enforced for delete operations
- ✅ Document type icons and labels display correctly
- ✅ Lazy loading improves performance
- ✅ XSS protection prevents script injection
- ✅ Navigation integrated across all pages

---

## Reporting Issues

If any test fails, please note:
1. **Test number and name**
2. **Steps taken**
3. **Expected vs actual result**
4. **Browser console errors** (F12 → Console)
5. **Network errors** (F12 → Network tab)
6. **Screenshots** if helpful

---

## Story: Hybrid Search with pgvector Semantic Search

### Test 24: Verify pgvector Extension Installation
**Steps:**
1. Open terminal/database client
2. Run: `psql $DATABASE_URL -c "\dx"`
3. Look for "vector" extension

**Expected Results:**
- pgvector extension (v0.8.0 or higher) is installed
- Extension description shows "vector data type and ivfflat and hnsw access methods"
- No errors

---

### Test 25: Automatic Embedding Generation on Document Upload
**Steps:**
1. Navigate to Documents page
2. Click "Upload Document" button
3. Upload a text file or PDF with unique content
4. Wait for upload to complete
5. Check browser network tab for async embedding generation

**Expected Results:**
- Document uploads successfully (HTTP 201)
- Upload response doesn't wait for embedding (fast response)
- Embedding generation happens asynchronously in background
- No errors in console

---

### Test 26: Hybrid Search API - Default Mode
**Steps:**
1. Using browser DevTools or terminal, make API call:
   ```
   GET /api/aipm/projects/1/rag/search?q=database+migration
   ```
2. Examine response JSON

**Expected Results:**
- Response includes `"mode": "hybrid"`
- Response includes `weights: { keyword: 0.3, semantic: 0.7 }`
- Results include `keywordScore`, `semanticScore`, and `combinedScore`
- Documents ranked by `combinedScore` (descending)

---

### Test 27: Keyword-Only Search Mode
**Steps:**
1. Make API call:
   ```
   GET /api/aipm/projects/1/rag/search?q=migration&mode=keyword
   ```
2. Examine response

**Expected Results:**
- Response shows `"mode": "keyword"`
- Results include `relevance` score (from ts_rank)
- Results include `snippet` with highlighted keywords
- Only documents with exact keyword matches appear

---

### Test 28: Semantic-Only Search Mode
**Steps:**
1. Make API call:
   ```
   GET /api/aipm/projects/1/rag/search?q=database+upgrade&mode=semantic
   ```
2. Examine response

**Expected Results:**
- Response shows `"mode": "semantic"`
- Results include `similarity` score (0-1 range)
- May include documents WITHOUT exact keyword "upgrade" but similar meaning
- Results ordered by similarity score

---

### Test 29: Semantic Search Finds Synonyms
**Prerequisites:**
- Upload document A: "Our SQL Server migration plan"
- Upload document B: "Database relocation strategy"

**Steps:**
1. Wait 5 seconds for embeddings to generate
2. Search: `GET /api/aipm/projects/1/rag/search?q=database+migration&mode=semantic`

**Expected Results:**
- Both document A and B appear in results
- Document B appears even though it says "relocation" not "migration"
- Semantic similarity recognizes synonyms and related concepts

---

### Test 30: AI Agent Uses Hybrid Search
**Steps:**
1. Navigate to AI Agent page
2. Select a project
3. Ask: "What are the security requirements for this project?"
4. Wait for response

**Expected Results:**
- AI Agent finds documents about "authentication", "authorization", "access control"
- Not just documents with exact phrase "security requirements"
- Better context assembly with semantic understanding

---

### Test 31: Attachment Auto-Indexing with Embeddings
**Steps:**
1. Navigate to Kanban Board
2. Open an issue detail modal
3. Upload a PDF attachment with unique content
4. Wait 5 seconds for processing
5. Navigate to Documents page
6. Filter by "Attachments" type

**Expected Results:**
- Attachment appears in Document Library
- Green "📎 Attachment" badge displayed
- Embedding generated automatically (verify in database)
- Searchable by AI Agent immediately after upload

---

### Test 32: Backfill Script - Dry Run
**Steps:**
1. Open terminal
2. Run: `node scripts/backfill-embeddings.js --dry-run`

**Expected Results:**
- Script shows count of documents without embeddings
- Lists first 10 documents that would be processed
- Shows document IDs, titles, and source types
- No actual changes made (dry run mode)
- Message: "Run without --dry-run to process these documents"

---

### Test 33: Backfill Script - Generate Embeddings
**Steps:**
1. Run: `node scripts/backfill-embeddings.js --batch-size 3 --delay 1000`
2. Observe progress output

**Expected Results:**
- Script processes 3 documents at a time
- Shows progress: `✓ [1/35] risk_description: ...`
- Waits 1 second between batches (rate limiting)
- Completes successfully with summary:
  - Successfully processed: X
  - Failed: 0 (or small number with error details)

---

### Test 34: Custom Search Weights
**Steps:**
1. Make API call with custom weights:
   ```
   GET /api/aipm/projects/1/rag/search?q=security&keyword_weight=0.5&semantic_weight=0.5
   ```
2. Compare results to default weights

**Expected Results:**
- Response shows `weights: { keyword: 0.5, semantic: 0.5 }`
- Different ranking than default (30/70 split)
- Combined score reflects equal weighting

---

### Test 35: Verify HNSW Index Usage
**Steps:**
1. In terminal, run query plan analysis:
   ```sql
   EXPLAIN ANALYZE
   SELECT id FROM rag_documents
   WHERE embedding IS NOT NULL
   ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
   LIMIT 10;
   ```

**Expected Results:**
- Query plan shows "Index Scan using idx_rag_docs_embedding"
- Uses HNSW index (not sequential scan)
- Query executes in <100ms even with many documents

---

### Test 36: Empty Embeddings Handling
**Steps:**
1. Upload a very short document (< 10 characters)
2. Check if embedding still generates

**Expected Results:**
- Short document still gets embedded
- No errors in logs
- Document searchable (though may rank lower in results)

---

### Test 37: Embedding Cost Tracking
**Steps:**
1. Upload 10 new documents
2. Check server logs for OpenAI API calls
3. Monitor embedding generation success/failure

**Expected Results:**
- Each document triggers one embedding API call
- Calls to `text-embedding-3-small` model
- Successful embedding updates logged
- Failed embeddings logged with error details (not crashes)

---

### Test 38: Semantic Search Across Document Types
**Prerequisites:**
- Meeting transcript mentioning "authentication"
- Uploaded doc about "user login"
- Attachment about "access control"

**Steps:**
1. Search: `GET /api/aipm/projects/1/rag/search?q=security+authentication&mode=semantic`

**Expected Results:**
- All three documents appear in results
- Semantic search works across all source types:
  - meeting_transcript
  - uploaded_doc
  - attachment
  - ai_analysis_doc

---

### Test 39: No Embedding Graceful Fallback
**Steps:**
1. Query documents where some have embeddings, some don't
2. Use hybrid search mode

**Expected Results:**
- Documents without embeddings still appear (via keyword search)
- Documents with embeddings get boost from semantic score
- No errors or crashes
- Combined score handles missing embeddings gracefully

---

### Test 40: Filter by Source Type with Semantic Search
**Steps:**
1. Make API call:
   ```
   GET /api/aipm/projects/1/rag/search?q=migration&mode=semantic&source_type=attachment
   ```

**Expected Results:**
- Only attachments returned
- Semantic search still works within filtered type
- Correct filtering + semantic matching combination

---

## Success Criteria Summary (Semantic Search)

### Hybrid Search Implementation
- ✅ pgvector extension installed and functional
- ✅ Embeddings auto-generate on document upload (async)
- ✅ Three search modes work: keyword, semantic, hybrid
- ✅ Hybrid search combines both effectively (30/70 default)
- ✅ HNSW index provides fast vector search (<100ms)

### Semantic Matching
- ✅ Finds synonyms and related concepts
- ✅ Works across all document types
- ✅ AI Agent uses hybrid search for better results
- ✅ Custom weight configuration supported

### Backfill & Maintenance
- ✅ Backfill script processes existing documents
- ✅ Dry-run mode works correctly
- ✅ Batch processing with rate limiting
- ✅ Error handling doesn't crash script

### Performance & Reliability
- ✅ Async embedding doesn't block uploads
- ✅ Graceful handling of missing embeddings
- ✅ Query performance acceptable (<100ms)
- ✅ Cost tracking and error logging functional

---

**Total Tests: 40**
**Estimated Test Time: 60-75 minutes**
