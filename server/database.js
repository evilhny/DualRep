
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.env.DB_PATH || path.join(__dirname, "dualrep.db");

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

// Push-up records.
// Finger is included in the supported push-up types.
db.exec(`
  CREATE TABLE IF NOT EXISTS pushup_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL CHECK(user IN ('Damian', 'Icefox')),
    type TEXT NOT NULL DEFAULT 'Regular'
      CHECK(type IN ('Regular', 'Diamond', 'Wide', 'Clap', 'Finger')),
    reps INTEGER NOT NULL CHECK(reps > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate databases created before push-up types existed.
let columns = db.prepare("PRAGMA table_info(pushup_sets)").all();
let hasTypeColumn = columns.some((column) => column.name === "type");

if (!hasTypeColumn) {
  db.exec(`
    ALTER TABLE pushup_sets
    ADD COLUMN type TEXT NOT NULL DEFAULT 'Regular';
  `);

  console.log("Database migrated: added push-up type column.");
}

// Migrate the old push-up type constraint to include Finger.
// Existing records, IDs and timestamps are preserved.
const pushupTable = db.prepare(`
  SELECT sql FROM sqlite_master
  WHERE type = 'table' AND name = 'pushup_sets'
`).get();

if (pushupTable && !pushupTable.sql.includes("'Finger'")) {
  const migratePushupTypes = db.transaction(() => {
    db.exec(`
      CREATE TABLE pushup_sets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL CHECK(user IN ('Damian', 'Icefox')),
        type TEXT NOT NULL DEFAULT 'Regular'
          CHECK(type IN ('Regular', 'Diamond', 'Wide', 'Clap', 'Finger')),
        reps INTEGER NOT NULL CHECK(reps > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO pushup_sets_new (id, user, type, reps, created_at)
      SELECT id, user, type, reps, created_at
      FROM pushup_sets;

      DROP TABLE pushup_sets;

      ALTER TABLE pushup_sets_new RENAME TO pushup_sets;
    `);
  });

  migratePushupTypes();

  console.log("Database migrated: Finger push-up type enabled.");
}

// Rest days.
// Each user can mark one rest day per calendar date.
db.exec(`
  CREATE TABLE IF NOT EXISTS rest_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL CHECK(user IN ('Damian', 'Icefox')),
    rest_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user, rest_date)
  );

  CREATE INDEX IF NOT EXISTS idx_rest_days_user_date
  ON rest_days(user, rest_date);
`);

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

module.exports = db;
