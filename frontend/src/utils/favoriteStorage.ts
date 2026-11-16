const EVENT_NAME = "favorites-changed";

export function isFavoriteProduct(productID: number): boolean {
  try {
    return localStorage.getItem(`favorite-product-${productID}`) === "true";
  } catch {
    return false;
  }
}

export function toggleFavoriteProduct(productID: number): boolean {
  const next = !isFavoriteProduct(productID);
  try {
    if (next) {
      localStorage.setItem(`favorite-product-${productID}`, "true");
    } else {
      localStorage.removeItem(`favorite-product-${productID}`);
    }
    // Bắn sự kiện để các component khác (ProductCard, ProductDetail, WishlistTab) tự cập nhật
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // Bỏ qua nếu trình duyệt chặn storage
  }
  return next;
}

export function getAllFavoriteProductIds(): number[] {
  const ids: number[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("favorite-product-") && localStorage.getItem(key) === "true") {
        const id = Number(key.replace("favorite-product-", ""));
        if (!Number.isNaN(id)) ids.push(id);
      }
    }
  } catch {
    // Bỏ qua
  }
  return ids;
}