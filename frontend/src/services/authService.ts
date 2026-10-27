const response = await fetch(
    "http://localhost:8080/api/auth/login",
    {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            password
        })
    }
);
import {
    clearGuestCart
} from "../utils/guestCart";

import {
    mergeGuestCart
} from "../services/cartService";

// Sau khi đăng nhập thành công:
const data = await response.json();

const accessToken = data.accessToken;

// Lưu token theo cách AuthService frontend hiện tại đang dùng.
localStorage.setItem("accessToken", accessToken);

try {
    await mergeGuestCart(accessToken);

    // Chỉ xóa giỏ khách khi merge thành công.
    clearGuestCart();

    // Cập nhật trạng thái Cart hoặc lấy lại GET /api/cart.
    // Sau đó điều hướng tới trang mong muốn.
} catch (error) {
    console.error("Không thể đồng bộ giỏ hàng", error);

    // Giữ nguyên localStorage để người dùng có thể thử lại.
    // Thông báo lỗi trên giao diện.
}