import RefundSummary from '../returns/RefundSummary';
import { useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import ReturnEvidenceGallery from './ReturnEvidenceGallery';
import ReturnInventoryModal from './ReturnInventoryModal';
import useAdminDetail from './useAdminDetail';
import { getAdminReturn, changeAdminReturnStatus, returnStatuses } from '../../services/adminReturnApi';
import { adminErrorMessage, currency, number, storedDateTime, orderStatuses } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';

export default function ReturnDetailModal({ returnID, onClose, onChanged, onAccessDenied }) {
  const detail = useAdminDetail(returnID, getAdminReturn, onAccessDenied);
  const [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false), [note, setNote] = useState('');
  const [inventoryMode, setInventoryMode] = useState(null);
  const row = detail.data?.request, order = detail.data?.order, status = returnStatuses[row?.status];
  const receipt = detail.data?.receipt;
  function reload() { setError(''); setStale(false); setNote(''); detail.reload(); }
  function inventorySaved(data) { detail.replace(data); setInventoryMode(null); setError(''); setStale(false); onChanged(); }
  function inventoryConflict(message) { setInventoryMode(null); setError(message); setStale(false); detail.reload(); onChanged(); }
  async function decide() {
    if (detail.mutation.current || stale || row?.status !== 'PENDING' || !['APPROVED', 'REJECTED'].includes(confirm)) return;
    detail.mutation.current = true; setBusy(true); setError('');
    try {
      await changeAdminReturnStatus(returnID, confirm, note);
      if (!detail.alive.current) return;
      notify.success(confirm === 'APPROVED' ? 'Đã chấp thuận yêu cầu trả hàng.' : 'Đã từ chối yêu cầu trả hàng.');
      setConfirm(null); setNote('');
      // A successful decision is distinct from a subsequent read failure: reload has its own error/retry state.
      detail.reload(); onChanged();
    } catch (failure) {
      if (!detail.alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure); setError(message); setStale(true); setConfirm(null); notify.error(message, message, failure);
      if (failure.status === 409) { setStale(false); detail.reload(); onChanged(); }
    } finally { detail.mutation.current = false; if (detail.alive.current) setBusy(false); }
  }
  return <>
    <AdminModal title={`Chi tiết yêu cầu RET-${returnID}`} busy={busy} onClose={onClose} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Đóng</button>
      <button className="dashboard-button" disabled={busy || detail.status === 'loading'} onClick={reload}>Tải lại chi tiết</button>
      {row?.status === 'PENDING' && <><button className="dashboard-button admin-button-danger" disabled={busy || stale || note.length > 1000} onClick={() => setConfirm('REJECTED')}>Từ chối</button>
        <button className="dashboard-button dashboard-button-primary" disabled={busy || stale || note.length > 1000} onClick={() => setConfirm('APPROVED')}>Chấp thuận trả hàng</button></>}
      {row?.status === 'APPROVED' && !receipt && <button className="dashboard-button dashboard-button-primary" disabled={busy || stale || !detail.data.items.length} onClick={() => setInventoryMode('receive')}>Xác nhận đã nhận hàng</button>}
      {row?.status === 'APPROVED' && receipt && !receipt.inspectedAt && <button className="dashboard-button dashboard-button-primary" disabled={busy || stale} onClick={() => setInventoryMode('restock')}>Kiểm tra & nhập lại kho</button>}
    </>}>
      {detail.status === 'loading' && <p className="dashboard-loading" role="status">Đang tải chi tiết yêu cầu…</p>}
      {detail.status === 'error' && <div className="admin-modal-error" role="alert"><p>{detail.error}</p><button className="dashboard-button" onClick={reload}>Thử lại</button></div>}
      {error && <p className="admin-modal-error" role="alert">{error}</p>}
      {row && <>
        <RefundSummary pricing={detail.data.pricing} />
        <section className="admin-detail-section"><h3>Thông tin yêu cầu</h3><dl className="admin-detail-grid"><div><dt>Mã yêu cầu</dt><dd>RET-{row.returnID}</dd></div>
          <div><dt>Trạng thái yêu cầu</dt><dd><span className={`dashboard-badge tone-${status?.tone || 'muted'}`}>{status?.label || 'Không xác định'}</span></dd></div>
          <div><dt>Ngày yêu cầu</dt><dd>{storedDateTime(row.createdAt)}</dd></div>{row.processedAt && <div><dt>Ngày xử lý</dt><dd>{storedDateTime(row.processedAt)}</dd></div>}
          <div className="admin-detail-wide"><dt>Lý do trả hàng</dt><dd className="returns-full-reason">{row.reason}</dd></div></dl>
          <p className="returns-business-note">Chấp thuận trả hàng không xác nhận hoàn tiền và không tự nhập lại tồn kho.</p>
        </section>
        <section className="admin-detail-section returns-receipt-section"><h3>Nhận hàng & kiểm tra tồn kho</h3>
          {!receipt ? <p className="admin-modal-note">{row.status === 'APPROVED' ? 'Đã duyệt — đang chờ nhận hàng thực tế.' : 'Chưa có thông tin nhận hoặc kiểm tra hàng.'}</p> : <>
            <p className={`dashboard-badge tone-${receipt.inspectedAt ? 'green' : 'blue'}`}>{receipt.inspectedAt ? 'Đã kiểm tra & xử lý nhập kho' : 'Đã nhận hàng — chờ kiểm tra'}</p>
            <dl className="admin-detail-grid returns-receipt-meta"><div><dt>Ngày nhận hàng</dt><dd>{storedDateTime(receipt.receivedAt)}</dd></div><div><dt>Người nhận hàng</dt><dd>{receipt.receivedBy}</dd></div>
              {receipt.inspectedAt && <><div><dt>Ngày kiểm tra</dt><dd>{storedDateTime(receipt.inspectedAt)}</dd></div><div><dt>Người kiểm tra</dt><dd>{receipt.inspectedBy}</dd></div></>}</dl>
            <ul className="returns-receipt-results">{receipt.items.map(result => { const item = detail.data.items.find(i => i.returnItemID === result.returnItemID); return <li key={result.returnItemID}><strong>{item?.productTitle}{item?.sku ? ` · ${item.sku}` : ''}</strong>
              <span>Thực nhận: {number(result.receivedQuantity)}{result.goodQuantity != null ? ` · Nhập lại kho: +${number(result.goodQuantity)} · Hàng hỏng: ${number(result.damagedQuantity)}` : ' · Chưa kiểm tra'}</span></li>; })}</ul>
            {receipt.inspectionNote && <p className="returns-full-reason returns-inspection-note">{receipt.inspectionNote}</p>}
          </>}
        </section>
        {order && <>
          <section className="admin-detail-section"><h3>Khách hàng & giao nhận</h3><dl className="admin-detail-grid"><div><dt>Khách hàng</dt><dd>{row.customerName || row.username}</dd></div><div><dt>Tên đăng nhập</dt><dd>@{row.username}</dd></div>
            {order.contactPhone && <div><dt>Số điện thoại nhận hàng</dt><dd>{order.contactPhone}</dd></div>}{order.shippingAddress && <div><dt>Địa chỉ giao hàng</dt><dd>{order.shippingAddress}</dd></div>}</dl></section>
          <section className="admin-detail-section"><h3>Đơn hàng gốc ORD-{row.orderID}</h3><dl className="admin-detail-grid"><div><dt>Ngày đặt hàng</dt><dd>{storedDateTime(order.orderDate)}</dd></div>
            <div><dt>Trạng thái đơn hàng</dt><dd>{orderStatuses[order.status]?.label || order.status}</dd></div><div><dt>Thanh toán</dt><dd>{order.isPaid == null ? 'Chưa có thông tin' : order.isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}</dd></div>
            {order.paymentMethod && <div><dt>Phương thức thanh toán</dt><dd>{order.paymentMethod}</dd></div>}{order.totalAmount != null && <div><dt>Tổng tiền đơn hàng</dt><dd>{currency(order.totalAmount)}</dd></div>}
            {order.deliveredAt && <div><dt>Ngày giao thành công</dt><dd>{storedDateTime(order.deliveredAt)}</dd></div>}</dl></section>
        </>}
        <section className="admin-detail-section"><h3>Sản phẩm yêu cầu trả</h3>{detail.data.items.length === 0 ? <p className="admin-modal-note">Yêu cầu không có thông tin sản phẩm.</p> : <ul className="admin-order-items returns-items">{detail.data.items.map(item => <li key={item.returnItemID}>
          {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />}<div className="admin-order-item-info"><strong>{item.productTitle}</strong>
            {item.variantTitle && <span>{item.variantTitle}</span>}{item.sku && <small>SKU: {item.sku}</small>}<span>Yêu cầu trả: {number(item.quantity)} / Đã mua: {number(item.purchasedQuantity)}</span>
            <small>Đơn giá trong đơn: {currency(item.unitPrice)}</small></div>
        </li>)}</ul>}</section>
        <section className="admin-detail-section"><h3>Bằng chứng đính kèm</h3><ReturnEvidenceGallery urls={detail.data.evidenceUrls} /></section>
        <section className="admin-detail-section"><h3>Ghi chú xử lý</h3>{row.status === 'PENDING' ? <label className="returns-note-label">Ghi chú của quản trị viên (không bắt buộc)
          <textarea aria-label="Ghi chú xử lý trả hàng" value={note} maxLength={1000} rows={4} disabled={busy || stale} onChange={event => setNote(event.target.value)} /><small>{note.length}/1000 ký tự</small>
        </label> : <p className="returns-full-reason">{row.adminNote || 'Không có ghi chú xử lý.'}</p>}</section>
      </>}
    </AdminModal>
    {inventoryMode && detail.data && <ReturnInventoryModal mode={inventoryMode} data={detail.data} onClose={() => { setInventoryMode(null); reload(); }} onSaved={inventorySaved} onConflict={inventoryConflict} onAccessDenied={onAccessDenied} />}
    {confirm && <ConfirmAdminAction title={confirm === 'APPROVED' ? 'Chấp thuận yêu cầu trả hàng' : 'Từ chối yêu cầu trả hàng'} busy={busy} danger={confirm === 'REJECTED'} onClose={() => setConfirm(null)} onConfirm={decide}
      message={confirm === 'APPROVED' ? `Chấp thuận yêu cầu RET-${returnID}? Thao tác này chỉ duyệt trả hàng, không thực hiện hoàn tiền hoặc nhập kho.` : `Từ chối yêu cầu RET-${returnID} với ghi chú đã nhập? Yêu cầu đã xử lý không thể chuyển trạng thái lần nữa qua thao tác này.`} />}
  </>;
}
