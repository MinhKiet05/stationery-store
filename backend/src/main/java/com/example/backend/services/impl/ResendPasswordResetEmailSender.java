package com.example.backend.services.impl;

import com.example.backend.services.PasswordResetEmailSender;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.mail.MailSendException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** HTTPS transport for hosts that block SMTP. No SDK, retries, or SMTP fallback. */
@Service
@Slf4j
@ConditionalOnProperty(name = "app.mail.provider", havingValue = "resend")
public class ResendPasswordResetEmailSender implements PasswordResetEmailSender {
    // RestClient DEBUG logging calls toString() on the request body. Never give it a raw Map.
    private record DeliveryRequest(String from, List<String> to, String subject, String html) {
        @Override public String toString() { return "PasswordResetEmail[redacted]"; }
    }
    private final RestClient client;
    private final String from;

    @org.springframework.beans.factory.annotation.Autowired
    public ResendPasswordResetEmailSender(@Value("${app.mail.resend-api-key:}") String apiKey,
                                         @Value("${app.mail.from:}") String from) {
        this(createClient(apiKey), from);
    }

    // Allows loopback/mocked transport tests without contacting an email provider.
    ResendPasswordResetEmailSender(RestClient client, String from) {
        if (from.isBlank()) throw new IllegalArgumentException("MAIL_FROM is required for Resend");
        this.client = client;
        this.from = from;
    }

    private static RestClient createClient(String key) {
        if (key.isBlank()) throw new IllegalArgumentException("RESEND_API_KEY is required for Resend");
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(4));
        return RestClient.builder().baseUrl("https://api.resend.com").requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + key).build();
    }

    @Override
    public void sendResetLink(String to, String resetLink) {
        try {
            Map<?, ?> result = client.post().uri("/emails").contentType(MediaType.APPLICATION_JSON)
                    .body(new DeliveryRequest(from, List.of(to), "Stationery Store - Đặt lại mật khẩu",
                            PasswordResetEmailTemplate.html(resetLink)))
                    .retrieve().body(Map.class);
            if (result == null || !(result.get("id") instanceof String)) {
                throw new MailSendException("Email provider returned no acceptance ID");
            }
            // Only log a validated provider ID, never the request or response body.
            String id = UUID.fromString((String) result.get("id")).toString();
            log.info("event=password_reset_provider_ack provider=resend message_id={} status=accepted", id);
        } catch (RestClientResponseException failure) {
            log.warn("event=password_reset_provider_rejected provider=resend status={}", failure.getStatusCode().value());
            throw new MailSendException("HTTPS email provider rejected request");
        } catch (RestClientException | IllegalArgumentException failure) {
            // HTTP exceptions can embed bodies containing tokens or addresses. Do not retain them.
            var diagnostic = MailFailureDiagnostics.describe(failure);
            log.warn("event=password_reset_provider_failed provider=resend reason={} cause_type={}",
                    diagnostic.reason(), diagnostic.causeType());
            throw new MailSendException("HTTPS email transport failed");
        }
    }
}
