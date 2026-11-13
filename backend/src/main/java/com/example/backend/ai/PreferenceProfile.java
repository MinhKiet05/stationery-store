package com.example.backend.ai;

import com.example.backend.model.*;
import java.time.*;
import java.util.*;

public record PreferenceProfile(Map<Long, Double> weights, Set<Long> recentPurchases) {
    public static PreferenceProfile aggregate(List<UserTrackingEvent> events, AiProperties config, LocalDateTime now) {
        Map<Long, Double> weights = new HashMap<>();
        Set<Long> purchases = new HashSet<>();
        for (var event : events) {
            double base = switch (event.getEventType()) {
                case VIEW_PRODUCT -> config.getViewWeight();
                case ADD_TO_CART -> config.getCartWeight();
                case PURCHASE -> config.getPurchaseWeight();
            };
            double days = Math.max(0, Duration.between(event.getCreatedAt(), now).toSeconds() / 86400.0);
            double score = Math.max(0, base) * Math.pow(0.5, days / Math.max(1, config.getHalfLifeDays()));
            weights.merge(event.getProduct().getProductID(), score, Double::sum);
            if (event.getEventType() == TrackingEventType.PURCHASE && days <= 30)
                purchases.add(event.getProduct().getProductID());
        }
        return new PreferenceProfile(Map.copyOf(weights), Set.copyOf(purchases));
    }

    public double affinity(CatalogProduct candidate, List<CatalogProduct> history) {
        double score = 0;
        double total = weights.values().stream().mapToDouble(Double::doubleValue).sum();
        for (var old : history) {
            double similarity = 0;
            var a = candidate.product(); var b = old.product();
            if (a.productTypeID() != null && a.productTypeID().equals(b.productTypeID())) similarity += 0.4;
            if (a.vendorID() != null && a.vendorID().equals(b.vendorID())) similarity += 0.2;
            if (!old.tags().isEmpty()) similarity += 0.2 * candidate.tags().stream().filter(old.tags()::contains).count() / old.tags().size();
            if (a.price() != null && b.price() != null) similarity += 0.2 / (1 + Math.abs(a.price().doubleValue() - b.price().doubleValue()) / Math.max(1, b.price().doubleValue()));
            score += similarity * weights.getOrDefault(b.productID(), 0.0) / Math.max(1, total);
        }
        return score - (recentPurchases.contains(candidate.product().productID()) ? 0.7 : 0);
    }
}
