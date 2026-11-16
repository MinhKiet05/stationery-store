import { useEffect, useState } from "react";
import ProductCard from "../productCard/ProductCard";
import { getRecommendations, type RecommendationResponse } from "../../services/aiService";
import styles from "./Recommendations.module.css";

export default function Recommendations() {
  const [result, setResult] = useState<RecommendationResponse>({ products: [], source: "FALLBACK" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setLoading(true);
      setError("");
      setResult({ products: [], source: "FALLBACK" });
      try {
        const data = await getRecommendations(request.signal);
        if (!request.signal.aborted) setResult(data);
      } catch (err) {
        if (!request.signal.aborted)
          setError(err instanceof Error ? err.message : "Không tải được sản phẩm.");
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    };
    void load();
    window.addEventListener("auth-changed", load);
    window.addEventListener("pageshow", load);
    return () => {
      controller?.abort();
      window.removeEventListener("auth-changed", load);
      window.removeEventListener("pageshow", load);
    };
  }, [retry]);

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
          : error ? <p role="alert" className={styles.status}>{error} <button onClick={() => setRetry(n => n + 1)}>Thử lại</button></p>
          : result.products.length === 0 ? <p className={styles.status}>Chưa có sản phẩm còn hàng để hiển thị.</p>
          : <div className={styles.grid}>{result.products.map(p => <ProductCard key={p.productID} product={p} />)}</div>}
      </div>
    </div>
  );
}
