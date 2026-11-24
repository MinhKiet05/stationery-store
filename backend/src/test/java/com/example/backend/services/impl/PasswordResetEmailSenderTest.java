package com.example.backend.services.impl;

import jakarta.mail.MessagingException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.SocketTimeoutException;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
class PasswordResetEmailSenderTest {
    @Test void httpsTransportSendsBrandedLinkAndRequiresProviderAcceptance(org.springframework.boot.test.system.CapturedOutput output) {
        var builder = RestClient.builder().baseUrl("https://api.resend.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.resend.com/emails"))
                .andExpect(jsonPath("$.to[0]").value("recipient@example.test"))
                .andExpect(jsonPath("$.html").value(org.hamcrest.Matchers.containsString("/reset-password?token=test-token")))
                .andRespond(withSuccess("{\"id\":\"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794\"}", MediaType.APPLICATION_JSON));
        var sender = new ResendPasswordResetEmailSender(builder.build(), "sender@example.test");
        sender.sendResetLink("recipient@example.test", "https://shop.example.test/reset-password?token=test-token");
        server.verify();
        assertThat(output.getAll()).doesNotContain("test-token", "recipient@example.test", "sender@example.test");
        String html = PasswordResetEmailTemplate.html("https://shop.example.test/reset-password?token=test-token&other=value");
        assertThat(html).contains("ĐẶT LẠI MẬT KHẨU", "15 phút", "#f97316", "#0b1425", "&amp;other=value")
                .doesNotContain("#2563eb", "<code>");
    }

    @Test void providerRejectionIsNotReportedAsAcceptanceOrRetriedAndDoesNotExposeResponse() {
        var builder = RestClient.builder().baseUrl("https://api.resend.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("private-api-key token private@example.test"));
        var sender = new ResendPasswordResetEmailSender(builder.build(), "sender@example.test");
        assertThatThrownBy(() -> sender.sendResetLink("recipient@example.test", "https://shop.example.test/reset-password?token=test-token"))
                .isInstanceOf(MailSendException.class).hasMessage("HTTPS email provider rejected request").hasNoCause();
        server.verify();
    }

    @Test void missingProviderAcceptanceIdIsFailure() {
        var builder = RestClient.builder().baseUrl("https://api.resend.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.resend.com/emails")).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        var sender = new ResendPasswordResetEmailSender(builder.build(), "sender@example.test");
        assertThatThrownBy(() -> sender.sendResetLink("recipient@example.test", "https://shop.example.test/reset-password?token=test-token"))
                .isInstanceOf(MailSendException.class);
        server.verify();
    }

    @Test void diagnosticFindsNestedJavaMailRootCauseWithoutCopyingSecrets() {
        var nested = new MessagingException("private@example.test token=secret",
                new SocketTimeoutException("SMTP password=secret"));
        var failure = new MailSendException(java.util.Map.of("private transport details", nested));
        var diagnostic = MailFailureDiagnostics.describe(failure);
        assertThat(diagnostic.reason()).isEqualTo("connection_or_read_timeout");
        assertThat(diagnostic.causeType()).isEqualTo("SocketTimeoutException");
        assertThat(diagnostic.toString()).doesNotContain("private", "password", "secret", "token=");
    }
}
