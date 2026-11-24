package com.example.backend.config;

import org.springframework.data.domain.Pageable;

import java.util.*;

/** Admit only small, common browse requests. Free text and arbitrary price ranges bypass Redis. */
final class CatalogCacheKeys {
    record Key(String cache, String identity, Pageable pageable) {}

    static Key read(String service, String method, Object[] args) {
        if (service.equals("RecommendationServiceImpl") && method.equals("popular")) {
            int limit = (Integer) args[0];
            return limit >= 1 && limit <= 12 ? new Key("ordinary:popular-products", "limit:" + limit, null) : null;
        }
        if (service.equals("ProductTypeServiceImpl")) {
            if (method.equals("getAllProductTypes") || method.equals("getProductTypeById"))
                return new Key("ordinary:categories", method + frame(Arrays.asList(args)), null);
        }
        if (service.equals("VendorServiceImpl")) {
            if (method.equals("getAllVendors") || method.equals("getVendorById"))
                return new Key("ordinary:brands", method + frame(Arrays.asList(args)), null);
        }
        if (service.equals("ProductVariantServiceImpl")) {
            if (method.equals("getVariantsByProduct") || method.equals("getVariantById"))
                return new Key("ordinary:product-variants", method + frame(Arrays.asList(args)), null);
            return null; // Never cache the unbounded getAllVariants response.
        }
        if (!service.equals("ProductServiceImpl")) return null;
        if (method.equals("getProductById") || method.equals("getProductByHandle"))
            return new Key("ordinary:product-detail", method + frame(Arrays.asList(args)), null);
        if (!Set.of("getAllProducts", "searchProducts", "searchCatalog").contains(method)) return null;
        Pageable page = (Pageable) args[args.length - 1];
        if (page.isUnpaged() || page.getPageNumber() > 2 || !Set.of(6, 8, 10, 12, 16, 20, 24).contains(page.getPageSize())) return null;
        var ordering = page.getSort();
        if (method.equals("searchCatalog") && ordering.getOrderFor("productID") == null)
            ordering = ordering.and(org.springframework.data.domain.Sort.by("productID"));
        List<String> sort = ordering.stream().map(o -> o.getProperty() + ":" + o.getDirection()
                + ":" + o.isIgnoreCase() + ":" + o.getNullHandling()).toList();
        if (sort.size() > 2 || page.getSort().stream().anyMatch(o ->
                !Set.of("productID", "title", "price", "ratingAverage").contains(o.getProperty()))) return null;
        List<Object> filters = new ArrayList<>();
        if (!method.equals("getAllProducts")) {
            String keyword = (String) args[0];
            if (keyword != null && (keyword.length() > 200 || !keyword.isBlank())) return null;
            // Only null/empty search text is equivalent. Other values keep their existing DB semantics.
            filters.add("");
            filters.add(args[1]);
            if (method.equals("searchCatalog")) {
                @SuppressWarnings("unchecked") List<String> brands = (List<String>) args[2];
                if (brands != null && (brands.size() > 2 || brands.stream().anyMatch(b -> b == null || b.length() > 200))) return null;
                filters.add(brands == null ? List.of() : brands.stream().distinct().sorted().toList());
            } else filters.add(args[2]);
            // High-cardinality price searches are deliberately not cached (nor their invalid inputs).
            if (args[3] != null || args[4] != null) return null;
            filters.add(args[3]);
            filters.add(args[4]);
            if (method.equals("searchCatalog")) {
                if (args[5] != null && ((Integer) args[5] < 0 || (Integer) args[5] > 5)) return null;
                filters.addAll(Arrays.asList(args[5], args[6], args[7]));
            }
        }
        // Length framing prevents collisions from brand/filter values containing separators.
        String identity = method + frame(filters) + frame(sort) + ":" + page.getPageNumber() + ":" + page.getPageSize();
        return new Key("ordinary:product-list", identity, page);
    }

    private static String frame(List<?> values) {
        StringBuilder result = new StringBuilder();
        for (Object value : values) {
            if (value instanceof List<?> list) { result.append('[').append(frame(list)).append(']'); continue; }
            if (value == null) { result.append("N;"); continue; }
            String text = value.toString();
            result.append('V').append(text.length()).append(':').append(text).append(';');
        }
        return result.toString();
    }
}
