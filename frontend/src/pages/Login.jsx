import { useState } from "react";
import { api } from "../api/client";

export default function Login({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", department_id: "" });
  const [error, setError] = useState("");
  const [errors, setErrors] = useState([]);
  const [pendingMsg, setPendingMsg] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  const loadDepts = async () => {
    if (departments.length > 0) return;
    setLoadingDepts(true);
    try {
      const depts = await api.getRegistrationDepartments();
      setDepartments(depts);
    } catch {}
    setLoadingDepts(false);
  };

  const validate = () => {
    const errs = [];
    if (form.username.length < 3) errs.push("Имя пользователя минимум 3 символа");
    if (!/^[a-zA-Z0-9_]+$/.test(form.username)) errs.push("Только латиница, цифры и _");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.push("Некорректный email");
    if (form.password.length < 6) errs.push("Пароль минимум 6 символов");
    if (!/[A-Za-z]/.test(form.password)) errs.push("Пароль должен содержать букву");
    if (!/[0-9]/.test(form.password)) errs.push("Пароль должен содержать цифру");
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setErrors([]);
    setPendingMsg("");

    if (tab === "register") {
      const v = validate();
      if (v.length > 0) { setErrors(v); return; }
    }

    try {
      if (tab === "login") {
        const data = await api.login(form.username, form.password);
        localStorage.setItem("token", data.access_token);
        const user = await api.getMe();
        onLogin(user);
      } else {
        const res = await api.register({
          username: form.username,
          email: form.email,
          password: form.password,
          department_id: form.department_id ? Number(form.department_id) : null,
        });
        setPendingMsg(res.message || "Регистрация успешна! Ожидайте подтверждения администратором.");
        setTab("login");
      }
    } catch (err) {
      if (err.body?.errors) setErrors(err.body.errors);
      else if (err.body?.error) setError(err.body.error);
      else if (err.message) setError(err.message);
      else setError("Ошибка: проверьте данные");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>TBP Dashboard</h1>
        <p>Командная панель мониторинга производительности</p>
        <div className="tabs">
          <button className={`tab${tab === "login" ? " active" : ""}`} onClick={() => setTab("login")}>Вход</button>
          <button className={`tab${tab === "register" ? " active" : ""}`} onClick={() => { setTab("register"); loadDepts(); }}>Регистрация</button>
        </div>

        {error && <div className="form-error">{error}</div>}
        {errors.length > 0 && (
          <div className="form-error-list">
            {errors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        )}
        {pendingMsg && <div className="form-success">{pendingMsg}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Имя пользователя</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="от 3 символов, латиница"
              required
            />
          </div>
          {tab === "register" && (
            <>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="example@mail.com"
                  required
                />
              </div>
              <div className="form-group">
                <label>Отдел</label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  disabled={loadingDepts}
                >
                  <option value="">Выберите отдел</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="от 6 символов, буква + цифра"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block">
            {tab === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={async () => { setSeeding(true); try { const res = await api.seed("test123"); setError(`Созданы: ${res.created_users?.join(", ") || "уже существовали"}. Пароль: test123`); } catch { setError("Ошибка"); } setSeeding(false); }} disabled={seeding}>
            {seeding ? "Создание..." : "Создать тестовые роли"}
          </button>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
            admin, minister, department_head — пароль: test123
          </div>
        </div>
      </div>
    </div>
  );
}
