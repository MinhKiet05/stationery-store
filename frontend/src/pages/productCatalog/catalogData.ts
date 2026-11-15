import products from "./catalogProducts.json";

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
};

export const categories = [
  { id: "all", label: "Tất cả Bút & Mực" },
  { id: "gel", label: "Bút Gel & Bút Bi" },
  { id: "fountain", label: "Bút Máy & Mực Bơm" },
  { id: "highlighter", label: "Bút Dạ Quang / Pastel" },
  { id: "brush", label: "Bút Lông & Brush Pen" },
  { id: "pencil", label: "Bút Chì & Ruột Bút" },
  { id: "color", label: "Bút Màu & Bút Sáp" },
  { id: "premium", label: "Bút Viết Cao Cấp" },
  { id: "correction", label: "Bút Xoá & Băng Xoá" },
];

// Snapshot imported from stationery_shop_full.sql; image URLs come from product_images.
export const catalogProducts: CatalogProduct[] = products;

export const money = (amount: number) =>
  `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
