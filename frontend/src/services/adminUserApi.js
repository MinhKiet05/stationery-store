import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

const query = filters => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)).toString();
export const userRoles = { CUSTOMER: 'Khách hàng', ADMIN: 'Quản trị viên' };
export const usersPath = (filters, page, size) => `/api/admin/users?${query({ ...filters, page, size })}`;
export const userStatisticsPath = filters => `/api/admin/users/statistics?${query({ search: filters.search, role: filters.role, active: filters.active })}`;
// Existing account detail endpoint is already ADMIN-only in UserService.
export const getAdminUser = (id, signal) => api(`/api/users/${id}`, { signal });
export const changeAdminUser = (user, changes) => api(`/api/admin/users/${user.userID}`, {
  method: 'PATCH', body: JSON.stringify({ expectedRole: user.role, expectedActive: user.isActive, ...changes }),
});
export async function exportAdminUsers(filters, signal) {
  const response = await apiResponse(`/api/admin/users/export?${query(filters)}`, { signal });
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob: await response.blob(), filename: supplied && /^stationery-users-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-users-${vietnamToday()}.xlsx` };
}
export const userInitials = user => (user.fullName || user.username || '?').trim().split(/\s+/).slice(-2).map(word => [...word][0]).join('').toLocaleUpperCase('vi-VN');
