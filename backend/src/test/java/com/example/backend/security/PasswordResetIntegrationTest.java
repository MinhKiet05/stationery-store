package com.example.backend.security;

import com.example.backend.model.PasswordResetToken;
import com.example.backend.model.User;
import com.example.backend.repositories.PasswordResetTokenRepository;
import com.example.backend.repositories.UserRepository;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import jakarta.servlet.DispatcherType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.regex.Pattern;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real security chain, validation, transactions, repositories and SMTP composition; no network mail. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:password-reset;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.jpa.hibernate.ddl-auto=validate",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.frontend.url=https://stationery-store-nu.vercel.app",
        "app.frontend.reset-password-url=https://stationery-store-nu.vercel.app/reset-password",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.redis.enabled=false"
})
@AutoConfigureMockMvc
class PasswordResetIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordResetTokenRepository tokens;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired JwtTokenService jwtTokens;
    @MockitoBean JavaMailSender mail;
    // These tests isolate reset-token business rules; HTTP counter behavior has dedicated tests.
    @MockitoBean RequestRateLimiter requestLimits;
    User user;

    @BeforeEach
    void setup() {
        tokens.deleteAll();
        users.deleteAll();
        user = users.saveAndFlush(User.builder().username("reset-user").email("reset@example.test")
                .passwordHash(encoder.encode("old-password")).build());
        when(mail.createMimeMessage()).thenAnswer(invocation -> new MimeMessage((Session) null));
    }

    @Test
    void anonymousRequestCreatesHashedExpiringTokenAndComposesEmail() throws Exception {
        var before = LocalDateTime.now();
        forgot("reset@example.test", null);
        var stored = tokens.findAll().getFirst();
        var raw = emailedToken();
        assertThat(raw).matches("[A-Za-z0-9_-]{43}");
        assertThat(stored.getTokenHash()).isEqualTo(hash(raw)).isNotEqualTo(raw);
        assertThat(stored.getUsed()).isFalse();
        assertThat(stored.getCreatedAt()).isBetween(before, LocalDateTime.now());
        assertThat(stored.getExpiresAt()).isBetween(before.plusMinutes(15), LocalDateTime.now().plusMinutes(15));
    }

    @Test
    void expiredSignedJwtDoesNotBlockForgotPassword() throws Exception {
        forgot(user.getEmail(), expiredJwt());
        assertThat(tokens.count()).isEqualTo(1);
        emailedToken();
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-jwt", "bad token", "null"})
    void malformedBearerDoesNotBlockForgotPassword(String token) throws Exception {
        forgot(user.getEmail(), token);
        assertThat(tokens.count()).isEqualTo(1);
    }

    @Test
    void unknownAndInactiveEmailsReturnSameGenericResponse() throws Exception {
        var known = forgot(user.getEmail(), null);
        var unknown = forgot("unknown@example.test", null);
        user.setIsActive(false);
        users.saveAndFlush(user);
        var inactive = forgot(user.getEmail(), null);
        assertThat(unknown).isEqualTo(known).isEqualTo(inactive);
        verify(mail, times(1)).send(any(MimeMessage.class));
        assertThat(tokens.count()).isEqualTo(1);
    }

    @Test
    void emailLookupMatchesRegistrationNormalization() throws Exception {
        forgot("RESET@EXAMPLE.TEST", null);
        assertThat(tokens.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"invalid", "", "a@", " "})
    void rejectsInvalidEmailWithoutEmailOrToken(String email) throws Exception {
        mvc.perform(post("/api/auth/forgot-password").contentType("application/json")
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isBadRequest());
        assertThat(tokens.count()).isZero();
        verifyNoInteractions(mail);
    }

    @Test
    void malformedJsonDoesNotExposeParserDiagnostics() throws Exception {
        mvc.perform(post("/api/auth/forgot-password").contentType("application/json").content("{"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
        verifyNoInteractions(mail);
    }

    @Test
    void preservesRequestCooldown() throws Exception {
        forgot(user.getEmail(), null);
        forgot(user.getEmail(), null);
        assertThat(tokens.count()).isEqualTo(1);
        verify(mail, times(1)).send(any(MimeMessage.class));
    }

    @Test
    void resetEncodesPasswordInvalidatesAllTokensAndCannotBeReplayed() throws Exception {
        forgot(user.getEmail(), null);
        String raw = emailedToken();
        var another = tokens.saveAndFlush(PasswordResetToken.builder().user(user)
                .tokenHash(hash("another-token")).expiresAt(LocalDateTime.now().plusMinutes(15)).build());
        mvc.perform(post("/api/auth/reset-password").header("Authorization", "Bearer " + expiredJwt())
                        .contentType("application/json").content(resetBody(raw)))
                .andExpect(status().isOk());
        assertThat(encoder.matches("new-password", users.findById(user.getUserID()).orElseThrow().getPasswordHash())).isTrue();
        assertThat(tokens.findAll()).allMatch(t -> Boolean.TRUE.equals(t.getUsed()));
        resetRejected(raw);
        resetRejected("another-token");
        assertThat(tokens.findById(another.getTokenID()).orElseThrow().getUsed()).isTrue();
    }

    @Test
    void expiredUnknownAndDisabledAccountTokensAreRejected() throws Exception {
        forgot(user.getEmail(), null);
        String raw = emailedToken();
        var token = tokens.findAll().getFirst();
        token.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        tokens.saveAndFlush(token);
        resetRejected(raw);
        resetRejected("unknown-token");
        token.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        tokens.saveAndFlush(token);
        user.setIsActive(false);
        users.saveAndFlush(user);
        resetRejected(raw);
        assertThat(encoder.matches("old-password", users.findById(user.getUserID()).orElseThrow().getPasswordHash())).isTrue();
    }

    @Test
    void concurrentResetsAllowOnlyOneUse() throws Exception {
        forgot(user.getEmail(), null);
        String raw = emailedToken();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> attempt = () -> {
                assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                return mvc.perform(post("/api/auth/reset-password").contentType("application/json")
                        .content(resetBody(raw))).andReturn().getResponse().getStatus();
            };
            var first = executor.submit(attempt);
            var second = executor.submit(attempt);
            start.countDown();
            assertThat(java.util.List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 400);
        }
    }

    @Test
    void smtpFailureDoesNotRevealAccountOrConsumeCooldownAndRollsBackToken() throws Exception {
        doThrow(new MailAuthenticationException("secret SMTP diagnostic")).when(mail).send(any(MimeMessage.class));
        var failed = forgot(user.getEmail(), null);
        assertThat(failed).isEqualTo(forgot("unknown@example.test", null)).doesNotContain("secret SMTP");
        assertThat(tokens.count()).isZero();
        doNothing().when(mail).send(any(MimeMessage.class));
        forgot(user.getEmail(), null);
        assertThat(tokens.count()).isEqualTo(1);
    }

    @Test
    void protectedEndpointsStillRequireValidJwtAndEnforceRoles() throws Exception {
        for (String path : new String[]{"/api/auth/me", "/api/users/me", "/api/admin/users"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
            mvc.perform(get(path).header("Authorization", "Bearer " + expiredJwt())).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + jwtTokens.issue(user)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value(user.getUsername()));
        mvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + jwtTokens.issue(user)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/error")).andExpect(status().isUnauthorized());
        mvc.perform(get("/error").with(request -> { request.setDispatcherType(DispatcherType.ERROR); return request; })
                        .requestAttr("jakarta.servlet.error.status_code", 500)
                        .header("Authorization", "Bearer invalid"))
                .andExpect(status().isInternalServerError());
    }

    @Test
    void corsAllowsFrontendAndRejectsUntrustedOrigin() throws Exception {
        mvc.perform(options("/api/auth/forgot-password").header("Origin", "https://stationery-store-nu.vercel.app")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://stationery-store-nu.vercel.app"));
        mvc.perform(options("/api/auth/forgot-password").header("Origin", "https://untrusted.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }

    @Test
    void loginAndRegisterStillWorkWithStaleAuthorization() throws Exception {
        mvc.perform(post("/api/auth/login").header("Authorization", "Bearer invalid")
                        .contentType("application/json").content("{\"username\":\"reset-user\",\"password\":\"old-password\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isNotEmpty());
        mvc.perform(post("/api/auth/register").header("Authorization", "Bearer invalid")
                        .contentType("application/json").content("{\"username\":\"new-user\",\"email\":\"new@example.test\",\"password\":\"new-password\"}"))
                .andExpect(status().isCreated());
    }

    private String forgot(String email, String bearer) throws Exception {
        var request = post("/api/auth/forgot-password").contentType("application/json")
                .content("{\"email\":\"" + email + "\"}");
        if (bearer != null) request.header("Authorization", "Bearer " + bearer);
        return mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.message").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
    }

    private String emailedToken() throws Exception {
        var captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mail).send(captor.capture());
        MimeMessage message = captor.getValue();
        assertThat(message.getAllRecipients()[0].toString()).isEqualTo(user.getEmail());
        assertThat(message.getFrom()[0].toString()).isEqualTo("test@example.test");
        String html = (String) message.getContent();
        var matcher = Pattern.compile("https://stationery-store-nu.vercel.app/reset-password\\?token=([A-Za-z0-9_-]+)").matcher(html);
        assertThat(matcher.find()).isTrue();
        return matcher.group(1);
    }

    private String expiredJwt() {
        var claims = JwtClaimsSet.builder().issuer("stationery-store").subject(user.getUsername())
                .issuedAt(Instant.now().minusSeconds(7200)).expiresAt(Instant.now().minusSeconds(3600)).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    private void resetRejected(String raw) throws Exception {
        mvc.perform(post("/api/auth/reset-password").contentType("application/json").content(resetBody(raw)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
    }

    private String resetBody(String raw) {
        return "{\"token\":\"" + raw + "\",\"newPassword\":\"new-password\"}";
    }

    private String hash(String raw) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
    }
}
