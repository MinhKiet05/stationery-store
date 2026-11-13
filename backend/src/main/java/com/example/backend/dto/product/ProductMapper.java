package com.example.backend.dto.product;

import com.example.backend.model.Product;
import java.util.ArrayList;

public final class ProductMapper {
    private ProductMapper() {}
    public static ProductResponse toResponse(Product p) {
        var v = p.getVendor();
        var t = p.getProductType();
        return new ProductResponse(p.getProductID(), p.getTitle(), p.getHandle(), p.getDescription(),
                p.getPrice(), p.getPriceMin(), p.getPriceMax(), p.getCompareAtPrice(), p.getAvailable(),
                p.getIsActive(), p.getRatingAverage(), p.getReviewCount(), v == null ? null : v.getVendorID(),
                v == null ? null : v.getName(), t == null ? null : t.getProductTypeID(),
                t == null ? null : t.getName(), new ArrayList<>(p.getImages()));
    }
}
