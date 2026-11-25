import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Package, Star, X } from 'lucide-react';
import { api } from '../../services/api';
import type { Order } from '../../services/orderService';
import { purchasedReviewsOptions, type Review } from '../../services/reviewService';
import { queryKeys } from '../../services/queryCache';
import { useCurrentUser } from '../../services/storeQueries';
import useSessionScope from '../../services/useSessionScope';
import ReviewForm from './ReviewForm';
import styles from './ReviewModal.module.css';

type Props = { orderID: number; onClose: () => void };

export default function ReviewModal({ orderID, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => { if (busy) dialog.current?.focus(); }, [busy]);

  return <dialog ref={dialog} className={styles.modal} tabIndex={-1} aria-labelledby="review-modal-title" aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.heading}>
      <div><h2 id="review-modal-title">Đánh giá sản phẩm</h2><p>Đơn hàng #ST-{orderID}</p></div>
      <button type="button" className={styles.close} aria-label="Đóng đánh giá" disabled={busy} onClick={onClose}><X size={22} aria-hidden="true" /></button>
    </header>
    <div className={styles.content}>
      <ReviewOrder orderID={orderID} busy={busy} onBusyChange={setBusy} onClose={onClose} />
    </div>
  </dialog>;
}

function ReviewOrder({ orderID, busy, onBusyChange, onClose }: Props & { busy: boolean; onBusyChange: (busy: boolean) => void }) {
  const scope = useSessionScope();
  const identity = useCurrentUser();
  const purchase = useQuery({
    queryKey: queryKeys.private('orders', { reviewOrder: orderID }, scope),
    queryFn: ({ signal }) => api<Order>(`/api/orders/${orderID}`, { signal }),
    enabled: !!identity.data,
    staleTime: 0,
  });
  const order = purchase.data;
  const owned = !!order && !!identity.data && order.userID === identity.data.userID && order.status === 'DELIVERED';
  const productIDs = owned ? [...new Set(order.items.map(item => item.productID))] : [];
  const reviews = useQueries({ queries: productIDs.map(id => purchasedReviewsOptions(id, scope)) });
  if (identity.isError || (identity.isSuccess && !identity.data) || purchase.isError) return <div className={styles.state}>
    <p role="alert">Không thể kiểm tra quyền đánh giá đơn hàng. Vui lòng thử lại.</p>
    <button className={styles.primary} onClick={() => { void identity.refetch(); void purchase.refetch(); }}>Thử lại</button>
  </div>;
  if (identity.isPending || purchase.isPending) return <p role="status" className={styles.state}>Đang kiểm tra sản phẩm đã mua…</p>;
  if (!owned || !order.items.length) return <p role="alert" className={styles.state}>Chỉ sản phẩm thuộc đơn hàng đã giao thành công của bạn mới được đánh giá.</p>;
  if (reviews.some(query => query.isPending)) return <p role="status" className={styles.state}>Đang tải trạng thái đánh giá…</p>;
  if (reviews.some(query => query.isError)) return <div className={styles.state}>
    <p role="alert">Chưa tải được trạng thái đánh giá. Vui lòng thử lại để tránh gửi trùng.</p>
    <button className={styles.primary} onClick={() => { reviews.filter(query => query.isError).forEach(query => void query.refetch()); }}>Thử lại</button>
  </div>;
  const ownReviews = reviews.flatMap(query => query.data ?? []).filter(review => review.userID === identity.data!.userID);
  return <ReviewProducts order={order} reviews={ownReviews} busy={busy} onBusyChange={onBusyChange} onClose={onClose} />;
}

function ReviewProducts({ order, reviews, busy, onBusyChange, onClose }: {
  order: Order; reviews: Review[]; busy: boolean; onBusyChange: (busy: boolean) => void; onClose: () => void;
}) {
  const reviewed = new Map(reviews.map(review => [review.productID, review]));
  const [selectedID, setSelectedID] = useState(() => (order.items.find(item => !reviewed.has(item.productID)) ?? order.items[0]).orderDetailID);
  return <>
    <div className={styles.orderBar}><span className={styles.delivered}><BadgeCheck size={15} aria-hidden="true" />Giao hàng thành công</span></div>
    <label className={styles.productSelect}>Sản phẩm / Phân loại
      <select value={selectedID} onChange={event => setSelectedID(Number(event.target.value))} disabled={busy}>
        {order.items.map(item => <option key={item.orderDetailID} value={item.orderDetailID}>
          {item.productTitle || item.variantTitle} — {item.variantTitle}{reviewed.has(item.productID) ? ' — Đã đánh giá' : ' — Chưa đánh giá'}
        </option>)}
      </select>
    </label>
    {order.items.map(item => <div key={item.orderDetailID} hidden={selectedID !== item.orderDetailID}>
      {reviewed.has(item.productID) ? <>
        <div className={styles.product}>
          {item.productImage ? <img className={styles.reviewedPicture} src={item.productImage} alt={item.productTitle} /> : <Package size={32} aria-hidden="true" />}
          <div className={styles.productInfo}><h3>{item.productTitle}</h3><p>{item.variantTitle}</p></div>
          <strong className={styles.price}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.unitPrice)}</strong>
        </div>
        <div className={styles.reviewed} role="status"><BadgeCheck size={20} aria-hidden="true" /><strong>Sản phẩm đã được đánh giá</strong><p>Mỗi tài khoản chỉ được đánh giá một lần cho mỗi sản phẩm, kể cả khi mua nhiều phân loại.</p></div>
        <p className={styles.savedRating}><Star size={18} fill="currentColor" aria-hidden="true" />{reviewed.get(item.productID)!.rating}/5 sao</p>
        <p className={styles.savedComment}>{reviewed.get(item.productID)!.comment}</p>
        <div className={styles.formActions}><button className={styles.secondary} type="button" onClick={onClose}>Để sau</button></div>
      </> : <ReviewForm item={item} onClose={onClose} onBusyChange={onBusyChange} />}
    </div>)}
  </>;
}
