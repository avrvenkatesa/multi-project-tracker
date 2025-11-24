let meetingId = null;
let projectId = null;
let isRecording = false;
let mediaRecorder = null;
let audioStream = null;
let ws = null;
let startTime = null;
let timerInterval = null;
let participants = [];
let transcriptChunks = [];
let detectedEntities = [];
let wsReconnectAttempts = 0;
let speakerMappings = {};

const WEBSOCKET_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 3;
const CHUNK_DURATION = 250;
const STATE_SAVE_KEY = 'hallway_meeting_state';

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  projectId = urlParams.get('projectId');
  meetingId = urlParams.get('meetingId');

  resumeState();

  if (meetingId) {
    loadExistingMeeting();
  }

  initializeEventListeners();
  checkWakeWordActivation();
  
  setInterval(saveState, 5000);
});

function initializeEventListeners() {
  document.getElementById('record-btn').addEventListener('click', toggleRecording);
  document.getElementById('end-btn').addEventListener('click', endMeeting);
  document.getElementById('add-participant-btn').addEventListener('click', showAddParticipantModal);
  document.getElementById('cancel-participant').addEventListener('click', hideAddParticipantModal);
  document.getElementById('save-participant').addEventListener('click', saveParticipant);

  document.getElementById('participant-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveParticipant();
  });

  window.addEventListener('beforeunload', (e) => {
    if (isRecording) {
      e.preventDefault();
      e.returnValue = 'Recording in progress. Are you sure you want to leave?';
    }
  });
}

function toggleTranscript() {
  const section = document.querySelector('.transcript-section');
  const content = document.getElementById('transcript-content');
  
  section.classList.toggle('collapsed');
  content.classList.toggle('hidden');
}

async function checkWakeWordActivation() {
  const wakeWordActivated = sessionStorage.getItem('wakeWordActivated');
  const wakeWord = sessionStorage.getItem('wakeWord');
  const confidence = parseFloat(sessionStorage.getItem('wakeWordConfidence') || '0');

  if (wakeWordActivated === 'true') {
    sessionStorage.removeItem('wakeWordActivated');
    sessionStorage.removeItem('wakeWord');
    sessionStorage.removeItem('wakeWordConfidence');
    
    await handleWakeWordStart(wakeWord || 'wake-word', confidence);
  }
}

async function handleWakeWordStart(wakeWord, confidence) {
  showToast(`Recording started by "${wakeWord}" (${(confidence * 100).toFixed(0)}%)`, 'success');
  
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Hallway Meeting Started', {
      body: `Wake-word "${wakeWord}" detected`,
      icon: '/favicon.ico'
    });
  }

  setTimeout(async () => {
    await startRecording();
  }, 1000);
}

async function loadExistingMeeting() {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/hallway-meetings/${meetingId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to load meeting');

    const data = await response.json();
    const meeting = data.meeting;

    if (meeting.status === 'active') {
      updateStatus('recording');
      startTimer(new Date(meeting.startedAt));
      participants = meeting.participants || [];
      updateParticipantsList();
    }

    if (meeting.transcriptChunks) {
      transcriptChunks = meeting.transcriptChunks;
      renderTranscript();
    }
  } catch (error) {
    console.error('Load meeting error:', error);
    showToast('Failed to load meeting', 'error');
  }
}

async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('Please log in first', 'error');
      setTimeout(() => window.location.href = '/login.html', 2000);
      return;
    }

    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });
    } catch (permError) {
      onPermissionDenied(permError);
      return;
    }

    if (!meetingId) {
      const response = await fetch('/api/hallway-meetings/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: projectId ? parseInt(projectId) : null,
          title: `Hallway Meeting - ${new Date().toLocaleString()}`,
          activationMethod: 'manual'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start meeting');
      }

      const data = await response.json();
      meetingId = data.meeting.id;

      const newUrl = new URL(window.location);
      newUrl.searchParams.set('meetingId', meetingId);
      window.history.replaceState({}, '', newUrl);
    }

    connectWebSocket();

    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 16000
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        sendAudioChunk(event.data);
      }
    };

    mediaRecorder.start(CHUNK_DURATION);

    isRecording = true;
    updateStatus('recording');
    startTimer();

    document.getElementById('record-btn').classList.add('recording');
    document.getElementById('record-text').textContent = 'Recording...';
    document.getElementById('end-btn').classList.remove('hidden');

    showToast('Meeting started', 'success');

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Hallway Meeting', {
        body: 'Recording in progress',
        icon: '/favicon.ico'
      });
    }
  } catch (error) {
    console.error('Start recording error:', error);
    showToast(error.message || 'Failed to start recording', 'error');
    
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
    }
  }
}

async function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  isRecording = false;
  updateStatus('processing');

  document.getElementById('record-btn').classList.remove('recording');
  document.getElementById('record-text').textContent = 'Start Meeting';

  showToast('Recording paused', 'warning');
}

async function endMeeting() {
  if (!meetingId) return;

  const confirmed = confirm('End this hallway meeting? This will trigger post-meeting analysis.');
  if (!confirmed) return;

  try {
    await stopRecording();

    const token = getAuthToken();
    const response = await fetch(`/api/hallway-meetings/${meetingId}/end`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to end meeting');
    }

    updateStatus('completed');
    stopTimer();

    document.getElementById('end-btn').classList.add('hidden');

    showToast('Meeting ended! Analysis in progress...', 'success');

    setTimeout(() => {
      window.location.href = projectId 
        ? `/project-detail.html?id=${projectId}` 
        : '/dashboard.html';
    }, 2000);
  } catch (error) {
    console.error('End meeting error:', error);
    showToast(error.message || 'Failed to end meeting', 'error');
  }
}

async function sendAudioChunk(blob) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      const buffer = await blob.arrayBuffer();
      ws.send(buffer);
    } catch (error) {
      console.error('Failed to send audio chunk:', error);
    }
  } else {
    console.warn('WebSocket not connected. Audio chunk not sent.');
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/hallway-transcription/${meetingId}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    wsReconnectAttempts = 0;
    showToast('Connected to transcription service', 'success');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'transcript') {
        onTranscriptChunk(data);
      } else if (data.type === 'entity') {
        onEntityDetected(data);
      } else if (data.type === 'error') {
        console.error('WebSocket error:', data.message);
        showToast(data.message, 'error');
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };

  ws.onerror = (error) => {
    onWebSocketError(error);
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    
    if (isRecording && wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      wsReconnectAttempts++;
      showToast(`Reconnecting... (${wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'warning');
      
      setTimeout(() => {
        console.log('Reconnecting WebSocket...');
        connectWebSocket();
      }, WEBSOCKET_RECONNECT_DELAY);
    } else if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      showToast('Connection failed. Recording saved locally.', 'error');
      saveState();
    }
  };
}

function onWebSocketError(error) {
  console.error('WebSocket error:', error);
  
  if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    showToast('Connection error. Retrying...', 'error');
  } else {
    showToast('Unable to connect. Saving recording locally...', 'error');
    saveState();
  }
}

function onTranscriptChunk(data) {
  let speakerLabel = data.speaker || 'Speaker 0';
  
  if (speakerMappings[speakerLabel]) {
    speakerLabel = speakerMappings[speakerLabel];
  }

  const chunk = {
    speaker: speakerLabel,
    originalSpeaker: data.speaker,
    text: data.text,
    timestamp: data.timestamp || new Date().toISOString()
  };

  transcriptChunks.push(chunk);
  renderTranscript();

  const section = document.querySelector('.transcript-section');
  if (section.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
    document.getElementById('transcript-content').classList.remove('hidden');
  }
}

function renderTranscript() {
  const content = document.getElementById('transcript-content');
  
  if (transcriptChunks.length === 0) {
    content.innerHTML = '<div class="empty-state">Transcript will appear here when recording starts</div>';
    return;
  }

  content.innerHTML = transcriptChunks.map(chunk => `
    <div class="transcript-chunk">
      <div class="transcript-speaker">${chunk.speaker}</div>
      <div class="transcript-text">${chunk.text}</div>
    </div>
  `).join('');

  content.scrollTop = content.scrollHeight;
}

function onEntityDetected(data) {
  const entity = {
    id: data.id || Date.now(),
    type: data.entityType,
    text: data.text,
    confidence: data.confidence,
    timestamp: data.timestamp || new Date().toISOString()
  };

  detectedEntities.push(entity);

  const entitiesSection = document.getElementById('entities-section');
  const entitiesList = document.getElementById('entities-list');

  entitiesSection.classList.remove('hidden');

  const colorMap = {
    decision: '#667eea',
    risk: '#ff3b30',
    action_item: '#34c759',
    task: '#5ac8fa',
    blocker: '#ff9500'
  };

  const iconMap = {
    decision: '✓',
    risk: '⚠',
    action_item: '→',
    task: '☐',
    blocker: '⛔'
  };

  const color = colorMap[entity.type] || '#667eea';
  const icon = iconMap[entity.type] || '•';

  const entityHtml = `
    <div class="entity-item" id="entity-${entity.id}" style="border-left-color: ${color}; background: ${color}15;">
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div style="flex: 1;">
          <div class="entity-type" style="color: ${color};">${icon} ${entity.type.toUpperCase().replace('_', ' ')}</div>
          <div class="entity-text">${entity.text}</div>
          <div class="entity-confidence">Confidence: ${(entity.confidence * 100).toFixed(0)}%</div>
        </div>
        <button onclick="dismissEntity(${entity.id})" style="background: none; border: none; color: #86868b; font-size: 20px; cursor: pointer; padding: 0 8px;" title="Dismiss">×</button>
      </div>
    </div>
  `;

  entitiesList.insertAdjacentHTML('afterbegin', entityHtml);
}

async function dismissEntity(entityId) {
  if (!meetingId) return;

  try {
    const token = getAuthToken();
    const response = await fetch(`/api/hallway-meetings/${meetingId}/entities/${entityId}/dismiss`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok) {
      const entityElement = document.getElementById(`entity-${entityId}`);
      if (entityElement) {
        entityElement.style.opacity = '0';
        setTimeout(() => entityElement.remove(), 300);
      }

      detectedEntities = detectedEntities.filter(e => e.id !== entityId);
      showToast('Entity dismissed', 'success');
    }
  } catch (error) {
    console.error('Dismiss entity error:', error);
    showToast('Failed to dismiss entity', 'error');
  }
}

function showAddParticipantModal() {
  document.getElementById('add-participant-modal').classList.remove('hidden');
  document.getElementById('participant-name').focus();
}

function hideAddParticipantModal() {
  document.getElementById('add-participant-modal').classList.add('hidden');
  document.getElementById('participant-name').value = '';
  document.getElementById('participant-email').value = '';
  document.getElementById('participant-role').value = '';
}

async function saveParticipant() {
  const name = document.getElementById('participant-name').value.trim();
  const email = document.getElementById('participant-email').value.trim();
  const role = document.getElementById('participant-role').value.trim();

  if (!name) {
    showToast('Please enter participant name', 'error');
    return;
  }

  if (!meetingId) {
    showToast('Please start the meeting first', 'error');
    return;
  }

  try {
    const token = getAuthToken();
    const response = await fetch(`/api/hallway-meetings/${meetingId}/participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name,
        email: email || null,
        role: role || null
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add participant');
    }

    const data = await response.json();
    participants.push(data.participant);
    updateParticipantsList();

    hideAddParticipantModal();
    showToast('Participant added', 'success');
  } catch (error) {
    console.error('Add participant error:', error);
    showToast(error.message || 'Failed to add participant', 'error');
  }
}

function updateParticipantsList() {
  const list = document.getElementById('participants-list');
  const count = document.getElementById('participant-count');

  count.textContent = participants.length;

  if (participants.length === 0) {
    list.innerHTML = '<div class="empty-state">No participants added yet</div>';
    return;
  }

  list.innerHTML = participants.map((p, index) => `
    <div class="participant-item">
      <div class="participant-info">
        <div class="participant-name">${p.name}</div>
        ${p.role ? `<div class="participant-role">${p.role}</div>` : ''}
        ${p.mappedSpeaker ? `<div class="participant-role" style="color: #667eea;">🎤 ${p.mappedSpeaker}</div>` : ''}
      </div>
      <div class="participant-actions">
        ${!p.mappedSpeaker ? `<button class="btn-icon" onclick="showSpeakerMapModal(${p.id}, '${p.name}')" title="Map Speaker">🎤</button>` : ''}
        <button class="btn-icon" onclick="removeParticipant(${index})" title="Remove">×</button>
      </div>
    </div>
  `).join('');
}

function showSpeakerMapModal(participantId, participantName) {
  const uniqueSpeakers = [...new Set(transcriptChunks.map(c => c.originalSpeaker || c.speaker))];
  
  if (uniqueSpeakers.length === 0) {
    showToast('No speakers detected yet', 'warning');
    return;
  }

  const speakerOptions = uniqueSpeakers.map(speaker => 
    `<option value="${speaker}">${speaker}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Map Speaker to ${participantName}</h2>
      <select id="speaker-select" style="width: 100%; padding: 12px; margin: 12px 0; border: 2px solid #e5e5ea; border-radius: 8px; font-size: 15px;">
        ${speakerOptions}
      </select>
      <div class="modal-actions">
        <button class="secondary-btn" onclick="this.closest('.modal').remove()">Cancel</button>
        <button class="primary-btn" onclick="mapSpeakerToParticipant(${participantId}, document.getElementById('speaker-select').value); this.closest('.modal').remove()">Map</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function mapSpeakerToParticipant(participantId, speakerLabel) {
  if (!meetingId) return;

  try {
    const token = getAuthToken();
    const response = await fetch(`/api/hallway-meetings/${meetingId}/participants/${participantId}/map-speaker`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ speakerLabel })
    });

    if (!response.ok) throw new Error('Failed to map speaker');

    const participant = participants.find(p => p.id === participantId);
    if (participant) {
      participant.mappedSpeaker = speakerLabel;
      speakerMappings[speakerLabel] = participant.name;
    }

    updateParticipantsList();
    renderTranscript();

    showToast('Speaker mapped successfully', 'success');
  } catch (error) {
    console.error('Map speaker error:', error);
    showToast('Failed to map speaker', 'error');
  }
}

async function removeParticipant(index) {
  const participant = participants[index];
  
  const confirmed = confirm(`Remove ${participant.name}?`);
  if (!confirmed) return;

  try {
    const token = getAuthToken();
    const response = await fetch(`/api/hallway-meetings/${meetingId}/participants/${participant.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to remove participant');

    participants.splice(index, 1);
    updateParticipantsList();
    showToast('Participant removed', 'success');
  } catch (error) {
    console.error('Remove participant error:', error);
    showToast('Failed to remove participant', 'error');
  }
}

function updateStatus(status) {
  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');

  indicator.className = `status-indicator status-${status}`;

  const statusMap = {
    idle: 'Ready',
    recording: 'Recording',
    processing: 'Processing',
    completed: 'Completed'
  };

  statusText.textContent = statusMap[status] || status;
}

function startTimer(customStartTime = null) {
  startTime = customStartTime || new Date();
  
  updateTimerDisplay();
  
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  if (!startTime) return;

  const elapsed = Math.floor((new Date() - startTime) / 1000);
  document.getElementById('timer').textContent = formatDuration(elapsed);
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getAuthToken() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  
  if (!token) {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'token') {
        return value;
      }
    }
  }
  
  return token;
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function saveState() {
  if (!meetingId) return;

  const state = {
    meetingId,
    projectId,
    isRecording,
    startTime: startTime ? startTime.toISOString() : null,
    participants,
    transcriptChunks,
    detectedEntities,
    speakerMappings,
    savedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(STATE_SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

function resumeState() {
  try {
    const savedState = localStorage.getItem(STATE_SAVE_KEY);
    if (!savedState) return;

    const state = JSON.parse(savedState);

    const savedAt = new Date(state.savedAt);
    const hoursSinceSave = (new Date() - savedAt) / (1000 * 60 * 60);

    if (hoursSinceSave > 24) {
      localStorage.removeItem(STATE_SAVE_KEY);
      return;
    }

    if (state.meetingId && !meetingId) {
      meetingId = state.meetingId;
    }

    if (state.projectId && !projectId) {
      projectId = state.projectId;
    }

    if (state.participants) {
      participants = state.participants;
      updateParticipantsList();
    }

    if (state.transcriptChunks) {
      transcriptChunks = state.transcriptChunks;
      renderTranscript();
    }

    if (state.detectedEntities) {
      detectedEntities = state.detectedEntities;
      detectedEntities.forEach(entity => {
        onEntityDetected(entity);
      });
    }

    if (state.speakerMappings) {
      speakerMappings = state.speakerMappings;
    }

    if (state.isRecording && state.startTime) {
      const resumeRecording = confirm('A meeting was in progress. Resume recording?');
      if (resumeRecording) {
        startTime = new Date(state.startTime);
        updateStatus('recording');
        startTimer(startTime);
      } else {
        localStorage.removeItem(STATE_SAVE_KEY);
      }
    }
  } catch (error) {
    console.error('Failed to resume state:', error);
    localStorage.removeItem(STATE_SAVE_KEY);
  }
}

function onPermissionDenied(error) {
  console.error('Microphone permission denied:', error);
  
  const errorMessage = error.name === 'NotAllowedError' 
    ? 'Microphone access denied. Please enable microphone permissions in your browser settings.'
    : 'Failed to access microphone. Please check your device settings.';

  showToast(errorMessage, 'error');

  const helpLink = document.createElement('div');
  helpLink.style.cssText = 'position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); max-width: 90%; z-index: 1000;';
  helpLink.innerHTML = `
    <h3 style="margin: 0 0 12px 0; font-size: 16px;">Microphone Access Required</h3>
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #86868b;">To record hallway meetings, please enable microphone access:</p>
    <ol style="margin: 0 0 16px 0; padding-left: 20px; font-size: 14px; color: #1d1d1f;">
      <li>Click the camera/microphone icon in your browser's address bar</li>
      <li>Select "Allow" for microphone access</li>
      <li>Refresh this page and try again</li>
    </ol>
    <button onclick="this.parentElement.remove()" style="background: #667eea; color: white; border: none; padding: 10px 20px; border-radius: 8px; width: 100%; cursor: pointer;">Got it</button>
  `;

  document.body.appendChild(helpLink);

  setTimeout(() => {
    if (helpLink.parentElement) {
      helpLink.remove();
    }
  }, 15000);
}

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

window.addEventListener('pagehide', () => {
  if (isRecording) {
    saveState();
  }
});
