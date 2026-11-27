import type { RefundPreview } from '../../services/returnService';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
export default function RefundSummary({ pricing }: { pricing?: RefundPreview | null }) {
  if (!pricing) return <p>Yêu cầu cũ chưa lưu số tiền hoàn dự kiến. CSKH cần đối soát; không suy đoán số tiền đã hoàn.</p>;
  return <section aria-label="Tiền hàng hoàn dự kiến">
    <p>Giá trị trước coupon: <strong>{money(pricing.grossAmount)}</strong></p>
    <p>Giảm giá phân bổ: <strong style={{ color: '#15803d' }}>-{money(pricing.discountAmount)}</strong></p>
    <p>Tiền hàng hoàn dự kiến: <strong style={{ color: '#c4510b' }}>{money(pricing.netAmount)}</strong></p>
    <ul>{pricing.items.map((item, index) => <li key={item.orderDetailID}>Sản phẩm {index + 1} × {item.quantity}: giá mua {money(item.unitPrice)}, giảm {money(item.discountAmount)}, {pricing.paymentConfirmed ? 'thực trả' : 'giá trị sau giảm giá'} {money(item.netAmount)}</li>)}</ul>
    <p>Phí vận chuyển và thu hồi: CSKH xác nhận. Chưa xác nhận hoàn tiền thực tế.</p>
    {!pricing.paymentConfirmed && <p role="note">Đơn chưa xác nhận đã thanh toán. CSKH cần xác minh trước khi hoàn tiền.</p>}
  </section>;
}
