import { api } from './api';

export const dashboardIdentity = (signal) => api('/api/auth/me', { signal });
export const dashboardRequest = (path, signal) => api(path, { signal });
export const getAdminOrder = (id, signal) => api(`/api/admin/orders/${id}`, { signal });
export const confirmCodPayment = (id) => api(`/api/admin/orders/${id}/confirm-payment`, {
  method: 'POST', body: JSON.stringify({ reference: `RECEIPT-${id}` }),
});
export const changeAdminOrderStatus = (id, status, order) => api(`/api/admin/orders/${id}/status`, {
  method: 'PATCH', body: JSON.stringify({ status, expectedStatus: order.status, expectedPaid: order.isPaid }),
});
export const getStockVariant = (id, signal) => api(`/api/product-variants/${id}`, { signal });
export const updateVariantStock = (id, stockQuantity, version) => api(`/api/admin/product-variants/${id}/stock`, {
  method: 'PATCH', body: JSON.stringify({ stockQuantity, version }),
});
export const adminErrorMessage = (error) => {
  if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (error.status === 404) return 'Dữ liệu không còn tồn tại hoặc đã bị xóa.';
  if (error.status === 409) return 'Dữ liệu đã thay đổi hoặc thao tác không còn hợp lệ. Hãy tải lại chi tiết trước khi tiếp tục.';
  if (error.status === 400) return 'Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.';
  return 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra kết nối và thử lại.';
};
export const storedDateTime = (value) => {
  if (!value) return '—';
  const [date, time] = value.split('T');
  return `${date.split('-').reverse().join('/')} · ${time?.slice(0, 5) || ''}`;
};
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
