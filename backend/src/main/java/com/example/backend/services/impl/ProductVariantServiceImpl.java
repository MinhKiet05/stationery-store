package com.example.backend.services.impl;

import com.example.backend.dto.productvariant.ProductVariantRequest;
import com.example.backend.dto.productvariant.ProductVariantResponse;
import com.example.backend.model.Product;
import com.example.backend.model.ProductVariant;
import com.example.backend.repositories.ProductRepository;
import com.example.backend.repositories.ProductVariantRepository;
import com.example.backend.services.ProductVariantService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductVariantServiceImpl implements ProductVariantService {

    private final ProductVariantRepository variantRepository;
    private final ProductRepository productRepository;

    @Override
    @Transactional(readOnly = true)
    public List<ProductVariantResponse> getAllVariants() {
        return variantRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProductVariantResponse> getVariantsByProduct(Long productID) {
        requireActiveProduct(productID);
        return variantRepository.findByProduct_ProductID(productID)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ProductVariantResponse getVariantById(Long id) {
        return toResponse(findVariant(id));
    }

    @Override
    public ProductVariantResponse createVariant(ProductVariantRequest request) {
        validate(request);
        Product product = requireActiveProduct(request.productID());
        String sku = normalizeSku(request.sku());
        if (sku != null && variantRepository.existsBySku(sku)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "SKU da ton tai");
        }
        ProductVariant variant = new ProductVariant();
        applyRequest(variant, request, product, sku);
        return toResponse(variantRepository.saveAndFlush(variant));
    }

    @Override
    public ProductVariantResponse updateVariant(Long id, ProductVariantRequest request) {
        validate(request);
        ProductVariant variant = findVariant(id);
        Product product = requireActiveProduct(request.productID());
        String sku = normalizeSku(request.sku());
        if (sku != null) {
            variantRepository.findBySku(sku).ifPresent(existing -> {
                if (!Objects.equals(existing.getVariantID(), id)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "SKU da ton tai");
                }
            });
        }
        applyRequest(variant, request, product, sku);
        return toResponse(variantRepository.saveAndFlush(variant));
    }

    @Override
    public void deleteVariant(Long id) {
        // Preserve cart/order foreign keys. Here DELETE means "stop selling".
        ProductVariant variant = findVariant(id);
        variant.setAvailable(false);
        variantRepository.save(variant);
    }

    private ProductVariant findVariant(Long id) {
        return variantRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Khong tim thay bien the: " + id));
    }

    private Product requireActiveProduct(Long id) {
        if (id == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "productID khong duoc null");
        }
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Khong tim thay san pham: " + id));
        if (!Boolean.TRUE.equals(product.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "San pham da ngung hoat dong");
        }
        return product;
    }

    private void validate(ProductVariantRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Body khong duoc rong");
        }
        if (request.title() == null || request.title().isBlank()
                || request.title().length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "title phai co 1-200 ky tu");
        }
        if (request.sku() != null && request.sku().trim().length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sku toi da 100 ky tu");
        }
        if (request.price() == null || request.price().signum() < 0
                || request.price().scale() > 2
                || request.price().precision() - request.price().scale() > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "price phai >= 0 va phu hop DECIMAL(12,2)");
        }
        if (request.compareAtPrice() != null &&
                (request.compareAtPrice().signum() < 0
                || request.compareAtPrice().scale() > 2
                || request.compareAtPrice().precision() - request.compareAtPrice().scale() > 10)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "compareAtPrice khong hop le");
        }
        if (request.stockQuantity() == null || request.stockQuantity() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "stockQuantity phai >= 0");
        }
        if ((request.option1() != null && request.option1().length() > 255)
                || (request.option2() != null && request.option2().length() > 255)
                || (request.option3() != null && request.option3().length() > 255)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "option toi da 255 ky tu");
        }
    }

    private String normalizeSku(String sku) {
        if (sku == null || sku.isBlank()) return null;
        return sku.trim();
    }

    private void applyRequest(ProductVariant variant, ProductVariantRequest request,
                              Product product, String sku) {
        variant.setProduct(product);
        variant.setTitle(request.title().trim());
        variant.setSku(sku);
        variant.setAvailable(request.available() == null ? true : request.available());
        variant.setPrice(request.price());
        variant.setCompareAtPrice(request.compareAtPrice());
        variant.setOption1(request.option1());
        variant.setOption2(request.option2());
        variant.setOption3(request.option3());
        variant.setStockQuantity(request.stockQuantity());
    }

    private ProductVariantResponse toResponse(ProductVariant variant) {
        Product product = variant.getProduct();
        return new ProductVariantResponse(
                variant.getVariantID(), product.getProductID(), product.getTitle(),
                variant.getTitle(), variant.getSku(), variant.getAvailable(),
                variant.getPrice(), variant.getCompareAtPrice(),
                variant.getOption1(), variant.getOption2(), variant.getOption3(),
                variant.getStockQuantity(), variant.getVersion());
    }
}
