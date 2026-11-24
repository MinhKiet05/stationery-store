import { apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export const orderQuery = filters => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)).toString();
export const ordersPath = (filters, page) => `/api/admin/orders?${orderQuery({ ...filters, page, size: 10 })}`;
export const orderStatisticsPath = filters => `/api/admin/orders/statistics?${orderQuery(filters)}`;
export async function exportAdminOrders(filters, signal) {
  const response = await apiResponse(`/api/admin/orders/export?${orderQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob, filename: supplied && /^stationery-orders-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-orders-${vietnamToday()}.xlsx` };
}
