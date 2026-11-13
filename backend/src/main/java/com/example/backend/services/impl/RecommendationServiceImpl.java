package com.example.backend.services.impl;

import com.example.backend.ai.*;
import com.example.backend.dto.ai.RecommendationResponse;
import com.example.backend.services.RecommendationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;

@Service @RequiredArgsConstructor
public class RecommendationServiceImpl implements RecommendationService {
    private final ProductCatalog catalog;
    private final TrackingHistory history;
    private final CatalogAi ai;

    @Override
    public RecommendationResponse recommend(String username, int limit) {
        var profile = history.profile(username);
        if (profile.weights().isEmpty()) return popular(limit);
        try {
            var preferredIds = profile.weights().entrySet().stream().sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                    .limit(8).map(Map.Entry::getKey).toList();
            var preferred = catalog.byIds(preferredIds);
            if (preferred.isEmpty()) return popular(limit);
            // Top weighted interactions contribute more often to this bounded semantic query.
            String query = preferred.stream().sorted(Comparator.comparingDouble((CatalogProduct p) ->
                    profile.weights().getOrDefault(p.product().productID(), 0.0)).reversed())
                    .map(p -> p.semanticText().substring(0, Math.min(650, p.semanticText().length())))
                    .collect(Collectors.joining("\n"));
            var scores = ai.search(query, 40);
            var candidates = catalog.byIds(scores.keySet()).stream().filter(CatalogProduct::sellable)
                    .sorted(Comparator.comparingDouble((CatalogProduct p) -> scores.getOrDefault(p.product().productID(), 0.0)
                            + profile.affinity(p, preferred)).reversed()).limit(limit).map(CatalogProduct::product).toList();
            if (candidates.isEmpty()) return popular(limit);
            var result = new ArrayList<>(candidates);
            var ids = new HashSet<>(result.stream().map(p -> p.productID()).toList());
            for (var product : catalog.newest(limit)) {
                if (result.size() == limit) break;
                if (ids.add(product.product().productID())) result.add(product.product());
            }
            return new RecommendationResponse(result, "PERSONALIZED");
        } catch (RuntimeException ex) { return popular(limit); }
    }

    @Override
    public RecommendationResponse popular(int limit) {
        return new RecommendationResponse(catalog.newest(limit).stream().filter(CatalogProduct::sellable)
                .limit(limit).map(CatalogProduct::product).toList(), "FALLBACK");
    }
}
