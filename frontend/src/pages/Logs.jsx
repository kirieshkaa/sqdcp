import { useEffect, useState } from "react";
import { api } from "../api/client";

const ACTION_LABELS = {
  board_created: "Создание доски",
  board_updated: "Изменение доски",
  board_deleted: "Удаление доски",
  task_created: "Создание задачи",
  task_updated: "Изменение задачи",
  task_assigned: "Распределение задачи",
  task_deleted: "Удаление задачи",
  project_created: "Создание проекта",
  project_updated: "Изменение проекта",
  project_deleted: "Удаление проекта",
};

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ru-RU");
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        setLogs(await api.getLogs());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Логи</h1>
          <p className="page-subtitle">История изменений по доскам, проектам и задачам</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-panel">Загрузка...</div>
      ) : logs.length === 0 ? (
        <div className="card empty-state">Пока нет записей журнала.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Пользователь</th>
                <th>Действие</th>
                <th>Описание</th>
                <th>Связи</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.created_at)}</td>
                  <td>{log.username || "Система"}</td>
                  <td>{ACTION_LABELS[log.action] || log.action}</td>
                  <td>{log.summary}</td>
                  <td className="admin-muted">
                    {[
                      log.board_id ? `доска #${log.board_id}` : "",
                      log.project_id ? `проект #${log.project_id}` : "",
                      log.task_id ? `задача #${log.task_id}` : "",
                      log.column_key ? log.column_key : "",
                    ].filter(Boolean).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
