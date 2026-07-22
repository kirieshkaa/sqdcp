import { useEffect, useState } from "react";
import { api } from "../api/client";

const COLUMNS = [
  { key: "safety", label: "Safety" },
  { key: "quality", label: "Quality" },
  { key: "delivery", label: "Delivery" },
  { key: "cost", label: "Cost" },
  { key: "people", label: "People" },
];

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

export default function SqdcpStats() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        setStats(await api.getSqdcpStats());
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
          <h1>SQDCP статистика</h1>
          <p className="page-subtitle">Сколько задач было добавлено в каждый столбец по датам</p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="loading-panel">Загрузка...</div>
      ) : stats.length === 0 ? (
        <div className="card empty-state">Пока нет данных для статистики.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table stats-table">
            <thead>
              <tr>
                <th>Дата</th>
                {COLUMNS.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th>Всего</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const total = COLUMNS.reduce((sum, column) => sum + Number(row[column.key] || 0), 0);

                return (
                  <tr key={row.date}>
                    <td>{formatDate(row.date)}</td>
                    {COLUMNS.map((column) => (
                      <td key={column.key}>{row[column.key] || 0}</td>
                    ))}
                    <td><strong>{total}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
