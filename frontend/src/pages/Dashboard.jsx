import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Plus, Columns3 } from "lucide-react";

export default function Dashboard() {
  const [boards, setBoards] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
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
    setError("");
    const board = await api.createBoard({ title: title.trim() || "Новая SQDCP-доска" });
    setShowModal(false);
    setTitle("");
    navigate(`/boards/${board.id}`);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>SQDCP-доски</h1>
          <p className="page-subtitle">Выберите доску или создайте новую таблицу команд.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Создать доску
        </button>
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
            <button key={board.id} className="card board-card board-card-button" onClick={() => navigate(`/boards/${board.id}`)}>
              <div>
                <h3>{board.title}</h3>
                <p>{board.description || "SQDCP-доска команд проекта"}</p>
              </div>
              <div className="board-meta">ID: {board.id}</div>
            </button>
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
    </div>
  );
}
