import type { AdminReviewFilters, AdminReviewDetail, Pagination, Download } from './adminTypes';
import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export function reviewQuery(filters: AdminReviewFilters & Pagination) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null).map(([key, value]) => [key, String(value)])).toString();
}
export const reviewsPath = (filters: AdminReviewFilters, page: number) => `/api/admin/reviews?${reviewQuery({ ...filters, page, size: 10 })}`;
export const reviewStatisticsPath = (filters: AdminReviewFilters) => `/api/admin/reviews/statistics?${reviewQuery(filters)}`;
export const getAdminReview = (id: number, signal?: AbortSignal) => api<AdminReviewDetail>(`/api/admin/reviews/${id}`, { signal });
export const deleteAdminReview = (id: number) => api<void>(`/api/admin/reviews/${id}`, { method: 'DELETE' });

export async function exportAdminReviews(filters: AdminReviewFilters, signal?: AbortSignal): Promise<Download> {
  const response = await apiResponse(`/api/admin/reviews/export?${reviewQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = supplied && /^stationery-reviews-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied)
    ? supplied : `stationery-reviews-${vietnamToday()}.xlsx`;
  return { blob, filename };
}
