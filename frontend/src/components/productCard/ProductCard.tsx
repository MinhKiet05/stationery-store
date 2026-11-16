import { useEffect, useState, type MouseEvent } from "react";
import { Heart, ShoppingCart, Star } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { isFavoriteProduct, toggleFavoriteProduct } from "../../utils/favoriteStorage";
import styles from "./ProductCard.module.css";

export interface Product {
  productID: number;
  title: string;
  handle: string;
  description: string;
  price: number;
  priceMin: number;
  priceMax: number;
  compareAtPrice: number;
  available: boolean;
  isActive: boolean;
  ratingAverage: number;
  reviewCount: number;
  vendorID: number;
  vendorName: string;
  productTypeID: number;
  productTypeName: string;
  images: string[];
}

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(() => isFavoriteProduct(product.productID));

  // Đồng bộ trạng thái khi productID đổi hoặc khi nơi khác bấm tim
  useEffect(() => {
    const sync = () => setSaved(isFavoriteProduct(product.productID));
    sync();
    window.addEventListener("favorites-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("favorites-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [product.productID]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(price);
  };

  const hasDiscount = product.compareAtPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  const productUrl = `/products/${encodeURIComponent(product.handle || String(product.productID))}`;

  function handleToggleFavorite(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation(); // Tránh kích hoạt click vào card nếu có
    const next = toggleFavoriteProduct(product.productID);
    setSaved(next);
  }

  return (
    <div className={styles.card}>
      {/* Khối hình ảnh */}
      <div className={styles.imageContainer}>
        <Link to={productUrl} className={styles.imageLink}>
          <img
            src={product.images?.[0] || "/placeholder.png"}
            alt={product.title}
            className={styles.image}
          />
        </Link>

        {/* Badge giảm giá */}
        {hasDiscount && (
          <div className={styles.discountBadge}>
            -{discountPercent}%
          </div>
        )}

        {/* Nút yêu thích đồng bộ */}
        <button
          type="button"
          aria-label={saved ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
          aria-pressed={saved}
          className={styles.wishlistBtn}
          onClick={handleToggleFavorite}
        >
          <Heart
            size={16}
            color={saved ? "#ff7518" : "currentColor"}
            fill={saved ? "#ff7518" : "none"}
          />
        </button>
      </div>

      {/* Nội dung thông tin */}
      <div className={styles.content}>
        <span className={styles.vendorName}>
          {product.vendorName}
        </span>

        <Link to={productUrl} className={styles.titleLink}>
          <h3 className={styles.title}>
            {product.title}
          </h3>
        </Link>

        {/* Đánh giá */}
        <div className={styles.rating}>
          <Star size={14} className={styles.starIcon} />
          <span className={styles.ratingScore}>{product.ratingAverage.toFixed(1)}</span>
          <span>({product.reviewCount} đánh giá)</span>
        </div>

        {/* Giá & Giỏ hàng */}
        <div className={styles.priceCartWrapper}>
          <div className={styles.priceBlock}>
            <span className={styles.currentPrice}>
              {formatPrice(product.price)}
            </span>
            {hasDiscount && (
              <span className={styles.oldPrice}>
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label="Thêm vào giỏ hàng"
            className={styles.cartBtn}
            onClick={() => navigate(productUrl)}
          >
            <ShoppingCart size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}