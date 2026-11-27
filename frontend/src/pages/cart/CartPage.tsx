import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { errorStatus, errorName } from '../../services/apiError';
import { useCart } from '../../services/storeQueries';
import { useCartMutation } from '../../services/useCartMutation';
import useSessionScope from '../../services/useSessionScope';
import { cacheTimes, queryKeys } from '../../services/queryCache';
import { createOrder } from '../../services/orderService';
import type { Variant } from '../../services/productService';
import { getGuestCart, saveGuestCart, type GuestCartItem } from '../../utils/guestCart';
import { userMessage } from '../../utils/notifications';
import styles from './CartPage.module.css';

const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export default function CartPage() {
  const scope = useSessionScope();
  useEffect(() => {
    const previous = document.title;
    document.title = 'Giỏ hàng | StationeryStore';
    return () => { document.title = previous; };
  }, []);
  return <main className={styles.page}>
    <div className={styles.container}>
      <h1><ShoppingBag size={28} aria-hidden="true" /> Giỏ hàng của bạn</h1>
      {localStorage.getItem('accessToken') ? <CustomerCart key={scope} /> : <GuestCart key={scope} />}
      <Link className={styles.continue} to="/search">Tiếp tục mua sắm →</Link>
    </div>
  </main>;
}

function EmptyCart() {
  return <section className={styles.state}><ShoppingBag size={40} aria-hidden="true" /><h2>Giỏ hàng đang trống</h2><p>Khám phá những món văn phòng phẩm phù hợp với bạn.</p></section>;
}

function CustomerCart() {
  const cart = useCart(), mutation = useCartMutation(), client = useQueryClient(), scope = useSessionScope();
  const [error, setError] = useState(''), [ordering, setOrdering] = useState(false), [uncertain, setUncertain] = useState(false);
  const [orderID, setOrderID] = useState<number | null>(null);
  const lock = useRef(false);
  const busy = ordering || mutation.isPending || uncertain;
  async function change(value: Parameters<typeof mutation.mutateAsync>[0]) {
    if (busy || lock.current) return;
    lock.current = true; setError('');
    try { await mutation.mutateAsync(value); }
    catch (err) { if (errorName(err) !== 'AbortError') setError(userMessage(err, 'Chưa cập nhật được giỏ hàng. Vui lòng thử lại.')); }
    finally { lock.current = false; }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || lock.current || !cart.data?.items.length) return;
    const form = new FormData(event.currentTarget);
    const address = String(form.get('address') ?? '').trim(), phone = String(form.get('phone') ?? '').trim();
    if (!address || !phone) { setError('Vui lòng nhập địa chỉ và số điện thoại nhận hàng.'); return; }
    lock.current = true; setOrdering(true); setError('');
    try {
      const result = await createOrder({ shippingAddress: address, contactPhone: phone, paymentMethod: 'COD',
        couponCode: String(form.get('coupon') ?? '').trim() || undefined });
      setOrderID(result.orderID);
      void client.invalidateQueries({ queryKey: queryKeys.private('cart', {}, scope) });
    } catch (err) {
      if (errorName(err) === 'AbortError') return;
      const status = errorStatus(err);
      const unknown = !status || status === 408 || status >= 500;
      setUncertain(unknown);
      setError(unknown ? 'Chưa xác định được kết quả đặt hàng. Hãy kiểm tra lịch sử đơn hàng trước khi đặt lại.'
        : userMessage(err, 'Chưa thể đặt hàng. Vui lòng kiểm tra giỏ hàng và thử lại.'));
      if (!unknown) void cart.refetch();
    } finally { lock.current = false; setOrdering(false); }
  }
  if (orderID) return <section className={styles.state} role="status"><h2>Đặt hàng thành công</h2><p>Đơn hàng #{orderID} đã được tiếp nhận.</p><Link className={styles.primary} to="/my-profile/orders">Xem lịch sử đơn hàng</Link></section>;
  if (cart.isPending) return <p className={styles.state} role="status">Đang tải giỏ hàng…</p>;
  if (cart.isError && !cart.data) return <section className={styles.state} role="alert"><p>Chưa tải được giỏ hàng. Dữ liệu của bạn vẫn được giữ lại.</p><button onClick={() => void cart.refetch()}>Thử lại</button></section>;
  if (!cart.data?.items.length) return <EmptyCart />;
  const invalid = cart.data.items.some(item => item.available === false || item.stockQuantity != null && item.stockQuantity < item.quantity);
  return <>
    {cart.isError && <p role="alert">Chưa cập nhật được giỏ hàng. <button onClick={() => void cart.refetch()}>Thử lại</button></p>}
    <ul className={styles.items} aria-label="Sản phẩm trong giỏ">{cart.data.items.map(item => <li key={item.cartItemID} className={styles.item}>
      <div className={styles.description}>{item.productID ? <Link to={`/products/${item.productID}`}>{item.productTitle}</Link> : <strong>{item.productTitle}</strong>}<p>{item.variantTitle}</p>
        {(item.available === false || item.stockQuantity != null && item.stockQuantity < item.quantity) && <p className={styles.error}>Sản phẩm không còn đủ hàng. Vui lòng giảm số lượng hoặc xóa khỏi giỏ.</p>}</div>
      <div className={styles.quantity}>
        <button aria-label={`Giảm số lượng ${item.productTitle}`} disabled={busy || item.quantity <= 1} onClick={() => void change({ kind: 'quantity', itemID: item.cartItemID, quantity: item.quantity - 1 })}><Minus size={16} /></button>
        <span aria-label="Số lượng">{item.quantity}</span>
        <button aria-label={`Tăng số lượng ${item.productTitle}`} disabled={busy || item.available === false || item.stockQuantity != null && item.quantity >= item.stockQuantity} onClick={() => void change({ kind: 'quantity', itemID: item.cartItemID, quantity: item.quantity + 1 })}><Plus size={16} /></button>
      </div>
      <strong>{money(item.lineTotal)}</strong>
      <button className={styles.remove} aria-label={`Xóa ${item.productTitle}`} disabled={busy} onClick={() => void change({ kind: 'remove', itemID: item.cartItemID })}><Trash2 size={18} /></button>
    </li>)}</ul>
    {mutation.isPending && <p role="status">Đang cập nhật giỏ hàng…</p>}
    <form className={styles.checkout} onSubmit={event => void submit(event)}>
      <h2>Thông tin nhận hàng</h2>
      <p>Tổng tiền hàng trước giảm giá: <strong>{money(cart.data.subtotal)}</strong></p>
      <fieldset disabled={busy}>
        <label>Địa chỉ nhận hàng<textarea name="address" autoComplete="street-address" required maxLength={500} /></label>
        <label>Số điện thoại<input name="phone" type="tel" autoComplete="tel" required maxLength={30} /></label>
        <label>Mã giảm giá (tùy chọn)<input name="coupon" maxLength={50} autoComplete="off" /></label>
      </fieldset>
      <p>Thanh toán khi nhận hàng (COD). Giá và mã giảm giá được cửa hàng kiểm tra khi xác nhận đơn.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {uncertain && <Link to="/my-profile/orders">Kiểm tra lịch sử đơn hàng</Link>}
      <button className={styles.primary} type="submit" disabled={busy || invalid || cart.isError || cart.isFetching}>{ordering ? 'Đang đặt hàng…' : 'Xác nhận đặt hàng'}</button>
    </form>
  </>;
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
