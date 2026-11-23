import { Link } from 'react-router-dom';
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardState from './DashboardState';
import { currency, number, orderStatuses } from '../../services/dashboardApi';

function dateLabel(value) {
  if (!value) return '—';
  const [date, time] = value.split('T');
  return `${date.split('-').reverse().join('/')} · ${time?.slice(0, 5) || ''}`;
}

export default function RecentOrders({ resource, page, setPage, onView }) {
  const data = resource.data;
  return <section className="dashboard-panel dashboard-orders">
    <div className="dashboard-panel-heading"><div><h2><ClipboardList size={20} />Đơn hàng gần đây</h2><p>Các đơn trong kỳ · mới nhất trước</p></div>
      <Link className="dashboard-text-link" to="/dashboard/orders">Quản lý đơn hàng</Link></div>
    <DashboardState resource={resource} empty={resource.status === 'ready' && data?.content.length === 0} emptyMessage="Chưa có đơn hàng trong khoảng thời gian này.">
      <div className="dashboard-table-scroll"><table className="dashboard-table"><caption className="dashboard-sr-only">Danh sách đơn hàng gần đây</caption>
        <thead><tr><th scope="col">Mã đơn</th><th scope="col">Thời gian đặt</th><th scope="col">Khách hàng</th><th scope="col">Thanh toán</th><th scope="col">Tổng tiền</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
        <tbody>{data?.content.map(order => { const status = orderStatuses[order.status]; return <tr key={order.orderID}>
          <td><strong>#ST-{order.orderID}</strong></td><td className="dashboard-order-date">{dateLabel(order.orderDate)}</td>
          <td><span className="dashboard-customer"><span className="dashboard-customer-avatar">{(order.customerName || order.username || '?').slice(0, 1).toUpperCase()}</span><span><strong>{order.customerName || order.username}</strong><small>@{order.username}</small></span></span></td>
          <td><span className={`dashboard-badge tone-${order.isPaid ? 'green' : 'orange'}`}>{order.isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}</span><small className="dashboard-payment-method">{order.paymentMethod}</small></td>
          <td className="dashboard-money">{currency(order.totalAmount)}</td><td><span className={`dashboard-badge tone-${status?.tone || 'muted'}`}>{status?.label || order.status}</span></td>
          <td><button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết đơn #ST-${order.orderID}`} onClick={() => onView(order.orderID)}>Xem chi tiết</button></td>
        </tr>; })}</tbody></table></div>
      <div className="dashboard-pagination"><span>{number(data?.totalElements || 0)} đơn hàng</span><div>
        <button className="dashboard-icon-button" aria-label="Trang đơn hàng trước" disabled={page === 0 || resource.status !== 'ready'} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button>
        <span>Trang {page + 1} / {data?.totalPages || 1}</span>
        <button className="dashboard-icon-button" aria-label="Trang đơn hàng tiếp theo" disabled={!data || page + 1 >= data.totalPages || resource.status !== 'ready'} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
      </div></div>
    </DashboardState>
  </section>;
}
