import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { UserContext } from "../App";
import { canEditCanban, canUseBoards, isDepartmentHead } from "../permissions";

const TASK_STATUSES = [
  { value: "not_started", label: "не начата", columnLabel: "Не начатые" },
  { value: "in_progress", label: "в работе", columnLabel: "В работе" },
  { value: "done", label: "выполнена", columnLabel: "Выполненные" },
];

const TASK_STATUS_VALUES = new Set(TASK_STATUSES.map((status) => status.value));
const PROJECT_STATUS_LABELS = {
  not_started: "\u043d\u0435 \u043d\u0430\u0447\u0430\u0442",
  in_progress: "\u0432 \u0440\u0430\u0431\u043e\u0442\u0435",
  done: "\u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d",
};
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

function readLegacySqdcpRows(departmentId) {
  const savedRows = localStorage.getItem(`canban-sqdcp-${departmentId}`);
  if (!savedRows) return [];

  try {
    const rows = JSON.parse(savedRows);
    if (!Array.isArray(rows)) return [];

    return rows.map((row, index) => ({
      project_name: row.project_name || `Проект ${index + 1}`,
      cells: SQDCP_COLUMNS.reduce((cells, column) => ({
        ...cells,
        [column.key]: Array.isArray(row.cells?.[column.key]) ? row.cells[column.key] : [],
      }), {}),
    }));
  } catch {
    return [];
  }
}

export default function Canban() {
  const navigate = useNavigate();
  const user = useContext(UserContext);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [department, setDepartment] = useState(null);
  const [showTaskCreate, setShowTaskCreate] = useState(false);
  const [taskCreateTarget, setTaskCreateTarget] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskForm, setTaskForm] = useState({ name: "", description: "", assignees: "", due_date: "" });
  const [selectedTaskForm, setSelectedTaskForm] = useState({
    name: "",
    description: "",
    assignees: "",
    due_date: "",
    status: "not_started",
  });
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dropTargetStatus, setDropTargetStatus] = useState("");
  const [sqdcpDropTarget, setSqdcpDropTarget] = useState("");
  const [draggedProjectIndex, setDraggedProjectIndex] = useState(null);
  const [dragOverProjectIndex, setDragOverProjectIndex] = useState(null);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingDepartment, setLoadingDepartment] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [error, setError] = useState("");

  const tasks = useMemo(() => department?.assigned_tasks || [], [department]);
  const projects = useMemo(() => department?.projects || [], [department]);
  const isDepartmentHeadUser = isDepartmentHead(user);
  const ownDepartmentId = user?.department_id ? String(user.department_id) : "";
  const canEditSelectedDepartment = canEditCanban(user, selectedDepartmentId);
  const canOpenBoards = canUseBoards(user);
  const selectedDepartment = useMemo(() => (
    departments.find((item) => String(item.id) === String(selectedDepartmentId)) || null
  ), [departments, selectedDepartmentId]);
  const tasksById = useMemo(() => (
    new Map(tasks.map((task) => [task.id, task]))
  ), [tasks]);
  const selectedProject = useMemo(() => (
    projects.find((project) => String(project.id) === String(selectedProjectId)) || null
  ), [projects, selectedProjectId]);
  const selectedProjectTasks = useMemo(() => selectedProject?.tasks || [], [selectedProject]);
  const tasksByStatus = useMemo(() => {
    const grouped = new Map(TASK_STATUSES.map((status) => [status.value, []]));
    selectedProjectTasks.forEach((task) => {
      grouped.get(normalizeTaskStatus(task.status)).push(task);
    });
    return grouped;
  }, [selectedProjectTasks]);

  useEffect(() => {
    const loadDepartments = async () => {
      setLoadingDepartments(true);
      setError("");
      try {
        const data = await api.getDepartments();
        setDepartments(data);
        setSelectedDepartmentId((currentId) => {
          if (isDepartmentHeadUser) return ownDepartmentId;
          return currentId || (data[0]?.id ? String(data[0].id) : "");
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingDepartments(false);
      }
    };

    loadDepartments();
  }, [isDepartmentHeadUser, ownDepartmentId]);

  useEffect(() => {
    if (isDepartmentHeadUser && ownDepartmentId && selectedDepartmentId !== ownDepartmentId) {
      setSelectedDepartmentId(ownDepartmentId);
    }
  }, [isDepartmentHeadUser, ownDepartmentId, selectedDepartmentId]);

  useEffect(() => {
    if (!selectedDepartmentId) {
      setDepartment(null);
      setSelectedProjectId("");
      return;
    }

    const loadDepartment = async () => {
      setLoadingDepartment(true);
      setError("");
      try {
        const data = await api.getDepartment(selectedDepartmentId);
        if (!data.projects?.length && canEditSelectedDepartment) {
          const legacyRows = readLegacySqdcpRows(selectedDepartmentId);
          if (legacyRows.length > 0) {
            const legacyTasksById = new Map((data.assigned_tasks || []).map((task) => [task.id, task]));
            for (const row of legacyRows) {
              const project = await api.createDepartmentProject(selectedDepartmentId, { name: row.project_name });
              for (const column of SQDCP_COLUMNS) {
                for (const taskId of row.cells[column.key] || []) {
                  const task = legacyTasksById.get(taskId);
                  if (task) {
                    await api.updateBoardTask(task.board_id, task.id, {
                      project_id: project.id,
                      column_key: column.key,
                    });
                  }
                }
              }
            }
            localStorage.removeItem(`canban-sqdcp-${selectedDepartmentId}`);
            setDepartment(await api.getDepartment(selectedDepartmentId));
            return;
          }

          const project = await api.createDepartmentProject(selectedDepartmentId, { name: "Проект 1" });
          data.projects = [project];
        }
        setDepartment(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingDepartment(false);
      }
    };

    loadDepartment();
  }, [canEditSelectedDepartment, selectedDepartmentId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!projects.some((project) => String(project.id) === String(selectedProjectId))) {
      setSelectedProjectId("");
    }
  }, [projects, selectedProjectId]);

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

  const openTaskCreate = (projectId, columnKey) => {
    setTaskCreateTarget({ projectId, columnKey });
    setTaskForm({ name: "", description: "", assignees: "", due_date: "" });
    setShowTaskCreate(true);
  };

  const closeTaskCreate = () => {
    setShowTaskCreate(false);
    setTaskCreateTarget(null);
  };

  const createTask = async (event) => {
    event.preventDefault();
    if (!selectedDepartmentId || !canEditSelectedDepartment) return;

    setTaskSaving(true);
    setError("");
    try {
      const task = await api.createDepartmentTask(selectedDepartmentId, taskForm);
      if (taskCreateTarget) {
        const updatedTask = await api.updateBoardTask(task.board_id, task.id, {
          project_id: taskCreateTarget.projectId,
          column_key: taskCreateTarget.columnKey,
        });
        updateTaskInDepartment({ ...task, ...updatedTask });
        setSelectedProjectId(String(taskCreateTarget.projectId));
      } else {
        setDepartment((currentDepartment) => ({
          ...currentDepartment,
          assigned_tasks: [...(currentDepartment?.assigned_tasks || []), task],
        }));
      }
      setTaskForm({ name: "", description: "", assignees: "", due_date: "" });
      closeTaskCreate();
    } catch (err) {
      setError(err.message);
    } finally {
      setTaskSaving(false);
    }
  };

  const updateTaskInDepartment = (updatedTask) => {
    setDepartment((currentDepartment) => {
      if (!currentDepartment) return currentDepartment;

      const assignedTasks = currentDepartment.assigned_tasks || [];
      const hasAssignedTask = assignedTasks.some((task) => task.id === updatedTask.id);

      return {
        ...currentDepartment,
        assigned_tasks: hasAssignedTask
          ? assignedTasks.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task))
          : [...assignedTasks, { ...updatedTask }],
        projects: (currentDepartment.projects || []).map((project) => ({
          ...project,
          tasks: [
            ...(project.tasks || []).filter((task) => task.id !== updatedTask.id),
            ...(updatedTask.project_id === project.id ? [{ ...updatedTask }] : []),
          ],
        })),
      };
    });
  };

  const removeTaskFromDepartment = (taskId) => {
    setDepartment((currentDepartment) => {
      if (!currentDepartment) return currentDepartment;

      return {
        ...currentDepartment,
        assigned_tasks: (currentDepartment.assigned_tasks || []).filter((task) => task.id !== taskId),
        projects: (currentDepartment.projects || []).map((project) => ({
          ...project,
          tasks: (project.tasks || []).filter((task) => task.id !== taskId),
        })),
      };
    });
  };

  const deleteSelectedTask = async () => {
    if (!selectedTask || !selectedDepartmentId || !canEditSelectedDepartment) return;

    setTaskSaving(true);
    setError("");
    try {
      await api.deleteDepartmentTask(selectedDepartmentId, selectedTask.id);
      removeTaskFromDepartment(selectedTask.id);
      setSelectedTask(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setTaskSaving(false);
    }
  };

  const updateSelectedTaskDetails = async (event) => {
    event.preventDefault();
    if (!selectedTask || !canEditSelectedDepartment) return;

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
      updateTaskInDepartment(mergedTask);
      setSelectedTask(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setTaskSaving(false);
    }
  };

  const handleTaskDragStart = (task, event) => {
    if (!canEditSelectedDepartment) return;
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
    if (!canEditSelectedDepartment) return;
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

  const updateSqdcpProjectName = (projectId, value) => {
    setDepartment((currentDepartment) => ({
      ...currentDepartment,
      projects: (currentDepartment.projects || []).map((project) => (
        project.id === projectId ? { ...project, name: value } : project
      )),
    }));
  };

  const saveSqdcpProjectName = async (project) => {
    const name = project.name.trim();
    if (!name || !selectedDepartmentId || !canEditSelectedDepartment) return;

    try {
      await api.updateDepartmentProject(selectedDepartmentId, project.id, { name });
    } catch (err) {
      setError(err.message);
    }
  };

  const moveProject = async (fromIndex, toIndex) => {
    if (!selectedDepartmentId || !canEditSelectedDepartment) return;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= projects.length || toIndex >= projects.length) return;

    const nextProjects = [...projects];
    const [movedProject] = nextProjects.splice(fromIndex, 1);
    nextProjects.splice(toIndex, 0, movedProject);
    const orderedProjects = nextProjects.map((project, index) => ({ ...project, position: index }));

    setDepartment((currentDepartment) => ({
      ...currentDepartment,
      projects: orderedProjects,
    }));

    setError("");
    try {
      await Promise.all(orderedProjects.map((project) => (
        api.updateDepartmentProject(selectedDepartmentId, project.id, { position: project.position })
      )));
    } catch (err) {
      setError(err.message);
      try {
        setDepartment(await api.getDepartment(selectedDepartmentId));
      } catch {}
    }
  };

  const handleProjectDragStart = (index, event) => {
    if (!canEditSelectedDepartment) return;
    setDraggedProjectIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleProjectDrop = async (index, event) => {
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData("text/plain");
    const fallbackIndex = rawIndex ? Number(rawIndex) : null;
    const sourceIndex = draggedProjectIndex ?? (Number.isInteger(fallbackIndex) ? fallbackIndex : null);
    if (Number.isInteger(sourceIndex)) {
      await moveProject(sourceIndex, index);
    }
    setDraggedProjectIndex(null);
    setDragOverProjectIndex(null);
  };

  const handleProjectDragEnd = () => {
    setDraggedProjectIndex(null);
    setDragOverProjectIndex(null);
  };

  const addSqdcpRow = async () => {
    if (!selectedDepartmentId || !canEditSelectedDepartment) return;

    setError("");
    try {
      const project = await api.createDepartmentProject(selectedDepartmentId, {});
      setDepartment((currentDepartment) => ({
        ...currentDepartment,
        projects: [...(currentDepartment.projects || []), project],
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteSqdcpRow = async (projectId) => {
    if (!selectedDepartmentId || projects.length <= 1 || !canEditSelectedDepartment) return;

    setError("");
    try {
      await api.deleteDepartmentProject(selectedDepartmentId, projectId);
      if (String(selectedProjectId) === String(projectId)) {
        setSelectedProjectId("");
      }
      setDepartment((currentDepartment) => ({
        ...currentDepartment,
        projects: (currentDepartment.projects || []).filter((project) => project.id !== projectId),
        assigned_tasks: (currentDepartment.assigned_tasks || []).map((task) => (
          task.project_id === projectId ? { ...task, project_id: null, column_key: "" } : task
        )),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const moveTaskToSqdcpCell = async (projectId, columnKey, event) => {
    event.preventDefault();
    if (!canEditSelectedDepartment) return;
    const rawTaskId = event.dataTransfer.getData("text/plain");
    const fallbackTaskId = rawTaskId ? Number(rawTaskId) : null;
    const taskId = draggedTaskId ?? (Number.isInteger(fallbackTaskId) ? fallbackTaskId : null);
    const task = tasksById.get(taskId);
    if (!task) return;

    setSqdcpDropTarget("");
    setDraggedTaskId(null);
    setError("");
    try {
      const updatedTask = await api.updateBoardTask(task.board_id, task.id, {
        project_id: projectId,
        column_key: columnKey,
      });
      setSelectedProjectId(String(projectId));
      updateTaskInDepartment({ ...task, ...updatedTask });
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
          {isDepartmentHeadUser ? (
            <div className="readonly-field">
              {selectedDepartment?.name || department?.name || "Отдел не найден"}
            </div>
          ) : (
            <select
              value={selectedDepartmentId}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
            >
              {departments.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowTaskCreate(true)}
          disabled={!selectedDepartmentId || loadingDepartment || !canEditSelectedDepartment}
        >
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Добавить задачу
        </button>
      </div>

      {departments.length > 0 && !loadingDepartment && (
        <section className="canban-sqdcp-section canban-sqdcp-section-first">
          <div className="canban-sqdcp-header">
            <div>
              <h2>SQDCP-доска</h2>
              <p className="page-subtitle">Выберите проект, чтобы открыть его канбан ниже</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={addSqdcpRow} disabled={!canEditSelectedDepartment}>
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
                {projects.map((project, rowIndex) => {
                  const projectStatus = getProjectStatus(project);
                  const isSelectedProject = String(selectedProjectId) === String(project.id);

                  return (
                    <tr
                      key={project.id}
                      className={[
                        "canban-project-row",
                        projectStatusClass(projectStatus),
                        isSelectedProject ? "selected-project-row" : "",
                        draggedProjectIndex === rowIndex ? "row-dragging" : "",
                        draggedProjectIndex !== null && dragOverProjectIndex === rowIndex && draggedProjectIndex !== rowIndex ? "row-drop-target" : "",
                      ].filter(Boolean).join(" ")}
                      onDragOver={(event) => {
                        if (!canEditSelectedDepartment || draggedProjectIndex === null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverProjectIndex(rowIndex);
                      }}
                      onDragLeave={() => {
                        if (dragOverProjectIndex === rowIndex) setDragOverProjectIndex(null);
                      }}
                      onDrop={(event) => {
                        if (canEditSelectedDepartment && draggedProjectIndex !== null) handleProjectDrop(rowIndex, event);
                      }}
                    >
                      <td className="team-cell canban-project-cell" onClick={() => setSelectedProjectId(String(project.id))}>
                        <textarea
                          value={project.name}
                          onChange={(event) => updateSqdcpProjectName(project.id, event.target.value)}
                          onBlur={() => saveSqdcpProjectName(project)}
                          aria-label={`Название проекта ${rowIndex + 1}`}
                          rows={1}
                          readOnly={!canEditSelectedDepartment}
                        />
                        <span className={`project-status-badge ${projectStatusClass(projectStatus)}`}>
                          {PROJECT_STATUS_LABELS[projectStatus] || PROJECT_STATUS_LABELS.not_started}
                        </span>
                      </td>
                      {SQDCP_COLUMNS.map((column) => {
                        const cellKey = `${project.id}:${column.key}`;
                        const cellTasks = (project.tasks || []).filter((task) => task.column_key === column.key);

                        return (
                          <td
                            key={column.key}
                            className={`sqdcp-edit-cell canban-sqdcp-cell${sqdcpDropTarget === cellKey ? " task-drop-target" : ""}`}
                            onDragOver={(event) => {
                              if (!canEditSelectedDepartment || draggedTaskId === null) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              setSqdcpDropTarget(cellKey);
                            }}
                            onDragLeave={(event) => {
                              if (event.currentTarget.contains(event.relatedTarget)) return;
                              setSqdcpDropTarget("");
                            }}
                            onDrop={(event) => moveTaskToSqdcpCell(project.id, column.key, event)}
                          >
                            {cellTasks.length > 0 && (
                              <div className="cell-task-list">
                                {cellTasks.map((task) => (
                                  <button
                                    key={task.id}
                                    type="button"
                                    className={`task-pill canban-task ${taskStatusClass(task)}`}
                                    draggable={canEditSelectedDepartment}
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
                            {canEditSelectedDepartment && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm canban-cell-add-task"
                                onClick={() => openTaskCreate(project.id, column.key)}
                              >
                                <Plus size={14} />
                                Добавить задачу
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="row-action-cell">
                        <div className="row-action-buttons">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm row-drag-handle"
                            draggable={canEditSelectedDepartment}
                            onDragStart={(event) => handleProjectDragStart(rowIndex, event)}
                            onDragEnd={handleProjectDragEnd}
                            aria-label={`Переместить проект ${rowIndex + 1}`}
                            title="Переместить проект"
                          >
                            <GripVertical size={14} />
                          </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => deleteSqdcpRow(project.id)}
                          disabled={projects.length <= 1 || !canEditSelectedDepartment}
                          aria-label={`Удалить проект ${rowIndex + 1}`}
                        >
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
        </section>
      )}

      {departments.length === 0 ? (
        <div className="task-empty-state">Пока нет созданных отделов.</div>
      ) : loadingDepartment ? (
        <div className="loading-panel">Загрузка задач...</div>
      ) : !selectedProject ? (
        <div className="task-empty-state canban-project-placeholder">Выберите проект в SQDCP-доске, чтобы открыть канбан.</div>
      ) : (
        <div className="canban-board">
          {TASK_STATUSES.map((status) => {
            const columnTasks = tasksByStatus.get(status.value) || [];

            return (
              <section
                key={status.value}
                className={`canban-column${dropTargetStatus === status.value ? " task-drop-target" : ""}`}
                onDragOver={(event) => {
                  if (!canEditSelectedDepartment || draggedTaskId === null) return;
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
                        draggable={canEditSelectedDepartment}
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

      {selectedProjectId === "__legacy_disabled__" && departments.length > 0 && !loadingDepartment && (
        <section className="canban-sqdcp-section">
          <div className="canban-sqdcp-header">
            <div>
              <h2>SQDCP-доска</h2>
              <p className="page-subtitle">Проекты выбранного отдела</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={addSqdcpRow} disabled={!canEditSelectedDepartment}>
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
                {projects.map((project, rowIndex) => {
                  const projectStatus = getProjectStatus(project);

                  return (
                  <tr key={project.id} className={`canban-project-row ${projectStatusClass(projectStatus)}`}>
                    <td className="team-cell">
                      <textarea
                        value={project.name}
                        onChange={(event) => updateSqdcpProjectName(project.id, event.target.value)}
                        onBlur={() => saveSqdcpProjectName(project)}
                        aria-label={`Название проекта ${rowIndex + 1}`}
                        rows={1}
                        readOnly={!canEditSelectedDepartment}
                      />
                      <span className={`project-status-badge ${projectStatusClass(projectStatus)}`}>
                        {PROJECT_STATUS_LABELS[projectStatus] || PROJECT_STATUS_LABELS.not_started}
                      </span>
                    </td>
                    {SQDCP_COLUMNS.map((column) => {
                      const cellKey = `${project.id}:${column.key}`;
                      const cellTasks = (project.tasks || []).filter((task) => task.column_key === column.key);

                      return (
                        <td
                          key={column.key}
                          className={`sqdcp-edit-cell canban-sqdcp-cell${sqdcpDropTarget === cellKey ? " task-drop-target" : ""}`}
                          onDragOver={(event) => {
                            if (!canEditSelectedDepartment || draggedTaskId === null) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setSqdcpDropTarget(cellKey);
                          }}
                          onDragLeave={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget)) return;
                            setSqdcpDropTarget("");
                          }}
                          onDrop={(event) => moveTaskToSqdcpCell(project.id, column.key, event)}
                        >
                          {cellTasks.length > 0 && (
                            <div className="cell-task-list">
                              {cellTasks.map((task) => (
                                <button
                                  key={task.id}
                                  type="button"
                                  className={`task-pill canban-task ${taskStatusClass(task)}`}
                                  draggable={canEditSelectedDepartment}
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
                        onClick={() => deleteSqdcpRow(project.id)}
                        disabled={projects.length <= 1 || !canEditSelectedDepartment}
                        aria-label={`Удалить проект ${rowIndex + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="modal canban-task-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{selectedTaskForm.name || selectedTask.name}</h2>
            <form className="task-detail" onSubmit={updateSelectedTaskDetails}>
              <div className="form-group">
                <label>Имя задачи</label>
                <input
                  value={selectedTaskForm.name}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, name: event.target.value })}
                  readOnly={!canEditSelectedDepartment}
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
                  disabled={!canEditSelectedDepartment}
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
                  readOnly={!canEditSelectedDepartment}
                />
              </div>
              <div className="form-group">
                <label>Ответственные</label>
                <input
                  value={selectedTaskForm.assignees}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, assignees: event.target.value })}
                  readOnly={!canEditSelectedDepartment}
                />
              </div>
              <div className="form-group">
                <label>Дата выполнения задачи</label>
                <input
                  type="date"
                  value={selectedTaskForm.due_date}
                  onChange={(event) => setSelectedTaskForm({ ...selectedTaskForm, due_date: event.target.value })}
                  readOnly={!canEditSelectedDepartment}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTask(null)} disabled={taskSaving}>
                  Закрыть
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => navigate(`/boards/${selectedTask.board_id}`)} disabled={taskSaving || !canOpenBoards}>
                  Открыть доску
                </button>
                <button type="button" className="btn btn-danger" onClick={deleteSelectedTask} disabled={taskSaving || !canEditSelectedDepartment}>
                  Удалить
                </button>
                <button type="submit" className="btn btn-primary" disabled={taskSaving || !canEditSelectedDepartment}>
                  {taskSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTaskCreate && (
        <div className="modal-overlay" onClick={closeTaskCreate}>
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
              <div className="form-group">
                <label>Дата выполнения задачи</label>
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={closeTaskCreate} disabled={taskSaving}>
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
