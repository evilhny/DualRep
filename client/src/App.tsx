
import { useEffect, useState } from "react";
import UserPicker from "./components/UserPicker";
import Dashboard from "./components/Dashboard";
import { getCurrentUser, logout } from "./api";
import "./styles.css";

function App() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the existing server-side login session.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const currentUser = await getCurrentUser();

        if (!cancelled) {
          setUser(currentUser);
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
    setUser(null);
  }

  if (loading) {
    return (
      <div className="app-loading">
        Loading DualRep...
      </div>
    );
  }

  if (!user) {
    return <UserPicker onAuthenticated={setUser} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

export default App;
