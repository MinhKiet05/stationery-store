import type { UserInfoResponse } from './authService';
import type { UserProfile } from './userService';
import type { Order, OrderStatus } from './orderService';
import type { ReturnRequest, ReturnStatus } from './returnService';
import type { Product } from '../components/productCard/ProductCard';
import type { Variant } from './productService';
import type { Review, ReviewImage } from './reviewService';

// JSON projections of backend dto/* records. Dates stay as ISO strings; monetary
// BigDecimal values arrive as JSON numbers. No entities or credentials are exposed.
export type UserRole = 'ADMIN' | 'CUSTOMER';
export type Download = { blob: Blob; filename: string };
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParameters = Readonly<Record<string, QueryValue>>;
export type Pagination = { page?: number; size?: number };
export type Page<T> = {
  content: T[]; totalElements: number; totalPages: number;
  number: number; size: number; numberOfElements: number; first: boolean; last: boolean; empty: boolean;
};
export type DateRange = { startDate: string; endDate: string };
export type StatusPresentation = { label: string; tone: string };

export type AdminIdentity = Omit<UserInfoResponse, 'role'> & { role: UserRole };
export type AdminUserRow = Omit<UserProfile, 'address' | 'role'> & { role: UserRole };
export type AdminUserFilters = {
  search?: string; role?: UserRole | ''; active?: boolean | 'true' | 'false' | '';
  sort?: 'NEWEST' | 'OLDEST' | 'NAME_ASC';
};
export type AdminUserChanges = { role?: UserRole; isActive?: boolean };
export type AdminUserChangeRequest = AdminUserChanges & { expectedRole: UserRole; expectedActive: boolean | null };
export type AdminUserStatistics = { totalUsers: number; customers: number; admins: number; lockedUsers: number };

export type AdminOrderFilters = Partial<DateRange> & {
  search?: string; status?: OrderStatus | ''; paid?: boolean | 'true' | 'false' | '';
  sort?: 'NEWEST' | 'OLDEST';
};
export type AdminOrderRow = Pick<Order, 'orderID' | 'orderDate' | 'status' | 'paymentMethod' | 'isPaid' | 'subTotal' | 'discountAmount' | 'totalAmount'> & {
  username: string; customerName: string | null;
};
export type AdminOrderDetail = {
  order: Order; customerName: string | null; username: string; email: string;
  variantSkus: Record<string, string>;
  returns: Pick<ReturnRequest, 'returnID' | 'reason' | 'status' | 'createdAt' | 'processedAt' | 'adminNote'>[];
};
export type UpdateOrderStatusRequest = { status: OrderStatus; expectedStatus: OrderStatus; expectedPaid: boolean };
export type AdminOrderStatistics = { totalOrders: number; pendingOrders: number; shippedOrders: number; deliveredOrders: number };
export type DashboardOrder = Omit<AdminOrderRow, 'subTotal' | 'discountAmount'>;

export type AdminReturnFilters = Partial<DateRange> & { search?: string; status?: ReturnStatus | ''; sort?: 'NEWEST' | 'OLDEST' };
export type AdminReturnRow = Omit<ReturnRequest, 'items' | 'evidenceUrls'> & { username: string; customerName: string | null };
export type ReceiveReturnItem = { returnItemID: number; receivedQuantity: number };
export type RestockReturnItem = { returnItemID: number; goodQuantity: number; damagedQuantity: number };
export type ReceiveReturnRequest = { items: ReceiveReturnItem[] };
export type RestockReturnRequest = { items: RestockReturnItem[]; inspectionNote: string | null };
export type UpdateReturnStatusRequest = { status: ReturnStatus; adminNote: string | null };
export type ReturnReceipt = {
  receivedAt: string | null; receivedBy: string | null; inspectedAt: string | null;
  inspectedBy: string | null; inspectionNote: string | null;
  items: { returnItemID: number; variantID: number; receivedQuantity: number;
    goodQuantity: number | null; damagedQuantity: number | null; stockBefore: number | null; stockAfter: number | null }[];
};
export type AdminReturnDetail = {
  request: AdminReturnRow;
  order: Pick<Order, 'orderDate' | 'status' | 'isPaid' | 'paymentMethod' | 'totalAmount' | 'contactPhone' | 'shippingAddress' | 'deliveredAt'>;
  items: { returnItemID: number; orderDetailID: number; variantID: number; productTitle: string;
    imageUrl: string | null; sku: string | null; variantTitle: string; purchasedQuantity: number; quantity: number; unitPrice: number }[];
  evidenceUrls: string[]; receipt: ReturnReceipt | null;
};
export type AdminReturnStatistics = { totalRequests: number; pendingRequests: number; approvedRequests: number; rejectedRequests: number };

// These optional catalog columns are nullable in the JPA model. Keep the
// storefront's existing presentation model while describing raw admin DTOs.
type NullableFields<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };
export type ProductVariantResponse = NullableFields<Variant, 'sku' | 'price' | 'compareAtPrice' | 'available'> & { productID: number; productTitle: string; version: number };
export type AdminProductResponse = NullableFields<Product, 'handle' | 'description' | 'price' | 'priceMin' | 'priceMax' | 'compareAtPrice' | 'available' | 'vendorID' | 'vendorName' | 'productTypeID' | 'productTypeName'>;
export type ProductRequest = Pick<Product, 'title' | 'handle'> & {
  description?: string | null; price?: number | null; priceMin?: number | null;
  priceMax?: number | null; compareAtPrice?: number | null; vendorID?: number | null;
  productTypeID?: number | null; images?: string[] | null; tagIDs?: number[] | null; available?: boolean | null;
};
export type ProductVariantRequest = {
  productID?: number | null; title: string; sku: string; available: boolean;
  price: number; compareAtPrice?: number | null; option1?: string | null;
  option2?: string | null; option3?: string | null; stockQuantity?: number | null;
};
export type AdminProductFilters = {
  search?: string; productTypeID?: number | string; vendorID?: number | string;
  status?: 'SELLING' | 'HIDDEN' | 'DELETED' | ''; lowStock?: boolean | 'true' | 'false' | '';
  sort?: 'ID_DESC' | 'ID_ASC';
};
export type AdminProductRow = Pick<Product, 'productID' | 'title' | 'available' | 'isActive'> & {
  imageUrl: string | null; productTypeName: string | null; vendorName: string | null;
  priceMin: number | null; priceMax: number | null; totalStock: number; variantCount: number; lowStockVariants: number;
};
export type Lookup = { id: number; name: string; active: boolean };
export type AdminProductDetail = { product: AdminProductResponse; tags: Lookup[]; variants: ProductVariantResponse[]; stateToken: string; lowStockThreshold: number };
export type AdminProductOptions = { categories: Lookup[]; vendors: Lookup[]; tags: Lookup[] };
export type AdminProductStatistics = { totalProducts: number; sellingProducts: number; hiddenProducts: number; lowStockProducts: number; lowStockThreshold: number };
export type ProductWriteRequest = { product: ProductRequest; expectedState?: string | null };
export type ProductStatusRequest = { available: boolean; expectedState: string };
export type VariantWriteRequest = { variant: ProductVariantRequest; expectedVersion?: number | null; initialStock: number | null | undefined };
export type UpdateStockRequest = { stockQuantity: number; version: number };

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type PromotionStatus = 'ACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'DISABLED' | 'EXHAUSTED';
export type PromotionValues = { code: string; discountType: DiscountType; discountValue: number;
  minOrderValue: number | null; startDate: string | null; endDate: string | null; usageLimit: number | null; isActive: boolean };
export type PromotionRequest = PromotionValues & { expectedState?: string | null };
export type PromotionResponse = PromotionValues & { couponID: number; usedCount: number; status: PromotionStatus; stateToken: string };
export type AdminPromotionFilters = { search?: string; status?: PromotionStatus | ''; discountType?: DiscountType | ''; sort?: 'ID_DESC' | 'ID_ASC' | 'CODE_ASC' | 'CODE_DESC' };
export type AdminPromotionStatistics = { totalCoupons: number; activeCoupons: number; expiredCoupons: number; totalUses: number };

export type AdminReviewFilters = Partial<DateRange> & { search?: string; rating?: number | string; productID?: number | string; sort?: 'NEWEST' | 'OLDEST' };
export type AdminReviewRow = Omit<Review, 'images'> & { productTitle: string; productImage: string | null; fullName: string | null };
export type AdminReviewDetail = { review: AdminReviewRow; images: ReviewImage[] };
export type AdminReviewStatistics = { totalReviews: number; averageRating: number | null; fiveStarReviews: number; lowStarReviews: number };

export type StatisticsGroupBy = 'DAY' | 'MONTH' | 'YEAR';
export type CustomerRanking = 'REVENUE' | 'ORDERS';
export type ProductRanking = 'QUANTITY' | 'REVENUE';
export type TopProduct = { productID: number; title: string; quantitySold: number; revenue: number };
export type TopCustomer = { userID: number; username: string; fullName: string | null; orderCount: number; totalPaid: number };
export type StatisticsOverview = DateRange & { totalOrders: number; successfulOrders: number;
  totalRevenue: number; totalDiscount: number; quantitySold: number; totalCustomers: number; newCustomers: number };
export type StatisticsRevenue = DateRange & { groupBy: StatisticsGroupBy; successfulOrders: number;
  totalRevenue: number; totalDiscount: number;
  periods: { periodStart: string; orderCount: number; totalRevenue: number; totalDiscount: number }[] };
export type StatisticsOrders = DateRange & { totalOrders: number;
  statusCounts: Partial<Record<OrderStatus, number>>; returnRequestCounts: Partial<Record<ReturnStatus, number>> };
export type StatisticsCustomers = DateRange & { totalCustomers: number; activeCustomers: number;
  inactiveCustomers: number; newCustomers: number; purchasingCustomers: number; sortBy: CustomerRanking; customers: TopCustomer[] };
export type StatisticsResponses = {
  overview: StatisticsOverview; revenue: StatisticsRevenue; orders: StatisticsOrders;
  customers: StatisticsCustomers; 'top-products': TopProduct[];
};
export type DashboardResponses = { orders: Page<DashboardOrder>; 'low-stock': Page<ProductVariantResponse> };
export type StatisticsPath<R extends keyof StatisticsResponses = keyof StatisticsResponses> = `/api/admin/statistics/${R}?${string}`;
export type DashboardPath<R extends keyof DashboardResponses = keyof DashboardResponses> = `/api/admin/dashboard/${R}?${string}`;
