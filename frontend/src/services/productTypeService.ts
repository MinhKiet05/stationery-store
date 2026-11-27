import { api, ApiError } from "./api";

export type ProductType = {
  productTypeID: number;
  name: string;
  isActive: boolean;
};

export async function getProductTypes(signal?: AbortSignal) {
  const data = await api<ProductType[]>("/api/product-types", { signal });
  if (!Array.isArray(data)) throw new ApiError('Không tải được danh mục. Vui lòng thử lại.', 502);
  return data;
}
