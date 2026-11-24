import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export const returnStatuses = {
  PENDING: { label: 'Chờ xử lý', tone: 'orange' }, APPROVED: { label: 'Đã chấp thuận', tone: 'blue' },
  REJECTED: { label: 'Đã từ chối', tone: 'red' }, COMPLETED: { label: 'Hoàn tất yêu cầu', tone: 'muted' },
};
export const returnQuery = filters => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)).toString();
export const returnsPath = (filters, page) => `/api/admin/returns?${returnQuery({ ...filters, page, size: 10 })}`;
export const returnStatisticsPath = filters => `/api/admin/returns/statistics?${returnQuery(filters)}`;
export const getAdminReturn = (id, signal) => api(`/api/admin/returns/${id}`, { signal });
export const changeAdminReturnStatus = (id, status, adminNote) => api(`/api/admin/returns/${id}/status`, {
  method: 'PATCH', body: JSON.stringify({ status, adminNote: adminNote.trim() || null }),
});
export const receiveAdminReturn = (id, items) => api(`/api/admin/returns/${id}/receive`, { method: 'POST', body: JSON.stringify({ items }) });
export const restockAdminReturn = (id, items, inspectionNote) => api(`/api/admin/returns/${id}/restock`, { method: 'POST', body: JSON.stringify({ items, inspectionNote: inspectionNote.trim() || null }) });
export async function exportAdminReturns(filters, signal) {
  const response = await apiResponse(`/api/admin/returns/export?${returnQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob, filename: supplied && /^stationery-returns-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-returns-${vietnamToday()}.xlsx` };
}
