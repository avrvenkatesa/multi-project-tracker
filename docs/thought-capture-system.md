# Thought Capture System - Documentation

## Overview

The **Mobile Thought Capture & Voice-to-Text System** enables users to quickly capture ideas, decisions, and action items on-the-go using text or voice input. The system features offline-first design, optional AI-powered entity detection, and seamless integration with the Multi-Project Tracker's workflow.

## Key Features

### 1. **Multi-Modal Input**
- **Text Input**: Quick text-based thought capture
- **Voice Recording**: Real-time voice-to-text transcription via Deepgram API
- **Supported Audio Formats**: webm, mp3, wav, ogg, opus, m4a

### 2. **Offline-First Architecture**
- **Progressive Web App (PWA)**: Native app-like experience on mobile devices
- **Service Worker Caching**: Works without internet connectivity
- **Background Sync**: Automatic upload when connection restored
- **Queue Management**: Retry logic with exponential backoff (up to 5 attempts)

### 3. **AI-Powered Entity Detection** *(Optional)*
- **Intelligent Analysis**: Automatically detects decisions, risks, action items, and tasks
- **Confidence Scoring**: AI assigns confidence levels to detected entities
- **Auto-Creation**: High-confidence entities created automatically based on user authority
- **Human-in-the-Loop**: Low-confidence entities submitted as proposals for review
- **Graceful Fallback**: System works reliably even when AI services unavailable

### 4. **Quick Capture Templates**
- **Reusable Templates**: Pre-defined thought formats for common scenarios
- **Project Context**: Associate thoughts with specific projects
- **Custom Fields**: Device info and location context support

### 5. **Performance**
- **<3 Second Capture Time**: Ultra-fast thought recording
- **Background Processing**: AI analysis runs asynchronously without blocking user

## Architecture Components

### Database Schema (Migration 036)

**Four Core Tables:**

1. **`thought_captures`** - Main thought storage
   - Content, capture method (text/voice), timestamps
   - AI analysis results (detected entities, confidence scores)
   - Processing status tracking
   - Full-text search enabled

2. **`voice_recordings`** - Audio file metadata
   - Audio file URLs and formats
   - Transcription data with confidence scores
   - Word-level timestamps
   - Duration and file size

3. **`offline_queue`** - Sync queue management
   - Queue items with payloads
   - Status tracking (pending/processing/synced/failed)
   - Retry counts and error logs
   - Automatic cleanup after 30 days

4. **`quick_capture_templates`** - Reusable templates
   - Template names and content patterns
   - Project associations
   - Usage tracking

**Database Views:**
- `user_thought_captures` - User-specific thought summaries
- `offline_queue_summary` - Queue status dashboard

**Automated Triggers:**
- Auto-processing trigger for new thoughts
- Expiration trigger for old queue items

### Service Layer

**1. Voice Capture Service** (`services/voiceCapture.js`)
- Deepgram API integration for transcription
- Multi-format audio processing
- Confidence scoring and word-level timestamps
- Audio file storage with metadata

**2. Quick Capture Service** (`services/quickCapture.js`)
- Ultra-fast thought creation (<3 seconds)
- Optional AI analysis via Sidecar Bot integration
- `skipAI` flag for reliable offline operation
- Template management and statistics

**3. Offline Sync Service** (`services/offlineSync.js`)
- Queue item processing with retry logic
- **AI processing skipped during sync** for reliability
- Exponential backoff (1s, 2s, 4s, 8s, 16s)
- Automatic cleanup of old synced items
- User-specific queue management

### API Endpoints

All endpoints require **JWT authentication** via `Authorization: Bearer <token>` header.

**Thought Capture:**
- `POST /api/quick-capture/text` - Create text thought
- `POST /api/quick-capture/voice` - Upload voice recording + transcription
- `GET /api/quick-capture` - List thoughts (supports filters: projectId, status, limit, offset)
- `GET /api/quick-capture/:id` - Get specific thought
- `PUT /api/quick-capture/:id` - Update thought
- `DELETE /api/quick-capture/:id` - Delete thought

**Templates:**
- `POST /api/quick-capture/templates` - Create template
- `GET /api/quick-capture/templates` - List templates
- `DELETE /api/quick-capture/templates/:id` - Delete template

**Statistics:**
- `GET /api/quick-capture/stats` - Get capture statistics

**Offline Sync:**
- `POST /api/quick-capture/offline/enqueue` - Add to offline queue
- `GET /api/quick-capture/offline/pending` - Get pending queue items
- `POST /api/quick-capture/offline/sync` - Process queue items
- `GET /api/quick-capture/offline/stats` - Queue statistics
- `POST /api/quick-capture/offline/cleanup` - Clean up old items

### Frontend (PWA)

**Mobile Interface** (`public/mobile-capture.html`)
- Voice recording via Web MediaRecorder API
- Text input with project selector
- Recent thoughts list with status indicators
- Offline detection with visual feedback
- Toast notifications for user feedback
- Responsive mobile-optimized design

**Service Worker** (`public/sw.js`)
- Cache-first strategy for app shell
- Network-first for API calls with cache fallback
- Background sync for offline captures
- Cache versioning for updates

## User Workflows

### Workflow 1: Quick Text Capture
1. User opens `/mobile-capture.html` on mobile device
2. Enters thought in text area
3. Optionally selects project
4. Clicks "Capture"
5. Thought saved instantly (<3s)
6. AI analysis runs in background (if enabled)
7. Entities auto-created or proposed for review

### Workflow 2: Voice Capture
1. User taps microphone icon
2. Records voice note
3. Audio uploaded to server
4. Deepgram transcribes speech-to-text
5. Transcription saved with confidence score
6. AI analyzes transcription for entities
7. Results available in thought history

### Workflow 3: Offline Capture & Sync
1. User captures thought while offline
2. Thought stored in local offline queue
3. Service Worker detects offline state
4. When connection restored:
   - Background sync triggered automatically
   - Queue items uploaded to server
   - Thoughts created (AI processing skipped for reliability)
   - Queue marked as synced
5. AI analysis can be run later if needed

### Workflow 4: Template Usage
1. User creates reusable template (e.g., "Daily Standup Notes")
2. Template saved with project association
3. Later, user selects template
4. Content pre-filled
5. User completes and submits
6. Template usage tracked for analytics

## AI Integration

### Optional AI Analysis Pipeline

When AI is enabled (`skipAI: false`):

1. **Context Assembly** - Gathers project context from PKG and RAG systems
2. **Entity Detection** - Multi-provider LLM (Claude/GPT-4/Gemini) analyzes content
3. **Confidence Scoring** - AI assigns confidence levels (high/medium/low)
4. **Workflow Engine** - Determines auto-create vs. proposal based on:
   - User authority level
   - AI confidence score
   - Entity criticality
5. **Entity Creation** - Auto-creates or generates proposals for review

### Graceful Fallback

When AI is unavailable or disabled (`skipAI: true`):
- Thoughts captured and stored successfully
- Status marked as "processed" without AI analysis
- No blocking or errors
- AI analysis can be triggered manually later
- **Offline sync always uses this mode** for reliability

## Configuration

### Environment Variables

**Required for Voice Transcription:**
- `DEEPGRAM_API_KEY` - Deepgram API key for voice-to-text

**Optional for AI Analysis:**
- `OPENAI_API_KEY` - OpenAI API (GPT-4)
- `ANTHROPIC_API_KEY` - Anthropic API (Claude)
- `GOOGLE_AI_API_KEY` - Google AI API (Gemini)

**Database:**
- `DATABASE_URL` - PostgreSQL connection string

### Database Migration

Apply schema via Drizzle ORM:
```bash
npm run db:push
```

Or apply SQL migration directly:
```bash
psql $DATABASE_URL < db/036_thought_capture.sql
```

## Deployment

### Production Checklist

- ✅ Database migration 036 applied
- ✅ Voice capture service initialized (`DEEPGRAM_API_KEY`)
- ✅ AI integration configured (optional)
- ✅ Service Worker registered for offline support
- ✅ HTTPS enabled (required for MediaRecorder API)
- ✅ JWT authentication configured
- ✅ CORS enabled for mobile access

### Monitoring

**Key Metrics:**
- Thought capture latency (target: <3s)
- Transcription success rate
- AI confidence distribution
- Offline sync success rate
- Queue retry statistics

**Health Checks:**
- Voice capture service availability
- Database connectivity
- AI provider status (optional)
- Service Worker registration

## Security

- **Authentication**: All API endpoints require valid JWT tokens
- **Authorization**: Users can only access their own thoughts
- **Data Isolation**: User-specific views enforce data privacy
- **Secrets Management**: API keys stored securely as environment variables
- **Input Validation**: All user input sanitized and validated

## Performance Characteristics

- **Capture Latency**: <3 seconds (text), <5 seconds (voice with transcription)
- **Offline Sync**: Exponential backoff (1-16 seconds between retries)
- **AI Processing**: Asynchronous, non-blocking (5-15 seconds)
- **Database Queries**: Indexed for full-text search and user filtering
- **PWA Load Time**: <2 seconds on 3G networks (with caching)

## Test Coverage

**Integration Tests** (`tests/thought-capture.test.js`):
- ✅ 17/17 tests passing
- ✅ Text capture CRUD operations
- ✅ Voice recording upload
- ✅ Template management
- ✅ Statistics endpoints
- ✅ Offline queue management
- ✅ Authorization and user isolation
- ✅ AI graceful fallback

**Test Strategy:**
- Self-contained (auto-creates test users)
- Uses authenticated user IDs (no hardcoded values)
- Tests both AI-enabled and AI-disabled modes
- Validates foreign key constraints

---

## Quick Start Guide

### For Users
1. Navigate to `/mobile-capture.html` on your mobile device
2. Log in with your credentials
3. Tap microphone to record voice or type text
4. Select project (optional)
5. Submit to capture thought
6. View recent thoughts below

### For Developers
1. Apply database migration 036
2. Set `DEEPGRAM_API_KEY` for voice support
3. (Optional) Set AI provider keys for entity detection
4. Start server: `npm start`
5. Access mobile interface at `/mobile-capture.html`
6. Run tests: `npm test tests/thought-capture.test.js`

---

## API Examples

### Text Capture
```bash
curl -X POST https://your-domain.com/api/quick-capture/text \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Need to review the authentication flow",
    "projectId": 123,
    "deviceInfo": {
      "userAgent": "Mozilla/5.0...",
      "platform": "iPhone"
    }
  }'
```

### Voice Capture
```bash
curl -X POST https://your-domain.com/api/quick-capture/voice \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "audio=@recording.webm" \
  -F "projectId=123"
```

### List Thoughts
```bash
curl -X GET "https://your-domain.com/api/quick-capture?projectId=123&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Offline Sync
```bash
curl -X POST https://your-domain.com/api/quick-capture/offline/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Troubleshooting

### Voice Recording Not Working
- **Issue**: MediaRecorder API not available
- **Solution**: Ensure HTTPS is enabled (required by browser security)

### Transcription Failures
- **Issue**: Deepgram API errors
- **Solution**: Verify `DEEPGRAM_API_KEY` is set correctly

### Offline Sync Not Triggering
- **Issue**: Service Worker not registered
- **Solution**: Check browser console for Service Worker errors, ensure HTTPS

### AI Analysis Not Running
- **Issue**: Missing AI provider credentials
- **Solution**: System works without AI (graceful fallback), set API keys if AI needed

### Queue Items Stuck in Processing
- **Issue**: Network failures or server errors
- **Solution**: Items auto-retry up to 5 times with exponential backoff

---

**System Status**: ✅ Production-ready with 17/17 tests passing

**Last Updated**: November 23, 2025
