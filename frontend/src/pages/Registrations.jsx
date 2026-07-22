import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

const ROLES = [
  { value: "department_head", label: "Руководитель отдела" },
  { value: "minister", label: "Министр" },
  { value: "admin", label: "Админ" },
];

export default function Registrations() {
  const [registrations, setRegistrations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [approvalForms, setApprovalForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  const departmentsById = useMemo(() => (
    new Map(departments.map((department) => [Number(department.id), department]))
  ), [departments]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [pending, depts] = await Promise.all([
        api.getPendingRegistrations(),
        api.getDepartments(),
      ]);
      setRegistrations(pending);
      setDepartments(depts);
      setApprovalForms(Object.fromEntries(pending.map((user) => [
        user.id,
        {
          role: user.role || "department_head",
          department_id: user.department_id || "",
        },
      ])));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateForm = (userId, patch) => {
    setApprovalForms((current) => ({
      ...current,
      [userId]: { ...(current[userId] || {}), ...patch },
    }));
  };

  const approve = async (user) => {
    const form = approvalForms[user.id] || {};
    setSavingId(user.id);
    setError("");
    try {
      await api.approveRegistration(user.id, {
        role: form.role || "department_head",
        department_id: form.department_id ? Number(form.department_id) : null,
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const reject = async (user) => {
    setSavingId(user.id);
    setError("");
    try {
      await api.rejectRegistration(user.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Регистрации</h1>
          <p className="page-subtitle">Заявки пользователей, ожидающие подтверждения администратора</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-panel">Загрузка...</div>
      ) : registrations.length === 0 ? (
        <div className="card empty-state">Новых заявок нет.</div>
      ) : (
        <div className="admin-list">
          {registrations.map((user) => {
            const form = approvalForms[user.id] || {};
            const department = departmentsById.get(Number(user.department_id));
            const saving = savingId === user.id;

            return (
              <div key={user.id} className="card registration-card">
                <div>
                  <h3>{user.username}</h3>
                  <p className="admin-muted">{user.email}</p>
                  <p className="admin-muted">
                    Заявленный отдел: {department?.name || "не выбран"}
                  </p>
                </div>
                <div className="registration-controls">
                  <label>
                    Роль
                    <select
                      value={form.role || "department_head"}
                      onChange={(event) => updateForm(user.id, { role: event.target.value })}
                      disabled={saving}
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Отдел
                    <select
                      value={form.department_id || ""}
                      onChange={(event) => updateForm(user.id, { department_id: event.target.value })}
                      disabled={saving}
                    >
                      <option value="">Без отдела</option>
                      {departments.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="registration-actions">
                  <button type="button" className="btn btn-danger" onClick={() => reject(user)} disabled={saving}>
                    Отклонить
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => approve(user)} disabled={saving}>
                    Одобрить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
