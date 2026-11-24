import ImportExcelModal from '../../components/dashboard/ImportExcelModal';
import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Upload, Download, Search, RotateCcw, ShoppingBag, CheckCircle2, EyeOff, TriangleAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardPageIntro from '../../components/dashboard/DashboardPageIntro';
import DashboardListHeading from '../../components/dashboard/DashboardListHeading';
import StatCard from '../../components/dashboard/StatCard';
import DashboardState from '../../components/dashboard/DashboardState';
import ProductDetailModal from '../../components/dashboard/ProductDetailModal';
import useDashboardResource from './useDashboardResource';
import { productsPath, productStatisticsPath, exportAdminProducts, productState } from '../../services/adminProductApi';
import { number, currency } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import './ProductsPage.css';
import ProductFormModal from '../../components/dashboard/ProductFormModal';
import ProductImage from '../../components/dashboard/ProductImage';

const defaults = { search: '', status: '', productTypeID: '', vendorID: '', lowStock: '', sort: 'ID_DESC' };
export default function ProductsPage() {
  const { onAccessDenied } = useOutletContext();
  const [filters, setFilters] = useState(defaults), [search, setSearch] = useState(''), [creating, setCreating] = useState(false);
  const [page, setPage] = useState(0), [selected, setSelected] = useState(null), [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const exportRef = useRef(null);
  const list = useDashboardResource(productsPath(filters, page), onAccessDenied), stats = useDashboardResource(productStatisticsPath(filters), onAccessDenied);
  useEffect(() => {
    if (filters.search === search.trim()) return;
    const timer = setTimeout(() => { setFilters(current => ({ ...current, search: search.trim() })); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search, filters.search]);
  useEffect(() => () => exportRef.current?.abort(), []);
  useEffect(() => { if (list.status === 'ready' && page > 0 && list.data.content.length === 0) setPage(Math.max(0, list.data.totalPages - 1)); }, [list.status, list.data, page]);
  function change(key, value) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function reset() { setSearch(''); setFilters(defaults); setPage(0); }
  async function download() {
    if (exportRef.current) return;
    const controller = new AbortController(); exportRef.current = controller; setExporting(true);
    try {
      const { blob, filename } = await exportAdminProducts(filters, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify.success('Đã tải file Excel sản phẩm.');
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 404 ? 'Không có sản phẩm phù hợp để xuất.' : failure.status === 413 ? 'Có quá nhiều sản phẩm. Hãy thu hẹp bộ lọc trước khi xuất.' : 'Không thể xuất Excel. Vui lòng thử lại.';
      notify.error(message, message);
    } finally { if (!controller.signal.aborted) setExporting(false); exportRef.current = null; }
  }
  const summary = stats.data;
  const options = useDashboardResource('/api/admin/products/options', onAccessDenied);
  return <div className="products-page dashboard-management-page">
    <DashboardPageIntro title="Quản lý sản phẩm & Tồn kho" breadcrumb="Sản phẩm & Tồn kho" description="Quản lý danh mục sản phẩm, giá bán và số lượng tồn kho">
      <button className="dashboard-button dashboard-button-accent" onClick={() => setCreating(true)}>+ Thêm sản phẩm</button>
      <button className="dashboard-button" onClick={() => setImporting(true)}><Upload size={17} />Import Excel</button>
      <button className="dashboard-button" disabled={exporting} onClick={download}><Download size={17} />{exporting ? 'Đang xuất Excel…' : 'Xuất Excel'}</button>
    </DashboardPageIntro>
    <DashboardState resource={stats}><div className="products-kpi-grid">
      <StatCard label="Tổng số sản phẩm" value={number(summary?.totalProducts)} description="Toàn bộ kết quả theo bộ lọc" icon={ShoppingBag} />
      <StatCard label="Đang kinh doanh" value={number(summary?.sellingProducts)} description="Sản phẩm hoạt động và cho phép bán" icon={CheckCircle2} tone="orange" />
      <StatCard label="Ngừng / Ẩn" value={number(summary?.hiddenProducts)} description="Đang ẩn hoặc đã xóa mềm" icon={EyeOff} />
      <StatCard label="Sắp hết hàng" value={number(summary?.lowStockProducts)} description={`Có biến thể đang bán tồn dưới ${summary?.lowStockThreshold ?? '…'} đơn vị`} icon={TriangleAlert} tone="red" />
    </div></DashboardState>
    <section className="dashboard-panel dashboard-management-filters products-filters" aria-label="Bộ lọc sản phẩm"><div className="products-toolbar">
      <label className="products-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Tìm sản phẩm" placeholder="Tìm tên sản phẩm hoặc SKU…" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Sắp xếp<select aria-label="Sắp xếp sản phẩm" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="ID_DESC">ID giảm dần</option><option value="ID_ASC">ID tăng dần</option></select></label>
      <label>Danh mục<select aria-label="Lọc danh mục sản phẩm" value={filters.productTypeID} onChange={event => change('productTypeID', event.target.value)}><option value="">Tất cả danh mục</option>{options.data?.categories.map(v => <option key={v.id} value={v.id}>{v.name}{v.active ? '' : ' (ngừng)'}</option>)}</select></label>
      <label>Thương hiệu<select aria-label="Lọc thương hiệu" value={filters.vendorID} onChange={event => change('vendorID', event.target.value)}><option value="">Tất cả thương hiệu</option>{options.data?.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <button className="dashboard-button" onClick={reset}><RotateCcw size={16} />Đặt lại</button>
    </div><div className="products-status-filters" role="group" aria-label="Lọc trạng thái sản phẩm">
      {[['', 'Tất cả'], ['SELLING', 'Đang kinh doanh'], ['HIDDEN', 'Đang ẩn'], ['DELETED', 'Đã xóa mềm']].map(([value, label]) => <button type="button" key={value} className="products-status-chip" data-product-status={value} aria-pressed={filters.status === value} onClick={() => change('status', value)}>{label}</button>)}
      <label className="products-low-filter"><input type="checkbox" checked={filters.lowStock === 'true'} onChange={event => change('lowStock', event.target.checked ? 'true' : '')} />Sắp hết hàng</label>
    </div><DashboardState resource={options} />
    <p className="products-filter-note">Tồn kho cộng từ tất cả biến thể. Cảnh báo áp dụng khi có biến thể đang bán tồn dưới {summary?.lowStockThreshold ?? '…'} đơn vị.</p></section>
    <section className="dashboard-panel products-list-panel" aria-label="Danh sách sản phẩm">
      <DashboardListHeading title="Danh sách sản phẩm" resource={list} page={page} unit="sản phẩm" icon={ShoppingBag} />
      {list.status === 'loading' ? <div className="products-skeleton" role="status" aria-label="Đang tải danh sách sản phẩm">{[1, 2, 3, 4, 5].map(n => <div key={n} />)}</div> :
        <DashboardState resource={list} empty={list.status === 'ready' && list.data.content.length === 0} emptyMessage="Không có sản phẩm phù hợp với bộ lọc.">
          <div className="dashboard-table-scroll" role="region" aria-label="Bảng sản phẩm" tabIndex={0}><table className="dashboard-table products-table"><caption className="dashboard-sr-only">Danh sách sản phẩm và tồn kho</caption><thead><tr>
            {['Sản phẩm', 'Danh mục / Thương hiệu', 'Giá biến thể', 'Tổng tồn kho', 'Trạng thái', 'Thao tác'].map(label => <th scope="col" key={label}>{label}</th>)}
          </tr></thead><tbody>{list.data?.content.map(row => <tr key={row.productID}>
            <td><div className="products-cell"><ProductImage src={row.imageUrl} alt={row.title} /><div><strong>{row.title}</strong><small>ID {row.productID} · {number(row.variantCount)} biến thể</small></div></div></td>
            <td>{row.productTypeName || 'Chưa phân loại'}<small>{row.vendorName || 'Chưa có thương hiệu'}</small></td>
            <td className="products-amount">{row.priceMin == null ? 'Chưa có giá' : row.priceMin === row.priceMax ? currency(row.priceMin) : <>{currency(row.priceMin)}<small>đến {currency(row.priceMax)}</small></>}{row.variantCount === 0 && <small>Giá cơ bản · chưa có biến thể</small>}</td>
            <td><strong>{number(row.totalStock)}</strong>{row.lowStockVariants > 0 && <small className="products-low-badge">{row.lowStockVariants} biến thể sắp hết</small>}</td>
            <td><span className={`dashboard-badge tone-${productState(row).tone}`}>{productState(row).label}</span></td>
            <td><button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết sản phẩm #${row.productID}`} onClick={() => setSelected(row.productID)}>Xem chi tiết</button></td>
          </tr>)}</tbody></table></div>
        </DashboardState>}
      {list.status === 'ready' && list.data.totalElements > 0 && <div className="dashboard-pagination"><span>{number(list.data.totalElements)} sản phẩm · bộ lọc hiện tại</span><div>
        <button className="dashboard-icon-button" aria-label="Trang sản phẩm trước" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Trang {page + 1} / {Math.max(list.data.totalPages, 1)}</span>
        <button className="dashboard-icon-button" aria-label="Trang sản phẩm tiếp theo" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
      </div></div>}
    </section>
    {importing && <ImportExcelModal kind="products" onClose={() => setImporting(false)} onChanged={() => { list.retry(); stats.retry(); }} onAccessDenied={onAccessDenied} />}
    {selected != null && <ProductDetailModal key={selected} productID={selected} onClose={() => setSelected(null)} onChanged={() => { list.retry(); stats.retry(); }} onAccessDenied={onAccessDenied} options={options} />}
    {creating && <ProductFormModal options={options} onClose={() => setCreating(false)} onAccessDenied={onAccessDenied} onSaved={data => { setCreating(false); setSelected(data.product.productID); list.retry(); stats.retry(); }} />}
  </div>;
}
