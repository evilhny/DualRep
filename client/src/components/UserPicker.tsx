
import { useState, type FormEvent } from "react";
import {
  checkUsername,
  login,
  setupPassword,
} from "../api";

interface UserPickerProps {
  onAuthenticated: (user: string) => void;
}

function UserPicker({ onAuthenticated }: UserPickerProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [step, setStep] = useState<"username" | "password">("username");
  const [setupMode, setSetupMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUsernameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const normalizedUsername = username.trim().toLowerCase();

      const result = await checkUsername(normalizedUsername);

      setUsername(normalizedUsername);
      setSetupMode(result.setupRequired);
      setPassword("");
      setConfirmPassword("");
      setStep("password");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not verify username."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      if (setupMode) {
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }

        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }

        const result = await setupPassword(username, password);
        onAuthenticated(result.user);
      } else {
        const result = await login(username, password);
        onAuthenticated(result.user);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Authentication failed."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep("username");
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  return (
    <main className="app">
      <section
        className="user-picker panel-enter"
        aria-labelledby="auth-title"
      >
        <img
          src="/favicon.svg"
          alt="DualRep"
          className="logo-image"
        />

        <h1 id="auth-title">DualRep</h1>
        <p>Push together. Stay consistent.</p>

        {step === "username" ? (
          <>
            <h2>Welcome</h2>

            <form
              className="auth-form"
              onSubmit={handleUsernameSubmit}
            >
              <input
                className="auth-input"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
              />

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" disabled={loading}>
                {loading ? "Checking..." : "Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>
              {setupMode ? "Create your password" : "Welcome back"}
            </h2>

            <p>
              {setupMode
                ? `Create a password for ${username}.`
                : `Signing in as ${username}.`}
            </p>

            <form
              className="auth-form"
              onSubmit={handlePasswordSubmit}
            >
              <input
                className="auth-input"
                type="password"
                placeholder={
                  setupMode ? "Create password" : "Password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  setupMode ? "new-password" : "current-password"
                }
                minLength={setupMode ? 8 : undefined}
                autoFocus
                required
              />

              {setupMode && (
                <input
                  className="auth-input"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              )}

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : setupMode
                    ? "Set password"
                    : "Login"}
              </button>

              <button
                type="button"
                className="auth-secondary"
                onClick={handleBack}
                disabled={loading}
              >
                Back
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export default UserPicker;
