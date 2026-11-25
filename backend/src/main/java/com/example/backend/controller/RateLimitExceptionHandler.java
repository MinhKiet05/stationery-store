package com.example.backend.controller;

import com.example.backend.security.RateLimitException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RateLimitExceptionHandler {
    @ExceptionHandler(RateLimitException.class)
    public ResponseEntity<ProblemDetail> limited(RateLimitException error) {
        return ResponseEntity.status(error.getStatusCode())
                .header(HttpHeaders.RETRY_AFTER, Long.toString(error.retryAfter()))
                .body(ProblemDetail.forStatusAndDetail(error.getStatusCode(), error.getReason()));
    }
}
