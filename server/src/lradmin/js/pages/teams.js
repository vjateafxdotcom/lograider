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
          <button class="btn btn-secondary btn-sm" onclick="viewTeam('${team.id}')">View Details</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('teams-tbody').innerHTML = `<tr><td colspan="6" class="empty-state">Error: ${err.message}</td></tr>`;
  }
}

window.viewTeam = async function(teamId) {
  localStorage.setItem('viewTeamId', teamId);
  renderTeamDetail();
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
};

async function renderTeamDetail() {
  const teamId = localStorage.getItem('viewTeamId');
  if (!teamId) {
    renderTeams();
    return;
  }

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
