import { getProductPage } from "./productService";
import { getProductTypes } from "./productTypeService";
import {
  allCategory,
  toCatalogProduct,
} from "../pages/searchPage/catalogData";

export async function getCatalog(signal?: AbortSignal) {
  const [types, firstPage] = await Promise.all([
    getProductTypes(signal),
    getProductPage(0, signal),
  ]);
  const activeTypes = types.filter((type) => type.isActive);
  const activeTypeIDs = new Set(activeTypes.map((type) => type.productTypeID));
  const products = [...firstPage.content];

  // The products endpoint is paginated. Load every page before filtering/counting
  // so the category counts and local filters cover the complete catalog.
  for (let page = 1; page < firstPage.totalPages; page++) {
    signal?.throwIfAborted();
    const response = await getProductPage(page, signal);
    products.push(...response.content);
  }
  signal?.throwIfAborted();

  return {
    categories: [
      allCategory,
      ...activeTypes.map((type) => ({
        id: String(type.productTypeID),
        label: type.name,
      })),
    ],
    products: products
      .filter(
        (product) =>
          product.isActive !== false &&
          activeTypeIDs.has(product.productTypeID),
      )
      .map(toCatalogProduct),
  };
}
