import type { UpdateOrderStatusRequest, UpdateStockRequest } from './adminTypes';
import type { AdminIdentity, AdminOrderDetail, ProductVariantResponse, QueryParameters, DateRange, StatusPresentation } from './adminTypes';
import type { StatisticsResponses, StatisticsPath, DashboardResponses, DashboardPath } from './adminTypes';
import type { Order, OrderStatus } from './orderService';
import { errorStatus } from './apiError';
import { api } from './api';

export const dashboardIdentity = (signal?: AbortSignal) => api<AdminIdentity>('/api/auth/me', { signal });
export function dashboardRequest<R extends keyof StatisticsResponses>(path: StatisticsPath<R>, signal?: AbortSignal): Promise<StatisticsResponses[R]>;
export function dashboardRequest<R extends keyof DashboardResponses>(path: DashboardPath<R>, signal?: AbortSignal): Promise<DashboardResponses[R]>;
// Dynamic admin list paths still require an explicit response type at TS call sites.
export function dashboardRequest<T = unknown>(path: string, signal?: AbortSignal): Promise<T>;
export function dashboardRequest(path: string, signal?: AbortSignal): Promise<unknown> {
  return api(path, { signal });
}
export const getAdminOrder = (id: number, signal?: AbortSignal) => api<AdminOrderDetail>(`/api/admin/orders/${id}`, { signal });
export const confirmCodPayment = (id: number) => api<Order>(`/api/admin/orders/${id}/confirm-payment`, {
  method: 'POST', body: JSON.stringify({ reference: `RECEIPT-${id}` }),
});
export const changeAdminOrderStatus = (id: number, status: OrderStatus, order: Pick<Order, 'status' | 'isPaid'>) => api<Order>(`/api/admin/orders/${id}/status`, {
  method: 'PATCH', body: JSON.stringify({ status, expectedStatus: order.status, expectedPaid: order.isPaid } satisfies UpdateOrderStatusRequest),
});
export const getStockVariant = (id: number, signal?: AbortSignal) => api<ProductVariantResponse>(`/api/product-variants/${id}`, { signal });
export const updateVariantStock = (id: number, stockQuantity: number, version: number) => api<ProductVariantResponse>(`/api/admin/product-variants/${id}/stock`, {
  method: 'PATCH', body: JSON.stringify({ stockQuantity, version } satisfies UpdateStockRequest),
});
export const adminErrorMessage = (error: unknown): string => {
  const status = errorStatus(error);
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Dữ liệu không còn tồn tại hoặc đã bị xóa.';
  if (status === 409) return 'Dữ liệu đã thay đổi hoặc thao tác không còn hợp lệ. Hãy tải lại chi tiết trước khi tiếp tục.';
  if (status === 400) return 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.';
  return 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra kết nối và thử lại.';
};
export const storedDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const [date, time] = value.split('T');
  return `${date.split('-').reverse().join('/')} · ${time?.slice(0, 5) || ''}`;
};
export const statisticsPath = <R extends keyof StatisticsResponses>(resource: R, range: DateRange, extra: QueryParameters = {}): StatisticsPath<R> =>
  `/api/admin/statistics/${resource}?${new URLSearchParams(Object.entries({ ...range, ...extra }).map(([key, value]) => [key, String(value)]))}`;
export const dashboardPath = <R extends keyof DashboardResponses>(resource: R, params: QueryParameters = {}): DashboardPath<R> =>
  `/api/admin/dashboard/${resource}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`;

export const currency = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(value);
export const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
export const vietnamToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
export const initialRange = () => {
  const today = vietnamToday();
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
};

export const orderStatuses: Record<OrderStatus, StatusPresentation> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'orange' },
  PROCESSING: { label: 'Đang xử lý', tone: 'blue' },
  SHIPPED: { label: 'Đang giao', tone: 'blue' },
  DELIVERED: { label: 'Đã giao', tone: 'green' },
  CANCELLED: { label: 'Đã hủy', tone: 'muted' },
  RETURN_PENDING: { label: 'Chờ trả hàng', tone: 'red' },
};
