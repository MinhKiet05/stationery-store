import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, Search, RotateCcw, Undo2, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardPageIntro from '../../components/dashboard/DashboardPageIntro';
import DashboardListHeading from '../../components/dashboard/DashboardListHeading';
import StatCard from '../../components/dashboard/StatCard';
import DashboardState from '../../components/dashboard/DashboardState';
import ReturnDetailModal from '../../components/dashboard/ReturnDetailModal';
import useDashboardResource from './useDashboardResource';
import { returnsPath, returnStatisticsPath, exportAdminReturns, returnStatuses } from '../../services/adminReturnApi';
import { number, storedDateTime } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import './ReturnsPage.css';

const defaults = { search: '', status: '', startDate: '', endDate: '', sort: 'NEWEST' };
export default function ReturnsPage() {
  const { onAccessDenied } = useOutletContext();
  const [filters, setFilters] = useState(defaults), [search, setSearch] = useState(''), [dates, setDates] = useState({ startDate: '', endDate: '' }), [dateError, setDateError] = useState('');
  const [page, setPage] = useState(0), [selected, setSelected] = useState(null), [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);
  const list = useDashboardResource(returnsPath(filters, page), onAccessDenied), stats = useDashboardResource(returnStatisticsPath(filters), onAccessDenied);
  useEffect(() => {
    if (filters.search === search.trim()) return;
    const timer = setTimeout(() => { setFilters(current => ({ ...current, search: search.trim() })); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search, filters.search]);
  useEffect(() => () => exportRef.current?.abort(), []);
  useEffect(() => { if (list.status === 'ready' && page > 0 && list.data.content.length === 0) setPage(Math.max(0, list.data.totalPages - 1)); }, [list.status, list.data, page]);
  function change(key, value) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function reset() { setSearch(''); setDates({ startDate: '', endDate: '' }); setDateError(''); setFilters(defaults); setPage(0); }
  function applyDates(event) {
    event.preventDefault();
    if (dates.startDate && dates.endDate && dates.startDate > dates.endDate) { setDateError('Khoảng ngày không hợp lệ.'); return; }
    setDateError(''); setFilters(current => ({ ...current, ...dates })); setPage(0);
  }
  async function download() {
    if (exportRef.current) return;
    const controller = new AbortController(); exportRef.current = controller; setExporting(true);
    try {
      const { blob, filename } = await exportAdminReturns(filters, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify.success('Đã tải file Excel yêu cầu trả hàng.');
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 404 ? 'Không có yêu cầu phù hợp để xuất.' : failure.status === 413 ? 'Có quá nhiều yêu cầu. Hãy thu hẹp bộ lọc trước khi xuất.' : 'Không thể xuất Excel. Vui lòng thử lại.';
      notify.error(message, message);
    } finally { if (!controller.signal.aborted) setExporting(false); exportRef.current = null; }
  }
  const summary = stats.data;
  return <div className="returns-page dashboard-management-page">
    <DashboardPageIntro title="Quản lý yêu cầu trả hàng" breadcrumb="Yêu cầu trả hàng" description="Theo dõi và xử lý các yêu cầu trả hàng, hoàn tiền của khách hàng">
      <button className="dashboard-button" disabled={exporting} onClick={download}><Download size={17} />{exporting ? 'Đang xuất Excel…' : 'Xuất Excel'}</button>
    </DashboardPageIntro>
    <DashboardState resource={stats}><div className="returns-kpi-grid">
      <StatCard label="Tổng yêu cầu trả hàng" value={number(summary?.totalRequests)} description="Toàn bộ kết quả theo bộ lọc" icon={Undo2} />
      <StatCard label="Chờ xử lý" value={number(summary?.pendingRequests)} description="Yêu cầu đang chờ xem xét" icon={Clock} tone="orange" />
      <StatCard label="Đã chấp thuận" value={number(summary?.approvedRequests)} description="Đã duyệt trả hàng, chưa xác nhận hoàn tiền" icon={CheckCircle2} />
      <StatCard label="Đã từ chối" value={number(summary?.rejectedRequests)} description="Yêu cầu đã được xử lý từ chối" icon={XCircle} tone="red" />
    </div></DashboardState>
    <section className="dashboard-panel dashboard-management-filters returns-filters" aria-label="Bộ lọc yêu cầu trả hàng"><div className="returns-toolbar">
      <label className="returns-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Tìm yêu cầu trả hàng" placeholder="Tìm mã yêu cầu, đơn hàng hoặc khách hàng…" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Sắp xếp<select aria-label="Sắp xếp yêu cầu trả hàng" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="NEWEST">Mới nhất</option><option value="OLDEST">Cũ nhất</option></select></label>
      <button className="dashboard-button" onClick={reset}><RotateCcw size={16} />Đặt lại</button>
    </div><div className="returns-status-filters" role="group" aria-label="Lọc trạng thái trả hàng">
      <button type="button" className="returns-status-chip" aria-pressed={filters.status === ''} data-return-status="" onClick={() => change('status', '')}>Tất cả</button>
      {Object.entries(returnStatuses).map(([value, item]) => <button type="button" key={value} className="returns-status-chip" data-return-status={value} aria-pressed={filters.status === value} onClick={() => change('status', value)}>{item.label}</button>)}
    </div><form className="returns-date-filter" onSubmit={applyDates}>
      <label>Từ ngày<input aria-label="Ngày bắt đầu yêu cầu" type="date" min="0001-01-01" max="9998-12-31" value={dates.startDate} onChange={event => setDates(current => ({ ...current, startDate: event.target.value }))} /></label>
      <label>Đến ngày<input aria-label="Ngày kết thúc yêu cầu" type="date" min="0001-01-01" max="9998-12-31" value={dates.endDate} onChange={event => setDates(current => ({ ...current, endDate: event.target.value }))} /></label>
      <button className="dashboard-button" type="submit">Áp dụng ngày</button><p>Excel gồm toàn bộ kết quả theo bộ lọc, không chỉ trang đang xem.</p>
      {dateError && <p className="returns-date-error" role="alert">{dateError}</p>}
    </form></section>
    <section className="dashboard-panel returns-list-panel" aria-label="Danh sách yêu cầu trả hàng">
      <DashboardListHeading title="Danh sách yêu cầu trả hàng" resource={list} page={page} unit="yêu cầu" icon={Undo2} />
      {list.status === 'loading' ? <div className="returns-skeleton" role="status" aria-label="Đang tải danh sách yêu cầu">{[1, 2, 3, 4, 5].map(n => <div key={n} />)}</div> :
        <DashboardState resource={list} empty={list.status === 'ready' && list.data.content.length === 0} emptyMessage="Không có yêu cầu trả hàng phù hợp với bộ lọc.">
          <div className="dashboard-table-scroll" role="region" aria-label="Bảng yêu cầu trả hàng" tabIndex={0}><table className="dashboard-table returns-table"><caption className="dashboard-sr-only">Các yêu cầu trả hàng của khách hàng</caption><thead><tr>
            {['Mã yêu cầu', 'Đơn hàng', 'Khách hàng', 'Ngày yêu cầu', 'Lý do trả hàng', 'Trạng thái', 'Thao tác'].map(label => <th scope="col" key={label}>{label}</th>)}
          </tr></thead><tbody>{list.data?.content.map(row => <tr key={row.returnID}>
            <td><strong className="returns-request-code">RET-{row.returnID}</strong></td><td><span className="returns-order-code">ORD-{row.orderID}</span></td>
            <td><strong>{row.customerName || row.username}</strong><small>@{row.username}</small></td><td><time dateTime={row.createdAt}>{storedDateTime(row.createdAt)}</time></td>
            <td><p className="returns-reason-preview">{row.reason}</p></td><td><span className={`dashboard-badge tone-${returnStatuses[row.status]?.tone || 'muted'}`}>{returnStatuses[row.status]?.label || 'Không xác định'}</span></td>
            <td><button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết yêu cầu #${row.returnID}`} onClick={() => setSelected(row.returnID)}>Xem chi tiết</button></td>
          </tr>)}</tbody></table></div>
        </DashboardState>}
      {list.status === 'ready' && list.data.totalElements > 0 && <div className="dashboard-pagination"><span>{number(list.data.totalElements)} yêu cầu · bộ lọc hiện tại</span><div>
        <button className="dashboard-icon-button" aria-label="Trang yêu cầu trước" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Trang {page + 1} / {Math.max(list.data.totalPages, 1)}</span>
        <button className="dashboard-icon-button" aria-label="Trang yêu cầu tiếp theo" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
      </div></div>}
    </section>
    {selected != null && <ReturnDetailModal key={selected} returnID={selected} onClose={() => setSelected(null)} onChanged={() => { list.retry(); stats.retry(); }} onAccessDenied={onAccessDenied} />}
  </div>;
}
