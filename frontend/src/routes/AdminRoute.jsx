import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAdminVerification } from '../services/adminSession';
import '../pages/dashboard/Dashboard.css';

export default function AdminRoute() {
  const location = useLocation();
  const state = useAdminVerification();
  if (!state.token || state.status === 'unauthorized') return <Navigate to="/login" replace state={{ from: location }} />;
  if (state.status !== 'ready') return (
    <main className="dashboard-gate">
      <ShieldCheck size={40} aria-hidden="true" />
      {state.status === 'initial' ? <p role="status">Đang xác minh quyền quản trị…</p> : state.status === 'forbidden' ? <>
        <h1>403 · Không có quyền truy cập</h1><p>Khu vực này chỉ dành cho quản trị viên.</p><Link to="/">Về cửa hàng</Link>
      </> : <div role="alert"><h1>Chưa thể xác minh tài khoản</h1><p>Vui lòng kiểm tra kết nối và thử lại.</p>
        <button onClick={state.retry}>Thử lại</button>
      </div>}
    </main>
  );
  return <Outlet context={{ admin: state.admin, onAccessDenied: state.onAccessDenied }} />;
}
