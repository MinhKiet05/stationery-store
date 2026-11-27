import { useState } from 'react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import useAdminDetail from './useAdminDetail';
import { getAdminUser, changeAdminUser, userRoles, userInitials } from '../../services/adminUserApi';
import { adminErrorMessage, storedDateTime } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';

export default function UserDetailModal({ userID, admin, onClose, onChanged, onAccessDenied }) {
  const detail = useAdminDetail(userID, getAdminUser, onAccessDenied);
  const [role, setRole] = useState(''), [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [stale, setStale] = useState(false);
  const user = detail.data, self = user && (user.userID === admin?.userID || user.username === admin?.username);
  function reload() { setRole(''); setConfirm(null); setError(''); setStale(false); detail.reload(); }
  async function save() {
    if (detail.mutation.current || !user || stale || !confirm) return;
    detail.mutation.current = true; setBusy(true); setError('');
    try {
      const updated = await changeAdminUser(user, confirm === 'role' ? { role } : { isActive: !user.isActive });
      if (!detail.alive.current) return;
      detail.replace({ ...user, ...updated }); setConfirm(null); setRole('');
      notify.success(confirm === 'role' ? 'Thay đổi vai trò thành công.' : updated.isActive ? 'Mở khóa tài khoản thành công.' : 'Khóa tài khoản thành công.');
      onChanged();
    } catch (failure) {
      if (!detail.alive.current) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = adminErrorMessage(failure);
      setError(message); setStale(true); setConfirm(null); notify.error(message, message, failure);
    } finally { detail.mutation.current = false; if (detail.alive.current) setBusy(false); }
  }
  const disabled = busy || stale || self;
  return <><AdminModal title="Chi tiết người dùng" busy={busy} onClose={onClose} footer={<>
    <button className="dashboard-button" disabled={busy} onClick={onClose}>Đóng</button>
    <button className="dashboard-button" disabled={busy || detail.status === 'loading'} onClick={reload}>Tải lại chi tiết</button>
  </>}>
    {detail.status === 'loading' && <p className="dashboard-loading" role="status">Đang tải chi tiết người dùng…</p>}
    {detail.status === 'error' && <div className="admin-modal-error" role="alert"><p>{detail.error}</p><button className="dashboard-button" onClick={reload}>Thử lại</button></div>}
    {detail.status === 'ready' && !user && <p className="dashboard-state">Không có thông tin tài khoản.</p>}
    {error && <p className="admin-modal-error" role="alert">{error} Vui lòng tải lại chi tiết trước khi thao tác tiếp.</p>}
    {user && <><section className="admin-detail-section"><div className="users-person users-detail-person"><span className="users-avatar" aria-hidden="true">{userInitials(user)}</span><div><h3>{user.fullName || user.username}</h3><p>@{user.username} · USR-{user.userID}</p></div></div>
      <dl className="admin-detail-grid">{[
        ['Email', user.email], ['Số điện thoại', user.phoneNumber || 'Chưa cung cấp'],
        ['Vai trò', userRoles[user.role] || user.role], ['Trạng thái', user.isActive ? 'Đang hoạt động' : 'Bị khóa'],
        ['Ngày đăng ký', storedDateTime(user.createdAt)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      {user.address && <div><dt>Địa chỉ</dt><dd>{user.address}</dd></div>}</dl>
    </section><section className="admin-detail-section"><h3>Vai trò hệ thống</h3>
      <label className="users-role-label">Vai trò mới<select aria-label="Vai trò mới" disabled={disabled} value={role || user.role} onChange={event => setRole(event.target.value)}>
        {Object.entries(userRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label><p className="admin-modal-note">Quản trị viên có quyền truy cập các chức năng quản trị hệ thống. Khách hàng sử dụng các chức năng mua sắm và tài khoản cá nhân.</p>
      <button className="dashboard-button dashboard-button-primary" disabled={disabled || !role || role === user.role} onClick={() => setConfirm('role')}>Thay đổi vai trò</button>
    </section><section className="admin-detail-section"><h3>Trạng thái tài khoản</h3><p className="admin-modal-note">Khóa tài khoản sẽ chặn đăng nhập và các thao tác cần xác thực, kể cả trong phiên đăng nhập hiện tại. Dữ liệu mua hàng và lịch sử vẫn được giữ nguyên.</p>
      <button className={`dashboard-button ${user.isActive ? 'admin-button-danger' : 'dashboard-button-primary'}`} disabled={disabled} onClick={() => setConfirm('status')}>{user.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</button>
      {self && <p className="admin-modal-note">Bạn không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập.</p>}
    </section></>}
  </AdminModal>{confirm && <ConfirmAdminAction title={confirm === 'role' ? 'Xác nhận thay đổi vai trò' : user.isActive ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản'}
    message={confirm === 'role' ? `Đổi vai trò của ${user.username} thành ${userRoles[role]}? ${role === 'ADMIN' ? 'Tài khoản sẽ có quyền quản trị toàn bộ hệ thống.' : 'Quyền quản trị sẽ bị thu hồi ngay trên các request tiếp theo.'}` : `${user.isActive ? 'Khóa' : 'Mở khóa'} tài khoản ${user.username}?`}
    danger={confirm === 'status' && user.isActive} busy={busy} onClose={() => setConfirm(null)} onConfirm={save} />}</>;
}
