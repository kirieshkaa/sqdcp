import { NavLink } from "react-router-dom";
import { BarChart3, Building2, CalendarDays, ClipboardList, Columns3, LayoutDashboard, LogOut, Moon, Sun, UserPlus } from "lucide-react";
import { canUseAdminPages, canUseBoards, canUseCalendar, canUseCanban, canUseDepartments, normalizeRole } from "../permissions";

const ROLE_NAMES = {
  admin: "Админ",
  minister: "Министр",
  department_head: "Руководитель отдела",
};

export default function Sidebar({ user, theme, onToggleTheme, onLogout }) {
  const isLightTheme = theme === "light";
  const role = normalizeRole(user.role);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Columns3 size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
        SQDCP Tracker
      </div>
      <div className="sidebar-user">
        <strong>{user.username}</strong>
        <br />
        <span className="sidebar-role">{ROLE_NAMES[role] || role}</span>
      </div>
      {canUseBoards(user) && (
        <NavLink to="/boards" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <LayoutDashboard size={18} />
          Доски
        </NavLink>
      )}
      {canUseCalendar(user) && (
        <NavLink to="/calendar" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <CalendarDays size={18} />
          Календарь
        </NavLink>
      )}
      {canUseCanban(user) && (
        <NavLink to="/canban" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <Columns3 size={18} />
          Задачи
        </NavLink>
      )}
      {canUseDepartments(user) && (
        <NavLink to="/departments" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <Building2 size={18} />
          Отделы
        </NavLink>
      )}
      {canUseAdminPages(user) && (
        <>
          <NavLink to="/logs" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <ClipboardList size={18} />
            Логи
          </NavLink>
          <NavLink to="/sqdcp-stats" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <BarChart3 size={18} />
            SQDCP статистика
          </NavLink>
          <NavLink to="/registrations" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <UserPlus size={18} />
            Регистрации
          </NavLink>
        </>
      )}
      <div className="sidebar-bottom-actions">
        <button className="sidebar-theme-toggle" onClick={onToggleTheme}>
          {isLightTheme ? <Moon size={18} /> : <Sun size={18} />}
          {isLightTheme ? "Темная тема" : "Светлая тема"}
        </button>
      </div>
      <button className="sidebar-logout" onClick={onLogout}>
        <LogOut size={18} />
        Выйти
      </button>
    </aside>
  );
}
