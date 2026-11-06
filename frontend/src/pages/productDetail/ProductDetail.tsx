import { useEffect, useState } from "react";
import type { Product } from "../../components/productCard/ProductCard";
import { api } from "../../services/api";
import { trackProductView } from "../../services/aiService";
import { addToGuestCart } from "../../utils/guestCart";
import styles from "./ProductDetail.module.css";
type Variant = { variantID: number; title: string; price: number; stockQuantity: number; available: boolean };
const money = (price: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(price);
export default function ProductDetail({ handle }: { handle: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const path = /^\d+$/.test(handle) ? handle : `handle/${encodeURIComponent(handle)}`;
        const data = await api<Product>(`/api/products/${path}`, { signal: controller.signal });
        const choices = await api<Variant[]>(`/api/product-variants/product/${data.productID}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setProduct(data); setVariants(choices); setSelected(choices.find(v => v.available && v.stockQuantity > 0)?.variantID ?? 0);
        void trackProductView(data.productID);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không tải được sản phẩm."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [handle]);
  async function add() {
    if (!selected || adding) return;
    setAdding(true); setNotice("");
    try {
      if (localStorage.getItem("accessToken")) await api("/api/cart/items", { method: "POST", body: JSON.stringify({ variantID: selected, quantity: 1 }) });
      else addToGuestCart(selected, 1);
      setNotice("Đã thêm vào giỏ hàng."); window.dispatchEvent(new Event("cart-changed"));
    } catch (err) { setNotice(err instanceof Error ? err.message : "Không thêm được sản phẩm."); }
    finally { setAdding(false); }
  }
  const variant = variants.find(v => v.variantID === selected);
  return <main className={styles.page}><a href="/">← Về trang chủ</a>
    {loading ? <p role="status">Đang tải sản phẩm…</p> : error ? <p role="alert">{error}</p> : product && <div className={styles.detail}>
      <div className={styles.image}>{product.images?.[0] && <img src={product.images[0]} alt={product.title} />}</div>
      <div><p>{product.vendorName} · {product.productTypeName}</p><h1>{product.title}</h1>
        <strong className={styles.price}>{money(variant?.price ?? product.price)}</strong>
        <label>Chọn biến thể<select value={selected} onChange={e => setSelected(Number(e.target.value))}>
          <option value={0}>Chọn sản phẩm còn hàng</option>
          {variants.map(v => <option key={v.variantID} value={v.variantID} disabled={!v.available || v.stockQuantity <= 0}>{v.title} · {money(v.price)}{v.stockQuantity <= 0 ? " · Hết hàng" : ""}</option>)}
        </select></label>
        <button disabled={!variant || !product.available || !product.isActive || adding} onClick={() => void add()}>{adding ? "Đang thêm…" : "Thêm vào giỏ hàng"}</button>
        <p role="status">{notice}</p><p className={styles.description}>{product.description?.replace(/<[^>]*>/g, " ")}</p>
      </div></div>}
  </main>;
}
