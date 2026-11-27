// Spring ProblemDetail and the legacy { message } error envelope. Raw responses
// remain unknown until each field is checked; network/abort errors have no status.
export type ApiProblem = {
  type?: string; title?: string; status?: number; detail?: string;
  instance?: string; message?: string; code?: string;
};

export const businessMessages: Readonly<Record<string, string>> = {
  COUPON_NOT_FOUND: 'Mã giảm giá không tồn tại.',
  COUPON_INACTIVE: 'Mã giảm giá đã ngừng áp dụng.',
  COUPON_NOT_STARTED: 'Mã giảm giá chưa đến thời gian áp dụng.',
  COUPON_EXPIRED: 'Mã giảm giá đã hết hạn.',
  COUPON_MINIMUM_NOT_MET: 'Đơn hàng chưa đạt giá trị tối thiểu để sử dụng mã này.',
  COUPON_EXHAUSTED: 'Mã giảm giá đã hết lượt sử dụng.',
  COUPON_PRODUCT_NOT_ELIGIBLE: 'Mã giảm giá không áp dụng cho sản phẩm đã chọn.',
  COUPON_USER_NOT_ELIGIBLE: 'Mã giảm giá không áp dụng cho tài khoản của bạn.',
  CHECKOUT_INVALID_INPUT: 'Thông tin tính đơn không hợp lệ. Vui lòng kiểm tra phương thức vận chuyển và mã giảm giá.',
  CART_EMPTY: 'Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi đặt hàng.',
  CHECKOUT_STOCK_UNAVAILABLE: 'Sản phẩm ngừng bán hoặc không đủ tồn kho. Vui lòng kiểm tra giỏ hàng.',
};

export function errorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

export const httpMessages: Readonly<Record<number, string>> = {
  400: 'Thông tin hoặc điều kiện thực hiện chưa hợp lệ. Vui lòng kiểm tra lại.',
  401: 'Vui lòng đăng nhập lại.', 403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu yêu cầu.', 408: 'Yêu cầu vượt quá thời gian chờ. Vui lòng kiểm tra lại.',
  409: 'Dữ liệu hoặc trạng thái đã thay đổi. Vui lòng tải lại để kiểm tra.',
  413: 'File hoặc yêu cầu vượt quá dung lượng cho phép.',
  422: 'Dữ liệu chưa đáp ứng điều kiện xử lý. Vui lòng kiểm tra lại.',
  429: 'Bạn gửi hơi nhanh. Hãy thử lại sau một phút.',
  500: 'Máy chủ gặp lỗi xử lý. Vui lòng thử lại sau.',
  502: 'Máy chủ hoặc gateway tạm thời gặp sự cố. Vui lòng thử lại sau.',
  503: 'Dịch vụ tạm thời gián đoạn. Vui lòng thử lại sau.',
  504: 'Gateway vượt quá thời gian chờ. Vui lòng kiểm tra lại.',
};

export function errorStatus(error: unknown): number | undefined {
  return error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
    ? error.status : undefined;
}

export function errorName(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
    ? error.name : undefined;
}

export function errorDetail(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  if ('detail' in error && typeof error.detail === 'string') return error.detail;
  if ('message' in error && typeof error.message === 'string') return error.message;
  return undefined;
}
