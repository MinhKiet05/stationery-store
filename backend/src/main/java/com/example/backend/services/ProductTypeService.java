package com.example.backend.services;

import com.example.backend.dto.producttype.ProductTypeRequest;
import com.example.backend.dto.producttype.ProductTypeResponse;

import java.util.List;

public interface ProductTypeService {
    List<ProductTypeResponse> getAllProductTypes();
    ProductTypeResponse getProductTypeById(Long id);
    ProductTypeResponse createProductType(ProductTypeRequest request);
    ProductTypeResponse updateProductType(Long id, ProductTypeRequest request);
    void deleteProductType(Long id);
}
