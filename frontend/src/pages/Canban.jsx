import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";

const TASK_STATUSES = [
  { value: "not_started", label: "не начата", columnLabel: "Не начатые" },
  { value: "in_progress", label: "в работе", columnLabel: "В работе" },
  { value: "done", label: "выполнена", columnLabel: "Выполненные" },
];

const TASK_STATUS_VALUES = new Set(TASK_STATUSES.map((status) => status.value));
const SQDCP_COLUMNS = [
  { key: "safety", label: "Safety", description: "безопасность" },
  { key: "quality", label: "Quality", description: "качество" },
  { key: "delivery", label: "Delivery", description: "сроки" },
  { key: "cost", label: "Cost", description: "стоимость" },
  { key: "people", label: "People", description: "персонал" },
];

function normalizeTaskStatus(status) {
  return TASK_STATUS_VALUES.has(status) ? status : "not_started";
}

function taskStatusClass(task) {
  return `task-status-${normalizeTaskStatus(task.status)}`;
}

function createEmptySqdcpCells() {
  return SQDCP_COLUMNS.reduce((cells, column) => ({ ...cells, [column.key]: [] }), {});
}

function createSqdcpRow(index = 0) {
  return {
    id: `project-${Date.now()}-${index}`,
    project_name: `Проект ${index + 1}`,
    cells: createEmptySqdcpCells(),
  };
}

function normalizeSqdcpRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [createSqdcpRow(0)];

  return rows.map((row, index) => ({
    id: row.id || `project-${Date.now()}-${index}`,
    project_name: row.project_name || `Проект ${index + 1}`,
    cells: SQDCP_COLUMNS.reduce((cells, column) => ({
      ...cells,
      [column.key]: Array.isArray(row.cells?.[column.key]) ? row.cells[column.key] : [],
    }), {}),
  }));
}

export default function Canban() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [department, setDepartment] = useState(null);
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskForm, setTaskForm] = useState({ name: "", description: "", assignees: "" });
  const [selectedTaskForm, setSelectedTaskForm] = useState({
    name: "",
    description: "",
    assignees: "",
    status: "not_started",
  });
  const [sqdcpRows, setSqdcpRows] = useState(() => [createSqdcpRow(0)]);
  const [loadedSqdcpDepartmentId, setLoadedSqdcpDepartmentId] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dropTargetStatus, setDropTargetStatus] = useState("");
  const [sqdcpDropTarget, setSqdcpDropTarget] = useState("");
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingDepartment, setLoadingDepartment] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [error, setError] = useState("");

  const tasks = useMemo(() => department?.assigned_tasks || [], [department]);
  const tasksById = useMemo(() => (
    new Map(tasks.map((task) => [task.id, task]))
  ), [tasks]);
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

  useEffect(() => {
    if (!selectedDepartmentId) {
      setSqdcpRows([createSqdcpRow(0)]);
      setLoadedSqdcpDepartmentId("");
      return;
    }

    setLoadedSqdcpDepartmentId("");
    const savedRows = localStorage.getItem(`canban-sqdcp-${selectedDepartmentId}`);
    if (!savedRows) {
      setSqdcpRows([createSqdcpRow(0)]);
      setLoadedSqdcpDepartmentId(selectedDepartmentId);
      return;
    }

    try {
      setSqdcpRows(normalizeSqdcpRows(JSON.parse(savedRows)));
    } catch {
      setSqdcpRows([createSqdcpRow(0)]);
    }
    setLoadedSqdcpDepartmentId(selectedDepartmentId);
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (!selectedDepartmentId || loadedSqdcpDepartmentId !== selectedDepartmentId) return;
    localStorage.setItem(`canban-sqdcp-${selectedDepartmentId}`, JSON.stringify(sqdcpRows));
  }, [loadedSqdcpDepartmentId, selectedDepartmentId, sqdcpRows]);

  const openTaskDetail = (task) => {
    setSelectedTask(task);
    setSelectedTaskForm({
      name: task.name || "",
      description: task.description || "",
      assignees: task.assignees || "",
      status: normalizeTaskStatus(task.status),
    });
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (!selectedDepartmentId) return;

    setTaskSaving(true);
    setError("");
    try {
      const task = await api.createDepartmentTask(selectedDepartmentId, taskForm);
      setDepartment((currentDepartment) => ({
        ...currentDepartment,
        assigned_tasks: [...(currentDepartment?.assigned_tasks || []), task],
      }));
      setTaskForm({ name: "", description: "", assignees: "" });
      setShowTaskCreate(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setTaskSaving(false);
    }
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
    setSqdcpDropTarget("");
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

  const updateSqdcpProjectName = (rowId, value) => {
    setSqdcpRows((currentRows) => currentRows.map((row) => (
      row.id === rowId ? { ...row, project_name: value } : row
    )));
  };

  const addSqdcpRow = () => {
    setSqdcpRows((currentRows) => [...currentRows, createSqdcpRow(currentRows.length)]);
  };

  const deleteSqdcpRow = (rowId) => {
    setSqdcpRows((currentRows) => (
      currentRows.length <= 1 ? currentRows : currentRows.filter((row) => row.id !== rowId)
    ));
  };

  const moveTaskToSqdcpCell = (rowId, columnKey, event) => {
    event.preventDefault();
    const rawTaskId = event.dataTransfer.getData("text/plain");
    const fallbackTaskId = rawTaskId ? Number(rawTaskId) : null;
    const taskId = draggedTaskId ?? (Number.isInteger(fallbackTaskId) ? fallbackTaskId : null);
    if (!tasksById.has(taskId)) return;

    setSqdcpRows((currentRows) => currentRows.map((row) => {
      const nextCells = SQDCP_COLUMNS.reduce((cells, column) => ({
        ...cells,
        [column.key]: (row.cells[column.key] || []).filter((id) => id !== taskId),
      }), {});

      if (row.id === rowId) {
        nextCells[columnKey] = [...nextCells[columnKey], taskId];
      }

      return { ...row, cells: nextCells };
    }));
    setSqdcpDropTarget("");
    setDraggedTaskId(null);
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowTaskCreate(true)}
          disabled={!selectedDepartmentId || loadingDepartment}
        >
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Добавить задачу
        </button>
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

      {departments.length > 0 && !loadingDepartment && (
        <section className="canban-sqdcp-section">
          <div className="canban-sqdcp-header">
            <div>
              <h2>SQDCP-доска</h2>
              <p className="page-subtitle">Проекты выбранного отдела</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={addSqdcpRow}>
              <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Добавить проект
            </button>
          </div>

          <div className="sqdcp-table-wrap canban-sqdcp-wrap">
            <table className="sqdcp-table canban-sqdcp-table">
              <thead>
                <tr>
                  <th className="team-column">Проект</th>
                  {SQDCP_COLUMNS.map((column) => (
                    <th key={column.key} className={`sqdcp-header sqdcp-header-${column.key}`}>
                      <span>{column.label}</span>
                      <small>{column.description}</small>
                    </th>
                  ))}
                  <th className="row-action-column" aria-label="Действия"></th>
                </tr>
              </thead>
              <tbody>
                {sqdcpRows.map((row, rowIndex) => (
                  <tr key={row.id}>
                    <td className="team-cell">
                      <textarea
                        value={row.project_name}
                        onChange={(event) => updateSqdcpProjectName(row.id, event.target.value)}
                        aria-label={`Название проекта ${rowIndex + 1}`}
                        rows={1}
                      />
                    </td>
                    {SQDCP_COLUMNS.map((column) => {
                      const cellKey = `${row.id}:${column.key}`;
                      const cellTasks = (row.cells[column.key] || [])
                        .map((taskId) => tasksById.get(taskId))
                        .filter(Boolean);

                      return (
                        <td
                          key={column.key}
                          className={`sqdcp-edit-cell canban-sqdcp-cell${sqdcpDropTarget === cellKey ? " task-drop-target" : ""}`}
                          onDragOver={(event) => {
                            if (draggedTaskId === null) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setSqdcpDropTarget(cellKey);
                          }}
                          onDragLeave={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget)) return;
                            setSqdcpDropTarget("");
                          }}
                          onDrop={(event) => moveTaskToSqdcpCell(row.id, column.key, event)}
                        >
                          {cellTasks.length > 0 && (
                            <div className="cell-task-list">
                              {cellTasks.map((task) => (
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
                        </td>
                      );
                    })}
                    <td className="row-action-cell">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => deleteSqdcpRow(row.id)}
                        disabled={sqdcpRows.length <= 1}
                        aria-label={`Удалить проект ${rowIndex + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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

      {showTaskCreate && (
        <div className="modal-overlay" onClick={() => setShowTaskCreate(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Новая задача</h2>
            <form onSubmit={createTask}>
              <div className="form-group">
                <label>Имя задачи</label>
                <input
                  value={taskForm.name}
                  onChange={(event) => setTaskForm({ ...taskForm, name: event.target.value })}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Описание задачи</label>
                <textarea
                  value={taskForm.description}
                  onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                  rows={5}
                />
              </div>
              <div className="form-group">
                <label>Ответственные</label>
                <input
                  value={taskForm.assignees}
                  onChange={(event) => setTaskForm({ ...taskForm, assignees: event.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowTaskCreate(false)} disabled={taskSaving}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary" disabled={taskSaving}>
                  {taskSaving ? "Создание..." : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
