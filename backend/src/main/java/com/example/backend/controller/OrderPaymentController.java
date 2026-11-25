package com.example.backend.controller;

import com.example.backend.services.OrderPaymentService;
import com.example.backend.dto.order.OrderResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class OrderPaymentController {
    private final OrderPaymentService service;
    @PostMapping("/api/orders/{id}/payments/demo")
    public OrderResponse demo(Authentication auth, @PathVariable Long id) { return service.demo(auth.getName(), id); }
    @PostMapping("/api/admin/orders/{id}/confirm-payment")
    @PreAuthorize("hasRole('ADMIN')")
    public OrderResponse cod(Authentication auth, @PathVariable Long id, @Valid @RequestBody OrderPaymentService.Confirmation request) {
        return service.confirmCod(auth.getName(), id, request);
    }
}
