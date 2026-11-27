package com.example.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.UUID;

/** Server-generated correlation only; client-controlled IDs and request bodies are never logged. */
@Component
@Slf4j
public class ReturnSubmissionTraceFilter extends OncePerRequestFilter {
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !"/api/returns".equals(request.getServletPath());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String trace = UUID.randomUUID().toString();
        response.setHeader("X-Return-Request-ID", trace);
        long started = System.nanoTime();
        boolean completed = false;
        try (var ignored = MDC.putCloseable("return_request_id", trace)) {
            try {
                chain.doFilter(request, response);
                completed = true;
            } finally {
                // Completion of the servlet chain does not prove receipt by the browser.
                log.info("return_submit request_id={} phase=http_response status={} chain_completed={} elapsed_ms={}",
                        trace, response.getStatus(), completed, (System.nanoTime() - started) / 1_000_000);
            }
        }
    }
}
