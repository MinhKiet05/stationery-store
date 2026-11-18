import { toast, type TypeOptions } from "react-toastify";

// Only approved public messages may cross the API/UI boundary. Unknown backend
// diagnostics (even when written in Vietnamese) must never reach a toast.
const publicMessages = [
  "Bạn gửi hơi nhanh. Hãy thử lại sau một phút.",
  "Tên đăng nhập hoặc mật khẩu không đúng.",
  "Vui lòng đăng nhập lại.",
  "Tên đăng nhập hoặc email đã tồn tại.",
  "Thông tin đăng ký không hợp lệ. Vui lòng kiểm tra lại.",
  "Email này đã được sử dụng bởi tài khoản khác.",
  "Thông tin hồ sơ không hợp lệ. Vui lòng kiểm tra lại.",
  "Trạng thái đơn hàng đã thay đổi hoặc đơn đã thanh toán nên không thể hủy. Vui lòng tải lại.",
  "Không thể kết nối cửa hàng. Vui lòng thử lại.",
  "Mật khẩu hiện tại không chính xác.",
  "Mật khẩu cũ không đúng.",
  "Mật khẩu mới không được trùng với mật khẩu hiện tại.",
  "Mã xác nhận không hợp lệ hoặc đã hết hạn.",
  "Token không hợp lệ hoặc đã hết hạn.",
  "Dữ liệu không hợp lệ.",
  "Email không hợp lệ.",
  "Nếu email tồn tại, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.",
  "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
  "Số lượng trong giỏ vượt quá tồn kho. Vui lòng giảm số lượng.",
];
const normalize = (message: string) => message.trim().replace(/[.!]+$/, "");
const approved = new Map(publicMessages.map(message => [normalize(message), message]));
// Some existing endpoints still return these exact unaccented business reasons.
// Translate recognized reasons without allowing arbitrary response data through.
const translations = new Map([
  ["Mat khau cu khong dung", "Mật khẩu hiện tại không chính xác."],
  ["Email da ton tai", "Email này đã được sử dụng bởi tài khoản khác."],
  ["Mat khau moi vuot qua 72 byte UTF-8", "Mật khẩu mới không được vượt quá 72 byte."],
  ["Mat khau phai co tu 8 den 72 ky tu", "Mật khẩu phải có từ 8 đến 72 ký tự."],
  ["Lien ket dat lai mat khau khong hop le hoac da het han", "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn."],
  ["Gio hang trong", "Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi đặt hàng."],
  ["San pham khong con kinh doanh", "Sản phẩm hiện không còn được bán."],
  ["Don hang khong the huy o trang thai nay", "Không thể hủy đơn hàng ở trạng thái hiện tại. Vui lòng tải lại."],
  ["Don da thanh toan: can quy trinh hoan tien rieng", "Đơn hàng đã thanh toán. Vui lòng liên hệ cửa hàng để được hỗ trợ hoàn tiền."],
]);
for (const message of translations.values()) approved.set(normalize(message), message);

export function userMessage(error: unknown, fallback: string): string {
  const values = typeof error === "string" ? [error]
    : error && typeof error === "object"
      ? ["message" in error ? error.message : null, "detail" in error ? error.detail : null]
      : [];
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = normalize(value);
      const message = approved.get(normalized) ?? translations.get(normalized);
      if (message) return message;
      if (/^Khong du ton kho cho bien the \d+$/.test(normalized))
        return "Số lượng trong giỏ vượt quá tồn kho. Vui lòng giảm số lượng.";
    }
  }
  return fallback;
}

function show(type: TypeOptions, message: string) {
  // A single owner calls this from an action handler, never from render. The ID
  // also coalesces concurrent identical failures while the first toast is visible.
  return toast(message, { type, toastId: `${type}:${message}`, role: type === "error" ? "alert" : "status" });
}

export const notify = {
  success: (message: string) => show("success", message),
  warning: (message: string) => show("warning", message),
  info: (message: string) => show("info", message),
  error(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "notificationHandled" in error && error.notificationHandled === true) return;
    return show("error", userMessage(error, fallback));
  },
  sessionExpired() {
    return show("warning", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  },
};

const resetFlashKey = "stationery:password-reset-notice";
const resetSuccess = "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.";

export function queuePasswordResetNotice() {
  // The existing reset flow reloads the document. Persist only a short-lived
  // timestamp, never the reset token, credentials or a backend response.
  try { sessionStorage.setItem(resetFlashKey, String(Date.now())); }
  catch { notify.success(resetSuccess); }
}

export function showPendingNotice() {
  try {
    const pending = sessionStorage.getItem(resetFlashKey);
    sessionStorage.removeItem(resetFlashKey); // Consume before emitting, including StrictMode remounts.
    const age = Date.now() - Number(pending);
    if (pending && age >= 0 && age < 15000) notify.success(resetSuccess);
  } catch { /* Notifications still work when browser storage is unavailable. */ }
}
