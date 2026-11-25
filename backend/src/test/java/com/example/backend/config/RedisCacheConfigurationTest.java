package com.example.backend.config;

import com.example.backend.dto.order.OrderResponse;
import com.example.backend.dto.vendor.VendorResponse;
import com.example.backend.model.OrderStatus;
import io.lettuce.core.ClientOptions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.support.NoOpCacheManager;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.serializer.SerializationException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RedisCacheConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new org.springframework.boot.test.context.ConfigDataApplicationContextInitializer())
            .withUserConfiguration(RedisCacheConfiguration.class, SourceConfiguration.class);

    @Test
    void disabledNeedsNeitherRedisNorCredentialsAndDoesNotCacheSource() {
        runner.withPropertyValues("REDIS_ENABLED=false").run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(CacheManager.class)
                    .doesNotHaveBean(RedisConnectionFactory.class).doesNotHaveBean(io.lettuce.core.resource.ClientResources.class);
            assertThat(context.getBean(CacheManager.class)).isInstanceOf(NoOpCacheManager.class);
            var source = context.getBean(Source.class);
            assertThat(source.read("key")).isEqualTo("database-1");
            assertThat(source.read("key")).isEqualTo("database-2");
            assertThatThrownBy(() -> context.getBean(CacheManager.class).getCache("otp"))
                    .isInstanceOf(IllegalArgumentException.class);
        });
    }

    @Test
    void enabledHasOneLazySharedLettuceFactoryBoundedTimeoutsJsonTtlAndEnvironmentPrefix() {
        runner.withPropertyValues("REDIS_ENABLED=true", "REDIS_HOST=127.0.0.1", "REDIS_PORT=6379",
                "REDIS_USERNAME=default", "REDIS_PASSWORD=test-only", "REDIS_SSL_ENABLED=true",
                "CACHE_ENVIRONMENT=test").run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(RedisConnectionFactory.class).hasSingleBean(CacheManager.class);
            var factory = context.getBean(LettuceConnectionFactory.class);
            assertThat(factory.getShareNativeConnection()).isTrue();
            assertThat(factory.getEagerInitialization()).isFalse();
            assertThat(factory.getValidateConnection()).isFalse();
            assertThat(factory.getStandaloneConfiguration().getUsername()).isEqualTo("default");
            assertThat(factory.getClientConfiguration().isUseSsl()).isTrue();
            assertThat(factory.getClientConfiguration().getCommandTimeout()).isEqualTo(Duration.ofSeconds(1));
            var options = factory.getClientConfiguration().getClientOptions().orElseThrow();
            assertThat(options.getSocketOptions().getConnectTimeout()).isEqualTo(Duration.ofSeconds(1));
            assertThat(options.getDisconnectedBehavior()).isEqualTo(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS);
            var manager = context.getBean(RedisCacheManager.class);
            manager.getCache("ordinary:probe"); // Construct cache metadata only: no Redis commands.
            var config = manager.getCacheConfigurations().get("ordinary:probe");
            assertThat(config.getTtlFunction().getTimeToLive("key", "value")).isEqualTo(Duration.ofMinutes(5));
            assertThat(config.getKeyPrefixFor("ordinary:probe")).isEqualTo("stationery-store:test:v1:ordinary:probe::");
            assertThat(config.getAllowCacheNullValues()).isFalse();
            CatalogCache.TTLS.forEach((name, ttl) -> assertThat(manager.getCacheConfigurations().get(name)
                    .getTtlFunction().getTimeToLive("key", "value")).isEqualTo(ttl));
            assertThatThrownBy(() -> manager.getCache("auth" )).isInstanceOf(IllegalArgumentException.class);
        });
    }

    @Test
    void invalidEnabledConfigurationFailsClearlyInsteadOfConnectingToLocalhostByAccident() {
        runner.withPropertyValues("app.redis.enabled=true", "app.redis.host=")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void jsonRoundTripsCurrentRecordDtosCollectionsMoneyDatesAndEnums() {
        var json = RedisCacheConfiguration.jsonSerializer();
        var order = new OrderResponse(1L, 2L, LocalDateTime.of(2026, 11, 24, 12, 0), OrderStatus.PENDING,
                "address", "phone", "COD", false, null, new BigDecimal("123456.78"), BigDecimal.ZERO,
                new BigDecimal("123456.78"), null, List.of());
        assertThat(json.deserialize(json.serialize(order))).isEqualTo(order);
        var vendors = List.of(new VendorResponse(1L, "Vendor"));
        assertThat(json.deserialize(json.serialize(vendors))).isEqualTo(vendors);
        assertThat(new String(json.serialize(order), StandardCharsets.UTF_8)).startsWith("{");
    }

    @Test
    void jsonRejectsArbitraryTypeMetadataAndEntities() {
        var json = RedisCacheConfiguration.jsonSerializer();
        for (String type : List.of("java.io.File", "java.lang.ProcessBuilder", "com.example.backend.model.User")) {
            var payload = ("{\"@class\":\"" + type + "\",\"path\":\"ignored\"}").getBytes(StandardCharsets.UTF_8);
            assertThatThrownBy(() -> json.deserialize(payload)).isInstanceOf(SerializationException.class);
        }
    }

    @Test
    void ordinaryReadAndWriteFailuresRunSourceThroughRealSpringCacheInterceptor() {
        new ApplicationContextRunner().withUserConfiguration(FailingCacheConfiguration.class, SourceConfiguration.class)
                .run(context -> {
                    var source = context.getBean(Source.class);
                    assertThat(source.read("key")).isEqualTo("database-1");
                    assertThat(source.read("key")).isEqualTo("database-2");
                    verify(context.getBean(Cache.class), times(2)).get("key");
                    verify(context.getBean(Cache.class), times(2)).put(eq("key"), any());
                });
    }

    @Test
    void securityCacheFailuresNeverFailOpenAndOrdinaryEvictionFailuresAreHandled() {
        var handler = new RedisCacheConfiguration.OrdinaryCacheErrorHandler();
        var failure = new RedisConnectionFailureException("test-only outage");
        var cache = mock(Cache.class);
        for (String name : List.of("otp", "auth", "rate-limit")) {
            when(cache.getName()).thenReturn(name);
            assertThatThrownBy(() -> handler.handleCacheGetError(failure, cache, "key")).isSameAs(failure);
            assertThatThrownBy(() -> handler.handleCachePutError(failure, cache, "key", "value")).isSameAs(failure);
            assertThatThrownBy(() -> handler.handleCacheEvictError(failure, cache, "key")).isSameAs(failure);
            assertThatThrownBy(() -> handler.handleCacheClearError(failure, cache)).isSameAs(failure);
        }
        when(cache.getName()).thenReturn("ordinary:probe");
        assertThatCode(() -> { handler.handleCacheEvictError(failure, cache, "key"); handler.handleCacheClearError(failure, cache); })
                .doesNotThrowAnyException();
    }

    @Configuration(proxyBeanMethods = false)
    static class SourceConfiguration {
        @Bean Source source() { return new Source(); }
    }
    static class Source {
        private int calls;
        @Cacheable("ordinary:probe")
        public String read(String key) { return "database-" + ++calls; }
    }
    @Configuration(proxyBeanMethods = false)
    @EnableCaching
    static class FailingCacheConfiguration implements CachingConfigurer {
        @Override public CacheErrorHandler errorHandler() { return new RedisCacheConfiguration.OrdinaryCacheErrorHandler(); }
        @Bean Cache unavailableCache() {
            var cache = mock(Cache.class);
            when(cache.getName()).thenReturn("ordinary:probe");
            when(cache.get(any())).thenThrow(new RedisConnectionFailureException("test-only outage"));
            doThrow(new RedisConnectionFailureException("test-only outage")).when(cache).put(any(), any());
            return cache;
        }
        @Bean CacheManager cacheManager(Cache cache) {
            var manager = new SimpleCacheManager(); manager.setCaches(List.of(cache)); return manager;
        }
    }
}
