import type { AdminUserChangeRequest } from './adminTypes';
import type { AdminUserFilters, AdminUserRow, AdminUserChanges, Pagination, Download } from './adminTypes';
import type { UserProfile } from './userService';
import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

const query = (filters: AdminUserFilters & Pagination) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)])).toString();
export const userRoles = { CUSTOMER: 'Khách hàng', ADMIN: 'Quản trị viên' };
export const usersPath = (filters: AdminUserFilters, page: number, size: number) => `/api/admin/users?${query({ ...filters, page, size })}`;
export const userStatisticsPath = (filters: AdminUserFilters) => `/api/admin/users/statistics?${query({ search: filters.search, role: filters.role, active: filters.active })}`;
// Existing account detail endpoint is already ADMIN-only in UserService.
export const getAdminUser = (id: number, signal?: AbortSignal) => api<UserProfile>(`/api/users/${id}`, { signal });
export const changeAdminUser = (user: Pick<AdminUserRow, 'userID' | 'role' | 'isActive'>, changes: AdminUserChanges) => api<AdminUserRow>(`/api/admin/users/${user.userID}`, {
  method: 'PATCH', body: JSON.stringify({ expectedRole: user.role, expectedActive: user.isActive, ...changes } satisfies AdminUserChangeRequest),
});
export async function exportAdminUsers(filters: AdminUserFilters, signal?: AbortSignal): Promise<Download> {
  const response = await apiResponse(`/api/admin/users/export?${query(filters)}`, { signal });
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob: await response.blob(), filename: supplied && /^stationery-users-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-users-${vietnamToday()}.xlsx` };
}
export const userInitials = (user: Pick<UserProfile, 'fullName' | 'username'>) => (user.fullName || user.username || '?').trim().split(/\s+/).slice(-2).map(word => [...word][0]).join('').toLocaleUpperCase('vi-VN');
