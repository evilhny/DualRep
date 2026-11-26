
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
  type PushupType,
} from "../api";
import LogPushups from "./LogPushups";
import MonthView from "./MonthView";
import SettingsModal from "./Settings";

interface DashboardProps {
  user: string;
  onLogout: () => void;
  initialData: DashboardData | null;
}

const pushupTypes: PushupType[] = [
  "Regular",
  "Diamond",
  "Wide",
  "Clap",
  "Finger",
];

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

  const [expandedUsers, setExpandedUsers] = useState<
    Record<string, boolean>
  >({
    Icefox: false,
    Damian: false,
  });

  const [visibleSevenDayUsers, setVisibleSevenDayUsers] = useState({
    Icefox: true,
    Damian: true,
  });

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

  function toggleUser(userName: string) {
    setExpandedUsers((current) => ({
      ...current,
      [userName]: !current[userName],
    }));
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

  const maxDailyReps = Math.max(
    1,
    ...last7Days.flatMap((day) => [
      ...(visibleSevenDayUsers.Icefox ? [day.Icefox] : []),
      ...(visibleSevenDayUsers.Damian ? [day.Damian] : []),
    ])
  );

  const icefoxTotal = visibleSevenDayUsers.Icefox
    ? last7Days.reduce((total, day) => total + day.Icefox, 0)
    : 0;

  const damianTotal = visibleSevenDayUsers.Damian
    ? last7Days.reduce((total, day) => total + day.Damian, 0)
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
              <h2 className="section-title">Last 7 days</h2>
              <p className="section-description">
                Daily push-up reps · both users
              </p>
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
            aria-label={`Daily push-up reps over the last seven days. Icefox ${
              visibleSevenDayUsers.Icefox ? "visible" : "hidden"
            }, Damian ${
              visibleSevenDayUsers.Damian ? "visible" : "hidden"
            }.`}
          >
            {last7Days.map((day) => {
              const { weekday, day: dayNumber } = formatDay(day.date);

              const icefoxHeight =
                (day.Icefox / maxDailyReps) * 100;

              const damianHeight =
                (day.Damian / maxDailyReps) * 100;

              const icefoxRestDay = Boolean(day.restDays?.Icefox);
              const damianRestDay = Boolean(day.restDays?.Damian);

              return (
                <div className="seven-day-column" key={day.date}>
                  <div className="seven-day-bars">
                    {visibleSevenDayUsers.Icefox &&
                      (icefoxRestDay ? (
                        <Moon
                          size={17}
                          strokeWidth={2}
                          fill="#ff174f"
                          color="#ff174f"
                          aria-label="Icefox rest day"
                        />
                      ) : (
                        <div
                          className="seven-day-bar icefox-bar"
                          style={{ height: `${icefoxHeight}%` }}
                          title={`Icefox: ${day.Icefox} reps`}
                        />
                      ))}

                    {visibleSevenDayUsers.Damian &&
                      (damianRestDay ? (
                        <Moon
                          size={17}
                          strokeWidth={2}
                          fill="currentColor"
                          color="#ffdfb9"
                          aria-label="Damian rest day"
                        />
                      ) : (
                        <div
                          className="seven-day-bar damian-bar"
                          style={{ height: `${damianHeight}%` }}
                          title={`Damian: ${day.Damian} reps`}
                        />
                      ))}
                  </div>

                  <span className="seven-day-label">
                    {weekday} {dayNumber}
                  </span>
                </div>
              );
            })}
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

            <section className="dashboard-card weekly-summary-section">
              <div className="weekly-summary-heading">
                <p className="card-label">THIS WEEK</p>
              </div>
              <div className="weekly-comparison-grid">
              {["Icefox", "Damian"].map((userName) => {
            const weeklyData = data.week[userName];
            const isExpanded = Boolean(expandedUsers[userName]);

            return (
              <div
                className={`weekly-user weekly-user-column ${isExpanded ? "expanded" : ""}`}
                key={userName}
              >
                <button
                  type="button"
                  className="user-total"
                  onClick={() => toggleUser(userName)}
                  aria-expanded={isExpanded}
                  aria-controls={`weekly-breakdown-${userName.toLowerCase()}`}
                >
                  <span className="user-name">{userName}</span>

                  <span className="user-total-value">
                    <strong style={{ fontSize: "1.45rem" }}>
                      {weeklyData?.total ?? 0}
                    </strong>

                    <span
                      className={`expand-arrow ${
                        isExpanded ? "expanded" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ▶
                    </span>
                  </span>
                </button>

                <div
                  className="pushup-breakdown"
                  id={`weekly-breakdown-${userName.toLowerCase()}`}
                  aria-hidden={!isExpanded}
                >
                  {(weeklyData?.total ?? 0) === 0 ? (
                    <p className="no-pushups">
                      No push-ups logged this week.
                    </p>
                  ) : (
                    pushupTypes.map((type) => {
                      const reps = weeklyData?.types?.[type] ?? 0;

                      if (reps === 0) {
                        return null;
                      }

                      return (
                        <div
                          className="pushup-breakdown-row"
                          key={type}
                        >
                          <span>{type}</span>
                          <strong>{reps}</strong>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}

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
