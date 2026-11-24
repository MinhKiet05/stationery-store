import { number } from '../../services/dashboardApi';

export default function DashboardListHeading({ title, resource, page, unit, icon: Icon, size = 10 }) {
  const data = resource.data;
  const count = data?.content.length || 0;
  const start = count ? page * size + 1 : 0;
  const end = count ? start + count - 1 : 0;
  return <div className="dashboard-management-list-heading"><h2><Icon size={19} aria-hidden="true" />{title}</h2>
    <p role="status" aria-atomic="true">{resource.status === 'ready'
      ? <>Hiển thị <strong>{count ? `${number(start)}–${number(end)}` : '0'}</strong> / <strong>{number(data.totalElements)}</strong> {unit}</>
      : resource.status === 'loading' ? 'Đang tải danh sách…' : 'Chưa thể tải danh sách.'}</p>
  </div>;
}
