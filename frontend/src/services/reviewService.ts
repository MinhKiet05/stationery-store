import { api } from "./api";
import { queryOptions } from '@tanstack/react-query';
import { cacheTimes, queryKeys } from './queryCache';

export type ReviewImage = { imageUrl: string; imagePosition: number };
export type Review = {
  reviewID: number;
  productID: number;
  userID: number;
  username: string;
  rating: number;
  comment: string;
  reviewDate: string;
  images?: ReviewImage[];
};
export type ReviewInput = { rating: number; comment: string; images: File[] };

export function getProductReviews(productID: number, signal?: AbortSignal) {
  return api<Review[]>(`/api/products/${productID}/reviews`, { signal });
}

export const purchasedReviewsOptions = (productID: number, scope: string) => queryOptions({
  queryKey: queryKeys.private('reviews', { productID }, scope),
  queryFn: ({ signal }) => getProductReviews(productID, signal),
  staleTime: cacheTimes.reviews,
});

export function validateReviewInput(input: ReviewInput): string | null {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return 'Vui lòng chọn chất lượng từ 1 đến 5 sao.';
  if (!input.comment.trim() || input.comment.length > 500) return 'Hãy viết nhận xét từ 1 đến 500 ký tự.';
  if (input.images.length > 5) return 'Mỗi đánh giá được thêm tối đa 5 ảnh.';
  if (input.images.some(image => !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)
    || image.size === 0 || image.size > 5 * 1024 * 1024)) return 'Chỉ nhận ảnh JPG, PNG, WebP hợp lệ, mỗi ảnh không quá 5 MB.';
  return null;
}

function reviewBody(input: ReviewInput, removeImagePositions: number[] = []): BodyInit {
  const review = { rating: input.rating, comment: input.comment };
  if (!input.images.length && !removeImagePositions.length) return JSON.stringify(review);
  const body = new FormData();
  body.append('review', new Blob([JSON.stringify(review)], { type: 'application/json' }));
  input.images.forEach(image => body.append('images', image));
  if (removeImagePositions.length) body.append('removeImagePositions', new Blob([JSON.stringify(removeImagePositions)], { type: 'application/json' }));
  return body;
}

export async function createProductReview(productID: number, input: ReviewInput, signal?: AbortSignal) {
  const validation = validateReviewInput(input);
  if (validation) throw new Error(validation);
  return api<Review>(`/api/products/${productID}/reviews`, { method: 'POST', body: reviewBody(input), signal });
}

export function updateProductReview(reviewID: number, input: ReviewInput, removeImagePositions: number[], signal?: AbortSignal) {
  return api<Review>(`/api/reviews/${reviewID}`, { method: 'PUT', body: reviewBody(input, removeImagePositions), signal });
}
