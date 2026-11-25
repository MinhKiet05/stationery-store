package com.example.backend.controller;

import com.example.backend.services.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/checkout")
@RequiredArgsConstructor
public class CheckoutController {
    private final CheckoutService service;
    private final CheckoutPolicy policy;
    @GetMapping("/options") public CheckoutPolicy.Options options() { return policy.options(); }
    @PostMapping("/preview") public CheckoutService.Quote preview(Authentication auth, @Valid @RequestBody CheckoutService.QuoteRequest request) {
        return service.quote(auth.getName(), request);
    }
}
