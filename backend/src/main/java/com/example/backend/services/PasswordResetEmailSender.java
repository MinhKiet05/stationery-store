package com.example.backend.services;
public interface PasswordResetEmailSender {
    void sendResetLink(String to, String resetUrl);
}
