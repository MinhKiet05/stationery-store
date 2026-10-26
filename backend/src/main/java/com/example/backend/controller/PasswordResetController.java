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
                "Neu email ton tai, chung toi se gui lien ket dat lai mat khau.");
    }

    @PostMapping("/reset-password")
    public PasswordResetMessageResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        service.resetPassword(request.token(), request.newPassword());
        return new PasswordResetMessageResponse("Dat lai mat khau thanh cong. Vui long dang nhap lai.");
    }
}
