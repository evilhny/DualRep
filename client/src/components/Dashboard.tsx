
import { useCallback, useEffect, useState } from "react";
import {
  getDashboard,
  logPushupSets,
  type DashboardData,
  type PushupSet,
  type PushupType,
} from "../api";
import LogPushups from "./LogPushups";
import MonthView from "./MonthView";

interface DashboardProps {
  user: string;
  onLogout: () => void;
}

const pushupTypes: PushupType[] = [
  "Regular",
  "Diamond",
  "Wide",
  "Clap",
];

function Dashboard({ user, onLogout }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [monthRefreshKey, setMonthRefreshKey] = useState(0);

  const [expandedUsers, setExpandedUsers] = useState<
    Record<string, boolean>
  >({
    Icefox: false,
    Damian: false,
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
    loadDashboard();
  }, [loadDashboard]);

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

  const maxDailyReps = Math.max(
    1,
    ...last7Days.flatMap((day) => [day.Icefox, day.Damian])
  );

  const icefoxTotal = last7Days.reduce(
    (total, day) => total + day.Icefox,
    0
  );

  const damianTotal = last7Days.reduce(
    (total, day) => total + day.Damian,
    0
  );

  function formatDay(date: string) {
    const parsedDate = new Date(`${date}T00:00:00`);

    return {
      weekday: parsedDate.toLocaleDateString("en-US", {
        weekday: "short",
      }),
      day: parsedDate.getDate(),
    };
  }

  return (
    <main className="app dashboard-page">
      <div className="dashboard">
        {/* Header */}
        <header className="dashboard-header">
          <p className="eyebrow">DUALREP</p>

          <div className="dashboard-account">
            <span>
              Signed in as <strong>{user}</strong>
            </span>

            <button
              type="button"
              className="logout-button"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        </header>

        <div className="dashboard-heading">
          <h1>Dashboard</h1>
        </div>

        {/* Streak and logging action */}
        <section className="dashboard-card streak-card">
          <p className="card-label">CURRENT STREAK</p>

          <div className="streak-content">
            <div className="streak">
              <strong>{yourStreak}</strong>
              <span>days</span>
            </div>

            <button
              type="button"
              className="log-button streak-log-button"
              onClick={() => setIsLogging(true)}
            >
              + Log push-ups
            </button>
          </div>

          <p className="card-description">
            Consecutive days with activity
          </p>
        </section>

        {/* Weekly comparison */}
        <section className="dashboard-card">
          <p className="card-label">THIS WEEK</p>

          {["Icefox", "Damian"].map((userName) => {
            const weeklyData = data.week[userName];
            const isExpanded = Boolean(expandedUsers[userName]);

            return (
              <div
                className={`weekly-user ${isExpanded ? "expanded" : ""}`}
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
                    <strong>{weeklyData?.total ?? 0}</strong>

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
              <span className="legend-item">
                <i className="legend-dot icefox-dot" />
                Icefox
              </span>

              <span className="legend-item">
                <i className="legend-dot damian-dot" />
                Damian
              </span>
            </div>
          </div>

          <div
            className="seven-day-chart"
            role="img"
            aria-label="Daily push-up reps for Icefox and Damian over the last seven days"
          >
            {last7Days.map((day) => {
              const { weekday, day: dayNumber } = formatDay(day.date);

              const icefoxHeight =
                (day.Icefox / maxDailyReps) * 100;

              const damianHeight =
                (day.Damian / maxDailyReps) * 100;

              return (
                <div className="seven-day-column" key={day.date}>
                  <div className="seven-day-bars">
                    <div
                      className="seven-day-bar icefox-bar"
                      style={{ height: `${icefoxHeight}%` }}
                      title={`Icefox: ${day.Icefox} reps`}
                    />

                    <div
                      className="seven-day-bar damian-bar"
                      style={{ height: `${damianHeight}%` }}
                      title={`Damian: ${day.Damian} reps`}
                    />
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
              <span className="seven-day-total">
                <i className="legend-dot icefox-dot" />
                Icefox <strong>{icefoxTotal}</strong>
              </span>

              <span className="seven-day-total">
                <i className="legend-dot damian-dot" />
                Damian <strong>{damianTotal}</strong>
              </span>
            </div>
          </div>
        </section>

        {/* Shared monthly calendar */}
        <MonthView refreshKey={monthRefreshKey} />
      </div>

      {/* Logging modal */}
      {isLogging && (
        <LogPushups
          onSave={handleSaveSet}
          onClose={() => setIsLogging(false)}
        />
      )}
    </main>
  );
}

export default Dashboard;
