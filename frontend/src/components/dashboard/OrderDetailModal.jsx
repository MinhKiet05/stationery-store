import { useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import useAdminDetail from './useAdminDetail';
import { adminErrorMessage, changeAdminOrderStatus, currency, getAdminOrder, number, orderStatuses, storedDateTime } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import { confirmCodPayment } from '../../services/dashboardApi';

const nextActions = {
  PENDING: { status: 'PROCESSING', label: 'Xác nhận đơn hàng' },
  PROCESSING: { status: 'SHIPPED', label: 'Xác nhận giao vận chuyển' },
  SHIPPED: { status: 'DELIVERED', label: 'Xác nhận đã giao' },
};
const returnLabels = { PENDING: 'Chờ xử lý', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', COMPLETED: 'Hoàn tất' };

export default function OrderDetailModal({ orderID, onClose, onChanged, onAccessDenied }) {
  const detail = useAdminDetail(orderID, getAdminOrder, onAccessDenied);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const data = detail.data, order = data?.order;
  const next = order && (order.paymentMethod === 'COD' || order.isPaid) && nextActions[order.status];
  const canConfirmPayment = order && order.paymentMethod === 'COD' && !order.isPaid && order.status === 'DELIVERED';
  const canCancel = order && ['PENDING', 'PROCESSING'].includes(order.status) && order.isPaid === false;
  function reload() { setConfirm(null); setError(''); setStale(false); detail.reload(); }
  async function update() {
    if (detail.mutation.current || !order || !confirm || stale) return;
    detail.mutation.current = true; setBusy(true); setError('');
    try {
      const updated = confirm.status === 'CONFIRM_PAYMENT' ? await confirmCodPayment(orderID) : await changeAdminOrderStatus(orderID, confirm.status, order);
      if (!detail.alive.current) return;
      detail.replace({ ...data, order: updated });
      setConfirm(null);
      notify.success(confirm.status === 'CONFIRM_PAYMENT' ? 'Đã xác nhận thu tiền COD.' : 'Đã cập nhật trạng thái đơn hàng.');
      onChanged();
    } catch (failure) {
      if (!detail.alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure);
      setError(message); setConfirm(null);
      setStale(true); // Require a fresh read after conflicts or uncertain network outcomes.
      notify.error(message, message);
    } finally {
      detail.mutation.current = false;
      if (detail.alive.current) setBusy(false);
    }
  }
  return <>
    <AdminModal title={`Chi tiết đơn hàng #ST-${orderID}`} onClose={onClose} busy={busy} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Đóng</button>
      <button className="dashboard-button" disabled={busy || detail.status === 'loading'} onClick={reload}>Tải lại chi tiết</button>
      {canCancel && <button className="dashboard-button admin-button-danger" disabled={busy || stale} onClick={() => setConfirm({ status: 'CANCELLED', label: 'Hủy đơn hàng' })}>Hủy đơn hàng</button>}
      {next && <button className="dashboard-button dashboard-button-primary" disabled={busy || stale} onClick={() => setConfirm(next)}>{next.label}</button>}
      {canConfirmPayment && <button className="dashboard-button dashboard-button-primary" disabled={busy || stale} onClick={() => setConfirm({status:'CONFIRM_PAYMENT', label:'Xác nhận đã thu tiền COD'})}>Xác nhận đã thu tiền COD</button>}
    </>}>
      {detail.status === 'loading' && <p className="dashboard-loading" role="status">Đang tải chi tiết đơn hàng…</p>}
      {detail.status === 'error' && <div className="admin-modal-error" role="alert"><p>{detail.error}</p><button className="dashboard-button" onClick={reload}>Thử lại</button></div>}
      {error && <p className="admin-modal-error" role="alert">{error}</p>}
      {order && <>
        <section className="admin-detail-section"><h3>Thông tin đơn hàng</h3><dl className="admin-detail-grid">
          <div><dt>Ngày đặt</dt><dd>{storedDateTime(order.orderDate)}</dd></div>
          <div><dt>Trạng thái</dt><dd><span className={`dashboard-badge tone-${orderStatuses[order.status]?.tone || 'muted'}`}>{orderStatuses[order.status]?.label || order.status}</span></dd></div>
          <div><dt>Khách hàng</dt><dd>{data.customerName || data.username} · @{data.username}</dd></div>
          {data.email && <div><dt>Email</dt><dd>{data.email}</dd></div>}
          {order.contactPhone && <div><dt>Số điện thoại</dt><dd>{order.contactPhone}</dd></div>}
          {order.shippingAddress && <div className="admin-detail-wide"><dt>Địa chỉ giao hàng</dt><dd>{order.shippingAddress}</dd></div>}
          {order.deliveredAt && <div><dt>Ngày giao thành công</dt><dd>{storedDateTime(order.deliveredAt)}</dd></div>}
        </dl></section>
        <section className="admin-detail-section"><h3>Sản phẩm ({number(order.items.length)})</h3>
          {order.items.length === 0 ? <p className="admin-modal-note">Đơn hàng chưa có thông tin sản phẩm.</p> : <ul className="admin-order-items">{order.items.map(item => <li key={item.orderDetailID}>
            {item.productImage && <img src={item.productImage} alt={item.productTitle || item.variantTitle} loading="lazy" />}
            <div className="admin-order-item-info"><strong>{item.productTitle || item.variantTitle}</strong><span>{item.variantTitle}</span>
              {data.variantSkus?.[item.variantID] && <small>SKU: {data.variantSkus[item.variantID]}</small>}
              {item.vendorName && <small>{item.vendorName}</small>}<span>{number(item.quantity)} × {currency(item.unitPrice)}</span></div>
            <strong className="admin-order-line-total">{currency(item.subTotal)}</strong>
          </li>)}</ul>}
        </section>
        <section className="admin-detail-section"><h3>Thanh toán</h3><dl className="admin-detail-grid">
          {order.paymentMethod && <div><dt>Phương thức</dt><dd>{order.paymentMethod}</dd></div>}
          {order.paidAt && <div><dt>Thời gian thanh toán</dt><dd>{storedDateTime(order.paidAt)}</dd></div>}
          {order.paymentReference && <div><dt>Mã xác nhận</dt><dd>{order.paymentReference}</dd></div>}
          {order.isPaid != null && <div><dt>Thanh toán</dt><dd>{order.isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}</dd></div>}
          {order.couponCode && <div><dt>Mã giảm giá</dt><dd>{order.couponCode}</dd></div>}
        </dl><dl className="admin-order-totals"><div><dt>Tạm tính</dt><dd>{currency(order.subTotal)}</dd></div>
          <div><dt>Giảm giá</dt><dd>{currency(order.discountAmount)}</dd></div>
          <div><dt>Vận chuyển {order.shippingMethod === 'EXPRESS' ? '(nhanh)' : '(tiêu chuẩn)'}</dt><dd>{currency(order.shippingFee ?? 0)}</dd></div>
          <div><dt>Tổng tiền</dt><dd>{currency(order.totalAmount)}</dd></div></dl></section>
        {data.returns?.length > 0 && <section className="admin-detail-section"><h3>Yêu cầu trả hàng liên quan</h3><ul className="admin-return-list">
          {data.returns.map(item => <li key={item.returnID}><strong>#{item.returnID} · {returnLabels[item.status] || item.status}</strong>
            <p>{item.reason}</p><small>{storedDateTime(item.createdAt)}</small>{item.adminNote && <p>Ghi chú: {item.adminNote}</p>}</li>)}
        </ul></section>}
      </>}
    </AdminModal>
    {confirm && <ConfirmAdminAction title={confirm.label} message={`Bạn xác nhận thao tác “${confirm.label}” cho đơn #ST-${orderID}?${confirm.status === 'CANCELLED' ? ' Tồn kho sẽ được hoàn lại theo quy trình hiện có.' : ''}`}
      busy={busy} danger={confirm.status === 'CANCELLED'} onClose={() => setConfirm(null)} onConfirm={update} />}
  </>;
}
