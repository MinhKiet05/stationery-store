package com.example.backend.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Service;
import java.util.concurrent.atomic.AtomicBoolean;

@Service @RequiredArgsConstructor @Slf4j
public class ProductIndexJob {
    private final ProductCatalog catalog;
    private final CatalogAi ai;
    private final AiProperties properties;
    private final AtomicBoolean running = new AtomicBoolean();

    @Scheduled(fixedDelayString = "${app.ai.index-delay-ms:60000}", initialDelayString = "${app.ai.index-initial-delay-ms:15000}")
    public void scheduled() {
        if (!properties.isEnabled()) return;
        try { reindex(); }
        catch (RuntimeException ex) {
            log.warn("Product vector sync unavailable ({})", ex.getClass().getSimpleName());
            log.debug("Product vector sync reason={}", ex instanceof AiFailure failure ? failure.reason() : ex.getClass().getSimpleName());
        }
    }

    public IndexResult reindex() {
        if (!running.compareAndSet(false, true)) return new IndexResult(0, 0, "RUNNING");
        int scanned = 0, changed = 0;
        try {
            if (!properties.isEnabled()) return new IndexResult(0, 0, "DISABLED");
            for (int page = 0; ; page++) {
                var products = catalog.indexPage(page);
                for (var product : products) {
                    if (ai.synchronize(product)) changed++;
                    scanned++;
                }
                if (products.size() < 100) break;
            }
            return new IndexResult(scanned, changed, "COMPLETED");
        } finally { running.set(false); }
    }
    public record IndexResult(int scanned, int changed, String status) {}

    @Configuration @EnableScheduling
    static class Scheduling {}
}
