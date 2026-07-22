import { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import { UserContext } from "../App";
import { canEditDepartments } from "../permissions";

const TASK_STATUSES = [
  { value: "not_started", label: "не начата" },
  { value: "in_progress", label: "в работе" },
  { value: "done", label: "выполнена" },
];
const PROJECT_STATUS_LABELS = {
  not_started: "\u043d\u0435 \u043d\u0430\u0447\u0430\u0442",
  in_progress: "\u0432 \u0440\u0430\u0431\u043e\u0442\u0435",
  done: "\u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d",
};

export default function DepartmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useContext(UserContext);
  const canEdit = canEditDepartments(user);
  const [department, setDepartment] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskForm, setSelectedTaskForm] = useState({
    name: "",
    description: "",
    assignees: "",
    due_date: "",
    status: "not_started",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
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
    if (!canEdit) return;
    setDepartment({ ...department, [field]: value });
  };

  const saveDepartment = async () => {
    if (!canEdit) return;
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
    if (!canEdit) return;
    await api.deleteDepartment(id);
    setShowDeleteConfirm(false);
    navigate("/departments");
  };

  const openTaskDetail = (task) => {
    setSelectedTask(task);
    setSelectedTaskForm({
      name: task.name || "",
      description: task.description || "",
      assignees: task.assignees || "",
      due_date: task.due_date || "",
      status: normalizeTaskStatus(task.status),
    });
  };

  const updateSelectedTaskDetails = async (event) => {
    event.preventDefault();
    if (!selectedTask || !canEdit) return;

    setTaskSaving(true);
    setError("");
    try {
      const updatedTask = await api.updateBoardTask(selectedTask.board_id, selectedTask.id, selectedTaskForm);
      const mergedTask = { ...selectedTask, ...updatedTask };
      setSelectedTask(mergedTask);
      setSelectedTaskForm({
        name: mergedTask.name || "",
        description: mergedTask.description || "",
        assignees: mergedTask.assignees || "",
        due_date: mergedTask.due_date || "",
        status: normalizeTaskStatus(mergedTask.status),
      });
      setDepartment((currentDepartment) => ({
        ...currentDepartment,
        assigned_tasks: (currentDepartment.assigned_tasks || []).map((task) => (
          task.id === mergedTask.id ? mergedTask : task
        )),
        projects: (currentDepartment.projects || []).map((project) => ({
          ...project,
          tasks: (project.tasks || []).map((task) => (
            task.id === mergedTask.id ? mergedTask : task
          )),
        })),
      }));
      setSelectedTask(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setTaskSaving(false);
    }
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
          {canEdit && <button className="btn btn-primary" onClick={saveDepartment} disabled={saving}>
            <Save size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {saving ? "Сохранение..." : "Сохранить"}
          </button>}
          {canEdit && <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Удалить отдел
          </button>}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="department-detail-panel">
        <div className="form-group">
          <label>Название отдела</label>
          <input
            value={department.name || ""}
            onChange={(event) => updateField("name", event.target.value)}
            readOnly={!canEdit}
          />
        </div>
        <div className="form-group">
          <label>Заведующий</label>
          <input
            value={department.head || ""}
            onChange={(event) => updateField("head", event.target.value)}
            readOnly={!canEdit}
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
            readOnly={!canEdit}
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
        <div className="form-group">
          <label>Назначенные задачи:</label>
          {department.assigned_tasks?.length > 0 ? (
            <div className="department-task-list">
              {department.assigned_tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="department-task-item"
                  onClick={() => openTaskDetail(task)}
                >
                  <strong>{task.name}</strong>
                  <span>{task.board_title}</span>
                  {task.assignees && <small>Ответственные: {task.assignees}</small>}
                  {task.description && <p>{task.description}</p>}
                </button>
              ))}
            </div>
          ) : (
            <div className="department-empty-participation">Этому отделу пока не назначены задачи.</div>
          )}
        </div>
      </div>

      <div className="department-detail-panel department-projects-panel">
        <div className="form-group">
          <label>Проекты отдела:</label>
          {department.projects?.length > 0 ? (
            <div className="department-project-list">
              {department.projects.map((project) => {
                const projectStatus = getProjectStatus(project);

                return (
                  <div key={project.id} className={`department-project-item ${projectStatusClass(projectStatus)}`}>
                    <strong>{project.name}</strong>
                    <span className={`project-status-badge ${projectStatusClass(projectStatus)}`}>
                      {PROJECT_STATUS_LABELS[projectStatus] || PROJECT_STATUS_LABELS.not_started}
                    </span>
                    <small>{(project.tasks || []).length} задач</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="department-empty-participation">У отдела пока нет проектов.</div>
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

      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>{selectedTaskForm.name || selectedTask.name}</h2>
            <form className="task-detail" onSubmit={updateSelectedTaskDetails}>
              <div className="form-group">
                <label>Имя задачи</label>
                <input
                  value={selectedTaskForm.name}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, name: event.target.value })}
                  readOnly={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Доска</label>
                <input value={selectedTask.board_title || "Доска не указана"} readOnly />
              </div>
              <div className="form-group">
                <label>Степень выполнения</label>
                <select
                  value={selectedTaskForm.status}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, status: event.target.value })}
                  disabled={!canEdit}
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Описание задачи</label>
                <textarea
                  value={selectedTaskForm.description}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, description: event.target.value })}
                  rows={5}
                  readOnly={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Ответственные</label>
                <input
                  value={selectedTaskForm.assignees}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, assignees: event.target.value })}
                  readOnly={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Дата выполнения задачи</label>
                <input
                  type="date"
                  value={selectedTaskForm.due_date}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, due_date: event.target.value })}
                  readOnly={!canEdit}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTask(null)} disabled={taskSaving}>
                  Закрыть
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => navigate(`/boards/${selectedTask.board_id}`)} disabled={taskSaving}>
                  Открыть доску
                </button>
                <button type="submit" className="btn btn-primary" disabled={taskSaving || !canEdit}>
                  {taskSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeTaskStatus(status) {
  return TASK_STATUSES.some((item) => item.value === status) ? status : "not_started";
}

function projectStatusClass(status) {
  return `project-status-${normalizeTaskStatus(status)}`;
}

function getProjectStatus(project) {
  const tasks = project.tasks || [];
  if (tasks.length === 0) return "not_started";

  const statuses = tasks.map((task) => normalizeTaskStatus(task.status));
  if (statuses.every((status) => status === "done")) return "done";
  if (statuses.every((status) => status === "not_started")) return "not_started";
  return "in_progress";
}
