package com.example.backend.ai;

import com.example.backend.dto.product.*;
import com.example.backend.model.*;
import com.example.backend.repositories.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import java.util.*;
import java.util.stream.Collectors;

@Service @RequiredArgsConstructor
public class ProductCatalog {
    private final ProductRepository products;

    @Transactional(readOnly = true)
    public List<CatalogProduct> byIds(Collection<Long> ids) {
        if (ids.isEmpty()) return List.of();
        return products.findAllById(ids).stream().map(this::snapshot).toList();
    }

    @Transactional(readOnly = true)
    public List<CatalogProduct> keywordCandidates(ShoppingSearch search) {
        if (search.databaseTerms().isEmpty()) return List.of();
        Specification<Product> specification = (root, query, cb) -> {
            var type = root.join("productType", JoinType.LEFT);
            var vendor = root.join("vendor", JoinType.LEFT);
            var predicates = new ArrayList<Predicate>();
            for (String term : search.databaseTerms()) {
                String pattern = "%" + term + "%"; // Terms contain letters/digits only, no SQL LIKE wildcards.
                predicates.add(cb.like(cb.lower(root.get("title")), pattern));
                predicates.add(cb.like(cb.lower(type.get("name")), pattern));
                predicates.add(cb.like(cb.lower(vendor.get("name")), pattern));
            }
            return cb.and(cb.isTrue(root.get("isActive")), cb.isTrue(root.get("available")),
                    cb.or(cb.isNull(type.get("productTypeID")), cb.isTrue(type.get("isActive"))),
                    cb.or(predicates.toArray(Predicate[]::new)));
        };
        // Include out-of-stock matches for truthful diagnostics, never as purchasable response cards.
        return products.findAll(specification, PageRequest.of(0, 100, Sort.by(Sort.Direction.DESC, "productID")))
                .stream().map(this::snapshot).toList();
    }

    @Transactional(readOnly = true)
    public List<CatalogProduct> newest(int limit) {
        // Filter inventory in SQL before pagination, so older in-stock products aren't missed.
        return products.findSellable(PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "productID")))
                .stream().map(this::snapshot).toList();
    }

    @Transactional(readOnly = true)
    public List<CatalogProduct> indexPage(int page) {
        return products.findAll(PageRequest.of(page, 100, Sort.by("productID")))
                .stream().map(this::snapshot).toList();
    }

    private CatalogProduct snapshot(Product p) {
        var dto = ProductMapper.toResponse(p);
        var variants = p.getVariants().stream().filter(v -> Boolean.TRUE.equals(v.getAvailable())
                && v.getStockQuantity() != null && v.getStockQuantity() > 0
                && v.getPrice() != null && v.getPrice().signum() >= 0).toList();
        boolean sellable = Boolean.TRUE.equals(p.getIsActive()) && Boolean.TRUE.equals(p.getAvailable())
                && (p.getProductType() == null || Boolean.TRUE.equals(p.getProductType().getIsActive()))
                && !variants.isEmpty();
        if (!variants.isEmpty()) {
            var cheapest = variants.stream().min(Comparator.comparing(ProductVariant::getPrice)).orElseThrow();
            var max = variants.stream().map(ProductVariant::getPrice).max(Comparator.naturalOrder()).orElseThrow();
            // Same existing DTO, with a real purchasable variant price and its comparison price.
            dto = new ProductResponse(dto.productID(), dto.title(), dto.handle(), dto.description(),
                    cheapest.getPrice(), cheapest.getPrice(), max, cheapest.getCompareAtPrice(), dto.available(),
                    dto.isActive(), dto.ratingAverage(), dto.reviewCount(), dto.vendorID(), dto.vendorName(),
                    dto.productTypeID(), dto.productTypeName(), dto.images());
        }
        var tags = p.getTags().stream().map(Tag::getName).collect(Collectors.toCollection(TreeSet::new));
        String attributes = p.getVariants().stream().filter(v -> Boolean.TRUE.equals(v.getAvailable()))
                .map(v -> String.join(" ", safe(v.getTitle()), safe(v.getOption1()), safe(v.getOption2()), safe(v.getOption3())))
                .sorted().collect(Collectors.joining("; "));
        String text = "Product ID: " + p.getProductID() + "\nTên: " + safe(dto.title())
                + "\nDanh mục: " + safe(dto.productTypeName()) + "\nThương hiệu: " + safe(dto.vendorName())
                + "\nTags: " + String.join(", ", tags) + "\nMô tả: " + safe(dto.description())
                + "\nThuộc tính: " + attributes;
        return new CatalogProduct(dto, text.substring(0, Math.min(text.length(), 6000)), Set.copyOf(tags), sellable,
                variants.stream().map(v -> new CatalogProduct.Offer(v.getPrice(), v.getCompareAtPrice())).toList());
    }

    private static String safe(String s) { return s == null ? "" : s.replaceAll("<[^>]*>", " "); }
}
