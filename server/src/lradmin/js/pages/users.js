let currentPage = 1;
let searchQuery = '';
let statusFilter = '';

async function renderUsers() {
  renderLayout(`
    <div class="page-header">
      <h2>Users</h2>
    </div>
    <div class="search-bar">
      <input type="text" class="search-input" id="search-input" placeholder="Search by username or email..." value="${searchQuery}">
      <select id="status-filter">
        <option value="">All Status</option>
        <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="activated" ${statusFilter === 'activated' ? 'selected' : ''}>Activated</option>
        <option value="disabled" ${statusFilter === 'disabled' ? 'selected' : ''}>Disabled</option>
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

  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    loadUsers();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    statusFilter = e.target.value;
    loadUsers();
  });

  document.querySelector('[data-page="users"]').classList.add('active');
  await loadUsers();
}

async function loadUsers() {
  try {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';

    const params = { page: currentPage, limit: 50 };
    if (searchQuery) params.search = searchQuery;
    if (statusFilter) params.status = statusFilter;

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
            ${user.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="activateUser('${user.id}')">Activate</button>` : ''}
            ${user.status !== 'disabled' ? `<button class="btn btn-danger btn-sm" onclick="disableUser('${user.id}')">Disable</button>` : ''}
            ${user.status === 'disabled' ? `<button class="btn btn-secondary btn-sm" onclick="activateUser('${user.id}')">Reactivate</button>` : ''}
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
