package com.example.backend.controller;

import com.example.backend.dto.passwordreset.*;
import com.example.backend.services.PasswordResetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class PasswordResetController {
    private final PasswordResetService service;

    @PostMapping("/forgot-password")
    public PasswordResetMessageResponse forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        service.requestReset(request.email());
        return new PasswordResetMessageResponse(
                "Nếu email tồn tại, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.");
    }

    @PostMapping("/reset-password")
    public PasswordResetMessageResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        service.resetPassword(request.token(), request.newPassword());
        return new PasswordResetMessageResponse("Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.");
    }
}
