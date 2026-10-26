package com.example.backend.controller;

import com.example.backend.dto.product.ProductRequest;
import com.example.backend.dto.product.ProductResponse;
import com.example.backend.services.ProductService;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    // 1. Lấy danh sách sản phẩm
    @GetMapping
    public ResponseEntity<Page<ProductResponse>> getAllProducts(
            @PageableDefault(size = 10, sort = "productID")
            Pageable pageable
    ) {
        return ResponseEntity.ok(
                productService.getAllProducts(pageable)
        );
    }

    // 2. Xem chi tiết sản phẩm theo ID
    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getProductById(
            @PathVariable Long id
    ) {
        return ResponseEntity.ok(
                productService.getProductById(id)
        );
    }

    // 3. Xem sản phẩm theo handle
    @GetMapping("/handle/{handle}")
    public ResponseEntity<ProductResponse> getProductByHandle(
            @PathVariable String handle
    ) {
        return ResponseEntity.ok(
                productService.getProductByHandle(handle)
        );
    }

    // 4. Tìm kiếm và lọc sản phẩm
    @GetMapping("/search")
    public ResponseEntity<Page<ProductResponse>> searchProducts(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long productTypeID,
            @RequestParam(required = false) Long vendorID,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,

            @PageableDefault(size = 10, sort = "productID")
            Pageable pageable
    ) {
        return ResponseEntity.ok(
                productService.searchProducts(
                        keyword,
                        productTypeID,
                        vendorID,
                        minPrice,
                        maxPrice,
                        pageable
                )
        );
    }

    // 5. Admin thêm sản phẩm
    @PostMapping
    public ResponseEntity<ProductResponse> createProduct(
            @RequestBody ProductRequest request
    ) {
        ProductResponse response = productService.createProduct(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }

    // 6. Admin cập nhật sản phẩm
    @PutMapping("/{id}")
    public ResponseEntity<ProductResponse> updateProduct(
            @PathVariable Long id,
            @RequestBody ProductRequest request
    ) {
        return ResponseEntity.ok(
                productService.updateProduct(id, request)
        );
    }

    // 7. Admin xóa mềm sản phẩm
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProduct(
            @PathVariable Long id
    ) {
        productService.deleteProduct(id);

        return ResponseEntity.noContent().build();
    }
}