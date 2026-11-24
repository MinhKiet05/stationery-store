import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export const productQuery = filters => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)).toString();
export const productsPath = (filters, page) => `/api/admin/products?${productQuery({ ...filters, page, size: 10 })}`;
export const productStatisticsPath = filters => `/api/admin/products/statistics?${productQuery(filters)}`;
export async function exportAdminProducts(filters, signal) {
  const response = await apiResponse(`/api/admin/products/export?${productQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob, filename: supplied && /^stationery-products-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-products-${vietnamToday()}.xlsx` };
}

export const getAdminProduct = (id, signal) => api(`/api/admin/products/${id}`, { signal });
export const saveAdminProduct = (id, product, expectedState) => api(`/api/admin/products${id == null ? '' : `/${id}`}`, { method: id == null ? 'POST' : 'PUT', body: JSON.stringify({ product, expectedState }) });
export const setAdminProductStatus = (id, available, expectedState) => api(`/api/admin/products/${id}/status`, { method: 'PATCH', body: JSON.stringify({ available, expectedState }) });
export const deleteAdminProduct = (id, expectedState) => api(`/api/admin/products/${id}`, { method: 'DELETE', body: JSON.stringify({ expectedState }) });
export const saveAdminVariant = (productID, variantID, variant, expectedVersion) => api(`/api/admin/products/${productID}/variants${variantID == null ? '' : `/${variantID}`}`, { method: variantID == null ? 'POST' : 'PUT', body: JSON.stringify({ variant, expectedVersion, initialStock: variantID == null ? variant.stockQuantity : null }) });
export const productState = p => !p.isActive ? { label: 'Đã xóa mềm', tone: 'muted' } : p.available ? { label: 'Đang kinh doanh', tone: 'green' } : { label: 'Đang ẩn', tone: 'orange' };
export const productImage = value => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? value : null; } catch { return null; } };
