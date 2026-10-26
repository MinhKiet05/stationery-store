package com.example.backend.services;

import com.example.backend.dto.productvariant.ProductVariantRequest;
import com.example.backend.dto.productvariant.ProductVariantResponse;
import java.util.List;

public interface ProductVariantService {
    List<ProductVariantResponse> getAllVariants();
    List<ProductVariantResponse> getVariantsByProduct(Long productID);
    ProductVariantResponse getVariantById(Long id);
    ProductVariantResponse createVariant(ProductVariantRequest request);
    ProductVariantResponse updateVariant(Long id, ProductVariantRequest request);
    void deleteVariant(Long id); // Disable sales; do not physically delete history
}
