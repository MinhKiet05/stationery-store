import React from "react";
import { Heart, ShoppingCart, Star } from "lucide-react";
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
  // Format tiền tệ VNĐ
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(price);
  };

  // Tính phần trăm giảm giá
  const hasDiscount = product.compareAtPrice > product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  return (
    <div className={styles.card}>
      {/* Khối hình ảnh */}
      <div className={styles.imageContainer}>
        <a href={`/products/${product.handle}`} className={styles.imageLink}>
          <img
            src={product.images?.[0] || "/placeholder.png"}
            alt={product.title}
            className={styles.image}
          />
        </a>

        {/* Badge giảm giá */}
        {hasDiscount && (
          <div className={styles.discountBadge}>
            -{discountPercent}%
          </div>
        )}

        {/* Nút yêu thích */}
        <button
          aria-label="Thêm vào yêu thích"
          className={styles.wishlistBtn}
        >
          <Heart size={16} />
        </button>
      </div>

      {/* Nội dung thông tin */}
      <div className={styles.content}>
        {/* Thương hiệu */}
        <span className={styles.vendorName}>
          {product.vendorName}
        </span>

        {/* Tên sản phẩm */}
        <a href={`/products/${product.handle}`} className={styles.titleLink}>
          <h3 className={styles.title}>
            {product.title}
          </h3>
        </a>

        {/* Đánh giá */}
        <div className={styles.rating}>
          <Star size={14} className={styles.starIcon} />
          <span className={styles.ratingScore}>{product.ratingAverage.toFixed(1)}</span>
          <span>(Đã bán {product.reviewCount * 10})</span>
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
            aria-label="Thêm vào giỏ hàng"
            className={styles.cartBtn}
          >
            <ShoppingCart size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}