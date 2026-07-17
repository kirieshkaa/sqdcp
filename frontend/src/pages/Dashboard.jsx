import { useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Plus, Columns3, Trash2 } from "lucide-react";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import { UserContext } from "../App";
import { canEditBoards } from "../permissions";

export default function Dashboard() {
  const user = useContext(UserContext);
  const canEdit = canEditBoards(user);
  const [boards, setBoards] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [boardToDelete, setBoardToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setBoards(await api.getBoards());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createBoard = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setError("");
    const board = await api.createBoard({ title: title.trim() || "Новая SQDCP-доска" });
    setShowModal(false);
    setTitle("");
    navigate(`/boards/${board.id}`);
  };

  const deleteBoard = async () => {
    if (!boardToDelete || !canEdit) return;
    await api.deleteBoard(boardToDelete.id);
    setBoardToDelete(null);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>SQDCP-доски</h1>
          <p className="page-subtitle">Выберите существующую SQDCP доску или создайте новую</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Создать доску
        </button>}
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-panel">Загрузка...</div>
      ) : boards.length === 0 ? (
        <div className="card empty-state">
          <Columns3 size={48} color="var(--text-secondary)" style={{ marginBottom: "1rem" }} />
          <p>Пока нет SQDCP-досок.</p>
        </div>
      ) : (
        <div className="boards-grid">
          {boards.map((board) => (
            <div key={board.id} className="card board-card board-card-button" onClick={() => navigate(`/boards/${board.id}`)} role="button" tabIndex={0}>
              <div className="board-card-title-area">
                <h3>{board.title}</h3>
              </div>
              <div className="board-card-footer">
                {canEdit && <button
                  className="btn btn-ghost btn-sm delete-icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBoardToDelete(board);
                  }}
                  aria-label={`Удалить доску ${board.title}`}
                >
                  <Trash2 size={14} />
                </button>}
                <div className="board-meta">ID: {board.id}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Новая SQDCP-доска</h2>
            <form onSubmit={createBoard}>
              <div className="form-group">
                <label>Название</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Проект внедрения"
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

      {boardToDelete && (
        <ConfirmDeleteModal
          title="Удалить доску?"
          message={`Доска "${boardToDelete.title}" будет удалена без возможности восстановления.`}
          onCancel={() => setBoardToDelete(null)}
          onConfirm={deleteBoard}
        />
      )}
    </div>
  );
}
