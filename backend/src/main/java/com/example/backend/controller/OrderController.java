package com.example.backend.controller;
import com.example.backend.dto.order.*;
import com.example.backend.services.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {
    private final OrderService service;
    @PostMapping
    public ResponseEntity<OrderResponse> place(@Valid @RequestBody PlaceOrderRequest request, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.placeOrder(auth.getName(), request));
    }
    @GetMapping("/my-orders")
    public Object mine(Authentication auth, @RequestParam(required=false) Integer page,
            @RequestParam(defaultValue="12") int size, @RequestParam(defaultValue="") String search,
            @RequestParam(required=false) com.example.backend.model.OrderStatus status,
            @RequestParam(defaultValue="false") boolean summary) {
        if (page == null && !summary) return service.myOrders(auth.getName()); // Existing API contract.
        return service.myOrderHistory(auth.getName(), page == null ? 0 : page, size, search, status, summary);
    }
    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable Long id, Authentication auth) {
        return service.getOrder(auth.getName(), id);
    }
    @PatchMapping("/{id}/cancel")
    public OrderResponse cancel(@PathVariable Long id, Authentication auth) {
        return service.cancelOrder(auth.getName(), id);
    }
}
