import { api } from "./api";

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
