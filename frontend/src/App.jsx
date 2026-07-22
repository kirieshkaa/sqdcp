import React, { useState, useEffect, createContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./api/client";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BoardDetail from "./pages/BoardDetail";
import Calendar from "./pages/Calendar";
import Canban from "./pages/Canban";
import Departments from "./pages/Departments";
import DepartmentDetail from "./pages/DepartmentDetail";
import Logs from "./pages/Logs";
import SqdcpStats from "./pages/SqdcpStats";
import Registrations from "./pages/Registrations";
import { canUseAdminPages, canUseBoards, canUseCalendar, canUseCanban, canUseDepartments, defaultPathForUser } from "./permissions";

export const UserContext = createContext(null);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api.getMe().then(setUser).catch(() => localStorage.removeItem("token")).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => currentTheme === "dark" ? "light" : "dark");
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  const defaultPath = defaultPathForUser(user);
  const guard = (canAccess, element) => (canAccess ? element : <Navigate to={defaultPath} />);

  return (
    <UserContext.Provider value={user}>
      <div className="app-layout">
        <Sidebar
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={() => { localStorage.removeItem("token"); setUser(null); }}
        />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to={defaultPath} />} />
            <Route path="/boards" element={guard(canUseBoards(user), <Dashboard />)} />
            <Route path="/boards/:id" element={guard(canUseBoards(user), <BoardDetail />)} />
            <Route path="/calendar" element={guard(canUseCalendar(user), <Calendar />)} />
            <Route path="/canban" element={guard(canUseCanban(user), <Canban />)} />
            <Route path="/departments" element={guard(canUseDepartments(user), <Departments />)} />
            <Route path="/departments/:id" element={guard(canUseDepartments(user), <DepartmentDetail />)} />
            <Route path="/logs" element={guard(canUseAdminPages(user), <Logs />)} />
            <Route path="/sqdcp-stats" element={guard(canUseAdminPages(user), <SqdcpStats />)} />
            <Route path="/sqdcp stats" element={guard(canUseAdminPages(user), <SqdcpStats />)} />
            <Route path="/registrations" element={guard(canUseAdminPages(user), <Registrations />)} />
            <Route path="*" element={<Navigate to={defaultPath} />} />
          </Routes>
        </main>
      </div>
    </UserContext.Provider>
  );
}

export default App;
