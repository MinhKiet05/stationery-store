import type { Order, OrderStatus } from '../../services/orderService';

export const orderStatuses: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_PENDING'];

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING: 'Chờ xử lý', PROCESSING: 'Đang xử lý', SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy', RETURN_PENDING: 'Chờ trả hàng',
};

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function filterOrders(orders: Order[], query: string) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return orders.filter((order) => {
    const text = normalize(['#ST-' + order.orderID, '#' + order.orderID, ...order.items.flatMap((item) => [item.productTitle ?? '', item.variantTitle, item.vendorName ?? ''])].join(' '));
    return words.every((word) => text.includes(word));
  });
}
