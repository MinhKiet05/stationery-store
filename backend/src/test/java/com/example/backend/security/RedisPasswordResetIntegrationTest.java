package com.example.backend.security;

import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.PasswordResetEmailSender;
import com.example.backend.services.PasswordResetService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mail.MailSendException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Opt in with an isolated loopback Redis/test double port; never reads REDIS_HOST or production credentials. */
@EnabledIfSystemProperty(named = "test.redis.port", matches = "[0-9]+")
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:redis-password-reset;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.jpa.hibernate.ddl-auto=validate", "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.frontend.reset-password-url=https://example.test/reset-password",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "logging.level.org.hibernate.SQL=WARN",
        "app.redis.enabled=true", "app.redis.host=127.0.0.1", "app.redis.username=", "app.redis.password=",
        "app.redis.ssl-enabled=false", "app.cache.environment=otp-test",
        "app.password-reset.hmac-secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@AutoConfigureMockMvc
class RedisPasswordResetIntegrationTest {
    @DynamicPropertySource static void localRedis(DynamicPropertyRegistry registry) {
        registry.add("app.redis.port", () -> Integer.parseInt(System.getProperty("test.redis.port")));
    }
    @Autowired PasswordResetService service;
    @Autowired UserRepository users;
    @Autowired PasswordResetTokenRepository tokens;
    @Autowired RedisConnectionFactory connections;
    @Autowired PasswordEncoder encoder;
    @Autowired MockMvc mvc;
    @MockitoBean PasswordResetEmailSender email;
    @MockitoSpyBean RedisPasswordResetStore store;
    User user;
    StringRedisTemplate redis;
    final String prefix = "stationery-store:otp-test:security:password-reset:v1:";

    @BeforeEach void setup() {
        redis = new StringRedisTemplate(connections);
        tokens.deleteAll(); users.deleteAll();
        user = users.saveAndFlush(User.builder().username("reset").email("reset@example.test")
                .passwordHash(encoder.encode("old-password")).build());
    }

    @Test void redisKeepsOnlyHmacWithExistingTtlAndCorrectTokenCanOnlyBeUsedOnce() {
        String raw = issue();
        assertThat(tokens.count()).isZero();
        var state = redis.opsForHash().entries(tokenKey(raw));
        assertThat(state.get("digest").toString()).matches("[a-f0-9]{64}");
        assertThat(state.toString()).doesNotContain(raw, raw.substring(23));
        assertThat(redis.getExpire(tokenKey(raw))).isBetween(850L, 900L);
        service.resetPassword(raw, "new-password");
        assertThat(encoder.matches("new-password", users.findById(user.getUserID()).orElseThrow().getPasswordHash())).isTrue();
        rejected(raw);
    }

    @Test void incorrectSecretDoesNotSucceedAndFiveFailuresInvalidateChallenge() throws Exception {
        String raw = issue();
        String wrong = raw.substring(0,23) + (raw.charAt(23) == 'A' ? "B" : "A") + raw.substring(24);
        for (int i=0; i<4; i++) rejected(wrong);
        assertThatThrownBy(() -> service.resetPassword(wrong,"new-password")).isInstanceOf(RateLimitException.class);
        assertThatThrownBy(() -> service.resetPassword(raw,"new-password")).isInstanceOf(RateLimitException.class);
        mvc.perform(post("/api/auth/reset-password").contentType("application/json")
                .content("{\"token\":\""+raw+"\",\"newPassword\":\"new-password\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().exists("Retry-After"));
        assertOldPassword();
    }

    @Test void expiredTokenIsRejected() {
        String raw = issue();
        redis.expire(tokenKey(raw), Duration.ZERO);
        rejected(raw);
        assertOldPassword();
    }

    @Test void concurrentResetAttemptsHaveExactlyOneWinner() throws Exception {
        String raw = issue();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Integer> attempt = () -> {
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                try { service.resetPassword(raw, "new-password"); return 200; }
                catch (ResponseStatusException failure) { return failure.getStatusCode().value(); }
            };
            var first = pool.submit(attempt); var second = pool.submit(attempt); start.countDown();
            assertThat(List.of(first.get(15,TimeUnit.SECONDS), second.get(15,TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200,400);
        }
    }

    @Test void luaConsumptionHasOneWinnerEvenWithoutDatabaseRowLocks() throws Exception {
        String raw = issue();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> attempt = () -> {
                if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("start timeout");
                return store.consume(user.getUserID(),raw);
            };
            var first = pool.submit(attempt); var second = pool.submit(attempt); start.countDown();
            assertThat(List.of(first.get(5,TimeUnit.SECONDS),second.get(5,TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true,false);
        }
    }

    @Test void aSingleWrongAttemptStillAllowsTheCorrectToken() {
        String raw = issue();
        String wrong = raw.substring(0,23) + (raw.charAt(23) == 'A' ? "B" : "A") + raw.substring(24);
        rejected(wrong);
        service.resetPassword(raw,"new-password");
        rejected(raw);
    }

    @Test void resendKeepsCooldownAndReplacingTokenRetiresRedisAndLegacySqlLinks() {
        var legacy = PasswordResetToken.builder().user(user).tokenHash("0".repeat(64))
                .createdAt(LocalDateTime.now().minusMinutes(2)).expiresAt(LocalDateTime.now().plusMinutes(10)).build();
        tokens.saveAndFlush(legacy);
        String first = issue();
        service.requestReset(user.getEmail());
        verify(email,times(1)).sendResetLink(anyString(),anyString());
        assertThat(tokens.findById(legacy.getTokenID()).orElseThrow().getUsed()).isTrue();
        redis.opsForHash().put(userKey(), "issued", "0");
        String second = issue();
        assertThat(second).isNotEqualTo(first);
        rejected(first);
        service.resetPassword(second,"new-password");
    }

    @Test void smtpFailurePreservesPreviousTokenAndDoesNotConsumeCooldown() {
        String raw = issue();
        redis.opsForHash().put(userKey(), "issued", "0");
        doThrow(new MailSendException("private SMTP diagnostic")).when(email).sendResetLink(anyString(),anyString());
        service.requestReset(user.getEmail());
        assertThat(store.canIssue(user.getUserID())).isTrue();
        service.resetPassword(raw,"new-password");
    }

    @Test void redisOutageReturns503ForExistingAndUnknownEmailsAndNeverUsesSqlTokens() throws Exception {
        doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Vui long thu lai sau"))
                .when(store).checkAvailable();
        for(String address:List.of(user.getEmail(),"unknown@example.test")) {
            mvc.perform(post("/api/auth/forgot-password").contentType("application/json")
                    .content("{\"email\":\""+address+"\"}")).andExpect(status().isServiceUnavailable());
        }
        verifyNoInteractions(email);
        verify(store,never()).canIssue(anyLong());
        assertThat(tokens.count()).isZero();
        assertOldPassword();
    }

    @Test void redisConsumeFailureDoesNotChangePasswordOrFallBackToSql() {
        String raw = issue();
        doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"Vui long thu lai sau"))
                .when(store).consume(user.getUserID(),raw);
        assertThatThrownBy(() -> service.resetPassword(raw,"new-password")).isInstanceOfSatisfying(ResponseStatusException.class,
                failure -> assertThat(failure.getStatusCode().value()).isEqualTo(503));
        assertOldPassword();
        assertThat(tokens.count()).isZero();
        doCallRealMethod().when(store).consume(user.getUserID(),raw);
        service.resetPassword(raw,"new-password");
        rejected(raw);
    }

    private String issue() {
        service.requestReset(user.getEmail());
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(email,atLeastOnce()).sendResetLink(eq(user.getEmail()),link.capture());
        return URLDecoder.decode(link.getValue().substring(link.getValue().indexOf("token=")+6), StandardCharsets.UTF_8);
    }
    private void rejected(String raw) {
        assertThatThrownBy(() -> service.resetPassword(raw,"new-password")).isInstanceOfSatisfying(ResponseStatusException.class,
                failure -> assertThat(failure.getStatusCode().value()).isEqualTo(400));
    }
    private void assertOldPassword() { assertThat(encoder.matches("old-password",users.findById(user.getUserID()).orElseThrow().getPasswordHash())).isTrue(); }
    private String userKey() { return prefix+"user:"+user.getUserID(); }
    private String tokenKey(String raw) { return prefix+"challenge:"+raw.substring(0,22); }
}
