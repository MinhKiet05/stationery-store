import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, Search, RotateCcw, ShoppingBag, Clock, Truck, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardPageIntro from '../../components/dashboard/DashboardPageIntro';
import DashboardListHeading from '../../components/dashboard/DashboardListHeading';
import StatCard from '../../components/dashboard/StatCard';
import DashboardState from '../../components/dashboard/DashboardState';
import OrderDetailModal from '../../components/dashboard/OrderDetailModal';
import useDashboardResource from './useDashboardResource';
import { ordersPath, orderStatisticsPath, exportAdminOrders } from '../../services/adminOrderApi';
import { number, currency, orderStatuses, storedDateTime } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import './OrdersPage.css';

const defaults = { search: '', status: '', paid: '', startDate: '', endDate: '', sort: 'NEWEST' };
export default function OrdersPage() {
  const { onAccessDenied } = useOutletContext();
  const [filters, setFilters] = useState(defaults), [search, setSearch] = useState(''), [dates, setDates] = useState({ startDate: '', endDate: '' }), [dateError, setDateError] = useState('');
  const [page, setPage] = useState(0), [selected, setSelected] = useState(null), [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);
  const list = useDashboardResource(ordersPath(filters, page), onAccessDenied), stats = useDashboardResource(orderStatisticsPath(filters), onAccessDenied);
  useEffect(() => {
    if (filters.search === search.trim()) return;
    const timer = setTimeout(() => { setFilters(current => ({ ...current, search: search.trim() })); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search, filters.search]);
  useEffect(() => () => exportRef.current?.abort(), []);
  useEffect(() => { if (list.status === 'ready' && page > 0 && list.data.content.length === 0) setPage(Math.max(0, list.data.totalPages - 1)); }, [list.status, list.data, page]);
  function change(key, value) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function reset() { setSearch(''); setDates({ startDate: '', endDate: '' }); setDateError(''); setFilters(defaults); setPage(0); }
  function applyDates(event) {
    event.preventDefault();
    if (dates.startDate && dates.endDate && dates.startDate > dates.endDate) { setDateError('Khoảng ngày không hợp lệ.'); return; }
    setDateError(''); setFilters(current => ({ ...current, ...dates })); setPage(0);
  }
  async function download() {
    if (exportRef.current) return;
    const controller = new AbortController(); exportRef.current = controller; setExporting(true);
    try {
      const { blob, filename } = await exportAdminOrders(filters, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify.success('Đã tải file Excel đơn hàng.');
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 404 ? 'Không có đơn hàng phù hợp để xuất.' : failure.status === 413 ? 'Có quá nhiều đơn hàng. Hãy thu hẹp bộ lọc trước khi xuất.' : 'Không thể xuất Excel. Vui lòng thử lại.';
      notify.error(message, message);
    } finally { if (!controller.signal.aborted) setExporting(false); exportRef.current = null; }
  }
  const summary = stats.data;
  return <div className="orders-page dashboard-management-page">
    <DashboardPageIntro title="Quản lý Đơn hàng & Vận chuyển" breadcrumb="Đơn hàng & Vận chuyển" description="Theo dõi và xử lý đơn hàng của khách hàng">
      <button className="dashboard-button" disabled={exporting} onClick={download}><Download size={17} />{exporting ? 'Đang xuất Excel…' : 'Xuất Excel'}</button>
    </DashboardPageIntro>
    <DashboardState resource={stats}><div className="orders-kpi-grid">
      <StatCard label="Tổng số đơn hàng" value={number(summary?.totalOrders)} description="Toàn bộ kết quả theo bộ lọc" icon={ShoppingBag} />
      <StatCard label="Chờ xác nhận" value={number(summary?.pendingOrders)} description="Đơn hàng đang chờ xác nhận" icon={Clock} tone="orange" />
      <StatCard label="Đang giao" value={number(summary?.shippedOrders)} description="Đơn đã bàn giao vận chuyển" icon={Truck} />
      <StatCard label="Đã giao" value={number(summary?.deliveredOrders)} description="Theo trạng thái giao hàng, độc lập thanh toán" icon={CheckCircle2} tone="green" />
    </div></DashboardState>
    <section className="dashboard-panel dashboard-management-filters orders-filters" aria-label="Bộ lọc đơn hàng"><div className="orders-toolbar">
      <label className="orders-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Tìm đơn hàng" placeholder="Tìm mã đơn hàng hoặc khách hàng…" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Sắp xếp<select aria-label="Sắp xếp đơn hàng" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="NEWEST">Mới nhất</option><option value="OLDEST">Cũ nhất</option></select></label>
      <label>Thanh toán<select aria-label="Lọc thanh toán" value={filters.paid} onChange={event => change('paid', event.target.value)}><option value="">Tất cả thanh toán</option><option value="true">Đã thanh toán</option><option value="false">Chưa thanh toán</option></select></label>
      <button className="dashboard-button" onClick={reset}><RotateCcw size={16} />Đặt lại</button>
    </div><div className="orders-status-filters" role="group" aria-label="Lọc trạng thái đơn hàng">
      <button type="button" className="orders-status-chip" aria-pressed={filters.status === ''} data-order-status="" onClick={() => change('status', '')}>Tất cả</button>
      {Object.entries(orderStatuses).map(([value, item]) => <button type="button" key={value} className="orders-status-chip" data-order-status={value} aria-pressed={filters.status === value} onClick={() => change('status', value)}>{item.label}</button>)}
    </div><form className="orders-date-filter" onSubmit={applyDates}>
      <label>Từ ngày<input aria-label="Ngày bắt đầu đơn hàng" type="date" min="0001-01-01" max="9998-12-31" value={dates.startDate} onChange={event => setDates(current => ({ ...current, startDate: event.target.value }))} /></label>
      <label>Đến ngày<input aria-label="Ngày kết thúc đơn hàng" type="date" min="0001-01-01" max="9998-12-31" value={dates.endDate} onChange={event => setDates(current => ({ ...current, endDate: event.target.value }))} /></label>
      <button className="dashboard-button" type="submit">Áp dụng ngày</button><p>Excel gồm toàn bộ kết quả theo bộ lọc, không chỉ trang đang xem.</p>
      {dateError && <p className="orders-date-error" role="alert">{dateError}</p>}
    </form></section>
    <section className="dashboard-panel orders-list-panel" aria-label="Danh sách đơn hàng">
      <DashboardListHeading title="Danh sách đơn hàng" resource={list} page={page} unit="đơn hàng" icon={ShoppingBag} />
      {list.status === 'loading' ? <div className="orders-skeleton" role="status" aria-label="Đang tải danh sách đơn hàng">{[1, 2, 3, 4, 5].map(n => <div key={n} />)}</div> :
        <DashboardState resource={list} empty={list.status === 'ready' && list.data.content.length === 0} emptyMessage="Không có đơn hàng phù hợp với bộ lọc.">
          <div className="dashboard-table-scroll" role="region" aria-label="Bảng đơn hàng" tabIndex={0}><table className="dashboard-table orders-table"><caption className="dashboard-sr-only">Các đơn hàng của khách hàng</caption><thead><tr>
            {['Mã đơn hàng', 'Khách hàng', 'Ngày đặt', 'Tổng tiền', 'Trạng thái', 'Thanh toán', 'Thao tác'].map(label => <th scope="col" key={label}>{label}</th>)}
          </tr></thead><tbody>{list.data?.content.map(row => <tr key={row.orderID}>
            <td><strong className="orders-request-code">ORD-{row.orderID}</strong></td>
            <td><strong>{row.customerName || row.username}</strong><small>@{row.username}</small></td><td><time dateTime={row.orderDate}>{storedDateTime(row.orderDate)}</time></td>
            <td className="orders-amount">{currency(row.totalAmount)}</td><td><span className={`dashboard-badge tone-${orderStatuses[row.status]?.tone || 'muted'}`}>{orderStatuses[row.status]?.label || 'Không xác định'}</span></td>
            <td><span className={`dashboard-badge tone-${row.isPaid === true ? 'green' : 'muted'}`}>{row.isPaid == null ? 'Chưa có thông tin' : row.isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}</span>{row.paymentMethod && <small>{row.paymentMethod}</small>}</td>
            <td><button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết đơn hàng #${row.orderID}`} onClick={() => setSelected(row.orderID)}>Xem chi tiết</button></td>
          </tr>)}</tbody></table></div>
        </DashboardState>}
      {list.status === 'ready' && list.data.totalElements > 0 && <div className="dashboard-pagination"><span>{number(list.data.totalElements)} đơn hàng · bộ lọc hiện tại</span><div>
        <button className="dashboard-icon-button" aria-label="Trang đơn hàng trước" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Trang {page + 1} / {Math.max(list.data.totalPages, 1)}</span>
        <button className="dashboard-icon-button" aria-label="Trang đơn hàng tiếp theo" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
      </div></div>}
    </section>
    {selected != null && <OrderDetailModal key={selected} orderID={selected} onClose={() => setSelected(null)} onChanged={() => { list.retry(); stats.retry(); }} onAccessDenied={onAccessDenied} />}
  </div>;
}
