package com.example.backend.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Component @RequiredArgsConstructor
public class ChatRateLimiter {
    private final AiProperties properties;
    private final Map<String, Window> windows = new HashMap<>();
    public synchronized void check(String address) {
        long now = System.currentTimeMillis();
        windows.entrySet().removeIf(e -> now - e.getValue().start >= 60_000);
        if (!windows.containsKey(address) && windows.size() >= 10_000) reject();
        Window window = windows.computeIfAbsent(address, k -> new Window(now));
        if (++window.count > Math.max(1, properties.getChatRequestsPerMinute())) reject();
    }
    private void reject() { throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bạn gửi hơi nhanh. Vui lòng thử lại sau một phút."); }
    private static class Window { final long start; int count; Window(long start) { this.start = start; } }
}
