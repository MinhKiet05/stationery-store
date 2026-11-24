import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import { money, type CatalogProduct } from './catalogData';
import { productOptions, variantsOptions } from '../../services/storeQueries';
import { schedulePrefetch, cancelPrefetch, sessionScope } from '../../services/queryCache';
import { useCartMutation } from '../../services/useCartMutation';
import type { Variant } from '../../services/productService';
import { isFavoriteProduct, toggleFavoriteProduct } from '../../utils/favoriteStorage';
import { addToGuestCart, getGuestCart } from '../../utils/guestCart';
import { notify } from '../../utils/notifications';
import styles from './SearchPage.module.css';

export default function SearchProductCard({ product }: { product: CatalogProduct }) {
  const client = useQueryClient(), mutation = useCartMutation();
  const [saved, setSaved] = useState(() => isFavoriteProduct(Number(product.id)));
  const [choices, setChoices] = useState<Variant[]>([]), [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false), pending = useRef(false);
  useEffect(() => {
    const sync = () => setSaved(isFavoriteProduct(Number(product.id)));
    window.addEventListener('favorites-changed', sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('favorites-changed', sync); window.removeEventListener('storage', sync); };
  }, [product.id]);
  const prefetch = () => schedulePrefetch(productOptions(decodeURIComponent(product.detailHref.slice('/products/'.length))));

  async function addToCart(choice?: Variant) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    const scope = sessionScope();
    try {
      let variant = choice;
      if (!variant) {
        const variants = await client.fetchQuery(variantsOptions(Number(product.id)));
        if (scope !== sessionScope()) return;
        if (variants.length > 1) { setChoices(variants); setSelected(''); return; }
        variant = variants[0];
      }
      if (!variant || !variant.available || variant.stockQuantity < 1) {
        notify.warning('Sản phẩm hiện đã hết hàng.'); return;
      }
      if (localStorage.getItem('accessToken')) {
        await mutation.mutateAsync({ kind: 'add', variant, quantity: 1, productTitle: product.title });
      } else {
        const variantID = variant.variantID;
        if ((getGuestCart().find(item => item.variantID === variantID)?.quantity ?? 0) + 1 > variant.stockQuantity) {
          notify.warning('Số lượng trong giỏ vượt quá tồn kho. Vui lòng giảm số lượng.'); return;
        }
        addToGuestCart(variant.variantID, 1);
      }
      if (scope !== sessionScope()) return;
      setChoices([]);
      notify.success('Đã thêm 1 sản phẩm vào giỏ hàng.');
      window.dispatchEvent(new Event('cart-changed'));
    } catch (error) {
      if (scope === sessionScope()) notify.error(error, 'Không thêm được sản phẩm. Vui lòng thử lại.');
    } finally { pending.current = false; setBusy(false); }
  }

  return (
    <article className={styles.card} onMouseEnter={prefetch} onFocus={prefetch}
      onMouseLeave={cancelPrefetch} onBlur={cancelPrefetch}>
      <div className={styles.imageWrapper}>
        <Link to={product.detailHref}
          className={styles.imageButton}

          aria-label={`Xem ${product.title}`}
        >
          {product.image ? (
            <img
              src={product.image}
              alt={product.title}
              loading="lazy"
              width="192"
              height="192"
            />
          ) : (
            <span className={styles.missingImage}>
              Chưa có ảnh sản phẩm
            </span>
          )}
        </Link>
        <div className={styles.badges}>
          {product.oldPrice > product.price && (
            <span>
              -
              {Math.round(
                (1 - product.price / product.oldPrice) * 100,
              )}
              %
            </span>
          )}
          {product.badge && (
            <b
              className={
                ["Top Trend", "Tiết kiệm"].includes(product.badge)
                  ? styles.greenBadge
                  : ""
              }
            >
              {product.badge}
            </b>
          )}
        </div>
        <button
          className={styles.favorite}
          aria-label={`${saved ? "Bỏ" : "Thêm"} yêu thích ${product.title}`}
          aria-pressed={saved}
          onClick={event => { event.stopPropagation(); setSaved(toggleFavoriteProduct(Number(product.id))); }}
        >
          <Heart
            size={18}
            fill={
              saved
                ? "currentColor"
                : "none"
            }
          />
        </button>
      </div>
      <div className={styles.cardContent}>
        <p className={styles.vendor}>{product.brand}</p>
        <Link to={product.detailHref}
          className={styles.productTitle}

        >
          {product.title}
        </Link>
        <p className={styles.productRating}>
          {product.reviewCount > 0 ? (
            <>
              <Star size={14} fill="currentColor" />
              <strong>{product.rating.toFixed(1)}</strong>
              <span>({product.reviewCount} đánh giá)</span>
            </>
          ) : (
            <span>Chưa có đánh giá</span>
          )}
        </p>
        <div className={styles.priceRow}>
          <div>
            <strong>{money(product.price)}</strong>
            {product.oldPrice > product.price && (
              <del>{money(product.oldPrice)}</del>
            )}
          </div>
          <button
            className={styles.cartButton}
            type="button" disabled={busy || !product.inStock}
            aria-label={`Thêm vào giỏ hàng ${product.title}`}
            onClick={event => { event.stopPropagation(); void addToCart(); }}
          >
            <ShoppingCart size={18} />
          </button>
        </div>
      </div>
      {!!choices.length && <fieldset className={styles.cartChoices} onClick={event => event.stopPropagation()}>
        <legend>Chọn phiên bản</legend>
        <select aria-label={`Phiên bản ${product.title}`} value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>
          <option value="">Chọn phiên bản</option>
          {choices.map(variant => <option key={variant.variantID} value={variant.variantID} disabled={!variant.available || variant.stockQuantity < 1}>
            {variant.title} — {money(variant.price)}{variant.stockQuantity < 1 ? ' (Hết hàng)' : ''}
          </option>)}
        </select>
        <button disabled={busy || !selected} onClick={() => void addToCart(choices.find(v => String(v.variantID) === selected))}>Thêm vào giỏ hàng</button>
        <button disabled={busy} onClick={() => setChoices([])}>Đóng lựa chọn</button>
      </fieldset>}
    </article>
  );
}
