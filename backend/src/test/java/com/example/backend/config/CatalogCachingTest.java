package com.example.backend.config;

import com.example.backend.dto.product.*;
import com.example.backend.dto.productvariant.*;
import com.example.backend.model.Product;
import com.example.backend.model.ProductVariant;
import com.example.backend.repositories.*;
import com.example.backend.services.ProductService;
import com.example.backend.services.ProductVariantService;
import com.example.backend.services.impl.ProductServiceImpl;
import com.example.backend.services.impl.ProductVariantServiceImpl;
import com.example.backend.services.impl.RecommendationServiceImpl;
import com.example.backend.services.impl.VendorServiceImpl;
import com.example.backend.services.impl.ProductTypeServiceImpl;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.*;
import org.springframework.data.domain.*;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CatalogCachingTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withPropertyValues("app.redis.enabled=true")
            .withUserConfiguration(Fixture.class, CatalogCache.class, CatalogCachingConfiguration.class);

    @Test void productHitMissAndUpdateInvalidateOnlyAfterCommitWithDtoRoundTrip() {
        runner.run(ctx -> {
            var products = ctx.getBean(ProductService.class);
            var repository = ctx.getBean(ProductRepository.class);
            Product product = product();
            when(repository.findById(1L)).thenReturn(Optional.of(product));
            when(repository.save(any(Product.class))).thenAnswer(i -> i.getArgument(0));
            assertThat(products.getProductById(1L).price()).isEqualByComparingTo("10");
            assertThat(products.getProductById(1L).price()).isEqualByComparingTo("10");
            verify(repository, times(1)).findById(1L);
            Cache versions = ctx.getBean(CacheManager.class).getCache("ordinary:catalog-generation");
            String before = versions.get("products", String.class);
            TransactionTemplate tx = new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class));
            tx.executeWithoutResult(status -> {
                products.updateProduct(1L, request("25"));
                products.updateProduct(1L, request("30"));
                assertThat(versions.get("products", String.class)).isEqualTo(before);
                // A write transaction bypasses cached price=10 and sees its own database state.
                assertThat(products.getProductById(1L).price()).isEqualByComparingTo("30");
                assertThat(TransactionSynchronizationManager.getSynchronizations()).hasSize(1);
            });
            assertThat(versions.get("products", String.class)).isNotEqualTo(before);
            assertThat(products.getProductById(1L).price()).isEqualByComparingTo("30");
            products.getProductById(1L);
            verify(repository, times(5)).findById(1L); // first + two updates + transactional read + fresh read
        });
    }

    @Test void rollbackDoesNotInvalidateAndStandaloneCommitDoes() {
        runner.run(ctx -> {
            var products = ctx.getBean(ProductService.class);
            var repository = ctx.getBean(ProductRepository.class);
            when(repository.findById(1L)).thenReturn(Optional.of(product()));
            when(repository.save(any(Product.class))).thenAnswer(i -> i.getArgument(0));
            products.getProductById(1L);
            Cache versions = ctx.getBean(CacheManager.class).getCache("ordinary:catalog-generation");
            String before = versions.get("products", String.class);
            new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class)).executeWithoutResult(status -> {
                products.updateProduct(1L, request("20"));
                status.setRollbackOnly();
            });
            assertThat(versions.get("products", String.class)).isEqualTo(before);
            products.updateProduct(1L, request("30"));
            assertThat(versions.get("products", String.class)).isNotEqualTo(before);
        });
    }

    @Test void variantPriceStockAndVersionRefreshAfterInventoryUpdate() {
        runner.run(ctx -> {
            var variants = ctx.getBean(ProductVariantService.class);
            var repository = ctx.getBean(ProductVariantRepository.class);
            ProductVariant variant = ProductVariant.builder().variantID(7L).product(product()).title("Blue")
                    .price(new BigDecimal("11")).stockQuantity(5).version(0L).available(true).build();
            when(repository.findById(7L)).thenReturn(Optional.of(variant));
            when(repository.findWithLockByVariantID(7L)).thenReturn(Optional.of(variant));
            when(ctx.getBean(ProductRepository.class).findById(1L)).thenReturn(Optional.of(variant.getProduct()));
            when(repository.saveAndFlush(any(ProductVariant.class))).thenAnswer(i -> i.getArgument(0));
            assertThat(variants.getVariantById(7L).stockQuantity()).isEqualTo(5);
            variants.getVariantById(7L);
            verify(repository, times(1)).findById(7L);
            variants.updateStock(7L, new UpdateStockRequest(new BigDecimal("9"), 0L));
            assertThat(variants.getVariantById(7L).stockQuantity()).isEqualTo(9);
            assertThat(variants.getVariantById(7L).price()).isEqualByComparingTo("11");
            verify(repository, times(2)).findById(7L);
        });
    }

    @Test void pageMetadataAndAllFiltersRemainDistinctWhileEquivalentBrandSetsShareKeys() {
        Pageable page = PageRequest.of(0, 10, Sort.by("price"));
        Object[] filters = {null, 2L, List.of("Pilot", "Deli"), null, null, 4, true, false, page};
        var base = CatalogCacheKeys.read("ProductServiceImpl", "searchCatalog", filters);
        Object[] equivalent = filters.clone(); equivalent[0] = "  "; equivalent[2] = List.of("Deli", "Pilot", "Deli");
        // More than two raw brands bypasses cache rather than bypassing validation.
        assertThat(CatalogCacheKeys.read("ProductServiceImpl", "searchCatalog", equivalent)).isNull();
        equivalent[2] = List.of("Deli", "Pilot");
        assertThat(CatalogCacheKeys.read("ProductServiceImpl", "searchCatalog", equivalent).identity()).isEqualTo(base.identity());
        for (int index : List.of(1, 2, 5, 6, 7, 8)) {
            Object[] different = filters.clone();
            different[index] = switch(index) {
                case 1 -> 3L; case 2 -> List.of("Other"); case 5 -> 3;
                case 6 -> false; case 7 -> true; default -> PageRequest.of(1, 10, Sort.by("price"));
            };
            assertThat(CatalogCacheKeys.read("ProductServiceImpl", "searchCatalog", different).identity()).isNotEqualTo(base.identity());
        }
        runner.run(ctx -> {
            var repository = ctx.getBean(ProductRepository.class);
            when(repository.findByIsActiveTrue(page)).thenReturn(new PageImpl<>(List.of(Product.builder().productID(1L).build()), page, 45));
            var products = ctx.getBean(ProductService.class);
            products.getAllProducts(page);
            var result = products.getAllProducts(page);
            assertThat(result.getTotalElements()).isEqualTo(45);
            assertThat(result.getPageable()).isEqualTo(page);
            assertThat(result.getContent().getFirst()).isInstanceOf(ProductResponse.class);
            verify(repository, times(1)).findByIsActiveTrue(page);
        });
    }

    @Test void arbitrarySearchPricesDeepPagesAndLargePayloadsAreNotCached() {
        Object[] query = {"pen", null, null, null, null, PageRequest.of(0, 10)};
        assertThat(CatalogCacheKeys.read("ProductServiceImpl", "searchProducts", query)).isNull();
        query[0] = null; query[3] = new BigDecimal("123.45");
        assertThat(CatalogCacheKeys.read("ProductServiceImpl", "searchProducts", query)).isNull();
        assertThat(CatalogCacheKeys.read("ProductServiceImpl", "getAllProducts", new Object[]{PageRequest.of(50, 10)})).isNull();
        var manager = new ConcurrentMapCacheManager();
        var cache = new CatalogCache(manager, new RedisCacheConfiguration.OrdinaryCacheErrorHandler(), true);
        AtomicInteger loads = new AtomicInteger();
        ProductResponse large = new ProductResponse(1L, "Pen", "pen", "x".repeat(40000), BigDecimal.TEN,
                null, null, null, true, true, BigDecimal.ZERO, 0, null, null, null, null, List.of());
        for (int i = 0; i < 2; i++) cache.read("ordinary:product-detail", "large", () -> { loads.incrementAndGet(); return large; });
        assertThat(loads).hasValue(2);
        for (int i = 0; i < 400; i++) cache.read("ordinary:product-detail", "id-" + i, () -> "small");
        assertThat(((Map<?, ?>) manager.getCache("ordinary:product-detail").getNativeCache()).size()).isLessThanOrEqualTo(128);
    }

    @Test void localConcurrentMissesLoadOnceAndDatabaseExceptionsAreNotRetried() throws Exception {
        var cache = new CatalogCache(new ConcurrentMapCacheManager(), new RedisCacheConfiguration.OrdinaryCacheErrorHandler(), true);
        AtomicInteger loads = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<Object>> results = new ArrayList<>();
            for (int i=0; i<8; i++) results.add(pool.submit(() -> cache.read("ordinary:product-detail", "hot", () -> {
                loads.incrementAndGet(); return "dto";
            })));
            for (var result : results) assertThat(result.get(5, TimeUnit.SECONDS)).isEqualTo("dto");
            assertThat(loads).hasValue(1);
        } finally { pool.shutdownNow(); }
        AtomicInteger failures = new AtomicInteger();
        assertThatThrownBy(() -> cache.read("ordinary:product-detail", "db-error", () -> {
            failures.incrementAndGet(); throw new org.springframework.dao.DataIntegrityViolationException("database");
        })).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(failures).hasValue(1);
    }

    @Test void redisOutageAndPutFailureFallBackWithoutDuplicatingDatabaseReads() {
        CacheManager manager = mock(CacheManager.class);
        Cache broken = mock(Cache.class);
        when(manager.getCache(anyString())).thenReturn(broken);
        when(broken.getName()).thenReturn("ordinary:product-detail");
        when(broken.get(any(), eq(String.class))).thenThrow(new RedisConnectionFailureException("offline"));
        var cache = new CatalogCache(manager, new RedisCacheConfiguration.OrdinaryCacheErrorHandler(), true);
        AtomicInteger loads = new AtomicInteger();
        for (int i=0; i<2; i++) assertThat(cache.read("ordinary:product-detail", "1", loads::incrementAndGet)).isEqualTo(i+1);
        verify(broken, times(1)).get(any(), eq(String.class)); // cooldown skips repeated timeouts
        var real = new ConcurrentMapCacheManager();
        var entry = spy(real.getCache("ordinary:product-detail"));
        CacheManager delegating = mock(CacheManager.class);
        when(delegating.getCache(anyString())).thenAnswer(i -> i.getArgument(0).equals("ordinary:product-detail") ? entry : real.getCache(i.getArgument(0)));
        doThrow(new RedisConnectionFailureException("offline")).when(entry).put(any(), any());
        var putCache = new CatalogCache(delegating, new RedisCacheConfiguration.OrdinaryCacheErrorHandler(), true);
        loads.set(0);
        assertThat(putCache.read("ordinary:product-detail", "1", loads::incrementAndGet)).isEqualTo(1);
        assertThat(loads).hasValue(1);
    }

    @Test void staleInFlightLoadsCannotRepopulateCurrentGenerationAndRecoveryRetriesInvalidation() {
        var manager = new ConcurrentMapCacheManager();
        var cache = new CatalogCache(manager, new RedisCacheConfiguration.OrdinaryCacheErrorHandler(), true);
        assertThat(cache.read("ordinary:product-detail", "race", () -> {
            cache.invalidateAfterCommit(Set.of("products"));
            return "old snapshot";
        })).isEqualTo("old snapshot");
        assertThat(cache.read("ordinary:product-detail", "race", () -> "current snapshot")).isEqualTo("current snapshot");
        Cache generation = spy(manager.getCache("ordinary:catalog-generation"));
        CacheManager forwarding = mock(CacheManager.class);
        when(forwarding.getCache(anyString())).thenAnswer(i -> i.getArgument(0).equals("ordinary:catalog-generation")
                ? generation : manager.getCache(i.getArgument(0)));
        var recovering = new CatalogCache(forwarding, new RedisCacheConfiguration.OrdinaryCacheErrorHandler(), true);
        doThrow(new RedisConnectionFailureException("offline")).when(generation).put(any(), any());
        recovering.invalidateAfterCommit(Set.of("products"));
        assertThat(recovering.read("ordinary:product-detail", "race", () -> "database during outage")).isEqualTo("database during outage");
        doCallRealMethod().when(generation).put(any(), any());
        org.springframework.test.util.ReflectionTestUtils.setField(recovering, "retryAt", 0L);
        AtomicInteger loads = new AtomicInteger();
        assertThat(recovering.read("ordinary:product-detail", "race", () -> { loads.incrementAndGet(); return "recovered database"; }))
                .isEqualTo("recovered database");
        assertThat(recovering.read("ordinary:product-detail", "race", () -> "should not load")).isEqualTo("recovered database");
        assertThat(loads).hasValue(1);
    }

    @Test void popularAndTaxonomyHitsAreInvalidatedByCorrespondingWrites() {
        runner.run(ctx -> {
            var products = ctx.getBean(ProductService.class);
            var repo = ctx.getBean(ProductRepository.class);
            when(repo.findById(1L)).thenReturn(Optional.of(product()));
            when(repo.save(any(Product.class))).thenAnswer(i -> i.getArgument(0));
            var popular = ctx.getBean(com.example.backend.services.RecommendationService.class);
            var catalog = ctx.getBean(com.example.backend.ai.ProductCatalog.class);
            when(catalog.newest(3)).thenReturn(List.of());
            popular.popular(3); popular.popular(3);
            verify(catalog, times(1)).newest(3);
            products.updateProduct(1L, request("20"));
            popular.popular(3);
            verify(catalog, times(2)).newest(3);

            var vendors = ctx.getBean(com.example.backend.services.VendorService.class);
            var categories = ctx.getBean(com.example.backend.services.ProductTypeService.class);
            vendors.getAllVendors(); vendors.getAllVendors();
            categories.getAllProductTypes(); categories.getAllProductTypes();
            var vendorRepo = ctx.getBean(VendorRepository.class);
            var categoryRepo = ctx.getBean(ProductTypeRepository.class);
            verify(vendorRepo, times(1)).findAll(); verify(categoryRepo, times(1)).findAll();
            when(vendorRepo.saveAndFlush(any())).thenAnswer(i -> i.getArgument(0));
            when(categoryRepo.saveAndFlush(any())).thenAnswer(i -> i.getArgument(0));
            products.getProductById(1L);
            vendors.createVendor(new com.example.backend.dto.vendor.VendorRequest("New brand"));
            vendors.getAllVendors(); categories.getAllProductTypes(); products.getProductById(1L);
            verify(vendorRepo, times(2)).findAll(); verify(categoryRepo, times(1)).findAll();
            categories.createProductType(new com.example.backend.dto.producttype.ProductTypeRequest("New category", true));
            categories.getAllProductTypes(); products.getProductById(1L);
            verify(categoryRepo, times(2)).findAll();
            verify(repo, times(4)).findById(1L); // update + initial + vendor invalidation + category invalidation
        });
    }

    private static Product product() { return Product.builder().productID(1L).title("Pen").handle("pen").price(BigDecimal.TEN).build(); }
    private static ProductRequest request(String price) { return new ProductRequest("Pen", "pen", "", new BigDecimal(price), null, null, null, null, null, List.of(), Set.of(), true); }

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement
    static class Fixture {
        @Bean CacheManager cacheManager() { return new ConcurrentMapCacheManager() {
            // Exercise the actual safe Redis wire format, including nested immutable DTO lists.
            @Override protected Cache createConcurrentMapCache(String name) {
                return new org.springframework.cache.concurrent.ConcurrentMapCache(name, false) {
                    @Override protected Object toStoreValue(Object value) { return RedisCacheConfiguration.jsonSerializer().serialize(value); }
                    @Override protected Object fromStoreValue(Object value) { return value == null ? null : RedisCacheConfiguration.jsonSerializer().deserialize((byte[]) value); }
                };
            }
        }; }
        @Bean CacheErrorHandler errors() { return new RedisCacheConfiguration.OrdinaryCacheErrorHandler(); }
        @Bean ProductRepository products() { return mock(ProductRepository.class); }
        @Bean ProductVariantRepository variants() { return mock(ProductVariantRepository.class); }
        @Bean VendorRepository vendors() { return mock(VendorRepository.class); }
        @Bean ProductTypeRepository categories() { return mock(ProductTypeRepository.class); }
        @Bean com.example.backend.ai.ProductCatalog catalog() { return mock(com.example.backend.ai.ProductCatalog.class); }
        @Bean com.example.backend.services.RecommendationService recommendations(com.example.backend.ai.ProductCatalog catalog) {
            return new RecommendationServiceImpl(catalog, mock(com.example.backend.ai.TrackingHistory.class), mock(com.example.backend.ai.CatalogAi.class));
        }
        @Bean com.example.backend.services.VendorService vendorService(VendorRepository repo) { return new VendorServiceImpl(repo); }
        @Bean com.example.backend.services.ProductTypeService categoryService(ProductTypeRepository repo) { return new ProductTypeServiceImpl(repo); }
        @Bean EntityManager em() { return mock(EntityManager.class); }
        @Bean ProductService productsService(EntityManager em, ProductRepository p) {
            return new ProductServiceImpl(em, p, mock(ProductTypeRepository.class), mock(VendorRepository.class), mock(TagRepository.class));
        }
        @Bean ProductVariantService variantsService(EntityManager em, ProductRepository p, ProductVariantRepository v) {
            return new ProductVariantServiceImpl(v, p, em);
        }
        @Bean PlatformTransactionManager txManager() {
            return new AbstractPlatformTransactionManager() {
                @Override protected Object doGetTransaction() { return new Object(); }
                @Override protected void doBegin(Object tx, TransactionDefinition definition) {}
                @Override protected void doCommit(DefaultTransactionStatus status) {}
                @Override protected void doRollback(DefaultTransactionStatus status) {}
            };
        }
    }
}
