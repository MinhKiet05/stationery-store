import { queryOptions, useQuery } from '@tanstack/react-query';
import { api, API_BASE } from './api';
import { getProduct, getProductVariants, getProducts, getRelatedProducts } from './productService';
import { getProductReviews } from './reviewService';
import { getCurrentUser } from './authService';
import { queryKeys, cacheTimes } from './queryCache';
import useSessionScope from './useSessionScope';
import type { Cart } from './cartService';
export const productOptions = (handle: string) => queryOptions({ queryKey: queryKeys.public('productDetail', { handle }),
  queryFn: ({ signal }) => getProduct(handle, signal), staleTime: cacheTimes.productDetail });
export const variantsOptions = (id: number) => queryOptions({ queryKey: queryKeys.public('inventory', { id }),
  queryFn: ({ signal }) => getProductVariants(id, signal), enabled: !!id, staleTime: cacheTimes.inventory });
export const reviewsOptions = (id: number) => queryOptions({ queryKey: queryKeys.public('reviews', { id }),
  queryFn: ({ signal }) => getProductReviews(id, signal), enabled: !!id, staleTime: cacheTimes.reviews });
export const homeOptions = () => queryOptions({ queryKey: queryKeys.public('products', { home: true }),
  queryFn: ({ signal }) => getProducts(signal), staleTime: cacheTimes.products });
export const relatedOptions = (id: number) => queryOptions({ queryKey: queryKeys.public('products', { related: id }),
  queryFn: ({ signal }) => getRelatedProducts(id, signal), enabled: !!id, staleTime: cacheTimes.products });
export function useCurrentUser(base = API_BASE) {
  const scope = useSessionScope();
  return useQuery({ queryKey: queryKeys.private('currentUser', { base }, scope),
    queryFn: ({ signal }) => getCurrentUser(base, signal), enabled: !!localStorage.getItem('accessToken'), staleTime: cacheTimes.currentUser });
}
export function useCart() {
  const scope = useSessionScope();
  return useQuery({ queryKey: queryKeys.private('cart', {}, scope), queryFn: ({ signal }) => api<Cart>('/api/cart', { signal }),
    enabled: !!localStorage.getItem('accessToken'), staleTime: cacheTimes.cart });
}
