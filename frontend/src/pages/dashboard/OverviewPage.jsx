import { useState } from 'react';
import { queryClient, sessionScope } from '../../services/queryCache';
import { useOutletContext } from 'react-router-dom';
import { RefreshCw, Wallet, ShoppingBag, Users, Clock3, RotateCcw, PackageSearch, CalendarDays } from 'lucide-react';
import StatCard from '../../components/dashboard/StatCard';
import RevenueChart from '../../components/dashboard/RevenueChart';
import CategoryChart from '../../components/dashboard/CategoryChart';
import RecentOrders from '../../components/dashboard/RecentOrders';
import LowStockProducts from '../../components/dashboard/LowStockProducts';
import DashboardState from '../../components/dashboard/DashboardState';
import OrderDetailModal from '../../components/dashboard/OrderDetailModal';
import StockDetailModal from '../../components/dashboard/StockDetailModal';
import useDashboardResource from './useDashboardResource';
import { initialRange, statisticsPath, dashboardPath, currency, number } from '../../services/dashboardApi';

export default function OverviewPage() {
  const { admin } = useOutletContext();
  const [range, setRange] = useState(initialRange);
  const [draft, setDraft] = useState(range);
  const refreshData = () => { void queryClient.invalidateQueries({ predicate: q => q.queryKey[0] === 'session' && q.queryKey[1] === sessionScope() && q.queryKey[2] === 'admin' && /^\/api\/admin\/(statistics|dashboard)\//.test(q.queryKey[3]) }); };
  const [filterError, setFilterError] = useState('');
  function applyRange(event) {
    event.preventDefault();
    if (!draft.startDate || !draft.endDate || draft.startDate > draft.endDate || draft.endDate > '9998-12-31' || draft.startDate < '0001-01-01') {
      setFilterError('Vui lòng chọn khoảng thời gian hợp lệ.'); return;
    }
    setFilterError('');
    if (draft.startDate === range.startDate && draft.endDate === range.endDate) refreshData();
    else setRange({ ...draft });
  }
  const today = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full' }).format(new Date());
  return <>
    <div className="dashboard-welcome"><div><p className="dashboard-eyebrow">STATIONERY STORE · ADMINISTRATION</p>
      <h1>Tổng quan quản trị<span className="dashboard-title-dot">.</span></h1>
      <p>Chào mừng trở lại, <strong>{admin.fullName || admin.username}</strong>.<br />Theo dõi hoạt động cửa hàng trong một không gian.</p>
      <p className="dashboard-today"><CalendarDays size={15} />{today}</p></div>
      <form className="dashboard-filters" onSubmit={applyRange}><div className="dashboard-filter-dates">
        <label>Từ ngày<input aria-label="Từ ngày" type="date" min="0001-01-01" max="9998-12-31" value={draft.startDate} onChange={event => setDraft({ ...draft, startDate: event.target.value })} required /></label>
        <label>Đến ngày<input aria-label="Đến ngày" type="date" min="0001-01-01" max="9998-12-31" value={draft.endDate} onChange={event => setDraft({ ...draft, endDate: event.target.value })} required /></label></div>
        <div className="dashboard-filter-buttons"><button className="dashboard-button" type="submit">Áp dụng bộ lọc</button>
          <button className="dashboard-button dashboard-button-primary" type="button" onClick={() => refreshData()}><RefreshCw size={16} />Làm mới dữ liệu</button></div>
        {filterError && <p role="alert" className="dashboard-filter-error">{filterError}</p>}
      </form></div>
    <OverviewContent key={`${range.startDate}:${range.endDate}`} range={range} />
  </>;
}

function OverviewContent({ range }) {
  const { onAccessDenied } = useOutletContext();
  const [groupBy, setGroupBy] = useState('DAY');
  const [orderPage, setOrderPage] = useState(0);
  const [stockPage, setStockPage] = useState(0);
  const [modal, setModal] = useState(null);
  const overview = useDashboardResource(statisticsPath('overview', range), onAccessDenied);
  const revenue = useDashboardResource(statisticsPath('revenue', range, { groupBy }), onAccessDenied);
  const statuses = useDashboardResource(statisticsPath('orders', range), onAccessDenied);
  const orders = useDashboardResource(dashboardPath('orders', { ...range, page: orderPage, size: 6 }), onAccessDenied);
  const stock = useDashboardResource(dashboardPath('low-stock', { page: stockPage, size: 5 }), onAccessDenied);
  function refreshAfterChange() {
    setOrderPage(0); setStockPage(0);
    overview.retry(); revenue.retry(); statuses.retry(); orders.retry(); stock.retry();
  }
  return <>
    <DashboardState resource={overview}><div className="dashboard-kpi-grid">
      <StatCard label="Doanh thu trong kỳ" value={currency(overview.data?.totalRevenue)} description="Đơn đã giao · trước hoàn tiền" icon={Wallet} tone="orange" />
      <StatCard label="Đơn hàng trong kỳ" value={number(overview.data?.totalOrders)} description={`${number(overview.data?.successfulOrders)} đơn đã giao`} icon={ShoppingBag} />
      <StatCard label="Khách hàng mới" value={number(overview.data?.newCustomers)} description={`${number(overview.data?.totalCustomers)} khách hàng toàn hệ thống`} icon={Users} />
    </div></DashboardState>
    <div className="dashboard-operational-grid"><DashboardState resource={statuses}>
      <StatCard label="Chờ xác nhận" value={number(statuses.data?.statusCounts.PENDING)} description="Đơn đặt trong kỳ đang chờ xác nhận" icon={Clock3} tone="orange" />
      <StatCard label="Yêu cầu trả hàng" value={number(statuses.data?.returnRequestCounts.PENDING)} description="Yêu cầu tạo trong kỳ chưa xử lý" icon={RotateCcw} tone="red" />
    </DashboardState><DashboardState resource={stock}>
      <StatCard label="Tồn kho thấp" value={number(stock.data?.totalElements)} description="Biến thể dưới 10 · tồn kho hiện tại" icon={PackageSearch} tone="red" />
    </DashboardState></div>
    <div className="dashboard-charts"><RevenueChart resource={revenue} groupBy={groupBy} setGroupBy={setGroupBy} /><CategoryChart resource={statuses} /></div>
    <RecentOrders resource={orders} page={orderPage} setPage={setOrderPage} onView={id => setModal({ kind: 'order', id })} />
    <LowStockProducts resource={stock} page={stockPage} setPage={setStockPage} onView={id => setModal({ kind: 'stock', id })} />
    {modal?.kind === 'order' && <OrderDetailModal key={modal.id} orderID={modal.id} onClose={() => setModal(null)} onChanged={refreshAfterChange} onAccessDenied={onAccessDenied} />}
    {modal?.kind === 'stock' && <StockDetailModal key={modal.id} variantID={modal.id} onClose={() => setModal(null)} onChanged={refreshAfterChange} onAccessDenied={onAccessDenied} />}
  </>;
}
