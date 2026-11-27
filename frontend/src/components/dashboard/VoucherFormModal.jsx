import { useEffect, useId, useRef, useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import { createAdminPromotion, updateAdminPromotion, promotionValues } from '../../services/adminPromotionApi';
import { adminErrorMessage } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';

export default function VoucherFormModal({ voucher, onClose, onSaved, onAccessDenied }) {
  const id = useId(), alive = useRef(true), mutation = useRef(false);
  const [values, setValues] = useState(voucher ? promotionValues(voucher) : { code: '', discountType: 'PERCENTAGE', discountValue: '', minOrderValue: '', startDate: '', endDate: '', usageLimit: '', isActive: true });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false), [confirm, setConfirm] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function change(key, value) { setValues(current => ({ ...current, [key]: value })); setError(''); }
  function validate(event) {
    event.preventDefault();
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(values.code.trim())) { setError('Mã gồm 1–50 chữ cái, số, dấu gạch ngang hoặc gạch dưới.'); return; }
    if (values.discountType === 'PERCENTAGE' && Number(values.discountValue) > 100) { setError('Phần trăm giảm phải lớn hơn 0 và không quá 100.'); return; }
    if (values.startDate && values.endDate && values.startDate > values.endDate) { setError('Ngày kết thúc phải từ ngày bắt đầu trở đi.'); return; }
    if (voucher && values.usageLimit !== '' && values.usageLimit != null && Number(values.usageLimit) < (voucher.usedCount || 0)) { setError('Giới hạn không được nhỏ hơn số lượt đã dùng.'); return; }
    setError(''); if (voucher) setConfirm(true); else save();
  }
  async function save() {
    if (mutation.current || stale) return;
    mutation.current = true; setBusy(true); setError('');
    const nullable = value => value === '' || value == null ? null : value;
    const body = { ...values, code: values.code.trim().toUpperCase(), discountValue: Number(values.discountValue),
      minOrderValue: nullable(values.minOrderValue) == null ? null : Number(values.minOrderValue),
      usageLimit: nullable(values.usageLimit) == null ? null : Number(values.usageLimit), startDate: nullable(values.startDate), endDate: nullable(values.endDate),
      ...(voucher ? { expectedState: voucher.stateToken } : {}) };
    try {
      const saved = voucher ? await updateAdminPromotion(voucher.couponID, body) : await createAdminPromotion(body);
      if (!alive.current) return;
      notify.success(voucher ? 'Đã cập nhật voucher.' : 'Đã tạo mã giảm giá.'); onSaved(saved);
    } catch (failure) {
      if (!alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 409 ? (voucher ? 'Dữ liệu đã thay đổi, mã bị trùng hoặc giới hạn lượt dùng không còn hợp lệ. Đóng form và tải lại chi tiết trước khi sửa.' : 'Mã giảm giá đã tồn tại. Vui lòng chọn mã khác.') : adminErrorMessage(failure);
      setError(message); setConfirm(false); if (voucher && failure.status !== 400) setStale(true); notify.error(message, message, failure);
    } finally { mutation.current = false; if (alive.current) setBusy(false); }
  }
  return <>
    <AdminModal title={voucher ? `Chỉnh sửa voucher ${voucher.code}` : 'Tạo mã giảm giá'} onClose={onClose} busy={busy} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Hủy</button><button className="dashboard-button dashboard-button-primary" type="submit" form={id} disabled={busy || stale}>{busy ? 'Đang lưu…' : 'Lưu voucher'}</button>
    </>}>
      <form id={id} className="voucher-form" onSubmit={validate}>
        {error && <p className="admin-modal-error voucher-form-wide" role="alert">{error}</p>}
        <fieldset className="voucher-form-section"><legend>Thông tin & mức giảm</legend><div className="voucher-form-fields">
        <label>Mã voucher<input name="code" aria-label="Mã voucher" value={values.code} maxLength={50} required pattern="[A-Za-z0-9_\-]+" disabled={busy || stale} onChange={e => change('code', e.target.value)} /></label>
        <label>Loại giảm giá<select name="discountType" aria-label="Loại giảm giá" value={values.discountType} disabled={busy || stale} onChange={e => change('discountType', e.target.value)}><option value="PERCENTAGE">Phần trăm</option><option value="FIXED_AMOUNT">Số tiền cố định</option></select></label>
        <label>Giá trị giảm ({values.discountType === 'PERCENTAGE' ? '%' : 'VND'})<input name="discountValue" aria-label="Giá trị giảm" type="number" required min="0.01" max={values.discountType === 'PERCENTAGE' ? 100 : '9999999999.99'} step="0.01" value={values.discountValue} disabled={busy || stale} onChange={e => change('discountValue', e.target.value)} /></label>
        <label>Đơn hàng tối thiểu (VND)<input name="minOrderValue" aria-label="Đơn hàng tối thiểu" type="number" min="0" max="9999999999.99" step="0.01" value={values.minOrderValue ?? ''} disabled={busy || stale} onChange={e => change('minOrderValue', e.target.value)} /></label>
        </div></fieldset>
        <fieldset className="voucher-form-section"><legend>Hiệu lực & giới hạn sử dụng</legend><div className="voucher-form-fields">
        <label>Ngày bắt đầu<input name="startDate" aria-label="Ngày bắt đầu voucher" type="date" min="0001-01-01" max="9999-12-31" value={values.startDate ?? ''} disabled={busy || stale} onChange={e => change('startDate', e.target.value)} /></label>
        <label>Ngày kết thúc<input name="endDate" aria-label="Ngày kết thúc voucher" type="date" min={values.startDate || '0001-01-01'} max="9999-12-31" value={values.endDate ?? ''} disabled={busy || stale} onChange={e => change('endDate', e.target.value)} /></label>
        <label>Giới hạn lượt dùng<input name="usageLimit" aria-label="Giới hạn lượt dùng" type="number" min={Math.max(1, voucher?.usedCount || 0)} max="2147483647" step="1" value={values.usageLimit ?? ''} disabled={busy || stale} onChange={e => change('usageLimit', e.target.value)} /></label>
        <label className="voucher-active"><input type="checkbox" checked={values.isActive} disabled={busy || stale} onChange={e => change('isActive', e.target.checked)} />Kích hoạt voucher</label>
        </div></fieldset>
        <p className="admin-modal-note voucher-form-wide">Để trống ngày, giá trị tối thiểu hoặc giới hạn lượt dùng nếu không cần ràng buộc. Ngày kết thúc bao gồm cả ngày đó theo ngày máy chủ. Không thể sửa số lượt đã dùng.</p>
      </form>
    </AdminModal>
    {confirm && <ConfirmAdminAction title="Lưu thay đổi voucher" message="Áp dụng điều kiện mới cho các lần dùng tiếp theo? Giá trị giảm đã lưu trong đơn hàng trước đây được giữ nguyên." busy={busy} onClose={() => setConfirm(false)} onConfirm={save} />}
  </>;
}
