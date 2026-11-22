
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.env.DB_PATH || path.join(__dirname, "dualrep.db");

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

// Existing push-up records — preserve existing schema and data.
db.exec(`
  CREATE TABLE IF NOT EXISTS pushup_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL CHECK(user IN ('Damian', 'Icefox')),
    type TEXT NOT NULL DEFAULT 'Regular'
      CHECK(type IN ('Regular', 'Diamond', 'Wide', 'Clap')),
    reps INTEGER NOT NULL CHECK(reps > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate existing databases that were created before push-up types existed.
const columns = db.prepare("PRAGMA table_info(pushup_sets)").all();
const hasTypeColumn = columns.some((column) => column.name === "type");

if (!hasTypeColumn) {
  db.exec(`
    ALTER TABLE pushup_sets
    ADD COLUMN type TEXT NOT NULL DEFAULT 'Regular';
  `);

  console.log("Database migrated: added push-up type column.");
}

// User accounts. Only Damian and Icefox are permitted.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE
      CHECK(username IN ('Damian', 'Icefox')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Persistent login sessions.
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions(user_id);
`);

module.exports = db;


// Per-user Discord notification preferences.
db.exec(`
  CREATE TABLE IF NOT EXISTS notification_settings (
    user TEXT PRIMARY KEY CHECK(user IN ('Damian', 'Icefox')),
    reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK(reminder_enabled IN (0, 1)),
    reminder_time TEXT NOT NULL DEFAULT '11:00',
    reminder_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
    partner_set_enabled INTEGER NOT NULL DEFAULT 1 CHECK(partner_set_enabled IN (0, 1)),
    test_dm_sent INTEGER NOT NULL DEFAULT 0 CHECK(test_dm_sent IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS discord_reminders (
    user TEXT NOT NULL CHECK(user IN ('Damian', 'Icefox')),
    reminder_date TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user, reminder_date)
  );

  INSERT OR IGNORE INTO notification_settings (user) VALUES ('Damian');
  INSERT OR IGNORE INTO notification_settings (user) VALUES ('Icefox');
`);
