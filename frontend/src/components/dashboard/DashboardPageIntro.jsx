import { Link } from 'react-router-dom';
import { ChevronRight, LayoutDashboard } from 'lucide-react';
import './DashboardManagement.css';

/** Content heading for management pages; the shared dashboard header stays in the layout. */
export default function DashboardPageIntro({ className = '', title, description, breadcrumb, children }) {
  return <div className={`dashboard-management-heading ${className}`}>
    <nav className="dashboard-management-breadcrumb" aria-label="Đường dẫn trang">
      <Link to="/dashboard"><LayoutDashboard size={14} aria-hidden="true" />Bảng điều khiển</Link>
      <ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{breadcrumb}</span>
    </nav>
    <div className="dashboard-management-title-row"><div><h1>{title}</h1><p>{description}</p></div>
      <div className="dashboard-management-actions">{children}</div>
    </div>
  </div>;
}
