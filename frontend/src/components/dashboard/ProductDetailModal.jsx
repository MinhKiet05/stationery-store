import { useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import useAdminDetail from './useAdminDetail';
import ProductFormModal from './ProductFormModal';
import ProductImage from './ProductImage';
import StockDetailModal from './StockDetailModal';
import { getAdminProduct, setAdminProductStatus, deleteAdminProduct, productState } from '../../services/adminProductApi';
import { currency, number, adminErrorMessage } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';

export default function ProductDetailModal({ productID, options, onClose, onChanged, onAccessDenied }) {
  const detail = useAdminDetail(productID, getAdminProduct, onAccessDenied);
  const [editor, setEditor] = useState(null), [stock, setStock] = useState(null), [image, setImage] = useState(null);
  const [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false), [childBusy, setChildBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false);
  const data = detail.data, p = data?.product, active = p?.isActive;
  function reload() { setError(''); setStale(false); detail.reload(); }
  async function changeStatus() {
    if (detail.mutation.current || !data || stale) return;
    detail.mutation.current = true; setBusy(true); setError('');
    try {
      const updated = confirm === 'delete' ? await deleteAdminProduct(productID, data.stateToken) : await setAdminProductStatus(productID, !p.available, data.stateToken);
      if (!detail.alive.current) return;
      setConfirm(null); notify.success(confirm === 'delete' ? 'Đã xóa mềm sản phẩm.' : 'Đã cập nhật trạng thái sản phẩm.'); onChanged();
      if (confirm === 'delete') onClose(); else detail.replace(updated);
    } catch (failure) {
      if (!detail.alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure); setError(message); setStale(true); setConfirm(null); notify.error(message, message);
    } finally { detail.mutation.current = false; if (detail.alive.current) setBusy(false); }
  }
  function saved(updated) {
    setChildBusy(false); setEditor(null); setError(''); setStale(false);
    if (updated?.product) detail.replace(updated); else detail.reload(); onChanged();
  }
  return <>
    <AdminModal title={`Chi tiết sản phẩm #${productID}`} busy={busy || childBusy} onClose={onClose} footer={<>
      <button className="dashboard-button" disabled={busy || childBusy} onClick={onClose}>Đóng</button>
      <button className="dashboard-button" disabled={busy || childBusy || detail.status === 'loading'} onClick={reload}>Tải lại chi tiết</button>
      {active && <>
        <button className="dashboard-button" disabled={busy || childBusy || stale} onClick={() => setEditor({ type: 'product' })}>Chỉnh sửa</button>
        <button className="dashboard-button" disabled={busy || childBusy || stale} onClick={() => setConfirm('status')}>{p.available ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}</button>
        <button className="dashboard-button admin-button-danger" disabled={busy || childBusy || stale} onClick={() => setConfirm('delete')}>Xóa mềm sản phẩm</button>
      </>}
    </>}>
      {detail.status === 'loading' && <p className="dashboard-loading" role="status">Đang tải chi tiết sản phẩm…</p>}
      {detail.status === 'error' && <div className="admin-modal-error" role="alert"><p>{detail.error}</p><button className="dashboard-button" onClick={reload}>Thử lại</button></div>}
      {error && <p className="admin-modal-error" role="alert">{error}</p>}
      {p && <>
        <section className="admin-detail-section product-detail-info"><h3>{p.title}</h3><dl className="admin-detail-grid">
          <div><dt>Trạng thái</dt><dd><span className={`dashboard-badge tone-${productState(p).tone}`}>{productState(p).label}</span></dd></div>
          <div><dt>Danh mục</dt><dd>{p.productTypeName || 'Chưa phân loại'}</dd></div><div><dt>Thương hiệu</dt><dd>{p.vendorName || 'Chưa có'}</dd></div>
          {p.handle && <div><dt>Handle</dt><dd>{p.handle}</dd></div>}
          <div><dt>Giá cơ bản sản phẩm</dt><dd>{currency(p.price)}</dd></div>{p.compareAtPrice != null && <div><dt>Giá gốc cơ bản</dt><dd>{currency(p.compareAtPrice)}</dd></div>}
          <div><dt>Tổng tồn kho tất cả biến thể</dt><dd>{number(data.variants.reduce((sum, v) => sum + (v.stockQuantity ?? 0), 0))}</dd></div>
          {data.tags.length > 0 && <div><dt>Tags</dt><dd>{data.tags.map(t => t.name).join(' · ')}</dd></div>}
        </dl>{p.description && <p className="product-description">{p.description.replace(/<[^>]*>/g, ' ')}</p>}</section>
        <section className="admin-detail-section"><h3>Hình ảnh sản phẩm</h3>{p.images.length ? <div className="product-gallery">{p.images.map((url, index) => <button key={`${index}-${url}`} aria-label={`Xem ảnh sản phẩm ${index + 1}`} onClick={() => setImage({ url, index })}><ProductImage src={url} alt={`${p.title} — ảnh ${index + 1}`} /></button>)}</div> : <p className="admin-modal-note">Chưa có ảnh sản phẩm.</p>}</section>
        <section className="admin-detail-section"><h3>Biến thể ({number(data.variants.length)})</h3>
          {active && <button className="dashboard-button" disabled={busy || stale || childBusy} onClick={() => setEditor({ type: 'variant' })}>Thêm biến thể</button>}
          <p className="admin-modal-note">Giá và tồn kho từng biến thể là dữ liệu độc lập. Cảnh báo khi biến thể đang bán tồn dưới {data.lowStockThreshold} đơn vị.</p>
          {data.variants.length ? <ul className="product-variants">{data.variants.map(v => <li key={v.variantID}>
            <strong>{v.title}</strong><div className="product-variant-info"><span>SKU: {v.sku || 'Chưa có'}</span><span>Giá bán: {currency(v.price)}</span>
              {v.compareAtPrice != null && <span>Giá gốc: {currency(v.compareAtPrice)}</span>}<span>Tồn: {number(v.stockQuantity)}</span><span>{v.available ? 'Cho phép bán' : 'Ngừng bán'}</span>
              {[v.option1, v.option2, v.option3].filter(Boolean).length > 0 && <span>{[v.option1, v.option2, v.option3].filter(Boolean).join(' · ')}</span>}
            </div>{active && <div className="product-variant-actions"><button className="dashboard-button" aria-label={`Chỉnh sửa biến thể #${v.variantID}`} disabled={busy || childBusy || stale} onClick={() => setEditor({ type: 'variant', variant: v })}>Chỉnh sửa biến thể</button>
              <button className="dashboard-button" aria-label={`Cập nhật tồn kho #${v.variantID}`} disabled={busy || childBusy || stale} onClick={() => setStock(v.variantID)}>Cập nhật tồn kho</button></div>}
          </li>)}</ul> : <p className="admin-modal-note">Chưa có biến thể. Thêm biến thể để sản phẩm có thể đặt hàng.</p>}
        </section>
      </>}
    </AdminModal>
    {editor && <ProductFormModal data={data} productID={productID} variant={editor.variant} variantMode={editor.type === 'variant'} options={options} onClose={() => { setEditor(null); setChildBusy(false); }} onBusy={setChildBusy} onSaved={saved} onAccessDenied={onAccessDenied} onReload={() => { setEditor(null); setChildBusy(false); reload(); }} />}
    {stock != null && <StockDetailModal variantID={stock} onClose={() => setStock(null)} onChanged={() => { detail.reload(); onChanged(); }} onAccessDenied={onAccessDenied} />}
    {image && <AdminModal title={`Ảnh sản phẩm ${image.index + 1}`} onClose={() => setImage(null)}><ProductImage expanded src={image.url} alt={p?.title || 'Ảnh sản phẩm'} /></AdminModal>}
    {confirm && <ConfirmAdminAction title={confirm === 'delete' ? 'Xóa mềm sản phẩm' : p?.available ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'} danger={confirm === 'delete'} busy={busy}
      message={confirm === 'delete' ? 'Sản phẩm sẽ ngừng hoạt động. Dữ liệu đơn hàng, giỏ hàng, đánh giá và biến thể được giữ lại.' : 'Xác nhận thay đổi trạng thái hiển thị sản phẩm?'} onClose={() => setConfirm(null)} onConfirm={changeStatus} />}
  </>;
}
