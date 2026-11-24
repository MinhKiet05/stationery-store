package com.example.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

/** Security store: uses the shared connection, never CacheManager or ordinary-cache fallback. */
@Component
@ConditionalOnProperty(name = "app.redis.enabled", havingValue = "true")
public class RedisPasswordResetStore {
    private static final DefaultRedisScript<Long> AVAILABLE = script("return 1");
    private static final DefaultRedisScript<Long> CAN_ISSUE = script("""
            local issued = redis.call('HGET', KEYS[1], 'issued')
            local time = redis.call('TIME')
            local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
            if issued and now - tonumber(issued) < tonumber(ARGV[1]) then return 0 end
            return 1
            """);
    private static final DefaultRedisScript<Long> ACTIVATE = script("""
            local time = redis.call('TIME')
            local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
            local issued = redis.call('HGET', KEYS[1], 'issued')
            if issued and now - tonumber(issued) < tonumber(ARGV[5]) then return 0 end
            redis.call('HSET', KEYS[1], 'challenge', ARGV[1], 'issued', now)
            redis.call('PEXPIRE', KEYS[1], ARGV[4])
            redis.call('HSET', KEYS[2], 'user', ARGV[2], 'digest', ARGV[3], 'attempts', 0)
            redis.call('PEXPIRE', KEYS[2], ARGV[4])
            return 1
            """);
    private static final DefaultRedisScript<Long> CONSUME = script("""
            if redis.call('HGET', KEYS[1], 'user') ~= ARGV[1] then return 0 end
            if redis.call('HGET', KEYS[2], 'challenge') ~= ARGV[2] then return 0 end
            local ttl = redis.call('PTTL', KEYS[1])
            if ttl <= 0 then return 0 end
            if redis.call('HGET', KEYS[1], 'blocked') == '1' then return -ttl end
            local expected = redis.call('HGET', KEYS[1], 'digest')
            if not expected then return 0 end
            if expected ~= ARGV[3] then
                local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
                if attempts >= tonumber(ARGV[4]) then
                    redis.call('HDEL', KEYS[1], 'digest')
                    redis.call('HSET', KEYS[1], 'blocked', 1)
                    return -ttl
                end
                return 0
            end
            redis.call('DEL', KEYS[1])
            redis.call('HDEL', KEYS[2], 'challenge')
            return 1
            """);
    private final StringRedisTemplate redis;
    private final SecretKeySpec hmacKey;
    private final String prefix;
    @Value("${app.password-reset.resend-seconds:60}") private long resendSeconds = 60;
    @Value("${app.password-reset.max-attempts:5}") private int maxAttempts = 5;

    @jakarta.annotation.PostConstruct void validateLimits() {
        if (resendSeconds < 1 || maxAttempts < 1) throw new IllegalArgumentException("Password reset limits must be positive");
    }

    public RedisPasswordResetStore(RedisConnectionFactory factory,
            @Value("${app.password-reset.hmac-secret-base64:}") String secret,
            @Value("${app.cache.environment:local}") String environment) {
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(secret); }
        catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("Password reset requires a Base64 HMAC secret of at least 32 bytes"); }
        if (bytes.length < 32) throw new IllegalArgumentException("Password reset requires a Base64 HMAC secret of at least 32 bytes when Redis is enabled");
        if (!environment.matches("[a-zA-Z0-9_-]{1,40}")) throw new IllegalArgumentException("Invalid cache environment");
        this.hmacKey = new SecretKeySpec(bytes, "HmacSHA256");
        this.redis = new StringRedisTemplate(factory);
        this.prefix = "stationery-store:" + environment + ":security:password-reset:v1:";
    }

    public void checkAvailable() { execute(AVAILABLE, List.of()); }

    public boolean canIssue(Long userID) { return execute(CAN_ISSUE, List.of(userKey(userID)), Long.toString(resendSeconds * 1000)) == 1; }

    /** Call only after SMTP succeeds; replacement invalidates the old challenge atomically. */
    public void activate(Long userID, String raw, Duration ttl) {
        String challenge = challenge(raw);
        if (challenge == null || ttl.isNegative() || ttl.isZero()) throw new IllegalArgumentException("Invalid reset token metadata");
        long result = execute(ACTIVATE, List.of(userKey(userID), tokenKey(challenge)),
                challenge, userID.toString(), digest(raw), Long.toString(ttl.toMillis()), Long.toString(resendSeconds * 1000));
        if (result != 1) throw unavailable();
    }

    public Long findUser(String raw) {
        String challenge = challenge(raw);
        if (challenge == null) return null;
        try {
            Object user = redis.opsForHash().get(tokenKey(challenge), "user");
            return user == null ? null : Long.valueOf(user.toString());
        } catch (DataAccessException | NumberFormatException failure) { throw unavailable(); }
    }

    /** Consume before the SQL password update; never restore on rollback or uncertain network results. */
    public boolean consume(Long userID, String raw) {
        String challenge = challenge(raw);
        if (challenge == null) return false;
        long result = execute(CONSUME, List.of(tokenKey(challenge), userKey(userID)),
                userID.toString(), challenge, digest(raw), Integer.toString(maxAttempts));
        if (result < 0) throw new RateLimitException(Math.max(1, (-result + 999) / 1000));
        return result == 1;
    }

    private Long execute(DefaultRedisScript<Long> script, List<String> keys, String... args) {
        try {
            Long result = redis.execute(script, keys, (Object[]) args);
            if (result == null) throw unavailable();
            return result;
        } catch (DataAccessException failure) { throw unavailable(); }
    }

    private String digest(String raw) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(hmacKey);
            return HexFormat.of().formatHex(mac.doFinal(("password-reset:" + raw).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException failure) { throw new IllegalStateException("HMAC unavailable"); }
    }

    private String challenge(String raw) {
        return raw != null && raw.matches("[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}") ? raw.substring(0, 22) : null;
    }
    private String userKey(Long id) { return prefix + "user:" + id; }
    private String tokenKey(String challenge) { return prefix + "challenge:" + challenge; }
    private static DefaultRedisScript<Long> script(String lua) { return new DefaultRedisScript<>(lua, Long.class); }
    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Khong the xu ly yeu cau khoi phuc mat khau luc nay. Vui long thu lai sau.");
    }
}
