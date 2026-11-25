import type { AdminOrderFilters, Pagination, Download } from './adminTypes';
import { apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export const orderQuery = (filters: AdminOrderFilters & Pagination) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)])).toString();
export const ordersPath = (filters: AdminOrderFilters, page: number) => `/api/admin/orders?${orderQuery({ ...filters, page, size: 10 })}`;
export const orderStatisticsPath = (filters: AdminOrderFilters) => `/api/admin/orders/statistics?${orderQuery(filters)}`;
export async function exportAdminOrders(filters: AdminOrderFilters, signal?: AbortSignal): Promise<Download> {
  const response = await apiResponse(`/api/admin/orders/export?${orderQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob, filename: supplied && /^stationery-orders-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-orders-${vietnamToday()}.xlsx` };
}
