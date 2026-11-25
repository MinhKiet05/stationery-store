import { Link, useNavigate } from 'react-router-dom';
import { Menu, Store } from 'lucide-react';
import UserAccountDropdown from '../userAccountDropdown/UserAccountDropdown';

export default function DashboardHeader({ admin, toggle, toggleRef, expanded }) {
  const navigate = useNavigate();
  return (
    <header className="dashboard-header">
      <div className="dashboard-header-start"><button ref={toggleRef} className="dashboard-icon-button" onClick={toggle}
        aria-label="Đóng / mở thanh điều hướng" aria-controls="dashboard-sidebar" aria-expanded={expanded}><Menu size={22} /></button>
        <span className="dashboard-header-title">StationeryStore <span>/ Quản trị</span></span></div>
      <div className="dashboard-header-end"><Link className="dashboard-header-store" to="/"><Store size={17} />Về cửa hàng</Link>
        <UserAccountDropdown user={admin} onLogout={() => navigate('/login', { replace: true })} /></div>
    </header>
  );
}
