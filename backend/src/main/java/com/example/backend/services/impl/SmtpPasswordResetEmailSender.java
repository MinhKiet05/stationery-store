package com.example.backend.services.impl;

import com.example.backend.services.PasswordResetEmailSender;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SmtpPasswordResetEmailSender implements PasswordResetEmailSender {
    private final JavaMailSender mailSender;
    @Value("${app.mail.from}") private String from;
    @Override
    public void sendResetLink(String to, String resetUrl) {
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(from);
        msg.setTo(to);
        msg.setSubject("Stationery Store - Dat lai mat khau");
        msg.setText("Ban da yeu cau dat lai mat khau. Mo lien ket sau trong 15 phut:\n"
            + resetUrl
            + "\n\nNeu ban khong yeu cau, vui long bo qua email nay.");
        mailSender.send(msg);
    }
}
