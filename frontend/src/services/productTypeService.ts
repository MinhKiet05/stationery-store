import { api } from "./api";

export type ProductType = {
  productTypeID: number;
  name: string;
  isActive: boolean;
};

export function getProductTypes(signal?: AbortSignal) {
  return api<ProductType[]>("/api/product-types", { signal });
}
