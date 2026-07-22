export function normalizeRole(role) {
  if (role === "manager") return "minister";
  if (role === "user" || role === "viewer") return "department_head";
  return role || "department_head";
}

export function isAdmin(user) {
  return normalizeRole(user?.role) === "admin";
}

export function isMinister(user) {
  return normalizeRole(user?.role) === "minister";
}

export function isDepartmentHead(user) {
  return normalizeRole(user?.role) === "department_head";
}

export function canUseBoards(user) {
  return isAdmin(user) || isMinister(user) || isDepartmentHead(user);
}

export function canEditBoards(user) {
  return isAdmin(user) || isMinister(user);
}

export function canUseCalendar(user) {
  return isAdmin(user) || isMinister(user) || isDepartmentHead(user);
}

export function canEditCalendar(user) {
  return canEditBoards(user);
}

export function canUseDepartments(user) {
  return isAdmin(user) || isMinister(user) || isDepartmentHead(user);
}

export function canEditDepartments(user) {
  return isAdmin(user);
}

export function canUseCanban(user) {
  return isAdmin(user) || isMinister(user) || isDepartmentHead(user);
}

export function canEditCanban(user, departmentId) {
  if (isAdmin(user)) return true;
  return isDepartmentHead(user) && Number(user?.department_id) === Number(departmentId);
}

export function canUseAdminPages(user) {
  return isAdmin(user);
}

export function defaultPathForUser(user) {
  return canUseBoards(user) ? "/boards" : "/canban";
}
