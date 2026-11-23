import { Link, useNavigate } from 'react-router-dom';
import { Menu, UserRound, LogOut, Store, ChevronDown } from 'lucide-react';
import { notify } from '../../utils/notifications';

export default function DashboardHeader({ admin, toggle, toggleRef, expanded }) {
  const navigate = useNavigate();
  function logout() {
    localStorage.removeItem('accessToken');
    window.dispatchEvent(new Event('auth-changed'));
    notify.success('Đăng xuất thành công.');
    navigate('/login', { replace: true });
  }
  return (
    <header className="dashboard-header">
      <div className="dashboard-header-start"><button ref={toggleRef} className="dashboard-icon-button" onClick={toggle}
        aria-label="Đóng / mở thanh điều hướng" aria-controls="dashboard-sidebar" aria-expanded={expanded}><Menu size={22} /></button>
        <span className="dashboard-header-title">StationeryStore <span>/ Quản trị</span></span></div>
      <div className="dashboard-header-end"><Link className="dashboard-header-store" to="/"><Store size={17} />Về cửa hàng</Link>
        <details className="dashboard-account"><summary><span className="dashboard-avatar"><UserRound size={20} /></span>
          <span className="dashboard-account-name"><strong>{admin.fullName || admin.username}</strong><small>Quản trị viên</small></span><ChevronDown size={15} /></summary>
          <div className="dashboard-account-menu"><p>{admin.email}</p><Link to="/my-profile">Tài khoản của tôi</Link>
            <button onClick={logout}><LogOut size={16} />Đăng xuất</button></div>
        </details></div>
    </header>
  );
}
