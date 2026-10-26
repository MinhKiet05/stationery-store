package com.example.backend.services.impl;

import com.example.backend.dto.product.ProductRequest;
import com.example.backend.dto.product.ProductResponse;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.ProductService;

import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ProductServiceImpl implements ProductService {

    private final ProductRepository productRepository;
    private final ProductTypeRepository productTypeRepository;
    private final VendorRepository vendorRepository;
    private final TagRepository tagRepository;

    // 1. Lấy danh sách sản phẩm
    @Override
    @Transactional(readOnly = true)
    public Page<ProductResponse> getAllProducts(Pageable pageable) {
        return productRepository.findByIsActiveTrue(pageable)
                .map(this::toResponse);
    }

    // 2. Xem chi tiết theo ID
    @Override
    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id) {
        Product product = findActiveProduct(id);
        return toResponse(product);
    }

    // 3. Xem chi tiết theo handle
    @Override
    @Transactional(readOnly = true)
    public ProductResponse getProductByHandle(String handle) {
        Product product = productRepository
                .findByHandleAndIsActiveTrue(handle)
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "Không tìm thấy sản phẩm: " + handle
                        )
                );

        return toResponse(product);
    }

    // 4. Tìm kiếm và lọc sản phẩm
    @Override
    @Transactional(readOnly = true)
    public Page<ProductResponse> searchProducts(
            String keyword,
            Long productTypeID,
            Long vendorID,
            BigDecimal minPrice,
            BigDecimal maxPrice,
            Pageable pageable
    ) {
        if (minPrice != null && minPrice.signum() < 0) {
            throw new IllegalArgumentException("Giá tối thiểu không hợp lệ");
        }

        if (maxPrice != null && maxPrice.signum() < 0) {
            throw new IllegalArgumentException("Giá tối đa không hợp lệ");
        }

        if (minPrice != null && maxPrice != null
                && minPrice.compareTo(maxPrice) > 0) {
            throw new IllegalArgumentException(
                    "Giá tối thiểu không được lớn hơn giá tối đa"
            );
        }

        Specification<Product> specification = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Chỉ lấy sản phẩm chưa bị xóa mềm
            predicates.add(cb.isTrue(root.get("isActive")));

            // Tìm kiếm theo tên
            if (keyword != null && !keyword.isBlank()) {
                predicates.add(
                        cb.like(
                                cb.lower(root.get("title")),
                                "%" + keyword.trim().toLowerCase() + "%"
                        )
                );
            }

            // Lọc danh mục
            if (productTypeID != null) {
                predicates.add(
                        cb.equal(
                                root.get("productType").get("productTypeID"),
                                productTypeID
                        )
                );
            }

            // Lọc thương hiệu
            if (vendorID != null) {
                predicates.add(
                        cb.equal(
                                root.get("vendor").get("vendorID"),
                                vendorID
                        )
                );
            }

            // Lọc giá
            if (minPrice != null) {
                predicates.add(
                        cb.greaterThanOrEqualTo(
                                root.get("price"),
                                minPrice
                        )
                );
            }

            if (maxPrice != null) {
                predicates.add(
                        cb.lessThanOrEqualTo(
                                root.get("price"),
                                maxPrice
                        )
                );
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };

        return productRepository.findAll(specification, pageable)
                .map(this::toResponse);
    }

    // 5. Thêm sản phẩm
    @Override
    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        validateRequest(request);

        if (productRepository.existsByTitleIgnoreCase(request.title().trim())) {
            throw new IllegalArgumentException("Tên sản phẩm đã tồn tại");
        }

        if (request.handle() != null
                && productRepository.existsByHandle(request.handle().trim())) {
            throw new IllegalArgumentException("Handle đã tồn tại");
        }

        Product product = new Product();

        applyRequest(product, request);

        product.setIsActive(true);
        product.setRatingAverage(BigDecimal.ZERO);
        product.setReviewCount(0);

        return toResponse(productRepository.save(product));
    }

    // 6. Cập nhật sản phẩm
    @Override
    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        validateRequest(request);

        Product product = findActiveProduct(id);

        if (productRepository.existsByTitleIgnoreCaseAndProductIDNot(
                request.title().trim(), id
        )) {
            throw new IllegalArgumentException("Tên sản phẩm đã tồn tại");
        }

        if (request.handle() != null
                && productRepository.existsByHandleAndProductIDNot(
                request.handle().trim(), id
        )) {
            throw new IllegalArgumentException("Handle đã tồn tại");
        }

        applyRequest(product, request);

        return toResponse(productRepository.save(product));
    }

    // 7. Xóa mềm sản phẩm
    @Override
    @Transactional
    public void deleteProduct(Long id) {
        Product product = findActiveProduct(id);

        product.setIsActive(false);
        product.setAvailable(false);

        productRepository.save(product);
    }

    // Tìm sản phẩm chưa bị xóa mềm
    private Product findActiveProduct(Long id) {
        return productRepository.findById(id)
                .filter(p -> Boolean.TRUE.equals(p.getIsActive()))
                .orElseThrow(() ->
                        new IllegalArgumentException(
                                "Không tìm thấy sản phẩm ID: " + id
                        )
                );
    }

    // Kiểm tra dữ liệu đầu vào
    private void validateRequest(ProductRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Dữ liệu sản phẩm không được rỗng");
        }

        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("Tên sản phẩm không được rỗng");
        }

        if (request.title().length() > 200) {
            throw new IllegalArgumentException("Tên sản phẩm quá dài");
        }

        if (request.handle() != null && request.handle().length() > 100) {
            throw new IllegalArgumentException("Handle quá dài");
        }

        if (request.price() == null || request.price().signum() < 0) {
            throw new IllegalArgumentException("Giá sản phẩm không hợp lệ");
        }

        if (request.priceMin() != null && request.priceMin().signum() < 0
                || request.priceMax() != null && request.priceMax().signum() < 0
                || request.compareAtPrice() != null
                && request.compareAtPrice().signum() < 0) {
            throw new IllegalArgumentException("Giá sản phẩm không được âm");
        }

        if (request.priceMin() != null && request.priceMax() != null
                && request.priceMin().compareTo(request.priceMax()) > 0) {
            throw new IllegalArgumentException(
                    "Giá thấp nhất không được lớn hơn giá cao nhất"
            );
        }
    }

    // Gán dữ liệu Request vào Entity
    private void applyRequest(Product product, ProductRequest request) {

        product.setTitle(request.title().trim());

        product.setHandle(
                request.handle() == null || request.handle().isBlank()
                        ? null
                        : request.handle().trim()
        );

        product.setDescription(request.description());
        product.setPrice(request.price());
        product.setPriceMin(request.priceMin());
        product.setPriceMax(request.priceMax());
        product.setCompareAtPrice(request.compareAtPrice());

        if (request.available() != null) {
            product.setAvailable(request.available());
        }

        // Gán thương hiệu
        if (request.vendorID() != null) {
            Vendor vendor = vendorRepository.findById(request.vendorID())
                    .orElseThrow(() ->
                            new IllegalArgumentException("Thương hiệu không tồn tại")
                    );

            product.setVendor(vendor);
        } else {
            product.setVendor(null);
        }

        // Gán danh mục
        if (request.productTypeID() != null) {
            ProductType productType = productTypeRepository
                    .findById(request.productTypeID())
                    .orElseThrow(() ->
                            new IllegalArgumentException("Danh mục không tồn tại")
                    );

            product.setProductType(productType);
        } else {
            product.setProductType(null);
        }

        // Cập nhật hình ảnh
        if (request.images() != null) {
            product.getImages().clear();
            product.getImages().addAll(request.images());
        }

        // Cập nhật tags
        if (request.tagIDs() != null) {
            Set<Tag> tags = new HashSet<>(
                    tagRepository.findAllById(request.tagIDs())
            );

            if (tags.size() != request.tagIDs().size()) {
                throw new IllegalArgumentException(
                        "Một hoặc nhiều Tag không tồn tại"
                );
            }

            product.getTags().clear();
            product.getTags().addAll(tags);
        }
    }

    // Chuyển Entity thành DTO
    private ProductResponse toResponse(Product product) {

        Vendor vendor = product.getVendor();
        ProductType productType = product.getProductType();

        return new ProductResponse(
                product.getProductID(),
                product.getTitle(),
                product.getHandle(),
                product.getDescription(),
                product.getPrice(),
                product.getPriceMin(),
                product.getPriceMax(),
                product.getCompareAtPrice(),
                product.getAvailable(),
                product.getIsActive(),
                product.getRatingAverage(),
                product.getReviewCount(),
                vendor != null ? vendor.getVendorID() : null,
                vendor != null ? vendor.getName() : null,
                productType != null ? productType.getProductTypeID() : null,
                productType != null ? productType.getName() : null,
                new ArrayList<>(product.getImages())
        );
    }
}