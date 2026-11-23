import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, TicketPercent, RotateCcw, Truck, Package, Users, Store, PenTool, X } from 'lucide-react';

const links = [
  ['', 'Tổng quan', LayoutDashboard],
  ['/reviews', 'Đánh giá', MessageSquare],
  ['/promotions', 'Khuyến mãi & Voucher', TicketPercent],
  ['/returns', 'Trả hàng', RotateCcw],
  ['/orders', 'Đơn hàng & Vận chuyển', Truck],
  ['/products', 'Sản phẩm & Tồn kho', Package],
  ['/users', 'Người dùng', Users],
];

export default function DashboardSidebar({ sidebarRef, collapsed, mobileOpen, hidden, close }) {
  return (
    <aside ref={sidebarRef} id="dashboard-sidebar" className="dashboard-sidebar" aria-label="Điều hướng quản trị" inert={hidden} aria-hidden={hidden || undefined}
      role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined}>
      <Link className="dashboard-brand" to="/dashboard" title="StationeryStore Admin"><span className="dashboard-brand-icon"><PenTool size={23} /></span>
        <span className="dashboard-sidebar-label"><strong>StationeryStore</strong><small>ADMIN PORTAL</small></span></Link>
      <button className="dashboard-mobile-close dashboard-icon-button" onClick={close} aria-label="Đóng menu"><X size={22} /></button>
      <p className="dashboard-nav-label dashboard-sidebar-label">KHÔNG GIAN QUẢN TRỊ</p>
      <nav>{links.map(([path, label, Icon]) => <NavLink key={path} to={`/dashboard${path}`} end={!path}
        title={collapsed ? label : undefined} onClick={close} className={({ isActive }) => `dashboard-nav-link ${isActive ? 'active' : ''}`}>
        <Icon size={20} aria-hidden="true" /><span className="dashboard-sidebar-label">{label}</span>
      </NavLink>)}</nav>
      <div className="dashboard-sidebar-bottom"><Link to="/" className="dashboard-store-link" title="Về cửa hàng"><Store size={19} /><span className="dashboard-sidebar-label">Về cửa hàng trực tuyến</span></Link>
        <p className="dashboard-sidebar-label">Stationery Store · Management</p></div>
    </aside>
  );
}
