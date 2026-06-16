async function renderDashboard() {
  try {
    const [usersRes, teamsRes] = await Promise.all([
      adminAPI.getUsers(),
      adminAPI.getTeams()
    ]);

    const totalUsers = usersRes.total || 0;
    const pendingUsers = usersRes.users?.filter(u => u.status === 'pending').length || 0;
    const totalTeams = teamsRes.teams?.length || 0;
    const totalLogs = teamsRes.teams?.reduce((sum, t) => sum + (t.log_count || 0), 0) || 0;

    renderLayout(`
      <div class="page-header">
        <h2>Dashboard</h2>
      </div>
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
    `);

    document.querySelector('[data-page="dashboard"]').classList.add('active');
  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}
