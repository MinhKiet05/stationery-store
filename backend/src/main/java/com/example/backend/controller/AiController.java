package com.example.backend.controller;

import com.example.backend.ai.*;
import com.example.backend.dto.ai.*;
import com.example.backend.services.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController @RequiredArgsConstructor
public class AiController {
    private final RecommendationService recommendations;
    private final ShoppingChatService chat;
    private final ChatRateLimiter limiter;
    private final ProductIndexJob index;
    @GetMapping("/api/recommendations/me")
    public RecommendationResponse me(Authentication authentication, @RequestParam(defaultValue = "3") @Min(1) @Max(12) int limit) {
        return recommendations.recommend(authentication.getName(), limit);
    }
    @GetMapping("/api/recommendations/popular")
    public RecommendationResponse popular(@RequestParam(defaultValue = "3") @Min(1) @Max(12) int limit) {
        return recommendations.popular(limit);
    }
    @PostMapping("/api/ai/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request, HttpServletRequest http) {
        limiter.check(http.getRemoteAddr()); // Do not trust spoofable X-Forwarded-For headers.
        return chat.chat(request.message().trim());
    }
    @PostMapping("/api/admin/ai/index")
    public ProductIndexJob.IndexResult index() {
        try { return index.reindex(); }
        catch (RuntimeException ex) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Không thể index. Kiểm tra Ollama và pgvector."); }
    }
}
