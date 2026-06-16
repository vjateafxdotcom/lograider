// --- Login Page ---

const loginForm = document.getElementById('login-form');
const apiUrlInput = document.getElementById('apiUrl');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');
const loadingEl = document.getElementById('loading');
const loginBtn = document.getElementById('login-btn');

// Load saved API URL
window.lograider.getSettings().then((settings) => {
  if (settings.apiUrl) {
    apiUrlInput.value = settings.apiUrl;
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const apiUrl = apiUrlInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!apiUrl || !username || !password) {
    errorMessage.textContent = 'Please fill in all fields.';
    return;
  }

  // Save API URL
  await window.lograider.saveSettings({ apiUrl });

  // Show loading
  loadingEl.style.display = 'flex';
  loginBtn.disabled = true;
  errorMessage.textContent = '';

  try {
    const apiClient = window.lograider;
    const result = await apiClient.login({ username, password });

    if (result && result.token) {
      // Store auth token in settings
      await apiClient.saveSettings({ authToken: result.token });
      // Navigate to dashboard
      window.location.href = 'dashboard.html';
    } else {
      errorMessage.textContent = result.message || 'Login failed. Check your credentials.';
    }
  } catch (err) {
    errorMessage.textContent = `Connection error: ${err.message}`;
  } finally {
    loadingEl.style.display = 'none';
    loginBtn.disabled = false;
  }
});


// --- Dashboard Page ---

document.addEventListener('DOMContentLoaded', () => {
  // Check authentication
  window.lograider.verifySession().then((result) => {
    if (!result.authenticated) {
      window.location.href = 'index.html';
    } else {
      const user = result.user || {};
      document.getElementById('current-user').textContent = user.username || user.name || 'User';
      document.querySelector('.user-avatar').textContent = (user.username || user.name || 'U')[0].toUpperCase();
    }
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');

      if (btn.dataset.view === 'dashboard') loadDashboard();
      if (btn.dataset.view === 'logs') loadLogs();
      if (btn.dataset.view === 'settings') loadSettings();
    });
  });

  // Load initial data
  loadDashboard();
  loadSettings();

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await window.lograider.logout();
    window.location.href = 'index.html';
  });

  // Add log modal
  document.getElementById('add-log-btn').addEventListener('click', () => {
    document.getElementById('add-log-modal').classList.add('active');
  });

  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-log-btn').addEventListener('click', closeModal);

  document.getElementById('add-log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await addLogEntry();
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', () => exportLogs('json'));
  document.getElementById('export-logs-btn').addEventListener('click', () => exportLogs('json'));

  // Clear logs
  document.getElementById('clear-logs-btn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all logs?')) {
      await window.lograider.clearLogs();
      showToast('All logs cleared', 'success');
      loadLogs();
      loadDashboard();
    }
  });

  // Settings
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

  document.getElementById('reset-app-btn').addEventListener('click', async () => {
    if (confirm('This will delete all local data. Are you sure?')) {
      localStorage.clear();
      await window.lograider.logout();
      window.location.href = 'index.html';
    }
  });

  // Search and filters
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadLogs(), 300);
  });

  document.getElementById('filter-level').addEventListener('change', loadLogs);
  document.getElementById('filter-source').addEventListener('change', loadLogs);
});

async function loadDashboard() {
  const stats = await window.lograider.getStats();
  document.getElementById('stat-total').textContent = stats.total || 0;
  document.getElementById('stat-error').textContent = stats.byLevel?.error || 0;
  document.getElementById('stat-warn').textContent = stats.byLevel?.warn || 0;
  document.getElementById('stat-info').textContent = stats.byLevel?.info || 0;

  const logs = await window.lograider.getLogs({});
  const recentList = document.getElementById('recent-logs-list');
  recentList.innerHTML = logs.slice(0, 10).map((log) => renderLogItem(log)).join('');
}

async function loadLogs() {
  const filters = {
    level: document.getElementById('filter-level').value,
    source: document.getElementById('filter-source').value,
    search: document.getElementById('search-input').value,
  };

  const logs = await window.lograider.getLogs(filters);

  // Update source filter options
  const allLogs = await window.lograider.getLogs({});
  const sources = [...new Set(allLogs.map((l) => l.source).filter(Boolean))];
  const sourceSelect = document.getElementById('filter-source');
  const currentSource = sourceSelect.value;
  sourceSelect.innerHTML = '<option value="">All Sources</option>' +
    sources.map((s) => `<option value="${s}" ${s === currentSource ? 'selected' : ''}>${s}</option>`).join('');

  document.getElementById('logs-container').innerHTML = logs.length > 0
    ? logs.map((log) => renderLogItem(log)).join('')
    : '<p class="empty-state">No logs found.</p>';
}

function renderLogItem(log) {
  const levelColors = {
    error: '#ef4444',
    warn: '#f59e0b',
    info: '#3b82f6',
    debug: '#8b5cf6',
  };
  const color = levelColors[log.level] || '#6b7280';

  const time = new Date(log.timestamp).toLocaleString();

  return `
    <div class="log-item" data-id="${log.id}">
      <div class="log-level" style="background: ${color}">${log.level.toUpperCase()}</div>
      <div class="log-content">
        <div class="log-meta">
          <span class="log-source">${log.source || 'local'}</span>
          <span class="log-time">${time}</span>
        </div>
        <div class="log-message">${escapeHtml(log.message)}</div>
      </div>
      <button class="log-delete" title="Delete">&times;</button>
    </div>
  `;
}

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('log-delete')) {
    const id = e.target.closest('.log-item').dataset.id;
    await window.lograider.deleteLog(id);
    showToast('Log deleted', 'success');
    loadLogs();
    loadDashboard();
  }
});

async function addLogEntry() {
  const entry = {
    level: document.getElementById('log-level').value,
    source: document.getElementById('log-source').value || 'manual',
    message: document.getElementById('log-message').value,
  };

  await window.lograider.addLog(entry);
  showToast('Log added successfully', 'success');
  closeModal();
  loadLogs();
  loadDashboard();
}

function closeModal() {
  document.getElementById('add-log-modal').classList.remove('active');
  document.getElementById('add-log-form').reset();
}

async function loadSettings() {
  const settings = await window.lograider.getSettings();
  document.getElementById('settings-api-url').value = settings.apiUrl || '';
}

async function saveSettings() {
  const apiUrl = document.getElementById('settings-api-url').value.trim();
  await window.lograider.saveSettings({ apiUrl });
  showToast('Settings saved', 'success');
}

function exportLogs(format) {
  window.lograider.exportLogs(format).then((data) => {
    const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lograider-export-${new Date().toISOString().split('T')[0]}.${format === 'csv' ? 'csv' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export complete', 'success');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
