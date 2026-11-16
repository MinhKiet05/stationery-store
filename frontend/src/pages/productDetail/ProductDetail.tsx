import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Heart,
  Home,
  ImageOff,
  Minus,
  Plus,
  RotateCcw,
  Share2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Truck,
  X,
  Zap,
  ZoomIn,
  FileText,
  MessageSquare,
} from "lucide-react";
import ProductCard, {
  type Product,
} from "../../components/productCard/ProductCard";
import {
  getProduct,
  getProductVariants,
  getRelatedProducts,
  type Variant,
} from "../../services/productService";
import { getProductReviews, type Review } from "../../services/reviewService";
import { addCartItem, type Cart } from "../../services/cartService";
import { createOrder } from "../../services/orderService";
import { trackProductView } from "../../services/aiService";
import { addToGuestCart, getGuestCart } from "../../utils/guestCart";
import {
  isFavoriteProduct,
  toggleFavoriteProduct,
} from "../../utils/favoriteStorage";
import styles from "./ProductDetail.module.css";

type Tab = "specs" | "description" | "reviews";
const money = (price: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    price,
  );
const inStock = (variant: Variant) =>
  variant.available && variant.stockQuantity > 0;
const plainText = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-label={`${rating} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          fill={n <= Math.round(rating) ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

export default function ProductDetail({ handle }: { handle: string }) {
  // Reset the complete page state when navigating to a different product.
  return <ProductDetailContent key={handle} handle={handle} />;
}

function ProductDetailContent({ handle }: { handle: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [selected, setSelected] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("specs");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewState, setReviewState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [modal, setModal] = useState<"image" | "checkout" | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [orderID, setOrderID] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const details = useRef<HTMLElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await getProduct(handle, controller.signal);
        const choices = await getProductVariants(data.productID, controller.signal);
        if (controller.signal.aborted) return;
        setProduct(data);
        setVariants(choices);
        setSelected((choices.find(inStock) ?? choices[0])?.variantID ?? 0);
        setSaved(isFavoriteProduct(data.productID));
        void trackProductView(data.productID).catch(() => {});
        void getRelatedProducts(data.productTypeID, controller.signal)
          .then((result) => {
            if (!controller.signal.aborted)
              setRelated(
                result.content
                  .filter(
                    (p) =>
                      p.productID !== data.productID &&
                      p.isActive &&
                      p.available,
                  )
                  .slice(0, 5),
              );
          })
          .catch(() => {});
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "Không tải được sản phẩm.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [handle]);

  // Đồng bộ trạng thái yêu thích nếu người dùng bấm tim ở ProductCard hoặc tab khác
  useEffect(() => {
    if (!product) return;
    const sync = () => setSaved(isFavoriteProduct(product.productID));
    window.addEventListener("favorites-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("favorites-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    void getProductReviews(product.productID, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setReviews(data);
          setReviewState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setReviewState("error");
      });
    return () => controller.abort();
  }, [product]);

  useEffect(() => {
    if (!modal) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
  }, [modal]);

  const variant = variants.find((v) => v.variantID === selected);
  const price = variant?.price ?? product?.price ?? 0;
  const comparePrice = variant?.compareAtPrice ?? product?.compareAtPrice ?? 0;
  const discount =
    comparePrice > price ? Math.round((1 - price / comparePrice) * 100) : 0;
  const maxQuantity = Math.min(10, variant?.stockQuantity ?? 0);
  const canBuy = !!(
    product?.available &&
    product.isActive &&
    variant &&
    inStock(variant)
  );
  const images = product?.images?.filter(Boolean) ?? [];

  async function add(buyNow = false) {
    if (
      !canBuy ||
      !variant ||
      busy.current ||
      quantity < 1 ||
      quantity > maxQuantity
    )
      return;
    busy.current = true;
    setAdding(true);
    setNotice("");
    setCheckoutError("");
    setOrderID(null);
    setCart(null);
    try {
      if (localStorage.getItem("accessToken")) {
        const current = await addCartItem(selected, quantity);
        if (buyNow) {
          setCart(current);
          setModal("checkout");
        }
      } else {
        const existing =
          getGuestCart().find((item) => item.variantID === selected)
            ?.quantity ?? 0;
        if (existing + quantity > variant.stockQuantity)
          throw new Error(
            "Số lượng trong giỏ vượt quá tồn kho. Vui lòng giảm số lượng.",
          );
        addToGuestCart(selected, quantity);
        if (buyNow) setModal("checkout");
      }
      setNotice(`Đã thêm ${quantity} sản phẩm vào giỏ hàng.`);
      window.dispatchEvent(new Event("cart-changed"));
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Không thêm được sản phẩm.",
      );
    } finally {
      setAdding(false);
      busy.current = false;
    }
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !cart) return;
    busy.current = true;
    setOrdering(true);
    setCheckoutError("");
    const form = new FormData(event.currentTarget);
    try {
      const order = await createOrder({
        shippingAddress: String(form.get("address")).trim(),
        contactPhone: String(form.get("phone")).trim(),
        paymentMethod: "COD",
      });
      setOrderID(order.orderID);
      window.dispatchEvent(new Event("cart-changed"));
      // Refresh failures must not turn a successful order into an apparent failure.
      if (product)
        void getProductVariants(product.productID)
          .then((data) => {
            setVariants(data);
            setQuantity(1);
          })
          .catch(() => {});
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : "Không thể đặt hàng. Vui lòng thử lại.",
      );
    } finally {
      busy.current = false;
      setOrdering(false);
    }
  }

  function toggleFavorite() {
    if (!product) return;
    const next = toggleFavoriteProduct(product.productID);
    setSaved(next);
  }

  async function share() {
    try {
      if (navigator.share)
        await navigator.share({
          title: product?.title,
          url: window.location.href,
        });
      else {
        await navigator.clipboard.writeText(window.location.href);
        setNotice("Đã sao chép liên kết sản phẩm.");
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError"))
        setNotice(
          "Bạn có thể sao chép đường dẫn trên thanh địa chỉ để chia sẻ.",
        );
    }
  }

  function openTab(next: Tab) {
    setTab(next);
    details.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Đường dẫn">
          <a href="/">
            <Home size={13} />
            Trang chủ
          </a>
          <ChevronRight size={12} />
          <span>{product?.productTypeName || "Sản phẩm"}</span>
          <ChevronRight size={12} />
          <span aria-current="page">
            {product?.title || "Chi tiết sản phẩm"}
          </span>
        </nav>
        {loading ? (
          <div className={styles.loading} role="status">
            <div className={styles.skeleton} />
            <div>
              <span className={styles.eyebrow}>STATIONERY STORE</span>
              <h1>Đang tải sản phẩm…</h1>
              <p>Chờ một chút, sản phẩm của bạn sắp sẵn sàng.</p>
            </div>
          </div>
        ) : error ? (
          <section className={styles.empty} role="alert">
            <ImageOff size={36} />
            <h1>Chưa thể tải sản phẩm</h1>
            <p>{error}</p>
            <button
              className={styles.primary}
              onClick={() => window.location.reload()}
            >
              Thử lại
            </button>
            <a href="/">Về trang chủ</a>
          </section>
        ) : (
          product && (
            <>
              <section className={styles.detail} aria-label="Chi tiết sản phẩm">
                <div className={styles.gallery}>
                  <div className={styles.mainImage}>
                    {images.length && !imageFailed ? (
                      <img
                        key={images[imageIndex]}
                        src={images[imageIndex]}
                        alt={`${product.title} — ảnh ${imageIndex + 1}`}
                        onError={() => setImageFailed(true)}
                      />
                    ) : (
                      <div className={styles.noImage}>
                        <ImageOff size={44} />
                        <span>Chưa có hình ảnh sản phẩm</span>
                      </div>
                    )}
                    <div className={styles.badges}>
                      <span>
                        <BadgeCheck size={12} />
                        {product.vendorName || "Sản phẩm chính hãng"}
                      </span>
                      {discount > 0 && <b>-{discount}%</b>}
                    </div>
                    <div className={styles.imageActions}>
                      <button
                        aria-label={
                          saved ? "Bỏ yêu thích" : "Thêm vào yêu thích"
                        }
                        aria-pressed={saved}
                        onClick={toggleFavorite}
                      >
                        <Heart size={18} fill={saved ? "#ff7518" : "none"} />
                      </button>
                      {images.length > 0 && !imageFailed && (
                        <button
                          aria-label="Phóng to ảnh sản phẩm"
                          onClick={() => setModal("image")}
                        >
                          <ZoomIn size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  {images.length > 1 && (
                    <div
                      className={styles.thumbnails}
                      aria-label="Ảnh sản phẩm"
                    >
                      {images.map((src, i) => (
                        <button
                          key={`${src}-${i}`}
                          aria-label={`Xem ảnh ${i + 1}`}
                          aria-pressed={imageIndex === i}
                          className={imageIndex === i ? styles.selected : ""}
                          onClick={() => {
                            setImageIndex(i);
                            setImageFailed(false);
                          }}
                        >
                          <img src={src} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={styles.assurances}>
                    <div>
                      <RotateCcw size={19} />
                      <span>
                        <strong>Đổi trả trong 7 ngày</strong>
                        <small>Nếu sản phẩm có lỗi từ nhà sản xuất</small>
                      </span>
                    </div>
                    <div>
                      <ShieldCheck size={20} />
                      <span>
                        <strong>100% chính hãng</strong>
                        <small>An tâm lựa chọn, yên tâm sử dụng</small>
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.info}>
                  <div className={styles.meta}>
                    <span>
                      Thương hiệu:{" "}
                      <strong>{product.vendorName || "Đang cập nhật"}</strong>
                    </span>
                    <span>
                      Mã SP:{" "}
                      <strong>{variant?.sku || product.productID}</strong>
                    </span>
                  </div>
                  <h1>{product.title}</h1>
                  <div className={styles.rating}>
                    <strong>{(product.ratingAverage ?? 0).toFixed(1)}</strong>
                    <Stars rating={product.ratingAverage ?? 0} />
                    <button onClick={() => openTab("reviews")}>
                      {product.reviewCount ?? 0} đánh giá
                    </button>
                    <span>•</span>
                    <span>{product.productTypeName}</span>
                  </div>
                  <div className={styles.pricePanel}>
                    <div className={styles.prices}>
                      <strong>{money(price)}</strong>
                      {discount > 0 && (
                        <>
                          <del>{money(comparePrice)}</del>
                          <span>
                            Tiết kiệm {money(comparePrice - price)} (-{discount}
                            %)
                          </span>
                        </>
                      )}
                    </div>
                    <div className={styles.shipping}>
                      <Truck size={15} />
                      <span>Miễn phí giao hàng cho đơn từ 200.000đ</span>
                    </div>
                  </div>
                  <div className={styles.stock}>
                    <span
                      className={canBuy ? styles.available : styles.unavailable}
                    >
                      <i />
                      {canBuy
                        ? `Còn ${variant?.stockQuantity} sản phẩm trong kho`
                        : "Tạm hết hàng"}
                    </span>
                    <span>Vận chuyển toàn quốc</span>
                  </div>
                  <fieldset className={styles.variants} disabled={adding}>
                    <legend>
                      Phiên bản:{" "}
                      <strong>{variant?.title || "Chưa có phiên bản"}</strong>
                    </legend>
                    <div>
                      {variants.map((v) => (
                        <button
                          key={v.variantID}
                          aria-pressed={selected === v.variantID}
                          disabled={!inStock(v)}
                          className={
                            selected === v.variantID ? styles.selected : ""
                          }
                          onClick={() => {
                            setSelected(v.variantID);
                            setQuantity(1);
                            setNotice("");
                          }}
                        >
                          {v.title}
                          {selected === v.variantID && <Check size={13} />}
                          {!inStock(v) && <small>Hết hàng</small>}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {variant?.option2 && (
                    <div className={styles.optionNote}>
                      <span>Quy cách</span>
                      <strong>
                        {variant.option2}
                        {variant.option3 ? ` · ${variant.option3}` : ""}
                      </strong>
                    </div>
                  )}
                  <div className={styles.quantityRow}>
                    <label htmlFor="product-quantity">Số lượng:</label>
                    <div className={styles.quantity}>
                      <button
                        aria-label="Giảm số lượng"
                        disabled={quantity <= 1 || adding || !canBuy}
                        onClick={() => setQuantity((q) => q - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        id="product-quantity"
                        type="number"
                        min={1}
                        max={Math.max(1, maxQuantity)}
                        disabled={!canBuy || adding}
                        value={quantity}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setQuantity(
                            Math.min(
                              Math.max(1, Math.trunc(next) || 1),
                              Math.max(1, maxQuantity),
                            ),
                          );
                        }}
                      />
                      <button
                        aria-label="Tăng số lượng"
                        disabled={quantity >= maxQuantity || adding || !canBuy}
                        onClick={() => setQuantity((q) => q + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <small>Tối đa {maxQuantity} sản phẩm/lần</small>
                  </div>
                  <div className={styles.purchaseActions}>
                    <button
                      className={styles.addButton}
                      disabled={!canBuy || adding}
                      onClick={() => void add()}
                    >
                      <ShoppingCart size={19} />
                      {adding ? "Đang xử lý…" : "Thêm vào giỏ hàng"}
                    </button>
                    <button
                      className={styles.primary}
                      disabled={!canBuy || adding}
                      onClick={() => void add(true)}
                    >
                      <Zap size={18} />
                      Mua ngay
                    </button>
                  </div>
                  <div className={styles.utilityRow}>
                    <button onClick={() => void share()}>
                      <Share2 size={14} />
                      Chia sẻ
                    </button>
                    <button aria-pressed={saved} onClick={toggleFavorite}>
                      <Heart size={14} fill={saved ? "currentColor" : "none"} />
                      {saved ? "Đã yêu thích" : "Yêu thích"}
                    </button>
                    <span>
                      <Truck size={14} />
                      Giao hàng tận nơi
                    </span>
                  </div>
                  <p className={styles.notice} role="status" aria-live="polite">
                    {notice}
                  </p>
                </div>
              </section>
              <section ref={details} className={styles.detailsPanel}>
                <div
                  className={styles.tabs}
                  role="tablist"
                  aria-label="Thông tin sản phẩm"
                >
                  {(
                    [
                      {
                        key: "specs",
                        label: "Thông số kỹ thuật",
                        icon: SlidersHorizontal,
                      },
                      {
                        key: "description",
                        label: "Mô tả chi tiết",
                        icon: FileText,
                      },
                      {
                        key: "reviews",
                        label: `Đánh giá người dùng (${product.reviewCount ?? 0})`,
                        icon: MessageSquare,
                      },
                    ] as const
                  ).map(({ key, label, icon: Icon }, i, tabs) => (
                    <button
                      key={key}
                      id={`tab-${key}`}
                      role="tab"
                      aria-selected={tab === key}
                      aria-controls={`panel-${key}`}
                      tabIndex={tab === key ? 0 : -1}
                      className={tab === key ? styles.activeTab : ""}
                      onClick={() => setTab(key)}
                      onKeyDown={(e) => {
                        const next =
                          e.key === "ArrowRight"
                            ? (i + 1) % tabs.length
                            : e.key === "ArrowLeft"
                              ? (i + tabs.length - 1) % tabs.length
                              : e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? tabs.length - 1
                                  : -1;
                        if (next >= 0) {
                          e.preventDefault();
                          setTab(tabs[next].key);
                          document
                            .getElementById(`tab-${tabs[next].key}`)
                            ?.focus();
                        }
                      }}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  id={`panel-${tab}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${tab}`}
                  tabIndex={0}
                  className={styles.tabContent}
                >
                  {tab === "specs" && (
                    <>
                      <h2>Bảng thông số kỹ thuật chi tiết</h2>
                      <dl className={styles.specGrid}>
                        {[
                          ["Thương hiệu", product.vendorName],
                          ["Danh mục", product.productTypeName],
                          [
                            "Mã sản phẩm",
                            variant?.sku || String(product.productID),
                          ],
                          ["Phiên bản", variant?.title],
                          ["Tùy chọn 1", variant?.option1],
                          ["Quy cách", variant?.option2],
                          ["Tùy chọn 3", variant?.option3],
                          ["Tình trạng", canBuy ? "Còn hàng" : "Hết hàng"],
                        ]
                          .filter(([, value]) => value)
                          .map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                      </dl>
                    </>
                  )}
                  {tab === "description" && (
                    <>
                      <h2>Mô tả sản phẩm</h2>
                      <p className={styles.description}>
                        {product.description
                          ? plainText(product.description)
                          : "Thông tin mô tả sản phẩm đang được cập nhật."}
                      </p>
                    </>
                  )}
                  {tab === "reviews" && (
                    <>
                      <h2>Đánh giá từ khách hàng</h2>
                      <div className={styles.reviewSummary}>
                        <strong>
                          {(product.ratingAverage ?? 0).toFixed(1)}
                          <small>/5</small>
                        </strong>
                        <div>
                          <Stars rating={product.ratingAverage ?? 0} />
                          <p>{product.reviewCount ?? 0} đánh giá sản phẩm</p>
                        </div>
                      </div>
                      {reviewState === "loading" ? (
                        <p role="status">Đang tải đánh giá…</p>
                      ) : reviewState === "error" ? (
                        <p role="alert">
                          Chưa tải được đánh giá. Vui lòng thử lại sau.
                        </p>
                      ) : reviews.length === 0 ? (
                        <p className={styles.muted}>
                          Chưa có đánh giá cho sản phẩm này.
                        </p>
                      ) : (
                        reviews.map((review) => (
                          <article
                            className={styles.review}
                            key={review.reviewID}
                          >
                            <div>
                              <strong>{review.username}</strong>
                              <time dateTime={review.reviewDate}>
                                {new Date(review.reviewDate).toLocaleDateString(
                                  "vi-VN",
                                )}
                              </time>
                            </div>
                            <Stars rating={review.rating} />
                            <p>{review.comment}</p>
                          </article>
                        ))
                      )}
                    </>
                  )}
                </div>
              </section>
              {related.length > 0 && (
                <section className={styles.related}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <h2>Sản phẩm tương tự bạn có thể thích</h2>
                      <p>
                        Thêm những lựa chọn phù hợp cho góc học tập và làm việc
                        của bạn.
                      </p>
                    </div>
                    <a href="/">
                      Khám phá thêm <ArrowRight size={15} />
                    </a>
                  </div>
                  <div className={styles.products}>
                    {related.map((item) => (
                      <ProductCard key={item.productID} product={item} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )
        )}
      </div>
      <dialog
        ref={dialog}
        className={`${styles.dialog} ${modal === "image" ? styles.imageDialog : ""}`}
        onCancel={(e) => {
          if (ordering) e.preventDefault();
          else setModal(null);
        }}
        onClose={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget && !ordering) setModal(null);
        }}
        aria-labelledby="detail-dialog-title"
      >
        <button
          className={styles.close}
          aria-label="Đóng"
          disabled={ordering}
          onClick={() => setModal(null)}
        >
          <X size={21} />
        </button>
        {modal === "image" ? (
          <>
            <h2 id="detail-dialog-title" className={styles.srOnly}>
              {product?.title}
            </h2>
            <img src={images[imageIndex]} alt={product?.title} />
          </>
        ) : (
          modal === "checkout" && (
            <div className={styles.checkout}>
              <h2 id="detail-dialog-title">
                {orderID ? "Đặt hàng thành công" : "Hoàn tất đơn hàng"}
              </h2>
              {orderID ? (
                <div className={styles.success}>
                  <BadgeCheck size={44} />
                  <p>Đơn hàng #{orderID} đã được tiếp nhận.</p>
                  <p>Cảm ơn bạn đã mua sắm tại StationeryStore.</p>
                  <button
                    className={styles.primary}
                    onClick={() => setModal(null)}
                  >
                    Tiếp tục mua sắm
                  </button>
                </div>
              ) : !cart ? (
                <>
                  <p>
                    Sản phẩm đã được lưu trong giỏ hàng của bạn. Vui lòng đăng
                    nhập để tiếp tục đặt hàng.
                  </p>
                  <a className={styles.primary} href="/login">
                    Đăng nhập để thanh toán <ArrowRight size={16} />
                  </a>
                </>
              ) : (
                <form onSubmit={(e) => void placeOrder(e)}>
                  <p className={styles.muted}>
                    Đơn hàng bao gồm toàn bộ sản phẩm trong giỏ hàng.
                  </p>
                  <div className={styles.checkoutItems}>
                    {cart.items.map((item) => (
                      <div key={item.cartItemID}>
                        <span>
                          {item.productTitle}
                          <small>
                            {item.variantTitle} × {item.quantity}
                          </small>
                        </span>
                        <strong>{money(item.lineTotal)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className={styles.total}>
                    <span>Tổng tiền hàng</span>
                    <strong>{money(cart.subtotal)}</strong>
                  </div>
                  <label>
                    Địa chỉ nhận hàng
                    <textarea
                      name="address"
                      required
                      maxLength={500}
                      autoComplete="street-address"
                      disabled={ordering}
                    />
                  </label>
                  <label>
                    Số điện thoại
                    <input
                      name="phone"
                      type="tel"
                      required
                      maxLength={30}
                      autoComplete="tel"
                      disabled={ordering}
                    />
                  </label>
                  <p className={styles.muted}>
                    Thanh toán khi nhận hàng (COD).
                  </p>
                  {checkoutError && (
                    <p role="alert" className={styles.formError}>
                      {checkoutError}
                    </p>
                  )}
                  <button className={styles.primary} disabled={ordering}>
                    {ordering ? "Đang đặt hàng…" : "Xác nhận đặt hàng"}
                  </button>
                </form>
              )}
            </div>
          )
        )}
      </dialog>
    </main>
  );
}