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

    private final jakarta.persistence.EntityManager em;
    private final ProductRepository productRepository;
    private final ProductTypeRepository productTypeRepository;
    private final VendorRepository vendorRepository;
    private final TagRepository tagRepository;

    // 1. Lấy danh sách sản phẩmm
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

    @Override
    @Transactional(readOnly = true)
    public Page<ProductResponse> searchCatalog(String keyword, Long category, List<String> brands,
            BigDecimal minPrice, BigDecimal maxPrice, Integer rating, boolean inStock, boolean onSale, Pageable pageable) {
        if (pageable.getPageSize() > 100 || pageable.getOffset() > 100000 ||
            keyword != null && keyword.length() > 200 || brands != null && (brands.size() > 30 || brands.stream().anyMatch(b -> b.length() > 200)) ||
            rating != null && (rating < 0 || rating > 5) || minPrice != null && minPrice.signum() < 0 ||
            maxPrice != null && maxPrice.signum() < 0 || minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0)
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Bộ lọc sản phẩm không hợp lệ");
        for (var order : pageable.getSort()) if (!Set.of("productID", "title", "price", "ratingAverage").contains(order.getProperty()))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Sắp xếp không hợp lệ");
        // Stable tie-breaker prevents duplicates between equally priced/rated pages.
        var sort = pageable.getSort();
        if (sort.getOrderFor("productID") == null) sort = sort.and(org.springframework.data.domain.Sort.by("productID"));
        final var ordering = sort;
        var page = org.springframework.data.domain.PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        Specification<Product> spec = (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();
            var effectivePrice = cb.coalesce(cb.coalesce(root.<BigDecimal>get("price"), root.get("priceMin")), BigDecimal.ZERO);
            if (query.getResultType() != Long.class) {
                var orders = new ArrayList<jakarta.persistence.criteria.Order>();
                for (var order : ordering) {
                    jakarta.persistence.criteria.Expression<?> value = order.getProperty().equals("price") ? effectivePrice : root.get(order.getProperty());
                    orders.add(order.isAscending() ? cb.asc(value) : cb.desc(value));
                }
                query.orderBy(orders);
            }
            var type = root.join("productType");
            var vendor = root.join("vendor", jakarta.persistence.criteria.JoinType.LEFT);
            predicates.add(cb.isTrue(root.get("isActive")));
            predicates.add(cb.isTrue(type.get("isActive")));
            if (category != null) predicates.add(cb.equal(type.get("productTypeID"), category));
            if (brands != null && !brands.isEmpty()) predicates.add(vendor.get("name").in(brands));
            if (keyword != null && !keyword.isBlank()) for (var word : keyword.trim().toLowerCase(java.util.Locale.ROOT).split("\\s+")) {
                String pattern = com.example.backend.services.NormalizedSearch.pattern(word);
                predicates.add(cb.or(cb.like(com.example.backend.services.NormalizedSearch.expression(cb, root.get("title")), pattern, '!'),
                    cb.like(com.example.backend.services.NormalizedSearch.expression(cb, vendor.get("name")), pattern, '!'), cb.like(com.example.backend.services.NormalizedSearch.expression(cb, type.get("name")), pattern, '!')));
            }
            if (minPrice != null) predicates.add(cb.ge(effectivePrice, minPrice));
            if (maxPrice != null) predicates.add(cb.le(effectivePrice, maxPrice));
            if (rating != null) predicates.add(cb.ge(root.get("ratingAverage"), rating));
            if (inStock) predicates.add(cb.isTrue(root.get("available")));
            if (onSale) predicates.add(cb.greaterThan(root.get("compareAtPrice"), effectivePrice));
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        return productRepository.findAll(spec, page).map(this::toResponse);
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

    /** Same definition/application rules, with bounded bulk lookups instead of per-row probes. */
    @Override @Transactional @org.springframework.security.access.prepost.PreAuthorize("hasRole('ADMIN')")
    public List<ProductResponse> createBatch(List<ProductRequest> requests) {
        var names=new HashSet<String>();var handles=new HashSet<String>();
        var vendors=new HashSet<Long>();var types=new HashSet<Long>();var tags=new HashSet<Long>();
        for(var r:requests){
            validateRequest(r);
            if(!names.add(r.title().trim().toLowerCase(java.util.Locale.ROOT)) || r.handle()==null || r.handle().isBlank() || !handles.add(r.handle().trim()))throw new IllegalArgumentException("Ten hoac handle trung lap");
            if(r.vendorID()!=null)vendors.add(r.vendorID());if(r.productTypeID()!=null)types.add(r.productTypeID());if(r.tagIDs()!=null)tags.addAll(r.tagIDs());
        }
        if(!names.isEmpty() && !em.createQuery("select p.productID from Product p where lower(p.title) in :names or p.handle in :handles",Long.class).setParameter("names",names).setParameter("handles",handles).getResultList().isEmpty())throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"San pham da ton tai");
        var vendorMap=vendorRepository.findAllById(vendors).stream().collect(java.util.stream.Collectors.toMap(Vendor::getVendorID,java.util.function.Function.identity()));
        var typeMap=productTypeRepository.findAllById(types).stream().collect(java.util.stream.Collectors.toMap(ProductType::getProductTypeID,java.util.function.Function.identity()));
        var tagMap=tagRepository.findAllById(tags).stream().collect(java.util.stream.Collectors.toMap(Tag::getTagID,java.util.function.Function.identity()));
        if(vendorMap.size()!=vendors.size() || typeMap.size()!=types.size() || tagMap.size()!=tags.size())throw new IllegalArgumentException("Du lieu tham chieu khong ton tai");
        var result=new ArrayList<ProductResponse>();
        for(var r:requests){
            var p=new Product();applyFields(p,r);p.setVendor(vendorMap.get(r.vendorID()));p.setProductType(typeMap.get(r.productTypeID()));
            if(r.tagIDs()!=null)for(Long id:r.tagIDs())p.getTags().add(tagMap.get(id));
            p.setIsActive(true);p.setRatingAverage(BigDecimal.ZERO);p.setReviewCount(0);
            result.add(toResponse(productRepository.save(p)));
        }
        em.flush();return result;
    }

    // 6. Cập nhật sản phẩm
    @Override
    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        validateRequest(request);

        Product product = lockActiveProduct(id);

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
        Product product = lockActiveProduct(id);

        product.setIsActive(false);
        product.setAvailable(false);

        productRepository.save(product);
    }

    // Tìm sản phẩm chưa bị xóa mềm
    private Product lockActiveProduct(Long id) {
        Product p = findActiveProduct(id);
        em.refresh(p, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (!Boolean.TRUE.equals(p.getIsActive())) throw new IllegalArgumentException("Sản phẩm đã ngừng hoạt động");
        return p;
    }
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

        if (request.handle() != null && request.handle().codePointCount(0, request.handle().length()) > 255) {
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
        applyFields(product, request);
        applyReferences(product, request);
    }
    private void applyFields(Product product, ProductRequest request) {
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

        if (request.images() != null) {
            product.getImages().clear();
            product.getImages().addAll(request.images());
        }
    }
    private void applyReferences(Product product, ProductRequest request) {
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
        return com.example.backend.dto.product.ProductMapper.toResponse(product);
    }
}
