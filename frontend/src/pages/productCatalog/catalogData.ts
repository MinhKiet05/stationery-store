import type { Product } from "../../components/productCard/ProductCard";

export type CatalogProduct = {
  id: string;
  title: string;
  brand: string;
  category: string;
  image: string;
  price: number;
  oldPrice: number;
  rating: number;
  reviewCount: number;
  badge?: string;
  inStock: boolean;
  express?: boolean;
  detailHref: string;
};

export type CatalogCategory = { id: string; label: string };
export const allCategory: CatalogCategory = {
  id: "all",
  label: "Tất cả Bút & Mực",
};

export function toCatalogProduct(product: Product): CatalogProduct {
  return {
    id: String(product.productID),
    title: product.title,
    brand: product.vendorName ?? "",
    category: String(product.productTypeID),
    image: product.images?.find((image) => Boolean(image?.trim())) ?? "",
    price: Number(product.price ?? product.priceMin ?? 0),
    oldPrice: Number(product.compareAtPrice ?? 0),
    rating: Number(product.ratingAverage ?? 0),
    reviewCount: product.reviewCount ?? 0,
    inStock: product.available === true,
    detailHref: `/products/${encodeURIComponent(product.handle || String(product.productID))}`,
  };
}

export const money = (amount: number) =>
  `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

// The API has flat product types. This page displays active writing/ink types;
// exact names and IDs come from the server rather than a hardcoded category list.
export const isPenAndInkType = (name: string) =>
  /^(but|muc|ngoi but|ruot but)(\s|$)/.test(normalize(name).trim());
