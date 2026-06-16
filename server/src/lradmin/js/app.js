const app = document.getElementById('app');

function renderLogin() {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h1>LogRaider Admin</h1>
        <p class="subtitle">Sign in to manage your platform</p>
        <form id="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" required>
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" required>
          </div>
          <div class="error-msg" id="error"></div>
          <div class="loading" id="loading">
            <div class="spinner"></div>
            <span>Signing in...</span>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Sign In</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');
  const loadingEl = document.getElementById('loading');

  errorEl.textContent = '';
  loadingEl.style.display = 'flex';

  try {
    const data = await adminAPI.login(username, password);
    adminAPI.setToken(data.token);
    renderDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    loadingEl.style.display = 'none';
  }
}

function renderLayout(content) {
  app.innerHTML = `
    <div class="container">
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>LogRaider Admin</h1>
          <p>Management Portal</p>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-item" data-page="dashboard">Dashboard</button>
          <button class="nav-item" data-page="users">Users</button>
          <button class="nav-item" data-page="teams">Teams</button>
        </nav>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="avatar" id="admin-avatar">A</div>
            <span class="username" id="admin-name">Admin</span>
          </div>
          <button class="btn-logout" id="logout-btn">Logout</button>
        </div>
      </aside>
      <main class="main">${content}</main>
    </div>
    <div class="toast-container"></div>
  `;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPage(btn.dataset.page);
    });
  });

  document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

async function handleLogout() {
  await adminAPI.logout();
  renderLogin();
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function loadPage(page) {
  if (page === 'login') renderLogin();
  else if (page === 'dashboard') renderDashboard();
  else if (page === 'users') renderUsers();
  else if (page === 'teams') renderTeams();
  else if (page === 'team-detail') renderTeamDetail();
}

async function renderDashboard() {
  try {
    renderLayout(`
      <div class="page-header">
        <h2>Dashboard</h2>
      </div>
      <div id="dashboard-content">
        <p>Loading...</p>
      </div>
    `);
    document.querySelector('[data-page="dashboard"]').classList.add('active');

    const [usersRes, teamsRes] = await Promise.all([
      adminAPI.getUsers(),
      adminAPI.getTeams()
    ]);

    const totalUsers = usersRes.total || 0;
    const pendingUsers = usersRes.users?.filter(u => u.status === 'pending').length || 0;
    const totalTeams = teamsRes.teams?.length || 0;
    const totalLogs = teamsRes.teams?.reduce((sum, t) => sum + (t.log_count || 0), 0) || 0;

    document.getElementById('dashboard-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalUsers}</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--warning)">${pendingUsers}</div>
          <div class="stat-label">Pending Activation</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalTeams}</div>
          <div class="stat-label">Total Teams</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalLogs}</div>
          <div class="stat-label">Total Log Entries</div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

async function renderUsers() {
  renderLayout(`
    <div class="page-header">
      <h2>Users</h2>
    </div>
    <div class="search-bar">
      <input type="text" class="search-input" id="search-input" placeholder="Search by username or email...">
      <select id="status-filter">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="activated">Activated</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Status</th>
            <th>Role</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="users-tbody">
          <tr><td colspan="6" class="empty-state">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.querySelector('[data-page="users"]').classList.add('active');
  await loadUsers();

  document.getElementById('search-input').addEventListener('input', (e) => {
    loadUsers(e.target.value, document.getElementById('status-filter').value);
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    loadUsers(document.getElementById('search-input').value, e.target.value);
  });
}

async function loadUsers(search = '', status = '') {
  try {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';

    const params = { page: 1, limit: 50 };
    if (search) params.search = search;
    if (status) params.status = status;

    const data = await adminAPI.getUsers(params);
    const users = data.users || [];

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users found</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(user => `
      <tr>
        <td><strong>${user.username}</strong></td>
        <td>${user.email}</td>
        <td><span class="badge badge-${user.status}">${user.status}</span></td>
        <td>${user.role}</td>
        <td>${new Date(user.created_at).toLocaleDateString()}</td>
        <td>
          <div class="btn-group">
            ${user.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="window.activateUser('${user.id}')">Activate</button>` : ''}
            ${user.status !== 'disabled' ? `<button class="btn btn-danger btn-sm" onclick="window.disableUser('${user.id}')">Disable</button>` : ''}
            ${user.status === 'disabled' ? `<button class="btn btn-secondary btn-sm" onclick="window.activateUser('${user.id}')">Reactivate</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('users-tbody').innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${err.message}</td></tr>`;
  }
}

window.activateUser = async function(userId) {
  try {
    await adminAPI.activateUser(userId);
    showToast('User activated', 'success');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.disableUser = async function(userId) {
  try {
    await adminAPI.disableUser(userId);
    showToast('User disabled', 'success');
    await loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function renderTeams() {
  renderLayout(`
    <div class="page-header">
      <h2>Teams</h2>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Team ID</th>
            <th>Name</th>
            <th>Members</th>
            <th>Logs</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="teams-tbody">
          <tr><td colspan="6" class="empty-state">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.querySelector('[data-page="teams"]').classList.add('active');
  await loadTeams();
}

async function loadTeams() {
  try {
    const tbody = document.getElementById('teams-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';

    const data = await adminAPI.getTeams();
    const teams = data.teams || [];

    if (teams.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No teams found</td></tr>';
      return;
    }

    tbody.innerHTML = teams.map(team => `
      <tr>
        <td><strong>${team.team_id}</strong></td>
        <td>${team.name}</td>
        <td>${team.member_count}</td>
        <td>${team.log_count}</td>
        <td>${new Date(team.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.viewTeam('${team.id}')">View Details</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('teams-tbody').innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${err.message}</td></tr>`;
  }
}

window.viewTeam = async function(teamId) {
  renderTeamDetail(teamId);
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
};

async function renderTeamDetail(teamId) {
  try {
    const data = await adminAPI.getTeamDetail(teamId);
    const team = data.team;
    const members = data.members || [];
    const logs = data.logs || [];

    renderLayout(`
      <div class="page-header">
        <h2>Team: ${team.name}</h2>
        <button class="btn btn-secondary" onclick="renderTeams()">Back to Teams</button>
      </div>
      <div class="detail-grid">
        <div class="detail-card">
          <h3>Members (${members.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(m => `
                <tr>
                  <td>${m.username}</td>
                  <td><span class="badge badge-${m.role.toLowerCase()}">${m.role}</span></td>
                  <td><span class="badge badge-${m.status}">${m.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="detail-card">
          <h3>Recent Logs (${logs.length})</h3>
          ${logs.length === 0 ? '<p class="empty-state">No logs yet</p>' :
            logs.slice(0, 10).map(log => `
              <div style="padding:0.75rem 0;border-bottom:1px solid var(--border-color)">
                <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem">
                  <span class="badge badge-${log.level}" style="font-size:0.625rem">${log.level}</span>
                  <small style="color:var(--text-secondary)">${new Date(log.timestamp).toLocaleString()}</small>
                </div>
                <div style="font-size:0.875rem">${log.message.substring(0, 100)}${log.message.length > 100 ? '...' : ''}</div>
                <small style="color:var(--text-secondary)">by ${log.author || log.created_by}</small>
              </div>
            `).join('')}
        </div>
      </div>
    `);
  } catch (err) {
    showToast('Failed to load team: ' + err.message, 'error');
  }
}

// Initialize
if (!adminAPI.hasToken()) {
  renderLogin();
} else {
  adminAPI.request('GET', '/api/admin/verify')
    .then(data => {
      renderLayout('');
      loadPage('dashboard');
    })
    .catch(() => {
      adminAPI.clearToken();
      renderLogin();
    });
}
