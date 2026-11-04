package com.example.backend.services.impl;

import com.example.backend.dto.producttype.ProductTypeRequest;
import com.example.backend.dto.producttype.ProductTypeResponse;
import com.example.backend.model.ProductType;
import com.example.backend.repositories.ProductTypeRepository;
import com.example.backend.services.ProductTypeService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductTypeServiceImpl implements ProductTypeService {

    private final ProductTypeRepository productTypeRepository;

    @Override
    @Transactional(readOnly = true)
    public List<ProductTypeResponse> getAllProductTypes() {
        return productTypeRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ProductTypeResponse getProductTypeById(Long id) {
        return toResponse(findProductType(id));
    }

    @Override
    public ProductTypeResponse createProductType(ProductTypeRequest request) {
        String name = validateName(request);
        if (productTypeRepository.existsByNameIgnoreCase(name)) {
            throw conflict("Product type name already exists");
        }

        ProductType productType = new ProductType();
        productType.setName(name);
        productType.setIsActive(request.isActive() == null ? true : request.isActive());
        return toResponse(saveProductType(productType));
    }

    @Override
    public ProductTypeResponse updateProductType(Long id, ProductTypeRequest request) {
        ProductType productType = findProductType(id);
        String name = validateName(request);
        if (productTypeRepository.existsByNameIgnoreCaseAndProductTypeIDNot(name, id)) {
            throw conflict("Product type name already exists");
        }

        productType.setName(name);
        if (request.isActive() != null) {
            productType.setIsActive(request.isActive());
        }
        return toResponse(saveProductType(productType));
    }

    @Override
    public void deleteProductType(Long id) {
        ProductType productType = findProductType(id);
        // Keep the category and product references; DELETE only deactivates it.
        productType.setIsActive(false);
        saveProductType(productType);
    }

    private ProductType findProductType(Long id) {
        return productTypeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Product type not found: " + id));
    }

    private String validateName(ProductTypeRequest request) {
        if (request == null || request.name() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        String name = request.name().trim();
        if (name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name must not be blank");
        }
        if (name.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name must not exceed 100 characters");
        }
        return name;
    }

    private ProductType saveProductType(ProductType productType) {
        try {
            return productTypeRepository.saveAndFlush(productType);
        } catch (DataIntegrityViolationException exception) {
            throw conflict("Product type could not be saved because of a data conflict");
        }
    }

    private ProductTypeResponse toResponse(ProductType productType) {
        return new ProductTypeResponse(productType.getProductTypeID(),
                productType.getName(), productType.getIsActive());
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
