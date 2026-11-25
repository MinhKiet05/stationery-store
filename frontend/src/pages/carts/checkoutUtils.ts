import type { PaymentMethod } from "../../services/orderService";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
export const money = (value: number) => currency.format(value);
export const paymentLabels: Record<PaymentMethod, string> = {
  COD: "Thanh toán khi nhận hàng",
  MOMO: "Ví MoMo",
  VNPAY: "VNPAY-QR",
  BANK_TRANSFER: "Chuyển khoản VietQR",
  CARD: "Thẻ Visa / Mastercard / JCB",
};
