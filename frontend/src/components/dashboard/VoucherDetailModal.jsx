import { useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import VoucherFormModal from './VoucherFormModal';
import useAdminDetail from './useAdminDetail';
import { getAdminPromotion, updateAdminPromotion, promotionValues, promotionStatuses, promotionDate, promotionDiscount } from '../../services/adminPromotionApi';
import { currency, number, adminErrorMessage } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';

export default function VoucherDetailModal({ voucherID, onClose, onChanged, onAccessDenied }) {
  const detail = useAdminDetail(voucherID, getAdminPromotion, onAccessDenied);
  const [editing, setEditing] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false);
  const row = detail.data, status = promotionStatuses[row?.status];
  function reload() { setError(''); setStale(false); detail.reload(); }
  function saved(data) { detail.replace(data); setEditing(false); onChanged(); }
  async function toggle() {
    if (detail.mutation.current || stale) return;
    detail.mutation.current = true; setBusy(true); setError('');
    try {
      const saved = await updateAdminPromotion(voucherID, { ...promotionValues(row), isActive: !row.isActive, expectedState: row.stateToken });
      if (!detail.alive.current) return;
      detail.replace(saved); setConfirm(false); notify.success(saved.isActive ? 'Đã kích hoạt voucher.' : 'Đã vô hiệu hóa voucher.'); onChanged();
    } catch (failure) {
      if (!detail.alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure); setError(message); setStale(true); setConfirm(false); notify.error(message, message);
    } finally { detail.mutation.current = false; if (detail.alive.current) setBusy(false); }
  }
  return <>
    <AdminModal title={`Chi tiết voucher #${voucherID}`} busy={busy} onClose={onClose} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Đóng</button><button className="dashboard-button" disabled={busy || detail.status === 'loading'} onClick={reload}>Tải lại chi tiết</button>
      {row && <><button className="dashboard-button" disabled={busy || stale} onClick={() => setEditing(true)}>Chỉnh sửa</button><button className={`dashboard-button ${row.isActive ? 'admin-button-danger' : 'dashboard-button-primary'}`} disabled={busy || stale} onClick={() => setConfirm(true)}>{row.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}</button></>}
    </>}>
      {detail.status === 'loading' && <p role="status" className="dashboard-loading">Đang tải chi tiết voucher…</p>}
      {detail.status === 'error' && <div className="admin-modal-error" role="alert"><p>{detail.error}</p><button className="dashboard-button" onClick={reload}>Thử lại</button></div>}
      {error && <p className="admin-modal-error" role="alert">{error}</p>}
      {row && <>
        <section className="admin-detail-section"><h3>Thông tin voucher</h3><dl className="admin-detail-grid">
          <div><dt>Mã voucher</dt><dd><strong className="voucher-code">{row.code}</strong></dd></div><div><dt>Trạng thái hiện tại</dt><dd><span className={`dashboard-badge tone-${status?.tone || 'muted'}`}>{status?.label || 'Không xác định'}</span></dd></div>
          <div><dt>Loại giảm giá</dt><dd>{row.discountType === 'PERCENTAGE' ? 'Phần trăm' : 'Số tiền cố định'}</dd></div><div><dt>Giá trị giảm</dt><dd>{promotionDiscount(row)}</dd></div>
          <div><dt>Đơn hàng tối thiểu</dt><dd>{row.minOrderValue == null ? 'Không yêu cầu' : currency(row.minOrderValue)}</dd></div><div><dt>Cờ kích hoạt</dt><dd>{row.isActive ? 'Bật' : 'Tắt'}</dd></div>
        </dl></section>
        <section className="admin-detail-section"><h3>Hiệu lực & lượt dùng</h3><dl className="admin-detail-grid"><div><dt>Ngày bắt đầu</dt><dd>{promotionDate(row.startDate)}</dd></div><div><dt>Ngày kết thúc (bao gồm ngày này)</dt><dd>{promotionDate(row.endDate)}</dd></div>
          <div><dt>Lượt đã dùng</dt><dd>{number(row.usedCount || 0)}</dd></div><div><dt>Giới hạn lượt dùng</dt><dd>{row.usageLimit == null ? 'Không giới hạn' : number(row.usageLimit)}</dd></div></dl>
          <p className="admin-modal-note">Lượt dùng được hoàn lại khi hủy đơn hợp lệ. Vô hiệu hóa giữ lại voucher và lịch sử đơn hàng.</p>
          <p className="admin-modal-note">Mã chỉ áp dụng khi được bật, đang trong thời hạn và còn lượt sử dụng.</p>
        </section>
      </>}
    </AdminModal>
    {editing && row && <VoucherFormModal voucher={row} onClose={() => { setEditing(false); reload(); }} onSaved={saved} onAccessDenied={onAccessDenied} />}
    {confirm && <ConfirmAdminAction title={row.isActive ? 'Vô hiệu hóa voucher' : 'Kích hoạt voucher'} danger={row.isActive} busy={busy} onClose={() => setConfirm(false)} onConfirm={toggle}
      message={row.isActive ? `Ngừng cho phép dùng mã ${row.code}? Lịch sử đơn hàng được giữ nguyên.` : `Bật mã ${row.code}? Mã vẫn phải đáp ứng ngày hiệu lực và giới hạn lượt dùng khi checkout.`} />}
  </>;
}
