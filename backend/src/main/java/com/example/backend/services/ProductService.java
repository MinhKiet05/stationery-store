package com.example.backend.services;

import com.example.backend.dto.product.ProductRequest;
import com.example.backend.dto.product.ProductResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.util.List;

public interface ProductService {

    Page<ProductResponse> getAllProducts(Pageable pageable);

    ProductResponse getProductById(Long id);

    ProductResponse getProductByHandle(String handle);

    Page<ProductResponse> searchProducts(
            String keyword,
            Long productTypeID,
            Long vendorID,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            Pageable pageable
    );

    Page<ProductResponse> searchCatalog(String keyword, Long category, List<String> brands,
        BigDecimal minPrice, BigDecimal maxPrice, Integer rating, boolean inStock, boolean onSale, Pageable pageable);

    ProductResponse createProduct(ProductRequest request);
    java.util.List<ProductResponse> createBatch(java.util.List<ProductRequest> requests);

    ProductResponse updateProduct(Long id, ProductRequest request);

    void deleteProduct(Long id);
}
