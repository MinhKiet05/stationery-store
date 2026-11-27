import { api, ApiError } from "./api";
import type { Order, OrderItem } from "./orderService";
import { getProduct } from "./productService";

export type ReturnStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";

export type ReturnRequest = {
  returnID: number;
  orderID: number;
  userID: number;
  reason: string;
  evidenceUrls: string[];
  status: ReturnStatus;
  createdAt: string;
  processedAt: string | null;
  adminNote: string | null;
  pricing?: RefundPreview | null;
  items: { returnItemID: number; orderDetailID: number; variantID: number; quantity: number }[];
};

export type CreateReturnRequest = {
  orderID: number;
  reason: string;
  images: File[];
  items: { orderDetailID: number; quantity: number }[];
};

export const returnStatusLabels: Record<ReturnStatus, string> = {
  PENDING: "Chờ xét duyệt", APPROVED: "Đã chấp thuận", REJECTED: "Đã từ chối", COMPLETED: "Đã hoàn tất",
};

export function getMyReturns(signal?: AbortSignal) {
  return api<ReturnRequest[]>("/api/returns/my-requests", { signal });
}

export type RefundPreview = {
  items: { orderDetailID: number; quantity: number; unitPrice: number; grossAmount: number; discountAmount: number; netAmount: number }[];
  grossAmount: number; discountAmount: number; netAmount: number; paymentConfirmed: boolean;
  shippingRefund: number | null; collectionFee: number | null; finalRefund: number | null;
};
export function previewReturn(orderID: number, items: CreateReturnRequest['items'], signal?: AbortSignal) {
  return api<RefundPreview>("/api/returns/preview", { method: 'POST', body: JSON.stringify({ orderID, items }), signal });
}
export function createReturn(request: CreateReturnRequest, signal?: AbortSignal) {
  const { images, ...payload } = request;
  const body = new FormData();
  body.append('returnRequest', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  images.forEach(image => body.append('images', image));
  return api<ReturnRequest>("/api/returns", { method: "POST", body, signal });
}

// LocalDateTime from the shop is displayed in Vietnam time. The server always
// makes the final eligibility decision, including the exact seven-day boundary.
export function shopDate(value: string): Date {
  return new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}+07:00`);
}

export function returnDeadline(order: Order): number | null {
  if (!order.deliveredAt) return null;
  const delivered = shopDate(order.deliveredAt).getTime();
  return Number.isFinite(delivered) ? delivered + 7 * 24 * 60 * 60 * 1000 : null;
}

export function eligibilityMessage(order: Order, now = Date.now()): string | null {
  if (order.status !== "DELIVERED" && order.status !== "RETURN_PENDING") return "Đơn hàng chưa được giao thành công nên chưa thể yêu cầu trả hàng.";
  const deadline = returnDeadline(order);
  if (deadline === null) return "Đơn hàng chưa có thời gian giao hàng được xác nhận. Vui lòng liên hệ CSKH.";
  if (now > deadline) return "Đơn hàng đã quá thời hạn trả hàng 7 ngày kể từ khi giao thành công.";
  return null;
}

export function remainingQuantity(item: OrderItem, requests: ReturnRequest[]): number {
  const reserved = requests.filter(request => request.status !== "REJECTED")
    .flatMap(request => request.items)
    .filter(returnItem => returnItem.orderDetailID === item.orderDetailID)
    .reduce((sum, returnItem) => sum + returnItem.quantity, 0);
  return Math.max(0, item.quantity - reserved);
}

export function isEvidenceUrl(value: string): boolean {
  if (!value.trim() || value.length > 500 || /[\r\n]/.test(value)) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch { return false; }
}

export function returnErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const knownErrors: Record<string, string> = {
      "Don hang khong ton tai": "Không tìm thấy đơn hàng của bạn.",
      "Don hang chua duoc giao": "Đơn hàng chưa được giao thành công.",
      "Don hang da qua thoi han tra hang": "Đơn hàng đã quá thời hạn trả hàng 7 ngày.",
      "So luong tra vuot qua so luong con lai": "Số lượng có thể trả đã thay đổi. Vui lòng tải lại đơn hàng trước khi gửi.",
      "Mat hang khong thuoc don hang": "Sản phẩm không thuộc đơn hàng đã chọn.",
    };
    if (error.detail && knownErrors[error.detail]) return knownErrors[error.detail];
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Tài khoản hiện không được phép thực hiện yêu cầu này.";
    if (error.status === 404) return "Không tìm thấy đơn hàng hoặc yêu cầu của bạn.";
    if (error.status === 409) return error.detail?.includes('đối soát') ? error.detail : "Đơn hàng hoặc số lượng có thể trả đã thay đổi. Vui lòng tải lại để kiểm tra.";
    if (error.status === 400) return "Thông tin chưa hợp lệ. Vui lòng kiểm tra sản phẩm, số lượng, lý do và ảnh minh chứng.";
    if (error.status === 413) return "Mỗi ảnh tối đa 5 MB; tổng yêu cầu tối đa 26 MB.";
    if (error.status === 502 || error.status === 503) return "Chưa tải được ảnh hoặc lưu yêu cầu. Nội dung và ảnh vẫn được giữ lại; vui lòng thử lại.";
    if (error.status === 429) return error.message;
  }
  return "Không thể kết nối cửa hàng. Nội dung bạn đã nhập vẫn được giữ lại; vui lòng thử lại.";
}

export type ItemPresentation = { title: string; image?: string };

// Order DTOs contain variant titles, but not parent product titles or images.
// Enrich only the selected order; a catalog failure must not block a return.
export async function getReturnItemPresentations(items: OrderItem[], signal: AbortSignal) {
  const productCache = new Map<number, ReturnType<typeof getProduct>>();
  const entries = await Promise.all(items.map(async item => {
    try {
      const variant = await api<{ productID: number; productTitle: string }>(`/api/product-variants/${item.variantID}`, { signal });
      if (!productCache.has(variant.productID)) productCache.set(variant.productID, getProduct(String(variant.productID), signal));
      const product = await productCache.get(variant.productID)!;
      return [item.orderDetailID, { title: variant.productTitle || item.variantTitle, image: product.images?.[0] }] as const;
    } catch { return [item.orderDetailID, { title: item.variantTitle }] as const; }
  }));
  return Object.fromEntries(entries) as Record<number, ItemPresentation>;
}
