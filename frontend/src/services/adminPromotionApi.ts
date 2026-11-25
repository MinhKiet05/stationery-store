import type { AdminPromotionFilters, PromotionRequest, PromotionResponse, PromotionValues, Pagination, Download } from './adminTypes';
import { api, apiResponse } from './api';
import { vietnamToday, currency, number } from './dashboardApi';

export const promotionStatuses = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'green' }, NOT_STARTED: { label: 'Chưa bắt đầu', tone: 'blue' },
  EXPIRED: { label: 'Hết hạn', tone: 'muted' }, DISABLED: { label: 'Đã vô hiệu hóa', tone: 'muted' },
  EXHAUSTED: { label: 'Hết lượt sử dụng', tone: 'red' },
};
export const promotionDate = (value: string | null | undefined) => value ? value.split('-').reverse().join('/') : 'Không giới hạn';
export const promotionDiscount = (row: Pick<PromotionValues, 'discountType' | 'discountValue'>) => row.discountType === 'PERCENTAGE' ? `${number(row.discountValue)}%` : currency(row.discountValue);
export const promotionQuery = (filters: AdminPromotionFilters & Pagination) => new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)])).toString();
export const promotionsPath = (filters: AdminPromotionFilters, page: number) => `/api/admin/promotions?${promotionQuery({ ...filters, page, size: 10 })}`;
export const promotionStatisticsPath = (filters: AdminPromotionFilters) => `/api/admin/promotions/statistics?${promotionQuery(filters)}`;
export const getAdminPromotion = (id: number, signal?: AbortSignal) => api<PromotionResponse>(`/api/coupons/${id}`, { signal });
export const createAdminPromotion = (values: PromotionRequest) => api<PromotionResponse>('/api/coupons', { method: 'POST', body: JSON.stringify(values) });
export const updateAdminPromotion = (id: number, values: PromotionRequest) => api<PromotionResponse>(`/api/coupons/${id}`, { method: 'PUT', body: JSON.stringify(values) });
export const promotionValues = (row: PromotionValues): PromotionValues => {
  const { code, discountType, discountValue, minOrderValue, startDate, endDate, usageLimit, isActive } = row;
  return { code, discountType, discountValue, minOrderValue, startDate, endDate, usageLimit, isActive };
};

export async function exportAdminPromotions(filters: AdminPromotionFilters, signal?: AbortSignal): Promise<Download> {
  const response = await apiResponse(`/api/admin/promotions/export?${promotionQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  return { blob, filename: supplied && /^stationery-promotions-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied) ? supplied : `stationery-promotions-${vietnamToday()}.xlsx` };
}
