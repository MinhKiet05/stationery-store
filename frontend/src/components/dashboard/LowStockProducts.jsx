import { Link } from 'react-router-dom';
import { Package, PackageSearch, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardState from './DashboardState';
import { number } from '../../services/dashboardApi';

export default function LowStockProducts({ resource, page, setPage, onView }) {
  const data = resource.data;
  return <section className="dashboard-panel dashboard-stock">
    <div className="dashboard-panel-heading"><div><h2><PackageSearch size={20} />Cảnh báo tồn kho thấp</h2><p>Biến thể có tồn kho dưới 10 · sản phẩm đang hoạt động</p></div>
      <Link className="dashboard-text-link" to="/dashboard/products">Quản lý tồn kho</Link></div>
    <DashboardState resource={resource} empty={resource.status === 'ready' && data?.content.length === 0} emptyMessage="Không có biến thể nào có tồn kho dưới 10.">
      <ul className="dashboard-stock-list">{data?.content.map(item => <li key={item.variantID}>
        <span className="dashboard-icon-tile tone-blue"><Package size={23} aria-hidden="true" /></span>
        <div className="dashboard-stock-product"><strong>{item.productTitle}</strong><span>{item.title}</span><small>SKU: {item.sku || 'Chưa có SKU'}</small></div>
        <span className={`dashboard-badge tone-${item.stockQuantity <= 0 ? 'red' : 'orange'}`}>{item.stockQuantity <= 0 ? 'Hết hàng' : `Còn ${number(item.stockQuantity)}`}</span>
        <button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết biến thể ${item.sku || item.variantID}`} onClick={() => onView(item.variantID)}>Xem chi tiết</button>
      </li>)}</ul>
      <div className="dashboard-pagination"><span>{number(data?.totalElements || 0)} biến thể · tồn kho hiện tại</span><div>
        <button className="dashboard-icon-button" aria-label="Trang tồn kho trước" disabled={page === 0 || resource.status !== 'ready'} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button>
        <span>{page + 1} / {data?.totalPages || 1}</span>
        <button className="dashboard-icon-button" aria-label="Trang tồn kho tiếp theo" disabled={!data || page + 1 >= data.totalPages || resource.status !== 'ready'} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
      </div></div>
    </DashboardState>
  </section>;
}
