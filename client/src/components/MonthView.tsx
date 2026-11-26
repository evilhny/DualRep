
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Moon } from "lucide-react";
import { getMonth, type MonthData } from "../api";

interface MonthViewProps {
  refreshKey: number;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

type MonthDirection = "next" | "previous";

function MonthView({
  refreshKey,
  selectedDate,
  onSelectDate,
}: MonthViewProps) {
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

        <h2>
          {monthName} {year}
        </h2>

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
          <Moon size={12} className="legend-rest-icon icefox-rest" />
        </div>

        <div>
          <span className="legend-dot damian-dot" />
          Damian
          <Moon size={12} className="legend-rest-icon damian-rest" />
        </div>
      </div>

      <div className="calendar-weekdays">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      {error && (
        <p className="calendar-message" role="alert">
          {error}
        </p>
      )}

      <div
        className={`calendar-grid slide-${direction}`}
        key={animationKey}
        aria-busy={!data && !error}
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

          const icefoxTotal = data?.data.Icefox?.[dateKey] ?? 0;
          const damianTotal = data?.data.Damian?.[dateKey] ?? 0;

          const icefoxRestDay =
            data?.restDays?.Icefox?.includes(dateKey) ?? false;

          const damianRestDay =
            data?.restDays?.Damian?.includes(dateKey) ?? false;

          const hasActivity =
            icefoxTotal > 0 ||
            damianTotal > 0 ||
            icefoxRestDay ||
            damianRestDay;

          const isToday =
            today.getFullYear() === year &&
            today.getMonth() + 1 === month &&
            today.getDate() === day;

          const isSelected = selectedDate === dateKey;

          const tooltip = [
            `Icefox: ${icefoxRestDay ? "Rest day" : `${icefoxTotal} reps`}`,
            `Damian: ${damianRestDay ? "Rest day" : `${damianTotal} reps`}`,
          ].join(" | ");

          return (
            <button
              type="button"
              className={[
                "calendar-day",
                hasActivity ? "active" : "",
                icefoxRestDay || damianRestDay ? "rest-day" : "",
                isToday ? "today" : "",
                isSelected ? "selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={day}
              style={animationStyle}
              title={tooltip}
              onClick={() => onSelectDate(dateKey)}
              aria-label={`${dateKey}. ${tooltip}`}
              aria-pressed={isSelected}
            >
              <span className="day-number">{day}</span>

              <div className="activity-indicators">
                {icefoxRestDay ? (
                  <Moon
                    size={12}
                    className="activity-rest icefox-rest"
                    aria-label="Icefox rest day"
                  />
                ) : (
                  icefoxTotal > 0 && (
                    <span className="activity-dot icefox-dot" />
                  )
                )}

                {damianRestDay ? (
                  <Moon
                    size={12}
                    className="activity-rest damian-rest"
                    aria-label="Damian rest day"
                  />
                ) : (
                  damianTotal > 0 && (
                    <span className="activity-dot damian-dot" />
                  )
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default MonthView;
