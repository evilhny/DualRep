
require("dotenv").config();

const { Agent, setGlobalDispatcher } = require("undici");

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
const PORT = 3001;

// In production, the React app is built into client/dist.
const clientDistPath = path.join(__dirname, "..", "client", "dist");

app.use(cors());
app.use(express.json());

/* =========================
   TIMEZONE UTILITIES
========================= */

const TIME_ZONE = "Asia/Kolkata";

// Get current date and time in India.
function getIndiaDateTimeParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
   DISCORD DAILY REMINDERS
========================= */

const DISCORD_USERS = {
  Icefox: process.env.DISCORD_ICEFOX_USER_ID,
  Damian: process.env.DISCORD_DAMIAN_USER_ID,
};

const DISCORD_ENABLED = Boolean(
  process.env.DISCORD_BOT_TOKEN &&
  Object.values(DISCORD_USERS).some((id) => id && id.trim())
);

const REMINDER_HOUR = 11;
const REMINDER_MINUTE = 0;

let discordClient = null;
let reminderCheckRunning = false;

function hasReminderTimeArrived() {
  const parts = getIndiaDateTimeParts();

  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return (
    hour > REMINDER_HOUR ||
    (hour === REMINDER_HOUR && minute >= REMINDER_MINUTE)
  );
}

// Store reminder history in the existing SQLite database.
db.exec(`
  CREATE TABLE IF NOT EXISTS discord_reminders (
    user TEXT NOT NULL CHECK(user IN ('Damian', 'Icefox')),
    reminder_date TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user, reminder_date)
  )
`);

// SQLite CURRENT_TIMESTAMP is UTC.
// Convert stored timestamps to IST before comparing dates.
const hasLoggedToday = db.prepare(`
  SELECT 1
  FROM pushup_sets
  WHERE user = ?
    AND date(created_at, '+5 hours', '+30 minutes') = ?
  LIMIT 1
`);

const hasReminderBeenSent = db.prepare(`
  SELECT 1
  FROM discord_reminders
  WHERE user = ?
    AND reminder_date = ?
  LIMIT 1
`);

const recordReminderSent = db.prepare(`
  INSERT OR IGNORE INTO discord_reminders (user, reminder_date)
  VALUES (?, ?)
`);

async function sendDailyReminder(user, discordUserId, reminderDate) {
  if (!discordUserId || !discordUserId.trim()) {
    return;
  }

  if (hasReminderBeenSent.get(user, reminderDate)) {
    return;
  }

  if (hasLoggedToday.get(user, reminderDate)) {
    console.log(`[Discord] ${user} has already logged today. No reminder.`);
    return;
  }

  try {
    const discordUser = await discordClient.users.fetch(discordUserId);

    await discordUser.send({
      content:
        `Hey ${user}! You haven't logged any push-ups on DualRep today.\n\n` +
        `Get a set done and keep your streak going.`,
    });

    recordReminderSent.run(user, reminderDate);

    console.log(
      `[Discord] Daily reminder sent to ${user} for ${reminderDate}.`
    );
  } catch (error) {
    // Failed deliveries are not recorded, allowing a retry.
    console.error(`[Discord] Could not DM ${user}:`, error.message);
  }
}

async function checkDailyReminders() {
  if (!discordClient?.isReady() || reminderCheckRunning) {
    return;
  }

  if (!hasReminderTimeArrived()) {
    return;
  }

  reminderCheckRunning = true;

  try {
    const reminderDate = getIndiaDateString();

    for (const [user, discordUserId] of Object.entries(DISCORD_USERS)) {
      await sendDailyReminder(user, discordUserId, reminderDate);
    }
  } catch (error) {
    console.error("[Discord] Reminder check failed:", error);
  } finally {
    reminderCheckRunning = false;
  }
}

function startDiscordReminders() {
  if (!DISCORD_ENABLED) {
    console.log(
      "[Discord] Reminders disabled. Configure the bot token and at least one user ID in server/.env."
    );
    return;
  }

  const { Client, GatewayIntentBits } = require("discord.js");

  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  discordClient.once("ready", () => {
    console.log(`[Discord] Logged in as ${discordClient.user.tag}.`);
    console.log("[Discord] Daily reminders scheduled for 11:00 AM IST.");

    // Check immediately in case the server starts after 11 AM.
    checkDailyReminders();

    // Check every minute. Sent reminders are stored in SQLite.
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

// Log one or more push-up sets.
app.post("/api/sets", (req, res) => {
  const { user, sets } = req.body;

  const validUsers = ["Damian", "Icefox"];
  const validTypes = ["Regular", "Diamond", "Wide", "Clap"];

  if (!validUsers.includes(user)) {
    return res.status(400).json({
      error: "User must be Damian or Icefox.",
    });
  }

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

  res.status(201).json({
    user,
    sets: savedSets,
  });
});

// Get dashboard data for both users.
app.get("/api/dashboard", (req, res) => {
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
app.get("/api/month", (req, res) => {
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
