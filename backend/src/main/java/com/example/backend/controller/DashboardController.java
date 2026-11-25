package com.example.backend.controller;

import com.example.backend.dto.dashboard.DashboardOrderResponse;
import com.example.backend.dto.productvariant.ProductVariantResponse;
import com.example.backend.services.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/admin/dashboard")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class DashboardController {
    private final DashboardService service;

    @GetMapping("/orders")
    public Page<DashboardOrderResponse> orders(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "6") int size) {
        return service.recentOrders(startDate, endDate, page, size);
    }

    @GetMapping("/low-stock")
    public Page<ProductVariantResponse> lowStock(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size) {
        return service.lowStock(page, size);
    }
}
