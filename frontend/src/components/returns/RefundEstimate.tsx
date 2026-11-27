import type { RefundPreview } from '../../services/returnService';
import styles from '../../pages/returnRequest/ReturnRequest.module.css';
const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
export default function RefundEstimate({ pricing, quantity, error, onRetry }: {
  pricing: RefundPreview | null | undefined; quantity: number; error: string; onRetry: () => void;
}) {
  return <><h2>Tóm tắt hoàn tiền</h2><dl>
    <div><dt>Giá trị sản phẩm chọn trả ({quantity} món):</dt><dd data-testid="return-subtotal">{pricing ? money(pricing.grossAmount) : quantity ? 'Đang kiểm tra…' : money(0)}</dd></div>
    <div><dt>Giảm giá đã áp dụng:</dt><dd className={styles.discount} data-testid="return-discount">{pricing ? `-${money(pricing.discountAmount)}` : '—'}</dd></div>
    <div><dt>{pricing && !pricing.paymentConfirmed ? 'Giá trị sau giảm giá (chưa xác nhận thanh toán):' : 'Giá trị thực trả:'}</dt><dd>{pricing ? money(pricing.netAmount) : '—'}</dd></div>
    <div><dt>Hoàn phí vận chuyển:</dt><dd>CSKH xác nhận</dd></div><div><dt>Phí thu hồi hàng:</dt><dd>CSKH xác nhận</dd></div>
  </dl><div className={styles.total}><strong>Tiền hàng hoàn dự kiến:</strong><span data-testid="return-total">{pricing ? money(pricing.netAmount) : quantity ? 'Chờ xác nhận' : money(0)}</span></div>
    {quantity > 0 && !pricing && !error && <p role="status">Đang kiểm tra tiền hoàn…</p>}
    {quantity > 0 && error && <p role="alert" className={styles.fieldError}>{error} <button type="button" onClick={onRetry}>Thử lại</button></p>}
    {pricing && !pricing.paymentConfirmed && <p className={styles.fieldError}>Đơn chưa xác nhận đã thanh toán. CSKH cần xác minh trước khi hoàn tiền.</p>}
    <p className={styles.estimateNote}>Số tiền hoàn dự kiến được tính dựa trên giá sản phẩm tại thời điểm mua và phần giảm giá đã áp dụng cho sản phẩm. Số tiền hoàn cuối cùng sẽ được xác nhận sau khi xét duyệt theo chính sách đổi trả.</p>
  </>;
}
