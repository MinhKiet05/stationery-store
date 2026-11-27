import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, Search, RotateCcw, MessageSquare, Star, ThumbsUp, CircleAlert, Image, CalendarDays, Package, UserRound, ChevronLeft, ChevronRight } from 'lucide-react';
import StatCard from '../../components/dashboard/StatCard';
import DashboardPageIntro from '../../components/dashboard/DashboardPageIntro';
import DashboardListHeading from '../../components/dashboard/DashboardListHeading';
import DashboardState from '../../components/dashboard/DashboardState';
import ReviewStars from '../../components/dashboard/ReviewStars';
import ReviewDetailModal from '../../components/dashboard/ReviewDetailModal';
import useDashboardResource from './useDashboardResource';
import { reviewsPath, reviewStatisticsPath, exportAdminReviews } from '../../services/adminReviewApi';
import { number, storedDateTime } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import './ReviewsPage.css';

const defaults = { search: '', rating: '', startDate: '', endDate: '', sort: 'NEWEST' };

export default function ReviewsPage() {
  const { onAccessDenied } = useOutletContext();
  const [filters, setFilters] = useState(defaults);
  const [search, setSearch] = useState('');
  const [dates, setDates] = useState({ startDate: '', endDate: '' });
  const [dateError, setDateError] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);
  const list = useDashboardResource(reviewsPath(filters, page), onAccessDenied);
  const stats = useDashboardResource(reviewStatisticsPath(filters), onAccessDenied);
  useEffect(() => {
    if (filters.search === search.trim()) return;
    const timer = setTimeout(() => { setFilters(current => current.search === search.trim() ? current : { ...current, search: search.trim() }); setPage(0); }, 350);
    return () => clearTimeout(timer);
  }, [search, filters.search]);
  useEffect(() => () => exportRef.current?.abort(), []);
  // If deletion removes the last row of a page, move back to the last valid page.
  useEffect(() => { if (list.status === 'ready' && page > 0 && list.data.content.length === 0) setPage(Math.max(0, list.data.totalPages - 1)); }, [list.status, list.data, page]);
  function change(key, value) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function applyDates(event) {
    event.preventDefault();
    if ((dates.startDate && dates.endDate && dates.startDate > dates.endDate) || dates.endDate > '9998-12-31') { setDateError('Khoảng ngày không hợp lệ.'); return; }
    setDateError(''); setFilters(current => ({ ...current, ...dates })); setPage(0);
  }
  function reset() { setSearch(''); setDates({ startDate: '', endDate: '' }); setDateError(''); setFilters(defaults); setPage(0); }
  async function download() {
    if (exportRef.current) return;
    const controller = new AbortController(); exportRef.current = controller; setExporting(true);
    try {
      const { blob, filename } = await exportAdminReviews(filters, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify.success('Đã tải file Excel đánh giá.');
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401 || error.status === 403) { onAccessDenied(); return; }
      const message = error.status === 404 ? 'Không có đánh giá phù hợp với bộ lọc để xuất.' : error.status === 413
        ? 'Có quá nhiều đánh giá. Hãy thu hẹp bộ lọc trước khi xuất Excel.' : 'Không thể xuất Excel. Vui lòng thử lại.';
      notify.error(message, message, error);
    } finally { if (!controller.signal.aborted) setExporting(false); exportRef.current = null; }
  }
  const summary = stats.data;
  return <div className="reviews-page dashboard-management-page">
    <DashboardPageIntro className="reviews-heading" title="Quản lý đánh giá" breadcrumb="Đánh giá sản phẩm" description="Theo dõi đánh giá và hình ảnh từ khách hàng để nắm bắt chất lượng sản phẩm.">
      <button className="dashboard-button" disabled={exporting} onClick={download}><Download size={17} />{exporting ? 'Đang xuất Excel…' : 'Xuất Excel'}</button>
    </DashboardPageIntro>
    <DashboardState resource={stats}><div className="reviews-kpi-grid">
      <StatCard label="Tổng số đánh giá" value={number(summary?.totalReviews)} description="Theo bộ lọc đang áp dụng" icon={MessageSquare} />
      <StatCard label="Điểm trung bình" value={summary?.averageRating == null ? '—' : `${summary.averageRating.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}/5`} description={summary?.totalReviews === 0 ? 'Chưa có đánh giá để tính điểm' : 'Trung bình tất cả đánh giá phù hợp'} icon={Star} tone="orange" />
      <StatCard label="Đánh giá 5 sao" value={number(summary?.fiveStarReviews)} description={summary?.totalReviews > 0 ? <><span className="dashboard-management-ratio">{number(Math.round(summary.fiveStarReviews / summary.totalReviews * 1000) / 10)}%</span> số đánh giá theo bộ lọc</> : 'Chưa có đánh giá theo bộ lọc'} icon={ThumbsUp} />
      <StatCard label="Đánh giá 1–2 sao" value={number(summary?.lowStarReviews)} description="Các phản hồi cần được quan tâm" icon={CircleAlert} tone="red" />
    </div></DashboardState>
    <section className="dashboard-panel dashboard-management-filters" aria-label="Bộ lọc đánh giá"><div className="reviews-toolbar">
      <label className="reviews-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Tìm sản phẩm hoặc người đánh giá" placeholder="Tìm sản phẩm hoặc người đánh giá…" maxLength={150} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Số sao<select aria-label="Lọc số sao" value={filters.rating} onChange={event => change('rating', event.target.value)}><option value="">Tất cả</option>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} sao</option>)}</select></label>
      <label>Sắp xếp<select aria-label="Sắp xếp đánh giá" value={filters.sort} onChange={event => change('sort', event.target.value)}><option value="NEWEST">Mới nhất</option><option value="OLDEST">Cũ nhất</option></select></label>
      <button className="dashboard-button" onClick={reset}><RotateCcw size={16} />Đặt lại</button>
    </div><form className="reviews-date-filter" onSubmit={applyDates}>
      <label>Từ ngày<input aria-label="Ngày bắt đầu đánh giá" type="date" min="0001-01-01" max="9998-12-31" value={dates.startDate} onChange={event => setDates(current => ({ ...current, startDate: event.target.value }))} /></label>
      <label>Đến ngày<input aria-label="Ngày kết thúc đánh giá" type="date" min="0001-01-01" max="9998-12-31" value={dates.endDate} onChange={event => setDates(current => ({ ...current, endDate: event.target.value }))} /></label>
      <button className="dashboard-button" type="submit">Áp dụng ngày</button><p>Excel xuất toàn bộ kết quả theo bộ lọc, không chỉ trang đang xem.</p>
      {dateError && <p className="reviews-date-error" role="alert">{dateError}</p>}
    </form></section>
    <section className="dashboard-panel reviews-list-panel" aria-label="Danh sách đánh giá">
    <DashboardListHeading title="Danh sách đánh giá khách hàng" resource={list} page={page} unit="đánh giá" icon={MessageSquare} />
    {list.status === 'loading' ? <div className="reviews-skeleton" role="status" aria-label="Đang tải danh sách đánh giá">{[1, 2, 3, 4, 5].map(value => <div key={value} />)}</div> :
      <DashboardState resource={list} empty={list.status === 'ready' && list.data.content.length === 0} emptyMessage="Không có đánh giá phù hợp với bộ lọc.">
        <div className="dashboard-table-scroll" role="region" aria-label="Bảng đánh giá sản phẩm" tabIndex={0}><table className="dashboard-table reviews-table"><caption className="dashboard-sr-only">Danh sách đánh giá sản phẩm</caption><thead><tr>
          <th scope="col">Sản phẩm</th><th scope="col">Người đánh giá</th><th scope="col">Số sao</th><th scope="col">Nội dung</th><th scope="col">Thao tác</th></tr></thead>
          <tbody>{list.data?.content.map(({ review, images }) => <tr key={review.reviewID}><td><div className="reviews-product-cell">
            {review.productImage ? <img src={review.productImage} alt="" loading="lazy" /> : <span className="reviews-product-placeholder" aria-hidden="true"><Package size={21} /></span>}<div><strong>{review.productTitle}</strong><small className="reviews-reviewer">Sản phẩm #{review.productID}</small></div></div></td>
            <td><div className="reviews-customer-cell"><span className="reviews-customer-icon" aria-hidden="true"><UserRound size={16} /></span><div><strong>{review.fullName || review.username}</strong><small className="reviews-reviewer">@{review.username}</small></div></div><time className="reviews-reviewer reviews-date" dateTime={review.reviewDate || undefined}><CalendarDays size={13} aria-hidden="true" />{storedDateTime(review.reviewDate)}</time></td>
            <td><ReviewStars rating={review.rating} /></td><td><p className="reviews-comment-preview">{review.comment || 'Không có nội dung.'}</p>{images.length > 0 && <span className="reviews-photo-count"><Image size={15} aria-hidden="true" />{images.length} ảnh</span>}</td>
            <td><button className="dashboard-button admin-detail-button" aria-label={`Xem chi tiết đánh giá #${review.reviewID}`} onClick={() => setSelected(review.reviewID)}>Xem chi tiết</button></td>
          </tr>)}</tbody></table></div>
      </DashboardState>}
      {list.status === 'ready' && list.data.totalElements > 0 && <div className="dashboard-pagination"><span>{number(list.data.totalElements)} đánh giá · bộ lọc hiện tại</span><div>
        <button className="dashboard-icon-button" aria-label="Trang đánh giá trước" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>Trang {page + 1} / {Math.max(list.data.totalPages, 1)}</span>
        <button className="dashboard-icon-button" aria-label="Trang đánh giá tiếp theo" disabled={page + 1 >= list.data.totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
      </div></div>}
    </section>
    {selected != null && <ReviewDetailModal key={selected} reviewID={selected} onClose={() => setSelected(null)} onAccessDenied={onAccessDenied} onChanged={() => { list.retry(); stats.retry(); }} />}
  </div>;
}
