package com.example.backend.config;

import io.lettuce.core.ClientOptions;
import io.lettuce.core.SocketOptions;
import io.lettuce.core.TimeoutOptions;
import io.lettuce.core.resource.ClientResources;
import io.lettuce.core.resource.DefaultClientResources;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.support.NoOpCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.serializer.GenericJacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext.SerializationPair;
import tools.jackson.databind.jsontype.BasicPolymorphicTypeValidator;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

/** Shared infrastructure for ordinary, non-security data caches. */
@Configuration(proxyBeanMethods = false)
@EnableCaching
public class RedisCacheConfiguration implements CachingConfigurer {
    static final Duration TIMEOUT = Duration.ofSeconds(1);

    static void requireOrdinaryCache(String name) {
        if (name == null || !name.matches("ordinary:[a-zA-Z0-9_-]{1,80}"))
            throw new IllegalArgumentException("Only ordinary:* data caches may use this cache manager");
    }

    @Bean
    @Override
    public CacheErrorHandler errorHandler() { return new OrdinaryCacheErrorHandler(); }

    @Bean
    @ConditionalOnProperty(name = "app.redis.enabled", havingValue = "false", matchIfMissing = true)
    CacheManager disabledCacheManager() {
        return new NoOpCacheManager() {
            @Override public Cache getCache(String name) {
                requireOrdinaryCache(name);
                return super.getCache(name);
            }
        };
    }

    static GenericJacksonJsonRedisSerializer jsonSerializer() {
        // No unrestricted default typing, java serialization, entities or arbitrary class loading.
        var allowed = BasicPolymorphicTypeValidator.builder()
                .allowIfSubType("com.example.backend.dto.")
                .allowIfSubType(com.example.backend.model.OrderStatus.class)
                .allowIfSubType(com.example.backend.model.ReturnStatus.class)
                .allowIfSubType(com.example.backend.model.DiscountType.class)
                .allowIfSubType(com.example.backend.model.UserRole.class)
                .allowIfSubType(java.util.ArrayList.class)
                .allowIfSubType(java.util.LinkedHashMap.class)
                .allowIfSubType(java.util.EnumMap.class)
                // Existing immutable aggregate responses; never permit the repository package itself.
                .allowIfSubType(com.example.backend.repositories.AdminUserRepository.Statistics.class)
                .allowIfSubType(com.example.backend.repositories.AdminCouponRepository.Statistics.class)
                .allowIfSubType(java.util.HashMap.class)
                .allowIfSubType(java.util.HashSet.class)
                .allowIfSubType(java.util.LinkedHashSet.class)
                .allowIfSubType("java.util.ImmutableCollections$")
                .allowIfSubType("java.util.Collections$Unmodifiable")
                .allowIfSubType("java.util.Arrays$ArrayList")
                .allowIfSubType(java.math.BigDecimal.class)
                .allowIfSubType(java.math.BigInteger.class)
                .allowIfSubType(java.time.LocalDate.class)
                .allowIfSubType(java.time.LocalDateTime.class)
                .build();
        return GenericJacksonJsonRedisSerializer.builder().enableDefaultTyping(allowed)
                // Final JDK List.of/Map.of/Set.of roots otherwise omit type metadata.
                .writer((mapper, value) -> mapper.writeValueAsBytes(
                        value instanceof java.util.List<?> list ? new java.util.ArrayList<>(list) :
                        value instanceof java.util.Map<?, ?> map ? new java.util.LinkedHashMap<>(map) :
                        value instanceof java.util.Set<?> set ? new java.util.LinkedHashSet<>(set) : value))
                .build();
    }

    @Configuration(proxyBeanMethods = false)
    @ConditionalOnProperty(name = "app.redis.enabled", havingValue = "true")
    static class Enabled {
        @Bean(destroyMethod = "shutdown")
        ClientResources redisClientResources() {
            return DefaultClientResources.builder().ioThreadPoolSize(2).computationThreadPoolSize(2).build();
        }

        @Bean
        LettuceConnectionFactory redisConnectionFactory(ClientResources resources,
                @Value("${app.redis.host:}") String host, @Value("${app.redis.port:6379}") int port,
                @Value("${app.redis.username:default}") String username,
                @Value("${app.redis.password:}") String password,
                @Value("${app.redis.ssl-enabled:false}") boolean ssl) {
            if (host.isBlank() || port < 1 || port > 65535)
                throw new IllegalArgumentException("Redis requires a host and valid port when enabled");
            var server = new RedisStandaloneConfiguration(host, port);
            server.setUsername(username);
            server.setPassword(password);
            var options = ClientOptions.builder().autoReconnect(true)
                    .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS)
                    .requestQueueSize(32).timeoutOptions(TimeoutOptions.enabled(TIMEOUT))
                    .socketOptions(SocketOptions.builder().connectTimeout(TIMEOUT).build()).build();
            var client = LettuceClientConfiguration.builder().clientResources(resources)
                    .clientOptions(options).commandTimeout(TIMEOUT).shutdownTimeout(Duration.ofMillis(100));
            if (ssl) client.useSsl(); // Peer/certificate verification remains enabled.
            var factory = new LettuceConnectionFactory(server, client.build());
            factory.setShareNativeConnection(true); // One shared multiplexed connection, no pool.
            factory.setValidateConnection(false);   // Avoid PING per cache operation (100 ops/s plan).
            factory.setEagerInitialization(false);  // No dependency on Redis during application startup.
            return factory;
        }

        @Bean
        RedisCacheManager redisCacheManager(LettuceConnectionFactory factory,
                @Value("${app.cache.environment:local}") String environment) {
            if (!environment.matches("[a-zA-Z0-9_-]{1,40}"))
                throw new IllegalArgumentException("CACHE_ENVIRONMENT must be a short environment identifier");
            var defaults = org.springframework.data.redis.cache.RedisCacheConfiguration.defaultCacheConfig()
                    .entryTtl(Duration.ofMinutes(5)).disableCachingNullValues()
                    .computePrefixWith(name -> "stationery-store:" + environment + ":v1:" + name + "::")
                    .serializeValuesWith(SerializationPair.fromSerializer(jsonSerializer()));
            var configurations = new java.util.HashMap<String, org.springframework.data.redis.cache.RedisCacheConfiguration>();
            CatalogCache.TTLS.forEach((name, ttl) -> configurations.put(name, defaults.entryTtl(ttl)));
            return new RedisCacheManager(RedisCacheWriter.nonLockingRedisCacheWriter(factory), defaults, configurations) {
                @Override public Cache getCache(String name) {
                    requireOrdinaryCache(name);
                    return super.getCache(name);
                }
            };
        }
    }

    static final class OrdinaryCacheErrorHandler implements CacheErrorHandler {
        private final AtomicLong nextWarning = new AtomicLong();
        private void fallback(RuntimeException failure, Cache cache, String operation) {
            // Never turn an OTP/auth/rate-limit read failure into a successful security decision.
            if (!cache.getName().startsWith("ordinary:")) throw failure;
            long now = System.nanoTime(), deadline = nextWarning.get();
            if (now >= deadline && nextWarning.compareAndSet(deadline, now + Duration.ofSeconds(30).toNanos()))
                LoggerFactory.getLogger(RedisCacheConfiguration.class).warn(
                        "Ordinary Redis cache failed; using source. operation={}, cache={}", operation, cache.getName());
            // No keys, values, exception messages (which can contain credentials), or stack traces.
        }
        @Override public void handleCacheGetError(RuntimeException e, Cache cache, Object key) { fallback(e, cache, "get"); }
        @Override public void handleCachePutError(RuntimeException e, Cache cache, Object key, Object value) { fallback(e, cache, "put"); }
        @Override public void handleCacheEvictError(RuntimeException e, Cache cache, Object key) { fallback(e, cache, "evict"); }
        @Override public void handleCacheClearError(RuntimeException e, Cache cache) { fallback(e, cache, "clear"); }
    }
}
