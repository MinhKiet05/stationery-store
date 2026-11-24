import { useEffect, useId, useRef, useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import { receiveAdminReturn, restockAdminReturn } from '../../services/adminReturnApi';
import { adminErrorMessage, number } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';

export default function ReturnInventoryModal({ mode, data, onClose, onSaved, onConflict, onAccessDenied }) {
  const receiving = mode === 'receive', id = useId(), alive = useRef(true), mutation = useRef(false);
  const [values, setValues] = useState(() => Object.fromEntries(data.items.map(item => [item.returnItemID, { received: '', good: '', damaged: '' }])));
  const [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [uncertain, setUncertain] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const receipts = new Map((data.receipt?.items || []).map(item => [item.returnItemID, item]));
  const totalGood = data.items.reduce((sum, item) => { const value = Number(values[item.returnItemID].good), limit = receipts.get(item.returnItemID)?.receivedQuantity;
    return sum + (Number.isSafeInteger(value) && value >= 0 && value <= limit ? value : 0); }, 0);
  function change(itemID, field, value) { setValues(current => ({ ...current, [itemID]: { ...current[itemID], [field]: value } })); setError(''); }
  function validate(event) {
    event.preventDefault();
    let received = 0;
    for (const item of data.items) {
      const value = values[item.returnItemID], limit = receiving ? item.quantity : receipts.get(item.returnItemID)?.receivedQuantity;
      const fields = receiving ? ['received'] : ['good', 'damaged'];
      if (limit == null || fields.some(key => value[key] === '' || !Number.isSafeInteger(Number(value[key])) || Number(value[key]) < 0 || Number(value[key]) > limit)) { setError('Nhập số nguyên không âm trong giới hạn của từng mục trả hàng.'); return; }
      if (receiving) received += Number(value.received);
      else if (Number(value.good) + Number(value.damaged) !== limit) { setError('Phải phân loại đầy đủ số lượng thực nhận thành hàng tốt và hàng hỏng.'); return; }
    }
    if (receiving && received === 0) { setError('Phải có ít nhất một sản phẩm thực nhận.'); return; }
    setError(''); setConfirm(true);
  }
  async function save() {
    if (mutation.current || uncertain) return;
    mutation.current = true; setBusy(true); setError('');
    const items = data.items.map(item => ({ returnItemID: item.returnItemID, ...(receiving ? { receivedQuantity: Number(values[item.returnItemID].received) }
      : { goodQuantity: Number(values[item.returnItemID].good), damagedQuantity: Number(values[item.returnItemID].damaged) }) }));
    try {
      const saved = receiving ? await receiveAdminReturn(data.request.returnID, items) : await restockAdminReturn(data.request.returnID, items, note);
      if (!alive.current) return;
      notify.success(receiving ? 'Đã ghi nhận hàng trả về. Tồn kho chưa thay đổi.' : 'Đã lưu kiểm tra và nhập lại kho số lượng hàng đủ điều kiện.'); onSaved(saved);
    } catch (failure) {
      if (!alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure); notify.error(message, message); setConfirm(false);
      if (failure.status === 409) { onConflict(message); return; }
      setError(message); if (failure.status !== 400) setUncertain(true);
    } finally { mutation.current = false; if (alive.current) setBusy(false); }
  }
  return <>
    <AdminModal title={receiving ? 'Xác nhận đã nhận hàng' : 'Kiểm tra & nhập lại kho'} busy={busy} onClose={onClose} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Hủy</button><button className="dashboard-button dashboard-button-primary" type="submit" form={id} disabled={busy || uncertain}>{busy ? 'Đang xử lý…' : receiving ? 'Xác nhận đã nhận hàng' : 'Xác nhận nhập kho'}</button>
    </>}>
      <form id={id} className="return-inventory-form" onSubmit={validate}>
        <p className="returns-business-note">{receiving ? 'Chỉ xác nhận khi hàng thực tế đã về. Mỗi yêu cầu nhận và kiểm tra một lần; không bổ sung đợt nhận sau. Bước này chưa cộng tồn kho.' : 'Chỉ hàng tốt được nhập lại kho. Phải phân loại hết số lượng thực nhận. Kết quả đã hoàn tất không thể sửa hoặc nhập lại lần nữa.'}</p>
        {error && <p className="admin-modal-error" role="alert">{error}{uncertain && ' Đóng form và tải lại chi tiết để kiểm tra kết quả trước khi tiếp tục.'}</p>}
        {data.items.map(item => <fieldset key={item.returnItemID} className="return-inventory-item"><legend>{item.productTitle}</legend><div className="return-inventory-product">
          {item.imageUrl && <img src={item.imageUrl} alt="" />}<div><strong>{item.variantTitle}</strong>{item.sku && <small>SKU: {item.sku}</small>}<p>Số lượng yêu cầu trả: {number(item.quantity)}</p>
            {!receiving && <p>Thực nhận: {number(receipts.get(item.returnItemID)?.receivedQuantity)}</p>}</div></div>
          <div className="return-inventory-fields">{receiving ? <label>Số lượng thực nhận<input aria-label={`Thực nhận mục ${item.returnItemID}`} type="number" min="0" max={item.quantity} step="1" required value={values[item.returnItemID].received} disabled={busy || uncertain} onChange={event => change(item.returnItemID, 'received', event.target.value)} /></label> : <>
            <label>Hàng tốt, có thể bán tiếp<input aria-label={`Hàng tốt mục ${item.returnItemID}`} type="number" min="0" max={receipts.get(item.returnItemID)?.receivedQuantity} step="1" required value={values[item.returnItemID].good} disabled={busy || uncertain} onChange={event => change(item.returnItemID, 'good', event.target.value)} /></label>
            <label>Hàng hỏng, không nhập kho<input aria-label={`Hàng hỏng mục ${item.returnItemID}`} type="number" min="0" max={receipts.get(item.returnItemID)?.receivedQuantity} step="1" required value={values[item.returnItemID].damaged} disabled={busy || uncertain} onChange={event => change(item.returnItemID, 'damaged', event.target.value)} /></label>
          </>}</div>
        </fieldset>)}
        {!receiving && <><p className="return-inventory-preview" role="status">Số lượng sẽ nhập lại tồn kho: <strong>+{number(totalGood)}</strong></p><label className="returns-note-label">Ghi chú kiểm tra<textarea aria-label="Ghi chú kiểm tra hàng trả" value={note} maxLength={1000} rows={3} disabled={busy || uncertain} onChange={event => setNote(event.target.value)} /></label></>}
      </form>
    </AdminModal>
    {confirm && <ConfirmAdminAction title={receiving ? 'Xác nhận số lượng thực nhận' : 'Xác nhận nhập kho hàng trả'} busy={busy} onClose={() => setConfirm(false)} onConfirm={save}
      message={receiving ? 'Lưu số lượng hàng thực tế đã nhận cho toàn bộ yêu cầu? Số lượng này không thể chỉnh sửa sau khi xác nhận.' : `Nhập lại kho +${number(totalGood)} sản phẩm còn tốt và lưu kết quả kiểm tra? Hàng hỏng không được cộng tồn kho. Thao tác không thực hiện hoàn tiền.`} />}
  </>;
}
