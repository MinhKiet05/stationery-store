package com.example.backend.services.impl;

import com.example.backend.model.PasswordResetToken;
import com.example.backend.model.User;
import com.example.backend.repositories.PasswordResetTokenRepository;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.PasswordResetEmailSender;
import com.example.backend.services.PasswordResetService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PasswordResetServiceImpl implements PasswordResetService {
    private static final int TOKEN_TTL_MINUTES = 15;
    private static final int MIN_REQUEST_INTERVAL_SECONDS = 60;
    private static final SecureRandom RNG = new SecureRandom();

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetEmailSender emailSender;
    private final EntityManager em;

    @Value("${app.frontend.reset-password-url}")
    private String resetPasswordUrl;

    @Override
    @Transactional
    public void requestReset(String email) {
        // Return the same generic result for unknown / disabled accounts.
        if (email == null) return;
        users.findByEmail(email.strip()).ifPresent(user -> {
            if (!Boolean.TRUE.equals(user.getIsActive())) return;

            // Serialize requests for one user to prevent concurrent token issuance.
            User locked = em.find(User.class, user.getUserID(), LockModeType.PESSIMISTIC_WRITE);
            List<PasswordResetToken> existing = tokens.findByUser_UserID(locked.getUserID());
            LocalDateTime now = LocalDateTime.now();
            boolean tooSoon = existing.stream().anyMatch(t ->
                    now.isBefore(t.getCreatedAt().plusSeconds(MIN_REQUEST_INTERVAL_SECONDS)));
            if (tooSoon) return;

            // Keep previous valid tokens usable until SMTP succeeds; rollback if email fails.
            byte[] bytes = new byte[32];
            RNG.nextBytes(bytes);
            String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            PasswordResetToken token = new PasswordResetToken();
            token.setUser(locked);
            token.setTokenHash(sha256(raw));
            token.setExpiresAt(now.plusMinutes(TOKEN_TTL_MINUTES));
            token.setUsed(false);
            tokens.saveAndFlush(token);

            String link = resetPasswordUrl + (resetPasswordUrl.contains("?") ? "&" : "?")
                    + "token=" + URLEncoder.encode(raw, StandardCharsets.UTF_8);
            emailSender.sendResetLink(locked.getEmail(), link);
        });
    }

    @Override
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 256) {
            throw invalidToken();
        }
        if (newPassword == null || newPassword.length() < 8 || newPassword.length() > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Mat khau phai co tu 8 den 72 ky tu");
        }
        PasswordResetToken token = tokens.findByTokenHash(sha256(rawToken.strip()))
                .orElseThrow(this::invalidToken);

        // Serializes simultaneous attempts with the same token.
        token = em.find(PasswordResetToken.class, token.getTokenID(), LockModeType.PESSIMISTIC_WRITE);
        if (Boolean.TRUE.equals(token.getUsed()) ||
                token.getExpiresAt() == null ||
                !token.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw invalidToken();
        }
        User user = em.find(User.class, token.getUser().getUserID(), LockModeType.PESSIMISTIC_WRITE);
        if (!Boolean.TRUE.equals(user.getIsActive())) throw invalidToken();

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        tokens.findByUser_UserID(user.getUserID()).forEach(item -> item.setUsed(true));
        token.setUsed(true);
        users.save(user);
        tokens.flush();
        // Existing stateless JWTs stay valid until expiration unless a token-revocation
        // mechanism is added separately to SecurityConfig / JWT validation.
    }

    private String sha256(String value) {
        try {
            byte[] hashed = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private ResponseStatusException invalidToken() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Lien ket dat lai mat khau khong hop le hoac da het han");
    }
}
