
import { useEffect, useState } from "react";
import UserPicker from "./components/UserPicker";
import Dashboard from "./components/Dashboard";
import {
  getCurrentUser,
  getDashboard,
  logout,
  type DashboardData,
} from "./api";
import "./styles.css";

function App() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialDashboardData, setInitialDashboardData] =
    useState<DashboardData | null>(null);

  // Restore session and preload dashboard data.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const currentUser = await getCurrentUser();

        if (cancelled) return;

        setUser(currentUser);

        // Fetch dashboard data before removing the loading screen.
        if (currentUser) {
          const dashboardData = await getDashboard();

          if (!cancelled) {
            setInitialDashboardData(dashboardData);
          }
        }
      } catch (error) {
        console.error("Session restoration failed:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logout();
    setInitialDashboardData(null);
    setUser(null);
  }

  // Initial loading spinner.
  if (loading) {
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

  if (!user) {
    return <UserPicker onAuthenticated={setUser} />;
  }

  return (
    <Dashboard
      user={user}
      onLogout={handleLogout}
      initialData={initialDashboardData}
    />
  );
}

export default App;
