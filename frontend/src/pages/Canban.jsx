import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const TASK_STATUSES = [
  { value: "not_started", label: "не начата", columnLabel: "Не начатые" },
  { value: "in_progress", label: "в работе", columnLabel: "В работе" },
  { value: "done", label: "выполнена", columnLabel: "Выполненные" },
];

const TASK_STATUS_VALUES = new Set(TASK_STATUSES.map((status) => status.value));

function normalizeTaskStatus(status) {
  return TASK_STATUS_VALUES.has(status) ? status : "not_started";
}

function taskStatusClass(task) {
  return `task-status-${normalizeTaskStatus(task.status)}`;
}

export default function Canban() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [department, setDepartment] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskForm, setSelectedTaskForm] = useState({
    name: "",
    description: "",
    assignees: "",
    status: "not_started",
  });
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dropTargetStatus, setDropTargetStatus] = useState("");
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingDepartment, setLoadingDepartment] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [error, setError] = useState("");

  const tasks = useMemo(() => department?.assigned_tasks || [], [department]);
  const tasksByStatus = useMemo(() => {
    const grouped = new Map(TASK_STATUSES.map((status) => [status.value, []]));
    tasks.forEach((task) => {
      grouped.get(normalizeTaskStatus(task.status)).push(task);
    });
    return grouped;
  }, [tasks]);

  useEffect(() => {
    const loadDepartments = async () => {
      setLoadingDepartments(true);
      setError("");
      try {
        const data = await api.getDepartments();
        setDepartments(data);
        setSelectedDepartmentId((currentId) => currentId || (data[0]?.id ? String(data[0].id) : ""));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingDepartments(false);
      }
    };

    loadDepartments();
  }, []);

  useEffect(() => {
    if (!selectedDepartmentId) {
      setDepartment(null);
      return;
    }

    const loadDepartment = async () => {
      setLoadingDepartment(true);
      setError("");
      try {
        setDepartment(await api.getDepartment(selectedDepartmentId));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingDepartment(false);
      }
    };

    loadDepartment();
  }, [selectedDepartmentId]);

  const openTaskDetail = (task) => {
    setSelectedTask(task);
    setSelectedTaskForm({
      name: task.name || "",
      description: task.description || "",
      assignees: task.assignees || "",
      status: normalizeTaskStatus(task.status),
    });
  };

  const updateTaskInDepartment = (updatedTask) => {
    setDepartment((currentDepartment) => {
      if (!currentDepartment) return currentDepartment;

      return {
        ...currentDepartment,
        assigned_tasks: (currentDepartment.assigned_tasks || []).map((task) => (
          task.id === updatedTask.id ? { ...task, ...updatedTask } : task
        )),
      };
    });
  };

  const updateSelectedTaskDetails = async (event) => {
    event.preventDefault();
    if (!selectedTask) return;

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
        status: normalizeTaskStatus(mergedTask.status),
      });
      updateTaskInDepartment(mergedTask);
    } catch (err) {
      setError(err.message);
    } finally {
      setTaskSaving(false);
    }
  };

  const handleTaskDragStart = (task, event) => {
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.id));
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setDropTargetStatus("");
  };

  const moveTaskToStatus = async (status, event) => {
    event.preventDefault();
    const rawTaskId = event.dataTransfer.getData("text/plain");
    const fallbackTaskId = rawTaskId ? Number(rawTaskId) : null;
    const taskId = draggedTaskId ?? (Number.isInteger(fallbackTaskId) ? fallbackTaskId : null);
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    setDropTargetStatus("");
    setDraggedTaskId(null);
    if (normalizeTaskStatus(task.status) === status) return;

    setError("");
    try {
      const updatedTask = await api.updateBoardTask(task.board_id, task.id, { status });
      const mergedTask = { ...task, ...updatedTask };
      updateTaskInDepartment(mergedTask);
      if (selectedTask?.id === mergedTask.id) {
        setSelectedTask(mergedTask);
        setSelectedTaskForm((currentForm) => ({ ...currentForm, status: normalizeTaskStatus(mergedTask.status) }));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (loadingDepartments) return <div className="loading-panel">Загрузка...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Канбан</h1>
          <p className="page-subtitle">Задачи выбранного отдела по степени выполнения</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="canban-toolbar">
        <div className="form-group">
          <label>Отдел</label>
          <select
            value={selectedDepartmentId}
            onChange={(event) => setSelectedDepartmentId(event.target.value)}
          >
            {departments.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      </div>

      {departments.length === 0 ? (
        <div className="task-empty-state">Пока нет созданных отделов.</div>
      ) : loadingDepartment ? (
        <div className="loading-panel">Загрузка задач...</div>
      ) : (
        <div className="canban-board">
          {TASK_STATUSES.map((status) => {
            const columnTasks = tasksByStatus.get(status.value) || [];

            return (
              <section
                key={status.value}
                className={`canban-column${dropTargetStatus === status.value ? " task-drop-target" : ""}`}
                onDragOver={(event) => {
                  if (draggedTaskId === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetStatus(status.value);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget)) return;
                  setDropTargetStatus("");
                }}
                onDrop={(event) => moveTaskToStatus(status.value, event)}
              >
                <div className="canban-column-header">
                  <h2>{status.columnLabel}</h2>
                  <span>{columnTasks.length}</span>
                </div>
                {columnTasks.length === 0 ? (
                  <div className="task-empty-state">Задач нет.</div>
                ) : (
                  <div className="canban-task-list">
                    {columnTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className={`task-pill canban-task ${taskStatusClass(task)}`}
                        draggable
                        onDragStart={(event) => handleTaskDragStart(task, event)}
                        onDragEnd={handleTaskDragEnd}
                        onClick={() => openTaskDetail(task)}
                      >
                        <strong>{task.name}</strong>
                        {task.assignees && <span>{task.assignees}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
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
                />
              </div>
              <div className="form-group">
                <label>Ответственные</label>
                <input
                  value={selectedTaskForm.assignees}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, assignees: event.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTask(null)} disabled={taskSaving}>
                  Закрыть
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => navigate(`/boards/${selectedTask.board_id}`)} disabled={taskSaving}>
                  Открыть доску
                </button>
                <button type="submit" className="btn btn-primary" disabled={taskSaving}>
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
