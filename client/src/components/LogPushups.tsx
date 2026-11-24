
import { useState } from "react";
import type { PushupSet, PushupType } from "../api";

interface LogPushupsProps {
  onSave: (sets: PushupSet[]) => Promise<void>;
  onClose: () => void;
}

const pushupTypes: PushupType[] = [
  "Regular",
  "Diamond",
  "Wide",
  "Clap",
  "Finger",
];

const CLOSE_ANIMATION_MS = 180;

interface TypeEntry {
  enabled: boolean;
  reps: number;
}

function LogPushups({ onSave, onClose }: LogPushupsProps) {
  const [entries, setEntries] = useState<Record<PushupType, TypeEntry>>({
    Regular: { enabled: true, reps: 0 },
    Diamond: { enabled: false, reps: 0 },
    Wide: { enabled: false, reps: 0 },
    Clap: { enabled: false, reps: 0 },
    Finger: { enabled: false, reps: 0 },
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState("");

  const totalReps = pushupTypes.reduce((total, type) => {
    const entry = entries[type];
    return entry.enabled ? total + entry.reps : total;
  }, 0);

  function handleClose() {
    if (isClosing) return;

    setIsClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  function toggleType(type: PushupType) {
    setEntries((current) => ({
      ...current,
      [type]: {
        ...current[type],
        enabled: !current[type].enabled,
      },
    }));
  }

  function changeReps(type: PushupType, amount: number) {
    setEntries((current) => ({
      ...current,
      [type]: {
        ...current[type],
        reps: Math.max(0, current[type].reps + amount),
      },
    }));
  }

  function handleRepsInput(type: PushupType, value: string) {
    const reps = Number(value);

    setEntries((current) => ({
      ...current,
      [type]: {
        ...current[type],
        reps: Number.isFinite(reps) ? Math.max(0, Math.floor(reps)) : 0,
      },
    }));
  }

  async function handleSave() {
    const sets: PushupSet[] = pushupTypes
      .filter((type) => entries[type].enabled && entries[type].reps > 0)
      .map((type) => ({
        type,
        reps: entries[type].reps,
      }));

    if (sets.length === 0) {
      setError("Add at least one push-up set before saving.");
      return;
    }

    try {
      setError("");
      setIsSaving(true);
      await onSave(sets);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save your push-ups."
      );
      setIsSaving(false);
    }
  }

  return (
    <div className={`modal-overlay${isClosing ? " is-closing" : ""}`}>
      <div
        className={`log-modal${isClosing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-pushups-title"
      >
        <button
          type="button"
          className="close-button"
          onClick={handleClose}
          aria-label="Close"
          disabled={isClosing}
        >
          ×
        </button>

        <p className="modal-eyebrow">LOG A SET</p>

        <h2 id="log-pushups-title">What did you do?</h2>

        <div className="pushup-list">
          {pushupTypes.map((type) => {
            const entry = entries[type];

            return (
              <div
                className={`pushup-row ${entry.enabled ? "enabled" : ""}`}
                key={type}
              >
                <label className="pushup-name">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() => toggleType(type)}
                    className="type-checkbox"
                    disabled={isClosing || isSaving}
                  />

                  <span>{type}</span>
                </label>

                <div className="reps-control">
                  <button
                    type="button"
                    className="reps-adjust"
                    onClick={() => changeReps(type, -1)}
                    disabled={
                      isClosing ||
                      isSaving ||
                      !entry.enabled ||
                      entry.reps <= 0
                    }
                    aria-label={`Decrease ${type} reps`}
                  >
                    −
                  </button>

                  <input
                    type="number"
                    min="0"
                    value={entry.reps || ""}
                    placeholder="0"
                    disabled={isClosing || isSaving || !entry.enabled}
                    onChange={(event) =>
                      handleRepsInput(type, event.target.value)
                    }
                    className="type-reps"
                    aria-label={`${type} reps`}
                  />

                  <button
                    type="button"
                    className="reps-adjust"
                    onClick={() => changeReps(type, 1)}
                    disabled={isClosing || isSaving || !entry.enabled}
                    aria-label={`Increase ${type} reps`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="summary">
          <span className="summary-label">TOTAL REPS</span>
          <strong className="summary-total">{totalReps}</strong>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          type="button"
          className="save-button"
          onClick={handleSave}
          disabled={isSaving || isClosing || totalReps === 0}
        >
          {isSaving
            ? "Saving..."
            : `Save ${totalReps} Push-up${totalReps === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

export default LogPushups;
