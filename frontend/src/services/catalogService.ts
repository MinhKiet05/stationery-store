import { api } from './api';
import { getProductTypes } from './productTypeService';
import { queryClient, queryKeys, cacheTimes } from './queryCache';
import { queryOptions } from '@tanstack/react-query';
import { allCategory, toCatalogProduct } from '../pages/searchPage/catalogData';
import type { ProductPage } from './productService';
export type CatalogFilters = { page?: number; size?: number; keyword?: string; productTypeID?: string;
  brands?: string[]; minPrice?: string; maxPrice?: string; rating?: number; inStock?: boolean; onSale?: boolean; sort?: string };
export async function getCatalog(signal?: AbortSignal, filters: CatalogFilters = {}) {
  const params = new URLSearchParams({ catalog: 'true', page: String(filters.page ?? 0), size: String(filters.size ?? 12), sort: filters.sort ?? 'productID,asc' });
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) { value.forEach(v => params.append(key, v)); continue; }
    if (value !== '' && value != null) params.set(key, String(value));
  }
  signal?.throwIfAborted();
  const [types, page] = await Promise.all([
    queryClient.fetchQuery({ queryKey: queryKeys.public('categories'), queryFn: ({ signal }) => getProductTypes(signal), staleTime: cacheTimes.categories }),
    api<ProductPage>(`/api/products/search?${params}`, { signal }),
  ]);
  signal?.throwIfAborted();
  return { categories: [allCategory, ...types.filter(t => t.isActive).map(t => ({ id: String(t.productTypeID), label: t.name }))],
    products: page.content.map(toCatalogProduct), totalPages: page.totalPages, totalElements: page.totalElements };
}
export const getCatalogVendors = (signal?: AbortSignal) => api<{ vendorID: number; name: string }[]>('/api/vendors', { signal });

// Shared by SearchPage and category-card prefetch; defaults must produce the same key.
export function catalogOptions(filters: CatalogFilters = {}) {
  const normalized = { page: 0, size: 24, keyword: '', productTypeID: '',
    minPrice: '', maxPrice: '', rating: 0, inStock: false, onSale: false, sort: 'productID,asc',
    ...filters, brands: [...(filters.brands ?? [])].sort() };
  return queryOptions({ queryKey: queryKeys.public('products', normalized),
    queryFn: ({ signal }) => getCatalog(signal, normalized), staleTime: cacheTimes.products });
}
