import { useRecommendations } from "../../services/storeQueries";
import ProductCard from "../productCard/ProductCard";
import { userMessage } from "../../utils/notifications";
import styles from "./Recommendations.module.css";

export default function Recommendations() {
  const query = useRecommendations();
  const result = query.data ?? { products: [], source: 'FALLBACK' };
  const loading = query.isPending;
  const error = query.isError ? userMessage(query.error, 'Không tải được sản phẩm. Vui lòng thử lại.') : '';
  const recent = result.source === "RECENT_ACTIVITY";
  const personalized = result.source === "PERSONALIZED";

  return (
    <div className={styles.section}>
      <h3>{loading ? "Đang tải sản phẩm" : recent ? "Sản phẩm bạn vừa quan tâm" : personalized ? "Dành riêng cho bạn" : "Sản phẩm được quan tâm"}</h3>
      <p className={styles.subtitle}>
        {loading ? "Đang tải danh sách sản phẩm."
          : recent ? "Theo lần xem, thêm giỏ hoặc mua gần nhất của bạn"
          : personalized ? "Gợi ý từ sở thích mua sắm của bạn"
          : "Sản phẩm còn hàng khi chưa có lịch sử tương tác"}
      </p>
      <div aria-live="polite" aria-busy={loading}>
        {loading ? <p className={styles.status}>Đang tải sản phẩm...</p>
          : error ? <p role="alert" className={styles.status}>{error} <button onClick={() => query.refetch()}>Thử lại</button></p>
          : result.products.length === 0 ? <p className={styles.status}>Chưa có sản phẩm còn hàng để hiển thị.</p>
          : <div className={styles.grid}>{result.products.map(p => <ProductCard key={p.productID} product={p} />)}</div>}
      </div>
    </div>
  );
}
