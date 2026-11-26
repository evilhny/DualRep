
require("dotenv").config();

const { Agent, setGlobalDispatcher } = require("undici");
const {
  hashPassword,
  verifyPassword,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  cleanupExpiredSessions,
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

const PORT = Number(process.env.PORT || 3001);
const clientDistPath = path.join(__dirname, "..", "client", "dist");

app.use(cors());
app.use(express.json());

/* =========================
   TIMEZONE UTILITIES
========================= */

const TIME_ZONE = "Asia/Kolkata";

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

function getIndiaDateString() {
  const parts = getIndiaDateTimeParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// UTC is used only for safe YYYY-MM-DD calendar arithmetic.
function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function getNextMonthDate(year, month) {
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function getIndiaWeekdayNumber(weekdayShort) {
  const map = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return map[weekdayShort] || 0;
}

function getMondayDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;

  return shiftDate(dateString, -daysSinceMonday);
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

async function getNotificationSettings(user) {
  await db.query(
    `INSERT INTO notification_settings ("user")
     VALUES ($1)
     ON CONFLICT ("user") DO NOTHING`,
    [user]
  );

  const result = await db.query(
    `SELECT
       reminder_enabled,
       reminder_time,
       reminder_days,
       partner_set_enabled,
       test_dm_sent
     FROM notification_settings
     WHERE "user" = $1`,
    [user]
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error(`Notification settings missing for ${user}.`);
  }

  let reminderDays = row.reminder_days;

  if (typeof reminderDays === "string") {
    reminderDays = JSON.parse(reminderDays);
  }

  if (!Array.isArray(reminderDays)) {
    reminderDays = [];
  }

  return {
    reminderEnabled: Boolean(row.reminder_enabled),
    reminderTime: row.reminder_time,
    reminderDays,
    partnerSetEnabled: Boolean(row.partner_set_enabled),
    testDmSent: Boolean(row.test_dm_sent),
  };
}

async function hasLoggedToday(user, date) {
  const result = await db.query(
    `SELECT 1
     FROM pushup_sets
     WHERE "user" = $1
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date
     LIMIT 1`,
    [user, date]
  );

  return result.rowCount > 0;
}

async function hasReminderBeenSent(user, date) {
  const result = await db.query(
    `SELECT 1
     FROM discord_reminders
     WHERE "user" = $1
       AND reminder_date = $2
     LIMIT 1`,
    [user, date]
  );

  return result.rowCount > 0;
}

async function hasRestDay(user, date) {
  const result = await db.query(
    `SELECT 1
     FROM rest_days
     WHERE "user" = $1
       AND rest_date = $2
     LIMIT 1`,
    [user, date]
  );

  return result.rowCount > 0;
}

async function recordReminderSent(user, date) {
  await db.query(
    `INSERT INTO discord_reminders ("user", reminder_date)
     VALUES ($1, $2)
     ON CONFLICT ("user", reminder_date) DO NOTHING`,
    [user, date]
  );
}

async function sendDiscordDm(user, content) {
  const discordUserId = DISCORD_USERS[user];

  if (!discordClient?.isReady() || !discordUserId?.trim()) {
    throw new Error(`Discord is not configured for ${user}.`);
  }

  const discordUser = await discordClient.users.fetch(discordUserId);
  await discordUser.send({ content });
}

async function sendDailyReminder(user, reminderDate) {
  const settings = await getNotificationSettings(user);

  if (!settings.reminderEnabled) return;
  if (await hasReminderBeenSent(user, reminderDate)) return;
  if (await hasLoggedToday(user, reminderDate)) return;
  if (await hasRestDay(user, reminderDate)) return;

  const parts = getIndiaDateTimeParts();
  const weekday = getIndiaWeekdayNumber(parts.weekday);

  if (!settings.reminderDays.includes(weekday)) return;

  const nowMinutes =
    Number(parts.hour) * 60 + Number(parts.minute);

  const [reminderHour, reminderMinute] =
    settings.reminderTime.split(":").map(Number);

  if (nowMinutes < reminderHour * 60 + reminderMinute) return;

  try {
    await sendDiscordDm(
      user,
      `Hey ${user}! You haven't logged any push-ups on DualRep today.\n\n` +
        `Get a set done and keep your streak going.`
    );

    await recordReminderSent(user, reminderDate);

    console.log(
      `[Discord] Daily reminder sent to ${user} for ${reminderDate}.`
    );
  } catch (error) {
    console.error(
      `[Discord] Could not DM ${user}:`,
      error.message
    );
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

  const settings = await getNotificationSettings(partner);

  if (!settings.partnerSetEnabled) return;

  const totalReps = sets.reduce(
    (total, set) => total + Number(set.reps),
    0
  );

  const setLabel = sets.length === 1 ? "a set" : `${sets.length} sets`;

  try {
    await sendDiscordDm(
      partner,
      `${user} just logged ${setLabel} on DualRep: ${totalReps} reps.\n\n` +
        `Your turn to get moving!`
    );
  } catch (error) {
    console.error(
      `[Discord] Could not send partner activity DM to ${partner}:`,
      error.message
    );
  }
}

function startDiscordReminders() {
  if (!DISCORD_ENABLED) {
    console.log(
      "[Discord] Notifications disabled. Configure the bot token and user IDs in server/.env."
    );

    return;
  }

  const { Client, GatewayIntentBits } = require("discord.js");

  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

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

function normalizeUsername(username) {
  if (typeof username !== "string") return null;

  const normalized = username.trim().toLowerCase();

  if (normalized === "damian") return "Damian";
  if (normalized === "icefox") return "Icefox";

  return null;
}

/* =========================
   AUTHENTICATION
========================= */

// Check whether a username already has a password configured.
app.post("/api/auth/status", async (req, res) => {
  const username = normalizeUsername(req.body?.username);

  if (!username) {
    return res.status(400).json({
      error: "Username must be damian or icefox.",
    });
  }

  const result = await db.query(
    `SELECT id
     FROM users
     WHERE username = $1
     LIMIT 1`,
    [username]
  );

  return res.json({
    setupRequired: result.rowCount === 0,
  });
});

// First-time password setup.
app.post("/api/auth/setup", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;

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

  const result = await db.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [username, hashPassword(password)]
  );

  if (result.rowCount === 0) {
    return res.status(409).json({
      error: "This username already has a password. Please log in.",
    });
  }

  const token = await createSession(result.rows[0].id);

  setSessionCookie(res, token);

  return res.status(201).json({
    user: username,
  });
});

// Username and password login.
app.post("/api/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;

  if (!username || typeof password !== "string") {
    return res.status(400).json({
      error: "Enter a valid username and password.",
    });
  }

  const result = await db.query(
    `SELECT id, username, password_hash
     FROM users
     WHERE username = $1`,
    [username]
  );

  const user = result.rows[0];

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

  const token = await createSession(user.id);

  setSessionCookie(res, token);

  return res.json({
    user: user.username,
  });
});

// Restore the currently authenticated user.
app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({
    user: req.user.username,
  });
});

// Explicit logout.
app.post("/api/auth/logout", requireAuth, async (req, res) => {
  await destroySession(req);

  clearSessionCookie(res);

  return res.json({
    success: true,
  });
});

/* =========================
   NOTIFICATION SETTINGS
========================= */

// Read notification preferences.
app.get("/api/notifications/settings", requireAuth, async (req, res) => {
  const settings = await getNotificationSettings(req.user.username);

  return res.json(settings);
});

// Update notification preferences.
app.put("/api/notifications/settings", requireAuth, async (req, res) => {
  const {
    reminderEnabled,
    reminderTime,
    reminderDays,
    partnerSetEnabled,
  } = req.body || {};

  if (
    typeof reminderEnabled !== "boolean" ||
    typeof partnerSetEnabled !== "boolean"
  ) {
    return res.status(400).json({
      error: "Invalid notification settings.",
    });
  }

  if (
    typeof reminderTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)
  ) {
    return res.status(400).json({
      error: "Reminder time must be a valid 24-hour time.",
    });
  }

  if (
    !Array.isArray(reminderDays) ||
    reminderDays.some(
      (day) => !Number.isInteger(day) || day < 1 || day > 7
    ) ||
    new Set(reminderDays).size !== reminderDays.length
  ) {
    return res.status(400).json({
      error: "Select valid reminder weekdays.",
    });
  }

  await db.query(
    `INSERT INTO notification_settings (
       "user",
       reminder_enabled,
       reminder_time,
       reminder_days,
       partner_set_enabled,
       test_dm_sent
     )
     VALUES ($1, $2, $3, $4, $5, FALSE)
     ON CONFLICT ("user") DO UPDATE SET
       reminder_enabled = EXCLUDED.reminder_enabled,
       reminder_time = EXCLUDED.reminder_time,
       reminder_days = EXCLUDED.reminder_days,
       partner_set_enabled = EXCLUDED.partner_set_enabled,
       test_dm_sent = FALSE,
       updated_at = CURRENT_TIMESTAMP`,
    [
      req.user.username,
      reminderEnabled,
      reminderTime,
      JSON.stringify([...reminderDays].sort((a, b) => a - b)),
      partnerSetEnabled,
    ]
  );

  return res.json(
    await getNotificationSettings(req.user.username)
  );
});

// Send a test DM with a 30-second per-user cooldown.
app.post("/api/notifications/test", requireAuth, async (req, res) => {
  const user = req.user.username;

  if (testDmInFlight.has(user)) {
    return res.status(409).json({
      error: "A test DM is already being sent.",
    });
  }

  const settings = await getNotificationSettings(user);

  if (settings.testDmSent) {
    return res.status(409).json({
      error: "The test DM has already been sent. Save your notification settings to enable it again.",
      sent: true,
    });
  }

  const lastSentAt = testDmCooldowns.get(user);

  if (lastSentAt) {
    const remainingMs =
      TEST_DM_COOLDOWN_MS - (Date.now() - lastSentAt);

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

    await db.query(
      `UPDATE notification_settings
       SET test_dm_sent = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE "user" = $1`,
      [user]
    );

    testDmCooldowns.set(user, Date.now());

    return res.json({
      sent: true,
      cooldownSeconds: TEST_DM_COOLDOWN_MS / 1000,
    });
  } catch (error) {
    console.error(`[Discord] Test DM failed for ${user}:`, error.message);

    return res.status(503).json({
      error: error.message || "Could not send the test DM.",
    });
  } finally {
    testDmInFlight.delete(user);
  }
});

/* =========================
   REST DAYS
========================= */

// Mark today as a manual rest day.
// Locking the user row serializes this operation against push-up logging.
app.post("/api/rest-days/today", requireAuth, async (req, res) => {
  const user = req.user.username;
  const today = getIndiaDateString();

  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `SELECT id
       FROM users
       WHERE username = $1
       FOR UPDATE`,
      [user]
    );

    const logged = await client.query(
      `SELECT 1
       FROM pushup_sets
       WHERE "user" = $1
         AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date
       LIMIT 1`,
      [user, today]
    );

    if (logged.rowCount > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "You've already logged push-ups today. A rest day can only be marked on a day with no push-up sets.",
      });
    }

    await client.query(
      `INSERT INTO rest_days ("user", rest_date)
       VALUES ($1, $2)
       ON CONFLICT ("user", rest_date) DO NOTHING`,
      [user, today]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      user,
      date: today,
      restDay: true,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

// Undo today's manual rest day.
app.delete("/api/rest-days/today", requireAuth, async (req, res) => {
  const user = req.user.username;
  const today = getIndiaDateString();

  const result = await db.query(
    `DELETE FROM rest_days
     WHERE "user" = $1
       AND rest_date = $2`,
    [user, today]
  );

  return res.json({
    user,
    date: today,
    restDay: false,
    removed: result.rowCount > 0,
  });
});

/* =========================
   PUSH-UP SETS
========================= */

app.post("/api/sets", requireAuth, async (req, res) => {
  const user = req.user.username;
  const sets = req.body?.sets;

  const validTypes = [
    "Regular",
    "Diamond",
    "Wide",
    "Clap",
    "Finger",
  ];

  const today = getIndiaDateString();

  if (!Array.isArray(sets) || sets.length === 0) {
    return res.status(400).json({
      error: "At least one push-up set is required.",
    });
  }

  for (const set of sets) {
    if (!set || !validTypes.includes(set.type)) {
      return res.status(400).json({
        error: `Invalid push-up type: ${set?.type}`,
      });
    }

    const reps = Number(set.reps);

    if (!Number.isInteger(reps) || reps <= 0) {
      return res.status(400).json({
        error: "Reps must be a positive whole number.",
      });
    }
  }

  const client = await db.pool.connect();
  let savedSets;

  try {
    await client.query("BEGIN");

    await client.query(
      `SELECT id
       FROM users
       WHERE username = $1
       FOR UPDATE`,
      [user]
    );

    const restDay = await client.query(
      `SELECT 1
       FROM rest_days
       WHERE "user" = $1
         AND rest_date = $2
       LIMIT 1`,
      [user, today]
    );

    if (restDay.rowCount > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "You've marked today as a rest day. Undo the rest day before logging push-ups.",
      });
    }

    savedSets = [];

    for (const set of sets) {
      const result = await client.query(
        `INSERT INTO pushup_sets ("user", type, reps)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [user, set.type, Number(set.reps)]
      );

      savedSets.push({
        id: result.rows[0].id,
        type: set.type,
        reps: Number(set.reps),
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Notification delivery is best-effort and does not affect the successful log.
  notifyPartnerOfSets(user, savedSets).catch((error) => {
    console.error("[Discord] Partner notification failed:", error);
  });

  return res.status(201).json({
    user,
    sets: savedSets,
  });
});

/* =========================
   DASHBOARD
========================= */

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const users = ["Damian", "Icefox"];

  const pushupTypes = [
    "Regular",
    "Diamond",
    "Wide",
    "Clap",
    "Finger",
  ];

  const todayString = getIndiaDateString();
  const weekStart = getMondayDate(todayString);
  const sevenDaysAgo = shiftDate(todayString, -6);

  // Today's totals for both users.
  const todayResult = await db.query(
    `SELECT
       "user",
       COALESCE(SUM(reps), 0)::bigint AS total
     FROM pushup_sets
     WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date
     GROUP BY "user"`,
    [todayString]
  );

  const today = {
    Damian: 0,
    Icefox: 0,
  };

  for (const row of todayResult.rows) {
    today[row.user] = Number(row.total);
  }

  // Current week's totals grouped by user and push-up type.
  const weekResult = await db.query(
    `SELECT
       "user",
       type,
       COALESCE(SUM(reps), 0)::bigint AS total
     FROM pushup_sets
     WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= $2::date
     GROUP BY "user", type`,
    [weekStart, todayString]
  );

  const week = {};

  for (const user of users) {
    const types = Object.fromEntries(
      pushupTypes.map((type) => [type, 0])
    );

    let total = 0;

    for (const row of weekResult.rows) {
      if (row.user !== user) continue;

      const reps = Number(row.total);
      total += reps;

      if (Object.prototype.hasOwnProperty.call(types, row.type)) {
        types[row.type] = reps;
      }
    }

    week[user] = {
      total,
      types,
    };
  }

  // Push-up dates and manual rest dates both count as active streak days.
  const activeDaysByUser = {
    Damian: new Set(),
    Icefox: new Set(),
  };

  const allActiveDaysResult = await db.query(
    `SELECT
       "user",
       active_day::text AS day
     FROM (
       SELECT DISTINCT
         "user",
         (created_at AT TIME ZONE 'Asia/Kolkata')::date AS active_day
       FROM pushup_sets

       UNION

       SELECT
         "user",
         rest_date::date AS active_day
       FROM rest_days
     ) active_days
     ORDER BY "user", active_day DESC`
  );

  for (const row of allActiveDaysResult.rows) {
    if (activeDaysByUser[row.user]) {
      activeDaysByUser[row.user].add(row.day);
    }
  }

  // Calculate streak using IST calendar dates.
  const streaks = {};

  for (const user of users) {
    const activeDaySet = activeDaysByUser[user];

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

  // Daily rep totals for the last seven IST calendar days, including today.
  const last7Result = await db.query(
    `WITH dates AS (
       SELECT generate_series(
         $1::date,
         $2::date,
         INTERVAL '1 day'
       )::date AS day
     ),
     users AS (
       SELECT unnest(ARRAY['Damian', 'Icefox']::text[]) AS username
     )
     SELECT
       dates.day::text AS date,
       users.username AS "user",
       COALESCE(SUM(pushup_sets.reps), 0)::bigint AS total
     FROM dates
     CROSS JOIN users
     LEFT JOIN pushup_sets
       ON pushup_sets."user" = users.username
      AND (pushup_sets.created_at AT TIME ZONE 'Asia/Kolkata')::date = dates.day
     GROUP BY dates.day, users.username
     ORDER BY dates.day ASC, users.username ASC`,
    [sevenDaysAgo, todayString]
  );

  // Rest-day markers for the same seven-day chart window.
  const weeklyRestResult = await db.query(
    `SELECT
       "user",
       rest_date AS date
     FROM rest_days
     WHERE rest_date >= $1
       AND rest_date <= $2`,
    [sevenDaysAgo, todayString]
  );

  const restDayLookup = {
    Damian: new Set(),
    Icefox: new Set(),
  };

  for (const row of weeklyRestResult.rows) {
    if (restDayLookup[row.user]) {
      restDayLookup[row.user].add(row.date);
    }
  }

  const dailyTotals = [];

  // The SQL query always returns two rows per date, one for each user.
  for (let i = 0; i < last7Result.rows.length; i += 2) {
    const dayRows = last7Result.rows.slice(i, i + 2);

    if (dayRows.length === 0) continue;

    const dayDate = dayRows[0].date;

    const day = {
      date: dayDate,
      Damian: 0,
      Icefox: 0,
      restDays: {
        Damian: restDayLookup.Damian.has(dayDate),
        Icefox: restDayLookup.Icefox.has(dayDate),
      },
    };

    for (const row of dayRows) {
      day[row.user] = Number(row.total);
    }

    dailyTotals.push(day);
  }

  return res.json({
    today,
    week,
    streaks,
    last7Days: dailyTotals,
  });
});

/* =========================
   MONTHLY CALENDAR
========================= */

app.get("/api/month", requireAuth, async (req, res) => {
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

  const startDate =
    `${year}-${String(month).padStart(2, "0")}-01`;

  const endDate = getNextMonthDate(year, month);

  const [pushupResult, restDayResult] = await Promise.all([
    db.query(
      `SELECT
         "user",
         (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day,
         SUM(reps)::bigint AS total
       FROM pushup_sets
       WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date >= $1::date
         AND (created_at AT TIME ZONE 'Asia/Kolkata')::date < $2::date
       GROUP BY "user", day
       ORDER BY day ASC`,
      [startDate, endDate]
    ),

    db.query(
      `SELECT
         "user",
         rest_date AS day
       FROM rest_days
       WHERE rest_date >= $1
         AND rest_date < $2
       ORDER BY rest_date ASC`,
      [startDate, endDate]
    ),
  ]);

  const data = {
    Damian: {},
    Icefox: {},
  };

  for (const row of pushupResult.rows) {
    if (data[row.user]) {
      data[row.user][row.day] = Number(row.total);
    }
  }

  const restDays = {
    Damian: [],
    Icefox: [],
  };

  for (const row of restDayResult.rows) {
    if (restDays[row.user]) {
      restDays[row.user].push(row.day);
    }
  }

  return res.json({
    year,
    month,
    data,
    restDays,
  });
});

/* =========================
   ERROR HANDLING
========================= */

// Register the error handler after API routes.
// Express skips normal middleware when propagating an error.
app.use((error, req, res, next) => {
  console.error("[API] Unhandled request error:", error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    error: "An internal server error occurred.",
  });
});

/* =========================
   FRONTEND
========================= */

app.use(express.static(clientDistPath));

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

/* =========================
   SERVER STARTUP
========================= */

const SESSION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runSessionCleanup() {
  try {
    const deleted = await cleanupExpiredSessions();
    console.log(`[Sessions] Expiry cleanup completed. Deleted ${deleted} expired session(s).`);
  } catch (error) {
    console.error("[Sessions] Expiry cleanup failed:", error);
  }
}

// Run once at startup, then every 24 hours.
runSessionCleanup();

const sessionCleanupTimer = setInterval(
  runSessionCleanup,
  SESSION_CLEANUP_INTERVAL_MS
);
sessionCleanupTimer.unref();

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`DualRep running at http://127.0.0.1:${PORT}`);
  startDiscordReminders();
});

/* =========================
   GRACEFUL SHUTDOWN
========================= */

async function shutdown(signal) {
  console.log(`[Server] ${signal} received. Shutting down...`);
  clearInterval(sessionCleanupTimer);

  server.close(async () => {
    try {
      if (discordClient) {
        await discordClient.destroy();
      }

      await db.pool.end();
    } catch (error) {
      console.error("[Server] Shutdown error:", error);
    } finally {
      process.exit(0);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
