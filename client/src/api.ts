/* =========================
   AUTHENTICATION
========================= */

export interface AuthResponse {
  user: string;
}

export interface AuthStatusResponse {
  setupRequired: boolean;
}

// Check whether the username needs first-time password setup.
export async function checkUsername(
  username: string
): Promise<AuthStatusResponse> {
  const response = await fetch("/api/auth/status", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Could not verify username.");
  }

  return response.json();
}

async function getError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.error || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

// Check whether an existing session is valid.
export async function getCurrentUser(): Promise<string | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not verify login session.");
  }

  const data: AuthResponse = await response.json();
  return data.user;
}

// Log in using username and password.
export async function login(
  username: string,
  password: string
): Promise<AuthResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();

    if (error.setupRequired) {
      throw new Error("PASSWORD_NOT_SET");
    }

    throw new Error(error.error || "Login failed.");
  }

  return response.json();
}

// Create a password for a username that has no password yet.
export async function setupPassword(
  username: string,
  password: string
): Promise<AuthResponse> {
  const response = await fetch("/api/auth/setup", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await getError(response));
  }

  return response.json();
}

// Explicitly log out.
export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Could not log out.");
  }
}

/* =========================
   DASHBOARD
========================= */

export interface WeeklyUserData {
  total: number;
  types: Record<string, number>;
}

export interface DailyRepData {
  date: string;
  Damian: number;
  Icefox: number;
  restDays?: {
    Damian: boolean;
    Icefox: boolean;
  };
}

export interface DashboardData {
  today: Record<string, number>;
  week: Record<string, WeeklyUserData>;
  streaks: Record<string, number>;
  last7Days: DailyRepData[];
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard", {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("Could not load dashboard data.");
  }

  return response.json();
}

/* =========================
   REST DAYS
========================= */

// Mark today as a rest day for the logged-in user.
export async function markTodayRestDay(): Promise<void> {
  const response = await fetch("/api/rest-days/today", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(await getError(response));
  }
}

// Undo today's rest day for the logged-in user.
export async function undoTodayRestDay(): Promise<void> {
  const response = await fetch("/api/rest-days/today", {
    method: "DELETE",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(await getError(response));
  }
}

/* =========================
   PUSH-UP LOGGING
========================= */

export type PushupType =
  | "Regular"
  | "Diamond"
  | "Wide"
  | "Clap"
  | "Finger";

export interface PushupSet {
  type: PushupType;
  reps: number;
}

export async function logPushupSets(sets: PushupSet[]) {
  const response = await fetch("/api/sets", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sets }),
  });

  if (!response.ok) {
    throw new Error(await getError(response));
  }

  return response.json();
}

/* =========================
   MONTH VIEW
========================= */

export interface MonthData {
  year: number;
  month: number;
  data: Record<string, Record<string, number>>;
  restDays: Record<string, string[]>;
}

export async function getMonth(
  year: number,
  month: number
): Promise<MonthData> {
  const response = await fetch(
    `/api/month?year=${year}&month=${month}`,
    {
      credentials: "same-origin",
    }
  );

  if (!response.ok) {
    throw new Error("Could not load month data.");
  }

  return response.json();
}

/* =========================
   DISCORD NOTIFICATION SETTINGS
========================= */

export interface NotificationSettings {
  reminderEnabled: boolean;
  reminderTime: string;
  reminderDays: number[];
  partnerSetEnabled: boolean;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const response = await fetch("/api/notifications/settings", {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(await getError(response));
  }

  return response.json();
}

export async function saveNotificationSettings(
  settings: NotificationSettings
): Promise<NotificationSettings> {
  const response = await fetch("/api/notifications/settings", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    throw new Error(await getError(response));
  }

  return response.json();
}

export async function sendTestDiscordDm(): Promise<{
  sent: boolean;
  cooldownSeconds: number;
}> {
  const response = await fetch("/api/notifications/test", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(await getError(response));
  }

  return response.json();
}