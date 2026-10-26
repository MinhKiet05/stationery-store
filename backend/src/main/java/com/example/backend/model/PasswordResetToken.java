package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "password_reset_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PasswordResetToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long tokenID;

    // Người dùng yêu cầu đặt lại mật khẩu
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Chỉ lưu hash của token
    @Column(nullable = false, unique = true, length = 64)
    private String tokenHash;

    // Thời gian hết hạn
    @Column(nullable = false)
    private LocalDateTime expiresAt;

    // Đã sử dụng hay chưa
    @Builder.Default
    @Column(nullable = false)
    private Boolean used = false;

    // Thời gian tạo
    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}