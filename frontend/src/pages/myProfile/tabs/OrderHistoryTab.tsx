import { useState, type FormEvent, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Package, Truck, CheckCircle, XCircle, CreditCard, ChevronLeft, ChevronRight, X, Clock, CalendarDays, Receipt } from 'lucide-react';
import { cancelOrder, type OrderStatus, type Order } from '../../../services/orderService';
import { useProfile } from '../profileContext';
import { filterOrders, orderStatuses, orderStatusLabel } from '../orderHistory';
import styles from './OrderHistoryTab.module.css';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const date = (value: string) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
  : 'Chưa cập nhật';
const paymentLabel = (method: string) => ({ COD: 'Thanh toán khi nhận hàng', BANK_TRANSFER: 'Chuyển khoản ngân hàng', MOMO: 'MoMo', VNPAY: 'VNPay' }[method] ?? method);
const statusStyle: Record<OrderStatus, string> = {
  PENDING: 'pending', PROCESSING: 'pending', SHIPPED: 'shipping',
  DELIVERED: 'success', CANCELLED: 'cancelled', RETURN_PENDING: 'pending',
};
const pageSize = 4;

export default function OrderHistoryTab() {
  const { orders, ordersLoading, ordersError, retryOrders, replaceOrder } = useProfile();
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

  // State cho Modal
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const matchingOrders = filterOrders(orders, query);
  const filtered = matchingOrders.filter((order) => status === 'ALL' || order.status === status);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  useEffect(() => {
    if (viewingOrder) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [viewingOrder]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(search.trim());
    setPage(1);
  }

  async function handleCancel(orderID: number) {
    if (cancelling !== null) return;
    setCancelling(orderID);
    setActionError('');
    setMessage('');
    try {
      const updated = await cancelOrder(orderID);
      replaceOrder(updated);
      setMessage('Đã hủy đơn hàng #ST-' + updated.orderID + '.');
      // Nếu đang xem chi tiết đơn vừa hủy thì cập nhật lại modal
      if (viewingOrder?.orderID === orderID) setViewingOrder(updated);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Không thể hủy đơn hàng. Vui lòng tải lại để kiểm tra trạng thái mới nhất.');
    } finally {
      setCancelling(null);
    }
  }

  function handleReturnRequest(orderID: number) {
    alert(`Chức năng yêu cầu trả hàng cho đơn #ST-${orderID} sẽ được hỗ trợ trong thời gian tới.`);
  }

  return (
    <section className={styles.tabContainer} aria-busy={ordersLoading}>
      <div className={styles.header}>
        <div><h2>Lịch sử đơn hàng</h2><p>Quản lý và theo dõi các đơn hàng của bạn.</p></div>
        <button className={styles.exportBtn} disabled={ordersLoading || cancelling !== null} onClick={retryOrders}>Tải lại</button>
      </div>

      <form className={styles.searchBar} onSubmit={submitSearch}>
        <Search size={18} className={styles.searchIcon} aria-hidden="true" />
        <input aria-label="Tìm đơn hàng" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã đơn, tên sản phẩm hoặc thương hiệu…" />
        <button className={styles.searchBtn} type="submit">Tìm kiếm</button>
      </form>

      <div className={styles.filterTabs} aria-label="Lọc theo trạng thái">
        {(['ALL', ...orderStatuses] as const).map((value) => (
          <button key={value} aria-pressed={status === value} className={[styles.filterTab, status === value ? styles.active : ''].join(' ')} onClick={() => { setStatus(value); setPage(1); }}>
            {value === 'ALL' ? 'Tất cả' : orderStatusLabel[value]}
            {!ordersLoading && !ordersError && <span className={styles.count}>{value === 'ALL' ? matchingOrders.length : matchingOrders.filter((order) => order.status === value).length}</span>}
          </button>
        ))}
      </div>

      {actionError && <p className={styles.errorAlert} role="alert">{actionError}</p>}
      {message && <p className={styles.successAlert} role="status">{message}</p>}

      {ordersLoading ? <p role="status" className={styles.loadingText}>Đang tải đơn hàng…</p> : ordersError ? (
        <div role="alert" className={styles.errorAlert}>
          <p>{ordersError}</p>
          <button className={styles.btnPrimary} onClick={retryOrders}>Thử lại</button>
        </div>
      ) : !filtered.length ? (
        <div className={styles.empty} role="status">
          <div className={styles.emptyIcon}><Package size={36} /></div>
          <h3>{orders.length ? 'Không tìm thấy đơn hàng phù hợp' : 'Bạn chưa có đơn hàng nào'}</h3>
          {orders.length ? <button className={styles.btnOutline} onClick={() => { setSearch(''); setQuery(''); setStatus('ALL'); setPage(1); }}>Xóa bộ lọc</button> : <Link className={styles.btnPrimary} to="/search">Khám phá sản phẩm</Link>}
        </div>
      ) : (
        <>
          <div className={styles.orderList}>
            {visible.map((order) => (
              <article key={order.orderID} className={styles.orderCard}>
                <div className={styles.orderHeader}>
                  <div className={styles.orderMeta}>
                    <strong>Mã đơn: #ST-{order.orderID}</strong><span className={styles.dot}>•</span>
                    <span>Ngày đặt: {date(order.orderDate)}</span>
                  </div>
                  <div className={[styles.statusTag, styles[statusStyle[order.status]]].join(' ')}>
                    {order.status === 'SHIPPED' ? <Truck size={14} /> : order.status === 'DELIVERED' ? <CheckCircle size={14} /> : order.status === 'CANCELLED' ? <XCircle size={14} /> : <Package size={14} />}
                    {orderStatusLabel[order.status] ?? order.status}
                  </div>
                </div>

                {/* Giới hạn hiển thị 2 sản phẩm ở màn hình ngoài, nếu nhiều hơn thì hiển thị nút "Xem thêm" */}
                <div className={styles.productList}>
                  {order.items.slice(0, 2).map((item) => (
                    <div key={item.orderDetailID} className={styles.productItem}>
                      {item.productImage ? <img src={item.productImage} alt={item.productTitle || item.variantTitle} className={styles.productImg} loading="lazy" /> : <div className={styles.imagePlaceholder} aria-label="Chưa có ảnh"><Package size={24} /></div>}
                      <div className={styles.productInfo}>
                        {item.productHandle ? <Link className={styles.productName} to={'/products/' + encodeURIComponent(item.productHandle)}>{item.productTitle || item.variantTitle}</Link> : <h3 className={styles.productName}>{item.productTitle || item.variantTitle}</h3>}
                        <div className={styles.productVariant}>Phân loại: {item.variantTitle}</div>
                        <div className={styles.productQty}>Số lượng: x{item.quantity}</div>
                      </div>
                      <div className={styles.productPriceWrap}><div className={styles.currentPrice}>{money(item.unitPrice)}</div></div>
                    </div>
                  ))}
                  {order.items.length > 2 && (
                    <div className={styles.moreItemsText} onClick={() => setViewingOrder(order)}>
                      + Xem thêm {order.items.length - 2} sản phẩm khác
                    </div>
                  )}
                </div>

                <div className={styles.orderFooter}>
                  <div className={styles.footerLeft}>
                    <div className={styles.totalWrap}>
                      <span>Thành tiền:</span>
                      <strong className={styles.totalPrice}>{money(order.totalAmount)}</strong>
                    </div>
                  </div>
                  <div className={styles.footerRight}>
                    <div className={styles.actionButtons}>
                      {(!order.isPaid && (order.status === 'PENDING' || order.status === 'PROCESSING')) && (
                        <button className={[styles.btn, styles.btnOutline].join(' ')} disabled={cancelling !== null} onClick={() => void handleCancel(order.orderID)}>
                          {cancelling === order.orderID ? 'Đang hủy…' : 'Hủy đơn hàng'}
                        </button>
                      )}
                      {order.status === 'DELIVERED' && (
                        <button className={[styles.btn, styles.btnOutline].join(' ')} onClick={() => handleReturnRequest(order.orderID)}>
                          Yêu cầu trả hàng
                        </button>
                      )}
                      <button className={[styles.btn, styles.btnPrimary].join(' ')} onClick={() => setViewingOrder(order)}>
                        Xem chi tiết
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>Hiển thị {start + 1}–{Math.min(start + pageSize, filtered.length)} / <strong>{filtered.length}</strong> đơn</span>
            <nav className={styles.pageNumbers} aria-label="Phân trang đơn hàng">
              <button className={styles.pageBtn} aria-label="Trang trước" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>
              <button className={styles.pageBtn} aria-label="Trang sau" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button>
            </nav>
          </div>
        </>
      )}

      {/* Modal Chi tiết đơn hàng */}
      <dialog 
        ref={dialogRef} 
        className={styles.modal}
        onClick={(e) => {
          if (e.target === dialogRef.current) setViewingOrder(null);
        }}
      >
        {viewingOrder && (
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Chi tiết đơn hàng #ST-{viewingOrder.orderID}</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setViewingOrder(null)} aria-label="Đóng"><X size={20}/></button>
            </div>
            
            <div className={styles.modalBody}>
              {/* Timeline Header */}
              <div className={styles.modalStatusBox}>
                <div className={[styles.statusTag, styles[statusStyle[viewingOrder.status]], styles.modalStatusTag].join(' ')}>
                  {orderStatusLabel[viewingOrder.status] ?? viewingOrder.status}
                </div>
                <div className={styles.modalTime}>
                  <CalendarDays size={14} /> Ngày đặt: {date(viewingOrder.orderDate)}
                </div>
                {viewingOrder.deliveredAt && (
                  <div className={styles.modalTime}>
                    <CheckCircle size={14} color="#16a34a" /> Giao thành công: {date(viewingOrder.deliveredAt)}
                  </div>
                )}
              </div>

              {/* Thông tin nhận hàng & Thanh toán */}
              <div className={styles.modalInfoGrid}>
                <div className={styles.infoCard}>
                  <h4><Truck size={16} /> Địa chỉ nhận hàng</h4>
                  <p><strong>{viewingOrder.contactPhone}</strong></p>
                  <p>{viewingOrder.shippingAddress}</p>
                </div>
                <div className={styles.infoCard}>
                  <h4><CreditCard size={16} /> Thanh toán</h4>
                  <p>{paymentLabel(viewingOrder.paymentMethod)}</p>
                  <p className={viewingOrder.isPaid ? styles.textSuccess : styles.textWarning}>
                    {viewingOrder.isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                  </p>
                </div>
              </div>

              {/* Danh sách sản phẩm chi tiết */}
              <div className={styles.modalProducts}>
                <h4><Package size={16} /> Sản phẩm ({viewingOrder.items.length})</h4>
                <div className={styles.modalProductList}>
                  {viewingOrder.items.map((item) => (
                    <div key={item.orderDetailID} className={styles.productItem}>
                      {item.productImage ? <img src={item.productImage} alt={item.productTitle || item.variantTitle} className={styles.productImg} loading="lazy" /> : <div className={styles.imagePlaceholder}><Package size={24} /></div>}
                      <div className={styles.productInfo}>
                        <div className={styles.productName}>{item.productTitle || item.variantTitle}</div>
                        <div className={styles.productVariant}>Phân loại: {item.variantTitle}</div>
                        <div className={styles.productQty}>x{item.quantity}</div>
                      </div>
                      <div className={styles.currentPrice}>{money(item.unitPrice)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tóm tắt chi phí */}
              <div className={styles.modalSummary}>
                <div className={styles.summaryRow}>
                  <span>Tổng tiền hàng</span>
                  <span>{money(viewingOrder.subTotal)}</span>
                </div>
                {viewingOrder.discountAmount > 0 && (
                  <div className={styles.summaryRow}>
                    <span>Giảm giá {viewingOrder.couponCode && `(${viewingOrder.couponCode})`}</span>
                    <span className={styles.discountText}>-{money(viewingOrder.discountAmount)}</span>
                  </div>
                )}
                <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                  <span>Thành tiền</span>
                  <span className={styles.totalPrice}>{money(viewingOrder.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Footer Modal Actions */}
            <div className={styles.modalFooter}>
              {(!viewingOrder.isPaid && (viewingOrder.status === 'PENDING' || viewingOrder.status === 'PROCESSING')) && (
                <button className={[styles.btn, styles.btnOutline].join(' ')} disabled={cancelling !== null} onClick={() => void handleCancel(viewingOrder.orderID)}>
                  {cancelling === viewingOrder.orderID ? 'Đang hủy…' : 'Hủy đơn hàng'}
                </button>
              )}
              {viewingOrder.status === 'DELIVERED' && (
                <button className={[styles.btn, styles.btnOutline].join(' ')} onClick={() => {
                  setViewingOrder(null);
                  handleReturnRequest(viewingOrder.orderID);
                }}>
                  Yêu cầu trả hàng
                </button>
              )}
              <button className={[styles.btn, styles.btnPrimary].join(' ')} onClick={() => setViewingOrder(null)}>Đóng</button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}