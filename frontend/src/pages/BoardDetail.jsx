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
  { key: "people", label: "People", description: "персонал" },
];

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

export default function BoardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [error, setError] = useState("");
  const [draggedRowIndex, setDraggedRowIndex] = useState(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState(null);
  const bypassUnsavedPromptRef = useRef(false);

  const currentSnapshot = useMemo(() => (
    board ? createBoardSnapshot(board, rows) : ""
  ), [board, rows]);
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
      setColumns(data.columns || DEFAULT_COLUMNS);
      setDepartments(departmentList);
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
      setColumns(data.columns || DEFAULT_COLUMNS);
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
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                className={[
                  draggedRowIndex === idx ? "row-dragging" : "",
                  dragOverRowIndex === idx && draggedRowIndex !== idx ? "row-drop-target" : "",
                ].filter(Boolean).join(" ")}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverRowIndex(idx);
                }}
                onDragLeave={() => {
                  if (dragOverRowIndex === idx) setDragOverRowIndex(null);
                }}
                onDrop={(event) => handleRowDrop(idx, event)}
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
                </td>
                {columns.map((column) => (
                  <td key={column.key} className="sqdcp-edit-cell">
                    <textarea
                      value={row[column.key] || ""}
                      onChange={(e) => handleCellChange(idx, column.key, e)}
                      ref={(element) => { if (element) resizeTextarea(element); }}
                      aria-label={`${column.label}, ${row.team_name}`}
                    />
                  </td>
                ))}
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
            ))}
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
          <div className="modal" onClick={(event) => event.stopPropagation()}>
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
