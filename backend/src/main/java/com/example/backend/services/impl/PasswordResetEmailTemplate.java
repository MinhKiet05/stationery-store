package com.example.backend.services.impl;

import org.springframework.web.util.HtmlUtils;

final class PasswordResetEmailTemplate {
    static final int TTL_MINUTES = 15;
    private PasswordResetEmailTemplate() {}

    static String html(String link) {
        return """
            <!doctype html><html lang="vi"><head><meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="margin:0;padding:24px 12px;background:#fff7ed;font-family:Arial,sans-serif;color:#0f172a">
            <div style="max-width:560px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden">
              <div style="background:#0b1425;color:#ffffff;padding:28px;border-top:6px solid #ff7300">
                <strong style="font-size:24px">Stationery Store</strong>
              </div>
              <div style="padding:28px">
                <h1 style="font-size:24px">Đặt lại mật khẩu</h1>
                <p style="line-height:1.7">Chúng tôi đã nhận được yêu cầu khôi phục mật khẩu cho tài khoản Stationery Store của bạn.</p>
                <p style="line-height:1.7">Nhấn nút bên dưới để tạo mật khẩu mới.</p>
                <p style="margin:32px 0;text-align:center"><a href="%s" style="display:inline-block;background:#f97316;color:#ffffff;padding:16px 24px;border-radius:8px;text-decoration:none;font-weight:bold">ĐẶT LẠI MẬT KHẨU</a></p>
                <p style="padding:16px;background:#fff7ed;border-left:4px solid #f97316;line-height:1.6">Liên kết có hiệu lực trong <strong>%d phút</strong> và chỉ được sử dụng một lần.</p>
                <p style="line-height:1.7">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email. Mật khẩu của bạn sẽ không thay đổi.</p>
                <p>Trân trọng,<br><strong>Đội ngũ Stationery Store</strong></p>
              </div>
            </div></body></html>
            """.formatted(HtmlUtils.htmlEscape(link), TTL_MINUTES);
    }
}
