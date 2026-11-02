package com.example.backend.controller;

import com.example.backend.dto.producttype.ProductTypeRequest;
import com.example.backend.dto.producttype.ProductTypeResponse;
import com.example.backend.services.ProductTypeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/product-types")
@RequiredArgsConstructor
public class ProductTypeController {

    private final ProductTypeService productTypeService;

    @GetMapping
    public ResponseEntity<List<ProductTypeResponse>> getAllProductTypes() {
        return ResponseEntity.ok(productTypeService.getAllProductTypes());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductTypeResponse> getProductTypeById(@PathVariable Long id) {
        return ResponseEntity.ok(productTypeService.getProductTypeById(id));
    }

    @PostMapping
    public ResponseEntity<ProductTypeResponse> createProductType(@RequestBody ProductTypeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(productTypeService.createProductType(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ProductTypeResponse> updateProductType(
            @PathVariable Long id, @RequestBody ProductTypeRequest request) {
        return ResponseEntity.ok(productTypeService.updateProductType(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProductType(@PathVariable Long id) {
        productTypeService.deleteProductType(id);
        return ResponseEntity.noContent().build();
    }
}
