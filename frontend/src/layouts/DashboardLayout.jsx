import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router-dom';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import RouteErrorBoundary from '../components/RouteErrorBoundary';
import '../pages/dashboard/Dashboard.css';

export default function DashboardLayout() {
  const context = useOutletContext();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const sidebarRef = useRef(null);
  const toggleRef = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const resize = event => { setIsMobile(event.matches); if (!event.matches) setMobileOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector('a')?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { setMobileOpen(false); toggleRef.current?.focus(); }
      if (event.key === 'Tab') {
        const nodes = sidebarRef.current?.querySelectorAll('a, button');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); toggleRef.current?.focus(); };
  }, [mobileOpen]);
  const toggle = () => isMobile
    ? setMobileOpen(value => !value) : setCollapsed(value => !value);
  return (
    <div className={`dashboard-shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <a href="#dashboard-content" className="dashboard-skip">Bỏ qua điều hướng</a>
      {mobileOpen && <button className="dashboard-overlay" aria-label="Đóng menu điều hướng" onClick={() => { setMobileOpen(false); toggleRef.current?.focus(); }} />}
      <DashboardSidebar sidebarRef={sidebarRef} collapsed={collapsed} mobileOpen={mobileOpen} hidden={isMobile && !mobileOpen} close={() => { setMobileOpen(false); toggleRef.current?.focus(); }} />
      <div className="dashboard-workspace" inert={mobileOpen}>
        <DashboardHeader admin={context.admin} toggle={toggle} toggleRef={toggleRef} expanded={isMobile ? mobileOpen : !collapsed} />
        <main id="dashboard-content" className="dashboard-content" tabIndex={-1}>
          <RouteErrorBoundary><Suspense fallback={<div className="dashboard-loading" role="status">Đang tải trang quản trị…</div>}><Outlet context={context} /></Suspense></RouteErrorBoundary>
        </main>
        <footer className="dashboard-footer"><span>© {new Date().getFullYear()} StationeryStore</span><span>Không gian quản trị</span></footer>
      </div>
    </div>
  );
}
