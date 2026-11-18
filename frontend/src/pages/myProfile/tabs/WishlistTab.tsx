import { useEffect, useState } from "react";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import ProductCard, { type Product } from "../../../components/productCard/ProductCard";
import { getProduct } from "../../../services/productService";
import { getAllFavoriteProductIds } from "../../../utils/favoriteStorage";
import { notify } from "../../../utils/notifications";
import styles from "./WishlistTab.module.css";

export default function WishlistTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFavorites() {
      const ids = getAllFavoriteProductIds();
      if (ids.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const results = await Promise.allSettled(
          ids.map((id) => getProduct(String(id), controller.signal))
        );

        if (controller.signal.aborted) return;

        const loadedProducts = results
          .filter((res): res is PromiseFulfilledResult<Product> => res.status === "fulfilled")
          .map((res) => res.value);

        setProducts(loadedProducts);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadFavorites();

    // Khi người dùng bấm bỏ tim ở ProductCard, lọc bỏ ngay sản phẩm đó khỏi danh sách
    const handleSyncFavorites = () => {
      const currentIds = new Set(getAllFavoriteProductIds());
      setProducts((prev) => prev.filter((item) => currentIds.has(item.productID)));
    };

    window.addEventListener("favorites-changed", handleSyncFavorites);
    window.addEventListener("storage", handleSyncFavorites);

    return () => {
      controller.abort();
      window.removeEventListener("favorites-changed", handleSyncFavorites);
      window.removeEventListener("storage", handleSyncFavorites);
    };
  }, []);

  function handleClearAll() {
    if (products.length === 0) return;
    try {
      products.forEach((p) => localStorage.removeItem(`favorite-product-${p.productID}`));
      window.dispatchEvent(new Event("favorites-changed"));
      setProducts([]);
      notify.success("Đã xóa danh sách yêu thích.");
    } catch {
      notify.error(null, "Không thể xóa danh sách yêu thích. Vui lòng kiểm tra quyền lưu trữ của trình duyệt.");
    }
  }

  return (
    <div className={styles.tabContainer}>
      <div className={styles.header}>
        <div>
          <h2>Danh sách yêu thích</h2>
          <p>
            Lưu giữ những món văn phòng phẩm truyền cảm hứng để mua sắm bất cứ lúc nào ({products.length} sản phẩm).
          </p>
        </div>

        {products.length > 0 && (
          <button type="button" className={styles.clearBtn} onClick={handleClearAll}>
            <Trash2 size={15} /> Xóa tất cả
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.grid}>
          {[1, 2, 3].map((n) => (
            <div key={n} className={styles.skeletonCard} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Heart size={32} strokeWidth={1.5} />
          </div>
          <h3>Danh sách yêu thích đang trống</h3>
          <p>Hãy nhấn vào biểu tượng trái tim trên các sản phẩm bạn quan tâm để lưu lại tại đây.</p>
          <Link to="/" className={styles.exploreBtn}>
            <ShoppingBag size={16} /> Khám phá sản phẩm ngay
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map((product) => (
            <ProductCard key={product.productID} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
