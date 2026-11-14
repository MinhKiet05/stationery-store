import { api } from "./api";

export type Review = {
  reviewID: number;
  username: string;
  rating: number;
  comment: string;
  reviewDate: string;
};

export function getProductReviews(productID: number, signal?: AbortSignal) {
  return api<Review[]>(`/api/products/${productID}/reviews`, { signal });
}
