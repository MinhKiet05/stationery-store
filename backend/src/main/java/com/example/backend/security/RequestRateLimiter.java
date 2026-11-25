package com.example.backend.security;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import java.util.function.LongSupplier;

/** Fixed windows for selected writes only. Redis failure never switches to a second counter store. */
@Component
public class RequestRateLimiter {
    private static final DefaultRedisScript<List> ACQUIRE = new DefaultRedisScript<>("""
            if redis.call('EXISTS', KEYS[1]) == 0 then
                redis.call('HSET', KEYS[1], 'count', 0, 'generation', ARGV[3])
                redis.call('PEXPIRE', KEYS[1], ARGV[2])
            end
            local ttl = redis.call('PTTL', KEYS[1])
            if ttl <= 0 then return {0, '', 1000} end
            local count = tonumber(redis.call('HGET', KEYS[1], 'count'))
            if count >= tonumber(ARGV[1]) then return {0, '', ttl} end
            redis.call('HINCRBY', KEYS[1], 'count', 1)
            return {1, redis.call('HGET', KEYS[1], 'generation'), ttl}
            """, List.class);
    private static final DefaultRedisScript<Long> RELEASE = new DefaultRedisScript<>("""
            if redis.call('HGET', KEYS[1], 'generation') == ARGV[1] then
                local count = tonumber(redis.call('HGET', KEYS[1], 'count') or '0')
                if count > 0 then redis.call('HINCRBY', KEYS[1], 'count', -1) end
            end
            return 1
            """, Long.class);
    public record Permit(String key, String generation) {}
    private final StringRedisTemplate redis;
    private final SecretKeySpec secret;
    private final String prefix;
    private final LongSupplier time;
    private final Map<String, Window> windows = new HashMap<>();

    @org.springframework.beans.factory.annotation.Autowired
    public RequestRateLimiter(ObjectProvider<RedisConnectionFactory> factories,
            @Value("${app.redis.enabled:false}") boolean enabled,
            @Value("${app.password-reset.hmac-secret-base64:}") String encoded,
            @Value("${app.cache.environment:local}") String environment) {
        this(enabled ? new StringRedisTemplate(factories.getObject()) : null,
                enabled ? decode(encoded) : null, environment, System::nanoTime);
    }

    RequestRateLimiter(StringRedisTemplate redis, byte[] secret, String environment, LongSupplier time) {
        if (!environment.matches("[a-zA-Z0-9_-]{1,40}")) throw new IllegalArgumentException("Invalid rate-limit environment");
        this.redis = redis;
        this.secret = secret == null ? null : new SecretKeySpec(secret, "HmacSHA256");
        this.prefix = "stationery-store:" + environment + ":security:rate-limit:v1:";
        this.time = time;
    }

    public Permit acquire(String scope, String identifier, int limit, Duration window) {
        if (!scope.matches("[a-z-]{1,40}") || limit < 1 || window.isNegative() || window.isZero())
            throw new IllegalArgumentException("Invalid rate limit");
        String key = prefix + scope + ":" + hash(scope + ":" + identifier);
        String generation = UUID.randomUUID().toString();
        if (redis == null) return localAcquire(key, generation, limit, window);
        try {
            List<?> result = redis.execute(ACQUIRE, List.of(key), Integer.toString(limit),
                    Long.toString(window.toMillis()), generation);
            if (result == null || result.size() != 3) throw RateLimitException.unavailable();
            if (((Number) result.get(0)).longValue() != 1) throw new RateLimitException(seconds(((Number) result.get(2)).longValue()));
            return new Permit(key, result.get(1).toString());
        } catch (DataAccessException failure) { throw RateLimitException.unavailable(); }
    }

    /** Successful logins release only their reservation, including when a new window has begun. */
    public void release(Permit permit) {
        if (redis == null) {
            synchronized (windows) {
                Window window = windows.get(permit.key());
                if (window != null && window.generation.equals(permit.generation()) && window.count > 0) window.count--;
            }
            return;
        }
        try {
            if (redis.execute(RELEASE, List.of(permit.key()), permit.generation()) == null) throw RateLimitException.unavailable();
        } catch (DataAccessException failure) { throw RateLimitException.unavailable(); }
    }

    private Permit localAcquire(String key, String generation, int limit, Duration duration) {
        synchronized (windows) {
            long now = time.getAsLong();
            windows.entrySet().removeIf(e -> now >= e.getValue().expires);
            Window window = windows.get(key);
            if (window == null) {
                if (windows.size() >= 10_000) throw RateLimitException.unavailable();
                window = new Window(generation, now + duration.toNanos()); windows.put(key, window);
            }
            if (window.count >= limit) throw new RateLimitException(seconds(Duration.ofNanos(window.expires-now).toMillis()));
            window.count++;
            return new Permit(key, window.generation);
        }
    }

    private String hash(String text) {
        try {
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            if (secret == null) return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(secret);
            return HexFormat.of().formatHex(mac.doFinal(bytes));
        } catch (java.security.GeneralSecurityException failure) { throw new IllegalStateException("Rate-limit digest unavailable"); }
    }
    private static byte[] decode(String value) {
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(value); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("Rate limiting requires the password-reset HMAC secret"); }
        if (bytes.length < 32) throw new IllegalArgumentException("Rate limiting requires a HMAC secret of at least 32 bytes");
        return bytes;
    }
    private static long seconds(long milliseconds) { return Math.max(1, (milliseconds + 999) / 1000); }
    private static class Window {
        final String generation; final long expires; int count;
        Window(String generation, long expires) { this.generation = generation; this.expires = expires; }
    }
}
