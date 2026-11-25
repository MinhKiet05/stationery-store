import { api } from "./api";

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

function reviewBody(input: ReviewInput, removeImagePositions: number[] = []): BodyInit {
  const review = { rating: input.rating, comment: input.comment };
  if (!input.images.length && !removeImagePositions.length) return JSON.stringify(review);
  const body = new FormData();
  body.append('review', new Blob([JSON.stringify(review)], { type: 'application/json' }));
  input.images.forEach(image => body.append('images', image));
  if (removeImagePositions.length) body.append('removeImagePositions', new Blob([JSON.stringify(removeImagePositions)], { type: 'application/json' }));
  return body;
}

export function createProductReview(productID: number, input: ReviewInput, signal?: AbortSignal) {
  return api<Review>(`/api/products/${productID}/reviews`, { method: 'POST', body: reviewBody(input), signal });
}

export function updateProductReview(reviewID: number, input: ReviewInput, removeImagePositions: number[], signal?: AbortSignal) {
  return api<Review>(`/api/reviews/${reviewID}`, { method: 'PUT', body: reviewBody(input, removeImagePositions), signal });
}
