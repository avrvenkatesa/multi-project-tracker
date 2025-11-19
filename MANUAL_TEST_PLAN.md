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

**Total Tests: 23**
**Estimated Test Time: 30-45 minutes**
