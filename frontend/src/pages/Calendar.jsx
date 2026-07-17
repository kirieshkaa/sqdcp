import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { CalendarDays, Columns3, Trash2 } from "lucide-react";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal";
import { UserContext } from "../App";
import { canEditCalendar } from "../permissions";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function getBoardDate(board) {
  return board.board_date || board.created_at?.slice(0, 10) || "";
}

export default function Calendar() {
  const navigate = useNavigate();
  const user = useContext(UserContext);
  const canEdit = canEditCalendar(user);
  const currentDate = useMemo(() => new Date(), []);
  const [boards, setBoards] = useState([]);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [monthIndex, setMonthIndex] = useState(currentDate.getMonth());
  const [selectedDate, setSelectedDate] = useState(currentDate.toISOString().slice(0, 10));
  const [boardToDelete, setBoardToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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

    load();
  }, []);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const days = [];

    for (let i = 0; i < startOffset; i += 1) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(year, monthIndex, day);
      days.push({
        day,
        key,
        boardsCount: boards.filter((board) => getBoardDate(board) === key).length,
      });
    }

    return days;
  }, [boards, monthIndex, year]);

  const selectedBoards = boards.filter((board) => getBoardDate(board) === selectedDate);

  const handleMonthChange = (value) => {
    const nextMonthIndex = Number(value);
    setMonthIndex(nextMonthIndex);
    setSelectedDate(dateKey(year, nextMonthIndex, 1));
  };

  const handleYearChange = (value) => {
    const nextYear = Number(value);
    setYear(nextYear);
    setSelectedDate(dateKey(nextYear, monthIndex, 1));
  };

  const deleteBoard = async () => {
    if (!boardToDelete || !canEdit) return;
    await api.deleteBoard(boardToDelete.id);
    setBoards(boards.filter((board) => board.id !== boardToDelete.id));
    setBoardToDelete(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Календарь SQDCP</h1>
          <p className="page-subtitle">Выберите месяц и день, чтобы увидеть доски на выбранную дату.</p>
        </div>
        <div className="month-picker-control">
          <CalendarDays size={18} />
          <select value={monthIndex} onChange={(e) => handleMonthChange(e.target.value)}>
            {MONTHS.map((monthName, idx) => (
              <option key={monthName} value={idx}>{monthName}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => handleYearChange(e.target.value)} aria-label="Год">
            {Array.from({ length: 9 }, (_, idx) => currentDate.getFullYear() - 4 + idx).map((yearOption) => (
              <option key={yearOption} value={yearOption}>{yearOption}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="calendar-page-grid">
        <section className="calendar-month-panel">
          <div className="calendar-weekdays">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday}>{weekday}</div>
            ))}
          </div>
          <div className="calendar-month-grid">
            {calendarDays.map((day, idx) => (
              day ? (
                <button
                  key={day.key}
                  className={`calendar-month-day${selectedDate === day.key ? " selected" : ""}`}
                  onClick={() => setSelectedDate(day.key)}
                >
                  <span className="calendar-day-number">{day.day}</span>
                  {day.boardsCount > 0 && (
                    <span className="calendar-board-count">{day.boardsCount}</span>
                  )}
                </button>
              ) : (
                <div key={`empty-${idx}`} className="calendar-month-day empty"></div>
              )
            ))}
          </div>
        </section>

        <aside className="calendar-board-panel">
          <h2>{selectedDate}</h2>
          {loading ? (
            <div className="loading-panel">Загрузка...</div>
          ) : selectedBoards.length === 0 ? (
            <div className="calendar-empty-day">
              <Columns3 size={38} />
              <p>На эту дату досок нет.</p>
            </div>
          ) : (
            <div className="calendar-board-list">
              {selectedBoards.map((board) => (
                <div key={board.id} className="calendar-board-item">
                  <button className="calendar-board-open" onClick={() => navigate(`/boards/${board.id}`)}>
                    <strong>{board.title}</strong>
                    <span>ID: {board.id}</span>
                  </button>
                  {canEdit && <button
                    className="btn btn-ghost btn-sm delete-icon-button"
                    onClick={() => setBoardToDelete(board)}
                    aria-label={`Удалить доску ${board.title}`}
                  >
                    <Trash2 size={14} />
                  </button>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

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
