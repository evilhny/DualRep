
const crypto = require("crypto");
const db = require("./database");

const COOKIE_NAME = "dualrep_session";
const IDLE_TIMEOUT_DAYS = 30;
const ABSOLUTE_TIMEOUT_DAYS = 90;
const COOKIE_MAX_AGE = 60 * 60 * 24 * IDLE_TIMEOUT_DAYS; // 30 days

// Generate a salted scrypt password hash.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");

  return `scrypt$${salt}$${hash}`;
}

// Verify a password against its stored hash.
function verifyPassword(password, storedHash) {
  try {
    const [algorithm, salt, originalHash] = storedHash.split("$");

    if (algorithm !== "scrypt" || !salt || !originalHash) {
      return false;
    }

    const hash = crypto.scryptSync(password, salt, 64);
    const original = Buffer.from(originalHash, "hex");

    return (
      hash.length === original.length &&
      crypto.timingSafeEqual(hash, original)
    );
  } catch {
    return false;
  }
}

// Create a persistent session.
async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await db.query(
    `INSERT INTO sessions (
       token_hash,
       user_id,
       expires_at,
       absolute_expires_at
     )
     VALUES (
       $1,
       $2,
       NOW() + ($3 * INTERVAL '1 day'),
       NOW() + ($4 * INTERVAL '1 day')
     )`,
    [tokenHash, userId, IDLE_TIMEOUT_DAYS, ABSOLUTE_TIMEOUT_DAYS]
  );

  return token;
}

// Get the token from the request cookie.
function getCookieToken(req) {
  const cookies = req.headers.cookie || "";

  const cookie = cookies
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`));

  return cookie
    ? decodeURIComponent(cookie.substring(COOKIE_NAME.length + 1))
    : null;
}

// Set the session cookie.
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
  );
}

// Clear the session cookie.
function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

// Require an authenticated session.
async function requireAuth(req, res, next) {
  try {
    const token = getCookieToken(req);

    if (!token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const result = await db.query(
      `SELECT
         sessions.token_hash,
         users.id,
         users.username
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1
         AND sessions.expires_at > NOW()
         AND sessions.absolute_expires_at > NOW()`,
      [tokenHash]
    );

    const session = result.rows[0];

    if (!session) {
      // Remove this token if it exists but is no longer valid.
      await db.query(
        "DELETE FROM sessions WHERE token_hash = $1",
        [tokenHash]
      );

      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expired or invalid." });
    }

    // Extend the inactivity deadline, but never beyond the absolute lifetime.
    const refreshed = await db.query(
      `UPDATE sessions
       SET expires_at = LEAST(
         NOW() + ($2 * INTERVAL '1 day'),
         absolute_expires_at
       )
       WHERE token_hash = $1
         AND expires_at > NOW()
         AND absolute_expires_at > NOW()
       RETURNING token_hash`,
      [tokenHash, IDLE_TIMEOUT_DAYS]
    );

    if (refreshed.rowCount === 0) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expired." });
    }

    req.user = {
      id: session.id,
      username: session.username,
    };

    // Refresh the browser cookie during active use.
    // Server-side expiry remains authoritative.
    setSessionCookie(res, token);

    return next();
  } catch (error) {
    return next(error);
  }
}

// Delete sessions that have passed either expiry deadline.
async function cleanupExpiredSessions() {
  const result = await db.query(
    `DELETE FROM sessions
     WHERE expires_at <= NOW()
        OR absolute_expires_at <= NOW()`
  );

  return result.rowCount;
}

// Destroy a session on logout.
async function destroySession(req) {
  const token = getCookieToken(req);

  if (!token) return;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await db.query(
    "DELETE FROM sessions WHERE token_hash = $1",
    [tokenHash]
  );
}

module.exports = {
  COOKIE_MAX_AGE,
  IDLE_TIMEOUT_DAYS,
  ABSOLUTE_TIMEOUT_DAYS,
  hashPassword,
  verifyPassword,
  createSession,
  getCookieToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  cleanupExpiredSessions,
  destroySession,
};
