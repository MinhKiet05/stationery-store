package com.example.backend.controller;
import com.example.backend.dto.order.*;
import com.example.backend.services.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;

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
    public List<OrderResponse> mine(Authentication auth) { return service.myOrders(auth.getName()); }
    @GetMapping("/{id}")
    public OrderResponse get(@PathVariable Long id, Authentication auth) {
        return service.getOrder(auth.getName(), id);
    }
    @PatchMapping("/{id}/cancel")
    public OrderResponse cancel(@PathVariable Long id, Authentication auth) {
        return service.cancelOrder(auth.getName(), id);
    }
}
