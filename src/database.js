const Database = require('better-sqlite3');
const path = require('path');

// The class is DatabaseManager, NOT Database. `const Database = require('better-sqlite3')` is
// already bound in this module scope, and a `class Database` beside it is a redeclaration —
// `SyntaxError: Identifier 'Database' has already been declared` — which means the module does not
// load at all and takes the whole Electron app down at require() time. The name is invisible to
// callers anyway: main.js does `const Database = require('./database')`, so it renames on import.
class DatabaseManager {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._initialize();
  }

  _initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL DEFAULT 'info',
        source TEXT NOT NULL DEFAULT 'local',
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
      CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
    `);
  }

  // main.js calls db.prepare(...) everywhere, and the wrapper used to expose only
  // `get connection()` — so every one of those calls was reaching for a method that did not exist.
  // This is the fix. It was written twice in the working tree; a class body silently keeps the
  // last one, so the duplicate is dead code rather than an error, and it is removed.
  prepare(sql) {
    return this.db.prepare(sql);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DatabaseManager;
