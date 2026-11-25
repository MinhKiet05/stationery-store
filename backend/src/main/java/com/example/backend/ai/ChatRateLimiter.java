package com.example.backend.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import com.example.backend.security.RequestRateLimiter;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import java.time.Duration;

@Component @RequiredArgsConstructor
public class ChatRateLimiter {
    private final AiProperties properties;
    private final RequestRateLimiter limiter;
    public void check(String address) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        String identity = auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken)
                ? "user:" + auth.getName() : "ip:" + address;
        limiter.acquire("chat", identity, Math.max(1, properties.getChatRequestsPerMinute()), Duration.ofMinutes(1));
    }
}
