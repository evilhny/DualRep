import { useState } from "react";
import UserPicker from "./components/UserPicker";
import Dashboard from "./components/Dashboard";
import "./styles.css";

function App() {
  const [user, setUser] = useState<string | null>(() => {
    return localStorage.getItem("dualrep-user");
  });

  if (!user) {
    return <UserPicker onSelectUser={setUser} />;
  }

  return <Dashboard user={user} />;
}

export default App;