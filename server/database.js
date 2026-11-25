
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "dualrep",
  user: process.env.PGUSER || "dualrep_appuser",
  password: process.env.PGPASSWORD,

  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("[PostgreSQL] Unexpected idle client error:", error.message);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = {
  query,
  pool,
};
