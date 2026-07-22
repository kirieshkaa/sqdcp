const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(status, body) {
    super(typeof body === "string" ? body : body?.error || body?.errors?.join("; ") || `Ошибка ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const body = options.body;
  if (!(body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers, body });
  } catch {
    throw new Error("Не удалось связаться с backend. Проверьте, что сервер запущен на http://localhost:8000, и перезапустите backend после изменений.");
  }

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : null;

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new ApiError(401, data);
  }

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }

  return data;
}

export const api = {
  login: (username, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (data) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => request("/api/auth/me"),
  getRegistrationDepartments: () => request("/api/auth/registration-departments"),
  getPendingRegistrations: () => request("/api/auth/pending"),
  approveRegistration: (id, data) => request(`/api/auth/approve/${id}`, { method: "POST", body: JSON.stringify(data) }),
  rejectRegistration: (id) => request(`/api/auth/reject/${id}`, { method: "POST" }),
  seed: (password) =>
    request("/api/auth/seed", { method: "POST", body: JSON.stringify({ password: password || "test123" }) }),

  getBoards: () => request("/api/boards"),
  createBoard: (data) => request("/api/boards", { method: "POST", body: JSON.stringify(data) }),
  getBoard: (id) => request(`/api/boards/${id}`),
  updateBoard: (id, data) => request(`/api/boards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBoard: (id) => request(`/api/boards/${id}`, { method: "DELETE" }),
  getBoardTasks: (boardId) => request(`/api/boards/${boardId}/tasks`),
  createBoardTask: (boardId, data) => request(`/api/boards/${boardId}/tasks`, { method: "POST", body: JSON.stringify(data) }),
  updateBoardTask: (boardId, taskId, data) => request(`/api/boards/${boardId}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBoardTask: (boardId, taskId) => request(`/api/boards/${boardId}/tasks/${taskId}`, { method: "DELETE" }),

  getDepartments: () => request("/api/departments"),
  createDepartment: (data) => request("/api/departments", { method: "POST", body: JSON.stringify(data) }),
  getDepartment: (id) => request(`/api/departments/${id}`),
  updateDepartment: (id, data) => request(`/api/departments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDepartment: (id) => request(`/api/departments/${id}`, { method: "DELETE" }),
  createDepartmentTask: (departmentId, data) => request(`/api/departments/${departmentId}/tasks`, { method: "POST", body: JSON.stringify(data) }),
  deleteDepartmentTask: (departmentId, taskId) => request(`/api/departments/${departmentId}/tasks/${taskId}`, { method: "DELETE" }),
  createDepartmentProject: (departmentId, data) => request(`/api/departments/${departmentId}/projects`, { method: "POST", body: JSON.stringify(data) }),
  updateDepartmentProject: (departmentId, projectId, data) => request(`/api/departments/${departmentId}/projects/${projectId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDepartmentProject: (departmentId, projectId) => request(`/api/departments/${departmentId}/projects/${projectId}`, { method: "DELETE" }),

  getLogs: () => request("/api/admin/logs"),
  getSqdcpStats: () => request("/api/admin/sqdcp-stats"),
};
