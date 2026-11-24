import { ChartPie } from 'lucide-react';
import DashboardState from './DashboardState';
import { number, orderStatuses } from '../../services/dashboardApi';

const colors = ['#ba4b08', '#1b2b43', '#7289ae', '#329579', '#abb5c7', '#d6535a'];

/** Categorizes actual order statuses; category revenue is not available in the API. */
export default function CategoryChart({ resource }) {
  const data = Object.entries(resource.data?.statusCounts || {});
  const total = data.reduce((sum, [, count]) => sum + count, 0);
  let offset = 0;
  return <section className="dashboard-panel dashboard-distribution">
    <div className="dashboard-panel-heading"><div><h2><ChartPie size={20} />Phân bố đơn hàng</h2><p>Trạng thái trong khoảng thời gian đã chọn</p></div></div>
    <DashboardState resource={resource} empty={resource.status === 'ready' && total === 0} emptyMessage="Chưa có đơn hàng trong kỳ.">
      <div className="dashboard-donut"><svg viewBox="0 0 200 200" role="img" aria-label={`${number(total)} đơn hàng, phân bố theo trạng thái`}>
        {data.filter(([, count]) => count > 0).map(([status, count]) => {
          const percentage = count / total * 100;
          const start = offset; offset += percentage;
          return <circle key={status} cx="100" cy="100" r="77" fill="none" stroke={colors[Object.keys(orderStatuses).indexOf(status)] || colors[0]}
            strokeWidth="27" pathLength="100" strokeDasharray={`${percentage} ${100 - percentage}`} strokeDashoffset={-start} transform="rotate(-90 100 100)">
            <title>{orderStatuses[status]?.label || status}: {number(count)} đơn ({(percentage).toFixed(1)}%)</title></circle>;
        })}</svg><div className="dashboard-donut-center"><span>TỔNG ĐƠN</span><strong>{number(total)}</strong><small>Trong kỳ</small></div></div>
      <ul className="dashboard-distribution-list">{data.map(([status, count]) => <li key={status}><span><i className="dashboard-dot" style={{ background: colors[Object.keys(orderStatuses).indexOf(status)] || colors[0] }} />{orderStatuses[status]?.label || status}</span>
        <strong>{number(count)}<small>{total ? (count / total * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : 0}%</small></strong></li>)}</ul>
    </DashboardState>
  </section>;
}
