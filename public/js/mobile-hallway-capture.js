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

const WEBSOCKET_RECONNECT_DELAY = 3000;
const CHUNK_DURATION = 5000;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  projectId = urlParams.get('projectId');
  meetingId = urlParams.get('meetingId');

  if (meetingId) {
    loadExistingMeeting();
  }

  initializeEventListeners();
  checkWakeWordActivation();
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
  if (wakeWordActivated === 'true') {
    sessionStorage.removeItem('wakeWordActivated');
    
    showToast('Wake-word detected! Starting meeting...', 'success');
    
    setTimeout(() => {
      toggleRecording();
    }, 1000);
  }
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

    audioStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000
      } 
    });

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
      if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        event.data.arrayBuffer().then(buffer => {
          ws.send(buffer);
        });
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

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/hallway-transcription/${meetingId}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'transcript') {
        handleTranscriptChunk(data);
      } else if (data.type === 'entity') {
        handleEntityDetection(data);
      } else if (data.type === 'error') {
        console.error('WebSocket error:', data.message);
        showToast(data.message, 'error');
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    showToast('Connection error. Retrying...', 'error');
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    
    if (isRecording) {
      setTimeout(() => {
        console.log('Reconnecting WebSocket...');
        connectWebSocket();
      }, WEBSOCKET_RECONNECT_DELAY);
    }
  };
}

function handleTranscriptChunk(data) {
  const chunk = {
    speaker: data.speaker || 'Unknown',
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

function handleEntityDetection(data) {
  const entitiesSection = document.getElementById('entities-section');
  const entitiesList = document.getElementById('entities-list');

  entitiesSection.classList.remove('hidden');

  const entityHtml = `
    <div class="entity-item">
      <div class="entity-type">${data.entityType}</div>
      <div class="entity-text">${data.text}</div>
      <div class="entity-confidence">Confidence: ${(data.confidence * 100).toFixed(0)}%</div>
    </div>
  `;

  entitiesList.insertAdjacentHTML('afterbegin', entityHtml);
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
      </div>
      <div class="participant-actions">
        <button class="btn-icon" onclick="removeParticipant(${index})" title="Remove">
          ×
        </button>
      </div>
    </div>
  `).join('');
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
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  document.getElementById('timer').textContent = 
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}
