const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell } = require('electron');
const path = require('path');
const Database = require('./database');
const ApiClient = require('./api-client');

let mainWindow = null;
let tray = null;
let db = null;
let apiClient = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'LogRaider',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show LogRaider',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip('LogRaider');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
}

function loadDashboard() {
  mainWindow.loadFile(path.join(__dirname, 'dashboard.html'));
}

// --- IPC Handlers ---

ipcMain.handle('get-settings', async () => {
  if (!db) return { apiUrl: '', theme: 'light' };
  try {
    const settings = db.prepare('SELECT * FROM settings').all();
    const result = {};
    for (const row of settings) {
      result[row.key] = row.value;
    }
    return result;
  } catch (err) {
    return { apiUrl: '', theme: 'light' };
  }
});

ipcMain.handle('save-settings', async (_event, settings) => {
  if (!db) throw new Error('Database not initialized');
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)'
  );
  for (const [key, value] of Object.entries(settings)) {
    upsert.run({ key, value: JSON.stringify(value) });
  }
  return true;
});

ipcMain.handle('login', async (_event, credentials) => {
  if (!apiClient) throw new Error('API client not initialized');
  return await apiClient.login(credentials.username, credentials.password);
});

ipcMain.handle('logout', async () => {
  if (mainWindow) {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }
  return true;
});

ipcMain.handle('verify-session', async () => {
  if (!apiClient || !apiClient.token) return { authenticated: false };
  return await apiClient.verifyToken();
});

ipcMain.handle('get-logs', async (_event, filters = {}) => {
  if (!db) throw new Error('Database not initialized');
  try {
    let query = 'SELECT * FROM logs';
    const conditions = [];
    const params = {};

    if (filters.level) {
      conditions.push('level = @level');
      params.level = filters.level;
    }
    if (filters.source) {
      conditions.push('source = @source');
      params.source = filters.source;
    }
    if (filters.startDate) {
      conditions.push('timestamp >= @startDate');
      params.startDate = filters.startDate;
    }
    if (filters.endDate) {
      conditions.push('timestamp <= @endDate');
      params.endDate = filters.endDate;
    }
    if (filters.search) {
      conditions.push('(message LIKE @search OR source LIKE @search)');
      params.search = `%${filters.search}%`;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT 1000';

    return db.prepare(query).all(params);
  } catch (err) {
    throw new Error(`Failed to fetch logs: ${err.message}`);
  }
});

ipcMain.handle('add-log', async (_event, logEntry) => {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(
    'INSERT INTO logs (level, source, message, timestamp, metadata) VALUES (@level, @source, @message, @timestamp, @metadata)'
  );
  const result = stmt.run({
    level: logEntry.level || 'info',
    source: logEntry.source || 'local',
    message: logEntry.message || '',
    timestamp: logEntry.timestamp || new Date().toISOString(),
    metadata: logEntry.metadata ? JSON.stringify(logEntry.metadata) : null,
  });
  return result.lastInsertRowid;
});

ipcMain.handle('delete-log', async (_event, id) => {
  if (!db) throw new Error('Database not initialized');
  db.prepare('DELETE FROM logs WHERE id = @id').run({ id });
  return true;
});

ipcMain.handle('clear-logs', async () => {
  if (!db) throw new Error('Database not initialized');
  db.prepare('DELETE FROM logs').run();
  return true;
});

ipcMain.handle('get-stats', async () => {
  if (!db) return { total: 0, byLevel: {} };
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM logs').get();
    const byLevel = db.prepare('SELECT level, COUNT(*) as count FROM logs GROUP BY level').all();
    const levelMap = {};
    for (const row of byLevel) {
      levelMap[row.level] = row.count;
    }
    return { total: total.count, byLevel: levelMap };
  } catch (err) {
    return { total: 0, byLevel: {} };
  }
});

ipcMain.handle('export-logs', async (_event, format = 'csv') => {
  if (!db) throw new Error('Database not initialized');
  const logs = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC').all();

  if (format === 'csv') {
    const headers = ['id', 'level', 'source', 'message', 'timestamp'];
    const rows = logs.map((log) => headers.map((h) => `"${String(log[h] ?? '').replace(/"/g, '""')}"`));
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  return JSON.stringify(logs, null, 2);
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
});

// --- App Lifecycle ---

app.whenReady().then(async () => {
  const dbPath = app.getPath('userData');
  db = new Database(path.join(dbPath, 'lograider.db'));
  apiClient = new ApiClient();

  // Check for saved API URL
  const settings = await ipcMain.handlers['get-settings']();
  if (settings.apiUrl) {
    apiClient.setBaseUrl(settings.apiUrl);
  }

  // Check if user is already logged in
  const token = db.prepare("SELECT value FROM settings WHERE key = 'authToken'").get();
  if (token) {
    apiClient.setToken(token.value);
    const verified = await apiClient.verifyToken();
    if (!verified.authenticated) {
      db.prepare("DELETE FROM settings WHERE key = 'authToken'").run();
      apiClient.clearToken();
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});
