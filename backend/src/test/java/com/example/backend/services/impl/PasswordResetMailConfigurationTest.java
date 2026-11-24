package com.example.backend.services.impl;

import com.example.backend.services.PasswordResetEmailSender;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(OutputCaptureExtension.class)
class PasswordResetMailConfigurationTest {
    private final ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger)
            org.slf4j.LoggerFactory.getLogger(PasswordResetMailClient.class);
    private ch.qos.logback.classic.Level priorLevel;
    @BeforeEach void captureConfigurationLogs() {
        priorLevel = logger.getLevel(); logger.setLevel(ch.qos.logback.classic.Level.INFO);
    }
    @AfterEach void restoreLogging() { logger.setLevel(priorLevel); }
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(PasswordResetMailClient.class, BrevoPasswordResetEmailSender.class,
                    ResendPasswordResetEmailSender.class, SmtpPasswordResetEmailSender.class)
            .withBean(JavaMailSender.class, () -> mock(JavaMailSender.class))
            .withPropertyValues("MAIL_FROM=stationerystoreservice@gmail.com", "BREVO_API_KEY=test-brevo-key",
                    "RESEND_API_KEY=test-resend-key", "MAIL_CONNECT_TIMEOUT_MS=5000", "MAIL_READ_TIMEOUT_MS=10000");

    @ParameterizedTest @ValueSource(strings = {"brevo", "resend", "smtp"})
    void selectsExactlyOneProviderThroughEnvironment(String provider, CapturedOutput output) {
        runner.withPropertyValues("MAIL_PROVIDER=" + provider).run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(PasswordResetEmailSender.class);
            Class<?> expected = switch (provider) {
                case "brevo" -> BrevoPasswordResetEmailSender.class;
                case "resend" -> ResendPasswordResetEmailSender.class;
                default -> SmtpPasswordResetEmailSender.class;
            };
            assertThat(context.getBean(PasswordResetEmailSender.class)).isInstanceOf(expected);
            verifyNoInteractions(context.getBean(JavaMailSender.class));
        });
        assertThat(output.getAll()).contains("provider=" + provider, "connect_timeout_ms=5000", "read_timeout_ms=10000", "fallback=disabled")
                .doesNotContain("test-brevo-key", "test-resend-key", "stationerystoreservice@gmail.com");
        if (provider.equals("brevo")) assertThat(output.getAll()).contains("gmail_sender_may_be_rewritten_by_provider");
    }

    @Test void smtpRemainsDefaultForExistingInstallations() {
        runner.run(context -> assertThat(context.getBean(PasswordResetEmailSender.class)).isInstanceOf(SmtpPasswordResetEmailSender.class));
    }

    @Test void missingBrevoKeyFailsBeforeSending() {
        runner.withPropertyValues("MAIL_PROVIDER=brevo", "BREVO_API_KEY=").run(context -> assertThat(context).hasFailed());
    }

    @Test void invalidTimeoutFailsAtStartup() {
        runner.withPropertyValues("MAIL_PROVIDER=brevo", "MAIL_READ_TIMEOUT_MS=0").run(context -> assertThat(context).hasFailed());
    }
}
