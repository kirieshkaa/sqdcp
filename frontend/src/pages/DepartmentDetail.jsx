import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

export default function DepartmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [department, setDepartment] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        setDepartment(await api.getDepartment(id));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const updateField = (field, value) => {
    setDepartment({ ...department, [field]: value });
  };

  const saveDepartment = async () => {
    setSaving(true);
    setError("");
    try {
      setDepartment(await api.updateDepartment(id, {
        name: department.name,
        head: department.head,
        workers: department.workers,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteDepartment = async () => {
    await api.deleteDepartment(id);
    setShowDeleteConfirm(false);
    navigate("/departments");
  };

  if (loading) return <div className="loading-panel">Загрузка...</div>;
  if (error && !department) return <div className="form-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/departments")}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>Отдел</h1>
            <p className="page-subtitle">Редактирование сведений об отделе</p>
          </div>
        </div>
        <div className="board-actions">
          <button className="btn btn-primary" onClick={saveDepartment} disabled={saving}>
            <Save size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Удалить отдел
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="department-detail-panel">
        <div className="form-group">
          <label>Название отдела</label>
          <input
            value={department.name || ""}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Заведующий</label>
          <input
            value={department.head || ""}
            onChange={(event) => updateField("head", event.target.value)}
            placeholder="ФИО заведующего"
          />
        </div>
        <div className="form-group">
          <label>Работники</label>
          <textarea
            value={department.workers || ""}
            onChange={(event) => updateField("workers", event.target.value)}
            placeholder="Список работников"
            rows={10}
          />
        </div>
        <div className="form-group">
          <label>Участвуют в:</label>
          {department.participating_boards?.length > 0 ? (
            <div className="department-participation-list">
              {department.participating_boards.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  className="department-participation-item"
                  onClick={() => navigate(`/boards/${board.id}`)}
                >
                  {board.title}
                </button>
              ))}
            </div>
          ) : (
            <div className="department-empty-participation">Отдел пока не добавлен ни в одну доску.</div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title="Удалить отдел?"
          message={`Отдел "${department.name}" будет удалён без возможности восстановления.`}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={deleteDepartment}
        />
      )}
    </div>
  );
}
