import { RefreshCw, Inbox } from 'lucide-react';

export default function DashboardState({ resource, children, empty = false, emptyMessage = 'Chưa có dữ liệu trong khoảng thời gian này.' }) {
  if (resource.status === 'loading') return <div className="dashboard-loading" role="status"><span className="dashboard-spinner" />Đang tải dữ liệu…</div>;
  if (resource.status === 'error') return <div className="dashboard-state" role="alert"><p>Không thể tải dữ liệu. Vui lòng thử lại.</p>
    <button className="dashboard-button" onClick={resource.retry}><RefreshCw size={16} />Thử lại</button></div>;
  if (empty) return <div className="dashboard-state"><Inbox size={30} aria-hidden="true" /><p>{emptyMessage}</p></div>;
  return children;
}
