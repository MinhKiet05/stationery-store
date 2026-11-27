import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Users, ShoppingBag, ShieldCheck, LockKeyhole, Download, RotateCcw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardPageIntro from '../../components/dashboard/DashboardPageIntro';
import DashboardListHeading from '../../components/dashboard/DashboardListHeading';
import DashboardState from '../../components/dashboard/DashboardState';
import StatCard from '../../components/dashboard/StatCard';
import UserDetailModal from '../../components/dashboard/UserDetailModal';
import useDashboardResource from './useDashboardResource';
import { usersPath, userStatisticsPath, exportAdminUsers, userRoles, userInitials } from '../../services/adminUserApi';
import { number, storedDateTime } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import './UsersPage.css';

const defaults = { search: '', role: '', active: '', sort: 'NEWEST' };
export default function UsersPage() {
  const { admin, onAccessDenied } = useOutletContext();
  const [filters, setFilters] = useState(defaults), [search, setSearch] = useState('');
  const [page, setPage] = useState(0), [size, setSize] = useState(10), [selected, setSelected] = useState(null), [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);
  const list = useDashboardResource(usersPath(filters, page, size), onAccessDenied, true);
  const stats = useDashboardResource(userStatisticsPath(filters), onAccessDenied, true);
  useEffect(() => {
    if (filters.search === search.trim()) return;
    const timer = setTimeout(() => { setFilters(current => ({ ...current, search: search.trim() })); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search, filters.search]);
  useEffect(() => () => exportRef.current?.abort(), []);
  useEffect(() => { if (list.status === 'ready' && !list.refreshing && page > 0 && list.data.content.length === 0) setPage(Math.max(0, list.data.totalPages - 1)); }, [list.status, list.refreshing, list.data, page]);
  function change(key, value) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function refresh() { list.retry(); stats.retry(); }
  async function download() {
    if (exportRef.current) return;
    const controller = new AbortController(); exportRef.current = controller; setExporting(true);
    try {
      const { blob, filename } = await exportAdminUsers(filters, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify.success('Xuất danh sách người dùng thành công.');
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 404 ? 'Không có người dùng phù hợp để xuất.' : failure.status === 413 ? 'Hãy thu hẹp bộ lọc trước khi xuất Excel.' : 'Không thể xuất Excel. Vui lòng thử lại.';
      notify.error(message, message, failure);
    } finally { if (!controller.signal.aborted) setExporting(false); exportRef.current = null; }
  }
  const summary = stats.data;
  return <div className="users-page dashboard-management-page">
    <DashboardPageIntro title="Quản lý Người dùng & Tài khoản" breadcrumb="Người dùng & Tài khoản" description="Quản lý thông tin tài khoản, vai trò và trạng thái hoạt động của người dùng trong hệ thống.">
      <button className="dashboard-button" disabled={exporting} onClick={download}><Download size={17} />{exporting ? 'Đang xuất Excel…' : 'Xuất Excel'}</button>
      <button className="dashboard-button" disabled={list.refreshing || stats.refreshing} onClick={refresh}><RotateCcw size={17} />Làm mới dữ liệu</button>
    </DashboardPageIntro>
    {stats.status === 'loading' ? <div className="users-kpi-grid users-kpi-skeleton" role="status" aria-label="Đang tải thống kê người dùng">{[1,2,3,4].map(n => <div key={n} />)}</div> : <DashboardState resource={stats}><div className="users-kpi-grid" aria-busy={Boolean(stats.refreshing)}>
      <StatCard label="Tổng người dùng" value={number(summary?.totalUsers)} description="Tài khoản theo bộ lọc hiện tại" icon={Users} />
      <StatCard label="Khách hàng" value={number(summary?.customers)} description="Vai trò Customer" icon={ShoppingBag} tone="orange" />
      <StatCard label="Quản trị viên" value={number(summary?.admins)} description="Vai trò Admin" icon={ShieldCheck} />
      <StatCard label="Tài khoản bị khóa" value={number(summary?.lockedUsers)} description="Tài khoản đang bị vô hiệu hóa" icon={LockKeyhole} tone="red" />
    </div></DashboardState>}
    {(list.refreshError || stats.refreshError) && <p role="alert" className="admin-modal-error">Chưa thể làm mới dữ liệu. Đang hiển thị kết quả lần tải trước. <button className="dashboard-button" onClick={refresh}>Thử lại</button></p>}
    <section className="dashboard-panel dashboard-management-filters users-filters" aria-label="Bộ lọc người dùng">
      <label className="users-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Tìm người dùng" placeholder="Tìm họ tên, email, điện thoại hoặc USR-ID…" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Vai trò<select aria-label="Lọc vai trò" value={filters.role} onChange={event => change('role', event.target.value)}><option value="">Tất cả vai trò</option>{Object.entries(userRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Trạng thái<select aria-label="Lọc trạng thái tài khoản" value={filters.active} onChange={event => change('active', event.target.value)}><option value="">Tất cả trạng thái</option><option value="true">Đang hoạt động</option><option value="false">Bị khóa</option></select></label>
      <label>Sắp xếp<select aria-label="Sắp xếp người dùng" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="NEWEST">Mới đăng ký nhất</option><option value="OLDEST">Cũ nhất</option><option value="NAME_ASC">Họ tên A–Z</option></select></label>
      <button className="dashboard-button" onClick={() => { setSearch(''); setFilters(defaults); setPage(0); }}><RotateCcw size={16} />Đặt lại</button>
      <p>Excel bao gồm toàn bộ tài khoản phù hợp với bộ lọc hiện tại.</p>
    </section>
    <section className="dashboard-panel users-list-panel" aria-label="Danh sách người dùng" aria-busy={Boolean(list.refreshing)}>
      <DashboardListHeading title="Danh sách người dùng" resource={list} page={page} size={size} unit="tài khoản" icon={Users} />
      {list.refreshing && <p className="users-refreshing" role="status">Đang làm mới danh sách…</p>}
      {list.status === 'loading' ? <div className="users-list-skeleton" role="status" aria-label="Đang tải danh sách người dùng">{[1,2,3,4,5].map(n => <div key={n} />)}</div> : <DashboardState resource={list} empty={list.status === 'ready' && list.data.content.length === 0} emptyMessage="Không có tài khoản phù hợp với bộ lọc.">
        <div className="dashboard-table-scroll" role="region" aria-label="Bảng người dùng" tabIndex={0}><table className="dashboard-table users-table"><caption className="dashboard-sr-only">Tài khoản trong hệ thống</caption><thead><tr>{['Người dùng', 'Email', 'Số điện thoại', 'Vai trò', 'Trạng thái', 'Ngày đăng ký', 'Thao tác'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{list.data?.content.map(user => <tr key={user.userID}><td><div className="users-person"><span className="users-avatar" aria-hidden="true">{userInitials(user)}</span><div><strong>{user.fullName || user.username}</strong><small>USR-{user.userID} · @{user.username}</small></div></div></td>
            <td className="users-email">{user.email}</td><td>{user.phoneNumber || '—'}</td><td><span className={`dashboard-badge tone-${user.role === 'ADMIN' ? 'orange' : 'blue'}`}>{userRoles[user.role] || user.role}</span></td>
            <td><span className={`dashboard-badge tone-${user.isActive ? 'green' : 'red'}`}>{user.isActive ? 'Đang hoạt động' : 'Bị khóa'}</span></td><td><time dateTime={user.createdAt || undefined}>{storedDateTime(user.createdAt)}</time></td>
            <td><button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết người dùng ${user.username}`} onClick={() => setSelected(user.userID)}>Xem chi tiết</button></td></tr>)}</tbody></table></div>
      </DashboardState>}
      {list.status === 'ready' && <div className="dashboard-pagination"><label>Số dòng <select aria-label="Số dòng người dùng" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{[10, 20, 50].map(value => <option key={value} value={value}>{value} / trang</option>)}</select></label><div>
        <button className="dashboard-icon-button" aria-label="Trang người dùng trước" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Trang {page + 1} / {Math.max(list.data.totalPages, 1)}</span>
        <button className="dashboard-icon-button" aria-label="Trang người dùng tiếp theo" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
      </div></div>}
    </section>
    {selected != null && <UserDetailModal key={`${admin?.username}-${selected}`} userID={selected} admin={admin} onClose={() => setSelected(null)} onChanged={refresh} onAccessDenied={onAccessDenied} />}
  </div>;
}
