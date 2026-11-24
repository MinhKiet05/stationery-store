import { useState } from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import DashboardState from './DashboardState';
import { currency, number } from '../../services/dashboardApi';

export default function RevenueChart({ resource, groupBy, setGroupBy }) {
  const [selected, setSelected] = useState(null);
  const periods = resource.data?.periods || [];
  const max = Math.max(...periods.map(item => Number(item.totalRevenue)), 1);
  const top = Math.ceil(max / 4) * 4;
  const plotWidth = 660, plotHeight = 240, left = 90, baseline = 280;
  const step = plotWidth / Math.max(periods.length, 1);
  const width = Math.min(step * .5, 34);
  const periodLabel = value => groupBy === 'YEAR' ? value.slice(0, 4) : groupBy === 'MONTH'
    ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : `${value.slice(8, 10)}/${value.slice(5, 7)}`;
  return <section className="dashboard-panel dashboard-revenue">
    <div className="dashboard-panel-heading"><div><h2><ChartNoAxesCombined size={20} />Doanh thu theo thời gian</h2><p>Đơn đã giao · trước hoàn tiền</p></div>
      <label className="dashboard-chart-select">Nhóm theo<select value={groupBy} onChange={event => { setSelected(null); setGroupBy(event.target.value); }}>
        <option value="DAY">Ngày</option><option value="MONTH">Tháng</option><option value="YEAR">Năm</option></select></label></div>
    <DashboardState resource={resource} empty={resource.status === 'ready' && periods.length === 0}>
      <div className="dashboard-chart-summary"><span>{selected ? periodLabel(selected.periodStart) : 'Doanh thu trong kỳ'}</span>
        <strong>{currency(selected ? selected.totalRevenue : resource.data?.totalRevenue)}</strong></div>
      <svg className="dashboard-bar-chart" viewBox="0 0 780 330" role="img" aria-label="Biểu đồ doanh thu. Di chuyển đến từng cột để xem số tiền.">
        {[0, 1, 2, 3, 4].map(index => {
          const value = top * index / 4, y = baseline - plotHeight * index / 4;
          return <g key={index}><line x1={left} x2={left + plotWidth} y1={y} y2={y} className="dashboard-grid-line" />
            <text x={left - 12} y={y + 4} textAnchor="end">{new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value)}</text></g>;
        })}
        {periods.map((item, index) => {
          const height = Number(item.totalRevenue) / top * plotHeight;
          const x = left + step * (index + .5);
          const label = `${periodLabel(item.periodStart)}: ${currency(item.totalRevenue)}, ${number(item.orderCount)} đơn đã giao`;
          return <g key={item.periodStart}><rect x={x - width / 2} y={baseline - Math.max(height, 2)} width={width} height={Math.max(height, 2)} rx={3}
            className={index === periods.length - 1 ? 'dashboard-bar-current' : 'dashboard-bar'} tabIndex={0} aria-label={label}
            onMouseEnter={() => setSelected(item)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(item)} onBlur={() => setSelected(null)}>
            <title>{label}</title></rect>
            {(index % Math.max(1, Math.ceil(periods.length / 10)) === 0 || index === periods.length - 1)
              && <text x={x} y={baseline + 26} textAnchor="middle">{periodLabel(item.periodStart)}</text>}</g>;
        })}
      </svg>
      <div className="dashboard-chart-legend"><span><i className="dashboard-dot navy" />Doanh thu thực tế (VND)</span><span><i className="dashboard-dot orange" />Kỳ gần nhất có giao dịch</span></div>
      <p className="dashboard-panel-note">Theo ngày đặt đơn; gồm đơn chờ trả đã từng giao. Không thể hiện doanh thu thuần sau hoàn tiền.</p>
    </DashboardState>
  </section>;
}
