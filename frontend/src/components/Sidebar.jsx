import { NavLink } from "react-router-dom";
import { Building2, CalendarDays, Columns3, LayoutDashboard, LogOut } from "lucide-react";

const ROLE_NAMES = {
  admin: "Администратор",
  manager: "Менеджер",
  user: "Пользователь",
  viewer: "Наблюдатель",
};

export default function Sidebar({ user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Columns3 size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
        SQDCP Tracker
      </div>
      <div className="sidebar-user">
        <strong>{user.username}</strong>
        <br />
        <span className="sidebar-role">{ROLE_NAMES[user.role] || user.role}</span>
      </div>
      <NavLink to="/boards" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
        <LayoutDashboard size={18} />
        Доски
      </NavLink>
      <NavLink to="/calendar" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
        <CalendarDays size={18} />
        Календарь
      </NavLink>
      <NavLink to="/departments" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
        <Building2 size={18} />
        Отделы
      </NavLink>
      <button className="sidebar-logout" onClick={onLogout}>
        <LogOut size={18} />
        Выйти
      </button>
    </aside>
  );
}
