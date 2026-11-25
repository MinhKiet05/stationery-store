package com.example.backend.config;

import com.example.backend.dto.product.CatalogCacheEntry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.*;
import java.util.function.Supplier;

@Component
public class CatalogCache {
    static final Map<String, Duration> TTLS = Map.ofEntries(
            Map.entry("ordinary:product-list", Duration.ofMinutes(3)),
            Map.entry("ordinary:product-detail", Duration.ofMinutes(5)),
            Map.entry("ordinary:product-variants", Duration.ofMinutes(5)),
            Map.entry("ordinary:popular-products", Duration.ofMinutes(5)),
            Map.entry("ordinary:categories", Duration.ofMinutes(30)),
            Map.entry("ordinary:brands", Duration.ofMinutes(30)),
            Map.entry("ordinary:admin-overview", Duration.ofSeconds(60)),
            Map.entry("ordinary:admin-revenue", Duration.ofSeconds(120)),
            Map.entry("ordinary:admin-orders", Duration.ofSeconds(60)),
            Map.entry("ordinary:admin-reviews", Duration.ofSeconds(120)),
            Map.entry("ordinary:admin-returns", Duration.ofSeconds(60)),
            Map.entry("ordinary:admin-users", Duration.ofSeconds(120)),
            Map.entry("ordinary:admin-inventory", Duration.ofSeconds(60)),
            Map.entry("ordinary:admin-vouchers", Duration.ofSeconds(60)),
            Map.entry("ordinary:catalog-generation", Duration.ofDays(1)));
    static final int MAX_BYTES = 32 * 1024;
    private final CacheManager manager;
    private final CacheErrorHandler errors;
    private final boolean enabled;
    private final Object[] locks = new Object[64];
    private final Set<String> pending = new HashSet<>();
    private final org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer serializer = RedisCacheConfiguration.jsonSerializer();
    private volatile long retryAt;

    public CatalogCache(CacheManager manager, CacheErrorHandler errors,
                        @Value("${app.redis.enabled:false}") boolean enabled) {
        this.manager = manager;
        this.errors = errors;
        this.enabled = enabled;
        Arrays.setAll(locks, i -> new Object());
    }

    public Object read(String name, String identity, Supplier<Object> source) {
        // A write transaction (checkout/import/admin) must always read its database state.
        if (!enabled || (TransactionSynchronizationManager.isActualTransactionActive()
                && !TransactionSynchronizationManager.isCurrentTransactionReadOnly()) || !ready()) return source.get();
        int slots = switch (name) {
            case "ordinary:product-list" -> 64;
            case "ordinary:product-detail", "ordinary:product-variants" -> 128;
            case "ordinary:popular-products" -> 16;
            default -> 8;
        };
        // Fixed slots + identity checking bound memory even for arbitrary IDs/filter combinations.
        int slot = Math.floorMod(identity.hashCode(), slots);
        synchronized (locks[slot % locks.length]) {
            if (System.nanoTime() < retryAt) return source.get();
            String generation;
            Cache cache = manager.getCache(name);
            try {
                Cache versions = manager.getCache("ordinary:catalog-generation");
                String group = group(name);
                generation = versions.get(group, String.class);
                if (generation == null) {
                    String candidate = UUID.randomUUID().toString();
                    Cache.ValueWrapper existing = versions.putIfAbsent(group, candidate);
                    generation = existing == null ? candidate : (String) existing.get();
                }
                CatalogCacheEntry entry = cache.get(slot, CatalogCacheEntry.class);
                if (entry != null && identity.equals(entry.identity()) && generation.equals(entry.generation()))
                    return entry.value();
            } catch (RuntimeException failure) {
                failed(failure, cache);
                return source.get();
            }
            Object value = source.get();
            try {
                if (value != null) {
                    var snapshot = new CatalogCacheEntry(identity, generation, value);
                    // Serialization happens before storage; no large descriptions/images/variant lists in Redis.
                    byte[] bytes = serializer.serialize(snapshot);
                    if (bytes.length <= MAX_BYTES) put(cache, slot, snapshot);
                }
            } catch (RuntimeException failure) {
                failed(failure, cache);
            }
            return value;
        }
    }

    private void put(Cache cache, Object key, Object value) {
        try { cache.put(key, value); }
        catch (RuntimeException failure) {
            failed(failure, cache);
            errors.handleCachePutError(failure, cache, key, value);
            // The database source already succeeded; never execute it a second time on PUT failure.
        }
    }

    private void failed(RuntimeException failure, Cache cache) {
        retryAt = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        synchronized (pending) { pending.addAll(List.of("products", "categories", "brands", "admin")); }
        errors.handleCacheGetError(failure, cache, "catalog");
    }

    private boolean ready() {
        if (System.nanoTime() < retryAt) return false;
        synchronized (pending) {
            if (pending.isEmpty()) return true;
            try {
                Cache versions = manager.getCache("ordinary:catalog-generation");
                for (String group : pending) versions.put(group, UUID.randomUUID().toString());
                pending.clear();
                return true;
            } catch (RuntimeException failure) {
                failed(failure, manager.getCache("ordinary:catalog-generation"));
                return false;
            }
        }
    }

    public void invalidateAfterCommit(Set<String> groups) {
        if (!enabled) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            invalidate(groups); // Advice wraps a service transaction that has already committed.
            return;
        }
        for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
            if (synchronization instanceof Invalidation existing && existing.owner() == this) {
                existing.groups.addAll(groups);
                return;
            }
        }
        TransactionSynchronizationManager.registerSynchronization(new Invalidation(groups));
    }

    private void invalidate(Set<String> groups) {
        synchronized (pending) { pending.addAll(groups); }
        ready(); // Failed invalidations stay pending; recovery rotates generations before serving hits.
    }

    private final class Invalidation implements TransactionSynchronization {
        final Set<String> groups;
        Invalidation(Set<String> groups) { this.groups = new HashSet<>(groups); }
        CatalogCache owner() { return CatalogCache.this; }
        @Override public void afterCommit() { invalidate(groups); }
    }

    private static String group(String name) {
        if (name.startsWith("ordinary:admin-")) return "admin";
        return switch (name) {
            case "ordinary:categories" -> "categories";
            case "ordinary:brands" -> "brands";
            default -> "products";
        };
    }
}
