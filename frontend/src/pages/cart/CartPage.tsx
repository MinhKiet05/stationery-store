import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { cacheTimes, queryKeys } from '../../services/queryCache';
import type { Variant } from '../../services/productService';
import { getGuestCart, saveGuestCart, type GuestCartItem } from '../../utils/guestCart';
import styles from './CartPage.module.css';

const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export default function GuestCartPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Giỏ hàng | StationeryStore';
    return () => { document.title = previous; };
  }, []);
  return <main className={styles.page}>
    <div className={styles.container}>
      <h1><ShoppingBag size={28} aria-hidden="true" /> Giỏ hàng của bạn</h1>
      <GuestCart />
      <Link className={styles.continue} to="/search">Tiếp tục mua sắm →</Link>
    </div>
  </main>;
}

function EmptyCart() {
  return <section className={styles.state}><ShoppingBag size={40} aria-hidden="true" /><h2>Giỏ hàng đang trống</h2><p>Khám phá những món văn phòng phẩm phù hợp với bạn.</p></section>;
}

function GuestCart() {
  const [items, setItems] = useState(getGuestCart);
  useEffect(() => {
    const sync = () => setItems(getGuestCart());
    window.addEventListener('cart-changed', sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('cart-changed', sync); window.removeEventListener('storage', sync); };
  }, []);
  const change = (variantID: number, quantity: number) => {
    saveGuestCart(getGuestCart().flatMap(item => item.variantID !== variantID ? [item] : quantity > 0 ? [{ variantID, quantity }] : []));
    window.dispatchEvent(new Event('cart-changed'));
  };
  if (!items.length) return <EmptyCart />;
  return <><ul className={styles.items} aria-label="Sản phẩm trong giỏ">{items.map(item => <GuestRow key={item.variantID} item={item} change={change} />)}</ul>
    <p className={styles.state}>Giỏ hàng được lưu trên thiết bị này. Đăng nhập để đồng bộ và tiếp tục đặt hàng.</p>
    <Link className={styles.primary} to="/login" state={{ from: '/cart' }}>Đăng nhập để thanh toán</Link></>;
}

function GuestRow({ item, change }: { item: GuestCartItem; change: (id: number, quantity: number) => void }) {
  const query = useQuery({ queryKey: queryKeys.public('inventory', { variantID: item.variantID }),
    queryFn: ({ signal }) => api<Variant & { productID: number; productTitle: string }>(`/api/product-variants/${item.variantID}`, { signal }), staleTime: cacheTimes.inventory });
  const variant = query.data;
  return <li className={styles.item}>
    <div className={styles.description}>{variant ? <><Link to={`/products/${variant.productID}`}>{variant.productTitle}</Link><p>{variant.title}</p></>
      : query.isError ? <p role="alert">Chưa tải được sản phẩm. <button onClick={() => void query.refetch()}>Thử lại</button></p> : <p role="status">Đang tải sản phẩm…</p>}</div>
    <div className={styles.quantity}><button aria-label="Giảm số lượng" disabled={item.quantity <= 1} onClick={() => change(item.variantID, item.quantity - 1)}><Minus size={16} /></button><span aria-label="Số lượng">{item.quantity}</span><button aria-label="Tăng số lượng" disabled={!variant?.available || item.quantity >= variant.stockQuantity} onClick={() => change(item.variantID, item.quantity + 1)}><Plus size={16} /></button></div>
    {variant && <strong>{money(variant.price * item.quantity)}</strong>}
    <button className={styles.remove} aria-label="Xóa sản phẩm" onClick={() => change(item.variantID, 0)}><Trash2 size={18} /></button>
  </li>;
}
