import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import useAdminDetail from './useAdminDetail';
import { adminErrorMessage, storedDateTime } from '../../services/dashboardApi';
import { deleteAdminReview, getAdminReview } from '../../services/adminReviewApi';
import { notify } from '../../utils/notifications';
import ReviewStars from './ReviewStars';

export default function ReviewDetailModal({ reviewID, onClose, onChanged, onAccessDenied }) {
  const detail = useAdminDetail(reviewID, getAdminReview, onAccessDenied);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [image, setImage] = useState(null);
  const review = detail.data?.review;
  const images = detail.data?.images || [];
  function reload() { setError(''); setStale(false); detail.reload(); }
  async function remove() {
    if (detail.mutation.current || stale || deleted) return;
    detail.mutation.current = true; setBusy(true); setError('');
    try {
      await deleteAdminReview(reviewID);
      if (!detail.alive.current) return;
      setDeleted(true); setConfirm(false);
      notify.success('Đã xóa đánh giá và cập nhật điểm sản phẩm.');
      onChanged();
    } catch (failure) {
      if (!detail.alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure);
      setError(message); setStale(true); setConfirm(false); notify.error(message, message, failure);
    } finally { detail.mutation.current = false; if (detail.alive.current) setBusy(false); }
  }
  return <>
    <AdminModal title={`Chi tiết đánh giá #${reviewID}`} busy={busy} onClose={onClose} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Đóng</button>
      {!deleted && <button className="dashboard-button" disabled={busy || detail.status === 'loading'} onClick={reload}>Tải lại chi tiết</button>}
      {review && !deleted && <button className="dashboard-button admin-button-danger" disabled={busy || stale} onClick={() => setConfirm(true)}>Xóa đánh giá</button>}
    </>}>
      {deleted ? <p className="reviews-deleted" role="status">Đánh giá đã được xóa. Danh sách và thống kê đã được yêu cầu cập nhật.</p> : <>
        {detail.status === 'loading' && <p className="dashboard-loading" role="status">Đang tải chi tiết đánh giá…</p>}
        {detail.status === 'error' && <div className="admin-modal-error" role="alert"><p>{detail.error}</p><button className="dashboard-button" onClick={reload}>Thử lại</button></div>}
        {error && <p className="admin-modal-error" role="alert">{error}</p>}
        {review && <>
          <section className="admin-detail-section"><h3>Sản phẩm được đánh giá</h3><div className="reviews-product-detail">
            {review.productImage && <img src={review.productImage} alt={review.productTitle} />}<div><strong>{review.productTitle}</strong><p>Mã sản phẩm: #{review.productID}</p></div>
          </div></section>
          <section className="admin-detail-section"><h3>Người đánh giá</h3><dl className="admin-detail-grid"><div><dt>Khách hàng</dt><dd>{review.fullName || review.username}</dd></div>
            <div><dt>Tên đăng nhập</dt><dd>@{review.username}</dd></div><div><dt>Ngày đánh giá</dt><dd>{storedDateTime(review.reviewDate)}</dd></div></dl></section>
          <section className="admin-detail-section"><h3>Nội dung đánh giá</h3><ReviewStars rating={review.rating} />
            <p className="reviews-full-comment">{review.comment || 'Đánh giá không có nội dung.'}</p>
            {images.length > 0 && <div className="reviews-image-grid">{images.map((item, index) => <button key={item.imagePosition ?? index} aria-label={`Phóng to ảnh đánh giá ${index + 1}`} onClick={() => setImage(index)}>
              <img src={item.imageUrl} alt={`Ảnh đánh giá ${index + 1}`} loading="lazy" /></button>)}</div>}
          </section>
        </>}
      </>}
    </AdminModal>
    {confirm && <ConfirmAdminAction title="Xóa đánh giá" danger busy={busy} onClose={() => setConfirm(false)} onConfirm={remove}
      message={`Xóa vĩnh viễn đánh giá #${reviewID}? Ảnh đính kèm sẽ được dọn và điểm đánh giá sản phẩm được tính lại. Thao tác này không thể hoàn tác.`} />}
    {image != null && <AdminModal title={`Ảnh đánh giá ${image + 1} / ${images.length}`} onClose={() => setImage(null)} footer={<>
      <button className="dashboard-button" aria-label="Ảnh đánh giá trước" disabled={image === 0} onClick={() => setImage(image - 1)}><ChevronLeft size={18} />Ảnh trước</button>
      <button className="dashboard-button" aria-label="Ảnh đánh giá tiếp theo" disabled={image + 1 >= images.length} onClick={() => setImage(image + 1)}>Ảnh tiếp theo<ChevronRight size={18} /></button>
    </>}><img className="reviews-image-expanded" src={images[image].imageUrl} alt={`Ảnh đánh giá ${image + 1}`} /></AdminModal>}
  </>;
}
