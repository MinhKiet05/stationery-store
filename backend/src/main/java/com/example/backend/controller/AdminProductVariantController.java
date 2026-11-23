package com.example.backend.controller;

import com.example.backend.dto.productvariant.ProductVariantResponse;
import com.example.backend.dto.productvariant.UpdateStockRequest;
import com.example.backend.services.ProductVariantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/product-variants")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminProductVariantController {
    private final ProductVariantService service;

    @PatchMapping("/{id}/stock")
    public ProductVariantResponse stock(@PathVariable Long id, @Valid @RequestBody UpdateStockRequest request) {
        return service.updateStock(id, request);
    }
}
