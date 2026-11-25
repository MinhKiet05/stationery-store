package com.example.backend.services.impl;

import jakarta.mail.MessagingException;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;

import javax.net.ssl.SSLException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.IdentityHashMap;

/** Classify nested JavaMail failures without exposing exception messages or stack traces. */
final class MailFailureDiagnostics {
    record Diagnostic(String reason, String causeType) {}

    static Diagnostic describe(Throwable failure) {
        var queue = new ArrayDeque<Throwable>();
        var seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
        queue.add(failure);
        Diagnostic result = new Diagnostic("delivery_failed", failure.getClass().getSimpleName());
        while (!queue.isEmpty() && seen.size() < 32) {
            Throwable item = queue.remove();
            if (!seen.add(item)) continue;
            String reason = item instanceof MailAuthenticationException || item instanceof jakarta.mail.AuthenticationFailedException ? "authentication_failed"
                    : item instanceof SSLException ? "tls_failed"
                    : item instanceof UnknownHostException ? "dns_failed"
                    : item instanceof SocketTimeoutException || item instanceof java.net.http.HttpTimeoutException ? "connection_or_read_timeout"
                    : item instanceof ConnectException ? "connection_refused_or_blocked" : null;
            if (reason != null) result = new Diagnostic(reason, item.getClass().getSimpleName());
            else if (result.reason().equals("delivery_failed")) result = new Diagnostic("delivery_failed", item.getClass().getSimpleName());
            if (item.getCause() != null) queue.add(item.getCause());
            if (item instanceof MessagingException mail && mail.getNextException() != null) queue.add(mail.getNextException());
            if (item instanceof MailSendException mail) {
                for (Exception nested : mail.getMessageExceptions()) queue.add(nested);
            }
        }
        return result;
    }

    private MailFailureDiagnostics() {}
}
