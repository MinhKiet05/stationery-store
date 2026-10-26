package com.example.backend.controller;
import com.example.backend.dto.order.*;
import com.example.backend.services.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/admin/orders")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminOrderController {
    private final OrderService service;
    @GetMapping
    public List<OrderResponse> all() { return service.adminOrders(); }
    @PatchMapping("/{id}/status")
    public OrderResponse status(@PathVariable Long id, @Valid @RequestBody UpdateOrderStatusRequest request) {
        return service.adminChangeStatus(id, request);
    }
}
