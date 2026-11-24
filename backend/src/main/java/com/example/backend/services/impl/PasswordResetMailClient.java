package com.example.backend.services.impl;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;

/** Shared, bounded HTTPS transport. One selected provider, no automatic provider fallback. */
@Component
@Slf4j
public class PasswordResetMailClient {
    private final HttpClient http;
    private final JdkClientHttpRequestFactory factory;

    public PasswordResetMailClient(@Value("${app.mail.provider:smtp}") String provider,
            @Value("${app.mail.connect-timeout-ms:5000}") int connectTimeout,
            @Value("${app.mail.read-timeout-ms:10000}") int readTimeout,
            @Value("${app.mail.from:}") String from) {
        if (!Set.of("brevo", "resend", "smtp").contains(provider)) {
            throw new IllegalArgumentException("MAIL_PROVIDER must be brevo, resend or smtp");
        }
        if (connectTimeout < 1 || readTimeout < 1) throw new IllegalArgumentException("Mail timeouts must be positive");
        http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(connectTimeout))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofMillis(readTimeout));
        log.info("event=password_reset_mail_config provider={} connect_timeout_ms={} read_timeout_ms={} fallback=disabled",
                provider, connectTimeout, readTimeout);
        if (provider.equals("brevo") && from.toLowerCase(Locale.ROOT).endsWith("@gmail.com")) {
            log.warn("event=password_reset_mail_config provider=brevo warning=gmail_sender_may_be_rewritten_by_provider verify_sender_and_review_brevo_policy=true");
        }
    }

    RestClient create(String baseUrl, String keyHeader, String key) {
        if (key == null || key.isBlank()) throw new IllegalArgumentException("Selected HTTPS mail provider requires its API key");
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory)
                .defaultHeader(keyHeader, key).build();
    }

    @jakarta.annotation.PreDestroy
    void close() { http.close(); }
}
