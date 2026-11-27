import { useEffect, useRef, useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import DashboardState from './DashboardState';
import { saveAdminProduct, saveAdminVariant, productImage } from '../../services/adminProductApi';
import { notify } from '../../utils/notifications';

const money = value => value === '' ? null : Number(value);
export default function ProductFormModal({ data, productID, variant, variantMode = false, options, onClose, onSaved, onAccessDenied, onBusy = () => {}, onReload }) {
  const original = variantMode ? variant : data?.product;
  const [form, setForm] = useState(() => ({ title: original?.title || '', handle: original?.handle || '', description: original?.description || '',
    price: String(original?.price ?? ''), compareAtPrice: String(original?.compareAtPrice ?? ''), available: original ? original.available === true : true,
    vendorID: original?.vendorID || '', productTypeID: original?.productTypeID || '', images: original?.images?.join('\n') || '',
    tagIDs: data?.tags.map(t => t.id) || [], sku: variant?.sku || '', stockQuantity: '0', option1: variant?.option1 || '', option2: variant?.option2 || '', option3: variant?.option3 || '' }));
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false);
  const mutation = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const title = variantMode ? variant ? 'Chỉnh sửa biến thể' : 'Thêm biến thể' : data ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm';
  function submit(event) {
    event.preventDefault();
    if (busy || stale) return;
    if (!variantMode && form.images.split(/\r?\n/).map(s => s.trim()).filter(Boolean).some(s => !productImage(s))) { setError('Ảnh phải là URL HTTP(S) hợp lệ.'); return; }
    setError(''); setConfirm(true);
  }
  async function save() {
    if (mutation.current || stale) return;
    mutation.current = true; setBusy(true); onBusy(true); setError('');
    try {
      const payload = variantMode ? { productID, title: form.title.trim(), sku: form.sku.trim() || null, available: form.available, price: money(form.price), compareAtPrice: money(form.compareAtPrice),
        option1: form.option1 || null, option2: form.option2 || null, option3: form.option3 || null, stockQuantity: variant ? variant.stockQuantity : Number(form.stockQuantity) } :
        { title: form.title.trim(), handle: form.handle.trim() || null, description: form.description || null, price: money(form.price), priceMin: original?.priceMin ?? null, priceMax: original?.priceMax ?? null,
          compareAtPrice: money(form.compareAtPrice), available: form.available, vendorID: form.vendorID ? Number(form.vendorID) : null, productTypeID: form.productTypeID ? Number(form.productTypeID) : null,
          images: form.images.split(/\r?\n/).map(s => s.trim()).filter(Boolean), tagIDs: form.tagIDs };
      const updated = variantMode ? await saveAdminVariant(productID, variant?.variantID, payload, variant?.version) : await saveAdminProduct(data?.product.productID, payload, data?.stateToken);
      if (!alive.current) return;
      notify.success('Đã lưu dữ liệu sản phẩm.'); onSaved(updated);
    } catch (failure) {
      if (!alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 409 ? 'Dữ liệu đã thay đổi hoặc mã bị trùng. Hãy tải lại để kiểm tra.' : failure.status === 400 ? 'Dữ liệu không hợp lệ. Kiểm tra tên, giá, SKU, danh mục và ảnh.' : 'Không thể lưu dữ liệu. Hãy tải lại để kiểm tra kết quả trước khi thử lại.';
      setError(message); setConfirm(false); setStale(![400].includes(failure.status)); notify.error(message, message, failure);
    } finally { mutation.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  }
  const field = (key, label, extra = {}) => <label>{label}<input aria-label={label} value={form[key]} onChange={event => change(key, event.target.value)} {...extra} /></label>;
  return <>
    <AdminModal title={title} busy={busy} onClose={onClose} footer={<>
      <button className="dashboard-button" disabled={busy} onClick={onClose}>Hủy</button>
      {stale && onReload && <button className="dashboard-button" onClick={onReload}>Tải lại dữ liệu</button>}
      <button form="admin-product-form" type="submit" className="dashboard-button dashboard-button-primary" disabled={busy || stale || (!variantMode && options.status !== 'ready')}>Lưu dữ liệu</button>
    </>}>
      {error && <p className="admin-modal-error" role="alert">{error}</p>}
      {!variantMode && <DashboardState resource={options} />}
      <form id="admin-product-form" className="product-form" onSubmit={submit}>
        {field('title', variantMode ? 'Tên biến thể' : 'Tên sản phẩm', { required: true, maxLength: 200, pattern: '.*\\S.*' })}
        {field('price', variantMode ? 'Giá bán biến thể' : 'Giá cơ bản sản phẩm', { required: true, type: 'number', min: 0, max: 9999999999.99, step: '0.01' })}
        {field('compareAtPrice', 'Giá gốc', { type: 'number', min: 0, max: 9999999999.99, step: '0.01' })}
        <label className="product-checkbox"><input type="checkbox" checked={form.available} onChange={event => change('available', event.target.checked)} />Cho phép bán</label>
        {variantMode ? <>
          {field('sku', 'SKU', { maxLength: 100 })}
          {!variant && field('stockQuantity', 'Tồn kho ban đầu', { required: true, type: 'number', min: 0, max: 2147483647, step: 1 })}
          {['option1', 'option2', 'option3'].map((key, index) => <div key={key}>{field(key, `Thuộc tính ${index + 1}`, { maxLength: 255 })}</div>)}
          {variant && <p className="product-form-wide product-form-note">Sửa biến thể giữ nguyên tồn kho. Dùng “Cập nhật tồn kho” để điều chỉnh sau kiểm kê.</p>}
        </> : <>
          {field('handle', 'Handle sản phẩm', { maxLength: 255 })}
          <label>Danh mục<select aria-label="Danh mục sản phẩm" value={form.productTypeID} onChange={event => change('productTypeID', event.target.value)}><option value="">Chưa phân loại</option>{options.data?.categories.map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? '' : ' (ngừng)'}</option>)}</select></label>
          <label>Thương hiệu<select aria-label="Thương hiệu sản phẩm" value={form.vendorID} onChange={event => change('vendorID', event.target.value)}><option value="">Chưa có thương hiệu</option>{options.data?.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
          <label className="product-form-wide">Mô tả<textarea aria-label="Mô tả sản phẩm" value={form.description} onChange={event => change('description', event.target.value)} /></label>
          <label className="product-form-wide">Ảnh sản phẩm — mỗi dòng một URL, tối đa 20 ảnh<textarea aria-label="URL ảnh sản phẩm" value={form.images} onChange={event => change('images', event.target.value)} /></label>
          <fieldset className="product-form-wide product-tags"><legend>Tags</legend>{options.data?.tags.map(tag => <label className="product-checkbox" key={tag.id}><input type="checkbox" checked={form.tagIDs.includes(tag.id)} onChange={event => change('tagIDs', event.target.checked ? [...form.tagIDs, tag.id] : form.tagIDs.filter(id => id !== tag.id))} />{tag.name}</label>)}</fieldset>
          <p className="product-form-wide product-form-note">Giá và tồn kho từng biến thể được quản lý trong chi tiết. Sau khi tạo sản phẩm, thêm biến thể để có thể đặt hàng.</p>
        </>}
      </form>
    </AdminModal>
    {confirm && <ConfirmAdminAction title={title} message="Xác nhận lưu những thay đổi đã nhập?" busy={busy} onClose={() => setConfirm(false)} onConfirm={save} />}
  </>;
}
