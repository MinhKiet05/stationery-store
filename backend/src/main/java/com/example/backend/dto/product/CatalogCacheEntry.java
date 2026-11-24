package com.example.backend.dto.product;

import java.util.List;

/** Only public DTO snapshots cross the Redis serialization boundary. */
public record CatalogCacheEntry(String identity, String generation, Object value) {
    public record ProductPage(List<ProductResponse> content, long total, List<SortOrder> sort) {}
    public record SortOrder(String property, String direction, boolean ignoreCase, String nullHandling) {}
}
