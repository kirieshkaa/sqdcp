import React, { useState, useEffect, createContext } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api } from "./api/client";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BoardDetail from "./pages/BoardDetail";
import Calendar from "./pages/Calendar";
import Departments from "./pages/Departments";
import DepartmentDetail from "./pages/DepartmentDetail";

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
            <Route path="/" element={<Navigate to="/boards" />} />
            <Route path="/boards" element={<Dashboard />} />
            <Route path="/boards/:id" element={<BoardDetail />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/departments" element={<Departments />} />
            <Route path="/departments/:id" element={<DepartmentDetail />} />
            <Route path="*" element={<Navigate to="/boards" />} />
          </Routes>
        </main>
      </div>
    </UserContext.Provider>
  );
}

export default App;
