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
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError("");
      try {
        const data = await getRecommendations(controller.signal);
        if (!controller.signal.aborted) setResult(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không tải được gợi ý.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    window.addEventListener("auth-changed", load);
    return () => { controller.abort(); window.removeEventListener("auth-changed", load); };
  }, [retry]);
  return <div className={styles.section}>
    <h3>{result.source === "PERSONALIZED" ? "Dành riêng cho bạn" : "Sản phẩm được quan tâm"}</h3>
    <p className={styles.subtitle}>{result.source === "PERSONALIZED" ? "Gợi ý từ sở thích mua sắm của bạn" : "Khám phá những sản phẩm đang còn hàng"}</p>
    <div aria-live="polite" aria-busy={loading}>
      {loading ? <p className={styles.status}>Đang tìm sản phẩm phù hợp…</p>
        : error ? <p role="alert" className={styles.status}>{error} <button onClick={() => setRetry(n => n + 1)}>Thử lại</button></p>
        : result.products.length === 0 ? <p className={styles.status}>Chưa có sản phẩm còn hàng để gợi ý.</p>
        : <div className={styles.grid}>{result.products.map(p => <ProductCard key={p.productID} product={p} />)}</div>}
    </div>
  </div>;
}
