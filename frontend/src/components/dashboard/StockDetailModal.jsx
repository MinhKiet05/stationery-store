import { useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import useAdminDetail from './useAdminDetail';
import { adminErrorMessage, currency, getStockVariant, number, updateVariantStock } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';

export default function StockDetailModal({ variantID, onClose, onChanged, onAccessDenied }) {
  const detail = useAdminDetail(variantID, getStockVariant, onAccessDenied);
  const [quantity, setQuantity] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const item = detail.data;
  const valid = /^\d+$/.test(quantity) && Number.isSafeInteger(Number(quantity)) && Number(quantity) <= 2147483647;
  const changed = valid && Number(quantity) !== item?.stockQuantity;
  function reload() { setQuantity(''); setConfirm(false); setError(''); setStale(false); detail.reload(); }
  async function save() {
    if (detail.mutation.current || !item || !changed || stale) return;
    detail.mutation.current = true; setBusy(true); setError('');
    try {
      const updated = await updateVariantStock(variantID, Number(quantity), item.version);
      if (!detail.alive.current) return;
      detail.replace(updated); setQuantity(''); setConfirm(false);
      notify.success('Đã cập nhật tồn kho biến thể.');
      onChanged();
    } catch (failure) {
      if (!detail.alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure);
      setError(message); setStale(true); setConfirm(false); notify.error(message, message, failure);
    } finally { detail.mutation.current = false; if (detail.alive.current) setBusy(false); }
  }
  return <>
    <AdminModal title="Chi tiết biến thể & tồn kho" busy={busy} onClose={onClose} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Đóng</button>
      <button className="dashboard-button" disabled={busy || detail.status === 'loading'} onClick={reload}>Tải lại chi tiết</button>
      {item && <button className="dashboard-button dashboard-button-primary" disabled={busy || stale || !changed || item.version == null} onClick={() => setConfirm(true)}>Cập nhật tồn kho</button>}
    </>}>
      {detail.status === 'loading' && <p className="dashboard-loading" role="status">Đang tải chi tiết biến thể…</p>}
      {detail.status === 'error' && <div className="admin-modal-error" role="alert"><p>{detail.error}</p><button className="dashboard-button" onClick={reload}>Thử lại</button></div>}
      {error && <p className="admin-modal-error" role="alert">{error}</p>}
      {item && <><section className="admin-detail-section"><h3>{item.productTitle}</h3><dl className="admin-detail-grid">
        <div><dt>Biến thể</dt><dd>{item.title}</dd></div>{item.sku && <div><dt>SKU</dt><dd>{item.sku}</dd></div>}
        <div><dt>Tồn kho hiện tại</dt><dd className="admin-stock-count">{number(item.stockQuantity)}</dd></div>
        {item.price != null && <div><dt>Đơn giá hiện tại</dt><dd>{currency(item.price)}</dd></div>}
        {item.available != null && <div><dt>Trạng thái bán biến thể</dt><dd>{item.available ? 'Cho phép bán' : 'Ngừng bán'}</dd></div>}
        {[item.option1, item.option2, item.option3].filter(Boolean).length > 0 && <div><dt>Phân loại</dt><dd>{[item.option1, item.option2, item.option3].filter(Boolean).join(' · ')}</dd></div>}
      </dl></section><section className="admin-detail-section"><h3>Điều chỉnh tồn kho</h3>
        <label className="admin-stock-label">Số lượng tồn kho mới<input type="number" inputMode="numeric" min="0" max="2147483647" step="1" aria-label="Số lượng tồn kho mới"
          value={quantity} placeholder={String(item.stockQuantity)} disabled={busy || stale || item.version == null} onChange={event => setQuantity(event.target.value)} /></label>
        {quantity && !valid && <p className="admin-modal-error" role="alert">Nhập số nguyên từ 0 đến 2.147.483.647.</p>}
        <p className="admin-modal-note">Đặt số lượng tồn kho sau khi kiểm kê. Thao tác chỉ cập nhật tồn kho của biến thể này.</p>
      </section></>}
    </AdminModal>
    {confirm && <ConfirmAdminAction title="Xác nhận cập nhật tồn kho" message={`Đặt tồn kho của ${item.sku || item.title} từ ${number(item.stockQuantity)} thành ${number(Number(quantity))}?`}
      busy={busy} onClose={() => setConfirm(false)} onConfirm={save} />}
  </>;
}
