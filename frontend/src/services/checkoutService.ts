import { api } from './api';
import type { Order, PaymentMethod, ShippingMethod } from './orderService';

export type CheckoutOptions = {
  shipping: { code: ShippingMethod; label: string; description: string; fee: number }[];
  payments: { code: PaymentMethod; label: string; description: string; enabled: boolean; demo: boolean }[];
  freeShippingThreshold: number;
};
export type CheckoutQuote = {
  subTotal: number; discountAmount: number; shippingFee: number; totalAmount: number;
  shippingMethod: ShippingMethod; couponCode: string | null;
};
export function getCheckoutOptions(signal?: AbortSignal) {
  return api<CheckoutOptions>('/api/checkout/options', { signal });
}
export function previewCheckout(shippingMethod: ShippingMethod, couponCode: string, signal?: AbortSignal) {
  return api<CheckoutQuote>('/api/checkout/preview', {
    method: 'POST', body: JSON.stringify({ shippingMethod, couponCode: couponCode || null }), signal,
  }).then(quote => {
    if (!quote || !['subTotal', 'discountAmount', 'shippingFee', 'totalAmount'].every(key => {
      const value = quote[key as keyof CheckoutQuote];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    }) || !['STANDARD', 'EXPRESS'].includes(quote.shippingMethod)
      || !(quote.couponCode === null || typeof quote.couponCode === 'string'))
      throw new Error('Chưa nhận được ước tính hợp lệ. Vui lòng thử lại.');
    return quote;
  });
}
export function completeDemoPayment(orderID: number) {
  return api<Order>(`/api/orders/${orderID}/payments/demo`, { method: 'POST' });
}
