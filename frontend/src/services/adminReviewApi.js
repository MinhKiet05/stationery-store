import { api, apiResponse } from './api';
import { vietnamToday } from './dashboardApi';

export function reviewQuery(filters) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null)).toString();
}
export const reviewsPath = (filters, page) => `/api/admin/reviews?${reviewQuery({ ...filters, page, size: 10 })}`;
export const reviewStatisticsPath = filters => `/api/admin/reviews/statistics?${reviewQuery(filters)}`;
export const getAdminReview = (id, signal) => api(`/api/admin/reviews/${id}`, { signal });
export const deleteAdminReview = id => api(`/api/admin/reviews/${id}`, { method: 'DELETE' });

export async function exportAdminReviews(filters, signal) {
  const response = await apiResponse(`/api/admin/reviews/export?${reviewQuery(filters)}`, { signal });
  const blob = await response.blob();
  const supplied = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = supplied && /^stationery-reviews-\d{4}-\d{2}-\d{2}\.xlsx$/.test(supplied)
    ? supplied : `stationery-reviews-${vietnamToday()}.xlsx`;
  return { blob, filename };
}
