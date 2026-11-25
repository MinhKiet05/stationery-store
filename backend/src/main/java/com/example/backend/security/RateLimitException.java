package com.example.backend.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class RateLimitException extends ResponseStatusException {
    private final long retryAfter;
    public RateLimitException(long retryAfter) {
        this(HttpStatus.TOO_MANY_REQUESTS, "Ban gui yeu cau qua nhanh. Vui long thu lai sau.", retryAfter);
    }
    private RateLimitException(HttpStatus status, String message, long retryAfter) {
        super(status, message);
        this.retryAfter = Math.max(1, retryAfter);
    }
    public long retryAfter() { return retryAfter; }
    public static RateLimitException unavailable() {
        return new RateLimitException(HttpStatus.SERVICE_UNAVAILABLE,
                "Khong the xac minh gioi han bao mat luc nay. Vui long thu lai sau.", 5);
    }
}
