import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReviewMediaGallery from "../../components/review/ReviewMediaGallery";
import {
  productOptions,
  variantsOptions,
  relatedOptions,
  reviewsOptions,
} from "../../services/storeQueries";
import useSessionScope from "../../services/useSessionScope";
import { useEffect, useRef, useState } from "react";
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
import ProductCard from "../../components/productCard/ProductCard";
import { type Variant } from "../../services/productService";
import { useCartMutation } from "../../services/useCartMutation";
import { trackProductView } from "../../services/aiService";
import { addToGuestCart, getGuestCart } from "../../utils/guestCart";
import { notify, userMessage } from "../../utils/notifications";
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
  const scope = useSessionScope();
  // Checkout drafts/results belong to one session; public product queries remain reusable.
  return <ProductDetailContent key={`${handle}:${scope}`} handle={handle} />;
}

function ProductDetailContent({ handle }: { handle: string }) {
  const navigate = useNavigate();
  const cartMutation = useCartMutation();
  const productQuery = useQuery(productOptions(handle)),
    product = productQuery.data;
  const variantsQuery = useQuery(variantsOptions(product?.productID ?? 0));
  const variants = variantsQuery.data ?? [];
  const relatedQuery = useQuery(relatedOptions(product?.productTypeID ?? 0));
  const related = (relatedQuery.data?.content ?? [])
    .filter(
      (p) => p.productID !== product?.productID && p.isActive && p.available,
    )
    .slice(0, 5);
  const [selectedID, setSelected] = useState(0);
  const selected =
    (
      variants.find((v) => v.variantID === selectedID) ??
      variants.find(inStock) ??
      variants[0]
    )?.variantID ?? 0;
  const [imageIndex, setImageIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const loading =
    productQuery.isPending || (!!product && variantsQuery.isPending);
  const error =
    (productQuery.isError && !product) ||
    (variantsQuery.isError && !variantsQuery.data)
      ? userMessage(
          productQuery.error || variantsQuery.error,
          "Không tải được sản phẩm. Vui lòng thử lại.",
        )
      : "";
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>(() =>
    window.location.hash === "#reviews" ? "reviews" : "specs",
  );
  const reviewsQuery = useQuery(reviewsOptions(product?.productID ?? 0));
  const reviews = reviewsQuery.data ?? [];
  const reviewState = reviewsQuery.isPending
    ? "loading"
    : reviewsQuery.isError
      ? "error"
      : "ready";
  const [modal, setModal] = useState<"image" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const details = useRef<HTMLElement>(null);
  const busy = useRef(false);

  const productID = product?.productID;
  const [favoriteProductID, setFavoriteProductID] = useState(productID);
  if (favoriteProductID !== productID) {
    setFavoriteProductID(productID);
    setSaved(productID ? isFavoriteProduct(productID) : false);
  }
  useEffect(() => {
    if (productID) void trackProductView(productID).catch(() => {});
  }, [productID]);

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
    try {
      if (localStorage.getItem("accessToken")) {
        await cartMutation.mutateAsync({
          kind: "add",
          variant,
          quantity,
          productTitle: product!.title,
        });
        if (buyNow) navigate("/checkout");
      } else {
        const existing =
          getGuestCart().find((item) => item.variantID === selected)
            ?.quantity ?? 0;
        if (existing + quantity > variant.stockQuantity)
          throw new Error(
            "Số lượng trong giỏ vượt quá tồn kho. Vui lòng giảm số lượng.",
          );
        addToGuestCart(selected, quantity);
        if (buyNow) navigate("/cart");
      }
      notify.success(`Đã thêm ${quantity} sản phẩm vào giỏ hàng.`);
      window.dispatchEvent(new Event("cart-changed"));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (
        err instanceof Error &&
        err.message ===
          "Số lượng trong giỏ vượt quá tồn kho. Vui lòng giảm số lượng."
      ) {
        notify.warning(err.message);
      } else {
        notify.error(err, "Không thêm được sản phẩm. Vui lòng thử lại.");
      }
    } finally {
      setAdding(false);
      busy.current = false;
    }
  }

  function toggleFavorite() {
    if (!product) return;
    const next = toggleFavoriteProduct(product.productID);
    setSaved(next);
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: product?.title,
          url: window.location.href,
        });
        notify.success("Đã chia sẻ liên kết sản phẩm.");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        notify.success("Đã sao chép liên kết sản phẩm.");
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError"))
        notify.info(
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
                </div>
              </section>
              <section
                id="reviews"
                ref={details}
                className={styles.detailsPanel}
              >
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
                      <Link
                        className={styles.reviewAction}
                        to="/my-profile/orders"
                      >
                        Đánh giá sản phẩm đã mua
                      </Link>
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
                            key={`${product.productID}:${review.reviewID}`}
                          >
                            <div className={styles.reviewHeader}>
                              <strong>{review.username}</strong>
                              <time dateTime={review.reviewDate}>
                                {new Date(review.reviewDate).toLocaleDateString(
                                  "vi-VN",
                                )}
                              </time>
                            </div>
                            <Stars rating={review.rating} />
                            <p>{review.comment}</p>
                            <ReviewMediaGallery
                              key={JSON.stringify(review.images)}
                              images={review.images}
                              username={review.username}
                            />
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
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
        aria-labelledby="detail-dialog-title"
      >
        <button
          className={styles.close}
          aria-label="Đóng"
          onClick={() => setModal(null)}
        >
          <X size={21} />
        </button>
        {modal === "image" && (
          <>
            <h2 id="detail-dialog-title" className={styles.srOnly}>
              {product?.title}
            </h2>
            <img src={images[imageIndex]} alt={product?.title} />
          </>
        )}
      </dialog>
    </main>
  );
}
