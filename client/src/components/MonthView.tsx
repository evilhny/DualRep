
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { getMonth, type MonthData } from "../api";

interface MonthViewProps {
  refreshKey: number;
}

type MonthDirection = "next" | "previous";

function MonthView({ refreshKey }: MonthViewProps) {
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<MonthData | null>(null);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState<MonthDirection>("next");
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadMonth() {
      setData(null);
      setError("");

      try {
        const result = await getMonth(year, month);

        if (!cancelled) {
          setData(result);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load calendar data.");
        }
      }
    }

    loadMonth();

    return () => {
      cancelled = true;
    };
  }, [year, month, refreshKey]);

  const monthName = new Date(year, month - 1).toLocaleString("en", {
    month: "long",
  });

  const daysInMonth = new Date(year, month, 0).getDate();

  // Calendar starts on Monday.
  const firstDayOffset =
    (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const calendarCells: (number | null)[] = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  function changeMonth(monthDirection: number) {
    setDirection(monthDirection > 0 ? "next" : "previous");
    setAnimationKey((current) => current + 1);

    const date = new Date(year, month - 1 + monthDirection, 1);

    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  }

  function getDateKey(day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <section className="month-view">
      <div className="month-navigation">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
        >
          ‹
        </button>

        <h2>{monthName} {year}</h2>

        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="calendar-legend">
        <div>
          <span className="legend-dot icefox-dot" />
          Icefox
        </div>

        <div>
          <span className="legend-dot damian-dot" />
          Damian
        </div>
      </div>

      <div className="calendar-weekdays">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {error ? (
        <p className="calendar-message" role="alert">
          {error}
        </p>
      ) : !data ? (
        <div
          className="calendar-message loading-spinner"
          aria-live="polite"
        >
          <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Loading calendar"
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
      ) : (
        <div
          className={`calendar-grid slide-${direction}`}
          key={animationKey}
        >
          {calendarCells.map((day, index) => {
            const animationStyle = {
              "--cell-delay": `${Math.min(index, 41) * 18}ms`,
            } as CSSProperties;

            if (day === null) {
              return (
                <div
                  className="calendar-day calendar-empty"
                  key={`empty-${index}`}
                  style={animationStyle}
                  aria-hidden="true"
                />
              );
            }

            const dateKey = getDateKey(day);
            const icefoxTotal = data.data.Icefox?.[dateKey] ?? 0;
            const damianTotal = data.data.Damian?.[dateKey] ?? 0;

            const isToday =
              today.getFullYear() === year &&
              today.getMonth() + 1 === month &&
              today.getDate() === day;

            return (
              <div
                className={[
                  "calendar-day",
                  icefoxTotal > 0 || damianTotal > 0 ? "active" : "",
                  isToday ? "today" : "",
                ].join(" ")}
                key={day}
                style={animationStyle}
                title={`Icefox: ${icefoxTotal} reps | Damian: ${damianTotal} reps`}
              >
                <span className="day-number">{day}</span>

                <div className="activity-indicators">
                  {icefoxTotal > 0 && (
                    <span className="activity-dot icefox-dot" />
                  )}

                  {damianTotal > 0 && (
                    <span className="activity-dot damian-dot" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default MonthView;
