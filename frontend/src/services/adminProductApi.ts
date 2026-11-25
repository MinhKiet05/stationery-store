import type { ProductWriteRequest, ProductStatusRequest, VariantWriteRequest } from './adminTypes';
import type { AdminProductFilters, AdminProductDetail, AdminProductRow, ProductRequest, ProductVariantRequest, ProductVariantResponse, Pagination, Download, StatusPresentation } from './adminTypes';
import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export const productQuery = (filters: AdminProductFilters & Pagination) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)])).toString();
export const productsPath = (filters: AdminProductFilters, page: number) => `/api/admin/products?${productQuery({ ...filters, page, size: 10 })}`;
export const productStatisticsPath = (filters: AdminProductFilters) => `/api/admin/products/statistics?${productQuery(filters)}`;
export async function exportAdminProducts(filters: AdminProductFilters, signal?: AbortSignal): Promise<Download> {
  const response = await apiResponse(`/api/admin/products/export?${productQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob, filename: supplied && /^stationery-products-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-products-${vietnamToday()}.xlsx` };
}

export const getAdminProduct = (id: number, signal?: AbortSignal) => api<AdminProductDetail>(`/api/admin/products/${id}`, { signal });
export const saveAdminProduct = (id: number | null, product: ProductRequest, expectedState?: string | null) => api<AdminProductDetail>(`/api/admin/products${id == null ? '' : `/${id}`}`, { method: id == null ? 'POST' : 'PUT', body: JSON.stringify({ product, expectedState } satisfies ProductWriteRequest) });
export const setAdminProductStatus = (id: number, available: boolean, expectedState: string) => api<AdminProductDetail>(`/api/admin/products/${id}/status`, { method: 'PATCH', body: JSON.stringify({ available, expectedState } satisfies ProductStatusRequest) });
export const deleteAdminProduct = (id: number, expectedState: string) => api<void>(`/api/admin/products/${id}`, { method: 'DELETE', body: JSON.stringify({ expectedState }) });
export const saveAdminVariant = (productID: number, variantID: number | null, variant: ProductVariantRequest, expectedVersion?: number | null) => api<ProductVariantResponse>(`/api/admin/products/${productID}/variants${variantID == null ? '' : `/${variantID}`}`, { method: variantID == null ? 'POST' : 'PUT', body: JSON.stringify({ variant, expectedVersion, initialStock: variantID == null ? variant.stockQuantity : null } satisfies VariantWriteRequest) });
export const productState = (p: Pick<AdminProductRow, 'isActive' | 'available'>): StatusPresentation => !p.isActive ? { label: 'Đã xóa mềm', tone: 'muted' } : p.available ? { label: 'Đang kinh doanh', tone: 'green' } : { label: 'Đang ẩn', tone: 'orange' };
export const productImage = (value: string | null | undefined): string | null => { try { const u = new URL(value ?? ''); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? value ?? null : null; } catch { return null; } };
