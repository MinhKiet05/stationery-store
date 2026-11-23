import { api } from './api';

export const dashboardIdentity = (signal) => api('/api/auth/me', { signal });
export const dashboardRequest = (path, signal) => api(path, { signal });
export const statisticsPath = (resource, range, extra = {}) =>
  `/api/admin/statistics/${resource}?${new URLSearchParams({ ...range, ...extra })}`;
export const dashboardPath = (resource, params = {}) =>
  `/api/admin/dashboard/${resource}?${new URLSearchParams(params)}`;

export const currency = (value) => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(value);
export const number = (value) => new Intl.NumberFormat('vi-VN').format(value);
export const vietnamToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
export const initialRange = () => {
  const today = vietnamToday();
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
};

export const orderStatuses = {
  PENDING: { label: 'Chờ xác nhận', tone: 'orange' },
  PROCESSING: { label: 'Đang xử lý', tone: 'blue' },
  SHIPPED: { label: 'Đang giao', tone: 'blue' },
  DELIVERED: { label: 'Đã giao', tone: 'green' },
  CANCELLED: { label: 'Đã hủy', tone: 'muted' },
  RETURN_PENDING: { label: 'Chờ trả hàng', tone: 'red' },
};
