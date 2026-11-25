
import { api } from "./api";

export type OrderStatus = "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "RETURN_PENDING";
export type ShippingMethod = 'STANDARD' | 'EXPRESS';
export type PaymentMethod = 'COD' | 'MOMO' | 'VNPAY' | 'BANK_TRANSFER' | 'CARD';

export type OrderItem = {
  orderDetailID: number;
  variantID: number;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  subTotal: number;
  productID: number;
  productTitle: string;
  productHandle: string | null;
  productImage: string | null;
  vendorName: string | null;
};

export type Order = {
  orderID: number;
  userID: number;
  orderDate: string;
  status: OrderStatus;
  shippingAddress: string;
  contactPhone: string;
  paymentMethod: string;
  isPaid: boolean;
  shippingMethod?: ShippingMethod;
  shippingFee?: number;
  paymentMode?: 'LIVE' | 'DEMO';
  paidAt?: string;
  paymentReference?: string;
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

export function cancelOrder(orderID: number) {
  return api<Order>(`/api/orders/${orderID}/cancel`, {
    method: "PATCH",
  });
}

type CreateOrderRequest = {
  shippingAddress: string;
  contactPhone: string;
  paymentMethod: PaymentMethod;
  shippingMethod?: ShippingMethod;
  couponCode?: string;
  expectedTotalAmount?: number;
};

export function createOrder(order: CreateOrderRequest) {
  return api<Order>("/api/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}

export type OrderHistoryPage = {
  content: Order[];
  totalElements: number;
  totalPages: number;
  statusCounts: Partial<Record<OrderStatus, number>>;
};

export function getMyOrderHistory(
  params: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    summary?: boolean;
  },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );

  return api<OrderHistoryPage>(
    `/api/orders/my-orders?${query}`,
    { signal },
  );
}
