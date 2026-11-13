package com.example.backend.ai;

import com.example.backend.dto.product.ProductResponse;
import java.util.Set;
import java.util.List;
import java.util.Optional;
import java.util.Comparator;
import java.math.BigDecimal;

/** Detached SQL snapshot: no lazy entities or DB transaction during model calls. */
public record CatalogProduct(ProductResponse product, String semanticText, Set<String> tags, boolean sellable, List<Offer> offers) {
    public record Offer(BigDecimal price, BigDecimal compareAtPrice) {}
    public CatalogProduct(ProductResponse product, String semanticText, Set<String> tags, boolean sellable) {
        this(product, semanticText, tags, sellable, List.of());
    }
    public Optional<CatalogProduct> forBudget(ShoppingQuery query) {
        if (!sellable || !query.matchesCategory(this)) return Optional.empty();
        if (offers.isEmpty()) return query.matches(this) ? Optional.of(this) : Optional.empty();
        var fitting = offers.stream().filter(v -> query.matchesPrice(v.price())).sorted(Comparator.comparing(Offer::price)).toList();
        if (fitting.isEmpty()) return Optional.empty();
        var chosen = fitting.getFirst();
        var p = product;
        var dto = new ProductResponse(p.productID(), p.title(), p.handle(), p.description(), chosen.price(), chosen.price(),
                fitting.getLast().price(), chosen.compareAtPrice(), p.available(), p.isActive(), p.ratingAverage(), p.reviewCount(),
                p.vendorID(), p.vendorName(), p.productTypeID(), p.productTypeName(), p.images());
        return Optional.of(new CatalogProduct(dto, semanticText, tags, true, offers));
    }
}
