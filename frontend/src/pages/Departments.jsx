import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Building2, Plus, Trash2 } from "lucide-react";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

export default function Departments() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [departmentToDelete, setDepartmentToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setDepartments(await api.getDepartments());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createDepartment = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const department = await api.createDepartment({ name: name.trim() });
      setShowModal(false);
      setName("");
      navigate(`/departments/${department.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteDepartment = async () => {
    if (!departmentToDelete) return;
    await api.deleteDepartment(departmentToDelete.id);
    setDepartments(departments.filter((department) => department.id !== departmentToDelete.id));
    setDepartmentToDelete(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Отделы</h1>
          <p className="page-subtitle">Создавайте отделы и редактируйте сведения о заведующих и работниках.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Создать отдел
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-panel">Загрузка...</div>
      ) : departments.length === 0 ? (
        <div className="card empty-state">
          <Building2 size={48} color="var(--text-secondary)" style={{ marginBottom: "1rem" }} />
          <p>Пока нет отделов.</p>
        </div>
      ) : (
        <div className="departments-grid">
          {departments.map((department) => (
            <div
              key={department.id}
              className="card department-card"
              onClick={() => navigate(`/departments/${department.id}`)}
              role="button"
              tabIndex={0}
            >
              <div>
                <h3>{department.name}</h3>
                <p>{department.head || "Заведующий не указан"}</p>
              </div>
              <div className="department-card-footer">
                <button
                  className="btn btn-ghost btn-sm delete-icon-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDepartmentToDelete(department);
                  }}
                  aria-label={`Удалить отдел ${department.name}`}
                >
                  <Trash2 size={14} />
                </button>
                <span>ID: {department.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Новый отдел</h2>
            <form onSubmit={createDepartment}>
              <div className="form-group">
                <label>Название отдела</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Например: Производство"
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {departmentToDelete && (
        <ConfirmDeleteModal
          title="Удалить отдел?"
          message={`Отдел "${departmentToDelete.name}" будет удалён без возможности восстановления.`}
          onCancel={() => setDepartmentToDelete(null)}
          onConfirm={deleteDepartment}
        />
      )}
    </div>
  );
}
