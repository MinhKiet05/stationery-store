package com.example.backend.services.impl;

import com.example.backend.services.PasswordResetEmailSender;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@Slf4j
@ConditionalOnProperty(name = "app.mail.provider", havingValue = "brevo")
public class BrevoPasswordResetEmailSender implements PasswordResetEmailSender {
    private record Address(String email, String name) {
        @Override public String toString() { return "MailAddress[redacted]"; }
    }
    private record Recipient(String email) {
        @Override public String toString() { return "MailRecipient[redacted]"; }
    }
    private record DeliveryRequest(Address sender, List<Recipient> to, String subject, String htmlContent) {
        @Override public String toString() { return "PasswordResetEmail[redacted]"; }
    }
    private record Acceptance(String messageId) {
        @Override public String toString() { return "EmailAcceptance[redacted]"; }
    }
    private static final Set<String> ERROR_CODES = Set.of("invalid_parameter", "missing_parameter", "unauthorized",
            "permission_denied", "not_enough_credits", "duplicate_parameter", "method_not_allowed", "out_of_range",
            "not_acceptable", "too_many_requests", "account_under_validation", "account_not_activated");
    private final RestClient client;
    private final Address sender;

    @Autowired
    public BrevoPasswordResetEmailSender(PasswordResetMailClient clients,
            @Value("${app.mail.brevo-api-key:}") String key,
            @Value("${app.mail.from:}") String from,
            @Value("${app.mail.from-name:Stationery Store}") String name) {
        this(clients.create("https://api.brevo.com/v3", "api-key", key), from, name);
    }

    BrevoPasswordResetEmailSender(RestClient client, String from, String name) {
        try {
            new InternetAddress(from, true).validate();
        } catch (AddressException failure) {
            throw new IllegalArgumentException("MAIL_FROM must be a valid verified sender email");
        }
        if (name.isBlank()) throw new IllegalArgumentException("MAIL_FROM_NAME must not be blank");
        this.client = client;
        this.sender = new Address(from, name);
    }

    @Override
    public void sendResetLink(String to, String link) {
        long started = System.nanoTime();
        log.info("event=email_delivery_attempted provider=brevo elapsed_ms=0");
        try {
            var response = client.post().uri("/smtp/email").contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(new DeliveryRequest(sender, List.of(new Recipient(to)), "Stationery Store - Đặt lại mật khẩu",
                            PasswordResetEmailTemplate.html(link)))
                    .retrieve().toEntity(Acceptance.class);
            Acceptance accepted = response.getBody();
            int status = response.getStatusCode().value();
            if (status != 201 || accepted == null || accepted.messageId() == null || accepted.messageId().isBlank()) {
                failed(status, "unexpected_response", "Provider returned no valid acceptance", started);
                throw new MailSendException("Brevo returned no valid acceptance");
            }
            log.info("event=email_provider_accepted provider=brevo status={} elapsed_ms={} delivery_confirmed=false", status, elapsed(started));
        } catch (RestClientResponseException failure) {
            String code = "unrecognized";
            String message = "Provider rejected request; review Brevo transactional logs";
            try {
                Map<?, ?> error = failure.getResponseBodyAs(Map.class);
                if (error != null) {
                    if (error.get("code") instanceof String value && ERROR_CODES.contains(value)) code = value;
                    // Never print raw provider text: it may echo addresses, tokens or API keys.
                    if (error.get("message") instanceof String value) {
                        String lower = value.toLowerCase(Locale.ROOT);
                        if (lower.contains("sender") && (lower.contains("verif") || lower.contains("valid"))) {
                            message = "Sender verification or sender configuration rejected";
                        } else if (lower.contains("activat") || lower.contains("under validation")) {
                            message = "Transactional account requires activation or review";
                        }
                    }
                }
            } catch (RuntimeException ignored) { /* Unparseable provider errors stay redacted. */ }
            int status = failure.getStatusCode().value();
            if (status == 401) message = "API authentication rejected";
            else if (status == 429) message = "Provider rate limit or sending quota reached";
            else if (status >= 500) message = "Provider temporarily unavailable";
            log.warn("event=email_provider_rejected provider=brevo status={} code={} message={} elapsed_ms={}", status, code, message, elapsed(started));
            failed(status, code, message, started);
            throw new MailSendException("Brevo rejected email request");
        } catch (RestClientException | IllegalArgumentException failure) {
            var diagnostic = MailFailureDiagnostics.describe(failure);
            failed(0, diagnostic.reason(), "Transport or response failed: " + diagnostic.causeType(), started);
            throw new MailSendException("Brevo email transport or response failed");
        }
    }

    private static long elapsed(long started) { return (System.nanoTime() - started) / 1_000_000; }
    private void failed(int status, String code, String message, long started) {
        log.warn("event=email_delivery_failed provider=brevo status={} code={} message={} elapsed_ms={}", status, code, message, elapsed(started));
    }
}
