import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, Plus, Search, RotateCcw, Ticket, BadgeCheck, Clock, Repeat, Percent, Banknote, ChevronLeft, ChevronRight } from 'lucide-react';
import StatCard from '../../components/dashboard/StatCard';
import DashboardPageIntro from '../../components/dashboard/DashboardPageIntro';
import DashboardListHeading from '../../components/dashboard/DashboardListHeading';
import DashboardState from '../../components/dashboard/DashboardState';
import VoucherDetailModal from '../../components/dashboard/VoucherDetailModal';
import VoucherFormModal from '../../components/dashboard/VoucherFormModal';
import useDashboardResource from './useDashboardResource';
import { promotionsPath, promotionStatisticsPath, exportAdminPromotions, promotionStatuses, promotionDate, promotionDiscount } from '../../services/adminPromotionApi';
import { number, currency } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import './PromotionsPage.css';

const defaults = { search: '', status: '', discountType: '', sort: 'ID_DESC' };
export default function PromotionsPage() {
  const { onAccessDenied } = useOutletContext();
  const [filters, setFilters] = useState(defaults), [search, setSearch] = useState(''), [page, setPage] = useState(0), [selected, setSelected] = useState(null), [creating, setCreating] = useState(false), [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);
  const list = useDashboardResource(promotionsPath(filters, page), onAccessDenied), stats = useDashboardResource(promotionStatisticsPath(filters), onAccessDenied);
  useEffect(() => {
    if (filters.search === search.trim()) return;
    const timer = setTimeout(() => { setFilters(current => ({ ...current, search: search.trim() })); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search, filters.search]);
  useEffect(() => () => exportRef.current?.abort(), []);
  useEffect(() => { if (list.status === 'ready' && page > 0 && list.data.content.length === 0) setPage(Math.max(0, list.data.totalPages - 1)); }, [list.status, list.data, page]);
  function change(key, value) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function refresh() { list.retry(); stats.retry(); }
  async function download() {
    if (exportRef.current) return;
    const controller = new AbortController(); exportRef.current = controller; setExporting(true);
    try {
      const { blob, filename } = await exportAdminPromotions(filters, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify.success('Đã tải file Excel voucher.');
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 404 ? 'Không có voucher phù hợp để xuất.' : failure.status === 413 ? 'Có quá nhiều voucher. Hãy thu hẹp bộ lọc trước khi xuất.' : 'Không thể xuất Excel. Vui lòng thử lại.';
      notify.error(message, message);
    } finally { if (!controller.signal.aborted) setExporting(false); exportRef.current = null; }
  }
  const summary = stats.data;
  return <div className="promotions-page dashboard-management-page">
    <DashboardPageIntro className="promotions-heading" title="Quản lý khuyến mãi & Voucher" breadcrumb="Khuyến mãi & Voucher" description="Thiết lập điều kiện giảm giá, quản lý thời hạn và theo dõi lượt sử dụng mã ưu đãi.">
      <button className="dashboard-button" disabled={exporting} onClick={download}><Download size={17} />{exporting ? 'Đang xuất Excel…' : 'Xuất Excel'}</button><button className="dashboard-button dashboard-button-accent" onClick={() => setCreating(true)}><Plus size={17} />Tạo mã giảm giá</button>
    </DashboardPageIntro>
    <DashboardState resource={stats}><div className="promotions-kpi-grid">
      <StatCard label="Tổng số mã giảm giá" value={number(summary?.totalCoupons)} description="Toàn bộ kết quả theo bộ lọc" icon={Ticket} />
      <StatCard label="Đang hoạt động" value={number(summary?.activeCoupons)} description="Đang trong hạn và còn lượt dùng" icon={BadgeCheck} tone="orange" />
      <StatCard label="Đã hết hạn" value={number(summary?.expiredCoupons)} description="Theo phân loại trạng thái hiện tại" icon={Clock} />
      <StatCard label="Tổng lượt sử dụng" value={number(summary?.totalUses)} description="Bộ đếm đã trừ lượt hoàn khi hủy đơn" icon={Repeat} />
    </div></DashboardState>
    <section className="dashboard-panel dashboard-management-filters" aria-label="Bộ lọc voucher"><div className="promotions-toolbar">
      <label className="promotions-search"><Search size={18} aria-hidden="true" /><input aria-label="Tìm mã voucher" type="search" placeholder="Tìm mã voucher…" value={search} maxLength={50} onChange={e => setSearch(e.target.value)} /></label>
      <label>Loại giảm giá<select aria-label="Lọc loại giảm giá" value={filters.discountType} onChange={e => change('discountType', e.target.value)}><option value="">Tất cả</option><option value="PERCENTAGE">Phần trăm</option><option value="FIXED_AMOUNT">Số tiền cố định</option></select></label>
      <label>Sắp xếp<select aria-label="Sắp xếp voucher" value={filters.sort} onChange={e => change('sort', e.target.value)}><option value="ID_DESC">ID giảm dần</option><option value="ID_ASC">ID tăng dần</option><option value="CODE_ASC">Mã A → Z</option><option value="CODE_DESC">Mã Z → A</option></select></label>
      <button className="dashboard-button" onClick={() => { setSearch(''); setFilters(defaults); setPage(0); }}><RotateCcw size={16} />Đặt lại</button>
    </div><div className="promotions-status-filters" role="group" aria-label="Lọc trạng thái voucher">
      <button className="promotions-status-chip" type="button" aria-pressed={filters.status === ''} data-voucher-status="" onClick={() => change('status', '')}>Tất cả</button>
      {Object.entries(promotionStatuses).map(([value, item]) => <button key={value} className={`promotions-status-chip promotions-status-${item.tone}`} type="button" aria-pressed={filters.status === value} data-voucher-status={value} onClick={() => change('status', value)}><span aria-hidden="true" />{item.label}</button>)}
    </div><p className="promotions-filter-note">Excel gồm toàn bộ kết quả theo bộ lọc, không chỉ trang đang xem.</p></section>
    <section className="dashboard-panel promotions-list-panel" aria-label="Danh sách voucher">
    <DashboardListHeading title="Danh sách mã giảm giá" resource={list} page={page} unit="voucher" icon={Ticket} />
    {list.status === 'loading' ? <div className="promotions-skeleton" role="status" aria-label="Đang tải danh sách voucher">{[1, 2, 3, 4, 5].map(n => <div key={n} />)}</div> : <DashboardState resource={list} empty={list.status === 'ready' && list.data.content.length === 0} emptyMessage="Không có voucher phù hợp với bộ lọc.">
      <div className="dashboard-table-scroll" role="region" aria-label="Bảng mã giảm giá" tabIndex={0}><table className="dashboard-table promotions-table"><caption className="dashboard-sr-only">Danh sách khuyến mãi và voucher</caption><thead><tr>{['Mã voucher', 'Giảm giá', 'Đơn tối thiểu', 'Hiệu lực', 'Trạng thái', 'Lượt dùng', 'Thao tác'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
        {list.data?.content.map(row => <tr key={row.couponID}><td><strong className="voucher-code voucher-code-ticket"><Ticket size={14} aria-hidden="true" />{row.code}</strong><small>Voucher #{row.couponID}</small></td><td><strong className="voucher-discount">{promotionDiscount(row)}</strong><small className="voucher-discount-type">{row.discountType === 'PERCENTAGE' ? <Percent size={12} aria-hidden="true" /> : <Banknote size={12} aria-hidden="true" />}{row.discountType === 'PERCENTAGE' ? 'Phần trăm' : 'Số tiền cố định'}</small></td>
          <td>{row.minOrderValue == null ? 'Không yêu cầu' : currency(row.minOrderValue)}</td><td><small>Từ: {promotionDate(row.startDate)}</small><small>Đến: {promotionDate(row.endDate)}</small></td>
          <td><span className={`dashboard-badge voucher-status-badge tone-${promotionStatuses[row.status]?.tone || 'muted'}`}><span aria-hidden="true" />{promotionStatuses[row.status]?.label || 'Không xác định'}</span></td><td><div className={`voucher-usage ${row.status === 'EXHAUSTED' ? 'is-exhausted' : ''}`}><span><strong>{number(row.usedCount || 0)}</strong> / {row.usageLimit == null ? 'Không giới hạn' : number(row.usageLimit)}</span>
            {row.usageLimit > 0 && <><progress max={row.usageLimit} value={Math.min(row.usedCount || 0, row.usageLimit)} aria-label={`Lượt sử dụng mã ${row.code}`} /><small>{number(Math.round((row.usedCount || 0) / row.usageLimit * 1000) / 10)}% hạn mức</small></>}
          </div></td>
          <td><button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết voucher #${row.couponID}`} onClick={() => setSelected(row.couponID)}>Xem chi tiết</button></td></tr>)}
      </tbody></table></div></DashboardState>}
      {list.status === 'ready' && list.data.totalElements > 0 && <div className="dashboard-pagination"><span>{number(list.data.totalElements)} voucher · bộ lọc hiện tại</span><div><button className="dashboard-icon-button" aria-label="Trang voucher trước" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Trang {page + 1} / {Math.max(list.data.totalPages, 1)}</span><button className="dashboard-icon-button" aria-label="Trang voucher tiếp theo" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div></div>}
    </section>
    {selected != null && <VoucherDetailModal key={selected} voucherID={selected} onClose={() => setSelected(null)} onChanged={refresh} onAccessDenied={onAccessDenied} />}
    {creating && <VoucherFormModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} onAccessDenied={onAccessDenied} />}
  </div>;
}
