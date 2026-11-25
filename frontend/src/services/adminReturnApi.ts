import type { ReceiveReturnRequest, RestockReturnRequest, UpdateReturnStatusRequest } from './adminTypes';
import type { AdminReturnFilters, AdminReturnDetail, ReceiveReturnItem, RestockReturnItem, Pagination, Download } from './adminTypes';
import type { ReturnRequest, ReturnStatus } from './returnService';
import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export const returnStatuses = {
  PENDING: { label: 'Chờ xử lý', tone: 'orange' }, APPROVED: { label: 'Đã chấp thuận', tone: 'blue' },
  REJECTED: { label: 'Đã từ chối', tone: 'red' }, COMPLETED: { label: 'Hoàn tất yêu cầu', tone: 'muted' },
};
export const returnQuery = (filters: AdminReturnFilters & Pagination) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)])).toString();
export const returnsPath = (filters: AdminReturnFilters, page: number) => `/api/admin/returns?${returnQuery({ ...filters, page, size: 10 })}`;
export const returnStatisticsPath = (filters: AdminReturnFilters) => `/api/admin/returns/statistics?${returnQuery(filters)}`;
export const getAdminReturn = (id: number, signal?: AbortSignal) => api<AdminReturnDetail>(`/api/admin/returns/${id}`, { signal });
export const changeAdminReturnStatus = (id: number, status: ReturnStatus, adminNote: string) => api<ReturnRequest>(`/api/admin/returns/${id}/status`, {
  method: 'PATCH', body: JSON.stringify({ status, adminNote: adminNote.trim() || null } satisfies UpdateReturnStatusRequest),
});
export const receiveAdminReturn = (id: number, items: ReceiveReturnItem[]) => api<AdminReturnDetail>(`/api/admin/returns/${id}/receive`, { method: 'POST', body: JSON.stringify({ items } satisfies ReceiveReturnRequest) });
export const restockAdminReturn = (id: number, items: RestockReturnItem[], inspectionNote: string) => api<AdminReturnDetail>(`/api/admin/returns/${id}/restock`, { method: 'POST', body: JSON.stringify({ items, inspectionNote: inspectionNote.trim() || null } satisfies RestockReturnRequest) });
export async function exportAdminReturns(filters: AdminReturnFilters, signal?: AbortSignal): Promise<Download> {
  const response = await apiResponse(`/api/admin/returns/export?${returnQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob, filename: supplied && /^stationery-returns-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-returns-${vietnamToday()}.xlsx` };
}
