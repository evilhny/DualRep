const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "dualrep.db");

const db = new Database(dbPath);

// Create the table automatically when the server starts.
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

module.exports = db;