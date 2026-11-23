package com.example.backend.services;

import com.example.backend.dto.productvariant.ProductVariantRequest;
import com.example.backend.dto.productvariant.ProductVariantResponse;
import com.example.backend.dto.productvariant.UpdateStockRequest;
import java.util.List;

public interface ProductVariantService {
    ProductVariantResponse updateStock(Long id, UpdateStockRequest request);
    List<ProductVariantResponse> getAllVariants();
    List<ProductVariantResponse> getVariantsByProduct(Long productID);
    ProductVariantResponse getVariantById(Long id);
    ProductVariantResponse createVariant(ProductVariantRequest request);
    ProductVariantResponse updateVariant(Long id, ProductVariantRequest request);
    void deleteVariant(Long id); // Disable sales; do not physically delete history
}
