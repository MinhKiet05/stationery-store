import type { Product } from '../../components/productCard/ProductCard';

export function uniqueProducts(products: Product[]) {
  return [...new Map(products.map(p => [p.productID, p])).values()];
}

// Diversify only a bounded set of backend results; never invent products or sales ranks.
export function discoveryProducts(candidates: Product[], shown: Product[], limit = 10) {
  const remaining = uniqueProducts(candidates), excluded = new Set(shown.map(p => p.productID));
  const categories = new Set<number>(), vendors = new Set<number>(), result: Product[] = [];
  const score = (p: Product) => (excluded.has(p.productID) ? 0 : 4)
    + (categories.has(p.productTypeID) ? 0 : 2) + (vendors.has(p.vendorID) ? 0 : 1);
  while (remaining.length && result.length < limit) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) if (score(remaining[i]) > score(remaining[best])) best = i;
    const [product] = remaining.splice(best, 1);
    result.push(product); categories.add(product.productTypeID); vendors.add(product.vendorID);
  }
  return result;
}
