import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { api } from "../api/client";
import { ArrowLeft, CalendarDays, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";

const DEFAULT_COLUMNS = [
  { key: "safety", label: "Safety", description: "безопасность" },
  { key: "quality", label: "Quality", description: "качество" },
  { key: "delivery", label: "Delivery", description: "сроки" },
  { key: "cost", label: "Cost", description: "стоимость" },
];
const TASK_STATUSES = [
  { value: "not_started", label: "не начата" },
  { value: "in_progress", label: "в работе" },
  { value: "done", label: "выполнена" },
];
const TASK_STATUS_VALUES = new Set(TASK_STATUSES.map((status) => status.value));

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeRows(rows) {
  return rows.map((row, idx) => ({
    id: row.id || `new-${idx}`,
    department_id: row.department_id || null,
    team_name: row.team_name || `Команда ${idx + 1}`,
    position: idx,
    safety: row.safety || "",
    quality: row.quality || "",
    delivery: row.delivery || "",
    cost: row.cost || "",
    people: row.people || "",
  }));
}

function createBoardSnapshot(board, rows) {
  return JSON.stringify({
    title: board?.title || "",
    board_date: board?.board_date || todayKey(),
    rows: rows.map((row, idx) => ({
      team_name: row.team_name || "",
      department_id: row.department_id || null,
      position: idx,
      safety: row.safety || "",
      quality: row.quality || "",
      delivery: row.delivery || "",
      cost: row.cost || "",
      people: row.people || "",
    })),
  });
}

function createRowsPayload(rows) {
  return rows.map((row, idx) => ({
    id: typeof row.id === "number" ? row.id : null,
    team_name: row.team_name,
    department_id: row.department_id || null,
    position: idx,
    safety: row.safety,
    quality: row.quality,
    delivery: row.delivery,
    cost: row.cost,
    people: row.people,
  }));
}

function normalizeColumns(columns) {
  return (columns?.length ? columns : DEFAULT_COLUMNS).filter((column) => column.key !== "people");
}

function normalizeTaskStatus(status) {
  return TASK_STATUS_VALUES.has(status) ? status : "not_started";
}

function taskStatusClass(task) {
  return `task-status-${normalizeTaskStatus(task.status)}`;
}

export default function BoardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [departments, setDepartments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskForm, setSelectedTaskForm] = useState({ name: "", description: "", assignees: "" });
  const [taskForm, setTaskForm] = useState({ name: "", description: "", assignees: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [error, setError] = useState("");
  const [draggedRowIndex, setDraggedRowIndex] = useState(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState(null);
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [taskDropTarget, setTaskDropTarget] = useState("");
  const [isUnassignedTaskDropTarget, setIsUnassignedTaskDropTarget] = useState(false);
  const bypassUnsavedPromptRef = useRef(false);

  const currentSnapshot = useMemo(() => (
    board ? createBoardSnapshot(board, rows) : ""
  ), [board, rows]);
  const departmentsById = useMemo(() => (
    new Map(departments.map((department) => [Number(department.id), department]))
  ), [departments]);
  const visibleColumnKeys = useMemo(() => (
    new Set(columns.map((column) => column.key))
  ), [columns]);
  const unassignedTasks = useMemo(() => (
    tasks.filter((task) => !task.row_id || !task.column_key || !visibleColumnKeys.has(task.column_key))
  ), [tasks, visibleColumnKeys]);
  const tasksByCell = useMemo(() => {
    const result = new Map();
    tasks.forEach((task) => {
      if (!task.row_id || !task.column_key || !visibleColumnKeys.has(task.column_key)) return;
      const key = `${task.row_id}:${task.column_key}`;
      result.set(key, [...(result.get(key) || []), task]);
    });
    return result;
  }, [tasks, visibleColumnKeys]);
  const hasUnsavedChanges = Boolean(savedSnapshot && currentSnapshot && savedSnapshot !== currentSnapshot);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (
    hasUnsavedChanges
    && !bypassUnsavedPromptRef.current
    && currentLocation.pathname !== nextLocation.pathname
  ));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, departmentList] = await Promise.all([
        api.getBoard(id),
        api.getDepartments(),
      ]);
      const normalizedRows = normalizeRows(data.rows || []);
      setBoard(data);
      setRows(normalizedRows);
      setColumns(normalizeColumns(data.columns));
      setDepartments(departmentList);
      setTasks(data.tasks || []);
      setSavedSnapshot(createBoardSnapshot(data, normalizedRows));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (blocker.state === "blocked" && !hasUnsavedChanges) {
      blocker.proceed();
    }
  }, [blocker, hasUnsavedChanges]);

  const updateTeamName = (idx, value) => {
    setRows(rows.map((row, rowIdx) => rowIdx === idx ? { ...row, team_name: value } : row));
  };

  const updateCell = (idx, key, value) => {
    setRows(rows.map((row, rowIdx) => rowIdx === idx ? { ...row, [key]: value } : row));
  };

  const resizeTextarea = (element) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  const handleCellChange = (idx, key, event) => {
    resizeTextarea(event.target);
    updateCell(idx, key, event.target.value);
  };

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: `new-${Date.now()}`,
        team_name: `Команда ${rows.length + 1}`,
        department_id: null,
        position: rows.length,
        safety: "",
        quality: "",
        delivery: "",
        cost: "",
        people: "",
      },
    ]);
  };

  const addDepartmentRow = (department) => {
    setRows([
      ...rows,
      {
        id: `new-department-${department.id}-${Date.now()}`,
        department_id: department.id,
        team_name: department.name,
        position: rows.length,
        safety: "",
        quality: "",
        delivery: "",
        cost: "",
        people: "",
      },
    ]);
    setShowDepartmentPicker(false);
  };

  const deleteRow = (idx) => {
    setRows(rows.filter((_, rowIdx) => rowIdx !== idx).map((row, rowIdx) => ({ ...row, position: rowIdx })));
  };

  const moveRow = (fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;

    setRows((currentRows) => {
      if (fromIdx >= currentRows.length || toIdx >= currentRows.length) return currentRows;

      const nextRows = [...currentRows];
      const [movedRow] = nextRows.splice(fromIdx, 1);
      nextRows.splice(toIdx, 0, movedRow);
      return nextRows.map((row, rowIdx) => ({ ...row, position: rowIdx }));
    });
  };

  const handleRowDragStart = (idx, event) => {
    setDraggedRowIndex(idx);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(idx));
  };

  const handleRowDrop = (idx, event) => {
    event.preventDefault();
    const sourceIndex = draggedRowIndex ?? Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(sourceIndex)) {
      moveRow(sourceIndex, idx);
    }
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  const handleRowDragEnd = () => {
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  const createTask = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const task = await api.createBoardTask(id, taskForm);
      setTasks([...tasks, task]);
      setTaskForm({ name: "", description: "", assignees: "" });
      setShowTaskCreate(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const openTaskDetail = (task) => {
    setSelectedTask(task);
    setSelectedTaskForm({
      name: task.name || "",
      description: task.description || "",
      assignees: task.assignees || "",
    });
  };

  const deleteSelectedTask = async () => {
    if (!selectedTask) return;
    await api.deleteBoardTask(id, selectedTask.id);
    setTasks(tasks.filter((task) => task.id !== selectedTask.id));
    setSelectedTask(null);
  };

  const updateSelectedTaskStatus = async (status) => {
    if (!selectedTask) return;

    try {
      setError("");
      const updatedTask = await api.updateBoardTask(id, selectedTask.id, { status });
      setSelectedTask(updatedTask);
      setTasks((currentTasks) => currentTasks.map((task) => (
        task.id === updatedTask.id ? updatedTask : task
      )));
    } catch (err) {
      setError(err.message);
    }
  };

  const updateSelectedTaskDetails = async (event) => {
    event.preventDefault();
    if (!selectedTask) return;

    try {
      setError("");
      const updatedTask = await api.updateBoardTask(id, selectedTask.id, selectedTaskForm);
      setSelectedTask(updatedTask);
      setSelectedTaskForm({
        name: updatedTask.name || "",
        description: updatedTask.description || "",
        assignees: updatedTask.assignees || "",
      });
      setTasks((currentTasks) => currentTasks.map((task) => (
        task.id === updatedTask.id ? updatedTask : task
      )));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTaskDragStart = (task, event) => {
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.id));
  };

  const handleTaskDragEnd = () => {
    setDraggedTaskId(null);
    setTaskDropTarget("");
    setIsUnassignedTaskDropTarget(false);
  };

  const assignTaskToCell = async (row, columnKey, event) => {
    event.preventDefault();
    if (draggedTaskId === null) return;

    if (typeof row.id !== "number") {
      setError("Сначала сохраните доску, чтобы распределить задачу в новую строку.");
      setTaskDropTarget("");
      setDraggedTaskId(null);
      return;
    }

    const taskId = draggedTaskId;

    try {
      setError("");
      setTaskDropTarget("");
      const updatedTask = await api.updateBoardTask(id, taskId, {
        row_id: row.id,
        column_key: columnKey,
      });
      setTasks(tasks.map((task) => task.id === updatedTask.id ? updatedTask : task));
    } catch (err) {
      setError(err.message);
    } finally {
      setDraggedTaskId(null);
    }
  };

  const unassignTask = async (event) => {
    event.preventDefault();
    const rawTaskId = event.dataTransfer.getData("text/plain");
    const fallbackTaskId = rawTaskId ? Number(rawTaskId) : null;
    const taskId = draggedTaskId ?? (Number.isInteger(fallbackTaskId) ? fallbackTaskId : null);
    if (taskId === null) return;

    try {
      setError("");
      setTaskDropTarget("");
      setIsUnassignedTaskDropTarget(false);
      const updatedTask = await api.updateBoardTask(id, taskId, {
        row_id: null,
        column_key: "",
      });
      setTasks((currentTasks) => currentTasks.map((task) => (
        task.id === updatedTask.id ? updatedTask : task
      )));
    } catch (err) {
      setError(err.message);
    } finally {
      setDraggedTaskId(null);
    }
  };

  const saveBoard = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await api.updateBoard(id, {
        title: board.title,
        board_date: board.board_date || todayKey(),
        rows: createRowsPayload(rows),
      });
      const normalizedRows = normalizeRows(data.rows || []);
      setBoard(data);
      setRows(normalizedRows);
      setColumns(normalizeColumns(data.columns));
      setTasks(data.tasks || tasks);
      setSavedSnapshot(createBoardSnapshot(data, normalizedRows));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrentBoard = async () => {
    bypassUnsavedPromptRef.current = true;
    await api.deleteBoard(id);
    setShowDeleteConfirm(false);
    navigate("/boards");
  };

  const saveAndLeaveBoard = async () => {
    const saved = await saveBoard();
    if (saved && blocker.state === "blocked") {
      blocker.proceed();
    }
  };

  const discardAndLeaveBoard = () => {
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  };

  if (loading) return <div className="loading-panel">Загрузка...</div>;
  if (error && !board) return <div className="form-error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/boards")}>
            <ArrowLeft size={18} />
          </button>
          <div className="board-edit-fields">
            <label>
              Название
              <textarea
                value={board.title}
                onChange={(e) => {
                  resizeTextarea(e.target);
                  setBoard({ ...board, title: e.target.value });
                }}
                ref={(element) => { if (element) resizeTextarea(element); }}
                aria-label="Название доски"
                rows={1}
              />
            </label>
          </div>
        </div>
        <div className="board-actions">
          <label className="date-picker-control">
            <CalendarDays size={18} />
            <input
              type="date"
              value={board.board_date || todayKey()}
              onChange={(e) => setBoard({ ...board, board_date: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" onClick={saveBoard} disabled={saving}>
            <Save size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Удалить доску
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="sqdcp-table-wrap">
        <table className="sqdcp-table">
          <thead>
            <tr>
              <th className="team-column">Команда</th>
              {columns.map((column) => (
                <th key={column.key} className={`sqdcp-header sqdcp-header-${column.key}`}>
                  <span>{column.label}</span>
                  <small>{column.description}</small>
                </th>
              ))}
              <th className="row-action-column" aria-label="Действия"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const linkedDepartment = row.department_id ? departmentsById.get(Number(row.department_id)) : null;

              return (
                <tr
                key={row.id}
                className={[
                  draggedRowIndex === idx ? "row-dragging" : "",
                  draggedRowIndex !== null && dragOverRowIndex === idx && draggedRowIndex !== idx ? "row-drop-target" : "",
                ].filter(Boolean).join(" ")}
                onDragOver={(event) => {
                  if (draggedRowIndex === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverRowIndex(idx);
                }}
                onDragLeave={() => {
                  if (dragOverRowIndex === idx) setDragOverRowIndex(null);
                }}
                onDrop={(event) => {
                  if (draggedRowIndex !== null) handleRowDrop(idx, event);
                }}
              >
                <td className="team-cell">
                  <textarea
                    value={row.team_name}
                    onChange={(e) => {
                      resizeTextarea(e.target);
                      updateTeamName(idx, e.target.value);
                    }}
                    ref={(element) => { if (element) resizeTextarea(element); }}
                    aria-label={`Название команды ${idx + 1}`}
                    rows={1}
                  />
                  {linkedDepartment?.head && (
                    <small className="team-cell-head">{linkedDepartment.head}</small>
                  )}
                </td>
                {columns.map((column) => {
                  const cellKey = `${row.id}:${column.key}`;
                  const assignedTasks = tasksByCell.get(cellKey) || [];

                  return (
                    <td
                      key={column.key}
                      className={`sqdcp-edit-cell${taskDropTarget === cellKey ? " task-drop-target" : ""}`}
                      onDragOver={(event) => {
                        if (!draggedTaskId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setTaskDropTarget(cellKey);
                      }}
                      onDragLeave={() => {
                        if (taskDropTarget === cellKey) setTaskDropTarget("");
                      }}
                      onDrop={(event) => assignTaskToCell(row, column.key, event)}
                    >
                      {assignedTasks.length > 0 && (
                        <div className="cell-task-list">
                          {assignedTasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              className={`task-pill ${taskStatusClass(task)}`}
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
                      <textarea
                        value={row[column.key] || ""}
                        onChange={(e) => handleCellChange(idx, column.key, e)}
                        ref={(element) => { if (element) resizeTextarea(element); }}
                        aria-label={`${column.label}, ${row.team_name}`}
                        rows={1}
                      />
                    </td>
                  );
                })}
                <td className="row-action-cell">
                  <div className="row-action-buttons">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm row-drag-handle"
                      draggable
                      onDragStart={(event) => handleRowDragStart(idx, event)}
                      onDragEnd={handleRowDragEnd}
                      aria-label={`Переместить строку ${idx + 1}`}
                      title="Переместить строку"
                    >
                      <GripVertical size={14} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteRow(idx)} disabled={rows.length <= 1}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="board-bottom-actions">
        <button className="btn btn-ghost" onClick={addRow}>
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Добавить новую команду
        </button>
        <button className="btn btn-ghost" onClick={() => setShowDepartmentPicker(true)}>
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Добавить существующий отдел
        </button>
      </div>

      <section
        className={`board-tasks-section${isUnassignedTaskDropTarget ? " task-drop-target" : ""}`}
        onDragOver={(event) => {
          if (draggedTaskId === null) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setIsUnassignedTaskDropTarget(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          setIsUnassignedTaskDropTarget(false);
        }}
        onDrop={unassignTask}
      >
        <div className="board-tasks-header">
          <div>
            <h2>Задачи</h2>
            <p className="page-subtitle">Нераспределённые задачи можно перетащить в ячейки SQDCP-таблицы.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowTaskCreate(true)}>
            <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Добавить задачу
          </button>
        </div>

        {unassignedTasks.length === 0 ? (
          <div className="task-empty-state">Нераспределённых задач нет.</div>
        ) : (
          <div className="task-list">
            {unassignedTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`task-card ${taskStatusClass(task)}`}
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

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title="Удалить доску?"
          message={`Доска "${board.title}" будет удалена без возможности восстановления.`}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={deleteCurrentBoard}
        />
      )}

      {showDepartmentPicker && (
        <div className="modal-overlay" onClick={() => setShowDepartmentPicker(false)}>
          <div className="modal department-picker-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Добавить существующий отдел</h2>
            {departments.length === 0 ? (
              <p className="confirm-modal-copy">Пока нет созданных отделов.</p>
            ) : (
              <div className="department-picker-list">
                {departments.map((department) => (
                  <button
                    key={department.id}
                    type="button"
                    className="department-picker-item"
                    onClick={() => addDepartmentRow(department)}
                  >
                    <strong>{department.name}</strong>
                    <span>{department.head || "Заведующий не указан"}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowDepartmentPicker(false)}>
                Отмена
              </button>
            </div>
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
                <button type="button" className="btn btn-ghost" onClick={() => setShowTaskCreate(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>{selectedTask.name}</h2>
            <form className="task-detail" onSubmit={updateSelectedTaskDetails}>
              <div className="form-group">
                <label>Имя задачи</label>
                <input
                  value={selectedTaskForm.name}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, name: event.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Степень выполнения</label>
                <select
                  value={normalizeTaskStatus(selectedTask.status)}
                  onChange={(event) => updateSelectedTaskStatus(event.target.value)}
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
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTask(null)}>
                  Закрыть
                </button>
                <button type="button" className="btn btn-danger" onClick={deleteSelectedTask}>
                  Удалить
                </button>
                <button type="submit" className="btn btn-primary">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {blocker.state === "blocked" && (
        <div className="modal-overlay">
          <div className="modal confirm-modal">
            <h2>Несохранённые изменения</h2>
            <p className="confirm-modal-copy">
              На доске есть изменения, которые ещё не сохранены. Что сделать перед выходом?
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={discardAndLeaveBoard} disabled={saving}>
                Отменить изменения
              </button>
              <button type="button" className="btn btn-primary" onClick={saveAndLeaveBoard} disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить изменения"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
