import { api } from "./api";
import type { Product } from "../components/productCard/ProductCard";

export type Variant = {
  variantID: number;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number;
  stockQuantity: number;
  available: boolean;
  option1: string | null;
  option2: string | null;
  option3: string | null;
};

export function getProducts(signal?: AbortSignal, page = 0, size = 10, sort = 'productID,asc') {
  return api<ProductPage>(`/api/products?page=${page}&size=${size}&sort=${sort}`, { signal });
}

export type ProductPage = {
  content: Product[];
  totalPages: number;
  totalElements: number;
};

export function getProductPage(page: number, signal?: AbortSignal) {
  return api<ProductPage>(
    `/api/products?page=${page}&size=100&sort=productID,asc`,
    { signal },
  );
}

export function getProduct(handle: string, signal?: AbortSignal) {
  const path = /^\d+$/.test(handle)
    ? handle
    : `handle/${encodeURIComponent(handle)}`;
  return api<Product>(`/api/products/${path}`, { signal });
}

export function getProductVariants(productID: number, signal?: AbortSignal) {
  return api<Variant[]>(`/api/product-variants/product/${productID}`, {
    signal,
  });
}

export function getRelatedProducts(
  productTypeID: number,
  signal?: AbortSignal,
) {
  return api<{ content: Product[] }>(
    `/api/products/search?productTypeID=${productTypeID}&size=6`,
    { signal },
  );
}
