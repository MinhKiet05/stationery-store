import { api } from "./api";

export type OrderItem = {
  orderDetailID: number;
  variantID: number;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  subTotal: number;
};

export type Order = {
  orderID: number;
  userID: number;
  orderDate: string;
  status: string;
  shippingAddress: string;
  contactPhone: string;
  paymentMethod: string;
  isPaid: boolean;
  couponCode: string | null;
  subTotal: number;
  discountAmount: number;
  totalAmount: number;
  deliveredAt: string | null;
  items: OrderItem[];
};

export function getMyOrders(signal?: AbortSignal) {
  return api<Order[]>("/api/orders/my-orders", { signal });
}

export function getOrder(orderID: number, signal?: AbortSignal) {
  return api<Order>(`/api/orders/${orderID}`, { signal });
}

type CreateOrderRequest = {
  shippingAddress: string;
  contactPhone: string;
  paymentMethod: "COD";
};

export function createOrder(order: CreateOrderRequest) {
  return api<{ orderID: number }>("/api/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}
