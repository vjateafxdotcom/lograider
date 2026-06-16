class AdminAPI {
  constructor() {
    this.baseUrl = window.location.origin;
    this.token = localStorage.getItem('adminToken');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('adminToken', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('adminToken');
  }

  hasToken() {
    return !!this.token;
  }

  async request(method, path, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  async login(username, password) {
    return this.request('POST', '/api/admin/login', { username, password });
  }

  async logout() {
    this.clearToken();
  }

  async getUsers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request('GET', `/api/admin/users?${query}`);
  }

  async activateUser(userId) {
    return this.request('POST', `/api/admin/users/${userId}/activate`);
  }

  async disableUser(userId) {
    return this.request('POST', `/api/admin/users/${userId}/disable`);
  }

  async getTeams() {
    return this.request('GET', '/api/admin/teams');
  }

  async getTeamDetail(teamId) {
    return this.request('GET', `/api/admin/teams/${teamId}`);
  }
}

window.adminAPI = new AdminAPI();
