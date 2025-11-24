let currentSettings = null;
let currentProjectId = null;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentProjectId = urlParams.get('projectId');

  initializeEventListeners();
  loadSettings();
});

function initializeEventListeners() {
  document.getElementById('back-btn').addEventListener('click', () => {
    window.history.back();
  });

  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', handleModeChange);
  });

  const sensitivitySlider = document.getElementById('sensitivity');
  sensitivitySlider.addEventListener('input', (e) => {
    document.getElementById('sensitivity-value').textContent = parseFloat(e.target.value).toFixed(2);
  });

  document.getElementById('add-wake-word').addEventListener('click', addWakeWord);
  
  document.getElementById('new-wake-word').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWakeWord();
    }
  });

  document.getElementById('save-settings').addEventListener('click', saveSettings);
}

function handleModeChange(e) {
  const mode = e.target.value;

  document.getElementById('wake-word-settings').classList.toggle('hidden', mode !== 'wake_word');
  document.getElementById('always-listening-settings').classList.toggle('hidden', mode !== 'always_listening');
  document.getElementById('scheduled-settings').classList.toggle('hidden', mode !== 'scheduled');
}

async function loadSettings() {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('Please log in first', 'error');
      setTimeout(() => window.location.href = '/login.html', 2000);
      return;
    }

    let url = '/api/hallway-meetings/settings/wake-word';
    if (currentProjectId) {
      url += `?projectId=${currentProjectId}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        showToast('Session expired. Please log in again.', 'error');
        setTimeout(() => window.location.href = '/login.html', 2000);
        return;
      }
      throw new Error('Failed to load settings');
    }

    currentSettings = await response.json();
    populateForm(currentSettings);
  } catch (error) {
    console.error('Load settings error:', error);
    showToast('Failed to load settings. Using defaults.', 'error');
  }
}

function populateForm(settings) {
  const mode = settings.activationMode || 'manual';
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  handleModeChange({ target: { value: mode } });

  if (settings.sensitivity !== undefined) {
    document.getElementById('sensitivity').value = settings.sensitivity;
    document.getElementById('sensitivity-value').textContent = settings.sensitivity.toFixed(2);
  }

  if (settings.detectionMethod) {
    document.getElementById('detection-method').value = settings.detectionMethod;
  }

  if (settings.wakeWords && settings.wakeWords.length > 0) {
    const wakeWordsList = document.getElementById('wake-words-list');
    wakeWordsList.innerHTML = '';
    settings.wakeWords.forEach(word => {
      addWakeWordTag(word);
    });
  }

  if (settings.autoStartRecording !== undefined) {
    document.getElementById('auto-start-recording').checked = settings.autoStartRecording;
  }

  if (settings.scheduledTimes) {
    if (settings.scheduledTimes.activeDays) {
      settings.scheduledTimes.activeDays.forEach(day => {
        const checkbox = document.querySelector(`input[name="days"][value="${day}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }

    if (settings.scheduledTimes.startTime) {
      document.getElementById('start-time').value = settings.scheduledTimes.startTime;
    }

    if (settings.scheduledTimes.endTime) {
      document.getElementById('end-time').value = settings.scheduledTimes.endTime;
    }
  }

  if (settings.allowedLocations) {
    document.getElementById('show-indicator').checked = settings.allowedLocations.showIndicator !== false;
    
    if (settings.allowedLocations.maxDuration) {
      document.getElementById('max-duration').value = settings.allowedLocations.maxDuration;
    }
    
    if (settings.allowedLocations.batteryThreshold) {
      document.getElementById('battery-threshold').value = settings.allowedLocations.batteryThreshold;
    }

    if (settings.allowedLocations.wifiOnly !== undefined) {
      document.getElementById('wifi-only').checked = settings.allowedLocations.wifiOnly;
    }
  }
}

function addWakeWord() {
  const input = document.getElementById('new-wake-word');
  const word = input.value.trim();

  if (!word) {
    showToast('Please enter a wake-word', 'error');
    return;
  }

  if (word.length < 3) {
    showToast('Wake-word must be at least 3 characters', 'error');
    return;
  }

  const existingWords = Array.from(document.querySelectorAll('.wake-word-tag'))
    .map(tag => tag.textContent.replace('×', '').trim());

  if (existingWords.includes(word)) {
    showToast('This wake-word already exists', 'error');
    return;
  }

  addWakeWordTag(word);
  input.value = '';
}

function addWakeWordTag(word) {
  const wakeWordsList = document.getElementById('wake-words-list');
  
  const tag = document.createElement('div');
  tag.className = 'wake-word-tag';
  tag.innerHTML = `
    ${word}
    <button type="button" onclick="removeWakeWord(this)">×</button>
  `;
  
  wakeWordsList.appendChild(tag);
}

function removeWakeWord(button) {
  button.parentElement.remove();
}

async function saveSettings() {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('Please log in first', 'error');
      return;
    }

    const mode = document.querySelector('input[name="mode"]:checked').value;

    const wakeWords = Array.from(document.querySelectorAll('.wake-word-tag'))
      .map(tag => tag.textContent.replace('×', '').trim());

    const activeDays = Array.from(document.querySelectorAll('input[name="days"]:checked'))
      .map(checkbox => checkbox.value);

    const settings = {
      projectId: currentProjectId ? parseInt(currentProjectId) : null,
      activationMode: mode,
      sensitivity: parseFloat(document.getElementById('sensitivity').value),
      detectionMethod: document.getElementById('detection-method').value,
      wakeWords: wakeWords.length > 0 ? wakeWords : null,
      autoStartRecording: document.getElementById('auto-start-recording').checked,
      scheduledTimes: mode === 'scheduled' ? {
        activeDays,
        startTime: document.getElementById('start-time').value,
        endTime: document.getElementById('end-time').value
      } : null,
      allowedLocations: {
        showIndicator: document.getElementById('show-indicator').checked,
        maxDuration: parseInt(document.getElementById('max-duration').value),
        batteryThreshold: parseInt(document.getElementById('battery-threshold').value),
        wifiOnly: document.getElementById('wifi-only').checked,
        silenceDuration: mode === 'always_listening' ? parseInt(document.getElementById('silence-duration').value) : null,
        requireMotion: mode === 'always_listening' ? document.getElementById('require-motion').checked : null
      }
    };

    if (mode === 'wake_word' && (!wakeWords || wakeWords.length === 0)) {
      showToast('Please add at least one wake-word', 'error');
      return;
    }

    if (mode === 'scheduled' && activeDays.length === 0) {
      showToast('Please select at least one active day', 'error');
      return;
    }

    const saveButton = document.getElementById('save-settings');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    const response = await fetch('/api/hallway-meetings/settings/wake-word', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save settings');
    }

    const result = await response.json();
    currentSettings = result.settings;

    showToast('Settings saved successfully!', 'success');

    setTimeout(() => {
      window.history.back();
    }, 1500);
  } catch (error) {
    console.error('Save settings error:', error);
    showToast(error.message || 'Failed to save settings', 'error');
  } finally {
    const saveButton = document.getElementById('save-settings');
    saveButton.disabled = false;
    saveButton.textContent = 'Save Settings';
  }
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
