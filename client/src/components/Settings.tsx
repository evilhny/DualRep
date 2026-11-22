import { useEffect, useState } from "react";
import {
  getNotificationSettings,
  saveNotificationSettings,
  sendTestDiscordDm,
  type NotificationSettings as NotificationSettingsType,
} from "../api";

interface Props {
  onClose: () => void;
}

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 7 },
];

function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<NotificationSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getNotificationSettings()
      .then((result) => {
        if (!cancelled) setSettings(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  function update<K extends keyof NotificationSettingsType>(
    key: K,
    value: NotificationSettingsType[K]
  ) {
    setSettings((current) =>
      current ? { ...current, [key]: value } : current
    );
    setMessage("");
    setError("");
  }

  function toggleDay(day: number) {
    if (!settings) return;

    const next = settings.reminderDays.includes(day)
      ? settings.reminderDays.filter((item) => item !== day)
      : [...settings.reminderDays, day].sort((a, b) => a - b);

    update("reminderDays", next);
  }

  async function handleSave() {
    if (!settings) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const result = await saveNotificationSettings({
        reminderEnabled: settings.reminderEnabled,
        reminderTime: settings.reminderTime,
        reminderDays: settings.reminderDays,
        partnerSetEnabled: settings.partnerSetEnabled,
      });

      setSettings(result);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save settings."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTestDm() {
    setTesting(true);
    setError("");
    setMessage("");

    try {
      const result = await sendTestDiscordDm();
      setCooldownSeconds(result.cooldownSeconds);
      setMessage("Test DM sent to your Discord account.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send test DM."
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-overlay">
        <section className="settings-panel">
          <p className="settings-loading">Loading notification settings…</p>
        </section>
      </div>
    );
  }

  if (!settings) {
    return (
      <div
        className="settings-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className="settings-panel">
          <button
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
          <p className="settings-error">{error || "Could not load settings."}</p>
        </section>
      </div>
    );
  }

  return (
    <div
      className="settings-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <button
          className="settings-close"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>

        <p className="settings-eyebrow">DUALREP</p>
        <h2 id="settings-title">Notification settings</h2>
        <p className="settings-intro">
          Manage Discord notifications for your account.
        </p>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <h3>Daily reminder</h3>
              <p>
                Get a DM if you haven’t logged push-ups by your reminder time.
              </p>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.reminderEnabled}
                onChange={(event) =>
                  update("reminderEnabled", event.target.checked)
                }
              />
              <span />
            </label>
          </div>

          <div
            className={`settings-controls ${
              !settings.reminderEnabled ? "is-disabled" : ""
            }`}
          >
            <label className="settings-field">
              <span>
                Reminder time <small>IST</small>
              </span>
              <input
                type="time"
                value={settings.reminderTime}
                disabled={!settings.reminderEnabled}
                onChange={(event) =>
                  update("reminderTime", event.target.value)
                }
              />
            </label>

            <div className="settings-field">
              <span>Repeat on</span>
              <div className="settings-days">
                {DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    className={
                      settings.reminderDays.includes(day.value) ? "selected" : ""
                    }
                    disabled={!settings.reminderEnabled}
                    aria-pressed={settings.reminderDays.includes(day.value)}
                    onClick={() => toggleDay(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <h3>Activity notifications</h3>
              <p>Get notified when your partner logs a push-up set.</p>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={settings.partnerSetEnabled}
                onChange={(event) =>
                  update("partnerSetEnabled", event.target.checked)
                }
              />
              <span />
            </label>
          </div>
        </section>

        <section className="settings-section settings-test-section">
          <div>
            <h3>Discord connection</h3>
            <p>
              Send a test message to verify that Discord DMs are working.
            </p>
          </div>
          <button
            type="button"
            className="settings-test-button"
            disabled={testing || cooldownSeconds > 0}
            onClick={handleTestDm}
          >
            {testing
              ? "Sending…"
              : cooldownSeconds > 0
                ? `Try again in ${cooldownSeconds}s`
                : "Send test DM"}
          </button>
        </section>

        {message && (
          <p className="settings-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}

        <div className="settings-actions">
          <button
            type="button"
            className="settings-cancel"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="settings-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save and close"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default SettingsModal;
