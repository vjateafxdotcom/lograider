const https = require('https');
const http = require('http');
const { URL } = require('url');

class ApiClient {
  constructor() {
    this.baseUrl = '';
    this.token = null;
    this.userAgent = 'LogRaider/0.1.0';
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  _getTransport() {
    return this.baseUrl.startsWith('https') ? https : http;
  }

  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      if (!this.baseUrl) {
        return reject(new Error('API URL not configured'));
      }

      const url = new URL(path, this.baseUrl);
      const transport = this._getTransport();

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
        },
        timeout: 30000,
      };

      if (this.token) {
        options.headers['Authorization'] = `Bearer ${this.token}`;
      }

      const req = transport.request(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error(`Invalid response: ${data.substring(0, 100)}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  async login(username, password) {
    const result = await this._request('POST', '/api/auth/login', {
      username,
      password,
    });

    if (result.token) {
      this.token = result.token;
    }

    return result;
  }

  async verifyToken() {
    try {
      const result = await this._request('GET', '/api/auth/verify');
      return { authenticated: true, user: result.user };
    } catch (err) {
      return { authenticated: false, error: err.message };
    }
  }

  async getRemoteLogs(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this._request('GET', `/api/logs?${query}`);
  }

  async syncLogs(localLogs) {
    return this._request('POST', '/api/logs/sync', { logs: localLogs });
  }

  async getServerConfig() {
    return this._request('GET', '/api/config');
  }
}

module.exports = ApiClient;
