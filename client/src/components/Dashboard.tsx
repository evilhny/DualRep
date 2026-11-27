
import { useCallback, useEffect, useState } from "react";
import { LogOut, Settings, Moon } from "lucide-react";
import {
  getDashboard,
  getMonth,
  logPushupSets,
  markTodayRestDay,
  undoTodayRestDay,
  type DashboardData,
  type MonthData,
  type PushupSet,
} from "../api";
import LogPushups from "./LogPushups";
import MonthView from "./MonthView";
import SettingsModal from "./Settings";

interface DashboardProps {
  user: string;
  onLogout: () => void;
  initialData: DashboardData | null;
}


type DashboardUser = "Icefox" | "Damian";

function getLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatSelectedDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Dashboard({
  user,
  onLogout,
  initialData,
}: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [error, setError] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRestDayUpdating, setIsRestDayUpdating] = useState(false);
  const [monthRefreshKey, setMonthRefreshKey] = useState(0);

  const [selectedDate, setSelectedDate] = useState(
    getLocalDateKey(new Date())
  );

  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [monthError, setMonthError] = useState("");

  const [visibleSevenDayUsers, setVisibleSevenDayUsers] = useState({
    Icefox: true,
    Damian: true,
  });

  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);
  const [chartRange, setChartRange] = useState<"week" | "month">("week");
  const [chartMonthData, setChartMonthData] = useState<{ key: string; month: MonthData }[]>([]);

  const loadDashboard = useCallback(async () => {
    try {
      setError("");
      const dashboardData = await getDashboard();
      setData(dashboardData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while loading the dashboard."
      );
    }
  }, []);

  useEffect(() => {
    if (!data) {
      loadDashboard();
    }
  }, [loadDashboard, data]);

  // Load the month containing the currently selected calendar date.
  useEffect(() => {
    let cancelled = false;

    async function loadSelectedMonth() {
      const [year, month] = selectedDate.split("-").map(Number);

      setMonthError("");

      try {
        const result = await getMonth(year, month);

        if (!cancelled) {
          setMonthData(result);
        }
      } catch {
        if (!cancelled) {
          setMonthError("Could not load the daily breakdown.");
        }
      }
    }

    loadSelectedMonth();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, monthRefreshKey]);

  // Load the month data needed for the rolling 30-day chart.
  useEffect(() => {
    let cancelled = false;

    async function loadChartMonths() {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 29);

      const monthKeys = new Set([
        `${start.getFullYear()}-${start.getMonth() + 1}`,
        `${today.getFullYear()}-${today.getMonth() + 1}`,
      ]);

      try {
        const results = await Promise.all(
          [...monthKeys].map(async (key) => {
            const [year, month] = key.split("-").map(Number);
            return { key, month: await getMonth(year, month) };
          })
        );

        if (!cancelled) setChartMonthData(results);
      } catch {
        if (!cancelled) setChartMonthData([]);
      }
    }

    loadChartMonths();

    return () => {
      cancelled = true;
    };
  }, [monthRefreshKey]);

  async function handleSaveSet(sets: PushupSet[]) {
    try {
      await logPushupSets(sets);
      await loadDashboard();
      setMonthRefreshKey((current) => current + 1);
      setIsLogging(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save push-ups."
      );
      throw err;
    }
  }

  async function handleToggleRestDay() {
    if (isRestDayUpdating) return;

    setIsRestDayUpdating(true);
    setError("");

    try {
      if (isRestDay) {
        await undoTodayRestDay();
      } else {
        await markTodayRestDay();
      }

      await loadDashboard();
      setMonthRefreshKey((current) => current + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update your rest day."
      );
    } finally {
      setIsRestDayUpdating(false);
    }
  }

  if (error && !data) {
    return (
      <main className="app dashboard-page">
        <div className="dashboard">
          <p className="error-message">{error}</p>

          <button className="log-button" onClick={loadDashboard}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app dashboard-page">
        <div className="loading-spinner">
          <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Loading"
            role="img"
          >
            <path
              fill="#FFDFB9"
              d="M12,4a8,8,0,0,1,7.89,6.7A1.53,1.53,0,0,0,21.38,12h0a1.5,1.5,0,0,0,1.48-1.75,11,11,0,0,0-21.72,0A1.5,1.5,0,0,0,2.62,12h0a1.53,1.53,0,0,0,1.49-1.3A8,8,0,0,1,12,4Z"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                dur="0.75s"
                values="0 12 12;360 12 12"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        </div>
      </main>
    );
  }

  const yourStreak = data.streaks[user] ?? 0;
  const last7Days = data.last7Days ?? [];

  // The final entry represents today in the backend's IST date range.
  const todayEntry = last7Days[last7Days.length - 1];

  const isRestDay = Boolean(
    todayEntry?.restDays?.[user as DashboardUser]
  );

  const hasLoggedToday = (data.today[user] ?? 0) > 0;

  const chartDays =
    chartRange === "week"
      ? last7Days
      : (() => {
          const today = new Date();
          const dates: string[] = [];

          for (let offset = 29; offset >= 0; offset -= 1) {
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            dates.push(getLocalDateKey(date));
          }

          return dates.map((date) => {
            const monthKey = date.slice(0, 7).replace("-", "-");
            const monthForDate = chartMonthData.find((entry) => entry.key ===
              `${Number(monthKey.slice(0, 4))}-${Number(monthKey.slice(5, 7))}`
            )?.month;

            return {
              date,
              Icefox: monthForDate?.data?.Icefox?.[date] ?? 0,
              Damian: monthForDate?.data?.Damian?.[date] ?? 0,
              restDays: {
                Icefox: monthForDate?.restDays?.Icefox?.includes(date) ?? false,
                Damian: monthForDate?.restDays?.Damian?.includes(date) ?? false,
              },
            };
          });
        })();

  const maxDailyReps = Math.max(
    1,
    ...chartDays.flatMap((day) => [day.Icefox, day.Damian])
  );

  // SVG coordinates for the daily trend lines.
  const chartWidth = 700;
  const chartHeight = 250;
  const chartLeft = 42;
  const chartRight = 680;
  const chartTop = 18;
  const chartBottom = 190;
  const chartPlotWidth = chartRight - chartLeft;
  const chartPlotHeight = chartBottom - chartTop;

  function getChartX(index: number): number {
    if (chartDays.length <= 1) return chartLeft + chartPlotWidth / 2;
    return chartLeft + (index / (chartDays.length - 1)) * chartPlotWidth;
  }

  function getChartY(reps: number): number {
    return chartBottom - (reps / maxDailyReps) * chartPlotHeight;
  }

  function getLinePath(userName: DashboardUser): string {
    // Keep every date on the X-axis, but omit rest days from this user's line.
    const workoutDays = chartDays
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => !day.restDays?.[userName]);

    return workoutDays
      .map(({ day, index }, pointIndex) => {
        const command = pointIndex === 0 ? "M" : "L";
        return `${command} ${getChartX(index)} ${getChartY(day[userName])}`;
      })
      .join(" ");
  }

  const personalBests = data.personalBests;
  const dailyBest = personalBests?.daily;
  const weeklyBest = personalBests?.weekly;
  const todayReps = data.today[user] ?? 0;
  const thisWeekReps = data.week[user]?.total ?? 0;

  const dailyProgress = dailyBest?.reps
    ? Math.min(100, (todayReps / dailyBest.reps) * 100)
    : 0;

  const weeklyProgress = weeklyBest?.reps
    ? Math.min(100, (thisWeekReps / weeklyBest.reps) * 100)
    : 0;

  function formatRecordDate(
    dateString: string | null | undefined
  ): string {
    if (!dateString) return "No record yet";

    return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const icefoxTotal = visibleSevenDayUsers.Icefox
    ? chartDays.reduce((total, day) => total + day.Icefox, 0)
    : 0;

  const damianTotal = visibleSevenDayUsers.Damian
    ? chartDays.reduce((total, day) => total + day.Damian, 0)
    : 0;

  function toggleSevenDayUser(userName: DashboardUser) {
    setVisibleSevenDayUsers((current) => ({
      ...current,
      [userName]: !current[userName],
    }));
  }

  function formatDay(date: string) {
    const parsedDate = new Date(`${date}T00:00:00`);

    return {
      weekday: parsedDate.toLocaleDateString("en-US", {
        weekday: "short",
      }),
      day: parsedDate.getDate(),
    };
  }

  const selectedDaySets = monthData?.sets?.[selectedDate];

  const selectedDayTotals = {
    Icefox: monthData?.data?.Icefox?.[selectedDate] ?? 0,
    Damian: monthData?.data?.Damian?.[selectedDate] ?? 0,
  };

  const selectedDayRest = {
    Icefox:
      monthData?.restDays?.Icefox?.includes(selectedDate) ?? false,
    Damian:
      monthData?.restDays?.Damian?.includes(selectedDate) ?? false,
  };

  function renderDailyBreakdown(userName: DashboardUser) {
    const sets = selectedDaySets?.[userName] ?? [];
    const total = selectedDayTotals[userName];
    const isUserRestDay = selectedDayRest[userName];

    return (
      <section
        className={`daily-user-breakdown ${userName.toLowerCase()}-daily-breakdown`}
        key={userName}
      >
        <div className="daily-user-header">
          <div className="daily-user-identity">
            <span className={`legend-dot ${userName.toLowerCase()}-dot`} />
            <h3>{userName}</h3>
          </div>

          <strong className="daily-user-total">
            {total} <span>reps</span>
          </strong>
        </div>

        {isUserRestDay ? (
          <p className="daily-rest-message">
            <Moon size={14} />
            Rest day
          </p>
        ) : sets.length > 0 ? (
          <div className="daily-set-list">
            {sets.map((set) => (
              <div className="daily-set-pill" key={set.id}>
                <span className="daily-set-type">{set.type}</span>
                <strong>{set.reps}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="daily-empty-message">
            No push-ups logged.
          </p>
        )}
      </section>
    );
  }

  return (
    <main className="app dashboard-page">
      <div className="dashboard">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-brand" aria-label="DualRep">
            <img
              src="/favicon.svg"
              alt=""
              aria-hidden="true"
              className="dashboard-brand-logo"
            />
            <span className="dashboard-brand-text">DUALREP</span>
          </div>

          <div className="dashboard-account">
            <span>
              Signed in as <strong>{user}</strong>
            </span>

            <button
              type="button"
              className="settings-open-button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="logout-button"
              onClick={onLogout}
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="dashboard-heading">
          <h1>Dashboard</h1>
        </div>

        {/* Streak and logging action */}
        <section
          className="dashboard-card streak-card"
          style={{
            minHeight: "220px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p className="card-label">CURRENT STREAK</p>

          <div
            className="streak-content"
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: "28px",
            }}
          >
            <div className="streak">
              <strong style={{ fontSize: "2.8rem" }}>{yourStreak}</strong>
              <span>days</span>
            </div>

            <div
              className="streak-actions"
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <button
                type="button"
                className="log-button streak-log-button"
                onClick={() => setIsLogging(true)}
                disabled={isRestDay || isRestDayUpdating}
                style={{
                  opacity: isRestDay || isRestDayUpdating ? 0.4 : 1,
                  cursor:
                    isRestDay || isRestDayUpdating
                      ? "not-allowed"
                      : "pointer",
                  filter:
                    isRestDay || isRestDayUpdating
                      ? "grayscale(0.7)"
                      : "none",
                  transition: "all 180ms ease",
                }}
                title={
                  isRestDay
                    ? "Undo your rest day before logging push-ups"
                    : "Log push-ups"
                }
              >
                + Log push-ups
              </button>

              <button
                type="button"
                className="log-button streak-log-button"
                onClick={handleToggleRestDay}
                disabled={isRestDayUpdating || hasLoggedToday}
                aria-label={
                  isRestDay
                    ? "Undo today's rest day"
                    : "Mark today as a rest day"
                }
                aria-pressed={isRestDay}
                title={
                  hasLoggedToday
                    ? "You've already logged push-ups today"
                    : isRestDay
                      ? "Undo rest day"
                      : "Mark today as a rest day"
                }
                style={{
                  opacity: hasLoggedToday || isRestDayUpdating ? 0.4 : 1,
                  cursor:
                    isRestDayUpdating || hasLoggedToday
                      ? "not-allowed"
                      : "pointer",
                  background: isRestDay
                    ? "rgba(164, 25, 61, 0.8)"
                    : "#a4193d",
                  transition: "all 180ms ease",
                }}
              >
                <Moon
                  size={16}
                  strokeWidth={1.9}
                  fill={isRestDay ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                {isRestDay ? "Undo rest day" : "Mark rest day"}
              </button>
            </div>
          </div>

          <p className="card-description">
            {isRestDay
              ? "Rest day marked · Your streak is protected"
              : "Consecutive days with activity"}
          </p>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>

        {/* Last 7 days comparison */}
        <section className="dashboard-card seven-day-card">
          <div className="seven-day-header">
            <div>
              <h2 className="section-title">
                {chartRange === "week" ? "Last 7 days" : "Last 30 days"}
              </h2>
              <p className="section-description">
                Daily push-up reps · both users
              </p>
              <div
                role="group"
                aria-label="Graph date range"
                style={{ display: "inline-flex", gap: "5px", marginTop: "10px" }}
              >
                {(["week", "month"] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => {
                      setChartRange(range);
                      setHoveredChartIndex(null);
                    }}
                    aria-pressed={chartRange === range}
                    style={{
                      padding: "6px 12px",
                      border: `1px solid ${
                        chartRange === range ? "#a4193d" : "rgba(255, 223, 185, 0.2)"
                      }`,
                      borderRadius: "999px",
                      background: chartRange === range
                        ? "#a4193d"
                        : "rgba(255, 223, 185, 0.06)",
                      color: chartRange === range
                        ? "#ffffff"
                        : "rgba(255, 223, 185, 0.65)",
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: "12px",
                    }}
                  >
                    {range === "week" ? "Week" : "Month"}
                  </button>
                ))}
              </div>
            </div>

            <div className="seven-day-legend">
              <button
                type="button"
                className="legend-item"
                onClick={() => toggleSevenDayUser("Icefox")}
                aria-pressed={visibleSevenDayUsers.Icefox}
                style={{
                  padding: "7px 11px",
                  border: `1px solid ${
                    visibleSevenDayUsers.Icefox
                      ? "#a4193d"
                      : "rgba(255, 223, 185, 0.2)"
                  }`,
                  borderRadius: "999px",
                  background: visibleSevenDayUsers.Icefox
                    ? "#a4193d"
                    : "rgba(255, 223, 185, 0.06)",
                  color: visibleSevenDayUsers.Icefox
                    ? "#ffffff"
                    : "rgba(255, 223, 185, 0.45)",
                  cursor: "pointer",
                  opacity: visibleSevenDayUsers.Icefox ? 1 : 0.65,
                  transition: "all 180ms ease",
                }}
              >
                Icefox
              </button>

              <button
                type="button"
                className="legend-item"
                onClick={() => toggleSevenDayUser("Damian")}
                aria-pressed={visibleSevenDayUsers.Damian}
                style={{
                  padding: "7px 11px",
                  border: `1px solid ${
                    visibleSevenDayUsers.Damian
                      ? "#ffdfb9"
                      : "rgba(255, 223, 185, 0.2)"
                  }`,
                  borderRadius: "999px",
                  background: visibleSevenDayUsers.Damian
                    ? "#ffdfb9"
                    : "rgba(255, 223, 185, 0.06)",
                  color: visibleSevenDayUsers.Damian
                    ? "#100d1d"
                    : "rgba(255, 223, 185, 0.45)",
                  cursor: "pointer",
                  opacity: visibleSevenDayUsers.Damian ? 1 : 0.65,
                  transition: "all 180ms ease",
                }}
              >
                Damian
              </button>
            </div>
          </div>

          <div
            className="seven-day-chart"
            role="img"
            aria-label={`Daily push-up reps over the last ${chartRange === "week" ? "seven" : "thirty"} days. Icefox ${
              visibleSevenDayUsers.Icefox ? "visible" : "hidden"
            }, Damian ${
              visibleSevenDayUsers.Damian ? "visible" : "hidden"
            }.`}
            style={{ width: "100%", overflow: "hidden" }}
          >
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="presentation"
              aria-hidden="true"
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                overflow: "visible",
              }}
            >
              {[0, 1, 2, 3].map((line) => {
                const y = chartTop + (line / 3) * chartPlotHeight;
                const value = Math.round(maxDailyReps * (1 - line / 3));

                return (
                  <g key={line}>
                    <line
                      x1={chartLeft}
                      x2={chartRight}
                      y1={y}
                      y2={y}
                      stroke="rgba(255, 223, 185, 0.12)"
                      strokeDasharray="4 6"
                    />
                    <text
                      x={chartLeft - 10}
                      y={y + 4}
                      textAnchor="end"
                      fill="rgba(255, 223, 185, 0.48)"
                      fontSize="11"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}

              {visibleSevenDayUsers.Icefox && chartDays.length > 0 && (
                <>
                  <path
                    d={getLinePath("Icefox")}
                    fill="none"
                    stroke="#A4193D"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {chartDays.map((day, index) => {
                    if (day.restDays?.Icefox) return null;

                    return (
                      <circle
                        key={`icefox-${day.date}`}
                        cx={getChartX(index)}
                        cy={getChartY(day.Icefox)}
                        r="5"
                        fill="#A4193D"
                        stroke="#160f18"
                        strokeWidth="2"
                        onFocus={() => setHoveredChartIndex(index)}
                        onBlur={() => setHoveredChartIndex(null)}
                        tabIndex={0}
                      >
                        <title>{`Icefox: ${day.Icefox} reps`}</title>
                      </circle>
                    );
                  })}
                </>
              )}

              {visibleSevenDayUsers.Damian && chartDays.length > 0 && (
                <>
                  <path
                    d={getLinePath("Damian")}
                    fill="none"
                    stroke="#FFDFB9"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {chartDays.map((day, index) => {
                    if (day.restDays?.Damian) return null;

                    return (
                      <circle
                        key={`damian-${day.date}`}
                        cx={getChartX(index)}
                        cy={getChartY(day.Damian)}
                        r="5"
                        fill="#FFDFB9"
                        stroke="#160f18"
                        strokeWidth="2"
                        onFocus={() => setHoveredChartIndex(index)}
                        onBlur={() => setHoveredChartIndex(null)}
                        tabIndex={0}
                      >
                        <title>{`Damian: ${day.Damian} reps`}</title>
                      </circle>
                    );
                  })}
                </>
              )}

              {chartDays.map((day, index) => {
                const { weekday, day: dayNumber } = formatDay(day.date);
                const x = getChartX(index);
                const parsedDate = new Date(`${day.date}T00:00:00`);
                const showMonthLabel =
                  chartRange === "week" ||
                  index % 5 === 0 ||
                  index === chartDays.length - 1;

                if (!showMonthLabel) return null;

                return (
                  <g key={`date-${day.date}`}>
                    <text
                      x={x}
                      y="220"
                      textAnchor="middle"
                      fill="rgba(255, 223, 185, 0.7)"
                      fontSize="12"
                    >
                      {chartRange === "week"
                        ? weekday
                        : parsedDate.toLocaleDateString("en-US", { month: "short" })}
                    </text>
                    <text
                      x={x}
                      y="237"
                      textAnchor="middle"
                      fill="rgba(255, 223, 185, 0.45)"
                      fontSize="10"
                    >
                      {dayNumber}
                    </text>
                  </g>
                );
              })}

              {/* Full-height hover columns: hovering anywhere above a date selects it. */}
              {chartDays.map((day, index) => {
                const pointX = getChartX(index);
                const previousX = index === 0
                  ? chartLeft
                  : (getChartX(index - 1) + pointX) / 2;
                const nextX = index === chartDays.length - 1
                  ? chartRight
                  : (pointX + getChartX(index + 1)) / 2;

                return (
                  <rect
                    key={`hover-column-${day.date}`}
                    x={previousX}
                    y={chartTop}
                    width={Math.max(1, nextX - previousX)}
                    height={chartHeight - chartTop - 4}
                    fill="transparent"
                    pointerEvents="all"
                    onMouseEnter={() => setHoveredChartIndex(index)}
                    onMouseLeave={() => setHoveredChartIndex(null)}
                    onFocus={() => setHoveredChartIndex(index)}
                    onBlur={() => setHoveredChartIndex(null)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Show reps for ${day.date}`}
                  />
                );
              })}

              {hoveredChartIndex !== null && chartDays[hoveredChartIndex] && (() => {
                const day = chartDays[hoveredChartIndex];
                const x = getChartX(hoveredChartIndex);
                const y = Math.min(
                  getChartY(Math.max(day.Icefox, day.Damian)),
                  chartBottom - 8
                );
                const tooltipWidth = 190;
                const tooltipHeight = 84;
                const tooltipX = Math.max(
                  8,
                  Math.min(x + 12, chartWidth - tooltipWidth - 8)
                );
                const tooltipY = Math.max(
                  8,
                  Math.min(y - tooltipHeight - 10, chartBottom - tooltipHeight - 4)
                );
                const tooltipDate = new Date(`${day.date}T00:00:00`)
                  .toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });

                return (
                  <g
                    pointerEvents="none"
                    style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" }}
                  >
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={tooltipWidth}
                      height={tooltipHeight}
                      rx="8"
                      fill="#21171c"
                      stroke="rgba(255, 223, 185, 0.35)"
                    />
                    <text
                      x={tooltipX + 12}
                      y={tooltipY + 24}
                      fill="#FFDFB9"
                      fontSize="13"
                      fontWeight="700"
                    >
                      {tooltipDate}
                    </text>
                    <text
                      x={tooltipX + 12}
                      y={tooltipY + 50}
                      fill="#E5A0B3"
                      fontSize="13"
                    >
                      {`Icefox: ${
                        day.restDays?.Icefox ? "Rest day" : `${day.Icefox} reps`
                      }`}
                    </text>
                    <text
                      x={tooltipX + 12}
                      y={tooltipY + 72}
                      fill="#FFDFB9"
                      fontSize="13"
                    >
                      {`Damian: ${
                        day.restDays?.Damian ? "Rest day" : `${day.Damian} reps`
                      }`}
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>

          <div className="seven-day-footer">
            <span className="chart-caption">Reps per day</span>

            <div className="seven-day-totals">
              {visibleSevenDayUsers.Icefox && (
                <span className="seven-day-total">
                  <i className="legend-dot icefox-dot" />
                  Icefox <strong>{icefoxTotal}</strong>
                </span>
              )}

              {visibleSevenDayUsers.Damian && (
                <span className="seven-day-total">
                  <i className="legend-dot damian-dot" />
                  Damian <strong>{damianTotal}</strong>
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Calendar and daily breakdown */}
        <div className="dashboard-detail-grid">
          <MonthView
            refreshKey={monthRefreshKey}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />

          <div className="dashboard-right-column">
            <section className="dashboard-card daily-breakdown-card">
              <div className="daily-breakdown-heading">
                <div>
                  <p className="card-label">DAILY BREAKDOWN</p>
                  <h2 className="section-title">
                    {formatSelectedDate(selectedDate)}
                  </h2>
                </div>
              </div>

              {monthError ? (
                <p className="calendar-message" role="alert">
                  {monthError}
                </p>
              ) : !monthData ? (
                <p className="daily-empty-message">
                  Loading daily activity...
                </p>
              ) : (
                <div className="daily-breakdown-users">
                  {renderDailyBreakdown("Icefox")}
                  {renderDailyBreakdown("Damian")}
                </div>
              )}
            </section>

        {/* Personal bests for the signed-in user */}
        <section className="dashboard-card personal-bests-card">
          <div className="personal-bests-heading">
            <div>
              <p className="card-label">YOUR PERSONAL BESTS</p>
              <h2 className="section-title">{user}</h2>
            </div>
            <p className="section-description">All-time records</p>
          </div>

          <div
            className="personal-bests-grid"
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: "16px",
            }}
          >
            <div
              className="personal-best-item"
              style={{
                padding: "18px",
                borderRadius: "14px",
                background: "rgba(255, 255, 255, 0.035)",
                border: "1px solid rgba(255, 223, 185, 0.1)",
              }}
            >
              <p className="card-label">BEST DAILY REPS</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "7px",
                }}
              >
                <strong style={{ fontSize: "2rem", color: "#A4193D" }}>
                  {dailyBest?.reps ?? 0}
                </strong>
                <span className="section-description">reps</span>
              </div>
              <p className="section-description" style={{ marginTop: "4px" }}>
                {formatRecordDate(dailyBest?.date)}
              </p>

              <div
                role="progressbar"
                aria-label="Today's progress toward your daily personal best"
                aria-valuenow={Math.round(dailyProgress)}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  height: "8px",
                  marginTop: "18px",
                  borderRadius: "99px",
                  overflow: "hidden",
                  background: "rgba(255, 223, 185, 0.12)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${dailyProgress}%`,
                    borderRadius: "99px",
                    background: "#A4193D",
                    transition: "width 250ms ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginTop: "8px",
                  fontSize: "0.82rem",
                  color: "rgba(255, 223, 185, 0.7)",
                }}
              >
                <span>Today: {todayReps} reps</span>
                <strong>{Math.round(dailyProgress)}%</strong>
              </div>
            </div>

            <div
              className="personal-best-item"
              style={{
                padding: "18px",
                borderRadius: "14px",
                background: "rgba(255, 255, 255, 0.035)",
                border: "1px solid rgba(255, 223, 185, 0.1)",
              }}
            >
              <p className="card-label">BEST WEEKLY REPS</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "7px",
                }}
              >
                <strong style={{ fontSize: "2rem", color: "#FFDFB9" }}>
                  {weeklyBest?.reps ?? 0}
                </strong>
                <span className="section-description">reps</span>
              </div>
              <p className="section-description" style={{ marginTop: "4px" }}>
                {weeklyBest?.startDate && weeklyBest?.endDate
                  ? `${formatRecordDate(weeklyBest.startDate)} – ${formatRecordDate(weeklyBest.endDate)}`
                  : "No record yet"}
              </p>

              <div
                role="progressbar"
                aria-label="This week's progress toward your weekly personal best"
                aria-valuenow={Math.round(weeklyProgress)}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  height: "8px",
                  marginTop: "18px",
                  borderRadius: "99px",
                  overflow: "hidden",
                  background: "rgba(255, 223, 185, 0.12)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${weeklyProgress}%`,
                    borderRadius: "99px",
                    background: "#FFDFB9",
                    transition: "width 250ms ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginTop: "8px",
                  fontSize: "0.82rem",
                  color: "rgba(255, 223, 185, 0.7)",
                }}
              >
                <span>This week: {thisWeekReps} reps</span>
                <strong>{Math.round(weeklyProgress)}%</strong>
              </div>
            </div>
          </div>
        </section>
          </div>
        </div>
      </div>

      {/* Logging modal */}
      {isLogging && (
        <LogPushups
          onSave={handleSaveSet}
          onClose={() => setIsLogging(false)}
        />
      )}

      {/* Notification settings modal */}
      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
    </main>
  );
}

export default Dashboard;
