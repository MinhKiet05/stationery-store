package com.example.backend.services.impl;

import com.example.backend.model.PasswordResetToken;
import com.example.backend.model.User;
import com.example.backend.repositories.PasswordResetTokenRepository;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.PasswordResetEmailSender;
import com.example.backend.services.PasswordResetService;
import com.example.backend.security.RedisPasswordResetStore;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Slf4j
@RequiredArgsConstructor
public class PasswordResetServiceImpl implements PasswordResetService {
    private static final int TOKEN_TTL_MINUTES = PasswordResetEmailTemplate.TTL_MINUTES;
    @Value("${app.password-reset.resend-seconds:60}")
    private int minRequestIntervalSeconds = 60;
    private static final SecureRandom RNG = new SecureRandom();

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetEmailSender emailSender;
    private final EntityManager em;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private RedisPasswordResetStore redisTokens;

    @Value("${app.redis.enabled:false}")
    private boolean redisEnabled;

    @jakarta.annotation.PostConstruct
    void verifyStoreSelection() {
        if (redisEnabled && redisTokens == null) throw new IllegalStateException("Redis password reset store is required when Redis is enabled");
    }

    @Value("${app.frontend.reset-password-url}")
    private String resetPasswordUrl;

    @Override
    @Transactional
    public void requestReset(String email) {
        long started = System.nanoTime();
        String requestId = UUID.randomUUID().toString();
        stage(requestId, "request_received", started);
        // Check before account lookup so an outage does not distinguish existing emails.
        if (redisTokens != null) redisTokens.checkAvailable();
        // Return the same generic result for unknown / disabled accounts.
        if (email == null) return;
        long lookupStarted = System.nanoTime();
        var account = users.findByEmailIgnoreCase(email.strip().toLowerCase(Locale.ROOT));
        stage(requestId, "account_lookup_completed", lookupStarted);
        account.ifPresent(user -> {
            if (!Boolean.TRUE.equals(user.getIsActive())) return;

            // Serialize requests for one user to prevent concurrent token issuance.
            User locked = users.findForUpdateById(user.getUserID()).orElseThrow();
            if (!Boolean.TRUE.equals(locked.getIsActive())) return;
            List<PasswordResetToken> existing = tokens.findByUser_UserID(locked.getUserID());
            LocalDateTime now = LocalDateTime.now();
            boolean tooSoon = existing.stream().anyMatch(t ->
                    now.isBefore(t.getCreatedAt().plusSeconds(minRequestIntervalSeconds)));
            if (tooSoon) { stage(requestId, "issuance_throttled", started); return; }
            if (redisTokens != null && !redisTokens.canIssue(locked.getUserID())) return;

            long tokenStarted = System.nanoTime();
            // Keep previous valid links usable until the provider accepts; rollback on failure.
            byte[] bytes = new byte[32];
            RNG.nextBytes(bytes);
            String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            if (redisTokens != null) {
                byte[] challenge = new byte[16]; RNG.nextBytes(challenge);
                raw = Base64.getUrlEncoder().withoutPadding().encodeToString(challenge) + "." + raw;
            }
            if (redisTokens == null) {
                PasswordResetToken token = new PasswordResetToken();
                token.setUser(locked);
                token.setTokenHash(sha256(raw));
                token.setExpiresAt(now.plusMinutes(TOKEN_TTL_MINUTES));
                token.setUsed(false);
                tokens.saveAndFlush(token);
            }

            stage(requestId, "token_generated", tokenStarted);
            String link = resetPasswordUrl + (resetPasswordUrl.contains("?") ? "&" : "?")
                    + "token=" + URLEncoder.encode(raw, StandardCharsets.UTF_8);
            long deliveryStarted = System.nanoTime();
            stage(requestId, "email_delivery_attempted", deliveryStarted);
            try {
                emailSender.sendResetLink(locked.getEmail(), link);
            } catch (MailException exception) {
                // A different HTTP result only for registered emails would reveal accounts.
                // Roll back issuance so delivery can be retried without consuming cooldown.
                TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
                var diagnostic = MailFailureDiagnostics.describe(exception);
                log.warn("event=password_reset stage=email_delivery_failed request_id={} reason={} cause_type={} elapsed_ms={} issuance=rolled_back",
                        requestId, diagnostic.reason(), diagnostic.causeType(), elapsed(deliveryStarted));
                return;
            }
            stage(requestId, "email_provider_accepted", deliveryStarted);
            // Do not replace an active link or consume cooldown until delivery succeeds.
            if (redisTokens != null) {
                existing.forEach(item -> item.setUsed(true));
                tokens.flush(); // Retire legacy SQL links without deleting production rows.
                redisTokens.activate(locked.getUserID(), raw, Duration.ofMinutes(TOKEN_TTL_MINUTES));
            } else {
                existing.forEach(item -> item.setUsed(true));
            }
            afterCommit(requestId, "token_issuance_committed", started);
        });
        stage(requestId, "request_processed", started);
    }

    @Override
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        long started = System.nanoTime();
        String requestId = UUID.randomUUID().toString();
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 256) {
            throw invalidToken();
        }
        if (newPassword == null || newPassword.length() < 8 || newPassword.length() > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Mat khau phai co tu 8 den 72 ky tu");
        }
        if (newPassword.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mat khau moi vuot qua 72 byte UTF-8");
        }
        if (redisTokens != null) {
            resetUsingRedis(rawToken.strip(), newPassword);
            afterCommit(requestId, "reset_completed", started);
            return;
        }
        PasswordResetToken token = tokens.findByTokenHash(sha256(rawToken.strip()))
                .orElseThrow(this::invalidToken);

        // Lock in the same order as issuance. Refresh the already loaded token after
        // waiting: find() alone can keep a stale 'used=false' in the persistence context.
        User user = users.findForUpdateById(token.getUser().getUserID()).orElseThrow(this::invalidToken);
        em.refresh(token, LockModeType.PESSIMISTIC_WRITE);
        if (Boolean.TRUE.equals(token.getUsed()) ||
                token.getExpiresAt() == null ||
                !token.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw invalidToken();
        }
        if (!Boolean.TRUE.equals(user.getIsActive())) throw invalidToken();

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        tokens.findByUser_UserID(user.getUserID()).forEach(item -> item.setUsed(true));
        token.setUsed(true);
        users.save(user);
        tokens.flush();
        afterCommit(requestId, "reset_completed", started);
        // Existing stateless JWTs stay valid until expiration unless a token-revocation
        // mechanism is added separately to SecurityConfig / JWT validation.
    }

    private void resetUsingRedis(String rawToken, String newPassword) {
        Long userID = redisTokens.findUser(rawToken);
        if (userID == null) throw invalidToken();
        User user = users.findForUpdateById(userID).orElseThrow(this::invalidToken);
        if (!Boolean.TRUE.equals(user.getIsActive())) throw invalidToken();
        if (!redisTokens.consume(userID, rawToken)) throw invalidToken();
        // A consumed Redis token is never restored if SQL fails: request a new link instead.
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        tokens.findByUser_UserID(userID).forEach(item -> item.setUsed(true));
        users.save(user);
        tokens.flush();
    }

    private static long elapsed(long started) { return (System.nanoTime() - started) / 1_000_000; }

    private void stage(String requestId, String stage, long started) {
        log.info("event=password_reset stage={} request_id={} elapsed_ms={}", stage, requestId, elapsed(started));
    }

    private void afterCommit(String requestId, String stage, long started) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { stage(requestId, stage, started); }
        });
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
