import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { dashboardIdentity } from '../services/dashboardApi';
import '../pages/dashboard/Dashboard.css';

export default function AdminRoute() {
  const location = useLocation();
  const [session, setSession] = useState(() => ({ token: localStorage.getItem('accessToken'), revision: 0 }));
  useEffect(() => {
    const sync = () => setSession(current => ({ token: localStorage.getItem('accessToken'), revision: current.revision + 1 }));
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('auth-changed', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('auth-changed', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  if (!session.token) return <Navigate to="/login" replace state={{ from: location }} />;
  return <VerifiedAdmin key={`${session.token}:${session.revision}:${location.pathname}`} />;
}

function VerifiedAdmin() {
  const location = useLocation();
  const [state, setState] = useState({ status: 'loading', admin: null });
  const [attempt, setAttempt] = useState(0);
  const onAccessDenied = useCallback(() => setState({ status: 'forbidden', admin: null }), []);
  useEffect(() => {
    const controller = new AbortController();
    dashboardIdentity(controller.signal).then(admin => {
      if (!controller.signal.aborted) setState({ status: admin.role === 'ADMIN' ? 'ready' : 'forbidden', admin });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: error.status === 401 ? 'unauthorized' : error.status === 403 ? 'forbidden' : 'error', admin: null });
    });
    return () => controller.abort();
  }, [attempt]);
  if (state.status === 'unauthorized') return <Navigate to="/login" replace state={{ from: location }} />;
  if (state.status !== 'ready') return (
    <main className="dashboard-gate">
      <ShieldCheck size={40} aria-hidden="true" />
      {state.status === 'loading' ? <p role="status">Đang xác minh quyền quản trị…</p> : state.status === 'forbidden' ? <>
        <h1>403 · Không có quyền truy cập</h1><p>Khu vực này chỉ dành cho quản trị viên.</p><Link to="/">Về cửa hàng</Link>
      </> : <div role="alert"><h1>Chưa thể xác minh tài khoản</h1><p>Vui lòng kiểm tra kết nối và thử lại.</p>
        <button onClick={() => { setState({ status: 'loading', admin: null }); setAttempt(value => value + 1); }}>Thử lại</button>
      </div>}
    </main>
  );
  return <Outlet context={{ admin: state.admin, onAccessDenied }} />;
}
