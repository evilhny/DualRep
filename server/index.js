
require("dotenv").config();

const { Agent, setGlobalDispatcher } = require("undici");

const {
  hashPassword,
  verifyPassword,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  destroySession,
} = require("./auth");

setGlobalDispatcher(
  new Agent({
    connect: {
      family: 4,
      timeout: 20000,
    },
  })
);

const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./database");

const app = express();

app.set("trust proxy", 1);

const PORT = 3001;

// In production, the React app is built into client/dist.
const clientDistPath = path.join(__dirname, "..", "client", "dist");

app.use(cors());
app.use(express.json());

/* =========================
   TIMEZONE UTILITIES
========================= */

const TIME_ZONE = "Asia/Kolkata";

function getIndiaDateString() {
  const parts = getIndiaDateTimeParts();

  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Move a YYYY-MM-DD date by a number of calendar days.
// UTC is used here only for safe calendar arithmetic.
function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day + days)
  );

  return date.toISOString().slice(0, 10);
}

// Return the first day of a month after the supplied month.
function getNextMonthDate(year, month) {
  const date = new Date(Date.UTC(year, month, 1));

  return date.toISOString().slice(0, 10);
}

/* =========================
   DISCORD NOTIFICATIONS
========================= */

const DISCORD_USERS = {
  Icefox: process.env.DISCORD_ICEFOX_USER_ID,
  Damian: process.env.DISCORD_DAMIAN_USER_ID,
};

const DISCORD_ENABLED = Boolean(
  process.env.DISCORD_BOT_TOKEN &&
  Object.values(DISCORD_USERS).some((id) => id && id.trim())
);

let discordClient = null;
let reminderCheckRunning = false;
const testDmInFlight = new Set();
const testDmCooldowns = new Map();
const TEST_DM_COOLDOWN_MS = 30_000;

function getIndiaDateTimeParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date());

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function getIndiaWeekdayNumber(weekdayShort) {
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[weekdayShort] || 0;
}

function getNotificationSettings(user) {
  const row = db.prepare(`
    SELECT reminder_enabled, reminder_time, reminder_days,
           partner_set_enabled
    FROM notification_settings
    WHERE user = ?
  `).get(user);

  if (!row) {
    db.prepare("INSERT OR IGNORE INTO notification_settings (user) VALUES (?)").run(user);
    return getNotificationSettings(user);
  }

  return {
    reminderEnabled: Boolean(row.reminder_enabled),
    reminderTime: row.reminder_time,
    reminderDays: JSON.parse(row.reminder_days),
    partnerSetEnabled: Boolean(row.partner_set_enabled),
  };
}

const hasLoggedToday = db.prepare(`
  SELECT 1
  FROM pushup_sets
  WHERE user = ?
    AND date(created_at, '+5 hours', '+30 minutes') = ?
  LIMIT 1
`);

const hasReminderBeenSent = db.prepare(`
  SELECT 1 FROM discord_reminders WHERE user = ? AND reminder_date = ? LIMIT 1
`);

const recordReminderSent = db.prepare(`
  INSERT OR IGNORE INTO discord_reminders (user, reminder_date) VALUES (?, ?)
`);

async function sendDiscordDm(user, content) {
  const discordUserId = DISCORD_USERS[user];
  if (!discordClient?.isReady() || !discordUserId?.trim()) {
    throw new Error(`Discord is not configured for ${user}.`);
  }

  const discordUser = await discordClient.users.fetch(discordUserId);
  await discordUser.send({ content });
}

async function sendDailyReminder(user, reminderDate) {
  const settings = getNotificationSettings(user);

  if (!settings.reminderEnabled || hasReminderBeenSent.get(user, reminderDate)) return;
  if (hasLoggedToday.get(user, reminderDate)) return;

  const parts = getIndiaDateTimeParts();
  const weekday = getIndiaWeekdayNumber(parts.weekday);
  if (!settings.reminderDays.includes(weekday)) return;

  const nowMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [reminderHour, reminderMinute] = settings.reminderTime.split(":").map(Number);
  if (nowMinutes < reminderHour * 60 + reminderMinute) return;

  try {
    await sendDiscordDm(
      user,
      `Hey ${user}! You haven't logged any push-ups on DualRep today.\n\n` +
      `Get a set done and keep your streak going.`
    );

    recordReminderSent.run(user, reminderDate);
    console.log(`[Discord] Daily reminder sent to ${user} for ${reminderDate}.`);
  } catch (error) {
    console.error(`[Discord] Could not DM ${user}:`, error.message);
  }
}

async function checkDailyReminders() {
  if (!discordClient?.isReady() || reminderCheckRunning) return;

  reminderCheckRunning = true;
  try {
    const reminderDate = getIndiaDateString();
    for (const user of ["Damian", "Icefox"]) {
      await sendDailyReminder(user, reminderDate);
    }
  } catch (error) {
    console.error("[Discord] Reminder check failed:", error);
  } finally {
    reminderCheckRunning = false;
  }
}

async function notifyPartnerOfSets(user, sets) {
  const partner = user === "Icefox" ? "Damian" : "Icefox";
  const settings = getNotificationSettings(partner);
  if (!settings.partnerSetEnabled) return;

  const totalReps = sets.reduce((total, set) => total + Number(set.reps), 0);
  const setLabel = sets.length === 1 ? "a set" : `${sets.length} sets`;

  try {
    await sendDiscordDm(
      partner,
      `${user} just logged ${setLabel} on DualRep: ${totalReps} reps.\n\n` +
      `Your turn to get moving!`
    );
  } catch (error) {
    console.error(`[Discord] Could not send partner activity DM to ${partner}:`, error.message);
  }
}

function startDiscordReminders() {
  if (!DISCORD_ENABLED) {
    console.log("[Discord] Notifications disabled. Configure the bot token and user IDs in server/.env.");
    return;
  }

  const { Client, GatewayIntentBits } = require("discord.js");
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

  discordClient.once("ready", () => {
    console.log(`[Discord] Logged in as ${discordClient.user.tag}.`);
    console.log("[Discord] Per-user daily reminders enabled (IST).");
    checkDailyReminders();
    setInterval(checkDailyReminders, 60 * 1000);
  });

  discordClient.on("error", (error) => {
    console.error("[Discord] Client error:", error);
  });

  discordClient.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
    console.error("[Discord] Login failed:", error.message);
  });
}

/* =========================
   API ROUTES
========================= */

// Normalize usernames to the two permitted accounts.
function normalizeUsername(username) {
  if (typeof username !== "string") return null;

  const normalized = username.trim().toLowerCase();

  if (normalized === "damian") return "Damian";
  if (normalized === "icefox") return "Icefox";

  return null;
}

// Check whether a username already has a password configured.
app.post("/api/auth/status", (req, res) => {
  const username = normalizeUsername(req.body.username);

  if (!username) {
    return res.status(400).json({
      error: "Username must be damian or icefox.",
    });
  }

  const user = db.prepare(`
    SELECT id
    FROM users
    WHERE username = ?
  `).get(username);

  res.json({
    setupRequired: !user,
  });
});

// First-time password setup.
app.post("/api/auth/setup", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const { password } = req.body;

  if (!username) {
    return res.status(400).json({
      error: "Username must be damian or icefox.",
    });
  }

  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long.",
    });
  }

  const result = db.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash)
    VALUES (?, ?)
  `).run(username, hashPassword(password));

  if (result.changes === 0) {
    return res.status(409).json({
      error: "This username already has a password. Please log in.",
    });
  }

  const token = createSession(result.lastInsertRowid);
  setSessionCookie(res, token);

  return res.status(201).json({
    user: username,
  });
});

// Username and password login.
app.post("/api/auth/login", (req, res) => {
  const username = normalizeUsername(req.body.username);
  const { password } = req.body;

  if (!username || typeof password !== "string") {
    return res.status(400).json({
      error: "Enter a valid username and password.",
    });
  }

  const user = db.prepare(`
    SELECT id, username, password_hash
    FROM users
    WHERE username = ?
  `).get(username);

  // No password has been configured for this username yet.
  if (!user) {
    return res.status(404).json({
      setupRequired: true,
      error: "No password has been set for this username.",
    });
  }

  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({
      error: "Incorrect username or password.",
    });
  }

  const token = createSession(user.id);
  setSessionCookie(res, token);

  return res.json({
    user: user.username,
  });
});

// Restore the currently authenticated user.
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    user: req.user.username,
  });
});

// Explicit logout.
app.post("/api/auth/logout", (req, res) => {
  destroySession(req);
  clearSessionCookie(res);

  res.json({
    success: true,
  });
});

// Read notification preferences for the authenticated user only.
app.get("/api/notifications/settings", requireAuth, (req, res) => {
  res.json(getNotificationSettings(req.user.username));
});

// Update notification preferences for the authenticated user only.
app.put("/api/notifications/settings", requireAuth, (req, res) => {
  const {
    reminderEnabled,
    reminderTime,
    reminderDays,
    partnerSetEnabled,
  } = req.body || {};

  if (typeof reminderEnabled !== "boolean" || typeof partnerSetEnabled !== "boolean") {
    return res.status(400).json({ error: "Invalid notification settings." });
  }

  if (typeof reminderTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
    return res.status(400).json({ error: "Reminder time must be a valid 24-hour time." });
  }

  if (
    !Array.isArray(reminderDays) ||
    reminderDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7) ||
    new Set(reminderDays).size !== reminderDays.length
  ) {
    return res.status(400).json({ error: "Select valid reminder weekdays." });
  }

  db.prepare(`
    INSERT INTO notification_settings (
      user, reminder_enabled, reminder_time, reminder_days, partner_set_enabled
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user) DO UPDATE SET
      reminder_enabled = excluded.reminder_enabled,
      reminder_time = excluded.reminder_time,
      reminder_days = excluded.reminder_days,
      partner_set_enabled = excluded.partner_set_enabled,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    req.user.username,
    reminderEnabled ? 1 : 0,
    reminderTime,
    JSON.stringify([...reminderDays].sort((a, b) => a - b)),
    partnerSetEnabled ? 1 : 0
  );

  res.json(getNotificationSettings(req.user.username));
});

// Send a test DM with a 30-second per-user cooldown.
app.post("/api/notifications/test", requireAuth, async (req, res) => {
  const user = req.user.username;

  if (testDmInFlight.has(user)) {
    return res.status(409).json({
      error: "A test DM is already being sent.",
    });
  }

  const lastSentAt = testDmCooldowns.get(user);

  if (lastSentAt) {
    const remainingMs = TEST_DM_COOLDOWN_MS - (Date.now() - lastSentAt);

    if (remainingMs > 0) {
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      return res.status(429).json({
        error: `Please wait ${remainingSeconds} seconds before sending another test DM.`,
        retryAfter: remainingSeconds,
      });
    }
  }

  testDmInFlight.add(user);

  try {
    await sendDiscordDm(
      user,
      "DualRep test message: Discord notifications are connected successfully."
    );

    testDmCooldowns.set(user, Date.now());

    return res.json({
      sent: true,
      cooldownSeconds: TEST_DM_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    return res.status(503).json({
      error: error.message || "Could not send the test DM.",
    });
  } finally {
    testDmInFlight.delete(user);
  }
});

// Log one or more push-up sets.
app.post("/api/sets", requireAuth, (req, res) => {
  const user = req.user.username;
  const { sets } = req.body;
  const validTypes = ["Regular", "Diamond", "Wide", "Clap"];

  if (!Array.isArray(sets) || sets.length === 0) {
    return res.status(400).json({
      error: "At least one push-up set is required.",
    });
  }

  for (const set of sets) {
    if (!validTypes.includes(set.type)) {
      return res.status(400).json({
        error: `Invalid push-up type: ${set.type}`,
      });
    }

    const reps = Number(set.reps);

    if (!Number.isInteger(reps) || reps <= 0) {
      return res.status(400).json({
        error: "Reps must be a positive whole number.",
      });
    }
  }

  const insertSet = db.prepare(`
    INSERT INTO pushup_sets (user, type, reps)
    VALUES (?, ?, ?)
  `);

  const saveSets = db.transaction((setsToSave) => {
    return setsToSave.map((set) => {
      const result = insertSet.run(user, set.type, Number(set.reps));

      return {
        id: result.lastInsertRowid,
        type: set.type,
        reps: Number(set.reps),
      };
    });
  });

  const savedSets = saveSets(sets);

  // Notification delivery is best-effort and does not affect the successful log.
  notifyPartnerOfSets(user, savedSets).catch((error) => {
    console.error("[Discord] Partner notification failed:", error);
  });

  res.status(201).json({
    user,
    sets: savedSets,
  });
});

// Get dashboard data for both users.
app.get("/api/dashboard", requireAuth, (req, res) => {
  const users = ["Damian", "Icefox"];
  const pushupTypes = ["Regular", "Diamond", "Wide", "Clap"];

  const today = {};
  const week = {};
  const streaks = {};

  // Calculate Monday of the current IST week.
  const weekStart = db.prepare(`
    SELECT date(
      'now',
      '+5 hours',
      '+30 minutes',
      '-' || (
        (
          CAST(
            strftime('%w', 'now', '+5 hours', '+30 minutes')
            AS INTEGER
          ) + 6
        ) % 7
      ) || ' days'
    ) AS monday
  `).get().monday;

  const todayString = getIndiaDateString();

  for (const user of users) {
    // Today's total using IST date.
    const todayResult = db.prepare(`
      SELECT COALESCE(SUM(reps), 0) AS total
      FROM pushup_sets
      WHERE user = ?
        AND date(created_at, '+5 hours', '+30 minutes') = ?
    `).get(user, todayString);

    today[user] = todayResult.total;

    // Current week's total using IST dates.
    const weekResult = db.prepare(`
      SELECT COALESCE(SUM(reps), 0) AS total
      FROM pushup_sets
      WHERE user = ?
        AND date(created_at, '+5 hours', '+30 minutes') >= ?
        AND date(created_at, '+5 hours', '+30 minutes') <= ?
    `).get(user, weekStart, todayString);

    const typeResults = db.prepare(`
      SELECT type, SUM(reps) AS total
      FROM pushup_sets
      WHERE user = ?
        AND date(created_at, '+5 hours', '+30 minutes') >= ?
        AND date(created_at, '+5 hours', '+30 minutes') <= ?
      GROUP BY type
    `).all(user, weekStart, todayString);

    const types = {};

    for (const type of pushupTypes) {
      types[type] = 0;
    }

    for (const row of typeResults) {
      types[row.type] = row.total;
    }

    week[user] = {
      total: weekResult.total,
      types,
    };

    // Get all distinct active dates in IST.
    const activeDays = db.prepare(`
      SELECT DISTINCT
        date(created_at, '+5 hours', '+30 minutes') AS day
      FROM pushup_sets
      WHERE user = ?
      ORDER BY day DESC
    `).all(user);

    const activeDaySet = new Set(
      activeDays.map((row) => row.day)
    );

    // Calculate streak using IST calendar dates.
    let streak = 0;
    let currentDate = todayString;

    // If no activity today, start checking from yesterday.
    if (!activeDaySet.has(currentDate)) {
      currentDate = shiftDate(currentDate, -1);
    }

    while (activeDaySet.has(currentDate)) {
      streak++;
      currentDate = shiftDate(currentDate, -1);
    }

    streaks[user] = streak;
  }

  // Get daily rep totals for the last 7 IST calendar days, including today.
  const last7Days = db.prepare(`
    WITH RECURSIVE dates(day, n) AS (
      SELECT date('now', '+5 hours', '+30 minutes', '-6 days'), 0

      UNION ALL

      SELECT date(day, '+1 day'), n + 1
      FROM dates
      WHERE n < 6
    ),
    users(user) AS (
      SELECT 'Damian'
      UNION ALL
      SELECT 'Icefox'
    )
    SELECT
      dates.day AS date,
      users.user AS user,
      COALESCE(SUM(pushup_sets.reps), 0) AS total
    FROM dates
    CROSS JOIN users
    LEFT JOIN pushup_sets
      ON pushup_sets.user = users.user
      AND date(
        pushup_sets.created_at,
        '+5 hours',
        '+30 minutes'
      ) = dates.day
    GROUP BY dates.day, users.user
    ORDER BY dates.day ASC
  `).all();

  const dailyTotals = [];

  for (let i = 0; i < last7Days.length; i += 2) {
    const dayRows = last7Days.slice(i, i + 2);

    const day = {
      date: dayRows[0].date,
      Damian: 0,
      Icefox: 0,
    };

    for (const row of dayRows) {
      day[row.user] = row.total;
    }

    dailyTotals.push(day);
  }

  res.json({
    today,
    week,
    streaks,
    last7Days: dailyTotals,
  });
});

// Get daily push-up totals for both users in a specific month.
app.get("/api/month", requireAuth, (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return res.status(400).json({
      error: "Provide a valid year and month.",
    });
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = getNextMonthDate(year, month);

  const rows = db.prepare(`
    SELECT
      user,
      date(
        created_at,
        '+5 hours',
        '+30 minutes'
      ) AS day,
      SUM(reps) AS total
    FROM pushup_sets
    WHERE date(
      created_at,
      '+5 hours',
      '+30 minutes'
    ) >= ?
      AND date(
        created_at,
        '+5 hours',
        '+30 minutes'
      ) < ?
    GROUP BY user, day
    ORDER BY day ASC
  `).all(startDate, endDate);

  const data = {
    Damian: {},
    Icefox: {},
  };

  for (const row of rows) {
    data[row.user][row.day] = row.total;
  }

  res.json({
    year,
    month,
    data,
  });
});

/* =========================
   FRONTEND
========================= */

// Serve the React production build.
app.use(express.static(clientDistPath));

// Express 5-compatible catch-all route.
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`DualRep running at http://127.0.0.1:${PORT}`);
  startDiscordReminders();
});
