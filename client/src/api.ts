
export interface WeeklyUserData {
  total: number;
  types: Record<string, number>;
}

export interface DailyRepData {
  date: string;
  Damian: number;
  Icefox: number;
}

export interface DashboardData {
  today: Record<string, number>;
  week: Record<string, WeeklyUserData>;
  streaks: Record<string, number>;
  last7Days: DailyRepData[];
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard");

  if (!response.ok) {
    throw new Error("Could not load dashboard data.");
  }

  return response.json();
}

/* =========================
   PUSH-UP LOGGING
========================= */

export type PushupType =
  | "Regular"
  | "Diamond"
  | "Wide"
  | "Clap";

export interface PushupSet {
  type: PushupType;
  reps: number;
}

export async function logPushupSets(
  user: string,
  sets: PushupSet[]
) {
  const response = await fetch("/api/sets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user,
      sets,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Could not save push-ups.");
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
}

export async function getMonth(
  year: number,
  month: number
): Promise<MonthData> {
  const response = await fetch(
    `/api/month?year=${year}&month=${month}`
  );

  if (!response.ok) {
    throw new Error("Could not load month data.");
  }

  return response.json();
}
