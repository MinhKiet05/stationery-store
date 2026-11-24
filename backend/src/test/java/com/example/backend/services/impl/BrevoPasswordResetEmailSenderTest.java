package com.example.backend.services.impl;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.SocketTimeoutException;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@ExtendWith(OutputCaptureExtension.class)
class BrevoPasswordResetEmailSenderTest {
    private MockRestServiceServer server;
    private BrevoPasswordResetEmailSender sender;
    private final ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger)
            org.slf4j.LoggerFactory.getLogger(BrevoPasswordResetEmailSender.class);
    private ch.qos.logback.classic.Level priorLevel;

    @BeforeEach void setup() {
        priorLevel = logger.getLevel();
        logger.setLevel(ch.qos.logback.classic.Level.INFO);
        var builder = RestClient.builder().baseUrl("https://api.brevo.com/v3").defaultHeader("api-key", "test-only-key");
        server = MockRestServiceServer.bindTo(builder).build();
        sender = new BrevoPasswordResetEmailSender(builder.build(), "stationerystoreservice@gmail.com", "Stationery Store");
    }

    @AfterEach void restoreLogging() { logger.setLevel(priorLevel); }

    @Test void sendsConfiguredGmailAndActualRecipientWithExistingTemplate(CapturedOutput output) {
        server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
                .andExpect(header("api-key", "test-only-key"))
                .andExpect(jsonPath("$.sender.email").value("stationerystoreservice@gmail.com"))
                .andExpect(jsonPath("$.sender.name").value("Stationery Store"))
                .andExpect(jsonPath("$.to[0].email").value("customer@example.test"))
                .andExpect(jsonPath("$.subject").value("Stationery Store - Đặt lại mật khẩu"))
                .andExpect(jsonPath("$.htmlContent").value(org.hamcrest.Matchers.containsString("/reset-password?token=test-token")))
                .andExpect(jsonPath("$.htmlContent").value(org.hamcrest.Matchers.containsString("15 phút")))
                .andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"messageId\":\"<test@relay.example.test>\"}"));
        send(); server.verify();
        assertThat(output.getAll()).contains("event=email_delivery_attempted", "event=email_provider_accepted", "status=201", "delivery_confirmed=false")
                .doesNotContain("customer@example.test", "stationerystoreservice@gmail.com", "test-only-key", "test-token");
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 401, 403, 429, 500, 503})
    void rejectionFailsOnceWithSafeStatusCodeAndMessage(int status, CapturedOutput output) {
        server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
                .andRespond(withStatus(HttpStatus.valueOf(status)).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"code\":\"invalid_parameter\",\"message\":\"Sender customer@example.test is not verified; api-key=test-only-key token=test-token\"}"));
        assertThatThrownBy(this::send).isInstanceOf(MailSendException.class).hasNoCause();
        server.verify(); // A second request or fallback would fail the expectation.
        assertThat(output.getAll()).contains("event=email_provider_rejected", "provider=brevo", "status=" + status,
                        "code=invalid_parameter", "event=email_delivery_failed", "elapsed_ms=")
                .doesNotContain("customer@example.test", "test-only-key", "test-token", "event=email_provider_accepted");
    }

    @ParameterizedTest @ValueSource(strings = {"connect", "read"})
    void timeoutFailsWithoutRetryOrSensitiveDiagnostics(String kind, CapturedOutput output) {
        server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
                .andRespond(withException(kind.equals("connect")
                        ? new java.net.http.HttpConnectTimeoutException("test-only-key customer@example.test test-token")
                        : new SocketTimeoutException("test-only-key customer@example.test test-token")));
        assertThatThrownBy(this::send).isInstanceOf(MailSendException.class).hasNoCause();
        server.verify();
        assertThat(output.getAll()).contains("event=email_delivery_failed", "connection_or_read_timeout", "status=0")
                .doesNotContain("test-only-key", "customer@example.test", "test-token", "event=email_provider_accepted");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"messageId\":\"\"}", "null", "invalid JSON"})
    void unexpectedResponseDoesNotCountAsAcceptance(String body, CapturedOutput output) {
        server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
                .andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(body));
        assertThatThrownBy(this::send).isInstanceOf(MailSendException.class);
        server.verify();
        assertThat(output.getAll()).contains("event=email_delivery_failed").doesNotContain("event=email_provider_accepted");
    }

    @Test void unparseableProviderErrorIsRedacted(CapturedOutput output) {
        server.expect(requestTo("https://api.brevo.com/v3/smtp/email"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"code\":\"test-only-key\",\"message\":\"test-token customer@example.test\"}"));
        assertThatThrownBy(this::send).isInstanceOf(MailSendException.class);
        server.verify();
        assertThat(output.getAll()).contains("code=unrecognized").doesNotContain("test-only-key", "test-token", "customer@example.test");
    }

    private void send() { sender.sendResetLink("customer@example.test", "https://shop.example.test/reset-password?token=test-token"); }
}
