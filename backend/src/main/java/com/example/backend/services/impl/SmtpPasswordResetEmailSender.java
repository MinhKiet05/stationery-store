package com.example.backend.services.impl;

import com.example.backend.services.PasswordResetEmailSender;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

@Service
@RequiredArgsConstructor
public class SmtpPasswordResetEmailSender implements PasswordResetEmailSender {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String from;

    @Override
    public void sendResetLink(String to, String resetLink) {

        String safeLink = HtmlUtils.htmlEscape(resetLink);

        String html = """
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
            </head>
            <body style="margin:0;padding:30px 12px;background:#f3f6fb;
                         font-family:Arial,sans-serif;">

                <div style="max-width:560px;margin:auto;background:#ffffff;
                            border-radius:16px;overflow:hidden;
                            box-shadow:0 4px 20px rgba(0,0,0,0.06);">

                    <div style="background:#2563eb;padding:32px;
                                text-align:center;color:white;">

                        <h1 style="margin:0;font-size:28px;">
                            Stationery Store
                        </h1>

                        <p style="margin:8px 0 0;font-size:14px;">
                            Your favorite stationery shop
                        </p>
                    </div>

                    <div style="padding:36px 30px;color:#334155;">

                        <h2 style="color:#0f172a;margin-top:0;">
                            Đặt lại mật khẩu
                        </h2>

                        <p>Xin chào,</p>

                        <p style="line-height:1.8;">
                            Chúng tôi nhận được yêu cầu đặt lại mật khẩu
                            cho tài khoản Stationery Store của bạn.
                        </p>

                        <p style="line-height:1.8;">
                            Nhấn vào nút bên dưới để tạo mật khẩu mới.
                        </p>

                        <div style="text-align:center;margin:35px 0;">

                            <a href="%s"
                               style="background:#2563eb;color:white;
                                      padding:16px 30px;
                                      text-decoration:none;
                                      border-radius:8px;
                                      font-weight:bold;
                                      display:inline-block;">

                                ĐẶT LẠI MẬT KHẨU

                            </a>

                        </div>

                        <div style="background:#eff6ff;
                                    padding:16px;
                                    border-radius:8px;
                                    border-left:4px solid #2563eb;">

                            <p style="margin:0;line-height:1.6;">
                                ⏰ Liên kết chỉ có hiệu lực trong
                                <strong>15 phút</strong>.
                            </p>

                        </div>

                        <p style="font-size:14px;line-height:1.7;
                                  margin-top:28px;">

                            Nếu bạn không yêu cầu đặt lại mật khẩu,
                            hãy bỏ qua email này. Mật khẩu của bạn
                            sẽ không thay đổi.

                        </p>

                        <p style="margin-top:30px;">
                            Trân trọng,<br>
                            <strong>Stationery Store Team</strong>
                        </p>

                    </div>

                    <div style="background:#f8fafc;
                                padding:22px;
                                text-align:center;
                                border-top:1px solid #e2e8f0;">

                        <p style="font-size:12px;color:#64748b;
                                  margin:0;">
                            © 2026 Stationery Store.
                            All rights reserved.
                        </p>

                        <p style="font-size:12px;color:#94a3b8;
                                  margin-top:8px;">
                            Đây là email tự động, vui lòng không trả lời.
                        </p>

                    </div>

                </div>
            </body>
            </html>
            """.formatted(safeLink);

        try {
            MimeMessage message = mailSender.createMimeMessage();

            MimeMessageHelper helper =
                    new MimeMessageHelper(message, "UTF-8");

            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject("Stationery Store - Đặt lại mật khẩu");
            helper.setText(html, true);

            mailSender.send(message);

        } catch (MessagingException e) {
            throw new IllegalStateException(
                    "Không thể tạo email đặt lại mật khẩu", e);
        }
    }
}